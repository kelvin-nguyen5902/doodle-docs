import hashlib

from flask import request
from flask_socketio import emit, join_room, leave_room

from .auth import verify_jwt
from .errors import ApiError
from .extensions import get_supabase_admin, socketio
from .services import documents_service, yjs_service

PEER_COLORS = ["#c2410c", "#2f6fed", "#7c3aed", "#0f766e", "#b07a1a", "#9d174d"]

# sid to {"user_id", "name", "color", "document_ids": set()}
connections: dict[str, dict] = {}
# document_id to { sid: {"user_id", "name", "color"} }
room_members: dict[str, dict] = {}


def _color_for(user_id: str) -> str:
    """Deterministically picks a peer color for a user id."""
    digest = hashlib.sha256(user_id.encode()).hexdigest()
    return PEER_COLORS[int(digest, 16) % len(PEER_COLORS)]


def _room(doc_id: str) -> str:
    return f"doc:{doc_id}"


def _user_room(user_id: str) -> str:
    return f"user:{user_id}"


def notify_user(user_id: str, event: str, payload: dict):
    """Pushes a real-time event to every connection a user has open."""
    socketio.emit(event, payload, room=_user_room(user_id))


def _broadcast_presence(doc_id: str):
    """Sends the current member list for a document to everyone in its room."""
    members = list(room_members.get(doc_id, {}).values())
    emit("presence_update", {"document_id": doc_id, "members": members}, room=_room(doc_id))


@socketio.on("connect")
def on_connect(auth):
    """Authenticates a new socket connection and registers it."""
    token = (auth or {}).get("token")
    claims = verify_jwt(token) if token else None
    if not claims:
        return False

    user_id = claims["sub"]
    profile_res = (
        get_supabase_admin()
        .table("profiles")
        .select("username, full_name")
        .eq("id", user_id)
        .maybe_single()
        .execute()
    )
    profile = profile_res.data if profile_res else None
    name = (profile or {}).get("full_name") or (profile or {}).get("username") or "Someone"

    connections[request.sid] = {
        "user_id": user_id,
        "name": name,
        "color": _color_for(user_id),
        "document_ids": set(),
    }
    join_room(_user_room(user_id))
    return True


def _maybe_checkpoint_and_evict(doc_id: str):
    """Saves and frees a document's in-memory state once its room is empty."""
    if not room_members.get(doc_id):
        yjs_service.checkpoint(doc_id)
        yjs_service.evict(doc_id)


@socketio.on("disconnect")
def on_disconnect():
    """Cleans up a connection's room memberships and presence."""
    conn = connections.pop(request.sid, None)
    if not conn:
        return
    for doc_id in list(conn["document_ids"]):
        room_members.get(doc_id, {}).pop(request.sid, None)
        _broadcast_presence(doc_id)
        _maybe_checkpoint_and_evict(doc_id)


@socketio.on("join_document")
def on_join_document(data):
    """Joins a document's room and sends the initial Yjs sync or seed request."""
    conn = connections.get(request.sid)
    if not conn:
        return
    doc_id = (data or {}).get("document_id")
    if not doc_id:
        return
    try:
        documents_service.authorize_document(doc_id, conn["user_id"], require_edit=False)
    except ApiError:
        emit("join_error", {"document_id": doc_id, "message": "not authorized"})
        return

    join_room(_room(doc_id))
    conn["document_ids"].add(doc_id)
    room_members.setdefault(doc_id, {})[request.sid] = {
        "user_id": conn["user_id"],
        "name": conn["name"],
        "color": conn["color"],
    }
    _broadcast_presence(doc_id)

    status, _entry = yjs_service.load_or_create(doc_id)
    if status == "needs_seed":
        doc = documents_service.fetch_document(doc_id)
        emit("yjs_seed_needed", {"document_id": doc_id, "content_html": (doc or {}).get("content_html") or ""})
    else:
        emit("yjs_sync", {"document_id": doc_id, "update": yjs_service.encode_full_state(doc_id)})


@socketio.on("leave_document")
def on_leave_document(data):
    """Removes a connection from a document's room."""
    conn = connections.get(request.sid)
    doc_id = (data or {}).get("document_id")
    if not conn or not doc_id:
        return
    leave_room(_room(doc_id))
    conn["document_ids"].discard(doc_id)
    room_members.get(doc_id, {}).pop(request.sid, None)
    _broadcast_presence(doc_id)
    # Applied in this same handler call (not a separate yjs_html_snapshot
    # event) so there's no cross-event race against the checkpoint below —
    # both run on the same thread, one after the other, guaranteed in order.
    yjs_service.set_pending_html(doc_id, (data or {}).get("html"))
    _maybe_checkpoint_and_evict(doc_id)


# Collaborative text sync handlers (Yjs CRDT). These only check room
# membership rather than authorizing again on every message, since
# yjs_update fires roughly once per keystroke.


@socketio.on("yjs_seed")
def on_yjs_seed(data):
    """Accepts a client's proposed initial Yjs state for a brand new document."""
    conn = connections.get(request.sid)
    doc_id = (data or {}).get("document_id")
    update = (data or {}).get("update")
    if not conn or not doc_id or update is None or doc_id not in conn["document_ids"]:
        return
    won = yjs_service.seed_if_empty(doc_id, bytes(update))
    full_state = yjs_service.encode_full_state(doc_id)
    if full_state is None:
        return
    if won:
        emit("yjs_sync", {"document_id": doc_id, "update": full_state}, room=_room(doc_id))
    else:
        emit("yjs_sync", {"document_id": doc_id, "update": full_state})


@socketio.on("yjs_update")
def on_yjs_update(data):
    """Applies an incremental Yjs update and relays it to the rest of the room."""
    conn = connections.get(request.sid)
    doc_id = (data or {}).get("document_id")
    update = (data or {}).get("update")
    if not conn or not doc_id or update is None or doc_id not in conn["document_ids"]:
        return
    accepted, reason = yjs_service.apply_update(doc_id, bytes(update), documents_service.MAX_DOCUMENT_CHARS)
    if not accepted:
        emit("action_error", {"message": reason})
        return
    yjs_service.set_pending_html(doc_id, (data or {}).get("html"))
    emit(
        "yjs_update",
        {"document_id": doc_id, "update": update, "user_id": conn["user_id"]},
        room=_room(doc_id),
        include_self=False,
    )


@socketio.on("yjs_html_snapshot")
def on_yjs_html_snapshot(data):
    """Accepts a trailing HTML snapshot once typing settles, so the checkpoint
    saved on idle reflects the final text rather than a throttled mid-edit one."""
    conn = connections.get(request.sid)
    doc_id = (data or {}).get("document_id")
    html = (data or {}).get("html")
    if not conn or not doc_id or html is None or doc_id not in conn["document_ids"]:
        return
    yjs_service.set_pending_html(doc_id, html)


@socketio.on("yjs_awareness")
def on_yjs_awareness(data):
    """Relays a cursor/presence awareness update to the rest of the room."""
    conn = connections.get(request.sid)
    doc_id = (data or {}).get("document_id")
    update = (data or {}).get("update")
    if not conn or not doc_id or update is None or doc_id not in conn["document_ids"]:
        return
    emit(
        "yjs_awareness",
        {"document_id": doc_id, "update": update, "user_id": conn["user_id"]},
        room=_room(doc_id),
        include_self=False,
    )


def _yjs_checkpoint_loop():
    """Periodically checkpoints dirty Yjs documents to Postgres."""
    while True:
        socketio.sleep(1)
        yjs_service.sweep_and_checkpoint_stale()


def start_background_tasks():
    """Starts the checkpoint loop. Must be called after socketio.init_app()."""
    socketio.start_background_task(_yjs_checkpoint_loop)


@socketio.on("drawing_stroke_progress")
def on_stroke_progress(data):
    """Relays an in progress stroke's latest point to the rest of the room."""
    conn = connections.get(request.sid)
    doc_id = (data or {}).get("document_id")
    if not conn or not doc_id or doc_id not in conn["document_ids"]:
        return
    emit(
        "drawing_stroke_progress",
        {**data, "user_id": conn["user_id"]},
        room=_room(doc_id),
        include_self=False,
    )


@socketio.on("drawing_stroke_add")
def on_stroke_add(data):
    """Appends one finished stroke to a document's drawing."""
    conn = connections.get(request.sid)
    doc_id = (data or {}).get("document_id")
    stroke = (data or {}).get("stroke")
    if not conn or not doc_id or stroke is None:
        return
    try:
        documents_service.authorize_document(doc_id, conn["user_id"], require_edit=True)
    except ApiError:
        emit("action_error", {"message": "not authorized to edit"})
        return
    try:
        documents_service.add_stroke(doc_id, stroke)
    except ApiError as e:
        emit("action_error", {"message": e.message})
        return
    emit(
        "drawing_stroke_add",
        {"document_id": doc_id, "stroke": stroke, "user_id": conn["user_id"]},
        room=_room(doc_id),
        include_self=False,
    )


@socketio.on("drawing_stroke_complete")
def on_stroke_complete(data):
    """Replaces a document's full strokes list, for undo, redo, delete, and clear."""
    conn = connections.get(request.sid)
    doc_id = (data or {}).get("document_id")
    strokes = (data or {}).get("strokes")
    if not conn or not doc_id or strokes is None:
        return
    try:
        documents_service.authorize_document(doc_id, conn["user_id"], require_edit=True)
    except ApiError:
        emit("action_error", {"message": "not authorized to edit"})
        return
    try:
        documents_service.update_strokes(doc_id, strokes)
    except ApiError as e:
        emit("action_error", {"message": e.message})
        return
    emit(
        "drawing_stroke_complete",
        {"document_id": doc_id, "strokes": strokes, "user_id": conn["user_id"]},
        room=_room(doc_id),
        include_self=False,
    )

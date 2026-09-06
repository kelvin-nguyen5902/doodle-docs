import re
from collections import defaultdict
from datetime import datetime, timezone
from threading import Lock

from ..errors import ApiError
from ..extensions import get_supabase_admin

DEFAULT_TITLE = "Untitled document"
DEFAULT_CONTENT = "<p></p>"
MAX_DOCUMENT_CHARS = 2000
MAX_DRAWING_POINTS = 5000
MAX_TITLE_CHARS = 20

_TAG_RE = re.compile(r"<[^>]+>")

# Guards add_stroke's read modify write so concurrent requests for the same
# document don't overwrite each other's strokes.
_stroke_locks: dict[str, Lock] = defaultdict(Lock)


def _visible_text_length(html: str) -> int:
    """Estimates the visible character count of an HTML string by stripping tags."""
    return len(_TAG_RE.sub("", html or ""))


def _total_points(strokes: list) -> int:
    """Counts the total points across a list of strokes."""
    return sum(len(s.get("pts") or []) for s in strokes or [])


def _db():
    return get_supabase_admin()


def fetch_document(doc_id: str):
    """Fetches a document row by id, or None if it doesn't exist."""
    res = _db().table("documents").select("*").eq("id", doc_id).maybe_single().execute()
    return res.data if res else None


def fetch_collaborator(doc_id: str, user_id: str):
    """Fetches a collaborator row for a document and user, or None."""
    res = (
        _db()
        .table("document_collaborators")
        .select("*")
        .eq("document_id", doc_id)
        .eq("user_id", user_id)
        .maybe_single()
        .execute()
    )
    return res.data if res else None


def authorize_document(doc_id: str, user_id: str, require_edit: bool = False):
    """Returns the document row if the user may access it, else raises ApiError."""
    no_access_message = "You do not have access to this document or it was deleted by the owner"
    doc = fetch_document(doc_id)
    if doc is None:
        raise ApiError(no_access_message, 404)
    if doc["owner_id"] == user_id:
        return doc
    collab = fetch_collaborator(doc_id, user_id)
    if not collab or collab["status"] != "accepted":
        raise ApiError(no_access_message, 403)
    return doc


def _profile(user_id: str):
    """Fetches a user's profile row by id."""
    res = _db().table("profiles").select("id, username, full_name, email").eq("id", user_id).maybe_single().execute()
    return res.data if res else None


def list_documents_for_user(user_id: str):
    """Lists every document a user owns or collaborates on, with owner and collaborator info attached."""
    owned = _db().table("documents").select("*").eq("owner_id", user_id).execute().data or []

    collab_rows = (
        _db()
        .table("document_collaborators")
        .select("document_id")
        .eq("user_id", user_id)
        .eq("status", "accepted")
        .execute()
        .data
        or []
    )
    collab_doc_ids = [r["document_id"] for r in collab_rows]
    shared = []
    if collab_doc_ids:
        shared = _db().table("documents").select("*").in_("id", collab_doc_ids).execute().data or []

    all_docs = owned + shared
    if not all_docs:
        return []

    doc_ids = [d["id"] for d in all_docs]

    drawings_rows = _db().table("document_drawings").select("document_id, strokes").in_("document_id", doc_ids).execute().data or []
    strokes_by_doc = {r["document_id"]: r["strokes"] or [] for r in drawings_rows}
    ink_by_doc = {doc_id: bool(strokes) for doc_id, strokes in strokes_by_doc.items()}

    all_collabs = (
        _db()
        .table("document_collaborators")
        .select("document_id, user_id, role, status")
        .in_("document_id", doc_ids)
        .eq("status", "accepted")
        .execute()
        .data
        or []
    )
    owner_ids = {d["owner_id"] for d in all_docs}
    collab_user_ids = {c["user_id"] for c in all_collabs}
    profiles = (
        _db()
        .table("profiles")
        .select("id, username, full_name, email")
        .in_("id", list(owner_ids | collab_user_ids))
        .execute()
        .data
        or []
    )
    profiles_by_id = {p["id"]: p for p in profiles}
    owners_by_id = profiles_by_id

    collabs_by_doc: dict[str, list] = {}
    for c in all_collabs:
        collabs_by_doc.setdefault(c["document_id"], []).append({**c, "profile": profiles_by_id.get(c["user_id"])})

    results = []
    for d in all_docs:
        results.append(
            {
                "id": d["id"],
                "title": d["title"],
                "owner_id": d["owner_id"],
                "is_owner": d["owner_id"] == user_id,
                "owner": owners_by_id.get(d["owner_id"]),
                "updated_at": d["updated_at"],
                "content_html": d["content_html"],
                "has_ink": ink_by_doc.get(d["id"], False),
                "strokes": strokes_by_doc.get(d["id"], []),
                "collaborators": collabs_by_doc.get(d["id"], []),
            }
        )
    results.sort(key=lambda d: d["updated_at"], reverse=True)
    return results


MAX_DOCUMENTS_PER_USER = 10


def create_document(owner_id: str, title: str = DEFAULT_TITLE):
    """Creates a new document for a user, enforcing the document cap per user."""
    owned = _db().table("documents").select("id").eq("owner_id", owner_id).execute().data or []
    if len(owned) >= MAX_DOCUMENTS_PER_USER:
        raise ApiError(f"you can only have {MAX_DOCUMENTS_PER_USER} documents at a time, delete one to create another", 409)

    res = (
        _db()
        .table("documents")
        .insert({"owner_id": owner_id, "title": title, "content_html": DEFAULT_CONTENT})
        .execute()
    )
    return res.data[0]


def get_document_full(doc_id: str, user_id: str):
    """Fetches a document along with its strokes and the caller's role."""
    doc = fetch_document(doc_id)
    if doc is None:
        raise ApiError("You do not have access to this document or it was deleted by the owner", 404)
    strokes_res = _db().table("document_drawings").select("strokes").eq("document_id", doc_id).maybe_single().execute()
    strokes = (strokes_res.data or {}).get("strokes", []) if strokes_res else []

    if doc["owner_id"] == user_id:
        role = "owner"
    else:
        collab = fetch_collaborator(doc_id, user_id)
        role = collab["role"] if collab else "editor"

    return {**doc, "strokes": strokes, "role": role}


def update_title(doc_id: str, title: str):
    """Updates a document's title."""
    res = (
        _db()
        .table("documents")
        .update({"title": title, "updated_at": datetime.now(timezone.utc).isoformat()})
        .eq("id", doc_id)
        .execute()
    )
    return res.data[0] if res.data else None


def update_content(doc_id: str, html: str):
    """Updates a document's HTML content, enforcing the character limit."""
    if _visible_text_length(html) > MAX_DOCUMENT_CHARS:
        raise ApiError(f"documents are limited to {MAX_DOCUMENT_CHARS} characters", 400)
    _db().table("documents").update(
        {"content_html": html, "updated_at": datetime.now(timezone.utc).isoformat()}
    ).eq("id", doc_id).execute()


def seed_ydoc_if_null(doc_id: str, ydoc_hex: str) -> bool:
    """Sets a document's initial Yjs state if it hasn't been set yet, safe under concurrent callers."""
    res = (
        _db()
        .table("documents")
        .update({"content_ydoc": ydoc_hex, "updated_at": datetime.now(timezone.utc).isoformat()})
        .eq("id", doc_id)
        .is_("content_ydoc", "null")
        .execute()
    )
    return bool(res.data)


def persist_ydoc(doc_id: str, ydoc_hex: str, html: str | None):
    """Saves a document's Yjs state and optional HTML snapshot to Postgres."""
    update = {"content_ydoc": ydoc_hex, "updated_at": datetime.now(timezone.utc).isoformat()}
    if html:
        update["content_html"] = html
    _db().table("documents").update(update).eq("id", doc_id).execute()


def delete_document(doc_id: str):
    """Deletes a document."""
    _db().table("documents").delete().eq("id", doc_id).execute()


def update_strokes(doc_id: str, strokes: list):
    """Replaces a document's full strokes list, enforcing the point limit."""
    if _total_points(strokes) > MAX_DRAWING_POINTS:
        raise ApiError("drawing limit reached, delete some ink to draw more", 400)
    _db().table("document_drawings").update(
        {"strokes": strokes, "updated_at": datetime.now(timezone.utc).isoformat()}
    ).eq("document_id", doc_id).execute()


def add_stroke(doc_id: str, stroke: dict) -> list:
    """Appends one completed stroke to a document, enforcing the point limit."""
    with _stroke_locks[doc_id]:
        current = fetch_strokes(doc_id)
        if _total_points(current) + len(stroke.get("pts") or []) > MAX_DRAWING_POINTS:
            raise ApiError("drawing limit reached, delete some ink to draw more", 400)
        next_strokes = current + [stroke]
        _db().table("document_drawings").update(
            {"strokes": next_strokes, "updated_at": datetime.now(timezone.utc).isoformat()}
        ).eq("document_id", doc_id).execute()
        return next_strokes


def fetch_strokes(doc_id: str):
    """Fetches the current strokes list for a document."""
    res = _db().table("document_drawings").select("strokes").eq("document_id", doc_id).maybe_single().execute()
    return (res.data or {}).get("strokes", []) if res else []

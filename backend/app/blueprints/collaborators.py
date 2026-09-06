from flask import Blueprint, g, jsonify, request

from ..auth import require_auth
from ..errors import ApiError
from ..services import collaborators_service, documents_service
from ..sockets import notify_user

bp = Blueprint("collaborators", __name__)


def _require_owner(doc_id):
    """Fetches a document and raises unless the current user owns it."""
    doc = documents_service.fetch_document(doc_id)
    if doc is None:
        raise ApiError("document not found", 404)
    if doc["owner_id"] != g.user_id:
        raise ApiError("only the owner can manage collaborators", 403)
    return doc


@bp.get("/documents/<doc_id>/collaborators")
@require_auth
def list_collaborators(doc_id):
    """Lists everyone with access to a document."""
    documents_service.authorize_document(doc_id, g.user_id)
    return jsonify(collaborators_service.list_collaborators(doc_id))


@bp.post("/documents/<doc_id>/collaborators")
@require_auth
def invite_collaborator(doc_id):
    """Invites a user to collaborate on a document. Any collaborator can invite others."""
    doc = documents_service.authorize_document(doc_id, g.user_id, require_edit=True)
    body = request.get_json(silent=True) or {}
    user_id = body.get("user_id")
    if not user_id:
        raise ApiError("user_id is required", 400)
    collab = collaborators_service.invite_collaborator(doc_id, g.user_id, user_id)
    notify_user(user_id, "invitation_created", {"document_id": doc_id, "document_title": doc["title"]})
    return jsonify(collab), 201


@bp.delete("/documents/<doc_id>/collaborators/<collab_id>")
@require_auth
def remove_collaborator(doc_id, collab_id):
    """Removes a collaborator or cancels a pending invite. Owner only."""
    _require_owner(doc_id)
    removed = collaborators_service.remove_collaborator(doc_id, collab_id)
    if removed["status"] == "pending":
        notify_user(removed["user_id"], "invitation_canceled", {"collaborator_id": collab_id})
    return "", 204


@bp.post("/documents/<doc_id>/leave")
@require_auth
def leave_document(doc_id):
    """Lets a non owner collaborator remove themselves from a document."""
    doc = documents_service.fetch_document(doc_id)
    if doc is None:
        raise ApiError("document not found", 404)
    if doc["owner_id"] == g.user_id:
        raise ApiError("owners can't leave their own document, delete it instead", 400)
    collaborators_service.leave_document(doc_id, g.user_id)
    return "", 204

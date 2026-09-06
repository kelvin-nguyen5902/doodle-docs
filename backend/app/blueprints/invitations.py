from flask import Blueprint, g, jsonify

from ..auth import require_auth
from ..services import collaborators_service

bp = Blueprint("invitations", __name__)


@bp.get("/invitations")
@require_auth
def list_invitations():
    return jsonify(collaborators_service.list_invitations_for_user(g.user_id))


@bp.post("/invitations/<collab_id>/accept")
@require_auth
def accept_invitation(collab_id):
    collab = collaborators_service.accept_invitation(collab_id, g.user_id)
    return jsonify(collab)


@bp.post("/invitations/<collab_id>/decline")
@require_auth
def decline_invitation(collab_id):
    collaborators_service.decline_invitation(collab_id, g.user_id)
    return "", 204

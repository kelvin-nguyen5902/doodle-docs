from flask import Blueprint, g, jsonify, request

from ..auth import require_auth
from ..services import collaborators_service

bp = Blueprint("users", __name__)


@bp.get("/users/search")
@require_auth
def search_users():
    query = request.args.get("q", "")
    doc_id = request.args.get("document_id")
    return jsonify(collaborators_service.search_users(query, g.user_id, doc_id))

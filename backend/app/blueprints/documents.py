from flask import Blueprint, g, jsonify, request

from ..auth import require_auth
from ..errors import ApiError
from ..services import documents_service

bp = Blueprint("documents", __name__)


@bp.get("/documents")
@require_auth
def list_documents():
    """Lists every document the caller owns or collaborates on."""
    return jsonify(documents_service.list_documents_for_user(g.user_id))


@bp.post("/documents")
@require_auth
def create_document():
    """Creates a new document for the caller."""
    body = request.get_json(silent=True) or {}
    title = (body.get("title") or documents_service.DEFAULT_TITLE).strip() or documents_service.DEFAULT_TITLE
    if len(title) > documents_service.MAX_TITLE_CHARS:
        raise ApiError(f"title must be {documents_service.MAX_TITLE_CHARS} characters or fewer", 400)
    doc = documents_service.create_document(g.user_id, title)
    return jsonify(doc), 201


@bp.get("/documents/<doc_id>")
@require_auth
def get_document(doc_id):
    """Fetches a document if the caller has access to it."""
    documents_service.authorize_document(doc_id, g.user_id)
    return jsonify(documents_service.get_document_full(doc_id, g.user_id))


@bp.patch("/documents/<doc_id>")
@require_auth
def patch_document(doc_id):
    """Updates a document's title and/or content."""
    doc = documents_service.authorize_document(doc_id, g.user_id, require_edit=True)
    body = request.get_json(silent=True) or {}
    if "title" in body and doc["owner_id"] != g.user_id:
        raise ApiError("only the owner can rename this document", 403)
    updated = None
    if "title" in body:
        title = (body["title"] or "").strip() or documents_service.DEFAULT_TITLE
        if len(title) > documents_service.MAX_TITLE_CHARS:
            raise ApiError(f"title must be {documents_service.MAX_TITLE_CHARS} characters or fewer", 400)
        updated = documents_service.update_title(doc_id, title)
    if "content_html" in body:
        documents_service.update_content(doc_id, body["content_html"])
    if updated is None:
        updated = documents_service.fetch_document(doc_id)
    return jsonify(updated)


@bp.delete("/documents/<doc_id>")
@require_auth
def delete_document(doc_id):
    """Deletes a document. Owner only."""
    doc = documents_service.fetch_document(doc_id)
    if doc is None:
        raise ApiError("document not found", 404)
    if doc["owner_id"] != g.user_id:
        raise ApiError("only the owner can delete this document", 403)
    documents_service.delete_document(doc_id)
    return "", 204


@bp.patch("/documents/<doc_id>/drawing")
@require_auth
def patch_drawing(doc_id):
    """Replaces a document's full strokes list."""
    documents_service.authorize_document(doc_id, g.user_id, require_edit=True)
    body = request.get_json(silent=True) or {}
    strokes = body.get("strokes")
    if strokes is None:
        raise ApiError("strokes is required", 400)
    documents_service.update_strokes(doc_id, strokes)
    return jsonify({"strokes": strokes})

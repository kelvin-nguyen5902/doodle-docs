from __future__ import annotations

from datetime import datetime, timezone

from ..errors import ApiError
from ..extensions import get_supabase_admin
from . import documents_service


def _db():
    return get_supabase_admin()


def _profiles_by_id(user_ids):
    if not user_ids:
        return {}
    rows = _db().table("profiles").select("id, username, full_name, email").in_("id", list(user_ids)).execute().data or []
    return {r["id"]: r for r in rows}


def list_collaborators(doc_id: str):
    doc = documents_service.fetch_document(doc_id)
    if doc is None:
        raise ApiError("document not found", 404)
    rows = _db().table("document_collaborators").select("*").eq("document_id", doc_id).execute().data or []
    profiles = _profiles_by_id({doc["owner_id"]} | {r["user_id"] for r in rows})

    owner_profile = profiles.get(doc["owner_id"])
    result = [
        {
            "id": None,
            "user_id": doc["owner_id"],
            "profile": owner_profile,
            "role": "editor",
            "status": "accepted",
            "is_owner": True,
        }
    ]
    for r in rows:
        result.append(
            {
                "id": r["id"],
                "user_id": r["user_id"],
                "profile": profiles.get(r["user_id"]),
                "role": r["role"],
                "status": r["status"],
                "is_owner": False,
            }
        )
    return result


def invite_collaborator(doc_id: str, inviter_id: str, invitee_user_id: str):
    doc = documents_service.fetch_document(doc_id)
    if doc is None:
        raise ApiError("document not found", 404)
    if invitee_user_id == doc["owner_id"]:
        raise ApiError("owner already has access", 409)
    existing = documents_service.fetch_collaborator(doc_id, invitee_user_id)
    if existing:
        raise ApiError("user already invited or has access", 409)
    res = (
        _db()
        .table("document_collaborators")
        .insert(
            {
                "document_id": doc_id,
                "user_id": invitee_user_id,
                "role": "editor",
                "status": "pending",
                "invited_by": inviter_id,
            }
        )
        .execute()
    )
    return res.data[0]


def remove_collaborator(doc_id: str, collab_id: str):
    res = _db().table("document_collaborators").delete().eq("id", collab_id).eq("document_id", doc_id).execute()
    if not res.data:
        raise ApiError("collaborator not found", 404)
    return res.data[0]


def leave_document(doc_id: str, user_id: str):
    res = _db().table("document_collaborators").delete().eq("document_id", doc_id).eq("user_id", user_id).execute()
    if not res.data:
        raise ApiError("not a collaborator on this document", 404)
    return res.data[0]


def list_invitations_for_user(user_id: str):
    rows = (
        _db()
        .table("document_collaborators")
        .select("*")
        .eq("user_id", user_id)
        .eq("status", "pending")
        .execute()
        .data
        or []
    )
    if not rows:
        return []
    doc_ids = [r["document_id"] for r in rows]
    docs = _db().table("documents").select("id, title, owner_id").in_("id", doc_ids).execute().data or []
    docs_by_id = {d["id"]: d for d in docs}
    inviter_ids = {r["invited_by"] for r in rows}
    profiles = _profiles_by_id(inviter_ids)

    result = []
    for r in rows:
        doc = docs_by_id.get(r["document_id"])
        if not doc:
            continue
        result.append(
            {
                "id": r["id"],
                "document_id": r["document_id"],
                "document_title": doc["title"],
                "role": r["role"],
                "from_profile": profiles.get(r["invited_by"]),
                "created_at": r["created_at"],
            }
        )
    return result


def _fetch_invitation_for_user(collab_id: str, user_id: str):
    res = (
        _db()
        .table("document_collaborators")
        .select("*")
        .eq("id", collab_id)
        .eq("user_id", user_id)
        .maybe_single()
        .execute()
    )
    return res.data if res else None


def accept_invitation(collab_id: str, user_id: str):
    row = _fetch_invitation_for_user(collab_id, user_id)
    if not row or row["status"] != "pending":
        raise ApiError("invitation not found", 404)
    res = (
        _db()
        .table("document_collaborators")
        .update({"status": "accepted", "responded_at": datetime.now(timezone.utc).isoformat()})
        .eq("id", collab_id)
        .execute()
    )
    return res.data[0]


def decline_invitation(collab_id: str, user_id: str):
    row = _fetch_invitation_for_user(collab_id, user_id)
    if not row or row["status"] != "pending":
        raise ApiError("invitation not found", 404)
    _db().table("document_collaborators").delete().eq("id", collab_id).execute()


def search_users(query: str, exclude_user_id: str, doc_id: str | None = None):
    query = (query or "").strip()
    if not query:
        return []
    rows = (
        _db()
        .table("profiles")
        .select("id, username, full_name, email")
        .or_(f"username.ilike.%{query}%,email.ilike.%{query}%")
        .neq("id", exclude_user_id)
        .limit(8)
        .execute()
        .data
        or []
    )

    status_by_user = {}
    if doc_id:
        doc = documents_service.fetch_document(doc_id)
        if doc:
            if doc["owner_id"]:
                status_by_user[doc["owner_id"]] = "owner"
            collabs = _db().table("document_collaborators").select("user_id, status").eq("document_id", doc_id).execute().data or []
            for c in collabs:
                status_by_user[c["user_id"]] = c["status"]

    for r in rows:
        r["access_status"] = status_by_user.get(r["id"])
    return rows

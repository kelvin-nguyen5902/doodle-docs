import re

from flask import Blueprint, g, jsonify, request
from postgrest.exceptions import APIError

from ..auth import require_auth
from ..errors import ApiError
from ..extensions import get_supabase_admin

bp = Blueprint("me", __name__)

USERNAME_RE = re.compile(r"^[a-z][a-z0-9._]*$")


@bp.get("/me")
@require_auth
def get_me():
    res = (
        get_supabase_admin()
        .table("profiles")
        .select("id, username, full_name, email")
        .eq("id", g.user_id)
        .maybe_single()
        .execute()
    )
    profile = res.data if res else None
    if not profile:
        return jsonify({"error": "profile not found"}), 404
    return jsonify(profile)


@bp.patch("/me")
@require_auth
def update_me():
    body = request.get_json(silent=True) or {}
    updates = {}
    if "full_name" in body:
        full_name = (body["full_name"] or "").strip()
        if len(full_name) > 100:
            raise ApiError("full name must be 100 characters or fewer", 400)
        updates["full_name"] = full_name or None
    if "username" in body:
        username = (body["username"] or "").strip().lower()
        if not username:
            raise ApiError("username is required", 400)
        if len(username) > 20:
            raise ApiError("username must be 20 characters or fewer", 400)
        if not USERNAME_RE.match(username):
            raise ApiError("username must start with a letter and can only contain letters, numbers, '.' and '_'", 400)
        updates["username"] = username
    if not updates:
        raise ApiError("nothing to update", 400)

    try:
        res = get_supabase_admin().table("profiles").update(updates).eq("id", g.user_id).execute()
    except APIError as e:
        if getattr(e, "code", "") == "23505":
            raise ApiError("that username is already taken", 409)
        raise ApiError("could not update profile", 400)

    if not res.data:
        raise ApiError("profile not found", 404)
    return jsonify(res.data[0])


@bp.patch("/me/password")
@require_auth
def update_password():
    body = request.get_json(silent=True) or {}
    password = body.get("password") or ""
    if len(password) < 6:
        raise ApiError("password must be at least 6 characters", 400)
    get_supabase_admin().auth.admin.update_user_by_id(g.user_id, {"password": password})
    return "", 204


@bp.delete("/me")
@require_auth
def delete_me():
    get_supabase_admin().auth.admin.delete_user(g.user_id)
    return "", 204

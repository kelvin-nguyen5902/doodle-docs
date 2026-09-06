from functools import wraps

from flask import g, jsonify, request

from .extensions import get_supabase_admin


def verify_jwt(token: str):
    """Validate a Supabase-issued access token against Supabase Auth itself.

    Avoids needing the project's JWT secret locally (not surfaced in newer
    Supabase dashboards for this project) at the cost of one network call per
    REST request / socket connect.
    """
    if not token:
        return None
    try:
        res = get_supabase_admin().auth.get_user(token)
    except Exception:
        return None
    user = getattr(res, "user", None)
    if not user:
        return None
    return {"sub": user.id, "email": user.email}


def require_auth(fn):
    @wraps(fn)
    def wrapper(*args, **kwargs):
        header = request.headers.get("Authorization", "")
        if not header.startswith("Bearer "):
            return jsonify({"error": "missing bearer token"}), 401
        token = header.split(" ", 1)[1]
        claims = verify_jwt(token)
        if not claims:
            return jsonify({"error": "invalid token"}), 401
        g.user_id = claims["sub"]
        g.email = claims.get("email")
        return fn(*args, **kwargs)

    return wrapper

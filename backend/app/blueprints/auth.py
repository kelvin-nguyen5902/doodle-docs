import re
import time
from collections import defaultdict
from threading import Lock

from flask import Blueprint, jsonify, request
from gotrue.errors import AuthApiError

from .. import config
from ..errors import ApiError
from ..extensions import get_supabase_admin, new_auth_client

bp = Blueprint("auth", __name__)

USERNAME_RE = re.compile(r"^[a-z][a-z0-9._]*$")
EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[a-zA-Z]{2,}$")

# Fake email domain used for accounts signed up without a real email.
NOEMAIL_DOMAIN = "noemail.invalid"

SIGNUP_RATE_LIMIT = 10
SIGNUP_RATE_WINDOW_SECONDS = 60 * 60  # 1 hour

_signup_attempts: dict[str, list[float]] = defaultdict(list)
_signup_attempts_lock = Lock()


def _enforce_signup_rate_limit(ip: str):
    """Caps how many accounts a single IP can create per hour."""
    now = time.time()
    with _signup_attempts_lock:
        attempts = [t for t in _signup_attempts[ip] if now - t < SIGNUP_RATE_WINDOW_SECONDS]
        if len(attempts) >= SIGNUP_RATE_LIMIT:
            _signup_attempts[ip] = attempts
            raise ApiError("too many accounts created from this network — try again later", 429)
        attempts.append(now)
        _signup_attempts[ip] = attempts


LOGIN_FAILURE_LIMIT = 10
LOGIN_FAILURE_WINDOW_SECONDS = 60 * 60  # 1 hour

_login_failures: dict[str, list[float]] = defaultdict(list)
_login_failures_lock = Lock()


def _enforce_login_rate_limit(key: str):
    """Caps failed login attempts per (ip, account) pair per hour."""
    now = time.time()
    with _login_failures_lock:
        failures = [t for t in _login_failures[key] if now - t < LOGIN_FAILURE_WINDOW_SECONDS]
        _login_failures[key] = failures
        if len(failures) >= LOGIN_FAILURE_LIMIT:
            raise ApiError("too many failed sign-in attempts — try again later", 429)


def _record_login_failure(key: str):
    with _login_failures_lock:
        _login_failures[key].append(time.time())


def _clear_login_failures(key: str):
    with _login_failures_lock:
        _login_failures.pop(key, None)


FORGOT_PASSWORD_LIMIT = 2
FORGOT_PASSWORD_WINDOW_SECONDS = 60 * 60  # 1 hour

_forgot_password_attempts: dict[str, list[float]] = defaultdict(list)
_forgot_password_lock = Lock()


def _enforce_forgot_password_rate_limit(key: str):
    """Caps password reset requests per (ip, target email) pair per hour."""
    now = time.time()
    with _forgot_password_lock:
        attempts = [t for t in _forgot_password_attempts[key] if now - t < FORGOT_PASSWORD_WINDOW_SECONDS]
        if len(attempts) >= FORGOT_PASSWORD_LIMIT:
            _forgot_password_attempts[key] = attempts
            raise ApiError("only 2 password resets allowed per hour — try again later", 429)
        attempts.append(now)
        _forgot_password_attempts[key] = attempts


def _session_payload(session):
    """Converts a Supabase session object into the JSON shape the frontend expects."""
    if session is None:
        return None
    return {
        "access_token": session.access_token,
        "refresh_token": session.refresh_token,
        "expires_in": session.expires_in,
        "user": {"id": session.user.id, "email": session.user.email},
    }


def _raise_from_auth_error(e: Exception, fallback_status: int):
    """Turns a Supabase auth exception into our own ApiError."""
    if isinstance(e, AuthApiError):
        raise ApiError(e.message, e.status or fallback_status)
    raise ApiError("authentication failed", fallback_status)


@bp.post("/auth/signup")
def signup():
    """Creates a new account and returns a session, or a pending confirmation flag."""
    _enforce_signup_rate_limit(request.remote_addr or "unknown")

    body = request.get_json(silent=True) or {}
    email = (body.get("email") or "").strip()
    password = body.get("password") or ""
    full_name = (body.get("full_name") or "").strip()
    username = (body.get("username") or "").strip().lower()

    if not password:
        raise ApiError("password is required", 400)
    if email and not EMAIL_RE.match(email):
        raise ApiError("enter a valid email address", 400)
    if not full_name:
        raise ApiError("full_name is required", 400)
    if len(full_name) > 100:
        raise ApiError("full name must be 100 characters or fewer", 400)
    if not username:
        raise ApiError("username is required", 400)
    if len(username) > 20:
        raise ApiError("username must be 20 characters or fewer", 400)
    if not USERNAME_RE.match(username):
        raise ApiError("username must start with a letter and can only contain letters, numbers, '.' and '_'", 400)

    existing = get_supabase_admin().table("profiles").select("id").eq("username", username).maybe_single().execute()
    if existing and existing.data:
        raise ApiError("username already exists", 409)

    has_email = bool(email)
    auth_email = email if has_email else f"{username}@{NOEMAIL_DOMAIN}"

    client = new_auth_client()
    try:
        res = client.auth.sign_up(
            {
                "email": auth_email,
                "password": password,
                "options": {"data": {"full_name": full_name, "username": username, "has_email": has_email}},
            }
        )
    except Exception as e:
        message = getattr(e, "message", "") or str(e)
        if "Database error saving new user" in message:
            raise ApiError("username already exists", 409)
        if "already registered" in message.lower():
            raise ApiError("account with that email already exists", 409)
        _raise_from_auth_error(e, 400)

    if res.session is None:
        return jsonify({"pending_confirmation": True}), 202

    return jsonify(_session_payload(res.session)), 201


def _resolve_login_email(identifier: str) -> str | None:
    """Resolves a login identifier to an email, looking up the username if needed."""
    if "@" in identifier:
        return identifier

    res = (
        get_supabase_admin()
        .table("profiles")
        .select("id")
        .eq("username", identifier.lower())
        .maybe_single()
        .execute()
    )
    profile = res.data if res else None
    if not profile:
        return None

    user_res = get_supabase_admin().auth.admin.get_user_by_id(profile["id"])
    user = getattr(user_res, "user", None)
    return user.email if user else None


@bp.post("/auth/login")
def login():
    """Signs in with a username or email plus password and returns a session."""
    body = request.get_json(silent=True) or {}
    identifier = (body.get("identifier") or "").strip()
    password = body.get("password") or ""
    if not identifier or not password:
        raise ApiError("username/email and password are required", 400)

    rate_key = f"{request.remote_addr or 'unknown'}:{identifier.lower()}"
    _enforce_login_rate_limit(rate_key)

    auth_email = _resolve_login_email(identifier)
    if not auth_email:
        _record_login_failure(rate_key)
        raise ApiError("invalid login credentials", 401)

    client = new_auth_client()
    try:
        res = client.auth.sign_in_with_password({"email": auth_email, "password": password})
    except Exception as e:
        _record_login_failure(rate_key)
        _raise_from_auth_error(e, 401)

    _clear_login_failures(rate_key)
    return jsonify(_session_payload(res.session))


@bp.post("/auth/forgot-password")
def forgot_password():
    """Sends a password reset email if the address belongs to an account."""
    body = request.get_json(silent=True) or {}
    email = (body.get("email") or "").strip()
    if not email:
        raise ApiError("email is required", 400)

    rate_key = f"{request.remote_addr or 'unknown'}:{email.lower()}"
    _enforce_forgot_password_rate_limit(rate_key)

    existing = get_supabase_admin().table("profiles").select("id").ilike("email", email).maybe_single().execute()
    if existing and existing.data:
        client = new_auth_client()
        try:
            client.auth.reset_password_for_email(email, {"redirect_to": f"{config.FRONTEND_URL}/reset-password"})
        except Exception:
            pass

    return "", 204


@bp.post("/auth/refresh")
def refresh():
    """Exchanges a refresh token for a new session."""
    body = request.get_json(silent=True) or {}
    refresh_token = body.get("refresh_token")
    if not refresh_token:
        raise ApiError("refresh_token is required", 400)

    client = new_auth_client()
    try:
        res = client.auth.refresh_session(refresh_token)
    except Exception as e:
        _raise_from_auth_error(e, 401)

    return jsonify(_session_payload(res.session))


@bp.post("/auth/logout")
def logout():
    """Revokes the caller's session on a best effort basis."""
    header = request.headers.get("Authorization", "")
    if header.startswith("Bearer "):
        token = header.split(" ", 1)[1]
        try:
            get_supabase_admin().auth.admin.sign_out(token, "global")
        except Exception:
            pass
    return "", 204

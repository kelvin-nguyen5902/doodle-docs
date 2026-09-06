from __future__ import annotations

from flask_socketio import SocketIO
from supabase import Client, create_client

from . import config

_supabase_admin: Client | None = None


def get_supabase_admin() -> Client:
    """Shared singleton client for stateless calls like queries and admin auth."""
    global _supabase_admin
    if _supabase_admin is None:
        _supabase_admin = create_client(config.SUPABASE_URL, config.SUPABASE_SERVICE_ROLE_KEY)
    return _supabase_admin


def new_auth_client() -> Client:
    """A fresh client for one request's sign up, sign in, or refresh flow."""
    return create_client(config.SUPABASE_URL, config.SUPABASE_SERVICE_ROLE_KEY)


socketio = SocketIO(cors_allowed_origins=None)

from datetime import datetime, timedelta, timezone

from ..errors import ApiError
from ..extensions import get_supabase_admin


def _db():
    return get_supabase_admin()


def check(key: str, limit: int, window_seconds: int, message: str) -> None:
    """Raises a 429 if `key` has hit `limit` events within the last `window_seconds`."""
    cutoff = (datetime.now(timezone.utc) - timedelta(seconds=window_seconds)).isoformat()
    res = (
        _db()
        .table("rate_limit_events")
        .select("id", count="exact")
        .eq("key", key)
        .gte("created_at", cutoff)
        .execute()
    )
    if (res.count or 0) >= limit:
        raise ApiError(message, 429)


def record(key: str) -> None:
    """Records one event for `key`, counting toward its rate limit."""
    _db().table("rate_limit_events").insert({"key": key}).execute()


def clear(key: str) -> None:
    """Clears recorded events for `key` (e.g. after a successful login)."""
    _db().table("rate_limit_events").delete().eq("key", key).execute()

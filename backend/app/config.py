import os

from dotenv import load_dotenv

load_dotenv()

REQUIRED_KEYS = ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"]

SUPABASE_URL = os.environ.get("SUPABASE_URL")
SUPABASE_SERVICE_ROLE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
FRONTEND_URL = os.environ.get("FRONTEND_URL", "http://localhost:5173")
PORT = int(os.environ.get("PORT", "5000"))
# Which async mode Socket.IO runs under. Local dev overrides this to "threading".
SOCKETIO_ASYNC_MODE = os.environ.get("SOCKETIO_ASYNC_MODE", "eventlet")
# Whether Flask's debug mode is on. Must stay off in production.
DEBUG = os.environ.get("FLASK_DEBUG", "0") == "1"


def _allowed_frontend_origins():
    """Returns FRONTEND_URL plus its localhost/127.0.0.1 alias, since browsers
    treat those as separate origins."""
    origins = {FRONTEND_URL}
    if "localhost" in FRONTEND_URL:
        origins.add(FRONTEND_URL.replace("localhost", "127.0.0.1"))
    elif "127.0.0.1" in FRONTEND_URL:
        origins.add(FRONTEND_URL.replace("127.0.0.1", "localhost"))
    return list(origins)


ALLOWED_FRONTEND_ORIGINS = _allowed_frontend_origins()


def validate_config():
    missing = [k for k in REQUIRED_KEYS if not os.environ.get(k)]
    if missing:
        raise RuntimeError(
            f"Missing required backend/.env keys: {', '.join(missing)}. "
            "Copy backend/.env.example to backend/.env and fill them in "
            "(Supabase Dashboard > Settings > API)."
        )

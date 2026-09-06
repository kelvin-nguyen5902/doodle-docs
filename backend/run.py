import os

# Must happen before anything else is imported: eventlet's concurrency
# relies on cooperatively patching the standard library's blocking I/O
# (socket, threading, time.sleep, ...) so it plays nice with other
# libraries doing normal synchronous calls (e.g. supabase-py's httpx
# client, or socketio.sleep in the checkpoint loop). Importing Flask/
# requests/etc. first and patching afterward is a documented footgun —
# some of what needs patching would already be bound by then.
if os.environ.get("SOCKETIO_ASYNC_MODE", "eventlet") == "eventlet":
    import eventlet

    eventlet.monkey_patch()

import signal

from app import create_app
from app.extensions import socketio
from app import config
from app.services import yjs_service

app = create_app()

# Best-effort: flush any in-memory, not-yet-persisted CRDT edits before a
# graceful shutdown (e.g. a Render redeploy sending SIGTERM). Chains to
# whatever handler was already installed rather than replacing it, so any
# of its own graceful-shutdown behavior still runs — this only adds a
# checkpoint sweep beforehand. If anything about this doesn't hold in the
# actual deployed environment, it fails silently; the periodic background
# sweep in sockets.py already bounds data loss to a similarly small window
# on its own.
_previous_sigterm_handler = signal.getsignal(signal.SIGTERM)


def _handle_sigterm(signum, frame):
    try:
        yjs_service.checkpoint_all()
    except Exception:
        pass
    if callable(_previous_sigterm_handler):
        _previous_sigterm_handler(signum, frame)


try:
    signal.signal(signal.SIGTERM, _handle_sigterm)
except Exception:
    pass

if __name__ == "__main__":
    # this IS the production entrypoint (Render runs `python run.py`
    # directly, not gunicorn) — safe because async_mode defaults to
    # "eventlet", which makes Flask-SocketIO serve via eventlet's own WSGI
    # server rather than Werkzeug's dev server; only the "threading" mode
    # used for local dev (set via SOCKETIO_ASYNC_MODE in backend/.env)
    # falls back to Werkzeug and needs debug/allow_unsafe_werkzeug, both of
    # which stay off unless FLASK_DEBUG=1 (see config.DEBUG).
    socketio.run(app, host="0.0.0.0", port=config.PORT, debug=config.DEBUG, allow_unsafe_werkzeug=config.DEBUG)

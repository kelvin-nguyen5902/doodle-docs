from flask import Flask
from flask_cors import CORS

from . import config
from .errors import register_error_handlers
from .extensions import socketio


def create_app():
    config.validate_config()

    app = Flask(__name__)
    CORS(app, origins=config.ALLOWED_FRONTEND_ORIGINS, allow_headers=["Authorization", "Content-Type"])
    register_error_handlers(app)

    from .blueprints import auth, collaborators, documents, health, invitations, me, users

    app.register_blueprint(health.bp, url_prefix="/api")
    app.register_blueprint(auth.bp, url_prefix="/api")
    app.register_blueprint(me.bp, url_prefix="/api")
    app.register_blueprint(documents.bp, url_prefix="/api")
    app.register_blueprint(collaborators.bp, url_prefix="/api")
    app.register_blueprint(invitations.bp, url_prefix="/api")
    app.register_blueprint(users.bp, url_prefix="/api")

    socketio.init_app(app, cors_allowed_origins=config.ALLOWED_FRONTEND_ORIGINS, async_mode=config.SOCKETIO_ASYNC_MODE)

    from . import sockets  # noqa: F401  (registers socketio event handlers)

    sockets.start_background_tasks()

    return app

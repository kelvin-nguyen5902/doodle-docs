from flask import jsonify


class ApiError(Exception):
    def __init__(self, message, status_code=400):
        super().__init__(message)
        self.message = message
        self.status_code = status_code


def register_error_handlers(app):
    @app.errorhandler(ApiError)
    def handle_api_error(err):
        return jsonify({"error": err.message}), err.status_code

    @app.errorhandler(404)
    def handle_404(err):
        return jsonify({"error": "not found"}), 404

    @app.errorhandler(403)
    def handle_403(err):
        return jsonify({"error": "forbidden"}), 403

    @app.errorhandler(401)
    def handle_401(err):
        return jsonify({"error": "unauthorized"}), 401

    @app.errorhandler(500)
    def handle_500(err):
        return jsonify({"error": "internal server error"}), 500

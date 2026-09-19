"""Public, bounded API for the standalone RailPlan teaching model."""

from __future__ import annotations

from collections import OrderedDict
from copy import deepcopy
import json
from pathlib import Path
from threading import Lock

from flask import Flask, jsonify, request, send_from_directory
from werkzeug.exceptions import HTTPException

from model import InvalidSettings, model_description, parse_settings, solve_demo

MAX_REQUEST_BYTES = 4096
MAX_CACHE_ENTRIES = (
    54  # The entire fixed input space: 3 capacities × 9 closures × 2 modes.
)
STATIC_DIRECTORY = Path(__file__).resolve().parent / "static"


def unique_object(pairs):
    result = {}
    for key, value in pairs:
        if key in result:
            raise InvalidSettings("Duplicate JSON keys are not allowed.")
        result[key] = value
    return result


def reject_constant(_value):
    raise InvalidSettings("Non-finite numbers are not allowed.")


def create_app() -> Flask:
    app = Flask(__name__, static_folder=None)
    # One sentinel byte lets streamed bodies without Content-Length be rejected
    # as oversized instead of parsing a silently truncated 4096-byte prefix.
    app.config.update(MAX_CONTENT_LENGTH=MAX_REQUEST_BYTES + 1)
    lock = Lock()
    cache = OrderedDict()
    app.extensions["solver_lock"] = lock
    app.extensions["solver_cache"] = cache

    def error(code, message, status):
        return jsonify({"error": {"code": code, "message": message}}), status

    @app.after_request
    def headers(response):
        response.headers["Content-Security-Policy"] = (
            "default-src 'self'; script-src 'self'; style-src 'self'; "
            "img-src 'self' data:; connect-src 'self'; font-src 'self'; "
            "object-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'"
        )
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["Referrer-Policy"] = "no-referrer"
        response.headers["Permissions-Policy"] = (
            "camera=(), microphone=(), geolocation=()"
        )
        if request.path.startswith("/api/") or request.path == "/healthz":
            response.headers["Cache-Control"] = "no-store"
        return response

    @app.before_request
    def strict_request():
        if request.method == "OPTIONS":
            return error(
                "method_not_allowed", "This HTTP method is not supported.", 405
            )
        if request.path.startswith("/api/") and request.query_string:
            return error("invalid_request", "Query parameters are not supported.", 400)
        return None

    @app.get("/", provide_automatic_options=False)
    def index():
        return send_from_directory(STATIC_DIRECTORY, "index.html")

    @app.get("/static/<path:filename>", provide_automatic_options=False)
    def static_asset(filename):
        return send_from_directory(STATIC_DIRECTORY, filename)

    @app.get("/healthz", provide_automatic_options=False)
    def health():
        return jsonify({"status": "ok"})

    @app.get("/api/model", provide_automatic_options=False)
    def description():
        return jsonify(model_description())

    @app.post("/api/solve", provide_automatic_options=False)
    def solve():
        if request.mimetype != "application/json":
            return error("unsupported_media_type", "Send application/json.", 415)
        if request.headers.get("Content-Encoding", "identity").lower() != "identity":
            return error(
                "unsupported_media_type",
                "Encoded request bodies are not supported.",
                415,
            )
        try:
            # Flask bounds both Content-Length and streamed bodies before parsing.
            data = request.get_data(cache=False)
            if len(data) > MAX_REQUEST_BYTES:
                return error(
                    "request_too_large", "Request body exceeds 4096 bytes.", 413
                )
            payload = json.loads(
                data, object_pairs_hook=unique_object, parse_constant=reject_constant
            )
            settings = parse_settings(payload)
        except (InvalidSettings, ValueError, UnicodeError, RecursionError):
            return error(
                "invalid_request",
                "Provide valid JSON with capacity (1–3), closedWeek (null or 1–8), and enforcePredecessors (boolean), and no other keys.",
                400,
            )
        if not lock.acquire(blocking=False):
            response, status = error(
                "busy", "The solver is busy. Please try again shortly.", 429
            )
            response.headers["Retry-After"] = "1"
            return response, status
        try:
            key = (
                settings.capacity,
                settings.closed_week,
                settings.enforce_predecessors,
            )
            if key in cache:
                result = deepcopy(cache.pop(key))
                cache[key] = deepcopy(result)
                hit = True
            else:
                result = solve_demo(settings.as_dict())
                hit = False
                if result["status"] in ("OPTIMAL", "INFEASIBLE"):
                    cache[key] = deepcopy(result)
                    if len(cache) > MAX_CACHE_ENTRIES:
                        cache.popitem(last=False)
            result["cache"] = {"hit": hit, "originalSolverMs": result["solverMs"]}
            return jsonify(result)
        finally:
            lock.release()

    @app.errorhandler(HTTPException)
    def http_error(exception):
        codes = {
            400: "invalid_request",
            404: "not_found",
            405: "method_not_allowed",
            413: "request_too_large",
            415: "unsupported_media_type",
        }
        messages = {
            400: "The request could not be read.",
            404: "This resource does not exist.",
            405: "This HTTP method is not supported.",
            413: "Request body exceeds 4096 bytes.",
            415: "Send application/json.",
        }
        status = exception.code or 500
        return error(
            codes.get(status, "request_failed"),
            messages.get(status, "The request could not be completed."),
            status,
        )

    @app.errorhandler(Exception)
    def internal_error(_exception):
        # Do not disclose or log exception contents, submitted values or stack traces.
        return error(
            "solver_error",
            "The solver could not complete this request. Please try again.",
            500,
        )

    return app


app = create_app()

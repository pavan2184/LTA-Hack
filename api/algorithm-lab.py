"""Expose the existing bounded teaching model as one Vercel Python function.

The public function accepts only GET/POST at /api/algorithm-lab. Route adaptation
does not parse, replace or discard the original body, query string or headers;
the standalone Flask application's validation and response protections still run.
"""

import importlib.util
from pathlib import Path
import sys

LAB_DIRECTORY = Path(__file__).resolve().parents[1] / "demos" / "algorithm-lab"
PUBLIC_PATH = "/api/algorithm-lab"

# main.py imports its sibling model.py. Load main under a distinct module name
# so Vercel's entrypoint and the standalone application's main never collide.
sys.path.insert(0, str(LAB_DIRECTORY))
try:
    spec = importlib.util.spec_from_file_location(
        "railplan_algorithm_lab_server", LAB_DIRECTORY / "main.py"
    )
    if spec is None or spec.loader is None:
        raise ImportError("The Algorithm Lab server could not be loaded.")
    server = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(server)
finally:
    sys.path.pop(0)


def app(environ, start_response):
    """Vercel WSGI entrypoint; keep caller-owned environ unchanged."""
    forwarded = environ.copy()
    if environ.get("PATH_INFO") != PUBLIC_PATH:
        # Never expose the standalone site's static/health routes through this
        # function. Let Flask produce its sanitized, no-store JSON 404 response.
        forwarded["PATH_INFO"] = "/api/__not_found__"
    elif environ.get("REQUEST_METHOD") == "GET":
        forwarded["PATH_INFO"] = "/api/model"
    else:
        # POST is handled by the existing solve route. Every other method,
        # including HEAD and OPTIONS, is rejected by that route with HTTP 405.
        forwarded["PATH_INFO"] = "/api/solve"
    return server.app(forwarded, start_response)

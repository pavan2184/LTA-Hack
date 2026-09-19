"""Check the deployed WSGI boundary against the real teaching-model service."""

import importlib.util
from io import BytesIO
from pathlib import Path
import unittest
from unittest.mock import patch

from werkzeug.test import Client, EnvironBuilder
from werkzeug.wrappers import Response

from model import Settings

ROOT = Path(__file__).resolve().parents[2]
SPEC = importlib.util.spec_from_file_location(
    "railplan_vercel_function", ROOT / "api" / "algorithm-lab.py"
)
adapter = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(adapter)
ENDPOINT = "/api/algorithm-lab"


class VercelBoundaryTests(unittest.TestCase):
    def setUp(self):
        adapter.server.app = adapter.server.create_app()
        self.client = Client(adapter.app, Response)
        self.payload = Settings().as_dict()

    def test_public_model_and_real_solutions(self):
        response = self.client.get(ENDPOINT)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json["defaults"], self.payload)
        self.assertEqual(len(response.json["jobs"]), 6)
        for closed_week, objective in ((None, 5), (2, 19)):
            with self.subTest(closed_week=closed_week):
                response = self.client.post(
                    ENDPOINT, json={**self.payload, "closedWeek": closed_week}
                )
                result = response.json
                self.assertEqual(response.status_code, 200)
                self.assertEqual(result["status"], "OPTIMAL")
                self.assertEqual(result["objective"], objective)
                self.assertEqual(result["bestBound"], objective)
                self.assertEqual(sum(len(job["weeks"]) for job in result["jobs"]), 9)
                self.assertTrue(all(check["passed"] for check in result["checks"]))

    def test_infeasible_result_has_no_partial_schedule(self):
        response = self.client.post(ENDPOINT, json={**self.payload, "capacity": 1})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json["status"], "INFEASIBLE")
        self.assertEqual(response.json["jobs"], [])
        self.assertIsNone(response.json["objective"])

    def test_only_one_path_and_two_methods_are_available(self):
        for path in (
            "/",
            "/healthz",
            "/static/index.html",
            "/api/model",
            "/api/solve",
            ENDPOINT + "/",
            ENDPOINT + ".py",
            ENDPOINT + "/solve",
        ):
            for method in ("GET", "POST"):
                with self.subTest(path=path, method=method):
                    self.assertEqual(
                        self.client.open(path, method=method).status_code, 404
                    )
        for method in ("PUT", "PATCH", "DELETE", "HEAD", "OPTIONS", "TRACE"):
            with self.subTest(method=method):
                self.assertEqual(
                    self.client.open(ENDPOINT, method=method).status_code, 405
                )

    def test_original_query_is_rejected_for_both_operations(self):
        for method in ("GET", "POST"):
            with self.subTest(method=method):
                response = self.client.open(
                    ENDPOINT + "?capacity=3", method=method, json=self.payload
                )
                self.assertEqual(response.status_code, 400)
                self.assertEqual(response.json["error"]["code"], "invalid_request")

    def test_json_validation_is_not_bypassed(self):
        invalid = (
            b"{",
            b"[]",
            b"\xff",
            b'{"capacity":2,"capacity":3,"closedWeek":null,"enforcePredecessors":true}',
            b'{"capacity":2,"closedWeek":null,"enforcePredecessors":true,"extra":1}',
            b'{"capacity":true,"closedWeek":null,"enforcePredecessors":true}',
            b'{"capacity":NaN,"closedWeek":null,"enforcePredecessors":true}',
        )
        with patch.object(adapter.server, "solve_demo") as solver:
            for data in invalid:
                with self.subTest(data=data):
                    response = self.client.post(
                        ENDPOINT, data=data, content_type="application/json"
                    )
                    self.assertEqual(response.status_code, 400)
            solver.assert_not_called()

    def test_original_content_type_and_encoding_are_checked(self):
        for headers in (
            {"Content-Type": "text/plain"},
            {"Content-Type": "application/json", "Content-Encoding": "gzip"},
        ):
            with self.subTest(headers=headers):
                response = self.client.post(ENDPOINT, data=b"{}", headers=headers)
                self.assertEqual(response.status_code, 415)

    def test_declared_and_streamed_body_limits_are_preserved(self):
        with patch.object(adapter.server, "solve_demo") as solver:
            response = self.client.post(
                ENDPOINT, data=b" " * 4097, content_type="application/json"
            )
            self.assertEqual(response.status_code, 413)
            response = self.client.post(
                ENDPOINT,
                content_type="application/json",
                environ_overrides={
                    "wsgi.input": BytesIO(b" " * 5000),
                    "wsgi.input_terminated": True,
                    "CONTENT_LENGTH": "",
                },
            )
            self.assertEqual(response.status_code, 413)
            solver.assert_not_called()

    def test_busy_guard_cache_and_sanitized_error_survive_adapter(self):
        lock = adapter.server.app.extensions["solver_lock"]
        lock.acquire()
        try:
            response = self.client.post(ENDPOINT, json=self.payload)
            self.assertEqual(response.status_code, 429)
            self.assertEqual(response.headers["Retry-After"], "1")
        finally:
            lock.release()
        with patch.object(
            adapter.server, "solve_demo", side_effect=RuntimeError("PRIVATE_DETAIL")
        ):
            response = self.client.post(ENDPOINT, json=self.payload)
            self.assertEqual(response.status_code, 500)
            self.assertNotIn("PRIVATE_DETAIL", response.get_data(as_text=True))
        first = self.client.post(ENDPOINT, json=self.payload).json
        second = self.client.post(ENDPOINT, json=self.payload).json
        self.assertFalse(first["cache"]["hit"])
        self.assertTrue(second["cache"]["hit"])
        self.assertEqual(first["jobs"], second["jobs"])

    def test_security_headers_survive_success_and_rejections(self):
        for response in (
            self.client.get(ENDPOINT),
            self.client.post(ENDPOINT, json={}),
            self.client.put(ENDPOINT),
            self.client.get("/static/index.html"),
            self.client.get(ENDPOINT + "?extra=1"),
        ):
            self.assertEqual(response.headers["Cache-Control"], "no-store")
            self.assertEqual(response.headers["X-Content-Type-Options"], "nosniff")
            self.assertEqual(response.headers["X-Frame-Options"], "DENY")
            self.assertEqual(response.headers["Referrer-Policy"], "no-referrer")
            self.assertIn(
                "frame-ancestors 'none'", response.headers["Content-Security-Policy"]
            )
            self.assertNotIn("Access-Control-Allow-Origin", response.headers)

    def test_adapter_does_not_mutate_the_original_wsgi_environment(self):
        environ = EnvironBuilder(path=ENDPOINT, method="GET").get_environ()
        original = environ.copy()
        response = Response.from_app(adapter.app, environ)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(environ, original)


if __name__ == "__main__":
    unittest.main()

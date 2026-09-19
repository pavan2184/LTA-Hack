"""Exercise public HTTP bounds, concurrency, truthful caching and static serving."""

from pathlib import Path
from tempfile import TemporaryDirectory
from io import BytesIO
import unittest
from unittest.mock import patch

from main import MAX_CACHE_ENTRIES, create_app
from model import Settings, solve_demo


class ServerTests(unittest.TestCase):
    def setUp(self):
        self.app = create_app()
        self.client = self.app.test_client()
        self.payload = Settings().as_dict()

    def test_model_and_health_are_public(self):
        response = self.client.get("/api/model")
        self.assertEqual(response.status_code, 200)
        body = response.get_json()
        self.assertEqual(body["defaults"], self.payload)
        self.assertEqual(len(body["jobs"]), 6)
        self.assertEqual(body["horizon"], 8)
        self.assertIn("not RailPlan's full PS1", body["scope"])
        self.assertEqual(self.client.get("/healthz").get_json(), {"status": "ok"})

    def test_static_files_and_traversal(self):
        with TemporaryDirectory() as directory:
            root = Path(directory)
            (root / "index.html").write_text("<h1>Public lab</h1>")
            (root / "app.js").write_text("'use strict';")
            with patch("main.STATIC_DIRECTORY", root):
                with self.client.get("/") as response:
                    self.assertEqual(response.status_code, 200)
                with self.client.get("/static/app.js") as response:
                    self.assertEqual(response.status_code, 200)
                self.assertEqual(self.client.get("/static/../main.py").status_code, 404)

    def test_real_solution_has_verified_full_workload(self):
        response = self.client.post("/api/solve", json=self.payload)
        body = response.get_json()
        self.assertEqual(response.status_code, 200)
        self.assertEqual(body["status"], "OPTIMAL")
        self.assertEqual(sum(len(job["weeks"]) for job in body["jobs"]), 9)
        self.assertTrue(all(check["passed"] for check in body["checks"]))
        self.assertEqual(
            body["cache"], {"hit": False, "originalSolverMs": body["solverMs"]}
        )

    def test_cache_reports_original_timing_and_does_not_resolve(self):
        with patch("main.solve_demo", wraps=solve_demo) as solver:
            first = self.client.post("/api/solve", json=self.payload).get_json()
            second = self.client.post("/api/solve", json=self.payload).get_json()
        self.assertEqual(solver.call_count, 1)
        self.assertFalse(first["cache"]["hit"])
        self.assertTrue(second["cache"]["hit"])
        self.assertEqual(first["solverMs"], second["solverMs"])
        self.assertEqual(first["jobs"], second["jobs"])
        self.assertLessEqual(
            len(self.app.extensions["solver_cache"]), MAX_CACHE_ENTRIES
        )

    def test_unproved_status_is_not_cached(self):
        result = {
            "status": "UNKNOWN",
            "solverMs": 2000,
            "jobs": [],
            "checks": [],
            "objective": None,
            "bestBound": None,
        }
        with patch("main.solve_demo", return_value=result) as solver:
            self.client.post("/api/solve", json=self.payload)
            self.client.post("/api/solve", json=self.payload)
        self.assertEqual(solver.call_count, 2)
        self.assertEqual(len(self.app.extensions["solver_cache"]), 0)

    def test_busy_request_returns_quickly_and_lock_recovers(self):
        lock = self.app.extensions["solver_lock"]
        lock.acquire()
        try:
            response = self.client.post("/api/solve", json=self.payload)
            self.assertEqual(response.status_code, 429)
            self.assertEqual(response.headers["Retry-After"], "1")
        finally:
            lock.release()
        self.assertEqual(
            self.client.post("/api/solve", json=self.payload).status_code, 200
        )

    def test_failure_is_sanitized_and_releases_lock(self):
        with patch(
            "main.solve_demo", side_effect=RuntimeError("SENSITIVE_TEST_DETAIL")
        ):
            response = self.client.post("/api/solve", json=self.payload)
        self.assertEqual(response.status_code, 500)
        self.assertNotIn("SENSITIVE_TEST_DETAIL", response.get_data(as_text=True))
        self.assertEqual(response.get_json()["error"]["code"], "solver_error")
        self.assertEqual(
            self.client.post("/api/solve", json=self.payload).status_code, 200
        )

    def test_strict_json_and_content_types(self):
        for text in (
            "",
            "{",
            "[]",
            "null",
            "{}",
            '{"capacity":2,"closedWeek":null,"enforcePredecessors":true,"other":1}',
            '{"capacity":2,"capacity":1,"closedWeek":null,"enforcePredecessors":true}',
            '{"capacity":NaN,"closedWeek":null,"enforcePredecessors":true}',
        ):
            with self.subTest(text=text):
                response = self.client.post(
                    "/api/solve", data=text, content_type="application/json"
                )
                self.assertEqual(response.status_code, 400)
        self.assertEqual(self.client.post("/api/solve", data="{}").status_code, 415)
        self.assertEqual(
            self.client.post(
                "/api/solve", json=self.payload, headers={"Content-Encoding": "gzip"}
            ).status_code,
            415,
        )

    def test_oversized_requests_never_reach_solver(self):
        with patch("main.solve_demo") as solver:
            response = self.client.post(
                "/api/solve", data=" " * 4097, content_type="application/json"
            )
        self.assertEqual(response.status_code, 413)
        solver.assert_not_called()

    def test_stream_without_content_length_is_bounded(self):
        with patch("main.solve_demo") as solver:
            response = self.client.post(
                "/api/solve",
                content_type="application/json",
                environ_overrides={
                    "wsgi.input": BytesIO(b" " * 5000),
                    "wsgi.input_terminated": True,
                    "CONTENT_LENGTH": "",
                },
            )
        self.assertEqual(response.status_code, 413)
        solver.assert_not_called()

    def test_unexpected_methods_queries_and_paths_are_rejected(self):
        for method, path, status in (
            ("get", "/api/solve", 405),
            ("delete", "/api/model", 405),
            ("post", "/healthz", 405),
            ("options", "/api/solve", 405),
            ("get", "/api/model?extra=1", 400),
            ("get", "/does-not-exist", 404),
        ):
            with self.subTest(method=method, path=path):
                self.assertEqual(getattr(self.client, method)(path).status_code, status)

    def test_security_headers_on_success_and_errors(self):
        for response in (
            self.client.get("/api/model"),
            self.client.get("/api/missing"),
            self.client.post("/api/solve", json={}),
            self.client.get("/healthz"),
        ):
            self.assertEqual(response.headers["Cache-Control"], "no-store")
            self.assertEqual(response.headers["X-Content-Type-Options"], "nosniff")
            self.assertEqual(response.headers["X-Frame-Options"], "DENY")
            csp = response.headers["Content-Security-Policy"]
            self.assertIn("script-src 'self'", csp)
            self.assertIn("frame-ancestors 'none'", csp)
            self.assertNotIn("unsafe-inline", csp)
            self.assertNotIn("Access-Control-Allow-Origin", response.headers)


if __name__ == "__main__":
    unittest.main()

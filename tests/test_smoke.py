import unittest

from fastapi.testclient import TestClient

from app.main import app


class SmokeTestCase(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.client = TestClient(app)

    def test_root_serves_frontend(self) -> None:
        response = self.client.get("/")

        self.assertEqual(response.status_code, 200)
        self.assertIn("text/html", response.headers.get("content-type", ""))

    def test_openapi_is_available(self) -> None:
        response = self.client.get("/openapi.json")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json().get("info", {}).get("title"), "Weather Dashboard API")

    def test_city_validation_blocks_short_queries(self) -> None:
        response = self.client.get("/api/cities", params={"q": "Ro", "limit": 3})

        self.assertEqual(response.status_code, 422)


if __name__ == "__main__":
    unittest.main()

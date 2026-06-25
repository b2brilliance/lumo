"""Tests for /api/auth/google/exchange — Emergent OAuth handoff endpoint.

The Emergent OAuth /session-data endpoint is NOT mocked here: we send a
real httpx request with a fake session_id and assert the 401 mapping.
"""
import os
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/") or os.environ.get("BACKEND_URL", "").rstrip("/")

# fallback for in-container testing
if not BASE_URL:
    with open("/app/frontend/.env") as fh:
        for line in fh:
            if line.startswith("REACT_APP_BACKEND_URL="):
                BASE_URL = line.split("=", 1)[1].strip().rstrip("/")
                break


@pytest.fixture
def client():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


class TestGoogleExchangeContract:
    """POST /api/auth/google/exchange contract checks."""

    def test_empty_body_returns_422(self, client):
        r = client.post(f"{BASE_URL}/api/auth/google/exchange", json={})
        assert r.status_code == 422, f"expected 422 for empty body, got {r.status_code}: {r.text[:300]}"

    def test_short_session_id_returns_400(self, client):
        r = client.post(f"{BASE_URL}/api/auth/google/exchange", json={"session_id": "a"})
        assert r.status_code == 400, f"expected 400 for short id, got {r.status_code}: {r.text[:300]}"
        body = r.json()
        detail = (body.get("detail") or "").lower()
        assert "missing" in detail or "session" in detail, body

    def test_fake_session_id_returns_401(self, client):
        # Fake but reasonably long uuid-like session id → Emergent /session-data returns non-200
        r = client.post(
            f"{BASE_URL}/api/auth/google/exchange",
            json={"session_id": "fake-uuid-12345-not-a-real-emergent-session"},
        )
        assert r.status_code == 401, f"expected 401 for fake session id, got {r.status_code}: {r.text[:300]}"
        body = r.json()
        detail = (body.get("detail") or "").lower()
        assert "expired" in detail or "sign-in link" in detail, body

    def test_no_5xx_on_any_input(self, client):
        for sid in ["", "x", "fake-uuid-12345"]:
            payload = {} if sid == "" else {"session_id": sid}
            r = client.post(f"{BASE_URL}/api/auth/google/exchange", json=payload)
            assert r.status_code < 500, f"5xx for sid={sid!r}: {r.status_code} {r.text[:200]}"


class TestRegression:
    """Iteration-10/11 regression — must not have broken anything."""

    def test_login_password_still_works(self, client):
        r = client.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": "customer@lumo.test", "password": "password123"},
        )
        assert r.status_code == 200, r.text[:300]
        data = r.json()
        assert "token" in data
        assert isinstance(data["token"], str) and len(data["token"]) > 20
        assert data["user"]["email"] == "customer@lumo.test"

    def test_real_estate_endpoint_200(self, client):
        r = client.get(f"{BASE_URL}/api/real-estate")
        assert r.status_code == 200, f"real-estate: {r.status_code} {r.text[:200]}"

    def test_autos_endpoint_200(self, client):
        r = client.get(f"{BASE_URL}/api/autos")
        assert r.status_code == 200, f"autos: {r.status_code} {r.text[:200]}"

    def test_inquiries_endpoint_responds(self, client):
        r = client.get(f"{BASE_URL}/api/inquiries")
        # may be 200 (list, public) or 401 (auth required) — must not be 5xx
        assert r.status_code in (200, 401), f"inquiries: {r.status_code} {r.text[:200]}"

    def test_sms_start_invalid_phone_still_400(self, client):
        r = client.post(f"{BASE_URL}/api/auth/sms/start", json={"phone": "abc12"})
        # regression — should still reach validation, not a 5xx
        assert r.status_code in (400, 422), r.text[:200]

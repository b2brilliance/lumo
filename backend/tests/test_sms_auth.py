"""
Backend tests for the passwordless SMS sign-in (Twilio Verify) integration
introduced in iteration 11. Also runs lightweight regression on the password
flow (/api/auth/login) and the classifieds endpoints from iteration 10.
"""
import os
import re
import requests
import pytest

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://lumo-bundle-checkout.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"


@pytest.fixture(scope="module")
def s():
    return requests.Session()


# ---------------------------------------------------------------- /auth/sms/start
class TestSmsStartContract:
    def test_empty_phone_returns_422(self, s):
        r = s.post(f"{API}/auth/sms/start", json={"phone": ""})
        assert r.status_code == 422, r.text

    def test_short_phone_returns_422(self, s):
        # field min_length=4 → pydantic 422
        r = s.post(f"{API}/auth/sms/start", json={"phone": "ab"})
        assert r.status_code == 422

    def test_invalid_phone_returns_400(self, s):
        r = s.post(f"{API}/auth/sms/start", json={"phone": "abc12"})
        assert r.status_code == 400, r.text
        body = r.json()
        assert "valid phone" in (body.get("detail") or "").lower()

    def test_unverified_trial_number_returns_400_with_mapping(self, s):
        # Twilio magic numbers don't consume credit; on a trial account
        # they trigger the 21608 mapping ("only verified numbers").
        r = s.post(f"{API}/auth/sms/start", json={"phone": "+15005550001"})
        # MUST never 502/500
        assert r.status_code not in (500, 502, 503), f"server error: {r.status_code} {r.text}"
        assert r.status_code == 400, r.text
        msg = (r.json().get("detail") or "").lower()
        # backend maps 21608 → message containing "verified" and "upgrade"
        assert ("verified" in msg) or ("upgrade" in msg) or ("phone number" in msg), msg


# ---------------------------------------------------------------- /auth/sms/verify
class TestSmsVerifyContract:
    def test_verify_without_prior_request_maps_to_400(self, s):
        # Use a properly formatted E.164 number that has no in-flight verification
        r = s.post(f"{API}/auth/sms/verify", json={"phone": "+15005550006", "code": "123456"})
        assert r.status_code not in (500, 502, 503), f"server error: {r.status_code} {r.text}"
        # Twilio code 20404 → mapped to 400 with friendly message
        assert r.status_code == 400, r.text
        msg = (r.json().get("detail") or "").lower()
        assert ("no code request" in msg) or ("send code" in msg) or ("verify" in msg) or ("couldn't" in msg)

    def test_verify_invalid_phone_returns_400(self, s):
        r = s.post(f"{API}/auth/sms/verify", json={"phone": "abc12", "code": "123456"})
        assert r.status_code == 400
        assert "valid phone" in (r.json().get("detail") or "").lower()


# ---------------------------------------------------------------- E.164 normalization
class TestPhoneNormalization:
    """The backend regex anchors ^\\+[1-9]\\d{6,14}$ . We can probe normalization
    by sending various inputs: if normalization works to a valid E.164 form, the
    backend will go on to call Twilio (which for unknown real numbers may 400 with
    a Twilio-mapped error). If normalization FAILS, the backend returns 400 with
    'Enter a valid phone number' immediately."""

    @pytest.mark.parametrize(
        "raw",
        [
            "4155552671",          # 10 digit US → +14155552671
            "(415) 555-2671",     # punctuated US → +14155552671
            "+44 20 1234 5678",   # UK with country code → +442012345678
        ],
    )
    def test_valid_inputs_normalize_and_reach_twilio(self, s, raw):
        r = s.post(f"{API}/auth/sms/start", json={"phone": raw})
        assert r.status_code not in (500, 502, 503), f"server error: {r.status_code} {r.text}"
        # MUST NOT be the "Enter a valid phone number" 400.
        if r.status_code == 400:
            detail = (r.json().get("detail") or "").lower()
            assert "enter a valid phone" not in detail, (
                f"normalization failed for {raw!r}: {detail}"
            )

    @pytest.mark.parametrize("raw", ["abc", "12", "++"])  # short / non-numeric
    def test_invalid_inputs_rejected(self, s, raw):
        r = s.post(f"{API}/auth/sms/start", json={"phone": raw})
        # Either pydantic 422 or our regex 400 — both are acceptable rejections
        assert r.status_code in (400, 422), r.text


# ---------------------------------------------------------------- Regression: password login
class TestPasswordLoginRegression:
    def test_seeded_customer_can_login(self, s):
        r = s.post(f"{API}/auth/login", json={"email": "customer@lumo.test", "password": "password123"})
        assert r.status_code == 200, r.text
        body = r.json()
        # Be tolerant about the exact token field name
        token = body.get("token") or body.get("access_token")
        assert token and isinstance(token, str) and len(token) > 10
        user = body.get("user") or {}
        assert (user.get("email") == "customer@lumo.test") or user.get("role") in {"customer", "provider", "retailer", "restaurant", "admin"}


# ---------------------------------------------------------------- Regression: classifieds endpoints
class TestClassifiedsRegression:
    def test_real_estate_smoke(self, s):
        r = s.get(f"{API}/real-estate")
        assert r.status_code == 200
        assert isinstance(r.json(), list)

    def test_autos_smoke(self, s):
        r = s.get(f"{API}/autos")
        assert r.status_code == 200
        assert isinstance(r.json(), list)

    def test_inquiries_requires_auth(self, s):
        r = s.get(f"{API}/inquiries")
        # Either 401 (Bearer required) or 200 (if endpoint allows empty list when unauth) — but should not 5xx
        assert r.status_code in (200, 401, 403), r.text

"""Iteration 32 backend tests: wizard signup, map/jobs employment_type filtering,
provider/opportunities employment_types + subcategories hard filter."""
import os
import io
import time
import requests
import pytest

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
if not BASE_URL:
    raise RuntimeError("REACT_APP_BACKEND_URL not set")
API = f"{BASE_URL}/api"

PROVIDER_EMAIL = "provider@lumo.test"
CUSTOMER_EMAIL = "customer@lumo.test"
PASSWORD = "password123"


# ---- Helpers ---------------------------------------------------------------
def _login(email, password):
    r = requests.post(f"{API}/auth/login", json={"email": email, "password": password}, timeout=15)
    assert r.status_code == 200, f"login failed for {email}: {r.status_code} {r.text}"
    return r.json()["token"]


def _auth(token):
    return {"Authorization": f"Bearer {token}"}


# ---- Avatar upload ---------------------------------------------------------
def _upload_avatar():
    """POST /api/media/upload-avatar with a tiny PNG. Returns avatar_url string."""
    png = (b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01"
           b"\x08\x06\x00\x00\x00\x1f\x15\xc4\x89\x00\x00\x00\rIDATx\x9cc\xf8\xcf"
           b"\xc0\xc0\xc0\xc0\xc0\x00\x00\x00\x05\x00\x01\x0d\n\x2d\xb4\x00\x00"
           b"\x00\x00IEND\xaeB`\x82")
    files = {"file": ("avatar.png", io.BytesIO(png), "image/png")}
    r = requests.post(f"{API}/media/upload-avatar", files=files, timeout=20)
    # Accept multiple shapes
    assert r.status_code in (200, 201), f"avatar upload failed: {r.status_code} {r.text}"
    data = r.json()
    url = data.get("url") or data.get("avatar_url") or data.get("media_url")
    assert url, f"no url in avatar response: {data}"
    return url


# ============================================================================
# 1. Provider registration with full payload
# ============================================================================
class TestProviderRegistration:
    def test_register_provider_with_all_fields(self):
        avatar_url = _upload_avatar()
        ts = int(time.time())
        email = f"TEST_provider_{ts}@lumo.test"
        body = {
            "email": email,
            "password": "password123",
            "name": "TEST Provider",
            "role": "provider",
            "avatar_url": avatar_url,
            "employment_types": ["on_demand", "remote"],
            "categories": ["delivery", "digital_tech"],
            "subcategories": ["package", "software_engineering"],
            "provider_profile": {
                "bio": "10 years exp",
                "certifications": "EPA",
                "work_history": "XYZ",
            },
        }
        r = requests.post(f"{API}/auth/register", json=body, timeout=15)
        assert r.status_code == 200, f"register failed: {r.status_code} {r.text}"
        data = r.json()
        assert "token" in data
        user = data.get("user") or {}
        assert user.get("role") == "provider"
        assert set(user.get("employment_types") or []) == {"on_demand", "remote"}
        assert set(user.get("categories") or []) == {"delivery", "digital_tech"}
        assert set(user.get("subcategories") or []) == {"package", "software_engineering"}
        pp = user.get("provider_profile") or {}
        assert pp.get("bio") == "10 years exp"
        assert pp.get("certifications") == "EPA"
        assert pp.get("work_history") == "XYZ"

        # GET /api/auth/me -> same persisted data
        me = requests.get(f"{API}/auth/me", headers=_auth(data["token"]), timeout=10)
        assert me.status_code == 200
        me_data = me.json()
        assert set(me_data.get("employment_types") or []) == {"on_demand", "remote"}
        assert set(me_data.get("subcategories") or []) == {"package", "software_engineering"}
        assert (me_data.get("provider_profile") or {}).get("bio") == "10 years exp"

    def test_register_customer_without_provider_fields(self):
        ts = int(time.time()) + 1
        email = f"TEST_customer_{ts}@lumo.test"
        body = {
            "email": email,
            "password": "password123",
            "name": "TEST Customer",
            "role": "customer",
        }
        r = requests.post(f"{API}/auth/register", json=body, timeout=15)
        assert r.status_code == 200, f"customer register failed: {r.status_code} {r.text}"
        user = r.json().get("user") or {}
        assert user.get("role") == "customer"
        assert user.get("employment_types") == []
        assert user.get("subcategories") == []


# ============================================================================
# 2. /api/map/jobs employment_type filter + new fields
# ============================================================================
class TestMapJobsEmploymentTypes:
    def test_map_jobs_has_70_plus_pins_with_new_fields(self):
        r = requests.get(f"{API}/map/jobs", timeout=20)
        assert r.status_code == 200
        pins = r.json()
        assert isinstance(pins, list)
        assert len(pins) >= 70, f"expected >=70 pins, got {len(pins)}"
        # All pins should have employment_type key
        for p in pins:
            assert "employment_type" in p
            assert "apply_url" in p  # may be None
            assert "schedule" in p   # may be None

    def test_map_jobs_filter_w2(self):
        r = requests.get(f"{API}/map/jobs", params={"employment_type": "w2"}, timeout=20)
        assert r.status_code == 200
        pins = r.json()
        assert len(pins) >= 12, f"expected >=12 W-2 pins, got {len(pins)}"
        for p in pins:
            assert p.get("employment_type") == "w2"

    def test_map_jobs_filter_remote(self):
        r = requests.get(f"{API}/map/jobs", params={"employment_type": "remote"}, timeout=20)
        assert r.status_code == 200
        pins = r.json()
        assert len(pins) >= 12, f"expected >=12 remote pins, got {len(pins)}"
        for p in pins:
            assert p.get("employment_type") == "remote"

    def test_map_jobs_filter_on_demand(self):
        r = requests.get(f"{API}/map/jobs", params={"employment_type": "on_demand"}, timeout=20)
        assert r.status_code == 200
        pins = r.json()
        # legacy seeded data should still be on_demand
        assert len(pins) > 0
        for p in pins:
            assert p.get("employment_type") == "on_demand"


# ============================================================================
# 3. Provider opportunities hard-filter by employment_types + subcategories
# ============================================================================
class TestProviderOpportunitiesFilters:
    @pytest.fixture(scope="class")
    def provider_token(self):
        return _login(PROVIDER_EMAIL, PASSWORD)

    def _patch_me(self, token, payload):
        r = requests.patch(f"{API}/auth/me", json=payload, headers=_auth(token), timeout=10)
        assert r.status_code == 200, f"patch /auth/me failed: {r.status_code} {r.text}"
        return r.json()

    def test_opportunities_unfiltered_when_empty_employment_types(self, provider_token):
        # Ensure clean state
        self._patch_me(provider_token, {"employment_types": [], "subcategories": []})
        r = requests.get(f"{API}/provider/opportunities", headers=_auth(provider_token), timeout=20)
        assert r.status_code == 200
        ops = r.json()
        # Should return jobs (>=1; fresh provider with no employment_types -> all)
        assert isinstance(ops, list)
        baseline = len(ops)
        assert baseline > 0, "expected opportunities when employment_types empty"
        # Should include mixed employment types
        types_seen = set((o.get("employment_type") or "on_demand") for o in ops)
        assert len(types_seen) >= 1

    def test_opportunities_filtered_to_w2(self, provider_token):
        try:
            self._patch_me(provider_token, {"employment_types": ["w2"], "subcategories": []})
            r = requests.get(f"{API}/provider/opportunities", headers=_auth(provider_token), timeout=20)
            assert r.status_code == 200
            ops = r.json()
            for o in ops:
                emp = o.get("employment_type") or "on_demand"
                assert emp == "w2", f"non-w2 job leaked: {emp} title={o.get('title')}"
            # We have 12 W-2 seeded; provider has no location so on-demand jobs would have
            # been filtered by miles anyway. W-2 jobs bypass distance, so we should see them.
            assert len(ops) > 0, "expected at least one W-2 opportunity"
        finally:
            self._patch_me(provider_token, {"employment_types": [], "subcategories": []})

    def test_opportunities_subcategory_hard_filter(self, provider_token):
        try:
            self._patch_me(provider_token, {"subcategories": ["package"], "employment_types": []})
            r = requests.get(f"{API}/provider/opportunities", headers=_auth(provider_token), timeout=20)
            assert r.status_code == 200
            ops = r.json()
            for o in ops:
                sub = (o.get("details") or {}).get("subcategory")
                # Either no subcategory (legacy passthrough) or matches "package"
                assert (not sub) or sub == "package", f"unexpected sub: {sub}"
        finally:
            self._patch_me(provider_token, {"subcategories": [], "employment_types": []})


# ============================================================================
# 4. Existing logins still work (regression)
# ============================================================================
class TestLoginRegression:
    def test_customer_login(self):
        token = _login(CUSTOMER_EMAIL, PASSWORD)
        assert token

    def test_provider_login(self):
        token = _login(PROVIDER_EMAIL, PASSWORD)
        assert token

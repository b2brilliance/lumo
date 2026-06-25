"""Iter 19 — Admin analytics reset + drill-down endpoints."""
import os
import uuid
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://lumo-bundle-checkout.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"


def _login(email, password):
    r = requests.post(f"{API}/auth/login", json={"email": email, "password": password}, timeout=30)
    assert r.status_code == 200, f"login failed for {email}: {r.status_code} {r.text}"
    return r.json()["token"]


@pytest.fixture(scope="module")
def admin_token():
    return _login("admin@lumo.test", "password123")


@pytest.fixture(scope="module")
def customer_token():
    return _login("customer@lumo.test", "password123")


@pytest.fixture
def admin_headers(admin_token):
    return {"Authorization": f"Bearer {admin_token}", "Content-Type": "application/json"}


@pytest.fixture
def customer_headers(customer_token):
    return {"Authorization": f"Bearer {customer_token}", "Content-Type": "application/json"}


# ── 1. Reset + overview ────────────────────────────────────────────────────
class TestResetAndOverview:
    def test_reset_returns_cutoff_and_count(self, admin_headers):
        r = requests.post(f"{API}/admin/analytics/reset", headers=admin_headers, timeout=30)
        assert r.status_code == 200, r.text
        body = r.json()
        assert "cutoff_at" in body and body["cutoff_at"]
        assert "pageviews_deleted" in body
        assert isinstance(body["pageviews_deleted"], int)
        assert "message" in body

    def test_overview_has_cutoff_after_reset(self, admin_headers):
        r = requests.get(f"{API}/admin/analytics/overview", headers=admin_headers, timeout=30)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d.get("cutoff_at"), "overview should expose cutoff_at after reset"
        # right after reset, visitor counters should be 0
        assert d["visitors"]["last_24h"] == 0
        assert d["visitors"]["last_7d"] == 0
        assert d["visitors"]["pageviews_24h"] == 0
        # revenue should also be 0
        assert d["revenue"]["gmv"] == 0
        assert d["revenue"]["provider_payouts"] == 0
        # signups since cutoff should also be 0
        assert d["signups"]["new_24h"] == 0
        assert d["signups"]["total"] == 0

    def test_cutoff_endpoint(self, admin_headers):
        r = requests.get(f"{API}/admin/analytics/cutoff", headers=admin_headers, timeout=30)
        assert r.status_code == 200
        assert r.json().get("cutoff_at")


# ── 2. Drill-down details ──────────────────────────────────────────────────
class TestDetailsEndpoints:
    def test_visitors_empty_after_reset(self, admin_headers):
        r = requests.get(f"{API}/admin/analytics/details/visitors?range_key=24h", headers=admin_headers, timeout=30)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["metric"] == "visitors"
        assert d["range"] == "24h"
        assert isinstance(d["items"], list)
        assert d["total"] == 0
        assert d["items"] == []

    def test_visitors_after_pageview_inserted(self, admin_headers):
        # public pageview ingest
        sid = f"TEST_sess_{uuid.uuid4().hex[:8]}"
        rp = requests.post(f"{API}/analytics/pageview",
                           json={"session_id": sid, "path": "/test", "referrer": "https://test.example"},
                           timeout=30)
        assert rp.status_code == 200, rp.text

        r = requests.get(f"{API}/admin/analytics/details/visitors?range_key=24h", headers=admin_headers, timeout=30)
        d = r.json()
        sessions = [i["session_id"] for i in d["items"]]
        assert sid in sessions, f"new session {sid} not in returned visitors {sessions}"
        item = next(i for i in d["items"] if i["session_id"] == sid)
        assert item["pageviews"] >= 1
        assert "first_seen" in item and "last_seen" in item
        assert isinstance(item.get("paths"), list)
        assert "/test" in item["paths"]

    def test_pageviews_endpoint(self, admin_headers):
        r = requests.get(f"{API}/admin/analytics/details/pageviews?range_key=7d", headers=admin_headers, timeout=30)
        assert r.status_code == 200
        d = r.json()
        assert d["metric"] == "pageviews"
        assert isinstance(d["items"], list)
        if d["items"]:
            row = d["items"][0]
            assert "ts" in row and "path" in row
            assert "_id" not in row  # mongo _id stripped

    def test_signups_strips_password_hash(self, admin_headers):
        r = requests.get(f"{API}/admin/analytics/details/signups?range_key=all", headers=admin_headers, timeout=30)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["metric"] == "signups"
        for u in d["items"]:
            assert "password_hash" not in u, "password_hash MUST be stripped"

    def test_signups_customer_role_filter(self, admin_headers):
        r = requests.get(f"{API}/admin/analytics/details/signups_customer?range_key=all", headers=admin_headers, timeout=30)
        assert r.status_code == 200, r.text
        d = r.json()
        for u in d["items"]:
            assert u.get("role") == "customer", f"non-customer leaked: {u.get('role')}"

    def test_active_jobs(self, admin_headers):
        r = requests.get(f"{API}/admin/analytics/details/active_jobs?range_key=all", headers=admin_headers, timeout=30)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["metric"] == "active_jobs"
        active = {"open", "accepted", "in_progress", "awaiting_confirmation", "deposit_paid"}
        for j in d["items"]:
            assert j["status"] in active, f"unexpected status in active_jobs: {j['status']}"

    def test_completed_orders(self, admin_headers):
        r = requests.get(f"{API}/admin/analytics/details/completed_orders?range_key=all", headers=admin_headers, timeout=30)
        assert r.status_code == 200
        d = r.json()
        assert d["metric"] == "completed_orders"
        for o in d["items"]:
            assert o["status"] == "completed"

    def test_gmv_has_by_category(self, admin_headers):
        r = requests.get(f"{API}/admin/analytics/details/gmv?range_key=30d", headers=admin_headers, timeout=30)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["metric"] == "gmv"
        assert "by_category" in d and isinstance(d["by_category"], list)
        assert "items" in d
        for c in d["by_category"]:
            assert set(c.keys()) >= {"category", "count", "gross", "commission", "payout"}

    def test_commission_and_payouts(self, admin_headers):
        for m in ("commission", "payouts"):
            r = requests.get(f"{API}/admin/analytics/details/{m}?range_key=30d", headers=admin_headers, timeout=30)
            assert r.status_code == 200, f"{m} failed: {r.text}"
            d = r.json()
            assert d["metric"] == m
            assert "by_category" in d

    def test_top_paths(self, admin_headers):
        r = requests.get(f"{API}/admin/analytics/details/top_paths?range_key=30d", headers=admin_headers, timeout=30)
        assert r.status_code == 200
        d = r.json()
        assert d["metric"] == "top_paths"
        for p in d["items"]:
            assert "path" in p and "count" in p and "visitors" in p

    def test_top_providers(self, admin_headers):
        r = requests.get(f"{API}/admin/analytics/details/top_providers?range_key=30d", headers=admin_headers, timeout=30)
        assert r.status_code == 200
        d = r.json()
        assert d["metric"] == "top_providers"
        for p in d["items"]:
            assert set(p.keys()) >= {"provider_id", "payouts", "jobs", "commission", "gmv"}

    def test_invalid_metric_returns_404(self, admin_headers):
        r = requests.get(f"{API}/admin/analytics/details/THIS_IS_NOT_REAL?range_key=24h",
                         headers=admin_headers, timeout=30)
        assert r.status_code == 404
        body = r.json()
        # FastAPI HTTPException puts the message under 'detail'
        msg = (body.get("detail") or body.get("message") or "").lower()
        assert "unknown" in msg or "metric" in msg


# ── 3. Auth gating ─────────────────────────────────────────────────────────
class TestAuthGating:
    def test_details_no_token_returns_401(self):
        r = requests.get(f"{API}/admin/analytics/details/visitors?range_key=24h", timeout=30)
        assert r.status_code in (401, 403), f"expected 401/403, got {r.status_code}"

    def test_details_non_admin_returns_403(self, customer_headers):
        r = requests.get(f"{API}/admin/analytics/details/visitors?range_key=24h",
                         headers=customer_headers, timeout=30)
        assert r.status_code == 403, f"customer should not access admin details, got {r.status_code}"

    def test_reset_non_admin_returns_403(self, customer_headers):
        r = requests.post(f"{API}/admin/analytics/reset", headers=customer_headers, timeout=30)
        assert r.status_code == 403


# ── 4. Regression: existing admin endpoints still work ─────────────────────
class TestRegression:
    def test_overview_still_works(self, admin_headers):
        r = requests.get(f"{API}/admin/analytics/overview", headers=admin_headers, timeout=30)
        assert r.status_code == 200

    def test_signups_list_still_works(self, admin_headers):
        r = requests.get(f"{API}/admin/analytics/signups", headers=admin_headers, timeout=30)
        assert r.status_code == 200
        d = r.json()
        for u in d["items"]:
            assert "password_hash" not in u

    def test_orders_list_still_works(self, admin_headers):
        r = requests.get(f"{API}/admin/analytics/orders", headers=admin_headers, timeout=30)
        assert r.status_code == 200

    def test_providers_list_still_works(self, admin_headers):
        r = requests.get(f"{API}/admin/analytics/providers", headers=admin_headers, timeout=30)
        assert r.status_code == 200

    def test_revenue_still_works(self, admin_headers):
        r = requests.get(f"{API}/admin/analytics/revenue", headers=admin_headers, timeout=30)
        assert r.status_code == 200

    def test_provider_login_regression(self):
        t = _login("provider@lumo.test", "password123")
        assert t and isinstance(t, str)

    def test_customer_login_regression(self):
        t = _login("customer@lumo.test", "password123")
        assert t and isinstance(t, str)

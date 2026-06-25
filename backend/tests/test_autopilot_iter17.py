"""
Iteration-17 backend tests:
1) Delivery-coverage GET /api/delivery/coverage
2) Cart-checkout coverage-gating (409 with code:no_delivery_coverage)
3) Auto-pilot admin endpoints (settings, log, run-now)
4) Regression for /api/admin/distribution/broadcast + /schedule-once
"""
import os
import time
from datetime import datetime, timedelta, timezone

import pytest
import requests

def _read_frontend_env():
    try:
        with open("/app/frontend/.env") as f:
            for line in f:
                if line.startswith("REACT_APP_BACKEND_URL="):
                    return line.split("=", 1)[1].strip()
    except Exception:
        pass
    return ""

BASE_URL = (os.environ.get("REACT_APP_BACKEND_URL") or _read_frontend_env()).rstrip("/")
assert BASE_URL, "REACT_APP_BACKEND_URL must be set"

ADMIN_EMAIL = "admin@lumo.test"
CUSTOMER_EMAIL = "customer@lumo.test"
PWD = "password123"


# ── shared helpers ───────────────────────────────────────────────────────────
def _login(email):
    r = requests.post(f"{BASE_URL}/api/auth/login", json={"email": email, "password": PWD}, timeout=30)
    assert r.status_code == 200, f"login {email}: {r.status_code} {r.text}"
    return r.json()["token"]


@pytest.fixture(scope="session")
def admin_token():
    return _login(ADMIN_EMAIL)


@pytest.fixture(scope="session")
def customer_token():
    return _login(CUSTOMER_EMAIL)


@pytest.fixture(scope="session")
def admin_h(admin_token):
    return {"Authorization": f"Bearer {admin_token}"}


@pytest.fixture(scope="session")
def cust_h(customer_token):
    return {"Authorization": f"Bearer {customer_token}"}


# ── 1) Delivery coverage ─────────────────────────────────────────────────────
class TestDeliveryCoverage:
    def test_coverage_middle_of_nowhere(self):
        r = requests.get(f"{BASE_URL}/api/delivery/coverage", params={"lat": 0, "lng": 0}, timeout=30)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["covered"] is False
        assert d["providers_in_range"] == 0
        # nearest_miles may be None if no providers at all, else big number
        if d.get("nearest_miles") is not None:
            assert d["nearest_miles"] > 500, f"nearest_miles should be huge: {d['nearest_miles']}"

    def test_coverage_nyc(self):
        r = requests.get(f"{BASE_URL}/api/delivery/coverage", params={"lat": 40.75, "lng": -73.99}, timeout=30)
        assert r.status_code == 200, r.text
        d = r.json()
        # Seed providers exist in NYC. Soft-check: at minimum returns proper shape.
        assert "covered" in d and "providers_in_range" in d and "nearest_miles" in d
        # If seeded properly we expect coverage
        if d["providers_in_range"] >= 1:
            assert d["covered"] is True
            assert d["nearest_miles"] is not None and d["nearest_miles"] < 50


# ── 2) Cart-checkout coverage gating ─────────────────────────────────────────
def _seed_cart_item(cust_h):
    """Add at least one inventory item to the customer's cart. Returns store_id."""
    # Find any inventory item
    r = requests.get(f"{BASE_URL}/api/inventory", timeout=30)
    if r.status_code != 200:
        # Try /api/inventory/list or alternate
        r = requests.get(f"{BASE_URL}/api/stores", timeout=30)
    items = []
    if r.status_code == 200:
        data = r.json()
        if isinstance(data, list):
            items = data
        elif isinstance(data, dict):
            items = data.get("items", []) or data.get("inventory", [])
    if not items:
        # Fall back to fetching all inventory via store list
        s = requests.get(f"{BASE_URL}/api/stores", timeout=30)
        if s.status_code == 200:
            stores = s.json() if isinstance(s.json(), list) else s.json().get("items", [])
            for st in stores[:5]:
                inv = requests.get(f"{BASE_URL}/api/inventory?store_id={st.get('id')}", timeout=30)
                if inv.status_code == 200:
                    d = inv.json()
                    inv_items = d if isinstance(d, list) else d.get("items", [])
                    if inv_items:
                        items = inv_items
                        break
    assert items, "Could not find any inventory item to seed cart"
    it = items[0]
    inv_id = it.get("id") or it.get("inventory_item_id")
    store_id = it.get("store_id") or it.get("owner_id") or it.get("user_id")
    assert inv_id and store_id, f"Inventory missing id/store_id: {it}"
    r = requests.post(f"{BASE_URL}/api/cart/add", json={"inventory_item_id": inv_id, "quantity": 1}, headers=cust_h, timeout=30)
    assert r.status_code in (200, 201), f"cart/add: {r.status_code} {r.text}"
    return store_id


class TestCartCoverageGating:
    def test_checkout_blocked_when_uncovered(self, cust_h):
        store_id = _seed_cart_item(cust_h)
        payload = {
            "store_id": store_id,
            "delivery_address": {"address": "somewhere", "lat": 0, "lng": 0},
            "delivery_fee": 5.0,
            "origin_url": BASE_URL,
        }
        r = requests.post(f"{BASE_URL}/api/cart/checkout", json=payload, headers=cust_h, timeout=30)
        assert r.status_code == 409, f"expected 409, got {r.status_code}: {r.text}"
        body = r.json()
        # FastAPI wraps {dict} into {"detail": {...}}
        detail = body.get("detail") if isinstance(body.get("detail"), dict) else body
        assert detail.get("code") == "no_delivery_coverage", f"detail: {detail}"
        assert detail.get("message"), "Friendly message required"

    def test_checkout_passes_coverage_for_nyc(self, cust_h):
        store_id = _seed_cart_item(cust_h)
        payload = {
            "store_id": store_id,
            "delivery_address": {"address": "NYC", "lat": 40.75, "lng": -73.99},
            "delivery_fee": 5.0,
            "origin_url": BASE_URL,
        }
        r = requests.post(f"{BASE_URL}/api/cart/checkout", json=payload, headers=cust_h, timeout=30)
        # MUST NOT be 409 with no_delivery_coverage. May be 400 (other reason) or 200/3xx.
        if r.status_code == 409:
            body = r.json()
            detail = body.get("detail") if isinstance(body.get("detail"), dict) else body
            assert detail.get("code") != "no_delivery_coverage", f"NYC should be covered: {body}"
        # else any other status is fine — coverage gate passed.


# ── 3) Auto-pilot admin endpoints ────────────────────────────────────────────
class TestAutopilot:
    def test_get_settings_defaults(self, admin_h):
        r = requests.get(f"{BASE_URL}/api/admin/autopilot/settings", headers=admin_h, timeout=30)
        assert r.status_code == 200, r.text
        d = r.json()
        assert "enabled" in d and "daily_time_utc" in d and "shuffle" in d and "cursor" in d
        assert isinstance(d["enabled"], bool)
        assert isinstance(d["shuffle"], bool)
        assert isinstance(d["cursor"], int)

    def test_patch_settings(self, admin_h):
        body = {"enabled": True, "daily_time_utc": "09:30", "shuffle": False}
        r = requests.patch(f"{BASE_URL}/api/admin/autopilot/settings", json=body, headers=admin_h, timeout=30)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["enabled"] is True
        assert d["daily_time_utc"] == "09:30"
        assert d["shuffle"] is False
        # Restore to safe default (disabled) for cleanup
        requests.patch(f"{BASE_URL}/api/admin/autopilot/settings",
                       json={"enabled": False, "daily_time_utc": "14:00", "shuffle": True},
                       headers=admin_h, timeout=30)

    def test_settings_requires_admin(self, cust_h):
        r = requests.get(f"{BASE_URL}/api/admin/autopilot/settings", headers=cust_h, timeout=30)
        assert r.status_code == 403, f"non-admin should be 403, got {r.status_code}"
        r2 = requests.patch(f"{BASE_URL}/api/admin/autopilot/settings", json={"enabled": True}, headers=cust_h, timeout=30)
        assert r2.status_code == 403

    def test_log_initial_shape(self, admin_h):
        r = requests.get(f"{BASE_URL}/api/admin/autopilot/log", headers=admin_h, timeout=30)
        assert r.status_code == 200
        d = r.json()
        assert "items" in d and isinstance(d["items"], list)

    def test_run_now_with_connector(self, admin_h):
        # Ensure at least one ad exists
        r = requests.get(f"{BASE_URL}/api/admin/ads", headers=admin_h, timeout=30)
        ads_present = False
        if r.status_code == 200:
            j = r.json()
            ads_present = (len(j) > 0) if isinstance(j, list) else (len(j.get("items", [])) > 0)
        if not ads_present:
            pytest.skip("No ads in library — cannot test run-now")

        # Need at least one enabled connector
        rc = requests.get(f"{BASE_URL}/api/admin/distribution/connectors", headers=admin_h, timeout=30)
        assert rc.status_code == 200
        cdata = rc.json()
        connectors = cdata if isinstance(cdata, list) else cdata.get("items", [])
        enabled = [c for c in connectors if c.get("enabled")]
        created_test_connector = None
        if not enabled:
            # Create a httpbin webhook test connector
            payload = {"platform": "webhook", "name": "TEST_autopilot_webhook",
                       "config": {"url": "https://httpbin.org/post"}, "enabled": True}
            cr = requests.post(f"{BASE_URL}/api/admin/distribution/connectors", json=payload, headers=admin_h, timeout=30)
            assert cr.status_code in (200, 201), f"create connector: {cr.status_code} {cr.text}"
            created_test_connector = cr.json().get("id")

        # Capture cursor before, set shuffle=false to verify cursor advance
        requests.patch(f"{BASE_URL}/api/admin/autopilot/settings",
                       json={"shuffle": False}, headers=admin_h, timeout=30)
        s_before = requests.get(f"{BASE_URL}/api/admin/autopilot/settings", headers=admin_h, timeout=30).json()
        cur_before = s_before.get("cursor", 0)

        log_before = requests.get(f"{BASE_URL}/api/admin/autopilot/log", headers=admin_h, timeout=30).json()
        n_before = len(log_before.get("items", []))

        # Run now
        rn = requests.post(f"{BASE_URL}/api/admin/autopilot/run-now", headers=admin_h, timeout=60)
        assert rn.status_code == 200, f"run-now: {rn.status_code} {rn.text}"
        d = rn.json()
        assert "ad_id" in d and "headline" in d and "summary" in d
        assert d["summary"].get("ok", 0) >= 1, f"expected ok>=1, got {d['summary']}"

        # Log row appended
        log_after = requests.get(f"{BASE_URL}/api/admin/autopilot/log", headers=admin_h, timeout=30).json()
        assert len(log_after.get("items", [])) == n_before + 1

        # Cursor advanced (shuffle=false)
        s_after = requests.get(f"{BASE_URL}/api/admin/autopilot/settings", headers=admin_h, timeout=30).json()
        # cursor wraps mod len(ads). Either advanced by 1 or wrapped.
        assert s_after.get("cursor") != cur_before or s_after.get("cursor") == 0

        # Cleanup test connector if we created one
        if created_test_connector:
            requests.delete(f"{BASE_URL}/api/admin/distribution/connectors/{created_test_connector}",
                            headers=admin_h, timeout=30)
        # Restore shuffle
        requests.patch(f"{BASE_URL}/api/admin/autopilot/settings",
                       json={"shuffle": True}, headers=admin_h, timeout=30)

    def test_run_now_requires_admin(self, cust_h):
        r = requests.post(f"{BASE_URL}/api/admin/autopilot/run-now", headers=cust_h, timeout=30)
        assert r.status_code == 403


# ── 4) Regression: distribution broadcast + schedule-once ────────────────────
class TestDistributionRegression:
    def test_broadcast_still_works(self, admin_h):
        # Need an enabled connector + an ad
        rc = requests.get(f"{BASE_URL}/api/admin/distribution/connectors", headers=admin_h, timeout=30)
        cdata = rc.json()
        connectors = cdata if isinstance(cdata, list) else cdata.get("items", [])
        enabled = [c for c in connectors if c.get("enabled")]
        cid = None
        created = None
        if enabled:
            cid = enabled[0]["id"]
        else:
            payload = {"platform": "webhook", "name": "TEST_regress_webhook",
                       "config": {"url": "https://httpbin.org/post"}, "enabled": True}
            cr = requests.post(f"{BASE_URL}/api/admin/distribution/connectors", json=payload, headers=admin_h, timeout=30)
            assert cr.status_code in (200, 201)
            created = cr.json()["id"]
            cid = created

        # Find one ad
        ra = requests.get(f"{BASE_URL}/api/admin/ads", headers=admin_h, timeout=30)
        ads = ra.json() if isinstance(ra.json(), list) else ra.json().get("items", [])
        if not ads:
            pytest.skip("No ads")
        ad_id = ads[0]["id"]

        rb = requests.post(f"{BASE_URL}/api/admin/distribution/broadcast",
                           json={"ad_id": ad_id, "connector_ids": [cid]}, headers=admin_h, timeout=60)
        assert rb.status_code == 200, f"broadcast: {rb.status_code} {rb.text}"
        s = rb.json().get("summary", {})
        assert (s.get("ok", 0) + s.get("failed", 0)) >= 1

        if created:
            requests.delete(f"{BASE_URL}/api/admin/distribution/connectors/{created}", headers=admin_h, timeout=30)

    def test_schedule_once_still_works(self, admin_h):
        ra = requests.get(f"{BASE_URL}/api/admin/ads", headers=admin_h, timeout=30)
        ads = ra.json() if isinstance(ra.json(), list) else ra.json().get("items", [])
        if not ads:
            pytest.skip("No ads")
        ad_id = ads[0]["id"]
        run_at = (datetime.now(timezone.utc) + timedelta(hours=2)).isoformat().replace("+00:00", "Z")
        r = requests.post(f"{BASE_URL}/api/admin/distribution/schedule-once",
                          json={"ad_id": ad_id, "run_at": run_at}, headers=admin_h, timeout=30)
        assert r.status_code == 200, f"schedule-once: {r.status_code} {r.text}"
        d = r.json()
        # one_shot=true and enabled=true expected
        assert d.get("one_shot") is True
        assert d.get("enabled") is True
        # Cleanup the schedule we created
        sid = d.get("id")
        if sid:
            requests.delete(f"{BASE_URL}/api/admin/distribution/schedules/{sid}", headers=admin_h, timeout=30)

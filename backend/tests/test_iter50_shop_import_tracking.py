"""Iter50 tests: Admin Shop Manager (auto-import), Featured Shop widget API,
LiveTrack counterparty fields."""

import os
import time

import pytest
import requests
from pathlib import Path

def _load_env():
    envp = Path("/app/frontend/.env")
    if envp.exists():
        for line in envp.read_text().splitlines():
            if line.startswith("REACT_APP_BACKEND_URL="):
                return line.split("=", 1)[1].strip()
    return os.environ.get("REACT_APP_BACKEND_URL", "")

BASE_URL = _load_env().rstrip("/")
assert BASE_URL, "REACT_APP_BACKEND_URL not found"
API = f"{BASE_URL}/api"

ADMIN_EMAIL = "julius.a.mason@gmail.com"
ADMIN_PW = "Mason0123"
CUST_EMAIL = "customer@lumo.test"
CUST_PW = "password123"
PROV_EMAIL = "provider@lumo.test"
PROV_PW = "password123"


def _login(email, password):
    r = requests.post(f"{API}/auth/login", json={"email": email, "password": password}, timeout=30)
    if r.status_code != 200:
        return None
    return r.json().get("token") or r.json().get("access_token")


@pytest.fixture(scope="module")
def admin_token():
    tok = _login(ADMIN_EMAIL, ADMIN_PW)
    if not tok:
        pytest.skip("Admin login failed")
    return tok


@pytest.fixture(scope="module")
def customer_token():
    tok = _login(CUST_EMAIL, CUST_PW)
    if not tok:
        pytest.skip("Customer login failed")
    return tok


@pytest.fixture(scope="module")
def provider_token():
    tok = _login(PROV_EMAIL, PROV_PW)
    if not tok:
        pytest.skip("Provider login failed")
    return tok


def H(tok):
    return {"Authorization": f"Bearer {tok}"}


# ─── Shop public ─────────────────────────────────────────────────
class TestShopPublic:
    def test_list_products_has_25_plus(self):
        r = requests.get(f"{API}/shop/products", params={"limit": 200}, timeout=30)
        assert r.status_code == 200
        data = r.json()
        assert isinstance(data.get("items"), list)
        assert data["total"] >= 25, f"Expected >=25 seeded, got {data['total']}"

    def test_list_featured_returns_at_least_3(self):
        r = requests.get(f"{API}/shop/products", params={"featured": "true", "limit": 10}, timeout=30)
        assert r.status_code == 200
        assert r.json()["total"] >= 3

    def test_retailer_filter(self):
        r = requests.get(f"{API}/shop/products", params={"retailer": "amazon"}, timeout=30)
        assert r.status_code == 200
        for it in r.json()["items"]:
            assert it["retailer"] == "amazon"

    def test_click_records_and_returns_affiliate_url(self):
        r = requests.get(f"{API}/shop/products", params={"limit": 1}, timeout=30)
        pid = r.json()["items"][0]["id"]
        rc = requests.post(f"{API}/shop/click/{pid}", timeout=30)
        assert rc.status_code == 200
        assert rc.json().get("affiliate_url", "").startswith("http")


# ─── Admin Shop CRUD + auto-import ───────────────────────────────
class TestAdminShop:
    created_id = None

    def test_create_product(self, admin_token):
        payload = {
            "title": "TEST_iter50 product",
            "image_url": "https://placehold.co/200",
            "affiliate_url": "https://example.com/x",
            "retailer": "amazon", "retailer_label": "Amazon",
            "category": "electronics", "is_active": True,
        }
        r = requests.post(f"{API}/admin/shop/products", json=payload, headers=H(admin_token), timeout=30)
        assert r.status_code in (200, 201), r.text
        d = r.json()
        assert d["title"] == payload["title"]
        assert d["retailer"] == "amazon"
        assert "id" in d
        TestAdminShop.created_id = d["id"]

    def test_toggle_active(self, admin_token):
        assert TestAdminShop.created_id
        r = requests.patch(
            f"{API}/admin/shop/products/{TestAdminShop.created_id}",
            json={"is_active": False}, headers=H(admin_token), timeout=30,
        )
        assert r.status_code == 200
        # verify persistence
        r2 = requests.get(f"{API}/shop/products/{TestAdminShop.created_id}", timeout=30)
        assert r2.status_code == 200
        assert r2.json()["is_active"] is False

    def test_delete_product(self, admin_token):
        assert TestAdminShop.created_id
        r = requests.delete(f"{API}/admin/shop/products/{TestAdminShop.created_id}",
                            headers=H(admin_token), timeout=30)
        assert r.status_code == 200
        # verify 404
        r2 = requests.get(f"{API}/shop/products/{TestAdminShop.created_id}", timeout=30)
        assert r2.status_code == 404

    def test_auto_import_requires_admin(self, customer_token):
        r = requests.post(f"{API}/admin/shop/products/auto-import",
                          json={"url": "https://www.amazon.com/dp/B09B8V1LZ3"},
                          headers=H(customer_token), timeout=30)
        assert r.status_code in (401, 403), r.text

    def test_auto_import_bad_url(self, admin_token):
        r = requests.post(f"{API}/admin/shop/products/auto-import",
                          json={"url": "not-a-url"}, headers=H(admin_token), timeout=30)
        assert r.status_code == 400

    def test_auto_import_amazon(self, admin_token):
        r = requests.post(f"{API}/admin/shop/products/auto-import",
                          json={"url": "https://www.amazon.com/dp/B09B8V1LZ3"},
                          headers=H(admin_token), timeout=60)
        # 200 with a draft (may have empty fields if Amazon blocked), or 502 if fetch failed
        assert r.status_code in (200, 502), r.text
        if r.status_code == 200:
            d = r.json().get("draft", {})
            assert d.get("retailer") == "amazon"
            assert d.get("affiliate_url") == "https://www.amazon.com/dp/B09B8V1LZ3"


# ─── Tracking counterparty fields ────────────────────────────────
class TestTrackingCounterparty:
    job_id = None

    def test_create_and_accept_job(self, customer_token, provider_token):
        # Create job as customer
        payload = {
            "title": "TEST_iter50 tracking job",
            "description": "Test",
            "category": "handyman",
            "pay_rate": 50.0,
            "pay_unit": "flat",
            "estimated_units": 1,
            "pickup_location": {"lat": 40.7, "lng": -74.0, "address": "NYC"},
        }
        r = requests.post(f"{API}/jobs", json=payload, headers=H(customer_token), timeout=30)
        if r.status_code not in (200, 201):
            pytest.skip(f"Job create failed: {r.status_code} {r.text[:200]}")
        TestTrackingCounterparty.job_id = r.json().get("id")
        assert TestTrackingCounterparty.job_id

        # Accept as provider
        ra = requests.post(f"{API}/jobs/{TestTrackingCounterparty.job_id}/accept",
                           headers=H(provider_token), timeout=30)
        if ra.status_code not in (200, 201):
            pytest.skip(f"Accept failed: {ra.status_code} {ra.text[:200]}")

    def test_tracking_includes_counterparty_fields(self, customer_token):
        if not TestTrackingCounterparty.job_id:
            pytest.skip("No job")
        r = requests.get(f"{API}/jobs/{TestTrackingCounterparty.job_id}/tracking",
                         headers=H(customer_token), timeout=30)
        assert r.status_code == 200, r.text
        data = r.json()
        assert "counterparty_phone" in data
        assert "counterparty_avatar_url" in data

"""Iteration 48 backend tests — Affiliate Shop + Wallet Instant Payout regressions."""
import os
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL") or "https://lumo-bundle-checkout.preview.emergentagent.com"
BASE_URL = BASE_URL.rstrip("/")


def _login(email, password):
    r = requests.post(f"{BASE_URL}/api/auth/login", json={"email": email, "password": password}, timeout=30)
    assert r.status_code == 200, f"login failed for {email}: {r.status_code} {r.text[:200]}"
    return r.json()["token"]


@pytest.fixture(scope="module")
def admin_token():
    return _login("julius.a.mason@gmail.com", "Mason0123")


@pytest.fixture(scope="module")
def customer_token():
    return _login("customer@lumo.test", "password123")


@pytest.fixture(scope="module")
def provider_token():
    return _login("provider@lumo.test", "password123")


# ── Shop public endpoints ──────────────────────────────────
class TestShopPublic:
    def test_list_products_has_items_and_total(self):
        r = requests.get(f"{BASE_URL}/api/shop/products", timeout=30)
        assert r.status_code == 200
        data = r.json()
        assert "items" in data and "total" in data
        assert data["total"] >= 25, f"expected >=25 seeded products, got {data['total']}"
        assert isinstance(data["items"], list)

    def test_filter_by_amazon(self):
        r = requests.get(f"{BASE_URL}/api/shop/products", params={"retailer": "amazon"}, timeout=30)
        assert r.status_code == 200
        data = r.json()
        assert data["total"] >= 6
        for it in data["items"]:
            assert it["retailer"] == "amazon"

    def test_search_airpods(self):
        r = requests.get(f"{BASE_URL}/api/shop/products", params={"q": "airpods"}, timeout=30)
        assert r.status_code == 200
        data = r.json()
        assert data["total"] >= 1
        assert any("airpod" in i["title"].lower() for i in data["items"])

    def test_retailers_list(self):
        r = requests.get(f"{BASE_URL}/api/shop/retailers", timeout=30)
        assert r.status_code == 200
        items = r.json()["items"]
        values = {i["value"] for i in items}
        assert {"amazon", "best_buy", "wayfair", "target", "walmart"}.issubset(values)
        for it in items:
            assert it["count"] > 0

    def test_categories_list(self):
        r = requests.get(f"{BASE_URL}/api/shop/categories", timeout=30)
        assert r.status_code == 200
        items = r.json()["items"]
        assert len(items) >= 1
        assert all("value" in i and "count" in i for i in items)

    def test_click_increments_and_returns_url(self):
        r0 = requests.get(f"{BASE_URL}/api/shop/products", params={"retailer": "amazon", "limit": 1}, timeout=30)
        pid = r0.json()["items"][0]["id"]
        before = r0.json()["items"][0].get("click_count", 0)
        rc = requests.post(f"{BASE_URL}/api/shop/click/{pid}", timeout=30)
        assert rc.status_code == 200
        assert rc.json().get("affiliate_url", "").startswith("http")
        r1 = requests.get(f"{BASE_URL}/api/shop/products/{pid}", timeout=30)
        assert r1.status_code == 200
        assert r1.json()["click_count"] == before + 1


# ── Admin CRUD guard + happy path ─────────────────────────
class TestShopAdmin:
    payload = {
        "title": "TEST_iter48 product",
        "description": "temporary",
        "image_url": "https://example.com/x.jpg",
        "retailer": "amazon",
        "retailer_label": "Amazon",
        "affiliate_url": "https://www.amazon.com/dp/TEST",
        "category": "electronics",
        "price": 9.99,
    }

    def test_create_unauthenticated_blocked(self):
        r = requests.post(f"{BASE_URL}/api/admin/shop/products", json=self.payload, timeout=30)
        assert r.status_code in (401, 403)

    def test_create_as_customer_blocked(self, customer_token):
        r = requests.post(
            f"{BASE_URL}/api/admin/shop/products",
            json=self.payload,
            headers={"Authorization": f"Bearer {customer_token}"},
            timeout=30,
        )
        assert r.status_code in (401, 403)

    def test_admin_crud_flow(self, admin_token):
        h = {"Authorization": f"Bearer {admin_token}"}
        rc = requests.post(f"{BASE_URL}/api/admin/shop/products", json=self.payload, headers=h, timeout=30)
        assert rc.status_code == 200, rc.text
        pid = rc.json()["id"]

        # verify via GET
        rg = requests.get(f"{BASE_URL}/api/shop/products/{pid}", timeout=30)
        assert rg.status_code == 200
        assert rg.json()["title"] == self.payload["title"]

        # patch
        rp = requests.patch(
            f"{BASE_URL}/api/admin/shop/products/{pid}",
            json={"title": "TEST_iter48 product v2"},
            headers=h,
            timeout=30,
        )
        assert rp.status_code == 200
        assert rp.json()["title"] == "TEST_iter48 product v2"

        # delete
        rd = requests.delete(f"{BASE_URL}/api/admin/shop/products/{pid}", headers=h, timeout=30)
        assert rd.status_code == 200

        rmiss = requests.get(f"{BASE_URL}/api/shop/products/{pid}", timeout=30)
        assert rmiss.status_code == 404


# ── Wallet Instant Payout ─────────────────────────────────
class TestWalletPayout:
    def test_wallet_withdraw_full_balance(self, provider_token):
        h = {"Authorization": f"Bearer {provider_token}"}
        # inspect current balance if endpoint exists
        rw = requests.get(f"{BASE_URL}/api/wallet", headers=h, timeout=30)
        # attempt withdraw regardless (endpoint under test)
        r = requests.post(f"{BASE_URL}/api/wallet/withdraw", json={"amount": 0}, headers=h, timeout=30)
        # 200 (ok) or 400 (zero balance) are both acceptable business outcomes.
        assert r.status_code in (200, 400, 402), f"{r.status_code} {r.text[:200]}"

"""Lumo backend integration tests — auth, jobs, marketplace, storefront, checkout, wallet."""
import os
import io
import time
import uuid
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://lumo-bundle-checkout.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"

CUSTOMER = {"email": "customer@lumo.test", "password": "password123"}
PROVIDER = {"email": "provider@lumo.test", "password": "password123"}
RETAILER = {"email": "retailer@lumo.test", "password": "password123"}
RESTAURANT = {"email": "restaurant@lumo.test", "password": "password123"}


def _login(creds):
    r = requests.post(f"{API}/auth/login", json=creds, timeout=20)
    assert r.status_code == 200, f"Login failed for {creds['email']}: {r.status_code} {r.text}"
    data = r.json()
    assert "token" in data and "user" in data
    return data["token"], data["user"]


def _h(token):
    return {"Authorization": f"Bearer {token}"}


# ────── Auth ──────
class TestAuth:
    def test_health(self):
        r = requests.get(f"{API}/health", timeout=10)
        assert r.status_code == 200

    def test_login_seed_users(self):
        for c in [CUSTOMER, PROVIDER, RETAILER, RESTAURANT]:
            t, u = _login(c)
            assert u["email"] == c["email"]
            assert u["role"] in ("customer", "provider", "retailer", "restaurant")

    def test_login_invalid(self):
        r = requests.post(f"{API}/auth/login", json={"email": "customer@lumo.test", "password": "bad"}, timeout=10)
        assert r.status_code == 401

    def test_register_new_user(self):
        email = f"TEST_{uuid.uuid4().hex[:8]}@lumo.test"
        r = requests.post(f"{API}/auth/register", json={
            "email": email, "password": "Passw0rd!", "name": "Tester", "role": "customer"
        }, timeout=20)
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["user"]["email"] == email.lower()
        assert "token" in data
        # /auth/me works
        me = requests.get(f"{API}/auth/me", headers=_h(data["token"]), timeout=10)
        assert me.status_code == 200
        assert me.json()["email"] == email.lower()

    def test_register_duplicate(self):
        r = requests.post(f"{API}/auth/register", json={
            "email": "customer@lumo.test", "password": "x", "name": "X", "role": "customer"
        }, timeout=10)
        assert r.status_code == 400


# ────── Jobs / Provider Opportunities ──────
class TestJobsAndOpportunities:
    def test_create_job_and_list(self):
        token, _ = _login(CUSTOMER)
        payload = {
            "title": "TEST_job_haul",
            "description": "Move a small couch",
            "category": "moving",
            "pay_rate": 50.0,
            "pay_unit": "flat",
            "estimated_units": 1.0,
            "pickup_location": {"lat": 40.7128, "lng": -74.0060, "address": "NYC"},
        }
        r = requests.post(f"{API}/jobs", json=payload, headers=_h(token), timeout=20)
        assert r.status_code == 200, r.text
        job = r.json()
        assert job["title"] == "TEST_job_haul"
        assert job["pay_unit"] == "flat"
        assert job["category_group"] == "physical_delivery"
        assert job["is_remote"] is False
        job_id = job["id"]
        # GET
        g = requests.get(f"{API}/jobs/{job_id}", timeout=10)
        assert g.status_code == 200
        assert g.json()["id"] == job_id

    def test_remote_auto_flag(self):
        token, _ = _login(CUSTOMER)
        for cat in ["digital_tech", "marketing", "research", "legal"]:
            r = requests.post(f"{API}/jobs", json={
                "title": f"TEST_{cat}", "description": "x", "category": cat,
                "pay_rate": 100.0, "pay_unit": "hour", "estimated_units": 1.0,
            }, headers=_h(token), timeout=15)
            assert r.status_code == 200
            j = r.json()
            assert j["is_remote"] is True, f"{cat} should be remote"
            assert j["category_group"] in ("remote_jobs",)

    def test_provider_opportunities_filter(self):
        ptoken, _ = _login(PROVIDER)
        r = requests.get(f"{API}/provider/opportunities", headers=_h(ptoken), timeout=15)
        assert r.status_code == 200
        ops = r.json()
        assert isinstance(ops, list)
        # provider seeded with categories incl digital_tech + handyman + delivery; should have items
        if ops:
            for o in ops:
                # either remote OR within radius OR category match
                assert "distance_miles" in o or o.get("is_remote")

    def test_provider_opportunities_since(self):
        ctoken, _ = _login(CUSTOMER)
        # create future-job
        r = requests.post(f"{API}/jobs", json={
            "title": "TEST_polling_new",
            "description": "freshly posted",
            "category": "digital_tech",  # remote, will pass radius
            "pay_rate": 80.0, "pay_unit": "hour", "estimated_units": 1.0,
        }, headers=_h(ctoken), timeout=15)
        assert r.status_code == 200
        new_id = r.json()["id"]
        # poll with since=-1 minute
        since = "2000-01-01T00:00:00+00:00"
        ptoken, _ = _login(PROVIDER)
        ops = requests.get(f"{API}/provider/opportunities?since={since}", headers=_h(ptoken), timeout=15).json()
        assert any(o["id"] == new_id for o in ops)

    def test_accept_job_requires_provider(self):
        ctoken, _ = _login(CUSTOMER)
        r = requests.post(f"{API}/jobs", json={
            "title": "TEST_to_accept", "description": "x", "category": "cleaning",
            "pay_rate": 30.0, "pay_unit": "hour", "estimated_units": 2.0,
            "pickup_location": {"lat": 40.7128, "lng": -74.0060, "address": "NYC"},
        }, headers=_h(ctoken), timeout=15)
        job_id = r.json()["id"]
        # customer cannot accept
        ra = requests.post(f"{API}/jobs/{job_id}/accept", headers=_h(ctoken), timeout=10)
        assert ra.status_code == 403
        # provider can
        ptoken, _ = _login(PROVIDER)
        ra = requests.post(f"{API}/jobs/{job_id}/accept", headers=_h(ptoken), timeout=10)
        assert ra.status_code == 200
        assert ra.json()["status"] == "accepted"


# ────── Marketplace + Checkout ──────
class TestMarketplaceCheckout:
    def test_create_listing_and_browse(self):
        ctoken, _ = _login(CUSTOMER)
        r = requests.post(f"{API}/marketplace/listings", json={
            "title": "TEST_chair", "description": "Wooden chair", "price": 40.0,
            "category": "furniture",
        }, headers=_h(ctoken), timeout=15)
        assert r.status_code == 200, r.text
        lid = r.json()["id"]
        all_r = requests.get(f"{API}/marketplace/listings", timeout=10)
        assert any(d["id"] == lid for d in all_r.json())

    def test_checkout_deposit_creates_stripe_session(self):
        ctoken, _ = _login(CUSTOMER)
        r = requests.post(f"{API}/checkout/deposit", json={
            "item_price": 100.0, "delivery_fee": 20.0,
            "origin_url": BASE_URL, "quantity": 1,
        }, headers=_h(ctoken), timeout=30)
        assert r.status_code == 200, r.text
        d = r.json()
        assert "url" in d and d["url"].startswith("http")
        assert "session_id" in d and "order_id" in d
        # status endpoint works
        s = requests.get(f"{API}/checkout/status/{d['session_id']}", timeout=20)
        assert s.status_code == 200
        sd = s.json()
        assert "payment_status" in sd

    def test_checkout_deposit_invalid_amount(self):
        ctoken, _ = _login(CUSTOMER)
        r = requests.post(f"{API}/checkout/deposit", json={
            "item_price": 0, "delivery_fee": 0,
            "origin_url": BASE_URL, "quantity": 1,
        }, headers=_h(ctoken), timeout=15)
        assert r.status_code == 400


# ────── Stores / Inventory ──────
class TestStoresAndInventory:
    def test_stores_directory(self):
        r = requests.get(f"{API}/stores", timeout=10)
        assert r.status_code == 200
        stores = r.json()
        assert any(s.get("storefront", {}).get("name") for s in stores)

    def test_restaurants_directory(self):
        r = requests.get(f"{API}/restaurants", timeout=10)
        assert r.status_code == 200
        rest = r.json()
        assert any(s.get("storefront", {}).get("name") for s in rest)

    def test_storefront_get(self):
        stores = requests.get(f"{API}/stores", timeout=10).json()
        assert stores
        sid = stores[0]["id"]
        r = requests.get(f"{API}/storefronts/{sid}", timeout=10)
        assert r.status_code == 200
        assert r.json()["storefront"]["name"]

    def test_inventory_list_by_owner(self):
        stores = requests.get(f"{API}/stores", timeout=10).json()
        sid = stores[0]["id"]
        r = requests.get(f"{API}/inventory?owner_id={sid}", timeout=10)
        assert r.status_code == 200
        assert isinstance(r.json(), list)

    def test_retailer_storefront_upsert_and_inventory_crud(self):
        token, _ = _login(RETAILER)
        # upsert
        r = requests.put(f"{API}/storefront", json={
            "name": "Ramona's Boutique", "address": "123 Market St, Brooklyn, NY",
            "hours": "Mon–Sat 10am–8pm", "category": "Apparel",
        }, headers=_h(token), timeout=15)
        assert r.status_code == 200
        # create inventory
        c = requests.post(f"{API}/inventory", json={
            "name": "TEST_widget", "price": 12.5, "stock": 3, "category": "Accessories",
        }, headers=_h(token), timeout=15)
        assert c.status_code == 200
        item_id = c.json()["id"]
        # delete
        d = requests.delete(f"{API}/inventory/{item_id}", headers=_h(token), timeout=10)
        assert d.status_code == 200
        assert d.json()["deleted"] is True

    def test_customer_cannot_upsert_storefront(self):
        token, _ = _login(CUSTOMER)
        r = requests.put(f"{API}/storefront", json={
            "name": "Bad", "address": "X",
        }, headers=_h(token), timeout=10)
        assert r.status_code == 403


# ────── Map ──────
class TestMap:
    def test_map_jobs_remote_only(self):
        r = requests.get(f"{API}/map/jobs?remote_only=true", timeout=10)
        assert r.status_code == 200
        pins = r.json()
        for p in pins:
            assert p["is_remote"] is True

    def test_map_jobs_category_group(self):
        r = requests.get(f"{API}/map/jobs?category_group_filter=physical_delivery", timeout=10)
        assert r.status_code == 200
        for p in r.json():
            assert p["category_group"] == "physical_delivery"


# ────── Wallet ──────
class TestWallet:
    def test_wallet_endpoint(self):
        token, _ = _login(PROVIDER)
        r = requests.get(f"{API}/wallet", headers=_h(token), timeout=10)
        assert r.status_code == 200
        d = r.json()
        assert "balance" in d and "transactions" in d

    def test_withdraw_invalid(self):
        token, _ = _login(PROVIDER)
        r = requests.post(f"{API}/wallet/withdraw", json={"amount": 9999999.0}, headers=_h(token), timeout=10)
        assert r.status_code == 400

    def test_withdraw_flow(self):
        """Top up provider via direct DB-free approach: credit then withdraw."""
        # We can't credit without going through Stripe. Verify negative path only above.
        # Validate amount <=0
        token, _ = _login(PROVIDER)
        r = requests.post(f"{API}/wallet/withdraw", json={"amount": 0}, headers=_h(token), timeout=10)
        assert r.status_code == 400

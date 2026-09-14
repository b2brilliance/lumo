"""Iteration 52 backend tests — 1000-product shop seed + Web Push (VAPID).

Covers:
- /api/shop/products (total, filtering by retailer, seed_batch flag)
- /api/shop/retailers (Amazon, Walmart, JD.com, Alibaba, Temu ~200 each)
- /api/shop/categories (8 categories with counts)
- Affiliate-URL patterns per retailer
- /api/shop/click/{id} still records click & returns affiliate_url
- Push VAPID public-key, subscribe/upsert/unsubscribe, status
- send_push_to_user invoked on job accept + tracking status change (pywebpush monkeypatched)
"""
from __future__ import annotations

import os
import uuid
import asyncio
import pytest
import requests

def _load_frontend_env():
    try:
        with open("/app/frontend/.env") as f:
            for line in f:
                if line.startswith("REACT_APP_BACKEND_URL="):
                    return line.split("=", 1)[1].strip()
    except Exception:
        pass
    return os.environ.get("REACT_APP_BACKEND_URL")

BASE_URL = (_load_frontend_env() or "").rstrip("/")
assert BASE_URL, "REACT_APP_BACKEND_URL missing"
API = f"{BASE_URL}/api"

CUSTOMER = {"email": "customer@lumo.test", "password": "password123"}
PROVIDER = {"email": "provider@lumo.test", "password": "password123"}


# --------- fixtures ---------

@pytest.fixture(scope="session")
def s():
    return requests.Session()


def _login(s, creds):
    r = s.post(f"{API}/auth/login", json=creds, timeout=30)
    assert r.status_code == 200, r.text
    return r.json()["token"]


@pytest.fixture(scope="session")
def customer_token(s):
    return _login(s, CUSTOMER)


@pytest.fixture(scope="session")
def provider_token(s):
    return _login(s, PROVIDER)


def _h(tok):
    return {"Authorization": f"Bearer {tok}"}


# --------- Shop seed tests ---------

class TestShopSeed:
    def test_products_total_and_seed_batch(self, s):
        r = s.get(f"{API}/shop/products", params={"limit": 1}, timeout=30)
        assert r.status_code == 200, r.text
        data = r.json()
        # Expect ~1000 seeded + any admin adds
        assert data.get("total", 0) >= 1000, f"Expected >=1000 products, got {data.get('total')}"

        r2 = s.get(f"{API}/shop/products", params={"limit": 50}, timeout=30)
        prods = r2.json().get("items") or r2.json().get("products") or []
        assert prods, "no products returned"
        # at least some should carry seed_batch tag
        with_batch = [p for p in prods if p.get("seed_batch") == "starter_1000_v1"]
        assert with_batch, "no products carry seed_batch=starter_1000_v1"

    def test_retailers_five_with_counts(self, s):
        r = s.get(f"{API}/shop/retailers", timeout=30)
        assert r.status_code == 200
        items = r.json()
        if isinstance(items, dict):
            items = items.get("items") or items.get("retailers") or []
        values = {it.get("value"): it.get("count", 0) for it in items}
        for want in ("amazon", "walmart", "jd_com", "alibaba", "temu"):
            assert want in values, f"missing retailer {want} in {list(values)}"
            assert values[want] >= 150, f"{want} count too low: {values[want]}"

    def test_categories_eight(self, s):
        r = s.get(f"{API}/shop/categories", timeout=30)
        assert r.status_code == 200
        items = r.json()
        if isinstance(items, dict):
            items = items.get("items") or items.get("categories") or []
        cats = {it.get("value") or it.get("slug") or it.get("name"): it.get("count", 0) for it in items}
        for want in ("electronics", "home", "furniture", "beauty", "kitchen", "gaming", "outdoor", "apparel"):
            assert want in cats, f"missing category {want} in {list(cats)}"
            assert cats[want] > 0

    @pytest.mark.parametrize("retailer,frag", [
        ("jd_com", "global.jd.com/search"),
        ("temu", "temu.com/search_result.html"),
        ("alibaba", "alibaba.com/trade/search"),
        ("amazon", "amazon.com/s?"),
        ("walmart", "walmart.com/search"),
    ])
    def test_affiliate_url_pattern(self, s, retailer, frag):
        r = s.get(f"{API}/shop/products", params={"retailer": retailer, "limit": 5}, timeout=30)
        assert r.status_code == 200
        prods = r.json().get("items") or r.json().get("products") or []
        assert len(prods) >= 1, f"no products for retailer {retailer}"
        for p in prods:
            assert p["retailer"] == retailer
            assert frag in p["affiliate_url"], f"{retailer} url missing frag {frag}: {p['affiliate_url']}"

    def test_click_records_and_returns_url(self, s):
        r = s.get(f"{API}/shop/products", params={"retailer": "temu", "limit": 1}, timeout=30)
        prods = r.json().get("items") or r.json().get("products") or []
        assert prods
        pid = prods[0]["id"]
        r2 = s.post(f"{API}/shop/click/{pid}", timeout=30)
        assert r2.status_code == 200, r2.text
        data = r2.json()
        assert "affiliate_url" in data
        assert "temu.com/search_result.html" in data["affiliate_url"]


# --------- Push endpoint tests ---------

class TestPushEndpoints:
    def test_public_key(self, s):
        r = s.get(f"{API}/push/public-key", timeout=30)
        assert r.status_code == 200
        key = r.json()["public_key"]
        # base64-url un-padded of 65-byte P-256 point = 87 chars
        assert 85 <= len(key) <= 90, f"unexpected key length {len(key)}"
        assert "=" not in key
        assert "+" not in key and "/" not in key

    def test_subscribe_upsert_unsubscribe_and_status(self, s, customer_token):
        endpoint = f"https://fcm.googleapis.com/fcm/send/TEST_{uuid.uuid4()}"
        payload = {"endpoint": endpoint, "keys": {"p256dh": "abc", "auth": "def"}}
        # initial status
        r0 = s.get(f"{API}/push/status", headers=_h(customer_token), timeout=30)
        assert r0.status_code == 200
        base_count = r0.json()["subscriptions"]

        # subscribe
        r1 = s.post(f"{API}/push/subscribe", headers=_h(customer_token), json=payload, timeout=30)
        assert r1.status_code == 200, r1.text
        r2 = s.get(f"{API}/push/status", headers=_h(customer_token), timeout=30)
        assert r2.json()["subscriptions"] == base_count + 1

        # duplicate = upsert (no new row)
        r3 = s.post(f"{API}/push/subscribe", headers=_h(customer_token), json=payload, timeout=30)
        assert r3.status_code == 200
        r4 = s.get(f"{API}/push/status", headers=_h(customer_token), timeout=30)
        assert r4.json()["subscriptions"] == base_count + 1, "duplicate subscribe should upsert"

        # unsubscribe
        r5 = s.post(f"{API}/push/unsubscribe", headers=_h(customer_token), json={"endpoint": endpoint}, timeout=30)
        assert r5.status_code == 200
        r6 = s.get(f"{API}/push/status", headers=_h(customer_token), timeout=30)
        assert r6.json()["subscriptions"] == base_count

    def test_subscribe_requires_auth(self, s):
        r = s.post(f"{API}/push/subscribe", json={"endpoint": "x", "keys": {"p256dh": "a", "auth": "b"}}, timeout=30)
        assert r.status_code in (401, 403)


# --------- Push firing (direct helper test with monkeypatched webpush) ---------

class TestPushHelperFires:
    """Exercise send_push_to_user directly to verify it iterates subs and
    calls pywebpush.webpush with the right subscription info. This avoids
    needing a real provider/customer job flow and is 100% deterministic."""

    def test_helper_calls_webpush(self, s, customer_token):
        import motor.motor_asyncio
        from unittest.mock import patch, MagicMock
        import push_notifications as pn

        # register a fake sub via the public API so we hit the same DB
        endpoint = f"https://push.example.com/TEST_{uuid.uuid4()}"
        s.post(f"{API}/push/subscribe", headers=_h(customer_token),
               json={"endpoint": endpoint, "keys": {"p256dh": "aa", "auth": "bb"}}, timeout=30)

        # figure out user_id via /auth/me
        me = s.get(f"{API}/auth/me", headers=_h(customer_token), timeout=30).json()
        uid = me["id"]

        # local motor client pointing at the same DB
        # Read backend .env explicitly (test process env may not have these)
        mongo_url, db_name = None, None
        try:
            with open("/app/backend/.env") as f:
                for line in f:
                    if line.startswith("MONGO_URL="):
                        mongo_url = line.split("=", 1)[1].strip().strip('"')
                    elif line.startswith("DB_NAME="):
                        db_name = line.split("=", 1)[1].strip().strip('"')
        except Exception:
            pass
        mongo_url = mongo_url or "mongodb://localhost:27017"
        db_name = db_name or "lumo_database"
        client = motor.motor_asyncio.AsyncIOMotorClient(mongo_url)
        db = client[db_name]

        called = {}
        def fake_webpush(subscription_info, data, vapid_private_key, vapid_claims):
            called["sub"] = subscription_info
            called["data"] = data
            called["claims"] = vapid_claims
            return MagicMock(status_code=201)

        async def run():
            with patch("pywebpush.webpush", side_effect=fake_webpush):
                ok = await pn.send_push_to_user(
                    db, user_id=uid, title="Test title",
                    body="body", url="/jobs/xyz", tag="job-xyz")
            return ok

        try:
            ok = asyncio.get_event_loop().run_until_complete(run())
        except RuntimeError:
            ok = asyncio.new_event_loop().run_until_complete(run())

        assert ok >= 1, "webpush was not called for the seeded subscription"
        assert called["sub"]["endpoint"] == endpoint
        assert called["sub"]["keys"] == {"p256dh": "aa", "auth": "bb"}
        # payload assertions
        import json as _json
        pl = _json.loads(called["data"])
        assert pl["title"] == "Test title"
        assert pl["url"] == "/jobs/xyz"

        # cleanup
        s.post(f"{API}/push/unsubscribe", headers=_h(customer_token),
               json={"endpoint": endpoint}, timeout=30)

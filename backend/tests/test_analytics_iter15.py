"""
Iteration 15 — Admin analytics dashboard backend tests.
Covers:
  * julius.a.mason@gmail.com bootstrapped as admin role on startup
  * POST /api/analytics/pageview (public, bot-skip, persistence)
  * GET /api/admin/analytics/overview (auth gating + full shape)
  * GET /api/admin/analytics/visitors (timeseries + top_paths)
  * GET /api/admin/analytics/signups (role/q/sort filters + password_hash hidden)
  * GET /api/admin/analytics/orders (kind/status/sort filters)
  * GET /api/admin/analytics/providers (computed totals + sort modes)
  * GET /api/admin/analytics/revenue (shape + cleaning-job fixture math)
"""
import os
import uuid
import time
import asyncio
import pytest
import requests
from datetime import datetime, timezone, timedelta

from motor.motor_asyncio import AsyncIOMotorClient

BASE_URL = os.environ["REACT_APP_BACKEND_URL"].rstrip("/")
API = f"{BASE_URL}/api"

MONGO_URL = os.environ.get("MONGO_URL", "mongodb://localhost:27017")
DB_NAME = os.environ.get("DB_NAME", "lumo_database")


# ── Fixtures ──────────────────────────────────────────────────────────────
@pytest.fixture(scope="session")
def admin_token():
    r = requests.post(f"{API}/auth/login",
                      json={"email": "admin@lumo.test", "password": "password123"})
    assert r.status_code == 200, f"admin login failed: {r.status_code} {r.text}"
    return r.json()["token"]


@pytest.fixture(scope="session")
def customer_token():
    r = requests.post(f"{API}/auth/login",
                      json={"email": "customer@lumo.test", "password": "password123"})
    assert r.status_code == 200
    return r.json()["token"]


@pytest.fixture(scope="session")
def provider_token():
    r = requests.post(f"{API}/auth/login",
                      json={"email": "provider@lumo.test", "password": "password123"})
    assert r.status_code == 200
    return r.json()["token"]


def admin_h(tok):
    return {"Authorization": f"Bearer {tok}"}


# ── Owner-admin bootstrap ─────────────────────────────────────────────────
class TestOwnerAdminBootstrap:
    def test_julius_is_admin_in_db(self):
        async def go():
            client = AsyncIOMotorClient(MONGO_URL)
            db = client[DB_NAME]
            doc = await db.users.find_one({"email": "julius.a.mason@gmail.com"})
            assert doc is not None, "Owner admin row not bootstrapped"
            assert doc.get("role") == "admin", f"role={doc.get('role')}"
            client.close()
        asyncio.run(go())


# ── Pageview public endpoint ──────────────────────────────────────────────
class TestPageviewIngest:
    def test_public_no_auth(self):
        r = requests.post(f"{API}/analytics/pageview",
                          json={"session_id": "TEST_pv_pub", "path": "/"})
        assert r.status_code == 200
        assert r.json() == {"ok": True}

    def test_bot_user_agent_skipped(self):
        r = requests.post(
            f"{API}/analytics/pageview",
            json={"session_id": "TEST_pv_bot", "path": "/"},
            headers={"User-Agent": "Mozilla/5.0 (compatible; Googlebot/2.1)"},
        )
        assert r.status_code == 200
        assert r.json().get("skipped") == "bot"
        # Verify not inserted
        async def check():
            client = AsyncIOMotorClient(MONGO_URL)
            db = client[DB_NAME]
            n = await db.pageviews.count_documents({"session_id": "TEST_pv_bot"})
            client.close()
            return n
        assert asyncio.run(check()) == 0

    def test_three_sessions_increase_visitors(self, admin_token):
        # Capture before
        r0 = requests.get(f"{API}/admin/analytics/overview", headers=admin_h(admin_token))
        assert r0.status_code == 200
        before = r0.json()["visitors"]["last_24h"]

        for sid in ("TEST_sess_a", "TEST_sess_b", "TEST_sess_c"):
            r = requests.post(f"{API}/analytics/pageview",
                              json={"session_id": sid, "path": "/"})
            assert r.status_code == 200
        time.sleep(0.4)

        r1 = requests.get(f"{API}/admin/analytics/overview", headers=admin_h(admin_token))
        after = r1.json()["visitors"]["last_24h"]
        assert after - before >= 3, f"expected +3 visitors, got {before} -> {after}"


# ── Overview gating + shape ───────────────────────────────────────────────
class TestOverview:
    def test_no_auth_returns_401_or_403(self):
        r = requests.get(f"{API}/admin/analytics/overview")
        assert r.status_code in (401, 403)

    def test_non_admin_returns_403(self, customer_token):
        r = requests.get(f"{API}/admin/analytics/overview", headers=admin_h(customer_token))
        assert r.status_code == 403

    def test_admin_shape(self, admin_token):
        r = requests.get(f"{API}/admin/analytics/overview", headers=admin_h(admin_token))
        assert r.status_code == 200
        d = r.json()
        # visitors
        for k in ("last_24h", "last_7d", "last_30d", "pageviews_24h"):
            assert k in d["visitors"], f"missing visitors.{k}"
        # signups
        for role in ("customer", "provider", "retailer", "restaurant"):
            assert role in d["signups"]["totals_by_role"]
        for k in ("new_24h", "new_7d", "total"):
            assert k in d["signups"]
        # orders
        for k in ("active_jobs", "completed_jobs", "active_orders", "completed_orders"):
            assert k in d["orders"]
        # revenue
        for k in ("gmv", "lumo_commission", "provider_payouts", "commission_rate"):
            assert k in d["revenue"]
        assert d["revenue"]["commission_rate"] == 0.10


# ── Visitors endpoint ─────────────────────────────────────────────────────
class TestVisitorsEndpoint:
    def test_timeseries_and_top_paths(self, admin_token):
        # Seed a few pageviews on distinct paths
        for path in ("/", "/map", "/stores", "/", "/map", "/"):
            requests.post(f"{API}/analytics/pageview",
                          json={"session_id": f"TEST_seed_{uuid.uuid4().hex[:6]}", "path": path})
        time.sleep(0.4)
        r = requests.get(f"{API}/admin/analytics/visitors?days=30",
                         headers=admin_h(admin_token))
        assert r.status_code == 200
        d = r.json()
        assert "timeseries" in d
        assert "top_paths" in d
        assert isinstance(d["timeseries"], list)
        assert isinstance(d["top_paths"], list)
        assert len(d["top_paths"]) <= 15
        # Sorted desc by count
        counts = [p["count"] for p in d["top_paths"]]
        assert counts == sorted(counts, reverse=True)


# ── Signups list ──────────────────────────────────────────────────────────
class TestSignupsList:
    def test_default_returns_users(self, admin_token):
        r = requests.get(f"{API}/admin/analytics/signups", headers=admin_h(admin_token))
        assert r.status_code == 200
        d = r.json()
        assert "items" in d and "total" in d
        for it in d["items"]:
            assert "password_hash" not in it, "password_hash leaked!"
            assert "_id" not in it

    def test_role_filter(self, admin_token):
        r = requests.get(f"{API}/admin/analytics/signups?role=provider",
                         headers=admin_h(admin_token))
        assert r.status_code == 200
        for it in r.json()["items"]:
            assert it.get("role") == "provider"

    def test_q_substring_case_insensitive(self, admin_token):
        r = requests.get(f"{API}/admin/analytics/signups?q=LUMO",
                         headers=admin_h(admin_token))
        assert r.status_code == 200
        items = r.json()["items"]
        assert len(items) >= 1
        for it in items:
            blob = (it.get("email") or "") + (it.get("name") or "") + (it.get("phone") or "")
            assert "lumo" in blob.lower()

    def test_sort_old_ascending(self, admin_token):
        r = requests.get(f"{API}/admin/analytics/signups?sort=old&limit=20",
                         headers=admin_h(admin_token))
        assert r.status_code == 200
        items = r.json()["items"]
        if len(items) >= 2:
            stamps = [i.get("created_at") or "" for i in items]
            assert stamps == sorted(stamps), "sort=old not ascending"


# ── Orders list ───────────────────────────────────────────────────────────
class TestOrdersList:
    def test_kind_all_shape(self, admin_token):
        r = requests.get(f"{API}/admin/analytics/orders?kind=all",
                         headers=admin_h(admin_token))
        assert r.status_code == 200
        items = r.json()["items"]
        # if both collections have rows, both kinds appear; if not, at least required fields
        for it in items[:5]:
            for k in ("id", "kind", "title", "status", "amount", "created_at"):
                assert k in it
            assert it["kind"] in ("job", "order")

    def test_kind_job_narrows(self, admin_token):
        r = requests.get(f"{API}/admin/analytics/orders?kind=job",
                         headers=admin_h(admin_token))
        assert r.status_code == 200
        for it in r.json()["items"]:
            assert it["kind"] == "job"

    def test_sort_value_desc(self, admin_token):
        r = requests.get(f"{API}/admin/analytics/orders?kind=all&sort=value",
                         headers=admin_h(admin_token))
        assert r.status_code == 200
        amts = [i["amount"] for i in r.json()["items"]]
        assert amts == sorted(amts, reverse=True)


# ── Providers list ────────────────────────────────────────────────────────
class TestProvidersList:
    def test_shape_and_fields(self, admin_token):
        r = requests.get(f"{API}/admin/analytics/providers",
                         headers=admin_h(admin_token))
        assert r.status_code == 200
        items = r.json()["items"]
        assert len(items) >= 1
        sample = items[0]
        for k in ("id", "payouts_total", "lumo_commission_from_provider",
                  "gmv_from_provider", "avg_rating", "reviews_count",
                  "jobs_completed", "wallet_balance", "profile_url"):
            assert k in sample, f"missing {k}"
        assert sample["profile_url"] == f"/u/{sample['id']}"

    def test_sort_modes(self, admin_token):
        for mode in ("revenue", "rating", "newest"):
            r = requests.get(f"{API}/admin/analytics/providers?sort={mode}",
                             headers=admin_h(admin_token))
            assert r.status_code == 200, mode

    def test_q_filter(self, admin_token):
        r = requests.get(f"{API}/admin/analytics/providers?q=lumo",
                         headers=admin_h(admin_token))
        assert r.status_code == 200


# ── Revenue ───────────────────────────────────────────────────────────────
class TestRevenue:
    def test_shape(self, admin_token):
        r = requests.get(f"{API}/admin/analytics/revenue?days=30",
                         headers=admin_h(admin_token))
        assert r.status_code == 200
        d = r.json()
        assert d["days"] == 30
        assert "series" in d
        assert "totals" in d
        for k in ("provider_payouts", "lumo_commission", "gmv"):
            assert k in d["totals"]
        # math invariant: gmv ≈ payouts / 0.9 ; commission ≈ gmv * 0.10
        t = d["totals"]
        if t["provider_payouts"] > 0:
            assert abs(t["gmv"] - t["provider_payouts"] / 0.9) < 1.0
            assert abs(t["lumo_commission"] - (t["gmv"] - t["provider_payouts"])) < 1.0

    def test_cleaning_fixture_increments_today_bucket(self, admin_token, customer_token, provider_token):
        """Post a cleaning job → accept → mark-delivered (no photos) → confirm-receipt
        → revenue endpoint should show a positive bucket today."""
        # Capture before
        r0 = requests.get(f"{API}/admin/analytics/revenue?days=1",
                          headers=admin_h(admin_token))
        before_totals = r0.json()["totals"]["provider_payouts"]

        # Find provider id
        rp = requests.get(f"{API}/auth/me", headers=admin_h(provider_token))
        provider_id = rp.json()["id"]

        # Insert a TEST_ job directly to bypass credential gate on cleaning category
        async def make_job():
            client = AsyncIOMotorClient(MONGO_URL)
            db = client[DB_NAME]
            cust = await db.users.find_one({"email": "customer@lumo.test"})
            jid = f"TEST_rev_{uuid.uuid4().hex[:8]}"
            await db.jobs.insert_one({
                "id": jid,
                "title": "TEST cleaning rev",
                "description": "fixture",
                "category": "cleaning",
                "pay_rate": 100.0,
                "pay_unit": "flat",
                "estimated_units": 1,
                "status": "accepted",
                "customer_id": cust["id"],
                "customer_name": cust.get("name") or "Customer",
                "provider_id": provider_id,
                "provider_name": "Provider",
                "created_at": datetime.now(timezone.utc).isoformat(),
                "delivery_status": None,
            })
            client.close()
            return jid

        jid = asyncio.run(make_job())
        try:
            # mark-delivered (non-physical, no photos)
            rd = requests.post(f"{API}/jobs/{jid}/mark-delivered",
                               headers=admin_h(provider_token), json={})
            assert rd.status_code == 200, rd.text
            # confirm-receipt as customer
            rc = requests.post(f"{API}/jobs/{jid}/confirm-receipt",
                               headers=admin_h(customer_token), json={})
            assert rc.status_code == 200, rc.text
            time.sleep(0.4)

            r1 = requests.get(f"{API}/admin/analytics/revenue?days=1",
                              headers=admin_h(admin_token))
            after_totals = r1.json()["totals"]["provider_payouts"]
            delta = round(after_totals - before_totals, 2)
            assert delta >= 89.99, f"expected ~+90 payout, got delta={delta}"

            # also check series has today
            today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
            series = r1.json()["series"]
            today_row = next((s for s in series if s["day"] == today), None)
            assert today_row is not None, "no today bucket in series"
        finally:
            # cleanup
            async def cleanup():
                client = AsyncIOMotorClient(MONGO_URL)
                db = client[DB_NAME]
                await db.jobs.delete_one({"id": jid})
                client.close()
            asyncio.run(cleanup())


# ── Cleanup TEST_ pageviews after all tests ───────────────────────────────
@pytest.fixture(scope="session", autouse=True)
def _cleanup_pageviews():
    yield
    async def cleanup():
        client = AsyncIOMotorClient(MONGO_URL)
        db = client[DB_NAME]
        await db.pageviews.delete_many({"session_id": {"$regex": "^TEST_"}})
        client.close()
    try:
        asyncio.run(cleanup())
    except Exception:
        pass

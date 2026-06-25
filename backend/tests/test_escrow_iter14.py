"""Iteration 14 — Escrow proof-of-delivery flow tests.

Covers:
  * /api/jobs/{id}/mark-delivered photo rules (physical vs non-physical)
  * /api/jobs/{id}/confirm-receipt wallet credit + idempotency
  * /api/jobs/{id}/dispute
  * /api/orders/{id}/mark-delivered + confirm-receipt
  * escrow._release_payment auto-release helper (no real 5-minute sleep)
  * Regression: /api/auth/login, /api/jobs/{id}/complete, /api/real-estate,
    /api/autos, /api/inquiries
"""
import os
import sys
import uuid
import asyncio
from datetime import datetime, timezone, timedelta

import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://lumo-bundle-checkout.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"

PNG_1X1 = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII="

# ---------- helpers / fixtures -------------------------------------------------

def _login(email, password="password123"):
    r = requests.post(f"{API}/auth/login", json={"email": email, "password": password}, timeout=15)
    assert r.status_code == 200, f"login failed for {email}: {r.status_code} {r.text}"
    data = r.json()
    return data["token"], data["user"]


@pytest.fixture(scope="module")
def customer():
    tok, u = _login("customer@lumo.test")
    return {"token": tok, "user": u, "headers": {"Authorization": f"Bearer {tok}"}}


@pytest.fixture(scope="module")
def provider():
    tok, u = _login("provider@lumo.test")
    return {"token": tok, "user": u, "headers": {"Authorization": f"Bearer {tok}"}}


def _mongo():
    """Direct Mongo access for inserting test jobs with provider_id assigned."""
    sys.path.insert(0, "/app/backend")
    from motor.motor_asyncio import AsyncIOMotorClient
    mongo_url = os.environ.get("MONGO_URL", "mongodb://localhost:27017")
    db_name = os.environ.get("DB_NAME", "lumo_database")
    client = AsyncIOMotorClient(mongo_url)
    return client, client[db_name]


def _now_iso():
    return datetime.now(timezone.utc).isoformat()


def _insert_job(category, customer_id, provider_id, pay_rate=100.0, units=1, status="accepted", flat=True):
    """Insert a job directly with provider_id pre-assigned (skips credential checks)."""
    async def go():
        client, db = _mongo()
        try:
            jid = f"TEST_{uuid.uuid4()}"
            doc = {
                "id": jid,
                "customer_id": customer_id,
                "customer_name": "Test Customer",
                "provider_id": provider_id,
                "provider_name": "Test Provider",
                "title": f"TEST {category} job",
                "description": "test",
                "category": category,
                "category_group": "physical" if category in ("delivery", "courier", "moving") else "service",
                "pay_rate": pay_rate,
                "pay_unit": "flat" if flat else "hour",
                "estimated_units": units,
                "status": status,
                "deposit_paid": True,
                "deposit_amount": pay_rate * 0.10,
                "total_estimate": pay_rate * units,
                "created_at": _now_iso(),
                "accepted_at": _now_iso(),
            }
            await db.jobs.insert_one(doc)
            return jid
        finally:
            client.close()
    return asyncio.get_event_loop().run_until_complete(go())


def _insert_order(customer_id, provider_id, item_total=80.0, delivery_fee=20.0):
    async def go():
        client, db = _mongo()
        try:
            oid = f"TESTORD_{uuid.uuid4()}"
            doc = {
                "id": oid,
                "customer_id": customer_id,
                "provider_id": provider_id,
                "item_total": item_total,
                "delivery_fee": delivery_fee,
                "status": "in_progress",
                "deposit_paid": True,
                "created_at": _now_iso(),
            }
            await db.orders.insert_one(doc)
            return oid
        finally:
            client.close()
    return asyncio.get_event_loop().run_until_complete(go())


def _get_wallet_balance(headers):
    r = requests.get(f"{API}/wallet", headers=headers, timeout=15)
    assert r.status_code == 200, r.text
    return float(r.json().get("balance", 0))


# ---------- AUTH regression ----------------------------------------------------

class TestAuthRegression:
    def test_login_customer(self):
        r = requests.post(f"{API}/auth/login", json={"email": "customer@lumo.test", "password": "password123"})
        assert r.status_code == 200
        assert "token" in r.json()

    def test_login_provider(self):
        r = requests.post(f"{API}/auth/login", json={"email": "provider@lumo.test", "password": "password123"})
        assert r.status_code == 200
        assert "token" in r.json()


# ---------- jobs/mark-delivered ------------------------------------------------

class TestMarkDelivered:
    def test_physical_without_photos_400(self, customer, provider):
        jid = _insert_job("delivery", customer["user"]["id"], provider["user"]["id"], pay_rate=100.0)
        r = requests.post(f"{API}/jobs/{jid}/mark-delivered", json={"photos": []}, headers=provider["headers"])
        assert r.status_code == 400
        assert "photo" in r.text.lower()

    def test_nonphysical_without_photos_ok(self, customer, provider):
        jid = _insert_job("cleaning", customer["user"]["id"], provider["user"]["id"], pay_rate=80.0)
        r = requests.post(f"{API}/jobs/{jid}/mark-delivered", json={"photos": [], "note": "done"}, headers=provider["headers"])
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["delivery_status"] == "awaiting_confirmation"
        assert body["delivery_photos"] == []
        assert body.get("delivered_at")

    def test_with_photos_ok(self, customer, provider):
        jid = _insert_job("delivery", customer["user"]["id"], provider["user"]["id"], pay_rate=50.0)
        r = requests.post(f"{API}/jobs/{jid}/mark-delivered", json={"photos": [PNG_1X1, PNG_1X1]}, headers=provider["headers"])
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["delivery_status"] == "awaiting_confirmation"
        assert len(body["delivery_photos"]) == 2
        assert body.get("delivered_at")

    def test_too_many_photos_400(self, customer, provider):
        jid = _insert_job("delivery", customer["user"]["id"], provider["user"]["id"], pay_rate=50.0)
        r = requests.post(f"{API}/jobs/{jid}/mark-delivered", json={"photos": [PNG_1X1, PNG_1X1, PNG_1X1, PNG_1X1]}, headers=provider["headers"])
        assert r.status_code == 400
        assert "3" in r.text or "Up to" in r.text

    def test_bad_photo_url_400(self, customer, provider):
        jid = _insert_job("delivery", customer["user"]["id"], provider["user"]["id"], pay_rate=50.0)
        r = requests.post(f"{API}/jobs/{jid}/mark-delivered", json={"photos": ["ftp://example.com/x"]}, headers=provider["headers"])
        assert r.status_code == 400

    def test_non_provider_403(self, customer, provider):
        jid = _insert_job("delivery", customer["user"]["id"], provider["user"]["id"], pay_rate=50.0)
        # customer tries to mark delivered (not provider)
        r = requests.post(f"{API}/jobs/{jid}/mark-delivered", json={"photos": [PNG_1X1]}, headers=customer["headers"])
        assert r.status_code == 403


# ---------- confirm-receipt ----------------------------------------------------

class TestConfirmReceipt:
    def test_confirm_credits_provider_wallet(self, customer, provider):
        pay_rate = 100.0
        jid = _insert_job("delivery", customer["user"]["id"], provider["user"]["id"], pay_rate=pay_rate, flat=True)
        # mark delivered first
        r = requests.post(f"{API}/jobs/{jid}/mark-delivered", json={"photos": [PNG_1X1]}, headers=provider["headers"])
        assert r.status_code == 200

        balance_before = _get_wallet_balance(provider["headers"])

        r = requests.post(f"{API}/jobs/{jid}/confirm-receipt", headers=customer["headers"])
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["delivery_status"] == "confirmed"
        assert body.get("payment_released_at")
        expected = round(pay_rate * 0.90, 2)
        assert abs(float(body.get("payment_released_amount", 0)) - expected) < 0.01

        balance_after = _get_wallet_balance(provider["headers"])
        assert abs((balance_after - balance_before) - expected) < 0.01, f"expected delta {expected} got {balance_after - balance_before}"

    def test_confirm_idempotent_no_double_credit(self, customer, provider):
        jid = _insert_job("delivery", customer["user"]["id"], provider["user"]["id"], pay_rate=60.0, flat=True)
        requests.post(f"{API}/jobs/{jid}/mark-delivered", json={"photos": [PNG_1X1]}, headers=provider["headers"])
        b0 = _get_wallet_balance(provider["headers"])
        r1 = requests.post(f"{API}/jobs/{jid}/confirm-receipt", headers=customer["headers"])
        assert r1.status_code == 200
        b1 = _get_wallet_balance(provider["headers"])
        # 2nd call should NOT credit again — server may return 400 (not awaiting) or 200 no-op.
        r2 = requests.post(f"{API}/jobs/{jid}/confirm-receipt", headers=customer["headers"])
        b2 = _get_wallet_balance(provider["headers"])
        assert abs(b2 - b1) < 0.01, f"double credit detected: b1={b1}, b2={b2} (r2 status={r2.status_code})"

    def test_confirm_by_provider_403(self, customer, provider):
        jid = _insert_job("delivery", customer["user"]["id"], provider["user"]["id"], pay_rate=40.0)
        requests.post(f"{API}/jobs/{jid}/mark-delivered", json={"photos": [PNG_1X1]}, headers=provider["headers"])
        r = requests.post(f"{API}/jobs/{jid}/confirm-receipt", headers=provider["headers"])
        assert r.status_code == 403


# ---------- dispute ------------------------------------------------------------

class TestDispute:
    def test_dispute_no_credit(self, customer, provider):
        jid = _insert_job("delivery", customer["user"]["id"], provider["user"]["id"], pay_rate=70.0)
        requests.post(f"{API}/jobs/{jid}/mark-delivered", json={"photos": [PNG_1X1]}, headers=provider["headers"])
        b0 = _get_wallet_balance(provider["headers"])
        r = requests.post(f"{API}/jobs/{jid}/dispute", json={"reason": "wrong item"}, headers=customer["headers"])
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["delivery_status"] == "disputed"
        assert body.get("dispute_reason") == "wrong item"
        b1 = _get_wallet_balance(provider["headers"])
        assert abs(b1 - b0) < 0.01, "wallet should NOT be credited on dispute"


# ---------- orders -------------------------------------------------------------

class TestOrders:
    def test_order_mark_delivered_no_photos_400(self, customer, provider):
        oid = _insert_order(customer["user"]["id"], provider["user"]["id"])
        r = requests.post(f"{API}/orders/{oid}/mark-delivered", json={"photos": []}, headers=provider["headers"])
        assert r.status_code == 400

    def test_order_full_flow(self, customer, provider):
        item, delivery = 80.0, 20.0
        oid = _insert_order(customer["user"]["id"], provider["user"]["id"], item_total=item, delivery_fee=delivery)
        r = requests.post(f"{API}/orders/{oid}/mark-delivered", json={"photos": [PNG_1X1]}, headers=provider["headers"])
        assert r.status_code == 200, r.text
        assert r.json()["delivery_status"] == "awaiting_confirmation"

        b0 = _get_wallet_balance(provider["headers"])
        r = requests.post(f"{API}/orders/{oid}/confirm-receipt", headers=customer["headers"])
        assert r.status_code == 200, r.text
        expected = round((item + delivery) * 0.90, 2)
        body = r.json()
        assert abs(float(body.get("payment_released_amount", 0)) - expected) < 0.01
        b1 = _get_wallet_balance(provider["headers"])
        assert abs((b1 - b0) - expected) < 0.01


# ---------- auto-release -------------------------------------------------------

class TestAutoRelease:
    def test_auto_release_via_helper(self, customer, provider):
        """Directly invoke escrow._release_payment with auto=True after backdating delivered_at."""
        pay_rate = 200.0
        jid = _insert_job("delivery", customer["user"]["id"], provider["user"]["id"], pay_rate=pay_rate, flat=True)
        # Mark delivered
        r = requests.post(f"{API}/jobs/{jid}/mark-delivered", json={"photos": [PNG_1X1]}, headers=provider["headers"])
        assert r.status_code == 200

        # Backdate delivered_at to 25 hours ago and call _release_payment directly
        async def go():
            sys.path.insert(0, "/app/backend")
            import escrow
            client, db = _mongo()
            try:
                old = (datetime.now(timezone.utc) - timedelta(hours=25)).isoformat()
                await db.jobs.update_one({"id": jid}, {"$set": {"delivered_at": old}})
                doc = await db.jobs.find_one({"id": jid})

                # Build same credit_provider helper used by server
                async def credit_provider(*, provider_id, amount, reason, ref_id=None, ref_kind=None):
                    await db.users.update_one({"id": provider_id}, {"$inc": {"wallet_balance": amount}})
                    await db.wallet_transactions.insert_one({
                        "id": str(uuid.uuid4()), "user_id": provider_id, "amount": amount,
                        "type": "credit", "reason": reason, "ref_id": ref_id, "ref_kind": ref_kind,
                        "created_at": _now_iso(),
                    })

                b0 = (await db.users.find_one({"id": provider["user"]["id"]})).get("wallet_balance", 0)
                await escrow._release_payment(coll=db.jobs, doc=doc, db=db,
                                              credit_provider=credit_provider, kind="jobs", auto=True)
                d2 = await db.jobs.find_one({"id": jid})
                b1 = (await db.users.find_one({"id": provider["user"]["id"]})).get("wallet_balance", 0)
                return d2, b0, b1
            finally:
                client.close()

        d2, b0, b1 = asyncio.get_event_loop().run_until_complete(go())
        assert d2["delivery_status"] == "auto_confirmed", d2
        assert d2["status"] == "completed"
        assert d2.get("payment_released_at")
        expected = round(pay_rate * 0.90, 2)
        assert abs((b1 - b0) - expected) < 0.01, f"auto-release credit mismatch: {b1 - b0} vs {expected}"


# ---------- legacy + iteration 10 regression ----------------------------------

class TestRegression:
    def test_legacy_complete_still_works(self, customer, provider):
        jid = _insert_job("cleaning", customer["user"]["id"], provider["user"]["id"], pay_rate=30.0)
        r = requests.post(f"{API}/jobs/{jid}/complete", headers=provider["headers"])
        assert r.status_code == 200, r.text
        assert r.json()["status"] == "completed"

    def test_real_estate_endpoint(self):
        r = requests.get(f"{API}/real-estate")
        assert r.status_code == 200

    def test_autos_endpoint(self):
        r = requests.get(f"{API}/autos")
        assert r.status_code == 200

    def test_inquiries_endpoint(self, customer):
        r = requests.get(f"{API}/inquiries", headers=customer["headers"])
        # /api/inquiries may require auth — accept 200 or 401-style only if not auth issue
        assert r.status_code in (200, 401, 403), r.text

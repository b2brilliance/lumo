"""
Tests for provider referral $25 milestone bonus (iter 51).

Covers:
  - GET /api/referrals/me new milestone fields
  - credit_referrer_milestone: fires exactly once at 10 paid jobs
  - guards: non-provider role, no referrer, already awarded
  - regression: 1% per-job commission still fires
"""
import os
import sys
import asyncio
import uuid
import pytest
import requests

sys.path.insert(0, "/app/backend")

from motor.motor_asyncio import AsyncIOMotorClient  # noqa: E402
from referrals import (  # noqa: E402
    credit_referrer_milestone,
    credit_referrer,
    PROVIDER_MILESTONE_BONUS,
    PROVIDER_MILESTONE_JOBS,
)

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://lumo-bundle-checkout.preview.emergentagent.com").rstrip("/")
MONGO_URL = os.environ.get("MONGO_URL", "mongodb://localhost:27017")
DB_NAME = os.environ.get("DB_NAME", "lumo_database")


# ── Fixtures ──────────────────────────────────────────────────────────
@pytest.fixture
async def db():
    """Fresh Motor client per test — Motor pins to the running loop."""
    client = AsyncIOMotorClient(MONGO_URL)
    try:
        yield client[DB_NAME]
    finally:
        client.close()


@pytest.fixture
def api():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


def _login(api, email, password):
    r = api.post(f"{BASE_URL}/api/auth/login", json={"email": email, "password": password})
    if r.status_code != 200:
        pytest.skip(f"login failed for {email}: {r.status_code} {r.text[:200]}")
    return r.json()["token"]


# ── API: /referrals/me shape ──────────────────────────────────────────
class TestReferralsMeShape:
    def test_customer_me_has_milestone_fields(self, api):
        tok = _login(api, "customer@lumo.test", "password123")
        r = api.get(f"{BASE_URL}/api/referrals/me", headers={"Authorization": f"Bearer {tok}"})
        assert r.status_code == 200, r.text
        data = r.json()
        # existing fields
        for k in ("code", "share_url", "referred_users", "reward_copy"):
            assert k in data, f"missing existing field {k}"
        # new milestone fields
        assert data.get("milestone_bonus_amount") == 25
        assert data.get("milestone_bonus_goal") == 10
        assert "milestone_awarded_count" in data
        assert "milestone_total_earned" in data
        assert isinstance(data.get("recruits"), list)
        # reward copy mentions $25 and 10 paid jobs
        rc = data["reward_copy"]
        assert "$25" in rc, f"reward_copy missing $25: {rc}"
        assert "10 paid jobs" in rc, f"reward_copy missing 10 paid jobs: {rc}"


# ── Unit tests: credit_referrer_milestone ─────────────────────────────
class TestCreditReferrerMilestone:
    @pytest.mark.asyncio
    async def test_fires_at_10_jobs_once_and_idempotent(self, db):
        # Setup: create referrer + provider with 10 pre-existing paid tx rows
        referrer_id = f"TEST_ref_{uuid.uuid4().hex[:8]}"
        provider_id = f"TEST_prov_{uuid.uuid4().hex[:8]}"
        await db.users.insert_one({
            "id": referrer_id, "email": f"{referrer_id}@t.test",
            "role": "customer", "wallet_balance": 0.0,
        })
        await db.users.insert_one({
            "id": provider_id, "email": f"{provider_id}@t.test",
            "role": "provider", "wallet_balance": 0.0,
            "referred_by_user_id": referrer_id,
        })
        for _ in range(10):
            await db.wallet_transactions.insert_one({
                "id": str(uuid.uuid4()),
                "user_id": provider_id,
                "amount": 50.0,
                "type": "credit",
                "reason": "job payout",
                "ref_kind": "job",
                "created_at": "2026-01-01T00:00:00Z",
            })

        try:
            rec1 = await credit_referrer_milestone(db, provider_id=provider_id)
            assert rec1 is not None, "should fire at 10 jobs"
            assert rec1["amount"] == PROVIDER_MILESTONE_BONUS

            u = await db.users.find_one({"id": referrer_id}, {"_id": 0, "wallet_balance": 1})
            assert u["wallet_balance"] == pytest.approx(25.00), u

            # wallet_transactions row logged with correct ref_kind
            wt = await db.wallet_transactions.find_one({"user_id": referrer_id, "ref_kind": "referral_milestone"})
            assert wt is not None
            assert wt["amount"] == 25.00

            # referral_milestones row inserted
            rm = await db.referral_milestones.find_one({"referrer_user_id": referrer_id, "source_user_id": provider_id})
            assert rm is not None

            # notification created
            notif = await db.notifications.find_one({"user_id": referrer_id, "type": "referral_milestone"})
            assert notif is not None

            # Idempotent: 2nd call does NOT re-credit
            rec2 = await credit_referrer_milestone(db, provider_id=provider_id)
            assert rec2 is None
            u2 = await db.users.find_one({"id": referrer_id}, {"_id": 0, "wallet_balance": 1})
            assert u2["wallet_balance"] == pytest.approx(25.00), "double-pay!"

            # Simulate 11th job — still no re-credit
            await db.wallet_transactions.insert_one({
                "id": str(uuid.uuid4()), "user_id": provider_id, "amount": 50.0,
                "type": "credit", "reason": "job11", "ref_kind": "job",
                "created_at": "2026-01-02T00:00:00Z",
            })
            rec3 = await credit_referrer_milestone(db, provider_id=provider_id)
            assert rec3 is None
        finally:
            await db.users.delete_many({"id": {"$in": [referrer_id, provider_id]}})
            await db.wallet_transactions.delete_many({"user_id": {"$in": [referrer_id, provider_id]}})
            await db.referral_milestones.delete_many({"source_user_id": provider_id})
            await db.notifications.delete_many({"user_id": referrer_id})

    @pytest.mark.asyncio
    async def test_no_fire_when_role_not_provider(self, db):
        referrer_id = f"TEST_ref_{uuid.uuid4().hex[:8]}"
        user_id = f"TEST_notprov_{uuid.uuid4().hex[:8]}"
        await db.users.insert_one({"id": referrer_id, "email": f"{referrer_id}@t.test", "role": "customer", "wallet_balance": 0.0})
        await db.users.insert_one({
            "id": user_id, "email": f"{user_id}@t.test", "role": "customer", "wallet_balance": 0.0,
            "referred_by_user_id": referrer_id,
        })
        for _ in range(10):
            await db.wallet_transactions.insert_one({
                "id": str(uuid.uuid4()), "user_id": user_id, "amount": 10.0,
                "type": "credit", "ref_kind": "job", "created_at": "2026-01-01T00:00:00Z",
            })
        try:
            rec = await credit_referrer_milestone(db, provider_id=user_id)
            assert rec is None
            u = await db.users.find_one({"id": referrer_id}, {"_id": 0, "wallet_balance": 1})
            assert u["wallet_balance"] == 0.0
        finally:
            await db.users.delete_many({"id": {"$in": [referrer_id, user_id]}})
            await db.wallet_transactions.delete_many({"user_id": user_id})

    @pytest.mark.asyncio
    async def test_no_fire_when_no_referrer(self, db):
        provider_id = f"TEST_orphan_{uuid.uuid4().hex[:8]}"
        await db.users.insert_one({
            "id": provider_id, "email": f"{provider_id}@t.test", "role": "provider", "wallet_balance": 0.0,
        })
        for _ in range(10):
            await db.wallet_transactions.insert_one({
                "id": str(uuid.uuid4()), "user_id": provider_id, "amount": 10.0,
                "type": "credit", "ref_kind": "job", "created_at": "2026-01-01T00:00:00Z",
            })
        try:
            rec = await credit_referrer_milestone(db, provider_id=provider_id)
            assert rec is None
        finally:
            await db.users.delete_one({"id": provider_id})
            await db.wallet_transactions.delete_many({"user_id": provider_id})

    @pytest.mark.asyncio
    async def test_no_fire_under_threshold(self, db):
        referrer_id = f"TEST_ref_{uuid.uuid4().hex[:8]}"
        provider_id = f"TEST_prov_{uuid.uuid4().hex[:8]}"
        await db.users.insert_one({"id": referrer_id, "email": f"{referrer_id}@t.test", "role": "customer", "wallet_balance": 0.0})
        await db.users.insert_one({
            "id": provider_id, "email": f"{provider_id}@t.test", "role": "provider", "wallet_balance": 0.0,
            "referred_by_user_id": referrer_id,
        })
        for _ in range(9):
            await db.wallet_transactions.insert_one({
                "id": str(uuid.uuid4()), "user_id": provider_id, "amount": 10.0,
                "type": "credit", "ref_kind": "job", "created_at": "2026-01-01T00:00:00Z",
            })
        try:
            rec = await credit_referrer_milestone(db, provider_id=provider_id)
            assert rec is None
        finally:
            await db.users.delete_many({"id": {"$in": [referrer_id, provider_id]}})
            await db.wallet_transactions.delete_many({"user_id": provider_id})

    @pytest.mark.asyncio
    async def test_referral_txs_dont_count_toward_milestone(self, db):
        """Ensure the count excludes ref_kind='referral' rows so referrers'
        1% earnings on the provider don't inflate the provider's job count.
        """
        referrer_id = f"TEST_ref_{uuid.uuid4().hex[:8]}"
        provider_id = f"TEST_prov_{uuid.uuid4().hex[:8]}"
        await db.users.insert_one({"id": referrer_id, "email": f"{referrer_id}@t.test", "role": "customer", "wallet_balance": 0.0})
        await db.users.insert_one({
            "id": provider_id, "email": f"{provider_id}@t.test", "role": "provider", "wallet_balance": 0.0,
            "referred_by_user_id": referrer_id,
        })
        # 10 referral rows should NOT trigger milestone
        for _ in range(10):
            await db.wallet_transactions.insert_one({
                "id": str(uuid.uuid4()), "user_id": provider_id, "amount": 1.0,
                "type": "credit", "ref_kind": "referral", "created_at": "2026-01-01T00:00:00Z",
            })
        try:
            rec = await credit_referrer_milestone(db, provider_id=provider_id)
            assert rec is None, "referral rows should not count"
        finally:
            await db.users.delete_many({"id": {"$in": [referrer_id, provider_id]}})
            await db.wallet_transactions.delete_many({"user_id": provider_id})


# ── Regression: 1% commission still fires ─────────────────────────────
class TestPerJobCommissionStillFires:
    @pytest.mark.asyncio
    async def test_credit_referrer_still_credits_amount_over_90(self, db):
        referrer_id = f"TEST_ref_{uuid.uuid4().hex[:8]}"
        provider_id = f"TEST_prov_{uuid.uuid4().hex[:8]}"
        await db.users.insert_one({"id": referrer_id, "email": f"{referrer_id}@t.test", "role": "customer", "wallet_balance": 0.0})
        await db.users.insert_one({
            "id": provider_id, "email": f"{provider_id}@t.test", "role": "provider", "wallet_balance": 0.0,
            "referred_by_user_id": referrer_id,
        })
        try:
            rec = await credit_referrer(
                db, provider_id=provider_id, provider_amount=90.0,
                source_type="job", source_id="test-job-1", notify=False,
            )
            assert rec is not None
            assert rec["amount"] == pytest.approx(1.0, abs=0.01)
            u = await db.users.find_one({"id": referrer_id}, {"_id": 0, "wallet_balance": 1})
            assert u["wallet_balance"] == pytest.approx(1.0, abs=0.01)
        finally:
            await db.users.delete_many({"id": {"$in": [referrer_id, provider_id]}})
            await db.wallet_transactions.delete_many({"user_id": referrer_id})
            await db.referral_earnings.delete_many({"referrer_user_id": referrer_id})


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])

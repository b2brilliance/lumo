# Iter66: credit_referrer() tiered rate unit test (local Mongo via motor)
import asyncio
import os
import sys
import uuid

import pytest
from dotenv import load_dotenv
from motor.motor_asyncio import AsyncIOMotorClient

sys.path.insert(0, "/app/backend")
load_dotenv("/app/backend/.env")
import referrals  # noqa: E402


async def _run():
    db = AsyncIOMotorClient(os.environ["MONGO_URL"])[os.environ["DB_NAME"]]
    ref_id, prov_id = f"TEST_ref_{uuid.uuid4().hex[:6]}", f"TEST_prov_{uuid.uuid4().hex[:6]}"
    await db.users.insert_many([
        {"id": ref_id, "email": f"{ref_id}@x.test", "wallet_balance": 0.0},
        {"id": prov_id, "email": f"{prov_id}@x.test", "role": "provider", "referred_by_user_id": ref_id},
    ])
    try:
        rec = await referrals.credit_referrer(db, provider_id=prov_id, provider_amount=90.0,
                                              source_type="job", source_id="j1", notify=False)
        assert rec["rate_pct"] == 0.1
        assert rec["gross_amount"] == 100.0
        assert abs(rec["amount"] - 0.1) < 1e-9
        u = await db.users.find_one({"id": ref_id})
        assert abs(u["wallet_balance"] - 0.1) < 1e-9
        # simulate 1000 prior earnings → rate should step to 0.11
        await db.referral_earnings.insert_many([{"id": str(uuid.uuid4()), "referrer_user_id": ref_id,
                                                 "amount": 0} for _ in range(999)])
        rec2 = await referrals.credit_referrer(db, provider_id=prov_id, provider_amount=900.0,
                                               source_type="job", notify=False)
        assert rec2["rate_pct"] == 0.11, rec2
        assert abs(rec2["amount"] - 1.1) < 1e-9
        # cap
        cfg = {**referrals.DEFAULT_PROGRAM}
        assert referrals.rate_for(10**7, cfg) == 0.99
        t = referrals.tier_info(1500, cfg)
        assert t["level"] == 2 and t["jobs_to_next"] == 500 and t["next_rate_pct"] == 0.12 and t["progress_pct"] == 50.0
        tmax = referrals.tier_info(10**6, cfg)
        assert tmax["at_max"] is True and tmax["jobs_to_next"] is None
        # no referrer → None
        assert await referrals.credit_referrer(db, provider_id=ref_id, provider_amount=50, source_type="job") is None
    finally:
        await db.users.delete_many({"id": {"$in": [ref_id, prov_id]}})
        await db.referral_earnings.delete_many({"referrer_user_id": ref_id})
        await db.wallet_transactions.delete_many({"user_id": ref_id})


def test_credit_referrer_tiers():
    asyncio.run(_run())

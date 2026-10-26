"""Idempotent seed of App Store / Play Store reviewer demo logins (empty accounts)."""
import uuid
from datetime import datetime, timezone

REVIEW_PASSWORD = "LumoReview2026!"
REVIEW_ACCOUNTS = [
    {"email": "customer.demo@golumo.app", "name": "Demo Customer", "role": "customer"},
    {"email": "worker.demo@golumo.app", "name": "Demo Worker", "role": "provider"},
    {"email": "seller.demo@golumo.app", "name": "Demo Seller", "role": "retailer"},
    {"email": "realestate.demo@golumo.app", "name": "Demo Real Estate", "role": "real_estate", "re_mode": "listing"},
]
PROVIDER_STRIPE = {"stripe_account_id": "acct_review_provider", "stripe_details_submitted": True,
                   "stripe_charges_enabled": True, "stripe_payouts_enabled": True}


async def seed_review_accounts(db, hash_password, logger):
    for a in REVIEW_ACCOUNTS:
        if await db.users.find_one({"email": a["email"]}, {"_id": 1}):
            continue
        doc = {"id": str(uuid.uuid4()), **a, "password_hash": hash_password(REVIEW_PASSWORD),
               "phone": None, "wallet_balance": 0.0, "location": None, "service_radius_miles": 25.0,
               "categories": [], "storefront": None, "is_review_account": True,
               "created_at": datetime.now(timezone.utc).isoformat()}
        if a["role"] == "provider":
            doc.update(PROVIDER_STRIPE)
        await db.users.insert_one(doc)
        logger.info(f"Seeded reviewer account: {a['email']}")

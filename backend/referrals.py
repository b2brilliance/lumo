"""
Lumo referral engine.

Every user gets a short `referral_code` at signup. Anyone who signs up
with `?ref=<code>` (or explicitly passes `ref_code` to /auth/register)
is tagged with `referred_by_user_id`.

When a provider earns money on a paid job/order, the platform pockets a
10% commission. `credit_referrer()` splits **1% of that commission**
(= 0.1% of gross, = amount / 900 of the provider's take) into the
referrer's Lumo wallet AND logs a `referral_earnings` row for the
transparent /api/referrals/me stats endpoint.

Wired into `_credit_provider()` in server.py, so it fires on every
payout path (escrow release, Stripe Connect transfer, and the simulated
wallet fallback).
"""
from __future__ import annotations

import secrets
import string
import uuid
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Request

CODE_ALPHABET = string.ascii_uppercase + string.digits
# Excluding easily-confused characters keeps referral URLs typable IRL.
CODE_ALPHABET = CODE_ALPHABET.translate(str.maketrans("", "", "0O1I"))


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def generate_code(length: int = 6) -> str:
    """Return a short human-friendly referral code, e.g. `X3K9AB`."""
    return "".join(secrets.choice(CODE_ALPHABET) for _ in range(length))


async def ensure_referral_code(db, user_id: str) -> str:
    """Return this user's referral code, generating + persisting one if
    they don't yet have one. Idempotent — safe to call on every request.
    """
    doc = await db.users.find_one({"id": user_id}, {"_id": 0, "referral_code": 1})
    if doc and doc.get("referral_code"):
        return doc["referral_code"]
    # Retry a few times on the astronomically-unlikely collision.
    for _ in range(6):
        code = generate_code()
        existing = await db.users.find_one({"referral_code": code}, {"_id": 1})
        if not existing:
            await db.users.update_one({"id": user_id}, {"$set": {"referral_code": code}})
            return code
    # Last-ditch — 12 chars, effectively unique.
    code = generate_code(12)
    await db.users.update_one({"id": user_id}, {"$set": {"referral_code": code}})
    return code


async def resolve_ref_code(db, ref_code: Optional[str]) -> Optional[str]:
    """Return the user_id whose referral_code matches, or None."""
    if not ref_code:
        return None
    ref_code = ref_code.strip().upper()
    if not ref_code:
        return None
    u = await db.users.find_one({"referral_code": ref_code}, {"_id": 0, "id": 1})
    return u["id"] if u else None


# ── Referral payout ────────────────────────────────────────────────────
# The provider's net take is 90% of gross (platform keeps 10% commission).
# We reward the referrer with 10% of that commission → 1% of gross → about
# 1.11% of the provider's take. Simple algebra:
#   gross      = provider_amount / 0.90
#   commission = gross * 0.10
#   payout     = commission * 0.10 = provider_amount * (10/9) * 0.10 * 0.10
#              = provider_amount / 90
#
# Concrete: a $100 gross job → platform earns $10 commission → referrer
# gets $1 (= referred provider's $90 take / 90).
PROVIDER_TAKE_TO_REFERRER_RATIO = 1.0 / 90.0


async def credit_referrer(
    db,
    *,
    provider_id: str,
    provider_amount: float,
    source_type: str,
    source_id: Optional[str] = None,
    notify: bool = True,
) -> Optional[dict]:
    """If the paying provider was referred by someone, credit that
    referrer's wallet with 1% of platform commission and log the event.

    Returns the created `referral_earnings` record (or None if the
    provider has no referrer / amount is negligible).
    """
    if not provider_id or provider_amount <= 0:
        return None
    provider = await db.users.find_one(
        {"id": provider_id},
        {"_id": 0, "referred_by_user_id": 1},
    )
    if not provider:
        return None
    referrer_id = provider.get("referred_by_user_id")
    if not referrer_id:
        return None

    amount = round(provider_amount * PROVIDER_TAKE_TO_REFERRER_RATIO, 4)
    now = _now_iso()
    record = {
        "id": str(uuid.uuid4()),
        "referrer_user_id": referrer_id,
        "source_user_id": provider_id,
        "source_type": source_type,   # "job" | "order" | "escrow"
        "source_id": source_id,
        "provider_amount": provider_amount,
        "amount": amount,
        "created_at": now,
    }
    await db.referral_earnings.insert_one(record)
    await db.users.update_one({"id": referrer_id}, {"$inc": {"wallet_balance": amount}})
    await db.wallet_transactions.insert_one({
        "id": str(uuid.uuid4()),
        "user_id": referrer_id,
        "amount": amount,
        "type": "credit",
        "reason": f"Referral bonus ({source_type})",
        "ref_id": record["id"],
        "ref_kind": "referral",
        "created_at": now,
    })
    if notify:
        try:
            await db.notifications.insert_one({
                "id": str(uuid.uuid4()),
                "user_id": referrer_id,
                "type": "referral_earned",
                "title": f"You earned ${amount:.2f} 🎉",
                "body": (
                    "One of your referrals just completed a paid job. "
                    "You'll keep earning every time they work."
                ),
                "link": "/wallet",
                "read": False,
                "created_at": now,
            })
        except Exception:
            pass
    return record


# ── Router ─────────────────────────────────────────────────────────────
def create_router(*, db, get_current_user):
    r = APIRouter(prefix="/referrals", tags=["referrals"])

    @r.get("/me")
    async def me(request: Request, user: dict = Depends(get_current_user)):
        """Return the caller's own referral code + running stats."""
        code = await ensure_referral_code(db, user["id"])
        # Prefer an explicit PUBLIC_BASE_URL (e.g. https://golumo.app) set at
        # deploy time. Otherwise trust X-Forwarded-Host/X-Forwarded-Proto
        # from the ingress. Fall back to `request.base_url` only as a last
        # resort — that reflects the internal cluster hostname and looks
        # ugly in copied share links.
        import os as _os
        public_base = _os.environ.get("PUBLIC_BASE_URL", "").rstrip("/")
        if not public_base:
            fwd_host = request.headers.get("x-forwarded-host") or request.headers.get("host")
            fwd_proto = request.headers.get("x-forwarded-proto") or "https"
            if fwd_host:
                public_base = f"{fwd_proto}://{fwd_host}"
            else:
                public_base = str(request.base_url).rstrip("/")
        # Strip trailing /api if the base points at the API subpath.
        if public_base.endswith("/api"):
            public_base = public_base[:-4]
        share_url = f"{public_base}/register?ref={code}"

        # Aggregates
        cur = db.referral_earnings.find({"referrer_user_id": user["id"]})
        total_earned = 0.0
        count = 0
        recent = []
        async for row in cur:
            total_earned += float(row.get("amount") or 0.0)
            count += 1
            if len(recent) < 10:
                recent.append({
                    "amount": row.get("amount"),
                    "source_type": row.get("source_type"),
                    "created_at": row.get("created_at"),
                })

        # How many people signed up with my code (even if they haven't
        # earned yet).
        referred_users = await db.users.count_documents(
            {"referred_by_user_id": user["id"]}
        )
        return {
            "code": code,
            "share_url": share_url,
            "referred_users": referred_users,
            "events": count,
            "total_earned": round(total_earned, 2),
            "recent": recent,
            "reward_copy": (
                "You earn 10% of Lumo's platform commission every time "
                "someone you referred completes a paid job or order. "
                "That's roughly $1 for every $100 they earn."
            ),
        }

    return r

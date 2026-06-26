"""
Stripe Connect — provider onboarding, payouts, and webhooks.

Flow:
  1. Provider clicks "Connect Bank Account" in the UI.
     → POST /api/stripe/connect/onboard
     → Creates an Express account (if needed), returns a Stripe-hosted onboarding URL.

  2. Provider completes onboarding on Stripe's site.
     → Stripe redirects back to /provider-hub?stripe=connected

  3. UI polls GET /api/stripe/connect/status to see if payouts are enabled.

  4. When escrow auto-releases a job/order:
     → If the provider has a connected account with payouts_enabled, we call
       stripe.Transfer.create(...) to send funds from the platform balance.
     → Otherwise we fall back to crediting `wallet_balance` (simulated).

  5. Webhooks at POST /api/stripe/connect/webhook keep `payouts_enabled` and
     account requirements in sync.

The customer-side Checkout flow (emergentintegrations) is untouched; we only
add a *separate* Stripe API key (`STRIPE_CONNECT_SECRET_KEY`) so the two
flows are isolated.
"""
from __future__ import annotations

import os
import uuid
import logging
from datetime import datetime, timezone
from typing import Optional, Callable, Awaitable

import stripe
from fastapi import APIRouter, HTTPException, Depends, Request
from pydantic import BaseModel, Field

logger = logging.getLogger("lumo.stripe_connect")

CONNECT_KEY = os.environ.get("STRIPE_CONNECT_SECRET_KEY", "").strip()
WEBHOOK_SECRET = os.environ.get("STRIPE_CONNECT_WEBHOOK_SECRET", "").strip()
PLATFORM_FEE_PERCENT = float(os.environ.get("STRIPE_PLATFORM_FEE_PERCENT", "10"))

# Cache populated by `refresh_config_cache()` — overrides the env values
# above when the admin saves new keys via the dashboard.
_LIVE_CONFIG: dict = {"secret_key": CONNECT_KEY, "webhook_secret": WEBHOOK_SECRET,
                      "platform_fee_percent": PLATFORM_FEE_PERCENT, "source": "env"}


async def refresh_config_cache(db) -> dict:
    """Reload the active Stripe config from MongoDB (DB > env)."""
    try:
        from admin_payments import get_active_stripe_config
        cfg = await get_active_stripe_config(db)
        _LIVE_CONFIG.update(cfg)
        logger.info(f"Stripe config refreshed — source={cfg['source']}, "
                    f"key_present={bool(cfg['secret_key'])}")
    except Exception as e:
        logger.warning(f"Stripe config refresh failed: {e}")
    return _LIVE_CONFIG


def _active_secret() -> str:
    return _LIVE_CONFIG.get("secret_key") or CONNECT_KEY


def _active_webhook_secret() -> str:
    return _LIVE_CONFIG.get("webhook_secret") or WEBHOOK_SECRET


def _stripe_enabled() -> bool:
    k = _active_secret()
    return bool(k and (k.startswith("sk_") or k.startswith("rk_")))


def _client() -> stripe:
    if not _stripe_enabled():
        raise HTTPException(503, "Stripe Connect is not configured on the server.")
    stripe.api_key = _active_secret()
    return stripe


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()





class OnboardBody(BaseModel):
    return_url: str = Field(..., description="Where Stripe sends the provider when they finish")
    refresh_url: Optional[str] = Field(None, description="Where Stripe sends them if the link expires")


class TransferRecord(BaseModel):
    transfer_id: str
    amount: float
    currency: str = "usd"
    destination_account: str
    created_at: str


def create_router(
    *,
    db,
    get_current_user,
) -> APIRouter:
    """Build the FastAPI router. We accept dependencies so this module stays
    decoupled from server.py's global state."""

    router = APIRouter(prefix="/api/stripe/connect", tags=["stripe_connect"])

    async def _ensure_account_for_user(user: dict) -> str:
        """Return the Stripe connected account id for the user, creating one
        if needed. Stores the id on the user document."""
        existing = user.get("stripe_account_id")
        if existing:
            return existing

        sc = _client()
        try:
            acct = sc.Account.create(
                type="express",
                country="US",
                email=user.get("email"),
                capabilities={
                    "transfers": {"requested": True},
                    "card_payments": {"requested": True},
                },
                business_type="individual",
                metadata={"lumo_user_id": user["id"], "lumo_email": user.get("email", "")},
            )
        except stripe.error.StripeError as e:
            logger.exception("Stripe Account.create failed")
            msg = getattr(e, "user_message", None) or str(e)
            raise HTTPException(400, f"Stripe error: {msg}")

        await db.users.update_one(
            {"id": user["id"]},
            {"$set": {
                "stripe_account_id": acct.id,
                "stripe_account_created_at": _now_iso(),
                "stripe_charges_enabled": False,
                "stripe_payouts_enabled": False,
            }},
        )
        return acct.id

    @router.get("/status")
    async def status(user: dict = Depends(get_current_user)):
        """Return the live connection status for the current user."""
        if not _stripe_enabled():
            return {"enabled": False, "reason": "stripe_not_configured"}

        acct_id = user.get("stripe_account_id")
        if not acct_id:
            return {
                "enabled": True,
                "connected": False,
                "charges_enabled": False,
                "payouts_enabled": False,
                "requirements": None,
                "account_id": None,
            }

        sc = _client()
        try:
            acct = sc.Account.retrieve(acct_id)
        except stripe.error.StripeError as e:
            logger.warning(f"Stripe Account.retrieve failed for {acct_id}: {e}")
            return {
                "enabled": True,
                "connected": True,
                "charges_enabled": False,
                "payouts_enabled": False,
                "requirements": {"error": str(e)},
                "account_id": acct_id,
            }

        # Keep our cache in sync
        await db.users.update_one(
            {"id": user["id"]},
            {"$set": {
                "stripe_charges_enabled": bool(acct.charges_enabled),
                "stripe_payouts_enabled": bool(acct.payouts_enabled),
                "stripe_details_submitted": bool(acct.details_submitted),
                "stripe_status_updated_at": _now_iso(),
            }},
        )

        req = acct.requirements or {}
        return {
            "enabled": True,
            "connected": True,
            "account_id": acct_id,
            "charges_enabled": bool(acct.charges_enabled),
            "payouts_enabled": bool(acct.payouts_enabled),
            "details_submitted": bool(acct.details_submitted),
            "requirements": {
                "currently_due": list(getattr(req, "currently_due", []) or []),
                "past_due": list(getattr(req, "past_due", []) or []),
                "eventually_due": list(getattr(req, "eventually_due", []) or []),
                "disabled_reason": getattr(req, "disabled_reason", None),
            },
        }

    @router.post("/onboard")
    async def onboard(body: OnboardBody, user: dict = Depends(get_current_user)):
        """Create (or reuse) the provider's Express account and return an
        Account Link URL that the UI should open in a new tab."""
        sc = _client()
        acct_id = await _ensure_account_for_user(user)

        try:
            link = sc.AccountLink.create(
                account=acct_id,
                refresh_url=body.refresh_url or body.return_url,
                return_url=body.return_url,
                type="account_onboarding",
                collect="eventually_due",
            )
        except stripe.error.StripeError as e:
            logger.exception("Stripe AccountLink.create failed")
            msg = getattr(e, "user_message", None) or str(e)
            raise HTTPException(400, f"Stripe error: {msg}")

        return {"url": link.url, "expires_at": link.expires_at, "account_id": acct_id}

    @router.post("/dashboard-link")
    async def dashboard_link(user: dict = Depends(get_current_user)):
        """Return a one-time login link to the Express dashboard so the
        provider can view payouts, update bank info, etc."""
        sc = _client()
        acct_id = user.get("stripe_account_id")
        if not acct_id:
            raise HTTPException(400, "Connect your bank first.")
        try:
            login = sc.Account.create_login_link(acct_id)
        except stripe.error.StripeError as e:
            msg = getattr(e, "user_message", None) or str(e)
            raise HTTPException(400, f"Stripe error: {msg}")
        return {"url": login.url}

    @router.delete("/disconnect")
    async def disconnect(user: dict = Depends(get_current_user)):
        """Forget the provider's connected account (we don't actually delete
        the Stripe account — the provider can rejoin later by reconnecting)."""
        await db.users.update_one(
            {"id": user["id"]},
            {"$unset": {
                "stripe_account_id": "",
                "stripe_charges_enabled": "",
                "stripe_payouts_enabled": "",
                "stripe_details_submitted": "",
                "stripe_status_updated_at": "",
            }},
        )
        return {"ok": True}

    @router.get("/transfers")
    async def list_transfers(user: dict = Depends(get_current_user), limit: int = 50):
        """List the payouts we've sent to this provider via Stripe."""
        cursor = db.stripe_transfers.find({"lumo_user_id": user["id"]}).sort("created_at", -1).limit(limit)
        rows = await cursor.to_list(limit)
        return [{k: v for k, v in r.items() if k != "_id"} for r in rows]

    # ── Webhook ───────────────────────────────────────────────────────────
    @router.post("/webhook")
    async def webhook(request: Request):
        if not _stripe_enabled():
            return {"ignored": True}

        payload = await request.body()
        sig_header = request.headers.get("stripe-signature", "")

        ws = _active_webhook_secret()
        if ws:
            try:
                event = stripe.Webhook.construct_event(payload, sig_header, ws)
            except (ValueError, stripe.error.SignatureVerificationError) as e:
                logger.warning(f"Stripe webhook signature failed: {e}")
                raise HTTPException(400, "Invalid signature")
        else:
            # No webhook secret yet — accept events anyway (test mode convenience).
            try:
                import json as _json
                event = _json.loads(payload.decode("utf-8"))
            except Exception:
                raise HTTPException(400, "Invalid payload")

        evt_type = event.get("type") if isinstance(event, dict) else event["type"]
        data = (event.get("data", {}) or {}).get("object", {}) if isinstance(event, dict) else event["data"]["object"]

        if evt_type == "account.updated":
            acct_id = data.get("id") if isinstance(data, dict) else data["id"]
            await db.users.update_one(
                {"stripe_account_id": acct_id},
                {"$set": {
                    "stripe_charges_enabled": bool(data.get("charges_enabled") if isinstance(data, dict) else data["charges_enabled"]),
                    "stripe_payouts_enabled": bool(data.get("payouts_enabled") if isinstance(data, dict) else data["payouts_enabled"]),
                    "stripe_details_submitted": bool(data.get("details_submitted") if isinstance(data, dict) else data["details_submitted"]),
                    "stripe_status_updated_at": _now_iso(),
                }},
            )
        elif evt_type in ("payout.paid", "payout.failed"):
            await db.stripe_transfers.update_many(
                {"payout_id": data.get("id") if isinstance(data, dict) else data["id"]},
                {"$set": {"payout_status": evt_type.split(".")[1], "updated_at": _now_iso()}},
            )
        elif evt_type == "transfer.created":
            # Already recorded synchronously in attempt_stripe_transfer(); no-op.
            pass

        return {"ok": True}

    return router


# ────────────────────────────────────────────────────────────────────────────
# Helpers called by escrow / withdrawal flows in server.py
# ────────────────────────────────────────────────────────────────────────────

async def attempt_stripe_transfer(
    *,
    db,
    provider_id: str,
    amount_usd: float,
    reason: str,
    ref_id: Optional[str] = None,
    ref_kind: Optional[str] = None,
) -> Optional[dict]:
    """Attempt to transfer `amount_usd` from the platform balance to the
    provider's connected Stripe account. Returns the transfer record on
    success, or None if the provider is not connected / Stripe is not
    configured / the transfer failed (caller should fall back to wallet)."""
    if not _stripe_enabled():
        return None
    if amount_usd <= 0:
        return None

    user = await db.users.find_one({"id": provider_id}, {"_id": 0})
    if not user:
        return None

    acct_id = user.get("stripe_account_id")
    if not acct_id or not user.get("stripe_payouts_enabled"):
        return None

    stripe.api_key = _active_secret()
    amount_cents = int(round(amount_usd * 100))

    try:
        transfer = stripe.Transfer.create(
            amount=amount_cents,
            currency="usd",
            destination=acct_id,
            description=reason[:255],
            metadata={
                "lumo_user_id": provider_id,
                "lumo_ref_id": ref_id or "",
                "lumo_ref_kind": ref_kind or "",
            },
        )
    except stripe.error.StripeError as e:
        logger.warning(
            f"Stripe Transfer.create failed for provider={provider_id} "
            f"amount=${amount_usd:.2f}: {e}. Falling back to wallet."
        )
        return None

    record = {
        "id": str(uuid.uuid4()),
        "transfer_id": transfer.id,
        "lumo_user_id": provider_id,
        "destination_account": acct_id,
        "amount": amount_usd,
        "currency": "usd",
        "reason": reason,
        "ref_id": ref_id,
        "ref_kind": ref_kind,
        "payout_status": "in_transit",
        "created_at": _now_iso(),
    }
    await db.stripe_transfers.insert_one(record)
    return {k: v for k, v in record.items() if k != "_id"}

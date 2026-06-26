"""
Admin-editable payment provider keys (Stripe Connect).

Keys are stored encrypted in MongoDB (`payment_settings` collection,
`_id: "stripe"`) and decrypted in-memory by stripe_connect.py at every
request via `get_active_stripe_config()`.

The Fernet symmetric key is derived from the existing JWT_SECRET so we
don't introduce another env var; on a fresh install the same JWT secret
will always decrypt previously-stored keys.

Endpoints:
  GET    /api/admin/payments/config   — current state (masked)
  PUT    /api/admin/payments/config   — save/update
  POST   /api/admin/payments/test     — ping Stripe with the saved key
  DELETE /api/admin/payments/config   — wipe stored keys
"""
from __future__ import annotations

import os
import base64
import hashlib
import logging
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from cryptography.fernet import Fernet, InvalidToken

logger = logging.getLogger("lumo.admin_payments")


def _fernet() -> Fernet:
    """Derive a stable Fernet key from JWT_SECRET so we don't need another env."""
    secret = (os.environ.get("JWT_SECRET") or "lumo_fallback_secret").encode("utf-8")
    digest = hashlib.sha256(secret).digest()
    return Fernet(base64.urlsafe_b64encode(digest))


def _enc(s: str) -> str:
    if not s:
        return ""
    return _fernet().encrypt(s.encode("utf-8")).decode("ascii")


def _dec(s: str) -> str:
    if not s:
        return ""
    try:
        return _fernet().decrypt(s.encode("ascii")).decode("utf-8")
    except (InvalidToken, ValueError):
        logger.warning("Failed to decrypt stored payment key (likely JWT_SECRET changed).")
        return ""


def _mask(key: str) -> str:
    """sk_test_51TmDu4HCqOpp...rlLK → sk_test_•••••rlLK"""
    if not key:
        return ""
    if len(key) <= 12:
        return key[:4] + "•" * (len(key) - 4)
    return key[:8] + "•" * 8 + key[-4:]


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


# ── Public helper used by stripe_connect.py ────────────────────────────────
_CACHE: dict = {"loaded_at": 0, "config": None}


async def get_active_stripe_config(db) -> dict:
    """Return the currently active Stripe config — DB overrides env per field."""
    doc = await db.payment_settings.find_one({"_id": "stripe"}) or {}

    db_secret = _dec(doc.get("secret_key_enc", ""))
    db_webhook = _dec(doc.get("webhook_secret_enc", ""))
    db_fee = doc.get("platform_fee_percent")

    env_secret = os.environ.get("STRIPE_CONNECT_SECRET_KEY", "").strip()
    env_webhook = os.environ.get("STRIPE_CONNECT_WEBHOOK_SECRET", "").strip()
    env_fee = float(os.environ.get("STRIPE_PLATFORM_FEE_PERCENT", "10"))

    secret = db_secret or env_secret
    webhook = db_webhook or env_webhook
    fee = float(db_fee) if db_fee is not None else env_fee

    # Source = "db" if ANY field is overridden from DB, else "env" (or "none")
    if db_secret or db_webhook or db_fee is not None:
        source = "db"
    elif env_secret:
        source = "env"
    else:
        source = "none"

    return {"secret_key": secret, "webhook_secret": webhook,
            "platform_fee_percent": fee, "source": source}


# ── Pydantic ───────────────────────────────────────────────────────────────
class StripeConfigBody(BaseModel):
    secret_key: Optional[str] = Field(
        None,
        description="New Stripe Connect secret key (sk_test_… or sk_live_…). "
                    "Pass null to leave unchanged, empty string to clear.",
    )
    webhook_secret: Optional[str] = Field(
        None, description="Stripe webhook signing secret (whsec_…)."
    )
    platform_fee_percent: Optional[float] = Field(None, ge=0, le=50)


def create_router(*, db, require_admin) -> APIRouter:
    router = APIRouter(prefix="/api/admin/payments", tags=["admin_payments"])

    @router.get("/config")
    async def get_config(_admin: dict = Depends(require_admin)):
        doc = await db.payment_settings.find_one({"_id": "stripe"})
        cfg = await get_active_stripe_config(db)
        return {
            "secret_key_masked": _mask(cfg["secret_key"]),
            "webhook_secret_masked": _mask(cfg["webhook_secret"]),
            "platform_fee_percent": cfg["platform_fee_percent"],
            "source": cfg["source"],
            "is_test_mode": cfg["secret_key"].startswith("sk_test_") if cfg["secret_key"] else None,
            "is_live_mode": cfg["secret_key"].startswith("sk_live_") if cfg["secret_key"] else None,
            "updated_at": (doc or {}).get("updated_at"),
            "updated_by": (doc or {}).get("updated_by"),
        }

    @router.put("/config")
    async def update_config(body: StripeConfigBody, admin: dict = Depends(require_admin)):
        update: dict = {"updated_at": _now_iso(), "updated_by": admin.get("email")}

        if body.secret_key is not None:
            sk = body.secret_key.strip()
            if sk and not (sk.startswith("sk_test_") or sk.startswith("sk_live_") or sk.startswith("rk_test_") or sk.startswith("rk_live_")):
                raise HTTPException(400, "Stripe secret key must start with sk_test_, sk_live_, rk_test_ or rk_live_")
            update["secret_key_enc"] = _enc(sk)

        if body.webhook_secret is not None:
            ws = body.webhook_secret.strip()
            if ws and not ws.startswith("whsec_"):
                raise HTTPException(400, "Stripe webhook secret must start with whsec_")
            update["webhook_secret_enc"] = _enc(ws)

        if body.platform_fee_percent is not None:
            update["platform_fee_percent"] = body.platform_fee_percent

        await db.payment_settings.update_one(
            {"_id": "stripe"}, {"$set": update}, upsert=True
        )

        # Bust the stripe_connect cache so the next request sees new keys.
        try:
            from stripe_connect import refresh_config_cache
            await refresh_config_cache(db)
        except Exception:
            pass

        return await get_config(admin)

    @router.delete("/config")
    async def clear_config(admin: dict = Depends(require_admin)):
        await db.payment_settings.delete_one({"_id": "stripe"})
        try:
            from stripe_connect import refresh_config_cache
            await refresh_config_cache(db)
        except Exception:
            pass
        return {"ok": True}

    @router.post("/test")
    async def test_connection(_admin: dict = Depends(require_admin)):
        """Hit Stripe with the active key to verify it works. Reports the
        platform account info; checks Connect status via Account.retrieve
        (lightweight — no test-account creation that would risk timeouts)."""
        cfg = await get_active_stripe_config(db)
        if not cfg["secret_key"]:
            return {"ok": False, "error": "No Stripe key configured yet.", "source": cfg["source"]}

        try:
            import stripe
            stripe.api_key = cfg["secret_key"]
            acct = stripe.Account.retrieve()
        except Exception as e:
            msg = getattr(e, "user_message", None) or str(e)
            return {"ok": False, "error": msg, "source": cfg["source"]}

        # `controller.application` / `details_submitted` give us a fast read
        # on whether the platform itself is Connect-enabled.
        connect_enabled = bool(
            getattr(acct, "details_submitted", False)
            or getattr(acct, "charges_enabled", False)
        )
        bp = getattr(acct, "business_profile", None) or {}
        biz_name = (bp.get("name") if isinstance(bp, dict) else getattr(bp, "name", None))
        return {
            "ok": True,
            "source": cfg["source"],
            "platform_account_id": acct.id,
            "platform_business_name": biz_name,
            "platform_country": getattr(acct, "country", None),
            "is_test_mode": cfg["secret_key"].startswith("sk_test_"),
            "is_live_mode": cfg["secret_key"].startswith("sk_live_"),
            "connect_enabled": connect_enabled,
            "platform_fee_percent": cfg["platform_fee_percent"],
        }

    return router

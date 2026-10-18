"""
Passwordless SMS sign-in / sign-up via Twilio Verify.

Flow:
1. POST /api/auth/sms/start  { phone }                  → Twilio sends a 6-digit OTP
2. POST /api/auth/sms/verify { phone, code, name? }     → Twilio confirms code →
   if phone matches an existing user, log them in; otherwise auto-create a
   customer account using the phone number, then issue a JWT.

Phone numbers must be in E.164 (e.g. +14155552671). Twilio's Verify service
handles code generation, expiry and rate-limit / fraud checks for us.
"""
from __future__ import annotations

import os
import re
import uuid
import logging
import asyncio
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

try:
    from twilio.rest import Client as TwilioClient  # type: ignore
    from twilio.base.exceptions import TwilioRestException  # type: ignore
except Exception:  # pragma: no cover
    TwilioClient = None  # type: ignore
    TwilioRestException = Exception  # type: ignore

logger = logging.getLogger("lumo.auth_sms")

E164 = re.compile(r"^\+[1-9]\d{6,14}$")


def _normalize_phone(raw: str) -> str:
    """Accept '+1 415 555 2671', '(415) 555-2671' etc. Best-effort to E.164.
    If no '+' is present, assume US/Canada (+1)."""
    s = (raw or "").strip()
    digits = "".join(ch for ch in s if ch.isdigit())
    if s.startswith("+"):
        out = "+" + digits
    elif len(digits) == 10:
        out = "+1" + digits
    elif len(digits) == 11 and digits.startswith("1"):
        out = "+" + digits
    else:
        out = "+" + digits
    return out


class SmsStart(BaseModel):
    phone: str = Field(min_length=4, max_length=24)


class SmsVerify(BaseModel):
    phone: str = Field(min_length=4, max_length=24)
    code: str = Field(min_length=4, max_length=10)
    name: Optional[str] = Field(default=None, max_length=120)


def _twilio_client() -> Optional[object]:
    sid = os.environ.get("TWILIO_ACCOUNT_SID")
    token = os.environ.get("TWILIO_AUTH_TOKEN")
    if not sid or not token or TwilioClient is None:
        return None
    return TwilioClient(sid, token)


def create_router(*, db, create_access_token, now_iso) -> APIRouter:
    router = APIRouter(prefix="/api/auth/sms")
    service_sid = os.environ.get("TWILIO_VERIFY_SERVICE_SID")

    @router.post("/start")
    async def start(body: SmsStart):
        phone = _normalize_phone(body.phone)
        if not E164.match(phone):
            raise HTTPException(400, "Enter a valid phone number")
        client = _twilio_client()
        if not client or not service_sid:
            # Test/dev fallback when keys are missing — log a fake code
            logger.warning(f"Twilio keys missing — DEV MODE OTP for {phone} = 123456")
            return {"status": "pending", "dev_mode": True}
        try:
            v = await asyncio.to_thread(
                lambda: client.verify.v2.services(service_sid).verifications.create(
                    to=phone, channel="sms",
                )
            )
            return {"status": v.status}
        except TwilioRestException as e:
            logger.warning(f"Twilio verify start failed for {phone}: {e}")
            # Map common Twilio errors to friendly client messages
            code = getattr(e, "code", None)
            if code == 60200:
                raise HTTPException(400, "That phone number doesn't look right.")
            if code == 60203:
                raise HTTPException(429, "Too many codes sent. Wait a few minutes and try again.")
            if code == 21608:
                # Trial accounts cannot send to unverified numbers
                raise HTTPException(400, "Your Twilio trial account can only send to numbers you've verified in the Twilio console. Add this number at twilio.com/console/phone-numbers/verified, or upgrade to a paid plan.")
            raise HTTPException(400, "Couldn't send the code right now. Try again in a moment.")

    @router.post("/verify")
    async def verify(body: SmsVerify):
        phone = _normalize_phone(body.phone)
        if not E164.match(phone):
            raise HTTPException(400, "Enter a valid phone number")
        client = _twilio_client()

        from admin_identity import is_admin_phone, ensure_admin_user, _list
        admin_phone = is_admin_phone(phone)
        approved = False
        if admin_phone and (not client or not service_sid):
            raise HTTPException(503, "SMS sign-in for this account needs Twilio configured. Use Google instead.")
        if not client or not service_sid:
            # DEV fallback — accept 123456 only
            approved = (body.code == "123456")
            if not approved:
                raise HTTPException(401, "Invalid or expired code")
        else:
            try:
                check = await asyncio.to_thread(
                    lambda: client.verify.v2.services(service_sid).verification_checks.create(
                        to=phone, code=body.code,
                    )
                )
                approved = check.status == "approved"
            except TwilioRestException as e:
                logger.warning(f"Twilio verify check failed for {phone}: {e}")
                if getattr(e, "code", None) == 20404:
                    # No verification in progress for this number
                    raise HTTPException(400, "No code request was found. Tap 'Send code' first.")
                raise HTTPException(400, "Couldn't verify that code. Try requesting a new one.")
            if not approved:
                raise HTTPException(401, "Invalid or expired code")

        if admin_phone and _list("ADMIN_EMAILS"):
            user_doc = await ensure_admin_user(db, sorted(_list("ADMIN_EMAILS"))[0], provider="sms")
            await db.users.update_many({"phone": phone, "id": {"$ne": user_doc["id"]}}, {"$set": {"phone": None}})
            await db.users.update_one({"id": user_doc["id"]}, {"$set": {"phone": phone, "phone_verified_at": now_iso()}})
            token = create_access_token(user_doc["id"], user_doc["email"], "admin")
            out = {k: v for k, v in user_doc.items() if k not in ("_id", "password_hash")}
            return {"token": token, "user": out, "is_new": False}

        # Find existing user by phone — try a couple of equivalent forms
        existing = await db.users.find_one({"phone": phone})
        if not existing:
            # Also match if a user stored their phone without the leading '+'
            digits = phone.lstrip("+")
            existing = await db.users.find_one({"phone": {"$in": [digits, "+" + digits]}})

        is_new = False
        if existing:
            user_doc = existing
        else:
            is_new = True
            uid = str(uuid.uuid4())
            # Synthetic email guarantees uniqueness and our existing /auth/me works.
            synthetic_email = f"sms+{phone.lstrip('+')}@lumo.passwordless"
            display_name = (body.name or "").strip() or f"Lumo user {phone[-4:]}"
            user_doc = {
                "id": uid,
                "email": synthetic_email,
                "name": display_name,
                "role": "customer",
                "phone": phone,
                "phone_verified_at": now_iso(),
                "password_hash": None,  # passwordless
                "auth_provider": "sms",
                "wallet_balance": 0.0,
                "location": None,
                "service_radius_miles": 25.0,
                "categories": [],
                "storefront": None,
                "created_at": now_iso(),
            }
            await db.users.insert_one(user_doc)
            logger.info(f"Passwordless signup: {phone} → {uid}")

        # Stamp the verified timestamp for returning users too
        await db.users.update_one(
            {"id": user_doc["id"]},
            {"$set": {"phone_verified_at": datetime.now(timezone.utc).isoformat()}},
        )

        token = create_access_token(user_doc["id"], user_doc["email"], user_doc.get("role", "customer"))
        out = {k: v for k, v in user_doc.items() if k != "_id" and k != "password_hash"}
        return {"token": token, "user": out, "is_new": is_new}

    return router

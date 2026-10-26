"""Sign in with Apple: verify Apple's identity token, upsert the user, return a Lumo JWT.

Native iOS tokens have audience = bundle ID (works with no keys). Web tokens use APPLE_SERVICES_ID.
Team ID + Key ID + .p8 key enable refresh-token storage so account deletion can revoke Apple access.
"""
from __future__ import annotations

import logging
import os
import re
import time
import uuid
from datetime import datetime, timezone
from typing import Optional

import httpx
import jwt
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

logger = logging.getLogger("lumo.auth_apple")

APPLE_ISSUER = "https://appleid.apple.com"
BUNDLE_IDS = ["com.golumo.app", "app.golumo.mobile"]
_jwks = jwt.PyJWKClient(f"{APPLE_ISSUER}/auth/keys")
ROLES = ("customer", "provider", "retailer", "restaurant", "real_estate")


def _env(k: str) -> str:
    return (os.environ.get(k) or "").strip()


def _services_id() -> str:
    v = _env("APPLE_SERVICES_ID")
    return v if re.fullmatch(r"[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)+", v) else ""


def _private_key() -> str:
    raw = _env("APPLE_PRIVATE_KEY").replace("\\n", "\n")
    body = re.sub(r"-----(BEGIN|END) PRIVATE KEY-----|\s", "", raw)
    if not re.fullmatch(r"[A-Za-z0-9+/=]{100,}", body):
        return ""
    lines = "\n".join(body[i:i + 64] for i in range(0, len(body), 64))
    return f"-----BEGIN PRIVATE KEY-----\n{lines}\n-----END PRIVATE KEY-----\n"


def _can_exchange() -> bool:
    return bool(re.fullmatch(r"[A-Z0-9]{10}", _env("APPLE_TEAM_ID")) and re.fullmatch(r"[A-Z0-9]{10}", _env("APPLE_KEY_ID"))
                and _private_key())


def _client_secret(client_id: str) -> str:
    now = int(time.time())
    key = _private_key()
    return jwt.encode(
        {"iss": _env("APPLE_TEAM_ID"), "iat": now, "exp": now + 3600, "aud": APPLE_ISSUER, "sub": client_id},
        key, algorithm="ES256", headers={"kid": _env("APPLE_KEY_ID")},
    )


def verify_identity_token(token: str, nonce: Optional[str]) -> dict:
    audiences = BUNDLE_IDS + ([_services_id()] if _services_id() else [])
    try:
        key = _jwks.get_signing_key_from_jwt(token).key
        claims = jwt.decode(token, key, algorithms=["RS256"], issuer=APPLE_ISSUER, audience=audiences, leeway=60)
    except Exception as exc:  # noqa: BLE001
        logger.info(f"apple token rejected: {exc}")
        raise HTTPException(401, "Apple sign-in could not be verified. Try again.")
    if nonce and claims.get("nonce") != nonce:
        raise HTTPException(401, "Apple sign-in could not be verified. Try again.")
    if not claims.get("sub"):
        raise HTTPException(401, "Apple sign-in could not be verified. Try again.")
    return claims


async def _exchange_code(code: str, client_id: str) -> Optional[str]:
    try:
        async with httpx.AsyncClient(timeout=10) as c:
            r = await c.post(f"{APPLE_ISSUER}/auth/token", data={
                "client_id": client_id, "client_secret": _client_secret(client_id),
                "code": code, "grant_type": "authorization_code"})
        if r.status_code == 200:
            return r.json().get("refresh_token")
        logger.warning(f"apple code exchange {r.status_code}: {r.text[:200]}")
    except Exception as exc:  # noqa: BLE001
        logger.warning(f"apple code exchange failed: {exc}")
    return None


async def revoke_apple(user: dict) -> None:
    token, client_id = user.get("apple_refresh_token"), user.get("apple_client_id")
    if not (token and client_id and _can_exchange()):
        return
    try:
        async with httpx.AsyncClient(timeout=10) as c:
            await c.post(f"{APPLE_ISSUER}/auth/revoke", data={
                "client_id": client_id, "client_secret": _client_secret(client_id),
                "token": token, "token_type_hint": "refresh_token"})
    except Exception as exc:  # noqa: BLE001
        logger.warning(f"apple revoke failed: {exc}")


class AppleLogin(BaseModel):
    identity_token: str
    nonce: Optional[str] = None
    authorization_code: Optional[str] = None
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    role: Optional[str] = None
    ref_code: Optional[str] = None
    signup_source: Optional[dict] = None
    recruit_city_slug: Optional[str] = None


def create_router(*, db, create_access_token, now_iso) -> APIRouter:
    router = APIRouter(prefix="/api/auth/apple")

    @router.get("/config")
    async def config():
        return {"web_enabled": bool(_services_id()), "services_id": _services_id(), "native_enabled": True}

    @router.post("")
    async def apple_login(body: AppleLogin):
        claims = verify_identity_token(body.identity_token, body.nonce)
        sub, aud = claims["sub"], claims.get("aud")
        email = (claims.get("email") or "").lower().strip()
        name = " ".join(x for x in (body.first_name, body.last_name) if x).strip()

        from admin_identity import is_admin_email, ensure_admin_user
        if email and is_admin_email(email):
            user_doc = await ensure_admin_user(db, email, name=name or None, picture=None)
            await db.users.update_one({"id": user_doc["id"]}, {"$set": {"apple_sub": sub}})
            out = {k: v for k, v in user_doc.items() if k not in ("_id", "password_hash")}
            return {"token": create_access_token(user_doc["id"], email, "admin"), "user": out, "is_new": False}

        existing = await db.users.find_one({"apple_sub": sub}) or (await db.users.find_one({"email": email}) if email else None)
        patch: dict = {"apple_sub": sub, "apple_linked_at": datetime.now(timezone.utc).isoformat()}
        if body.authorization_code and _can_exchange():
            rt = await _exchange_code(body.authorization_code, aud)
            if rt:
                patch.update(apple_refresh_token=rt, apple_client_id=aud)
        is_new = False
        if existing:
            await db.users.update_one({"id": existing["id"]}, {"$set": patch})
            user_doc = {**existing, **patch}
        else:
            if not email:
                raise HTTPException(400, "Apple didn't share an email. Remove Lumo from Apple ID settings and try again.")
            is_new = True
            user_doc = {
                "id": str(uuid.uuid4()), "email": email, "name": name or email.split("@", 1)[0],
                "role": body.role if body.role in ROLES else "customer", "phone": None, "password_hash": None,
                "auth_provider": "apple", "avatar_url": None, "wallet_balance": 0.0, "location": None,
                "service_radius_miles": 25.0, "categories": [], "storefront": None, "created_at": now_iso(), **patch,
            }
            from referrals import apply_signup_attribution
            await apply_signup_attribution(db, user_doc, ref_code=body.ref_code, signup_source=body.signup_source,
                                           recruit_city_slug=body.recruit_city_slug)
            await db.users.insert_one(user_doc)
        out = {k: v for k, v in user_doc.items() if k not in ("_id", "password_hash", "apple_refresh_token")}
        return {"token": create_access_token(user_doc["id"], user_doc["email"], user_doc.get("role", "customer")), "user": out, "is_new": is_new}

    return router

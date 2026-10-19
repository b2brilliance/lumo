"""
Emergent-managed Google sign-in.

Flow:
1. Frontend redirects the user to https://auth.emergentagent.com/?redirect=<our /signin>
2. Emergent OAuth → user returns to /signin#session_id=<uuid>
3. Frontend POSTs the session_id to /api/auth/google/exchange
4. Backend calls Emergent's session-data endpoint, gets {email, name, picture}
5. Backend upserts the Lumo user by email and issues a regular Lumo JWT
   (we deliberately keep our own JWT instead of switching the whole app to
   cookie-based sessions — minimal disruption to existing routes).
"""
from __future__ import annotations

import uuid
import logging
from datetime import datetime, timezone

import httpx
from fastapi import APIRouter, HTTPException
from typing import Optional

from pydantic import BaseModel

logger = logging.getLogger("lumo.auth_google")

EMERGENT_SESSION_URL = "https://demobackend.emergentagent.com/auth/v1/env/oauth/session-data"


class GoogleExchange(BaseModel):
    session_id: str
    ref_code: Optional[str] = None
    signup_source: Optional[dict] = None
    recruit_city_slug: Optional[str] = None


def create_router(*, db, create_access_token, now_iso) -> APIRouter:
    router = APIRouter(prefix="/api/auth/google")

    @router.post("/exchange")
    async def exchange(body: GoogleExchange):
        """Trade an Emergent OAuth session_id for a Lumo JWT.

        REMINDER: DO NOT HARDCODE THE URL, OR ADD ANY FALLBACKS OR REDIRECT URLS, THIS BREAKS THE AUTH.
        """
        if not body.session_id or len(body.session_id) < 8:
            raise HTTPException(400, "Missing session_id")
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                resp = await client.get(
                    EMERGENT_SESSION_URL,
                    headers={"X-Session-ID": body.session_id},
                )
        except httpx.HTTPError as e:
            logger.warning(f"Emergent OAuth session-data fetch failed: {e}")
            raise HTTPException(502, "Couldn't reach the Google sign-in service. Try again.")
        if resp.status_code != 200:
            logger.warning(f"Emergent OAuth returned {resp.status_code}: {resp.text[:200]}")
            raise HTTPException(401, "That sign-in link has expired. Try again.")
        data = resp.json()
        email = (data.get("email") or "").lower().strip()
        if not email:
            raise HTTPException(401, "Google didn't share an email address.")
        name = (data.get("name") or "").strip() or email.split("@", 1)[0]
        picture = data.get("picture")

        from admin_identity import is_admin_email, ensure_admin_user
        if is_admin_email(email):
            user_doc = await ensure_admin_user(db, email, name=name, picture=picture)
            await db.users.update_one({"id": user_doc["id"]}, {"$set": {"google_linked_at": now_iso()}})
            token = create_access_token(user_doc["id"], email, "admin")
            out = {k: v for k, v in user_doc.items() if k not in ("_id", "password_hash")}
            return {"token": token, "user": out, "is_new": False}

        # Upsert by email
        existing = await db.users.find_one({"email": email})
        is_new = False
        if existing:
            user_doc = existing
            # Light update — keep their existing role / name / phone untouched
            patch: dict = {"google_linked_at": datetime.now(timezone.utc).isoformat()}
            if picture and not existing.get("avatar_url"):
                patch["avatar_url"] = picture
            await db.users.update_one({"id": existing["id"]}, {"$set": patch})
        else:
            is_new = True
            uid = str(uuid.uuid4())
            user_doc = {
                "id": uid,
                "email": email,
                "name": name,
                "role": "customer",
                "phone": None,
                "password_hash": None,  # OAuth-only account
                "auth_provider": "google",
                "avatar_url": picture,
                "google_linked_at": datetime.now(timezone.utc).isoformat(),
                "wallet_balance": 0.0,
                "location": None,
                "service_radius_miles": 25.0,
                "categories": [],
                "storefront": None,
                "created_at": now_iso(),
            }
            from referrals import apply_signup_attribution
            await apply_signup_attribution(db, user_doc, ref_code=body.ref_code, signup_source=body.signup_source,
                                           recruit_city_slug=body.recruit_city_slug)
            await db.users.insert_one(user_doc)
            logger.info(f"Google signup: {email} → {uid}")

        token = create_access_token(user_doc["id"], email, user_doc.get("role", "customer"))
        out = {k: v for k, v in user_doc.items() if k not in ("_id", "password_hash")}
        return {"token": token, "user": out, "is_new": is_new}

    return router

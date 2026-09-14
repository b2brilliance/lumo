"""Web Push notifications (VAPID + pywebpush).

Auto-generates a VAPID keypair on first boot, stores it in the
`site_config` collection, exposes:
    GET  /api/push/public-key
    POST /api/push/subscribe
    POST /api/push/unsubscribe
    GET  /api/push/status

...and a helper `send_push_to_user(user_id, title, body, url)` that any
other module can call to fire a push to every registered device.

Subscriptions are stored in `push_subscriptions` with a unique index on
`endpoint`.  Dead subscriptions (410 Gone) are pruned automatically.
"""

from __future__ import annotations

import base64
import json
import logging
import os
import uuid
from datetime import datetime, timezone
from typing import Any, Callable, Dict, Optional

from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import ec
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

logger = logging.getLogger(__name__)


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _b64url(data: bytes) -> str:
    """URL-safe base64 without padding — the format VAPID expects."""
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode("ascii")


class PushSubscription(BaseModel):
    endpoint: str
    keys: Dict[str, str]  # {"p256dh": "...", "auth": "..."}


class PushUnsubscribe(BaseModel):
    endpoint: str


VAPID_CONFIG_KEY = "vapid_keypair"
VAPID_SUBJECT = os.environ.get("VAPID_SUBJECT", "mailto:julius.a.mason@gmail.com")


async def _get_or_create_vapid(db) -> Dict[str, str]:
    """Return {"public_key": str, "private_key_pem": str}. Generates and
    persists on first call."""
    doc = await db.site_config.find_one({"key": VAPID_CONFIG_KEY}, {"_id": 0})
    if doc and doc.get("public_key") and doc.get("private_key_pem"):
        return doc

    # Generate a fresh P-256 keypair.
    priv = ec.generate_private_key(ec.SECP256R1())
    priv_pem = priv.private_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PrivateFormat.PKCS8,
        encryption_algorithm=serialization.NoEncryption(),
    ).decode("ascii")

    pub_numbers = priv.public_key().public_numbers()
    # Uncompressed EC public key = 0x04 | X (32 bytes) | Y (32 bytes) → 65 bytes total.
    pub_raw = b"\x04" + pub_numbers.x.to_bytes(32, "big") + pub_numbers.y.to_bytes(32, "big")
    pub_b64 = _b64url(pub_raw)

    payload = {
        "key": VAPID_CONFIG_KEY,
        "public_key": pub_b64,
        "private_key_pem": priv_pem,
        "subject": VAPID_SUBJECT,
        "created_at": _now_iso(),
    }
    await db.site_config.update_one(
        {"key": VAPID_CONFIG_KEY},
        {"$setOnInsert": payload},
        upsert=True,
    )
    logger.info("[push] Generated new VAPID keypair")
    return payload


async def send_push_to_user(
    db,
    *,
    user_id: str,
    title: str,
    body: str,
    url: Optional[str] = None,
    tag: Optional[str] = None,
) -> int:
    """Fire a push notification to every subscription for user_id.
    Returns the number of successful deliveries. Prunes dead endpoints."""
    if not user_id:
        return 0
    try:
        from pywebpush import webpush, WebPushException
    except ImportError:
        logger.warning("[push] pywebpush not installed; skipping")
        return 0

    vapid = await _get_or_create_vapid(db)
    subs = await db.push_subscriptions.find({"user_id": user_id}, {"_id": 0}).to_list(50)
    if not subs:
        return 0

    payload = json.dumps({
        "title": title,
        "body": body,
        "url": url or "/",
        "tag": tag or "lumo",
    })
    ok = 0
    for sub in subs:
        try:
            webpush(
                subscription_info={"endpoint": sub["endpoint"], "keys": sub["keys"]},
                data=payload,
                vapid_private_key=vapid["private_key_pem"],
                vapid_claims={"sub": vapid.get("subject") or VAPID_SUBJECT},
            )
            ok += 1
        except WebPushException as e:
            status = getattr(getattr(e, "response", None), "status_code", None)
            if status in (404, 410):
                # Subscription gone → clean up.
                await db.push_subscriptions.delete_one({"endpoint": sub["endpoint"]})
                logger.info(f"[push] pruned dead subscription for user={user_id}")
            else:
                logger.warning(f"[push] webpush failed status={status} err={e}")
        except Exception as e:  # noqa: BLE001
            logger.warning(f"[push] send failed for user={user_id}: {e}")
    return ok


def create_router(*, db, get_current_user: Callable) -> APIRouter:
    r = APIRouter(prefix="/api/push", tags=["push"])

    @r.get("/public-key")
    async def public_key():
        v = await _get_or_create_vapid(db)
        return {"public_key": v["public_key"]}

    @r.post("/subscribe")
    async def subscribe(payload: PushSubscription, user: dict = Depends(get_current_user)):
        # Upsert on endpoint so re-subscribing from the same browser
        # doesn't create duplicates.
        doc = {
            "id": str(uuid.uuid4()),
            "user_id": user["id"],
            "endpoint": payload.endpoint,
            "keys": payload.keys,
            "created_at": _now_iso(),
        }
        await db.push_subscriptions.update_one(
            {"endpoint": payload.endpoint},
            {"$set": {**doc}},
            upsert=True,
        )
        return {"ok": True}

    @r.post("/unsubscribe")
    async def unsubscribe(payload: PushUnsubscribe, user: dict = Depends(get_current_user)):
        res = await db.push_subscriptions.delete_one({
            "endpoint": payload.endpoint,
            "user_id": user["id"],
        })
        return {"ok": True, "deleted": res.deleted_count}

    @r.get("/status")
    async def status(user: dict = Depends(get_current_user)):
        count = await db.push_subscriptions.count_documents({"user_id": user["id"]})
        return {"subscriptions": count}

    return r

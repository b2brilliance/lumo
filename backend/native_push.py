"""Native app push (Firebase Cloud Messaging) for iOS + Android.

Devices register their FCM token. A background loop forwards every new in-app
notification (db.notifications) to the user's phones, so all existing order,
job, message and payout alerts reach the apps without touching each call site.
Needs FIREBASE_SERVICE_ACCOUNT_JSON; without it notifications are marked skipped.
"""
from __future__ import annotations

import asyncio
import json
import logging
import os
from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi import APIRouter, Depends
from pydantic import BaseModel

logger = logging.getLogger("lumo.native_push")
_app = None


def _firebase():
    global _app
    if _app is not None:
        return _app
    raw = (os.environ.get("FIREBASE_SERVICE_ACCOUNT_JSON") or "").strip()
    if not raw.startswith("{"):
        return None
    import firebase_admin
    from firebase_admin import credentials
    try:
        _app = firebase_admin.initialize_app(credentials.Certificate(json.loads(raw)), name="lumo-push")
    except Exception as exc:  # noqa: BLE001
        logger.warning(f"FIREBASE_SERVICE_ACCOUNT_JSON is invalid: {type(exc).__name__}")
        return None
    return _app


class DeviceToken(BaseModel):
    token: str
    platform: Optional[str] = None


def _send(app, token: str, title: str, body: str, link: str) -> bool:
    from firebase_admin import messaging
    msg = messaging.Message(
        token=token,
        notification=messaging.Notification(title=title, body=body),
        data={"link": link or "/"},
        apns=messaging.APNSConfig(payload=messaging.APNSPayload(aps=messaging.Aps(sound="default"))),
        android=messaging.AndroidConfig(priority="high", notification=messaging.AndroidNotification(sound="default")),
    )
    try:
        messaging.send(msg, app=app)
        return True
    except (messaging.UnregisteredError, messaging.SenderIdMismatchError):
        raise
    except Exception as exc:  # noqa: BLE001
        logger.warning(f"fcm send failed: {exc}")
        return False


async def forward_pending(db) -> int:
    since = (datetime.now(timezone.utc) - timedelta(minutes=15)).isoformat()
    pending = await db.notifications.find(
        {"native_pushed": {"$exists": False}, "created_at": {"$gte": since}}, {"_id": 0}).to_list(200)
    if not pending:
        return 0
    app = _firebase()
    sent = 0
    for n in pending:
        await db.notifications.update_one({"id": n["id"]}, {"$set": {"native_pushed": bool(app)}})
        if not app:
            continue
        devices = await db.device_tokens.find({"user_id": n.get("user_id")}, {"_id": 0}).to_list(20)
        for d in devices:
            try:
                ok = await asyncio.to_thread(_send, app, d["token"], n.get("title") or "Lumo", n.get("body") or "", n.get("link") or "/")
                sent += int(ok)
            except Exception:  # noqa: BLE001
                await db.device_tokens.delete_one({"token": d["token"]})
    return sent


async def push_loop(db):
    while True:
        try:
            await forward_pending(db)
        except Exception as exc:  # noqa: BLE001
            logger.warning(f"native push loop error: {exc}")
        await asyncio.sleep(10)


def create_router(*, db, get_current_user) -> APIRouter:
    router = APIRouter(prefix="/api/push/native")

    @router.post("/register")
    async def register(body: DeviceToken, user: dict = Depends(get_current_user)):
        await db.device_tokens.update_one(
            {"token": body.token},
            {"$set": {"token": body.token, "user_id": user["id"], "platform": body.platform,
                      "updated_at": datetime.now(timezone.utc).isoformat()}},
            upsert=True)
        return {"ok": True, "configured": _firebase() is not None}

    @router.post("/unregister")
    async def unregister(body: DeviceToken, user: dict = Depends(get_current_user)):
        await db.device_tokens.delete_one({"token": body.token, "user_id": user["id"]})
        return {"ok": True}

    return router

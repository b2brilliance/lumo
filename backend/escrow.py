"""
Escrow + proof-of-delivery release flow.

Lifecycle (applies to both `jobs` and `orders` collections):

  open / accepted / in_progress
        │
        ▼  POST /…/mark-delivered  (provider, photos required for physical)
  awaiting_confirmation
        │
        ├── POST /…/confirm-receipt  → status=completed, wallet credited
        ├── POST /…/dispute          → status=disputed, payment held
        └── 24h timer in the asyncio scheduler → status=auto_confirmed,
                                                  wallet credited

Photos: stored as base64 data URLs inside the document (max 3 per release,
~800KB each enforced at the API edge). Good enough for v1; we'll move to
the object-storage layer for v2 when call volume warrants it.

Payments are simulated per the user's direction — we credit the provider's
`wallet_balance` directly. The Stripe Connect payout wiring will be a
separate task once a paid bank account is ready.
"""
from __future__ import annotations

import os
import uuid
import logging
import asyncio
from datetime import datetime, timezone, timedelta
from typing import Optional, List, Literal

from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel, Field

logger = logging.getLogger("lumo.escrow")

# Categories where the provider MUST upload at least one photo to mark a job
# delivered. Anything else is treated as non-physical — photos are optional.
PHYSICAL_CATEGORIES = {"delivery", "courier", "moving", "ride_share", "towing"}

AUTO_RELEASE_HOURS = int(os.environ.get("ESCROW_AUTO_RELEASE_HOURS", "24"))
MAX_PHOTOS = 3
MAX_PHOTO_BYTES = 1_200_000  # ≈ 1.2 MB; data URL with base64 ≈ 900KB raw


class MarkDelivered(BaseModel):
    photos: List[str] = Field(default_factory=list)
    note: Optional[str] = Field(default=None, max_length=1000)


class DisputeBody(BaseModel):
    reason: Optional[str] = Field(default=None, max_length=2000)


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _iso() -> str:
    return _now().isoformat()


def _clean(doc: dict) -> dict:
    return {k: v for k, v in (doc or {}).items() if k != "_id"}


def _validate_photos(photos: List[str], require: bool) -> List[str]:
    if not photos:
        if require:
            raise HTTPException(400, "Upload at least one photo as proof of delivery.")
        return []
    if len(photos) > MAX_PHOTOS:
        raise HTTPException(400, f"Up to {MAX_PHOTOS} photos allowed.")
    out: List[str] = []
    for p in photos:
        if not isinstance(p, str) or not p:
            continue
        # Accept either http(s) URLs or data: URIs
        if not (p.startswith("data:image/") or p.startswith("http://") or p.startswith("https://")):
            raise HTTPException(400, "Each photo must be a data URL (data:image/…) or an https URL.")
        if len(p) > MAX_PHOTO_BYTES:
            raise HTTPException(400, "One of the photos is too large. Keep each under 1 MB.")
        out.append(p)
    if require and not out:
        raise HTTPException(400, "Upload at least one photo as proof of delivery.")
    return out


# ───────────────────────────────────────────────────────────────────────────────
# Auto-release scheduler — runs forever, started from server.py @startup
# ───────────────────────────────────────────────────────────────────────────────
async def auto_release_loop(*, db, credit_provider, interval_seconds: int = 300) -> None:
    """Every `interval_seconds`, release escrow payments that have been
    `awaiting_confirmation` for more than `AUTO_RELEASE_HOURS`."""
    logger.info(
        f"Escrow auto-release scheduler started (interval={interval_seconds}s, "
        f"window={AUTO_RELEASE_HOURS}h)"
    )
    while True:
        try:
            cutoff = (_now() - timedelta(hours=AUTO_RELEASE_HOURS)).isoformat()
            for coll_name, coll in (("jobs", db.jobs), ("orders", db.orders)):
                async for doc in coll.find({
                    "delivery_status": "awaiting_confirmation",
                    "delivered_at": {"$lt": cutoff},
                }):
                    try:
                        await _release_payment(
                            coll=coll, doc=doc, db=db,
                            credit_provider=credit_provider,
                            kind=coll_name, auto=True,
                        )
                    except Exception as e:  # pragma: no cover
                        logger.error(f"auto_release {coll_name} {doc.get('id')} failed: {e}")
        except Exception as e:  # pragma: no cover
            logger.error(f"auto_release_loop tick failed: {e}")
        await asyncio.sleep(interval_seconds)


# ───────────────────────────────────────────────────────────────────────────────
# Payment release (shared between confirm-receipt & auto-release)
# ───────────────────────────────────────────────────────────────────────────────
async def _release_payment(*, coll, doc: dict, db, credit_provider, kind: str, auto: bool) -> None:
    """Credit the provider's wallet with the remaining due and mark the row
    completed. Idempotent — does nothing if already released."""
    if doc.get("payment_released_at"):
        return

    provider_id = doc.get("provider_id")
    if not provider_id:
        logger.warning(f"{kind} {doc.get('id')} has no provider_id — skipping release")
        # Still mark completed to clear the queue.
        await coll.update_one(
            {"id": doc["id"]},
            {"$set": {
                "status": "completed" if kind == "jobs" else "completed",
                "delivery_status": "auto_confirmed" if auto else "confirmed",
                "delivery_confirmed_at": _iso(),
                "payment_released_at": _iso(),
                "payment_released_amount": 0.0,
            }},
        )
        return

    # Compute the amount we owe the provider on release.
    if kind == "jobs":
        rate = float(doc.get("pay_rate") or 0)
        units = doc.get("estimated_units")
        if doc.get("pay_unit") == "flat":
            gross = rate
        else:
            gross = rate * float(units or 1)
        # Subtract the 10% Lumo commission.
        amount = round(gross * 0.90, 2)
        reason = f"Job '{doc.get('title')}' — payment released"
    else:  # orders
        # The "remaining_total" was the customer's outstanding balance; the
        # provider gets the full item+delivery total minus our 10% (the
        # deposit Lumo already kept).
        item = float(doc.get("item_total") or 0)
        delivery = float(doc.get("delivery_fee") or 0)
        amount = round((item + delivery) * 0.90, 2)
        reason = f"Order {doc.get('id', '')[:8]} — payment released"

    await credit_provider(provider_id=provider_id, amount=amount,
                           reason=reason, ref_id=doc["id"], ref_kind=kind)

    await coll.update_one(
        {"id": doc["id"]},
        {"$set": {
            "status": "completed",
            "delivery_status": "auto_confirmed" if auto else "confirmed",
            "delivery_confirmed_at": _iso(),
            "payment_released_at": _iso(),
            "payment_released_amount": amount,
        }},
    )

    # Notify both sides
    customer_id = doc.get("customer_id")
    await db.notifications.insert_many([
        {
            "id": str(uuid.uuid4()), "user_id": provider_id,
            "type": "payment_released",
            "title": f"You earned ${amount:.2f}",
            "body": f"{'Auto-released ' if auto else 'Released '}for "
                    f"'{doc.get('title') or 'your delivery'}'.",
            "link": "/wallet", "read": False, "created_at": _iso(),
        },
        *([{
            "id": str(uuid.uuid4()), "user_id": customer_id,
            "type": "delivery_confirmed",
            "title": "Delivery confirmed",
            "body": ("We auto-confirmed your delivery after 24 hours." if auto
                     else "Thanks for confirming your delivery."),
            "link": f"/jobs/{doc['id']}" if kind == "jobs" else "/customer",
            "read": False, "created_at": _iso(),
        }] if customer_id else []),
    ])


# ───────────────────────────────────────────────────────────────────────────────
# Router factory
# ───────────────────────────────────────────────────────────────────────────────
def create_router(*, db, get_current_user, credit_provider) -> APIRouter:
    router = APIRouter(prefix="/api")

    async def _load_jobs_row(job_id: str):
        d = await db.jobs.find_one({"id": job_id})
        if not d:
            raise HTTPException(404, "Job not found")
        return d

    async def _load_orders_row(order_id: str):
        d = await db.orders.find_one({"id": order_id})
        if not d:
            raise HTTPException(404, "Order not found")
        return d

    # ─── JOBS ──────────────────────────────────────────────────────────────
    @router.post("/jobs/{job_id}/mark-delivered")
    async def mark_job_delivered(job_id: str, body: MarkDelivered,
                                  user: dict = Depends(get_current_user)):
        job = await _load_jobs_row(job_id)
        if job.get("provider_id") != user["id"]:
            raise HTTPException(403, "Only the assigned provider can mark this delivered.")
        if job.get("delivery_status") in ("awaiting_confirmation", "confirmed", "auto_confirmed"):
            return _clean(job)
        is_physical = job.get("category") in PHYSICAL_CATEGORIES
        photos = _validate_photos(body.photos, require=is_physical)
        patch = {
            "status": "awaiting_confirmation",
            "delivery_status": "awaiting_confirmation",
            "delivery_photos": photos,
            "delivery_note": (body.note or "").strip() or None,
            "delivered_at": _iso(),
            "delivery_is_physical": is_physical,
        }
        await db.jobs.update_one({"id": job_id}, {"$set": patch})
        # Notify the customer
        customer_id = job.get("customer_id")
        if customer_id:
            await db.notifications.insert_one({
                "id": str(uuid.uuid4()), "user_id": customer_id,
                "type": "delivery_awaiting_confirmation",
                "title": "Your delivery is ready",
                "body": "Tap to confirm or dispute — auto-releases in 24 hours.",
                "link": f"/jobs/{job_id}", "read": False, "created_at": _iso(),
            })
        return _clean({**job, **patch})

    @router.post("/jobs/{job_id}/confirm-receipt")
    async def confirm_job_receipt(job_id: str, user: dict = Depends(get_current_user)):
        job = await _load_jobs_row(job_id)
        if job.get("customer_id") != user["id"]:
            raise HTTPException(403, "Only the customer who posted this job can confirm.")
        if job.get("delivery_status") != "awaiting_confirmation":
            raise HTTPException(400, "This job is not awaiting your confirmation.")
        await _release_payment(coll=db.jobs, doc=job, db=db,
                               credit_provider=credit_provider, kind="jobs", auto=False)
        return _clean(await db.jobs.find_one({"id": job_id}))

    @router.post("/jobs/{job_id}/dispute")
    async def dispute_job(job_id: str, body: DisputeBody,
                          user: dict = Depends(get_current_user)):
        job = await _load_jobs_row(job_id)
        if job.get("customer_id") != user["id"]:
            raise HTTPException(403, "Only the customer can dispute.")
        if job.get("delivery_status") not in ("awaiting_confirmation", "delivered"):
            raise HTTPException(400, "Nothing to dispute on this job.")
        await db.jobs.update_one({"id": job_id}, {"$set": {
            "delivery_status": "disputed",
            "dispute_reason": (body.reason or "").strip() or None,
            "disputed_at": _iso(),
        }})
        # Notify provider + admin
        await db.notifications.insert_many([
            {"id": str(uuid.uuid4()), "user_id": job.get("provider_id"),
             "type": "delivery_disputed",
             "title": "Your delivery was disputed",
             "body": "Lumo support is reviewing. Payment is on hold.",
             "link": f"/jobs/{job_id}", "read": False, "created_at": _iso()},
        ] if job.get("provider_id") else [])
        return _clean(await db.jobs.find_one({"id": job_id}))

    # ─── ORDERS (store / restaurant carts) ────────────────────────────────
    @router.post("/orders/{order_id}/mark-delivered")
    async def mark_order_delivered(order_id: str, body: MarkDelivered,
                                    user: dict = Depends(get_current_user)):
        order = await _load_orders_row(order_id)
        if order.get("provider_id") != user["id"]:
            raise HTTPException(403, "Only the assigned driver can mark this delivered.")
        if order.get("delivery_status") in ("awaiting_confirmation", "confirmed", "auto_confirmed"):
            return _clean(order)
        # Orders are always physical deliveries — photos required.
        photos = _validate_photos(body.photos, require=True)
        patch = {
            "status": "awaiting_confirmation",
            "delivery_status": "awaiting_confirmation",
            "delivery_photos": photos,
            "delivery_note": (body.note or "").strip() or None,
            "delivered_at": _iso(),
            "delivery_is_physical": True,
        }
        await db.orders.update_one({"id": order_id}, {"$set": patch})
        if order.get("customer_id"):
            await db.notifications.insert_one({
                "id": str(uuid.uuid4()), "user_id": order["customer_id"],
                "type": "delivery_awaiting_confirmation",
                "title": "Your order is here",
                "body": "Tap to confirm or dispute — auto-releases in 24 hours.",
                "link": "/customer", "read": False, "created_at": _iso(),
            })
        return _clean({**order, **patch})

    @router.post("/orders/{order_id}/confirm-receipt")
    async def confirm_order_receipt(order_id: str, user: dict = Depends(get_current_user)):
        order = await _load_orders_row(order_id)
        if order.get("customer_id") != user["id"]:
            raise HTTPException(403, "Only the customer who placed this order can confirm.")
        if order.get("delivery_status") != "awaiting_confirmation":
            raise HTTPException(400, "This order is not awaiting your confirmation.")
        await _release_payment(coll=db.orders, doc=order, db=db,
                               credit_provider=credit_provider, kind="orders", auto=False)
        return _clean(await db.orders.find_one({"id": order_id}))

    @router.post("/orders/{order_id}/dispute")
    async def dispute_order(order_id: str, body: DisputeBody,
                            user: dict = Depends(get_current_user)):
        order = await _load_orders_row(order_id)
        if order.get("customer_id") != user["id"]:
            raise HTTPException(403, "Only the customer can dispute.")
        if order.get("delivery_status") not in ("awaiting_confirmation", "delivered"):
            raise HTTPException(400, "Nothing to dispute on this order.")
        await db.orders.update_one({"id": order_id}, {"$set": {
            "delivery_status": "disputed",
            "dispute_reason": (body.reason or "").strip() or None,
            "disputed_at": _iso(),
        }})
        if order.get("provider_id"):
            await db.notifications.insert_one({
                "id": str(uuid.uuid4()), "user_id": order["provider_id"],
                "type": "delivery_disputed",
                "title": "Your delivery was disputed",
                "body": "Lumo support is reviewing. Payment is on hold.",
                "link": "/provider", "read": False, "created_at": _iso(),
            })
        return _clean(await db.orders.find_one({"id": order_id}))

    return router

"""Nearby job alerts + delivery runs for workers, and the 'Enjoying Lumo?' rating prompt."""
from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

DELIVERY_CATS = {"delivery", "courier", "errand", "moving", "ride_share", "towing"}
PROMPT_COOLDOWN_DAYS = 120


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


async def alert_nearby_workers(db, haversine, *, lat, lng, title: str, body: str, link: str,
                               category: Optional[str] = None, delivery: bool = False,
                               exclude: Optional[str] = None, ref_id: Optional[str] = None) -> int:
    """Notify every worker whose own travel distance covers (lat, lng) and whose skills match."""
    if lat is None or lng is None:
        return 0
    q = {"role": "provider", "location.lat": {"$ne": None}, "location.lng": {"$ne": None}}
    cursor = db.users.find(q, {"_id": 0, "id": 1, "location": 1, "service_radius_miles": 1, "categories": 1})
    sent = 0
    async for p in cursor:
        if p["id"] == exclude:
            continue
        cats = set(p.get("categories") or [])
        if delivery and cats and not (cats & DELIVERY_CATS):
            continue
        if category and cats and category not in cats:
            continue
        loc = p["location"]
        miles = haversine(float(lat), float(lng), float(loc["lat"]), float(loc["lng"]))
        if miles > float(p.get("service_radius_miles") or 25.0):
            continue
        await db.notifications.insert_one({
            "id": str(uuid.uuid4()), "user_id": p["id"], "type": "nearby_job",
            "title": title, "body": f"{body} · {miles:.1f} mi away", "link": link,
            "ref_id": ref_id, "read": False, "created_at": _now(),
        })
        sent += 1
        if sent >= 300:
            break
    return sent


class Feedback(BaseModel):
    message: str = Field(..., min_length=2, max_length=2000)


class PromptAnswer(BaseModel):
    answer: str  # happy | unhappy | later


def create_router(*, db, get_current_user, require_role, haversine) -> APIRouter:
    r = APIRouter(prefix="/api")

    @r.get("/provider/delivery-runs")
    async def delivery_runs(user: dict = Depends(require_role("provider"))):
        loc = user.get("location") or {}
        radius = float(user.get("service_radius_miles") or 25.0)
        out = []
        async for o in db.orders.find({"is_cart_order": True, "fulfillment": "delivery", "status": "deposit_paid",
                                       "provider_id": None}, {"_id": 0}).sort("created_at", -1).limit(200):
            pl = o.get("pickup_location") or {}
            miles = None
            if loc.get("lat") is not None and pl.get("lat") is not None:
                miles = haversine(loc["lat"], loc["lng"], pl["lat"], pl["lng"])
                if miles > radius:
                    continue
            out.append({
                "id": o["id"], "store_name": o.get("store_name") or "Local store", "pickup_address": pl.get("address"),
                "dropoff_address": (o.get("delivery_address") or {}).get("address"),
                "distance_miles": round(miles, 1) if miles is not None else None,
                "delivery_miles": o.get("delivery_miles"), "size_class": o.get("size_class"),
                "items": sum(int(ln.get("quantity") or 1) for ln in o.get("lines") or []),
                "payout": (o.get("split") or {}).get("driver"), "created_at": o.get("created_at"),
            })
        return out

    @r.post("/orders/{order_id}/delivered")
    async def mark_delivered(order_id: str, user: dict = Depends(require_role("provider"))):
        o = await db.orders.find_one({"id": order_id}, {"_id": 0})
        if not o or o.get("provider_id") != user["id"]:
            raise HTTPException(404, "Order not found")
        if o.get("status") != "in_progress":
            raise HTTPException(400, "This delivery isn't in progress")
        payout = float((o.get("split") or {}).get("driver") or 0)
        await db.orders.update_one({"id": order_id}, {"$set": {"status": "completed", "delivered_at": _now()}})
        if payout > 0:
            await db.users.update_one({"id": user["id"]}, {"$inc": {"wallet_balance": payout}})
            await db.wallet_transactions.insert_one({
                "id": str(uuid.uuid4()), "user_id": user["id"], "amount": payout, "type": "credit",
                "reason": f"Delivery from {o.get('store_name') or 'store'}", "ref_id": order_id, "created_at": _now()})
        await db.notifications.insert_one({
            "id": str(uuid.uuid4()), "user_id": o["customer_id"], "type": "order_delivered",
            "title": "Your order was delivered", "body": f"{user['name']} dropped off your order. Enjoy!",
            "link": "/orders", "order_id": order_id, "read": False, "created_at": _now()})
        return {"ok": True, "payout": payout}

    @r.get("/me/rate-prompt")
    async def rate_prompt(user: dict = Depends(get_current_user)):
        last = user.get("rate_prompt_at")
        if user.get("rate_prompt_answer") == "happy":
            return {"show": False}
        if last and datetime.fromisoformat(last) > datetime.now(timezone.utc) - timedelta(days=PROMPT_COOLDOWN_DAYS):
            return {"show": False}
        uid = user["id"]
        two_h = (datetime.now(timezone.utc) - timedelta(hours=2)).isoformat()
        done = await db.orders.find_one({"customer_id": uid, "$or": [
            {"status": "completed"},
            {"fulfillment": "pickup", "status": "paid", "paid_at": {"$lte": two_h}}]}, {"_id": 1})
        if not done:
            done = await db.jobs.find_one({"$or": [{"customer_id": uid}, {"provider_id": uid}], "status": "completed"}, {"_id": 1})
        return {"show": bool(done)}

    @r.post("/me/rate-prompt")
    async def answer_prompt(body: PromptAnswer, user: dict = Depends(get_current_user)):
        await db.users.update_one({"id": user["id"]}, {"$set": {"rate_prompt_at": _now(), "rate_prompt_answer": body.answer}})
        return {"ok": True}

    @r.post("/me/app-feedback")
    async def app_feedback(body: Feedback, user: dict = Depends(get_current_user)):
        await db.contact_submissions.insert_one({
            "id": str(uuid.uuid4()), "name": user.get("name") or "Lumo user", "email": user.get("email"),
            "subject": "[app_feedback] What could be better", "message": body.message.strip(),
            "topic": "app_feedback", "status": "new", "user_id": user["id"], "created_at": _now()})
        return {"ok": True}

    return r

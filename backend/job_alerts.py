"""Nearby job alerts + delivery runs for workers, and the 'Enjoying Lumo?' rating prompt."""
from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone
from typing import Literal, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

DELIVERY_CATS = {"delivery", "courier", "errand", "moving", "ride_share", "towing"}
PROMPT_COOLDOWN_DAYS = 120


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _within_hours(prefs: dict) -> bool:
    h = prefs.get("hours") or {}
    if not h.get("enabled"):
        return True
    try:
        from zoneinfo import ZoneInfo
        now = datetime.now(ZoneInfo(h.get("tz") or "UTC")).strftime("%H:%M")
    except Exception:  # noqa: BLE001
        now = datetime.now(timezone.utc).strftime("%H:%M")
    start, end = h.get("start") or "00:00", h.get("end") or "23:59"
    return start <= now < end if start <= end else (now >= start or now < end)


def wants_alert(prefs: Optional[dict], *, delivery: bool, category: Optional[str]) -> bool:
    prefs = prefs or {}
    if prefs.get("off_duty") or not _within_hours(prefs):
        return False
    if delivery:
        return prefs.get("delivery_runs", True)
    cats = prefs.get("categories")
    return not cats or not category or category in cats


async def alert_nearby_workers(db, haversine, *, lat, lng, title: str, body: str, link: str,
                               category: Optional[str] = None, delivery: bool = False,
                               exclude: Optional[str] = None, ref_id: Optional[str] = None) -> int:
    """Notify every worker whose own travel distance covers (lat, lng), whose skills match and who is on duty."""
    if lat is None or lng is None:
        return 0
    q = {"role": "provider", "location.lat": {"$ne": None}, "location.lng": {"$ne": None}}
    cursor = db.users.find(q, {"_id": 0, "id": 1, "location": 1, "service_radius_miles": 1, "categories": 1, "alert_prefs": 1})
    sent = 0
    async for p in cursor:
        if p["id"] == exclude or not wants_alert(p.get("alert_prefs"), delivery=delivery, category=category):
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
    answer: Literal["happy", "unhappy", "later"]


class Hours(BaseModel):
    enabled: bool = False
    start: str = Field("08:00", pattern=r"^([01]\d|2[0-3]):[0-5]\d$")
    end: str = Field("20:00", pattern=r"^([01]\d|2[0-3]):[0-5]\d$")
    tz: str = "UTC"


class AlertPrefs(BaseModel):
    off_duty: bool = False
    delivery_runs: bool = True
    categories: list[str] = []
    hours: Hours = Hours()


class Ping(BaseModel):
    lat: float
    lng: float
    heading: Optional[float] = None
    speed: Optional[float] = None


def create_router(*, db, get_current_user, require_role, haversine) -> APIRouter:
    r = APIRouter(prefix="/api")

    @r.get("/provider/delivery-runs")
    async def delivery_runs(user: dict = Depends(require_role("provider"))):
        loc = user.get("location") or {}
        radius = float(user.get("service_radius_miles") or 25.0)
        cats = set(user.get("categories") or [])
        if loc.get("lat") is None or (cats and not (cats & DELIVERY_CATS)):
            return []
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
        res = await db.orders.update_one({"id": order_id, "provider_id": user["id"], "status": "in_progress"},
                                         {"$set": {"status": "completed", "delivered_at": _now()}})
        if not res.modified_count:
            raise HTTPException(400, "This delivery isn't in progress")
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

    @r.get("/provider/alert-settings")
    async def get_alert_settings(user: dict = Depends(require_role("provider"))):
        return {**AlertPrefs(**(user.get("alert_prefs") or {})).model_dump(), "skills": user.get("categories") or []}

    @r.put("/provider/alert-settings")
    async def put_alert_settings(body: AlertPrefs, user: dict = Depends(require_role("provider"))):
        try:
            from zoneinfo import ZoneInfo
            ZoneInfo(body.hours.tz)
        except Exception:  # noqa: BLE001
            raise HTTPException(400, "Unknown time zone")
        prefs = body.model_dump()
        await db.users.update_one({"id": user["id"]}, {"$set": {"alert_prefs": prefs}})
        return {**prefs, "skills": user.get("categories") or []}

    @r.post("/orders/{order_id}/location")
    async def ping_order_location(order_id: str, body: Ping, user: dict = Depends(require_role("provider"))):
        payload = {**body.model_dump(), "updated_at": _now()}
        res = await db.orders.update_one({"id": order_id, "provider_id": user["id"], "status": "in_progress"},
                                         {"$set": {"provider_live_location": payload}})
        if not res.matched_count:
            raise HTTPException(404, "No active delivery")
        return {"ok": True}

    @r.get("/orders/{order_id}/track")
    async def track_order(order_id: str, user: dict = Depends(get_current_user)):
        o = await db.orders.find_one({"id": order_id, "is_cart_order": True}, {"_id": 0})
        if not o or user["id"] not in (o.get("customer_id"), o.get("provider_id"), o.get("store_id")) and user.get("role") != "admin":
            raise HTTPException(404, "Order not found")
        drv, dest = o.get("provider_live_location"), o.get("delivery_address") or {}
        eta = None
        if drv and dest.get("lat") is not None and o["status"] == "in_progress":
            eta = max(1, round(haversine(drv["lat"], drv["lng"], dest["lat"], dest["lng"]) / 20.0 * 60))
        return {"id": o["id"], "status": o["status"], "store_name": o.get("store_name"), "driver_name": o.get("provider_name"),
                "pickup": o.get("pickup_location"), "dropoff": dest, "driver": drv, "eta_minutes": eta,
                "delivered_at": o.get("delivered_at"), "is_driver": user["id"] == o.get("provider_id")}

    @r.get("/provider/busy-map")
    async def busy_map(tz: str = "UTC", user: dict = Depends(require_role("provider"))):
        try:
            from zoneinfo import ZoneInfo
            local = datetime.now(ZoneInfo(tz))
        except Exception:  # noqa: BLE001
            raise HTTPException(400, "Unknown time zone")
        since = local.replace(hour=0, minute=0, second=0, microsecond=0).astimezone(timezone.utc).isoformat()
        loc = user.get("location") or {}
        radius = float(user.get("service_radius_miles") or 25.0)
        cells: dict = {}

        def add(pt, kind):
            if not pt or pt.get("lat") is None:
                return
            if loc.get("lat") is not None and haversine(loc["lat"], loc["lng"], pt["lat"], pt["lng"]) > radius * 1.5:
                return
            key = (round(pt["lat"] * 100) / 100, round(pt["lng"] * 100) / 100)
            c = cells.setdefault(key, {"lat": key[0], "lng": key[1], "orders": 0, "jobs": 0})
            c[kind] += 1

        async for o in db.orders.find({"is_cart_order": True, "paid_at": {"$gte": since}}, {"_id": 0, "pickup_location": 1, "delivery_address": 1}):
            add(o.get("pickup_location") or o.get("delivery_address"), "orders")
        async for j in db.jobs.find({"created_at": {"$gte": since}, "is_remote": {"$ne": True}, "status": {"$nin": ["cancelled", "deleted"]}}, {"_id": 0, "pickup_location": 1, "dropoff_location": 1}):
            add(j.get("pickup_location") or j.get("dropoff_location"), "jobs")
        out = sorted(({**c, "total": c["orders"] + c["jobs"]} for c in cells.values()), key=lambda c: -c["total"])[:200]
        return {"since": since, "center": loc if loc.get("lat") is not None else None, "radius_miles": radius, "cells": out,
                "totals": {"orders": sum(c["orders"] for c in out), "jobs": sum(c["jobs"] for c in out)}}

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

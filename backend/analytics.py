"""
Admin analytics dashboard.

Exposes:
  POST /api/analytics/pageview                     — public, lightweight ping
  GET  /api/admin/analytics/overview               — top-line numbers + 30-day trend
  GET  /api/admin/analytics/visitors               — daily visitor timeseries
  GET  /api/admin/analytics/signups                — paginated user list, filterable
  GET  /api/admin/analytics/orders                 — paginated jobs+orders, filterable
  GET  /api/admin/analytics/providers              — providers + ratings + revenue
  GET  /api/admin/analytics/revenue                — Lumo cut + payouts + GMV totals

All /admin/* routes require role == "admin". The pageview endpoint is public
so we can fire it from any client (including anonymous browsers).
"""
from __future__ import annotations

import uuid
import re
import logging
from datetime import datetime, timezone, timedelta
from typing import Optional, Literal, List

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from pydantic import BaseModel, Field

logger = logging.getLogger("lumo.analytics")

BOT_RE = re.compile(r"bot|crawl|spider|slurp|bing|google|preview", re.I)


class PageviewBody(BaseModel):
    session_id: str = Field(min_length=4, max_length=64)
    path: str = Field(min_length=1, max_length=300)
    referrer: Optional[str] = Field(default=None, max_length=500)
    user_id: Optional[str] = None


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _iso() -> str:
    return _now().isoformat()


def _clean(d: dict) -> dict:
    return {k: v for k, v in (d or {}).items() if k != "_id"}


def _range_filter(field: str, from_iso: Optional[str], to_iso: Optional[str]) -> dict:
    f: dict = {}
    if from_iso: f["$gte"] = from_iso
    if to_iso:   f["$lte"] = to_iso
    return {field: f} if f else {}


def create_router(*, db, require_admin) -> APIRouter:
    router = APIRouter(prefix="/api")

    # ── Pageview ingest (public) ──────────────────────────────────────────
    @router.post("/analytics/pageview")
    async def pageview(body: PageviewBody, request: Request):
        ua = (request.headers.get("user-agent") or "")[:300]
        if BOT_RE.search(ua):
            return {"ok": True, "skipped": "bot"}
        await db.pageviews.insert_one({
            "id": str(uuid.uuid4()),
            "session_id": body.session_id,
            "path": body.path[:300],
            "referrer": (body.referrer or "")[:500] or None,
            "user_id": body.user_id,
            "user_agent": ua,
            "ts": _iso(),
        })
        return {"ok": True}

    # ── Overview ──────────────────────────────────────────────────────────
    @router.get("/admin/analytics/overview")
    async def overview(_admin: dict = Depends(require_admin)):
        now = _now()
        cutoff_24h = (now - timedelta(hours=24)).isoformat()
        cutoff_7d  = (now - timedelta(days=7)).isoformat()
        cutoff_30d = (now - timedelta(days=30)).isoformat()

        async def count(coll, q):
            return await coll.count_documents(q)

        # Visitors
        visitors_24h = len(await db.pageviews.distinct("session_id", {"ts": {"$gte": cutoff_24h}}))
        visitors_7d  = len(await db.pageviews.distinct("session_id", {"ts": {"$gte": cutoff_7d}}))
        visitors_30d = len(await db.pageviews.distinct("session_id", {"ts": {"$gte": cutoff_30d}}))
        pageviews_24h = await count(db.pageviews, {"ts": {"$gte": cutoff_24h}})

        # Signups by role
        signup_totals = {}
        for role in ("customer", "provider", "retailer", "restaurant"):
            signup_totals[role] = await count(db.users, {"role": role})

        new_signups_7d = await count(db.users, {"created_at": {"$gte": cutoff_7d}})
        new_signups_24h = await count(db.users, {"created_at": {"$gte": cutoff_24h}})

        # Orders (jobs + cart orders)
        active_jobs = await count(db.jobs, {"status": {"$in": ["open", "accepted", "in_progress", "awaiting_confirmation"]}})
        completed_jobs = await count(db.jobs, {"status": "completed"})
        active_orders = await count(db.orders, {"status": {"$in": ["deposit_paid", "in_progress", "awaiting_confirmation"]}})
        completed_orders = await count(db.orders, {"status": "completed"})

        # Revenue / GMV — sum payment_released_amount on confirmed/auto-confirmed rows
        async def sum_field(coll, match, field):
            cursor = coll.aggregate([
                {"$match": match},
                {"$group": {"_id": None, "s": {"$sum": f"${field}"}}},
            ])
            async for d in cursor:
                return float(d.get("s") or 0)
            return 0.0

        # Provider payouts = sum of payment_released_amount (= gross × 0.90)
        payout_jobs   = await sum_field(db.jobs,   {"payment_released_at": {"$ne": None}}, "payment_released_amount")
        payout_orders = await sum_field(db.orders, {"payment_released_at": {"$ne": None}}, "payment_released_amount")
        provider_payouts = round(payout_jobs + payout_orders, 2)
        # Lumo's 10% cut implied by the released amounts: gross = payouts / 0.9
        gmv = round(provider_payouts / 0.9, 2) if provider_payouts > 0 else 0.0
        lumo_commission = round(gmv - provider_payouts, 2)

        return {
            "visitors": {
                "last_24h": visitors_24h,
                "last_7d":  visitors_7d,
                "last_30d": visitors_30d,
                "pageviews_24h": pageviews_24h,
            },
            "signups": {
                "totals_by_role": signup_totals,
                "new_24h": new_signups_24h,
                "new_7d":  new_signups_7d,
                "total":   sum(signup_totals.values()),
            },
            "orders": {
                "active_jobs":   active_jobs,
                "completed_jobs": completed_jobs,
                "active_orders":   active_orders,
                "completed_orders": completed_orders,
            },
            "revenue": {
                "gmv": gmv,
                "lumo_commission": lumo_commission,
                "provider_payouts": provider_payouts,
                "commission_rate": 0.10,
            },
        }

    # ── Visitor timeseries ────────────────────────────────────────────────
    @router.get("/admin/analytics/visitors")
    async def visitors(days: int = Query(30, ge=1, le=180),
                       _admin: dict = Depends(require_admin)):
        cutoff = (_now() - timedelta(days=days)).isoformat()
        cursor = db.pageviews.aggregate([
            {"$match": {"ts": {"$gte": cutoff}}},
            {"$project": {
                "day": {"$substr": ["$ts", 0, 10]},
                "session_id": 1,
            }},
            {"$group": {
                "_id": "$day",
                "pageviews": {"$sum": 1},
                "uniq": {"$addToSet": "$session_id"},
            }},
            {"$project": {"_id": 0, "day": "$_id",
                          "pageviews": 1, "visitors": {"$size": "$uniq"}}},
            {"$sort": {"day": 1}},
        ])
        out = [d async for d in cursor]
        # Top paths in window
        cursor2 = db.pageviews.aggregate([
            {"$match": {"ts": {"$gte": cutoff}}},
            {"$group": {"_id": "$path", "count": {"$sum": 1}}},
            {"$sort": {"count": -1}},
            {"$limit": 15},
            {"$project": {"_id": 0, "path": "$_id", "count": 1}},
        ])
        top_paths = [d async for d in cursor2]
        return {"timeseries": out, "top_paths": top_paths}

    # ── Signups list ──────────────────────────────────────────────────────
    @router.get("/admin/analytics/signups")
    async def signups(
        role: Optional[str] = None,
        q: Optional[str] = None,
        from_iso: Optional[str] = None,
        to_iso: Optional[str] = None,
        sort: Literal["new", "old"] = "new",
        limit: int = Query(100, le=500),
        skip: int = 0,
        _admin: dict = Depends(require_admin),
    ):
        f: dict = {}
        if role: f["role"] = role
        f.update(_range_filter("created_at", from_iso, to_iso))
        if q:
            rx = {"$regex": re.escape(q), "$options": "i"}
            f["$or"] = [{"email": rx}, {"name": rx}, {"phone": rx}]
        total = await db.users.count_documents(f)
        cursor = db.users.find(f, {"password_hash": 0}).sort("created_at", -1 if sort == "new" else 1).skip(skip).limit(limit)
        items = [_clean(d) async for d in cursor]
        return {"total": total, "items": items}

    # ── Orders list (jobs + cart orders combined) ─────────────────────────
    @router.get("/admin/analytics/orders")
    async def orders_history(
        kind: Optional[Literal["job", "order", "all"]] = "all",
        status: Optional[str] = None,
        from_iso: Optional[str] = None,
        to_iso: Optional[str] = None,
        sort: Literal["new", "old", "value"] = "new",
        limit: int = Query(100, le=500),
        skip: int = 0,
        _admin: dict = Depends(require_admin),
    ):
        results: list = []

        # Jobs
        if kind in (None, "all", "job"):
            f: dict = {}
            if status: f["status"] = status
            f.update(_range_filter("created_at", from_iso, to_iso))
            cursor = db.jobs.find(f).sort("created_at", -1)
            async for d in cursor:
                gross = (d.get("pay_rate") or 0) * (d.get("estimated_units") or 1 if d.get("pay_unit") != "flat" else 1)
                results.append({
                    "id": d["id"],
                    "kind": "job",
                    "title": d.get("title"),
                    "category": d.get("category"),
                    "status": d.get("status"),
                    "delivery_status": d.get("delivery_status"),
                    "customer_id": d.get("customer_id"),
                    "customer_name": d.get("customer_name"),
                    "provider_id": d.get("provider_id"),
                    "provider_name": d.get("provider_name"),
                    "amount": round(gross, 2),
                    "created_at": d.get("created_at"),
                    "completed_at": d.get("completed_at") or d.get("delivery_confirmed_at"),
                })

        # Cart orders
        if kind in (None, "all", "order"):
            f = {}
            if status: f["status"] = status
            f.update(_range_filter("created_at", from_iso, to_iso))
            cursor = db.orders.find(f).sort("created_at", -1)
            async for d in cursor:
                amount = float(d.get("item_total") or 0) + float(d.get("delivery_fee") or 0)
                results.append({
                    "id": d["id"],
                    "kind": "order",
                    "title": f"Cart · {d.get('retailer_name') or d.get('restaurant_name') or 'Store'}",
                    "category": "retail",
                    "status": d.get("status"),
                    "delivery_status": d.get("delivery_status"),
                    "customer_id": d.get("customer_id"),
                    "customer_name": d.get("customer_name"),
                    "provider_id": d.get("provider_id"),
                    "provider_name": d.get("provider_name") or d.get("retailer_name") or d.get("restaurant_name"),
                    "amount": round(amount, 2),
                    "created_at": d.get("created_at"),
                    "completed_at": d.get("completed_at") or d.get("delivery_confirmed_at"),
                })

        if sort == "value":
            results.sort(key=lambda r: r["amount"], reverse=True)
        elif sort == "old":
            results.sort(key=lambda r: r.get("created_at") or "")
        else:
            results.sort(key=lambda r: r.get("created_at") or "", reverse=True)

        total = len(results)
        return {"total": total, "items": results[skip:skip + limit]}

    # ── Providers + ratings + revenue ─────────────────────────────────────
    @router.get("/admin/analytics/providers")
    async def providers_list(
        q: Optional[str] = None,
        sort: Literal["revenue", "rating", "newest"] = "revenue",
        limit: int = Query(100, le=500),
        skip: int = 0,
        _admin: dict = Depends(require_admin),
    ):
        f: dict = {"role": "provider"}
        if q:
            rx = {"$regex": re.escape(q), "$options": "i"}
            f["$or"] = [{"name": rx}, {"email": rx}, {"phone": rx}]
        users = [u async for u in db.users.find(f, {"password_hash": 0})]
        out = []
        for u in users:
            uid = u["id"]
            # Sum released payouts
            paid_jobs   = db.jobs.aggregate([
                {"$match": {"provider_id": uid, "payment_released_at": {"$ne": None}}},
                {"$group": {"_id": None, "s": {"$sum": "$payment_released_amount"},
                            "n": {"$sum": 1}}},
            ])
            paid_orders = db.orders.aggregate([
                {"$match": {"provider_id": uid, "payment_released_at": {"$ne": None}}},
                {"$group": {"_id": None, "s": {"$sum": "$payment_released_amount"},
                            "n": {"$sum": 1}}},
            ])
            payouts = 0.0; jobs_done = 0
            async for d in paid_jobs:   payouts += float(d.get("s") or 0); jobs_done += int(d.get("n") or 0)
            async for d in paid_orders: payouts += float(d.get("s") or 0); jobs_done += int(d.get("n") or 0)
            # Ratings — pull from db.reviews where target_user_id == uid
            rcur = db.reviews.aggregate([
                {"$match": {"target_user_id": uid}},
                {"$group": {"_id": None, "avg": {"$avg": "$rating"}, "n": {"$sum": 1}}},
            ])
            avg_rating = None; reviews_count = 0
            async for d in rcur:
                avg_rating = round(float(d.get("avg") or 0), 2) if d.get("avg") is not None else None
                reviews_count = int(d.get("n") or 0)
            commission_kept = round(payouts / 0.9 * 0.10, 2) if payouts > 0 else 0.0
            out.append({
                "id": uid, "email": u.get("email"), "name": u.get("name"),
                "role": u.get("role"), "phone": u.get("phone"),
                "categories": u.get("categories") or [],
                "wallet_balance": round(float(u.get("wallet_balance") or 0), 2),
                "created_at": u.get("created_at"),
                "payouts_total": round(payouts, 2),
                "lumo_commission_from_provider": commission_kept,
                "gmv_from_provider": round(payouts + commission_kept, 2),
                "jobs_completed": jobs_done,
                "avg_rating": avg_rating,
                "reviews_count": reviews_count,
                "profile_url": f"/u/{uid}",
            })
        if sort == "rating":
            out.sort(key=lambda r: (-(r["avg_rating"] or 0), -(r["reviews_count"] or 0)))
        elif sort == "newest":
            out.sort(key=lambda r: r.get("created_at") or "", reverse=True)
        else:
            out.sort(key=lambda r: -r["payouts_total"])
        total = len(out)
        return {"total": total, "items": out[skip:skip + limit]}

    # ── Revenue breakdown ─────────────────────────────────────────────────
    @router.get("/admin/analytics/revenue")
    async def revenue(days: int = Query(30, ge=1, le=365),
                      _admin: dict = Depends(require_admin)):
        cutoff = (_now() - timedelta(days=days)).isoformat()

        async def bucketed(coll):
            cursor = coll.aggregate([
                {"$match": {"payment_released_at": {"$gte": cutoff}}},
                {"$project": {
                    "day": {"$substr": ["$payment_released_at", 0, 10]},
                    "amount": "$payment_released_amount",
                }},
                {"$group": {"_id": "$day", "payouts": {"$sum": "$amount"}}},
                {"$project": {"_id": 0, "day": "$_id", "payouts": 1}},
            ])
            return [d async for d in cursor]

        jobs_series   = await bucketed(db.jobs)
        orders_series = await bucketed(db.orders)
        # Merge by day
        by_day = {}
        for d in jobs_series + orders_series:
            by_day.setdefault(d["day"], 0.0)
            by_day[d["day"]] += float(d.get("payouts") or 0)
        series = sorted([
            {
                "day": k,
                "provider_payouts": round(v, 2),
                "lumo_commission": round(v / 0.9 * 0.10, 2),
                "gmv": round(v / 0.9, 2),
            }
            for k, v in by_day.items()
        ], key=lambda r: r["day"])
        totals = {
            "provider_payouts": round(sum(r["provider_payouts"] for r in series), 2),
            "lumo_commission":  round(sum(r["lumo_commission"]  for r in series), 2),
            "gmv":              round(sum(r["gmv"]              for r in series), 2),
        }
        return {"days": days, "series": series, "totals": totals}

    return router

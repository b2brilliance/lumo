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


async def _get_cutoff(db) -> str:
    """Return the ISO cutoff timestamp. All analytics queries filter records
    with `created_at`/`ts` >= cutoff so historical/test data can be excluded
    after a fresh reset. Default = epoch (no filtering)."""
    s = await db.analytics_settings.find_one({"_id": "singleton"})
    return (s or {}).get("cutoff_at", "1970-01-01T00:00:00+00:00")


def _merge_cutoff(filter_q: dict, field: str, cutoff: str) -> dict:
    """Inject `field >= cutoff` into an existing Mongo query, preserving any
    existing constraints on the same field via $and."""
    if not cutoff or cutoff.startswith("1970"):
        return filter_q
    existing = filter_q.get(field)
    if existing is None:
        filter_q[field] = {"$gte": cutoff}
        return filter_q
    if isinstance(existing, dict):
        # already a range op — tighten the lower bound
        prev_gte = existing.get("$gte")
        if not prev_gte or prev_gte < cutoff:
            existing["$gte"] = cutoff
        return filter_q
    # exact-value match — promote to $and so both apply
    filter_q["$and"] = filter_q.get("$and", []) + [
        {field: existing},
        {field: {"$gte": cutoff}},
    ]
    filter_q.pop(field, None)
    return filter_q


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
        cutoff = await _get_cutoff(db)
        cutoff_24h = max(cutoff, (now - timedelta(hours=24)).isoformat())
        cutoff_7d  = max(cutoff, (now - timedelta(days=7)).isoformat())
        cutoff_30d = max(cutoff, (now - timedelta(days=30)).isoformat())

        async def count(coll, q):
            return await coll.count_documents(q)

        # Visitors
        visitors_24h = len(await db.pageviews.distinct("session_id", {"ts": {"$gte": cutoff_24h}}))
        visitors_7d  = len(await db.pageviews.distinct("session_id", {"ts": {"$gte": cutoff_7d}}))
        visitors_30d = len(await db.pageviews.distinct("session_id", {"ts": {"$gte": cutoff_30d}}))
        pageviews_24h = await count(db.pageviews, {"ts": {"$gte": cutoff_24h}})

        # Signups by role — only count users who signed up AFTER cutoff
        signup_totals = {}
        for role in ("customer", "provider", "retailer", "restaurant"):
            signup_totals[role] = await count(db.users, _merge_cutoff({"role": role}, "created_at", cutoff))

        new_signups_7d = await count(db.users, {"created_at": {"$gte": cutoff_7d}})
        new_signups_24h = await count(db.users, {"created_at": {"$gte": cutoff_24h}})

        # Orders (jobs + cart orders) — cutoff-filtered
        active_jobs = await count(db.jobs, _merge_cutoff({"status": {"$in": ["open", "accepted", "in_progress", "awaiting_confirmation"]}}, "created_at", cutoff))
        completed_jobs = await count(db.jobs, _merge_cutoff({"status": "completed"}, "created_at", cutoff))
        active_orders = await count(db.orders, _merge_cutoff({"status": {"$in": ["deposit_paid", "in_progress", "awaiting_confirmation"]}}, "created_at", cutoff))
        completed_orders = await count(db.orders, _merge_cutoff({"status": "completed"}, "created_at", cutoff))

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
        # We require the release itself to be AFTER cutoff for accurate revenue tracking.
        payout_jobs   = await sum_field(db.jobs,   {"payment_released_at": {"$gte": cutoff}}, "payment_released_amount")
        payout_orders = await sum_field(db.orders, {"payment_released_at": {"$gte": cutoff}}, "payment_released_amount")
        provider_payouts = round(payout_jobs + payout_orders, 2)
        # Lumo's 10% cut implied by the released amounts: gross = payouts / 0.9
        gmv = round(provider_payouts / 0.9, 2) if provider_payouts > 0 else 0.0
        lumo_commission = round(gmv - provider_payouts, 2)

        return {
            "cutoff_at": cutoff if not cutoff.startswith("1970") else None,
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
        cutoff_global = await _get_cutoff(db)
        cutoff = max(cutoff_global, (_now() - timedelta(days=days)).isoformat())
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
        f = _merge_cutoff(f, "created_at", await _get_cutoff(db))
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
        cutoff = await _get_cutoff(db)

        # Jobs
        if kind in (None, "all", "job"):
            f: dict = {}
            if status: f["status"] = status
            f.update(_range_filter("created_at", from_iso, to_iso))
            f = _merge_cutoff(f, "created_at", cutoff)
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
            f = _merge_cutoff(f, "created_at", cutoff)
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
        f = _merge_cutoff(f, "created_at", await _get_cutoff(db))
        users = [u async for u in db.users.find(f, {"password_hash": 0})]
        out = []
        cutoff = await _get_cutoff(db)
        for u in users:
            uid = u["id"]
            # Sum released payouts (only count releases AFTER cutoff)
            paid_jobs   = db.jobs.aggregate([
                {"$match": {"provider_id": uid, "payment_released_at": {"$gte": cutoff}}},
                {"$group": {"_id": None, "s": {"$sum": "$payment_released_amount"},
                            "n": {"$sum": 1}}},
            ])
            paid_orders = db.orders.aggregate([
                {"$match": {"provider_id": uid, "payment_released_at": {"$gte": cutoff}}},
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
        cutoff_global = await _get_cutoff(db)
        cutoff = max(cutoff_global, (_now() - timedelta(days=days)).isoformat())

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

    # ── Analytics reset (wipe and start over) ─────────────────────────────
    @router.post("/admin/analytics/reset")
    async def reset(_admin: dict = Depends(require_admin)):
        """Wipe pageview history and set a new cutoff so all analytics start
        counting from `now`. Business data (users, jobs, orders, wallets,
        ratings) is preserved — only their inclusion in *analytics totals*
        changes."""
        new_cutoff = _iso()
        deleted = await db.pageviews.delete_many({})
        await db.analytics_settings.update_one(
            {"_id": "singleton"},
            {"$set": {"cutoff_at": new_cutoff, "reset_at": new_cutoff}},
            upsert=True,
        )
        return {
            "cutoff_at": new_cutoff,
            "pageviews_deleted": int(getattr(deleted, "deleted_count", 0)),
            "message": "Analytics reset. All charts start counting from now.",
        }

    @router.get("/admin/analytics/cutoff")
    async def cutoff(_admin: dict = Depends(require_admin)):
        c = await _get_cutoff(db)
        return {"cutoff_at": c if not c.startswith("1970") else None}

    # ── Drill-down: details behind a single metric ─────────────────────────
    @router.get("/admin/analytics/details/{metric}")
    async def metric_details(
        metric: str,
        range_key: str = Query("24h", description="24h | 7d | 30d | all"),
        limit: int = Query(200, le=1000),
        skip: int = 0,
        _admin: dict = Depends(require_admin),
    ):
        """Return the underlying records behind any tile on the dashboard.
        Supported metrics:
          visitors, pageviews, signups, signups_customer, signups_provider,
          signups_retailer, signups_restaurant, active_jobs, completed_jobs,
          active_orders, completed_orders, gmv, commission, payouts,
          top_paths, top_providers.
        """
        cutoff_global = await _get_cutoff(db)
        now = _now()
        delta = {"24h": timedelta(hours=24), "7d": timedelta(days=7),
                 "30d": timedelta(days=30), "all": None}.get(range_key, timedelta(hours=24))
        window_start = max(cutoff_global, (now - delta).isoformat()) if delta else cutoff_global

        # ── Visitors / sessions ───────────────────────────────────────────
        if metric == "visitors":
            cursor = db.pageviews.aggregate([
                {"$match": {"ts": {"$gte": window_start}}},
                {"$group": {
                    "_id": "$session_id",
                    "pageviews": {"$sum": 1},
                    "first_seen": {"$min": "$ts"},
                    "last_seen": {"$max": "$ts"},
                    "user_id": {"$last": "$user_id"},
                    "user_agent": {"$last": "$user_agent"},
                    "paths": {"$addToSet": "$path"},
                    "referrer": {"$last": "$referrer"},
                }},
                {"$sort": {"last_seen": -1}},
                {"$limit": limit + skip},
                {"$skip": skip},
                {"$project": {"_id": 0, "session_id": "$_id",
                              "pageviews": 1, "first_seen": 1, "last_seen": 1,
                              "user_id": 1, "user_agent": 1, "paths": 1, "referrer": 1}},
            ])
            items = [d async for d in cursor]
            total = len(await db.pageviews.distinct("session_id", {"ts": {"$gte": window_start}}))
            return {"metric": metric, "range": range_key, "total": total, "items": items}

        if metric == "pageviews":
            f = {"ts": {"$gte": window_start}}
            total = await db.pageviews.count_documents(f)
            cursor = db.pageviews.find(f).sort("ts", -1).skip(skip).limit(limit)
            items = [_clean(d) async for d in cursor]
            return {"metric": metric, "range": range_key, "total": total, "items": items}

        if metric == "top_paths":
            cursor = db.pageviews.aggregate([
                {"$match": {"ts": {"$gte": window_start}}},
                {"$group": {"_id": "$path",
                            "count": {"$sum": 1},
                            "uniq": {"$addToSet": "$session_id"}}},
                {"$project": {"_id": 0, "path": "$_id", "count": 1,
                              "visitors": {"$size": "$uniq"}}},
                {"$sort": {"count": -1}},
                {"$limit": limit},
            ])
            items = [d async for d in cursor]
            return {"metric": metric, "range": range_key, "total": len(items), "items": items}

        # ── Signups ───────────────────────────────────────────────────────
        if metric == "signups" or metric.startswith("signups_"):
            f = {"created_at": {"$gte": window_start}}
            if metric.startswith("signups_"):
                f["role"] = metric.split("_", 1)[1]
            total = await db.users.count_documents(f)
            cursor = db.users.find(f, {"password_hash": 0}).sort("created_at", -1).skip(skip).limit(limit)
            items = [_clean(d) async for d in cursor]
            return {"metric": metric, "range": range_key, "total": total, "items": items}

        # ── Jobs / orders ────────────────────────────────────────────────
        active_statuses = ["open", "accepted", "in_progress", "awaiting_confirmation", "deposit_paid"]
        if metric in ("active_jobs", "completed_jobs"):
            status_filter = ({"$in": active_statuses}
                             if metric == "active_jobs" else "completed")
            f = _merge_cutoff({"status": status_filter}, "created_at", cutoff_global)
            total = await db.jobs.count_documents(f)
            cursor = db.jobs.find(f).sort("created_at", -1).skip(skip).limit(limit)
            items = []
            async for d in cursor:
                items.append({
                    "id": d["id"], "kind": "job", "title": d.get("title"),
                    "category": d.get("category"), "status": d.get("status"),
                    "customer_name": d.get("customer_name"),
                    "provider_name": d.get("provider_name"),
                    "amount": round(float(d.get("pay_rate") or 0), 2),
                    "created_at": d.get("created_at"),
                    "completed_at": d.get("completed_at"),
                })
            return {"metric": metric, "range": range_key, "total": total, "items": items}

        if metric in ("active_orders", "completed_orders"):
            status_filter = ({"$in": ["deposit_paid", "in_progress", "awaiting_confirmation"]}
                             if metric == "active_orders" else "completed")
            f = _merge_cutoff({"status": status_filter}, "created_at", cutoff_global)
            total = await db.orders.count_documents(f)
            cursor = db.orders.find(f).sort("created_at", -1).skip(skip).limit(limit)
            items = []
            async for d in cursor:
                amount = float(d.get("item_total") or 0) + float(d.get("delivery_fee") or 0)
                items.append({
                    "id": d["id"], "kind": "order",
                    "title": f"Cart · {d.get('retailer_name') or d.get('restaurant_name') or 'Store'}",
                    "status": d.get("status"),
                    "customer_name": d.get("customer_name"),
                    "provider_name": d.get("provider_name") or d.get("retailer_name") or d.get("restaurant_name"),
                    "amount": round(amount, 2),
                    "created_at": d.get("created_at"),
                    "completed_at": d.get("completed_at"),
                })
            return {"metric": metric, "range": range_key, "total": total, "items": items}

        # ── Revenue breakdown — list of releases ──────────────────────────
        if metric in ("gmv", "commission", "payouts"):
            items = []
            for coll, kind in ((db.jobs, "job"), (db.orders, "order")):
                cursor = coll.find({"payment_released_at": {"$gte": window_start}}).sort("payment_released_at", -1)
                async for d in cursor:
                    released = float(d.get("payment_released_amount") or 0)
                    if released <= 0:
                        continue
                    gross = round(released / 0.9, 2)
                    items.append({
                        "id": d["id"], "kind": kind,
                        "title": d.get("title") or f"Order {d.get('retailer_name') or ''}".strip(),
                        "category": d.get("category"),
                        "customer_name": d.get("customer_name"),
                        "provider_name": d.get("provider_name") or d.get("retailer_name") or d.get("restaurant_name"),
                        "gross": gross,
                        "lumo_commission": round(gross - released, 2),
                        "provider_payout": round(released, 2),
                        "released_at": d.get("payment_released_at"),
                    })
            items.sort(key=lambda r: r.get("released_at") or "", reverse=True)
            total = len(items)

            # Aggregate by category for a quick chart on the frontend
            by_category: dict = {}
            for r in items:
                cat = r.get("category") or "uncategorized"
                by_category.setdefault(cat, {"category": cat, "gross": 0.0, "commission": 0.0, "payout": 0.0, "count": 0})
                by_category[cat]["gross"] += r["gross"]
                by_category[cat]["commission"] += r["lumo_commission"]
                by_category[cat]["payout"] += r["provider_payout"]
                by_category[cat]["count"] += 1
            cats = sorted(by_category.values(), key=lambda c: -c["gross"])
            for c in cats:
                c["gross"] = round(c["gross"], 2)
                c["commission"] = round(c["commission"], 2)
                c["payout"] = round(c["payout"], 2)

            return {
                "metric": metric,
                "range": range_key,
                "total": total,
                "items": items[skip:skip + limit],
                "by_category": cats,
            }

        # ── Top providers ─────────────────────────────────────────────────
        if metric == "top_providers":
            # Aggregate released payouts per provider in window
            async def collect(coll):
                cursor = coll.aggregate([
                    {"$match": {"payment_released_at": {"$gte": window_start},
                                "provider_id": {"$ne": None}}},
                    {"$group": {"_id": "$provider_id",
                                "payouts": {"$sum": "$payment_released_amount"},
                                "jobs": {"$sum": 1},
                                "name": {"$last": "$provider_name"}}},
                ])
                return [d async for d in cursor]
            j = await collect(db.jobs)
            o = await collect(db.orders)
            merged: dict = {}
            for d in j + o:
                pid = d["_id"]
                merged.setdefault(pid, {"provider_id": pid, "name": d.get("name"),
                                       "payouts": 0.0, "jobs": 0})
                merged[pid]["payouts"] += float(d.get("payouts") or 0)
                merged[pid]["jobs"] += int(d.get("jobs") or 0)
            out = sorted(merged.values(), key=lambda r: -r["payouts"])
            for r in out:
                r["payouts"] = round(r["payouts"], 2)
                r["commission"] = round(r["payouts"] / 0.9 * 0.10, 2)
                r["gmv"] = round(r["payouts"] + r["commission"], 2)
            return {"metric": metric, "range": range_key,
                    "total": len(out), "items": out[skip:skip + limit]}

        raise HTTPException(404, f"Unknown metric: {metric}")

    return router

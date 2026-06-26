"""
Admin data-management tools.

Lets admins inspect & purge "historical" collections that are not
business-critical: pageviews, signups (users), reviews, ads, schedules,
notifications, distribution channels, audit logs, ad-autopilot history,
chat messages, inquiries.

Orders, jobs, wallet_transactions and withdrawal_requests are
INTENTIONALLY EXCLUDED — those are accounting records.
"""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel


# Collections the admin is allowed to touch, plus a human label and
# whether the document is considered "soft-protected" (e.g. you can wipe
# all reviews except those tied to a paid order — currently we don't
# enforce that; this is a hint for the UI).
ALLOWED_COLLECTIONS: dict[str, dict] = {
    "pageviews":          {"label": "Pageviews",           "ts": "ts"},
    "users":              {"label": "Signups / users",     "ts": "created_at", "warn": "Deletes user accounts. Provider/customer history may break."},
    "reviews":            {"label": "Reviews",             "ts": "created_at"},
    "ads":                {"label": "AI ads (Studio)",     "ts": "created_at"},
    "ad_schedules":       {"label": "Ad schedules",        "ts": "created_at"},
    "ad_autopilot_runs":  {"label": "Auto-pilot history",  "ts": "started_at"},
    "distribution_channels": {"label": "Distribution channels", "ts": "created_at"},
    "notifications":      {"label": "Notifications",       "ts": "created_at"},
    "messages":           {"label": "Chat messages",       "ts": "created_at"},
    "inquiries":          {"label": "Marketplace inquiries", "ts": "created_at"},
    "audit_logs":         {"label": "Audit logs",          "ts": "created_at"},
    "ratings":            {"label": "Ratings",             "ts": "created_at"},
    "credentials_uploads": {"label": "Credential uploads", "ts": "created_at"},
    "rental_bookings":    {"label": "Rental bookings",     "ts": "created_at"},
    "real_estate_listings": {"label": "Real-estate listings", "ts": "created_at"},
    "auto_listings":      {"label": "Auto-sales listings", "ts": "created_at"},
    "marketplace_listings": {"label": "Marketplace listings (P2P)", "ts": "created_at"},
}

# Hard-protected — admins cannot wipe these via this endpoint.
PROTECTED_COLLECTIONS = {
    "jobs", "orders", "wallet_transactions", "withdrawal_requests",
    "stripe_transfers", "site_settings", "analytics_settings",
}


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


class BulkDeleteBody(BaseModel):
    collection: str
    older_than_iso: Optional[str] = None   # if set, only delete docs where ts < this
    confirm: bool = False                  # must be true to actually delete


def create_router(*, db, require_admin) -> APIRouter:
    router = APIRouter(tags=["admin_data"])

    @router.get("/api/admin/data/collections")
    async def list_collections(_admin: dict = Depends(require_admin)):
        """Return every manageable collection + a current document count."""
        out = []
        for key, meta in ALLOWED_COLLECTIONS.items():
            coll = getattr(db, key, None)
            if coll is None:
                continue
            try:
                count = await coll.count_documents({})
            except Exception:
                count = 0
            # Sample latest doc timestamp so the admin can preview age
            try:
                latest = await coll.find_one({}, sort=[(meta["ts"], -1)])
                latest_ts = (latest or {}).get(meta["ts"])
            except Exception:
                latest_ts = None
            out.append({
                "key": key,
                "label": meta["label"],
                "warn": meta.get("warn"),
                "ts_field": meta["ts"],
                "count": count,
                "latest_ts": latest_ts,
            })
        return {
            "collections": out,
            "protected": sorted(PROTECTED_COLLECTIONS),
        }

    @router.get("/api/admin/data/{collection}")
    async def peek(
        collection: str,
        limit: int = Query(50, le=200),
        skip: int = 0,
        _admin: dict = Depends(require_admin),
    ):
        """Peek at the most recent rows in a collection (read-only)."""
        if collection not in ALLOWED_COLLECTIONS:
            raise HTTPException(404, "Unknown or protected collection")
        meta = ALLOWED_COLLECTIONS[collection]
        coll = getattr(db, collection, None)
        if coll is None:
            return {"items": [], "total": 0}
        total = await coll.count_documents({})
        cursor = coll.find({}, {"password_hash": 0}).sort(meta["ts"], -1).skip(skip).limit(limit)
        items = []
        async for d in cursor:
            d.pop("_id", None)
            items.append(d)
        return {"collection": collection, "total": total, "items": items}

    @router.delete("/api/admin/data/{collection}/{doc_id}")
    async def delete_one(
        collection: str,
        doc_id: str,
        _admin: dict = Depends(require_admin),
    ):
        if collection not in ALLOWED_COLLECTIONS:
            raise HTTPException(404, "Unknown or protected collection")
        if collection in PROTECTED_COLLECTIONS:
            raise HTTPException(403, "This collection is protected (orders/revenue).")
        coll = getattr(db, collection, None)
        if coll is None:
            raise HTTPException(404, "No such collection")
        result = await coll.delete_one({"id": doc_id})
        if result.deleted_count == 0:
            # fall back to _id (when documents use Mongo's native ObjectId)
            try:
                from bson import ObjectId
                result = await coll.delete_one({"_id": ObjectId(doc_id)})
            except Exception:
                pass
        return {"ok": True, "deleted": int(getattr(result, "deleted_count", 0))}

    @router.post("/api/admin/data/bulk-delete")
    async def bulk_delete(
        body: BulkDeleteBody,
        _admin: dict = Depends(require_admin),
    ):
        """Wipe all (or older-than-N) documents from a manageable collection.

        Requires `confirm=true` to actually delete (the UI shows a typed
        confirmation modal that flips this on)."""
        if body.collection in PROTECTED_COLLECTIONS:
            raise HTTPException(403, "This collection is protected (orders/revenue).")
        if body.collection not in ALLOWED_COLLECTIONS:
            raise HTTPException(404, "Unknown or protected collection")
        if not body.confirm:
            raise HTTPException(400, "Must set confirm=true to delete.")

        meta = ALLOWED_COLLECTIONS[body.collection]
        coll = getattr(db, body.collection, None)
        if coll is None:
            raise HTTPException(404, "No such collection")

        query: dict = {}
        if body.older_than_iso:
            query[meta["ts"]] = {"$lt": body.older_than_iso}

        # Special guard: never delete admin users
        if body.collection == "users":
            query["role"] = {"$ne": "admin"}

        result = await coll.delete_many(query)
        deleted = int(getattr(result, "deleted_count", 0))

        # Write an audit log entry (best-effort; ignored if audit_logs missing)
        try:
            await db.audit_logs.insert_one({
                "id": f"audit_{int(datetime.now().timestamp()*1000)}",
                "action": "bulk_delete",
                "collection": body.collection,
                "older_than_iso": body.older_than_iso,
                "deleted_count": deleted,
                "created_at": _now_iso(),
            })
        except Exception:
            pass

        return {
            "ok": True,
            "collection": body.collection,
            "deleted": deleted,
            "older_than_iso": body.older_than_iso,
        }

    return router

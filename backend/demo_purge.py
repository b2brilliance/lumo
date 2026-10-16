"""One-click purge of demo content and test accounts (admin only)."""
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

import demo_filter

CONTENT = [("jobs", "customer_id"), ("listings", "seller_id"), ("rentals", "owner_id"),
           ("real_estate", "owner_id"), ("autos", "owner_id"), ("inventory", "owner_id")]
LINKED_FIELDS = ["user_id", "owner_id", "customer_id", "seller_id", "buyer_id", "author_id",
                 "sender_id", "host_id", "reviewer_id"]
SKIP = {"users", "site_settings", "site_config", "pageviews", "audit_logs"} | {c for c, _ in CONTENT}
FLAG_OR = [{"is_demo": True}, {"is_global_demo": True}, {"is_career_demo": True}, {"seeded": {"$exists": True}}]
PURGE_FLAG_ID = "demo_purge"


class PurgeBody(BaseModel):
    confirm: str


async def _plan(db, admin_id: str):
    users_q = {"$or": [{"email": {"$regex": demo_filter.TEST_EMAIL_REGEX, "$options": "i"}}, {"is_test": True}],
               "id": {"$ne": admin_id}, "role": {"$exists": True}}
    test_ids = [u["id"] async for u in db.users.find(users_q, {"id": 1}) if u.get("id")]
    plan = [(c, {"$or": FLAG_OR + [{f: {"$in": test_ids}}]}) for c, f in CONTENT]
    for c in await db.list_collection_names():
        if c in SKIP:
            continue
        plan.append((c, {"$or": [{f: {"$in": test_ids}} for f in LINKED_FIELDS]}))
    return users_q, plan


def create_router(*, db, require_admin) -> APIRouter:
    router = APIRouter(prefix="/api/admin/demo")

    @router.get("/purge-preview")
    async def preview(admin: dict = Depends(require_admin)):
        users_q, plan = await _plan(db, admin["id"])
        counts = {}
        for c, q in plan:
            n = await db[c].count_documents(q)
            if n:
                counts[c] = counts.get(c, 0) + n
        users = await db.users.count_documents(users_q)
        flag = await db.site_settings.find_one({"_id": PURGE_FLAG_ID}, {"_id": 0})
        return {"collections": counts, "test_users": users, "total": sum(counts.values()) + users, "last_purge": flag}

    @router.post("/purge")
    async def purge(body: PurgeBody, admin: dict = Depends(require_admin)):
        if body.confirm != "PURGE":
            raise HTTPException(400, "Type PURGE to confirm")
        users_q, plan = await _plan(db, admin["id"])
        deleted = {}
        for c, q in plan:
            r = await db[c].delete_many(q)
            if r.deleted_count:
                deleted[c] = deleted.get(c, 0) + r.deleted_count
        r = await db.users.delete_many(users_q)
        deleted["users"] = r.deleted_count
        summary = {"purged_at": datetime.now(timezone.utc).isoformat(), "by": admin.get("email"), "deleted": deleted}
        await db.site_settings.update_one({"_id": PURGE_FLAG_ID}, {"$set": summary}, upsert=True)
        demo_filter._cache["at"] = 0.0
        return {"ok": True, **summary}

    return router

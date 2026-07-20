"""
Admin CRUD — Users + unified Content management.

Provides two families of endpoints:

  Users:
    GET    /api/admin/users               list + search + pagination
    PATCH  /api/admin/users/{user_id}     edit role, wallet_balance, name, banned
    DELETE /api/admin/users/{user_id}     hard delete a user

  Content (unified across listings / rentals / autos / inventory / jobs):
    GET    /api/admin/content             search across types
    PATCH  /api/admin/content/{type}/{id} edit basic fields (title, price, status)
    DELETE /api/admin/content/{type}/{id} hard delete
    POST   /api/admin/content/bulk-delete bulk delete matched items

`type` is one of: listing, rental, auto, inventory, job.
"""
from __future__ import annotations
import logging
from typing import Optional, List

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

logger = logging.getLogger(__name__)

# ── Content-type dispatch table ─────────────────────────────────────────
# Each entry maps a user-facing type key to:
#   • collection attribute on the db object
#   • the ORDINARY title field (for search + display)
#   • an "id" field name (always "id" in this app)
#   • fields that are editable via PATCH
# Adding a new type = adding one row here.
CONTENT_TYPES = {
    "listing": {
        "collection": "listings",
        "title_field": "title",
        "editable": {"title", "description", "price", "category", "status"},
        "label": "Community listing",
    },
    "rental": {
        "collection": "rentals",
        "title_field": "title",
        "editable": {"title", "description", "price_per_night", "category", "status"},
        "label": "Rental unit",
    },
    "auto": {
        "collection": "autos",
        "title_field": "title",
        "editable": {"title", "description", "price", "make", "model", "year", "mileage", "status"},
        "label": "Auto sale",
    },
    "inventory": {
        "collection": "inventory",
        "title_field": "title",
        "editable": {"title", "description", "price", "category", "status"},
        "label": "Store item",
    },
    "job": {
        "collection": "jobs",
        "title_field": "title",
        "editable": {"title", "description", "budget", "status"},
        "label": "Job / service request",
    },
}


class UserPatch(BaseModel):
    """Editable fields on a user record. Every field is optional — only the
    ones the admin actually included get applied."""
    name: Optional[str] = None
    email: Optional[str] = None
    role: Optional[str] = None  # customer / provider / retailer / restaurant / admin
    wallet_balance: Optional[float] = None
    banned: Optional[bool] = None


class ContentPatch(BaseModel):
    """Whitelist-validated field bag. Only keys that appear in the type's
    `editable` set are actually written."""
    updates: dict = Field(default_factory=dict)


class BulkDeleteBody(BaseModel):
    type: str
    ids: List[str]


def build_admin_crud_router(*, get_current_user, require_admin) -> APIRouter:
    """Factory so we can wire the router into server.py without a circular
    import — server.py owns `get_current_user` / `_require_admin`."""
    router = APIRouter(prefix="/admin")

    # ── USERS ───────────────────────────────────────────────────────────
    # NOTE: GET /admin/users is served by admin_data.py's richer list_users_rich
    # (includes per-user job/order/review counts). We intentionally do NOT
    # register a duplicate GET here — only PATCH + DELETE.

    @router.patch("/users/{user_id}")
    async def patch_user(user_id: str, body: UserPatch, _: dict = Depends(require_admin)):
        from server import db
        target = await db.users.find_one({"id": user_id})
        if not target:
            raise HTTPException(404, "User not found")
        update = {k: v for k, v in body.model_dump().items() if v is not None}
        if "role" in update and update["role"] not in {"customer", "provider", "retailer", "restaurant", "admin"}:
            raise HTTPException(400, f"Invalid role: {update['role']}")
        if update:
            await db.users.update_one({"id": user_id}, {"$set": update})
        fresh = await db.users.find_one({"id": user_id}, {"_id": 0, "password_hash": 0})
        return {"ok": True, "user": fresh}

    @router.delete("/users/{user_id}")
    async def delete_user(user_id: str, admin: dict = Depends(require_admin)):
        from server import db
        if user_id == admin.get("id"):
            raise HTTPException(400, "You cannot delete your own admin account")
        res = await db.users.delete_one({"id": user_id})
        if res.deleted_count == 0:
            raise HTTPException(404, "User not found")
        return {"ok": True, "deleted": user_id}

    # ── CONTENT (listings / rentals / autos / inventory / jobs) ─────────
    @router.get("/content")
    async def list_content(
        type: str = "listing",
        q: Optional[str] = None,
        status: Optional[str] = None,
        limit: int = 100,
        skip: int = 0,
        _: dict = Depends(require_admin),
    ):
        from server import db
        if type not in CONTENT_TYPES:
            raise HTTPException(400, f"Unknown content type: {type}")
        spec = CONTENT_TYPES[type]
        coll = getattr(db, spec["collection"])
        filt: dict = {}
        if status and status != "all":
            filt["status"] = status
        if q:
            rx = {"$regex": q.strip(), "$options": "i"}
            title_field = spec["title_field"]
            filt["$or"] = [
                {title_field: rx},
                {"description": rx},
                {"seller_name": rx},
                {"category": rx},
            ]
        cursor = coll.find(filt, {"_id": 0}).sort("created_at", -1).skip(int(skip)).limit(min(int(limit), 500))
        docs = await cursor.to_list(length=min(int(limit), 500))
        total = await coll.count_documents(filt)
        return {"items": docs, "total": total, "type": type, "label": spec["label"]}

    @router.patch("/content/{type}/{item_id}")
    async def patch_content(type: str, item_id: str, body: ContentPatch, _: dict = Depends(require_admin)):
        from server import db
        if type not in CONTENT_TYPES:
            raise HTTPException(400, f"Unknown content type: {type}")
        spec = CONTENT_TYPES[type]
        coll = getattr(db, spec["collection"])
        current = await coll.find_one({"id": item_id})
        if not current:
            raise HTTPException(404, f"{spec['label']} not found")
        # Whitelist by type — silently drop unknown fields so a rogue payload
        # can't rewrite `owner_id` or wallet-adjacent columns.
        allowed = spec["editable"]
        update = {k: v for k, v in (body.updates or {}).items() if k in allowed}
        if not update:
            raise HTTPException(400, f"No editable fields in payload. Allowed: {sorted(allowed)}")
        await coll.update_one({"id": item_id}, {"$set": update})
        fresh = await coll.find_one({"id": item_id}, {"_id": 0})
        return {"ok": True, "item": fresh}

    @router.delete("/content/{type}/{item_id}")
    async def delete_content(type: str, item_id: str, _: dict = Depends(require_admin)):
        from server import db
        if type not in CONTENT_TYPES:
            raise HTTPException(400, f"Unknown content type: {type}")
        spec = CONTENT_TYPES[type]
        coll = getattr(db, spec["collection"])
        res = await coll.delete_one({"id": item_id})
        if res.deleted_count == 0:
            raise HTTPException(404, f"{spec['label']} not found")
        return {"ok": True, "deleted": item_id, "type": type}

    @router.post("/content/bulk-delete")
    async def bulk_delete(body: BulkDeleteBody, _: dict = Depends(require_admin)):
        from server import db
        if body.type not in CONTENT_TYPES:
            raise HTTPException(400, f"Unknown content type: {body.type}")
        if not body.ids:
            return {"ok": True, "deleted_count": 0}
        spec = CONTENT_TYPES[body.type]
        coll = getattr(db, spec["collection"])
        res = await coll.delete_many({"id": {"$in": body.ids}})
        return {"ok": True, "deleted_count": res.deleted_count, "type": body.type}

    @router.get("/content/types")
    async def content_types(_: dict = Depends(require_admin)):
        """Metadata for the UI — the frontend uses this to build the type
        picker + know what fields are editable per type."""
        return [
            {"key": k, "label": v["label"], "editable": sorted(v["editable"])}
            for k, v in CONTENT_TYPES.items()
        ]

    return router

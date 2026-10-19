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
import json
import logging
import re
import uuid
from datetime import datetime, timezone
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
STATUS = "select:active|pending|inactive|sold|rented|deleted"
CONTENT_TYPES = {
    "listing": {
        "collection": "listings", "title_field": "title", "owner_field": "seller_id", "owner_name": "seller_name",
        "label": "Community listing",
        "fields": {"title": "text", "description": "textarea", "price": "number", "category": "text",
                   "media_url": "text", "status": STATUS},
    },
    "real_estate": {
        "collection": "real_estate", "title_field": "title", "owner_field": "owner_id", "owner_name": "owner_name",
        "label": "Real estate",
        "fields": {"title": "text", "description": "textarea",
                   "listing_kind": "select:sale|rent|short_stay|room",
                   "property_type": "select:house|condo|townhouse|apartment|multi_family|villa|cabin|studio|land|commercial",
                   "price": "number", "price_unit": "select:total|month|week|night", "currency": "text",
                   "address": "text", "city": "text", "state": "text", "country": "text",
                   "lat": "number", "lng": "number", "bedrooms": "number", "bathrooms": "number",
                   "sqft": "number", "year_built": "int", "photos": "list", "status": STATUS, "is_demo": "bool"},
    },
    "rental": {
        "collection": "rentals", "title_field": "title", "owner_field": "owner_id", "owner_name": "owner_name",
        "label": "Rental unit",
        "fields": {"title": "text", "description": "textarea", "category": "text", "subcategory": "text",
                   "pricing": "json", "media_url": "text", "booking_mode": "select:instant|request",
                   "status": STATUS, "is_demo": "bool"},
    },
    "auto": {
        "collection": "autos", "title_field": "title", "owner_field": "owner_id", "owner_name": "owner_name",
        "label": "Auto sale",
        "fields": {"title": "text", "description": "textarea", "price": "number", "year": "int", "make": "text",
                   "model": "text", "trim": "text", "mileage": "number", "body_style": "text",
                   "transmission": "text", "fuel": "text", "condition": "text", "city": "text", "state": "text",
                   "country": "text", "photos": "list", "status": STATUS, "is_demo": "bool"},
    },
    "inventory": {
        "collection": "inventory", "title_field": "name", "owner_field": "owner_id", "owner_name": "store_name",
        "label": "Store item",
        "fields": {"name": "text", "description": "textarea", "price": "number", "stock": "int",
                   "category": "text", "media_url": "text", "status": STATUS},
    },
    "job": {
        "collection": "jobs", "title_field": "title", "owner_field": "customer_id", "owner_name": "customer_name",
        "label": "Job / service request", "default_status": "open",
        "fields": {"title": "text", "description": "textarea", "category": "text", "pay_rate": "number",
                   "pay_unit": "select:hour|day|week|flat", "estimated_units": "number",
                   "employment_type": "select:on_demand|temp|employee|w2|remote", "is_remote": "bool",
                   "apply_url": "text", "status": "select:open|accepted|in_progress|completed|cancelled"},
    },
    "business_lead": {
        "collection": "business_leads", "title_field": "business_name", "label": "Business lead",
        "fields": {"business_name": "text", "category": "text", "contact_name": "text", "phone": "text", "email": "text",
                   "city": "text", "city_slug": "text", "utm_campaign": "text",
                   "status": "select:new|contacted|signed_up|lost"},
    },
    "shop_product": {
        "collection": "shop_products", "title_field": "title", "label": "Shop product",
        "fields": {"title": "text", "description": "textarea", "image_url": "text", "price": "number",
                   "price_display": "text", "retailer": "text", "retailer_label": "text", "affiliate_url": "text",
                   "category": "text", "rating": "number", "is_active": "bool", "is_featured": "bool"},
    },
    "blog_post": {
        "collection": "blog_posts", "title_field": "title", "label": "Blog post", "default_status": "draft",
        "fields": {"title": "text", "slug": "text", "excerpt": "textarea", "body_md": "textarea", "tags": "list",
                   "hero_image_url": "text", "author": "text", "status": "select:published|draft"},
    },
    "faq": {
        "collection": "faqs", "title_field": "question", "label": "Help FAQ",
        "fields": {"question": "text", "answer": "textarea",
                   "topic": "select:getting_started|booking|payments|earning|buying_selling|rentals|real_estate|account|troubleshooting",
                   "position": "int", "is_active": "bool"},
    },
    "recruit_city": {
        "collection": "recruit_cities", "title_field": "city", "label": "Recruit city",
        "fields": {"city": "text", "slug": "text", "state": "text", "state_full": "text", "goal_workers": "int",
                   "bonus_amount": "number", "bonus_first_n": "int", "hero_headline": "text",
                   "hero_subhead": "text", "hero_image": "text", "neighborhoods": "list", "is_active": "bool"},
    },
}


async def _after_write(db, type: str, item_id: str, created: bool = False) -> None:
    """Keep the rental→real-estate mirror fresh and fire saved-search alerts for admin-created homes."""
    from real_estate_plus import sync_property_rentals, notify_matching_searches
    if type in ("listing", "auto", "real_estate") and not await db[CONTENT_TYPES[type]["collection"]].find_one({"id": item_id}):
        await db.watchlist.delete_many({"kind": type, "item_id": item_id})
        await db.re_favorites.delete_many({"listing_id": item_id})
    if type == "rental":
        await sync_property_rentals(db, item_id)
        if not await db.rentals.find_one({"id": item_id}):
            await db.real_estate.delete_many({"source_rental_id": item_id})
    elif type == "real_estate" and created:
        doc = await db.real_estate.find_one({"id": item_id})
        if doc:
            await notify_matching_searches(db, doc)


def _slugify(text: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", (text or "").lower()).strip("-")[:80]


def _coerce(fields: dict, raw: dict) -> dict:
    out = {}
    for k, v in (raw or {}).items():
        kind = fields.get(k)
        if kind is None:
            continue
        if v == "" and kind not in ("text", "textarea"):
            out[k] = None
            continue
        try:
            if kind == "number":
                v = None if v is None else float(v)
            elif kind == "int":
                v = None if v is None else int(float(v))
            elif kind == "bool":
                v = v if isinstance(v, bool) else str(v).lower() in ("1", "true", "yes", "on")
            elif kind == "list":
                v = v if isinstance(v, list) else [x.strip() for x in str(v or "").split(",") if x.strip()]
            elif kind == "json":
                v = v if isinstance(v, (dict, list)) else json.loads(v or "{}")
            elif kind.startswith("select:") and v not in kind[7:].split("|"):
                raise ValueError(f"must be one of {kind[7:]}")
        except (ValueError, TypeError) as e:
            raise HTTPException(400, f"Invalid value for {k}: {e}")
        out[k] = v
    return out


class UserPatch(BaseModel):
    """Editable fields on a user record. Every field is optional — only the
    ones the admin actually included get applied."""
    name: Optional[str] = None
    email: Optional[str] = None
    role: Optional[str] = None  # customer / provider / retailer / restaurant / admin
    wallet_balance: Optional[float] = None
    banned: Optional[bool] = None
    phone: Optional[str] = None
    password: Optional[str] = None


class UserCreateAdmin(BaseModel):
    email: str
    name: str
    password: str = Field(min_length=6)
    role: str = "customer"
    phone: Optional[str] = None


class ContentPatch(BaseModel):
    """Whitelist-validated field bag. Only keys that appear in the type's
    `editable` set are actually written."""
    updates: dict = Field(default_factory=dict)


class BulkDeleteBody(BaseModel):
    type: str
    ids: List[str]


class BulkIdsBody(BaseModel):
    ids: List[str] = Field(default_factory=list)


class BulkPatchBody(BaseModel):
    ids: List[str] = Field(default_factory=list)
    updates: dict = Field(default_factory=dict)


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
        if "password" in update:
            from server import hash_password
            if len(update["password"]) < 6:
                raise HTTPException(400, "Password must be at least 6 characters")
            update["password_hash"] = hash_password(update.pop("password"))
        if "email" in update:
            update["email"] = update["email"].strip().lower()
            if await db.users.find_one({"email": update["email"], "id": {"$ne": user_id}}):
                raise HTTPException(400, "Email already in use")
        if update:
            await db.users.update_one({"id": user_id}, {"$set": update})
        fresh = await db.users.find_one({"id": user_id}, {"_id": 0, "password_hash": 0})
        return {"ok": True, "user": fresh}

    @router.post("/users")
    async def create_user(body: UserCreateAdmin, _: dict = Depends(require_admin)):
        from server import db, hash_password
        email = body.email.strip().lower()
        if body.role not in {"customer", "provider", "admin"}:
            raise HTTPException(400, f"Invalid role: {body.role}")
        if await db.users.find_one({"email": email}):
            raise HTTPException(400, "Email already registered")
        doc = {"id": str(uuid.uuid4()), "email": email, "name": body.name, "role": body.role,
               "phone": body.phone, "password_hash": hash_password(body.password), "wallet_balance": 0.0,
               "location": None, "service_radius_miles": 25.0, "categories": [], "storefront": None,
               "created_at": datetime.now(timezone.utc).isoformat(), "created_by_admin": True}
        await db.users.insert_one(doc)
        return {"ok": True, "user": {k: v for k, v in doc.items() if k not in ("_id", "password_hash")}}

    @router.delete("/users/{user_id}")
    async def delete_user(user_id: str, admin: dict = Depends(require_admin)):
        from server import db
        if user_id == admin.get("id"):
            raise HTTPException(400, "You cannot delete your own admin account")
        res = await db.users.delete_one({"id": user_id})
        await db.re_saved_searches.delete_many({"user_id": user_id})
        await db.re_favorites.delete_many({"user_id": user_id})
        await db.watchlist.delete_many({"user_id": user_id})
        await db.notifications.delete_many({"user_id": user_id})
        if res.deleted_count == 0:
            raise HTTPException(404, "User not found")
        return {"ok": True, "deleted": user_id}

    @router.post("/users/bulk-delete")
    async def bulk_delete_users(body: BulkIdsBody, admin: dict = Depends(require_admin)):
        from server import db
        # Never let an admin bulk-delete themselves.
        target_ids = [i for i in body.ids if i and i != admin.get("id")]
        if not target_ids:
            return {"ok": True, "deleted_count": 0}
        res = await db.users.delete_many({"id": {"$in": target_ids}})
        await db.re_saved_searches.delete_many({"user_id": {"$in": target_ids}})
        await db.re_favorites.delete_many({"user_id": {"$in": target_ids}})
        await db.watchlist.delete_many({"user_id": {"$in": target_ids}})
        await db.notifications.delete_many({"user_id": {"$in": target_ids}})
        return {"ok": True, "deleted_count": res.deleted_count, "skipped_self": len(body.ids) - len(target_ids)}

    @router.post("/users/bulk-patch")
    async def bulk_patch_users(body: BulkPatchBody, admin: dict = Depends(require_admin)):
        from server import db
        allowed = {"role", "banned", "wallet_balance"}
        update = {k: v for k, v in (body.updates or {}).items() if k in allowed and v is not None}
        if not update:
            raise HTTPException(400, f"No updatable fields. Allowed: {sorted(allowed)}")
        if "role" in update and update["role"] not in {"customer", "provider", "retailer", "restaurant", "admin"}:
            raise HTTPException(400, f"Invalid role: {update['role']}")
        target_ids = [i for i in body.ids if i and i != admin.get("id")]
        if not target_ids:
            return {"ok": True, "matched_count": 0, "modified_count": 0}
        res = await db.users.update_many({"id": {"$in": target_ids}}, {"$set": update})
        return {
            "ok": True,
            "matched_count": res.matched_count,
            "modified_count": res.modified_count,
            "skipped_self": len(body.ids) - len(target_ids),
        }

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
            rx = {"$regex": re.escape(q.strip()), "$options": "i"}
            title_field = spec["title_field"]
            filt["$or"] = [{title_field: rx}, {"description": rx}, {"category": rx}, {"city": rx}, {"slug": rx}]
            if spec.get("owner_name"):
                filt["$or"].append({spec["owner_name"]: rx})
        sort = [("topic", 1), ("position", 1)] if type == "faq" else [("created_at", -1)]
        cursor = coll.find(filt, {"_id": 0}).sort(sort).skip(int(skip)).limit(min(int(limit), 500))
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
        update = _coerce(spec["fields"], body.updates)
        if not update:
            raise HTTPException(400, f"No editable fields in payload. Allowed: {sorted(spec['fields'])}")
        update["updated_at"] = datetime.now(timezone.utc).isoformat()
        if type in ("real_estate", "listing", "auto") and update.get("price") is not None:
            from price_watch import record_price_change
            existing = await coll.find_one({"id": item_id})
            if existing:
                await record_price_change(db, type, existing, update["price"])
        await coll.update_one({"id": item_id}, {"$set": update})
        await _after_write(db, type, item_id)
        fresh = await coll.find_one({"id": item_id}, {"_id": 0})
        return {"ok": True, "item": fresh}

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
        if body.type == "rental":
            await db.real_estate.delete_many({"source_rental_id": {"$in": body.ids}})
        await db.watchlist.delete_many({"item_id": {"$in": body.ids}})
        await db.re_favorites.delete_many({"listing_id": {"$in": body.ids}})
        return {"ok": True, "deleted_count": res.deleted_count, "type": body.type}

    @router.post("/content/{type}")
    async def create_content(type: str, body: ContentPatch, admin: dict = Depends(require_admin)):
        from server import db
        if type not in CONTENT_TYPES:
            raise HTTPException(400, f"Unknown content type: {type}")
        spec = CONTENT_TYPES[type]
        doc = _coerce(spec["fields"], body.updates)
        if not doc.get(spec["title_field"]):
            raise HTTPException(400, f"{spec['title_field']} is required")
        now = datetime.now(timezone.utc).isoformat()
        doc.update({"id": str(uuid.uuid4()), "created_at": now, "updated_at": now, "created_by_admin": True})
        if "status" in spec["fields"] and not doc.get("status"):
            doc["status"] = spec.get("default_status", "active")
        if spec.get("owner_field"):
            doc.setdefault(spec["owner_field"], admin["id"])
            doc.setdefault(spec["owner_name"], admin.get("name"))
        if type == "blog_post":
            doc["slug"] = doc.get("slug") or _slugify(doc["title"])
            if doc.get("status") == "published":
                doc["published_at"] = now
        if type == "recruit_city":
            doc["slug"] = doc.get("slug") or _slugify(f"{doc['city']}-{doc.get('state') or ''}")
            doc.setdefault("is_active", True)
        if type == "faq":
            doc.setdefault("is_active", True)
            doc.setdefault("topic", "getting_started")
            if doc.get("position") is None:
                last = await db.faqs.find_one({"topic": doc["topic"]}, sort=[("position", -1)])
                doc["position"] = (last or {}).get("position", 0) + 1
        if type == "shop_product":
            doc.setdefault("is_active", True)
            doc.setdefault("click_count", 0)
        if type == "real_estate":
            from real_estate_plus import geocode_listing
            doc.setdefault("listing_kind", "sale")
            doc.setdefault("property_type", "house")
            doc.setdefault("currency", "USD")
            doc["is_demo"] = bool(doc.get("is_demo"))
            await geocode_listing(doc)
        if type == "job":
            from server import category_group
            doc.setdefault("category", "other")
            doc["category_group"] = category_group(doc["category"])
            doc.setdefault("pay_rate", 0.0)
            doc.setdefault("pay_unit", "flat")
            doc.setdefault("estimated_units", 1.0)
        coll = getattr(db, spec["collection"])
        await coll.insert_one(doc)
        await _after_write(db, type, doc["id"], created=True)
        doc.pop("_id", None)
        return {"ok": True, "item": doc}

    @router.delete("/content/{type}/{item_id}")
    async def delete_content(type: str, item_id: str, _: dict = Depends(require_admin)):
        from server import db
        if type not in CONTENT_TYPES:
            raise HTTPException(400, f"Unknown content type: {type}")
        spec = CONTENT_TYPES[type]
        coll = getattr(db, spec["collection"])
        res = await coll.delete_one({"id": item_id})
        await _after_write(db, type, item_id)
        if res.deleted_count == 0:
            raise HTTPException(404, f"{spec['label']} not found")
        return {"ok": True, "deleted": item_id, "type": type}

    @router.get("/content/types")
    async def content_types(_: dict = Depends(require_admin)):
        """Metadata for the UI — the frontend uses this to build the type
        picker + know what fields are editable per type."""
        return [
            {"key": k, "label": v["label"], "title_field": v["title_field"],
             "editable": list(v["fields"]),
             "fields": [{"name": f, "kind": kind.split(":")[0],
                         "options": kind[7:].split("|") if kind.startswith("select:") else None}
                        for f, kind in v["fields"].items()]}
            for k, v in CONTENT_TYPES.items()
        ]

    return router

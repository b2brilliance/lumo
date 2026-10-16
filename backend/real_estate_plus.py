"""Real-estate extras: geocoding, saved searches + alerts, favorites, rental→real-estate sync."""
import asyncio
import logging
import os
import uuid
from datetime import datetime, timezone
from typing import Optional

import httpx
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from push_notifications import send_push_to_user

logger = logging.getLogger("lumo.real_estate_plus")

NOMINATIM_URL = "https://nominatim.openstreetmap.org/search"
NOMINATIM_HEADERS = {"User-Agent": "LumoMarketplace/1.0 (real-estate search)"}
_geo_cache: dict = {}


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


async def nominatim(q: str, limit: int = 5) -> list:
    key = (q.strip().lower(), limit)
    if key in _geo_cache:
        return _geo_cache[key]
    try:
        async with httpx.AsyncClient(timeout=8) as client:
            r = await client.get(NOMINATIM_URL, params={"q": q, "format": "json", "limit": limit, "addressdetails": 1},
                                 headers=NOMINATIM_HEADERS)
            r.raise_for_status()
            rows = r.json()
    except Exception as e:
        logger.warning(f"Nominatim failed for {q!r}: {e}")
        return []
    out = []
    for row in rows:
        bb = row.get("boundingbox") or []
        addr = row.get("address") or {}
        out.append({
            "label": row.get("display_name"),
            "lat": float(row["lat"]), "lng": float(row["lon"]),
            "bbox": {"south": float(bb[0]), "north": float(bb[1]), "west": float(bb[2]), "east": float(bb[3])} if len(bb) == 4 else None,
            "country_code": (addr.get("country_code") or "").upper() or None,
            "city": addr.get("city") or addr.get("town") or addr.get("village"),
        })
    if len(_geo_cache) > 2000:
        _geo_cache.clear()
    _geo_cache[key] = out
    return out


async def geocode_listing(doc: dict) -> None:
    if doc.get("lat") is not None and doc.get("lng") is not None:
        return
    parts = [doc.get("address"), doc.get("city"), doc.get("state"), doc.get("country")]
    q = ", ".join(p for p in parts if p)
    if not q:
        return
    hits = await nominatim(q, 1)
    if hits:
        doc["lat"], doc["lng"] = hits[0]["lat"], hits[0]["lng"]


# ── Saved-search matching ───────────────────────────────────────────────────
def listing_matches(f: dict, d: dict) -> bool:
    if f.get("kinds") and d.get("listing_kind") not in f["kinds"]:
        return False
    if f.get("property_types") and d.get("property_type") not in f["property_types"]:
        return False
    price = d.get("price") or 0
    if f.get("min_price") not in (None, "") and price < float(f["min_price"]):
        return False
    if f.get("max_price") not in (None, "") and price > float(f["max_price"]):
        return False
    if f.get("min_beds") not in (None, "") and (d.get("bedrooms") or 0) < float(f["min_beds"]):
        return False
    if f.get("min_baths") not in (None, "") and (d.get("bathrooms") or 0) < float(f["min_baths"]):
        return False
    if f.get("country") and (d.get("country") or "").upper() != f["country"].upper():
        return False
    if f.get("city") and f["city"].lower() not in (d.get("city") or "").lower():
        return False
    bb = f.get("bbox")
    if bb:
        lat, lng = d.get("lat"), d.get("lng")
        if lat is None or lng is None:
            return False
        if not (bb["south"] <= lat <= bb["north"]):
            return False
        west, east = bb["west"], bb["east"]
        if west <= east and not (west <= lng <= east):
            return False
        if west > east and not (lng >= west or lng <= east):
            return False
    if f.get("q"):
        hay = " ".join(str(d.get(k) or "") for k in ("title", "description", "address", "city", "country")).lower()
        if f["q"].lower() not in hay:
            return False
    return True


async def notify_matching_searches(db, doc: dict, send_email=None) -> int:
    if doc.get("is_demo") or doc.get("status") != "active":
        return 0
    sent = 0
    async for s in db.re_saved_searches.find({"notify": True, "user_id": {"$ne": doc.get("owner_id")}}):
        if not listing_matches(s.get("filters") or {}, doc):
            continue
        title = f"New match: {doc.get('title')}"
        body = f"{doc.get('city') or doc.get('address') or ''} — matches your saved search \"{s.get('name')}\""
        link = f"/real-estate/{doc['id']}"
        await db.notifications.insert_one({
            "id": str(uuid.uuid4()), "user_id": s["user_id"], "type": "saved_search_match",
            "title": title, "body": body, "link": link, "listing_id": doc["id"],
            "saved_search_id": s["id"], "read": False, "created_at": _now(),
        })
        await db.re_saved_searches.update_one({"id": s["id"]}, {"$set": {"last_notified_at": _now()}, "$inc": {"match_count": 1}})
        try:
            await send_push_to_user(db, user_id=s["user_id"], title=title, body=body, url=link, tag=f"re-{doc['id']}")
        except Exception as e:  # noqa: BLE001
            logger.warning(f"push failed: {e}")
        if send_email and os.environ.get("RESEND_API_KEY"):
            u = await db.users.find_one({"id": s["user_id"]}, {"email": 1})
            if u and u.get("email"):
                await send_email(to_email=u["email"], subject=title,
                                 html=f"<p>{body}</p><p><a href='{link}'>View listing</a></p>")
        sent += 1
    return sent


# ── Rentals (category=property) → real_estate mirror ────────────────────────
def _rental_to_re(r: dict) -> dict:
    pricing = r.get("pricing") or {}
    attrs = r.get("attributes") or {}
    loc = r.get("location") or {}
    if pricing.get("daily"):
        kind, price, unit = "short_stay", pricing["daily"], "night"
    elif pricing.get("weekly"):
        kind, price, unit = "short_stay", pricing["weekly"], "week"
    else:
        kind, price, unit = "rent", pricing.get("monthly") or 0, "month"
    sub = (r.get("subcategory") or "").lower()
    if sub == "room" or "room" in str(attrs.get("type", "")).lower():
        kind = "room"
    ptype = "commercial" if sub == "workspace" else (str(attrs.get("type") or "apartment").lower().replace(" ", "_"))
    if ptype not in {"house", "condo", "townhouse", "land", "multi_family", "apartment", "commercial", "villa", "cabin", "studio"}:
        ptype = "apartment"
    photos = [m.get("url") or m.get("media_url") for m in (r.get("media") or []) if (m.get("url") or m.get("media_url"))]
    if not photos and r.get("media_url"):
        photos = [r["media_url"]]
    return {
        "listing_kind": kind, "property_type": ptype, "title": r.get("title"),
        "description": r.get("description"), "price": float(price or 0), "price_unit": unit,
        "currency": "USD", "address": loc.get("address") or "", "lat": loc.get("lat"), "lng": loc.get("lng"),
        "city": loc.get("city"), "country": loc.get("country") or "US",
        "bedrooms": attrs.get("bedrooms"), "bathrooms": attrs.get("bathrooms"),
        "max_guests": attrs.get("guests") or attrs.get("capacity"), "amenities": attrs.get("amenities") or [],
        "photos": photos, "owner_id": r.get("owner_id"), "owner_name": r.get("owner_name"),
        "status": "active" if r.get("status") == "active" else "inactive",
        "is_demo": bool(r.get("is_demo")), "source_rental_id": r["id"],
        "pricing": pricing, "booking_mode": r.get("booking_mode"),
    }


async def sync_property_rentals(db, rental_id: Optional[str] = None) -> int:
    q = {"category": "property"}
    if rental_id:
        q["id"] = rental_id
    n = 0
    async for r in db.rentals.find(q):
        fields = _rental_to_re(r)
        res = await db.real_estate.update_one(
            {"source_rental_id": r["id"]},
            {"$set": fields, "$setOnInsert": {"id": str(uuid.uuid4()), "created_at": r.get("created_at") or _now()}},
            upsert=True,
        )
        if res.upserted_id:
            doc = await db.real_estate.find_one({"source_rental_id": r["id"]})
            asyncio.create_task(notify_matching_searches(db, doc))
        n += 1
    live = await db.rentals.distinct("id", {"category": "property"})
    await db.real_estate.delete_many({"source_rental_id": {"$exists": True, "$nin": live}})
    return n


# ── Router ───────────────────────────────────────────────────────────────────
class SavedSearchIn(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    filters: dict = Field(default_factory=dict)
    notify: bool = True


def create_router(*, db, get_current_user) -> APIRouter:
    router = APIRouter(prefix="/api")

    @router.get("/geo/search")
    async def geo_search(q: str, limit: int = 5):
        if len(q.strip()) < 2:
            return []
        return await nominatim(q, max(1, min(limit, 8)))

    @router.get("/real-estate/saved-searches")
    async def list_saved(user: dict = Depends(get_current_user)):
        return await db.re_saved_searches.find({"user_id": user["id"]}, {"_id": 0}).sort("created_at", -1).to_list(50)

    @router.post("/real-estate/saved-searches")
    async def create_saved(body: SavedSearchIn, user: dict = Depends(get_current_user)):
        if await db.re_saved_searches.count_documents({"user_id": user["id"]}) >= 25:
            raise HTTPException(400, "You can keep up to 25 saved searches")
        doc = {"id": str(uuid.uuid4()), "user_id": user["id"], **body.model_dump(),
               "match_count": 0, "created_at": _now()}
        await db.re_saved_searches.insert_one(doc)
        doc.pop("_id", None)
        return doc

    @router.patch("/real-estate/saved-searches/{sid}")
    async def toggle_saved(sid: str, body: dict, user: dict = Depends(get_current_user)):
        upd = {k: body[k] for k in ("name", "notify") if k in body}
        res = await db.re_saved_searches.update_one({"id": sid, "user_id": user["id"]}, {"$set": upd})
        if not res.matched_count:
            raise HTTPException(404, "Saved search not found")
        return await db.re_saved_searches.find_one({"id": sid}, {"_id": 0})

    @router.delete("/real-estate/saved-searches/{sid}")
    async def delete_saved(sid: str, user: dict = Depends(get_current_user)):
        res = await db.re_saved_searches.delete_one({"id": sid, "user_id": user["id"]})
        if not res.deleted_count:
            raise HTTPException(404, "Saved search not found")
        return {"ok": True}

    @router.get("/real-estate/favorites")
    async def list_favorites(user: dict = Depends(get_current_user)):
        ids = [f["listing_id"] async for f in db.re_favorites.find({"user_id": user["id"]}).sort("created_at", -1)]
        docs = await db.real_estate.find({"id": {"$in": ids}}, {"_id": 0, "owner_email": 0, "contact_email": 0, "contact_phone": 0}).to_list(500)
        order = {i: n for n, i in enumerate(ids)}
        return {"ids": ids, "items": sorted(docs, key=lambda d: order.get(d["id"], 0))}

    @router.post("/real-estate/favorites/{listing_id}")
    async def toggle_favorite(listing_id: str, user: dict = Depends(get_current_user)):
        if await db.re_favorites.find_one({"user_id": user["id"], "listing_id": listing_id}):
            await db.re_favorites.delete_one({"user_id": user["id"], "listing_id": listing_id})
            return {"favorited": False}
        if not await db.real_estate.find_one({"id": listing_id}):
            raise HTTPException(404, "Listing not found")
        await db.re_favorites.insert_one({"user_id": user["id"], "listing_id": listing_id, "created_at": _now()})
        return {"favorited": True}

    return router

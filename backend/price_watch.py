"""Price history + price-drop alerts for real estate, community listings and autos."""
import logging
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from push_notifications import send_push_to_user

logger = logging.getLogger("lumo.price_watch")

KINDS = {
    "real_estate": {"coll": "real_estate", "owner": "owner_id", "link": "/real-estate/{id}"},
    "listing": {"coll": "listings", "owner": "seller_id", "link": "/marketplace?item={id}"},
    "auto": {"coll": "autos", "owner": "owner_id", "link": "/autos/{id}"},
}


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def init_history(doc: dict) -> None:
    """Call before inserting a new priced doc."""
    if doc.get("price") is not None:
        doc["price_history"] = [{"price": float(doc["price"]), "at": doc.get("created_at") or _now(), "event": "listed"}]


async def _watchers(db, kind: str, item_id: str) -> list:
    if kind == "real_estate":
        return [f["user_id"] async for f in db.re_favorites.find({"listing_id": item_id})]
    return [w["user_id"] async for w in db.watchlist.find({"kind": kind, "item_id": item_id})]


async def record_price_change(db, kind: str, doc: dict, new_price: float) -> bool:
    """Append to price_history; on a drop, flag it and alert everyone who saved the item."""
    old = doc.get("price")
    new_price = float(new_price)
    if old is None or float(old) == new_price:
        return False
    old = float(old)
    cfg = KINDS[kind]
    hist = doc.get("price_history") or [{"price": old, "at": doc.get("created_at") or _now(), "event": "listed"}]
    hist.append({"price": new_price, "at": _now(), "event": "drop" if new_price < old else "increase"})
    upd = {"price_history": hist[-50:]}
    if new_price < old:
        upd.update({"previous_price": old, "price_drop_at": _now(), "price_drop_pct": round((old - new_price) / old * 100, 1) if old else 0})
    else:
        upd.update({"previous_price": None, "price_drop_at": None, "price_drop_pct": None})
    await db[cfg["coll"]].update_one({"id": doc["id"]}, {"$set": upd})
    if new_price < old and not doc.get("is_demo"):
        link = cfg["link"].format(id=doc["id"])
        cur = (doc.get("currency") or "USD").upper()
        title = f"Price drop: {doc.get('title') or 'a saved item'}"
        body = f"Now {cur} {new_price:,.0f} (was {old:,.0f}) — {upd['price_drop_pct']}% off"
        for uid in set(await _watchers(db, kind, doc["id"])):
            if uid == doc.get(cfg["owner"]):
                continue
            await db.notifications.insert_one({
                "id": f"pd-{doc['id']}-{uid}-{int(datetime.now(timezone.utc).timestamp())}",
                "user_id": uid, "type": "price_drop", "title": title, "body": body, "link": link,
                "item_kind": kind, "item_id": doc["id"], "read": False, "created_at": _now(),
            })
            try:
                await send_push_to_user(db, user_id=uid, title=title, body=body, url=link, tag=f"pd-{doc['id']}")
            except Exception as e:  # noqa: BLE001
                logger.warning(f"price-drop push failed: {e}")
    return True


class OwnerEdit(BaseModel):
    price: float | None = Field(default=None, gt=0, le=1_000_000_000)
    title: str | None = Field(default=None, min_length=2, max_length=160)
    description: str | None = Field(default=None, max_length=5000)
    status: str | None = None


def create_router(*, db, get_current_user) -> APIRouter:
    router = APIRouter(prefix="/api")

    @router.get("/watch/{kind}/ids")
    async def watch_ids(kind: str, user: dict = Depends(get_current_user)):
        if kind not in ("listing", "auto"):
            raise HTTPException(400, "Unknown kind")
        return {"ids": [w["item_id"] async for w in db.watchlist.find({"user_id": user["id"], "kind": kind})]}

    @router.post("/watch/{kind}/{item_id}")
    async def toggle_watch(kind: str, item_id: str, user: dict = Depends(get_current_user)):
        if kind not in ("listing", "auto"):
            raise HTTPException(400, "Unknown kind")
        q = {"user_id": user["id"], "kind": kind, "item_id": item_id}
        if await db.watchlist.find_one(q):
            await db.watchlist.delete_one(q)
            return {"watching": False}
        if not await db[KINDS[kind]["coll"]].find_one({"id": item_id}):
            raise HTTPException(404, "Item not found")
        await db.watchlist.insert_one({**q, "created_at": _now()})
        return {"watching": True}

    async def _owner_edit(kind: str, item_id: str, body: OwnerEdit, user: dict):
        cfg = KINDS[kind]
        doc = await db[cfg["coll"]].find_one({"id": item_id})
        if not doc:
            raise HTTPException(404, "Not found")
        if doc.get(cfg["owner"]) != user["id"] and user.get("role") != "admin":
            raise HTTPException(403, "Not your listing")
        upd = body.model_dump(exclude_none=True)
        if "status" in upd and upd["status"] not in ("active", "sold", "inactive", "pending"):
            raise HTTPException(400, "Invalid status")
        price = upd.pop("price", None)
        if upd:
            await db[cfg["coll"]].update_one({"id": item_id}, {"$set": upd})
        if price is not None:
            await record_price_change(db, kind, doc, price)
            await db[cfg["coll"]].update_one({"id": item_id}, {"$set": {"price": price}})
        out = await db[cfg["coll"]].find_one({"id": item_id}, {"_id": 0, "owner_email": 0, "contact_email": 0, "contact_phone": 0})
        return out

    @router.patch("/marketplace/listings/{item_id}")
    async def edit_listing(item_id: str, body: OwnerEdit, user: dict = Depends(get_current_user)):
        return await _owner_edit("listing", item_id, body, user)

    @router.patch("/autos/{item_id}")
    async def edit_auto(item_id: str, body: OwnerEdit, user: dict = Depends(get_current_user)):
        return await _owner_edit("auto", item_id, body, user)

    return router

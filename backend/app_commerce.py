"""App marketplace: browse food vs products, server-priced pickup/delivery quotes and full-payment checkout.

Pricing (admin-editable in platform_config id=pricing):
  pickup   → subtotal + 5% service fee
  delivery → subtotal + 5% service fee + delivery fee
  delivery fee = (base + per_mile × miles) × size multiplier of the largest item
  driver gets 90% of the delivery fee; Lumo keeps the 5% fee + 10% of the delivery fee.
"""
from __future__ import annotations

import re
import uuid
from datetime import datetime, timezone
from typing import Literal, Optional

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field

DEFAULT_PRICING = {
    "service_fee_pct": 5.0, "delivery_base": 3.99, "delivery_per_mile": 1.50, "driver_share_pct": 90.0,
    "size_multipliers": {"small": 1.0, "medium": 1.5, "large": 2.5, "xl": 4.0},
    "str_commission_pct": 5.0, "default_miles": 3.0,
}
SIZE_LABELS = {"small": "Fits in a bag (bike or car)", "medium": "Needs a car", "large": "Needs an SUV or van",
               "xl": "Needs a truck (couch, oversized box)"}
FOOD_CATEGORIES = ["Burgers", "Pizza", "Chicken", "Mexican", "Asian", "African", "Caribbean", "Breakfast",
                   "Healthy", "Desserts", "Coffee & drinks", "Food trucks", "Other food"]
PRODUCT_CATEGORIES = ["Electronics", "Home & furniture", "Clothing & shoes", "Beauty", "Groceries",
                      "Health", "Toys & kids", "Sports & outdoors", "Auto parts", "Books & media", "Pets",
                      "Tools", "Other"]


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


class QuoteIn(BaseModel):
    store_id: str
    fulfillment: Literal["pickup", "delivery"]
    lat: Optional[float] = None
    lng: Optional[float] = None


class CheckoutIn(QuoteIn):
    address: Optional[str] = Field(None, max_length=300)
    notes: Optional[str] = Field(None, max_length=500)
    origin_url: str


class SizeMultipliers(BaseModel):
    small: float = Field(..., ge=0.1, le=20)
    medium: float = Field(..., ge=0.1, le=20)
    large: float = Field(..., ge=0.1, le=20)
    xl: float = Field(..., ge=0.1, le=20)


class PricingIn(BaseModel):
    service_fee_pct: float = Field(..., ge=0, le=50)
    delivery_base: float = Field(..., ge=0, le=100)
    delivery_per_mile: float = Field(..., ge=0, le=50)
    driver_share_pct: float = Field(..., ge=0, le=100)
    size_multipliers: SizeMultipliers
    str_commission_pct: float = Field(..., ge=0, le=50)


def create_router(*, db, get_current_user, get_optional_user, require_admin, get_stripe, haversine_miles, tax_for, CheckoutSessionRequest):
    r = APIRouter(prefix="/api")

    async def pricing() -> dict:
        doc = await db.platform_config.find_one({"id": "pricing"}, {"_id": 0}) or {}
        return {**DEFAULT_PRICING, **{k: v for k, v in doc.items() if k != "id"}}

    async def quote(user_id: str, body: QuoteIn) -> dict:
        items = await db.cart_items.find({"user_id": user_id, "store_id": body.store_id}, {"_id": 0}).to_list(500)
        live = {i["id"]: i async for i in db.inventory.find(
            {"id": {"$in": [c["inventory_item_id"] for c in items]}, "status": "active"}, {"_id": 0})}
        items = [{**c, "price_usd": float(live[c["inventory_item_id"]]["price"]), "name": live[c["inventory_item_id"]]["name"]}
                 for c in items if c["inventory_item_id"] in live]
        if not items:
            raise HTTPException(400, "Your cart for this store is empty")
        store = await db.users.find_one({"id": body.store_id}, {"_id": 0, "storefront": 1, "name": 1})
        if not store or not store.get("storefront"):
            raise HTTPException(404, "Store not found")
        sf = store["storefront"]
        if body.fulfillment == "delivery" and sf.get("offers_delivery") is False:
            raise HTTPException(400, "This store only offers pickup")
        if body.fulfillment == "pickup" and sf.get("offers_pickup") is False:
            raise HTTPException(400, "This store only offers delivery")
        p = await pricing()
        subtotal = round(sum(float(i["price_usd"]) * int(i["quantity"]) for i in items), 2)
        service_fee = round(subtotal * p["service_fee_pct"] / 100, 2)
        delivery_fee = miles = 0.0
        size = "small"
        if body.fulfillment == "delivery":
            inv_ids = [i["inventory_item_id"] for i in items]
            order = ["small", "medium", "large", "xl"]
            async for inv in db.inventory.find({"id": {"$in": inv_ids}}, {"_id": 0, "size_class": 1}):
                s = inv.get("size_class") or "small"
                if order.index(s) > order.index(size):
                    size = s
            loc = sf.get("location") or {}
            if body.lat is not None and body.lng is not None and loc.get("lat") is not None:
                miles = round(haversine_miles(float(loc["lat"]), float(loc["lng"]), body.lat, body.lng), 1)
            else:
                miles = float(p["default_miles"])
            mult = float(p["size_multipliers"].get(size, 1.0))
            delivery_fee = round((p["delivery_base"] + p["delivery_per_mile"] * miles) * mult, 2)
        tax = tax_for("US")
        tax_amount = round(subtotal * tax["rate"], 2)
        driver_payout = round(delivery_fee * p["driver_share_pct"] / 100, 2)
        return {
            "store_id": body.store_id, "store_name": sf.get("name") or store.get("name"),
            "fulfillment": body.fulfillment, "items": items, "subtotal": subtotal,
            "service_fee": service_fee, "service_fee_pct": p["service_fee_pct"],
            "delivery_fee": delivery_fee, "miles": miles, "size_class": size, "size_label": SIZE_LABELS[size],
            "tax_amount": tax_amount, "tax_label": tax["label"],
            "total": round(subtotal + service_fee + delivery_fee + tax_amount, 2),
            "split": {"seller": subtotal, "driver": driver_payout,
                      "lumo": round(service_fee + delivery_fee - driver_payout, 2)},
        }

    @r.get("/app/market")
    async def market(kind: Literal["food", "products"] = "food", category: Optional[str] = None, q: Optional[str] = None,
                     viewer: Optional[dict] = Depends(get_optional_user)):
        from demo_filter import hide_demo
        role = "restaurant" if kind == "food" else "retailer"
        sf_q: dict = {"role": role, "storefront": {"$ne": None}, "deactivated_at": {"$exists": False}}
        sf_q = await hide_demo(db, sf_q, "id", viewer)
        stores = await db.users.find(sf_q, {"_id": 0, "id": 1, "name": 1, "storefront": 1}).to_list(300)
        ids = [s["id"] for s in stores]
        iq: dict = {"owner_id": {"$in": ids}, "status": "active"}
        if category:
            iq["category"] = category
        if q:
            rx = {"$regex": re.escape(q.strip()), "$options": "i"}
            iq["$or"] = [{"name": rx}, {"description": rx}, {"category": rx}]
        items = await db.inventory.find(iq, {"_id": 0}).sort("created_at", -1).to_list(200)
        names = {s["id"]: (s.get("storefront") or {}).get("name") or s.get("name") for s in stores}
        for i in items:
            i["store_name"] = names.get(i["owner_id"])
        with_items = {i["owner_id"] for i in items}
        if q:
            rx = re.compile(re.escape(q.strip()), re.I)
            with_items |= {s["id"] for s in stores if rx.search(s.get("name") or "") or rx.search((s["storefront"] or {}).get("cuisine") or "")}
        shown = [s for s in stores if (not category and not q) or s["id"] in with_items]
        return {"kind": kind, "categories": FOOD_CATEGORIES if kind == "food" else PRODUCT_CATEGORIES,
                "stores": shown, "items": items}

    @r.get("/app/pricing")
    async def public_pricing():
        p = await pricing()
        return {**p, "size_labels": SIZE_LABELS, "food_categories": FOOD_CATEGORIES, "product_categories": PRODUCT_CATEGORIES}

    @r.put("/admin/pricing")
    async def set_pricing(body: PricingIn, _a: dict = Depends(require_admin)):
        await db.platform_config.update_one({"id": "pricing"}, {"$set": body.model_dump()}, upsert=True)
        return await pricing()

    @r.post("/app/quote")
    async def get_quote(body: QuoteIn, user: dict = Depends(get_current_user)):
        return await quote(user["id"], body)

    @r.post("/app/checkout")
    async def checkout(body: CheckoutIn, req: Request, user: dict = Depends(get_current_user)):
        qt = await quote(user["id"], body)
        if body.fulfillment == "delivery" and not (body.address or "").strip():
            raise HTTPException(422, "Add a delivery address")
        order_id = str(uuid.uuid4())
        await db.orders.insert_one({
            "id": order_id, "customer_id": user["id"], "customer_name": user["name"], "store_id": body.store_id,
            "lines": [{"inventory_item_id": i["inventory_item_id"], "name": i["name"], "price_usd": float(i["price_usd"]),
                       "quantity": int(i["quantity"]), "media_url": i.get("media_url")} for i in qt["items"]],
            "fulfillment": body.fulfillment, "item_total": qt["subtotal"], "service_fee": qt["service_fee"],
            "delivery_fee": qt["delivery_fee"], "delivery_miles": qt["miles"], "size_class": qt["size_class"],
            "tax_amount": qt["tax_amount"], "total": qt["total"], "split": qt["split"],
            "delivery_address": {"address": body.address, "lat": body.lat, "lng": body.lng} if body.fulfillment == "delivery" else None,
            "notes": body.notes, "status": "payment_pending", "provider_id": None, "is_cart_order": True,
            "is_app_order": True, "created_at": _now(),
        })
        stripe = await get_stripe(req)
        metadata = {"order_id": order_id, "customer_id": user["id"], "type": "full", "store_id": body.store_id}
        session = await stripe.create_checkout_session(CheckoutSessionRequest(
            amount=float(qt["total"]), currency="usd",
            success_url=f"{body.origin_url}/checkout/success?session_id={{CHECKOUT_SESSION_ID}}&order_id={order_id}",
            cancel_url=f"{body.origin_url}/checkout/cancel?order_id={order_id}", metadata=metadata))
        await db.payment_transactions.insert_one({
            "id": str(uuid.uuid4()), "session_id": session.session_id, "order_id": order_id, "user_id": user["id"],
            "amount": float(qt["total"]), "currency": "usd", "type": "full", "status": "initiated",
            "payment_status": "unpaid", "metadata": metadata, "created_at": _now()})
        return {"url": session.url, "order_id": order_id, "total": qt["total"]}

    return r

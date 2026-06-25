"""
Classifieds module — Real Estate & Auto Sales marketplace.

Features:
- Real estate listings (homes, condos, land, rentals) with beds/baths/sqft/price filters.
- Auto sales listings with make/model/year/mileage/price filters.
- In-app inquiry threads between buyer and seller (masked: buyer never sees seller email).
- Optional Resend email notification to seller when an inquiry is opened
  (activated when RESEND_API_KEY is set in the environment).

Exposes `create_router(deps)` which returns a FastAPI APIRouter mounted under /api.
"""
from __future__ import annotations

import os
import uuid
import logging
import asyncio
from datetime import datetime, timezone
from typing import List, Optional, Literal

from fastapi import APIRouter, HTTPException, Depends, Query
from pydantic import BaseModel, Field, EmailStr

try:
    import resend  # type: ignore
except Exception:  # pragma: no cover
    resend = None  # type: ignore

logger = logging.getLogger("lumo.classifieds")

# ── Taxonomies ────────────────────────────────────────────────────────────────
PROPERTY_TYPES = ["house", "condo", "townhouse", "land", "multi_family", "apartment", "commercial"]
PROPERTY_LISTING_KINDS = ["sale", "rent"]

# Common auto manufacturers — used in filters dropdown
AUTO_MAKES = [
    "Acura", "Alfa Romeo", "Audi", "BMW", "Buick", "Cadillac", "Chevrolet", "Chrysler",
    "Dodge", "Fiat", "Ford", "Genesis", "GMC", "Honda", "Hyundai", "Infiniti", "Jaguar",
    "Jeep", "Kia", "Land Rover", "Lexus", "Lincoln", "Mazda", "Mercedes-Benz", "Mini",
    "Mitsubishi", "Nissan", "Polestar", "Porsche", "Ram", "Rivian", "Subaru", "Tesla",
    "Toyota", "Volkswagen", "Volvo", "Lucid", "Other",
]

AUTO_BODY_STYLES = ["Sedan", "SUV", "Truck", "Coupe", "Convertible", "Wagon", "Hatchback", "Van", "Minivan"]
AUTO_TRANSMISSIONS = ["Automatic", "Manual", "CVT", "Dual-clutch"]
AUTO_FUELS = ["Gasoline", "Diesel", "Hybrid", "Electric", "Plug-in Hybrid", "Other"]
AUTO_CONDITIONS = ["New", "Used", "Certified Pre-Owned"]


# ── Pydantic models ──────────────────────────────────────────────────────────
class RealEstateCreate(BaseModel):
    listing_kind: Literal["sale", "rent"] = "sale"
    property_type: Literal["house", "condo", "townhouse", "land", "multi_family", "apartment", "commercial"] = "house"
    title: str = Field(min_length=3, max_length=200)
    description: Optional[str] = None
    price: float = Field(gt=0)
    address: str = Field(min_length=2, max_length=300)
    city: Optional[str] = None
    state: Optional[str] = None
    country: Optional[str] = None
    lat: Optional[float] = None
    lng: Optional[float] = None
    bedrooms: Optional[float] = None
    bathrooms: Optional[float] = None
    sqft: Optional[float] = None
    lot_size_sqft: Optional[float] = None
    year_built: Optional[int] = None
    hoa_monthly: Optional[float] = None
    parking_spots: Optional[int] = None
    photos: List[str] = []
    contact_email: Optional[EmailStr] = None
    contact_phone: Optional[str] = None


class AutoCreate(BaseModel):
    title: str = Field(min_length=3, max_length=200)
    description: Optional[str] = None
    price: float = Field(gt=0)
    year: int = Field(ge=1900, le=2100)
    make: str = Field(min_length=1, max_length=80)
    model: str = Field(min_length=1, max_length=120)
    trim: Optional[str] = None
    mileage: Optional[float] = None
    body_style: Optional[str] = None
    transmission: Optional[str] = None
    fuel: Optional[str] = None
    condition: Optional[str] = None
    exterior_color: Optional[str] = None
    interior_color: Optional[str] = None
    drivetrain: Optional[str] = None  # FWD / RWD / AWD / 4WD
    vin: Optional[str] = None
    city: Optional[str] = None
    state: Optional[str] = None
    country: Optional[str] = None
    lat: Optional[float] = None
    lng: Optional[float] = None
    photos: List[str] = []
    contact_email: Optional[EmailStr] = None
    contact_phone: Optional[str] = None


class InquiryCreate(BaseModel):
    listing_kind: Literal["real_estate", "auto"]
    listing_id: str
    initial_message: str = Field(min_length=2, max_length=4000)


class InquiryMessageCreate(BaseModel):
    text: str = Field(min_length=1, max_length=4000)


# ── Helpers ──────────────────────────────────────────────────────────────────
def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _clean(doc: dict) -> dict:
    if not doc:
        return doc
    out = {k: v for k, v in doc.items() if k != "_id"}
    return out


def _masked_phone(phone: Optional[str]) -> Optional[str]:
    if not phone:
        return None
    digits = "".join(ch for ch in phone if ch.isdigit())
    if len(digits) < 4:
        return "•••"
    return f"•••-•••-{digits[-4:]}"


def _masked_email(email: Optional[str]) -> Optional[str]:
    if not email:
        return None
    if "@" not in email:
        return "•••"
    local, _, domain = email.partition("@")
    if len(local) <= 2:
        masked_local = local[0] + "•"
    else:
        masked_local = local[0] + "•••" + local[-1]
    return f"{masked_local}@{domain}"


async def _send_resend_email(*, to_email: str, subject: str, html: str) -> Optional[dict]:
    """Send an email via Resend if RESEND_API_KEY is configured. Non-blocking."""
    api_key = os.environ.get("RESEND_API_KEY")
    if not api_key or resend is None:
        return None
    sender = os.environ.get("SENDER_EMAIL", "onboarding@resend.dev")
    resend.api_key = api_key
    params = {"from": sender, "to": [to_email], "subject": subject, "html": html}
    try:
        result = await asyncio.to_thread(resend.Emails.send, params)
        return result
    except Exception as e:  # pragma: no cover
        logger.error(f"Resend send failed: {e}")
        return None


# ── Factory ──────────────────────────────────────────────────────────────────
def create_router(*, db, get_current_user) -> APIRouter:
    """Build the classifieds API router. Caller provides the shared `db` (Motor)
    and the auth dependency `get_current_user`."""
    router = APIRouter(prefix="/api")

    # ── Constants endpoint (filters)
    @router.get("/classifieds/constants")
    async def classifieds_constants():
        return {
            "property_types": PROPERTY_TYPES,
            "property_listing_kinds": PROPERTY_LISTING_KINDS,
            "auto_makes": AUTO_MAKES,
            "auto_body_styles": AUTO_BODY_STYLES,
            "auto_transmissions": AUTO_TRANSMISSIONS,
            "auto_fuels": AUTO_FUELS,
            "auto_conditions": AUTO_CONDITIONS,
        }

    # ── Real Estate ───────────────────────────────────────────────────────────
    @router.post("/real-estate")
    async def create_real_estate(body: RealEstateCreate, user: dict = Depends(get_current_user)):
        doc = body.model_dump()
        doc.update({
            "id": str(uuid.uuid4()),
            "owner_id": user["id"],
            "owner_name": user.get("name"),
            "owner_email": user.get("email"),
            "status": "active",
            "is_demo": False,
            "created_at": _now_iso(),
        })
        await db.real_estate.insert_one(doc)
        return _clean(doc)

    @router.get("/real-estate")
    async def list_real_estate(
        q: Optional[str] = None,
        property_type: Optional[str] = None,
        listing_kind: Optional[str] = None,
        city: Optional[str] = None,
        state: Optional[str] = None,
        min_price: Optional[float] = None,
        max_price: Optional[float] = None,
        min_beds: Optional[float] = None,
        min_baths: Optional[float] = None,
        min_sqft: Optional[float] = None,
        max_sqft: Optional[float] = None,
        min_year_built: Optional[int] = None,
        owner_id: Optional[str] = None,
        limit: int = 60,
    ):
        f: dict = {"status": "active"}
        if owner_id:
            f["owner_id"] = owner_id
        if property_type:
            f["property_type"] = property_type
        if listing_kind:
            f["listing_kind"] = listing_kind
        if city:
            f["city"] = {"$regex": f"^{city}$", "$options": "i"}
        if state:
            f["state"] = {"$regex": f"^{state}$", "$options": "i"}
        price_f = {}
        if min_price is not None:
            price_f["$gte"] = min_price
        if max_price is not None:
            price_f["$lte"] = max_price
        if price_f:
            f["price"] = price_f
        if min_beds is not None:
            f["bedrooms"] = {"$gte": min_beds}
        if min_baths is not None:
            f["bathrooms"] = {"$gte": min_baths}
        sqft_f = {}
        if min_sqft is not None:
            sqft_f["$gte"] = min_sqft
        if max_sqft is not None:
            sqft_f["$lte"] = max_sqft
        if sqft_f:
            f["sqft"] = sqft_f
        if min_year_built is not None:
            f["year_built"] = {"$gte": min_year_built}
        if q:
            f["$or"] = [
                {"title": {"$regex": q, "$options": "i"}},
                {"description": {"$regex": q, "$options": "i"}},
                {"address": {"$regex": q, "$options": "i"}},
                {"city": {"$regex": q, "$options": "i"}},
            ]
        docs = await db.real_estate.find(f).sort("created_at", -1).to_list(min(limit, 200))
        return [_clean(d) for d in docs]

    @router.get("/real-estate/{listing_id}")
    async def get_real_estate(listing_id: str):
        d = await db.real_estate.find_one({"id": listing_id})
        if not d:
            raise HTTPException(404, "Listing not found")
        d = _clean(d)
        # Mask seller contact for browse
        d["seller_email_masked"] = _masked_email(d.get("contact_email") or d.get("owner_email"))
        d["seller_phone_masked"] = _masked_phone(d.get("contact_phone"))
        d.pop("contact_email", None)
        d.pop("contact_phone", None)
        d.pop("owner_email", None)
        return d

    @router.delete("/real-estate/{listing_id}")
    async def delete_real_estate(listing_id: str, user: dict = Depends(get_current_user)):
        d = await db.real_estate.find_one({"id": listing_id})
        if not d:
            raise HTTPException(404, "Listing not found")
        if d.get("owner_id") != user["id"] and user.get("role") != "admin":
            raise HTTPException(403, "Not your listing")
        await db.real_estate.delete_one({"id": listing_id})
        return {"ok": True}

    # ── Auto Sales ────────────────────────────────────────────────────────────
    @router.post("/autos")
    async def create_auto(body: AutoCreate, user: dict = Depends(get_current_user)):
        doc = body.model_dump()
        doc.update({
            "id": str(uuid.uuid4()),
            "owner_id": user["id"],
            "owner_name": user.get("name"),
            "owner_email": user.get("email"),
            "status": "active",
            "is_demo": False,
            "created_at": _now_iso(),
        })
        await db.autos.insert_one(doc)
        return _clean(doc)

    @router.get("/autos")
    async def list_autos(
        q: Optional[str] = None,
        make: Optional[str] = None,
        model: Optional[str] = None,
        body_style: Optional[str] = None,
        transmission: Optional[str] = None,
        fuel: Optional[str] = None,
        condition: Optional[str] = None,
        min_year: Optional[int] = None,
        max_year: Optional[int] = None,
        min_price: Optional[float] = None,
        max_price: Optional[float] = None,
        max_mileage: Optional[float] = None,
        city: Optional[str] = None,
        state: Optional[str] = None,
        owner_id: Optional[str] = None,
        limit: int = 60,
    ):
        f: dict = {"status": "active"}
        if owner_id:
            f["owner_id"] = owner_id
        if make:
            f["make"] = {"$regex": f"^{make}$", "$options": "i"}
        if model:
            f["model"] = {"$regex": model, "$options": "i"}
        if body_style:
            f["body_style"] = body_style
        if transmission:
            f["transmission"] = transmission
        if fuel:
            f["fuel"] = fuel
        if condition:
            f["condition"] = condition
        if city:
            f["city"] = {"$regex": f"^{city}$", "$options": "i"}
        if state:
            f["state"] = {"$regex": f"^{state}$", "$options": "i"}
        year_f = {}
        if min_year is not None:
            year_f["$gte"] = min_year
        if max_year is not None:
            year_f["$lte"] = max_year
        if year_f:
            f["year"] = year_f
        price_f = {}
        if min_price is not None:
            price_f["$gte"] = min_price
        if max_price is not None:
            price_f["$lte"] = max_price
        if price_f:
            f["price"] = price_f
        if max_mileage is not None:
            f["mileage"] = {"$lte": max_mileage}
        if q:
            f["$or"] = [
                {"title": {"$regex": q, "$options": "i"}},
                {"description": {"$regex": q, "$options": "i"}},
                {"make": {"$regex": q, "$options": "i"}},
                {"model": {"$regex": q, "$options": "i"}},
            ]
        docs = await db.autos.find(f).sort("created_at", -1).to_list(min(limit, 200))
        return [_clean(d) for d in docs]

    @router.get("/autos/makes")
    async def list_makes():
        return {"makes": AUTO_MAKES}

    @router.get("/autos/{listing_id}")
    async def get_auto(listing_id: str):
        d = await db.autos.find_one({"id": listing_id})
        if not d:
            raise HTTPException(404, "Listing not found")
        d = _clean(d)
        d["seller_email_masked"] = _masked_email(d.get("contact_email") or d.get("owner_email"))
        d["seller_phone_masked"] = _masked_phone(d.get("contact_phone"))
        d.pop("contact_email", None)
        d.pop("contact_phone", None)
        d.pop("owner_email", None)
        return d

    @router.delete("/autos/{listing_id}")
    async def delete_auto(listing_id: str, user: dict = Depends(get_current_user)):
        d = await db.autos.find_one({"id": listing_id})
        if not d:
            raise HTTPException(404, "Listing not found")
        if d.get("owner_id") != user["id"] and user.get("role") != "admin":
            raise HTTPException(403, "Not your listing")
        await db.autos.delete_one({"id": listing_id})
        return {"ok": True}

    # ── Inquiry threads (masked chat) ─────────────────────────────────────────
    async def _load_listing(kind: str, listing_id: str) -> Optional[dict]:
        coll = db.real_estate if kind == "real_estate" else db.autos
        return await coll.find_one({"id": listing_id})

    @router.post("/inquiries")
    async def create_inquiry(body: InquiryCreate, user: dict = Depends(get_current_user)):
        listing = await _load_listing(body.listing_kind, body.listing_id)
        if not listing:
            raise HTTPException(404, "Listing not found")
        seller_id = listing["owner_id"]
        if seller_id == user["id"]:
            raise HTTPException(400, "Cannot inquire about your own listing")
        # De-dupe: re-use existing inquiry between same parties on same listing
        existing = await db.inquiries.find_one({
            "listing_kind": body.listing_kind, "listing_id": body.listing_id,
            "buyer_id": user["id"],
        })
        if existing:
            inquiry_id = existing["id"]
        else:
            inquiry_id = str(uuid.uuid4())
            await db.inquiries.insert_one({
                "id": inquiry_id,
                "listing_kind": body.listing_kind, "listing_id": body.listing_id,
                "listing_title": listing.get("title"),
                "listing_price": listing.get("price"),
                "buyer_id": user["id"], "buyer_name": user.get("name"),
                "seller_id": seller_id, "seller_name": listing.get("owner_name"),
                "created_at": _now_iso(),
                "last_message_at": _now_iso(),
                "buyer_unread_count": 0,
                "seller_unread_count": 0,
            })
        # Append the initial message
        msg = {
            "id": str(uuid.uuid4()),
            "inquiry_id": inquiry_id,
            "sender_id": user["id"], "sender_name": user.get("name"),
            "text": body.initial_message,
            "created_at": _now_iso(),
        }
        await db.inquiry_messages.insert_one(msg)
        await db.inquiries.update_one(
            {"id": inquiry_id},
            {"$set": {"last_message_at": msg["created_at"]},
             "$inc": {"seller_unread_count": 1}},
        )
        # Best-effort email notification to seller (masked: never expose buyer's email)
        seller = await db.users.find_one({"id": seller_id})
        seller_email = listing.get("contact_email") or (seller or {}).get("email")
        if seller_email:
            short_buyer = (user.get("name") or "A buyer").split()[0]
            html = f"""
<table width="100%" cellpadding="0" cellspacing="0" style="font-family: Arial, sans-serif; color: #0f172a; background:#f8fafc; padding: 24px;">
  <tr><td>
    <table width="600" align="center" cellpadding="24" cellspacing="0" style="background:#ffffff; border:1px solid #e2e8f0;">
      <tr><td>
        <p style="margin:0 0 8px 0; font-size:12px; color:#64748b; letter-spacing:1px;">LUMO · NEW INQUIRY</p>
        <h1 style="margin:0 0 12px 0; font-size:22px;">New message about your listing</h1>
        <p style="margin:0 0 4px 0; font-weight:600;">{listing.get('title')}</p>
        <p style="margin:0 0 16px 0; color:#64748b; font-size:14px;">from {short_buyer} on Lumo</p>
        <div style="background:#f1f5f9; padding:16px; border-left:3px solid #0f766e; margin:16px 0; font-size:14px; white-space:pre-wrap;">{body.initial_message[:1000]}</div>
        <p style="margin:16px 0 0 0; font-size:13px; color:#64748b;">Reply inside Lumo — the buyer's contact is masked for privacy.</p>
      </td></tr>
    </table>
  </td></tr>
</table>"""
            asyncio.create_task(_send_resend_email(
                to_email=seller_email,
                subject=f"New inquiry · {listing.get('title')[:60]}",
                html=html,
            ))
        return {"id": inquiry_id}

    @router.get("/inquiries")
    async def list_inquiries(role: Literal["buyer", "seller", "all"] = "all",
                              user: dict = Depends(get_current_user)):
        f: dict = {}
        if role == "buyer":
            f["buyer_id"] = user["id"]
        elif role == "seller":
            f["seller_id"] = user["id"]
        else:
            f["$or"] = [{"buyer_id": user["id"]}, {"seller_id": user["id"]}]
        docs = await db.inquiries.find(f).sort("last_message_at", -1).to_list(200)
        return [_clean(d) for d in docs]

    @router.get("/inquiries/{inquiry_id}")
    async def get_inquiry(inquiry_id: str, user: dict = Depends(get_current_user)):
        inq = await db.inquiries.find_one({"id": inquiry_id})
        if not inq:
            raise HTTPException(404, "Inquiry not found")
        if user["id"] not in (inq.get("buyer_id"), inq.get("seller_id")):
            raise HTTPException(403, "Not your inquiry")
        msgs = await db.inquiry_messages.find({"inquiry_id": inquiry_id}).sort("created_at", 1).to_list(500)
        # Mark this side as read
        if user["id"] == inq.get("buyer_id"):
            await db.inquiries.update_one({"id": inquiry_id}, {"$set": {"buyer_unread_count": 0}})
        else:
            await db.inquiries.update_one({"id": inquiry_id}, {"$set": {"seller_unread_count": 0}})
        return {"inquiry": _clean(inq), "messages": [_clean(m) for m in msgs]}

    @router.post("/inquiries/{inquiry_id}/messages")
    async def post_inquiry_message(inquiry_id: str, body: InquiryMessageCreate,
                                    user: dict = Depends(get_current_user)):
        inq = await db.inquiries.find_one({"id": inquiry_id})
        if not inq:
            raise HTTPException(404, "Inquiry not found")
        if user["id"] not in (inq.get("buyer_id"), inq.get("seller_id")):
            raise HTTPException(403, "Not your inquiry")
        msg = {
            "id": str(uuid.uuid4()),
            "inquiry_id": inquiry_id,
            "sender_id": user["id"], "sender_name": user.get("name"),
            "text": body.text,
            "created_at": _now_iso(),
        }
        await db.inquiry_messages.insert_one(msg)
        # Increment the other party's unread counter
        is_buyer = user["id"] == inq.get("buyer_id")
        inc_field = "seller_unread_count" if is_buyer else "buyer_unread_count"
        await db.inquiries.update_one(
            {"id": inquiry_id},
            {"$set": {"last_message_at": msg["created_at"]},
             "$inc": {inc_field: 1}},
        )
        return _clean(msg)

    return router

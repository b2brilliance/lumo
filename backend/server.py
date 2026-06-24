"""Lumo backend — single-file FastAPI server."""
from dotenv import load_dotenv
from pathlib import Path

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

import os
import uuid
import logging
import asyncio
import math
import secrets
import requests
import re
from datetime import datetime, timezone, timedelta
from typing import List, Optional, Literal

import jwt
import bcrypt
from fastapi import FastAPI, APIRouter, HTTPException, Depends, Request, UploadFile, File, Form, Header, Response
from fastapi.responses import Response as FastApiResponse
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel, Field, ConfigDict

from emergentintegrations.payments.stripe.checkout import (
    StripeCheckout, CheckoutSessionRequest
)
from emergentintegrations.llm.chat import LlmChat, UserMessage

# ────────────────────────────────────────────────────────────────────────────
# Setup
# ────────────────────────────────────────────────────────────────────────────
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger("lumo")

mongo_url = os.environ['MONGO_URL']
mongo_client = AsyncIOMotorClient(mongo_url)
db = mongo_client[os.environ['DB_NAME']]

JWT_SECRET = os.environ['JWT_SECRET']
JWT_ALGORITHM = "HS256"
APP_NAME = os.environ.get('APP_NAME', 'lumo')
STRIPE_API_KEY = os.environ['STRIPE_API_KEY']
EMERGENT_LLM_KEY = os.environ.get('EMERGENT_LLM_KEY')
STORAGE_URL = "https://integrations.emergentagent.com/objstore/api/v1/storage"

REMOTE_FRIENDLY_CATEGORIES = {
    "digital_tech", "marketing", "business_admin", "education",
    "legal", "financial", "remote_work", "research"
}

ALL_CATEGORIES = [
    # delivery
    "delivery", "courier", "moving",
    # local services
    "handyman", "cleaning", "landscaping", "auto", "pet_care", "personal_care", "events",
    # tech/digital + remote
    "digital_tech", "marketing", "business_admin", "education",
    "legal", "financial", "remote_work", "research",
]

def category_group(cat: str) -> str:
    if cat in REMOTE_FRIENDLY_CATEGORIES:
        return "remote_jobs"
    if cat in {"delivery", "courier", "moving"}:
        return "physical_delivery"
    if cat in {"digital_tech", "marketing", "business_admin", "education", "legal", "financial", "research"}:
        return "tech_digital"
    return "local_services"

# ────────────────────────────────────────────────────────────────────────────
# Storage helpers (Emergent Object Storage)
# ────────────────────────────────────────────────────────────────────────────
storage_key: Optional[str] = None

def init_storage() -> Optional[str]:
    global storage_key
    if storage_key:
        return storage_key
    if not EMERGENT_LLM_KEY:
        logger.warning("EMERGENT_LLM_KEY not set — storage disabled")
        return None
    try:
        resp = requests.post(f"{STORAGE_URL}/init", json={"emergent_key": EMERGENT_LLM_KEY}, timeout=30)
        resp.raise_for_status()
        storage_key = resp.json()["storage_key"]
        return storage_key
    except Exception as e:
        logger.error(f"Storage init failed: {e}")
        return None

def put_object(path: str, data: bytes, content_type: str) -> dict:
    key = init_storage()
    if not key:
        raise HTTPException(status_code=503, detail="Storage unavailable")
    resp = requests.put(
        f"{STORAGE_URL}/objects/{path}",
        headers={"X-Storage-Key": key, "Content-Type": content_type},
        data=data, timeout=120,
    )
    resp.raise_for_status()
    return resp.json()

def get_object(path: str):
    key = init_storage()
    if not key:
        raise HTTPException(status_code=503, detail="Storage unavailable")
    resp = requests.get(
        f"{STORAGE_URL}/objects/{path}",
        headers={"X-Storage-Key": key}, timeout=60,
    )
    if resp.status_code == 404:
        raise HTTPException(status_code=404, detail="File not found")
    resp.raise_for_status()
    return resp.content, resp.headers.get("Content-Type", "application/octet-stream")

# ────────────────────────────────────────────────────────────────────────────
# Helpers
# ────────────────────────────────────────────────────────────────────────────
def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()

def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")

def verify_password(plain: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(plain.encode("utf-8"), hashed.encode("utf-8"))
    except Exception:
        return False

def create_access_token(user_id: str, email: str, role: str) -> str:
    payload = {
        "sub": user_id, "email": email, "role": role,
        "exp": datetime.now(timezone.utc) + timedelta(days=7),
        "type": "access",
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)

def haversine_miles(lat1, lng1, lat2, lng2) -> float:
    R = 3958.8
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dlat = math.radians(lat2 - lat1)
    dlng = math.radians(lng2 - lng1)
    a = math.sin(dlat/2)**2 + math.cos(p1)*math.cos(p2)*math.sin(dlng/2)**2
    return 2 * R * math.asin(math.sqrt(a))

def clean_doc(doc: dict) -> dict:
    if doc is None:
        return doc
    doc = {k: v for k, v in doc.items() if k != "_id"}
    return doc

# ────────────────────────────────────────────────────────────────────────────
# Models
# ────────────────────────────────────────────────────────────────────────────
Role = Literal["customer", "provider", "retailer", "restaurant", "admin"]
PayUnit = Literal["hour", "day", "week", "flat"]
PaymentMethod = Literal["app", "cash", "card"]

class UserCreate(BaseModel):
    email: str
    password: str
    name: str
    role: Role = "customer"
    phone: Optional[str] = None

class UserLogin(BaseModel):
    email: str
    password: str

class UserOut(BaseModel):
    id: str
    email: str
    name: str
    role: str
    phone: Optional[str] = None
    wallet_balance: float = 0.0
    location: Optional[dict] = None
    service_radius_miles: float = 25.0
    categories: List[str] = []
    storefront: Optional[dict] = None
    created_at: str

class UserUpdate(BaseModel):
    name: Optional[str] = None
    phone: Optional[str] = None
    location: Optional[dict] = None  # {lat, lng, address}
    service_radius_miles: Optional[float] = None
    categories: Optional[List[str]] = None
    storefront: Optional[dict] = None

class JobCreate(BaseModel):
    title: str
    description: str
    category: str
    pickup_location: Optional[dict] = None  # {lat, lng, address}
    dropoff_location: Optional[dict] = None
    pay_rate: float
    pay_unit: PayUnit = "flat"
    estimated_units: float = 1.0  # e.g. 2 hours -> hourly
    media_url: Optional[str] = None
    media_type: Optional[str] = None  # image/jpeg, video/mp4
    is_remote: Optional[bool] = None
    payment_terms: Optional[str] = None  # free text terms
    allowed_payment_methods: Optional[List[PaymentMethod]] = None
    details: Optional[dict] = None  # schema-driven subcategory + fields
    delivery_quote: Optional[dict] = None  # breakdown of delivery pricing (P2P only)

class JobAccept(BaseModel):
    job_id: str
    quoted_pay_rate: Optional[float] = None
    notes: Optional[str] = None

class MarketplaceListingCreate(BaseModel):
    title: str
    description: str
    price: float
    category: str = "other"
    location: Optional[dict] = None
    media_url: Optional[str] = None
    media_type: Optional[str] = None
    delivery_available: bool = True
    attributes: Optional[dict] = None

class StorefrontUpsert(BaseModel):
    name: str
    logo_url: Optional[str] = None
    hours: Optional[str] = None  # human-readable
    address: str
    location: Optional[dict] = None  # {lat, lng}
    description: Optional[str] = None
    cuisine: Optional[str] = None  # restaurants
    category: Optional[str] = None  # retailers

class InventoryItemCreate(BaseModel):
    name: str
    description: Optional[str] = None
    price: float
    stock: int = 0
    media_url: Optional[str] = None
    media_type: Optional[str] = None
    category: Optional[str] = None

class CheckoutCreate(BaseModel):
    """Bundled 10% deposit checkout — item + delivery."""
    item_price: float
    delivery_fee: float
    listing_id: Optional[str] = None
    inventory_item_id: Optional[str] = None
    store_id: Optional[str] = None
    quantity: int = 1
    delivery_address: Optional[dict] = None
    notes: Optional[str] = None
    origin_url: str
    allowed_payment_methods: Optional[List[PaymentMethod]] = None
    payment_terms: Optional[str] = None

class FinalPaymentCreate(BaseModel):
    """Customer pays remaining balance — credits provider wallet."""
    order_id: str
    origin_url: str

class WithdrawRequest(BaseModel):
    amount: float
    method: str = "bank_transfer"
    notes: Optional[str] = None

class AssistantChat(BaseModel):
    message: str

class CredentialCreate(BaseModel):
    kind: str               # e.g. "rn", "bar_license", "electrician"
    category: str           # job category this credential applies to
    subcategory: Optional[str] = None
    state: Optional[str] = None  # US state if applicable
    license_number: Optional[str] = None
    expiry_date: Optional[str] = None  # ISO date string
    document_media_id: Optional[str] = None
    insurance_carrier: Optional[str] = None
    insurance_policy_number: Optional[str] = None
    insurance_expiry: Optional[str] = None
    notes: Optional[str] = None

# Categories where accepting / quoting a job requires at least one verified credential
CREDENTIAL_REQUIRED_CATEGORIES = {"medical", "legal"}

# Map of medical license_required enum (job.details.license_required) → acceptable credential kinds
MEDICAL_LICENSE_MAP = {
    "rn_lpn": {"rn", "lpn"},
    "cna_hha": {"cna", "hha"},
    "pt": {"dpt", "pta"},
    "ot": {"ot"},
    "slp": {"slp"},
    "rt": {"rt"},
    "phlebotomist": {"cpt"},
    "mental_health": {"lcsw", "lmft", "psychologist", "md_do_np_pa"},
    "ibclc": {"ibclc"},
    "doula": {"doula"},
    "md_do_np_pa": {"md_do_np_pa"},
    "rad_tech": {"rad_tech"},
    "other": set(),  # match against anything verified in the category
}

def acceptable_kinds_for(category: str, license_required: Optional[str]) -> Optional[set]:
    """Returns the set of acceptable credential kinds for a job's license_required field, or None if any kind matches."""
    if category == "medical" and license_required:
        s = MEDICAL_LICENSE_MAP.get(license_required)
        return s if s else None  # 'other' or unknown → accept any verified medical cred
    return None

class MessageCreate(BaseModel):
    body: str
    thread_provider_id: Optional[str] = None

class QuoteCreate(BaseModel):
    quoted_pay_rate: float
    quoted_pay_unit: PayUnit
    quoted_estimated_units: float = 1.0
    notes: Optional[str] = None

# ────────────────────────────────────────────────────────────────────────────
# Anti-poach message sanitizer
# ────────────────────────────────────────────────────────────────────────────
_PHONE_RE = re.compile(r"(?:\+?\d[\d\s\-().]{7,}\d)")
_EMAIL_RE = re.compile(r"[\w.+-]+@[\w-]+\.[\w.-]+")
_URL_RE = re.compile(r"(?i)\b(?:https?://|www\.)\S+")
_CONTACT_WORDS = re.compile(
    r"(?i)\b(whats?app|telegram|signal|wechat|viber|imessage|messenger|"
    r"venmo|cash\s?app|zelle|paypal|stripe|insta(?:gram)?|snap(?:chat)?|"
    r"tiktok|twitter|facebook|fb|linkedin|discord|skype|email|e-mail|phone|"
    r"call\s?me|text\s?me|dm\s?me|reach\s?out|off\s?platform|off\s?the\s?app)\b"
)

def sanitize_message(text: str) -> tuple[str, bool]:
    """Returns (cleaned_text, was_redacted)."""
    original = text
    text = _PHONE_RE.sub("[hidden]", text)
    text = _EMAIL_RE.sub("[hidden]", text)
    text = _URL_RE.sub("[hidden]", text)
    text = _CONTACT_WORDS.sub("[hidden]", text)
    # Long digit sequences (like "five five five one two three four")
    text = re.sub(r"(?:\b\d[\s\-.]?){7,}", "[hidden]", text)
    return text, text != original

# ────────────────────────────────────────────────────────────────────────────
# Auth dependency
# ────────────────────────────────────────────────────────────────────────────
security = HTTPBearer(auto_error=False)

async def get_current_user(creds: Optional[HTTPAuthorizationCredentials] = Depends(security)) -> dict:
    if not creds:
        raise HTTPException(status_code=401, detail="Not authenticated")
    token = creds.credentials
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid token")
    user = await db.users.find_one({"id": payload["sub"]})
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    user = clean_doc(user)
    user.pop("password_hash", None)
    return user

def require_role(*roles: str):
    async def checker(user: dict = Depends(get_current_user)) -> dict:
        if user.get("role") not in roles:
            raise HTTPException(status_code=403, detail=f"Requires role {roles}")
        return user
    return checker

# ────────────────────────────────────────────────────────────────────────────
# App & router
# ────────────────────────────────────────────────────────────────────────────
app = FastAPI(title="Lumo API")
api = APIRouter(prefix="/api")

# ────────────────────────────────────────────────────────────────────────────
# Auth routes
# ────────────────────────────────────────────────────────────────────────────
@api.post("/auth/register")
async def register(body: UserCreate):
    email = body.email.lower()
    existing = await db.users.find_one({"email": email})
    if existing:
        raise HTTPException(status_code=400, detail="Email already registered")
    user_doc = {
        "id": str(uuid.uuid4()),
        "email": email,
        "name": body.name,
        "role": body.role,
        "phone": body.phone,
        "password_hash": hash_password(body.password),
        "wallet_balance": 0.0,
        "location": None,
        "service_radius_miles": 25.0,
        "categories": [],
        "storefront": None,
        "created_at": now_iso(),
    }
    await db.users.insert_one(user_doc)
    token = create_access_token(user_doc["id"], email, body.role)
    out = clean_doc(user_doc)
    out.pop("password_hash", None)
    return {"token": token, "user": out}

@api.post("/auth/login")
async def login(body: UserLogin):
    email = body.email.lower()
    user = await db.users.find_one({"email": email})
    if not user or not verify_password(body.password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="Invalid email or password")
    token = create_access_token(user["id"], email, user["role"])
    out = clean_doc(user)
    out.pop("password_hash", None)
    return {"token": token, "user": out}

@api.get("/auth/me")
async def me(user: dict = Depends(get_current_user)):
    return user

@api.patch("/auth/me")
async def update_me(body: UserUpdate, user: dict = Depends(get_current_user)):
    update = {k: v for k, v in body.model_dump().items() if v is not None}
    if update:
        await db.users.update_one({"id": user["id"]}, {"$set": update})
    fresh = await db.users.find_one({"id": user["id"]})
    fresh = clean_doc(fresh)
    fresh.pop("password_hash", None)
    return fresh

# ────────────────────────────────────────────────────────────────────────────
# Media upload
# ────────────────────────────────────────────────────────────────────────────
@api.post("/media/upload")
async def upload_media(file: UploadFile = File(...), user: dict = Depends(get_current_user)):
    ext = (file.filename or "bin").rsplit(".", 1)[-1].lower() if file.filename and "." in file.filename else "bin"
    media_type = file.content_type or "application/octet-stream"
    path = f"{APP_NAME}/uploads/{user['id']}/{uuid.uuid4()}.{ext}"
    data = await file.read()
    if len(data) > 25 * 1024 * 1024:
        raise HTTPException(status_code=413, detail="File too large (25MB max)")
    result = put_object(path, data, media_type)
    media_doc = {
        "id": str(uuid.uuid4()),
        "storage_path": result["path"],
        "media_type": media_type,
        "size": result.get("size", len(data)),
        "owner_id": user["id"],
        "is_deleted": False,
        "created_at": now_iso(),
    }
    await db.media.insert_one(media_doc)
    return {"media_url": f"/api/media/{media_doc['id']}", "media_type": media_type, "id": media_doc["id"]}

@api.get("/media/{media_id}")
async def get_media(media_id: str):
    rec = await db.media.find_one({"id": media_id, "is_deleted": False})
    if not rec:
        raise HTTPException(status_code=404, detail="Media not found")
    data, content_type = get_object(rec["storage_path"])
    return FastApiResponse(content=data, media_type=rec.get("media_type", content_type))

# ────────────────────────────────────────────────────────────────────────────
# Jobs (service requests posted by customers; providers accept)
# ────────────────────────────────────────────────────────────────────────────
@api.post("/jobs")
async def create_job(body: JobCreate, user: dict = Depends(get_current_user)):
    is_remote = body.is_remote if body.is_remote is not None else (body.category in REMOTE_FRIENDLY_CATEGORIES)
    job = {
        "id": str(uuid.uuid4()),
        "customer_id": user["id"],
        "customer_name": user["name"],
        "title": body.title,
        "description": body.description,
        "category": body.category,
        "category_group": category_group(body.category),
        "is_remote": is_remote,
        "pickup_location": body.pickup_location,
        "dropoff_location": body.dropoff_location,
        "pay_rate": body.pay_rate,
        "pay_unit": body.pay_unit,
        "estimated_units": body.estimated_units,
        "media_url": body.media_url,
        "media_type": body.media_type,
        "payment_terms": body.payment_terms or "",
        "allowed_payment_methods": body.allowed_payment_methods or ["app", "cash", "card"],
        "details": body.details or {},
        "delivery_quote": body.delivery_quote or None,
        "status": "open",
        "provider_id": None,
        "deposit_paid": False,
        "deposit_amount": 0.0,
        "total_estimate": body.pay_rate * body.estimated_units,
        "created_at": now_iso(),
    }
    await db.jobs.insert_one(job)
    return clean_doc(job)

@api.get("/jobs")
async def list_jobs(
    status: Optional[str] = None,
    category_group_filter: Optional[str] = None,
    remote_only: bool = False,
    customer_id: Optional[str] = None,
    provider_id: Optional[str] = None,
):
    q: dict = {}
    if status:
        q["status"] = status
    if category_group_filter:
        q["category_group"] = category_group_filter
    if remote_only:
        q["is_remote"] = True
    if customer_id:
        q["customer_id"] = customer_id
    if provider_id:
        q["provider_id"] = provider_id
    docs = await db.jobs.find(q).sort("created_at", -1).to_list(500)
    return [clean_doc(d) for d in docs]

@api.get("/jobs/{job_id}")
async def get_job(job_id: str):
    j = await db.jobs.find_one({"id": job_id})
    if not j:
        raise HTTPException(404, "Job not found")
    return clean_doc(j)

@api.post("/jobs/{job_id}/accept")
async def accept_job(job_id: str, user: dict = Depends(require_role("provider"))):
    j = await db.jobs.find_one({"id": job_id})
    if not j:
        raise HTTPException(404, "Job not found")
    if j["status"] != "open":
        raise HTTPException(400, "Job is not open")
    if not await _has_verified_credential(user["id"], j["category"]):
        raise HTTPException(403, f"A verified credential is required to accept {j['category']} jobs. Add one in Provider Hub → Credentials.")
    # If the job specifies a license_required, verify the provider holds a matching credential
    lic_req = (j.get("details") or {}).get("license_required")
    needed = acceptable_kinds_for(j["category"], lic_req)
    match_info = None
    if needed is not None:
        cred = await db.credentials.find_one({"user_id": user["id"], "category": j["category"], "status": "verified", "kind": {"$in": list(needed)}})
        if not cred:
            raise HTTPException(403, f"This job requires a verified {lic_req.replace('_', ' / ').upper()} credential. Add or verify one in Credentials.")
        match_info = {"matched_kind": cred["kind"], "required": lic_req}
    update = {"status": "accepted", "provider_id": user["id"], "provider_name": user["name"], "accepted_at": now_iso()}
    if match_info:
        update["credential_match"] = match_info
    await db.jobs.update_one({"id": job_id}, {"$set": update})
    j = await db.jobs.find_one({"id": job_id})
    return clean_doc(j)

@api.post("/jobs/{job_id}/complete")
async def complete_job(job_id: str, user: dict = Depends(get_current_user)):
    j = await db.jobs.find_one({"id": job_id})
    if not j:
        raise HTTPException(404, "Job not found")
    if user["id"] not in (j.get("provider_id"), j.get("customer_id")):
        raise HTTPException(403, "Not your job")
    await db.jobs.update_one({"id": job_id}, {"$set": {"status": "completed", "completed_at": now_iso()}})
    j = await db.jobs.find_one({"id": job_id})
    return clean_doc(j)

# ────────────────────────────────────────────────────────────────────────────
# Provider opportunity polling — toast feed (filtered by radius + categories)
# ────────────────────────────────────────────────────────────────────────────
@api.get("/provider/opportunities")
async def provider_opportunities(
    since: Optional[str] = None,
    user: dict = Depends(require_role("provider")),
):
    q: dict = {"status": "open"}
    if since:
        q["created_at"] = {"$gt": since}
    docs = await db.jobs.find(q).sort("created_at", -1).to_list(200)
    results = []
    provider_loc = user.get("location") or {}
    radius = user.get("service_radius_miles") or 25.0
    categories = set(user.get("categories") or [])
    for d in docs:
        d = clean_doc(d)
        miles = None
        # remote jobs always pass
        if d.get("is_remote"):
            miles = 0.0
        else:
            pl = d.get("pickup_location") or d.get("dropoff_location") or {}
            if provider_loc.get("lat") is not None and pl.get("lat") is not None:
                miles = haversine_miles(provider_loc["lat"], provider_loc["lng"], pl["lat"], pl["lng"])
                if miles > radius:
                    continue
            else:
                miles = None
        if categories and d.get("category") not in categories and not d.get("is_remote"):
            # if provider specified categories, filter
            continue
        d["distance_miles"] = round(miles, 1) if miles is not None else None
        results.append(d)
    return results

# ────────────────────────────────────────────────────────────────────────────
# Marketplace listings
# ────────────────────────────────────────────────────────────────────────────
@api.post("/marketplace/listings")
async def create_listing(body: MarketplaceListingCreate, user: dict = Depends(get_current_user)):
    doc = {
        "id": str(uuid.uuid4()),
        "seller_id": user["id"],
        "seller_name": user["name"],
        "title": body.title,
        "description": body.description,
        "price": body.price,
        "category": body.category,
        "location": body.location,
        "media_url": body.media_url,
        "media_type": body.media_type,
        "delivery_available": body.delivery_available,
        "attributes": body.attributes or {},
        "status": "active",
        "created_at": now_iso(),
    }
    await db.listings.insert_one(doc)
    return clean_doc(doc)

@api.get("/marketplace/listings")
async def list_listings(seller_id: Optional[str] = None):
    q = {"status": "active"}
    if seller_id:
        q["seller_id"] = seller_id
    docs = await db.listings.find(q).sort("created_at", -1).to_list(500)
    return [clean_doc(d) for d in docs]

@api.get("/marketplace/listings/{listing_id}")
async def get_listing(listing_id: str):
    d = await db.listings.find_one({"id": listing_id})
    if not d:
        raise HTTPException(404, "Listing not found")
    return clean_doc(d)

# ────────────────────────────────────────────────────────────────────────────
# Storefronts (retailers & restaurants)
# ────────────────────────────────────────────────────────────────────────────
@api.put("/storefront")
async def upsert_storefront(body: StorefrontUpsert, user: dict = Depends(require_role("retailer", "restaurant"))):
    sf = body.model_dump()
    sf["owner_id"] = user["id"]
    sf["role"] = user["role"]
    sf["updated_at"] = now_iso()
    await db.users.update_one({"id": user["id"]}, {"$set": {"storefront": sf, "name": body.name}})
    return sf

@api.get("/stores")
async def list_stores():
    docs = await db.users.find({"role": "retailer", "storefront": {"$ne": None}}).to_list(500)
    out = []
    for d in docs:
        d = clean_doc(d)
        d.pop("password_hash", None)
        out.append({"id": d["id"], "name": d["name"], "storefront": d.get("storefront")})
    return out

@api.get("/restaurants")
async def list_restaurants():
    docs = await db.users.find({"role": "restaurant", "storefront": {"$ne": None}}).to_list(500)
    out = []
    for d in docs:
        d = clean_doc(d)
        d.pop("password_hash", None)
        out.append({"id": d["id"], "name": d["name"], "storefront": d.get("storefront")})
    return out

@api.get("/storefronts/{store_id}")
async def get_storefront(store_id: str):
    d = await db.users.find_one({"id": store_id})
    if not d or not d.get("storefront"):
        raise HTTPException(404, "Storefront not found")
    d = clean_doc(d)
    d.pop("password_hash", None)
    return {"id": d["id"], "name": d["name"], "role": d["role"], "storefront": d.get("storefront")}

# Inventory
@api.post("/inventory")
async def create_inventory(body: InventoryItemCreate, user: dict = Depends(require_role("retailer", "restaurant"))):
    doc = {
        "id": str(uuid.uuid4()),
        "owner_id": user["id"],
        "owner_role": user["role"],
        "store_name": user["name"],
        "name": body.name,
        "description": body.description,
        "price": body.price,
        "stock": body.stock,
        "media_url": body.media_url,
        "media_type": body.media_type,
        "category": body.category,
        "status": "active",
        "created_at": now_iso(),
    }
    await db.inventory.insert_one(doc)
    return clean_doc(doc)

@api.get("/inventory")
async def list_inventory(owner_id: Optional[str] = None, user: Optional[dict] = None):
    q = {"status": "active"}
    if owner_id:
        q["owner_id"] = owner_id
    docs = await db.inventory.find(q).sort("created_at", -1).to_list(1000)
    return [clean_doc(d) for d in docs]

@api.get("/inventory/mine")
async def my_inventory(user: dict = Depends(require_role("retailer", "restaurant"))):
    docs = await db.inventory.find({"owner_id": user["id"], "status": "active"}).sort("created_at", -1).to_list(1000)
    return [clean_doc(d) for d in docs]

@api.patch("/inventory/{item_id}")
async def update_inventory(item_id: str, body: InventoryItemCreate, user: dict = Depends(require_role("retailer", "restaurant"))):
    item = await db.inventory.find_one({"id": item_id, "owner_id": user["id"]})
    if not item:
        raise HTTPException(404, "Item not found")
    update = body.model_dump(exclude_none=True)
    await db.inventory.update_one({"id": item_id}, {"$set": update})
    item = await db.inventory.find_one({"id": item_id})
    return clean_doc(item)

@api.delete("/inventory/{item_id}")
async def delete_inventory(item_id: str, user: dict = Depends(require_role("retailer", "restaurant"))):
    res = await db.inventory.update_one({"id": item_id, "owner_id": user["id"]}, {"$set": {"status": "deleted"}})
    if res.matched_count == 0:
        raise HTTPException(404, "Item not found")
    return {"deleted": True}

# ────────────────────────────────────────────────────────────────────────────
# Orders + Bundled 10% Stripe deposit checkout
# ────────────────────────────────────────────────────────────────────────────
async def _get_stripe(req: Request) -> StripeCheckout:
    host_url = str(req.base_url).rstrip("/")
    webhook_url = f"{host_url}/api/webhook/stripe"
    return StripeCheckout(api_key=STRIPE_API_KEY, webhook_url=webhook_url)

@api.post("/checkout/deposit")
async def checkout_deposit(body: CheckoutCreate, req: Request, user: dict = Depends(get_current_user)):
    """Create order + Stripe checkout for 10% bundled deposit (item + delivery)."""
    item_total = round(body.item_price * body.quantity, 2)
    delivery_fee = round(body.delivery_fee, 2)
    item_deposit = round(item_total * 0.10, 2)
    delivery_deposit = round(delivery_fee * 0.10, 2)
    deposit_total = round(item_deposit + delivery_deposit, 2)
    remaining = round(item_total + delivery_fee - deposit_total, 2)
    if deposit_total <= 0:
        raise HTTPException(400, "Invalid amounts")

    order_id = str(uuid.uuid4())
    order_doc = {
        "id": order_id,
        "customer_id": user["id"],
        "customer_name": user["name"],
        "listing_id": body.listing_id,
        "inventory_item_id": body.inventory_item_id,
        "store_id": body.store_id,
        "quantity": body.quantity,
        "item_total": item_total,
        "delivery_fee": delivery_fee,
        "item_deposit": item_deposit,
        "delivery_deposit": delivery_deposit,
        "deposit_total": deposit_total,
        "remaining_total": remaining,
        "delivery_address": body.delivery_address,
        "notes": body.notes,
        "allowed_payment_methods": body.allowed_payment_methods or ["app", "cash", "card"],
        "payment_terms": body.payment_terms or "",
        "status": "deposit_pending",
        "provider_id": None,
        "created_at": now_iso(),
    }
    await db.orders.insert_one(order_doc)

    stripe = await _get_stripe(req)
    success_url = f"{body.origin_url}/checkout/success?session_id={{CHECKOUT_SESSION_ID}}&order_id={order_id}"
    cancel_url = f"{body.origin_url}/checkout/cancel?order_id={order_id}"
    metadata = {
        "order_id": order_id, "customer_id": user["id"], "type": "deposit",
        "item_deposit": str(item_deposit), "delivery_deposit": str(delivery_deposit),
    }
    session = await stripe.create_checkout_session(CheckoutSessionRequest(
        amount=float(deposit_total), currency="usd",
        success_url=success_url, cancel_url=cancel_url, metadata=metadata,
    ))
    await db.payment_transactions.insert_one({
        "id": str(uuid.uuid4()),
        "session_id": session.session_id,
        "order_id": order_id,
        "user_id": user["id"],
        "amount": float(deposit_total),
        "currency": "usd",
        "type": "deposit",
        "status": "initiated",
        "payment_status": "unpaid",
        "metadata": metadata,
        "created_at": now_iso(),
    })
    return {"url": session.url, "session_id": session.session_id, "order_id": order_id}

@api.post("/checkout/final")
async def checkout_final(body: FinalPaymentCreate, req: Request, user: dict = Depends(get_current_user)):
    order = await db.orders.find_one({"id": body.order_id})
    if not order:
        raise HTTPException(404, "Order not found")
    if order["customer_id"] != user["id"]:
        raise HTTPException(403, "Not your order")
    if order["status"] not in ("deposit_paid", "in_progress", "completed"):
        raise HTTPException(400, "Deposit must be paid first")
    amount = float(order["remaining_total"])
    if amount <= 0:
        raise HTTPException(400, "Nothing remaining to pay")
    stripe = await _get_stripe(req)
    success_url = f"{body.origin_url}/checkout/success?session_id={{CHECKOUT_SESSION_ID}}&order_id={order['id']}"
    cancel_url = f"{body.origin_url}/checkout/cancel?order_id={order['id']}"
    metadata = {"order_id": order["id"], "customer_id": user["id"], "type": "final"}
    session = await stripe.create_checkout_session(CheckoutSessionRequest(
        amount=amount, currency="usd",
        success_url=success_url, cancel_url=cancel_url, metadata=metadata,
    ))
    await db.payment_transactions.insert_one({
        "id": str(uuid.uuid4()),
        "session_id": session.session_id,
        "order_id": order["id"],
        "user_id": user["id"],
        "amount": amount,
        "currency": "usd",
        "type": "final",
        "status": "initiated",
        "payment_status": "unpaid",
        "metadata": metadata,
        "created_at": now_iso(),
    })
    return {"url": session.url, "session_id": session.session_id}

@api.get("/checkout/status/{session_id}")
async def checkout_status(session_id: str, req: Request):
    stripe = await _get_stripe(req)
    status = await stripe.get_checkout_status(session_id)
    tx = await db.payment_transactions.find_one({"session_id": session_id})
    if not tx:
        return {"payment_status": status.payment_status, "status": status.status}
    # Idempotent finalize
    if status.payment_status == "paid" and tx["payment_status"] != "paid":
        await db.payment_transactions.update_one(
            {"session_id": session_id},
            {"$set": {"status": status.status, "payment_status": status.payment_status, "paid_at": now_iso()}}
        )
        order = await db.orders.find_one({"id": tx["order_id"]})
        if order:
            if tx["type"] == "deposit":
                await db.orders.update_one({"id": order["id"]}, {"$set": {"status": "deposit_paid", "deposit_paid_at": now_iso()}})
            elif tx["type"] == "final":
                # Credit provider wallet with the final amount (minus 10% platform cut already kept as deposit)
                await db.orders.update_one({"id": order["id"]}, {"$set": {"status": "completed", "final_paid_at": now_iso()}})
                provider_id = order.get("provider_id")
                if provider_id:
                    credit = float(tx["amount"])
                    await db.users.update_one({"id": provider_id}, {"$inc": {"wallet_balance": credit}})
                    await db.wallet_transactions.insert_one({
                        "id": str(uuid.uuid4()), "user_id": provider_id, "amount": credit,
                        "type": "credit", "reason": f"Order {order['id']} final payment",
                        "order_id": order["id"], "created_at": now_iso(),
                    })
    elif status.status == "expired" and tx["status"] != "expired":
        await db.payment_transactions.update_one(
            {"session_id": session_id},
            {"$set": {"status": "expired", "payment_status": status.payment_status}}
        )
    return {
        "payment_status": status.payment_status,
        "status": status.status,
        "amount_total": status.amount_total,
        "currency": status.currency,
        "metadata": status.metadata,
    }

@api.post("/webhook/stripe")
async def stripe_webhook(req: Request):
    body = await req.body()
    sig = req.headers.get("Stripe-Signature", "")
    stripe = await _get_stripe(req)
    try:
        evt = await stripe.handle_webhook(body, sig)
    except Exception as e:
        logger.error(f"Webhook error: {e}")
        raise HTTPException(400, "Webhook error")
    # We rely on polling to finalize order; just log and return
    return {"received": True, "type": evt.event_type}

# ────────────────────────────────────────────────────────────────────────────
# Orders queries
# ────────────────────────────────────────────────────────────────────────────
@api.get("/orders")
async def list_orders(user: dict = Depends(get_current_user)):
    q = {"$or": [{"customer_id": user["id"]}, {"provider_id": user["id"]}, {"store_id": user["id"]}]}
    docs = await db.orders.find(q).sort("created_at", -1).to_list(500)
    return [clean_doc(d) for d in docs]

@api.get("/orders/{order_id}")
async def get_order(order_id: str, user: dict = Depends(get_current_user)):
    d = await db.orders.find_one({"id": order_id})
    if not d:
        raise HTTPException(404, "Order not found")
    return clean_doc(d)

@api.post("/orders/{order_id}/accept_delivery")
async def accept_order_delivery(order_id: str, user: dict = Depends(require_role("provider"))):
    o = await db.orders.find_one({"id": order_id})
    if not o:
        raise HTTPException(404, "Order not found")
    if o["status"] != "deposit_paid" or o.get("provider_id"):
        raise HTTPException(400, "Order not available")
    await db.orders.update_one({"id": order_id}, {"$set": {"provider_id": user["id"], "provider_name": user["name"], "status": "in_progress"}})
    o = await db.orders.find_one({"id": order_id})
    return clean_doc(o)

# ────────────────────────────────────────────────────────────────────────────
# Wallet & withdrawals
# ────────────────────────────────────────────────────────────────────────────
@api.get("/wallet")
async def wallet(user: dict = Depends(get_current_user)):
    txns = await db.wallet_transactions.find({"user_id": user["id"]}).sort("created_at", -1).to_list(200)
    return {"balance": user.get("wallet_balance", 0.0), "transactions": [clean_doc(t) for t in txns]}

@api.post("/wallet/withdraw")
async def withdraw(body: WithdrawRequest, user: dict = Depends(get_current_user)):
    bal = float(user.get("wallet_balance", 0.0))
    if body.amount <= 0 or body.amount > bal:
        raise HTTPException(400, "Invalid amount")
    wr = {
        "id": str(uuid.uuid4()),
        "user_id": user["id"], "user_name": user["name"], "user_email": user["email"],
        "amount": body.amount, "method": body.method, "notes": body.notes,
        "status": "pending", "created_at": now_iso(),
    }
    await db.withdrawal_requests.insert_one(wr)
    await db.users.update_one({"id": user["id"]}, {"$inc": {"wallet_balance": -body.amount}})
    await db.wallet_transactions.insert_one({
        "id": str(uuid.uuid4()), "user_id": user["id"], "amount": -body.amount,
        "type": "debit", "reason": "Withdrawal requested",
        "withdrawal_id": wr["id"], "created_at": now_iso(),
    })
    return clean_doc(wr)

# ────────────────────────────────────────────────────────────────────────────
# Map data
# ────────────────────────────────────────────────────────────────────────────
@api.get("/map/jobs")
async def map_jobs(remote_only: bool = False, category_group_filter: Optional[str] = None):
    q = {"status": "open"}
    if remote_only:
        q["is_remote"] = True
    if category_group_filter:
        q["category_group"] = category_group_filter
    docs = await db.jobs.find(q).to_list(500)
    pins = []
    for d in docs:
        d = clean_doc(d)
        loc = d.get("pickup_location") or d.get("dropoff_location")
        if not loc or loc.get("lat") is None:
            # remote without explicit loc — give a default
            if d.get("is_remote"):
                loc = {"lat": 39.8283, "lng": -98.5795, "address": "Remote"}
            else:
                continue
        pins.append({
            "id": d["id"], "title": d["title"], "category": d["category"],
            "category_group": d["category_group"], "is_remote": d["is_remote"],
            "lat": loc["lat"], "lng": loc["lng"], "address": loc.get("address"),
            "pay_rate": d["pay_rate"], "pay_unit": d["pay_unit"],
        })
    return pins

@api.get("/")
async def root():
    return {"app": "lumo", "status": "ok"}

# ────────────────────────────────────────────────────────────────────────────
# Chat messages (job-scoped, with anti-poach sanitizer)
# ────────────────────────────────────────────────────────────────────────────
async def _job_chat_allowed(job: dict, user: dict) -> bool:
    """Customer of job, provider already assigned, OR (status=open AND user is provider)."""
    if job["customer_id"] == user["id"]:
        return True
    if job.get("provider_id") == user["id"]:
        return True
    if job["status"] == "open" and user["role"] == "provider":
        return True
    return False

@api.post("/jobs/{job_id}/messages")
async def post_message(job_id: str, body: MessageCreate, user: dict = Depends(get_current_user)):
    job = await db.jobs.find_one({"id": job_id})
    if not job:
        raise HTTPException(404, "Job not found")
    if not await _job_chat_allowed(job, user):
        raise HTTPException(403, "Not allowed to message on this job")
    text = (body.body or "").strip()
    if not text:
        raise HTTPException(400, "Empty message")
    if len(text) > 2000:
        raise HTTPException(400, "Message too long")
    cleaned, redacted = sanitize_message(text)
    # Determine the "thread" — customer ↔ a specific provider.
    # If job has an assigned provider, that's the thread. Else thread = sender provider (so open-job inquiries are 1-on-1).
    if job.get("provider_id"):
        thread_provider_id = job["provider_id"]
    elif user["role"] == "provider":
        thread_provider_id = user["id"]
    elif body.thread_provider_id:
        thread_provider_id = body.thread_provider_id
    else:
        raise HTTPException(400, "No provider thread yet — wait for a provider to message first")
    msg = {
        "id": str(uuid.uuid4()),
        "job_id": job_id,
        "thread_provider_id": thread_provider_id,
        "customer_id": job["customer_id"],
        "sender_id": user["id"],
        "sender_name": user["name"],
        "sender_role": user["role"],
        "body": cleaned,
        "redacted": redacted,
        "created_at": now_iso(),
    }
    await db.messages.insert_one(msg)
    # Notify the recipient (the other side of this thread).
    if user["role"] == "provider":
        recipient_id = job["customer_id"]
    else:
        # sender is customer (or other) — recipient is the thread provider
        recipient_id = thread_provider_id
    if recipient_id and recipient_id != user["id"]:
        snippet = cleaned[:120] + ("…" if len(cleaned) > 120 else "")
        await db.notifications.insert_one({
            "id": str(uuid.uuid4()),
            "user_id": recipient_id,
            "type": "new_message",
            "title": f"{user['name']} sent a message",
            "body": f"On \"{job['title']}\": {snippet}",
            "link": f"/jobs/{job_id}",
            "job_id": job_id,
            "message_id": msg["id"],
            "read": False,
            "created_at": now_iso(),
        })
    return clean_doc(msg)

@api.get("/jobs/{job_id}/messages")
async def list_messages(job_id: str, since: Optional[str] = None, thread_provider_id: Optional[str] = None, user: dict = Depends(get_current_user)):
    job = await db.jobs.find_one({"id": job_id})
    if not job:
        raise HTTPException(404, "Job not found")
    if not await _job_chat_allowed(job, user):
        raise HTTPException(403, "Not allowed")
    # Determine which thread to show
    if job.get("provider_id"):
        tpid = job["provider_id"]
    elif user["role"] == "provider":
        tpid = user["id"]
    elif thread_provider_id:
        tpid = thread_provider_id
    else:
        tpid = None  # customer with no inquiries yet
    q: dict = {"job_id": job_id}
    if tpid:
        q["thread_provider_id"] = tpid
    if since:
        q["created_at"] = {"$gt": since}
    docs = await db.messages.find(q).sort("created_at", 1).to_list(500)
    return [clean_doc(d) for d in docs]

@api.get("/jobs/{job_id}/threads")
async def list_job_threads(job_id: str, user: dict = Depends(get_current_user)):
    """Customer view: list of provider threads on an open job."""
    job = await db.jobs.find_one({"id": job_id})
    if not job:
        raise HTTPException(404, "Job not found")
    if job["customer_id"] != user["id"]:
        raise HTTPException(403, "Not your job")
    # Aggregate distinct thread_provider_id and last message
    msgs = await db.messages.find({"job_id": job_id}).sort("created_at", -1).to_list(1000)
    seen: dict = {}
    for m in msgs:
        tpid = m["thread_provider_id"]
        if tpid not in seen:
            # find provider name
            seen[tpid] = {"provider_id": tpid, "last_message": m["body"], "last_at": m["created_at"]}
    return list(seen.values())

@api.get("/chats/inbox")
async def chat_inbox(user: dict = Depends(get_current_user)):
    """All threads this user is part of, with latest message + counts."""
    # Find all messages where user is customer, provider, or sender
    q: dict
    if user["role"] == "provider":
        q = {"$or": [{"thread_provider_id": user["id"]}, {"customer_id": user["id"]}]}
    else:
        q = {"customer_id": user["id"]}
    docs = await db.messages.find(q).sort("created_at", -1).to_list(1000)
    threads: dict = {}
    for m in docs:
        key = f"{m['job_id']}:{m['thread_provider_id']}"
        if key in threads:
            continue
        threads[key] = {
            "job_id": m["job_id"],
            "thread_provider_id": m["thread_provider_id"],
            "last_message": m["body"],
            "last_at": m["created_at"],
            "last_sender": m["sender_name"],
        }
    # Hydrate job titles
    job_ids = list({t["job_id"] for t in threads.values()})
    jobs = await db.jobs.find({"id": {"$in": job_ids}}).to_list(500)
    job_map = {j["id"]: j for j in jobs}
    out = []
    for t in threads.values():
        j = job_map.get(t["job_id"], {})
        out.append({**t, "job_title": j.get("title"), "job_status": j.get("status")})
    return sorted(out, key=lambda x: x["last_at"], reverse=True)

@api.get("/health")
async def health():
    return {"ok": True}

# ────────────────────────────────────────────────────────────────────────────
# AI Assistant (Claude Sonnet via Emergent LLM key)
# ────────────────────────────────────────────────────────────────────────────
ASSISTANT_SYSTEM_PROMPT = """You are Lumi, the friendly in-app assistant for Lumo — a multi-category marketplace that connects customers with providers for deliveries, local services (handyman, cleaning, landscaping, auto, pet care, personal care, events), digital/remote work, and orders from local stores and restaurants.

Your job is to help users:
- Understand how Lumo works (posting requests, accepting quotes, payments, wallets, deliveries).
- Walk them through ordering, pricing, and choosing the right category.
- Answer questions about payment terms: a 10% bundled deposit on item + 10% delivery is collected at checkout, held by Lumo until the work is done. The remaining balance is paid via app, card, or cash by mutual agreement.
- Explain that providers can accept at the asking rate OR send a counter-offer (quote). Pay units are per hour, day, week, or flat.
- Help fill out the right details for the service category (e.g., for cleaning: rooms, tasks, # bathrooms, laundry loads; for auto roadside: gas/battery/tire + vehicle make/model/year; for moving: from/to addresses + property size).
- Help customers describe what they need clearly.

Tone: warm, concise, plain-spoken. No emojis. Use short paragraphs and bullet lists when it helps. Never ask for or display phone numbers, emails, or off-platform contact details — keep everything on Lumo.
If asked something you genuinely don't know, say so and suggest the user post a service request or message a provider directly.
Keep replies under ~180 words unless the user clearly needs more.
"""

@api.post("/assistant/chat")
async def assistant_chat(body: AssistantChat, user: dict = Depends(get_current_user)):
    if not EMERGENT_LLM_KEY:
        raise HTTPException(503, "Assistant unavailable")
    text = (body.message or "").strip()
    if not text:
        raise HTTPException(400, "Empty message")
    if len(text) > 2000:
        raise HTTPException(400, "Message too long")
    session_id = f"lumo-asst-{user['id']}"
    # Load saved history doc (one per user)
    history_doc = await db.assistant_chats.find_one({"user_id": user["id"]}) or {
        "user_id": user["id"], "messages": [], "created_at": now_iso()
    }
    chat = LlmChat(
        api_key=EMERGENT_LLM_KEY,
        session_id=session_id,
        system_message=ASSISTANT_SYSTEM_PROMPT,
    ).with_model("anthropic", "claude-sonnet-4-6")
    # Replay prior turns into the LlmChat instance
    for m in history_doc.get("messages", [])[-20:]:  # cap context
        if m["role"] == "user":
            try:
                await chat.send_message(UserMessage(text=m["content"]))
            except Exception:
                break
    try:
        reply = await chat.send_message(UserMessage(text=text))
    except Exception as e:
        logger.error(f"Assistant error: {e}")
        raise HTTPException(502, "Assistant temporarily unavailable")
    # Persist turns
    ts = now_iso()
    new_msgs = history_doc.get("messages", []) + [
        {"role": "user", "content": text, "ts": ts},
        {"role": "assistant", "content": reply, "ts": now_iso()},
    ]
    await db.assistant_chats.update_one(
        {"user_id": user["id"]},
        {"$set": {"user_id": user["id"], "messages": new_msgs[-40:], "updated_at": now_iso()}},
        upsert=True,
    )
    return {"reply": reply}

@api.get("/assistant/history")
async def assistant_history(user: dict = Depends(get_current_user)):
    doc = await db.assistant_chats.find_one({"user_id": user["id"]})
    if not doc:
        return {"messages": []}
    return {"messages": doc.get("messages", [])}

@api.post("/assistant/clear")
async def assistant_clear(user: dict = Depends(get_current_user)):
    await db.assistant_chats.delete_one({"user_id": user["id"]})
    return {"ok": True}

# ────────────────────────────────────────────────────────────────────────────
# Credentials — licenses / certifications / insurance for providers
# ────────────────────────────────────────────────────────────────────────────
async def _has_verified_credential(user_id: str, category: str) -> bool:
    if category not in CREDENTIAL_REQUIRED_CATEGORIES:
        return True
    doc = await db.credentials.find_one({"user_id": user_id, "category": category, "status": "verified"})
    return doc is not None

@api.post("/credentials")
async def create_credential(body: CredentialCreate, user: dict = Depends(require_role("provider"))):
    doc = body.model_dump()
    doc.update({
        "id": str(uuid.uuid4()),
        "user_id": user["id"],
        "user_name": user["name"],
        "status": "submitted",  # pending admin review
        "created_at": now_iso(),
    })
    await db.credentials.insert_one(doc)
    return clean_doc(doc)

@api.get("/credentials/mine")
async def list_my_credentials(user: dict = Depends(get_current_user)):
    docs = await db.credentials.find({"user_id": user["id"]}).sort("created_at", -1).to_list(100)
    # Lazy expiry reminder check: fire notifications when expiry within 30 days
    today = datetime.now(timezone.utc).date()
    for d in docs:
        for date_field, label_kind in [("expiry_date", "license"), ("insurance_expiry", "insurance")]:
            exp = d.get(date_field)
            if not exp:
                continue
            try:
                exp_d = datetime.fromisoformat(exp).date() if "T" in exp else datetime.strptime(exp, "%Y-%m-%d").date()
            except Exception:
                continue
            days_left = (exp_d - today).days
            if days_left > 30:
                continue
            last_key = f"last_{label_kind}_expiry_notice_at"
            last = d.get(last_key)
            if last:
                try:
                    last_dt = datetime.fromisoformat(last).date()
                    if (today - last_dt).days < 7:
                        continue  # already notified within last 7 days
                except Exception:
                    pass
            kind_label = d["kind"].replace("_", " ").upper()
            if days_left < 0:
                title = f"Your {label_kind} expired"
                body = f"Your {kind_label} {label_kind} expired on {exp}. Update it to keep accepting restricted jobs."
                ntype = f"{label_kind}_expired"
            else:
                title = f"Your {label_kind} expires in {days_left} day{'s' if days_left != 1 else ''}"
                body = f"Your {kind_label} {label_kind} expires {exp}. Renew it to avoid losing access to restricted jobs."
                ntype = f"{label_kind}_expiring"
            await db.notifications.insert_one({
                "id": str(uuid.uuid4()),
                "user_id": user["id"],
                "type": ntype,
                "title": title,
                "body": body,
                "link": "/credentials",
                "credential_id": d["id"],
                "read": False,
                "created_at": now_iso(),
            })
            await db.credentials.update_one({"id": d["id"]}, {"$set": {last_key: today.isoformat()}})
    docs = await db.credentials.find({"user_id": user["id"]}).sort("created_at", -1).to_list(100)
    return [clean_doc(d) for d in docs]

@api.get("/credentials/user/{user_id}")
async def list_user_credentials(user_id: str):
    """Public summary — returns kind/category/status only (no document IDs or PII)."""
    docs = await db.credentials.find({"user_id": user_id, "status": "verified"}).to_list(100)
    return [{
        "id": d["id"], "kind": d["kind"], "category": d["category"],
        "state": d.get("state"), "expiry_date": d.get("expiry_date"),
        "status": d["status"],
    } for d in docs]

@api.delete("/credentials/{cred_id}")
async def delete_credential(cred_id: str, user: dict = Depends(require_role("provider"))):
    res = await db.credentials.delete_one({"id": cred_id, "user_id": user["id"]})
    if res.deleted_count == 0:
        raise HTTPException(404, "Credential not found")
    return {"ok": True}

@api.post("/credentials/{cred_id}/dev_verify")
async def dev_verify_credential(cred_id: str, user: dict = Depends(require_role("provider"))):
    """Demo / dev shortcut — in production this would be an admin-only endpoint."""
    res = await db.credentials.update_one(
        {"id": cred_id, "user_id": user["id"]},
        {"$set": {"status": "verified", "verified_at": now_iso(), "verified_by": "dev"}}
    )
    if res.matched_count == 0:
        raise HTTPException(404, "Credential not found")
    cred = await db.credentials.find_one({"id": cred_id})
    return clean_doc(cred)

@api.get("/credentials/requirements")
async def credentials_requirements():
    return {
        "required_categories": sorted(list(CREDENTIAL_REQUIRED_CATEGORIES)),
    }

# ────────────────────────────────────────────────────────────────────────────
# Provider quotes (counter-offers)
# ────────────────────────────────────────────────────────────────────────────
@api.post("/jobs/{job_id}/quotes")
async def create_quote(job_id: str, body: QuoteCreate, user: dict = Depends(require_role("provider"))):
    job = await db.jobs.find_one({"id": job_id})
    if not job:
        raise HTTPException(404, "Job not found")
    if job["status"] != "open":
        raise HTTPException(400, "Job is not open")
    if not await _has_verified_credential(user["id"], job["category"]):
        raise HTTPException(403, f"A verified credential is required to quote {job['category']} jobs. Add one in Provider Hub → Credentials.")
    # one active quote per provider per job
    existing = await db.quotes.find_one({"job_id": job_id, "provider_id": user["id"], "status": "pending"})
    if existing:
        await db.quotes.update_one(
            {"id": existing["id"]},
            {"$set": {
                "quoted_pay_rate": body.quoted_pay_rate,
                "quoted_pay_unit": body.quoted_pay_unit,
                "quoted_estimated_units": body.quoted_estimated_units,
                "notes": body.notes, "updated_at": now_iso(),
            }}
        )
        q = await db.quotes.find_one({"id": existing["id"]})
        return clean_doc(q)
    q = {
        "id": str(uuid.uuid4()),
        "job_id": job_id,
        "provider_id": user["id"],
        "provider_name": user["name"],
        "customer_id": job["customer_id"],
        "quoted_pay_rate": body.quoted_pay_rate,
        "quoted_pay_unit": body.quoted_pay_unit,
        "quoted_estimated_units": body.quoted_estimated_units,
        "asking_pay_rate": job["pay_rate"],
        "asking_pay_unit": job["pay_unit"],
        "notes": body.notes,
        "status": "pending",
        "created_at": now_iso(),
    }
    await db.quotes.insert_one(q)
    # Notify customer of new quote
    await db.notifications.insert_one({
        "id": str(uuid.uuid4()),
        "user_id": job["customer_id"],
        "type": "quote_received",
        "title": f"New quote on \"{job['title']}\"",
        "body": f"{user['name']} proposed ${body.quoted_pay_rate:.2f}/{body.quoted_pay_unit}" + (f" — asking ${job['pay_rate']:.2f}/{job['pay_unit']}." if job.get('pay_rate') else "."),
        "link": f"/jobs/{job_id}",
        "job_id": job_id,
        "quote_id": q["id"],
        "read": False,
        "created_at": now_iso(),
    })
    return clean_doc(q)

@api.get("/jobs/{job_id}/quotes")
async def list_job_quotes(job_id: str, user: dict = Depends(get_current_user)):
    job = await db.jobs.find_one({"id": job_id})
    if not job:
        raise HTTPException(404, "Job not found")
    if user["id"] == job["customer_id"]:
        docs = await db.quotes.find({"job_id": job_id}).sort("created_at", -1).to_list(200)
    elif user["role"] == "provider":
        # provider only sees their own
        docs = await db.quotes.find({"job_id": job_id, "provider_id": user["id"]}).sort("created_at", -1).to_list(50)
    else:
        raise HTTPException(403, "Not allowed")
    return [clean_doc(d) for d in docs]

@api.get("/quotes/mine")
async def my_quotes(user: dict = Depends(require_role("provider"))):
    docs = await db.quotes.find({"provider_id": user["id"]}).sort("created_at", -1).to_list(200)
    out = []
    for q in docs:
        q = clean_doc(q)
        job = await db.jobs.find_one({"id": q["job_id"]})
        if job:
            q["job_title"] = job["title"]
            q["job_status"] = job["status"]
        out.append(q)
    return out

@api.post("/quotes/{quote_id}/accept")
async def accept_quote(quote_id: str, user: dict = Depends(get_current_user)):
    q = await db.quotes.find_one({"id": quote_id})
    if not q:
        raise HTTPException(404, "Quote not found")
    if q["customer_id"] != user["id"]:
        raise HTTPException(403, "Not your job")
    job = await db.jobs.find_one({"id": q["job_id"]})
    if not job or job["status"] != "open":
        raise HTTPException(400, "Job is not open")
    # Assign job to this provider at the quoted rate
    await db.jobs.update_one({"id": job["id"]}, {"$set": {
        "status": "accepted",
        "provider_id": q["provider_id"],
        "provider_name": q["provider_name"],
        "accepted_at": now_iso(),
        "pay_rate": q["quoted_pay_rate"],
        "pay_unit": q["quoted_pay_unit"],
        "estimated_units": q["quoted_estimated_units"],
        "accepted_quote_id": q["id"],
    }})
    await db.quotes.update_one({"id": quote_id}, {"$set": {"status": "accepted"}})
    # Decline all other quotes
    await db.quotes.update_many(
        {"job_id": job["id"], "id": {"$ne": quote_id}, "status": "pending"},
        {"$set": {"status": "declined"}}
    )
    # Notify accepted provider
    await db.notifications.insert_one({
        "id": str(uuid.uuid4()),
        "user_id": q["provider_id"],
        "type": "quote_accepted",
        "title": "Your quote was accepted",
        "body": f"{user['name']} accepted your ${q['quoted_pay_rate']:.2f}/{q['quoted_pay_unit']} quote on \"{job['title']}\".",
        "link": f"/jobs/{job['id']}",
        "job_id": job["id"],
        "quote_id": quote_id,
        "read": False,
        "created_at": now_iso(),
    })
    # Notify auto-declined providers
    other_quotes = await db.quotes.find({"job_id": job["id"], "id": {"$ne": quote_id}, "status": "declined"}).to_list(200)
    for oq in other_quotes:
        await db.notifications.insert_one({
            "id": str(uuid.uuid4()),
            "user_id": oq["provider_id"],
            "type": "quote_declined",
            "title": "A quote you sent was declined",
            "body": f"The customer chose another provider for \"{job['title']}\".",
            "link": f"/jobs/{job['id']}",
            "job_id": job["id"],
            "quote_id": oq["id"],
            "read": False,
            "created_at": now_iso(),
        })
    job = await db.jobs.find_one({"id": job["id"]})
    return clean_doc(job)

@api.post("/quotes/{quote_id}/decline")
async def decline_quote(quote_id: str, user: dict = Depends(get_current_user)):
    q = await db.quotes.find_one({"id": quote_id})
    if not q:
        raise HTTPException(404, "Quote not found")
    if q["customer_id"] != user["id"]:
        raise HTTPException(403, "Not your job")
    if q["status"] != "pending":
        raise HTTPException(400, "Quote already resolved")
    await db.quotes.update_one({"id": quote_id}, {"$set": {"status": "declined"}})
    await db.notifications.insert_one({
        "id": str(uuid.uuid4()),
        "user_id": q["provider_id"],
        "type": "quote_declined",
        "title": "Your quote was declined",
        "body": f"{user['name']} declined your ${q['quoted_pay_rate']:.2f}/{q['quoted_pay_unit']} quote.",
        "link": f"/jobs/{q['job_id']}",
        "job_id": q["job_id"],
        "quote_id": quote_id,
        "read": False,
        "created_at": now_iso(),
    })
    return {"ok": True}

@api.delete("/quotes/{quote_id}")
async def withdraw_quote(quote_id: str, user: dict = Depends(require_role("provider"))):
    q = await db.quotes.find_one({"id": quote_id})
    if not q:
        raise HTTPException(404, "Quote not found")
    if q["provider_id"] != user["id"]:
        raise HTTPException(403, "Not yours")
    await db.quotes.delete_one({"id": quote_id})
    return {"ok": True}

# ────────────────────────────────────────────────────────────────────────────
# Notifications
# ────────────────────────────────────────────────────────────────────────────
@api.get("/notifications")
async def list_notifications(since: Optional[str] = None, unread_only: bool = False, user: dict = Depends(get_current_user)):
    q: dict = {"user_id": user["id"]}
    if since:
        q["created_at"] = {"$gt": since}
    if unread_only:
        q["read"] = False
    docs = await db.notifications.find(q).sort("created_at", -1).to_list(100)
    return [clean_doc(d) for d in docs]

@api.post("/notifications/{notif_id}/read")
async def mark_read(notif_id: str, user: dict = Depends(get_current_user)):
    res = await db.notifications.update_one({"id": notif_id, "user_id": user["id"]}, {"$set": {"read": True}})
    if res.matched_count == 0:
        raise HTTPException(404, "Not found")
    return {"ok": True}

@api.post("/notifications/read_all")
async def mark_all_read(user: dict = Depends(get_current_user)):
    await db.notifications.update_many({"user_id": user["id"], "read": False}, {"$set": {"read": True}})
    return {"ok": True}


# ────────────────────────────────────────────────────────────────────────────
# Seeding
# ────────────────────────────────────────────────────────────────────────────
SEED_USERS = [
    {"email": "customer@lumo.test", "password": "password123", "name": "Casey Customer", "role": "customer"},
    {"email": "provider@lumo.test", "password": "password123", "name": "Pat Provider", "role": "provider",
     "location": {"lat": 40.7128, "lng": -74.0060, "address": "New York, NY"},
     "service_radius_miles": 50.0, "categories": ["delivery", "handyman", "cleaning", "digital_tech"]},
    {"email": "retailer@lumo.test", "password": "password123", "name": "Ramona's Boutique", "role": "retailer",
     "storefront": {
         "name": "Ramona's Boutique", "address": "123 Market St, Brooklyn, NY",
         "hours": "Mon–Sat 10am–8pm", "category": "Apparel",
         "location": {"lat": 40.6782, "lng": -73.9442},
         "logo_url": "https://images.pexels.com/photos/12791209/pexels-photo-12791209.jpeg?auto=compress&cs=tinysrgb&dpr=2&h=650&w=940",
         "description": "Curated fashion & home goods.",
     }},
    {"email": "restaurant@lumo.test", "password": "password123", "name": "Cafe Lumière", "role": "restaurant",
     "storefront": {
         "name": "Cafe Lumière", "address": "55 Bedford Ave, Brooklyn, NY",
         "hours": "Daily 7am–10pm", "cuisine": "French Bistro",
         "location": {"lat": 40.7170, "lng": -73.9560},
         "logo_url": "https://images.pexels.com/photos/15101682/pexels-photo-15101682.jpeg?auto=compress&cs=tinysrgb&dpr=2&h=650&w=940",
         "description": "Light pastries, espresso, and seasonal mains.",
     }},
]

async def seed():
    await db.users.create_index("email", unique=True)
    await db.jobs.create_index("created_at")
    await db.jobs.create_index("status")
    for s in SEED_USERS:
        if await db.users.find_one({"email": s["email"]}):
            continue
        doc = {
            "id": str(uuid.uuid4()),
            "email": s["email"], "name": s["name"], "role": s["role"],
            "password_hash": hash_password(s["password"]),
            "phone": None, "wallet_balance": 0.0,
            "location": s.get("location"),
            "service_radius_miles": s.get("service_radius_miles", 25.0),
            "categories": s.get("categories", []),
            "storefront": s.get("storefront"),
            "created_at": now_iso(),
        }
        await db.users.insert_one(doc)
        logger.info(f"Seeded {s['role']}: {s['email']}")
    # Seed a few sample inventory + jobs once
    retailer = await db.users.find_one({"email": "retailer@lumo.test"})
    if retailer and await db.inventory.count_documents({"owner_id": retailer["id"]}) == 0:
        for it in [
            {"name": "Vintage Denim Jacket", "price": 89.0, "stock": 4, "category": "Apparel",
             "media_url": "https://images.pexels.com/photos/12791209/pexels-photo-12791209.jpeg?auto=compress&cs=tinysrgb&dpr=2&h=650&w=940", "media_type": "image/jpeg",
             "description": "Lightly worn, size M."},
            {"name": "Cotton Tote Bag", "price": 24.0, "stock": 12, "category": "Accessories",
             "media_url": None, "media_type": None, "description": "Hand-printed local design."},
        ]:
            await db.inventory.insert_one({
                "id": str(uuid.uuid4()), "owner_id": retailer["id"], "owner_role": "retailer",
                "store_name": retailer["name"], **it, "status": "active", "created_at": now_iso(),
            })
    restaurant = await db.users.find_one({"email": "restaurant@lumo.test"})
    if restaurant and await db.inventory.count_documents({"owner_id": restaurant["id"]}) == 0:
        for it in [
            {"name": "Croissant", "price": 4.50, "stock": 30, "category": "Pastry",
             "media_url": None, "media_type": None, "description": "Buttery, flaky, baked at 5am."},
            {"name": "Nicoise Salad", "price": 16.0, "stock": 10, "category": "Mains",
             "media_url": None, "media_type": None, "description": "Tuna, egg, olives, haricots verts."},
        ]:
            await db.inventory.insert_one({
                "id": str(uuid.uuid4()), "owner_id": restaurant["id"], "owner_role": "restaurant",
                "store_name": restaurant["name"], **it, "status": "active", "created_at": now_iso(),
            })
    # Seed sample jobs (only first time)
    customer = await db.users.find_one({"email": "customer@lumo.test"})
    if customer and await db.jobs.count_documents({}) == 0:
        samples = [
            {"title": "Deliver groceries to Park Slope", "description": "2 bags from Whole Foods to my apt.",
             "category": "delivery", "pay_rate": 25.0, "pay_unit": "flat", "estimated_units": 1.0,
             "pickup_location": {"lat": 40.7180, "lng": -73.9920, "address": "Whole Foods, Brooklyn"},
             "dropoff_location": {"lat": 40.6700, "lng": -73.9800, "address": "Park Slope, Brooklyn"}},
            {"title": "Fix leaking kitchen faucet", "description": "Drip getting worse. Need a handyman.",
             "category": "handyman", "pay_rate": 60.0, "pay_unit": "hour", "estimated_units": 2.0,
             "pickup_location": {"lat": 40.7128, "lng": -74.0060, "address": "Lower Manhattan"}},
            {"title": "React landing page redesign", "description": "Modernize hero + nav. Remote OK.",
             "category": "digital_tech", "pay_rate": 75.0, "pay_unit": "hour", "estimated_units": 10.0},
            {"title": "Weekly social media management", "description": "Schedule posts, light copy.",
             "category": "marketing", "pay_rate": 350.0, "pay_unit": "week", "estimated_units": 4.0},
            {"title": "Tutor 7th-grader in math", "description": "2x/week, algebra basics.",
             "category": "education", "pay_rate": 45.0, "pay_unit": "hour", "estimated_units": 8.0},
            {"title": "Walk my golden retriever", "description": "Mornings, ~45 minutes.",
             "category": "pet_care", "pay_rate": 22.0, "pay_unit": "day", "estimated_units": 5.0,
             "pickup_location": {"lat": 40.7300, "lng": -73.9950, "address": "East Village, NY"}},
        ]
        for s in samples:
            is_remote = s["category"] in REMOTE_FRIENDLY_CATEGORIES
            await db.jobs.insert_one({
                "id": str(uuid.uuid4()),
                "customer_id": customer["id"], "customer_name": customer["name"],
                "title": s["title"], "description": s["description"], "category": s["category"],
                "category_group": category_group(s["category"]), "is_remote": is_remote,
                "pickup_location": s.get("pickup_location"), "dropoff_location": s.get("dropoff_location"),
                "pay_rate": s["pay_rate"], "pay_unit": s["pay_unit"], "estimated_units": s["estimated_units"],
                "media_url": None, "media_type": None,
                "payment_terms": "", "allowed_payment_methods": ["app", "cash", "card"],
                "status": "open", "provider_id": None,
                "deposit_paid": False, "deposit_amount": 0.0,
                "total_estimate": s["pay_rate"] * s["estimated_units"],
                "created_at": now_iso(),
            })

@app.on_event("startup")
async def on_startup():
    try:
        init_storage()
    except Exception as e:
        logger.warning(f"Storage init deferred: {e}")
    try:
        await seed()
    except Exception as e:
        logger.error(f"Seed failed: {e}")

@app.on_event("shutdown")
async def on_shutdown():
    mongo_client.close()

# Mount router
app.include_router(api)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

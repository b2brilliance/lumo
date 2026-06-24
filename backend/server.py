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
import json
import base64
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
from emergentintegrations.llm.chat import LlmChat, UserMessage, ImageContent

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
    """Bundled 10% deposit checkout — item + delivery + 100% tax (so Lumo collects full tax upfront)."""
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
    country: Optional[str] = None  # ISO country code for tax lookup
    us_state: Optional[str] = None  # 2-letter US state code for per-state sales tax

class CartCheckoutCreate(BaseModel):
    """Checkout for all cart items belonging to a single store/restaurant."""
    store_id: str
    delivery_address: Optional[dict] = None
    delivery_fee: float = 0.0
    notes: Optional[str] = None
    origin_url: str
    allowed_payment_methods: Optional[List[PaymentMethod]] = None
    payment_terms: Optional[str] = None
    country: Optional[str] = None
    us_state: Optional[str] = None

class CartAdd(BaseModel):
    inventory_item_id: str
    quantity: int = 1

class CartUpdate(BaseModel):
    quantity: int

class ReviewCreate(BaseModel):
    target_type: Literal["provider", "store"]
    target_id: str
    job_id: Optional[str] = None       # required if target_type == "provider"
    order_id: Optional[str] = None     # required if target_type == "store"
    overall_stars: int = Field(ge=1, le=5)
    quality_stars: Optional[int] = Field(default=None, ge=1, le=5)
    communication_stars: Optional[int] = Field(default=None, ge=1, le=5)
    ontime_stars: Optional[int] = Field(default=None, ge=1, le=5)
    body: Optional[str] = None
    media_url: Optional[str] = None
    media_type: Optional[str] = None

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

# ────────────────────────────────────────────────────────────────────────────
# Country-specific business / tax-registration credentials for providers.
# Every provider needs ONE of these (depending on their country) to be eligible
# to invoice work on Lumo. Hard validation happens at admin-verify time; the
# `format_regex` is a soft client-side hint only.
# ────────────────────────────────────────────────────────────────────────────
COUNTRY_BUSINESS_CREDENTIALS = {
    "US": [
        {"kind": "ein",                 "label": "EIN (Employer Identification Number)",  "format": "XX-XXXXXXX",        "format_regex": r"^\d{2}-?\d{7}$",   "required_for": "business",   "issuer": "IRS"},
        {"kind": "ssn_last4",           "label": "SSN (last 4 digits only)",              "format": "XXXX",              "format_regex": r"^\d{4}$",         "required_for": "individual", "issuer": "SSA"},
        {"kind": "state_business_license","label": "State Business License",              "format": "State + license #", "required_for": "business",   "issuer": "State"},
        {"kind": "w9",                  "label": "Completed Form W-9 (uploaded)",          "format": "PDF upload",        "required_for": "either",     "issuer": "IRS"},
    ],
    "GB": [
        {"kind": "utr",                 "label": "UTR (Unique Taxpayer Reference)",       "format": "10 digits",         "format_regex": r"^\d{10}$",        "required_for": "either",     "issuer": "HMRC"},
        {"kind": "companies_house",     "label": "Companies House Number",                "format": "8 chars (e.g. 12345678)", "format_regex": r"^[A-Z0-9]{7,8}$", "required_for": "business", "issuer": "Companies House"},
        {"kind": "vat_gb",              "label": "VAT Number",                            "format": "GB + 9 digits",     "format_regex": r"^(GB)?\d{9}$",    "required_for": "business",   "issuer": "HMRC"},
    ],
    "CA": [
        {"kind": "bn",                  "label": "BN (Business Number)",                  "format": "9 digits",          "format_regex": r"^\d{9}$",         "required_for": "business",   "issuer": "CRA"},
        {"kind": "gst_hst",             "label": "GST/HST Registration Number",           "format": "9 digits + RT0001", "required_for": "business",        "issuer": "CRA"},
        {"kind": "sin_last3",           "label": "SIN (last 3 digits only)",              "format": "XXX",               "format_regex": r"^\d{3}$",         "required_for": "individual", "issuer": "Service Canada"},
    ],
    "AU": [
        {"kind": "abn",                 "label": "ABN (Australian Business Number)",      "format": "11 digits",         "format_regex": r"^\d{11}$",        "required_for": "either",     "issuer": "ATO"},
        {"kind": "acn",                 "label": "ACN (Australian Company Number)",       "format": "9 digits",          "format_regex": r"^\d{9}$",         "required_for": "business",   "issuer": "ASIC"},
        {"kind": "gst_au",              "label": "GST Registration",                      "format": "ABN-based",         "required_for": "business",        "issuer": "ATO"},
    ],
    "IN": [
        {"kind": "gstin",               "label": "GSTIN",                                 "format": "15 chars",          "format_regex": r"^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$", "required_for": "business", "issuer": "GSTN"},
        {"kind": "pan",                 "label": "PAN (Permanent Account Number)",        "format": "10 chars",          "format_regex": r"^[A-Z]{5}[0-9]{4}[A-Z]{1}$", "required_for": "either",     "issuer": "Income Tax Dept"},
        {"kind": "aadhaar_last4",       "label": "Aadhaar (last 4 digits only)",          "format": "XXXX",              "format_regex": r"^\d{4}$",         "required_for": "individual", "issuer": "UIDAI"},
        {"kind": "udyam",               "label": "Udyam (MSME) Registration",             "format": "UDYAM-XX-XX-XXXXXXX", "required_for": "business",      "issuer": "Ministry of MSME"},
    ],
    "DE": [
        {"kind": "steuernummer",        "label": "Steuernummer",                          "format": "10–11 digits w/ slashes", "required_for": "either",  "issuer": "Finanzamt"},
        {"kind": "ust_id",              "label": "USt-IdNr. (VAT ID)",                    "format": "DE + 9 digits",     "format_regex": r"^(DE)?\d{9}$",    "required_for": "business",   "issuer": "BZSt"},
        {"kind": "gewerbeanmeldung",    "label": "Gewerbeanmeldung (trade registration)", "format": "Upload PDF",        "required_for": "business",        "issuer": "Gewerbeamt"},
        {"kind": "handelsregister",     "label": "Handelsregister-Nummer (HRB)",          "format": "HRB + digits",      "required_for": "business",        "issuer": "Amtsgericht"},
    ],
    "FR": [
        {"kind": "siret",               "label": "SIRET",                                 "format": "14 digits",         "format_regex": r"^\d{14}$",        "required_for": "either",     "issuer": "INSEE"},
        {"kind": "siren",               "label": "SIREN",                                 "format": "9 digits",          "format_regex": r"^\d{9}$",         "required_for": "either",     "issuer": "INSEE"},
        {"kind": "tva_fr",              "label": "Numéro de TVA intracommunautaire",      "format": "FR + 11 digits",    "format_regex": r"^(FR)?[0-9A-Z]{2}\d{9}$", "required_for": "business", "issuer": "DGFiP"},
        {"kind": "rcs",                 "label": "RCS (Registre du Commerce et des Sociétés)", "format": "City + SIREN", "required_for": "business",    "issuer": "Greffe du Tribunal"},
        {"kind": "micro_entrepreneur",  "label": "Statut micro-entrepreneur (URSSAF)",    "format": "Upload attestation","required_for": "individual",      "issuer": "URSSAF"},
    ],
    "JP": [
        {"kind": "corporate_number_jp", "label": "法人番号 (Corporate Number)",            "format": "13 digits",         "format_regex": r"^\d{13}$",        "required_for": "business",   "issuer": "国税庁 (NTA)"},
        {"kind": "kojin_jigyo_jp",      "label": "個人事業の開業届 (Sole-prop registration)", "format": "Upload PDF",     "required_for": "individual",      "issuer": "税務署"},
        {"kind": "invoice_number_jp",   "label": "適格請求書発行事業者登録番号 (Qualified Invoice Issuer)", "format": "T + 13 digits", "format_regex": r"^T\d{13}$", "required_for": "business", "issuer": "NTA"},
    ],
    "BR": [
        {"kind": "cnpj",                "label": "CNPJ",                                  "format": "14 digits",         "format_regex": r"^\d{14}$",        "required_for": "business",   "issuer": "Receita Federal"},
        {"kind": "cpf",                 "label": "CPF",                                   "format": "11 digits",         "format_regex": r"^\d{11}$",        "required_for": "individual", "issuer": "Receita Federal"},
        {"kind": "mei",                 "label": "MEI (Microempreendedor Individual)",    "format": "CNPJ-based",        "required_for": "individual",      "issuer": "Portal do Empreendedor"},
        {"kind": "inscricao_estadual",  "label": "Inscrição Estadual",                     "format": "State VAT registration", "required_for": "business", "issuer": "Sefaz (state)"},
    ],
    "MX": [
        {"kind": "rfc",                 "label": "RFC (Registro Federal de Contribuyentes)", "format": "12–13 chars",   "format_regex": r"^[A-ZÑ&]{3,4}\d{6}[A-Z0-9]{3}$", "required_for": "either", "issuer": "SAT"},
        {"kind": "curp",                "label": "CURP",                                  "format": "18 chars",          "format_regex": r"^[A-Z]{4}\d{6}[A-Z]{6}[0-9A-Z]{2}$", "required_for": "individual", "issuer": "RENAPO"},
        {"kind": "constancia_situacion_fiscal","label": "Constancia de Situación Fiscal", "format": "Upload PDF",        "required_for": "either",          "issuer": "SAT"},
    ],
    "ES": [
        {"kind": "nif",                 "label": "NIF (Número de Identificación Fiscal)", "format": "8 digits + letter", "format_regex": r"^\d{8}[A-Z]$",     "required_for": "individual", "issuer": "Hacienda"},
        {"kind": "nie",                 "label": "NIE (foreign residents)",               "format": "X/Y/Z + 7 digits + letter", "format_regex": r"^[XYZ]\d{7}[A-Z]$", "required_for": "individual", "issuer": "Policía Nacional"},
        {"kind": "cif",                 "label": "CIF / NIF empresarial",                 "format": "Letter + 8 digits", "format_regex": r"^[A-HJ-NP-SUVW]\d{7}[0-9A-J]$", "required_for": "business", "issuer": "Hacienda"},
        {"kind": "autonomo",            "label": "Alta como autónomo (RETA)",             "format": "Upload alta",       "required_for": "individual",      "issuer": "Seguridad Social"},
    ],
    "NG": [
        {"kind": "cac",                 "label": "CAC Registration Number",               "format": "RC + 6–7 digits",   "format_regex": r"^(RC|BN)?\d{6,7}$", "required_for": "business", "issuer": "Corporate Affairs Commission"},
        {"kind": "tin_ng",              "label": "TIN (Tax Identification Number)",       "format": "8–10 digits",       "format_regex": r"^\d{8,10}$",      "required_for": "either",     "issuer": "FIRS"},
        {"kind": "nin",                 "label": "NIN (National Identification Number)",  "format": "11 digits",         "format_regex": r"^\d{11}$",        "required_for": "individual", "issuer": "NIMC"},
    ],
    "AE": [
        {"kind": "trade_license_ae",    "label": "Trade License (Emirate-issued)",        "format": "License # + emirate","required_for": "either",         "issuer": "DED / Free-zone authority"},
        {"kind": "trn_ae",              "label": "TRN (Tax Registration Number)",         "format": "15 digits",         "format_regex": r"^\d{15}$",        "required_for": "business",   "issuer": "Federal Tax Authority"},
        {"kind": "emirates_id",         "label": "Emirates ID (last 4 only)",             "format": "XXXX",              "format_regex": r"^\d{4}$",         "required_for": "individual", "issuer": "ICA"},
    ],
    "SG": [
        {"kind": "uen",                 "label": "UEN (Unique Entity Number)",            "format": "9–10 chars",        "format_regex": r"^[0-9A-Z]{9,10}$", "required_for": "either",    "issuer": "ACRA"},
        {"kind": "gst_sg",              "label": "GST Registration Number",               "format": "M2-XXXXXXXX-X",     "required_for": "business",        "issuer": "IRAS"},
        {"kind": "nric_last3",          "label": "NRIC / FIN (last 3 chars only)",        "format": "XXX",               "format_regex": r"^[0-9A-Z]{3}$",   "required_for": "individual", "issuer": "ICA"},
    ],
    "ZA": [
        {"kind": "cipc",                "label": "CIPC Company Registration Number",      "format": "YYYY/XXXXXX/XX",    "format_regex": r"^\d{4}/\d{6}/\d{2}$", "required_for": "business", "issuer": "CIPC"},
        {"kind": "vat_za",              "label": "VAT Registration Number",               "format": "10 digits",         "format_regex": r"^\d{10}$",        "required_for": "business",   "issuer": "SARS"},
        {"kind": "income_tax_ref",      "label": "Income Tax Reference Number",           "format": "10 digits",         "format_regex": r"^\d{10}$",        "required_for": "either",     "issuer": "SARS"},
    ],
}

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
# Multi-store cart (persisted per user in Mongo)
# Cart item shape: { id, user_id, store_id, inventory_item_id, quantity,
#                    name, price_usd, media_url, media_type, created_at }
# Frontend groups items by store_id and checks out each store separately.
# ────────────────────────────────────────────────────────────────────────────
async def _hydrate_cart(user_id: str) -> dict:
    """Return cart grouped by store with hydrated item + store info."""
    items = await db.cart_items.find({"user_id": user_id}).sort("created_at", 1).to_list(500)
    items = [clean_doc(i) for i in items]
    # Group by store_id
    by_store: dict = {}
    for it in items:
        sid = it["store_id"]
        by_store.setdefault(sid, []).append(it)
    # Hydrate store info
    store_ids = list(by_store.keys())
    stores = await db.users.find({"id": {"$in": store_ids}}).to_list(len(store_ids))
    store_map = {}
    for s in stores:
        s = clean_doc(s)
        s.pop("password_hash", None)
        store_map[s["id"]] = {"id": s["id"], "name": s["name"], "role": s["role"], "storefront": s.get("storefront")}
    groups = []
    total_items = 0
    grand_subtotal_usd = 0.0
    for sid, its in by_store.items():
        subtotal = sum(float(i["price_usd"]) * int(i["quantity"]) for i in its)
        total_items += sum(int(i["quantity"]) for i in its)
        grand_subtotal_usd += subtotal
        groups.append({
            "store_id": sid,
            "store": store_map.get(sid),
            "items": its,
            "subtotal_usd": round(subtotal, 2),
            "item_count": sum(int(i["quantity"]) for i in its),
        })
    return {"groups": groups, "total_items": total_items, "grand_subtotal_usd": round(grand_subtotal_usd, 2)}

@api.get("/cart")
async def get_cart(user: dict = Depends(get_current_user)):
    return await _hydrate_cart(user["id"])

@api.post("/cart/add")
async def add_to_cart(body: CartAdd, user: dict = Depends(get_current_user)):
    if body.quantity <= 0:
        raise HTTPException(400, "Quantity must be positive")
    inv = await db.inventory.find_one({"id": body.inventory_item_id, "status": "active"})
    if not inv:
        raise HTTPException(404, "Item not found")
    # Increment if already in cart, else insert
    existing = await db.cart_items.find_one({"user_id": user["id"], "inventory_item_id": body.inventory_item_id})
    if existing:
        await db.cart_items.update_one(
            {"id": existing["id"]},
            {"$inc": {"quantity": body.quantity}, "$set": {"updated_at": now_iso()}}
        )
    else:
        await db.cart_items.insert_one({
            "id": str(uuid.uuid4()),
            "user_id": user["id"],
            "store_id": inv["owner_id"],
            "inventory_item_id": inv["id"],
            "quantity": body.quantity,
            "name": inv["name"],
            "price_usd": float(inv["price"]),
            "media_url": inv.get("media_url"),
            "media_type": inv.get("media_type"),
            "created_at": now_iso(),
        })
    return await _hydrate_cart(user["id"])

@api.patch("/cart/items/{cart_item_id}")
async def update_cart_item(cart_item_id: str, body: CartUpdate, user: dict = Depends(get_current_user)):
    item = await db.cart_items.find_one({"id": cart_item_id, "user_id": user["id"]})
    if not item:
        raise HTTPException(404, "Cart item not found")
    if body.quantity <= 0:
        await db.cart_items.delete_one({"id": cart_item_id})
    else:
        await db.cart_items.update_one(
            {"id": cart_item_id},
            {"$set": {"quantity": body.quantity, "updated_at": now_iso()}}
        )
    return await _hydrate_cart(user["id"])

@api.delete("/cart/items/{cart_item_id}")
async def remove_cart_item(cart_item_id: str, user: dict = Depends(get_current_user)):
    res = await db.cart_items.delete_one({"id": cart_item_id, "user_id": user["id"]})
    if res.deleted_count == 0:
        raise HTTPException(404, "Cart item not found")
    return await _hydrate_cart(user["id"])

@api.delete("/cart/store/{store_id}")
async def clear_store_cart(store_id: str, user: dict = Depends(get_current_user)):
    await db.cart_items.delete_many({"user_id": user["id"], "store_id": store_id})
    return await _hydrate_cart(user["id"])

@api.delete("/cart")
async def clear_cart(user: dict = Depends(get_current_user)):
    await db.cart_items.delete_many({"user_id": user["id"]})
    return await _hydrate_cart(user["id"])

@api.post("/cart/checkout")
async def cart_checkout(body: CartCheckoutCreate, req: Request, user: dict = Depends(get_current_user)):
    """Create an order + Stripe deposit checkout for all cart items from one store."""
    items = await db.cart_items.find({"user_id": user["id"], "store_id": body.store_id}).to_list(500)
    if not items:
        raise HTTPException(400, "No items from this store in cart")
    item_total = round(sum(float(i["price_usd"]) * int(i["quantity"]) for i in items), 2)
    delivery_fee = round(float(body.delivery_fee), 2)
    item_deposit = round(item_total * 0.10, 2)
    delivery_deposit = round(delivery_fee * 0.10, 2)
    addr_str = body.delivery_address.get("address") if (body.delivery_address and isinstance(body.delivery_address, dict)) else None
    tax_profile = tax_for(body.country, us_state=body.us_state, delivery_address=addr_str)
    tax_rate = tax_profile["rate"]
    taxable_base = round(item_total + delivery_fee, 2)
    tax_amount = round(taxable_base * tax_rate, 2)
    deposit_total = round(item_deposit + delivery_deposit + tax_amount, 2)
    remaining = round(item_total + delivery_fee - item_deposit - delivery_deposit, 2)
    if deposit_total <= 0:
        raise HTTPException(400, "Invalid amounts")

    order_id = str(uuid.uuid4())
    order_lines = [{
        "inventory_item_id": i["inventory_item_id"], "name": i["name"],
        "price_usd": float(i["price_usd"]), "quantity": int(i["quantity"]),
        "subtotal_usd": round(float(i["price_usd"]) * int(i["quantity"]), 2),
        "media_url": i.get("media_url"),
    } for i in items]
    order_doc = {
        "id": order_id,
        "customer_id": user["id"],
        "customer_name": user["name"],
        "store_id": body.store_id,
        "lines": order_lines,
        "item_total": item_total,
        "delivery_fee": delivery_fee,
        "item_deposit": item_deposit,
        "delivery_deposit": delivery_deposit,
        "tax_country": (body.country or "US").upper(),
        "tax_rate": tax_rate,
        "tax_label": tax_profile["label"],
        "tax_amount": tax_amount,
        "tax_us_state": tax_profile.get("us_state"),
        "deposit_total": deposit_total,
        "remaining_total": remaining,
        "delivery_address": body.delivery_address,
        "notes": body.notes,
        "allowed_payment_methods": body.allowed_payment_methods or ["app", "cash", "card"],
        "payment_terms": body.payment_terms or "",
        "status": "deposit_pending",
        "provider_id": None,
        "is_cart_order": True,
        "created_at": now_iso(),
    }
    await db.orders.insert_one(order_doc)

    stripe = await _get_stripe(req)
    success_url = f"{body.origin_url}/checkout/success?session_id={{CHECKOUT_SESSION_ID}}&order_id={order_id}"
    cancel_url = f"{body.origin_url}/checkout/cancel?order_id={order_id}"
    metadata = {
        "order_id": order_id, "customer_id": user["id"], "type": "deposit",
        "is_cart": "true", "store_id": body.store_id,
        "tax_amount": str(tax_amount),
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
    # Clear those items from cart now that an order has been created
    await db.cart_items.delete_many({"user_id": user["id"], "store_id": body.store_id})
    return {"url": session.url, "session_id": session.session_id, "order_id": order_id}

# ────────────────────────────────────────────────────────────────────────────
# Reviews & ratings — providers and storefronts
# Only customers who completed a job (provider) or order (store) may review.
# One review per (reviewer, target, transaction).
# ────────────────────────────────────────────────────────────────────────────
async def _can_review_provider(user_id: str, provider_id: str) -> List[dict]:
    """Returns the list of completed jobs by this user where this provider was assigned and which haven't been reviewed yet."""
    jobs = await db.jobs.find({
        "customer_id": user_id, "provider_id": provider_id, "status": "completed",
    }).to_list(100)
    out = []
    for j in jobs:
        existing = await db.reviews.find_one({
            "reviewer_id": user_id, "target_type": "provider",
            "target_id": provider_id, "job_id": j["id"],
        })
        if not existing:
            out.append({"job_id": j["id"], "job_title": j["title"], "completed_at": j.get("completed_at")})
    return out

async def _can_review_store(user_id: str, store_id: str) -> List[dict]:
    """Returns the list of completed orders by this user from this store which haven't been reviewed."""
    orders = await db.orders.find({
        "customer_id": user_id, "store_id": store_id,
        "status": {"$in": ["completed", "deposit_paid", "in_progress"]},
    }).to_list(100)
    out = []
    for o in orders:
        existing = await db.reviews.find_one({
            "reviewer_id": user_id, "target_type": "store",
            "target_id": store_id, "order_id": o["id"],
        })
        if not existing:
            out.append({"order_id": o["id"], "created_at": o.get("created_at"), "item_total": o.get("item_total")})
    return out

@api.get("/reviews/can-review/{target_type}/{target_id}")
async def can_review(target_type: str, target_id: str, user: dict = Depends(get_current_user)):
    if target_type == "provider":
        eligible = await _can_review_provider(user["id"], target_id)
    elif target_type == "store":
        eligible = await _can_review_store(user["id"], target_id)
    else:
        raise HTTPException(400, "Invalid target_type")
    return {"can_review": len(eligible) > 0, "eligible": eligible}

@api.post("/reviews")
async def create_review(body: ReviewCreate, user: dict = Depends(get_current_user)):
    # Verify the user has a completed transaction with the target
    if body.target_type == "provider":
        if not body.job_id:
            raise HTTPException(400, "job_id required for provider review")
        job = await db.jobs.find_one({"id": body.job_id})
        if not job:
            raise HTTPException(404, "Job not found")
        if job.get("customer_id") != user["id"] or job.get("provider_id") != body.target_id:
            raise HTTPException(403, "You can only review providers from your own completed jobs")
        if job.get("status") != "completed":
            raise HTTPException(400, "Job is not completed yet")
        # Already reviewed?
        existing = await db.reviews.find_one({
            "reviewer_id": user["id"], "target_type": "provider",
            "target_id": body.target_id, "job_id": body.job_id,
        })
        if existing:
            raise HTTPException(400, "You already reviewed this job")
    elif body.target_type == "store":
        if not body.order_id:
            raise HTTPException(400, "order_id required for store review")
        order = await db.orders.find_one({"id": body.order_id})
        if not order:
            raise HTTPException(404, "Order not found")
        if order.get("customer_id") != user["id"] or order.get("store_id") != body.target_id:
            raise HTTPException(403, "You can only review stores from your own orders")
        if order.get("status") not in ("completed", "deposit_paid", "in_progress"):
            raise HTTPException(400, "Order has not progressed enough to be reviewed")
        existing = await db.reviews.find_one({
            "reviewer_id": user["id"], "target_type": "store",
            "target_id": body.target_id, "order_id": body.order_id,
        })
        if existing:
            raise HTTPException(400, "You already reviewed this order")
    else:
        raise HTTPException(400, "Invalid target_type")

    doc = {
        "id": str(uuid.uuid4()),
        "reviewer_id": user["id"],
        "reviewer_name": user["name"],
        "target_type": body.target_type,
        "target_id": body.target_id,
        "job_id": body.job_id,
        "order_id": body.order_id,
        "overall_stars": body.overall_stars,
        "quality_stars": body.quality_stars,
        "communication_stars": body.communication_stars,
        "ontime_stars": body.ontime_stars,
        "body": (body.body or "").strip()[:1000] or None,
        "media_url": body.media_url,
        "media_type": body.media_type,
        "created_at": now_iso(),
    }
    await db.reviews.insert_one(doc)
    # Notify the reviewed party
    await db.notifications.insert_one({
        "id": str(uuid.uuid4()),
        "user_id": body.target_id,
        "type": "review_received",
        "title": f"New {body.overall_stars}-star review",
        "body": f"{user['name']} left you a {body.overall_stars}-star review.",
        "link": "/" + ("provider" if body.target_type == "provider" else "retailer"),
        "review_id": doc["id"],
        "read": False,
        "created_at": now_iso(),
    })
    return clean_doc(doc)

@api.get("/reviews/target/{target_type}/{target_id}")
async def list_reviews_for_target(target_type: str, target_id: str, limit: int = 50):
    if target_type not in ("provider", "store"):
        raise HTTPException(400, "Invalid target_type")
    docs = await db.reviews.find({"target_type": target_type, "target_id": target_id}).sort("created_at", -1).to_list(min(limit, 200))
    cleaned = [clean_doc(d) for d in docs]
    # Aggregate
    n = len(cleaned)
    if n == 0:
        return {"reviews": [], "summary": {"count": 0, "avg_overall": None}}
    sum_overall = sum(r["overall_stars"] for r in cleaned)
    def safe_avg(field):
        vals = [r[field] for r in cleaned if r.get(field) is not None]
        return round(sum(vals) / len(vals), 2) if vals else None
    summary = {
        "count": n,
        "avg_overall": round(sum_overall / n, 2),
        "avg_quality": safe_avg("quality_stars"),
        "avg_communication": safe_avg("communication_stars"),
        "avg_ontime": safe_avg("ontime_stars"),
        "stars_breakdown": {str(s): sum(1 for r in cleaned if r["overall_stars"] == s) for s in range(1, 6)},
    }
    return {"reviews": cleaned, "summary": summary}

@api.get("/reviews/summary/{target_type}/{target_id}")
async def review_summary(target_type: str, target_id: str):
    """Lightweight aggregate (avg + count) — for badge display on cards."""
    res = await list_reviews_for_target(target_type, target_id, limit=200)
    return res["summary"]

# ────────────────────────────────────────────────────────────────────────────
# Rentals — separate marketplace for vacation stays, vehicles, tools, venues,
# equipment, etc. 11 consolidated categories with category-specific filters.
# ────────────────────────────────────────────────────────────────────────────
RENTAL_TAXONOMY = {
    "property": {
        "label": "Property & Stays",
        "icon": "home",
        "color": "rose",
        "blurb": "Vacation homes, apartments, commercial real estate, workspaces, parking",
        "subcategories": ["vacation_rental", "residential", "commercial_re", "workspace", "meeting_room", "warehouse", "parking", "garage"],
        "filters": ["dates", "guests", "bedrooms", "bathrooms", "amenities", "type", "price"],
        "pricing_units": ["daily", "weekly", "monthly"],
    },
    "venues": {
        "label": "Venues",
        "icon": "building",
        "color": "violet",
        "blurb": "Banquet halls, wedding venues, studios, galleries, rooftops, theaters",
        "subcategories": ["banquet_hall", "wedding_venue", "photo_studio", "music_studio", "podcast_studio", "art_gallery", "theater", "rooftop", "garden", "private_dining"],
        "filters": ["dates", "capacity", "indoor_outdoor", "catering_allowed", "parking", "price"],
        "pricing_units": ["hourly", "daily"],
    },
    "vehicles": {
        "label": "Vehicles",
        "icon": "car",
        "color": "blue",
        "blurb": "Cars, RVs, boats, motorcycles, bikes",
        "subcategories": ["car", "suv", "truck", "rv", "boat", "motorcycle", "bike", "scooter"],
        "filters": ["dates", "make", "model", "year", "transmission", "fuel", "seats", "mileage_cap_per_day", "price"],
        "pricing_units": ["hourly", "daily", "weekly"],
    },
    "tools_equipment": {
        "label": "Tools & Equipment",
        "icon": "wrench",
        "color": "amber",
        "blurb": "Hand tools, power tools, construction equipment, generators, farm machinery",
        "subcategories": ["hand_tools", "power_tools", "construction", "farm_equipment", "industrial_machinery", "generator"],
        "filters": ["dates", "power_source", "delivery_available", "operator_required", "price"],
        "pricing_units": ["hourly", "daily", "weekly"],
    },
    "photo_av": {
        "label": "Photo, Video & AV",
        "icon": "camera",
        "color": "indigo",
        "blurb": "Cameras, lenses, lighting, audio, projectors, drones",
        "subcategories": ["camera_body", "lens", "lighting", "audio", "projector", "drone", "av_package"],
        "filters": ["dates", "brand", "model", "delivery_available", "price"],
        "pricing_units": ["daily", "weekly"],
    },
    "outdoor_sports": {
        "label": "Outdoor & Sports",
        "icon": "tent",
        "color": "emerald",
        "blurb": "Camping gear, water sports, ski/snowboard, bikes, sports equipment",
        "subcategories": ["camping", "kayak", "paddleboard", "surfboard", "ski", "snowboard", "bike", "sports_equipment"],
        "filters": ["dates", "size", "delivery_available", "price"],
        "pricing_units": ["hourly", "daily", "weekly"],
    },
    "furniture_appliances": {
        "label": "Furniture, Appliances & Electronics",
        "icon": "sofa",
        "color": "slate",
        "blurb": "Sofas, dining sets, appliances, TVs, computers, gaming consoles",
        "subcategories": ["sofa", "dining_set", "bed", "office", "appliance", "tv", "computer", "gaming"],
        "filters": ["dates", "delivery_available", "price"],
        "pricing_units": ["daily", "weekly", "monthly"],
    },
    "medical_mobility": {
        "label": "Medical, Mobility & Baby",
        "icon": "heart-pulse",
        "color": "red",
        "blurb": "Wheelchairs, hospital beds, mobility scooters, baby gear",
        "subcategories": ["wheelchair", "hospital_bed", "mobility_scooter", "crutches", "baby_crib", "stroller", "car_seat"],
        "filters": ["dates", "delivery_available", "size", "price"],
        "pricing_units": ["daily", "weekly", "monthly"],
    },
    "events_weddings": {
        "label": "Events, Parties & Weddings",
        "icon": "party-popper",
        "color": "pink",
        "blurb": "Tents, chairs, tables, linens, lighting, formal wear & costumes",
        "subcategories": ["tent", "tables_chairs", "linens", "lighting", "dance_floor", "formal_wear", "costume", "decor"],
        "filters": ["dates", "delivery_available", "guests", "price"],
        "pricing_units": ["daily", "weekend"],
    },
    "storage_containers": {
        "label": "Storage & Containers",
        "icon": "package",
        "color": "stone",
        "blurb": "Self-storage units, shipping containers, dumpsters",
        "subcategories": ["self_storage", "shipping_container", "dumpster"],
        "filters": ["dates", "size", "climate_controlled", "access_24_7", "price"],
        "pricing_units": ["daily", "weekly", "monthly"],
    },
    "site_services": {
        "label": "Site Services",
        "icon": "construction",
        "color": "yellow",
        "blurb": "Portable toilets, on-site generators, fencing, light towers",
        "subcategories": ["portable_toilet", "site_generator", "fencing", "light_tower"],
        "filters": ["dates", "delivery_available", "size", "price"],
        "pricing_units": ["daily", "weekly", "monthly"],
    },
}

# Categories that require ID/business credential verification before listings go live
RENTAL_HIGH_VALUE_CATEGORIES = {"property", "vehicles", "venues"}

class RentalCreate(BaseModel):
    category: str
    subcategory: Optional[str] = None
    title: str
    description: Optional[str] = None
    location: Optional[dict] = None
    media_url: Optional[str] = None
    media_type: Optional[str] = None
    media: Optional[List[dict]] = None
    pricing: dict                                  # { hourly?, daily?, weekly?, monthly?, security_deposit? }
    attributes: Optional[dict] = None              # category-specific: { bedrooms, capacity, transmission, ... }
    booking_mode: Literal["instant", "request"] = "instant"
    min_duration: Optional[int] = 1
    max_duration: Optional[int] = None
    is_demo: Optional[bool] = False

class RentalBookingCreate(BaseModel):
    rental_id: str
    start_date: str
    end_date: str
    quantity: Optional[int] = None                # used for hourly (hours); else inferred from dates
    pricing_unit: Literal["hourly", "daily", "weekly", "monthly", "weekend"] = "daily"
    notes: Optional[str] = None
    origin_url: str
    country: Optional[str] = None
    us_state: Optional[str] = None

@api.get("/rentals/categories")
async def rentals_categories():
    return {"categories": [{"key": k, **v} for k, v in RENTAL_TAXONOMY.items()]}

@api.get("/rentals")
async def list_rentals(
    category: Optional[str] = None,
    subcategory: Optional[str] = None,
    q: Optional[str] = None,
    min_price: Optional[float] = None,
    max_price: Optional[float] = None,
    booking_mode: Optional[str] = None,
    limit: int = 60,
):
    """Browse / search rentals."""
    f: dict = {"status": "active"}
    if category and category in RENTAL_TAXONOMY:
        f["category"] = category
    if subcategory:
        f["subcategory"] = subcategory
    if booking_mode in ("instant", "request"):
        f["booking_mode"] = booking_mode
    if q:
        f["$or"] = [{"title": {"$regex": q, "$options": "i"}}, {"description": {"$regex": q, "$options": "i"}}]
    docs = await db.rentals.find(f).sort("created_at", -1).to_list(min(limit, 200))
    out = []
    for d in docs:
        d = clean_doc(d)
        # Price filter (use the smallest available unit price for comparison)
        prices = [v for k, v in (d.get("pricing") or {}).items() if isinstance(v, (int, float)) and k != "security_deposit"]
        ref_price = min(prices) if prices else None
        if ref_price is not None:
            if min_price is not None and ref_price < min_price:
                continue
            if max_price is not None and ref_price > max_price:
                continue
        out.append(d)
    return out

@api.get("/rentals/{rental_id}")
async def get_rental(rental_id: str):
    r = await db.rentals.find_one({"id": rental_id})
    if not r:
        raise HTTPException(404, "Rental not found")
    return clean_doc(r)

@api.post("/rentals")
async def create_rental(body: RentalCreate, user: dict = Depends(get_current_user)):
    if body.category not in RENTAL_TAXONOMY:
        raise HTTPException(400, f"Unknown category {body.category}")
    if not body.pricing or not any(k in body.pricing for k in ("hourly", "daily", "weekly", "monthly", "weekend")):
        raise HTTPException(400, "At least one of hourly/daily/weekly/monthly/weekend price is required")
    # High-value categories require verified ID / business credential
    requires_verification = body.category in RENTAL_HIGH_VALUE_CATEGORIES
    verified_cred = None
    if requires_verification:
        verified_cred = await db.credentials.find_one({"user_id": user["id"], "status": "verified"})
    doc = {
        "id": str(uuid.uuid4()),
        "owner_id": user["id"],
        "owner_name": user["name"],
        "category": body.category,
        "subcategory": body.subcategory,
        "title": body.title,
        "description": body.description,
        "location": body.location,
        "media_url": body.media_url,
        "media_type": body.media_type,
        "media": body.media or ([{"media_url": body.media_url, "media_type": body.media_type}] if body.media_url else []),
        "pricing": body.pricing,
        "attributes": body.attributes or {},
        "booking_mode": body.booking_mode,
        "min_duration": body.min_duration or 1,
        "max_duration": body.max_duration,
        "status": "active" if (not requires_verification or verified_cred) else "pending_host_verification",
        "host_verification_required": requires_verification,
        "is_demo": bool(body.is_demo),
        "created_at": now_iso(),
    }
    await db.rentals.insert_one(doc)
    return clean_doc(doc)

@api.delete("/rentals/{rental_id}")
async def delete_rental(rental_id: str, user: dict = Depends(get_current_user)):
    r = await db.rentals.find_one({"id": rental_id})
    if not r:
        raise HTTPException(404, "Rental not found")
    if r.get("owner_id") != user["id"] and user.get("role") != "admin":
        raise HTTPException(403, "Not allowed")
    await db.rentals.update_one({"id": rental_id}, {"$set": {"status": "deleted"}})
    return {"deleted": True}

@api.post("/rentals/{rental_id}/book")
async def book_rental(rental_id: str, body: RentalBookingCreate, req: Request, user: dict = Depends(get_current_user)):
    r = await db.rentals.find_one({"id": rental_id, "status": "active"})
    if not r:
        raise HTTPException(404, "Rental not found or unavailable")
    if r.get("owner_id") == user["id"]:
        raise HTTPException(400, "You cannot book your own rental")
    # Compute duration & subtotal
    try:
        sd = datetime.fromisoformat(body.start_date.replace("Z", "+00:00"))
        ed = datetime.fromisoformat(body.end_date.replace("Z", "+00:00"))
    except Exception:
        raise HTTPException(400, "Invalid start_date / end_date (use YYYY-MM-DD or ISO 8601)")
    if ed <= sd:
        raise HTTPException(400, "end_date must be after start_date")
    pricing = r.get("pricing") or {}
    if body.pricing_unit not in pricing or not pricing[body.pricing_unit]:
        raise HTTPException(400, f"Rental does not offer {body.pricing_unit} pricing")
    unit_price = float(pricing[body.pricing_unit])
    if body.pricing_unit == "hourly":
        qty = body.quantity or max(1, int((ed - sd).total_seconds() / 3600))
    elif body.pricing_unit in ("daily", "weekend"):
        qty = body.quantity or max(1, (ed - sd).days)
    elif body.pricing_unit == "weekly":
        qty = body.quantity or max(1, (ed - sd).days // 7)
    else:  # monthly
        qty = body.quantity or max(1, (ed - sd).days // 30)
    subtotal = round(unit_price * qty, 2)
    security_deposit = round(float(pricing.get("security_deposit") or 0), 2)
    # Tax
    addr_str = (r.get("location") or {}).get("address")
    tax_profile = tax_for(body.country, us_state=body.us_state, delivery_address=addr_str)
    tax_amount = round(subtotal * tax_profile["rate"], 2)
    rental_deposit = round(subtotal * 0.10, 2)
    deposit_total = round(rental_deposit + tax_amount + security_deposit, 2)
    remaining = round(subtotal - rental_deposit, 2)

    booking_id = str(uuid.uuid4())
    status = "pending_approval" if r.get("booking_mode") == "request" else "deposit_pending"
    booking_doc = {
        "id": booking_id,
        "rental_id": rental_id,
        "renter_id": user["id"],
        "renter_name": user["name"],
        "owner_id": r["owner_id"],
        "start_date": body.start_date,
        "end_date": body.end_date,
        "pricing_unit": body.pricing_unit,
        "quantity": qty,
        "unit_price": unit_price,
        "subtotal": subtotal,
        "security_deposit": security_deposit,
        "tax_country": (body.country or "US").upper(),
        "tax_rate": tax_profile["rate"],
        "tax_label": tax_profile["label"],
        "tax_amount": tax_amount,
        "rental_deposit": rental_deposit,
        "deposit_total": deposit_total,
        "remaining_total": remaining,
        "booking_mode": r.get("booking_mode"),
        "notes": body.notes,
        "status": status,
        "created_at": now_iso(),
    }
    await db.rental_bookings.insert_one(booking_doc)

    # Request-mode → notify owner and return without Stripe
    if status == "pending_approval":
        await db.notifications.insert_one({
            "id": str(uuid.uuid4()),
            "user_id": r["owner_id"],
            "type": "rental_request",
            "title": f"New booking request: {r['title']}",
            "body": f"{user['name']} requested to book your rental {body.start_date} → {body.end_date}.",
            "link": f"/rentals/{rental_id}",
            "booking_id": booking_id,
            "read": False,
            "created_at": now_iso(),
        })
        return {"booking_id": booking_id, "status": status, "deposit_total": deposit_total, "url": None}

    # Instant book → Stripe checkout
    stripe = await _get_stripe(req)
    success_url = f"{body.origin_url}/checkout/success?session_id={{CHECKOUT_SESSION_ID}}&booking_id={booking_id}"
    cancel_url = f"{body.origin_url}/checkout/cancel?booking_id={booking_id}"
    metadata = {
        "booking_id": booking_id, "rental_id": rental_id,
        "type": "rental_deposit", "renter_id": user["id"], "owner_id": r["owner_id"],
        "tax_amount": str(tax_amount),
    }
    session = await stripe.create_checkout_session(CheckoutSessionRequest(
        amount=float(deposit_total), currency="usd",
        success_url=success_url, cancel_url=cancel_url, metadata=metadata,
    ))
    await db.payment_transactions.insert_one({
        "id": str(uuid.uuid4()),
        "session_id": session.session_id,
        "booking_id": booking_id,
        "user_id": user["id"],
        "amount": float(deposit_total),
        "currency": "usd",
        "type": "rental_deposit",
        "status": "initiated",
        "payment_status": "unpaid",
        "metadata": metadata,
        "created_at": now_iso(),
    })
    return {"booking_id": booking_id, "status": status, "deposit_total": deposit_total, "url": session.url, "session_id": session.session_id}

@api.get("/rental-bookings/mine")
async def my_rental_bookings(role: Literal["renter", "owner"] = "renter", user: dict = Depends(get_current_user)):
    f = {"renter_id" if role == "renter" else "owner_id": user["id"]}
    docs = await db.rental_bookings.find(f).sort("created_at", -1).to_list(100)
    return [clean_doc(d) for d in docs]

@api.post("/rental-bookings/{booking_id}/approve")
async def approve_rental_booking(booking_id: str, req: Request, user: dict = Depends(get_current_user)):
    b = await db.rental_bookings.find_one({"id": booking_id})
    if not b:
        raise HTTPException(404, "Booking not found")
    if b["owner_id"] != user["id"]:
        raise HTTPException(403, "Not allowed")
    if b["status"] != "pending_approval":
        raise HTTPException(400, "Booking is not awaiting approval")
    # Transition to deposit_pending, create Stripe checkout, notify renter
    await db.rental_bookings.update_one({"id": booking_id}, {"$set": {"status": "deposit_pending", "approved_at": now_iso()}})
    await db.notifications.insert_one({
        "id": str(uuid.uuid4()),
        "user_id": b["renter_id"],
        "type": "rental_approved",
        "title": "Booking approved",
        "body": "Your booking request was approved. Complete payment to confirm your dates.",
        "link": f"/rentals/{b['rental_id']}",
        "booking_id": booking_id,
        "read": False,
        "created_at": now_iso(),
    })
    return {"approved": True}

@api.post("/rental-bookings/{booking_id}/decline")
async def decline_rental_booking(booking_id: str, user: dict = Depends(get_current_user)):
    b = await db.rental_bookings.find_one({"id": booking_id})
    if not b:
        raise HTTPException(404, "Booking not found")
    if b["owner_id"] != user["id"]:
        raise HTTPException(403, "Not allowed")
    await db.rental_bookings.update_one({"id": booking_id}, {"$set": {"status": "declined", "declined_at": now_iso()}})
    await db.notifications.insert_one({
        "id": str(uuid.uuid4()),
        "user_id": b["renter_id"],
        "type": "rental_declined",
        "title": "Booking declined",
        "body": "Your booking request was declined.",
        "link": f"/rentals/{b['rental_id']}",
        "booking_id": booking_id,
        "read": False,
        "created_at": now_iso(),
    })
    return {"declined": True}

# ────────────────────────────────────────────────────────────────────────────
# Orders + Bundled 10% Stripe deposit checkout
# ────────────────────────────────────────────────────────────────────────────
async def _get_stripe(req: Request) -> StripeCheckout:
    host_url = str(req.base_url).rstrip("/")
    webhook_url = f"{host_url}/api/webhook/stripe"
    return StripeCheckout(api_key=STRIPE_API_KEY, webhook_url=webhook_url)

@api.post("/checkout/deposit")
async def checkout_deposit(body: CheckoutCreate, req: Request, user: dict = Depends(get_current_user)):
    """Create order + Stripe checkout for 10% bundled deposit (item + delivery) + 100% tax."""
    item_total = round(body.item_price * body.quantity, 2)
    delivery_fee = round(body.delivery_fee, 2)
    item_deposit = round(item_total * 0.10, 2)
    delivery_deposit = round(delivery_fee * 0.10, 2)
    # Tax: applied on the full (item + delivery) amount, collected 100% upfront
    addr_str = None
    if body.delivery_address and isinstance(body.delivery_address, dict):
        addr_str = body.delivery_address.get("address")
    tax_profile = tax_for(body.country, us_state=body.us_state, delivery_address=addr_str)
    tax_rate = tax_profile["rate"]
    tax_label = tax_profile["label"]
    taxable_base = round(item_total + delivery_fee, 2)
    tax_amount = round(taxable_base * tax_rate, 2)
    deposit_total = round(item_deposit + delivery_deposit + tax_amount, 2)
    remaining = round(item_total + delivery_fee - item_deposit - delivery_deposit, 2)
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
        "tax_country": (body.country or "US").upper(),
        "tax_rate": tax_rate,
        "tax_label": tax_label,
        "tax_amount": tax_amount,
        "tax_us_state": tax_profile.get("us_state"),
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
        "tax_country": (body.country or "US").upper(), "tax_amount": str(tax_amount),
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
        "status": "completed",
        "auto_processed": True,
        "created_at": now_iso(),
        "completed_at": now_iso(),
    }
    await db.withdrawal_requests.insert_one(wr)
    await db.users.update_one({"id": user["id"]}, {"$inc": {"wallet_balance": -body.amount}})
    await db.wallet_transactions.insert_one({
        "id": str(uuid.uuid4()), "user_id": user["id"], "amount": -body.amount,
        "type": "debit", "reason": f"Payout via {body.method}",
        "withdrawal_id": wr["id"], "created_at": now_iso(),
    })
    await db.notifications.insert_one({
        "id": str(uuid.uuid4()),
        "user_id": user["id"],
        "type": "payout_sent",
        "title": f"Payout of ${body.amount:.2f} sent",
        "body": f"Your ${body.amount:.2f} payout via {body.method.replace('_', ' ')} has been processed.",
        "link": "/wallet",
        "withdrawal_id": wr["id"],
        "read": False,
        "created_at": now_iso(),
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

@api.get("/credentials/country-requirements")
async def credentials_country_requirements(country: Optional[str] = None):
    """Returns the list of country-specific business/tax credentials that
    providers need to be legally allowed to invoice work in that country.
    Pass `country=ALL` (or omit) to get the full map."""
    if country and country.upper() != "ALL":
        c = country.upper()
        return {"country": c, "credentials": COUNTRY_BUSINESS_CREDENTIALS.get(c, [])}
    return {"profiles": COUNTRY_BUSINESS_CREDENTIALS}

# ────────────────────────────────────────────────────────────────────────────
# AI-powered document verification (Claude → Gemini fallback, vision).
# Reads any uploaded image/PDF, extracts key fields, cross-checks against a
# regex/format whitelist for the expected credential kind, and returns a
# verdict + confidence + plain-English explanation. Confidence ≥ 0.90 auto-
# verifies the credential; anything lower queues for human review.
# ────────────────────────────────────────────────────────────────────────────
AI_VERIFY_AUTO_THRESHOLD = 0.90
_VISION_MIME_OK = {"image/jpeg", "image/jpg", "image/png", "image/webp", "image/gif"}

class CredentialVerifyRequest(BaseModel):
    """Optional override context — normally inferred from the credential record."""
    notes: Optional[str] = None

class MediaVerifyRequest(BaseModel):
    purpose: Literal["content_moderation", "license_doc", "id_doc", "business_doc"] = "content_moderation"
    expected_kind: Optional[str] = None      # e.g. "siret"
    country: Optional[str] = None
    expected_regex: Optional[str] = None
    notes: Optional[str] = None

def _find_country_for_kind(kind: str) -> Optional[str]:
    for cc, creds in COUNTRY_BUSINESS_CREDENTIALS.items():
        for c in creds:
            if c["kind"] == kind:
                return cc
    return None

def _cred_schema_for(kind: str, country: Optional[str] = None) -> Optional[dict]:
    if country:
        for c in COUNTRY_BUSINESS_CREDENTIALS.get(country.upper(), []):
            if c["kind"] == kind:
                return c
    for creds in COUNTRY_BUSINESS_CREDENTIALS.values():
        for c in creds:
            if c["kind"] == kind:
                return c
    return None

async def _load_media_bytes(media_id: str) -> tuple[bytes, str]:
    rec = await db.media.find_one({"id": media_id, "is_deleted": False})
    if not rec:
        raise HTTPException(404, f"Media {media_id} not found")
    data, content_type = get_object(rec["storage_path"])
    mime = rec.get("media_type") or content_type or "application/octet-stream"
    return data, mime

def _build_verification_prompt(*, purpose: str, expected_kind: Optional[str], country: Optional[str],
                               expected_regex: Optional[str], schema: Optional[dict], notes: Optional[str]) -> tuple[str, str]:
    """Returns (system_message, user_text). The model must answer with strict JSON."""
    if purpose == "content_moderation":
        system = (
            "You are an AI content moderator for an online services marketplace. Given an uploaded image, decide if "
            "it is appropriate for public display in a marketplace listing, store inventory, customer review, or "
            "service request. Reject images that contain nudity, sexual content, weapons, drugs, gore, hate symbols, "
            "exposed identity documents, exposed credit cards, or other sensitive personal information."
        )
        user_text = (
            "Inspect the attached image. Reply with ONLY a single JSON object matching this exact schema:\n"
            "{\"verdict\":\"approved\"|\"flagged\",\"confidence\":0.0-1.0,\"reasons\":[...],\"contains_pii\":bool,"
            "\"contains_nsfw\":bool,\"explanation\":\"<one paragraph, plain English>\"}\n"
            "No markdown, no commentary, JSON only."
        )
        return system, user_text

    # Credential / document verification
    schema_block = ""
    if schema:
        schema_block = (
            f"\nExpected credential: {schema.get('label')} ({schema.get('kind')})\n"
            f"Country: {country or 'unknown'}\n"
            f"Expected format: {schema.get('format')}\n"
            f"Issuer (authority): {schema.get('issuer','unknown')}\n"
        )
        if schema.get("format_regex"):
            schema_block += f"Expected number regex: {schema['format_regex']}\n"
    elif expected_kind:
        schema_block = f"\nExpected credential kind: {expected_kind}\nCountry: {country or 'unknown'}\n"
        if expected_regex:
            schema_block += f"Expected number regex: {expected_regex}\n"

    system = (
        "You are a forensic document-verification AI for a services marketplace (Lumo). You read uploaded "
        "credential photos and documents (business registrations, tax IDs, professional licenses, insurance "
        "certificates) and extract structured data. You are SKEPTICAL — flag anything that looks edited, "
        "printed from a template, lacks an official issuer header/seal, has mismatched fonts, or where the "
        "number doesn't match the country's expected format. Never invent data — if a field is not visible, "
        "leave it null. Confidence reflects how certain you are this document is genuine AND matches the "
        "expected credential kind/country."
    )
    user_text = (
        f"Verify the attached document.{schema_block}\n"
        f"{('Submitter notes: ' + notes) if notes else ''}\n"
        "Reply with ONLY a single JSON object — no markdown, no prose around it — matching this exact schema:\n"
        "{"
        "\"verdict\":\"verified\"|\"rejected\"|\"needs_review\","
        "\"confidence\":0.0-1.0,"
        "\"document_kind_detected\":\"<what the document appears to be>\","
        "\"matches_expected\":true|false,"
        "\"regex_match\":true|false|null,"
        "\"extracted\":{"
            "\"id_number\":\"...\"|null,"
            "\"holder_name\":\"...\"|null,"
            "\"issuer\":\"...\"|null,"
            "\"issue_date\":\"YYYY-MM-DD\"|null,"
            "\"expiry_date\":\"YYYY-MM-DD\"|null,"
            "\"country\":\"<ISO-2>\"|null"
        "},"
        "\"red_flags\":[\"...\",...],"
        "\"explanation\":\"<2-4 sentence plain-English summary of how you reached this verdict>\""
        "}"
    )
    return system, user_text

async def _call_vision(provider: str, model: str, system: str, user_text: str, image_bytes: bytes, mime: str) -> str:
    """Run a single vision call; returns the model's raw text reply."""
    if not EMERGENT_LLM_KEY:
        raise HTTPException(503, "AI verification unavailable — EMERGENT_LLM_KEY not set")
    image_b64 = base64.b64encode(image_bytes).decode("ascii")
    chat = LlmChat(
        api_key=EMERGENT_LLM_KEY,
        session_id=f"lumo-verify-{uuid.uuid4()}",
        system_message=system,
    ).with_model(provider, model)
    img = ImageContent(image_base64=image_b64)
    msg = UserMessage(text=user_text, file_contents=[img])
    return await chat.send_message(msg)

def _parse_verify_json(raw: str) -> dict:
    """Best-effort JSON parse from a model reply (strip code fences if present)."""
    if not raw:
        return {}
    s = raw.strip()
    if s.startswith("```"):
        # strip ```json ... ```
        s = re.sub(r"^```(?:json)?\s*", "", s)
        s = re.sub(r"\s*```\s*$", "", s)
    # Find the first { ... last }
    first = s.find("{")
    last = s.rfind("}")
    if first == -1 or last == -1 or last <= first:
        return {}
    try:
        return json.loads(s[first:last + 1])
    except Exception:
        return {}

async def _ai_verify_document(*, media_id: str, purpose: str, expected_kind: Optional[str], country: Optional[str],
                              expected_regex: Optional[str], notes: Optional[str],
                              owner_id: Optional[str] = None) -> dict:
    data, mime = await _load_media_bytes(media_id)
    if mime not in _VISION_MIME_OK:
        # Try to interpret as image anyway, but warn
        if not mime.startswith("image/"):
            raise HTTPException(400, f"AI verification supports image documents only (got {mime}). Re-upload as PNG/JPG.")
    schema = _cred_schema_for(expected_kind, country) if expected_kind else None
    eff_regex = expected_regex or (schema.get("format_regex") if schema else None)
    system, user_text = _build_verification_prompt(
        purpose=purpose, expected_kind=expected_kind, country=country,
        expected_regex=eff_regex, schema=schema, notes=notes,
    )

    # Try Claude first, fall back to Gemini
    last_error = None
    raw = None
    used_model = None
    for provider, model in [("anthropic", "claude-sonnet-4-6"), ("gemini", "gemini-3.1-pro-preview")]:
        try:
            raw = await _call_vision(provider, model, system, user_text, data, mime)
            used_model = f"{provider}/{model}"
            if raw and raw.strip():
                break
        except Exception as e:
            last_error = str(e)
            logger.warning(f"AI verify {provider}/{model} failed: {e}")
    if not raw:
        raise HTTPException(502, f"AI verification failed on all models: {last_error}")

    parsed = _parse_verify_json(raw)
    if not parsed:
        # Last-resort fallback: needs_review with low confidence
        parsed = {
            "verdict": "needs_review",
            "confidence": 0.0,
            "extracted": {},
            "red_flags": ["ai_response_unparseable"],
            "explanation": "AI returned an unparseable response; manual review required.",
        }

    # Regex cross-check (post-hoc, in case model didn't compute it)
    extracted = parsed.get("extracted") or {}
    id_number = (extracted.get("id_number") or "").strip()
    regex_match = parsed.get("regex_match")
    if id_number and eff_regex:
        try:
            cleaned = re.sub(r"[\s\-/]", "", id_number)
            regex_match = bool(re.fullmatch(eff_regex, id_number) or re.fullmatch(eff_regex, cleaned))
        except re.error:
            regex_match = None
    parsed["regex_match"] = regex_match
    parsed["used_model"] = used_model

    # Auto-downgrade verdict if regex required and failed
    if eff_regex and regex_match is False and parsed.get("verdict") == "verified":
        parsed["verdict"] = "needs_review"
        parsed["confidence"] = min(float(parsed.get("confidence", 0.0)), 0.6)
        parsed.setdefault("red_flags", []).append("regex_mismatch")

    # Persist
    record = {
        "id": str(uuid.uuid4()),
        "media_id": media_id,
        "owner_id": owner_id,
        "purpose": purpose,
        "expected_kind": expected_kind,
        "country": (country or "").upper() or None,
        "verdict": parsed.get("verdict"),
        "confidence": float(parsed.get("confidence", 0.0) or 0.0),
        "extracted": extracted,
        "regex_match": regex_match,
        "matches_expected": parsed.get("matches_expected"),
        "red_flags": parsed.get("red_flags", []),
        "explanation": parsed.get("explanation"),
        "used_model": used_model,
        "raw_response": raw,
        "created_at": now_iso(),
    }
    await db.document_verifications.insert_one(record)
    return clean_doc(record)

@api.post("/verify/credential/{cred_id}")
async def verify_credential(cred_id: str, body: Optional[CredentialVerifyRequest] = None, user: dict = Depends(get_current_user)):
    """Run AI verification on a credential's uploaded document. Auto-marks the
    credential as verified if confidence ≥ 0.90 and the AI returns 'verified'."""
    cred = await db.credentials.find_one({"id": cred_id})
    if not cred:
        raise HTTPException(404, "Credential not found")
    # The provider OR an admin can run verification on their own credentials.
    if cred.get("user_id") != user["id"] and user.get("role") != "admin":
        raise HTTPException(403, "Not allowed")
    media_id = cred.get("document_media_id")
    if not media_id:
        raise HTTPException(400, "No document uploaded for this credential")
    expected_kind = cred.get("kind")
    country = cred.get("state") if cred.get("category") == "business_registration" else None
    if not country and expected_kind:
        country = _find_country_for_kind(expected_kind)
    result = await _ai_verify_document(
        media_id=media_id, purpose="business_doc" if cred.get("category") == "business_registration" else "license_doc",
        expected_kind=expected_kind, country=country,
        expected_regex=None, notes=(body.notes if body else None),
        owner_id=cred.get("user_id"),
    )
    # Update credential status
    new_status = cred.get("status", "submitted")
    if result["verdict"] == "verified" and result["confidence"] >= AI_VERIFY_AUTO_THRESHOLD:
        new_status = "verified"
    elif result["verdict"] == "rejected":
        new_status = "rejected"
    elif result["verdict"] in ("verified", "needs_review"):
        new_status = "ai_pending_review"
    update = {
        "ai_verification": {
            "verdict": result["verdict"],
            "confidence": result["confidence"],
            "extracted": result["extracted"],
            "regex_match": result["regex_match"],
            "red_flags": result["red_flags"],
            "explanation": result["explanation"],
            "used_model": result["used_model"],
            "verified_at": now_iso(),
        },
        "status": new_status,
    }
    if new_status == "verified":
        update["verified_at"] = now_iso()
        update["verified_by"] = "ai"
    await db.credentials.update_one({"id": cred_id}, {"$set": update})
    return {**result, "credential_status": new_status}

@api.post("/verify/media/{media_id}")
async def verify_media(media_id: str, body: MediaVerifyRequest, user: dict = Depends(get_current_user)):
    """Run AI verification on an arbitrary uploaded media (review photo, job photo, marketplace listing).
    For purpose='content_moderation' the AI checks for NSFW / PII / inappropriate content."""
    media = await db.media.find_one({"id": media_id, "is_deleted": False})
    if not media:
        raise HTTPException(404, "Media not found")
    # Owner OR admin can request verification
    if media.get("owner_id") != user["id"] and user.get("role") != "admin":
        raise HTTPException(403, "Not allowed")
    result = await _ai_verify_document(
        media_id=media_id, purpose=body.purpose,
        expected_kind=body.expected_kind, country=body.country,
        expected_regex=body.expected_regex, notes=body.notes,
        owner_id=media.get("owner_id"),
    )
    return result

@api.get("/verify/history/{media_id}")
async def verify_history(media_id: str, user: dict = Depends(get_current_user)):
    """All prior AI-verification results for a given media."""
    rows = await db.document_verifications.find({"media_id": media_id}).sort("created_at", -1).to_list(20)
    return [clean_doc(r) for r in rows]

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
# i18n — translation + currency
# ────────────────────────────────────────────────────────────────────────────
class TranslateRequest(BaseModel):
    texts: List[str]
    target_lang: str            # ISO 639-1, e.g. "ja", "fr", "pt-BR"
    source_lang: str = "en"

# Per-country tax: rate + label + remit hint. These are sensible defaults; in
# production they should be replaced by a proper tax engine (Stripe Tax, Avalara
# etc.) — especially for US sales tax which varies state by state.
TAX_PROFILES = {
    "US": {"rate": 0.08,  "label": "Sales Tax", "note": "US sales tax varies by state — blended default. Per-state rates applied when state code is provided."},
    "GB": {"rate": 0.20,  "label": "VAT",       "note": "UK standard VAT rate."},
    "CA": {"rate": 0.13,  "label": "HST",       "note": "Ontario HST (13%) shown as demo. PST/GST differ by province."},
    "AU": {"rate": 0.10,  "label": "GST",       "note": "Australia GST."},
    "IN": {"rate": 0.18,  "label": "GST",       "note": "India GST standard rate for services."},
    "DE": {"rate": 0.19,  "label": "MwSt.",     "note": "Germany VAT (Mehrwertsteuer)."},
    "FR": {"rate": 0.20,  "label": "TVA",       "note": "France VAT (TVA)."},
    "JP": {"rate": 0.10,  "label": "消費税",      "note": "Japan Consumption Tax (JCT)."},
    "BR": {"rate": 0.17,  "label": "ICMS",      "note": "Brazil ICMS demo blended rate; varies by state."},
    "MX": {"rate": 0.16,  "label": "IVA",       "note": "Mexico VAT (IVA)."},
    "ES": {"rate": 0.21,  "label": "IVA",       "note": "Spain VAT (IVA)."},
    "NG": {"rate": 0.075, "label": "VAT",       "note": "Nigeria VAT."},
    "AE": {"rate": 0.05,  "label": "VAT",       "note": "UAE VAT."},
    "SG": {"rate": 0.09,  "label": "GST",       "note": "Singapore GST."},
    "ZA": {"rate": 0.15,  "label": "VAT",       "note": "South Africa VAT."},
}

# US per-state sales tax base rates (state portion only — does NOT include
# city/county/special-district add-ons; flagged in PRD for upgrade to a real
# tax engine like Stripe Tax or Avalara before high-volume US launch).
US_STATE_TAX_RATES = {
    "AL": 0.04,    "AK": 0.0,    "AZ": 0.056,  "AR": 0.065,  "CA": 0.0725,
    "CO": 0.029,   "CT": 0.0635, "DE": 0.0,    "DC": 0.06,   "FL": 0.06,
    "GA": 0.04,    "HI": 0.04,   "ID": 0.06,   "IL": 0.0625, "IN": 0.07,
    "IA": 0.06,    "KS": 0.065,  "KY": 0.06,   "LA": 0.0445, "ME": 0.055,
    "MD": 0.06,    "MA": 0.0625, "MI": 0.06,   "MN": 0.06875,"MS": 0.07,
    "MO": 0.04225, "MT": 0.0,    "NE": 0.055,  "NV": 0.0685, "NH": 0.0,
    "NJ": 0.06625, "NM": 0.04875,"NY": 0.04,   "NC": 0.0475, "ND": 0.05,
    "OH": 0.0575,  "OK": 0.045,  "OR": 0.0,    "PA": 0.06,   "RI": 0.07,
    "SC": 0.06,    "SD": 0.045,  "TN": 0.07,   "TX": 0.0625, "UT": 0.0485,
    "VT": 0.06,    "VA": 0.053,  "WA": 0.065,  "WV": 0.06,   "WI": 0.05,
    "WY": 0.04,
}

STRIPE_TAX_ENABLED = os.environ.get("STRIPE_TAX_ENABLED", "false").lower() == "true"

# Best-effort US state extraction from a free-text delivery address.
_US_STATE_RE = re.compile(r"\b([A-Z]{2})\b(?:\s+\d{5}(?:-\d{4})?)?")

def extract_us_state(address: Optional[str]) -> Optional[str]:
    if not address:
        return None
    m = _US_STATE_RE.search(address)
    if not m:
        return None
    s = m.group(1).upper()
    return s if s in US_STATE_TAX_RATES else None

def tax_for(country: Optional[str], us_state: Optional[str] = None, delivery_address: Optional[str] = None) -> dict:
    """Returns the tax profile for a country code, or US default. When country
    is 'US' and a state code is supplied (or extractable from delivery_address),
    returns the per-state rate."""
    c = (country or "US").upper()
    base = TAX_PROFILES.get(c, TAX_PROFILES["US"])
    if c == "US":
        state = (us_state or "").upper().strip() or extract_us_state(delivery_address)
        if state and state in US_STATE_TAX_RATES:
            return {
                "rate": US_STATE_TAX_RATES[state],
                "label": f"Sales Tax ({state})",
                "note": f"US sales tax — {state} state base rate. Excludes county/city/special-district add-ons.",
                "us_state": state,
            }
    return base

@api.get("/i18n/tax")
async def i18n_tax(country: Optional[str] = None, us_state: Optional[str] = None):
    """Tax info for a country (or all if no country given)."""
    if country:
        prof = tax_for(country, us_state=us_state)
        return {"country": country.upper(), **prof}
    return {"profiles": TAX_PROFILES, "us_state_rates": US_STATE_TAX_RATES, "stripe_tax_enabled": STRIPE_TAX_ENABLED}

_FX_CACHE: dict = {"rates": None, "fetched_at": None}

async def _fetch_fx_rates() -> dict:
    """Fetch USD-based exchange rates. Cached 1h. Falls back to a static table on failure."""
    now = datetime.now(timezone.utc)
    cached_at = _FX_CACHE.get("fetched_at")
    if _FX_CACHE.get("rates") and cached_at and (now - cached_at).total_seconds() < 3600:
        return _FX_CACHE["rates"]
    fallback = {
        "USD": 1.0, "EUR": 0.92, "GBP": 0.79, "CAD": 1.36, "AUD": 1.51,
        "INR": 83.2, "JPY": 152.0, "BRL": 5.05, "MXN": 17.1, "NGN": 1480.0,
        "AED": 3.67, "SGD": 1.34, "ZAR": 18.2, "CHF": 0.88, "CNY": 7.22,
    }
    try:
        r = requests.get("https://open.er-api.com/v6/latest/USD", timeout=8)
        r.raise_for_status()
        data = r.json()
        rates = data.get("rates") or {}
        if not rates:
            raise ValueError("empty rates")
        _FX_CACHE["rates"] = rates
        _FX_CACHE["fetched_at"] = now
        return rates
    except Exception as e:
        logger.warning(f"FX fetch failed, using fallback: {e}")
        _FX_CACHE["rates"] = fallback
        _FX_CACHE["fetched_at"] = now
        return fallback

@api.get("/i18n/fx")
async def fx_rates():
    """Live USD-based FX rates (cached 1h)."""
    rates = await _fetch_fx_rates()
    return {
        "base": "USD",
        "fetched_at": _FX_CACHE["fetched_at"].isoformat() if _FX_CACHE["fetched_at"] else None,
        "rates": rates,
    }

# Languages supported for translation
SUPPORTED_LANGS = {
    "en": "English",
    "es": "Spanish (native conversational, neutral Latin American Spanish)",
    "fr": "French (native conversational French of France)",
    "fr-CA": "French (Canadian / Québécois French as spoken in Québec)",
    "de": "German (native conversational German of Germany)",
    "pt-BR": "Portuguese (Brazilian Portuguese as spoken naturally in Brazil)",
    "ja": "Japanese (natural conversational Japanese, polite -desu/-masu register)",
    "hi": "Hindi (natural conversational Hindi in Devanagari script, the way people actually speak in India)",
    "ar": "Arabic (Modern Standard Arabic, natural and respectful)",
    "zh": "Chinese (Simplified Chinese, natural conversational Mandarin)",
}

LANG_LABELS = {
    "en": "English", "es": "Español", "fr": "Français", "fr-CA": "Français (Canada)",
    "de": "Deutsch", "pt-BR": "Português (Brasil)", "ja": "日本語",
    "hi": "हिन्दी", "ar": "العربية", "zh": "中文",
}

@api.get("/i18n/languages")
async def i18n_languages():
    return [{"code": code, "label": LANG_LABELS.get(code, code)} for code in SUPPORTED_LANGS]

@api.post("/i18n/translate")
async def translate(body: TranslateRequest):
    """Batch translate a list of short strings into target_lang. Cached per-string per-lang in Mongo."""
    lang = body.target_lang
    if lang == "en" or not lang:
        return {"translations": {t: t for t in body.texts}}
    if lang not in SUPPORTED_LANGS:
        raise HTTPException(400, f"Unsupported language: {lang}")
    if not EMERGENT_LLM_KEY:
        raise HTTPException(503, "Translation unavailable — LLM key not configured")

    # Dedup + clean inputs
    inputs = []
    seen = set()
    for t in body.texts:
        s = (t or "").strip()
        if not s or s in seen:
            continue
        if len(s) > 500:
            continue
        seen.add(s)
        inputs.append(s)
    if not inputs:
        return {"translations": {}}

    # Pull cached
    cached_docs = await db.translations.find({"lang": lang, "src": {"$in": inputs}}).to_list(len(inputs))
    cache = {d["src"]: d["tgt"] for d in cached_docs}
    missing = [s for s in inputs if s not in cache]

    new_translations: dict = {}
    if missing:
        lang_descr = SUPPORTED_LANGS[lang]
        system = (
            f"You are a professional localization translator. Translate each numbered English string into {lang_descr}. "
            "Use the way native speakers naturally talk in that region — idiomatic, warm, modern. "
            "Preserve punctuation, line breaks, %s placeholders, and any code-like tokens (e.g. $20, 5km, URLs, emails) exactly. "
            "Do NOT add explanations, quotes, or commentary. "
            "Output exactly N lines, each prefixed with the same number and a tab, in the same order as the input. "
            "Never translate proper nouns like 'Lumo', 'Lumi', 'Stripe'."
        )
        numbered = "\n".join(f"{i+1}.\t{s}" for i, s in enumerate(missing))
        prompt = f"Translate the following {len(missing)} strings into {lang_descr}.\n\n{numbered}\n\nReturn exactly {len(missing)} numbered lines."
        try:
            chat = LlmChat(
                api_key=EMERGENT_LLM_KEY,
                session_id=f"lumo-i18n-{lang}-{uuid.uuid4()}",
                system_message=system,
            ).with_model("anthropic", "claude-sonnet-4-6")
            reply = await chat.send_message(UserMessage(text=prompt))
        except Exception as e:
            logger.error(f"i18n translate error: {e}")
            raise HTTPException(502, "Translation service unavailable")

        # Parse "N.\tTranslation" lines
        lines = [ln for ln in (reply or "").splitlines() if ln.strip()]
        parsed: dict = {}
        for ln in lines:
            m = re.match(r"^\s*(\d+)[.)]\s*(.+)$", ln)
            if not m:
                continue
            idx = int(m.group(1)) - 1
            if 0 <= idx < len(missing):
                parsed[missing[idx]] = m.group(2).strip()
        # For anything LLM missed, fall back to the source string
        for s in missing:
            new_translations[s] = parsed.get(s, s)

        # Persist cache
        if new_translations:
            ops = []
            for src, tgt in new_translations.items():
                ops.append({
                    "lang": lang, "src": src, "tgt": tgt, "created_at": now_iso(),
                })
            for doc in ops:
                await db.translations.update_one(
                    {"lang": doc["lang"], "src": doc["src"]},
                    {"$set": doc}, upsert=True,
                )

    out = {**cache, **new_translations}
    # Also echo any input we filtered out (length/etc) back as themselves
    for t in body.texts:
        s = (t or "").strip()
        if s and s not in out:
            out[s] = s
    return {"translations": out}

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

    # ────────────────────────────────────────────────────────────────────────
    # Global demo: ~3 sample jobs in each of 15 countries, varied categories.
    # Pay rates are stored in USD (the frontend converts to local currency at display time).
    # ────────────────────────────────────────────────────────────────────────
    if customer and await db.jobs.count_documents({"is_global_demo": True}) == 0:
        global_demo = [
            # ── United States
            {"country": "US", "city": "Los Angeles", "lat": 34.0522, "lng": -118.2437,
             "title": "Move 1-bedroom apartment to Santa Monica", "description": "About 8 boxes, a queen mattress, and a small couch. Need help loading and a flat-rate move.",
             "category": "moving", "pay_rate": 220.0, "pay_unit": "flat", "estimated_units": 1.0,
             "pickup_address": "Echo Park, Los Angeles, CA", "dropoff_address": "Santa Monica, CA",
             "dropoff_lat": 34.0195, "dropoff_lng": -118.4912},
            {"country": "US", "city": "Austin", "lat": 30.2672, "lng": -97.7431,
             "title": "Deep-clean a 2-bedroom apartment", "description": "Move-out clean, including oven and inside cabinets. Saturday preferred.",
             "category": "cleaning", "pay_rate": 35.0, "pay_unit": "hour", "estimated_units": 5.0,
             "pickup_address": "South Congress, Austin, TX"},

            # ── United Kingdom
            {"country": "GB", "city": "London", "lat": 51.5074, "lng": -0.1278,
             "title": "Walk my Labrador in Hyde Park", "description": "Weekday mornings, about an hour. Friendly dog, good with people.",
             "category": "pet_care", "pay_rate": 18.0, "pay_unit": "day", "estimated_units": 5.0,
             "pickup_address": "Bayswater, London, UK"},
            {"country": "GB", "city": "Manchester", "lat": 53.4808, "lng": -2.2426,
             "title": "Fix a dripping kitchen tap", "description": "Mixer tap, slow drip from the spout. Replacement cartridge probably needed.",
             "category": "handyman", "pay_rate": 45.0, "pay_unit": "hour", "estimated_units": 1.5,
             "pickup_address": "Didsbury, Manchester, UK"},

            # ── Canada
            {"country": "CA", "city": "Toronto", "lat": 43.6532, "lng": -79.3832,
             "title": "Same-day courier to Mississauga", "description": "Small envelope of legal documents. Pickup downtown, drop near Square One.",
             "category": "courier", "pay_rate": 28.0, "pay_unit": "flat", "estimated_units": 1.0,
             "pickup_address": "King St W, Toronto, ON",
             "dropoff_address": "Square One, Mississauga, ON",
             "dropoff_lat": 43.5938, "dropoff_lng": -79.6403},
            {"country": "CA", "city": "Vancouver", "lat": 49.2827, "lng": -123.1207,
             "title": "Tutor my daughter in Grade 9 math", "description": "Two evenings a week, online OK. Algebra and word problems.",
             "category": "education", "pay_rate": 38.0, "pay_unit": "hour", "estimated_units": 8.0},

            # ── Australia
            {"country": "AU", "city": "Sydney", "lat": -33.8688, "lng": 151.2093,
             "title": "Lawn mow + hedge trim, Bondi", "description": "Small front and back yard, hedges along the fence. Looking for fortnightly.",
             "category": "landscaping", "pay_rate": 60.0, "pay_unit": "flat", "estimated_units": 1.0,
             "pickup_address": "Bondi Beach, Sydney, NSW"},
            {"country": "AU", "city": "Melbourne", "lat": -37.8136, "lng": 144.9631,
             "title": "Build a Shopify storefront for my cafe", "description": "Need a clean storefront, menu page, online ordering. Brand already done.",
             "category": "digital_tech", "pay_rate": 70.0, "pay_unit": "hour", "estimated_units": 25.0},

            # ── India
            {"country": "IN", "city": "Mumbai", "lat": 19.0760, "lng": 72.8777,
             "title": "Deliver a birthday cake from Bandra to Andheri", "description": "Fragile box. Pickup from Theobroma at 4pm, deliver by 5:30pm.",
             "category": "delivery", "pay_rate": 6.0, "pay_unit": "flat", "estimated_units": 1.0,
             "pickup_address": "Theobroma, Bandra West, Mumbai",
             "dropoff_address": "Andheri East, Mumbai",
             "dropoff_lat": 19.1136, "dropoff_lng": 72.8697},
            {"country": "IN", "city": "Bengaluru", "lat": 12.9716, "lng": 77.5946,
             "title": "Home cleaning before Diwali", "description": "Full deep-clean of a 3BHK in Indiranagar. Kitchen, bathrooms, ceiling fans.",
             "category": "cleaning", "pay_rate": 7.0, "pay_unit": "hour", "estimated_units": 6.0,
             "pickup_address": "Indiranagar, Bengaluru, KA"},
            {"country": "IN", "city": "Delhi", "lat": 28.6139, "lng": 77.2090,
             "title": "Looking for a part-time content writer (remote)", "description": "Two articles a week on travel and lifestyle. English, light edits.",
             "category": "marketing", "pay_rate": 12.0, "pay_unit": "hour", "estimated_units": 10.0},

            # ── Germany
            {"country": "DE", "city": "Berlin", "lat": 52.5200, "lng": 13.4050,
             "title": "Hilfe beim Umzug — pickup truck + 2 movers", "description": "Studio to 1-bedroom, Kreuzberg to Prenzlauer Berg. About 20 boxes.",
             "category": "moving", "pay_rate": 180.0, "pay_unit": "flat", "estimated_units": 1.0,
             "pickup_address": "Kreuzberg, Berlin",
             "dropoff_address": "Prenzlauer Berg, Berlin",
             "dropoff_lat": 52.5379, "dropoff_lng": 13.4250},
            {"country": "DE", "city": "Munich", "lat": 48.1351, "lng": 11.5820,
             "title": "Babysitter for two evenings a week", "description": "Two kids, ages 4 and 7. Light dinner, bedtime routine. German + English OK.",
             "category": "pet_care", "pay_rate": 20.0, "pay_unit": "hour", "estimated_units": 6.0,
             "pickup_address": "Schwabing, Munich"},

            # ── France
            {"country": "FR", "city": "Paris", "lat": 48.8566, "lng": 2.3522,
             "title": "Livraison d'un colis du 11ème au 16ème", "description": "Petit colis, 3 kg. Récupérer près de Bastille, livrer Trocadéro avant 18h.",
             "category": "delivery", "pay_rate": 22.0, "pay_unit": "flat", "estimated_units": 1.0,
             "pickup_address": "Bastille, Paris 11e",
             "dropoff_address": "Trocadéro, Paris 16e",
             "dropoff_lat": 48.8629, "dropoff_lng": 2.2873},
            {"country": "FR", "city": "Lyon", "lat": 45.7640, "lng": 4.8357,
             "title": "Refonte du site vitrine de mon restaurant", "description": "Site moderne, menu, réservations, photos. WordPress ou pareil.",
             "category": "digital_tech", "pay_rate": 55.0, "pay_unit": "hour", "estimated_units": 20.0},

            # ── Japan
            {"country": "JP", "city": "Tokyo", "lat": 35.6762, "lng": 139.6503,
             "title": "Bento delivery from Shibuya to Shinjuku", "description": "Three bentos, keep upright. Pickup at 12:00, deliver by 12:30.",
             "category": "delivery", "pay_rate": 12.0, "pay_unit": "flat", "estimated_units": 1.0,
             "pickup_address": "Shibuya, Tokyo",
             "dropoff_address": "Shinjuku, Tokyo",
             "dropoff_lat": 35.6896, "dropoff_lng": 139.6917},
            {"country": "JP", "city": "Osaka", "lat": 34.6937, "lng": 135.5023,
             "title": "Weekly apartment cleaning, Namba", "description": "1LDK, weekly, Sunday mornings. Kitchen + bathroom + floor.",
             "category": "cleaning", "pay_rate": 25.0, "pay_unit": "hour", "estimated_units": 3.0,
             "pickup_address": "Namba, Osaka"},

            # ── Brazil
            {"country": "BR", "city": "São Paulo", "lat": -23.5505, "lng": -46.6333,
             "title": "Entrega de documentos — Pinheiros para Itaim", "description": "Envelope pequeno, urgente. Retirar em Pinheiros e entregar no Itaim Bibi até as 17h.",
             "category": "courier", "pay_rate": 8.0, "pay_unit": "flat", "estimated_units": 1.0,
             "pickup_address": "Pinheiros, São Paulo",
             "dropoff_address": "Itaim Bibi, São Paulo",
             "dropoff_lat": -23.5839, "dropoff_lng": -46.6739},
            {"country": "BR", "city": "Rio de Janeiro", "lat": -22.9068, "lng": -43.1729,
             "title": "Faxineira(o) para apartamento em Ipanema", "description": "Limpeza semanal, manhã, cerca de 4 horas. 2 quartos.",
             "category": "cleaning", "pay_rate": 7.0, "pay_unit": "hour", "estimated_units": 4.0,
             "pickup_address": "Ipanema, Rio de Janeiro"},

            # ── Mexico
            {"country": "MX", "city": "Mexico City", "lat": 19.4326, "lng": -99.1332,
             "title": "Ayuda con mudanza — Roma Norte a Condesa", "description": "Departamento de 1 recámara, 15 cajas y muebles ligeros. Camioneta + 2 personas.",
             "category": "moving", "pay_rate": 80.0, "pay_unit": "flat", "estimated_units": 1.0,
             "pickup_address": "Roma Norte, CDMX",
             "dropoff_address": "Condesa, CDMX",
             "dropoff_lat": 19.4109, "dropoff_lng": -99.1769},
            {"country": "MX", "city": "Guadalajara", "lat": 20.6597, "lng": -103.3496,
             "title": "Diseñador gráfico para identidad de marca", "description": "Logo, paleta, tipografías y un manual breve para una panadería local.",
             "category": "digital_tech", "pay_rate": 18.0, "pay_unit": "hour", "estimated_units": 15.0},

            # ── Spain
            {"country": "ES", "city": "Madrid", "lat": 40.4168, "lng": -3.7038,
             "title": "Pasear a mi perro por El Retiro", "description": "Mañanas, una hora, perro mediano muy sociable.",
             "category": "pet_care", "pay_rate": 15.0, "pay_unit": "day", "estimated_units": 5.0,
             "pickup_address": "Salamanca, Madrid"},
            {"country": "ES", "city": "Barcelona", "lat": 41.3851, "lng": 2.1734,
             "title": "Fontanero — fuga en el baño", "description": "Goteo en la tubería bajo el lavabo. Disponibilidad esta semana.",
             "category": "handyman", "pay_rate": 40.0, "pay_unit": "hour", "estimated_units": 2.0,
             "pickup_address": "El Born, Barcelona"},

            # ── Nigeria
            {"country": "NG", "city": "Lagos", "lat": 6.5244, "lng": 3.3792,
             "title": "Same-day delivery, Lekki to Victoria Island", "description": "Small package of phone accessories. Pickup at 10am.",
             "category": "delivery", "pay_rate": 9.0, "pay_unit": "flat", "estimated_units": 1.0,
             "pickup_address": "Lekki Phase 1, Lagos",
             "dropoff_address": "Victoria Island, Lagos",
             "dropoff_lat": 6.4281, "dropoff_lng": 3.4219},
            {"country": "NG", "city": "Abuja", "lat": 9.0765, "lng": 7.3986,
             "title": "Generator servicing — 5kVA", "description": "Annual service, oil change, filter, and load test. Wuse 2.",
             "category": "handyman", "pay_rate": 25.0, "pay_unit": "flat", "estimated_units": 1.0,
             "pickup_address": "Wuse 2, Abuja"},

            # ── United Arab Emirates
            {"country": "AE", "city": "Dubai", "lat": 25.2048, "lng": 55.2708,
             "title": "Move 2-bedroom apartment, Marina to JLT", "description": "Sofa, dining table, 25 boxes. Need a truck and 2 movers.",
             "category": "moving", "pay_rate": 200.0, "pay_unit": "flat", "estimated_units": 1.0,
             "pickup_address": "Dubai Marina, Dubai",
             "dropoff_address": "Jumeirah Lake Towers, Dubai",
             "dropoff_lat": 25.0688, "dropoff_lng": 55.1393},
            {"country": "AE", "city": "Abu Dhabi", "lat": 24.4539, "lng": 54.3773,
             "title": "Personal trainer — 3x per week", "description": "Strength + cardio mix, home gym available. Beginner-friendly.",
             "category": "personal_care", "pay_rate": 50.0, "pay_unit": "hour", "estimated_units": 12.0,
             "pickup_address": "Al Reem Island, Abu Dhabi"},

            # ── Singapore
            {"country": "SG", "city": "Singapore", "lat": 1.3521, "lng": 103.8198,
             "title": "Office cleaning — small co-working space", "description": "Tuesdays and Fridays evening, ~3 hours. Trash, restrooms, kitchen, floors.",
             "category": "cleaning", "pay_rate": 22.0, "pay_unit": "hour", "estimated_units": 6.0,
             "pickup_address": "Tanjong Pagar, Singapore"},
            {"country": "SG", "city": "Singapore", "lat": 1.2966, "lng": 103.7764,
             "title": "Looking for a part-time bookkeeper", "description": "Monthly close, expense categorisation, QuickBooks. Small e-commerce business.",
             "category": "financial", "pay_rate": 45.0, "pay_unit": "hour", "estimated_units": 8.0},

            # ── South Africa
            {"country": "ZA", "city": "Cape Town", "lat": -33.9249, "lng": 18.4241,
             "title": "Garden makeover, Sea Point", "description": "Clear overgrown beds, plant indigenous shrubs, lay mulch. Half-day job.",
             "category": "landscaping", "pay_rate": 45.0, "pay_unit": "flat", "estimated_units": 1.0,
             "pickup_address": "Sea Point, Cape Town"},
            {"country": "ZA", "city": "Johannesburg", "lat": -26.2041, "lng": 28.0473,
             "title": "Logo + brand kit for a coffee shop", "description": "Simple, warm, modern. Logo, two colour palettes, social templates.",
             "category": "digital_tech", "pay_rate": 25.0, "pay_unit": "hour", "estimated_units": 12.0},
        ]
        for s in global_demo:
            is_remote = s["category"] in REMOTE_FRIENDLY_CATEGORIES
            pickup_loc = None
            if s.get("pickup_address"):
                pickup_loc = {"lat": s["lat"], "lng": s["lng"], "address": s["pickup_address"]}
            dropoff_loc = None
            if s.get("dropoff_address"):
                dropoff_loc = {
                    "lat": s.get("dropoff_lat", s["lat"]),
                    "lng": s.get("dropoff_lng", s["lng"]),
                    "address": s["dropoff_address"],
                }
            await db.jobs.insert_one({
                "id": str(uuid.uuid4()),
                "customer_id": customer["id"], "customer_name": customer["name"],
                "title": s["title"], "description": s["description"], "category": s["category"],
                "category_group": category_group(s["category"]), "is_remote": is_remote,
                "pickup_location": pickup_loc, "dropoff_location": dropoff_loc,
                "pay_rate": s["pay_rate"], "pay_unit": s["pay_unit"], "estimated_units": s["estimated_units"],
                "media_url": None, "media_type": None,
                "payment_terms": "", "allowed_payment_methods": ["app", "cash", "card"],
                "status": "open", "provider_id": None,
                "deposit_paid": False, "deposit_amount": 0.0,
                "total_estimate": s["pay_rate"] * s["estimated_units"],
                "country": s["country"], "city": s["city"],
                "is_global_demo": True,
                "created_at": now_iso(),
            })
        logger.info(f"Seeded {len(global_demo)} global demo jobs across 15 countries")

    # ────────────────────────────────────────────────────────────────────────
    # Demo rentals across all 11 categories
    # ────────────────────────────────────────────────────────────────────────
    if customer and await db.rentals.count_documents({"is_demo": True}) == 0:
        demo_rentals = [
            # Property & Stays
            {"category": "property", "subcategory": "vacation_rental", "title": "Sun-drenched Loft in Echo Park", "description": "Open-plan 1BR with a private patio, two minutes from Sunset Blvd. Walk to Echo Park Lake.",
             "location": {"address": "Echo Park, Los Angeles, CA", "lat": 34.0786, "lng": -118.2606},
             "pricing": {"daily": 185, "weekly": 1100, "monthly": 3800, "security_deposit": 300},
             "attributes": {"bedrooms": 1, "bathrooms": 1, "guests": 3, "amenities": ["WiFi", "Kitchen", "Patio", "AC"], "type": "Loft"}},
            {"category": "property", "subcategory": "workspace", "title": "Brooklyn Brownstone Workspace", "description": "Dedicated desk in a quiet Park Slope brownstone, 7am–11pm access.",
             "location": {"address": "Park Slope, Brooklyn, NY", "lat": 40.6712, "lng": -73.9789},
             "pricing": {"daily": 35, "weekly": 175, "monthly": 600},
             "attributes": {"capacity": 1, "amenities": ["WiFi 500/500", "Standing desk", "Coffee", "Printer"]}},
            # Venues
            {"category": "venues", "subcategory": "wedding_venue", "title": "Riverside Garden Wedding Venue", "description": "Outdoor riverside venue with a covered pavilion and string lights. Catering allowed.",
             "location": {"address": "Hudson Valley, NY", "lat": 41.7004, "lng": -73.9210},
             "pricing": {"hourly": 450, "daily": 3200, "security_deposit": 1000},
             "attributes": {"capacity": 180, "indoor_outdoor": "Outdoor", "catering_allowed": True, "parking_spaces": 60}},
            {"category": "venues", "subcategory": "photo_studio", "title": "Daylight Photo Studio · 2,000 sqft", "description": "South-facing daylight studio with cyc wall, props, and grip kit included.",
             "location": {"address": "Williamsburg, Brooklyn, NY", "lat": 40.7081, "lng": -73.9571},
             "pricing": {"hourly": 95, "daily": 650},
             "attributes": {"capacity": 25, "indoor_outdoor": "Indoor", "amenities": ["Cyc wall", "Strobes", "WiFi", "Kitchen"]}},
            # Vehicles
            {"category": "vehicles", "subcategory": "car", "title": "2023 Tesla Model 3 Long Range", "description": "Clean, fast, Autopilot. Includes one supercharger session per day.",
             "location": {"address": "San Francisco, CA", "lat": 37.7749, "lng": -122.4194},
             "pricing": {"hourly": 18, "daily": 110, "weekly": 650, "security_deposit": 400},
             "attributes": {"make": "Tesla", "model": "Model 3", "year": 2023, "transmission": "Auto", "fuel": "Electric", "seats": 5, "mileage_cap_per_day": 200}},
            {"category": "vehicles", "subcategory": "rv", "title": "Class C Motorhome — sleeps 6", "description": "Pet-friendly Class C, fully equipped: kitchen, bathroom, generator, bike rack.",
             "location": {"address": "Bend, OR", "lat": 44.0582, "lng": -121.3153},
             "pricing": {"daily": 240, "weekly": 1500, "security_deposit": 800},
             "attributes": {"make": "Winnebago", "year": 2021, "seats": 6, "mileage_cap_per_day": 150}},
            {"category": "vehicles", "subcategory": "boat", "title": "23ft Bowrider with Captain", "description": "Half-day or full-day Lake Tahoe charter. Captain + fuel included.",
             "location": {"address": "South Lake Tahoe, CA", "lat": 38.9399, "lng": -119.9772},
             "pricing": {"hourly": 195, "daily": 1100, "security_deposit": 500},
             "attributes": {"make": "Bayliner", "seats": 8, "captain_included": True}},
            # Tools & Equipment
            {"category": "tools_equipment", "subcategory": "construction", "title": "Mini Excavator — Kubota KX040", "description": "9,500 lb mini excavator, includes 18\", 24\", and 36\" buckets.",
             "location": {"address": "Phoenix, AZ", "lat": 33.4484, "lng": -112.0740},
             "pricing": {"daily": 320, "weekly": 1500, "security_deposit": 750},
             "attributes": {"power_source": "Diesel", "delivery_available": True, "operator_required": True}},
            {"category": "tools_equipment", "subcategory": "generator", "title": "Honda EU7000iS Inverter Generator", "description": "Quiet, ~7kW inverter generator with electric start. Tested at 64dB at 22ft.",
             "location": {"address": "Austin, TX", "lat": 30.2672, "lng": -97.7431},
             "pricing": {"daily": 85, "weekly": 450},
             "attributes": {"power_source": "Gasoline", "delivery_available": True}},
            # Photo, Video & AV
            {"category": "photo_av", "subcategory": "camera_body", "title": "Sony A7 IV + 24-70 f/2.8 GM", "description": "Full-frame mirrorless kit with 64GB card and two batteries.",
             "location": {"address": "Brooklyn, NY", "lat": 40.6782, "lng": -73.9442},
             "pricing": {"daily": 110, "weekly": 550, "security_deposit": 1500},
             "attributes": {"brand": "Sony", "model": "A7 IV", "delivery_available": False}},
            {"category": "photo_av", "subcategory": "drone", "title": "DJI Mavic 3 Pro · drone + extra batteries", "description": "Cinema-tier drone with 3 batteries, ND filters, ProRes activation.",
             "location": {"address": "Los Angeles, CA", "lat": 34.0522, "lng": -118.2437},
             "pricing": {"daily": 145, "weekly": 700, "security_deposit": 1200},
             "attributes": {"brand": "DJI", "model": "Mavic 3 Pro"}},
            # Outdoor & Sports
            {"category": "outdoor_sports", "subcategory": "camping", "title": "4-person camping kit · tent + bags + cookset", "description": "Everything for a weekend out: REI Half Dome 4, two 30°F bags, JetBoil, headlamps.",
             "location": {"address": "Seattle, WA", "lat": 47.6062, "lng": -122.3321},
             "pricing": {"daily": 35, "weekly": 175},
             "attributes": {"size": "4-person", "delivery_available": True}},
            {"category": "outdoor_sports", "subcategory": "ski", "title": "Adult Ski Package — boots, skis, poles", "description": "Daily / weekly rental, freshly tuned and waxed. Sizing on-site.",
             "location": {"address": "Park City, UT", "lat": 40.6461, "lng": -111.4980},
             "pricing": {"daily": 45, "weekly": 220},
             "attributes": {"size": "Sizes 38–46", "level": "Intermediate"}},
            # Furniture, Appliances & Electronics
            {"category": "furniture_appliances", "subcategory": "sofa", "title": "Mid-century 3-seat Sofa (monthly)", "description": "Walnut-frame mid-century sofa, dove grey wool. White-glove delivery and pickup.",
             "location": {"address": "Chicago, IL", "lat": 41.8781, "lng": -87.6298},
             "pricing": {"monthly": 95, "weekly": 28, "security_deposit": 200},
             "attributes": {"delivery_available": True}},
            {"category": "furniture_appliances", "subcategory": "gaming", "title": "PS5 + 2 controllers + 4 games", "description": "Disc edition, two DualSense controllers, four AAA titles. Perfect for a weekend.",
             "location": {"address": "Miami, FL", "lat": 25.7617, "lng": -80.1918},
             "pricing": {"daily": 25, "weekly": 120, "security_deposit": 250}},
            # Medical, Mobility & Baby
            {"category": "medical_mobility", "subcategory": "wheelchair", "title": "Lightweight Folding Wheelchair", "description": "Travel-ready folding wheelchair, 220 lb capacity. Free delivery within 10 miles.",
             "location": {"address": "Atlanta, GA", "lat": 33.7490, "lng": -84.3880},
             "pricing": {"weekly": 60, "monthly": 180, "security_deposit": 100},
             "attributes": {"size": "Standard", "delivery_available": True}},
            {"category": "medical_mobility", "subcategory": "stroller", "title": "Doona Convertible Car Seat / Stroller", "description": "Folds from stroller to car seat in seconds. Sanitised before pickup.",
             "location": {"address": "San Diego, CA", "lat": 32.7157, "lng": -117.1611},
             "pricing": {"daily": 20, "weekly": 95, "monthly": 280},
             "attributes": {"size": "Birth–35 lb"}},
            # Events, Parties & Weddings
            {"category": "events_weddings", "subcategory": "tent", "title": "20ft × 40ft White Pole Tent", "description": "Includes sidewalls, string lights, and setup/breakdown labor.",
             "location": {"address": "Nashville, TN", "lat": 36.1627, "lng": -86.7816},
             "pricing": {"daily": 650, "weekend": 1100, "security_deposit": 300},
             "attributes": {"guests": 80, "delivery_available": True}},
            {"category": "events_weddings", "subcategory": "formal_wear", "title": "Designer Tuxedo Rental", "description": "Tom Ford Shelton tux. 3-day rental + free re-fitting if needed.",
             "location": {"address": "New York, NY", "lat": 40.7128, "lng": -74.0060},
             "pricing": {"daily": 220, "weekend": 320, "security_deposit": 500},
             "attributes": {"size": "38R–46R"}},
            # Storage & Containers
            {"category": "storage_containers", "subcategory": "self_storage", "title": "10×10 Climate-controlled Storage Unit", "description": "Indoor, climate-controlled unit with 24/7 access.",
             "location": {"address": "Denver, CO", "lat": 39.7392, "lng": -104.9903},
             "pricing": {"monthly": 165, "weekly": 50},
             "attributes": {"size": "10×10 ft", "climate_controlled": True, "access_24_7": True}},
            {"category": "storage_containers", "subcategory": "shipping_container", "title": "20ft Shipping Container — Delivered", "description": "Wind & watertight 20-foot container delivered to your site.",
             "location": {"address": "Houston, TX", "lat": 29.7604, "lng": -95.3698},
             "pricing": {"monthly": 220, "weekly": 70, "security_deposit": 400},
             "attributes": {"size": "20 ft", "delivery_available": True}},
            # Site Services
            {"category": "site_services", "subcategory": "portable_toilet", "title": "Portable Toilet — Standard Unit", "description": "Weekly servicing included. Delivery within 30 miles.",
             "location": {"address": "Dallas, TX", "lat": 32.7767, "lng": -96.7970},
             "pricing": {"weekly": 110, "monthly": 380},
             "attributes": {"delivery_available": True, "size": "Standard"}},
            {"category": "site_services", "subcategory": "light_tower", "title": "4-bulb Towable Light Tower", "description": "30 ft mast, 10 hr runtime. Diesel-powered.",
             "location": {"address": "Las Vegas, NV", "lat": 36.1699, "lng": -115.1398},
             "pricing": {"daily": 145, "weekly": 700, "security_deposit": 250},
             "attributes": {"power_source": "Diesel", "delivery_available": True}},
        ]
        for r in demo_rentals:
            doc = {
                "id": str(uuid.uuid4()),
                "owner_id": customer["id"], "owner_name": customer["name"],
                "category": r["category"], "subcategory": r.get("subcategory"),
                "title": r["title"], "description": r.get("description"),
                "location": r.get("location"),
                "media_url": None, "media_type": None, "media": [],
                "pricing": r["pricing"], "attributes": r.get("attributes", {}),
                "booking_mode": "instant", "min_duration": 1, "max_duration": None,
                "status": "active", "host_verification_required": r["category"] in RENTAL_HIGH_VALUE_CATEGORIES,
                "is_demo": True,
                "created_at": now_iso(),
            }
            await db.rentals.insert_one(doc)
        logger.info(f"Seeded {len(demo_rentals)} demo rentals across 11 categories")

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

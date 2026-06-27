"""
Remote / W-2 job seed loader.

Populates the `jobs` collection with a curated set of realistic remote and
W-2 listings so the /map and provider feed has content even before the
platform has organic postings. Idempotent — re-running won't duplicate.

Listings link out to publicly-listed open roles (Apply URLs) where the
underlying company is already publicly recruiting.
"""
from datetime import datetime, timezone
import uuid
import logging

logger = logging.getLogger(__name__)

# Each listing here is a real category of public posting. We tag every record
# with `seeded:'remote_w2_v1'` so we can dedupe on restart and refresh later.
SEED_TAG = "remote_w2_v2"

# Inline copy of server.category_group — keeping the seed module decoupled
# from the rest of the codebase so we don't risk a circular import.
_REMOTE_FRIENDLY_CATEGORIES = {"digital_tech", "marketing", "business_admin", "education", "legal", "financial", "research", "remote_work"}

def _category_group(cat: str) -> str:
    if cat in _REMOTE_FRIENDLY_CATEGORIES:
        return "remote_jobs"
    if cat in {"delivery", "courier", "moving", "ride_share", "towing"}:
        return "physical_delivery"
    if cat in {"digital_tech", "marketing", "business_admin", "education", "legal", "financial", "research"}:
        return "tech_digital"
    return "local_services"

# Centre of the US used as a placeholder pin for remote/W-2 listings so they
# still show up on the map without claiming a specific location.
_GEO_REMOTE = {"lat": 39.8283, "lng": -98.5795, "address": "Remote — United States"}

_JOBS = [
    # ── Remote (1099 / contract) ─────────────────────────────────────────
    {
        "title": "Remote customer support agent (chat & email)",
        "description": "Handle 30–50 inbound chats / emails per shift for a Shopify-store ecommerce brand. WFH. Need a quiet space, reliable internet, and 6+ months CS experience. Flexible hours, paid weekly.",
        "category": "remote_work",
        "details": {"subcategory": "customer_support"},
        "pay_rate": 22.0, "pay_unit": "hour", "schedule": "Part-time / Flexible",
        "apply_url": "https://www.indeed.com/jobs?q=remote+customer+support+agent",
        "employment_type": "remote",
    },
    {
        "title": "Freelance content writer (B2B SaaS)",
        "description": "Write 4 long-form (1,800–2,500 word) blog posts per month for a developer-tools company. SEO-optimised, interview-driven. Need 3 published clips on dev / tech topics.",
        "category": "marketing",
        "details": {"subcategory": "content_writing"},
        "pay_rate": 350.0, "pay_unit": "flat", "estimated_units": 4,
        "schedule": "Contract", "apply_url": "https://problogger.com/jobs/",
        "employment_type": "remote",
    },
    {
        "title": "Virtual assistant — 15 hrs / week",
        "description": "Inbox triage, calendar management, light bookkeeping in QuickBooks Online, simple Canva graphics. US-time zones only.",
        "category": "business_admin",
        "details": {"subcategory": "virtual_assistant"},
        "pay_rate": 25.0, "pay_unit": "hour", "schedule": "Part-time",
        "apply_url": "https://www.upwork.com/freelance-jobs/virtual-assistant/",
        "employment_type": "remote",
    },
    {
        "title": "Bookkeeper — small business clients (remote)",
        "description": "Manage books for ~5 micro-businesses using QuickBooks Online. Monthly reconciliation, payroll prep, sales-tax filings. Need 2+ years experience.",
        "category": "financial",
        "details": {"subcategory": "bookkeeping"},
        "pay_rate": 35.0, "pay_unit": "hour", "schedule": "Part-time / Flexible",
        "apply_url": "https://www.flexjobs.com/jobs/bookkeeping",
        "employment_type": "remote",
    },
    {
        "title": "Online ESL tutor (China / Japan time zones)",
        "description": "Teach 25-minute English lessons to children ages 6–12 via a structured curriculum. Bachelor's degree + 120-hour TEFL certificate.",
        "category": "education",
        "details": {"subcategory": "tutoring"},
        "pay_rate": 20.0, "pay_unit": "hour", "schedule": "Flexible (evening US time)",
        "apply_url": "https://t.vipkid.com/",
        "employment_type": "remote",
    },
    {
        "title": "Transcription — medical and legal",
        "description": "Transcribe audio files (legal depositions, doctor notes) with 98 %+ accuracy. Self-paced. Need a quality headset and clean typing test.",
        "category": "business_admin",
        "details": {"subcategory": "transcription"},
        "pay_rate": 0.75, "pay_unit": "flat", "estimated_units": 60,
        "schedule": "Flexible",
        "apply_url": "https://www.rev.com/freelancers",
        "employment_type": "remote",
    },

    # ── W-2 (full-time, salaried) ─────────────────────────────────────────
    {
        "title": "Senior software engineer — fully remote (W-2)",
        "description": "Stripe-funded fintech, $140–$190 k salary + equity. React / TypeScript / Postgres / AWS. 5+ years experience. Health, dental, 401(k) match, 25-day PTO.",
        "category": "digital_tech",
        "details": {"subcategory": "software_engineering"},
        "pay_rate": 165000.0, "pay_unit": "year", "schedule": "Full-time (W-2)",
        "apply_url": "https://www.linkedin.com/jobs/search/?keywords=senior+software+engineer+remote",
        "employment_type": "w2",
    },
    {
        "title": "Customer success manager — remote",
        "description": "Own a $4M ARR portfolio of mid-market SaaS customers. Quarterly business reviews, churn-prevention. $85–$115 k OTE + benefits.",
        "category": "business_admin",
        "details": {"subcategory": "customer_success"},
        "pay_rate": 100000.0, "pay_unit": "year", "schedule": "Full-time (W-2)",
        "apply_url": "https://www.linkedin.com/jobs/search/?keywords=customer+success+manager+remote",
        "employment_type": "w2",
    },
    {
        "title": "RN — remote telehealth nurse (W-2)",
        "description": "Active multi-state RN license required (compact preferred). 12 hr shifts. Triage incoming patient calls, document in Epic. $40–$48 / hr + full benefits.",
        "category": "medical",
        "details": {"subcategory": "nursing"},
        "pay_rate": 44.0, "pay_unit": "hour", "schedule": "Full-time (W-2)",
        "apply_url": "https://www.linkedin.com/jobs/search/?keywords=remote+telehealth+nurse",
        "employment_type": "w2",
    },
    {
        "title": "Senior recruiter — tech / engineering (remote W-2)",
        "description": "Full-cycle technical recruiting for a 1,200-person growth-stage company. $90–$120 k base + bonus. 4+ years agency or in-house tech recruiting.",
        "category": "business_admin",
        "details": {"subcategory": "recruiting"},
        "pay_rate": 105000.0, "pay_unit": "year", "schedule": "Full-time (W-2)",
        "apply_url": "https://www.linkedin.com/jobs/search/?keywords=technical+recruiter+remote",
        "employment_type": "w2",
    },
    {
        "title": "Project manager — construction (Phoenix, AZ)",
        "description": "Manage 3–5 mid-rise commercial projects from ground-break to handover. PMP preferred, 6+ years GC experience. $95–$135 k + truck allowance + benefits.",
        "category": "handyman",
        "details": {"subcategory": "project_management"},
        "pay_rate": 115000.0, "pay_unit": "year", "schedule": "Full-time (W-2)",
        "pickup_location": {"lat": 33.4484, "lng": -112.0740, "address": "Phoenix, AZ"},
        "apply_url": "https://www.indeed.com/jobs?q=construction+project+manager&l=Phoenix%2C+AZ",
        "employment_type": "w2",
    },
    {
        "title": "Diesel mechanic — Class A fleet (Memphis, TN)",
        "description": "Maintain a 220-truck fleet for a regional carrier. ASE Master Truck preferred. $32–$42 / hr + shift differential + family medical.",
        "category": "auto",
        "details": {"subcategory": "diesel_mechanic"},
        "pay_rate": 37.0, "pay_unit": "hour", "schedule": "Full-time (W-2)",
        "pickup_location": {"lat": 35.1495, "lng": -90.0490, "address": "Memphis, TN"},
        "apply_url": "https://www.indeed.com/jobs?q=diesel+mechanic&l=Memphis%2C+TN",
        "employment_type": "w2",
    },
]


async def seed_remote_w2_jobs(db) -> dict:
    """Idempotently seed remote / W-2 listings. Safe to run on every boot."""
    existing = await db.jobs.count_documents({"seeded": SEED_TAG})
    if existing >= len(_JOBS):
        return {"ok": True, "skipped": True, "existing": existing}

    # Wipe partial seeds so re-runs of this seed always reflect the current list.
    await db.jobs.delete_many({"seeded": SEED_TAG})

    docs = []
    for j in _JOBS:
        pl = j.get("pickup_location") or _GEO_REMOTE
        docs.append({
            "id": str(uuid.uuid4()),
            "customer_id": "system",
            "customer_name": "Lumo — sourced listing",
            "title": j["title"],
            "description": j["description"],
            "category": j["category"],
            "category_group": _category_group(j["category"]),
            "details": j.get("details") or {},
            "pickup_location": pl,
            "dropoff_location": None,
            "pay_rate": j["pay_rate"],
            "pay_unit": j["pay_unit"],
            "estimated_units": j.get("estimated_units", 1.0),
            "is_remote": j.get("employment_type") in ("remote", "w2"),
            "employment_type": j["employment_type"],
            "schedule": j.get("schedule"),
            "apply_url": j.get("apply_url"),
            "status": "open",
            "media_url": None,
            "media_type": None,
            "payment_terms": None,
            "allowed_payment_methods": None,
            "seeded": SEED_TAG,
            "created_at": datetime.now(timezone.utc).isoformat(),
        })
    if docs:
        await db.jobs.insert_many(docs)
        logger.info(f"Seeded {len(docs)} remote / W-2 job listings.")
    return {"ok": True, "seeded": len(docs)}

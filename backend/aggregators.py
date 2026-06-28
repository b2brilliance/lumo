"""
External job aggregators — pulls publicly-available, legally-accessible job
listings into Lumo's jobs collection so they appear on /map alongside
native postings.

Sources (all legal, no scraping):
  • USAJobs.gov — public US federal job API
  • Greenhouse Job Board API — every company that uses Greenhouse exposes a
    public, ToS-permitted JSON feed
  • RemoteOK — public JSON feed (https://remoteok.com/api)
  • WeWorkRemotely — public RSS feeds per category

Each aggregator returns a list of normalized dicts. The ingest function
upserts on (source, source_id) so re-runs are idempotent. External jobs
are stored as on-platform records with `apply_url` set, so the existing
"External apply" link in the feed handles them.
"""
from __future__ import annotations
import asyncio
import logging
import re
from datetime import datetime, timezone
from typing import List, Dict, Any, Optional

import httpx

logger = logging.getLogger(__name__)

USER_AGENT = "LumoBot/1.0 (+https://golumo.app)"
SYNC_INTERVAL_SECONDS = 6 * 3600  # 6 hours

# Curated list of companies whose Greenhouse job boards are public.
# Each entry is the board slug (the bit after /boards-api.greenhouse.io/v1/boards/)
GREENHOUSE_COMPANIES = [
    "airbnb", "stripe", "coinbase", "lyft", "doordash", "instacart", "robinhood",
    "twilio", "asana", "figma", "notion", "discord", "anthropic", "openai",
    "scaleai", "ramp", "brex", "rippling", "gusto", "carta", "klaviyo",
    "hubspot", "gitlab", "vercel", "linear", "retool", "datadoghq", "wealthfront",
    "dropbox", "pinterest",
]


# ── Category mapping ─────────────────────────────────────────────────────
def _guess_category(title: str, description: str = "") -> str:
    """Map an external job title/description onto one of Lumo's categories."""
    t = f"{title} {description}".lower()
    if re.search(r"\b(driver|courier|delivery|warehouse)\b", t):
        return "delivery"
    if re.search(r"\b(nurse|nursing|rn|lpn|cna|hha|physician|doctor|medical|clinical|hospital|caregiver)\b", t):
        return "medical"
    if re.search(r"\b(engineer|developer|software|programmer|swe|frontend|backend|full.?stack|devops|sre|qa)\b", t):
        return "digital_tech"
    if re.search(r"\b(data scientist|machine learning|ml engineer|ai|nlp|computer vision|analyst)\b", t):
        return "digital_tech"
    if re.search(r"\b(designer|design|ux|ui|graphic)\b", t):
        return "digital_tech"
    if re.search(r"\b(marketing|seo|growth|social media|content writer|copywriter|brand)\b", t):
        return "marketing"
    if re.search(r"\b(accountant|bookkeeper|tax|cpa|financial analyst|controller|payroll)\b", t):
        return "financial"
    if re.search(r"\b(legal|attorney|lawyer|paralegal|counsel)\b", t):
        return "legal"
    if re.search(r"\b(teacher|tutor|instructor|professor|educator|trainer)\b", t):
        return "education"
    if re.search(r"\b(customer support|customer service|help desk|virtual assistant|admin assistant|secretary)\b", t):
        return "business_admin"
    if re.search(r"\b(research|scientist|analyst)\b", t):
        return "research"
    return "remote_work"


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


# ── Aggregator: USAJobs ──────────────────────────────────────────────────
async def fetch_usajobs(per_page: int = 100) -> List[Dict[str, Any]]:
    """Public US federal jobs. No key required — User-Agent header is enough."""
    url = "https://data.usajobs.gov/api/search"
    headers = {
        "User-Agent": USER_AGENT,
        "Host": "data.usajobs.gov",
    }
    params = {"ResultsPerPage": per_page, "Page": 1}
    out: List[Dict[str, Any]] = []
    try:
        async with httpx.AsyncClient(timeout=30) as client:
            r = await client.get(url, params=params, headers=headers)
            r.raise_for_status()
            data = r.json()
        items = (data.get("SearchResult") or {}).get("SearchResultItems") or []
        for it in items:
            mo = it.get("MatchedObjectDescriptor") or {}
            position_id = it.get("MatchedObjectId") or mo.get("PositionID")
            if not position_id:
                continue
            title = mo.get("PositionTitle") or "Federal position"
            locs = mo.get("PositionLocation") or []
            primary_loc = locs[0] if locs else {}
            lat = primary_loc.get("Latitude")
            lng = primary_loc.get("Longitude")
            address = primary_loc.get("LocationName")
            remuneration = (mo.get("PositionRemuneration") or [{}])[0]
            try:
                pay_min = float(remuneration.get("MinimumRange") or 0)
                pay_max = float(remuneration.get("MaximumRange") or 0)
                pay_rate = round((pay_min + pay_max) / 2, 2) if pay_max else pay_min
            except Exception:
                pay_rate = 0.0
            pay_unit = "year"  # USAJobs returns annual figures
            apply_url = (mo.get("PositionURI") or "").strip()
            out.append({
                "source": "usajobs",
                "source_id": str(position_id),
                "title": title,
                "description": (mo.get("QualificationSummary") or "")[:1200],
                "category": _guess_category(title, mo.get("QualificationSummary", "")),
                "pay_rate": pay_rate,
                "pay_unit": pay_unit,
                "estimated_units": 1.0,
                "employment_type": "w2",
                "schedule": "Full-time",
                "is_remote": False,
                "pickup_location": {
                    "lat": float(lat) if lat else None,
                    "lng": float(lng) if lng else None,
                    "address": address,
                } if (lat and lng) else None,
                "apply_url": apply_url,
                "external_employer": (mo.get("OrganizationName") or "US Federal Government"),
            })
    except Exception as e:
        logger.warning(f"USAJobs fetch failed: {e}")
    return out


# ── Aggregator: Greenhouse public job boards ─────────────────────────────
async def fetch_greenhouse() -> List[Dict[str, Any]]:
    out: List[Dict[str, Any]] = []
    async with httpx.AsyncClient(timeout=30, headers={"User-Agent": USER_AGENT}) as client:
        for slug in GREENHOUSE_COMPANIES:
            try:
                r = await client.get(f"https://boards-api.greenhouse.io/v1/boards/{slug}/jobs")
                if r.status_code != 200:
                    continue
                jobs = (r.json() or {}).get("jobs") or []
                for j in jobs:
                    jid = j.get("id")
                    if not jid:
                        continue
                    title = (j.get("title") or "").strip()
                    loc_text = ((j.get("location") or {}).get("name") or "").strip()
                    is_remote = "remote" in loc_text.lower()
                    out.append({
                        "source": "greenhouse",
                        "source_id": f"{slug}-{jid}",
                        "title": f"{title} — {slug.title()}",
                        "description": f"Open role at {slug.title()}. Location: {loc_text or 'see posting'}.",
                        "category": _guess_category(title),
                        "pay_rate": 0.0,  # Greenhouse doesn't expose pay publicly
                        "pay_unit": "year",
                        "estimated_units": 1.0,
                        "employment_type": "w2",
                        "schedule": "Full-time",
                        "is_remote": is_remote,
                        "pickup_location": None,
                        "apply_url": j.get("absolute_url"),
                        "external_employer": slug.title(),
                    })
            except Exception as e:
                logger.debug(f"Greenhouse {slug} skipped: {e}")
    return out


# ── Aggregator: RemoteOK ─────────────────────────────────────────────────
async def fetch_remoteok() -> List[Dict[str, Any]]:
    out: List[Dict[str, Any]] = []
    try:
        async with httpx.AsyncClient(timeout=30, headers={"User-Agent": USER_AGENT}) as client:
            r = await client.get("https://remoteok.com/api")
            r.raise_for_status()
            data = r.json() or []
        for j in data:
            if not isinstance(j, dict) or not j.get("id"):
                continue
            title = (j.get("position") or j.get("title") or "").strip()
            if not title:
                continue
            company = (j.get("company") or "").strip()
            salary_min = j.get("salary_min") or 0
            salary_max = j.get("salary_max") or 0
            pay_rate = round(((salary_min + salary_max) / 2) if salary_max else salary_min, 2)
            out.append({
                "source": "remoteok",
                "source_id": str(j.get("id")),
                "title": f"{title}{' — ' + company if company else ''}",
                "description": (j.get("description") or "")[:1200],
                "category": _guess_category(title, j.get("description", "")),
                "pay_rate": float(pay_rate),
                "pay_unit": "year",
                "estimated_units": 1.0,
                "employment_type": "remote",
                "schedule": "Full-time",
                "is_remote": True,
                "pickup_location": None,
                "apply_url": j.get("url") or j.get("apply_url"),
                "external_employer": company or "Remote employer",
            })
    except Exception as e:
        logger.warning(f"RemoteOK fetch failed: {e}")
    return out


# ── Aggregator: WeWorkRemotely RSS ──────────────────────────────────────
async def fetch_wwr() -> List[Dict[str, Any]]:
    out: List[Dict[str, Any]] = []
    feeds = [
        ("digital_tech",   "https://weworkremotely.com/categories/remote-programming-jobs.rss"),
        ("marketing",      "https://weworkremotely.com/categories/remote-product-jobs.rss"),
        ("business_admin", "https://weworkremotely.com/categories/remote-customer-support-jobs.rss"),
        ("digital_tech",   "https://weworkremotely.com/categories/remote-devops-sysadmin-jobs.rss"),
    ]
    async with httpx.AsyncClient(timeout=30, headers={"User-Agent": USER_AGENT}) as client:
        for category, url in feeds:
            try:
                r = await client.get(url)
                if r.status_code != 200:
                    continue
                xml = r.text
                # Lightweight RSS parsing — each <item> block becomes a job.
                for m in re.finditer(r"<item>(.*?)</item>", xml, re.S):
                    block = m.group(1)
                    title = _xml_tag(block, "title")
                    link = _xml_tag(block, "link")
                    guid = _xml_tag(block, "guid") or link
                    desc = _xml_tag(block, "description") or ""
                    if not title or not link or not guid:
                        continue
                    out.append({
                        "source": "wwr",
                        "source_id": guid,
                        "title": title,
                        "description": re.sub(r"<[^>]+>", "", desc)[:1200],
                        "category": category,
                        "pay_rate": 0.0,
                        "pay_unit": "year",
                        "estimated_units": 1.0,
                        "employment_type": "remote",
                        "schedule": "Full-time",
                        "is_remote": True,
                        "pickup_location": None,
                        "apply_url": link,
                        "external_employer": "Remote employer",
                    })
            except Exception as e:
                logger.debug(f"WWR feed {url} skipped: {e}")
    return out


def _xml_tag(block: str, tag: str) -> Optional[str]:
    m = re.search(rf"<{tag}>(?:<!\[CDATA\[)?(.*?)(?:\]\]>)?</{tag}>", block, re.S)
    if not m:
        return None
    return m.group(1).strip()


# ── Ingestion ────────────────────────────────────────────────────────────
async def ingest_aggregated_jobs(db) -> Dict[str, int]:
    """Run all enabled aggregators and upsert results into db.jobs.

    Each external job is stored as a complete jobs document (so existing
    /api/map/jobs returns them) but flagged with `source` + `source_id` for
    idempotency and `apply_url` so the UI links out instead of in-app Accept.
    """
    sources: Dict[str, List[Dict[str, Any]]] = {}
    # Respect per-source enable flags stored under db.aggregator_config.
    enabled = await _get_enabled_sources(db)
    if enabled.get("usajobs", True):
        sources["usajobs"] = await fetch_usajobs()
    if enabled.get("greenhouse", True):
        sources["greenhouse"] = await fetch_greenhouse()
    if enabled.get("remoteok", True):
        sources["remoteok"] = await fetch_remoteok()
    if enabled.get("wwr", True):
        sources["wwr"] = await fetch_wwr()

    counts: Dict[str, int] = {}
    for source, items in sources.items():
        inserted = 0
        for it in items:
            try:
                source_id = it["source_id"]
                doc = {
                    **it,
                    "status": "open",
                    "category_group": "remote_jobs" if it.get("is_remote") else "local_services",
                    "customer_id": "external",
                    "customer_name": it.get("external_employer") or source.title(),
                    "allowed_payment_methods": [],
                    "details": {},
                    "ingested_at": _now_iso(),
                }
                # Upsert on (source, source_id) so re-runs are idempotent.
                await db.jobs.update_one(
                    {"source": source, "source_id": source_id},
                    {
                        "$set": doc,
                        "$setOnInsert": {
                            "id": f"ext-{source}-{source_id}",
                            "created_at": _now_iso(),
                        },
                    },
                    upsert=True,
                )
                inserted += 1
            except Exception as e:
                logger.debug(f"Ingest {source} skipped 1 row: {e}")
        counts[source] = inserted
        # Record run metadata
        await db.aggregator_config.update_one(
            {"source": source},
            {"$set": {
                "source": source,
                "last_synced_at": _now_iso(),
                "last_count": inserted,
            }},
            upsert=True,
        )
    total = sum(counts.values())
    logger.info(f"Aggregator ingest complete: {counts} (total={total})")
    return counts


async def _get_enabled_sources(db) -> Dict[str, bool]:
    docs = await db.aggregator_config.find({}).to_list(50)
    out: Dict[str, bool] = {}
    for d in docs:
        out[d.get("source")] = d.get("enabled", True)
    return out


# ── Background loop ─────────────────────────────────────────────────────
async def aggregator_loop(db, interval_seconds: int = SYNC_INTERVAL_SECONDS):
    """Fire-and-forget background sync. Called from server.py on_startup."""
    # Initial 30s delay so app finishes boot before the first fetch
    await asyncio.sleep(30)
    while True:
        try:
            await ingest_aggregated_jobs(db)
        except Exception as e:
            logger.error(f"Aggregator loop iteration failed: {e}")
        await asyncio.sleep(interval_seconds)

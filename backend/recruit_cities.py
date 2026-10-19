"""City-targeted provider recruitment.

Per-city landing pages, signup attribution, and admin stats to hit a
300-workers-per-city hiring goal.

Endpoints
---------
Public:
    GET  /api/recruit/cities                 List active cities
    GET  /api/recruit/cities/{slug}          Full landing-page data
    POST /api/recruit/cities/{slug}/click    Track a click / view

Admin:
    GET  /api/admin/recruit/stats            All cities with progress
    POST /api/admin/recruit/cities           Create city
    PATCH /api/admin/recruit/cities/{slug}   Update city
    DELETE /api/admin/recruit/cities/{slug}  Delete city
"""

from __future__ import annotations

import logging
import uuid
from datetime import datetime, timezone
from typing import Any, Callable, Dict, List, Optional

import json
import re
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, ConfigDict, Field

logger = logging.getLogger(__name__)


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


class RecruitCity(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    slug: str
    city: str
    state: str                                # 2-letter code, e.g. "CA"
    state_full: Optional[str] = None
    goal_workers: int = 300
    bonus_amount: float = 100                 # milestone bonus $
    bonus_first_n: int = 100                  # first N providers get it
    bonus_job_count: int = 100                # jobs required to unlock it
    hero_headline: Optional[str] = None
    hero_subhead: Optional[str] = None
    hero_image: Optional[str] = None
    neighborhoods: List[str] = Field(default_factory=list)   # 3-5 landmark neighborhoods for local SEO
    country: str = "US"
    country_name: Optional[str] = "United States"
    continent: str = "NA"
    currency: str = "USD"
    lang: str = "en"
    local_name: Optional[str] = None
    lat: Optional[float] = None
    lng: Optional[float] = None
    population: int = 0
    geonameid: Optional[str] = None
    is_active: bool = True
    click_count: int = 0
    view_count: int = 0
    created_at: str = Field(default_factory=_now_iso)


class RecruitCityIn(BaseModel):
    slug: str
    city: str
    state: str
    state_full: Optional[str] = None
    goal_workers: int = 300
    bonus_amount: float = 100
    bonus_first_n: int = 100
    bonus_job_count: int = 100
    hero_headline: Optional[str] = None
    hero_subhead: Optional[str] = None
    hero_image: Optional[str] = None
    neighborhoods: List[str] = Field(default_factory=list)
    country: str = "US"
    country_name: Optional[str] = None
    continent: str = "NA"
    currency: str = "USD"
    lang: str = "en"
    is_active: bool = True


class RecruitCityPatch(BaseModel):
    city: Optional[str] = None
    state: Optional[str] = None
    state_full: Optional[str] = None
    goal_workers: Optional[int] = None
    bonus_amount: Optional[float] = None
    bonus_first_n: Optional[int] = None
    bonus_job_count: Optional[int] = None
    hero_headline: Optional[str] = None
    hero_subhead: Optional[str] = None
    hero_image: Optional[str] = None
    neighborhoods: Optional[List[str]] = None
    country: Optional[str] = None
    country_name: Optional[str] = None
    continent: Optional[str] = None
    currency: Optional[str] = None
    lang: Optional[str] = None
    is_active: Optional[bool] = None


# ── Seed the 6 user-requested target cities ────────────────────────
SEED_CITIES: List[Dict[str, Any]] = [
    {
        "slug": "los-angeles-ca", "city": "Los Angeles", "state": "CA", "state_full": "California",
        "hero_headline": "Drive with Lumo in Los Angeles.",
        "hero_subhead": "300 spots. $100 bonus after your first 100 jobs. Keep 90% of everything.",
        "hero_image": "https://images.unsplash.com/photo-1580655653885-65763b2597d0?auto=format&fit=crop&w=1600&q=80",
    },
    {
        "slug": "san-francisco-ca", "city": "San Francisco", "state": "CA", "state_full": "California",
        "hero_headline": "Deliveries, rides, repairs — earn in SF.",
        "hero_subhead": "First 100 sign-ups in SF earn a $100 bonus after their 100th completed job.",
        "hero_image": "https://images.unsplash.com/photo-1521747116042-5a810fda9664?auto=format&fit=crop&w=1600&q=80",
    },
    {
        "slug": "seattle-wa", "city": "Seattle", "state": "WA", "state_full": "Washington",
        "hero_headline": "Rainy days pay well in Seattle.",
        "hero_subhead": "Lumo needs 300 movers, cleaners, mechanics and couriers in Seattle. Start today.",
        "hero_image": "https://images.unsplash.com/photo-1502175353174-a7a1d3d3cf19?auto=format&fit=crop&w=1600&q=80",
    },
    {
        "slug": "tacoma-wa", "city": "Tacoma", "state": "WA", "state_full": "Washington",
        "hero_headline": "Tacoma pros — get paid same day.",
        "hero_subhead": "10 minutes to apply. First 100 sign-ups earn a $100 bonus at job #100.",
        "hero_image": "https://images.unsplash.com/photo-1466354424719-343280fe118b?auto=format&fit=crop&w=1600&q=80",
    },
    {
        "slug": "chicago-il", "city": "Chicago", "state": "IL", "state_full": "Illinois",
        "hero_headline": "Chicago's next 300 gig pros start here.",
        "hero_subhead": "Same-day payouts, no lead fees, and a $100 loyalty bonus at job #100.",
        "hero_image": "https://images.unsplash.com/photo-1477414348463-c0eb7f1359b6?auto=format&fit=crop&w=1600&q=80",
    },
    {
        "slug": "portland-or", "city": "Portland", "state": "OR", "state_full": "Oregon",
        "hero_headline": "Portland — keep 90% of everything you earn.",
        "hero_subhead": "Handymen, movers, couriers, cleaners — Lumo pays same day. $100 bonus at job #100.",
        "hero_image": "https://images.unsplash.com/photo-1518131945814-b32066ade60a?auto=format&fit=crop&w=1600&q=80",
    },
]


async def _reseed_bonus_amounts(db) -> int:
    """One-time migration: prior deploys used $500 milestone. Bring all
    existing rows down to $100 / 100-jobs while preserving admin edits
    to headlines and copy."""
    res = await db.recruit_cities.update_many(
        {"bonus_amount": {"$in": [500, 500.0]}},
        {"$set": {"bonus_amount": 100.0, "bonus_job_count": 100}},
    )
    async for d in db.recruit_cities.find({"hero_subhead": {"$regex": r"\$500"}}, {"_id": 0, "slug": 1, "hero_subhead": 1}):
        fixed = d["hero_subhead"].replace("$500 sign-on for the first 100", "$100 bonus after job #100").replace("$500", "$100")
        await db.recruit_cities.update_one({"slug": d["slug"]}, {"$set": {"hero_subhead": fixed}})
    # Any row missing bonus_job_count → set default
    await db.recruit_cities.update_many(
        {"bonus_job_count": {"$exists": False}},
        {"$set": {"bonus_job_count": 100}},
    )
    return res.modified_count


async def _backfill_local_enrichment(db) -> int:
    """Backfill neighborhoods + unique photo IDs on any pre-existing
    row that was seeded before those fields existed. Idempotent — only
    touches rows where the field is missing OR the hero_image matches
    the generic fallback that iter-57 used."""
    from recruit_cities_local import CITY_PHOTO_IDS, CITY_NEIGHBORHOODS, _photo_url
    updated = 0
    FALLBACK = "https://images.unsplash.com/photo-1477414348463-c0eb7f1359b6?auto=format&fit=crop&w=1600&q=80"
    cursor = db.recruit_cities.find({}, {"_id": 0, "slug": 1, "hero_image": 1, "neighborhoods": 1})
    async for doc in cursor:
        slug = doc.get("slug")
        if not slug:
            continue
        patch: Dict[str, Any] = {}
        # Neighborhoods
        current_hoods = doc.get("neighborhoods") or []
        curated_hoods = CITY_NEIGHBORHOODS.get(slug)
        if curated_hoods and not current_hoods:
            patch["neighborhoods"] = curated_hoods
        # Hero image — only overwrite if we have a curated match AND the
        # current image is either missing or the fallback iter-57 assigned.
        curated_photo = CITY_PHOTO_IDS.get(slug)
        if curated_photo:
            new_url = _photo_url(slug, FALLBACK)
            cur_url = doc.get("hero_image") or ""
            if new_url != cur_url and (not cur_url or cur_url == FALLBACK):
                patch["hero_image"] = new_url
        if patch:
            await db.recruit_cities.update_one({"slug": slug}, {"$set": patch})
            updated += 1
    if updated:
        logger.info(f"[recruit] Backfilled local enrichment on {updated} cities")
    return updated


async def credit_city_milestone(db, *, provider_id: str) -> Optional[dict]:
    """When a provider tagged with `recruit_city_slug` completes their Nth
    paid job, and they're one of the first `bonus_first_n` signups in
    that city, credit the flat `bonus_amount` to their wallet.

    Fires at most once per provider (atomic guard on
    `city_milestone_awarded_at`). Runs after every wallet_transactions
    credit row is written."""
    if not provider_id:
        return None
    prov = await db.users.find_one(
        {"id": provider_id},
        {"_id": 0, "role": 1, "recruit_city_slug": 1, "city_milestone_awarded_at": 1, "name": 1, "created_at": 1},
    )
    if not prov or prov.get("role") != "provider":
        return None
    slug = prov.get("recruit_city_slug")
    if not slug:
        return None
    if prov.get("city_milestone_awarded_at"):
        return None

    city = await db.recruit_cities.find_one({"slug": slug})
    if not city or not city.get("is_active", True):
        return None
    bonus = float(city.get("bonus_amount") or 100)
    goal_jobs = int(city.get("bonus_job_count") or 100)
    first_n = int(city.get("bonus_first_n") or 100)
    if bonus <= 0 or goal_jobs <= 0 or first_n <= 0:
        return None

    # Count paid payouts for this provider (matches referral milestone rule).
    jobs_done = await db.wallet_transactions.count_documents({
        "user_id": provider_id,
        "type": {"$in": ["credit", "stripe_payout"]},
        "ref_kind": {"$nin": ["referral", "referral_milestone", "city_milestone", None]},
    })
    if jobs_done < goal_jobs:
        return None

    # Rank among providers who signed up in this city — must be in the
    # first `first_n` (measured by created_at ascending).
    earlier_signups = await db.users.count_documents({
        "role": "provider",
        "recruit_city_slug": slug,
        "created_at": {"$lt": prov.get("created_at") or ""},
    })
    if earlier_signups >= first_n:
        return None  # too late — outside the first N

    now = _now_iso()
    # Atomic guard: only one bonus per provider.
    res = await db.users.update_one(
        {"id": provider_id, "city_milestone_awarded_at": {"$exists": False}},
        {
            "$set": {"city_milestone_awarded_at": now},
            "$inc": {"wallet_balance": bonus},
        },
    )
    if res.modified_count == 0:
        return None

    record = {
        "id": str(uuid.uuid4()),
        "user_id": provider_id,
        "recruit_city_slug": slug,
        "amount": bonus,
        "jobs_completed": jobs_done,
        "awarded_at": now,
    }
    await db.recruit_milestones.insert_one(record)
    await db.wallet_transactions.insert_one({
        "id": str(uuid.uuid4()),
        "user_id": provider_id,
        "amount": bonus,
        "type": "credit",
        "reason": f"City milestone bonus — {city.get('city')} · {goal_jobs} completed jobs",
        "ref_id": record["id"],
        "ref_kind": "city_milestone",
        "created_at": now,
    })
    try:
        await db.notifications.insert_one({
            "id": str(uuid.uuid4()),
            "user_id": provider_id,
            "type": "city_milestone",
            "title": f"You just earned ${bonus:.0f} 🎯",
            "body": f"You completed {goal_jobs} jobs on Lumo in {city.get('city')} — bonus is in your wallet.",
            "link": "/wallet",
            "read": False,
            "created_at": now,
        })
    except Exception:
        pass
    logger.info(f"[recruit] city milestone paid: provider={provider_id} slug={slug} amount={bonus}")
    return record


async def seed_recruit_cities(db) -> int:
    """Idempotent: only insert cities whose slug doesn't already exist,
    plus a one-time migration bumping legacy $500 rows down to $100.

    Seeds:
      1. The original 6 hand-authored priority cities (LA, SF, Seattle,
         Tacoma, Chicago, Portland-OR) — kept first for stable priority.
      2. Every top-100 US metro from `recruit_cities_us_seed.US_SEED_CITIES`
         so `/join/{slug}` works for every major American city out of the
         box. Admin can edit copy or set is_active=False anytime.
      3. Applies per-city local enrichment (unique hero photo + curated
         neighborhoods) from `recruit_cities_local.CITY_PHOTO_IDS` and
         `CITY_NEIGHBORHOODS`.
      4. Backfills local enrichment onto any pre-existing rows so old
         seeds get the same treatment on next boot.
    """
    from recruit_cities_us_seed import US_SEED_CITIES  # local import to avoid boot-time cost when unused
    from recruit_cities_local import (
        CITY_PHOTO_IDS as _PHOTOS, CITY_NEIGHBORHOODS as _HOODS, _photo_url,
    )
    await _reseed_bonus_amounts(db)
    inserted = 0
    seen_slugs: set = set()

    def _apply_local(doc: Dict[str, Any]) -> Dict[str, Any]:
        slug = doc.get("slug", "")
        hoods = _HOODS.get(slug)
        if hoods:
            doc["neighborhoods"] = hoods
        if _PHOTOS.get(slug):
            doc["hero_image"] = _photo_url(slug, doc.get("hero_image", ""))
        return doc

    # Priority cities first (preserves existing rows exactly)
    for c in SEED_CITIES:
        seen_slugs.add(c["slug"])
        exists = await db.recruit_cities.find_one({"slug": c["slug"]})
        if exists:
            continue
        doc = RecruitCity(**_apply_local(dict(c)))
        await db.recruit_cities.insert_one(doc.model_dump())
        inserted += 1

    # Nationwide fill — every top-100 metro
    for c in US_SEED_CITIES:
        if c["slug"] in seen_slugs:
            continue
        seen_slugs.add(c["slug"])
        exists = await db.recruit_cities.find_one({"slug": c["slug"]})
        if exists:
            continue
        doc = RecruitCity(**_apply_local(dict(c)))
        await db.recruit_cities.insert_one(doc.model_dump())
        inserted += 1

    if inserted:
        logger.info(f"[recruit] Seeded {inserted} recruit cities (priority + US metros)")
    await seed_world_cities(db)

    # Backfill enrichment on any rows already in Mongo from earlier boots
    await _backfill_local_enrichment(db)
    return inserted


WORLD_FILE = Path(__file__).parent / "data" / "world_recruit_cities.json"
CONTINENTS = {"AF": "Africa", "AS": "Asia", "EU": "Europe", "NA": "North America",
              "SA": "South America", "OC": "Oceania", "AN": "Antarctica"}
FALLBACK_HERO = "https://images.unsplash.com/photo-1477959858617-67f85cf4f1df?auto=format&fit=crop&w=1600&q=80"
# GeoNames primary language → Lumo-supported translation code
LANG_ALIASES = {"pt": "pt", "zh": "zh", "nb": "no", "nn": "no"}


async def seed_world_cities(db) -> int:
    """Idempotent: insert top-1000 world cities + top-5 per country, and
    backfill geo/country fields on existing rows (incl. US seeds)."""
    rows = json.loads(WORLD_FILE.read_text(encoding="utf-8"))
    existing = {d["slug"]: d async for d in db.recruit_cities.find({}, {"_id": 0, "slug": 1, "lat": 1, "population": 1, "geonameid": 1})}
    new_docs, inserted = [], 0
    for r in rows:
        geo = {k: r.get(k) for k in ("country", "country_name", "continent", "currency", "lang", "local_name", "lat", "lng",
                                     "population", "geonameid")}
        if r["slug"] in existing:
            ex = existing[r["slug"]]
            if not ex.get("population"):
                await db.recruit_cities.update_one({"slug": r["slug"]}, {"$set": geo})
            elif not ex.get("geonameid") and r.get("geonameid"):
                await db.recruit_cities.update_one({"slug": r["slug"]}, {"$set": {"geonameid": r["geonameid"]}})
            continue
        name = r["city"]
        new_docs.append(RecruitCity(
            slug=r["slug"], city=name, state=r["state"], state_full=r["country_name"] if r["country"] != "US" else None,
            hero_headline=f"Earn with Lumo in {name}.",
            hero_subhead=f"Lumo is hiring 300 couriers, drivers and local pros in {name}. Keep 90% of every job.",
            hero_image=FALLBACK_HERO, **geo,
        ).model_dump())
    if new_docs:
        await db.recruit_cities.insert_many(new_docs)
        inserted = len(new_docs)
        logger.info(f"[recruit] Seeded {inserted} world recruit cities")
    await db.recruit_cities.update_many({"country": {"$exists": False}},
                                        {"$set": {"country": "US", "country_name": "United States", "continent": "NA",
                                                  "currency": "USD", "lang": "en"}})
    for k in ("slug", "country", "continent"):
        await db.recruit_cities.create_index(k)
    return inserted


async def _signup_counts(db, slugs: List[str], since: Optional[str] = None) -> Dict[str, int]:
    match: Dict[str, Any] = {"role": "provider", "recruit_city_slug": {"$in": slugs}}
    if since:
        match["created_at"] = {"$gte": since}
    rows = await db.users.aggregate([
        {"$match": match},
        {"$group": {"_id": "$recruit_city_slug", "n": {"$sum": 1}}},
    ]).to_list(None)
    return {r["_id"]: r["n"] for r in rows}


LIGHT_FIELDS = {"_id": 0, "slug": 1, "city": 1, "state": 1, "state_full": 1, "country": 1, "country_name": 1,
                "continent": 1, "population": 1, "goal_workers": 1, "local_name": 1, "is_active": 1,
                "bonus_amount": 1, "click_count": 1, "view_count": 1, "currency": 1}


async def _light_list(db, q: Dict[str, Any], limit: int) -> List[Dict[str, Any]]:
    docs = await db.recruit_cities.find(q, LIGHT_FIELDS).sort("population", -1).limit(limit).to_list(limit)
    counts = await _signup_counts(db, [d["slug"] for d in docs])
    for d in docs:
        d["signups_total"] = counts.get(d["slug"], 0)
    return docs


SUPPORTED_LANGS = set("en es fr fr-CA de pt-BR pt it nl pl ru uk tr sv ja ko zh zh-TW hi bn ur ar he vi th id ms tl sw ha yo am el fa".split())
COUNTRY_LANG = {"BR": "pt-BR", "TW": "zh-TW", "HK": "zh-TW", "PH": "tl"}


def _page_lang(code: Optional[str], country: Optional[str]) -> str:
    c = COUNTRY_LANG.get(country or "") or LANG_ALIASES.get(code or "en", code or "en")
    return c if c in SUPPORTED_LANGS else "en"


async def _stats_for_city(db, city_doc: Dict[str, Any]) -> Dict[str, Any]:
    """Compute the current-worker count + signup progress for one city."""
    slug = city_doc.get("slug")
    total = await db.users.count_documents({
        "role": "provider",
        "recruit_city_slug": slug,
    })
    completed_10 = await db.users.count_documents({
        "role": "provider",
        "recruit_city_slug": slug,
        "milestone_10_awarded_at": {"$exists": True},
    })
    signups_last_7d = await db.users.count_documents({
        "role": "provider",
        "recruit_city_slug": slug,
        "created_at": {"$gte": _iso_days_ago(7)},
    })
    goal = int(city_doc.get("goal_workers") or 300)
    return {
        **city_doc,
        "signups_total": total,
        "signups_last_7d": signups_last_7d,
        "milestone_10_reached": completed_10,
        "spots_remaining": max(0, goal - total),
        "progress_pct": round(min(100, (total / goal) * 100)) if goal else 0,
    }


def _iso_days_ago(n: int) -> str:
    from datetime import timedelta
    return (datetime.now(timezone.utc) - timedelta(days=n)).isoformat()


def create_router(
    *,
    db,
    require_admin: Callable,
) -> APIRouter:
    r = APIRouter(prefix="/api", tags=["recruit"])

    @r.get("/recruit/cities")
    async def list_cities(country: Optional[str] = None, continent: Optional[str] = None,
                          q: Optional[str] = None, limit: int = 200):
        mq: Dict[str, Any] = {"is_active": True}
        if country:
            mq["country"] = country.upper()
        if continent:
            mq["continent"] = continent.upper()
        if q:
            rx = re.compile(re.escape(q.strip()), re.I)
            mq["$or"] = [{"city": rx}, {"local_name": rx}, {"country_name": rx}, {"state_full": rx}]
        return {"items": await _light_list(db, mq, min(int(limit), 2000))}

    @r.get("/recruit/world")
    async def world():
        rows = await db.recruit_cities.aggregate([
            {"$match": {"is_active": True}},
            {"$group": {"_id": {"cc": "$country", "name": "$country_name", "ct": "$continent"},
                        "cities": {"$sum": 1}, "pop": {"$sum": "$population"}}},
            {"$sort": {"pop": -1}},
        ]).to_list(None)
        signups = await db.users.aggregate([
            {"$match": {"role": "provider", "recruit_city_slug": {"$exists": True}}},
            {"$lookup": {"from": "recruit_cities", "localField": "recruit_city_slug", "foreignField": "slug", "as": "c"}},
            {"$unwind": "$c"}, {"$group": {"_id": "$c.country", "n": {"$sum": 1}}},
        ]).to_list(None)
        sc = {x["_id"]: x["n"] for x in signups}
        continents: Dict[str, Dict[str, Any]] = {}
        for row in rows:
            ct = row["_id"].get("ct") or "NA"
            bucket = continents.setdefault(ct, {"code": ct, "name": CONTINENTS.get(ct, ct), "countries": [], "cities": 0, "signups": 0})
            cc = row["_id"]["cc"]
            bucket["countries"].append({"code": cc, "name": row["_id"].get("name") or cc,
                                        "cities": row["cities"], "signups": sc.get(cc, 0)})
            bucket["cities"] += row["cities"]
            bucket["signups"] += sc.get(cc, 0)
        out = sorted(continents.values(), key=lambda c: -c["cities"])
        return {"continents": out, "total_cities": sum(c["cities"] for c in out),
                "total_countries": sum(len(c["countries"]) for c in out), "total_signups": sum(sc.values())}

    @r.get("/recruit/cities/{slug}")
    async def get_city(slug: str):
        doc = await db.recruit_cities.find_one({"slug": slug}, {"_id": 0})
        if not doc or not doc.get("is_active"):
            raise HTTPException(404, "City not found")
        out = await _stats_for_city(db, doc)
        out["page_lang"] = _page_lang(doc.get("lang"), doc.get("country"))
        out["continent_name"] = CONTINENTS.get(doc.get("continent") or "", "")
        out["nearby"] = [c for c in await _light_list(db, {"is_active": True, "country": doc.get("country", "US")}, 9)
                         if c["slug"] != slug][:8]
        return out

    @r.post("/recruit/cities/{slug}/click")
    async def record_click(slug: str):
        doc = await db.recruit_cities.find_one({"slug": slug}, {"_id": 0})
        if not doc:
            raise HTTPException(404, "City not found")
        await db.recruit_cities.update_one({"slug": slug}, {"$inc": {"click_count": 1}})
        return {"ok": True}

    # ── Admin ──────────────────────────────────────────────────────
    @r.get("/admin/recruit/stats")
    async def admin_stats(country: Optional[str] = None, continent: Optional[str] = None,
                          q: Optional[str] = None, limit: int = 300, _admin=Depends(require_admin)):
        mq: Dict[str, Any] = {}
        if country:
            mq["country"] = country.upper()
        if continent:
            mq["continent"] = continent.upper()
        if q:
            rx = re.compile(re.escape(q.strip()), re.I)
            mq["$or"] = [{"city": rx}, {"country_name": rx}, {"slug": rx}]
        docs = await db.recruit_cities.find(mq, {"_id": 0}).sort("population", -1).limit(min(int(limit), 2000)).to_list(None)
        slugs = [d["slug"] for d in docs]
        counts = await _signup_counts(db, slugs)
        week = await _signup_counts(db, slugs, _iso_days_ago(7))
        for d in docs:
            n = counts.get(d["slug"], 0)
            goal = int(d.get("goal_workers") or 300)
            d.update(signups_total=n, signups_last_7d=week.get(d["slug"], 0), spots_remaining=max(0, goal - n),
                     progress_pct=round(min(100, n / goal * 100)) if goal else 0)
        total = await db.recruit_cities.count_documents(mq)
        return {"items": docs, "total": total}

    @r.post("/admin/recruit/cities")
    async def create_city(payload: RecruitCityIn, _admin=Depends(require_admin)):
        exists = await db.recruit_cities.find_one({"slug": payload.slug})
        if exists:
            raise HTTPException(409, f"City '{payload.slug}' already exists")
        data = payload.model_dump()
        peer = await db.recruit_cities.find_one({"country": data["country"]}, {"_id": 0, "continent": 1, "country_name": 1})
        if peer:
            data["continent"] = peer.get("continent") or data["continent"]
            data["country_name"] = data.get("country_name") or peer.get("country_name")
        doc = RecruitCity(**data)
        await db.recruit_cities.insert_one(doc.model_dump())
        return doc.model_dump()

    @r.patch("/admin/recruit/cities/{slug}")
    async def update_city(slug: str, payload: RecruitCityPatch, _admin=Depends(require_admin)):
        updates = {k: v for k, v in payload.model_dump().items() if v is not None}
        if not updates:
            raise HTTPException(400, "Nothing to update")
        res = await db.recruit_cities.update_one({"slug": slug}, {"$set": updates})
        if res.matched_count == 0:
            raise HTTPException(404, "City not found")
        doc = await db.recruit_cities.find_one({"slug": slug}, {"_id": 0})
        return await _stats_for_city(db, doc)

    @r.delete("/admin/recruit/cities/{slug}")
    async def delete_city(slug: str, _admin=Depends(require_admin)):
        res = await db.recruit_cities.delete_one({"slug": slug})
        if res.deleted_count == 0:
            raise HTTPException(404, "City not found")
        return {"ok": True}

    # ── Recruit auto-post config (daily broadcast) ─────────────────
    @r.get("/admin/recruit/autopost")
    async def get_autopost(_admin=Depends(require_admin)):
        cfg = await db.site_config.find_one({"key": "recruit_autopost"}, {"_id": 0}) or {}
        return {"enabled": bool(cfg.get("enabled")), "last_run_at": cfg.get("last_run_at")}

    @r.put("/admin/recruit/autopost")
    async def set_autopost(body: Dict[str, Any], _admin=Depends(require_admin)):
        enabled = bool(body.get("enabled"))
        await db.site_config.update_one(
            {"key": "recruit_autopost"},
            {"$set": {"key": "recruit_autopost", "enabled": enabled}},
            upsert=True,
        )
        return {"enabled": enabled}

    @r.post("/admin/recruit/broadcast-now")
    async def broadcast_now(_admin=Depends(require_admin)):
        """Fire one recruit broadcast right now (bypasses the daily loop)."""
        from server import _social_publish, REACT_APP_BASE_URL  # type: ignore
        return await broadcast_recruit_post(db, _social_publish, base_url=REACT_APP_BASE_URL or "")

    return r


RECRUIT_COPY_TEMPLATES = [
    (
        "{city}: your skills are worth more than you're being paid",
        "Finding good work is hard. But what you already know how to do (driving, moving, fixing, cleaning, errands) is worth real money. On Lumo you keep 90% of every job and get paid the same day. First {first_n} sign-ups earn a ${bonus:.0f} bonus at job #{jobs}.",
    ),
    (
        "Can't find a job in {city}? Put your skills to work",
        "Lumo is signing up {goal} independent pros in {city}. Set your own hours, keep 90% of what customers pay, and cash out the same day. Get paid what your labor is actually worth.",
    ),
    (
        "Earn what your work is actually worth in {city}",
        "No lead fees, no monthly subscription, no 35% cut. Deliveries, moving, handyman, cleaning, pet care and tech help, all in one app. ${bonus:.0f} loyalty bonus at job #{jobs} for the first {first_n} in {city}.",
    ),
]


BROADCAST_BATCH = 25


async def broadcast_recruit_post(db, publish_fn, *, base_url: str = "") -> Dict[str, Any]:
    """Compose and publish one recruitment post per active city to every
    enabled social channel. Rotates copy templates so posts look fresh."""
    import random
    from ai_copy_rotator import rewrite_copy as _rewrite_copy  # noqa: WPS433
    # Rotate through cities (least-recently broadcast first) so a 1,700-city
    # catalog doesn't spam every channel in one run.
    cursor = db.recruit_cities.find({"is_active": True}, {"_id": 0}).sort(
        [("last_broadcast_at", 1), ("population", -1)]).limit(BROADCAST_BATCH)
    fired: List[Dict[str, Any]] = []
    async for city in cursor:
        await db.recruit_cities.update_one({"slug": city["slug"]}, {"$set": {"last_broadcast_at": _now_iso()}})
        tpl_title, tpl_body = random.choice(RECRUIT_COPY_TEMPLATES)
        fmt = {
            "city": city["city"], "state": city["state"],
            "state_full": city.get("state_full") or city["state"],
            "goal": city.get("goal_workers", 300),
            "first_n": city.get("bonus_first_n", 100),
            "jobs": city.get("bonus_job_count", 100),
            "bonus": float(city.get("bonus_amount", 100)),
        }
        base_title = tpl_title.format(**fmt)
        base_body = tpl_body.format(**fmt)
        # Optional AI rewrite so daily broadcasts don't feel repetitive
        rewritten = await _rewrite_copy(
            db,
            source_type="recruit",
            source_id=city["slug"],
            base_title=base_title,
            base_body=base_body,
            context={
                "city": fmt["city"], "state": fmt["state_full"],
                "milestone_jobs": fmt["jobs"], "bonus_usd": fmt["bonus"],
                "first_n_signups": fmt["first_n"], "goal_workers": fmt["goal"],
                "country": city.get("country_name") or "United States",
                "local_city_name": city.get("local_name") or city["city"],
                "neighborhoods": ", ".join((city.get("neighborhoods") or [])[:4]) or "(use well-known districts you're sure exist)",
                "core_message": "finding work is hard; their skills are worth real money; earn what their labor is actually worth",
            },
        )
        from city_blog import jobs_block as _jobs_block, local_jobs as _local_jobs, signup_url as _signup_url
        content = {
            "title": rewritten.get("title") or base_title,
            "body": f"{rewritten.get('body') or base_body}\n\n{_jobs_block(city['city'], await _local_jobs(db, city))}",
            "url": _signup_url(base_url.rstrip('/'), city["slug"], campaign="recruit_broadcast", content=city["slug"]),
            "image_url": f"{base_url.rstrip('/')}/api/img/city/{city['slug']}.jpg" if base_url else city.get("hero_image"),
            "hashtags": ["lumo", "gigwork", city["city"].replace(" ", "")],
            "source_type": "recruit",
            "source_id": city["slug"],
            "ai_tone": rewritten.get("tone", "off"),
        }
        results = await publish_fn(db, content)
        fired.append({"slug": city["slug"], "results": results, "ai_tone": rewritten.get("tone", "off")})
        await db.recruit_broadcasts.insert_one({
            "id": str(uuid.uuid4()),
            "slug": city["slug"],
            "content": content,
            "results": results,
            "created_at": _now_iso(),
        })
    return {"fired": len(fired), "cities": fired}


async def recruit_autopost_loop(db, publish_fn, get_base_url) -> None:
    """Background daily loop."""
    import asyncio
    logger.info("[recruit] auto-post loop started")
    while True:
        try:
            cfg = await db.site_config.find_one({"key": "recruit_autopost"}) or {}
            if cfg.get("enabled"):
                today = datetime.now(timezone.utc).date().isoformat()
                if cfg.get("last_run_date") != today:
                    base = get_base_url() if callable(get_base_url) else (get_base_url or "")
                    await broadcast_recruit_post(db, publish_fn, base_url=base)
                    await db.site_config.update_one(
                        {"key": "recruit_autopost"},
                        {"$set": {"last_run_date": today, "last_run_at": _now_iso()}},
                        upsert=True,
                    )
        except Exception as e:  # noqa: BLE001
            logger.exception(f"[recruit] auto-post loop failure: {e}")
        await asyncio.sleep(60 * 30)

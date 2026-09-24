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
    # Any row missing bonus_job_count → set default
    await db.recruit_cities.update_many(
        {"bonus_job_count": {"$exists": False}},
        {"$set": {"bonus_job_count": 100}},
    )
    return res.modified_count


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
    """
    from recruit_cities_us_seed import US_SEED_CITIES  # local import to avoid boot-time cost when unused
    await _reseed_bonus_amounts(db)
    inserted = 0
    seen_slugs: set = set()

    # Priority cities first (preserves existing rows exactly)
    for c in SEED_CITIES:
        seen_slugs.add(c["slug"])
        exists = await db.recruit_cities.find_one({"slug": c["slug"]})
        if exists:
            continue
        doc = RecruitCity(**c)
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
        doc = RecruitCity(**c)
        await db.recruit_cities.insert_one(doc.model_dump())
        inserted += 1

    if inserted:
        logger.info(f"[recruit] Seeded {inserted} recruit cities (priority + US metros)")
    return inserted


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
    async def list_cities():
        cursor = db.recruit_cities.find({"is_active": True}, {"_id": 0}).sort("city", 1)
        docs = await cursor.to_list(length=500)
        # Attach signup progress
        return {"items": [await _stats_for_city(db, d) for d in docs]}

    @r.get("/recruit/cities/{slug}")
    async def get_city(slug: str):
        doc = await db.recruit_cities.find_one({"slug": slug}, {"_id": 0})
        if not doc or not doc.get("is_active"):
            raise HTTPException(404, "City not found")
        return await _stats_for_city(db, doc)

    @r.post("/recruit/cities/{slug}/click")
    async def record_click(slug: str):
        doc = await db.recruit_cities.find_one({"slug": slug}, {"_id": 0})
        if not doc:
            raise HTTPException(404, "City not found")
        await db.recruit_cities.update_one({"slug": slug}, {"$inc": {"click_count": 1}})
        return {"ok": True}

    # ── Admin ──────────────────────────────────────────────────────
    @r.get("/admin/recruit/stats")
    async def admin_stats(_admin=Depends(require_admin)):
        cursor = db.recruit_cities.find({}, {"_id": 0}).sort("city", 1)
        docs = await cursor.to_list(length=200)
        return {"items": [await _stats_for_city(db, d) for d in docs]}

    @r.post("/admin/recruit/cities")
    async def create_city(payload: RecruitCityIn, _admin=Depends(require_admin)):
        exists = await db.recruit_cities.find_one({"slug": payload.slug})
        if exists:
            raise HTTPException(409, f"City '{payload.slug}' already exists")
        doc = RecruitCity(**payload.model_dump())
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
        "Drive with Lumo in {city} — 90% take-home, same-day pay",
        "Lumo is hiring {goal} providers in {city}, {state_full}. First {first_n} sign-ups earn a ${bonus:.0f} bonus at job #{jobs}. No lead fees, no monthly subscription, cash out today.",
    ),
    (
        "{city}, hiring {goal} gig pros — deliveries, moving, handyman, more",
        "One app, multi-service. Keep 90%, same-day payouts, no lead fees. First {first_n} in {city} unlock ${bonus:.0f} at their 100th job.",
    ),
    (
        "Tired of DoorDash rate cuts? Try Lumo in {city}",
        "Lumo pays 90/10 not 65/35. Deliveries + moving + handyman + cleaning + IT + pet — all in one app. Same-day cash-out. ${bonus:.0f} bonus at job #{jobs}.",
    ),
]


async def broadcast_recruit_post(db, publish_fn, *, base_url: str = "") -> Dict[str, Any]:
    """Compose and publish one recruitment post per active city to every
    enabled social channel. Rotates copy templates so posts look fresh."""
    import random
    from ai_copy_rotator import rewrite_copy as _rewrite_copy  # noqa: WPS433
    cursor = db.recruit_cities.find({"is_active": True}, {"_id": 0})
    fired: List[Dict[str, Any]] = []
    async for city in cursor:
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
            },
        )
        content = {
            "title": rewritten.get("title") or base_title,
            "body": rewritten.get("body") or base_body,
            "url": f"{base_url.rstrip('/')}/join/{city['slug']}",
            "image_url": city.get("hero_image"),
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

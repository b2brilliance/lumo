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
    bonus_amount: float = 500                 # first-N sign-on bonus
    bonus_first_n: int = 100                  # first N signups get it
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
    bonus_amount: float = 500
    bonus_first_n: int = 100
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
    hero_headline: Optional[str] = None
    hero_subhead: Optional[str] = None
    hero_image: Optional[str] = None
    is_active: Optional[bool] = None


# ── Seed the 6 user-requested target cities ────────────────────────
SEED_CITIES: List[Dict[str, Any]] = [
    {
        "slug": "los-angeles-ca", "city": "Los Angeles", "state": "CA", "state_full": "California",
        "hero_headline": "Drive with Lumo in Los Angeles.",
        "hero_subhead": "300 spots. $500 sign-on for the first 100. Keep 90% of every job.",
        "hero_image": "https://images.unsplash.com/photo-1580655653885-65763b2597d0?auto=format&fit=crop&w=1600&q=80",
    },
    {
        "slug": "san-francisco-ca", "city": "San Francisco", "state": "CA", "state_full": "California",
        "hero_headline": "Deliveries, rides, repairs — earn in SF.",
        "hero_subhead": "First 100 sign-ups in SF earn a $500 bonus after their 10th job.",
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
        "hero_subhead": "10 minutes to apply. First 100 sign-ups get a $500 milestone bonus.",
        "hero_image": "https://images.unsplash.com/photo-1466354424719-343280fe118b?auto=format&fit=crop&w=1600&q=80",
    },
    {
        "slug": "chicago-il", "city": "Chicago", "state": "IL", "state_full": "Illinois",
        "hero_headline": "Chicago's next 300 gig pros start here.",
        "hero_subhead": "Same-day payouts, no lead fees, and a $500 sign-on for the first 100.",
        "hero_image": "https://images.unsplash.com/photo-1477414348463-c0eb7f1359b6?auto=format&fit=crop&w=1600&q=80",
    },
    {
        "slug": "portland-or", "city": "Portland", "state": "OR", "state_full": "Oregon",
        "hero_headline": "Portland — keep 90% of everything you earn.",
        "hero_subhead": "Handymen, movers, couriers, cleaners — Lumo pays same day. $500 sign-on.",
        "hero_image": "https://images.unsplash.com/photo-1518131945814-b32066ade60a?auto=format&fit=crop&w=1600&q=80",
    },
]


async def seed_recruit_cities(db) -> int:
    """Idempotent: only insert cities whose slug doesn't already exist."""
    inserted = 0
    for c in SEED_CITIES:
        exists = await db.recruit_cities.find_one({"slug": c["slug"]})
        if exists:
            continue
        doc = RecruitCity(**c)
        await db.recruit_cities.insert_one(doc.model_dump())
        inserted += 1
    if inserted:
        logger.info(f"[recruit] Seeded {inserted} target cities")
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
        docs = await cursor.to_list(length=100)
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

    return r

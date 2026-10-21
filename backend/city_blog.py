"""Daily city recruiting blog.

Top-N cities (by population) get a fresh post daily; every other active
recruit city gets one weekly. Posts are written in the city's local
language with an English version alongside. Generation is triggered by the
platform cron (.emergent/crons.yml → POST /api/cron/city-blogs).
"""
from __future__ import annotations

import asyncio
import hmac
import json
import logging
import os
import random
import uuid
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional

import io
import re
from pathlib import Path

import httpx
from PIL import Image

from attribution import utm_url
from fastapi import APIRouter, Depends, HTTPException, Query, Request
from pydantic import BaseModel, Field

logger = logging.getLogger("lumo.city_blog")

IMG_DIR = Path(__file__).parent / "data" / "img_cache"
BROWSER_UA = "LumoBot/1.0 (https://golumo.app; julius.a.mason@gmail.com)"  # Wikimedia requires a descriptive UA


def _sized(url: str) -> str:
    m = re.match(r"^https://upload\.wikimedia\.org/wikipedia/(\w+)/([0-9a-f])/([0-9a-f]{2})/([^/]+)$", url)
    if not m or m.group(4).lower().endswith((".svg", ".tif", ".tiff")):
        return url
    return f"https://upload.wikimedia.org/wikipedia/{m.group(1)}/thumb/{m.group(2)}/{m.group(3)}/{m.group(4)}/1280px-{m.group(4)}"
DEFAULT_CFG = {"enabled": True, "daily_top_n": 300, "batch_size": 15, "share_social": True,
               "rollout_enabled": True, "rollout_daily_cap": 60}


def signup_url(base_url: str, city_slug: str, *, campaign: str, content: str) -> str:
    """Direct contractor sign-up link (pre-selects provider + credits the city)."""
    return (f"{base_url}/register?role=provider&recruit_city_slug={city_slug}"
            f"&utm_source=__PLATFORM__&utm_medium=social&utm_campaign={campaign}&utm_content={content}")
COPY_VERSION = 3
DELIVERY_JOB = ("Delivery", "food, groceries and packages across town by car, bike or scooter")
EXTRA_JOBS = [
    ("Roadside assistance", "jump-starts, flat-tire changes, lockouts and fuel drop-offs"),
    ("Laundry pickup", "collect, wash, fold and return laundry for busy neighbors"),
    ("Home cleaning", "apartments, homes and move-out cleans"),
    ("Moving help", "loading trucks, carrying furniture and small moves"),
    ("Handyman repairs", "mounting TVs, fixing doors, patching walls and small repairs"),
    ("Errands", "pharmacy runs, returns, waiting in line and shopping trips"),
    ("Pet care", "dog walking, pet sitting and drop-in visits"),
    ("Mobile car detailing", "washing and detailing cars right in the customer's driveway"),
    ("Furniture assembly", "putting together beds, desks, shelves and flat-pack furniture"),
    ("Yard work", "mowing, raking, hedge trimming and garden clean-ups"),
    ("Tech help", "setting up Wi-Fi, TVs, printers and phones"),
    ("Rides", "driving neighbors to work, appointments and the airport"),
]


def pick_jobs(n_extra: int = 2) -> List[tuple]:
    """Delivery + a different random mix of other job types on every post."""
    return [DELIVERY_JOB, *random.sample(EXTRA_JOBS, n_extra)]


CATEGORY_TO_JOB = {
    "cleaning": "Home cleaning", "handyman": "Handyman repairs", "pet_care": "Pet care", "moving": "Moving help",
    "landscaping": "Yard work", "digital_tech": "Tech help", "auto": "Roadside assistance", "towing": "Roadside assistance",
    "roadside": "Roadside assistance", "errand": "Errands", "errands": "Errands", "laundry": "Laundry pickup",
    "assembly": "Furniture assembly", "rides": "Rides", "driver": "Rides", "detailing": "Mobile car detailing",
}
EXTRA_BY_NAME = dict(EXTRA_JOBS)


async def local_jobs(db, city: Dict[str, Any], km: float = 50) -> List[tuple]:
    """Delivery + the 2 job types customers book most near this city (random fill when there's no data)."""
    import math
    lat, lng = city.get("lat"), city.get("lng")
    ranked: List[str] = []
    if lat is not None and lng is not None:
        since = (_now() - timedelta(days=180)).isoformat()
        dlat, dlng = km / 111, km / (111 * max(0.2, math.cos(math.radians(lat))))
        counts: Dict[str, int] = {}
        async for j in db.jobs.find({
            "is_demo": {"$ne": True}, "created_at": {"$gte": since},
            "pickup_location.lat": {"$gte": lat - dlat, "$lte": lat + dlat},
            "pickup_location.lng": {"$gte": lng - dlng, "$lte": lng + dlng},
        }, {"_id": 0, "category": 1}):
            name = CATEGORY_TO_JOB.get((j.get("category") or "").lower())
            if name:
                counts[name] = counts.get(name, 0) + 1
        ranked = [n for n, _ in sorted(counts.items(), key=lambda kv: -kv[1])][:2]
    rest = [j for j in EXTRA_JOBS if j[0] not in ranked]
    return [DELIVERY_JOB, *[(n, EXTRA_BY_NAME[n]) for n in ranked], *random.sample(rest, 2 - len(ranked))]


def jobs_block(city: str, jobs: List[tuple]) -> str:
    lines = "\n".join(f"• {name}: {desc}" for name, desc in jobs)
    return f"Jobs you can start picking up in {city}:\n{lines}"
CORE_MESSAGE = (
    "Core message (every post): finding good work is hard right now, and too many people are underpaid for what "
    "they can do. The skills readers already have (driving, lifting, fixing things, cleaning, errands, caring for "
    "pets, tech help) are worth real money. On Lumo they set their own hours, keep 90% of every job, get paid the "
    "same day, and finally earn what their labor is actually worth. Be empathetic and respectful, never preachy; "
    "don't attack other companies by name."
)
ANGLES = [
    "it's hard to find a job, but your existing skills can start earning now",
    "you're worth more than you're being paid: keep 90% of what customers pay",
    "turn what you already know how to do into extra income on your own schedule",
    "get paid what your work is actually worth, the same day you do it",
    "sign up now so you're first in line when local customers post jobs, plus the loyalty bonus",
]
LANG_NAMES = {
    "es": "Spanish", "fr": "French", "fr-CA": "Canadian French", "de": "German", "pt-BR": "Brazilian Portuguese",
    "pt": "European Portuguese", "it": "Italian", "nl": "Dutch", "pl": "Polish", "ru": "Russian", "uk": "Ukrainian",
    "tr": "Turkish", "sv": "Swedish", "ja": "Japanese", "ko": "Korean", "zh": "Simplified Chinese",
    "zh-TW": "Traditional Chinese", "hi": "Hindi", "bn": "Bengali", "ur": "Urdu", "ar": "Arabic", "he": "Hebrew",
    "vi": "Vietnamese", "th": "Thai", "id": "Indonesian", "ms": "Malay", "tl": "Filipino", "sw": "Swahili",
    "ha": "Hausa", "yo": "Yoruba", "am": "Amharic", "el": "Greek", "fa": "Persian",
}


def _now() -> datetime:
    return datetime.now(timezone.utc)


async def get_cfg(db) -> Dict[str, Any]:
    doc = await db.city_blog_config.find_one({"id": "config"}, {"_id": 0, "id": 0}) or {}
    return {**DEFAULT_CFG, **doc}


async def _due_cities(db, cfg: Dict[str, Any], limit: int) -> List[Dict[str, Any]]:
    fields = {"_id": 0, "slug": 1, "city": 1, "country": 1, "country_name": 1, "state_full": 1, "lang": 1,
              "currency": 1, "bonus_amount": 1, "bonus_first_n": 1, "bonus_job_count": 1, "goal_workers": 1,
              "hero_image": 1, "population": 1, "last_blog_at": 1, "neighborhoods": 1, "local_name": 1}
    top = await db.recruit_cities.find({"is_active": True}, {"_id": 0, "slug": 1}).sort("population", -1) \
        .limit(int(cfg["daily_top_n"])).to_list(None)
    top_slugs = [t["slug"] for t in top]
    day_cut = (_now() - timedelta(hours=20)).isoformat()
    week_cut = (_now() - timedelta(days=6, hours=12)).isoformat()
    stale = lambda cut: {"$or": [{"last_blog_at": {"$exists": False}}, {"last_blog_at": {"$lt": cut}}]}  # noqa: E731
    out = await db.recruit_cities.find({"slug": {"$in": top_slugs}, **stale(day_cut)}, fields) \
        .sort("population", -1).limit(limit).to_list(None)
    if len(out) < limit:
        out += await db.recruit_cities.find(
            {"is_active": True, "slug": {"$nin": top_slugs}, **stale(week_cut)}, fields,
        ).sort([("last_blog_at", 1), ("population", -1)]).limit(limit - len(out)).to_list(None)
    return out


async def _signups(db, slug: str) -> int:
    return await db.users.count_documents({"role": "provider", "recruit_city_slug": slug})


async def _nearby(db, city: Dict[str, Any], km: float = 150) -> List[str]:
    import math
    lat, lng = city.get("lat"), city.get("lng")
    if lat is None or lng is None:
        return []
    rows = await db.recruit_cities.find(
        {"country": city.get("country") or "US", "slug": {"$ne": city["slug"]}, "lat": {"$ne": None}},
        {"_id": 0, "city": 1, "lat": 1, "lng": 1}).to_list(None)

    def dist(r):
        p1, p2 = math.radians(lat), math.radians(r["lat"])
        a = math.sin((p2 - p1) / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(math.radians(r["lng"] - lng) / 2) ** 2
        return 6371 * 2 * math.asin(math.sqrt(a))
    return [r["city"] for r in sorted(rows, key=dist) if dist(r) <= km][:4]


def _bonus_local(city: Dict[str, Any], fx: Dict[str, float]) -> str:
    usd = float(city.get("bonus_amount") or 100)
    cur = city.get("currency") or "USD"
    rate = fx.get(cur)
    if cur == "USD" or not rate:
        return f"${usd:,.0f} USD"
    return f"{usd * rate:,.0f} {cur} (about ${usd:,.0f} USD)"


def _page_lang(city: Dict[str, Any]) -> str:
    from recruit_cities import _page_lang as pl
    return pl(city.get("lang"), city.get("country"))


async def _write(city: Dict[str, Any], lang: str, signups: int, llm_key: str, fx: Dict[str, float],
                 nearby: List[str], jobs: List[tuple]) -> Dict[str, Any]:
    from emergentintegrations.llm.chat import LlmChat, UserMessage
    first_n = int(city.get("bonus_first_n") or 100)
    facts = {
        "city": city["city"], "country": city.get("country_name") or "United States",
        "bonus_local": _bonus_local(city, fx),
        "bonus_after_jobs": int(city.get("bonus_job_count") or 100), "bonus_spots_left": max(0, first_n - signups),
        "workers_wanted": int(city.get("goal_workers") or 300), "signed_up_so_far": signups,
        "date": _now().strftime("%B %d, %Y"), "angle": random.choice(ANGLES),
        "job_types": [f"{n}: {d}" for n, d in jobs],
        "region": city.get("state_full") if (city.get("country") or "US") == "US" else city.get("country_name"),
        "local_city_name": city.get("local_name") or city["city"],
        "neighborhoods": (city.get("neighborhoods") or [])[:5],
        "nearby_cities": nearby,
    }
    local = LANG_NAMES.get(lang)
    want = (f'Return JSON: {{"local": {{"title","excerpt","body_md"}}, "en": {{"title","excerpt","body_md"}}}} '
            f'where "local" is written natively in {local} and "en" is the same post in English.') if local else \
        'Return JSON: {"en": {"title","excerpt","body_md"}} in English.'
    sys_msg = (
        "You write short recruiting blog posts for Lumo, a marketplace that pays independent contractors to do "
        "local jobs (deliveries, rides, moving, errands, handyman). Goal: get people in the given city to sign up "
        "now as contractors so they're ready when jobs open. Focus on job openings and the loyalty bonus. "
        + CORE_MESSAGE + " Today's angle is in the facts. "
        "Give the post real substance: include a section describing each of the 3 job_types (what the work is, "
        "who it suits, that they choose which jobs to accept); delivery is always one of them. "
        "Personalize it to the area: speak directly to people who live there, use the city's name (and local name), "
        "you MUST name 2-3 real neighborhoods or districts of the city (use the given list, or well-known ones you "
        "are certain exist), mention nearby_cities only if given, and local everyday realities (commutes, seasons, the kind of "
        "help neighbors need) in general terms. It must read as written for this city, not a template. "
        "Never claim a specific number of open jobs; workers_wanted is how many contractors Lumo is recruiting, and jobs open as local customers post them. "
        "250-400 words, markdown with 2-3 ## headings and one bullet list, warm and direct, no invented statistics "
        "beyond the facts given. Use bonus_local exactly as the bonus amount. Do not say jobs are opening this week, "
        "that spots are going fast, or make any urgency claim not in the facts. "
        "End with a call to action to apply on Lumo. Output strict JSON only. " + want
    )
    chat = LlmChat(api_key=llm_key, session_id=f"cityblog-{uuid.uuid4()}", system_message=sys_msg) \
        .with_model("anthropic", "claude-sonnet-4-5-20250929")
    raw = await chat.send_message(UserMessage(text=json.dumps(facts, ensure_ascii=False)))
    text = raw if isinstance(raw, str) else str(raw)
    data = json.loads(text[text.find("{"):text.rfind("}") + 1])
    en = data.get("en") or {}
    loc = data.get("local") or en
    return {"local": loc, "en": en, "facts": facts}


async def publish_for_city(db, city: Dict[str, Any], llm_key: str, share: bool,
                           fx: Dict[str, float], base_url: str) -> Optional[Dict[str, Any]]:
    day = _now().strftime("%Y-%m-%d")
    slug = f"{city['slug']}-{day}"
    if await db.city_blog_posts.find_one({"slug": slug}, {"_id": 1}):
        await db.recruit_cities.update_one({"slug": city["slug"]}, {"$set": {"last_blog_at": _now().isoformat()}})
        return None
    lang = _page_lang(city)
    signups = await _signups(db, city["slug"])
    nearby = await _nearby(db, city)
    out = await _write(city, lang, signups, llm_key, fx, nearby, await local_jobs(db, city))
    post = {
        "id": str(uuid.uuid4()), "slug": slug, "city_slug": city["slug"], "city": city["city"],
        "country": city.get("country") or "US", "country_name": city.get("country_name"), "lang": lang,
        "title": (out["local"].get("title") or "")[:180], "excerpt": (out["local"].get("excerpt") or "")[:400],
        "body_md": out["local"].get("body_md") or "",
        "title_en": (out["en"].get("title") or "")[:180], "excerpt_en": (out["en"].get("excerpt") or "")[:400],
        "body_md_en": out["en"].get("body_md") or "",
        "hero_image": city.get("hero_image"), "view_count": 0, "created_at": _now().isoformat(),
        "copy_version": COPY_VERSION,
    }
    res = await db.city_blog_posts.update_one({"slug": slug}, {"$setOnInsert": post}, upsert=True)
    await db.recruit_cities.update_one({"slug": city["slug"]}, {"$set": {"last_blog_at": post["created_at"]}})
    if res.upserted_id is None:
        return None
    post.pop("_id", None)
    if share:
        try:
            # Facebook is paced separately by the FB city rollout (daily cap) to avoid spam flags.
            from social_publisher import PLATFORMS
            await share_post(db, post, base_url, [p for p in PLATFORMS if p != "facebook"])
        except Exception as e:  # noqa: BLE001
            logger.warning(f"[city_blog] share failed for {slug}: {e}")
    return post


async def share_post(db, post: Dict[str, Any], base_url: str, platforms: Optional[List[str]] = None) -> Dict[str, Any]:
    from social_publisher import publish_to_all
    return await publish_to_all(db, {
        "title": post["title"], "body": post["excerpt"],
        "url": signup_url(base_url, post["city_slug"], campaign="city_blog", content=post["slug"]),
        "image_url": f"{base_url}/api/img/city/{post['city_slug']}.jpg", "hashtags": ["lumo", "hiring", post["city"].replace(" ", "")],
        "source_type": "city_blog", "source_id": post["id"],
    }, platforms=platforms)


async def share_city_template(db, city: Dict[str, Any], base_url: str) -> Dict[str, Any]:
    from social_publisher import publish_to_all
    from recruit_cities import RECRUIT_COPY_TEMPLATES
    tpl_title, tpl_body = random.choice(RECRUIT_COPY_TEMPLATES)
    fmt = {"city": city["city"], "goal": city.get("goal_workers") or 300, "first_n": city.get("bonus_first_n") or 100,
           "jobs": city.get("bonus_job_count") or 100, "bonus": float(city.get("bonus_amount") or 100)}
    body = (f"{tpl_body.format(**fmt)}\n\n{jobs_block(city['city'], await local_jobs(db, city))}\n\n"
            "Pick only the jobs you want, work when it suits you, and get paid the same day.\n"
            "Sign up as a Lumo contractor here:")
    res = (await publish_to_all(db, {
        "title": tpl_title.format(**fmt), "body": body,
        "url": signup_url(base_url, city["slug"], campaign="recruit_page", content=city["slug"]),
        "image_url": f"{base_url}/api/img/city/{city['slug']}.jpg", "hashtags": ["lumo", "hiring", city["city"].replace(" ", "")],
        "source_type": "recruit_page", "source_id": city["slug"], "require_photo": True,
    }, platforms=["facebook"])).get("facebook") or {}
    if res.get("ok"):
        await db.recruit_cities.update_one({"slug": city["slug"]}, {"$set": {"fb_page_shared_at": _now().isoformat()}})
    elif "OAuthException" not in str(res.get("error")):
        # Only count city-specific failures; a broken Page token shouldn't burn every city's retries.
        await db.recruit_cities.update_one({"slug": city["slug"]}, {
            "$inc": {"fb_rollout_attempts": 1}, "$set": {"fb_rollout_error": str(res.get("error"))[:300]}})
    return res


AVG_JOB_USD = 25.0
RECRUITER_HOOKS = [
    "Know people in {city} who need work? Get paid for every job they do.",
    "Build a crew in {city} and earn on every job they complete.",
    "Turn your network in {city} into income that grows every day.",
    "Become a Lumo recruiter in {city}. No selling, no fees, just your link.",
]


def recruiter_math(cfg: Dict[str, Any], agents: int, jobs_per_day: int, days: int) -> Dict[str, float]:
    """Daily recruiter commission after `days`, from `agents` each doing `jobs_per_day` jobs at AVG_JOB_USD."""
    from referrals import rate_for
    daily_jobs = agents * jobs_per_day
    rate = rate_for(daily_jobs * days, cfg)
    return {"daily_jobs": daily_jobs, "rate_pct": rate, "per_day": daily_jobs * AVG_JOB_USD * rate / 100}


def recruiter_copy(city: str, cfg: Dict[str, Any]) -> Dict[str, str]:
    from referrals import PROVIDER_MILESTONE_BONUS as BONUS, PROVIDER_MILESTONE_JOBS as GOAL
    step, base, cap = cfg["step_jobs"], cfg["base_pct"], cfg["max_pct"]
    s10, s10m = recruiter_math(cfg, 10, 10, 0), recruiter_math(cfg, 10, 10, 365)
    s100, s100m, s100x = recruiter_math(cfg, 100, 10, 0), recruiter_math(cfg, 100, 10, 30), recruiter_math(cfg, 100, 10, 365)
    days_to_cap = int(((cap - base) / cfg["step_pct"]) * step / s100["daily_jobs"]) + 1
    body = (
        "Lumo pays recruiters a share of every job the people they bring in complete, for as long as they keep working.\n\n"
        "How the pay scale works:\n"
        f"• You start at {base:.2f}% of every job your recruits complete\n"
        f"• Your rate goes up +{cfg['step_pct']:.2f}% for every {step:,} jobs your recruits finish, up to {cap:.2f}%\n"
        f"• Plus a ${BONUS:.0f} bonus each time a recruit completes their {GOAL}th job\n"
        "• Earnings land in your Lumo wallet automatically\n\n"
        f"What that can look like (average job ${AVG_JOB_USD:.0f}, each agent doing 10 jobs a day):\n"
        f"• Recruit 10 agents → {s10['daily_jobs']:,} jobs a day → about ${s10['per_day']:.2f}/day to start, "
        f"rising to about ${s10m['per_day']:.2f}/day after a year ({s10m['rate_pct']:.2f}%), plus ${10 * BONUS:,.0f} in bonuses\n"
        f"• Recruit 100 agents → {s100['daily_jobs']:,} jobs a day → about ${s100['per_day']:.2f}/day on day one, "
        f"about ${s100m['per_day']:.2f}/day after 30 days, and about ${s100x['per_day']:.2f}/day "
        f"(≈${s100x['per_day'] * 365:,.0f}/year) once you hit the top rate in about {days_to_cap} days, "
        f"plus ${100 * BONUS:,.0f} in bonuses\n\n"
        "Examples only, not a guarantee; real earnings depend on how many jobs your recruits complete.\n"
        f"Free to join. Get your recruit link and start building your {city} crew here:"
    )
    return {"title": random.choice(RECRUITER_HOOKS).format(city=city), "body": body}


async def share_recruiter_post(db, city: Dict[str, Any], base_url: str) -> Dict[str, Any]:
    from social_publisher import publish_to_all
    from referrals import get_program
    copy = recruiter_copy(city["city"], await get_program(db))
    res = (await publish_to_all(db, {
        **copy,
        "url": (f"{base_url}/recruiter?utm_source=__PLATFORM__&utm_medium=social"
                f"&utm_campaign=recruiter_post&utm_content={city['slug']}"),
        "image_url": f"{base_url}/api/img/city/{city['slug']}.jpg",
        "hashtags": ["lumo", "recruiters", "earnmore", city["city"].replace(" ", "")],
        "source_type": "recruiter_post", "source_id": city["slug"], "require_photo": True,
    }, platforms=["facebook"])).get("facebook") or {}
    key = "fb_recruiter_shared_at" if res.get("ok") else None
    if key:
        await db.recruit_cities.update_one({"slug": city["slug"]}, {"$set": {key: _now().isoformat()}})
    elif "OAuthException" not in str(res.get("error")):
        await db.recruit_cities.update_one({"slug": city["slug"]}, {"$inc": {"fb_recruiter_attempts": 1}})
    return res


async def _fb_connected(db) -> bool:
    fb = await db.social_channels.find_one({"platform": "facebook"}, {"_id": 0}) or {}
    return bool(fb.get("enabled") and fb.get("access_token") and fb.get("page_id"))


async def rollout_status(db) -> Dict[str, Any]:
    cfg = await get_cfg(db)
    day0 = _now().replace(hour=0, minute=0, second=0, microsecond=0).isoformat()
    active = {"is_active": True}
    blog_shared = await db.city_blog_posts.distinct("city_slug", {"fb_shared_at": {"$exists": True}})
    return {
        "enabled": cfg["rollout_enabled"], "daily_cap": cfg["rollout_daily_cap"],
        "connected": await _fb_connected(db),
        "total": await db.recruit_cities.count_documents(active),
        "shared": await db.recruit_cities.count_documents({**active, "$or": [
            {"fb_page_shared_at": {"$exists": True}}, {"slug": {"$in": blog_shared}}]}),
        "today": await db.recruit_cities.count_documents({"fb_page_shared_at": {"$gte": day0}}),
        "recruiter_shared": await db.recruit_cities.count_documents({"fb_recruiter_shared_at": {"$exists": True}}),
        "recruiter_today": await db.recruit_cities.count_documents({"fb_recruiter_shared_at": {"$gte": day0}}),
        "failed": await db.recruit_cities.count_documents({"fb_rollout_attempts": {"$gte": 3}}),
    }


async def run_rollout_step(db, base_url: str) -> Optional[Dict[str, Any]]:
    """Post the next un-posted city (largest first), respecting the daily cap."""
    st = await rollout_status(db)
    if not (st["enabled"] and st["connected"]):
        return None
    # One recruiter post for every agent post: pair each posted city with its recruiter post first.
    day0 = _now().replace(hour=0, minute=0, second=0, microsecond=0).isoformat()
    rec_today = await db.recruit_cities.count_documents({"fb_recruiter_shared_at": {"$gte": day0}})
    if rec_today < st["daily_cap"]:
        rc = await db.recruit_cities.find_one(
            {"fb_page_shared_at": {"$exists": True}, "fb_recruiter_shared_at": {"$exists": False},
             "$or": [{"fb_recruiter_attempts": {"$exists": False}}, {"fb_recruiter_attempts": {"$lt": 3}}]},
            {"_id": 0}, sort=[("fb_page_shared_at", 1)])
        if rc:
            res = await share_recruiter_post(db, rc, base_url)
            logger.info(f"[fb_rollout] recruiter {rc['slug']} ok={res.get('ok')} {str(res.get('error') or '')[:120]}")
            return {"city": rc["slug"], "ok": bool(res.get("ok")), "kind": "recruiter"}
    if st["today"] >= st["daily_cap"]:
        return None
    blog_shared = await db.city_blog_posts.distinct("city_slug", {"fb_shared_at": {"$exists": True}})
    city = await db.recruit_cities.find_one(
        {"is_active": True, "fb_page_shared_at": {"$exists": False}, "slug": {"$nin": blog_shared},
         "hero_image": {"$not": {"$regex": "photo-1477959858617"}},
         "$or": [{"fb_rollout_attempts": {"$exists": False}}, {"fb_rollout_attempts": {"$lt": 3}}]},
        {"_id": 0}, sort=[("population", -1)])
    if not city:
        return None
    res = await share_city_template(db, city, base_url)
    logger.info(f"[fb_rollout] {city['slug']} ok={res.get('ok')} {str(res.get('error') or '')[:120]}")
    return {"city": city["slug"], "ok": bool(res.get("ok"))}


async def run_batch(db, llm_key: str, get_fx, base_url: str, limit: Optional[int] = None) -> int:
    cfg = await get_cfg(db)
    fx = await get_fx()
    lock = await db.city_blog_config.find_one_and_update(
        {"id": "lock", "$or": [{"until": {"$exists": False}}, {"until": {"$lt": _now().isoformat()}}]},
        {"$set": {"until": (_now() + timedelta(minutes=25)).isoformat()}}, upsert=False,
    )
    if lock is None:
        if await db.city_blog_config.count_documents({"id": "lock"}):
            logger.info("[city_blog] previous batch still running — skip")
            return 0
        await db.city_blog_config.insert_one({"id": "lock", "until": (_now() + timedelta(minutes=25)).isoformat()})
    try:
        cities = await _due_cities(db, cfg, int(limit or cfg["batch_size"]))
        sem = asyncio.Semaphore(5)

        async def one(c):
            async with sem:
                try:
                    return await publish_for_city(db, c, llm_key, bool(cfg["share_social"]), fx, base_url)
                except Exception as e:  # noqa: BLE001
                    logger.warning(f"[city_blog] {c['slug']} failed: {e}")
                    return None
        done = [p for p in await asyncio.gather(*(one(c) for c in cities)) if p]
        logger.info(f"[city_blog] published {len(done)}/{len(cities)} posts")
        return len(done)
    finally:
        await db.city_blog_config.update_one({"id": "lock"}, {"$set": {"until": _now().isoformat()}})


class CfgIn(BaseModel):
    enabled: Optional[bool] = None
    daily_top_n: Optional[int] = Field(default=None, ge=0, le=2000)
    batch_size: Optional[int] = Field(default=None, ge=1, le=50)
    share_social: Optional[bool] = None


PUBLIC_FIELDS = {"_id": 0, "body_md": 0, "body_md_en": 0}


_TASKS: set = set()


def create_router(*, db, require_admin, llm_key: Optional[str], get_fx, base_url: str) -> APIRouter:
    r = APIRouter(prefix="/api", tags=["city-blog"])

    def spawn(limit: Optional[int] = None):
        t = asyncio.create_task(run_batch(db, llm_key, get_fx, base_url, limit=limit))
        _TASKS.add(t)
        t.add_done_callback(_TASKS.discard)

    @r.post("/cron/city-blogs")
    async def cron_city_blogs(request: Request):
        # Cron endpoints must ack 2xx immediately; enqueue/background the actual work.
        secret = os.environ.get("WEBHOOK_CRON_SECRET", "")
        auth = request.headers.get("authorization", "")
        token = auth[7:] if auth.lower().startswith("bearer ") else ""
        if not secret or not token or not hmac.compare_digest(token, secret):
            raise HTTPException(401, "Unauthorized")
        try:
            body = await request.json()
        except Exception:
            body = {}
        if not isinstance(body, dict):
            raise HTTPException(400, "Invalid body")
        run_id = request.headers.get("x-webhook-id") or body.get("run_id") or str(uuid.uuid4())
        try:
            await db.cron_runs.insert_one({"_id": f"city-blogs:{run_id}", "at": _now().isoformat()})
        except Exception:
            return {"ok": True, "duplicate": True}
        cfg = await get_cfg(db)
        queued = bool(cfg["enabled"] and llm_key)
        if queued:
            spawn()
        return {"ok": True, "queued": queued}

    @r.post("/cron/fb-city-rollout")
    async def cron_fb_rollout(request: Request):
        # Cron endpoints must ack 2xx immediately; enqueue/background the actual work.
        secret = os.environ.get("WEBHOOK_CRON_SECRET", "")
        auth = request.headers.get("authorization", "")
        token = auth[7:] if auth.lower().startswith("bearer ") else ""
        if not secret or not token or not hmac.compare_digest(token, secret):
            raise HTTPException(401, "Unauthorized")
        try:
            body = await request.json()
        except Exception:
            body = {}
        run_id = request.headers.get("x-webhook-id") or (body.get("run_id") if isinstance(body, dict) else None) or str(uuid.uuid4())
        try:
            await db.cron_runs.insert_one({"_id": f"fb-rollout:{run_id}", "at": _now().isoformat()})
        except Exception:
            return {"ok": True, "duplicate": True}
        import daily_recruit
        t = asyncio.create_task(daily_recruit.run_step(db, base_url, get_fx))
        _TASKS.add(t)
        t.add_done_callback(_TASKS.discard)
        return {"ok": True, "queued": True}

    @r.get("/admin/daily-recruit/status")
    async def daily_recruit_status(_a: dict = Depends(require_admin)):
        import daily_recruit
        return await daily_recruit.status(db)

    @r.get("/admin/daily-recruit/preview")
    async def daily_recruit_preview(slug: str, seq: int = 0, _a: dict = Depends(require_admin)):
        import daily_recruit
        city = await db.recruit_cities.find_one({"slug": slug}, {"_id": 0})
        if not city:
            raise HTTPException(404, "City not found")
        city, local_line = daily_recruit.intl_extras(city)
        return await daily_recruit.build_post(db, city, seq, await get_fx(), base_url, local_line)

    @r.get("/admin/fb-rollout")
    async def admin_rollout(_a: dict = Depends(require_admin)):
        return await rollout_status(db)

    @r.put("/admin/fb-rollout")
    async def admin_rollout_set(body: Dict[str, Any], _a: dict = Depends(require_admin)):
        upd = {}
        if "enabled" in body:
            upd["rollout_enabled"] = bool(body["enabled"])
        if "daily_cap" in body:
            cap = int(body["daily_cap"])
            if not 1 <= cap <= 200:
                raise HTTPException(400, "daily_cap must be 1-200")
            upd["rollout_daily_cap"] = cap
        await db.city_blog_config.update_one({"id": "config"}, {"$set": upd}, upsert=True)
        return await rollout_status(db)

    async def _photo_job():
        from city_photos import refresh_photos, redo_facebook_posts
        job = {"id": "photo_job"}
        try:
            res = await refresh_photos(db)
            await db.city_blog_config.update_one(job, {"$set": {"refresh": {**res, "missing": res["missing"][:200]},
                                                                "state": "reposting"}})
            redo = await redo_facebook_posts(db)
            await db.city_blog_config.update_one(job, {"$set": {"redo": redo}})
            from city_photos import clean_page_duplicates
            page = await clean_page_duplicates(db)
            await db.city_blog_config.update_one(job, {"$set": {"page": page, "state": "done", "finished_at": _now().isoformat()}})
        except Exception as e:  # noqa: BLE001
            logger.exception("[photos] job failed")
            await db.city_blog_config.update_one(job, {"$set": {"state": "error", "error": str(e)[:300]}})

    @r.on_event("startup")
    async def _auto_photo_fix():
        # One-time on each environment: replace shared/fallback photos and redo affected FB posts.
        if not await db.city_blog_config.find_one({"id": "photo_job", "page": {"$exists": True}}, {"_id": 1}):
            await db.city_blog_config.update_one({"id": "photo_job"}, {"$set": {"state": "running", "started_at": _now().isoformat()}}, upsert=True)
            async def later():
                await asyncio.sleep(90)
                await _photo_job()
            t = asyncio.create_task(later())
            _TASKS.add(t)
            t.add_done_callback(_TASKS.discard)

    @r.post("/admin/city-photos/fix")
    async def fix_photos(_a: dict = Depends(require_admin)):
        cur = await db.city_blog_config.find_one({"id": "photo_job"}, {"_id": 0}) or {}
        if cur.get("state") in ("running", "reposting") and cur.get("started_at", "") > (_now() - timedelta(minutes=30)).isoformat():
            raise HTTPException(409, "Photo fix already running")
        await db.city_blog_config.update_one({"id": "photo_job"}, {"$set": {
            "state": "running", "started_at": _now().isoformat(), "refresh": None, "redo": None, "error": None}}, upsert=True)
        t = asyncio.create_task(_photo_job())
        _TASKS.add(t)
        t.add_done_callback(_TASKS.discard)
        return {"ok": True}

    @r.post("/admin/fb-page/refresh-old")
    async def refresh_old(dry_run: bool = Query(True), _a: dict = Depends(require_admin)):
        from city_photos import refresh_old_format_posts
        try:
            res = await refresh_old_format_posts(db, dry_run=dry_run)
        except RuntimeError as e:
            raise HTTPException(502, f"Facebook: {e}")
        if not dry_run and "skipped" not in res:
            await db.city_blog_config.update_one({"id": "refresh_v3"}, {"$set": {**res, "at": _now().isoformat()}}, upsert=True)
        return res

    @r.on_event("startup")
    async def _auto_refresh_old():
        # One-time: replace pre-job-types posts. Waits for the photo job so the two don't overlap.
        if await db.city_blog_config.find_one({"id": "refresh_v3", "deleted": {"$exists": True}}, {"_id": 1}):
            return
        async def later():
            from city_photos import refresh_old_format_posts
            await asyncio.sleep(600)
            try:
                res = await refresh_old_format_posts(db)
                if "skipped" not in res:
                    await db.city_blog_config.update_one({"id": "refresh_v3"}, {"$set": {**res, "at": _now().isoformat()}}, upsert=True)
            except Exception as e:  # noqa: BLE001
                logger.warning(f"[photos] auto refresh-old failed: {e}")
        t = asyncio.create_task(later())
        _TASKS.add(t)
        t.add_done_callback(_TASKS.discard)

    @r.post("/admin/fb-page/clean-duplicates")
    async def clean_dupes(dry_run: bool = Query(True), _a: dict = Depends(require_admin)):
        from city_photos import clean_page_duplicates
        try:
            return await clean_page_duplicates(db, dry_run=dry_run)
        except RuntimeError as e:
            raise HTTPException(502, f"Facebook: {e}")

    @r.get("/admin/city-photos/fix")
    async def fix_photos_status(_a: dict = Depends(require_admin)):
        from city_photos import bad_cities
        doc = await db.city_blog_config.find_one({"id": "photo_job"}, {"_id": 0}) or {"state": "idle"}
        doc["bad_now"] = len(await bad_cities(db))
        doc["refresh_v3"] = await db.city_blog_config.find_one({"id": "refresh_v3"}, {"_id": 0, "id": 0})
        return doc

    @r.get("/img/city/{slug}.jpg")
    async def city_image(slug: str):
        # Self-hosted, resized city photo so Facebook's crawler never hits Wikimedia's bot block.
        from fastapi.responses import Response
        path = IMG_DIR / f"{re.sub(r'[^a-z0-9-]', '', slug)}.jpg"
        if not path.exists():
            city = await db.recruit_cities.find_one({"slug": slug}, {"_id": 0, "hero_image": 1})
            if not city or not city.get("hero_image"):
                raise HTTPException(404, "No image")
            async with httpx.AsyncClient(timeout=30, follow_redirects=True, headers={"User-Agent": BROWSER_UA}) as c:
                res = await c.get(_sized(city["hero_image"]))
                if res.status_code != 200:
                    res = await c.get(city["hero_image"])
            if res.status_code != 200:
                raise HTTPException(502, "Image fetch failed")
            img = Image.open(io.BytesIO(res.content)).convert("RGB")
            img.thumbnail((1600, 1600))
            IMG_DIR.mkdir(parents=True, exist_ok=True)
            img.save(path, "JPEG", quality=85)
        return Response(path.read_bytes(), media_type="image/jpeg", headers={"Cache-Control": "public, max-age=604800"})

    @r.get("/city-blog/latest")
    async def latest(limit: int = Query(24, ge=1, le=100)):
        return await db.city_blog_posts.find({}, PUBLIC_FIELDS).sort("created_at", -1).limit(limit).to_list(None)

    @r.get("/city-blog/city/{city_slug}")
    async def by_city(city_slug: str, limit: int = Query(20, ge=1, le=100)):
        return await db.city_blog_posts.find({"city_slug": city_slug}, PUBLIC_FIELDS) \
            .sort("created_at", -1).limit(limit).to_list(None)

    @r.get("/city-blog/post/{slug}")
    async def one_post(slug: str):
        doc = await db.city_blog_posts.find_one({"slug": slug}, {"_id": 0})
        if not doc:
            raise HTTPException(404, "Post not found")
        await db.city_blog_posts.update_one({"slug": slug}, {"$inc": {"view_count": 1}})
        return doc

    @r.get("/admin/city-blog/config")
    async def admin_cfg(_a: dict = Depends(require_admin)):
        cfg = await get_cfg(db)
        cfg["total_posts"] = await db.city_blog_posts.count_documents({})
        cfg["posts_24h"] = await db.city_blog_posts.count_documents(
            {"created_at": {"$gte": (_now() - timedelta(hours=24)).isoformat()}})
        return cfg

    @r.put("/admin/city-blog/config")
    async def admin_set_cfg(body: CfgIn, _a: dict = Depends(require_admin)):
        await db.city_blog_config.update_one({"id": "config"}, {"$set": body.model_dump(exclude_none=True)}, upsert=True)
        return await get_cfg(db)

    @r.post("/admin/city-blog/run")
    async def admin_run(count: int = Query(3, ge=1, le=20), _a: dict = Depends(require_admin)):
        if not llm_key:
            raise HTTPException(503, "LLM key missing")
        spawn(count)
        return {"ok": True, "queued": count}

    async def _fb_job(count: int):
        job = {"id": "fb_publish_job"}
        try:
            q = {"copy_version": COPY_VERSION, "fb_shared_at": {"$exists": False}}
            posts = await db.city_blog_posts.find(q, {"_id": 0}).sort("created_at", 1).limit(count).to_list(None)
            if len(posts) < count and llm_key:
                fx = await get_fx()
                sem = asyncio.Semaphore(5)

                async def write(c):
                    async with sem:
                        try:
                            return await publish_for_city(db, c, llm_key, False, fx, base_url)
                        except Exception as e:  # noqa: BLE001
                            logger.warning(f"[city_blog] fb pre-write {c['slug']} failed: {e}")
                cities = await _due_cities(db, await get_cfg(db), count - len(posts))
                posts += [p for p in await asyncio.gather(*(write(c) for c in cities)) if p]
            out = []
            if len(posts) < count:
                # AI unavailable (e.g. budget exhausted) → template posts linking to city hiring pages.
                for c in await _due_cities(db, await get_cfg(db), count - len(posts) + 5):
                    if len(posts) >= count:
                        break
                    if not await db.recruit_cities.find_one({"slug": c["slug"], "fb_page_shared_at": {"$exists": False}}, {"_id": 1}):
                        continue
                    res = await share_city_template(db, c, base_url)
                    out.append({"slug": c["slug"], "city_slug": c["slug"], "city": c["city"],
                                "ok": bool(res.get("ok")), "error": res.get("error"), "kind": "template"})
                    posts.append({"_template": True})
                    await db.city_blog_config.update_one(job, {"$set": {"results": out}})
                posts = [p for p in posts if not p.get("_template")]
            for p in posts[:count - len(out)]:
                res = (await share_post(db, p, base_url, ["facebook"])).get("facebook") or {}
                if res.get("ok"):
                    await db.city_blog_posts.update_one({"id": p["id"]}, {"$set": {"fb_shared_at": _now().isoformat()}})
                out.append({"slug": p["slug"], "city_slug": p["city_slug"], "city": p["city"],
                            "ok": bool(res.get("ok")), "error": res.get("error")})
                await db.city_blog_config.update_one(job, {"$set": {"results": out}})
            await db.city_blog_config.update_one(job, {"$set": {
                "state": "done", "published": sum(1 for o in out if o["ok"]), "finished_at": _now().isoformat()}})
        except Exception as e:  # noqa: BLE001
            logger.exception("[city_blog] fb publish job failed")
            await db.city_blog_config.update_one(job, {"$set": {"state": "error", "error": str(e)[:300]}})

    @r.post("/admin/city-blog/publish-facebook")
    async def publish_facebook(count: int = Query(10, ge=1, le=25), _a: dict = Depends(require_admin)):
        fb = await db.social_channels.find_one({"platform": "facebook"}, {"_id": 0}) or {}
        if not (fb.get("enabled") and fb.get("access_token") and fb.get("page_id")):
            raise HTTPException(400, "Connect Facebook first (Admin → Auto-post → Connect Facebook)")
        cur = await db.city_blog_config.find_one({"id": "fb_publish_job"}, {"_id": 0}) or {}
        if cur.get("state") == "running" and cur.get("started_at", "") > (_now() - timedelta(minutes=10)).isoformat():
            raise HTTPException(409, "A Facebook publish is already running")
        await db.city_blog_config.update_one({"id": "fb_publish_job"}, {"$set": {
            "state": "running", "count": count, "results": [], "published": 0, "error": None,
            "started_at": _now().isoformat()}}, upsert=True)
        t = asyncio.create_task(_fb_job(count))
        _TASKS.add(t)
        t.add_done_callback(_TASKS.discard)
        return {"ok": True, "state": "running"}

    @r.get("/admin/city-blog/publish-facebook")
    async def publish_facebook_status(_a: dict = Depends(require_admin)):
        return await db.city_blog_config.find_one({"id": "fb_publish_job"}, {"_id": 0}) or {"state": "idle"}

    @r.get("/admin/city-blog/posts")
    async def admin_posts(limit: int = Query(50, ge=1, le=200), _a: dict = Depends(require_admin)):
        return await db.city_blog_posts.find({}, PUBLIC_FIELDS).sort("created_at", -1).limit(limit).to_list(None)

    @r.delete("/admin/city-blog/posts/{post_id}")
    async def admin_delete(post_id: str, _a: dict = Depends(require_admin)):
        res = await db.city_blog_posts.delete_one({"id": post_id})
        if not res.deleted_count:
            raise HTTPException(404, "Post not found")
        return {"ok": True}

    return r

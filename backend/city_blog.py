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

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from pydantic import BaseModel, Field

logger = logging.getLogger("lumo.city_blog")

DEFAULT_CFG = {"enabled": True, "daily_top_n": 300, "batch_size": 15, "share_social": True}
ANGLES = [
    "new job openings this week (deliveries, rides, moving, errands, handyman)",
    "the loyalty bonus and how few bonus spots are left",
    "how fast it is to apply and get approved as an independent contractor",
    "keeping 90% of every job and same-day payouts",
    "why signing up now means being first in line when jobs go live",
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
              "hero_image": 1, "population": 1, "last_blog_at": 1}
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


def _page_lang(city: Dict[str, Any]) -> str:
    from recruit_cities import _page_lang as pl
    return pl(city.get("lang"), city.get("country"))


async def _write(city: Dict[str, Any], lang: str, signups: int, llm_key: str) -> Dict[str, Any]:
    from emergentintegrations.llm.chat import LlmChat, UserMessage
    first_n = int(city.get("bonus_first_n") or 100)
    facts = {
        "city": city["city"], "country": city.get("country_name") or "United States",
        "bonus_usd": float(city.get("bonus_amount") or 100), "bonus_currency": city.get("currency") or "USD",
        "bonus_after_jobs": int(city.get("bonus_job_count") or 100), "bonus_spots_left": max(0, first_n - signups),
        "workers_wanted": int(city.get("goal_workers") or 300), "signed_up_so_far": signups,
        "date": _now().strftime("%B %d, %Y"), "angle": random.choice(ANGLES),
    }
    local = LANG_NAMES.get(lang)
    want = (f'Return JSON: {{"local": {{"title","excerpt","body_md"}}, "en": {{"title","excerpt","body_md"}}}} '
            f'where "local" is written natively in {local} and "en" is the same post in English.') if local else \
        'Return JSON: {"en": {"title","excerpt","body_md"}} in English.'
    sys_msg = (
        "You write short recruiting blog posts for Lumo, a marketplace that pays independent contractors to do "
        "local jobs (deliveries, rides, moving, errands, handyman). Goal: get people in the given city to sign up "
        "now as contractors so they're ready when jobs open. Focus only on job openings and the loyalty bonus. "
        "Never claim a specific number of open jobs; workers_wanted is how many contractors Lumo is recruiting, and jobs open as local customers post them. "
        "250-400 words, markdown with 2-3 ## headings and one bullet list, warm and direct, no invented statistics "
        "beyond the facts given, mention the bonus amount converted to the local currency in words if not USD. "
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


async def publish_for_city(db, city: Dict[str, Any], llm_key: str, share: bool) -> Optional[Dict[str, Any]]:
    lang = _page_lang(city)
    signups = await _signups(db, city["slug"])
    out = await _write(city, lang, signups, llm_key)
    day = _now().strftime("%Y-%m-%d")
    slug = f"{city['slug']}-{day}"
    post = {
        "id": str(uuid.uuid4()), "slug": slug, "city_slug": city["slug"], "city": city["city"],
        "country": city.get("country") or "US", "country_name": city.get("country_name"), "lang": lang,
        "title": (out["local"].get("title") or "")[:180], "excerpt": (out["local"].get("excerpt") or "")[:400],
        "body_md": out["local"].get("body_md") or "",
        "title_en": (out["en"].get("title") or "")[:180], "excerpt_en": (out["en"].get("excerpt") or "")[:400],
        "body_md_en": out["en"].get("body_md") or "",
        "hero_image": city.get("hero_image"), "view_count": 0, "created_at": _now().isoformat(),
    }
    await db.city_blog_posts.update_one({"slug": slug}, {"$setOnInsert": post}, upsert=True)
    await db.recruit_cities.update_one({"slug": city["slug"]}, {"$set": {"last_blog_at": post["created_at"]}})
    if share:
        try:
            from social_publisher import publish_to_all
            await publish_to_all(db, {
                "title": post["title"], "body": post["excerpt"], "url": f"/join/{city['slug']}/blog/{slug}",
                "image_url": post["hero_image"], "hashtags": ["lumo", "hiring", city["city"].replace(" ", "")],
                "source_type": "city_blog", "source_id": post["id"],
            })
        except Exception as e:  # noqa: BLE001
            logger.warning(f"[city_blog] share failed for {slug}: {e}")
    return post


async def run_batch(db, llm_key: str, limit: Optional[int] = None) -> int:
    cfg = await get_cfg(db)
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
                    return await publish_for_city(db, c, llm_key, bool(cfg["share_social"]))
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


def create_router(*, db, require_admin, llm_key: Optional[str]) -> APIRouter:
    r = APIRouter(prefix="/api", tags=["city-blog"])

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
        if cfg["enabled"] and llm_key:
            asyncio.create_task(run_batch(db, llm_key))
        return {"ok": True, "queued": bool(cfg["enabled"])}

    @r.get("/city-blog/latest")
    async def latest(limit: int = Query(24, le=100)):
        return await db.city_blog_posts.find({}, PUBLIC_FIELDS).sort("created_at", -1).limit(limit).to_list(None)

    @r.get("/city-blog/city/{city_slug}")
    async def by_city(city_slug: str, limit: int = Query(20, le=100)):
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
        asyncio.create_task(run_batch(db, llm_key, limit=count))
        return {"ok": True, "queued": count}

    @r.get("/admin/city-blog/posts")
    async def admin_posts(limit: int = Query(50, le=200), _a: dict = Depends(require_admin)):
        return await db.city_blog_posts.find({}, PUBLIC_FIELDS).sort("created_at", -1).limit(limit).to_list(None)

    @r.delete("/admin/city-blog/posts/{post_id}")
    async def admin_delete(post_id: str, _a: dict = Depends(require_admin)):
        res = await db.city_blog_posts.delete_one({"id": post_id})
        if not res.deleted_count:
            raise HTTPException(404, "Post not found")
        return {"ok": True}

    return r

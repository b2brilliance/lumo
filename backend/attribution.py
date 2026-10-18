"""Recruitment attribution: UTM click events + sign-up source reporting."""
from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Any, Dict, Optional

import hashlib

from fastapi import APIRouter, Depends, Query, Request
from pydantic import BaseModel, Field

ATTR_KEYS = ("utm_source", "utm_medium", "utm_campaign", "utm_content")


def clean_source(raw: Optional[dict]) -> Optional[Dict[str, str]]:
    if not isinstance(raw, dict):
        return None
    out = {k: str(raw[k]).strip().lower()[:120] for k in ATTR_KEYS if raw.get(k)}
    if raw.get("landing_path"):
        out["landing_path"] = str(raw["landing_path"])[:200]
    return out or None


def utm_url(url: str, *, source: str, campaign: str, content: str) -> str:
    sep = "&" if "?" in url else "?"
    return f"{url}{sep}utm_source={source}&utm_medium=social&utm_campaign={campaign}&utm_content={content}"


class ClickIn(BaseModel):
    utm_source: str = Field(..., max_length=60)
    utm_medium: Optional[str] = Field(default=None, max_length=60)
    utm_campaign: Optional[str] = Field(default=None, max_length=120)
    utm_content: Optional[str] = Field(default=None, max_length=160)
    path: Optional[str] = Field(default=None, max_length=200)


def _city_from_path(path: str) -> Optional[str]:
    parts = [p for p in (path or "").split("/") if p]
    return parts[1] if len(parts) >= 2 and parts[0] == "join" and parts[1] not in ("country", "continent") else None


def create_router(*, db, require_admin) -> APIRouter:
    r = APIRouter(prefix="/api", tags=["attribution"])

    @r.post("/attribution/click")
    async def click(body: ClickIn, request: Request):
        doc = {k: (getattr(body, k) or "").strip().lower() or None for k in ATTR_KEYS}
        ip = (request.headers.get("x-forwarded-for") or (request.client.host if request.client else "")).split(",")[0]
        fp = hashlib.sha256(f"{ip}|{doc['utm_source']}|{doc['utm_content']}".encode()).hexdigest()[:24]
        cut = (datetime.now(timezone.utc) - timedelta(minutes=30)).isoformat()
        if await db.attribution_clicks.find_one({"fp": fp, "at": {"$gte": cut}}, {"_id": 1}):
            return {"ok": True, "dedup": True}
        doc["fp"] = fp
        doc.update(path=body.path, city_slug=_city_from_path(body.path or ""),
                   at=datetime.now(timezone.utc).isoformat())
        await db.attribution_clicks.insert_one(doc)
        return {"ok": True}

    @r.get("/admin/attribution/report")
    async def report(source: str = Query("facebook"), days: int = Query(30, ge=1, le=365),
                     _a: dict = Depends(require_admin)):
        since = (datetime.now(timezone.utc) - timedelta(days=days)).isoformat()
        src: Dict[str, Any] = {} if source == "all" else {"utm_source": source}
        usrc: Dict[str, Any] = {"role": "provider", **({"signup_source": {"$exists": True}} if source == "all"
                                                     else {"signup_source.utm_source": source})}

        clicks_by_post = {x["_id"]: x["n"] for x in await db.attribution_clicks.aggregate([
            {"$match": {**src, "at": {"$gte": since}, "utm_content": {"$ne": None}}},
            {"$group": {"_id": "$utm_content", "n": {"$sum": 1}}}]).to_list(None)}
        signups_by_post = {x["_id"]: x["n"] for x in await db.users.aggregate([
            {"$match": {**usrc, "created_at": {"$gte": since}, "signup_source.utm_content": {"$exists": True}}},
            {"$group": {"_id": "$signup_source.utm_content", "n": {"$sum": 1}}}]).to_list(None)}
        keys = set(clicks_by_post) | set(signups_by_post)
        meta = {p["slug"]: p async for p in db.city_blog_posts.find(
            {"slug": {"$in": list(keys)}}, {"_id": 0, "slug": 1, "title_en": 1, "title": 1, "city": 1, "city_slug": 1})}
        missing = [k for k in keys if k not in meta]
        async for c in db.recruit_cities.find({"slug": {"$in": missing}}, {"_id": 0, "slug": 1, "city": 1}):
            meta[c["slug"]] = {"title_en": f"Recruit ad: {c['city']}", "city": c["city"], "city_slug": c["slug"]}
        posts = sorted(({
            "key": k, "title": (meta.get(k) or {}).get("title_en") or (meta.get(k) or {}).get("title") or k,
            "city": (meta.get(k) or {}).get("city"), "city_slug": (meta.get(k) or {}).get("city_slug"),
            "clicks": clicks_by_post.get(k, 0), "signups": signups_by_post.get(k, 0),
        } for k in keys), key=lambda x: (-x["signups"], -x["clicks"]))[:50]

        city_clicks = {x["_id"]: x["n"] for x in await db.attribution_clicks.aggregate([
            {"$match": {**src, "at": {"$gte": since}, "city_slug": {"$ne": None}}},
            {"$group": {"_id": "$city_slug", "n": {"$sum": 1}}}]).to_list(None)}
        city_rows = await db.users.aggregate([
            {"$match": {"role": "provider", "created_at": {"$gte": since},
                        "$or": [{"recruit_city_slug": {"$exists": True}}, {"signup_source.landing_path": {"$regex": "^/join/"}}]}},
            {"$addFields": {"_city": {"$ifNull": ["$recruit_city_slug", {"$arrayElemAt": [
                {"$split": ["$signup_source.landing_path", "/"]}, 2]}]}}},
            {"$group": {"_id": "$_city", "total": {"$sum": 1},
                        "from_source": {"$sum": {"$cond": [
                            {"$eq": ["$signup_source.utm_source", source]} if source != "all"
                            else {"$ifNull": ["$signup_source.utm_source", False]}, 1, 0]}}}},
        ]).to_list(None)
        by_city = {c["_id"]: c for c in city_rows}
        slugs = set(by_city) | set(city_clicks)
        names = {c["slug"]: c async for c in db.recruit_cities.find(
            {"slug": {"$in": list(slugs)}}, {"_id": 0, "slug": 1, "city": 1, "country_name": 1, "state": 1, "country": 1})}
        cities = sorted(({
            "slug": s, "city": (names.get(s) or {}).get("city") or s,
            "where": (names.get(s) or {}).get("country_name") or (names.get(s) or {}).get("state"),
            "signups": (by_city.get(s) or {}).get("total", 0),
            "from_source": (by_city.get(s) or {}).get("from_source", 0), "clicks": city_clicks.get(s, 0),
        } for s in slugs if s in names and (source == "all" or city_clicks.get(s) or (by_city.get(s) or {}).get("from_source"))),
            key=lambda x: (-x["from_source"], -x["signups"], -x["clicks"]))[:50]

        return {
            "source": source, "days": days, "posts": posts, "cities": cities,
            "totals": {"clicks": await db.attribution_clicks.count_documents({**src, "at": {"$gte": since}}),
                       "signups": await db.users.count_documents({**usrc, "created_at": {"$gte": since}}),
                       "posts_shared": await db.city_blog_posts.count_documents({"fb_shared_at": {"$gte": since}})},
        }

    return r

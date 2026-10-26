"""
Site-wide settings (singleton document in MongoDB):
  • Social media URLs for the footer (Instagram, TikTok, X, …)
  • Footer copy & legal pages metadata (kept minimal for now)

Endpoints:
  GET  /api/site/social    — PUBLIC (the footer reads this on every page)
  PUT  /api/admin/site/social — ADMIN only

The singleton is identified by `_id: "social"`. Missing platforms are stored
as empty strings so the frontend can render the editor for *every* known
platform even when nothing has been set yet.
"""
from __future__ import annotations

import re
from datetime import datetime, timezone
from typing import Dict, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field


# Platforms we render in the footer + admin editor (key = field name).
DEFAULT_PLATFORMS: tuple[str, ...] = (
    "instagram", "tiktok", "youtube", "facebook", "twitter", "threads",
    "linkedin", "pinterest", "snapchat", "discord", "reddit", "whatsapp",
    "telegram", "twitch",
)


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


class SocialLinksBody(BaseModel):
    links: Dict[str, str] = Field(
        default_factory=dict,
        description="Map of platform key → URL. Empty strings clear a link.",
    )
    tagline: Optional[str] = Field(
        None, description="Short footer tagline shown above the link rows."
    )
    adsense_client: Optional[str] = Field(
        None, description="Google AdSense publisher ID (e.g. 'ca-pub-1234567890123456'). Empty string disables ads."
    )
    ads_enabled: Optional[bool] = Field(
        None, description="Master kill-switch for AdSense. When False, ads are hidden across the site even if a publisher ID is configured."
    )
    ios_app_url: Optional[str] = None
    android_app_url: Optional[str] = None


ANDROID_DEFAULT_URL = "https://play.google.com/store/apps/details?id=com.golumo.app"


def _app_links(doc: dict) -> dict:
    return {
        "ios_app_url": doc.get("ios_app_url") or "",
        "android_app_url": doc.get("android_app_url") if doc.get("android_app_url") is not None else ANDROID_DEFAULT_URL,
    }


def _validate_url(url: str) -> str:
    url = (url or "").strip()
    if not url:
        return ""
    if not re.match(r"^https?://", url, re.I):
        # Be forgiving — assume https if the user pasted "instagram.com/lumo"
        url = "https://" + url
    if len(url) > 500:
        raise HTTPException(400, "URL too long.")
    return url


async def _get_doc(db) -> dict:
    doc = await db.site_settings.find_one({"_id": "social"})
    if not doc:
        doc = {
            "_id": "social",
            "links": {p: "" for p in DEFAULT_PLATFORMS},
            "tagline": "Built for everyday hustle. Find work, hire help, sell stuff — all in one place.",
            "updated_at": None,
        }
        await db.site_settings.insert_one(doc)
    # Make sure every default platform is in the response (even if added later)
    links = doc.get("links") or {}
    for p in DEFAULT_PLATFORMS:
        links.setdefault(p, "")
    doc["links"] = links
    doc.pop("_id", None)
    return doc


def create_router(*, db, require_admin) -> APIRouter:
    router = APIRouter(tags=["site"])

    @router.get("/api/site/social")
    async def get_public():
        """Public payload consumed by the footer on every page."""
        doc = await _get_doc(db)
        # Only return platforms with non-empty URLs to keep the payload small
        active = {k: v for k, v in (doc.get("links") or {}).items() if v}
        return {
            "links": active,
            "tagline": doc.get("tagline"),
            "adsense_client": doc.get("adsense_client") or "",
            "ads_enabled": bool(doc.get("ads_enabled", True)),
            "platforms_supported": list(DEFAULT_PLATFORMS),
            "updated_at": doc.get("updated_at"),
            **_app_links(doc),
        }

    @router.get("/api/admin/site/social")
    async def get_admin(_admin: dict = Depends(require_admin)):
        """Admin payload includes the full editable form (every platform,
        even those with no URL set yet)."""
        doc = await _get_doc(db)
        return {
            "links": doc.get("links") or {},
            "tagline": doc.get("tagline"),
            "adsense_client": doc.get("adsense_client") or "",
            "ads_enabled": bool(doc.get("ads_enabled", True)),
            "platforms_supported": list(DEFAULT_PLATFORMS),
            "updated_at": doc.get("updated_at"),
            **_app_links(doc),
        }

    @router.put("/api/admin/site/social")
    async def update(body: SocialLinksBody, _admin: dict = Depends(require_admin)):
        # Sanitize every URL the admin sent
        cleaned: Dict[str, str] = {}
        for platform, url in (body.links or {}).items():
            if platform not in DEFAULT_PLATFORMS:
                continue  # silently drop unknown keys to avoid pollution
            cleaned[platform] = _validate_url(url)

        update_doc: dict = {"updated_at": _now_iso()}
        if cleaned:
            # Only patch the keys that were actually sent (partial update)
            for k, v in cleaned.items():
                update_doc[f"links.{k}"] = v
        if body.tagline is not None:
            update_doc["tagline"] = body.tagline.strip()[:200]
        if body.adsense_client is not None:
            ad = body.adsense_client.strip()[:64]
            # Validate shape: ca-pub-1234567890123456 (16 digits) — empty clears it
            if ad and not re.match(r"^ca-pub-\d{10,20}$", ad):
                raise HTTPException(400, "AdSense client must look like 'ca-pub-1234567890123456' (empty to disable).")
            update_doc["adsense_client"] = ad
        if body.ads_enabled is not None:
            update_doc["ads_enabled"] = bool(body.ads_enabled)
        if body.ios_app_url is not None:
            update_doc["ios_app_url"] = _validate_url(body.ios_app_url)
        if body.android_app_url is not None:
            update_doc["android_app_url"] = _validate_url(body.android_app_url)

        await db.site_settings.update_one(
            {"_id": "social"}, {"$set": update_doc}, upsert=True
        )
        doc = await _get_doc(db)
        return {
            "links": doc.get("links") or {},
            "tagline": doc.get("tagline"),
            "adsense_client": doc.get("adsense_client") or "",
            "ads_enabled": bool(doc.get("ads_enabled", True)),
            "platforms_supported": list(DEFAULT_PLATFORMS),
            "updated_at": doc.get("updated_at"),
            **_app_links(doc),
            "ok": True,
        }

    # ── Public homepage reviews feed ──────────────────────────────────────
    @router.get("/api/site/reviews")
    async def get_homepage_reviews(limit: int = 12):
        """Latest 4-5 star reviews + summary stats for the landing page."""
        cursor = db.reviews.find(
            {"overall_stars": {"$gte": 4}},
            {"_id": 0, "id": 1, "reviewer_name": 1, "target_type": 1,
             "overall_stars": 1, "body": 1, "created_at": 1, "cashback_amount": 1},
        ).sort("created_at", -1).limit(min(limit, 50))
        items = [d async for d in cursor]

        stats_cursor = db.reviews.aggregate([
            {"$group": {"_id": None, "count": {"$sum": 1},
                        "avg": {"$avg": "$overall_stars"}}}
        ])
        stats = {"count": 0, "avg": 0.0}
        async for s in stats_cursor:
            stats = {"count": int(s.get("count") or 0),
                     "avg": round(float(s.get("avg") or 0), 2)}

        return {"items": items, "stats": stats}

    return router

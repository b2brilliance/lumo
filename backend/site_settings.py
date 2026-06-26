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
            "platforms_supported": list(DEFAULT_PLATFORMS),
            "updated_at": doc.get("updated_at"),
        }

    @router.get("/api/admin/site/social")
    async def get_admin(_admin: dict = Depends(require_admin)):
        """Admin payload includes the full editable form (every platform,
        even those with no URL set yet)."""
        doc = await _get_doc(db)
        return {
            "links": doc.get("links") or {},
            "tagline": doc.get("tagline"),
            "platforms_supported": list(DEFAULT_PLATFORMS),
            "updated_at": doc.get("updated_at"),
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

        await db.site_settings.update_one(
            {"_id": "social"}, {"$set": update_doc}, upsert=True
        )
        doc = await _get_doc(db)
        return {
            "links": doc.get("links") or {},
            "tagline": doc.get("tagline"),
            "platforms_supported": list(DEFAULT_PLATFORMS),
            "updated_at": doc.get("updated_at"),
            "ok": True,
        }

    return router

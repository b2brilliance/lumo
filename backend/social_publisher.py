"""Social auto-publisher — Facebook, Instagram, X (Twitter), Reddit.

Listens for events (blog published, recruit broadcast) and fans out
posts to whichever channels the admin has configured via /admin?tab=social.

Design
------
- Per-channel adapter class with a `publish(content)` method.
- Channels store credentials in `social_channels` collection (one doc per
  platform, keyed by `platform`).
- Every publish attempt is logged in `social_posts` with status / url /
  error so the admin can debug failures.
- Adapters *gracefully return* (skip, not raise) when credentials are
  missing so a partial config still works.

Content contract:
    {
        "title":       str,       # tweet/caption headline
        "body":        str,       # long-form body (blog excerpt)
        "url":         str,       # link back to /blog/<slug> or /join/<slug>
        "image_url":   Optional[str],
        "hashtags":    List[str],
        "source_type": "blog" | "recruit",
        "source_id":   str,
    }
"""

from __future__ import annotations

import logging
import uuid
from datetime import datetime, timezone
from typing import Any, Callable, Dict, List, Optional

import httpx
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

logger = logging.getLogger(__name__)

PLATFORMS = ["facebook", "instagram", "twitter", "reddit"]
PLATFORM_LABELS = {
    "facebook":  "Facebook Page",
    "instagram": "Instagram Business",
    "twitter":   "X / Twitter",
    "reddit":    "Reddit",
}


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


# ── Adapters ─────────────────────────────────────────────────────────
async def _post_facebook(cfg: dict, content: dict) -> dict:
    """Post to a Facebook Page via Graph API v18."""
    page_id = cfg.get("page_id")
    token = cfg.get("access_token")
    if not (page_id and token):
        return {"ok": False, "skipped": True, "error": "missing page_id or access_token"}
    caption = _compose_caption(content, max_len=63206)  # FB post limit
    link = content.get("url")
    body: dict = {"message": caption, "access_token": token}
    if link: body["link"] = link
    url = f"https://graph.facebook.com/v18.0/{page_id}/feed"
    async with httpx.AsyncClient(timeout=20) as client:
        r = await client.post(url, data=body)
        if r.status_code >= 300:
            return {"ok": False, "error": f"FB {r.status_code}: {r.text[:200]}"}
        pid = r.json().get("id", "")
        return {"ok": True, "external_id": pid, "url": f"https://facebook.com/{pid}"}


async def _post_instagram(cfg: dict, content: dict) -> dict:
    """Post an image + caption to an IG Business account via Graph API.
    Instagram requires an image_url — text-only posts aren't supported."""
    ig_user_id = cfg.get("ig_user_id")
    token = cfg.get("access_token")
    if not (ig_user_id and token):
        return {"ok": False, "skipped": True, "error": "missing ig_user_id or access_token"}
    image_url = content.get("image_url")
    if not image_url:
        return {"ok": False, "skipped": True, "error": "IG requires image_url"}
    caption = _compose_caption(content, max_len=2200)
    async with httpx.AsyncClient(timeout=30) as client:
        # Step 1: create media container
        r1 = await client.post(
            f"https://graph.facebook.com/v18.0/{ig_user_id}/media",
            data={"image_url": image_url, "caption": caption, "access_token": token},
        )
        if r1.status_code >= 300:
            return {"ok": False, "error": f"IG create {r1.status_code}: {r1.text[:200]}"}
        creation_id = r1.json().get("id")
        # Step 2: publish
        r2 = await client.post(
            f"https://graph.facebook.com/v18.0/{ig_user_id}/media_publish",
            data={"creation_id": creation_id, "access_token": token},
        )
        if r2.status_code >= 300:
            return {"ok": False, "error": f"IG publish {r2.status_code}: {r2.text[:200]}"}
        return {"ok": True, "external_id": r2.json().get("id")}


async def _post_twitter(cfg: dict, content: dict) -> dict:
    """Post to X/Twitter via API v2.
    Requires OAuth 2.0 Bearer token with tweet.write scope (paid plan)."""
    bearer = cfg.get("bearer_token")
    if not bearer:
        return {"ok": False, "skipped": True, "error": "missing bearer_token"}
    text = _compose_caption(content, max_len=280, prefer_short=True)
    async with httpx.AsyncClient(timeout=20) as client:
        r = await client.post(
            "https://api.twitter.com/2/tweets",
            headers={"Authorization": f"Bearer {bearer}", "Content-Type": "application/json"},
            json={"text": text},
        )
        if r.status_code >= 300:
            return {"ok": False, "error": f"X {r.status_code}: {r.text[:200]}"}
        data = r.json().get("data", {})
        tid = data.get("id", "")
        return {"ok": True, "external_id": tid, "url": f"https://x.com/i/status/{tid}"}


async def _post_reddit(cfg: dict, content: dict) -> dict:
    """Post a link submission to a subreddit via Reddit API.
    Uses script-app OAuth flow (username + password + client_id + secret)."""
    client_id = cfg.get("client_id")
    client_secret = cfg.get("client_secret")
    username = cfg.get("username")
    password = cfg.get("password")
    subreddit = cfg.get("subreddit")  # e.g. "test" or "SideHustle"
    if not (client_id and client_secret and username and password and subreddit):
        return {"ok": False, "skipped": True, "error": "missing reddit credentials or subreddit"}
    user_agent = cfg.get("user_agent") or f"lumo-autoposter/1.0 by {username}"
    async with httpx.AsyncClient(timeout=25) as client:
        # OAuth: fetch a token
        auth = httpx.BasicAuth(client_id, client_secret)
        r = await client.post(
            "https://www.reddit.com/api/v1/access_token",
            data={"grant_type": "password", "username": username, "password": password},
            auth=auth,
            headers={"User-Agent": user_agent},
        )
        if r.status_code >= 300:
            return {"ok": False, "error": f"reddit oauth {r.status_code}: {r.text[:200]}"}
        token = r.json().get("access_token")
        if not token:
            return {"ok": False, "error": "reddit oauth: no token in response"}
        # Submit a link post
        r2 = await client.post(
            "https://oauth.reddit.com/api/submit",
            headers={"Authorization": f"Bearer {token}", "User-Agent": user_agent},
            data={
                "sr": subreddit,
                "kind": "link",
                "title": content.get("title", "")[:300],
                "url": content.get("url", ""),
                "resubmit": "true",
            },
        )
        if r2.status_code >= 300:
            return {"ok": False, "error": f"reddit submit {r2.status_code}: {r2.text[:200]}"}
        return {"ok": True, "external_id": r2.json().get("json", {}).get("data", {}).get("id", "")}


ADAPTERS: Dict[str, Callable[[dict, dict], Any]] = {
    "facebook":  _post_facebook,
    "instagram": _post_instagram,
    "twitter":   _post_twitter,
    "reddit":    _post_reddit,
}


def _compose_caption(content: dict, *, max_len: int, prefer_short: bool = False) -> str:
    title = (content.get("title") or "").strip()
    body = (content.get("body") or "").strip()
    url = (content.get("url") or "").strip()
    tags = content.get("hashtags") or []
    hashtag_str = " ".join(f"#{t.replace(' ', '').replace('-', '')}" for t in tags[:5] if t)
    if prefer_short:
        # Twitter/X: title + link + hashtags
        parts = [title, url, hashtag_str]
    else:
        parts = [title, body, url, hashtag_str]
    text = "\n\n".join(p for p in parts if p)
    if len(text) > max_len:
        text = text[: max_len - 1].rstrip() + "…"
    return text


# ── Core publish ─────────────────────────────────────────────────────
async def publish_to_all(db, content: dict) -> dict:
    """Fan out to every enabled channel. Returns a per-channel report."""
    results: Dict[str, dict] = {}
    for platform in PLATFORMS:
        cfg = await db.social_channels.find_one({"platform": platform}) or {}
        if not cfg.get("enabled"):
            continue
        try:
            fn = ADAPTERS.get(platform)
            if not fn:
                continue
            res = await fn(cfg, content)
        except Exception as e:  # noqa: BLE001
            logger.exception(f"[social] {platform} failed")
            res = {"ok": False, "error": f"{type(e).__name__}: {e}"[:300]}
        results[platform] = res
        # Persist history
        await db.social_posts.insert_one({
            "id": str(uuid.uuid4()),
            "platform": platform,
            "source_type": content.get("source_type"),
            "source_id": content.get("source_id"),
            "url": content.get("url"),
            "title": content.get("title"),
            "result": res,
            "created_at": _now_iso(),
        })
    return results


# ── Router ───────────────────────────────────────────────────────────
class ChannelConfig(BaseModel):
    platform: str
    enabled: bool = False
    config: Dict[str, Any] = {}  # {page_id, access_token, ig_user_id, bearer_token, client_id, client_secret, username, password, subreddit, user_agent}


class TestPostBody(BaseModel):
    platform: str
    title: Optional[str] = "Lumo test post"
    body: Optional[str] = "This is a test from Lumo's social auto-publisher."
    url: Optional[str] = None
    image_url: Optional[str] = None


def create_router(*, db, require_admin: Callable) -> APIRouter:
    r = APIRouter(prefix="/api/admin/social", tags=["social"])

    @r.get("/config")
    async def get_config(_admin=Depends(require_admin)):
        items: List[dict] = []
        for p in PLATFORMS:
            doc = await db.social_channels.find_one({"platform": p}, {"_id": 0}) or {}
            items.append({
                "platform": p,
                "label": PLATFORM_LABELS[p],
                "enabled": bool(doc.get("enabled")),
                "config": {k: v for k, v in doc.items() if k not in {"_id", "platform", "enabled", "last_test_result", "last_test_at"}},
                "last_test_result": doc.get("last_test_result"),
                "last_test_at": doc.get("last_test_at"),
            })
        return {"items": items}

    @r.put("/config/{platform}")
    async def update_config(platform: str, body: ChannelConfig, _admin=Depends(require_admin)):
        if platform not in PLATFORMS:
            raise HTTPException(400, f"Unknown platform: {platform}")
        payload = {"platform": platform, "enabled": bool(body.enabled), **(body.config or {})}
        await db.social_channels.update_one({"platform": platform}, {"$set": payload}, upsert=True)
        return {"ok": True}

    @r.post("/test")
    async def test_post(body: TestPostBody, _admin=Depends(require_admin)):
        if body.platform not in PLATFORMS:
            raise HTTPException(400, f"Unknown platform: {body.platform}")
        cfg = await db.social_channels.find_one({"platform": body.platform}) or {}
        content = {
            "title": body.title, "body": body.body, "url": body.url,
            "image_url": body.image_url, "hashtags": ["lumo", "test"],
            "source_type": "test", "source_id": str(uuid.uuid4()),
        }
        fn = ADAPTERS.get(body.platform)
        try:
            res = await fn(cfg, content) if fn else {"ok": False, "error": "no adapter"}
        except Exception as e:  # noqa: BLE001
            res = {"ok": False, "error": f"{type(e).__name__}: {e}"[:300]}
        await db.social_channels.update_one(
            {"platform": body.platform},
            {"$set": {"last_test_result": res, "last_test_at": _now_iso()}},
            upsert=True,
        )
        return res

    @r.get("/history")
    async def history(limit: int = 50, _admin=Depends(require_admin)):
        cur = db.social_posts.find({}, {"_id": 0}).sort("created_at", -1).limit(max(1, min(200, limit)))
        return {"items": await cur.to_list(length=limit)}

    return r

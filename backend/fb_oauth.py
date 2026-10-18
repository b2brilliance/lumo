"""Facebook Login → never-expiring Page token (+ linked Instagram Business).

Admin clicks Connect → /authorize returns Meta dialog URL → Meta redirects to
/api/social/facebook/callback → we exchange code → long-lived user token →
/me/accounts page tokens. One page is saved directly into `social_channels`;
multiple pages are parked in `fb_page_picks` for the admin to choose.
"""
from __future__ import annotations

import logging
import os
import secrets
from datetime import datetime, timedelta, timezone
from typing import Callable
from urllib.parse import urlencode

import httpx
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import RedirectResponse
from pydantic import BaseModel

logger = logging.getLogger("lumo.fb_oauth")
SCOPES = "pages_manage_posts,pages_read_engagement,pages_show_list,instagram_basic,instagram_content_publish,business_management"


def _env(k: str) -> str:
    return os.environ.get(k, "")


def _graph(path: str) -> str:
    return f"https://graph.facebook.com/{_env('META_GRAPH_VERSION')}/{path.lstrip('/')}"


async def _get(url: str, **params) -> dict:
    try:
        async with httpx.AsyncClient(timeout=30) as c:
            r = await c.get(url, params=params)
        data = r.json()
    except (httpx.HTTPError, ValueError) as e:
        raise HTTPException(502, f"Facebook unreachable: {type(e).__name__}")
    if r.is_error or "error" in data:
        msg = (data.get("error") or {}).get("message") or "Meta request failed"
        raise HTTPException(502, f"Facebook: {msg}")
    return data


def _admin_url(**q) -> str:
    return f"{_env('PUBLIC_BASE_URL')}/admin?{urlencode({'tab': 'autopost', **q})}"


async def _save_page(db, page: dict) -> dict:
    now = datetime.now(timezone.utc).isoformat()
    token = page["access_token"]
    await db.social_channels.update_one({"platform": "facebook"}, {"$set": {
        "platform": "facebook", "enabled": True, "updated_at": now,
        "page_id": page["id"], "access_token": token, "page_name": page.get("name"),
    }}, upsert=True)
    ig = (page.get("instagram_business_account") or {}).get("id")
    if not ig:
        await db.social_channels.update_one({"platform": "instagram"},
                                            {"$set": {"enabled": False, "ig_user_id": None, "access_token": None}})
    else:
        await db.social_channels.update_one({"platform": "instagram"}, {"$set": {
            "platform": "instagram", "enabled": True, "updated_at": now,
            "ig_user_id": ig, "access_token": token, "page_name": page.get("name"),
        }}, upsert=True)
    return {"page_id": page["id"], "page_name": page.get("name"), "instagram": bool(ig)}


class PickIn(BaseModel):
    pick_id: str
    page_id: str


def create_router(*, db, require_admin: Callable) -> APIRouter:
    r = APIRouter(prefix="/api", tags=["facebook-oauth"])

    @r.on_event("startup")
    async def _ttl():
        await db.fb_page_picks.create_index("created_at_dt", expireAfterSeconds=3600)
        await db.oauth_states.create_index("created_at_dt", expireAfterSeconds=3600)

    @r.get("/admin/social/facebook/authorize")
    async def authorize(admin: dict = Depends(require_admin)):
        if not (_env("META_APP_ID") and _env("META_APP_SECRET")):
            raise HTTPException(503, "META_APP_ID / META_APP_SECRET not configured")
        state = secrets.token_urlsafe(32)
        await db.oauth_states.insert_one({
            "state": state, "user_id": admin.get("id"), "provider": "facebook",
            "expires_at": (datetime.now(timezone.utc) + timedelta(minutes=15)).isoformat(),
            "created_at_dt": datetime.now(timezone.utc),
        })
        q = urlencode({"client_id": _env("META_APP_ID"), "redirect_uri": _env("META_REDIRECT_URI"),
                       "state": state, "response_type": "code", "scope": SCOPES})
        return {"url": f"https://www.facebook.com/{_env('META_GRAPH_VERSION')}/dialog/oauth?{q}"}

    @r.get("/social/facebook/callback")
    async def callback(code: str = "", state: str = "", error: str = "", error_description: str = ""):
        if error or not code or not state:
            return RedirectResponse(_admin_url(facebook="error", reason=error_description or error or "cancelled"))
        st = await db.oauth_states.find_one_and_delete({"state": state, "provider": "facebook"})
        if not st or st["expires_at"] < datetime.now(timezone.utc).isoformat():
            return RedirectResponse(_admin_url(facebook="error", reason="Login expired, please try again"))
        try:
            short = await _get(_graph("oauth/access_token"), client_id=_env("META_APP_ID"),
                               client_secret=_env("META_APP_SECRET"), redirect_uri=_env("META_REDIRECT_URI"), code=code)
            long = await _get(_graph("oauth/access_token"), grant_type="fb_exchange_token",
                              client_id=_env("META_APP_ID"), client_secret=_env("META_APP_SECRET"),
                              fb_exchange_token=short["access_token"])
            pages = await _get(_graph("me/accounts"), access_token=long["access_token"], limit=100,
                               fields="id,name,access_token,tasks,instagram_business_account")
        except HTTPException as e:
            logger.warning(f"[fb] callback failed: {e.detail}")
            return RedirectResponse(_admin_url(facebook="error", reason=str(e.detail)))
        usable = [p for p in pages.get("data", []) if "CREATE_CONTENT" in (p.get("tasks") or [])]
        if not usable:
            return RedirectResponse(_admin_url(facebook="error", reason="No Facebook Page you can post to was found"))
        if len(usable) == 1:
            res = await _save_page(db, usable[0])
            return RedirectResponse(_admin_url(facebook="connected", page=res["page_name"] or "",
                                               instagram="1" if res["instagram"] else "0"))
        pick_id = secrets.token_urlsafe(16)
        await db.fb_page_picks.insert_one({"id": pick_id, "user_id": st.get("user_id"), "pages": usable,
                                           "created_at": datetime.now(timezone.utc).isoformat(),
                                           "created_at_dt": datetime.now(timezone.utc)})
        return RedirectResponse(_admin_url(facebook="pick", pick=pick_id))

    @r.get("/admin/social/facebook/picks/{pick_id}")
    async def pick_options(pick_id: str, admin: dict = Depends(require_admin)):
        doc = await db.fb_page_picks.find_one({"id": pick_id, "user_id": admin.get("id")}, {"_id": 0})
        if not doc:
            raise HTTPException(404, "Selection expired — connect again")
        return [{"id": p["id"], "name": p.get("name"), "instagram": bool(p.get("instagram_business_account"))}
                for p in doc["pages"]]

    @r.post("/admin/social/facebook/select")
    async def select(body: PickIn, admin: dict = Depends(require_admin)):
        doc = await db.fb_page_picks.find_one({"id": body.pick_id, "user_id": admin.get("id")}, {"_id": 0})
        page = next((p for p in (doc or {}).get("pages", []) if p["id"] == body.page_id), None)
        if not page:
            raise HTTPException(404, "Page not found — connect again")
        res = await _save_page(db, page)
        await db.fb_page_picks.delete_one({"id": body.pick_id})
        return res

    @r.get("/admin/social/facebook/status")
    async def status(_a: dict = Depends(require_admin)):
        fb = await db.social_channels.find_one({"platform": "facebook"}, {"_id": 0}) or {}
        ig = await db.social_channels.find_one({"platform": "instagram"}, {"_id": 0}) or {}
        cfg = fb
        out = {"configured": bool(_env("META_APP_ID") and _env("META_APP_SECRET")),
               "connected": bool(cfg.get("access_token")), "page_name": cfg.get("page_name"),
               "page_id": cfg.get("page_id"), "instagram": bool(ig.get("ig_user_id")),
               "token_valid": None}
        if out["connected"]:
            try:
                await _get(_graph(cfg["page_id"]), fields="id,name", access_token=cfg["access_token"])
                out["token_valid"] = True
            except HTTPException:
                out["token_valid"] = False
        return out

    return r

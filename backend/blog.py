"""
Lumo blog — auto-generated posts twice daily.

Architecture:
  • A background asyncio loop wakes every 5 min and checks if we're inside
    one of the daily publishing windows (default 09:00 and 17:00 UTC).
    If yes AND we haven't published in that window yet, it generates a
    new post via Claude/Gemini, watermarks the hero image with the Lumo
    logo, saves it, and (optionally) fires the existing Distribution
    channels with a teaser link.
  • Admin can pause/resume the loop, edit/delete posts, override topics,
    and force-publish a new post via "Generate now".
  • Public endpoints expose the latest posts to the /blog page.

The whole module is decoupled from server.py — wire it via `create_router()`
and `start_blog_loop()` at startup.
"""
from __future__ import annotations

import asyncio
import base64
import io
import logging
import random
import re
import uuid
from datetime import datetime, timezone, timedelta
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from PIL import Image

logger = logging.getLogger("lumo.blog")

# ── Topic catalog ──────────────────────────────────────────────────────────
TOPIC_CATALOG = [
    {
        "key": "local_hustle",
        "label": "Local hustle stories",
        "prompt": "Write a punchy, encouraging blog post (650-800 words) about how everyday people are using the Lumo marketplace to earn extra income on their own schedule. Mix delivery drivers, photographers, handymen, tutors. Include a clear call-to-action at the end pointing readers to sign up as a Lumo provider.",
    },
    {
        "key": "money_marketplace",
        "label": "Marketplace economics",
        "prompt": "Write an insightful blog post (650-800 words) explaining why Lumo charges only 10% commission compared to 15-30% on competitors like TaskRabbit, DoorDash, and Uber Eats. Be honest about the trade-offs, but make the case that lower fees mean more money in providers' pockets and lower prices for customers.",
    },
    {
        "key": "city_spotlight",
        "label": "City spotlights",
        "prompt": "Write a feature-style blog post (650-800 words) imagining how local small businesses in a mid-size US city are benefiting from a same-day delivery platform like Lumo. Pick a representative city (Pittsburgh, Cleveland, Columbus, Indianapolis, Kansas City, Charlotte, Nashville, Memphis, Tampa, Portland) and weave in concrete scenarios — a restaurant offering 30-min delivery, a thrift shop reaching new customers, a moving service finding day-of crews.",
    },
    {
        "key": "how_to",
        "label": "How-to guides",
        "prompt": "Write a practical step-by-step blog post (650-800 words) teaching readers how to do one specific thing with Lumo. Pick from: setting up Stripe payouts in 3 minutes, posting your first job, finding a reliable handyman in your area, listing a car for sale, ordering same-day delivery from any retailer. Be specific and actionable.",
    },
    {
        "key": "founder_update",
        "label": "Founder updates",
        "prompt": "Write a candid, conversational founder-style blog post (500-700 words) from Lumo's perspective about what's new on the platform this month. Mention real features (10% commission, escrow with 24-hour auto-release, same-day delivery from any retailer/restaurant/individual, Stripe bank payouts, real estate + autos marketplaces, AI-powered ad studio). Keep it humble and forward-looking.",
    },
    {
        "key": "industry_trends",
        "label": "Industry trends",
        "prompt": "Write a thoughtful blog post (650-800 words) about how the gig economy and local-services marketplaces are evolving in 2026. Discuss real trends: lower take-rates, on-demand delivery from any store, multi-skill providers, escrow protection, AI-assisted matching. Position Lumo as part of the better-future narrative without being heavy-handed.",
    },
]
TOPIC_KEYS = [t["key"] for t in TOPIC_CATALOG]


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _now_iso() -> str:
    return _now().isoformat()


def _slugify(s: str, max_len: int = 70) -> str:
    s = re.sub(r"[^a-zA-Z0-9\s\-]", "", s or "").strip().lower()
    s = re.sub(r"\s+", "-", s)[:max_len]
    return s or f"post-{int(_now().timestamp())}"


# ── Logo watermark ──────────────────────────────────────────────────────────
def watermark(img_bytes: bytes, logo_path: str = "/app/frontend/public/logo192.png") -> bytes:
    """Overlay the Lumo logo on the bottom-right of `img_bytes`."""
    try:
        base = Image.open(io.BytesIO(img_bytes)).convert("RGBA")
        try:
            logo = Image.open(logo_path).convert("RGBA")
        except Exception:
            return img_bytes  # logo missing — return original
        # Resize logo to ~12% of base width
        target_w = max(64, int(base.width * 0.12))
        ratio = target_w / logo.width
        logo = logo.resize((target_w, int(logo.height * ratio)), Image.LANCZOS)
        # Soft white "chip" behind the logo for legibility on busy images
        pad = 12
        chip = Image.new("RGBA", (logo.width + pad * 2, logo.height + pad * 2), (255, 255, 255, 220))
        # Position bottom-right with a small margin
        margin = max(12, int(base.width * 0.02))
        x = base.width - chip.width - margin
        y = base.height - chip.height - margin
        base.alpha_composite(chip, (x, y))
        base.alpha_composite(logo, (x + pad, y + pad))
        out = io.BytesIO()
        base.convert("RGB").save(out, format="JPEG", quality=88)
        return out.getvalue()
    except Exception as e:
        logger.warning(f"Watermarking failed, using original: {e}")
        return img_bytes


# ── LLM helpers ─────────────────────────────────────────────────────────────
async def _generate_post(topic: dict, llm_key: str) -> dict:
    """Generate {title, slug, excerpt, body_md, tags} for the given topic."""
    from emergentintegrations.llm.chat import LlmChat, UserMessage

    sys_msg = (
        "You are the in-house writer for Lumo, a local-services marketplace "
        "(deliveries, gigs, marketplaces, real-estate, autos). Write punchy, "
        "specific, honest blog posts. Always end with a soft call-to-action "
        "back to Lumo. Output strict JSON only: "
        '{"title": "...", "excerpt": "...", "body_md": "...", "tags": ["..."]}.'
    )
    chat = LlmChat(api_key=llm_key, session_id=f"blog-{uuid.uuid4()}", system_message=sys_msg)
    chat = chat.with_model("anthropic", "claude-sonnet-4-5-20250929")
    raw = await chat.send_message(UserMessage(text=topic["prompt"]))

    import json as _json
    text = raw if isinstance(raw, str) else getattr(raw, "content", "") or str(raw)
    if "```" in text:
        text = text[text.find("{"):text.rfind("}") + 1]
    try:
        data = _json.loads(text)
    except Exception:
        # Fallback — wrap whatever we got as a single paragraph
        data = {"title": f"Lumo · {topic['label']}", "excerpt": "", "body_md": text[:4000], "tags": [topic["key"]]}

    title = data.get("title") or f"Lumo — {topic['label']}"
    return {
        "title": title[:160],
        "slug": _slugify(title),
        "excerpt": (data.get("excerpt") or "")[:300],
        "body_md": data.get("body_md") or "",
        "tags": [t for t in (data.get("tags") or [topic["key"]]) if isinstance(t, str)][:8],
    }


async def _generate_hero_image(title: str, topic: dict, llm_key: str) -> Optional[bytes]:
    """Generate hero image bytes (logo NOT yet applied — caller watermarks)."""
    try:
        from emergentintegrations.llm.chat import LlmChat, UserMessage
        chat = LlmChat(
            api_key=llm_key, session_id=f"blog-img-{uuid.uuid4()}",
            system_message="You are an art director for a tech marketplace. Generate clean, photographic, editorial hero images.",
        ).with_model("gemini", "gemini-3.1-flash-image-preview").with_params(modalities=["image", "text"])

        prompt = (
            f"Photographic editorial blog hero image for a marketplace called Lumo. "
            f"Topic: {topic['label']}. Article title: \"{title}\". "
            f"Wide 16:9 composition, warm natural lighting, real people or real-world scenes "
            f"(no logos in the image — we add ours separately). High detail, magazine-grade."
        )
        _text, images = await chat.send_message_multimodal_response(UserMessage(text=prompt))
        if images:
            return base64.b64decode(images[0]["data"])
    except Exception as e:
        logger.warning(f"Blog hero-image generation failed: {e}")
    return None


# ── Pydantic models ─────────────────────────────────────────────────────────
class BlogPostUpdate(BaseModel):
    title: Optional[str] = None
    excerpt: Optional[str] = None
    body_md: Optional[str] = None
    tags: Optional[list[str]] = None
    status: Optional[str] = None   # "published" | "draft"


class BlogConfigBody(BaseModel):
    paused: Optional[bool] = None
    schedule_hours_utc: Optional[list[int]] = None  # default [9, 17]
    auto_share: Optional[bool] = None


# ── Public + Admin router ───────────────────────────────────────────────────
def create_router(*, db, require_admin) -> APIRouter:
    router = APIRouter(tags=["blog"])

    # ── Public ────────────────────────────────────────────────────────────
    @router.get("/api/blog")
    async def list_public(limit: int = Query(20, le=100), skip: int = 0,
                          tag: Optional[str] = None):
        q: dict = {"status": "published"}
        if tag:
            q["tags"] = tag
        total = await db.blog_posts.count_documents(q)
        cursor = (db.blog_posts
                  .find(q, {"_id": 0, "body_md": 0})
                  .sort("published_at", -1).skip(skip).limit(limit))
        items = [d async for d in cursor]
        return {"total": total, "items": items}

    @router.get("/api/blog/{slug}")
    async def get_one_public(slug: str):
        doc = await db.blog_posts.find_one({"slug": slug, "status": "published"}, {"_id": 0})
        if not doc:
            raise HTTPException(404, "Post not found")
        # Bump view counter (fire-and-forget)
        try:
            await db.blog_posts.update_one({"slug": slug}, {"$inc": {"view_count": 1}})
        except Exception:
            pass
        return doc

    # ── Admin ─────────────────────────────────────────────────────────────
    @router.get("/api/admin/blog/config")
    async def get_config(_admin: dict = Depends(require_admin)):
        cfg = await db.blog_config.find_one({"_id": "singleton"}) or {}
        return {
            "paused": bool(cfg.get("paused", False)),
            "schedule_hours_utc": cfg.get("schedule_hours_utc") or [9, 17],
            "auto_share": bool(cfg.get("auto_share", True)),
            "topics": TOPIC_CATALOG,
            "last_run_at": cfg.get("last_run_at"),
            "last_window_key": cfg.get("last_window_key"),
        }

    @router.put("/api/admin/blog/config")
    async def update_config(body: BlogConfigBody, _admin: dict = Depends(require_admin)):
        upd = {"updated_at": _now_iso()}
        if body.paused is not None: upd["paused"] = body.paused
        if body.schedule_hours_utc is not None:
            hours = [h for h in body.schedule_hours_utc if 0 <= h < 24]
            if not hours: raise HTTPException(400, "Need at least one valid hour 0-23")
            upd["schedule_hours_utc"] = sorted(set(hours))[:6]  # cap at 6/day
        if body.auto_share is not None: upd["auto_share"] = body.auto_share
        await db.blog_config.update_one({"_id": "singleton"}, {"$set": upd}, upsert=True)
        return await get_config(_admin)

    @router.get("/api/admin/blog")
    async def list_admin(limit: int = Query(50, le=200), skip: int = 0,
                         _admin: dict = Depends(require_admin)):
        total = await db.blog_posts.count_documents({})
        cursor = db.blog_posts.find({}, {"_id": 0}).sort("created_at", -1).skip(skip).limit(limit)
        items = [d async for d in cursor]
        return {"total": total, "items": items}

    @router.post("/api/admin/blog/run-now")
    async def run_now(_admin: dict = Depends(require_admin)):
        try:
            doc = await _publish_one(db, force=True)
            return {"ok": True, "post": doc}
        except Exception as e:
            logger.exception("Manual blog run failed")
            raise HTTPException(500, f"Generation failed: {e}")

    @router.put("/api/admin/blog/{post_id}")
    async def update_post(post_id: str, body: BlogPostUpdate, _admin: dict = Depends(require_admin)):
        upd: dict = {"updated_at": _now_iso()}
        if body.title is not None:
            upd["title"] = body.title[:160]
            upd["slug"] = _slugify(body.title)
        if body.excerpt is not None: upd["excerpt"] = body.excerpt[:300]
        if body.body_md is not None: upd["body_md"] = body.body_md
        if body.tags is not None:    upd["tags"] = [t for t in body.tags if isinstance(t, str)][:8]
        if body.status is not None:
            if body.status not in ("published", "draft"):
                raise HTTPException(400, "status must be 'published' or 'draft'")
            upd["status"] = body.status
            if body.status == "published":
                upd["published_at"] = _now_iso()
        result = await db.blog_posts.update_one({"id": post_id}, {"$set": upd})
        if result.matched_count == 0:
            raise HTTPException(404, "Post not found")
        doc = await db.blog_posts.find_one({"id": post_id}, {"_id": 0})
        return doc

    @router.delete("/api/admin/blog/{post_id}")
    async def delete_post(post_id: str, _admin: dict = Depends(require_admin)):
        result = await db.blog_posts.delete_one({"id": post_id})
        return {"ok": True, "deleted": int(result.deleted_count)}

    return router


# ── Internal helpers — image upload (use server's storage abstraction) ────
async def _save_image(image_bytes: bytes) -> tuple[str, str]:
    """Save the watermarked hero image to object storage (or local fallback)
    and return (image_url, image_path)."""
    img_id = str(uuid.uuid4())
    image_path = f"blog/{img_id}.jpg"
    try:
        from server import put_object  # type: ignore
        put_object(image_path, image_bytes, "image/jpeg")
        return f"/api/storage/{image_path}", image_path
    except Exception:
        import os
        local_dir = "/app/backend/storage/blog"
        os.makedirs(local_dir, exist_ok=True)
        with open(f"{local_dir}/{img_id}.jpg", "wb") as f:
            f.write(image_bytes)
        return f"/api/blog-image/{img_id}.jpg", image_path


async def _publish_one(db, force: bool = False) -> dict:
    """Generate one blog post + image, save, return the document."""
    import os
    llm_key = os.environ.get("EMERGENT_LLM_KEY", "").strip()
    if not llm_key:
        raise RuntimeError("EMERGENT_LLM_KEY missing — blog auto-publish cannot run.")

    # Pick a topic that hasn't been used recently if possible
    recent = []
    async for d in db.blog_posts.find({}, {"topic": 1, "_id": 0}).sort("created_at", -1).limit(6):
        if d.get("topic"): recent.append(d["topic"])
    candidates = [t for t in TOPIC_CATALOG if t["key"] not in recent] or TOPIC_CATALOG
    topic = random.choice(candidates)

    post = await _generate_post(topic, llm_key)
    image_bytes = await _generate_hero_image(post["title"], topic, llm_key)
    image_url, image_path = None, None
    if image_bytes:
        watermarked = watermark(image_bytes)
        image_url, image_path = await _save_image(watermarked)

    doc = {
        "id": str(uuid.uuid4()),
        "slug": post["slug"],
        "title": post["title"],
        "excerpt": post["excerpt"],
        "body_md": post["body_md"],
        "tags": post["tags"],
        "topic": topic["key"],
        "topic_label": topic["label"],
        "hero_image_url": image_url,
        "hero_image_path": image_path,
        "status": "published",
        "view_count": 0,
        "created_at": _now_iso(),
        "published_at": _now_iso(),
        "author": "Lumo",
        "auto_generated": True,
        "forced": force,
    }
    await db.blog_posts.insert_one(doc)
    doc.pop("_id", None)
    logger.info(f"Blog post published: {doc['slug']} (topic={topic['key']})")

    # Optional auto-share to existing Distribution channels
    try:
        cfg = await db.blog_config.find_one({"_id": "singleton"}) or {}
        if cfg.get("auto_share", True):
            await _share_to_channels(db, doc)
    except Exception as e:
        logger.warning(f"Blog auto-share failed: {e}")

    return doc


async def _share_to_channels(db, post: dict):
    """Fire each enabled Distribution channel with the new post."""
    try:
        from server import _send_to_channel  # type: ignore
    except Exception:
        logger.info("Distribution _send_to_channel not found — skipping auto-share.")
        return
    channels = [c async for c in db.distribution_channels.find({"enabled": {"$ne": False}})]
    payload = {
        "headline": post["title"],
        "body": post["excerpt"] or post["body_md"][:240],
        "image_url": post.get("hero_image_url"),
        "video_url": None,
        "hashtags": post.get("tags", []),
        "source_ad_id": post["id"],
        "blog_post_url": f"/blog/{post['slug']}",
    }
    for ch in channels:
        try:
            await _send_to_channel(ch, payload)
        except Exception as e:
            logger.warning(f"Share to {ch.get('platform')} failed: {e}")


# ── Background loop ────────────────────────────────────────────────────────
async def _loop(db, get_cfg):
    logger.info("Blog auto-pilot loop started.")
    while True:
        try:
            cfg = await get_cfg()
            if cfg.get("paused"):
                await asyncio.sleep(60 * 5)
                continue
            now = _now()
            hours = cfg.get("schedule_hours_utc") or [9, 17]
            window_key = None
            for h in hours:
                if now.hour == h and now.minute < 30:
                    window_key = f"{now.date().isoformat()}_{h}"
                    break
            if window_key and window_key != cfg.get("last_window_key"):
                await _publish_one(db)
                await db.blog_config.update_one(
                    {"_id": "singleton"},
                    {"$set": {"last_window_key": window_key, "last_run_at": _now_iso()}},
                    upsert=True,
                )
        except Exception as e:
            logger.exception(f"Blog loop iteration failed: {e}")
        await asyncio.sleep(60 * 5)  # check every 5 min


def start_blog_loop(app, db):
    async def get_cfg():
        c = await db.blog_config.find_one({"_id": "singleton"})
        return c or {}
    @app.on_event("startup")
    async def _start():
        asyncio.create_task(_loop(db, get_cfg))

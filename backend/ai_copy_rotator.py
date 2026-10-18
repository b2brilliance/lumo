"""AI Copy Rotator — GPT rewrites recruit + blog social captions daily.

Why: reposting the same city recruitment blurb every 24 hours makes
followers scroll past. This module rewrites the title/body each run so
the feed stays fresh, and stores the last N variants per source so the
LLM can avoid repeating recent phrasings.

Behaviour
---------
- Admin toggle `enabled` (default False) stored under
  `site_config.key = 'ai_copy_rotator'`.
- Two tone presets rotate: "hype" (energetic, all-caps CTAs, driver-culture
  vibe) and "clean" (professional, benefits-first, lower-case).
- Called before every social publish in `broadcast_recruit_post` (recruits)
  and `_share_to_channels` (blog).
- Keeps `copy_history` per (source_type, source_id) — last 5 variants
  are passed back to the LLM as "avoid these phrasings".

Model: Claude Sonnet 4.5 (proven creative-copy engine, matches blog.py
already-shipped integration).
"""
from __future__ import annotations

import json
import logging
import os
import re
import uuid
from datetime import datetime, timezone
from typing import Any, Callable, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

logger = logging.getLogger("lumo.ai_copy")


TONE_PRESETS = {
    "hype": (
        "You are a scrappy hype-man for Lumo, a P2P service marketplace. "
        "Write energetic, driver-culture social copy — short sentences, "
        "punchy verbs, emoji ok (max 2). Never boring. Never corporate."
    ),
    "clean": (
        "You are the in-house editor for Lumo, a P2P service marketplace. "
        "Write clean, professional social copy — benefits-first, honest, "
        "no jargon, no exclamation abuse. Sound like a founder writing on X."
    ),
}
TONES = list(TONE_PRESETS.keys())


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


async def _get_config(db) -> Dict[str, Any]:
    doc = await db.site_config.find_one({"key": "ai_copy_rotator"}) or {}
    return {
        "enabled": bool(doc.get("enabled", False)),
        "tones": doc.get("tones") or TONES,
        "last_run_at": doc.get("last_run_at"),
        "last_tone": doc.get("last_tone"),
        "total_rewrites": int(doc.get("total_rewrites") or 0),
    }


def _pick_tone(cfg: Dict[str, Any]) -> str:
    """Alternate between enabled tones so consecutive posts feel varied."""
    tones = [t for t in (cfg.get("tones") or TONES) if t in TONE_PRESETS] or TONES
    last = cfg.get("last_tone")
    if len(tones) == 1:
        return tones[0]
    # Rotate: whichever tone we didn't use last time
    for t in tones:
        if t != last:
            return t
    return tones[0]


def _extract_json(text: str) -> Optional[dict]:
    """Best-effort JSON extraction from an LLM response."""
    if not text:
        return None
    text = text.strip()
    # Strip code fences
    if "```" in text:
        start = text.find("{")
        end = text.rfind("}")
        if start >= 0 and end > start:
            text = text[start:end + 1]
    try:
        return json.loads(text)
    except Exception:
        # Try to find the first {...} block
        m = re.search(r"\{[\s\S]*\}", text)
        if m:
            try:
                return json.loads(m.group(0))
            except Exception:
                return None
        return None


async def _fetch_recent_variants(db, *, source_type: str, source_id: str, limit: int = 5) -> List[Dict[str, str]]:
    cur = db.copy_history.find(
        {"source_type": source_type, "source_id": source_id},
        {"_id": 0, "title": 1, "body": 1, "created_at": 1},
    ).sort("created_at", -1).limit(limit)
    return await cur.to_list(length=limit)


async def _log_variant(db, *, source_type: str, source_id: str, tone: str,
                       title: str, body: str, base_title: str, base_body: str) -> None:
    await db.copy_history.insert_one({
        "id": str(uuid.uuid4()),
        "source_type": source_type,
        "source_id": source_id,
        "tone": tone,
        "title": title,
        "body": body,
        "base_title": base_title,
        "base_body": base_body,
        "created_at": _now_iso(),
    })


async def rewrite_copy(
    db,
    *,
    source_type: str,
    source_id: str,
    base_title: str,
    base_body: str,
    context: Optional[Dict[str, Any]] = None,
    tone: Optional[str] = None,
) -> Dict[str, str]:
    """Rewrite (title, body) via LLM using the configured tone. Falls back
    to the base copy if the rotator is disabled or the LLM call fails."""
    cfg = await _get_config(db)
    if not cfg.get("enabled"):
        return {"title": base_title, "body": base_body, "tone": "off"}

    llm_key = os.environ.get("EMERGENT_LLM_KEY", "").strip()
    if not llm_key:
        logger.warning("[ai_copy] EMERGENT_LLM_KEY missing — falling back to base copy")
        return {"title": base_title, "body": base_body, "tone": "off"}

    tone = tone or _pick_tone(cfg)
    recent = await _fetch_recent_variants(db, source_type=source_type, source_id=source_id, limit=5)
    avoid_lines = [f"- {v.get('title','')} / {v.get('body','')[:120]}" for v in recent if v.get("title")]
    avoid_block = ("\n".join(avoid_lines))[:1800] if avoid_lines else "(none — first run)"

    tone_msg = TONE_PRESETS.get(tone, TONE_PRESETS["clean"])
    ctx_lines = ""
    if context:
        for k, v in context.items():
            ctx_lines += f"- {k}: {v}\n"

    sys_msg = (
        f"{tone_msg}\n\n"
        "Task: rewrite the given social post so it feels fresh vs recent posts. "
        "Keep every factual detail (city, dollar amounts, milestone counts, URLs). "
        "Change ONLY the phrasing, hook and angle.\n"
        "If the context includes local details (neighborhoods, region, local city name, nearby cities), "
        "weave one in so the post clearly speaks to people in that specific area. Don't invent statistics.\n"
        "If the context includes a core_message, keep that message.\n\n"
        "Output STRICT JSON only, no prose, no code fences:\n"
        '{"title": "…", "body": "…"}\n'
        "Title: max 100 chars. Body: max 260 chars. No hashtags — the caller adds them."
    )
    user_msg = (
        f"Context:\n{ctx_lines}\n"
        f"Base title: {base_title}\n"
        f"Base body: {base_body}\n\n"
        f"Recent variants to avoid repeating (last 5):\n{avoid_block}"
    )

    try:
        from emergentintegrations.llm.chat import LlmChat, UserMessage
        chat = LlmChat(
            api_key=llm_key,
            session_id=f"copy-rotator-{source_type}-{source_id}-{uuid.uuid4().hex[:8]}",
            system_message=sys_msg,
        ).with_model("anthropic", "claude-sonnet-4-5-20250929")
        raw = await chat.send_message(UserMessage(text=user_msg))
        text = raw if isinstance(raw, str) else getattr(raw, "content", "") or str(raw)
        data = _extract_json(text) or {}
        title = (data.get("title") or "").strip()
        body = (data.get("body") or "").strip()
        if not title or not body:
            raise ValueError("LLM returned empty title/body")
        # Hard caps
        title = title[:120]
        body = body[:320]
    except Exception as e:  # noqa: BLE001
        logger.exception(f"[ai_copy] rewrite failed, using base: {e}")
        return {"title": base_title, "body": base_body, "tone": "off"}

    await _log_variant(
        db, source_type=source_type, source_id=source_id, tone=tone,
        title=title, body=body, base_title=base_title, base_body=base_body,
    )
    await db.site_config.update_one(
        {"key": "ai_copy_rotator"},
        {"$set": {"last_run_at": _now_iso(), "last_tone": tone},
         "$inc": {"total_rewrites": 1}},
        upsert=True,
    )
    logger.info(f"[ai_copy] rewrote {source_type}:{source_id} tone={tone}")
    return {"title": title, "body": body, "tone": tone}


# ── Admin API ────────────────────────────────────────────────────────
class ConfigBody(BaseModel):
    enabled: Optional[bool] = None
    tones: Optional[List[str]] = None


class PreviewBody(BaseModel):
    source_type: str = "recruit"     # "recruit" | "blog"
    source_id: str                    # city slug or blog post id
    base_title: str
    base_body: str
    context: Dict[str, Any] = {}
    tone: Optional[str] = None        # force a tone (else auto-rotate)


def create_router(*, db, require_admin: Callable) -> APIRouter:
    r = APIRouter(prefix="/api/admin/ai-copy", tags=["ai-copy"])

    @r.get("/config")
    async def get_cfg(_admin=Depends(require_admin)):
        cfg = await _get_config(db)
        return {**cfg, "available_tones": TONES}

    @r.put("/config")
    async def set_cfg(body: ConfigBody, _admin=Depends(require_admin)):
        upd: Dict[str, Any] = {"key": "ai_copy_rotator"}
        if body.enabled is not None:
            upd["enabled"] = bool(body.enabled)
        if body.tones is not None:
            tones = [t for t in body.tones if t in TONE_PRESETS]
            if not tones:
                raise HTTPException(400, "Pick at least one supported tone")
            upd["tones"] = tones
        await db.site_config.update_one(
            {"key": "ai_copy_rotator"}, {"$set": upd}, upsert=True
        )
        return await get_cfg(_admin)

    @r.post("/preview")
    async def preview(body: PreviewBody, _admin=Depends(require_admin)):
        """Force a rewrite even if the rotator is currently disabled, and
        persist the variant under `source_id='preview-…'` so the admin's
        preview attempts don't crowd out real recent variants."""
        llm_key = os.environ.get("EMERGENT_LLM_KEY", "").strip()
        if not llm_key:
            raise HTTPException(503, "EMERGENT_LLM_KEY missing — preview unavailable")
        tone = body.tone if body.tone in TONE_PRESETS else _pick_tone(await _get_config(db))
        # Do a one-off rewrite that persists (so it counts as a variant)
        # but the admin can preview any tone they choose.
        result = await rewrite_copy(
            db,
            source_type=body.source_type,
            source_id=f"preview-{body.source_id}",
            base_title=body.base_title,
            base_body=body.base_body,
            context=body.context or None,
            tone=tone,
        )
        # Force enable-bypass: if the rotator is off, we still want the preview
        # to show something rewritten so the admin can see what they're buying.
        if result.get("tone") == "off":
            cfg_doc = await db.site_config.find_one({"key": "ai_copy_rotator"}) or {}
            was_enabled = cfg_doc.get("enabled")
            await db.site_config.update_one(
                {"key": "ai_copy_rotator"}, {"$set": {"enabled": True}}, upsert=True
            )
            try:
                result = await rewrite_copy(
                    db,
                    source_type=body.source_type,
                    source_id=f"preview-{body.source_id}",
                    base_title=body.base_title,
                    base_body=body.base_body,
                    context=body.context or None,
                    tone=tone,
                )
            finally:
                await db.site_config.update_one(
                    {"key": "ai_copy_rotator"},
                    {"$set": {"enabled": bool(was_enabled)}},
                    upsert=True,
                )
        return result

    @r.get("/history")
    async def history(limit: int = 25, _admin=Depends(require_admin)):
        cur = db.copy_history.find({}, {"_id": 0}).sort("created_at", -1).limit(max(1, min(200, limit)))
        return {"items": await cur.to_list(length=limit)}

    return r

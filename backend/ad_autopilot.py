"""
Daily ad auto-pilot — broadcasts one ad per day, rotated across the existing
Ad Studio library to every enabled connector.

Why this design:
- Generation through Claude + Nano Banana costs Universal-Key credits and adds
  variance; the operator already curates a library inside /admin → Ad Studio.
- One-good-ad-per-day reliably ships every morning without burning credits or
  risking off-brand output.

Operator controls (Admin → Distribution → Auto-pilot):
  enabled         — master on/off
  daily_time_utc  — e.g. "14:00" — the UTC moment to fire each day
  shuffle         — if true, pick a random ad each cycle; otherwise round-robin

When the autopilot fires it:
  1. Picks the next ad (round-robin via cursor, or random).
  2. Calls the existing broadcast logic across every enabled connector.
  3. Writes an autopilot_log row with the broadcast summary so the operator
     can audit history from the dashboard.
"""
from __future__ import annotations

import asyncio
import logging
import random
from datetime import datetime, timezone, timedelta

logger = logging.getLogger("lumo.autopilot")

DEFAULTS = {
    "_id": "singleton",
    "enabled": False,
    "daily_time_utc": "14:00",  # 2pm UTC
    "shuffle": True,
    "cursor": 0,
    "last_run_at": None,
    "last_ad_id": None,
}


async def get_settings(db) -> dict:
    s = await db.autopilot_settings.find_one({"_id": "singleton"})
    if not s:
        await db.autopilot_settings.insert_one(DEFAULTS)
        return dict(DEFAULTS)
    out = {**DEFAULTS, **s}
    out.pop("_id", None)
    return out


async def _should_fire_now(settings: dict) -> bool:
    if not settings.get("enabled"):
        return False
    now = datetime.now(timezone.utc)
    target = settings.get("daily_time_utc") or "14:00"
    try:
        hh, mm = target.split(":")
        target_today = now.replace(hour=int(hh), minute=int(mm), second=0, microsecond=0)
    except Exception:
        target_today = now.replace(hour=14, minute=0, second=0, microsecond=0)
    last = settings.get("last_run_at")
    last_dt = None
    if last:
        try:
            last_dt = datetime.fromisoformat(last.replace("Z", "+00:00"))
        except Exception:
            last_dt = None
    # Fire when we're past today's target AND we haven't already fired today.
    if now >= target_today and (last_dt is None or last_dt < target_today):
        return True
    return False


async def _pick_ad(db, settings: dict):
    """Returns (ad, new_cursor) or (None, cursor) when the library is empty."""
    ads = await db.ads.find({}).sort("created_at", 1).to_list(500)
    if not ads:
        return None, settings.get("cursor", 0)
    if settings.get("shuffle"):
        return random.choice(ads), settings.get("cursor", 0)
    cur = settings.get("cursor", 0) % len(ads)
    return ads[cur], (cur + 1) % len(ads)


async def _tick(db, broadcast_ad) -> None:
    settings = await get_settings(db)
    if not await _should_fire_now(settings):
        return
    # Make sure at least one connector is enabled to receive
    if await db.connectors.count_documents({"enabled": True}) == 0:
        logger.info("Autopilot skipped — no enabled connectors yet")
        return

    ad, next_cursor = await _pick_ad(db, settings)
    if not ad:
        logger.info("Autopilot skipped — Ad Studio library is empty")
        return

    summary = await broadcast_ad(ad_id=ad["id"], connector_ids=None)
    now_iso_str = datetime.now(timezone.utc).isoformat()
    await db.autopilot_settings.update_one(
        {"_id": "singleton"},
        {"$set": {"cursor": next_cursor, "last_run_at": now_iso_str, "last_ad_id": ad["id"]}},
        upsert=True,
    )
    await db.autopilot_log.insert_one({
        "ts": now_iso_str,
        "ad_id": ad["id"],
        "headline": ad.get("headline"),
        "summary": summary,
    })
    logger.info(f"Autopilot fired: '{(ad.get('headline') or '')[:80]}' → {summary}")


async def autopilot_loop(*, db, broadcast_ad, interval_seconds: int = 600) -> None:
    """Wakes every `interval_seconds` (default 10 min) and fires once when the
    target UTC time is reached for the day."""
    logger.info(f"Ad autopilot loop started (checks every {interval_seconds}s)")
    while True:
        try:
            await _tick(db, broadcast_ad)
        except Exception as e:  # pragma: no cover
            logger.error(f"autopilot_loop iteration failed: {e}")
        await asyncio.sleep(interval_seconds)

"""Fetch real city hero photos from Wikipedia's REST API.

Why
---
The hand-curated `CITY_PHOTO_IDS` map in `recruit_cities_local.py` had
some mismatched Unsplash IDs (iter-58 QA flagged Miami's photo as a
neon-signage shot that doesn't represent Miami). Rather than keep
re-curating 122 cities by hand, we pull each city's canonical
infobox photo from Wikipedia on first boot and persist it on the
`recruit_cities` document.

API
---
GET https://en.wikipedia.org/api/rest_v1/page/summary/<Title>

Returns `thumbnail.source` which is a 320-330px thumbnail. We swap the
width segment to `1600px-` to get a hero-sized version from the same
cached derivative pipeline. We also strip the tracking query string.

Caveats
-------
- Only ~95% of US metros have a usable infobox photo on Wikipedia.
  When missing/404, we fall back to the existing curated Unsplash
  photo (iter-58) and finally the generic Unsplash fallback.
- Rate-limiting: Wikipedia asks for a User-Agent + reasonable rate.
  We stagger with a 100ms sleep between cities on seed. 122 cities
  takes ~12s on first boot; subsequent boots are no-ops because the
  photo URL is persisted on the row.
"""
from __future__ import annotations

import asyncio
import logging
import re
from typing import Optional
from urllib.parse import quote

import httpx

logger = logging.getLogger("lumo.recruit_wiki")

_USER_AGENT = "LumoApp/1.0 (https://golumo.app; recruit-city-seed)"
_WIKI_SUMMARY = "https://en.wikipedia.org/api/rest_v1/page/summary/{title}"

# Cities with a US namesake that need the state suffix to avoid
# collisions (e.g. "Portland" → defaults to Portland, OR but we also
# want to look up Portland, Maine).
_AMBIGUOUS = {
    "portland-or", "portland-me", "columbus-oh", "charleston-sc",
    "springfield-ma", "manchester-nh", "jackson-ms", "burlington-vt",
    "aurora-co", "columbia-sc", "henderson-nv", "arlington-tx",
    "augusta-ga", "lexington-ky", "richmond-va", "anchorage-ak",
    "fort-worth-tx", "fort-wayne-in", "kansas-city-mo", "oklahoma-city-ok",
    "salt-lake-city-ut", "colorado-springs-co", "des-moines-ia",
    "virginia-beach-va", "little-rock-ar", "new-orleans-la",
    "baton-rouge-la", "grand-rapids-mi", "st-louis-mo", "st-paul-mn",
    "st-petersburg-fl", "st-petersburg-fl", "jersey-city-nj",
    "long-beach-ca", "oakland-ca", "fresno-ca", "sacramento-ca",
    "santa-ana-ca", "anaheim-ca", "bakersfield-ca", "riverside-ca",
    "corpus-christi-tx", "el-paso-tx", "lubbock-tx", "plano-tx",
    "madison-wi", "rochester-ny", "buffalo-ny", "syracuse-ny",
    "albany-ny", "reno-nv", "spokane-wa", "tacoma-wa", "eugene-or",
    "salem-or", "mesa-az", "chandler-az", "scottsdale-az", "tucson-az",
    "boise-id", "billings-mt", "omaha-ne", "lincoln-ne", "wichita-ks",
    "tulsa-ok", "albuquerque-nm", "santa-fe-nm", "mobile-al",
    "montgomery-al", "birmingham-al", "memphis-tn", "knoxville-tn",
    "louisville-ky", "greensboro-nc", "durham-nc", "raleigh-nc",
    "charlotte-nc", "worcester-ma", "providence-ri", "hartford-ct",
    "bridgeport-ct", "newark-nj", "pittsburgh-pa", "philadelphia-pa",
    "cleveland-oh", "cincinnati-oh", "toledo-oh", "indianapolis-in",
    "milwaukee-wi", "minneapolis-mn", "detroit-mi", "nashville-tn",
    "jacksonville-fl", "tampa-fl", "orlando-fl", "hialeah-fl",
    "fort-lauderdale-fl", "savannah-ga", "atlanta-ga", "miami-fl",
    "houston-tx", "dallas-tx", "austin-tx", "san-antonio-tx",
    "san-diego-ca", "san-francisco-ca", "san-jose-ca", "los-angeles-ca",
    "new-york-ny", "brooklyn-ny", "queens-ny", "bronx-ny",
    "staten-island-ny", "las-vegas-nv", "phoenix-az", "denver-co",
    "seattle-wa", "chicago-il", "boston-ma", "washington-dc",
    "baltimore-md", "norfolk-va", "honolulu-hi",
}


def _wiki_title(city: str, state_full: str, slug: str) -> str:
    """Build the Wikipedia article title for a US city. Always use the
    canonical "City, State" form which Wikipedia maintains as a redirect
    for ambiguous names (Portland, Oregon vs Portland, Maine). Even
    unambiguous cities (New York City) redirect correctly from the
    comma form, so we always use it."""
    # Washington, DC is a special case (actual article is "Washington, D.C.")
    if slug == "washington-dc":
        return "Washington,_D.C."
    # Everyone else: "City, Full State Name"
    safe_city = city.replace(" ", "_")
    safe_state = state_full.replace(" ", "_")
    return f"{safe_city},_{safe_state}"


def _upscale_thumb(url: str, width: int = 1600) -> str:
    """Wikipedia thumbnails come back as `.../330px-File.jpg`. Swap the
    size prefix for a hero-sized derivative that the same cache
    pipeline will generate on demand."""
    if not url:
        return url
    # Strip tracking params
    url = url.split("?", 1)[0]
    # Replace "/<any>px-" with "/<width>px-"
    return re.sub(r"/\d{2,4}px-", f"/{width}px-", url)


async def fetch_wiki_photo(client: httpx.AsyncClient, city: str, state_full: str, slug: str) -> Optional[str]:
    """Return a hero-sized Wikipedia infobox photo URL for the city, or
    None when Wikipedia doesn't have one.

    Resilient to 404s, 429s and transient network errors — callers
    should treat None as "keep whatever hero_image is already set."""
    title = _wiki_title(city, state_full, slug)
    url = _WIKI_SUMMARY.format(title=quote(title, safe=","))
    try:
        resp = await client.get(url, timeout=8.0, headers={"User-Agent": _USER_AGENT, "Accept": "application/json"})
        if resp.status_code != 200:
            return None
        data = resp.json()
        # `originalimage` is usually full-res; `thumbnail` is smaller but
        # ALWAYS available when there's a page image. Prefer original
        # when it's reasonably sized, else upscale the thumbnail.
        orig = (data.get("originalimage") or {}).get("source")
        thumb = (data.get("thumbnail") or {}).get("source")
        if orig:
            # Many originals are huge (3000+ px); keep them as-is, the
            # frontend <img> will scale down.
            return orig.split("?", 1)[0]
        if thumb:
            return _upscale_thumb(thumb, 1600)
        return None
    except Exception as e:  # noqa: BLE001
        logger.debug(f"[wiki] fetch failed for {slug}: {e}")
        return None


async def backfill_wiki_photos(db) -> int:
    """One-shot migration: iterate every active recruit_city row and
    backfill `hero_image` from Wikipedia when:
      - the row has no `wiki_photo_fetched_at` timestamp yet (never tried), OR
      - `wiki_photo_fetched_at` is older than 90 days (refresh)

    Returns count of rows updated. Safe to call on every boot — idempotent."""
    from datetime import datetime, timezone, timedelta
    cutoff = (datetime.now(timezone.utc) - timedelta(days=90)).isoformat()

    cursor = db.recruit_cities.find(
        {"$or": [
            {"wiki_photo_fetched_at": {"$exists": False}},
            {"wiki_photo_fetched_at": {"$lt": cutoff}},
        ]},
        {"_id": 0, "slug": 1, "city": 1, "state_full": 1, "state": 1, "hero_image": 1},
    )

    updated = 0
    async with httpx.AsyncClient() as client:
        async for doc in cursor:
            slug = doc.get("slug")
            city = doc.get("city")
            state_full = doc.get("state_full") or doc.get("state") or ""
            if not slug or not city:
                continue
            wiki_url = await fetch_wiki_photo(client, city, state_full, slug)
            now_iso = datetime.now(timezone.utc).isoformat()
            patch: dict = {"wiki_photo_fetched_at": now_iso}
            if wiki_url:
                patch["hero_image"] = wiki_url
                patch["hero_image_source"] = "wikipedia"
                updated += 1
            else:
                # Mark as attempted but no match so we don't re-hit for 90d
                patch["hero_image_source"] = patch.get("hero_image_source") or "unsplash-fallback"
            await db.recruit_cities.update_one({"slug": slug}, {"$set": patch})
            # 100ms stagger — Wikipedia asks for < 200 req/s per project,
            # we're well under at ~10 req/s even without stagger.
            await asyncio.sleep(0.1)

    if updated:
        logger.info(f"[wiki] Backfilled {updated} city hero photos from Wikipedia")
    return updated

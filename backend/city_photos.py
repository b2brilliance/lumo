"""Replace fallback/duplicate/bad city photos with real, city-specific ones (free sources),
then delete the affected Facebook posts and re-queue those cities for the FB rollout.

Sources, in order: Wikidata P18 image (matched by GeoNames ID) → Wikipedia lead image
(validated to be within 40 km of the city). Both are free and need no key.
"""
from __future__ import annotations

import logging
import math
import os
import re
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional
from urllib.parse import quote, unquote

import httpx

logger = logging.getLogger("lumo.city_photos")
UA = "LumoBot/1.0 (https://golumo.app; julius.a.mason@gmail.com)"
FALLBACK_MARK = "photo-1477959858617"
BAD_RX = re.compile(r"\.svg|map|flag|locator|location|coat_of_arms|coat%20of%20arms|seal|logo|emblem|disambiguation|"
                    r"administrative|division|population|chart", re.I)
IMG_DIR = Path(__file__).parent / "data" / "img_cache"


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _ok(url: Optional[str]) -> bool:
    return bool(url) and not BAD_RX.search(unquote(url).replace(" ", "_")) and \
        unquote(url).lower().rsplit("?", 1)[0].endswith((".jpg", ".jpeg", ".png", ".webp"))


def _commons(url: str) -> str:
    name = unquote(url.rsplit("/", 1)[-1])
    return f"https://commons.wikimedia.org/wiki/Special:FilePath/{quote(name)}?width=1280"


async def bad_cities(db) -> List[Dict[str, Any]]:
    fields = {"_id": 0, "slug": 1, "city": 1, "country_name": 1, "state_full": 1, "lat": 1, "lng": 1,
              "geonameid": 1, "hero_image": 1, "population": 1}
    dup = {d["_id"] for d in await db.recruit_cities.aggregate([
        {"$group": {"_id": "$hero_image", "n": {"$sum": 1}}}, {"$match": {"n": {"$gt": 1}}}]).to_list(None)}
    out, kept = [], set()
    async for c in db.recruit_cities.find({"is_active": True}, fields).sort("population", -1):
        img = c.get("hero_image") or ""
        if img in dup and img not in kept and FALLBACK_MARK not in img and _ok(img.split("?")[0]):
            kept.add(img)  # the largest city keeps a shared photo; the others get new ones
            continue
        if FALLBACK_MARK in img or img in dup or not _ok(img.split("?")[0]):
            out.append(c)
    return out


async def _wikidata(client: httpx.AsyncClient, gids: List[str]) -> Dict[str, List[str]]:
    vals = " ".join(f'"{g}"' for g in gids)
    # P18 = image, P948 = Wikivoyage banner, P2716 = collage
    q = (f"SELECT ?gid ?img WHERE {{ VALUES ?gid {{{vals}}} ?item wdt:P1566 ?gid. "
         f"{{ ?item wdt:P18 ?img }} UNION {{ ?item wdt:P948 ?img }} UNION {{ ?item wdt:P2716 ?img }} }}")
    r = await client.get("https://query.wikidata.org/sparql", params={"query": q},
                         headers={"Accept": "application/sparql-results+json"}, timeout=60)
    out: Dict[str, List[str]] = {}
    for b in r.json()["results"]["bindings"]:
        out.setdefault(b["gid"]["value"], []).append(b["img"]["value"])
    return out


def _km(a_lat, a_lng, b_lat, b_lng) -> float:
    p1, p2 = math.radians(a_lat), math.radians(b_lat)
    h = math.sin((p2 - p1) / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(math.radians(b_lng - a_lng) / 2) ** 2
    return 6371 * 2 * math.asin(math.sqrt(h))


async def _wikipedia(client: httpx.AsyncClient, c: Dict[str, Any]) -> Optional[str]:
    region = c.get("country_name") or c.get("state_full") or ""
    for title in (f"{c['city']}, {region}", c["city"]):
        try:
            r = await client.get(f"https://en.wikipedia.org/api/rest_v1/page/summary/{quote(title.replace(' ', '_'), safe=',')}",
                                 timeout=10)
            d = r.json()
        except Exception:  # noqa: BLE001
            continue
        co = d.get("coordinates") or {}
        img = (d.get("originalimage") or {}).get("source", "").split("?")[0]
        if d.get("type") == "standard" and co and c.get("lat") is not None and \
                _km(c["lat"], c["lng"], co["lat"], co["lon"]) < 40 and _ok(img):
            return img
    return None


async def _geo_nearby(client: httpx.AsyncClient, c: Dict[str, Any], used: set) -> Optional[str]:
    """Lead photo of a Wikipedia article located in the city (landmark, district, square...)."""
    if c.get("lat") is None:
        return None
    try:
        r = await client.get("https://en.wikipedia.org/w/api.php", timeout=15, params={
            "action": "query", "format": "json", "generator": "geosearch", "ggscoord": f"{c['lat']}|{c['lng']}",
            "ggsradius": 10000, "ggslimit": 40, "prop": "pageimages", "piprop": "original"})
        pages = list((r.json().get("query") or {}).get("pages", {}).values())
    except Exception:  # noqa: BLE001
        return None
    name = c["city"].lower()
    pages.sort(key=lambda p: (name not in p.get("title", "").lower(), p.get("index", 99)))
    for p in pages:
        img = (p.get("original") or {}).get("source", "")
        if _ok(img) and (p.get("original") or {}).get("width", 0) >= 800 and img not in used:
            return img
    for p in pages:  # second chance: smaller photos are still better than a shared stock image
        img = (p.get("original") or {}).get("source", "")
        if _ok(img) and (p.get("original") or {}).get("width", 0) >= 400 and img not in used:
            return img
    return None


async def refresh_photos(db, limit: int = 2000) -> Dict[str, Any]:
    cities = (await bad_cities(db))[:limit]
    used = set(await db.recruit_cities.distinct("hero_image"))
    fixed, missing = [], []
    async with httpx.AsyncClient(headers={"User-Agent": UA}, follow_redirects=True) as client:
        wd: Dict[str, List[str]] = {}
        gids = [c["geonameid"] for c in cities if c.get("geonameid")]
        for i in range(0, len(gids), 150):
            try:
                wd.update(await _wikidata(client, gids[i:i + 150]))
            except Exception as e:  # noqa: BLE001
                logger.warning(f"[photos] wikidata batch failed: {e}")
        for c in cities:
            pick = next((_commons(u) for u in wd.get(c.get("geonameid") or "", []) if _ok(u) and _commons(u) not in used), None)
            source = "wikidata"
            if not pick:
                pick, source = await _wikipedia(client, c), "wikipedia"
                if pick in used:
                    pick = None
            if not pick:
                pick, source = await _geo_nearby(client, c, used), "wikipedia_geo"
            if not pick:
                missing.append(c["slug"])
                continue
            used.add(pick)
            await db.recruit_cities.update_one({"slug": c["slug"]}, {"$set": {
                "hero_image": pick, "photo_source": source, "photo_refreshed_at": _now(), "fb_needs_repost": True}})
            await db.city_blog_posts.update_many({"city_slug": c["slug"]}, {"$set": {"hero_image": pick}})
            (IMG_DIR / f"{c['slug']}.jpg").unlink(missing_ok=True)
            fixed.append(c["slug"])
    logger.info(f"[photos] fixed {len(fixed)}, still missing {len(missing)}")
    return {"checked": len(cities), "fixed": len(fixed), "missing": missing}


async def redo_facebook_posts(db) -> Dict[str, Any]:
    """Delete FB posts for cities whose photo changed, and re-queue them for the rollout."""
    fb = await db.social_channels.find_one({"platform": "facebook"}, {"_id": 0}) or {}
    token = fb.get("access_token")
    ver = os.environ["META_GRAPH_VERSION"]
    slugs = await db.recruit_cities.distinct("slug", {"fb_needs_repost": True})
    blog_ids = await db.city_blog_posts.distinct("id", {"city_slug": {"$in": slugs}})
    deleted, failed = 0, 0
    q = {"platform": "facebook", "result.ok": True, "deleted_at": {"$exists": False},
         "source_id": {"$in": slugs + blog_ids}}
    async with httpx.AsyncClient(timeout=20) as client:
        async for p in db.social_posts.find(q, {"_id": 0, "id": 1, "result": 1}):
            ext = (p.get("result") or {}).get("external_id")
            if not (ext and token):
                failed += 1
                continue
            r = await client.delete(f"https://graph.facebook.com/{ver}/{ext}", params={"access_token": token})
            if r.status_code < 300 or "does not exist" in r.text:
                deleted += 1
                await db.social_posts.update_one({"id": p["id"]}, {"$set": {"deleted_at": _now()}})
            else:
                failed += 1
                logger.warning(f"[photos] FB delete {ext} failed: {r.text[:160]}")
    await db.recruit_cities.update_many({"slug": {"$in": slugs}}, {
        "$unset": {"fb_page_shared_at": "", "fb_rollout_attempts": "", "fb_rollout_error": "", "fb_needs_repost": ""}})
    await db.city_blog_posts.update_many({"city_slug": {"$in": slugs}}, {"$unset": {"fb_shared_at": ""}})
    return {"cities_requeued": len(slugs), "fb_deleted": deleted, "fb_delete_failed": failed}

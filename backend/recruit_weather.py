"""Current-weather badge for every recruit city.

Uses Open-Meteo:
  - Geocoding: https://geocoding-api.open-meteo.com/v1/search
  - Forecast:  https://api.open-meteo.com/v1/forecast
Both endpoints are free, require no API key, and permit non-commercial +
light commercial use. We cache results in Mongo for 30 minutes to keep
page views off the upstream and shield us from rate limits.

Public contract
---------------
GET /api/recruit/cities/{slug}/weather
  → { temp_f, condition, emoji, fetched_at }
  → 404 if slug unknown

Flow per request
----------------
1. Load the recruit_cities row.
2. If `weather_cached_at` is < 30 min old → return cached fields.
3. If lat/lng missing on the row → geocode once and persist them.
4. Fetch current weather, condense to {temp_f, condition, emoji}, persist
   cache, return.

Falls back silently on any upstream failure — the badge just hides.
"""
from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone
from typing import Optional

import httpx
from fastapi import APIRouter, HTTPException

logger = logging.getLogger("lumo.recruit_weather")

_CACHE_TTL_MIN = 30
_UA = {"User-Agent": "LumoApp/1.0 (https://golumo.app; recruit-weather)"}

_GEOCODE_URL = "https://geocoding-api.open-meteo.com/v1/search"
_FORECAST_URL = "https://api.open-meteo.com/v1/forecast"


# WMO weather code → (short label, emoji). From Open-Meteo docs.
_WMO: dict[int, tuple[str, str]] = {
    0:  ("Clear",            "☀️"),
    1:  ("Mainly clear",     "🌤️"),
    2:  ("Partly cloudy",    "⛅"),
    3:  ("Overcast",         "☁️"),
    45: ("Fog",              "🌫️"),
    48: ("Icy fog",          "🌫️"),
    51: ("Light drizzle",    "🌦️"),
    53: ("Drizzle",          "🌦️"),
    55: ("Heavy drizzle",    "🌦️"),
    56: ("Freezing drizzle", "🌧️"),
    57: ("Freezing drizzle", "🌧️"),
    61: ("Light rain",       "🌧️"),
    63: ("Rain",             "🌧️"),
    65: ("Heavy rain",       "🌧️"),
    66: ("Freezing rain",    "🌧️"),
    67: ("Freezing rain",    "🌧️"),
    71: ("Light snow",       "❄️"),
    73: ("Snow",             "❄️"),
    75: ("Heavy snow",       "❄️"),
    77: ("Snow grains",      "❄️"),
    80: ("Rain showers",     "🌧️"),
    81: ("Rain showers",     "🌧️"),
    82: ("Heavy showers",    "🌧️"),
    85: ("Snow showers",     "❄️"),
    86: ("Snow showers",     "❄️"),
    95: ("Thunderstorm",     "⛈️"),
    96: ("Thunder + hail",   "⛈️"),
    99: ("Thunder + hail",   "⛈️"),
}


def _now_utc() -> datetime:
    return datetime.now(timezone.utc)


def _is_fresh(iso: Optional[str]) -> bool:
    if not iso:
        return False
    try:
        ts = datetime.fromisoformat(iso.replace("Z", "+00:00"))
        return (_now_utc() - ts) < timedelta(minutes=_CACHE_TTL_MIN)
    except Exception:  # noqa: BLE001
        return False


async def _geocode(client: httpx.AsyncClient, city: str, state: str) -> Optional[tuple[float, float]]:
    """Return (lat, lng) for a US city, or None on failure."""
    try:
        r = await client.get(
            _GEOCODE_URL,
            params={"name": city, "count": 5, "language": "en", "format": "json", "countryCode": "US"},
            timeout=6.0, headers=_UA,
        )
        if r.status_code != 200:
            return None
        data = r.json() or {}
        results = data.get("results") or []
        # Prefer the hit whose admin1 matches the state (e.g. "Florida")
        state_up = (state or "").upper()
        for hit in results:
            admin1 = (hit.get("admin1") or "")
            if admin1[:2].upper() == state_up or admin1.upper().startswith(state_up):
                return float(hit["latitude"]), float(hit["longitude"])
        if results:
            return float(results[0]["latitude"]), float(results[0]["longitude"])
        return None
    except Exception as e:  # noqa: BLE001
        logger.debug(f"[weather] geocode failed for {city},{state}: {e}")
        return None


async def _fetch_weather(client: httpx.AsyncClient, lat: float, lng: float) -> Optional[dict]:
    try:
        r = await client.get(
            _FORECAST_URL,
            params={
                "latitude": lat, "longitude": lng,
                "current": "temperature_2m,weather_code",
                "temperature_unit": "fahrenheit",
                "wind_speed_unit": "mph",
                "timezone": "auto",
            },
            timeout=6.0, headers=_UA,
        )
        if r.status_code != 200:
            return None
        cur = (r.json() or {}).get("current") or {}
        temp = cur.get("temperature_2m")
        code = cur.get("weather_code")
        if temp is None or code is None:
            return None
        label, emoji = _WMO.get(int(code), ("—", "🌡️"))
        return {
            "temp_f": round(float(temp)),
            "condition": label,
            "emoji": emoji,
            "wmo_code": int(code),
        }
    except Exception as e:  # noqa: BLE001
        logger.debug(f"[weather] forecast failed: {e}")
        return None


def create_router(*, db) -> APIRouter:
    r = APIRouter(prefix="/api/recruit", tags=["recruit-weather"])

    @r.get("/cities/{slug}/weather")
    async def get_weather(slug: str):
        row = await db.recruit_cities.find_one(
            {"slug": slug},
            {"_id": 0, "city": 1, "state": 1, "lat": 1, "lng": 1,
             "weather_cached_at": 1, "weather_temp_f": 1,
             "weather_condition": 1, "weather_emoji": 1},
        )
        if not row:
            raise HTTPException(404, "City not found")

        # Serve cached if fresh
        if _is_fresh(row.get("weather_cached_at")) and row.get("weather_temp_f") is not None:
            return {
                "temp_f":    row["weather_temp_f"],
                "condition": row.get("weather_condition") or "",
                "emoji":     row.get("weather_emoji") or "🌡️",
                "fetched_at": row.get("weather_cached_at"),
                "cached": True,
            }

        lat, lng = row.get("lat"), row.get("lng")
        async with httpx.AsyncClient() as client:
            if lat is None or lng is None:
                coords = await _geocode(client, row["city"], row.get("state") or "")
                if coords:
                    lat, lng = coords
                    await db.recruit_cities.update_one(
                        {"slug": slug}, {"$set": {"lat": lat, "lng": lng}}
                    )
            if lat is None or lng is None:
                raise HTTPException(503, "Weather lookup unavailable (geocoding failed)")
            weather = await _fetch_weather(client, lat, lng)

        if not weather:
            raise HTTPException(503, "Weather lookup unavailable")

        now_iso = _now_utc().isoformat()
        await db.recruit_cities.update_one(
            {"slug": slug},
            {"$set": {
                "weather_cached_at":   now_iso,
                "weather_temp_f":      weather["temp_f"],
                "weather_condition":   weather["condition"],
                "weather_emoji":       weather["emoji"],
                "weather_wmo_code":    weather["wmo_code"],
            }},
        )
        return {**weather, "fetched_at": now_iso, "cached": False}

    return r

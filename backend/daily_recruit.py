"""Daily recruiting posts: 40 US (top-3 cities per state, rotating) + 2 international per day.

Each post covers Delivery + 2 rotating categories, 3 example jobs each with pay based on live GoLumo
pricing (cost-of-living-adjusted local currency abroad), plus requirements.
"""
from __future__ import annotations

import logging
import math
import statistics
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from data.us_top3 import US_TOP3

logger = logging.getLogger("lumo.daily_recruit")
US_PER_DAY = 40
INTL_PER_DAY = 2
IMG = "https://static.prod-images.emergentagent.com/jobs/6c2ae84b-c1e9-4b02-ab0a-f5fa68ed9b27/images/"

# key: (title, live job categories, reference unit, reference USD, examples[(name, low, high, unit label)], requirements)
CATEGORIES: List[Dict[str, Any]] = [
    {"key": "delivery", "title": "Delivery", "cats": ["delivery", "courier"], "unit": "flat", "ref": 20,
     "ex": [("Food delivery", 8, 15, "per drop"), ("Grocery runs", 15, 30, "per order"), ("Package drop-offs", 6, 12, "per stop")],
     "req": "18+, smartphone, car, bike or scooter, valid ID"},
    {"key": "cleaning", "title": "Home cleaning", "cats": ["cleaning"], "unit": "hour", "ref": 28,
     "ex": [("Standard home clean", 25, 35, "per hour"), ("Move-out deep clean", 120, 250, "per job"), ("Short-term rental turnover", 50, 90, "per job")],
     "req": "18+, valid ID, background check, reliable transport"},
    {"key": "handyman", "title": "Handyman", "cats": ["handyman", "assembly"], "unit": "hour", "ref": 48,
     "ex": [("Furniture assembly", 40, 80, "per item"), ("TV mounting", 60, 120, "per job"), ("Small home repairs", 40, 60, "per hour")],
     "req": "18+, your own basic tools, valid ID, some repair experience"},
    {"key": "moving", "title": "Moving help", "cats": ["moving"], "unit": "flat", "ref": 170,
     "ex": [("Load or unload a truck", 30, 45, "per hour"), ("Apartment move", 150, 300, "per job"), ("Junk haul-away", 60, 150, "per load")],
     "req": "18+, able to lift 50 lb (23 kg), valid ID; a truck or van earns more"},
    {"key": "yard", "title": "Yard work", "cats": ["landscaping"], "unit": "flat", "ref": 50,
     "ex": [("Lawn mowing", 30, 60, "per yard"), ("Leaf or snow clean-up", 40, 100, "per job"), ("Hedge trimming", 35, 50, "per hour")],
     "req": "18+, valid ID, your own mower or tools for most jobs"},
    {"key": "pets", "title": "Pet care", "cats": ["pet_care"], "unit": "day", "ref": 20,
     "ex": [("Dog walking", 15, 25, "per walk"), ("Pet sitting visit", 25, 50, "per visit"), ("Overnight pet stay", 40, 75, "per night")],
     "req": "18+, valid ID, experience with dogs and cats"},
    {"key": "errands", "title": "Errands and rides", "cats": ["errand", "errands", "rides", "driver"], "unit": "flat", "ref": 20,
     "ex": [("Pharmacy and store pickups", 12, 20, "per errand"), ("Rides to appointments", 15, 40, "per ride"), ("Waiting in line", 18, 25, "per hour")],
     "req": "18+, smartphone, valid ID; rides need a driver's license and insured vehicle"},
    {"key": "tech", "title": "Tech help", "cats": ["digital_tech"], "unit": "hour", "ref": 55,
     "ex": [("Wi-Fi and router setup", 40, 80, "per job"), ("Smart TV and streaming setup", 40, 70, "per job"), ("Phone and computer help", 35, 60, "per hour")],
     "req": "18+, valid ID, solid everyday tech skills"},
    {"key": "auto", "title": "Car care", "cats": ["auto", "detailing", "towing", "roadside"], "unit": "flat", "ref": 60,
     "ex": [("Mobile car wash and detail", 50, 150, "per car"), ("Jump starts", 40, 75, "per call"), ("Flat tire changes", 50, 90, "per call")],
     "req": "18+, driver's license, your own vehicle and basic car tools"},
    {"key": "tutoring", "title": "Tutoring", "cats": ["education"], "unit": "hour", "ref": 34,
     "ex": [("Homework help", 25, 45, "per hour"), ("Test prep", 35, 60, "per hour"), ("Language lessons", 20, 40, "per hour")],
     "req": "18+, valid ID, strong knowledge of your subject"},
]
CAT_TAGS = {"delivery": "DeliveryJobs", "cleaning": "CleaningJobs", "handyman": "HandymanJobs", "moving": "MovingJobs",
            "yard": "LandscapingJobs", "pets": "PetSitting", "errands": "GigJobs", "tech": "TechJobs",
            "auto": "CarDetailing", "tutoring": "TutoringJobs"}

# Price level vs the US (cost-of-living), used when a country has no live GoLumo prices of its own.
PRICE_LEVEL = {
    "JP": .62, "IN": .25, "CN": .45, "BR": .45, "MX": .5, "EG": .2, "BD": .3, "PK": .22, "AR": .35, "TR": .35,
    "PH": .35, "NG": .25, "ID": .3, "RU": .35, "FR": .85, "GB": .9, "TH": .35, "KR": .65, "PE": .45, "CO": .35,
    "KE": .35, "VN": .3, "SA": .5, "ZA": .4, "CD": .45, "DE": .85, "IT": .75, "ES": .7, "CL": .5, "MY": .35,
    "SG": .8, "AE": .6, "IR": .2, "IQ": .4, "GH": .3, "ET": .3, "TZ": .35, "CA": .85, "AU": .9, "AO": .4,
    "CI": .4, "MA": .4, "MM": .25, "TW": .55, "US": 1.0,
}
SYMBOL = {"USD": "$", "GBP": "£", "EUR": "€", "JPY": "¥", "CNY": "¥", "INR": "₹", "NGN": "₦", "KRW": "₩",
          "PHP": "₱", "BRL": "R$", "MXN": "MX$", "TRY": "₺", "THB": "฿", "VND": "₫", "CAD": "CA$", "AUD": "A$",
          "ZAR": "R", "KES": "KSh", "GHS": "GH₵", "RUB": "₽", "SGD": "S$", "TWD": "NT$", "BDT": "৳", "PKR": "Rs ",
          "EGP": "E£", "IDR": "Rp ", "MYR": "RM ", "COP": "COL$", "CLP": "CLP$", "ARS": "AR$", "PEN": "S/ "}


INTL_NAMES = {"Leaf or snow clean-up": "Garden clean-up", "per yard": "per lawn", "Lawn mowing": "Lawn and garden mowing"}


def intl_extras(city: Dict[str, Any]) -> tuple:
    """(city with display name, local-language opener) for the international campaign cities."""
    from city_ads import BY_SLUG, LOCAL, NATIVE, DISPLAY
    row = BY_SLUG.get(city["slug"])
    if not row or city.get("country") == "US":
        return city, None
    name = DISPLAY.get(city["slug"], city["city"])
    loc = LOCAL.get(row[1])
    return {**city, "display": name}, (loc[0].format(city=NATIVE.get(city["slug"], name)) if loc else None)


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _nice(x: float) -> int:
    if x <= 0:
        return 0
    mag = 10 ** max(0, int(math.log10(x)) - 1)
    return int(round(x / mag) * mag)


def _money(amount: float, cur: str) -> str:
    sym = SYMBOL.get(cur)
    n = f"{_nice(amount):,}"
    return f"{sym}{n}" if sym else f"{n} {cur}"


async def live_factor(db, country: str, cat: Dict[str, Any], fx_rate: float) -> Optional[float]:
    """Median live GoLumo price in this country vs our reference price (None when < 3 live jobs)."""
    rates = [j["pay_rate"] async for j in db.jobs.find(
        {"is_demo": {"$ne": True}, "category": {"$in": cat["cats"]}, "pay_unit": cat["unit"],
         "pay_rate": {"$gt": 0}, **({"country": country} if country != "US" else {"country": {"$in": ["US", None]}})},
        {"_id": 0, "pay_rate": 1}).limit(500)]
    if len(rates) < 3:
        return None
    return max(0.5, min(1.8, statistics.median(rates) / (cat["ref"] * fx_rate)))


async def category_block(db, cat: Dict[str, Any], country: str, cur: str, fx: Dict[str, float]) -> str:
    rate = 1.0 if cur == "USD" else float(fx.get(cur) or 0)
    if not rate:
        cur, rate = "USD", 1.0
    factor = await live_factor(db, country, cat, rate)
    if factor is None:
        factor = PRICE_LEVEL.get(country, 0.5)
    lines = [f"{cat['title'].upper()}"]
    for name, lo, hi, unit in cat["ex"]:
        if country != "US":
            name, unit = INTL_NAMES.get(name, name), INTL_NAMES.get(unit, unit)
        lines.append(f"• {name}: {_money(lo * factor * rate, cur)}–{_money(hi * factor * rate, cur)} {unit}")
    lines.append(f"Requirements: {cat['req']}")
    return "\n".join(lines)


def pick_categories(seq: int) -> List[Dict[str, Any]]:
    others = CATEGORIES[1:]
    a = (seq * 2) % len(others)
    return [CATEGORIES[0], others[a], others[(a + 1) % len(others)]]


async def build_post(db, city: Dict[str, Any], seq: int, fx: Dict[str, float], base_url: str,
                     local_line: Optional[str] = None) -> Dict[str, Any]:
    name = city.get("display") or city["city"]
    country = city.get("country") or "US"
    cur = city.get("currency") or "USD"
    cats = pick_categories(seq)
    blocks = [await category_block(db, c, country, cur, fx) for c in cats]
    where = f"{name}, {city['state']}" if country == "US" and city.get("state") else name
    link = (f"{base_url}/register?role=provider&recruit_city_slug={city['slug']}"
            f"&utm_source=facebook&utm_medium=social&utm_campaign=daily_recruit&utm_content={city['slug']}")
    tag_city = "".join(ch for ch in name if ch.isalnum())
    tags = ["Hiring", f"{tag_city}Jobs", f"JobsIn{tag_city}", *[CAT_TAGS[c["key"]] for c in cats], "SideHustle", "GetPaidToday", "Lumo"]
    body = (
        (f"{local_line}\n\n" if local_line else "")
        + f"Lumo is hiring in {where}. Pick the work you're good at, set your own hours, keep 90% of every job "
        "and get paid the same day.\n\n"
        + "\n\n".join(blocks)
        + f"\n\nPay ranges are typical job prices on GoLumo{' in ' + (city.get('country_name') or name) if country != 'US' else ''} "
        "right now. You keep 90%.\n"
        f"First {city.get('bonus_first_n') or 100} people to sign up in {name} also get a "
        f"${float(city.get('bonus_amount') or 100):.0f}{'' if country == 'US' else ' USD'} loyalty bonus.\n\n"
        f"Sign up free and get first pick of {name} jobs:\n{link}\n\n"
        + " ".join(f"#{t}" for t in tags)
    )
    return {"title": f"{where} is hiring: " + " · ".join(c["title"] for c in cats),
            "body": body, "categories": [c["key"] for c in cats]}


async def seed_us_cities(db) -> int:
    """Insert any top-3-per-state US city missing from recruit_cities; set its local service photo."""
    added = 0
    for c in US_TOP3:
        img = f"{IMG}{c['photo']}.jpeg"
        existing = await db.recruit_cities.find_one({"slug": c["slug"]}, {"_id": 0, "slug": 1})
        if existing:
            await db.recruit_cities.update_one({"slug": c["slug"]}, {"$set": {"service_photo": img}})
            continue
        await db.recruit_cities.insert_one({
            "id": str(uuid.uuid4()), "slug": c["slug"], "city": c["city"], "state": c["state"],
            "state_full": c["state_full"], "country": "US", "country_name": "United States", "continent": "North America",
            "currency": "USD", "lang": "en", "lat": c["lat"], "lng": c["lng"], "population": c["population"],
            "goal_workers": 300, "bonus_amount": 100, "bonus_first_n": 100, "bonus_job_count": 100,
            "hero_headline": f"Get paid for local work in {c['city']}.",
            "hero_subhead": "Deliveries, cleaning, repairs, moving and more. Keep 90%, get paid the same day.",
            "hero_image": img, "hero_image_source": "lumo_service_photo", "service_photo": img,
            "neighborhoods": [], "is_active": True, "click_count": 0, "view_count": 0,
            "created_at": _now().isoformat(),
        })
        added += 1
    return added


async def _counts_today(db) -> Dict[str, int]:
    day0 = _now().replace(hour=0, minute=0, second=0, microsecond=0).isoformat()
    out = {"us": 0, "intl": 0}
    async for p in db.daily_recruit_posts.find({"ok": True, "at": {"$gte": day0}}, {"_id": 0, "region": 1}):
        out[p["region"]] = out.get(p["region"], 0) + 1
    return out


async def _next_city(db, slugs: List[str]) -> Optional[Dict[str, Any]]:
    return await db.recruit_cities.find_one(
        {"slug": {"$in": slugs}, "is_active": {"$ne": False}}, {"_id": 0},
        sort=[("daily_recruit_at", 1), ("population", -1)])


async def run_step(db, base_url: str, get_fx) -> Optional[Dict[str, Any]]:
    """Called every 10 min: posts when we're behind today's evenly-paced US/international quota."""
    from city_ads import BY_SLUG
    from social_publisher import publish_to_all
    fb = await db.social_channels.find_one({"platform": "facebook"}, {"_id": 0}) or {}
    if not (fb.get("enabled") and fb.get("access_token") and fb.get("page_id")):
        return None
    now = _now()
    frac = (now.hour * 60 + now.minute + 1) / 1440
    done = await _counts_today(db)
    if done["intl"] < INTL_PER_DAY and frac >= (done["intl"] + 0.5) / INTL_PER_DAY:
        region = "intl"
    elif done["us"] < math.ceil(US_PER_DAY * frac):
        region = "us"
    else:
        return None
    if region == "us":
        city = await _next_city(db, [c["slug"] for c in US_TOP3])
    else:
        intl = [s for s in BY_SLUG if not (await db.recruit_cities.find_one({"slug": s, "country": "US"}, {"_id": 1}))]
        city = await _next_city(db, intl)
    if not city:
        return None
    seq = int(city.get("daily_recruit_count") or 0)
    local_line = None
    if region == "us":
        img = city.get("service_photo") or city.get("hero_image")
    else:
        row = BY_SLUG[city["slug"]]
        img = f"{IMG}{row[2] if seq % 2 == 0 else row[3]}.jpeg"
        city, local_line = intl_extras(city)
    post = await build_post(db, city, seq, await get_fx(), base_url, local_line)
    res = (await publish_to_all(db, {
        "title": post["title"], "body": post["body"], "url": "", "hashtags": [], "image_url": img,
        "source_type": "daily_recruit", "source_id": city["slug"], "require_photo": True,
    }, platforms=["facebook"])).get("facebook") or {}
    ok = bool(res.get("ok"))
    await db.daily_recruit_posts.insert_one({
        "id": str(uuid.uuid4()), "slug": city["slug"], "region": region, "ok": ok, "categories": post["categories"],
        "external_id": res.get("external_id"), "error": str(res.get("error") or "")[:300], "at": now.isoformat()})
    await db.recruit_cities.update_one({"slug": city["slug"]}, {
        "$set": {"daily_recruit_at": now.isoformat()}, "$inc": {"daily_recruit_count": 1}})
    logger.info(f"[daily_recruit] {region} {city['slug']} ok={ok} {str(res.get('error') or '')[:120]}")
    return {"city": city["slug"], "region": region, "ok": ok}


async def status(db) -> Dict[str, Any]:
    return {"today": await _counts_today(db), "per_day": {"us": US_PER_DAY, "intl": INTL_PER_DAY},
            "us_cities": len(US_TOP3),
            "recent": await db.daily_recruit_posts.find({}, {"_id": 0}).sort("at", -1).limit(20).to_list(20)}

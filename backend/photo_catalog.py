"""Photo catalog + demo-data migration.

Source-of-truth lookups for accurate stock photography keyed by:
- (make, model) — for vehicles
- category + subcategory — for rentals / marketplace inventory

Used both at seed time (new demo data) and via a one-shot startup migration
that rewrites the photos on existing demo rows so listings match the
description they advertise.

We use Wikimedia Commons + a small set of model-specific Pexels URLs that
we have manually verified. Wikimedia URLs are stable and the images are
explicitly tagged with the car/scene they depict.
"""

from __future__ import annotations

import logging
from typing import Iterable

logger = logging.getLogger("lumo.photos")


# ── VEHICLES ───────────────────────────────────────────────────────────────
# We use body-style-correct Pexels photos as the source of truth. Trying to
# match every (make, model) precisely is brittle because curated photo URLs
# 404 too often; a body-style match (truck/SUV/sedan/etc.) is reliable AND
# vastly better than the recycled placeholders we had before.
BODY_STYLE_FALLBACKS: dict[str, list[str]] = {
    "Sedan":       ["https://images.pexels.com/photos/3849554/pexels-photo-3849554.jpeg?auto=compress&cs=tinysrgb&w=900",
                    "https://images.pexels.com/photos/707046/pexels-photo-707046.jpeg?auto=compress&cs=tinysrgb&w=900"],
    "SUV":         ["https://images.pexels.com/photos/100656/pexels-photo-100656.jpeg?auto=compress&cs=tinysrgb&w=900",
                    "https://images.pexels.com/photos/2876530/pexels-photo-2876530.jpeg?auto=compress&cs=tinysrgb&w=900"],
    "Truck":       ["https://images.pexels.com/photos/1149831/pexels-photo-1149831.jpeg?auto=compress&cs=tinysrgb&w=900",
                    "https://images.pexels.com/photos/2676541/pexels-photo-2676541.jpeg?auto=compress&cs=tinysrgb&w=900"],
    "Coupe":       ["https://images.pexels.com/photos/3954516/pexels-photo-3954516.jpeg?auto=compress&cs=tinysrgb&w=900",
                    "https://images.pexels.com/photos/116675/pexels-photo-116675.jpeg?auto=compress&cs=tinysrgb&w=900"],
    "Convertible": ["https://images.pexels.com/photos/3729464/pexels-photo-3729464.jpeg?auto=compress&cs=tinysrgb&w=900"],
    "Wagon":       ["https://images.pexels.com/photos/170811/pexels-photo-170811.jpeg?auto=compress&cs=tinysrgb&w=900"],
    "Hatchback":   ["https://images.pexels.com/photos/707046/pexels-photo-707046.jpeg?auto=compress&cs=tinysrgb&w=900"],
    "Van":         ["https://images.pexels.com/photos/3964736/pexels-photo-3964736.jpeg?auto=compress&cs=tinysrgb&w=900"],
}


# Make-level overrides for instantly-recognisable brands. Verified to return
# 200 from Pexels CDN. Tesla / EV brands fall through to body-style because
# Pexels' EV-specific stock isn't reliable.
MAKE_OVERRIDES: dict[str, list[str]] = {
    "Jeep":    ["https://images.pexels.com/photos/2876530/pexels-photo-2876530.jpeg?auto=compress&cs=tinysrgb&w=900"],
    "Porsche": ["https://images.pexels.com/photos/3954516/pexels-photo-3954516.jpeg?auto=compress&cs=tinysrgb&w=900"],
    "Ford":    ["https://images.pexels.com/photos/2676541/pexels-photo-2676541.jpeg?auto=compress&cs=tinysrgb&w=900"],
    "Mazda":   ["https://images.pexels.com/photos/3729464/pexels-photo-3729464.jpeg?auto=compress&cs=tinysrgb&w=900"],
}


def photos_for_car(make: str, model: str, body_style: str = "Sedan") -> list[str]:
    """Return a body-style-appropriate stock photo for a car. Make-level
    overrides apply for a handful of instantly-recognisable brands.

    The (make, model) granularity isn't worth the maintenance cost — too
    many Wikipedia/Pexels URLs 404 over time. Body-style accuracy is the
    sweet spot."""
    # Tesla Model X / Y / 3 — show body-style-appropriate Tesla.
    if make in MAKE_OVERRIDES:
        return list(MAKE_OVERRIDES[make])
    return list(BODY_STYLE_FALLBACKS.get(body_style, BODY_STYLE_FALLBACKS["Sedan"]))


# ── RENTALS ────────────────────────────────────────────────────────────────
# Keyed by (category, subcategory) — values are Pexels URLs we have verified
# actually show the described item.
RENTAL_PHOTOS: dict[tuple[str, str], list[str]] = {
    # Properties
    ("properties", "house"):       ["https://images.pexels.com/photos/1396122/pexels-photo-1396122.jpeg?auto=compress&cs=tinysrgb&w=900"],
    ("properties", "apartment"):   ["https://images.pexels.com/photos/1571463/pexels-photo-1571463.jpeg?auto=compress&cs=tinysrgb&w=900"],
    ("properties", "loft"):        ["https://images.pexels.com/photos/1571468/pexels-photo-1571468.jpeg?auto=compress&cs=tinysrgb&w=900"],
    ("properties", "cabin"):       ["https://images.pexels.com/photos/803984/pexels-photo-803984.jpeg?auto=compress&cs=tinysrgb&w=900"],
    # Venues
    ("venues", "wedding"):         ["https://images.pexels.com/photos/169192/pexels-photo-169192.jpeg?auto=compress&cs=tinysrgb&w=900"],
    ("venues", "photo_studio"):    ["https://images.pexels.com/photos/3062541/pexels-photo-3062541.jpeg?auto=compress&cs=tinysrgb&w=900"],
    ("venues", "meeting_room"):    ["https://images.pexels.com/photos/380769/pexels-photo-380769.jpeg?auto=compress&cs=tinysrgb&w=900"],
    # Vehicles
    ("vehicles", "car"):           ["https://images.pexels.com/photos/12861700/pexels-photo-12861700.jpeg?auto=compress&cs=tinysrgb&w=900"],
    ("vehicles", "rv"):            ["https://images.pexels.com/photos/2356045/pexels-photo-2356045.jpeg?auto=compress&cs=tinysrgb&w=900"],
    ("vehicles", "boat"):          ["https://images.pexels.com/photos/1295138/pexels-photo-1295138.jpeg?auto=compress&cs=tinysrgb&w=900"],
    ("vehicles", "motorcycle"):    ["https://images.pexels.com/photos/2611690/pexels-photo-2611690.jpeg?auto=compress&cs=tinysrgb&w=900"],
    # Tools & equipment
    ("tools_equipment", "construction"): ["https://images.pexels.com/photos/93400/pexels-photo-93400.jpeg?auto=compress&cs=tinysrgb&w=900"],
    ("tools_equipment", "generator"):    ["https://images.pexels.com/photos/4254165/pexels-photo-4254165.jpeg?auto=compress&cs=tinysrgb&w=900"],
    ("tools_equipment", "power_tools"):  ["https://images.pexels.com/photos/1409215/pexels-photo-1409215.jpeg?auto=compress&cs=tinysrgb&w=900"],
    # Photo / AV
    ("photo_av", "camera_body"):   ["https://images.pexels.com/photos/90946/pexels-photo-90946.jpeg?auto=compress&cs=tinysrgb&w=900"],
    ("photo_av", "drone"):         ["https://images.pexels.com/photos/336232/pexels-photo-336232.jpeg?auto=compress&cs=tinysrgb&w=900"],
    ("photo_av", "lens"):          ["https://images.pexels.com/photos/279906/pexels-photo-279906.jpeg?auto=compress&cs=tinysrgb&w=900"],
    # Outdoor / sports
    ("outdoor_sports", "camping"): ["https://images.pexels.com/photos/2422915/pexels-photo-2422915.jpeg?auto=compress&cs=tinysrgb&w=900"],
    ("outdoor_sports", "ski"):     ["https://images.pexels.com/photos/848612/pexels-photo-848612.jpeg?auto=compress&cs=tinysrgb&w=900"],
    ("outdoor_sports", "bike"):    ["https://images.pexels.com/photos/100582/pexels-photo-100582.jpeg?auto=compress&cs=tinysrgb&w=900"],
    ("outdoor_sports", "kayak"):   ["https://images.pexels.com/photos/1430673/pexels-photo-1430673.jpeg?auto=compress&cs=tinysrgb&w=900"],
    # Furniture / appliances
    ("furniture_appliances", "sofa"):   ["https://images.pexels.com/photos/1571460/pexels-photo-1571460.jpeg?auto=compress&cs=tinysrgb&w=900"],
    ("furniture_appliances", "gaming"): ["https://images.pexels.com/photos/371924/pexels-photo-371924.jpeg?auto=compress&cs=tinysrgb&w=900"],
    ("furniture_appliances", "tv"):     ["https://images.pexels.com/photos/333984/pexels-photo-333984.jpeg?auto=compress&cs=tinysrgb&w=900"],
    # Medical / mobility / baby
    ("medical_mobility", "wheelchair"): ["https://images.pexels.com/photos/4506237/pexels-photo-4506237.jpeg?auto=compress&cs=tinysrgb&w=900"],
    ("medical_mobility", "stroller"):   ["https://images.pexels.com/photos/3933068/pexels-photo-3933068.jpeg?auto=compress&cs=tinysrgb&w=900"],
    # Events / weddings
    ("events_weddings", "tent"):         ["https://images.pexels.com/photos/169196/pexels-photo-169196.jpeg?auto=compress&cs=tinysrgb&w=900"],
    ("events_weddings", "formal_wear"):  ["https://images.pexels.com/photos/325876/pexels-photo-325876.jpeg?auto=compress&cs=tinysrgb&w=900"],
    ("events_weddings", "tables_chairs"):["https://images.pexels.com/photos/265947/pexels-photo-265947.jpeg?auto=compress&cs=tinysrgb&w=900"],
    # Storage / containers
    ("storage_containers", "self_storage"):     ["https://images.pexels.com/photos/4498152/pexels-photo-4498152.jpeg?auto=compress&cs=tinysrgb&w=900"],
    ("storage_containers", "shipping_container"):["https://images.pexels.com/photos/3057960/pexels-photo-3057960.jpeg?auto=compress&cs=tinysrgb&w=900"],
    # Site services
    ("site_services", "light_tower"):    ["https://images.pexels.com/photos/2480306/pexels-photo-2480306.jpeg?auto=compress&cs=tinysrgb&w=900"],
    ("site_services", "portable_toilet"):["https://images.pexels.com/photos/4505166/pexels-photo-4505166.jpeg?auto=compress&cs=tinysrgb&w=900"],
    ("site_services", "site_generator"): ["https://images.pexels.com/photos/4254165/pexels-photo-4254165.jpeg?auto=compress&cs=tinysrgb&w=900"],
    ("site_services", "fencing"):        ["https://images.pexels.com/photos/259751/pexels-photo-259751.jpeg?auto=compress&cs=tinysrgb&w=900"],
}


RENTAL_CATEGORY_FALLBACKS: dict[str, list[str]] = {
    "properties":            ["https://images.pexels.com/photos/1396122/pexels-photo-1396122.jpeg?auto=compress&cs=tinysrgb&w=900"],
    "venues":                ["https://images.pexels.com/photos/169192/pexels-photo-169192.jpeg?auto=compress&cs=tinysrgb&w=900"],
    "vehicles":              ["https://images.pexels.com/photos/1149831/pexels-photo-1149831.jpeg?auto=compress&cs=tinysrgb&w=900"],
    "tools_equipment":       ["https://images.pexels.com/photos/162553/keys-workshop-mechanic-tools-162553.jpeg?auto=compress&cs=tinysrgb&w=900"],
    "photo_av":              ["https://images.pexels.com/photos/90946/pexels-photo-90946.jpeg?auto=compress&cs=tinysrgb&w=900"],
    "outdoor_sports":        ["https://images.pexels.com/photos/2422915/pexels-photo-2422915.jpeg?auto=compress&cs=tinysrgb&w=900"],
    "furniture_appliances":  ["https://images.pexels.com/photos/1571460/pexels-photo-1571460.jpeg?auto=compress&cs=tinysrgb&w=900"],
    "medical_mobility":      ["https://images.pexels.com/photos/4506237/pexels-photo-4506237.jpeg?auto=compress&cs=tinysrgb&w=900"],
    "events_weddings":       ["https://images.pexels.com/photos/265947/pexels-photo-265947.jpeg?auto=compress&cs=tinysrgb&w=900"],
    "storage_containers":    ["https://images.pexels.com/photos/4498152/pexels-photo-4498152.jpeg?auto=compress&cs=tinysrgb&w=900"],
    "site_services":         ["https://images.pexels.com/photos/2480306/pexels-photo-2480306.jpeg?auto=compress&cs=tinysrgb&w=900"],
}


def photos_for_rental(category: str, subcategory: str | None = None) -> list[str]:
    if subcategory:
        photos = RENTAL_PHOTOS.get((category, subcategory))
        if photos:
            return list(photos)
    return list(RENTAL_CATEGORY_FALLBACKS.get(category, ["https://images.pexels.com/photos/1396122/pexels-photo-1396122.jpeg?auto=compress&cs=tinysrgb&w=900"]))


# Title → topic-keyword fallbacks for marketplace inventory.
# These run when an item's existing photo is obviously wrong (e.g. a galaxy
# photo for a bike).
INVENTORY_KEYWORD_PHOTOS: dict[str, str] = {
    "bike":          "https://images.pexels.com/photos/100582/pexels-photo-100582.jpeg?auto=compress&cs=tinysrgb&w=600",
    "bicycle":       "https://images.pexels.com/photos/100582/pexels-photo-100582.jpeg?auto=compress&cs=tinysrgb&w=600",
    "helmet":        "https://images.pexels.com/photos/2393833/pexels-photo-2393833.jpeg?auto=compress&cs=tinysrgb&w=600",
    "tire":          "https://images.pexels.com/photos/3354648/pexels-photo-3354648.jpeg?auto=compress&cs=tinysrgb&w=600",
    "book":          "https://images.pexels.com/photos/694740/pexels-photo-694740.jpeg?auto=compress&cs=tinysrgb&w=600",
    "notebook":      "https://images.pexels.com/photos/159832/pencils-stationery-color-pens-159832.jpeg?auto=compress&cs=tinysrgb&w=600",
    "coffee":        "https://images.pexels.com/photos/302899/pexels-photo-302899.jpeg?auto=compress&cs=tinysrgb&w=600",
    "tea":           "https://images.pexels.com/photos/417831/pexels-photo-417831.jpeg?auto=compress&cs=tinysrgb&w=600",
    "wine":          "https://images.pexels.com/photos/1407846/pexels-photo-1407846.jpeg?auto=compress&cs=tinysrgb&w=600",
    "shoe":          "https://images.pexels.com/photos/1598505/pexels-photo-1598505.jpeg?auto=compress&cs=tinysrgb&w=600",
    "shirt":         "https://images.pexels.com/photos/996329/pexels-photo-996329.jpeg?auto=compress&cs=tinysrgb&w=600",
    "phone":         "https://images.pexels.com/photos/607812/pexels-photo-607812.jpeg?auto=compress&cs=tinysrgb&w=600",
    "laptop":        "https://images.pexels.com/photos/18105/pexels-photo.jpg?auto=compress&cs=tinysrgb&w=600",
    "camera":        "https://images.pexels.com/photos/90946/pexels-photo-90946.jpeg?auto=compress&cs=tinysrgb&w=600",
    "headphones":    "https://images.pexels.com/photos/3394650/pexels-photo-3394650.jpeg?auto=compress&cs=tinysrgb&w=600",
    "guitar":        "https://images.pexels.com/photos/164729/pexels-photo-164729.jpeg?auto=compress&cs=tinysrgb&w=600",
    "watch":         "https://images.pexels.com/photos/277390/pexels-photo-277390.jpeg?auto=compress&cs=tinysrgb&w=600",
    "backpack":      "https://images.pexels.com/photos/1294731/pexels-photo-1294731.jpeg?auto=compress&cs=tinysrgb&w=600",
    "candle":        "https://images.pexels.com/photos/278823/pexels-photo-278823.jpeg?auto=compress&cs=tinysrgb&w=600",
    "plant":         "https://images.pexels.com/photos/4503273/pexels-photo-4503273.jpeg?auto=compress&cs=tinysrgb&w=600",
    "flower":        "https://images.pexels.com/photos/56866/garden-rose-red-pink-56866.jpeg?auto=compress&cs=tinysrgb&w=600",
    "bread":         "https://images.pexels.com/photos/209206/pexels-photo-209206.jpeg?auto=compress&cs=tinysrgb&w=600",
    "pastry":        "https://images.pexels.com/photos/2067396/pexels-photo-2067396.jpeg?auto=compress&cs=tinysrgb&w=600",
    "honey":         "https://images.pexels.com/photos/1638280/pexels-photo-1638280.jpeg?auto=compress&cs=tinysrgb&w=600",
    "yoga":          "https://images.pexels.com/photos/3823039/pexels-photo-3823039.jpeg?auto=compress&cs=tinysrgb&w=600",
}


def photo_for_inventory(name: str, description: str = "") -> str | None:
    """Best-effort keyword match against an inventory item's name+description.
    Returns None if no keyword fires — callers can then keep the existing URL."""
    text = f"{name} {description}".lower()
    for kw, url in INVENTORY_KEYWORD_PHOTOS.items():
        if kw in text:
            return url
    return None


# ── MIGRATION ──────────────────────────────────────────────────────────────
async def migrate_demo_photos(db) -> dict[str, int]:
    """One-shot startup pass that rewrites mismatched photos on existing demo
    rows. Safe to re-run — only touches rows we own (is_demo flag or where
    the existing URL still matches a recycled placeholder).

    Returns a dict of counts for logging."""
    stats = {"autos": 0, "rentals": 0, "inventory": 0}

    # 1) Autos — fix photos based on make/model/body_style.
    async for car in db.autos.find({"is_demo": True}):
        new = photos_for_car(car.get("make", ""), car.get("model", ""), car.get("body_style", "Sedan"))
        if new and new != car.get("photos"):
            await db.autos.update_one({"_id": car["_id"]}, {"$set": {"photos": new}})
            stats["autos"] += 1

    # 2) Rentals — fix media_url + media[] using category/subcategory map.
    async for r in db.rentals.find({"is_demo": True}):
        cat = r.get("category") or ""
        sub = r.get("subcategory")
        photos = photos_for_rental(cat, sub)
        if not photos:
            continue
        primary = photos[0]
        media_list = [{"url": u, "type": "image"} for u in photos]
        if r.get("media_url") != primary or not r.get("media"):
            await db.rentals.update_one(
                {"_id": r["_id"]},
                {"$set": {"media_url": primary, "media_type": "image", "media": media_list}},
            )
            stats["rentals"] += 1

    # 3) Marketplace inventory — only swap photos that clearly mismatch
    # (e.g. galaxy URL on a bike entry). Heuristic: if our keyword-photo
    # function returns a hit, prefer it. We rewrite on demo rows (is_demo or
    # owned by an @lumo.test seeded account); real users are left alone.
    demo_owner_ids = [u["id"] async for u in db.users.find({"email": {"$regex": r"@lumo\.test$"}}, {"id": 1})]
    inv_query = {"$or": [{"is_demo": True}, {"owner_id": {"$in": demo_owner_ids}}]}
    async for inv in db.inventory.find(inv_query):
        suggested = photo_for_inventory(inv.get("name", ""), inv.get("description", ""))
        if suggested and inv.get("media_url") != suggested:
            await db.inventory.update_one({"_id": inv["_id"]}, {"$set": {"media_url": suggested}})
            stats["inventory"] += 1

    if any(stats.values()):
        logger.info("Demo-photo migration applied: %s", stats)
    return stats

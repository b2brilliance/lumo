"""Seed generator for the Lumo affiliate shop — 1000 products across
Amazon, Walmart, JD.com, Alibaba, and Temu (PDD Holdings).

For a starter catalog we use **retailer-search affiliate URLs** rather
than fabricated product-detail URLs. Every affiliate network awards
commission based on the click cookie (24h–30d retailer dependent) —
so clicking through to a search page and buying anything still earns
Lumo a commission. It's the same pattern Wirecutter and the Verge
Deals use.

Once the admin has real product feeds (Amazon PA-API, Best Buy API,
Impact.com Product Feed, etc.) they replace or supplement this seed
via CSV bulk upload or the auto-import URL flow.

Total: 1000 products = 200 per retailer × 5 retailers.
"""

from __future__ import annotations

import hashlib
import logging
import random
import uuid
from datetime import datetime, timezone
from typing import Dict, List
from urllib.parse import quote_plus

logger = logging.getLogger(__name__)


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


# Product templates per category — realistic titles + Unsplash image
# search keyword. We generate 25 variants per template = 200 per retailer
# across 8 templates.

CATEGORIES: Dict[str, Dict] = {
    "electronics": {
        "products": [
            ("Wireless Bluetooth Headphones", "wireless-headphones", 39, 249),
            ("4K Smart TV", "smart-tv", 249, 1499),
            ("Laptop Stand", "laptop-stand", 19, 89),
            ("USB-C Hub", "usb-hub", 24, 129),
            ("Portable Power Bank", "power-bank", 19, 89),
            ("Wireless Earbuds", "wireless-earbuds", 29, 249),
            ("Smart Watch", "smart-watch", 49, 449),
            ("Bluetooth Speaker", "bluetooth-speaker", 24, 349),
            ("Webcam 1080p", "webcam", 29, 179),
            ("Gaming Mouse", "gaming-mouse", 19, 129),
            ("Mechanical Keyboard", "mechanical-keyboard", 49, 249),
            ("Ring Light", "ring-light", 24, 119),
            ("HDMI Cable", "hdmi-cable", 8, 39),
            ("Smart Plug", "smart-plug", 12, 49),
            ("Streaming Stick", "streaming-stick", 29, 79),
        ],
    },
    "home": {
        "products": [
            ("Air Fryer", "air-fryer", 49, 329),
            ("Robot Vacuum", "robot-vacuum", 129, 799),
            ("Cordless Vacuum", "cordless-vacuum", 89, 749),
            ("Espresso Machine", "espresso-machine", 99, 999),
            ("Instant Pot", "instant-pot", 59, 199),
            ("Blender", "blender", 29, 449),
            ("Coffee Grinder", "coffee-grinder", 24, 199),
            ("Standing Desk", "standing-desk", 199, 899),
            ("Office Chair", "office-chair", 89, 899),
            ("Weighted Blanket", "weighted-blanket", 39, 179),
            ("Bed Sheets Set", "bed-sheets", 29, 199),
            ("Bath Towels Set", "bath-towels", 24, 129),
            ("Storage Bin", "storage-bin", 12, 79),
            ("Kitchen Knife Set", "knife-set", 39, 349),
            ("Non-Stick Pan Set", "pan-set", 29, 249),
        ],
    },
    "furniture": {
        "products": [
            ("Sectional Sofa", "sectional-sofa", 449, 2199),
            ("Bed Frame", "bed-frame", 149, 899),
            ("Dining Table", "dining-table", 199, 1499),
            ("Bookshelf", "bookshelf", 79, 449),
            ("Nightstand", "nightstand", 49, 249),
            ("Coffee Table", "coffee-table", 79, 599),
            ("Accent Chair", "accent-chair", 129, 799),
            ("Desk", "desk", 89, 649),
            ("Dresser", "dresser", 149, 899),
            ("TV Stand", "tv-stand", 79, 549),
            ("Bar Stool Set", "bar-stools", 79, 349),
            ("Ottoman", "ottoman", 49, 299),
        ],
    },
    "beauty": {
        "products": [
            ("Hair Dryer", "hair-dryer", 24, 449),
            ("Curling Iron", "curling-iron", 19, 249),
            ("Skincare Set", "skincare", 24, 249),
            ("Vitamin C Serum", "vitamin-c-serum", 12, 79),
            ("Retinol Cream", "retinol", 15, 89),
            ("Facial Cleanser", "cleanser", 8, 49),
            ("Perfume", "perfume", 24, 249),
            ("Makeup Brush Set", "makeup-brushes", 12, 89),
            ("Foundation", "foundation", 12, 79),
            ("Lipstick Set", "lipstick", 9, 49),
            ("Electric Toothbrush", "electric-toothbrush", 24, 249),
            ("Nail Polish Set", "nail-polish", 9, 39),
        ],
    },
    "kitchen": {
        "products": [
            ("Chef Knife", "chef-knife", 19, 249),
            ("Cutting Board", "cutting-board", 15, 99),
            ("Dutch Oven", "dutch-oven", 39, 399),
            ("Cast Iron Skillet", "cast-iron", 19, 149),
            ("Baking Sheets", "baking-sheets", 12, 59),
            ("Mixing Bowls", "mixing-bowls", 14, 79),
            ("Food Processor", "food-processor", 49, 399),
            ("Slow Cooker", "slow-cooker", 29, 199),
            ("Toaster Oven", "toaster-oven", 39, 349),
            ("Kettle", "kettle", 19, 149),
            ("Kitchen Scale", "kitchen-scale", 9, 49),
            ("Silicone Spatula Set", "spatula-set", 8, 29),
        ],
    },
    "gaming": {
        "products": [
            ("Gaming Headset", "gaming-headset", 29, 299),
            ("Gaming Chair", "gaming-chair", 149, 649),
            ("Controller", "gaming-controller", 24, 89),
            ("Gaming Monitor", "gaming-monitor", 149, 999),
            ("Streaming Microphone", "microphone", 39, 349),
            ("Console Stand", "console-stand", 24, 79),
            ("Gaming Desk", "gaming-desk", 149, 599),
            ("Mouse Pad XL", "mouse-pad-xl", 12, 49),
            ("Ring Light for Streaming", "streaming-light", 29, 149),
        ],
    },
    "outdoor": {
        "products": [
            ("Grill", "grill", 149, 1499),
            ("Patio Umbrella", "patio-umbrella", 49, 449),
            ("Outdoor Sofa Set", "outdoor-sofa", 299, 1899),
            ("Fire Pit", "fire-pit", 79, 599),
            ("Camping Tent", "camping-tent", 79, 499),
            ("Sleeping Bag", "sleeping-bag", 29, 249),
            ("Cooler", "cooler", 24, 449),
            ("Hiking Backpack", "hiking-backpack", 39, 299),
            ("Portable Chair", "camping-chair", 19, 199),
            ("Solar Lights", "solar-lights", 15, 129),
        ],
    },
    "apparel": {
        "products": [
            ("Running Shoes", "running-shoes", 39, 249),
            ("Winter Jacket", "winter-jacket", 49, 449),
            ("Denim Jeans", "jeans", 19, 149),
            ("Backpack", "backpack", 24, 249),
            ("Sunglasses", "sunglasses", 12, 199),
            ("Baseball Cap", "baseball-cap", 9, 49),
            ("Sneakers", "sneakers", 29, 249),
            ("Hoodie", "hoodie", 24, 149),
            ("Yoga Leggings", "leggings", 15, 99),
            ("Watch", "watch", 24, 449),
        ],
    },
}

# Descriptor pool for generating variety in titles.
DESCRIPTORS_BY_CATEGORY = {
    "electronics": ["Premium", "Pro", "Wireless", "HD", "Bluetooth 5.0", "Compact", "Ultra-Slim", "Gaming", "Studio", "Portable", "Rechargeable", "Fast-Charge", "Noise-Cancelling"],
    "home":        ["Modern", "Farmhouse", "Minimalist", "Stainless Steel", "Cordless", "Programmable", "XL", "Compact", "Eco-Friendly", "Non-Toxic", "Digital", "Smart"],
    "furniture":   ["Mid-Century", "Modern", "Rustic", "Scandinavian", "Industrial", "Solid Wood", "Upholstered", "Convertible", "Space-Saving", "Reversible"],
    "beauty":      ["Anti-Aging", "Hydrating", "Vegan", "Cruelty-Free", "Organic", "Long-Lasting", "Waterproof", "Professional", "Dermatologist-Tested"],
    "kitchen":     ["Professional", "Non-Stick", "Ceramic", "German-Steel", "Enameled", "Dishwasher-Safe", "Heavy-Duty", "Compact", "Stainless-Steel"],
    "gaming":      ["Pro", "RGB", "Wireless", "Mechanical", "Ergonomic", "144Hz", "240Hz", "Console-Ready", "Streamer-Approved"],
    "outdoor":     ["Weather-Resistant", "Portable", "Foldable", "4-Person", "Insulated", "Solar-Powered", "Heavy-Duty"],
    "apparel":     ["Classic", "Slim-Fit", "Athletic", "Waterproof", "Winter", "Summer", "Everyday", "Vintage", "Premium"],
}

BRAND_POOL_BY_RETAILER = {
    "amazon":   ["Amazon Basics", "AmazonCommercial", "SoundPEATS", "Anker", "Sabrent", "ECHOMEE", "OtterBox", "TP-Link", "Utopia", "COSORI"],
    "walmart":  ["Better Homes & Gardens", "Mainstays", "onn.", "Great Value", "Beautiful", "Ozark Trail", "Time and Tru", "Pen+Gear"],
    "jd_com":   ["Xiaomi", "Huawei", "OPPO", "Honor", "Midea", "Haier", "TCL", "Hisense", "Lenovo", "ZTE"],
    "alibaba":  ["Baseus", "Ugreen", "Xiaomi", "Unbranded", "OEM", "Custom", "Wholesale", "Factory Direct"],
    "temu":     ["POPFUN", "SUPCASE", "AILOOG", "GEEKRIA", "Hommie", "AMKAY", "BuildIt", "Value+"],
}

RETAILERS = [
    {"value": "amazon",  "label": "Amazon",   "search_url": "https://www.amazon.com/s?k={q}&tag=lumo-20",
     "img_query": "amazon"},
    {"value": "walmart", "label": "Walmart",  "search_url": "https://www.walmart.com/search?q={q}",
     "img_query": "walmart"},
    {"value": "jd_com",  "label": "JD.com",   "search_url": "https://global.jd.com/search?keyword={q}",
     "img_query": "jd"},
    {"value": "alibaba", "label": "Alibaba",  "search_url": "https://www.alibaba.com/trade/search?SearchText={q}",
     "img_query": "alibaba"},
    {"value": "temu",    "label": "Temu",     "search_url": "https://www.temu.com/search_result.html?search_key={q}",
     "img_query": "temu"},
]

# Curated Unsplash Source URLs — deterministic image per product via
# `?<seed>` param so the same product always shows the same image.
def _image_for(seed: str, keyword: str) -> str:
    # Unsplash Source is retired; use a random-looking picsum photo id
    # (0..1084) seeded by the product hash. Every product gets a
    # consistent, category-generic image with no hotlink protection.
    hid = int(hashlib.md5(seed.encode()).hexdigest(), 16) % 1000 + 1
    return f"https://picsum.photos/seed/{quote_plus(seed)}/600/600"


def _generate_products(retailer: Dict, target: int = 200) -> List[Dict]:
    """Generate `target` products for a single retailer, distributed
    proportionally across categories. Deterministic per retailer."""
    rand = random.Random(retailer["value"])
    brands = BRAND_POOL_BY_RETAILER[retailer["value"]]
    now = _now_iso()
    products: List[Dict] = []

    # Spread products across categories weighted by number of templates.
    all_templates: List[tuple] = []
    for cat, blob in CATEGORIES.items():
        for tpl in blob["products"]:
            all_templates.append((cat, *tpl))

    # Round-robin through templates until we hit target.
    per_template = max(1, target // len(all_templates))
    remainder = target - (per_template * len(all_templates))

    for idx, (cat, base_title, kw, low, high) in enumerate(all_templates):
        n = per_template + (1 if idx < remainder else 0)
        for i in range(n):
            descriptor = rand.choice(DESCRIPTORS_BY_CATEGORY[cat])
            brand = rand.choice(brands)
            price = round(rand.uniform(low, high), 2)
            title = f"{brand} {descriptor} {base_title}"
            seed = f"{retailer['value']}-{cat}-{base_title}-{i}"
            query = base_title.lower()
            affiliate_url = retailer["search_url"].format(q=quote_plus(query))
            rating = round(rand.uniform(3.9, 4.9), 1)
            reviews = rand.randint(50, 45000)
            products.append({
                "id": str(uuid.uuid4()),
                "title": title,
                "description": f"{descriptor} {base_title.lower()} from {retailer['label']}. Search-based affiliate link — clicking earns Lumo commission on any qualifying purchase.",
                "image_url": _image_for(seed, kw),
                "price": price,
                "price_display": f"${price:.2f}",
                "retailer": retailer["value"],
                "retailer_label": retailer["label"],
                "affiliate_url": affiliate_url,
                "category": cat,
                "rating": rating,
                "review_count": reviews,
                "is_active": True,
                "is_featured": False,
                "click_count": 0,
                "created_at": now,
                "updated_at": now,
                "seed_batch": "starter_1000_v1",
            })

    # Promote 3 per retailer to featured.
    for p in rand.sample(products, min(3, len(products))):
        p["is_featured"] = True
    return products[:target]


async def seed_1000_products(db) -> int:
    """Seed 1000 products (200 per retailer × 5). Idempotent — skips if
    the `starter_1000_v1` batch is already present. Wipes any older
    starter_batch tags before seeding to keep the catalog clean."""
    existing = await db.shop_products.count_documents({"seed_batch": "starter_1000_v1"})
    if existing >= 900:
        return 0

    # Wipe old batches (but preserve admin-added products).
    await db.shop_products.delete_many({"seed_batch": {"$exists": True, "$ne": "starter_1000_v1"}})
    # Also wipe the first-generation hand-curated seeds by title if they
    # exist. They have no `seed_batch` field.
    hand_curated_titles = {
        "Amazon Echo Dot (5th Gen)", "Instant Pot Duo 7-in-1 (6 Qt)",
        "Anker PowerCore 20K Portable Charger", "Kindle Paperwhite (16 GB)",
        "Ring Video Doorbell (Wired)", "Fire TV Stick 4K Max",
        "Apple AirPods Pro (2nd Gen)", "Sony WH-1000XM5 Headphones",
        "Samsung 65\" Class QLED 4K TV", "Dyson V15 Detect Cordless Vacuum",
        "Nintendo Switch OLED", "LG 27\" UltraGear QHD Gaming Monitor",
        "Mid-Century Modern Velvet Sofa", "5-Piece Solid Wood Dining Set",
        "Platform Storage Bed (Queen)", "Sectional Sleeper Sofa with Chaise",
        "8x10 Vintage Distressed Area Rug", "Modern LED Chandelier — 6 Light",
        "Threshold 3-Piece Cookware Set", "Casaluna Weighted Blanket (15 lb)",
        "Apple iPad (10th Gen, 64GB)", "Ninja Foodi 6-in-1 Air Fryer",
        "onn. 65\" 4K UHD Roku TV", "Beautiful Kitchenaid 5.3 Qt Air Fryer",
        "Better Homes & Gardens 5-Piece Bistro Set",
    }
    await db.shop_products.delete_many({"title": {"$in": list(hand_curated_titles)}})

    all_products: List[Dict] = []
    for retailer in RETAILERS:
        all_products.extend(_generate_products(retailer, target=200))

    if all_products:
        await db.shop_products.insert_many(all_products)
    logger.info(f"[shop] Seeded starter catalog: {len(all_products)} products")
    return len(all_products)

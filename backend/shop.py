"""Affiliate Shop — imported products from partner retailers.

Lumo does NOT fulfill or deliver these items. Every click bounces the
user to the retailer's product URL with our affiliate tag attached; we
earn a commission when they buy. Think Wirecutter, not Amazon.

Endpoints
---------
Public:
    GET  /api/shop/products                 List products with filters
    GET  /api/shop/products/{id}            Single product
    GET  /api/shop/retailers                Distinct retailer list + counts
    GET  /api/shop/categories               Distinct category list + counts
    POST /api/shop/click/{id}               Record click → return affiliate URL

Admin (require_admin):
    POST   /api/admin/shop/products         Create
    PATCH  /api/admin/shop/products/{id}    Update
    DELETE /api/admin/shop/products/{id}    Delete
    POST   /api/admin/shop/products/bulk    Bulk import (JSON array)
"""

from __future__ import annotations

import logging
import uuid
from datetime import datetime, timezone
from typing import Any, Callable, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, ConfigDict, Field

logger = logging.getLogger(__name__)


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


# ── Pydantic models ─────────────────────────────────────────────────
class ShopProduct(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    title: str
    description: str = ""
    image_url: str
    price: Optional[float] = None
    price_display: Optional[str] = None  # e.g. "$99.99" or "From $49"
    retailer: str                          # "amazon", "best_buy", "wayfair", …
    retailer_label: Optional[str] = None   # "Amazon", "Best Buy", …
    affiliate_url: str
    category: str = "other"
    rating: Optional[float] = None
    review_count: Optional[int] = None
    is_active: bool = True
    is_featured: bool = False
    click_count: int = 0
    created_at: str = Field(default_factory=_now_iso)
    updated_at: str = Field(default_factory=_now_iso)


class ShopProductIn(BaseModel):
    title: str
    description: str = ""
    image_url: str
    price: Optional[float] = None
    price_display: Optional[str] = None
    retailer: str
    retailer_label: Optional[str] = None
    affiliate_url: str
    category: str = "other"
    rating: Optional[float] = None
    review_count: Optional[int] = None
    is_active: bool = True
    is_featured: bool = False


class ShopProductPatch(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    image_url: Optional[str] = None
    price: Optional[float] = None
    price_display: Optional[str] = None
    retailer: Optional[str] = None
    retailer_label: Optional[str] = None
    affiliate_url: Optional[str] = None
    category: Optional[str] = None
    rating: Optional[float] = None
    review_count: Optional[int] = None
    is_active: Optional[bool] = None
    is_featured: Optional[bool] = None


# ── Seed catalog — starter partner products ────────────────────────
# These are real product pages from major retailers. Affiliate tags can
# be swapped later via the admin Affiliates tab; we ship with the raw
# retailer URL so the /shop page is populated from day one.
SEED_PRODUCTS: List[Dict[str, Any]] = [
    # Amazon
    {"title": "Amazon Echo Dot (5th Gen)", "description": "Compact smart speaker with Alexa.", "image_url": "https://m.media-amazon.com/images/I/71xoR4A6q-L._AC_SL1000_.jpg", "price": 49.99, "price_display": "$49.99", "retailer": "amazon", "retailer_label": "Amazon", "affiliate_url": "https://www.amazon.com/dp/B09B8V1LZ3", "category": "electronics", "rating": 4.7, "review_count": 82000, "is_featured": True},
    {"title": "Instant Pot Duo 7-in-1 (6 Qt)", "description": "Pressure cooker, slow cooker, rice cooker, and more.", "image_url": "https://m.media-amazon.com/images/I/71V1LrY1MSL._AC_SL1500_.jpg", "price": 89.00, "price_display": "$89.00", "retailer": "amazon", "retailer_label": "Amazon", "affiliate_url": "https://www.amazon.com/dp/B00FLYWNYQ", "category": "home", "rating": 4.7, "review_count": 189000},
    {"title": "Anker PowerCore 20K Portable Charger", "description": "Ultra-high-capacity power bank with fast charging.", "image_url": "https://m.media-amazon.com/images/I/61Xg4Hl2XoL._AC_SL1500_.jpg", "price": 49.99, "price_display": "$49.99", "retailer": "amazon", "retailer_label": "Amazon", "affiliate_url": "https://www.amazon.com/dp/B0194WDVHI", "category": "electronics", "rating": 4.7, "review_count": 42000},
    {"title": "Kindle Paperwhite (16 GB)", "description": "6.8\" glare-free display, waterproof, weeks of battery.", "image_url": "https://m.media-amazon.com/images/I/61Ynn45cVIL._AC_SL1000_.jpg", "price": 149.99, "price_display": "$149.99", "retailer": "amazon", "retailer_label": "Amazon", "affiliate_url": "https://www.amazon.com/dp/B09TMZKQPF", "category": "electronics", "rating": 4.6, "review_count": 61000},
    {"title": "Ring Video Doorbell (Wired)", "description": "1080p HD video doorbell with real-time notifications.", "image_url": "https://m.media-amazon.com/images/I/51QoHU5aVdL._AC_SL1000_.jpg", "price": 64.99, "price_display": "$64.99", "retailer": "amazon", "retailer_label": "Amazon", "affiliate_url": "https://www.amazon.com/dp/B08CKHPP52", "category": "home", "rating": 4.5, "review_count": 33000},
    {"title": "Fire TV Stick 4K Max", "description": "Streaming stick with Wi-Fi 6 and Alexa voice remote.", "image_url": "https://m.media-amazon.com/images/I/71LtqvbBWkL._AC_SL1500_.jpg", "price": 59.99, "price_display": "$59.99", "retailer": "amazon", "retailer_label": "Amazon", "affiliate_url": "https://www.amazon.com/dp/B08MQZXN1X", "category": "electronics", "rating": 4.7, "review_count": 210000},

    # Best Buy
    {"title": "Apple AirPods Pro (2nd Gen)", "description": "Active Noise Cancellation with USB-C.", "image_url": "https://pisces.bbystatic.com/image2/BestBuy_US/images/products/6447/6447382cv12d.jpg", "price": 199.99, "price_display": "$199.99", "retailer": "best_buy", "retailer_label": "Best Buy", "affiliate_url": "https://www.bestbuy.com/site/apple-airpods-pro-2nd-generation-with-magsafe-case-usb%E2%80%91c-white/6447382.p", "category": "electronics", "rating": 4.8, "review_count": 12000, "is_featured": True},
    {"title": "Sony WH-1000XM5 Headphones", "description": "Industry-leading noise-cancelling wireless headphones.", "image_url": "https://pisces.bbystatic.com/image2/BestBuy_US/images/products/6505/6505727_sd.jpg", "price": 399.99, "price_display": "$399.99", "retailer": "best_buy", "retailer_label": "Best Buy", "affiliate_url": "https://www.bestbuy.com/site/sony-wh1000xm5-wireless-noise-canceling-over-the-ear-headphones-black/6505727.p", "category": "electronics", "rating": 4.7, "review_count": 6800},
    {"title": "Samsung 65\" Class QLED 4K TV", "description": "Quantum HDR, Object Tracking Sound, gaming hub.", "image_url": "https://pisces.bbystatic.com/image2/BestBuy_US/images/products/6533/6533206_sd.jpg", "price": 999.99, "price_display": "$999.99", "retailer": "best_buy", "retailer_label": "Best Buy", "affiliate_url": "https://www.bestbuy.com/site/samsung-65-class-q80c-qled-4k-uhd-smart-tizen-tv/6533206.p", "category": "electronics", "rating": 4.6, "review_count": 3200},
    {"title": "Dyson V15 Detect Cordless Vacuum", "description": "Laser reveals microscopic dust. LCD screen shows real-time counts.", "image_url": "https://pisces.bbystatic.com/image2/BestBuy_US/images/products/6519/6519067_sd.jpg", "price": 749.99, "price_display": "$749.99", "retailer": "best_buy", "retailer_label": "Best Buy", "affiliate_url": "https://www.bestbuy.com/site/dyson-v15-detect-cordless-vacuum-yellow-nickel/6519067.p", "category": "home", "rating": 4.7, "review_count": 4200},
    {"title": "Nintendo Switch OLED", "description": "7-inch OLED screen, enhanced audio, 64GB storage.", "image_url": "https://pisces.bbystatic.com/image2/BestBuy_US/images/products/6470/6470923_sd.jpg", "price": 349.99, "price_display": "$349.99", "retailer": "best_buy", "retailer_label": "Best Buy", "affiliate_url": "https://www.bestbuy.com/site/nintendo-switch-oled-model-w-white-joy-con-white/6470923.p", "category": "gaming", "rating": 4.9, "review_count": 15000},
    {"title": "LG 27\" UltraGear QHD Gaming Monitor", "description": "165Hz, 1ms, NVIDIA G-SYNC compatible.", "image_url": "https://pisces.bbystatic.com/image2/BestBuy_US/images/products/6469/6469877_sd.jpg", "price": 296.99, "price_display": "$296.99", "retailer": "best_buy", "retailer_label": "Best Buy", "affiliate_url": "https://www.bestbuy.com/site/lg-ultragear-27-ips-led-qhd-freesync-and-g-sync-compatible-monitor-with-hdr-black/6469877.p", "category": "electronics", "rating": 4.7, "review_count": 5800},

    # Wayfair
    {"title": "Mid-Century Modern Velvet Sofa", "description": "88-inch tufted velvet sofa, tapered wood legs.", "image_url": "https://assets.wfcdn.com/im/13030906/resize-h800-w800%5Ecompr-r85/2273/227393927/default_name.jpg", "price": 799.99, "price_display": "$799.99", "retailer": "wayfair", "retailer_label": "Wayfair", "affiliate_url": "https://www.wayfair.com/furniture/pdp/mercer41-88-velvet-tufted-sofa-w011400089.html", "category": "furniture", "rating": 4.5, "review_count": 1200, "is_featured": True},
    {"title": "5-Piece Solid Wood Dining Set", "description": "Rectangular table with 4 upholstered chairs.", "image_url": "https://assets.wfcdn.com/im/71069879/resize-h800-w800%5Ecompr-r85/2143/214333410/default_name.jpg", "price": 549.99, "price_display": "$549.99", "retailer": "wayfair", "retailer_label": "Wayfair", "affiliate_url": "https://www.wayfair.com/furniture/pdp/red-barrel-studio-5-piece-dining-set-w008212380.html", "category": "furniture", "rating": 4.4, "review_count": 890},
    {"title": "Platform Storage Bed (Queen)", "description": "Upholstered headboard, 4 drawers, no box spring needed.", "image_url": "https://assets.wfcdn.com/im/44929906/resize-h800-w800%5Ecompr-r85/2265/226596060/default_name.jpg", "price": 429.99, "price_display": "$429.99", "retailer": "wayfair", "retailer_label": "Wayfair", "affiliate_url": "https://www.wayfair.com/furniture/pdp/lark-manor-queen-platform-bed-w000850015.html", "category": "furniture", "rating": 4.3, "review_count": 640},
    {"title": "Sectional Sleeper Sofa with Chaise", "description": "Convertible L-shape sleeper sofa, storage chaise.", "image_url": "https://assets.wfcdn.com/im/09300906/resize-h800-w800%5Ecompr-r85/2202/220246999/default_name.jpg", "price": 999.99, "price_display": "$999.99", "retailer": "wayfair", "retailer_label": "Wayfair", "affiliate_url": "https://www.wayfair.com/furniture/pdp/latitude-run-reversible-sleeper-sectional-w011020150.html", "category": "furniture", "rating": 4.4, "review_count": 1420},
    {"title": "8x10 Vintage Distressed Area Rug", "description": "Hand-woven, low-pile, stain resistant.", "image_url": "https://assets.wfcdn.com/im/78269906/resize-h800-w800%5Ecompr-r85/2189/218913650/default_name.jpg", "price": 199.99, "price_display": "$199.99", "retailer": "wayfair", "retailer_label": "Wayfair", "affiliate_url": "https://www.wayfair.com/rugs/pdp/bungalow-rose-8x10-area-rug-w005250010.html", "category": "home", "rating": 4.6, "review_count": 2100},
    {"title": "Modern LED Chandelier — 6 Light", "description": "Dimmable geometric farmhouse chandelier.", "image_url": "https://assets.wfcdn.com/im/59989906/resize-h800-w800%5Ecompr-r85/2179/217920500/default_name.jpg", "price": 179.99, "price_display": "$179.99", "retailer": "wayfair", "retailer_label": "Wayfair", "affiliate_url": "https://www.wayfair.com/lighting/pdp/mercer41-6-light-chandelier-w004160090.html", "category": "home", "rating": 4.5, "review_count": 530},

    # Target
    {"title": "Threshold 3-Piece Cookware Set", "description": "Non-stick cookware set with silicone handles.", "image_url": "https://target.scene7.com/is/image/Target/GUEST_2c4a4bb3-9d5b-49ce-9f78-8a71b3ec87b1", "price": 49.99, "price_display": "$49.99", "retailer": "target", "retailer_label": "Target", "affiliate_url": "https://www.target.com/p/threshold-3pc-cookware-set/-/A-53555523", "category": "home", "rating": 4.5, "review_count": 1800},
    {"title": "Casaluna Weighted Blanket (15 lb)", "description": "Soft-brushed weighted blanket, machine washable.", "image_url": "https://target.scene7.com/is/image/Target/GUEST_bea3e5cb-1c74-436e-9f7e-5c3d4e2f9c31", "price": 79.99, "price_display": "$79.99", "retailer": "target", "retailer_label": "Target", "affiliate_url": "https://www.target.com/p/weighted-blanket-casaluna/-/A-79486543", "category": "home", "rating": 4.7, "review_count": 3400},
    {"title": "Apple iPad (10th Gen, 64GB)", "description": "10.9-inch Retina display, Wi-Fi, USB-C.", "image_url": "https://target.scene7.com/is/image/Target/GUEST_c3ad5b8f-0e01-473e-97b0-8a26473e2bdb", "price": 349.00, "price_display": "$349.00", "retailer": "target", "retailer_label": "Target", "affiliate_url": "https://www.target.com/p/apple-ipad-10-9-inch-wi-fi-2022/-/A-85978611", "category": "electronics", "rating": 4.8, "review_count": 5600},
    {"title": "Ninja Foodi 6-in-1 Air Fryer", "description": "5-quart programmable air fryer.", "image_url": "https://target.scene7.com/is/image/Target/GUEST_78be7d9f-fd1a-42a9-8ee8-1a13e2c3d9c1", "price": 99.99, "price_display": "$99.99", "retailer": "target", "retailer_label": "Target", "affiliate_url": "https://www.target.com/p/ninja-foodi-6-in-1-air-fryer/-/A-83651187", "category": "home", "rating": 4.7, "review_count": 4700},

    # Walmart
    {"title": "onn. 65\" 4K UHD Roku TV", "description": "65-inch 4K LED with built-in Roku streaming.", "image_url": "https://i5.walmartimages.com/asr/9fbb1a3f-9d29-458f-8d1f-6a63ef37ab7d.jpg", "price": 348.00, "price_display": "$348.00", "retailer": "walmart", "retailer_label": "Walmart", "affiliate_url": "https://www.walmart.com/ip/onn-65-Class-4K-UHD-Roku-Smart-TV-100012587/", "category": "electronics", "rating": 4.5, "review_count": 9200},
    {"title": "Beautiful Kitchenaid 5.3 Qt Air Fryer", "description": "Digital touch screen, 12 pre-set programs.", "image_url": "https://i5.walmartimages.com/asr/e5be3ed0-79bd-4c9d-864d-04fdb75a7fbc.jpg", "price": 79.00, "price_display": "$79.00", "retailer": "walmart", "retailer_label": "Walmart", "affiliate_url": "https://www.walmart.com/ip/Beautiful-6-Quart-Touchscreen-Air-Fryer/", "category": "home", "rating": 4.6, "review_count": 2100},
    {"title": "Better Homes & Gardens 5-Piece Bistro Set", "description": "Outdoor patio bistro dining set with cushions.", "image_url": "https://i5.walmartimages.com/asr/6c8b96f1-9d21-4a2b-a1f0-1c3c8a5df57f.jpg", "price": 229.00, "price_display": "$229.00", "retailer": "walmart", "retailer_label": "Walmart", "affiliate_url": "https://www.walmart.com/ip/Better-Homes-Gardens-Bistro-Set/", "category": "furniture", "rating": 4.4, "review_count": 1450},
]


# ── Router factory ─────────────────────────────────────────────────
def create_router(
    *,
    db,
    get_current_user: Callable,
    require_admin: Callable,
) -> APIRouter:
    router = APIRouter(prefix="/api")

    # ── Public ─────────────────────────────────────────────────────
    @router.get("/shop/products")
    async def list_products(
        retailer: Optional[str] = None,
        category: Optional[str] = None,
        q: Optional[str] = Query(default=None, description="Free-text search"),
        featured: Optional[bool] = None,
        min_price: Optional[float] = None,
        max_price: Optional[float] = None,
        sort: Optional[str] = Query(default=None, description="featured|price_asc|price_desc|newest|popular"),
        limit: int = 60,
        skip: int = 0,
    ):
        query: Dict[str, Any] = {"is_active": True}
        if retailer:
            query["retailer"] = retailer
        if category:
            query["category"] = category
        if featured is not None:
            query["is_featured"] = featured
        if min_price is not None or max_price is not None:
            price_q: Dict[str, Any] = {}
            if min_price is not None:
                price_q["$gte"] = min_price
            if max_price is not None:
                price_q["$lte"] = max_price
            query["price"] = price_q
        if q:
            query["$or"] = [
                {"title": {"$regex": q, "$options": "i"}},
                {"description": {"$regex": q, "$options": "i"}},
            ]
        sort_map = {
            "price_asc":  [("price", 1), ("created_at", -1)],
            "price_desc": [("price", -1), ("created_at", -1)],
            "newest":     [("created_at", -1)],
            "popular":    [("click_count", -1), ("created_at", -1)],
            "featured":   [("is_featured", -1), ("click_count", -1), ("created_at", -1)],
        }
        sort_spec = sort_map.get(sort or "featured", sort_map["featured"])
        cursor = db.shop_products.find(query, {"_id": 0}).sort(sort_spec).skip(max(0, skip)).limit(max(1, min(200, limit)))
        items = await cursor.to_list(length=limit)
        total = await db.shop_products.count_documents(query)
        return {"items": items, "total": total}

    @router.get("/shop/products/{product_id}")
    async def get_product(product_id: str):
        doc = await db.shop_products.find_one({"id": product_id}, {"_id": 0})
        if not doc:
            raise HTTPException(404, "Product not found")
        return doc

    @router.get("/shop/retailers")
    async def list_retailers():
        pipeline = [
            {"$match": {"is_active": True}},
            {"$group": {
                "_id": "$retailer",
                "label": {"$first": "$retailer_label"},
                "count": {"$sum": 1},
            }},
            {"$sort": {"count": -1}},
        ]
        items = await db.shop_products.aggregate(pipeline).to_list(length=100)
        return {"items": [{"value": it["_id"], "label": it.get("label") or it["_id"].title(), "count": it["count"]} for it in items]}

    @router.get("/shop/categories")
    async def list_categories():
        pipeline = [
            {"$match": {"is_active": True}},
            {"$group": {"_id": "$category", "count": {"$sum": 1}}},
            {"$sort": {"count": -1}},
        ]
        items = await db.shop_products.aggregate(pipeline).to_list(length=100)
        return {"items": [{"value": it["_id"], "count": it["count"]} for it in items]}

    @router.post("/shop/click/{product_id}")
    async def record_click(product_id: str):
        doc = await db.shop_products.find_one({"id": product_id}, {"_id": 0})
        if not doc:
            raise HTTPException(404, "Product not found")
        await db.shop_products.update_one(
            {"id": product_id},
            {"$inc": {"click_count": 1}, "$set": {"last_clicked_at": _now_iso()}},
        )
        await db.shop_clicks.insert_one({
            "id": str(uuid.uuid4()),
            "product_id": product_id,
            "retailer": doc.get("retailer"),
            "clicked_at": _now_iso(),
        })
        return {"affiliate_url": doc["affiliate_url"]}

    # ── Admin ──────────────────────────────────────────────────────
    @router.post("/admin/shop/products")
    async def create_product(payload: ShopProductIn, _admin=Depends(require_admin)):
        product = ShopProduct(**payload.model_dump())
        await db.shop_products.insert_one(product.model_dump())
        return product.model_dump()

    @router.patch("/admin/shop/products/{product_id}")
    async def update_product(product_id: str, payload: ShopProductPatch, _admin=Depends(require_admin)):
        updates = {k: v for k, v in payload.model_dump().items() if v is not None}
        if not updates:
            raise HTTPException(400, "Nothing to update")
        updates["updated_at"] = _now_iso()
        res = await db.shop_products.update_one({"id": product_id}, {"$set": updates})
        if res.matched_count == 0:
            raise HTTPException(404, "Product not found")
        doc = await db.shop_products.find_one({"id": product_id}, {"_id": 0})
        return doc

    @router.delete("/admin/shop/products/{product_id}")
    async def delete_product(product_id: str, _admin=Depends(require_admin)):
        res = await db.shop_products.delete_one({"id": product_id})
        if res.deleted_count == 0:
            raise HTTPException(404, "Product not found")
        return {"ok": True}

    @router.post("/admin/shop/products/bulk")
    async def bulk_import(payload: List[ShopProductIn], _admin=Depends(require_admin)):
        docs = [ShopProduct(**p.model_dump()).model_dump() for p in payload]
        if docs:
            await db.shop_products.insert_many(docs)
        return {"inserted": len(docs)}

    @router.post("/admin/shop/products/auto-import")
    async def auto_import(payload: Dict[str, Any], _admin=Depends(require_admin)):
        """Fetch a retailer product URL and extract title / image / price
        from Open Graph meta tags. Returns a draft ShopProduct the admin
        can review and save. No commit until they click Save."""
        url = (payload.get("url") or "").strip()
        if not url or not url.startswith(("http://", "https://")):
            raise HTTPException(400, "Provide a valid product URL (http/https)")
        try:
            import httpx
            headers = {
                "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
                              "(KHTML, like Gecko) Chrome/120 Safari/537.36",
                "Accept-Language": "en-US,en;q=0.9",
            }
            async with httpx.AsyncClient(follow_redirects=True, timeout=15.0, headers=headers) as client:
                r = await client.get(url)
                html = r.text
        except Exception as e:
            raise HTTPException(502, f"Could not fetch URL: {e}")

        import re
        def meta(prop: str) -> Optional[str]:
            m = re.search(
                rf'<meta[^>]+(?:property|name)=["\']{re.escape(prop)}["\'][^>]+content=["\']([^"\']+)["\']',
                html, flags=re.I,
            )
            if m: return m.group(1).strip()
            m = re.search(
                rf'<meta[^>]+content=["\']([^"\']+)["\'][^>]+(?:property|name)=["\']{re.escape(prop)}["\']',
                html, flags=re.I,
            )
            return m.group(1).strip() if m else None

        title = meta("og:title") or meta("twitter:title")
        if not title:
            tm = re.search(r"<title[^>]*>([^<]+)</title>", html, flags=re.I)
            title = tm.group(1).strip() if tm else ""
        image = meta("og:image") or meta("twitter:image") or ""
        description = meta("og:description") or meta("twitter:description") or ""
        price_raw = (
            meta("product:price:amount") or meta("og:price:amount") or
            meta("twitter:data1") or meta("price")
        )
        price = None
        if price_raw:
            pm = re.search(r"(\d+(?:\.\d+)?)", str(price_raw))
            if pm:
                try: price = float(pm.group(1))
                except Exception: price = None

        # Retailer detection from hostname
        from urllib.parse import urlparse
        host = urlparse(url).hostname or ""
        host_l = host.lower()
        retailer_map = [
            ("amazon.", "amazon", "Amazon"),
            ("bestbuy.", "best_buy", "Best Buy"),
            ("wayfair.", "wayfair", "Wayfair"),
            ("target.", "target", "Target"),
            ("walmart.", "walmart", "Walmart"),
            ("homedepot.", "home_depot", "Home Depot"),
            ("lowes.", "lowes", "Lowe's"),
            ("etsy.", "etsy", "Etsy"),
            ("ebay.", "ebay", "eBay"),
        ]
        retailer_value = "other"
        retailer_label = "Partner"
        for pat, val, lbl in retailer_map:
            if pat in host_l:
                retailer_value = val
                retailer_label = lbl
                break

        return {
            "draft": {
                "title": title[:200] if title else "",
                "description": description[:600] if description else "",
                "image_url": image,
                "price": price,
                "price_display": f"${price:.2f}" if price else None,
                "retailer": retailer_value,
                "retailer_label": retailer_label,
                "affiliate_url": url,
                "category": "other",
                "is_active": True,
                "is_featured": False,
            }
        }

    return router


async def seed_shop_products(db) -> int:
    """Seed the shop_products collection on startup. Idempotent — only
    inserts products whose title+retailer combo doesn't already exist."""
    inserted = 0
    for p in SEED_PRODUCTS:
        exists = await db.shop_products.find_one({
            "title": p["title"],
            "retailer": p["retailer"],
        })
        if exists:
            continue
        product = ShopProduct(**p)
        await db.shop_products.insert_one(product.model_dump())
        inserted += 1
    if inserted:
        logger.info(f"[shop] Seeded {inserted} affiliate products")
    return inserted

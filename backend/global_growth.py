"""Global growth: public markets data, catalog feeds (Google / Meta / TikTok) and AI ad kits for regional marketplaces."""
import csv
import io
import json
import os
import re
import uuid
from datetime import datetime, timezone
from typing import Literal, Optional
from xml.sax.saxutils import escape

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import Response
from pydantic import BaseModel, Field

from demo_filter import hide_demo
from global_markets import COUNTRIES, MARKETPLACES, markets_payload


def _origin() -> str:
    return os.environ.get("PUBLIC_BASE_URL", "https://golumo.app").rstrip("/")


def _abs(url: Optional[str]) -> str:
    if not url:
        return f"{_origin()}/og-image.png"
    return url if url.startswith("http") else f"{_origin()}{url}"


def _x(v) -> str:
    return escape(str(v if v is not None else ""))


async def _active(db, coll: str, owner: str) -> list:
    q = await hide_demo(db, {"status": "active"}, owner)
    return await db[coll].find(q, {"_id": 0}).sort("created_at", -1).to_list(5000)


async def _product_rows(db) -> list:
    rows = []
    for d in await _active(db, "listings", "seller_id"):
        rows.append({"id": f"listing-{d['id']}", "title": d.get("title"), "description": d.get("description") or d.get("title"),
                     "link": f"{_origin()}/marketplace?item={d['id']}", "image": _abs(d.get("media_url")),
                     "price": f"{float(d.get('price') or 0):.2f} {(d.get('currency') or 'USD').upper()}",
                     "category": d.get("category") or "Other"})
    return rows


def _rss(rows: list) -> str:
    items = "".join(
        f"<item><g:id>{_x(r['id'])}</g:id><title>{_x(r['title'])}</title><description>{_x(r['description'])}</description>"
        f"<link>{_x(r['link'])}</link><g:image_link>{_x(r['image'])}</g:image_link><g:availability>in_stock</g:availability>"
        f"<g:condition>used</g:condition><g:price>{_x(r['price'])}</g:price><g:brand>Lumo</g:brand>"
        f"<g:identifier_exists>no</g:identifier_exists><g:product_type>{_x(r['category'])}</g:product_type></item>"
        for r in rows)
    return ('<?xml version="1.0" encoding="UTF-8"?><rss version="2.0" xmlns:g="http://base.google.com/ns/1.0">'
            f"<channel><title>Lumo Marketplace</title><link>{_origin()}/marketplace</link>"
            f"<description>Community listings on Lumo</description>{items}</channel></rss>")


class AdKitIn(BaseModel):
    marketplace: str
    country: str
    subject: Literal["platform", "recruit", "services", "rentals", "homes", "listing", "real_estate", "auto"] = "platform"
    item_id: Optional[str] = None
    city: Optional[str] = Field(default=None, max_length=80)
    notes: Optional[str] = Field(default=None, max_length=400)


SUBJECT_BRIEF = {
    "platform": "Lumo as a whole: one app to hire local help, earn money doing gigs, buy/sell/rent things and find homes, rentals and short stays.",
    "recruit": "Recruiting local workers: sign up on Lumo to earn money doing gigs (delivery, moving, cleaning, repairs, errands) — workers keep 90% of earnings, same-day payouts.",
    "services": "Book trusted local help on Lumo: delivery, moving, home repair & cleaning, auto, pet & personal care, errands.",
    "rentals": "Rent anything on Lumo — tools, gear, vehicles, venues and places to stay — or earn by listing your own.",
    "homes": "Find homes for sale, long-term rentals, rooms and short stays on Lumo's worldwide map search, or list your property free.",
}


def create_router(*, db, require_admin, llm_key: Optional[str]) -> APIRouter:
    router = APIRouter(prefix="/api")

    @router.get("/global/markets")
    async def global_markets():
        return markets_payload()

    @router.get("/feeds/google-products.xml")
    async def google_feed():
        return Response(_rss(await _product_rows(db)), media_type="application/xml")

    @router.get("/feeds/tiktok-products.xml")
    async def tiktok_feed():
        return Response(_rss(await _product_rows(db)), media_type="application/xml")

    @router.get("/feeds/meta-products.csv")
    async def meta_products():
        buf = io.StringIO()
        w = csv.writer(buf)
        w.writerow(["id", "title", "description", "availability", "condition", "price", "link", "image_link", "brand"])
        for r in await _product_rows(db):
            w.writerow([r["id"], r["title"], r["description"], "in stock", "used", r["price"], r["link"], r["image"], "Lumo"])
        return Response(buf.getvalue(), media_type="text/csv")

    @router.get("/feeds/meta-home-listings.xml")
    async def meta_homes():
        out = []
        for d in await _active(db, "real_estate", "owner_id"):
            kind = d.get("listing_kind")
            avail = "for_sale" if kind == "sale" else "for_rent"
            imgs = "".join(f"<image><url>{_x(_abs(p))}</url></image>" for p in (d.get("photos") or [None])[:10])
            out.append(
                f"<listing><home_listing_id>{_x(d['id'])}</home_listing_id><name>{_x(d.get('title'))}</name>"
                f"<availability>{avail}</availability><description>{_x(d.get('description') or d.get('title'))}</description>"
                f"<address format=\"simple\"><component name=\"addr1\">{_x(d.get('address'))}</component>"
                f"<component name=\"city\">{_x(d.get('city'))}</component><component name=\"region\">{_x(d.get('state'))}</component>"
                f"<component name=\"country\">{_x(d.get('country'))}</component><component name=\"postal_code\">{_x(d.get('zip_code'))}</component></address>"
                f"<latitude>{_x(d.get('lat'))}</latitude><longitude>{_x(d.get('lng'))}</longitude>"
                f"<price>{float(d.get('price') or 0):.2f} {(d.get('currency') or 'USD').upper()}</price>"
                f"<num_beds>{_x(d.get('bedrooms'))}</num_beds><num_baths>{_x(d.get('bathrooms'))}</num_baths>"
                f"<property_type>{_x(d.get('property_type'))}</property_type>"
                f"<listing_type>{'for_sale_by_owner' if kind == 'sale' else 'for_rent_by_owner'}</listing_type>"
                f"{imgs}<url>{_origin()}/real-estate/{_x(d['id'])}</url></listing>")
        return Response('<?xml version="1.0" encoding="UTF-8"?><listings><title>Lumo Real Estate</title>' + "".join(out) + "</listings>",
                        media_type="application/xml")

    @router.get("/feeds/meta-vehicles.xml")
    async def meta_vehicles():
        out = []
        for d in await _active(db, "autos", "owner_id"):
            imgs = "".join(f"<image><url>{_x(_abs(p))}</url></image>" for p in (d.get("photos") or [None])[:10])
            out.append(
                f"<listing><vehicle_id>{_x(d['id'])}</vehicle_id><title>{_x(d.get('title'))}</title>"
                f"<description>{_x(d.get('description') or d.get('title'))}</description><url>{_origin()}/autos/{_x(d['id'])}</url>"
                f"<make>{_x(d.get('make'))}</make><model>{_x(d.get('model'))}</model><year>{_x(d.get('year'))}</year>"
                f"<mileage><value>{_x(d.get('mileage'))}</value><unit>MI</unit></mileage>{imgs}"
                f"<price>{float(d.get('price') or 0):.2f} USD</price><state_of_vehicle>used</state_of_vehicle>"
                f"<body_style>{_x(d.get('body_style'))}</body_style>"
                f"<address format=\"simple\"><component name=\"city\">{_x(d.get('city'))}</component>"
                f"<component name=\"region\">{_x(d.get('state'))}</component><component name=\"country\">{_x(d.get('country') or 'US')}</component></address></listing>")
        return Response('<?xml version="1.0" encoding="UTF-8"?><listings><title>Lumo Autos</title>' + "".join(out) + "</listings>",
                        media_type="application/xml")

    @router.get("/admin/feeds")
    async def admin_feeds(_: dict = Depends(require_admin)):
        base = f"{_origin()}/api/feeds"
        products = len(await _product_rows(db))
        homes = len(await _active(db, "real_estate", "owner_id"))
        cars = len(await _active(db, "autos", "owner_id"))
        return [
            {"key": "google", "name": "Google Merchant Center (Shopping)", "url": f"{base}/google-products.xml", "items": products,
             "setup": "Merchant Center → Products → Feeds → Add → Scheduled fetch → paste URL (daily)."},
            {"key": "meta_products", "name": "Facebook & Instagram Shops (products)", "url": f"{base}/meta-products.csv", "items": products,
             "setup": "Commerce Manager → Catalog → Data sources → Data feed → Scheduled feed → paste URL."},
            {"key": "meta_homes", "name": "Meta Home Listings catalog", "url": f"{base}/meta-home-listings.xml", "items": homes,
             "setup": "Commerce Manager → Create catalog → Home listings → Data feed → paste URL."},
            {"key": "meta_vehicles", "name": "Meta Vehicles catalog", "url": f"{base}/meta-vehicles.xml", "items": cars,
             "setup": "Commerce Manager → Create catalog → Vehicles → Data feed → paste URL."},
            {"key": "tiktok", "name": "TikTok Shop / TikTok Catalog", "url": f"{base}/tiktok-products.xml", "items": products,
             "setup": "TikTok Ads Manager → Assets → Catalogs → Add products → Data feed → paste URL."},
        ]

    @router.get("/admin/ad-kits")
    async def list_kits(_: dict = Depends(require_admin)):
        return await db.ad_kits.find({}, {"_id": 0}).sort("created_at", -1).to_list(200)

    @router.delete("/admin/ad-kits/{kit_id}")
    async def delete_kit(kit_id: str, _: dict = Depends(require_admin)):
        await db.ad_kits.delete_one({"id": kit_id})
        return {"ok": True}

    @router.post("/admin/ad-kits/generate")
    async def generate_kit(body: AdKitIn, admin: dict = Depends(require_admin)):
        if body.marketplace not in MARKETPLACES or body.country not in COUNTRIES:
            raise HTTPException(400, "Unknown marketplace or country")
        if not llm_key:
            raise HTTPException(503, "AI unavailable")
        mname, _cs, post_url = MARKETPLACES[body.marketplace]
        cname, _region, lang, cur, cities = COUNTRIES[body.country]
        city = body.city or cities[0]
        image, link, brief = None, f"{_origin()}/in/{cname.lower().replace(' ', '-')}", SUBJECT_BRIEF.get(body.subject)
        if body.subject in ("listing", "real_estate", "auto"):
            coll = {"listing": "listings", "real_estate": "real_estate", "auto": "autos"}[body.subject]
            item = await db[coll].find_one({"id": body.item_id}, {"_id": 0}) if body.item_id else None
            if not item:
                raise HTTPException(404, "Item not found")
            image = _abs((item.get("photos") or [item.get("media_url")])[0] if (item.get("photos") or item.get("media_url")) else None)
            link = {"listing": f"{_origin()}/marketplace?item={item['id']}", "real_estate": f"{_origin()}/real-estate/{item['id']}",
                    "auto": f"{_origin()}/autos/{item['id']}"}[body.subject]
            brief = (f"This specific listing: {item.get('title')} — {item.get('description') or ''} — price "
                     f"{item.get('price')} {item.get('currency') or 'USD'} — location {item.get('city') or item.get('address') or ''}.")
        from emergentintegrations.llm.chat import LlmChat, UserMessage
        system = ("You write high-converting classified ads for regional online marketplaces. Write natively in the requested "
                  "language (not translated-sounding), follow the marketplace's typical tone and rules (no spam, no ALL CAPS, "
                  "no fake claims, no prices you were not given). Reply with JSON only: "
                  '{"title": "<max 70 chars>", "body": "<80-160 words, short paragraphs, ends with the link>", "tags": ["<5 short keywords>"]}')
        prompt = (f"Marketplace: {mname} ({cname}). Language code: {lang}. City: {city}. Local currency: {cur}.\n"
                  f"What to advertise: {brief}\nLink to include: {link}\nExtra notes: {body.notes or 'none'}")
        chat = LlmChat(api_key=llm_key, session_id=f"adkit-{uuid.uuid4()}", system_message=system).with_model("anthropic", "claude-sonnet-4-6")
        raw = await chat.send_message(UserMessage(text=prompt))
        m = re.search(r"\{.*\}", raw, re.S)
        try:
            parsed = json.loads(m.group(0)) if m else {}
        except json.JSONDecodeError:
            parsed = {}
        if not parsed.get("title") or not parsed.get("body"):
            raise HTTPException(502, "AI returned an unexpected format — try again")
        kit = {"id": str(uuid.uuid4()), "marketplace": body.marketplace, "marketplace_name": mname, "post_url": post_url,
               "country": body.country, "country_name": cname, "city": city, "lang": lang, "subject": body.subject,
               "item_id": body.item_id, "title": str(parsed["title"])[:120], "body": str(parsed["body"])[:3000],
               "tags": [str(t)[:40] for t in (parsed.get("tags") or [])][:8], "link": link,
               "image": image or f"{_origin()}/og-image.png", "created_by": admin.get("email"),
               "created_at": datetime.now(timezone.utc).isoformat()}
        await db.ad_kits.insert_one(dict(kit))
        return kit

    return router

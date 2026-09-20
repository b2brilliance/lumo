"""Affiliate / referral-link engine for Lumo.

Every page (autos, real estate, marketplace, etc.) can pull offers from this
module via /api/affiliates/offers?category=…&country=…. Offer URLs include
template placeholders such as {amazon_tag}; the click handler injects the
real tracking IDs from `affiliate_settings` so the user gets credit.

A handful of well-known programs are pre-seeded the first time the
collection is empty. Admins can add / edit / disable offers from the
Admin Console.
"""

from __future__ import annotations

import re
import uuid
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import RedirectResponse
from pydantic import BaseModel, Field


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


# Categories that the front-end can ask for. Anything tagged with a category
# in this list will surface on the matching page block.
AFFILIATE_CATEGORIES = {
    "autos": "Auto loans, warranty, sell-your-car",
    "real-estate": "Mortgage, title, home services",
    "rentals": "Travel, vacation, equipment",
    "marketplace": "Cashback, products, gifts",
    "stores": "E-commerce, retail partners",
    "restaurants": "Food delivery sign-ups",
    "provider": "Banking, early-pay, gig perks",
    "wallet": "Banking, investing, credit",
    "customer": "Credit cards, cashback",
    "city": "Local travel, attractions",
    "global": "Shown everywhere",
}


# Sub-grouping within each category so the front-end can render
# "Auto loans" / "Insurance" / "Warranty" sections instead of one
# long undifferentiated grid. Keyed by slug → subcategory.
SUBCATEGORY_MAP = {
    # autos
    "carvana": "loans", "capitalone-auto": "loans", "autocredit-express": "loans",
    "carmax": "sell", "turo-host": "rent-out", "endurance-warranty": "warranty",
    # real-estate
    "rocket-mortgage": "mortgage", "better-mortgage": "mortgage",
    "homelight": "agents", "hippo-insurance": "insurance",
    # marketplace
    "amazon": "shopping", "rakuten-cashback": "cashback", "ebay": "shopping",
    "walmart": "shopping", "target": "shopping", "etsy": "shopping",
    "wayfair": "shopping", "best-buy": "shopping",
    # restaurants
    "doordash-refer": "gig", "ubereats-refer": "gig", "instacart-shopper": "gig",
    "grubhub": "restaurants",
    # provider
    "chime": "banking", "earnin": "banking", "sofi-bank": "banking",
    "stride-tax": "insurance",
    # wallet
    "robinhood": "investing", "coinbase": "investing", "wise": "banking",
    "credit-karma": "credit", "lemonade": "insurance",
    # customer
    "chase-business": "credit-cards", "amex-platinum": "credit-cards",
    "discover": "credit-cards",
    # rentals (travel)
    "booking": "hotels", "expedia": "hotels", "hotels-com": "hotels",
    "agoda": "hotels", "vrbo": "vacation-rentals",
    "viator": "tours", "getyourguide": "tours",
    "skyscanner": "flights", "kayak": "flights",
    # stores
    "shopify-partners": "platforms", "square-business": "platforms",
    "namecheap": "platforms", "fiverr-affiliate": "services",
    # global
    "skimlinks": "tools",
}


# Human-readable section labels for the front-end grouping.
SUBCATEGORY_LABELS = {
    "loans": "Auto loans & financing",
    "warranty": "Extended warranties",
    "insurance": "Insurance",
    "sell": "Sell your car",
    "rent-out": "Earn renting it out",
    "mortgage": "Mortgage & pre-approval",
    "agents": "Find a top agent",
    "shopping": "Shop with cashback",
    "cashback": "Cashback portals",
    "gig": "Drive / shop / deliver",
    "restaurants": "Food delivery",
    "banking": "Better banking",
    "investing": "Investing & crypto",
    "credit": "Credit & taxes",
    "credit-cards": "Credit cards",
    "hotels": "Hotels",
    "vacation-rentals": "Vacation rentals",
    "tours": "Tours & attractions",
    "flights": "Flights",
    "platforms": "Build your business",
    "services": "Freelance services",
    "tools": "Money-making tools",
    "general": "More partners",
}


# ── Default catalog ─────────────────────────────────────────────────────────
# Each offer has:
#   id (slug), name, network, category, country (ISO2 list or ["*"]),
#   blurb, payout (text), logo, url_template (with {placeholder} for the user-
#   provided tracking ID), disclosure (override), priority (sort key).
# Updates pushed by admins live in the DB; this only fires when the
# `affiliate_offers` collection is empty.
DEFAULT_OFFERS = [
    # ── AUTOS ──────────────────────────────────────────────────────────────
    {"slug": "carvana", "name": "Carvana — buy or sell a car",
     "network": "Impact",
     "category": "autos", "country": ["US"],
     "blurb": "Get up to $1,000 cash for your car in minutes, or finance one online.",
     "payout": "$25–$100 per qualified lead",
     "logo": "https://logo.clearbit.com/carvana.com",
     "url_template": "https://www.carvana.com/?utm_source=lumo&utm_medium=affiliate&irclickid={impact_click_id}&irgwc=1&sharedid={impact_publisher_id}",
     "signup_url": "https://app.impact.com/campaign-mediapartner-signup/Carvana.brand",
     "priority": 10},
    {"slug": "carmax", "name": "CarMax — get a real cash offer",
     "network": "Impact / direct",
     "category": "autos", "country": ["US"],
     "blurb": "Free 7-day cash offer on any car, no obligation. CarMax pays cash even if you don't buy from them.",
     "payout": "$20–$60 per appraisal",
     "logo": "https://logo.clearbit.com/carmax.com",
     "url_template": "https://www.carmax.com/sell-my-car?affid={carmax_affid}",
     "signup_url": "https://app.impact.com/campaign-mediapartner-signup/CarMax.brand",
     "priority": 9},
    {"slug": "capitalone-auto", "name": "Capital One Auto Navigator",
     "network": "FlexOffers",
     "category": "autos", "country": ["US"],
     "blurb": "Pre-qualify for an auto loan in under 60 seconds without a credit hit.",
     "payout": "$15–$45 per pre-qualification",
     "logo": "https://logo.clearbit.com/capitalone.com",
     "url_template": "https://www.capitalone.com/cars/?xid=lumo_{flexoffers_id}",
     "signup_url": "https://publisher.flexoffers.com/signup/?Refid=lumo",
     "priority": 8},
    {"slug": "autocredit-express", "name": "Auto Credit Express — bad-credit loans",
     "network": "Direct",
     "category": "autos", "country": ["US"],
     "blurb": "Bad credit? Get matched with lenders who specialize in sub-prime auto loans.",
     "payout": "$15 per qualified lead",
     "logo": "https://logo.clearbit.com/autocreditexpress.com",
     "url_template": "https://www.autocreditexpress.com/apply/?source=lumo&sub={ace_subid}",
     "signup_url": "https://www.autocreditexpress.com/affiliates/",
     "priority": 7},
    {"slug": "endurance-warranty", "name": "Endurance Extended Car Warranty",
     "network": "CJ Affiliate",
     "category": "autos", "country": ["US"],
     "blurb": "Up to $400 off any extended auto warranty plan. Pays per quote.",
     "payout": "$25–$120 per sale",
     "logo": "https://logo.clearbit.com/endurancewarranty.com",
     "url_template": "https://www.endurancewarranty.com/?utm_source=cj&PID={cj_pid}&AID={cj_aid}",
     "signup_url": "https://signup.cj.com/member/signup/publisher/",
     "priority": 6},
    {"slug": "turo-host", "name": "Turo — earn renting your car",
     "network": "Direct",
     "category": "autos", "country": ["US", "GB", "CA", "FR", "AU"],
     "blurb": "List your car on Turo and earn $10,000+/yr. Pays $25 per host sign-up.",
     "payout": "$25 per host sign-up",
     "logo": "https://logo.clearbit.com/turo.com",
     "url_template": "https://turo.com/list-your-car?refer={turo_ref}",
     "signup_url": "https://turo.com/us/en/become-a-host",
     "priority": 5},

    # ── INSURANCE (auto, home, business, rideshare, life, pet, health) ──
    {"slug": "progressive-auto", "name": "Progressive — auto insurance",
     "network": "CJ Affiliate",
     "category": "autos", "subcategory": "insurance", "country": ["US"],
     "blurb": "Compare rates and switch in 4 minutes. Pays per completed quote.",
     "payout": "$8–$25 per quote",
     "logo": "https://logo.clearbit.com/progressive.com",
     "url_template": "https://www.progressive.com/?PID={cj_pid}&AID={cj_aid}",
     "signup_url": "https://signup.cj.com/member/signup/publisher/",
     "priority": 9},
    {"slug": "geico", "name": "GEICO — 15 minutes could save 15%",
     "network": "CJ Affiliate",
     "category": "autos", "subcategory": "insurance", "country": ["US"],
     "blurb": "Auto + rideshare insurance. Quotes in under 2 minutes.",
     "payout": "$5–$20 per quote",
     "logo": "https://logo.clearbit.com/geico.com",
     "url_template": "https://www.geico.com/?PID={cj_pid}&AID={cj_aid}",
     "signup_url": "https://signup.cj.com/member/signup/publisher/",
     "priority": 8},
    {"slug": "root-insurance", "name": "Root — pay-by-driving",
     "network": "Impact",
     "category": "autos", "subcategory": "insurance", "country": ["US"],
     "blurb": "Insurance rates based on how you actually drive. Safe drivers save up to 52%.",
     "payout": "$5–$30 per policy",
     "logo": "https://logo.clearbit.com/joinroot.com",
     "url_template": "https://www.joinroot.com/?irclickid={impact_click_id}",
     "signup_url": "https://app.impact.com/campaign-mediapartner-signup/Root-Insurance.brand",
     "priority": 6},
    {"slug": "thezebra", "name": "The Zebra — compare every insurer",
     "network": "Impact",
     "category": "autos", "subcategory": "insurance", "country": ["US"],
     "blurb": "Free real-time rates from 200+ companies in 90 seconds.",
     "payout": "$5–$15 per quote",
     "logo": "https://logo.clearbit.com/thezebra.com",
     "url_template": "https://www.thezebra.com/?irclickid={impact_click_id}",
     "signup_url": "https://app.impact.com/campaign-mediapartner-signup/The-Zebra.brand",
     "priority": 5},
    {"slug": "lemonade-home", "name": "Lemonade — renters & home insurance",
     "network": "Impact",
     "category": "real-estate", "subcategory": "insurance", "country": ["US", "GB", "DE", "FR", "NL"],
     "blurb": "From $5/mo, instant claims via app. Up to $15 per active policy.",
     "payout": "$15+ per policy",
     "logo": "https://logo.clearbit.com/lemonade.com",
     "url_template": "https://www.lemonade.com/?irclickid={impact_click_id}&utm_source=lumo",
     "signup_url": "https://app.impact.com/campaign-mediapartner-signup/Lemonade.brand",
     "priority": 7},
    {"slug": "policygenius", "name": "Policygenius — compare life + home insurance",
     "network": "Impact",
     "category": "real-estate", "subcategory": "insurance", "country": ["US"],
     "blurb": "Marketplace for life, home, auto, disability. Up to $80 per policy.",
     "payout": "$20–$80 per policy",
     "logo": "https://logo.clearbit.com/policygenius.com",
     "url_template": "https://www.policygenius.com/?irclickid={impact_click_id}",
     "signup_url": "https://app.impact.com/campaign-mediapartner-signup/Policygenius.brand",
     "priority": 5},
    {"slug": "thimble", "name": "Thimble — on-demand business insurance",
     "network": "Impact",
     "category": "provider", "subcategory": "insurance", "country": ["US"],
     "blurb": "Hourly, daily or monthly liability insurance for handymen, photographers, contractors. Buy on your phone in 60 seconds.",
     "payout": "$10–$40 per policy",
     "logo": "https://logo.clearbit.com/thimble.com",
     "url_template": "https://www.thimble.com/?irclickid={impact_click_id}",
     "signup_url": "https://app.impact.com/campaign-mediapartner-signup/Thimble.brand",
     "priority": 10},
    {"slug": "next-insurance", "name": "Next Insurance — small-biz coverage",
     "network": "Impact",
     "category": "provider", "subcategory": "insurance", "country": ["US"],
     "blurb": "General liability, workers comp, commercial auto — built for solopreneurs.",
     "payout": "$25–$80 per policy",
     "logo": "https://logo.clearbit.com/nextinsurance.com",
     "url_template": "https://www.nextinsurance.com/?irclickid={impact_click_id}",
     "signup_url": "https://app.impact.com/campaign-mediapartner-signup/Next-Insurance.brand",
     "priority": 9},
    {"slug": "hiscox", "name": "Hiscox — professional liability",
     "network": "CJ Affiliate",
     "category": "provider", "subcategory": "insurance", "country": ["US", "GB"],
     "blurb": "Online quote + binding for consultants, IT pros, real-estate agents.",
     "payout": "$10–$45 per policy",
     "logo": "https://logo.clearbit.com/hiscox.com",
     "url_template": "https://www.hiscox.com/?PID={cj_pid}&AID={cj_aid}",
     "signup_url": "https://signup.cj.com/member/signup/publisher/",
     "priority": 7},
    {"slug": "simply-business", "name": "Simply Business — small biz liability",
     "network": "FlexOffers",
     "category": "provider", "subcategory": "insurance", "country": ["US", "GB"],
     "blurb": "Marketplace for 100+ small-business insurers, quote in 10 minutes.",
     "payout": "$8–$35 per quote",
     "logo": "https://logo.clearbit.com/simplybusiness.com",
     "url_template": "https://www.simplybusiness.com/?utm_source=lumo&sub={flexoffers_id}",
     "signup_url": "https://publisher.flexoffers.com/signup/?Refid=lumo",
     "priority": 6},
    {"slug": "ethos-life", "name": "Ethos — term life insurance online",
     "network": "Impact",
     "category": "customer", "subcategory": "insurance", "country": ["US"],
     "blurb": "Term life insurance from $9/mo. No medical exam for most under $1M.",
     "payout": "$15–$80 per policy",
     "logo": "https://logo.clearbit.com/ethoslife.com",
     "url_template": "https://www.ethoslife.com/?irclickid={impact_click_id}",
     "signup_url": "https://app.impact.com/campaign-mediapartner-signup/Ethos-Life.brand",
     "priority": 6},
    {"slug": "ladder-life", "name": "Ladder — flexible term life insurance",
     "network": "FlexOffers",
     "category": "customer", "subcategory": "insurance", "country": ["US"],
     "blurb": "Term life that scales up or down. Instant decision online.",
     "payout": "$20–$60 per policy",
     "logo": "https://logo.clearbit.com/ladderlife.com",
     "url_template": "https://www.ladderlife.com/?utm_source=lumo&sub={flexoffers_id}",
     "signup_url": "https://publisher.flexoffers.com/signup/?Refid=lumo",
     "priority": 5},
    {"slug": "lemonade-pet", "name": "Lemonade Pet — pet insurance",
     "network": "Impact",
     "category": "customer", "subcategory": "insurance", "country": ["US", "GB"],
     "blurb": "Pet insurance starting at $10/mo. AI-powered claims.",
     "payout": "$15–$40 per policy",
     "logo": "https://logo.clearbit.com/lemonade.com",
     "url_template": "https://www.lemonade.com/pet?irclickid={impact_click_id}",
     "signup_url": "https://app.impact.com/campaign-mediapartner-signup/Lemonade.brand",
     "priority": 4},
    {"slug": "world-nomads-travel", "name": "World Nomads — travel insurance",
     "network": "Impact",
     "category": "rentals", "subcategory": "insurance", "country": ["*"],
     "blurb": "Travel + adventure-sports insurance for 150+ activities, 200 countries.",
     "payout": "5–10% of premium",
     "logo": "https://logo.clearbit.com/worldnomads.com",
     "url_template": "https://www.worldnomads.com/?irclickid={impact_click_id}",
     "signup_url": "https://app.impact.com/campaign-mediapartner-signup/World-Nomads.brand",
     "priority": 8},
    {"slug": "safetywing", "name": "SafetyWing — nomad health insurance",
     "network": "Direct",
     "category": "rentals", "subcategory": "insurance", "country": ["*"],
     "blurb": "Global health + travel insurance built for remote workers. $42/mo.",
     "payout": "10% recurring per active user",
     "logo": "https://logo.clearbit.com/safetywing.com",
     "url_template": "https://safetywing.com/?referenceID={safetywing_ref}",
     "signup_url": "https://safetywing.com/affiliate-program",
     "priority": 7},
    {"slug": "trupanion", "name": "Trupanion — pet health insurance",
     "network": "CJ Affiliate",
     "category": "customer", "subcategory": "insurance", "country": ["US", "CA"],
     "blurb": "90% coverage of vet bills, direct pay at vet's office.",
     "payout": "$20–$60 per policy",
     "logo": "https://logo.clearbit.com/trupanion.com",
     "url_template": "https://www.trupanion.com/?PID={cj_pid}&AID={cj_aid}",
     "signup_url": "https://signup.cj.com/member/signup/publisher/",
     "priority": 3},

    # ── REAL ESTATE ────────────────────────────────────────────────────────
    {"slug": "rocket-mortgage", "name": "Rocket Mortgage — pre-approval",
     "network": "FlexOffers",
     "category": "real-estate", "country": ["US"],
     "blurb": "Get pre-approved online in minutes. Earn for every funded loan.",
     "payout": "$30–$200 per pre-approval",
     "logo": "https://logo.clearbit.com/rocketmortgage.com",
     "url_template": "https://www.rocketmortgage.com/?utm_source=lumo&sub={flexoffers_id}",
     "signup_url": "https://publisher.flexoffers.com/signup/?Refid=lumo",
     "priority": 10},
    {"slug": "better-mortgage", "name": "Better.com mortgage",
     "network": "Impact",
     "category": "real-estate", "country": ["US"],
     "blurb": "100% online mortgage, no commissions, no junk fees. Up to $200 per funded loan.",
     "payout": "$50–$200 per funded loan",
     "logo": "https://logo.clearbit.com/better.com",
     "url_template": "https://better.com/?irclickid={impact_click_id}&utm_source=lumo",
     "signup_url": "https://app.impact.com/campaign-mediapartner-signup/Better-com.brand",
     "priority": 9},
    {"slug": "homelight", "name": "HomeLight — find a top agent",
     "network": "Impact",
     "category": "real-estate", "country": ["US"],
     "blurb": "Match home sellers with top 5% local agents. $300+ per closed transaction.",
     "payout": "$300+ per closing",
     "logo": "https://logo.clearbit.com/homelight.com",
     "url_template": "https://www.homelight.com/?irclickid={impact_click_id}&utm_source=lumo",
     "signup_url": "https://app.impact.com/campaign-mediapartner-signup/HomeLight.brand",
     "priority": 8},
    {"slug": "hippo-insurance", "name": "Hippo home insurance quote",
     "network": "CJ Affiliate",
     "category": "real-estate", "country": ["US"],
     "blurb": "Home insurance built for modern homeowners. Get a quote in 60 seconds.",
     "payout": "$8–$25 per quote",
     "logo": "https://logo.clearbit.com/hippo.com",
     "url_template": "https://www.hippo.com/?PID={cj_pid}&AID={cj_aid}",
     "signup_url": "https://signup.cj.com/member/signup/publisher/",
     "priority": 6},

    # ── RENTALS / TRAVEL ───────────────────────────────────────────────────
    {"slug": "booking", "name": "Booking.com hotels",
     "network": "Booking Affiliate Partner",
     "category": "rentals", "country": ["*"],
     "blurb": "28M+ properties worldwide. Earn up to 4% on every booking that stays.",
     "payout": "Up to 4% of stay value",
     "logo": "https://logo.clearbit.com/booking.com",
     "url_template": "https://www.booking.com/index.html?aid={booking_aid}&label=lumo-{city_slug}",
     "signup_url": "https://www.booking.com/affiliate-program/v2/index.html",
     "priority": 10},
    {"slug": "expedia", "name": "Expedia hotels & flights",
     "network": "Expedia Group Affiliate",
     "category": "rentals", "country": ["*"],
     "blurb": "Hotels, flights, cars, packages worldwide. Up to 6% per booking.",
     "payout": "2–6% per completed booking",
     "logo": "https://logo.clearbit.com/expedia.com",
     "url_template": "https://www.expedia.com/?siteid={expedia_siteid}&CAMREF={expedia_camref}",
     "signup_url": "https://www.expediagroup.com/affiliate-program",
     "priority": 9},
    {"slug": "viator", "name": "Viator tours & activities",
     "network": "CJ Affiliate",
     "category": "rentals", "country": ["*"],
     "blurb": "300,000+ tours worldwide. 8% commission on every booking.",
     "payout": "8% per booked tour",
     "logo": "https://logo.clearbit.com/viator.com",
     "url_template": "https://www.viator.com/?pid={viator_pid}&mcid=42383",
     "signup_url": "https://www.partner.viator.com/en/affiliate-network/",
     "priority": 8},
    {"slug": "getyourguide", "name": "GetYourGuide attractions",
     "network": "Direct / Awin",
     "category": "rentals", "country": ["*"],
     "blurb": "Tickets to museums, attractions, day trips. 8% commission.",
     "payout": "8% per booking",
     "logo": "https://logo.clearbit.com/getyourguide.com",
     "url_template": "https://www.getyourguide.com/?partner_id={gyg_pid}",
     "signup_url": "https://partner.getyourguide.com/",
     "priority": 7},
    {"slug": "skyscanner", "name": "Skyscanner flights",
     "network": "Skyscanner Affiliate",
     "category": "rentals", "country": ["*"],
     "blurb": "Cheapest flights worldwide, compared. ~$0.45 per click on a flight redirect.",
     "payout": "$0.20–$0.65 per click-out",
     "logo": "https://logo.clearbit.com/skyscanner.com",
     "url_template": "https://www.skyscanner.com/?associateid={skyscanner_aid}",
     "signup_url": "https://www.partners.skyscanner.net/affiliates",
     "priority": 6},
    {"slug": "kayak", "name": "Kayak — compare flights & hotels",
     "network": "Kayak Affiliate",
     "category": "rentals", "country": ["*"],
     "blurb": "Compare hundreds of travel sites at once. Pays per click + per booking.",
     "payout": "Per-click + booking",
     "logo": "https://logo.clearbit.com/kayak.com",
     "url_template": "https://www.kayak.com/?aid={kayak_aid}",
     "signup_url": "https://www.kayak.com/about/affiliates",
     "priority": 5},
    {"slug": "vrbo", "name": "Vrbo vacation homes",
     "network": "Expedia Group",
     "category": "rentals", "country": ["*"],
     "blurb": "Whole-home vacation rentals. Up to 6% commission per stay.",
     "payout": "2–6% per stay",
     "logo": "https://logo.clearbit.com/vrbo.com",
     "url_template": "https://www.vrbo.com/?siteid={expedia_siteid}&CAMREF={expedia_camref}",
     "signup_url": "https://www.expediagroup.com/affiliate-program",
     "priority": 4},
    {"slug": "hotels-com", "name": "Hotels.com — collect 10 nights, get 1 free",
     "network": "Expedia Group",
     "category": "rentals", "country": ["*"],
     "blurb": "Save with Hotels.com Rewards. Up to 6% per completed stay.",
     "payout": "2–6% per stay",
     "logo": "https://logo.clearbit.com/hotels.com",
     "url_template": "https://www.hotels.com/?siteid={expedia_siteid}&CAMREF={expedia_camref}",
     "signup_url": "https://www.expediagroup.com/affiliate-program",
     "priority": 3},
    {"slug": "agoda", "name": "Agoda — Asia hotel specialist",
     "network": "Agoda Affiliate",
     "category": "rentals", "country": ["*"],
     "blurb": "Asia's #1 hotel platform. Up to 7% per booking.",
     "payout": "4–7% per stay",
     "logo": "https://logo.clearbit.com/agoda.com",
     "url_template": "https://www.agoda.com/?cid={agoda_cid}",
     "signup_url": "https://partners.agoda.com/",
     "priority": 2},

    # ── MARKETPLACE / RETAIL ───────────────────────────────────────────────
    {"slug": "amazon", "name": "Amazon — anything sold on Amazon",
     "network": "Amazon Associates",
     "category": "marketplace", "country": ["*"],
     "blurb": "Earn 1–10% on every purchase the visitor makes within 24 hours.",
     "payout": "1–10% of every purchase (24-hr cookie)",
     "logo": "https://logo.clearbit.com/amazon.com",
     "url_template": "https://www.amazon.com/?tag={amazon_tag}",
     "signup_url": "https://affiliate-program.amazon.com/",
     "priority": 10},
    {"slug": "rakuten-cashback", "name": "Rakuten — cashback on every store",
     "network": "Rakuten Affiliate",
     "category": "marketplace", "country": ["US", "CA", "GB", "DE", "FR"],
     "blurb": "Refer a shopper: you get $30 when they spend $30.",
     "payout": "$30 per qualified sign-up",
     "logo": "https://logo.clearbit.com/rakuten.com",
     "url_template": "https://www.rakuten.com/r/{rakuten_ref}",
     "signup_url": "https://www.rakuten.com/refer-a-friend",
     "priority": 9},
    {"slug": "ebay", "name": "eBay — auctions & resale",
     "network": "eBay Partner Network",
     "category": "marketplace", "country": ["*"],
     "blurb": "Earn 1–6% on every confirmed eBay transaction.",
     "payout": "1–6% per item sold",
     "logo": "https://logo.clearbit.com/ebay.com",
     "url_template": "https://www.ebay.com/?mkrid=711-53200-19255-0&campid={ebay_campid}&toolid=10001",
     "signup_url": "https://partnernetwork.ebay.com/",
     "priority": 8},
    {"slug": "walmart", "name": "Walmart everyday low prices",
     "network": "Impact",
     "category": "marketplace", "country": ["US"],
     "blurb": "Earn 1–4% on Walmart.com sales. Two-day shipping included.",
     "payout": "1–4% per purchase",
     "logo": "https://logo.clearbit.com/walmart.com",
     "url_template": "https://www.walmart.com/?irclickid={impact_click_id}&utm_source=lumo",
     "signup_url": "https://app.impact.com/campaign-mediapartner-signup/Walmart-Affiliates.brand",
     "priority": 7},
    {"slug": "target", "name": "Target — everything cheaper",
     "network": "Impact",
     "category": "marketplace", "country": ["US"],
     "blurb": "Earn up to 8% on Target online sales.",
     "payout": "1–8% per purchase",
     "logo": "https://logo.clearbit.com/target.com",
     "url_template": "https://www.target.com/?afid={target_afid}",
     "signup_url": "https://app.impact.com/campaign-mediapartner-signup/Target.brand",
     "priority": 6},
    {"slug": "etsy", "name": "Etsy — handmade & vintage",
     "network": "Awin",
     "category": "marketplace", "country": ["*"],
     "blurb": "4% commission on every Etsy purchase. 30-day cookie.",
     "payout": "4% per purchase",
     "logo": "https://logo.clearbit.com/etsy.com",
     "url_template": "https://www.etsy.com/?utm_source=affiliate&awinaffid={awin_id}",
     "signup_url": "https://www.awin.com/us/publishers",
     "priority": 5},
    {"slug": "wayfair", "name": "Wayfair — furniture & home",
     "network": "CJ Affiliate",
     "category": "marketplace", "country": ["US", "CA", "GB"],
     "blurb": "7% commission on every Wayfair purchase. Big-ticket category.",
     "payout": "7% per purchase",
     "logo": "https://logo.clearbit.com/wayfair.com",
     "url_template": "https://www.wayfair.com/?PID={cj_pid}&AID={cj_aid}",
     "signup_url": "https://signup.cj.com/member/signup/publisher/",
     "priority": 4},
    {"slug": "best-buy", "name": "Best Buy electronics",
     "network": "Impact",
     "category": "marketplace", "country": ["US"],
     "blurb": "1–7% on electronics, often the lowest price.",
     "payout": "1–7% per purchase",
     "logo": "https://logo.clearbit.com/bestbuy.com",
     "url_template": "https://www.bestbuy.com/?irclickid={impact_click_id}&utm_source=lumo",
     "signup_url": "https://app.impact.com/campaign-mediapartner-signup/Best-Buy.brand",
     "priority": 3},

    # ── RESTAURANTS / FOOD DELIVERY ───────────────────────────────────────
    {"slug": "doordash-refer", "name": "DoorDash — refer a Dasher",
     "network": "Direct",
     "category": "restaurants", "country": ["US", "CA", "AU"],
     "blurb": "Refer a new Dasher: up to $300 bonus when they complete 100 deliveries.",
     "payout": "Up to $300 per Dasher",
     "logo": "https://logo.clearbit.com/doordash.com",
     "url_template": "https://dasher.doordash.com/en-us/r/{doordash_ref}",
     "signup_url": "https://dasher.doordash.com/en-us/refer",
     "priority": 10},
    {"slug": "ubereats-refer", "name": "Uber Eats — driver referral",
     "network": "Direct",
     "category": "restaurants", "country": ["US", "GB", "FR", "MX", "BR", "AU"],
     "blurb": "Refer a driver: up to $750 once they finish their first 100 trips.",
     "payout": "Up to $750 per driver",
     "logo": "https://logo.clearbit.com/uber.com",
     "url_template": "https://www.uber.com/a/join?invite_code={uber_ref}",
     "signup_url": "https://www.uber.com/us/en/drive/",
     "priority": 9},
    {"slug": "instacart-shopper", "name": "Instacart — refer a shopper",
     "network": "Direct",
     "category": "restaurants", "country": ["US", "CA"],
     "blurb": "Refer a new Instacart Shopper for cash bonuses.",
     "payout": "$50–$200 per shopper",
     "logo": "https://logo.clearbit.com/instacart.com",
     "url_template": "https://shoppers.instacart.com/refer?code={instacart_ref}",
     "signup_url": "https://shoppers.instacart.com/",
     "priority": 8},
    {"slug": "grubhub", "name": "Grubhub — restaurant signup",
     "network": "CJ Affiliate",
     "category": "restaurants", "country": ["US"],
     "blurb": "Earn for every restaurant or diner you send to Grubhub.",
     "payout": "$5–$50 per signup",
     "logo": "https://logo.clearbit.com/grubhub.com",
     "url_template": "https://www.grubhub.com/?affiliateID={cj_aid}",
     "signup_url": "https://signup.cj.com/member/signup/publisher/",
     "priority": 6},

    # ── PROVIDER / GIG WORKER ─────────────────────────────────────────────
    {"slug": "chime", "name": "Chime — early-pay bank",
     "network": "Direct",
     "category": "provider", "country": ["US"],
     "blurb": "Refer a friend, you both get $100 when they direct-deposit $200+.",
     "payout": "$100 per direct-deposit signup",
     "logo": "https://logo.clearbit.com/chime.com",
     "url_template": "https://www.chime.com/r/{chime_ref}",
     "signup_url": "https://www.chime.com/refer-a-friend/",
     "priority": 10},
    {"slug": "earnin", "name": "EarnIn — get paid early",
     "network": "Direct",
     "category": "provider", "country": ["US"],
     "blurb": "Cash out up to $750 from your paycheck before payday. $10/referral.",
     "payout": "$10 per active user",
     "logo": "https://logo.clearbit.com/earnin.com",
     "url_template": "https://earnin.app.link/{earnin_ref}",
     "signup_url": "https://www.earnin.com/",
     "priority": 9},
    {"slug": "sofi-bank", "name": "SoFi — checking + savings",
     "network": "Direct",
     "category": "provider", "country": ["US"],
     "blurb": "Up to $300 sign-up bonus + your referral fee.",
     "payout": "$75–$300 per referral",
     "logo": "https://logo.clearbit.com/sofi.com",
     "url_template": "https://www.sofi.com/invite/money?gcp={sofi_ref}",
     "signup_url": "https://www.sofi.com/refer/money/",
     "priority": 8},
    {"slug": "stride-tax", "name": "Stride — free tax + insurance for gig workers",
     "network": "Impact",
     "category": "provider", "country": ["US"],
     "blurb": "Tax + health insurance app for gig workers. $5–$15 per signup.",
     "payout": "$5–$15 per signup",
     "logo": "https://logo.clearbit.com/stridehealth.com",
     "url_template": "https://www.stridehealth.com/?irclickid={impact_click_id}",
     "signup_url": "https://app.impact.com/campaign-mediapartner-signup/Stride-Health.brand",
     "priority": 5},

    # ── WALLET / FINANCE ──────────────────────────────────────────────────
    {"slug": "robinhood", "name": "Robinhood — free stock",
     "network": "Direct",
     "category": "wallet", "country": ["US"],
     "blurb": "Both you and your invitee get a free stock worth up to $200.",
     "payout": "Free stock per signup",
     "logo": "https://logo.clearbit.com/robinhood.com",
     "url_template": "https://join.robinhood.com/{robinhood_ref}",
     "signup_url": "https://robinhood.com/referral",
     "priority": 10},
    {"slug": "coinbase", "name": "Coinbase — crypto signup",
     "network": "Coinbase Affiliate",
     "category": "wallet", "country": ["US", "GB", "CA", "DE", "FR"],
     "blurb": "Earn 50% of trading fees from anyone you refer, for 3 months.",
     "payout": "50% of fees for 3 months",
     "logo": "https://logo.clearbit.com/coinbase.com",
     "url_template": "https://www.coinbase.com/join/{coinbase_ref}",
     "signup_url": "https://www.coinbase.com/affiliates",
     "priority": 9},
    {"slug": "wise", "name": "Wise — international transfers",
     "network": "Direct",
     "category": "wallet", "country": ["*"],
     "blurb": "Refer 3 friends, get £50 (or local equiv). 8x cheaper than banks.",
     "payout": "$50 per 3 referrals",
     "logo": "https://logo.clearbit.com/wise.com",
     "url_template": "https://wise.com/invite/u/{wise_ref}",
     "signup_url": "https://wise.com/invite",
     "priority": 8},
    {"slug": "credit-karma", "name": "Credit Karma — free credit score",
     "network": "CJ Affiliate",
     "category": "wallet", "country": ["US", "CA", "GB"],
     "blurb": "Free credit score + tax filing + credit card matches. $10–$25 per signup.",
     "payout": "$10–$25 per signup",
     "logo": "https://logo.clearbit.com/creditkarma.com",
     "url_template": "https://www.creditkarma.com/?PID={cj_pid}&AID={cj_aid}",
     "signup_url": "https://signup.cj.com/member/signup/publisher/",
     "priority": 7},
    {"slug": "lemonade", "name": "Lemonade — renters/pet/home insurance",
     "network": "Impact",
     "category": "wallet", "country": ["US", "GB", "DE", "FR", "NL"],
     "blurb": "$5/month renters insurance, instant claims. $15+ per policy.",
     "payout": "$15+ per active policy",
     "logo": "https://logo.clearbit.com/lemonade.com",
     "url_template": "https://www.lemonade.com/?irclickid={impact_click_id}&utm_source=lumo",
     "signup_url": "https://app.impact.com/campaign-mediapartner-signup/Lemonade.brand",
     "priority": 6},

    # ── CUSTOMER / CREDIT CARDS ───────────────────────────────────────────
    {"slug": "chase-business", "name": "Chase Ink Business credit card",
     "network": "Bankrate / CardRatings",
     "category": "customer", "country": ["US"],
     "blurb": "Up to $400 per approved Chase business credit card.",
     "payout": "Up to $400 per approval",
     "logo": "https://logo.clearbit.com/chase.com",
     "url_template": "https://creditcards.chase.com/?CELL={chase_cell}",
     "signup_url": "https://www.cardratings.com/affiliates.html",
     "priority": 10},
    {"slug": "amex-platinum", "name": "Amex Platinum referral",
     "network": "Bankrate / Awin",
     "category": "customer", "country": ["US", "GB", "CA"],
     "blurb": "100,000 point welcome bonus. Earn for every approved card.",
     "payout": "$100–$400 per approval",
     "logo": "https://logo.clearbit.com/americanexpress.com",
     "url_template": "https://www.americanexpress.com/?ref={amex_ref}",
     "signup_url": "https://www.americanexpress.com/en-us/business/loyalty/referrals/",
     "priority": 9},
    {"slug": "discover", "name": "Discover — cashback card",
     "network": "FlexOffers",
     "category": "customer", "country": ["US"],
     "blurb": "5% cashback rotating categories + $100 sign-up bonus.",
     "payout": "$50–$150 per approval",
     "logo": "https://logo.clearbit.com/discover.com",
     "url_template": "https://www.discover.com/credit-cards/refer-a-friend?ref={discover_ref}",
     "signup_url": "https://publisher.flexoffers.com/signup/?Refid=lumo",
     "priority": 8},

    # ── GLOBAL FALLBACKS / SKIMLINKS / CASHBACK ───────────────────────────
    {"slug": "skimlinks", "name": "Skimlinks — auto-monetize any outbound link",
     "network": "Skimlinks",
     "category": "global", "country": ["*"],
     "blurb": "Add ONE script tag, every outbound merchant link earns you commission across 60,000+ stores.",
     "payout": "Variable per merchant",
     "logo": "https://logo.clearbit.com/skimlinks.com",
     "url_template": "https://skimlinks.com/",
     "signup_url": "https://skimlinks.com/publishers/",
     "priority": 10},
    {"slug": "shopify-partners", "name": "Shopify Partners — sell hosting",
     "network": "Shopify Partners",
     "category": "stores", "country": ["*"],
     "blurb": "$150 per merchant that signs up to Shopify through your link.",
     "payout": "$150 per merchant",
     "logo": "https://logo.clearbit.com/shopify.com",
     "url_template": "https://www.shopify.com/?ref={shopify_ref}",
     "signup_url": "https://www.shopify.com/partners",
     "priority": 9},
    {"slug": "square-business", "name": "Square — point-of-sale referral",
     "network": "Direct",
     "category": "stores", "country": ["US", "CA", "GB", "AU"],
     "blurb": "Refer a business: free processing on first $1,000, $100 per referral.",
     "payout": "$100 per referred merchant",
     "logo": "https://logo.clearbit.com/squareup.com",
     "url_template": "https://squareup.com/i/{square_ref}",
     "signup_url": "https://squareup.com/us/en/referrals",
     "priority": 8},
    {"slug": "fiverr-affiliate", "name": "Fiverr — freelance services",
     "network": "Fiverr Affiliates",
     "category": "stores", "country": ["*"],
     "blurb": "Up to $150 CPA per first-time buyer. Huge digital service catalog.",
     "payout": "$15–$150 per buyer (CPA)",
     "logo": "https://logo.clearbit.com/fiverr.com",
     "url_template": "https://www.fiverr.com/?source=affiliate&utm_source={fiverr_oid}",
     "signup_url": "https://affiliates.fiverr.com/",
     "priority": 7},
    {"slug": "namecheap", "name": "Namecheap — domains & hosting",
     "network": "CJ Affiliate",
     "category": "stores", "country": ["*"],
     "blurb": "Up to 35% commission on hosting + 20% on domain renewals.",
     "payout": "Up to 35% commission",
     "logo": "https://logo.clearbit.com/namecheap.com",
     "url_template": "https://www.namecheap.com/?affId={namecheap_affid}",
     "signup_url": "https://www.namecheap.com/affiliates/",
     "priority": 6},
]


# ── Pydantic models ─────────────────────────────────────────────────────────
class AffiliateOfferIn(BaseModel):
    name: str
    network: str
    category: str
    subcategory: str = "general"
    country: list[str] = ["*"]
    blurb: str
    payout: str = ""
    logo: str = ""
    url_template: str
    signup_url: str = ""
    priority: int = 5
    active: bool = True


class AffiliateOfferPatch(BaseModel):
    """Only the fields admins may legitimately edit. Anything else (e.g.
    `_id`, `slug`, `created_at`) is rejected at the schema layer."""
    name: Optional[str] = None
    network: Optional[str] = None
    category: Optional[str] = None
    subcategory: Optional[str] = None
    country: Optional[list[str]] = None
    blurb: Optional[str] = None
    payout: Optional[str] = None
    logo: Optional[str] = None
    url_template: Optional[str] = None
    signup_url: Optional[str] = None
    priority: Optional[int] = None
    active: Optional[bool] = None


class AffiliateSettings(BaseModel):
    keys: dict[str, str] = Field(default_factory=dict)


class _ClickPing(BaseModel):
    referrer: Optional[str] = None
    city_slug: Optional[str] = None


def _render_url(url_template: str, keys: dict, extras: dict) -> str:
    """Replace {placeholder} tokens in a template with stored tracking IDs."""
    out = url_template
    merged = {**keys, **extras}
    # Replace every {x} that has a value; unknowns become empty string so the
    # link still functions even before the user provides their IDs.
    def repl(match: re.Match) -> str:
        key = match.group(1)
        return str(merged.get(key, ""))
    return re.sub(r"\{([a-zA-Z0-9_]+)\}", repl, out)


# ── Router factory ─────────────────────────────────────────────────────────
def create_affiliates_router(db, get_current_user, require_role):
    router = APIRouter(prefix="/api/affiliates", tags=["affiliates"])
    admin_router = APIRouter(prefix="/api/admin/affiliates", tags=["affiliates-admin"])

    async def _get_settings() -> dict:
        doc = await db.affiliate_settings.find_one({"_id": "site"}) or {}
        return doc.get("keys", {}) if isinstance(doc, dict) else {}

    # ── Public ──────────────────────────────────────────────────────────────
    @router.get("/offers")
    async def list_offers(category: str = "", country: str = "", self_signup_only: bool = True):
        """Return offers tagged for `category` (and optionally filtered by ISO2
        country). Empty category returns global offers only.

        `self_signup_only` (default True): hide any partner where you'd need
        prior membership / retailer account. Programs are considered
        self-signup if they expose a public `signup_url` — every default
        offer runs on Impact, CJ, FlexOffers, Awin, Rakuten, EPN or the
        merchant's own public publisher-signup form, so all defaults pass.
        """
        clauses: list[dict] = [{"active": True}]
        if category:
            clauses.append({"$or": [{"category": category}, {"category": "global"}]})
        if country:
            clauses.append({"$or": [{"country": country.upper()}, {"country": "*"}]})
        if self_signup_only:
            clauses.append({"$and": [
                {"signup_url": {"$exists": True}},
                {"signup_url": {"$nin": ["", None]}},
                {"$or": [{"self_signup": {"$ne": False}}, {"self_signup": {"$exists": False}}]},
            ]})
        q = {"$and": clauses} if len(clauses) > 1 else clauses[0]
        cursor = db.affiliate_offers.find(q).sort("priority", -1)
        offers = []
        keys = await _get_settings()
        async for doc in cursor:
            doc.pop("_id", None)
            placeholders = re.findall(r"\{([a-zA-Z0-9_]+)\}", doc.get("url_template", ""))
            needs = [p for p in placeholders if not keys.get(p) and p not in ("city_slug",)]
            doc["needs_setup"] = bool(needs)
            doc["missing_keys"] = needs
            doc.setdefault("self_signup", True)
            offers.append(doc)
        return {"offers": offers, "count": len(offers)}

    @router.get("/click/{slug}")
    async def click_offer(slug: str, request: Request, city_slug: str = ""):
        """Log the click and redirect to the merchant. Front-end uses this
        instead of a direct link so we can track conversions later."""
        offer = await db.affiliate_offers.find_one({"slug": slug, "active": True})
        if not offer:
            raise HTTPException(404, "Offer not found")
        keys = await _get_settings()
        url = _render_url(offer["url_template"], keys, {"city_slug": city_slug or ""})
        try:
            await db.affiliate_clicks.insert_one({
                "_id": str(uuid.uuid4()),
                "slug": slug,
                "name": offer.get("name"),
                "category": offer.get("category"),
                "city_slug": city_slug,
                "referrer": request.headers.get("referer", ""),
                "user_agent": request.headers.get("user-agent", ""),
                "ip": request.client.host if request.client else "",
                "at": _now(),
            })
        except Exception as e:
            # Don't block the redirect on logging failure, but surface so a
            # broken DB doesn't go unnoticed.
            import logging
            logging.getLogger("lumo.affiliates").warning("affiliate click log failed: %s", e)
        return RedirectResponse(url=url, status_code=302)

    # ── Admin ──────────────────────────────────────────────────────────────
    @admin_router.get("/offers")
    async def admin_list_offers(_admin: dict = Depends(require_role("admin"))):
        cursor = db.affiliate_offers.find({}).sort("priority", -1)
        out = []
        async for doc in cursor:
            doc.pop("_id", None)
            out.append(doc)
        return {"offers": out, "count": len(out)}

    @admin_router.post("/offers")
    async def admin_create_offer(body: AffiliateOfferIn, _admin: dict = Depends(require_role("admin"))):
        slug = re.sub(r"[^a-z0-9]+", "-", body.name.lower()).strip("-")
        doc = {**body.model_dump(), "slug": slug, "created_at": _now()}
        await db.affiliate_offers.update_one({"slug": slug}, {"$set": doc}, upsert=True)
        return {"ok": True, "slug": slug}

    @admin_router.patch("/offers/{slug}")
    async def admin_update_offer(slug: str, body: AffiliateOfferPatch, _admin: dict = Depends(require_role("admin"))):
        updates = {k: v for k, v in body.model_dump(exclude_none=True).items()}
        if not updates:
            return {"ok": True, "updated": 0}
        await db.affiliate_offers.update_one({"slug": slug}, {"$set": updates})
        return {"ok": True}

    @admin_router.delete("/offers/{slug}")
    async def admin_delete_offer(slug: str, _admin: dict = Depends(require_role("admin"))):
        await db.affiliate_offers.delete_one({"slug": slug})
        return {"ok": True}

    @admin_router.get("/settings")
    async def admin_get_settings(_admin: dict = Depends(require_role("admin"))):
        doc = await db.affiliate_settings.find_one({"_id": "site"}) or {}
        return {"keys": doc.get("keys", {})}

    @admin_router.post("/settings")
    async def admin_save_settings(body: AffiliateSettings, _admin: dict = Depends(require_role("admin"))):
        await db.affiliate_settings.update_one(
            {"_id": "site"},
            {"$set": {"keys": body.keys, "updated_at": _now()}},
            upsert=True,
        )
        return {"ok": True}

    @admin_router.get("/analytics")
    async def admin_analytics(_admin: dict = Depends(require_role("admin")), days: int = 30):
        pipe = [
            {"$group": {"_id": "$slug", "clicks": {"$sum": 1}, "last": {"$max": "$at"}}},
            {"$sort": {"clicks": -1}},
            {"$limit": 200},
        ]
        rows = [r async for r in db.affiliate_clicks.aggregate(pipe)]
        total = await db.affiliate_clicks.count_documents({})
        return {"per_offer": rows, "total_clicks": total}

    @admin_router.post("/reseed")
    async def admin_reseed(_admin: dict = Depends(require_role("admin"))):
        """Insert any offers from DEFAULT_OFFERS that aren't already in the DB.
        Safe to call repeatedly — never overwrites custom edits. Also
        backfills `subcategory` on existing rows."""
        count = 0
        for o in DEFAULT_OFFERS:
            sub = o.get("subcategory") or SUBCATEGORY_MAP.get(o["slug"], "general")
            insert_payload = {k: v for k, v in o.items() if k != "subcategory"}
            insert_payload.update({"active": True, "created_at": _now()})
            res = await db.affiliate_offers.update_one(
                {"slug": o["slug"]},
                {"$setOnInsert": insert_payload, "$set": {"subcategory": sub}},
                upsert=True,
            )
            if res.upserted_id:
                count += 1
        return {"ok": True, "inserted": count, "total_defaults": len(DEFAULT_OFFERS)}

    @router.get("/subcategory-labels")
    async def get_subcat_labels():
        """Front-end uses this to render section headers like 'Auto loans'."""
        return {"labels": SUBCATEGORY_LABELS}

    # Stitch sub-routers together for include_router convenience.
    out = APIRouter()
    out.include_router(router)
    out.include_router(admin_router)
    return out


async def seed_default_offers(db) -> int:
    """Idempotent seed — runs at startup. Inserts any missing default offers
    and backfills `subcategory` on existing rows so the front-end can group
    offers by intent (loans / insurance / warranty / etc.)."""
    inserted = 0
    for o in DEFAULT_OFFERS:
        sub = o.get("subcategory") or SUBCATEGORY_MAP.get(o["slug"], "general")
        # `$setOnInsert` payload must NOT include the same fields as `$set`,
        # so strip subcategory from the insert blob and let $set handle it.
        insert_payload = {k: v for k, v in o.items() if k != "subcategory"}
        insert_payload.update({"active": True, "created_at": _now()})
        res = await db.affiliate_offers.update_one(
            {"slug": o["slug"]},
            {"$setOnInsert": insert_payload, "$set": {"subcategory": sub}},
            upsert=True,
        )
        if res.upserted_id:
            inserted += 1
    return inserted

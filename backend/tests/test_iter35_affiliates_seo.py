"""Iteration 35 — Affiliate engine + SEO recruiting pages + Cities hub.

Tests:
- /api/affiliates/offers (public, by category)
- /api/affiliates/click/<slug> (302 redirect with key injection)
- /api/admin/affiliates/* (admin CRUD + settings + analytics + reseed)
- /api/sitemap.xml (includes /cities and recruiting pages)
- Frontend HTML routes accessible (200/HTML response): /become-a-provider,
  /list-your-stuff, /earn, /sell-on-lumo, /cities, /cities/new-york.
"""

from __future__ import annotations

import os
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://lumo-bundle-checkout.preview.emergentagent.com").rstrip("/")
ADMIN = {"email": "admin@lumo.test", "password": "password123"}


# ── Fixtures ───────────────────────────────────────────────────────────────
@pytest.fixture(scope="module")
def api_client():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


@pytest.fixture(scope="module")
def admin_token(api_client):
    r = api_client.post(f"{BASE_URL}/api/auth/login", json=ADMIN, timeout=30)
    if r.status_code != 200:
        pytest.skip(f"admin login failed: {r.status_code} {r.text[:200]}")
    return r.json()["token"]


@pytest.fixture(scope="module")
def admin_client(admin_token):
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json",
                      "Authorization": f"Bearer {admin_token}"})
    return s


# ── Affiliate offers (public) ───────────────────────────────────────────────
@pytest.mark.parametrize("category,minimum", [
    ("autos", 7),
    ("real-estate", 5),
    ("marketplace", 9),
    ("restaurants", 5),
    ("provider", 5),
    ("wallet", 6),
    ("rentals", 10),
])
def test_offers_per_category(api_client, category, minimum):
    r = api_client.get(f"{BASE_URL}/api/affiliates/offers", params={"category": category}, timeout=30)
    assert r.status_code == 200, r.text
    data = r.json()
    assert "offers" in data and "count" in data
    assert data["count"] >= minimum, f"{category}: expected >={minimum}, got {data['count']}"
    # schema check on first offer
    o = data["offers"][0]
    for k in ("slug", "name", "url_template", "category"):
        assert k in o, f"missing {k}"
    assert isinstance(o.get("needs_setup"), bool)
    assert isinstance(o.get("missing_keys"), list)


def test_offers_autos_contains_known_partners(api_client):
    r = api_client.get(f"{BASE_URL}/api/affiliates/offers", params={"category": "autos"}, timeout=30)
    slugs = {o["slug"] for o in r.json()["offers"]}
    must = {"carvana", "carmax", "capitalone-auto", "autocredit-express",
            "endurance-warranty", "turo-host", "skimlinks"}
    missing = must - slugs
    assert not missing, f"autos missing partners: {missing}; got {slugs}"


# ── Affiliate click redirect ────────────────────────────────────────────────
def test_amazon_click_injects_saved_tag(api_client):
    """amazon_tag=lumo-20 should already be saved in affiliate_settings; redirect URL must contain tag=lumo-20."""
    r = api_client.get(f"{BASE_URL}/api/affiliates/click/amazon", allow_redirects=False, timeout=30)
    assert r.status_code in (301, 302, 307, 308), f"expected redirect, got {r.status_code}"
    loc = r.headers.get("location", "")
    assert "amazon.com" in loc
    assert "tag=lumo-20" in loc, f"amazon_tag was not injected. Location={loc}"


def test_click_404_for_unknown_slug(api_client):
    r = api_client.get(f"{BASE_URL}/api/affiliates/click/__nope__", allow_redirects=False, timeout=30)
    assert r.status_code == 404


# ── Admin: offers list, CRUD, settings, analytics, reseed ───────────────────
def test_admin_list_offers_returns_48_plus(admin_client):
    r = admin_client.get(f"{BASE_URL}/api/admin/affiliates/offers", timeout=30)
    assert r.status_code == 200, r.text
    data = r.json()
    assert data["count"] >= 48, f"expected >=48 offers, got {data['count']}"


def test_admin_create_update_delete_offer(admin_client):
    # CREATE
    body = {
        "name": "TEST_iter35 partner",
        "network": "Direct",
        "category": "global",
        "country": ["*"],
        "blurb": "Auto-created by iter35 tests",
        "payout": "$1 per click",
        "logo": "",
        "url_template": "https://example.com/?ref={amazon_tag}",
        "signup_url": "https://example.com/signup",
        "priority": 1,
        "active": True,
    }
    r = admin_client.post(f"{BASE_URL}/api/admin/affiliates/offers", json=body, timeout=30)
    assert r.status_code == 200, r.text
    slug = r.json()["slug"]
    assert slug == "test-iter35-partner"

    # verify visible from admin list
    r = admin_client.get(f"{BASE_URL}/api/admin/affiliates/offers", timeout=30)
    slugs = [o["slug"] for o in r.json()["offers"]]
    assert slug in slugs

    # UPDATE
    r = admin_client.patch(f"{BASE_URL}/api/admin/affiliates/offers/{slug}",
                           json={"blurb": "Updated by iter35", "priority": 11}, timeout=30)
    assert r.status_code == 200, r.text

    # DELETE
    r = admin_client.delete(f"{BASE_URL}/api/admin/affiliates/offers/{slug}", timeout=30)
    assert r.status_code == 200


def test_admin_settings_roundtrip_and_injection(admin_client, api_client):
    # GET current
    r = admin_client.get(f"{BASE_URL}/api/admin/affiliates/settings", timeout=30)
    assert r.status_code == 200
    keys = r.json().get("keys", {})
    # ensure amazon_tag is present (set earlier per problem statement)
    # if not, set it
    keys.setdefault("amazon_tag", "lumo-20")
    keys["skimlinks_publisher_id"] = "12345"
    r = admin_client.post(f"{BASE_URL}/api/admin/affiliates/settings",
                          json={"keys": keys}, timeout=30)
    assert r.status_code == 200
    # re-fetch
    r2 = admin_client.get(f"{BASE_URL}/api/admin/affiliates/settings", timeout=30)
    saved = r2.json()["keys"]
    assert saved.get("amazon_tag") == "lumo-20"
    assert saved.get("skimlinks_publisher_id") == "12345"

    # verify injection at click time
    r3 = api_client.get(f"{BASE_URL}/api/affiliates/click/amazon", allow_redirects=False, timeout=30)
    assert "tag=lumo-20" in r3.headers.get("location", "")


def test_admin_analytics_after_click(admin_client, api_client):
    # generate a click
    api_client.get(f"{BASE_URL}/api/affiliates/click/amazon", allow_redirects=False, timeout=30)
    r = admin_client.get(f"{BASE_URL}/api/admin/affiliates/analytics", timeout=30)
    assert r.status_code == 200
    data = r.json()
    assert "per_offer" in data
    assert "total_clicks" in data
    assert data["total_clicks"] >= 1
    # amazon should appear in per_offer
    slugs = {row["_id"] for row in data["per_offer"]}
    assert "amazon" in slugs


def test_admin_reseed_is_idempotent(admin_client):
    r = admin_client.post(f"{BASE_URL}/api/admin/affiliates/reseed", timeout=30)
    assert r.status_code == 200
    data = r.json()
    assert data["ok"] is True
    assert data["total_defaults"] >= 40
    # second call should insert 0 new offers (idempotent)
    r2 = admin_client.post(f"{BASE_URL}/api/admin/affiliates/reseed", timeout=30)
    assert r2.json()["inserted"] == 0


# ── Sitemap ────────────────────────────────────────────────────────────────
def test_sitemap_includes_cities_and_recruiting(api_client):
    r = api_client.get(f"{BASE_URL}/api/sitemap.xml", timeout=60)
    assert r.status_code == 200
    xml = r.text
    # recruiting pages
    for p in ("/become-a-provider", "/list-your-stuff", "/earn", "/sell-on-lumo"):
        assert p in xml, f"sitemap missing {p}"
    # cities hub
    assert "/cities" in xml
    assert "/cities/new-york" in xml or "/cities/los-angeles" in xml or "/cities/" in xml
    # rough url count
    url_count = xml.count("<url>")
    assert url_count > 1000, f"sitemap too small: {url_count} <url> entries"


# ── Frontend HTML routes (just sanity-check 200 + non-empty HTML) ──────────
@pytest.mark.parametrize("path", [
    "/become-a-provider",
    "/list-your-stuff",
    "/earn",
    "/sell-on-lumo",
    "/cities",
    "/cities/new-york",
])
def test_frontend_routes_serve_html(api_client, path):
    # React SPA so we expect 200 + index.html shell
    r = api_client.get(f"{BASE_URL}{path}", timeout=30)
    assert r.status_code == 200, f"{path}: {r.status_code}"
    assert "<html" in r.text.lower() or "<!doctype" in r.text.lower()

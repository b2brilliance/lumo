"""Iter 57 — Nationwide recruit-city seed + AdSense head + SW killswitch."""
import os
import re
import requests
import pytest

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL").rstrip("/")

SAMPLE_SLUGS = [
    "los-angeles-ca", "san-francisco-ca", "seattle-wa", "chicago-il",
    "new-york-ny", "austin-tx", "denver-co", "boston-ma", "miami-fl",
    "atlanta-ga", "phoenix-az", "dallas-tx", "houston-tx",
    "philadelphia-pa", "honolulu-hi", "salt-lake-city-ut", "anchorage-ak",
]

PRIORITY_SLUGS_WITH_CUSTOM_COPY = {
    "los-angeles-ca": "Los Angeles",
    "san-francisco-ca": "San Francisco",
    "seattle-wa": "Seattle",
    "tacoma-wa": "Tacoma",
    "chicago-il": "Chicago",
    "portland-or": "Portland",
}


@pytest.fixture(scope="module")
def cities():
    r = requests.get(f"{BASE_URL}/api/recruit/cities", timeout=30)
    assert r.status_code == 200
    data = r.json()
    return data.get("items", [])


def test_cities_count_over_100(cities):
    assert len(cities) >= 100, f"Expected >=100 cities, got {len(cities)}"


def test_sample_slugs_reachable(cities):
    slugs = {c["slug"] for c in cities}
    missing = [s for s in SAMPLE_SLUGS if s not in slugs]
    assert not missing, f"Missing slugs in list: {missing}"
    # Fetch each detail page
    fails = []
    for slug in SAMPLE_SLUGS:
        r = requests.get(f"{BASE_URL}/api/recruit/cities/{slug}", timeout=15)
        if r.status_code != 200:
            fails.append((slug, r.status_code))
    assert not fails, f"detail endpoint failed: {fails}"


def test_priority_cities_preserved(cities):
    by_slug = {c["slug"]: c for c in cities}
    for slug, city_name in PRIORITY_SLUGS_WITH_CUSTOM_COPY.items():
        assert slug in by_slug, f"Priority city missing: {slug}"
        c = by_slug[slug]
        assert c["city"] == city_name
        assert c.get("hero_headline"), f"{slug} missing hero_headline"
        assert c.get("hero_subhead"), f"{slug} missing hero_subhead"


def test_sitemap_contains_all_join_urls():
    r = requests.get(f"{BASE_URL}/api/sitemap.xml", timeout=30)
    assert r.status_code == 200
    xml = r.text
    join_urls = re.findall(r"<loc>[^<]*/join/[^<]+</loc>", xml)
    assert len(join_urls) >= 100, f"sitemap has {len(join_urls)} /join/ URLs"


def test_ads_txt():
    r = requests.get(f"{BASE_URL}/ads.txt", timeout=15)
    assert r.status_code == 200
    assert "google.com, pub-6859971059816782, DIRECT, f08c47fec0942fa0" in r.text


def test_index_html_sw_killswitch_and_bfcache():
    r = requests.get(f"{BASE_URL}/", timeout=15)
    assert r.status_code == 200
    html = r.text
    # New killswitch tokens
    assert "isLegitPushSw" in html, "isLegitPushSw missing"
    assert "LEGIT_SW_PATH" in html, "LEGIT_SW_PATH missing"
    assert "lumo_sw_killswitch_v2" in html, "v2 session key missing"
    # Old key must be gone
    assert "'lumo_sw_killswitch'" not in html and '"lumo_sw_killswitch"' not in html, \
        "old lumo_sw_killswitch key still present"
    # bfcache handler
    assert "pageshow" in html
    assert "bfcache" in html.lower()
    # AdSense
    assert "ca-pub-6859971059816782" in html
    assert 'name="google-adsense-account"' in html


def test_meta_endpoint():
    r = requests.get(f"{BASE_URL}/api/meta", timeout=15)
    assert r.status_code == 200
    assert "buildTime" in r.json()


def test_ai_copy_config():
    r = requests.get(f"{BASE_URL}/api/admin/ai-copy/config", timeout=15)
    # Endpoint may be admin gated; accept 200/401/403 but not 500
    assert r.status_code in (200, 401, 403), r.status_code


def test_affiliate_self_signup_offers():
    r = requests.get(f"{BASE_URL}/api/affiliates/offers?self_signup_only=true", timeout=15)
    assert r.status_code == 200
    data = r.json()
    assert isinstance(data, (list, dict))

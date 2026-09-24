"""Iter 58 — Recruit city local enrichment tests (neighborhoods + unique hero photos)."""
import os
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://lumo-bundle-checkout.preview.emergentagent.com").rstrip("/")

ADMIN_EMAIL = "admin@lumo.test"
ADMIN_PASSWORD = "password123"

EXPECTED_MIAMI_HOODS = ["Brickell", "Wynwood", "Coral Gables", "Little Havana", "South Beach"]
EXPECTED_MIAMI_PHOTO_FRAG = "photo-1508009603885"

# Sample cities → expected photo fragment (partial match on hero_image URL)
CURATED_CITIES = {
    "los-angeles-ca": "photo-1580655653885",
    "san-francisco-ca": "photo-1521747116042",
    "austin-tx": "photo-1531218150217",
    "atlanta-ga": "photo-1575931955096",
    "chicago-il": "photo-1477414348463",
    "new-york-ny": "photo-1522083165195",
    "boston-ma": "photo-1501979376754",
    "denver-co": "photo-1546156929",
    "seattle-wa": "photo-1502175353174",
    "washington-dc": "photo-1501466044931",
}


@pytest.fixture(scope="module")
def api():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


@pytest.fixture(scope="module")
def admin_token(api):
    r = api.post(f"{BASE_URL}/api/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD})
    if r.status_code != 200:
        pytest.skip(f"Admin login failed: {r.status_code} {r.text[:200]}")
    return r.json().get("token") or r.json().get("access_token")


# ── Basic list & count ─────────────────────────────────────────────
def test_list_cities_at_least_122(api):
    r = api.get(f"{BASE_URL}/api/recruit/cities")
    assert r.status_code == 200
    items = r.json().get("items", [])
    assert len(items) >= 122, f"Expected >=122 cities, got {len(items)}"


def test_no_duplicate_slugs(api):
    r = api.get(f"{BASE_URL}/api/recruit/cities")
    items = r.json().get("items", [])
    slugs = [i["slug"] for i in items]
    assert len(slugs) == len(set(slugs)), "Duplicate slugs found"


# ── Miami reference test ───────────────────────────────────────────
def test_miami_neighborhoods_and_photo(api):
    r = api.get(f"{BASE_URL}/api/recruit/cities/miami-fl")
    assert r.status_code == 200
    d = r.json()
    assert d.get("neighborhoods") == EXPECTED_MIAMI_HOODS, f"Miami hoods mismatch: {d.get('neighborhoods')}"
    assert EXPECTED_MIAMI_PHOTO_FRAG in (d.get("hero_image") or ""), f"Miami photo mismatch: {d.get('hero_image')}"


# ── Sample 10 cities ───────────────────────────────────────────────
@pytest.mark.parametrize("slug,frag", list(CURATED_CITIES.items()))
def test_curated_city_photo_and_neighborhoods(api, slug, frag):
    r = api.get(f"{BASE_URL}/api/recruit/cities/{slug}")
    assert r.status_code == 200, f"{slug} → {r.status_code}"
    d = r.json()
    hoods = d.get("neighborhoods") or []
    assert 3 <= len(hoods) <= 5, f"{slug} hoods count={len(hoods)}: {hoods}"
    assert frag in (d.get("hero_image") or ""), f"{slug} photo mismatch: {d.get('hero_image')}"


# ── Fallback cities ────────────────────────────────────────────────
@pytest.mark.parametrize("slug", ["jackson-ms", "billings-mt"])
def test_fallback_city_still_valid(api, slug):
    r = api.get(f"{BASE_URL}/api/recruit/cities/{slug}")
    assert r.status_code == 200, f"{slug} → {r.status_code}"
    d = r.json()
    # Should have a hero image (fallback or curated) and not crash
    assert d.get("hero_image"), f"{slug} missing hero_image"
    hoods = d.get("neighborhoods") or []
    assert isinstance(hoods, list)
    # jackson-ms and billings-mt are NOT in CITY_NEIGHBORHOODS, so hoods should be empty
    assert len(hoods) == 0, f"{slug} unexpectedly has hoods: {hoods}"


def test_wichita_has_curated_hoods(api):
    # wichita-ks IS in CITY_NEIGHBORHOODS map
    r = api.get(f"{BASE_URL}/api/recruit/cities/wichita-ks")
    assert r.status_code == 200
    d = r.json()
    hoods = d.get("neighborhoods") or []
    assert 3 <= len(hoods) <= 5


# ── Admin PATCH neighborhoods ──────────────────────────────────────
def test_admin_patch_neighborhoods(api, admin_token):
    headers = {"Authorization": f"Bearer {admin_token}"}
    # Get current state first
    orig = api.get(f"{BASE_URL}/api/recruit/cities/atlanta-ga").json()
    original_hoods = orig.get("neighborhoods")

    payload = {"neighborhoods": ["Test1", "Test2"]}
    r = api.patch(f"{BASE_URL}/api/admin/recruit/cities/atlanta-ga", json=payload, headers=headers)
    assert r.status_code == 200, f"PATCH failed: {r.status_code} {r.text[:300]}"
    d = r.json()
    assert d.get("neighborhoods") == ["Test1", "Test2"]

    # Verify persistence via GET
    g = api.get(f"{BASE_URL}/api/recruit/cities/atlanta-ga").json()
    assert g.get("neighborhoods") == ["Test1", "Test2"]

    # Restore
    api.patch(
        f"{BASE_URL}/api/admin/recruit/cities/atlanta-ga",
        json={"neighborhoods": original_hoods},
        headers=headers,
    )


# ── Regression: sitemap ────────────────────────────────────────────
def test_sitemap_has_join_urls(api):
    r = api.get(f"{BASE_URL}/api/sitemap.xml")
    assert r.status_code == 200
    body = r.text
    count = body.count("/join/")
    assert count >= 122, f"Expected >=122 /join/ URLs in sitemap, got {count}"


# ── SEO: meta description with neighborhoods (server-rendered) ─────
def test_frontend_miami_page_reachable(api):
    """Frontend is CRA/CSR — meta comes from Helmet in-JS; just verify HTML shell renders."""
    r = requests.get(f"{BASE_URL}/join/miami-fl", timeout=15)
    assert r.status_code in (200, 304), f"miami-fl page status {r.status_code}"

"""
Iteration 9 — Ad Studio + new seed data (retailers/restaurants/career postings) regression.

Covers:
- /api/admin/ads/presets, /admin/ads/generate, /admin/ads, /admin/ads/{id}, /storage/ads/{filename}
- Marketplace seed (new retailers + 5 inventory each; new restaurants + 5 menu each)
- Jobs career postings (is_career_demo)
- RBAC negative (customer cannot hit admin endpoints)
"""
import os
import time
import re
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://lumo-bundle-checkout.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"

ADMIN_EMAIL = "admin@lumo.test"
CUSTOMER_EMAIL = "customer@lumo.test"
PASSWORD = "password123"


# ─── Auth fixtures ──────────────────────────────────────────────────────────
def _login(email: str, password: str) -> str | None:
    r = requests.post(f"{API}/auth/login", json={"email": email, "password": password}, timeout=20)
    if r.status_code != 200:
        return None
    return r.json().get("token") or r.json().get("access_token")


@pytest.fixture(scope="module")
def admin_token():
    tok = _login(ADMIN_EMAIL, PASSWORD)
    if not tok:
        pytest.skip("Admin login failed — cannot run admin tests")
    return tok


@pytest.fixture(scope="module")
def admin_client(admin_token):
    s = requests.Session()
    s.headers.update({"Authorization": f"Bearer {admin_token}", "Content-Type": "application/json"})
    return s


@pytest.fixture(scope="module")
def customer_token():
    tok = _login(CUSTOMER_EMAIL, PASSWORD)
    if not tok:
        pytest.skip("Customer login failed")
    return tok


@pytest.fixture(scope="module")
def customer_client(customer_token):
    s = requests.Session()
    s.headers.update({"Authorization": f"Bearer {customer_token}", "Content-Type": "application/json"})
    return s


# ─── Ad Studio: presets + RBAC ──────────────────────────────────────────────
class TestAdPresets:
    def test_presets_admin_ok(self, admin_client):
        r = admin_client.get(f"{API}/admin/ads/presets", timeout=15)
        assert r.status_code == 200, r.text
        data = r.json()
        assert len(data["audiences"]) == 12, f"Expected 12 audiences, got {len(data['audiences'])}"
        assert len(data["categories"]) == 19, f"Expected 19 categories, got {len(data['categories'])}"
        assert len(data["sizes"]) == 3, f"Expected 3 sizes, got {len(data['sizes'])}"
        assert "flex_worker" in data["audiences"]
        assert "delivery" in data["categories"]
        assert "square" in data["sizes"]
        assert data["sizes"]["square"]["width"] == 1080

    def test_presets_customer_forbidden(self, customer_client):
        r = customer_client.get(f"{API}/admin/ads/presets", timeout=15)
        assert r.status_code in (401, 403), f"Expected 401/403 for non-admin, got {r.status_code}"


# ─── Ad Studio: generate (Claude + Nano Banana) ─────────────────────────────
class TestAdGenerate:
    def test_generate_worker_audience(self, admin_client):
        t0 = time.time()
        r = admin_client.post(
            f"{API}/admin/ads/generate",
            json={"audience": "flex_worker", "category": "delivery", "size": "square"},
            timeout=90,
        )
        elapsed = time.time() - t0
        assert r.status_code == 200, f"{r.status_code}: {r.text[:400]}"
        d = r.json()
        # Required fields
        for k in ("id", "headline", "body", "cta", "hashtags", "variants", "width", "height"):
            assert k in d, f"missing field: {k}"
        assert isinstance(d["hashtags"], list) and len(d["hashtags"]) >= 1
        assert isinstance(d["variants"], list)
        assert isinstance(d["cta"], str) and len(d["cta"]) > 0
        assert d["width"] == 1080 and d["height"] == 1080
        # image_url may be null on graceful failure, but if present must start with /api/storage/ads/ or fallback path
        if d.get("image_url"):
            assert d["image_url"].startswith("/api/storage/ads/") or d["image_url"].startswith("/api/ads/local-image/")
        # Worker copy should mention 90%/10% OR flexibility (case-insensitive)
        full = (d["headline"] + " " + d["body"]).lower()
        assert re.search(r"90%|10%|flex|schedule|own hours|your hours|keep .* of", full), \
            f"Worker copy missing 90%/10%/flexibility cue: {full!r}"
        print(f"Worker ad generated in {elapsed:.1f}s, image_url={d.get('image_url')}")
        # store id for next tests
        pytest.worker_ad_id = d["id"]
        pytest.worker_ad_image_url = d.get("image_url")

    def test_generate_customer_audience(self, admin_client):
        r = admin_client.post(
            f"{API}/admin/ads/generate",
            json={"audience": "everyday_customer", "category": "delivery", "size": "square"},
            timeout=90,
        )
        assert r.status_code == 200, r.text[:400]
        d = r.json()
        full = (d["headline"] + " " + d["body"]).lower()
        # Customer copy should emphasise instant/on-demand
        assert re.search(r"instant|on[\- ]?demand|minutes|now|wait", full), \
            f"Customer copy missing instant/on-demand cue: {full!r}"
        pytest.customer_ad_id = d["id"]

    def test_generate_customer_forbidden(self, customer_client):
        r = customer_client.post(
            f"{API}/admin/ads/generate",
            json={"audience": "flex_worker", "category": "delivery", "size": "square"},
            timeout=20,
        )
        assert r.status_code in (401, 403)


# ─── Ad image serve + list + delete ─────────────────────────────────────────
class TestAdImageAndList:
    def test_image_url_serves_png(self, admin_client):
        url = getattr(pytest, "worker_ad_image_url", None)
        if not url:
            pytest.skip("Worker ad had no image_url (graceful image-failure path)")
        full = BASE_URL + url
        r = requests.get(full, timeout=30)
        assert r.status_code == 200, f"Image fetch failed: {r.status_code}"
        assert r.headers.get("content-type", "").startswith(("image/png", "image/jpeg")), \
            f"Bad content-type: {r.headers.get('content-type')}"
        assert len(r.content) > 10_000, f"Image too small: {len(r.content)} bytes"

    def test_list_ads_includes_new(self, admin_client):
        r = admin_client.get(f"{API}/admin/ads", timeout=20)
        assert r.status_code == 200
        ads = r.json()
        assert isinstance(ads, list) and len(ads) >= 2
        # sorted by created_at desc
        ts = [a.get("created_at", "") for a in ads]
        assert ts == sorted(ts, reverse=True), "ads not sorted desc by created_at"
        ids = {a["id"] for a in ads}
        assert getattr(pytest, "worker_ad_id", "x") in ids

    def test_delete_ad_admin(self, admin_client):
        ad_id = getattr(pytest, "customer_ad_id", None)
        if not ad_id:
            pytest.skip("no ad to delete")
        r = admin_client.delete(f"{API}/admin/ads/{ad_id}", timeout=20)
        assert r.status_code == 200, r.text
        # verify gone
        r2 = admin_client.get(f"{API}/admin/ads", timeout=20)
        ids = {a["id"] for a in r2.json()}
        assert ad_id not in ids

    def test_delete_ad_customer_forbidden(self, customer_client):
        # Should be blocked regardless of whether id exists
        r = customer_client.delete(f"{API}/admin/ads/nonexistent-id-xyz", timeout=15)
        assert r.status_code in (401, 403)


# ─── Marketplace seed data ──────────────────────────────────────────────────
EXPECTED_RETAILERS = {
    "Ramona's Boutique", "North Shore Books", "Lagos Bike Co.",
    "Verdant Plant Studio", "Circuit Hub Electronics", "Mariposa Specialty Foods",
}
EXPECTED_RESTAURANTS = {
    "Cafe Lumière", "Tony's Brick Oven", "Sakura Sushi",
    "Casa del Mar", "Saffron Kitchen", "Root & Bloom",
}
# Only the *new* 5 restaurants must have 5+ items each. Cafe Lumière is the original demo with 2.
NEW_RESTAURANTS = EXPECTED_RESTAURANTS - {"Cafe Lumière"}
NEW_RETAILERS = EXPECTED_RETAILERS - {"Ramona's Boutique"}


class TestSeedMarketplace:
    def test_stores_lists_new_retailers(self):
        r = requests.get(f"{API}/stores", timeout=20)
        assert r.status_code == 200
        stores = r.json()
        names = {s.get("name", "") for s in stores}
        missing = EXPECTED_RETAILERS - names
        assert not missing, f"Missing retailers: {missing}. Got: {names}"
        # 6 expected (1 original + 5 new — at least 6 total)
        assert len(stores) >= 6

    def test_each_new_retailer_has_5_items(self, admin_client):
        r = requests.get(f"{API}/stores", timeout=20)
        stores = {s["name"]: s for s in r.json()}
        for name in NEW_RETAILERS:
            store = stores.get(name)
            assert store, f"{name} missing"
            owner_id = store.get("owner_id") or store.get("user_id") or store.get("id")
            # try common owner id field; fall back to id
            inv = requests.get(f"{API}/inventory", params={"owner_id": owner_id}, timeout=15)
            assert inv.status_code == 200, f"{name}: inventory fetch failed {inv.status_code}"
            items = inv.json()
            assert len(items) >= 5, f"{name} expected >=5 inventory items, got {len(items)}"

    def test_restaurants_lists_new(self):
        r = requests.get(f"{API}/restaurants", timeout=20)
        assert r.status_code == 200
        rests = r.json()
        names = {s.get("name", "") for s in rests}
        missing = EXPECTED_RESTAURANTS - names
        assert not missing, f"Missing restaurants: {missing}. Got: {names}"
        assert len(rests) >= 6

    def test_each_new_restaurant_has_5_items(self):
        r = requests.get(f"{API}/restaurants", timeout=20)
        rests = {s["name"]: s for s in r.json()}
        for name in NEW_RESTAURANTS:
            rec = rests.get(name)
            assert rec, f"{name} missing"
            owner_id = rec.get("owner_id") or rec.get("user_id") or rec.get("id")
            inv = requests.get(f"{API}/inventory", params={"owner_id": owner_id}, timeout=15)
            assert inv.status_code == 200
            items = inv.json()
            assert len(items) >= 5, f"{name} expected >=5 menu items, got {len(items)}"


# ─── Career job postings ────────────────────────────────────────────────────
class TestCareerJobs:
    def test_career_postings_present(self):
        r = requests.get(f"{API}/jobs", params={"status": "open"}, timeout=20)
        assert r.status_code == 200, r.text[:300]
        jobs = r.json()
        titles = [j.get("title", "") for j in jobs]
        # Spot check 4 expected career-demo titles
        expected_substrings = [
            "Full-time Delivery Driver",
            "Part-time Babysitter",
            "Seasonal Movers",
            "Freelance React/Next.js Developer",
        ]
        for sub in expected_substrings:
            assert any(sub in t for t in titles), f"Career posting missing: {sub}"

"""Iter 54 — City-targeted recruiting backend tests."""
import os
import time
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
if not BASE_URL:
    # Fallback for direct pytest run using frontend .env
    from pathlib import Path
    env = Path("/app/frontend/.env").read_text()
    for line in env.splitlines():
        if line.startswith("REACT_APP_BACKEND_URL="):
            BASE_URL = line.split("=", 1)[1].strip().rstrip("/")

API = f"{BASE_URL}/api"

ADMIN_EMAIL = "julius.a.mason@gmail.com"
ADMIN_PASS = "Mason0123"
CUSTOMER_EMAIL = "customer@lumo.test"
CUSTOMER_PASS = "password123"

SEED_SLUGS = {
    "los-angeles-ca", "san-francisco-ca", "seattle-wa",
    "tacoma-wa", "chicago-il", "portland-or",
}


@pytest.fixture(scope="module")
def admin_token():
    r = requests.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASS})
    if r.status_code != 200:
        pytest.skip(f"admin login failed: {r.status_code} {r.text}")
    return r.json()["token"]


@pytest.fixture(scope="module")
def customer_token():
    r = requests.post(f"{API}/auth/login", json={"email": CUSTOMER_EMAIL, "password": CUSTOMER_PASS})
    if r.status_code != 200:
        pytest.skip(f"customer login failed: {r.status_code}")
    return r.json()["token"]


def _auth(tok):
    return {"Authorization": f"Bearer {tok}"}


# ── Public endpoints ──────────────────────────────────────────────
def test_list_cities_returns_seed_six():
    r = requests.get(f"{API}/recruit/cities")
    assert r.status_code == 200, r.text
    items = r.json()["items"]
    slugs = {c["slug"] for c in items}
    assert SEED_SLUGS.issubset(slugs), f"missing: {SEED_SLUGS - slugs}"
    la = next(c for c in items if c["slug"] == "los-angeles-ca")
    for field in ["signups_total", "signups_last_7d", "goal_workers",
                  "bonus_amount", "bonus_first_n", "progress_pct", "spots_remaining"]:
        assert field in la, f"missing field {field}"
    assert la["goal_workers"] == 300
    assert la["bonus_amount"] == 100
    assert la["bonus_first_n"] == 100
    assert la["bonus_job_count"] == 100


def test_get_city_valid_slug():
    r = requests.get(f"{API}/recruit/cities/los-angeles-ca")
    assert r.status_code == 200
    d = r.json()
    assert d["hero_headline"]
    assert d["hero_subhead"]
    assert d["hero_image"]


def test_get_city_bogus_404():
    r = requests.get(f"{API}/recruit/cities/does-not-exist-xx")
    assert r.status_code == 404


def test_click_increments_count(admin_token):
    # Get baseline via admin stats
    before = requests.get(f"{API}/admin/recruit/stats", headers=_auth(admin_token)).json()["items"]
    b_la = next(c for c in before if c["slug"] == "los-angeles-ca")
    baseline = b_la.get("click_count", 0)
    r = requests.post(f"{API}/recruit/cities/los-angeles-ca/click")
    assert r.status_code == 200
    after = requests.get(f"{API}/admin/recruit/stats", headers=_auth(admin_token)).json()["items"]
    a_la = next(c for c in after if c["slug"] == "los-angeles-ca")
    assert a_la["click_count"] == baseline + 1


# ── Admin auth ────────────────────────────────────────────────────
def test_admin_stats_requires_auth():
    r = requests.get(f"{API}/admin/recruit/stats")
    assert r.status_code in (401, 403)


def test_admin_stats_forbidden_for_customer(customer_token):
    r = requests.get(f"{API}/admin/recruit/stats", headers=_auth(customer_token))
    assert r.status_code in (401, 403)


def test_admin_stats_returns_all(admin_token):
    r = requests.get(f"{API}/admin/recruit/stats", headers=_auth(admin_token))
    assert r.status_code == 200
    slugs = {c["slug"] for c in r.json()["items"]}
    assert SEED_SLUGS.issubset(slugs)


# ── Admin CRUD ────────────────────────────────────────────────────
TEST_SLUG = f"test-city-{int(time.time())}"


def test_admin_create_city(admin_token):
    payload = {"slug": TEST_SLUG, "city": "TEST_City", "state": "XX", "goal_workers": 250}
    r = requests.post(f"{API}/admin/recruit/cities", json=payload, headers=_auth(admin_token))
    assert r.status_code in (200, 201), r.text
    d = r.json()
    assert d["slug"] == TEST_SLUG
    assert d["goal_workers"] == 250


def test_admin_create_duplicate_409(admin_token):
    payload = {"slug": TEST_SLUG, "city": "TEST_City", "state": "XX"}
    r = requests.post(f"{API}/admin/recruit/cities", json=payload, headers=_auth(admin_token))
    assert r.status_code == 409


def test_admin_patch_city(admin_token):
    r = requests.patch(f"{API}/admin/recruit/cities/{TEST_SLUG}",
                       json={"hero_headline": "New Head", "goal_workers": 400, "is_active": False},
                       headers=_auth(admin_token))
    assert r.status_code == 200, r.text
    d = r.json()
    assert d["hero_headline"] == "New Head"
    assert d["goal_workers"] == 400
    assert d["is_active"] is False


def test_admin_patch_empty_400(admin_token):
    r = requests.patch(f"{API}/admin/recruit/cities/{TEST_SLUG}",
                       json={}, headers=_auth(admin_token))
    assert r.status_code == 400


def test_admin_delete_city_preserves_users(admin_token):
    # Create a fake user attribution for this slug is not possible easily,
    # so just verify delete works and users collection with slug is untouched.
    # First register a test provider tagged with this slug so it exists
    ts = int(time.time() * 1000)
    email = f"TEST_recruit_{ts}@lumo.test"
    reg = requests.post(f"{API}/auth/register", json={
        "email": email, "password": "password123", "name": "TEST Del",
        "role": "provider", "recruit_city_slug": TEST_SLUG,
        "avatar_url": "https://example.com/a.png",
    })
    # Note: patch above set is_active=False; attribution requires city doc to exist (it does).
    assert reg.status_code in (200, 201), reg.text
    # Delete city
    r = requests.delete(f"{API}/admin/recruit/cities/{TEST_SLUG}", headers=_auth(admin_token))
    assert r.status_code == 200
    # City is gone
    g = requests.get(f"{API}/recruit/cities/{TEST_SLUG}")
    assert g.status_code == 404
    # User still exists (login works)
    l = requests.post(f"{API}/auth/login", json={"email": email, "password": "password123"})
    assert l.status_code == 200


# ── Registration attribution ─────────────────────────────────────
def test_register_with_recruit_city_slug_attributes_and_increments():
    # Baseline signups_total
    before = requests.get(f"{API}/recruit/cities/los-angeles-ca").json()
    b_total = before["signups_total"]

    ts = int(time.time() * 1000)
    email = f"TEST_recruit_la_{ts}@lumo.test"
    r = requests.post(f"{API}/auth/register", json={
        "email": email, "password": "password123", "name": "TEST LA",
        "role": "provider", "recruit_city_slug": "los-angeles-ca",
        "avatar_url": "https://example.com/a.png",
    })
    assert r.status_code in (200, 201), r.text
    user = r.json()["user"]
    assert user.get("recruit_city_slug") == "los-angeles-ca"
    assert user.get("recruit_city") == "Los Angeles"
    assert user.get("recruit_state") == "CA"

    after = requests.get(f"{API}/recruit/cities/los-angeles-ca").json()
    assert after["signups_total"] == b_total + 1


def test_register_with_unknown_slug_ignored():
    ts = int(time.time() * 1000)
    email = f"TEST_recruit_bad_{ts}@lumo.test"
    r = requests.post(f"{API}/auth/register", json={
        "email": email, "password": "password123", "name": "TEST Bad",
        "role": "provider", "recruit_city_slug": "does-not-exist-xyz",
        "avatar_url": "https://example.com/a.png",
    })
    assert r.status_code in (200, 201), r.text
    u = r.json()["user"]
    assert not u.get("recruit_city_slug")

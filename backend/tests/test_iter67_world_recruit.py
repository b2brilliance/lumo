# Iteration 67: World recruit cities (seed, world index, filters, city detail, admin stats, sitemap, register attribution)
import os
import time
import uuid
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL").rstrip("/")
ADMIN = {"email": "julius.a.mason@gmail.com", "password": "Mason0123"}


@pytest.fixture(scope="module")
def s():
    return requests.Session()


@pytest.fixture(scope="module")
def admin_h(s):
    r = s.post(f"{BASE_URL}/api/auth/login", json=ADMIN)
    if r.status_code != 200:
        pytest.skip(f"admin login failed {r.status_code}")
    return {"Authorization": f"Bearer {r.json()['token']}"}


# --- World index ---
def test_world_totals(s):
    t = time.time()
    r = s.get(f"{BASE_URL}/api/recruit/world")
    el = time.time() - t
    assert r.status_code == 200
    d = r.json()
    print("world totals", d["total_cities"], d["total_countries"], d["total_signups"], f"{el:.2f}s")
    assert d["total_cities"] >= 1725
    assert d["total_countries"] >= 244
    codes = {c["code"] for c in d["continents"]}
    assert {"AF", "AS", "EU", "NA", "SA", "OC"} <= codes
    c0 = d["continents"][0]["countries"][0]
    for k in ("code", "name", "cities", "signups"):
        assert k in c0


def test_seed_no_duplicate_slugs(admin_h, s):
    r = s.get(f"{BASE_URL}/api/admin/recruit/stats?limit=2000", headers=admin_h)
    assert r.status_code == 200
    slugs = [i["slug"] for i in r.json()["items"]]
    assert len(slugs) == len(set(slugs))
    assert "los-angeles-ca" in slugs


# --- List cities with filters ---
def test_cities_country_ng(s):
    t = time.time()
    r = s.get(f"{BASE_URL}/api/recruit/cities?country=NG")
    el = time.time() - t
    assert r.status_code == 200
    items = r.json()["items"]
    assert items and all(i["country"] == "NG" for i in items)
    pops = [i.get("population") or 0 for i in items]
    assert pops == sorted(pops, reverse=True)
    assert "signups_total" in items[0]
    assert el < 2.0, el


def test_cities_continent_eu(s):
    r = s.get(f"{BASE_URL}/api/recruit/cities?continent=eu")
    items = r.json()["items"]
    assert items and all(i["continent"] == "EU" for i in items)


def test_cities_q_and_limit(s):
    r = s.get(f"{BASE_URL}/api/recruit/cities?q=tok&limit=5")
    items = r.json()["items"]
    assert len(items) <= 5
    assert any(i["slug"] == "tokyo-jp" for i in items), [i["slug"] for i in items]


def test_cities_all_fast(s):
    t = time.time()
    r = s.get(f"{BASE_URL}/api/recruit/cities")
    el = time.time() - t
    print("all cities", len(r.json()["items"]), f"{el:.2f}s", len(r.content), "bytes")
    assert r.status_code == 200
    assert el < 3.0


# --- City detail ---
@pytest.mark.parametrize("slug,lang,cur,cc", [
    ("tokyo-jp", "ja", "JPY", "JP"), ("lagos-ng", "en", "NGN", "NG"),
    ("sao-paulo-br", "pt-BR", "BRL", "BR"), ("paris-fr", "fr", "EUR", "FR"),
    ("los-angeles-ca", "en", "USD", "US"),
])
def test_city_detail(s, slug, lang, cur, cc):
    r = s.get(f"{BASE_URL}/api/recruit/cities/{slug}")
    assert r.status_code == 200, r.text
    d = r.json()
    assert d["page_lang"] == lang
    assert d["currency"] == cur
    assert d["country"] == cc
    assert d["country_name"]
    assert d["continent_name"]
    nb = d["nearby"]
    assert len(nb) <= 8
    assert all(n["slug"] != slug and n["country"] == cc for n in nb)


def test_city_404(s):
    assert s.get(f"{BASE_URL}/api/recruit/cities/nope-xx-zz").status_code == 404


# --- Admin stats ---
def test_admin_stats_filters(s, admin_h):
    r = s.get(f"{BASE_URL}/api/admin/recruit/stats?continent=AS&limit=50", headers=admin_h)
    d = r.json()
    assert r.status_code == 200 and d["total"] > 50 and len(d["items"]) == 50
    assert all(i["continent"] == "AS" for i in d["items"])
    assert "signups_last_7d" in d["items"][0]
    r = s.get(f"{BASE_URL}/api/admin/recruit/stats?country=jp", headers=admin_h)
    assert all(i["country"] == "JP" for i in r.json()["items"])
    r = s.get(f"{BASE_URL}/api/admin/recruit/stats?q=lagos", headers=admin_h)
    assert any(i["slug"] == "lagos-ng" for i in r.json()["items"])


def test_admin_stats_requires_admin(s):
    assert s.get(f"{BASE_URL}/api/admin/recruit/stats").status_code in (401, 403)


# --- Sitemap ---
def test_sitemap(s):
    r = s.get(f"{BASE_URL}/api/sitemap.xml")
    assert r.status_code == 200
    x = r.text
    assert "/join/country/jp<" in x and "/join/country/us<" in x
    assert "/join/continent/europe<" in x
    assert "/join/tokyo-jp<" in x and "/join/lagos-ng<" in x
    print("join urls:", x.count("/join/"))
    assert x.count("/join/") >= 1725


# --- Register attribution ---
def test_register_recruit_country(s, admin_h):
    email = f"test_iter67_{uuid.uuid4().hex[:8]}@example.com"
    r = s.post(f"{BASE_URL}/api/auth/register", json={
        "email": email, "password": "Passw0rd!23", "name": "TEST Tokyo", "role": "provider",
        "recruit_city_slug": "tokyo-jp", "avatar_url": "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=200"})
    assert r.status_code == 200, r.text
    u = r.json()["user"]
    assert u.get("recruit_city_slug") == "tokyo-jp"
    assert u.get("recruit_country") == "JP"
    # signups counted
    d = s.get(f"{BASE_URL}/api/recruit/cities/tokyo-jp").json()
    assert d["signups_total"] >= 1
    w = s.get(f"{BASE_URL}/api/recruit/world").json()
    jp = [c for ct in w["continents"] for c in ct["countries"] if c["code"] == "JP"][0]
    assert jp["signups"] >= 1

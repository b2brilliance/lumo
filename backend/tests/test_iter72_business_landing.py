# Iter72: per-city business landing (/api/business/cities/{slug}), lead capture, admin visibility, city-ads status, build_posts unit
import os
import sys
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL").rstrip("/")
ADMIN = {"email": "julius.a.mason@gmail.com", "password": "Mason0123"}
CREATED = []


@pytest.fixture(scope="module")
def s():
    return requests.Session()


@pytest.fixture(scope="module")
def admin_h(s):
    r = s.post(f"{BASE_URL}/api/auth/login", json=ADMIN)
    if r.status_code != 200:
        pytest.skip(f"admin login failed {r.status_code}")
    return {"Authorization": f"Bearer {r.json()['token']}"}


# --- City info
@pytest.mark.parametrize("slug,rtl", [("riyadh-sa", True), ("tokyo-jp", False), ("bengaluru-in", False), ("london-gb", False)])
def test_city_info(s, slug, rtl):
    r = s.get(f"{BASE_URL}/api/business/cities/{slug}")
    assert r.status_code == 200, r.text
    d = r.json()
    for k in ("city", "native_name", "local_line", "hero_image", "rtl", "categories", "businesses_joined"):
        assert k in d, k
    assert d["slug"] == slug
    assert d["rtl"] is rtl
    assert d["hero_image"].startswith("http")
    assert isinstance(d["categories"], list) and len(d["categories"]) >= 5
    assert isinstance(d["businesses_joined"], int)
    if slug == "london-gb":
        assert d["local_line"] is None
    else:
        assert isinstance(d["local_line"], str) and d["local_line"]
    if slug == "riyadh-sa":
        assert d["city"] == "Riyadh"


def test_city_hero_image_loads(s):
    d = s.get(f"{BASE_URL}/api/business/cities/riyadh-sa").json()
    r = requests.get(d["hero_image"], timeout=20)
    assert r.status_code == 200 and r.headers.get("content-type", "").startswith("image")


def test_city_unknown_404(s):
    assert s.get(f"{BASE_URL}/api/business/cities/does-not-exist").status_code == 404


# --- Lead validation
def _lead(**kw):
    base = {"city_slug": "riyadh-sa", "business_name": "TEST_Biz", "category": "Cleaning",
            "contact_name": "TEST Owner", "phone": "", "email": "test_biz_lead@example.com"}
    base.update(kw)
    return base


def test_lead_missing_business_name(s):
    p = _lead(); p.pop("business_name")
    assert s.post(f"{BASE_URL}/api/business/leads", json=p).status_code == 422


def test_lead_short_business_name(s):
    assert s.post(f"{BASE_URL}/api/business/leads", json=_lead(business_name="A")).status_code == 422


def test_lead_missing_category(s):
    p = _lead(); p.pop("category")
    assert s.post(f"{BASE_URL}/api/business/leads", json=p).status_code == 422


def test_lead_no_contact(s):
    r = s.post(f"{BASE_URL}/api/business/leads", json=_lead(email="", phone="  "))
    assert r.status_code == 422
    assert r.json()["detail"] == "Add a phone number or email"


def test_lead_bad_email(s):
    r = s.post(f"{BASE_URL}/api/business/leads", json=_lead(email="not-an-email"))
    assert r.status_code == 422


def test_lead_unknown_city(s):
    assert s.post(f"{BASE_URL}/api/business/leads", json=_lead(city_slug="does-not-exist")).status_code == 404


def test_lead_success_and_admin_visible(s, admin_h):
    before = s.get(f"{BASE_URL}/api/business/cities/riyadh-sa").json()["businesses_joined"]
    r = s.post(f"{BASE_URL}/api/business/leads", json=_lead(business_name="TEST_Biz Riyadh", phone="+966500000000", utm_campaign="city_ads_business"))
    assert r.status_code == 200, r.text
    d = r.json()
    assert d["ok"] is True and isinstance(d["id"], str)
    CREATED.append(d["id"])
    after = s.get(f"{BASE_URL}/api/business/cities/riyadh-sa").json()["businesses_joined"]
    assert after == before + 1
    # phone only
    r2 = s.post(f"{BASE_URL}/api/business/leads", json=_lead(business_name="TEST_Biz PhoneOnly", email="", phone="+966511111111"))
    assert r2.status_code == 200
    CREATED.append(r2.json()["id"])
    a = s.get(f"{BASE_URL}/api/admin/content", params={"type": "business_lead"}, headers=admin_h)
    assert a.status_code == 200, a.text
    body = a.json()
    items = body.get("items", body if isinstance(body, list) else [])
    match = [i for i in items if i.get("id") == d["id"]]
    assert match, f"lead not in admin list: {str(body)[:300]}"
    m = match[0]
    assert m["business_name"] == "TEST_Biz Riyadh" and m["city"] == "Riyadh" and m["status"] == "new"
    assert "_id" not in m


def test_admin_content_requires_auth(s):
    assert s.get(f"{BASE_URL}/api/admin/content", params={"type": "business_lead"}).status_code in (401, 403)


# --- City-ads status (do NOT call run)
def test_city_ads_status(s, admin_h):
    r = s.get(f"{BASE_URL}/api/admin/city-ads/status", headers=admin_h)
    assert r.status_code == 200, r.text
    d = r.json()
    assert d["top27_v1"]["total"] == 54
    assert d["wave2_v1"]["total"] == 108
    assert "running" in d


def test_city_ads_status_requires_admin(s):
    assert s.get(f"{BASE_URL}/api/admin/city-ads/status").status_code in (401, 403)


# --- Unit: build_posts links
def test_build_posts_unit():
    sys.path.insert(0, "/app/backend")
    import city_ads
    city = {"slug": "riyadh-sa", "city": "Riyadh", "bonus_amount": 100, "bonus_first_n": 100}
    p = city_ads.build_posts(city, "ar", [("Cleaner", "Clean homes")], "https://x.test")
    assert "https://x.test/business/riyadh-sa?utm_source=facebook" in p["business"]["body"]
    assert "https://x.test/register?role=provider&recruit_city_slug=riyadh-sa&utm_source=facebook" in p["jobs"]["body"]
    assert "#Lumo" in p["business"]["body"] and "#Lumo" in p["jobs"]["body"]
    assert len(city_ads.CITIES) == 27 and len(city_ads.WAVE2) == 54
    slugs = [c[0] for c in city_ads.CITIES + city_ads.WAVE2]
    assert len(slugs) == len(set(slugs)), "duplicate slugs across campaigns"


def teardown_module(module):
    try:
        from pymongo import MongoClient
        from dotenv import load_dotenv
        load_dotenv("/app/backend/.env")
        c = MongoClient(os.environ["MONGO_URL"])[os.environ["DB_NAME"]]
        c.business_leads.delete_many({"business_name": {"$regex": "^TEST_"}})
    except Exception as e:  # noqa
        print("cleanup failed", e)

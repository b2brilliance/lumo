# Iteration 70: UTM attribution (click, signup_source, admin report) + FB photo posts + share URL utm params
import os
import sys
import uuid
import asyncio
import pytest
import requests
from pymongo import MongoClient

sys.path.insert(0, "/app/backend")
BASE_URL = os.environ.get("REACT_APP_BACKEND_URL").rstrip("/")


def _env(key):
    for line in open("/app/backend/.env"):
        if line.startswith(key + "="):
            return line.split("=", 1)[1].strip().strip('"')


os.environ.setdefault("META_GRAPH_VERSION", _env("META_GRAPH_VERSION") or "v18.0")
DB = MongoClient(_env("MONGO_URL"))[_env("DB_NAME")]
TAG = uuid.uuid4().hex[:6]
POST_KEY = f"test_post_{TAG}"


@pytest.fixture(scope="module")
def admin_h():
    r = requests.post(f"{BASE_URL}/api/auth/login", json={"email": "julius.a.mason@gmail.com", "password": "Mason0123"})
    if r.status_code != 200:
        pytest.skip("admin login failed")
    return {"Authorization": f"Bearer {r.json()['token']}"}


@pytest.fixture(scope="module", autouse=True)
def cleanup():
    yield
    DB.attribution_clicks.delete_many({"utm_content": {"$regex": "^test_"}})
    DB.users.delete_many({"email": {"$regex": f"^test_attr_{TAG}"}})


def _report(h, **params):
    return requests.get(f"{BASE_URL}/api/admin/attribution/report", params=params, headers=h, timeout=30)


# --- Click endpoint ---
class TestClick:
    def test_click_lowercases_and_extracts_city(self):
        r = requests.post(f"{BASE_URL}/api/attribution/click", json={
            "utm_source": "FaceBook", "utm_medium": "social", "utm_campaign": "City_Blog",
            "utm_content": POST_KEY.upper(), "path": "/join/delhi-in/blog/x"})
        assert r.status_code == 200 and r.json()["ok"] is True
        d = DB.attribution_clicks.find_one({"utm_content": POST_KEY})
        assert d and d["utm_source"] == "facebook" and d["utm_campaign"] == "city_blog"
        assert d["city_slug"] == "delhi-in"

    def test_click_requires_source(self):
        r = requests.post(f"{BASE_URL}/api/attribution/click", json={"utm_content": "x"})
        assert r.status_code == 422

    def test_click_country_path_has_no_city(self):
        requests.post(f"{BASE_URL}/api/attribution/click", json={
            "utm_source": "facebook", "utm_content": f"test_c_{TAG}", "path": "/join/country/in"})
        d = DB.attribution_clicks.find_one({"utm_content": f"test_c_{TAG}"})
        assert d["city_slug"] is None


# --- Register with signup_source ---
class TestSignupSource:
    def test_register_strips_unknown_and_lowercases(self):
        email = f"test_attr_{TAG}_c@example.com"
        r = requests.post(f"{BASE_URL}/api/auth/register", json={
            "email": email, "password": "password123", "name": "TEST Attr", "role": "customer",
            "signup_source": {"utm_source": "FACEBOOK", "utm_campaign": "City_Blog", "utm_content": POST_KEY,
                              "landing_path": "/join/delhi-in/blog/X", "evil": "drop me", "$where": "1"}})
        assert r.status_code in (200, 201), r.text
        u = DB.users.find_one({"email": email})
        ss = u["signup_source"]
        assert ss == {"utm_source": "facebook", "utm_campaign": "city_blog", "utm_content": POST_KEY.lower(),
                      "landing_path": "/join/delhi-in/blog/X"}

    def test_register_without_source(self):
        email = f"test_attr_{TAG}_n@example.com"
        r = requests.post(f"{BASE_URL}/api/auth/register", json={
            "email": email, "password": "password123", "name": "TEST N", "role": "customer", "signup_source": {"foo": "bar"}})
        assert r.status_code in (200, 201)
        assert "signup_source" not in DB.users.find_one({"email": email})


# --- Admin report ---
class TestReport:
    def test_requires_admin(self):
        assert _report({}, source="facebook").status_code in (401, 403)

    def test_customer_forbidden(self):
        r = requests.post(f"{BASE_URL}/api/auth/login", json={"email": f"test_attr_{TAG}_c@example.com", "password": "password123"})
        h = {"Authorization": f"Bearer {r.json()['token']}"}
        assert _report(h).status_code == 403

    @pytest.mark.parametrize("source", ["facebook", "instagram", "all"])
    @pytest.mark.parametrize("days", [7, 30, 90])
    def test_shape(self, admin_h, source, days):
        r = _report(admin_h, source=source, days=days)
        assert r.status_code == 200
        d = r.json()
        assert d["source"] == source and d["days"] == days
        assert set(d["totals"]) == {"clicks", "signups", "posts_shared"}
        for p in d["posts"]:
            assert {"key", "title", "city", "clicks", "signups"} <= set(p)
        for c in d["cities"]:
            assert {"slug", "city", "where", "signups", "from_source", "clicks"} <= set(c)

    def test_facebook_counts_test_post(self, admin_h):
        d = _report(admin_h, source="facebook", days=30).json()
        row = next((p for p in d["posts"] if p["key"] == POST_KEY), None)
        assert row and row["clicks"] == 1 and row["signups"] == 1
        assert any(c["slug"] == "delhi-in" for c in d["cities"])
        assert d["totals"]["clicks"] >= 2 and d["totals"]["signups"] >= 1

    def test_instagram_excludes_fb(self, admin_h):
        d = _report(admin_h, source="instagram", days=30).json()
        assert not any(p["key"] == POST_KEY for p in d["posts"])
        assert all(c["clicks"] or c["from_source"] for c in d["cities"])

    def test_days_validation(self, admin_h):
        assert _report(admin_h, days=0).status_code == 422


# --- Share URLs (unit) ---
class FakeColl:
    def __init__(self, docs=None):
        self.docs = docs or []
        self.inserted = []

    async def find_one(self, q):
        return next((d for d in self.docs if all(d.get(k) == v for k, v in q.items())), None)

    async def insert_one(self, d):
        self.inserted.append(d)


class FakeDB:
    def __init__(self):
        self.social_channels = FakeColl([{"platform": "facebook", "enabled": True},
                                         {"platform": "instagram", "enabled": True}])
        self.social_posts = FakeColl()


class TestShareUrls:
    def test_utm_url(self):
        from attribution import utm_url
        assert utm_url("https://x/a", source="s", campaign="c", content="k") == \
            "https://x/a?utm_source=s&utm_medium=social&utm_campaign=c&utm_content=k"
        assert utm_url("https://x/a?q=1", source="s", campaign="c", content="k").startswith("https://x/a?q=1&utm_source=s")

    def test_city_blog_share_replaces_platform(self, monkeypatch):
        import social_publisher as sp
        import city_blog
        seen = {}

        async def fake(platform):
            async def f(cfg, content):
                seen[platform] = content
                return {"ok": True}
            return f
        monkeypatch.setitem(sp.ADAPTERS, "facebook", asyncio.run(fake("facebook")))
        monkeypatch.setitem(sp.ADAPTERS, "instagram", asyncio.run(fake("instagram")))
        db = FakeDB()
        post = {"id": "p1", "title": "T", "excerpt": "E", "city_slug": "delhi-in", "slug": "delhi-in-2026",
                "city": "New Delhi", "hero_image": "https://img/x.jpg"}
        res = asyncio.run(city_blog.share_post(db, post, "https://base", platforms=["facebook", "instagram"]))
        assert res["facebook"]["ok"] and res["instagram"]["ok"]
        assert seen["facebook"]["url"] == ("https://base/join/delhi-in/blog/delhi-in-2026?utm_source=facebook"
                                           "&utm_medium=social&utm_campaign=city_blog&utm_content=delhi-in-2026")
        assert "utm_source=instagram" in seen["instagram"]["url"]
        assert seen["facebook"]["image_url"] == "https://img/x.jpg"
        assert all("__PLATFORM__" not in d["url"] for d in db.social_posts.inserted)

    def test_recruit_broadcast_url_in_code(self):
        src = open("/app/backend/recruit_cities.py").read()
        assert "utm_campaign=recruit_broadcast&utm_content={city['slug']}" in src
        assert "utm_source=__PLATFORM__" in src


# --- FB photo post (mocked httpx + real Graph with fake token) ---
class FakeResp:
    def __init__(self, code, body):
        self.status_code, self._b, self.text = code, body, str(body)

    def json(self):
        return self._b


def _mock_client(monkeypatch, responses, calls):
    import social_publisher as sp

    class C:
        def __init__(self, *a, **k): pass
        async def __aenter__(self): return self
        async def __aexit__(self, *a): return False

        async def post(self, url, data=None, **k):
            calls.append((url, data))
            return responses.pop(0)
    monkeypatch.setattr(sp.httpx, "AsyncClient", C)


class TestFacebookPhoto:
    CFG = {"page_id": "123", "access_token": "tok"}
    CONTENT = {"title": "T", "body": "B", "url": "https://l/x", "image_url": "https://img/x.jpg"}

    def test_photo_success(self, monkeypatch):
        import social_publisher as sp
        calls = []
        _mock_client(monkeypatch, [FakeResp(200, {"id": "9", "post_id": "123_9"})], calls)
        r = asyncio.run(sp._post_facebook(self.CFG, self.CONTENT))
        assert r["ok"] and r["kind"] == "photo" and r["external_id"] == "123_9"
        assert len(calls) == 1 and calls[0][0].endswith("/123/photos")
        assert calls[0][1]["url"] == "https://img/x.jpg" and "https://l/x" in calls[0][1]["caption"]

    def test_photo_fail_fallback_feed(self, monkeypatch):
        import social_publisher as sp
        calls = []
        _mock_client(monkeypatch, [FakeResp(400, {"error": "x"}), FakeResp(200, {"id": "123_5"})], calls)
        r = asyncio.run(sp._post_facebook(self.CFG, self.CONTENT))
        assert r["ok"] and r["external_id"] == "123_5"
        assert calls[1][0].endswith("/123/feed") and calls[1][1]["link"] == "https://l/x"

    def test_no_image_goes_to_feed(self, monkeypatch):
        import social_publisher as sp
        calls = []
        _mock_client(monkeypatch, [FakeResp(200, {"id": "1"})], calls)
        asyncio.run(sp._post_facebook(self.CFG, {**self.CONTENT, "image_url": None}))
        assert len(calls) == 1 and calls[0][0].endswith("/feed")

    def test_real_graph_fake_token(self):
        import social_publisher as sp
        r = asyncio.run(sp._post_facebook({"page_id": "123456", "access_token": "FAKE"}, self.CONTENT))
        assert r["ok"] is False and "FB 400" in r["error"] and "OAuthException" in r["error"]

# Iteration 69: Facebook OAuth connect (authorize, callback, status, picks/select)
import os
import uuid
import pytest
import requests
from urllib.parse import urlparse, parse_qs
from pymongo import MongoClient

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL").rstrip("/")


def _env(key):
    for line in open("/app/backend/.env"):
        if line.startswith(key + "="):
            return line.split("=", 1)[1].strip().strip('"')


DB = MongoClient(_env("MONGO_URL"))[_env("DB_NAME")]


@pytest.fixture(scope="module")
def admin_h():
    r = requests.post(f"{BASE_URL}/api/auth/login", json={"email": "julius.a.mason@gmail.com", "password": "Mason0123"})
    if r.status_code != 200:
        pytest.skip("admin login failed")
    return {"Authorization": f"Bearer {r.json()['token']}"}


@pytest.fixture(scope="module")
def cust_h():
    email = f"test_fb_{uuid.uuid4().hex[:8]}@example.com"
    r = requests.post(f"{BASE_URL}/api/auth/register", json={"email": email, "password": "password123", "name": "TEST FB", "role": "customer"})
    if r.status_code not in (200, 201):
        pytest.skip(f"register failed {r.status_code} {r.text[:200]}")
    return {"Authorization": f"Bearer {r.json()['token']}"}


def _cb(**params):
    return requests.get(f"{BASE_URL}/api/social/facebook/callback", params=params, allow_redirects=False, timeout=60)


def _loc_q(r):
    loc = r.headers["location"]
    u = urlparse(loc)
    assert f"{u.scheme}://{u.netloc}{u.path}" == "https://golumo.app/admin"
    return {k: v[0] for k, v in parse_qs(u.query).items()}


# --- authorize ---
class TestAuthorize:
    def test_admin_url(self, admin_h):
        r = requests.get(f"{BASE_URL}/api/admin/social/facebook/authorize", headers=admin_h)
        assert r.status_code == 200
        u = urlparse(r.json()["url"])
        assert u.netloc == "www.facebook.com" and u.path == "/v24.0/dialog/oauth"
        q = {k: v[0] for k, v in parse_qs(u.query).items()}
        assert q["client_id"] == "2407445749662589"
        assert q["redirect_uri"] == "https://golumo.app/api/social/facebook/callback"
        assert q["response_type"] == "code"
        for s in ["pages_manage_posts", "pages_show_list", "instagram_content_publish"]:
            assert s in q["scope"]
        assert DB.oauth_states.find_one({"state": q["state"], "provider": "facebook"})

    def test_unauth(self):
        assert requests.get(f"{BASE_URL}/api/admin/social/facebook/authorize").status_code in (401, 403)

    def test_customer_forbidden(self, cust_h):
        for p in ["authorize", "status", "picks/x"]:
            assert requests.get(f"{BASE_URL}/api/admin/social/facebook/{p}", headers=cust_h).status_code in (401, 403)
        assert requests.post(f"{BASE_URL}/api/admin/social/facebook/select", headers=cust_h,
                             json={"pick_id": "x", "page_id": "y"}).status_code in (401, 403)


# --- callback ---
class TestCallback:
    def test_missing_code(self):
        r = _cb()
        assert r.status_code == 307
        q = _loc_q(r)
        assert q["tab"] == "social" and q["facebook"] == "error" and q["reason"]

    def test_access_denied(self):
        r = _cb(error="access_denied", error_description="Permissions error", state="x")
        q = _loc_q(r)
        assert q["facebook"] == "error" and q["reason"] == "Permissions error"

    def test_unknown_state(self):
        q = _loc_q(_cb(code="abc", state="nope-" + uuid.uuid4().hex))
        assert q["facebook"] == "error" and "expired" in q["reason"].lower()

    def test_expired_state(self):
        st = "TEST_exp_" + uuid.uuid4().hex
        DB.oauth_states.insert_one({"state": st, "provider": "facebook", "user_id": "x", "expires_at": "2000-01-01T00:00:00+00:00"})
        q = _loc_q(_cb(code="abc", state=st))
        assert q["facebook"] == "error" and "expired" in q["reason"].lower()
        assert DB.oauth_states.find_one({"state": st}) is None

    def test_valid_state_fake_code_one_time(self, admin_h):
        url = requests.get(f"{BASE_URL}/api/admin/social/facebook/authorize", headers=admin_h).json()["url"]
        state = parse_qs(urlparse(url).query)["state"][0]
        q = _loc_q(_cb(code="fakecode123", state=state))
        assert q["facebook"] == "error"
        assert q["reason"].startswith("Facebook:"), q["reason"]
        assert DB.oauth_states.find_one({"state": state}) is None
        q2 = _loc_q(_cb(code="fakecode123", state=state))
        assert "expired" in q2["reason"].lower()


# --- status ---
class TestStatus:
    def test_status_shape(self, admin_h):
        r = requests.get(f"{BASE_URL}/api/admin/social/facebook/status", headers=admin_h, timeout=60)
        assert r.status_code == 200
        d = r.json()
        for k in ["configured", "connected", "page_name", "page_id", "instagram", "token_valid"]:
            assert k in d
        assert d["configured"] is True
        if d["connected"]:
            assert d["token_valid"] is False  # fake preview token


# --- picks / select ---
class TestPicks:
    def test_unknown_pick(self, admin_h):
        assert requests.get(f"{BASE_URL}/api/admin/social/facebook/picks/nope", headers=admin_h).status_code == 404
        r = requests.post(f"{BASE_URL}/api/admin/social/facebook/select", headers=admin_h, json={"pick_id": "nope", "page_id": "p1"})
        assert r.status_code == 404

    def test_select_saves_and_restore(self, admin_h):
        fb_orig = DB.social_channels.find_one({"platform": "facebook"})
        ig_orig = DB.social_channels.find_one({"platform": "instagram"})
        pid = "tp_" + uuid.uuid4().hex[:8]
        DB.fb_page_picks.insert_one({"id": pid, "pages": [
            {"id": "p1", "name": "Test Page", "access_token": "x", "tasks": ["CREATE_CONTENT"]},
            {"id": "p2", "name": "Other", "access_token": "y", "tasks": ["CREATE_CONTENT"], "instagram_business_account": {"id": "ig1"}}]})
        try:
            r = requests.get(f"{BASE_URL}/api/admin/social/facebook/picks/{pid}", headers=admin_h)
            assert r.status_code == 200
            opts = r.json()
            assert [o["id"] for o in opts] == ["p1", "p2"]
            assert opts[1]["instagram"] is True and "access_token" not in opts[0]
            # wrong page id
            assert requests.post(f"{BASE_URL}/api/admin/social/facebook/select", headers=admin_h,
                                 json={"pick_id": pid, "page_id": "zzz"}).status_code == 404
            r = requests.post(f"{BASE_URL}/api/admin/social/facebook/select", headers=admin_h, json={"pick_id": pid, "page_id": "p1"})
            assert r.status_code == 200
            assert r.json() == {"page_id": "p1", "page_name": "Test Page", "instagram": False}
            doc = DB.social_channels.find_one({"platform": "facebook"})
            assert doc["page_id"] == "p1" and doc["access_token"] == "x" and doc["page_name"] == "Test Page" and doc["enabled"] is True
            assert DB.fb_page_picks.find_one({"id": pid}) is None
            # instagram doc untouched
            assert DB.social_channels.find_one({"platform": "instagram"}) == ig_orig
        finally:
            DB.fb_page_picks.delete_many({"id": pid})
            DB.social_channels.delete_one({"platform": "facebook"})
            if fb_orig:
                DB.social_channels.insert_one(fb_orig)

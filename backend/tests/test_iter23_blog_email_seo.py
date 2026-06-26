"""Iter 23 — Blog + Email subscription + SEO (sitemap/llms.txt/robots.txt) tests."""
import os
import time
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
if not BASE_URL:
    # Fall back to backend frontend .env
    with open("/app/frontend/.env") as f:
        for line in f:
            if line.startswith("REACT_APP_BACKEND_URL="):
                BASE_URL = line.split("=", 1)[1].strip().rstrip("/")
                break

ADMIN_EMAIL = "admin@lumo.test"
ADMIN_PASS = "password123"


# ── fixtures ──────────────────────────────────────────────────────────────
@pytest.fixture(scope="session")
def session():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


@pytest.fixture(scope="session")
def admin_token(session):
    r = session.post(f"{BASE_URL}/api/auth/login",
                     json={"email": ADMIN_EMAIL, "password": ADMIN_PASS})
    assert r.status_code == 200, f"admin login failed: {r.status_code} {r.text[:200]}"
    return r.json()["token"]


@pytest.fixture(scope="session")
def admin_session(session, admin_token):
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json",
                      "Authorization": f"Bearer {admin_token}"})
    return s


# ── Blog: public listing ───────────────────────────────────────────────────
class TestBlogPublic:
    def test_list_public(self, session):
        r = session.get(f"{BASE_URL}/api/blog")
        assert r.status_code == 200
        data = r.json()
        assert "total" in data and "items" in data
        assert isinstance(data["items"], list)

    def test_get_nonexistent(self, session):
        r = session.get(f"{BASE_URL}/api/blog/nonexistent-slug-xyz")
        assert r.status_code == 404
        body = r.json()
        # FastAPI default error format
        assert "detail" in body or "message" in body


# ── Blog: admin config ─────────────────────────────────────────────────────
class TestBlogAdminConfig:
    def test_get_config(self, admin_session):
        r = admin_session.get(f"{BASE_URL}/api/admin/blog/config")
        assert r.status_code == 200
        cfg = r.json()
        assert "paused" in cfg
        assert "schedule_hours_utc" in cfg
        assert "auto_share" in cfg
        assert "topics" in cfg and isinstance(cfg["topics"], list)
        assert len(cfg["topics"]) >= 6

    def test_put_config_pause_and_schedule(self, admin_session):
        # Pause
        r = admin_session.put(f"{BASE_URL}/api/admin/blog/config",
                              json={"paused": True})
        assert r.status_code == 200, r.text
        cfg = r.json()
        assert cfg["paused"] is True

        # Set schedule
        r = admin_session.put(f"{BASE_URL}/api/admin/blog/config",
                              json={"schedule_hours_utc": [10, 14, 20]})
        assert r.status_code == 200
        cfg = r.json()
        assert sorted(cfg["schedule_hours_utc"]) == [10, 14, 20]

        # Reset to defaults
        r = admin_session.put(f"{BASE_URL}/api/admin/blog/config",
                              json={"paused": False, "schedule_hours_utc": [9, 17]})
        assert r.status_code == 200
        cfg = r.json()
        assert cfg["paused"] is False
        assert sorted(cfg["schedule_hours_utc"]) == [9, 17]


# ── Blog: run-now + CRUD ───────────────────────────────────────────────────
class TestBlogRunNowAndCRUD:
    post_id = None
    slug = None

    def test_run_now(self, admin_session):
        r = admin_session.post(f"{BASE_URL}/api/admin/blog/run-now", timeout=90)
        if r.status_code != 200:
            pytest.skip(f"LLM call failed (external dependency): {r.status_code} {r.text[:200]}")
        body = r.json()
        assert body.get("ok") is True
        post = body.get("post")
        assert post and post.get("id") and post.get("slug")
        assert post.get("status") == "published"
        assert post.get("title")
        # body_md may be empty if LLM failed JSON parsing
        assert "body_md" in post
        TestBlogRunNowAndCRUD.post_id = post["id"]
        TestBlogRunNowAndCRUD.slug = post["slug"]

    def test_appears_in_public_list(self, session):
        if not TestBlogRunNowAndCRUD.slug:
            pytest.skip("no post created")
        r = session.get(f"{BASE_URL}/api/blog")
        assert r.status_code == 200
        slugs = [it.get("slug") for it in r.json()["items"]]
        assert TestBlogRunNowAndCRUD.slug in slugs

    def test_get_detail(self, session):
        if not TestBlogRunNowAndCRUD.slug:
            pytest.skip("no post created")
        r = session.get(f"{BASE_URL}/api/blog/{TestBlogRunNowAndCRUD.slug}")
        assert r.status_code == 200
        doc = r.json()
        assert doc["slug"] == TestBlogRunNowAndCRUD.slug
        assert "body_md" in doc

    def test_update_to_draft_hides(self, admin_session, session):
        if not TestBlogRunNowAndCRUD.post_id:
            pytest.skip("no post created")
        r = admin_session.put(
            f"{BASE_URL}/api/admin/blog/{TestBlogRunNowAndCRUD.post_id}",
            json={"status": "draft"})
        assert r.status_code == 200, r.text

        r = session.get(f"{BASE_URL}/api/blog/{TestBlogRunNowAndCRUD.slug}")
        assert r.status_code == 404

        # Re-publish
        r = admin_session.put(
            f"{BASE_URL}/api/admin/blog/{TestBlogRunNowAndCRUD.post_id}",
            json={"status": "published"})
        assert r.status_code == 200

    def test_update_title_regenerates_slug(self, admin_session):
        if not TestBlogRunNowAndCRUD.post_id:
            pytest.skip("no post created")
        new_title = "TEST Lumo Updated Title Iter23"
        r = admin_session.put(
            f"{BASE_URL}/api/admin/blog/{TestBlogRunNowAndCRUD.post_id}",
            json={"title": new_title, "excerpt": "TEST excerpt",
                  "tags": ["test", "iter23"]})
        assert r.status_code == 200
        doc = r.json()
        assert doc["title"] == new_title
        assert doc["slug"] == "test-lumo-updated-title-iter23"

    def test_delete_post(self, admin_session, session):
        if not TestBlogRunNowAndCRUD.post_id:
            pytest.skip("no post created")
        r = admin_session.delete(
            f"{BASE_URL}/api/admin/blog/{TestBlogRunNowAndCRUD.post_id}")
        assert r.status_code == 200
        assert r.json().get("deleted", 0) >= 1


# ── Email subscriptions ────────────────────────────────────────────────────
class TestEmailSubs:
    test_email = f"test_iter23_{int(time.time())}@example.com"  # lowercased — backend lowercases
    token = None

    def test_subscribe_new(self, session):
        r = session.post(f"{BASE_URL}/api/subscribe",
                         json={"email": TestEmailSubs.test_email,
                               "source": "iter23_test"})
        assert r.status_code == 200, r.text
        body = r.json()
        assert body.get("ok") is True
        assert body.get("already_subscribed") is False

    def test_subscribe_again_is_already(self, session):
        r = session.post(f"{BASE_URL}/api/subscribe",
                         json={"email": TestEmailSubs.test_email})
        assert r.status_code == 200
        assert r.json().get("already_subscribed") is True

    def test_subscribe_invalid_email(self, session):
        r = session.post(f"{BASE_URL}/api/subscribe", json={"email": "not-an-email"})
        assert r.status_code == 422

    def test_list_subscribers(self, admin_session):
        r = admin_session.get(f"{BASE_URL}/api/admin/subscribers?q=TEST_iter23")
        assert r.status_code == 200
        data = r.json()
        assert "total" in data and "items" in data
        match = [it for it in data["items"] if it["email"] == TestEmailSubs.test_email]
        assert match, "Subscriber should be listed"
        TestEmailSubs.token = match[0]["unsubscribe_token"]

    def test_unsubscribe_bad_token(self, session):
        r = session.get(f"{BASE_URL}/api/unsubscribe?token=BADTOKEN_NOPE")
        assert r.status_code == 200
        assert "Link expired" in r.text

    def test_unsubscribe_valid_token(self, session, admin_session):
        if not TestEmailSubs.token:
            pytest.skip("no token captured")
        r = session.get(f"{BASE_URL}/api/unsubscribe?token={TestEmailSubs.token}")
        assert r.status_code == 200
        assert "unsubscribed" in r.text.lower()

        # Verify status flipped
        r2 = admin_session.get(f"{BASE_URL}/api/admin/subscribers?q=TEST_iter23")
        items = r2.json().get("items", [])
        match = [it for it in items if it["email"] == TestEmailSubs.test_email]
        assert match and match[0]["status"] == "unsubscribed"

    def test_stats(self, admin_session):
        r = admin_session.get(f"{BASE_URL}/api/admin/subscribers/stats")
        assert r.status_code == 200
        s = r.json()
        for k in ("active", "unsubscribed", "total_sends", "resend_configured"):
            assert k in s
        assert isinstance(s["resend_configured"], bool)

    def test_send_now(self, admin_session):
        # Resubscribe a fresh email so there is at least 1 active sub
        fresh = f"TEST_iter23_send_{int(time.time())}@example.com"
        admin_session.post(f"{BASE_URL}/api/subscribe", json={"email": fresh})
        r = admin_session.post(f"{BASE_URL}/api/admin/subscribers/send-now",
                               timeout=30)
        assert r.status_code == 200, r.text
        body = r.json()
        assert body.get("ok") is True
        assert "sent" in body and "queued" in body and "failed" in body
        assert "topic" in body and "topic_title" in body
        # Without RESEND_API_KEY, sent=0 and queued>=1
        if not body.get("resend_configured"):
            assert body["sent"] == 0
            assert body["queued"] >= 1


# ── SEO endpoints ──────────────────────────────────────────────────────────
class TestSEO:
    def test_sitemap_xml(self, session):
        r = session.get(f"{BASE_URL}/api/sitemap.xml")
        assert r.status_code == 200
        ct = r.headers.get("content-type", "")
        assert "xml" in ct
        body = r.text
        for path in ["/about", "/contact", "/terms", "/privacy", "/blog"]:
            assert path in body, f"sitemap missing {path}"
        assert "<urlset" in body

    def test_llms_txt(self, session):
        r = session.get(f"{BASE_URL}/api/llms.txt")
        assert r.status_code == 200
        ct = r.headers.get("content-type", "")
        assert "text/plain" in ct
        body = r.text
        assert "Lumo" in body

    def test_robots_txt(self, session):
        r = session.get(f"{BASE_URL}/api/robots.txt")
        assert r.status_code == 200
        ct = r.headers.get("content-type", "")
        assert "text/plain" in ct
        body = r.text
        assert "Disallow: /admin" in body
        assert "Sitemap:" in body
        for bot in ["GPTBot", "ClaudeBot", "PerplexityBot", "Google-Extended"]:
            assert bot in body, f"robots.txt missing {bot}"

    def test_static_llms_txt(self, session):
        # Root-level static file (served by frontend)
        r = session.get(f"{BASE_URL}/llms.txt")
        assert r.status_code == 200
        assert "Lumo" in r.text or "lumo" in r.text.lower()

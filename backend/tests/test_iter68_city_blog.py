# Iteration 68: daily city recruiting blog (cron, public, admin, sitemap, due-city logic)
import os
import time
import uuid
import asyncio
import pytest
import requests
from datetime import datetime, timedelta, timezone

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL").rstrip("/")


def _env(key):
    for line in open("/app/backend/.env"):
        if line.startswith(key + "="):
            return line.split("=", 1)[1].strip().strip('"')


SECRET = _env("WEBHOOK_CRON_SECRET")


@pytest.fixture(scope="module")
def admin_h():
    r = requests.post(f"{BASE_URL}/api/auth/login", json={"email": "julius.a.mason@gmail.com", "password": "Mason0123"})
    if r.status_code != 200:
        pytest.skip("admin login failed")
    return {"Authorization": f"Bearer {r.json()['token']}"}


@pytest.fixture(scope="module")
def cust_h():
    r = requests.post(f"{BASE_URL}/api/auth/login", json={"email": "customer@lumo.test", "password": "password123"})
    if r.status_code != 200:
        pytest.skip("customer login failed")
    return {"Authorization": f"Bearer {r.json()['token']}"}


# --- cron endpoint auth + idempotency (no new runs that write posts) ---
class TestCron:
    def test_no_auth(self):
        assert requests.post(f"{BASE_URL}/api/cron/city-blogs", json={}).status_code == 401

    def test_wrong_auth(self):
        r = requests.post(f"{BASE_URL}/api/cron/city-blogs", json={}, headers={"Authorization": "Bearer nope"})
        assert r.status_code == 401

    def test_new_run_while_disabled_then_duplicate(self, admin_h):
        # disable auto-publish so a fresh run id acks without generating posts (no LLM cost)
        requests.put(f"{BASE_URL}/api/admin/city-blog/config", json={"enabled": False}, headers=admin_h)
        try:
            rid = f"iter68-{uuid.uuid4()}"
            h = {"Authorization": f"Bearer {SECRET}", "X-Webhook-Id": rid}
            t = time.time()
            r1 = requests.post(f"{BASE_URL}/api/cron/city-blogs", json={}, headers=h)
            assert r1.status_code == 200 and time.time() - t < 10
            assert r1.json() == {"ok": True, "queued": False}
            r2 = requests.post(f"{BASE_URL}/api/cron/city-blogs", json={}, headers=h)
            assert r2.json() == {"ok": True, "duplicate": True}
        finally:
            requests.put(f"{BASE_URL}/api/admin/city-blog/config", json={"enabled": True}, headers=admin_h)

    def test_existing_run_id_duplicate(self):
        h = {"Authorization": f"Bearer {SECRET}", "X-Webhook-Id": "test-run-1"}
        r = requests.post(f"{BASE_URL}/api/cron/city-blogs", json={}, headers=h)
        assert r.status_code == 200 and r.json() == {"ok": True, "duplicate": True}


# --- public endpoints ---
class TestPublic:
    def test_latest(self):
        r = requests.get(f"{BASE_URL}/api/city-blog/latest")
        assert r.status_code == 200
        d = r.json()
        assert len(d) >= 15
        for p in d:
            assert "body_md" not in p and "body_md_en" not in p and "_id" not in p
            assert p["title"] and p["title_en"] and p["slug"] and p["city_slug"]

    def test_by_city(self):
        r = requests.get(f"{BASE_URL}/api/city-blog/city/istanbul-tr")
        assert r.status_code == 200
        d = r.json()
        assert d and all(p["city_slug"] == "istanbul-tr" for p in d)
        assert "body_md" not in d[0]

    def test_post_and_views(self):
        r1 = requests.get(f"{BASE_URL}/api/city-blog/post/istanbul-tr-2026-10-18")
        assert r1.status_code == 200
        p = r1.json()
        assert p["lang"] == "tr" and p["body_md"] and p["body_md_en"] and p["body_md"] != p["body_md_en"]
        assert p["title_en"] and p["excerpt_en"]
        r2 = requests.get(f"{BASE_URL}/api/city-blog/post/istanbul-tr-2026-10-18")
        assert r2.json()["view_count"] == p["view_count"] + 1

    def test_unknown_post(self):
        assert requests.get(f"{BASE_URL}/api/city-blog/post/lumo-bundle-checkout").status_code == 404

    def test_sitemap(self):
        r = requests.get(f"{BASE_URL}/api/sitemap.xml")
        if r.status_code != 200:
            r = requests.get(f"{BASE_URL}/sitemap.xml")
        assert "/join/istanbul-tr/blog/istanbul-tr-2026-10-18" in r.text


# --- admin endpoints ---
class TestAdmin:
    def test_non_admin(self, cust_h):
        assert requests.get(f"{BASE_URL}/api/admin/city-blog/config", headers=cust_h).status_code in (401, 403)
        assert requests.get(f"{BASE_URL}/api/admin/city-blog/config").status_code in (401, 403)
        assert requests.post(f"{BASE_URL}/api/admin/city-blog/run?count=1", headers=cust_h).status_code in (401, 403)
        assert requests.delete(f"{BASE_URL}/api/admin/city-blog/posts/x", headers=cust_h).status_code in (401, 403)

    def test_config_get(self, admin_h):
        r = requests.get(f"{BASE_URL}/api/admin/city-blog/config", headers=admin_h)
        assert r.status_code == 200
        d = r.json()
        for k in ("enabled", "daily_top_n", "batch_size", "share_social", "total_posts", "posts_24h"):
            assert k in d
        assert d["total_posts"] >= 15

    def test_config_validation(self, admin_h):
        for body in ({"daily_top_n": -1}, {"daily_top_n": 2001}, {"batch_size": 0}, {"batch_size": 51}):
            r = requests.put(f"{BASE_URL}/api/admin/city-blog/config", json=body, headers=admin_h)
            assert r.status_code == 422, body

    def test_config_update_and_restore(self, admin_h):
        r = requests.put(f"{BASE_URL}/api/admin/city-blog/config", json={"daily_top_n": 250, "share_social": False}, headers=admin_h)
        assert r.status_code == 200 and r.json()["daily_top_n"] == 250 and r.json()["share_social"] is False
        g = requests.get(f"{BASE_URL}/api/admin/city-blog/config", headers=admin_h).json()
        assert g["daily_top_n"] == 250
        r = requests.put(f"{BASE_URL}/api/admin/city-blog/config",
                         json={"enabled": True, "daily_top_n": 300, "batch_size": 15, "share_social": True}, headers=admin_h)
        d = r.json()
        assert d["enabled"] is True and d["daily_top_n"] == 300 and d["batch_size"] == 15 and d["share_social"] is True

    def test_admin_posts(self, admin_h):
        r = requests.get(f"{BASE_URL}/api/admin/city-blog/posts", headers=admin_h)
        assert r.status_code == 200 and len(r.json()) >= 15
        assert "body_md" not in r.json()[0]

    def test_delete_unknown(self, admin_h):
        assert requests.delete(f"{BASE_URL}/api/admin/city-blog/posts/nope-{uuid.uuid4()}", headers=admin_h).status_code == 404

    def test_run_validation(self, admin_h):
        assert requests.post(f"{BASE_URL}/api/admin/city-blog/run?count=0", headers=admin_h).status_code == 422
        assert requests.post(f"{BASE_URL}/api/admin/city-blog/run?count=21", headers=admin_h).status_code == 422


# --- due-city selection logic, run against the real DB read-only ---
class TestDueCities:
    def test_due_logic(self):
        import sys
        sys.path.insert(0, "/app/backend")
        from motor.motor_asyncio import AsyncIOMotorClient
        import city_blog

        async def go():
            db = AsyncIOMotorClient(_env("MONGO_URL"))[_env("DB_NAME")]
            cfg = await city_blog.get_cfg(db)
            due = await city_blog._due_cities(db, cfg, 50)
            slugs = [c["slug"] for c in due]
            posted = ["istanbul-tr", "lahore-pk", "shanghai-cn", "lagos-ng"]
            assert not set(posted) & set(slugs), slugs
            top = [t["slug"] for t in await db.recruit_cities.find({"is_active": True}, {"slug": 1}).sort("population", -1).limit(cfg["daily_top_n"]).to_list(None)]
            day_cut = (datetime.now(timezone.utc) - timedelta(hours=20)).isoformat()
            for c in due[:min(len(due), 30)]:
                assert c["slug"] in top, c["slug"]  # top cities first
                assert not c.get("last_blog_at") or c["last_blog_at"] < day_cut
            # top due ordered by population desc
            pops = [c.get("population") or 0 for c in due if c["slug"] in top]
            assert pops == sorted(pops, reverse=True)
            # small cfg: daily_top_n=0 -> only weekly rule
            due0 = await city_blog._due_cities(db, {**cfg, "daily_top_n": 0}, 5)
            week_cut = (datetime.now(timezone.utc) - timedelta(days=6, hours=12)).isoformat()
            assert all(not c.get("last_blog_at") or c["last_blog_at"] < week_cut for c in due0)
            assert not set(posted) & {c["slug"] for c in due0}
            print("due first 5:", slugs[:5], "count top:", len(top))
        asyncio.run(go())

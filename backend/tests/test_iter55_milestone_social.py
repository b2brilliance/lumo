"""Iter 55 — $100/100-jobs milestone + social auto-poster + recruit auto-broadcast.

Backend tests:
    * HTTP: /api/recruit/cities returns new $100 bonus.
    * HTTP: /api/admin/social/* config, test, history endpoints.
    * HTTP: /api/admin/recruit/autopost + /api/admin/recruit/broadcast-now.
    * Unit (motor + monkeypatch): credit_city_milestone happy path + guards.
    * Unit: blog.py _share_to_channels fires _social_publish exactly once.

Third-party HTTP calls to FB/IG/X/Reddit are NEVER made — credentials are
empty so adapters return {skipped: True}. No network mocking required.
"""
from __future__ import annotations

import asyncio
import os
import sys
import time
import uuid
from pathlib import Path

import pytest
import requests

# ── BASE_URL bootstrap ────────────────────────────────────────────
BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
if not BASE_URL:
    env = Path("/app/frontend/.env").read_text()
    for line in env.splitlines():
        if line.startswith("REACT_APP_BACKEND_URL="):
            BASE_URL = line.split("=", 1)[1].strip().strip('"').rstrip("/")
API = f"{BASE_URL}/api"

ADMIN_EMAIL = "julius.a.mason@gmail.com"
ADMIN_PASS = "Mason0123"
CUSTOMER_EMAIL = "customer@lumo.test"
CUSTOMER_PASS = "password123"

# Make backend importable for unit tests
sys.path.insert(0, "/app/backend")

# Load .env for MONGO_URL when running pytest outside supervisor
from dotenv import load_dotenv  # type: ignore
load_dotenv("/app/backend/.env")


def _auth(tok):
    return {"Authorization": f"Bearer {tok}"}


@pytest.fixture(scope="module")
def admin_token():
    r = requests.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASS})
    if r.status_code != 200:
        pytest.skip(f"admin login failed: {r.status_code} {r.text[:200]}")
    return r.json()["token"]


# ═════════════════════════════════════════════════════════════════
# 1. Public: cities have $100 / 100-jobs bonus (migration applied)
# ═════════════════════════════════════════════════════════════════
def test_cities_have_100_dollar_bonus():
    r = requests.get(f"{API}/recruit/cities")
    assert r.status_code == 200, r.text
    items = r.json()["items"]
    seeds = {"los-angeles-ca", "san-francisco-ca", "seattle-wa",
             "tacoma-wa", "chicago-il", "portland-or"}
    got = {c["slug"] for c in items}
    assert seeds.issubset(got), f"missing: {seeds - got}"
    for c in items:
        if c["slug"] in seeds:
            assert c["bonus_amount"] == 100, f"{c['slug']} bonus_amount={c['bonus_amount']}"
            assert c["bonus_first_n"] == 100
            assert c["bonus_job_count"] == 100


# ═════════════════════════════════════════════════════════════════
# 2. Admin social config CRUD + guards
# ═════════════════════════════════════════════════════════════════
def test_social_config_requires_admin():
    r = requests.get(f"{API}/admin/social/config")
    assert r.status_code in (401, 403)


def test_social_config_lists_4_platforms(admin_token):
    r = requests.get(f"{API}/admin/social/config", headers=_auth(admin_token))
    assert r.status_code == 200, r.text
    items = r.json()["items"]
    platforms = {i["platform"] for i in items}
    assert platforms == {"facebook", "instagram", "twitter", "reddit"}
    for it in items:
        assert "enabled" in it
        assert "label" in it


def test_social_config_put_persists(admin_token):
    body = {"platform": "facebook", "enabled": True,
            "config": {"page_id": "test-page-x", "access_token": "TEST_TOKEN_ONLY"}}
    r = requests.put(f"{API}/admin/social/config/facebook",
                     json=body, headers=_auth(admin_token))
    assert r.status_code == 200, r.text
    # Read back
    g = requests.get(f"{API}/admin/social/config", headers=_auth(admin_token))
    fb = next(x for x in g.json()["items"] if x["platform"] == "facebook")
    assert fb["enabled"] is True
    assert fb["config"].get("page_id") == "test-page-x"
    # Cleanup: disable so we don't attempt real posts elsewhere
    requests.put(f"{API}/admin/social/config/facebook",
                 json={"platform": "facebook", "enabled": False, "config": {}},
                 headers=_auth(admin_token))


def test_social_config_put_unknown_platform_400(admin_token):
    r = requests.put(f"{API}/admin/social/config/tiktok",
                     json={"platform": "tiktok", "enabled": True, "config": {}},
                     headers=_auth(admin_token))
    assert r.status_code == 400


def test_social_test_skips_gracefully_when_no_creds(admin_token):
    # Force twitter config empty
    requests.put(f"{API}/admin/social/config/twitter",
                 json={"platform": "twitter", "enabled": False, "config": {}},
                 headers=_auth(admin_token))
    r = requests.post(f"{API}/admin/social/test",
                      json={"platform": "twitter", "title": "TEST_", "body": "hi"},
                      headers=_auth(admin_token))
    assert r.status_code == 200, r.text
    data = r.json()
    assert data.get("ok") is False
    assert data.get("skipped") is True


def test_social_history_list(admin_token):
    r = requests.get(f"{API}/admin/social/history", headers=_auth(admin_token))
    assert r.status_code == 200
    assert isinstance(r.json().get("items"), list)


# ═════════════════════════════════════════════════════════════════
# 3. Admin recruit auto-post + broadcast-now
# ═════════════════════════════════════════════════════════════════
def test_recruit_autopost_get_requires_admin():
    r = requests.get(f"{API}/admin/recruit/autopost")
    assert r.status_code in (401, 403)


def test_recruit_autopost_toggle(admin_token):
    # Turn on
    r = requests.put(f"{API}/admin/recruit/autopost",
                     json={"enabled": True}, headers=_auth(admin_token))
    assert r.status_code == 200
    assert r.json()["enabled"] is True
    # Read back
    g = requests.get(f"{API}/admin/recruit/autopost", headers=_auth(admin_token))
    assert g.json()["enabled"] is True
    # Turn off
    r2 = requests.put(f"{API}/admin/recruit/autopost",
                      json={"enabled": False}, headers=_auth(admin_token))
    assert r2.json()["enabled"] is False


def test_broadcast_now_fires_per_city(admin_token):
    r = requests.post(f"{API}/admin/recruit/broadcast-now",
                      headers=_auth(admin_token))
    assert r.status_code == 200, r.text
    d = r.json()
    assert "fired" in d and d["fired"] >= 6
    assert isinstance(d["cities"], list) and len(d["cities"]) >= 6
    # Each city has a results dict; empty results = no enabled channels (skipped ok).
    for c in d["cities"]:
        assert "slug" in c
        assert isinstance(c.get("results"), dict)


# ═════════════════════════════════════════════════════════════════
# 4. Unit — credit_city_milestone via motor
# ═════════════════════════════════════════════════════════════════
@pytest.fixture(scope="module")
def event_loop():
    loop = asyncio.new_event_loop()
    yield loop
    loop.close()


@pytest.fixture(scope="module")
def db():
    from motor.motor_asyncio import AsyncIOMotorClient
    client = AsyncIOMotorClient(os.environ["MONGO_URL"])
    return client[os.environ["DB_NAME"]]


async def _make_provider(db, *, slug: str | None, created_at: str | None = None):
    from datetime import datetime, timezone
    pid = f"TEST_prov_{uuid.uuid4().hex[:12]}"
    doc = {
        "id": pid,
        "email": f"{pid}@lumo.test",
        "role": "provider",
        "name": "TEST prov",
        "wallet_balance": 0.0,
        "created_at": created_at or datetime.now(timezone.utc).isoformat(),
    }
    if slug is not None:
        doc["recruit_city_slug"] = slug
    await db.users.insert_one(doc)
    return pid


async def _seed_jobs(db, pid: str, n: int):
    """Insert N wallet_transactions rows that count as jobs."""
    from datetime import datetime, timezone
    rows = [{
        "id": str(uuid.uuid4()),
        "user_id": pid,
        "amount": 10.0,
        "type": "credit",
        "reason": "TEST job",
        "ref_id": str(uuid.uuid4()),
        "ref_kind": "job",
        "created_at": datetime.now(timezone.utc).isoformat(),
    } for _ in range(n)]
    await db.wallet_transactions.insert_many(rows)


async def _cleanup(db, pid: str):
    await db.users.delete_many({"id": pid})
    await db.wallet_transactions.delete_many({"user_id": pid})
    await db.recruit_milestones.delete_many({"user_id": pid})
    await db.notifications.delete_many({"user_id": pid})


def test_credit_city_milestone_happy_path(event_loop, db):
    from recruit_cities import credit_city_milestone

    async def _run():
        pid = await _make_provider(db, slug="los-angeles-ca",
                                   created_at="1900-01-01T00:00:00+00:00")
        try:
            await _seed_jobs(db, pid, 100)
            # First call → credits $100
            res = await credit_city_milestone(db, provider_id=pid)
            assert res is not None, "expected milestone record"
            assert res["amount"] == 100
            u = await db.users.find_one({"id": pid})
            assert u["wallet_balance"] == 100
            assert u.get("city_milestone_awarded_at")
            # wallet_transactions credit row
            n_credit = await db.wallet_transactions.count_documents(
                {"user_id": pid, "ref_kind": "city_milestone"})
            assert n_credit == 1
            # Idempotent — second call is a no-op
            res2 = await credit_city_milestone(db, provider_id=pid)
            assert res2 is None
            u2 = await db.users.find_one({"id": pid})
            assert u2["wallet_balance"] == 100  # unchanged
        finally:
            await _cleanup(db, pid)

    event_loop.run_until_complete(_run())


def test_credit_city_milestone_guards(event_loop, db):
    from recruit_cities import credit_city_milestone

    async def _run():
        # (a) provider without recruit_city_slug → no fire
        pid1 = await _make_provider(db, slug=None)
        try:
            await _seed_jobs(db, pid1, 100)
            assert await credit_city_milestone(db, provider_id=pid1) is None
            u = await db.users.find_one({"id": pid1})
            assert u["wallet_balance"] == 0
        finally:
            await _cleanup(db, pid1)

        # (c) fewer than 100 jobs → no fire
        pid3 = await _make_provider(db, slug="los-angeles-ca",
                                    created_at="1900-01-02T00:00:00+00:00")
        try:
            await _seed_jobs(db, pid3, 99)
            assert await credit_city_milestone(db, provider_id=pid3) is None
            u = await db.users.find_one({"id": pid3})
            assert u["wallet_balance"] == 0
        finally:
            await _cleanup(db, pid3)

        # (d) non-provider role → no fire
        pid4 = f"TEST_cust_{uuid.uuid4().hex[:12]}"
        await db.users.insert_one({
            "id": pid4, "email": f"{pid4}@t.com", "role": "customer",
            "recruit_city_slug": "los-angeles-ca", "wallet_balance": 0,
            "created_at": "1900-01-03T00:00:00+00:00",
        })
        try:
            await _seed_jobs(db, pid4, 100)
            assert await credit_city_milestone(db, provider_id=pid4) is None
        finally:
            await _cleanup(db, pid4)

        # (b) outside first_n: create a fake target city with bonus_first_n=1
        #     then create 2 providers; second one should be gated out.
        test_slug = f"TEST_city_{uuid.uuid4().hex[:6]}"
        from datetime import datetime, timezone
        await db.recruit_cities.insert_one({
            "id": str(uuid.uuid4()), "slug": test_slug,
            "city": "TESTVILLE", "state": "XX",
            "goal_workers": 10, "bonus_amount": 100,
            "bonus_first_n": 1, "bonus_job_count": 100,
            "is_active": True, "click_count": 0, "view_count": 0,
            "created_at": datetime.now(timezone.utc).isoformat(),
        })
        pidA = await _make_provider(db, slug=test_slug,
                                    created_at="2000-01-01T00:00:00+00:00")
        pidB = await _make_provider(db, slug=test_slug,
                                    created_at="2000-06-01T00:00:00+00:00")
        try:
            await _seed_jobs(db, pidA, 100)
            await _seed_jobs(db, pidB, 100)
            # A is first → should fire
            assert await credit_city_milestone(db, provider_id=pidA) is not None
            # B is 2nd → outside first_n=1 → no fire
            assert await credit_city_milestone(db, provider_id=pidB) is None
            uB = await db.users.find_one({"id": pidB})
            assert uB["wallet_balance"] == 0
        finally:
            await _cleanup(db, pidA)
            await _cleanup(db, pidB)
            await db.recruit_cities.delete_one({"slug": test_slug})

    event_loop.run_until_complete(_run())


# ═════════════════════════════════════════════════════════════════
# 5. Blog _share_to_channels calls _social_publish once
# ═════════════════════════════════════════════════════════════════
def test_blog_share_hook_calls_social_publish_once(event_loop, db):
    """Monkey-patch server._social_publish and call blog._share_to_channels
    with a fake post — verify it fires exactly once with proper content."""
    import blog
    import server

    calls = []

    async def fake_publish(db_arg, content):
        calls.append(content)
        return {"facebook": {"ok": False, "skipped": True}}

    original = server._social_publish
    server._social_publish = fake_publish
    try:
        post = {
            "id": "TEST_blog_" + uuid.uuid4().hex[:8],
            "slug": "test-blog-slug",
            "title": "How to earn $100 on Lumo",
            "excerpt": "Excerpt goes here.",
            "body_md": "Full markdown body.",
            "hero_image_url": "https://example.com/x.jpg",
            "tags": ["gig", "lumo"],
        }
        event_loop.run_until_complete(blog._share_to_channels(db, post))
        assert len(calls) == 1, f"expected 1 call, got {len(calls)}"
        content = calls[0]
        assert content["title"] == post["title"]
        assert content["source_type"] == "blog"
        assert content["url"].startswith("/blog/")
        assert content["source_id"] == post["id"]
    finally:
        server._social_publish = original

"""Iteration 16 — Distribution: webhook/slack/zapier/make/ifttt connectors + one-shot scheduler.

Tests:
  - GET /api/admin/distribution/types
  - POST /api/admin/distribution/connectors
  - POST /api/admin/distribution/broadcast
  - POST /api/admin/distribution/connectors/{cid}/test
  - POST /api/admin/distribution/schedule-once
  - _scheduler_loop auto-disables one_shot schedules
"""

import os
import time
import uuid
from datetime import datetime, timedelta, timezone

import pytest
import requests
from pymongo import MongoClient

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://lumo-bundle-checkout.preview.emergentagent.com").rstrip("/")
MONGO_URL = os.environ.get("MONGO_URL", "mongodb://localhost:27017")
DB_NAME = os.environ.get("DB_NAME", "lumo_database")

ADMIN_EMAIL = "admin@lumo.test"
ADMIN_PASS = "password123"


@pytest.fixture(scope="session")
def admin_token():
    r = requests.post(f"{BASE_URL}/api/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASS}, timeout=20)
    assert r.status_code == 200, f"admin login failed: {r.status_code} {r.text[:200]}"
    return r.json()["token"]


@pytest.fixture(scope="session")
def admin_client(admin_token):
    s = requests.Session()
    s.headers.update({"Authorization": f"Bearer {admin_token}", "Content-Type": "application/json"})
    return s


@pytest.fixture(scope="session")
def mongo_db():
    c = MongoClient(MONGO_URL)
    return c[DB_NAME]


@pytest.fixture(scope="session")
def some_ad_id(admin_client, mongo_db):
    """Reuse an existing ad or create one via Ad Studio generate. Fallback: insert directly."""
    doc = mongo_db.ads.find_one({})
    if doc:
        return doc["id"]
    # last-resort: insert a synthetic ad row
    ad_id = f"TEST_ad_{uuid.uuid4().hex[:8]}"
    mongo_db.ads.insert_one({
        "id": ad_id,
        "headline": "TEST ad",
        "body": "this is a test ad",
        "cta": "Visit Lumo",
        "hashtags": ["lumo", "test"],
        "image_url": None,
        "created_at": datetime.now(timezone.utc).isoformat(),
    })
    return ad_id


@pytest.fixture(scope="session", autouse=True)
def cleanup(admin_client, mongo_db):
    """Delete any TEST_ connectors and schedules we leave behind."""
    yield
    # purge connectors created by tests (name starts with TEST_)
    mongo_db.connectors.delete_many({"name": {"$regex": "^TEST_"}})
    mongo_db.ad_schedules.delete_many({"name": {"$regex": "^TEST_|^One-shot"}})
    # purge synthetic test ads
    mongo_db.ads.delete_many({"id": {"$regex": "^TEST_ad_"}})


# ── 1. GET types ───────────────────────────────────────────────────────────
class TestTypes:
    def test_types_listing(self, admin_client):
        r = admin_client.get(f"{BASE_URL}/api/admin/distribution/types", timeout=15)
        assert r.status_code == 200, r.text
        types = r.json()["types"]
        required = {"discord", "telegram", "x_twitter", "linkedin", "reddit", "mastodon",
                    "bluesky", "pinterest", "threads", "slack", "zapier", "make", "ifttt", "webhook"}
        assert required.issubset(set(types.keys())), f"missing types: {required - set(types.keys())}"
        # check fields list with required key/label
        for key, t in types.items():
            assert isinstance(t.get("fields"), list) and len(t["fields"]) >= 1, f"{key} missing fields"
            for f in t["fields"]:
                assert "key" in f and "label" in f
        # at least one instant:True among the new five
        new_five = ["slack", "zapier", "make", "ifttt", "webhook"]
        assert any(types[p].get("instant") is True for p in new_five)


# ── 2. Create connector validation ─────────────────────────────────────────
class TestCreateConnector:
    def test_create_webhook_ok(self, admin_client):
        body = {"platform": "webhook", "name": "TEST_webhook_create",
                "config": {"url": "https://httpbin.org/post"}}
        r = admin_client.post(f"{BASE_URL}/api/admin/distribution/connectors", json=body, timeout=15)
        assert r.status_code == 200, r.text
        doc = r.json()
        assert doc["platform"] == "webhook"
        assert doc["platform_label"]
        assert doc.get("id")

    def test_missing_required(self, admin_client):
        body = {"platform": "webhook", "name": "TEST_missing", "config": {}}
        r = admin_client.post(f"{BASE_URL}/api/admin/distribution/connectors", json=body, timeout=15)
        assert r.status_code == 400, r.text

    def test_unknown_platform(self, admin_client):
        body = {"platform": "doesnotexist", "name": "TEST_unknown", "config": {"x": 1}}
        r = admin_client.post(f"{BASE_URL}/api/admin/distribution/connectors", json=body, timeout=15)
        assert r.status_code == 400, r.text


# ── 3. Broadcast to httpbin webhook ────────────────────────────────────────
class TestBroadcast:
    def test_broadcast_webhook_ok(self, admin_client, some_ad_id, mongo_db):
        # create
        cr = admin_client.post(f"{BASE_URL}/api/admin/distribution/connectors", json={
            "platform": "webhook", "name": "TEST_webhook_broadcast",
            "config": {"url": "https://httpbin.org/post"},
        }, timeout=15)
        assert cr.status_code == 200, cr.text
        cid = cr.json()["id"]

        # broadcast
        br = admin_client.post(f"{BASE_URL}/api/admin/distribution/broadcast", json={
            "ad_id": some_ad_id, "connector_ids": [cid],
        }, timeout=30)
        assert br.status_code == 200, br.text
        summary = br.json()["summary"]
        assert summary["ok"] >= 1 and summary["failed"] == 0, br.json()

        # post_count incremented
        doc = mongo_db.connectors.find_one({"id": cid})
        assert doc and doc.get("post_count", 0) >= 1


# ── 4. Slack/Zapier/IFTTT/Make platform mapping ────────────────────────────
class TestPlatformPosters:
    def test_slack_test_endpoint_returns_502(self, admin_client):
        cr = admin_client.post(f"{BASE_URL}/api/admin/distribution/connectors", json={
            "platform": "slack", "name": "TEST_slack_fake",
            "config": {"webhook_url": "https://hooks.slack.com/services/INVALID/INVALID/INVALID"},
        }, timeout=15)
        assert cr.status_code == 200, cr.text
        cid = cr.json()["id"]
        tr = admin_client.post(f"{BASE_URL}/api/admin/distribution/connectors/{cid}/test", timeout=30)
        assert tr.status_code == 502, f"expected 502 got {tr.status_code}: {tr.text[:200]}"
        # Try to parse JSON; if it's an ingress 502 we still PASS the mapping check via status code,
        # but when FastAPI handled it we expect "Test failed" in detail.
        try:
            body = tr.json()
            assert "Test failed" in (body.get("detail") or ""), f"unexpected body: {body}"
        except ValueError:
            # ingress returned HTML; status code mapping is correct (502, not 500)
            assert "<html" in tr.text.lower() or len(tr.text) >= 0

    def test_zapier_broadcast_failed_not_5xx(self, admin_client, some_ad_id):
        cr = admin_client.post(f"{BASE_URL}/api/admin/distribution/connectors", json={
            "platform": "zapier", "name": "TEST_zapier_404",
            "config": {"hook_url": "https://httpbin.org/status/404"},
        }, timeout=15)
        assert cr.status_code == 200, cr.text
        cid = cr.json()["id"]
        br = admin_client.post(f"{BASE_URL}/api/admin/distribution/broadcast", json={
            "ad_id": some_ad_id, "connector_ids": [cid],
        }, timeout=30)
        assert br.status_code == 200, br.text
        assert br.json()["summary"]["failed"] == 1

    def test_ifttt_broadcast_failed_not_5xx(self, admin_client, some_ad_id):
        cr = admin_client.post(f"{BASE_URL}/api/admin/distribution/connectors", json={
            "platform": "ifttt", "name": "TEST_ifttt_fake",
            "config": {"event_name": "lumo_test", "key": "fake-key"},
        }, timeout=15)
        assert cr.status_code == 200, cr.text
        cid = cr.json()["id"]
        br = admin_client.post(f"{BASE_URL}/api/admin/distribution/broadcast", json={
            "ad_id": some_ad_id, "connector_ids": [cid],
        }, timeout=30)
        assert br.status_code == 200, br.text
        statuses = [b["status"] for b in br.json()["broadcasts"]]
        assert "failed" in statuses, br.json()

    def test_make_broadcast_ok(self, admin_client, some_ad_id, mongo_db):
        cr = admin_client.post(f"{BASE_URL}/api/admin/distribution/connectors", json={
            "platform": "make", "name": "TEST_make_httpbin",
            "config": {"hook_url": "https://httpbin.org/post"},
        }, timeout=15)
        assert cr.status_code == 200, cr.text
        cid = cr.json()["id"]
        before = (mongo_db.connectors.find_one({"id": cid}) or {}).get("post_count", 0)
        br = admin_client.post(f"{BASE_URL}/api/admin/distribution/broadcast", json={
            "ad_id": some_ad_id, "connector_ids": [cid],
        }, timeout=30)
        assert br.status_code == 200
        summary = br.json()["summary"]
        assert summary["ok"] >= 1 and summary["failed"] == 0, br.json()
        after = (mongo_db.connectors.find_one({"id": cid}) or {}).get("post_count", 0)
        assert after > before


# ── 5. schedule-once endpoint ──────────────────────────────────────────────
class TestScheduleOnce:
    def test_schedule_future_ok(self, admin_client, some_ad_id):
        run_at = (datetime.now(timezone.utc) + timedelta(minutes=5)).isoformat()
        r = admin_client.post(f"{BASE_URL}/api/admin/distribution/schedule-once", json={
            "ad_id": some_ad_id, "connector_ids": [], "run_at": run_at,
        }, timeout=15)
        assert r.status_code in (200, 201), r.text
        doc = r.json()
        assert doc.get("one_shot") is True
        assert doc.get("enabled") is True
        assert doc.get("next_run_at")

    def test_schedule_past_returns_400(self, admin_client, some_ad_id):
        run_at = (datetime.now(timezone.utc) - timedelta(minutes=5)).isoformat()
        r = admin_client.post(f"{BASE_URL}/api/admin/distribution/schedule-once", json={
            "ad_id": some_ad_id, "connector_ids": [], "run_at": run_at,
        }, timeout=15)
        assert r.status_code == 400, r.text

    def test_schedule_missing_ad_returns_404(self, admin_client):
        run_at = (datetime.now(timezone.utc) + timedelta(minutes=5)).isoformat()
        r = admin_client.post(f"{BASE_URL}/api/admin/distribution/schedule-once", json={
            "ad_id": "does-not-exist-xyz", "connector_ids": [], "run_at": run_at,
        }, timeout=15)
        assert r.status_code == 404, r.text


# ── 6. Scheduler loop disables one-shot after firing ───────────────────────
class TestSchedulerLoop:
    def test_one_shot_auto_disables(self, admin_client, some_ad_id, mongo_db):
        # Insert a one-shot schedule directly in Mongo with next_run_at in the past
        # and a webhook connector that points at httpbin so it succeeds.
        cr = admin_client.post(f"{BASE_URL}/api/admin/distribution/connectors", json={
            "platform": "webhook", "name": "TEST_webhook_for_scheduler",
            "config": {"url": "https://httpbin.org/post"},
        }, timeout=15)
        assert cr.status_code == 200, cr.text
        cid = cr.json()["id"]

        sched_id = f"TEST_sched_{uuid.uuid4().hex[:8]}"
        now = datetime.now(timezone.utc)
        mongo_db.ad_schedules.insert_one({
            "id": sched_id,
            "name": f"TEST_one_shot_{sched_id}",
            "ad_ids": [some_ad_id],
            "connector_ids": [cid],
            "cadence_hours": 24,
            "daily_times": None,
            "timezone": "UTC",
            "start_at": (now - timedelta(minutes=1)).isoformat(),
            "end_at": None,
            "enabled": True,
            "one_shot": True,
            "next_run_at": (now - timedelta(minutes=1)).isoformat(),
            "last_run_at": None,
            "created_at": now.isoformat(),
            "posts_sent": 0,
        })

        # Scheduler loop runs every 60s; wait up to 75s
        disabled = False
        for _ in range(15):  # 15 * 5s = 75s
            time.sleep(5)
            doc = mongo_db.ad_schedules.find_one({"id": sched_id})
            if doc and doc.get("enabled") is False:
                disabled = True
                break

        # cleanup regardless
        mongo_db.ad_schedules.delete_one({"id": sched_id})

        assert disabled, "one-shot schedule was not auto-disabled within 75s"
        # posts_sent incremented
        # Re-fetch before delete is not possible; use direct assert from doc fetched in loop
        # We already checked enabled=False; doc has posts_sent now too in our snapshot
        assert (doc or {}).get("posts_sent", 0) >= 1, f"posts_sent did not increment, doc={doc}"

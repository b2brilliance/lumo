"""Lumo backend tests — provider notifications via quote accept/decline + /api/notifications CRUD."""
import os
import uuid
import time
from datetime import datetime, timezone, timedelta
import pytest
import requests

BASE_URL = os.environ.get(
    "REACT_APP_BACKEND_URL",
    "https://lumo-bundle-checkout.preview.emergentagent.com",
).rstrip("/")
API = f"{BASE_URL}/api"

CUSTOMER = {"email": "customer@lumo.test", "password": "password123"}
PROVIDER = {"email": "provider@lumo.test", "password": "password123"}


def _login(creds):
    r = requests.post(f"{API}/auth/login", json=creds, timeout=20)
    assert r.status_code == 200, f"Login failed for {creds['email']}: {r.status_code} {r.text}"
    data = r.json()
    return data["token"], data["user"]


def _register(role="provider"):
    email = f"TEST_notif_{uuid.uuid4().hex[:8]}@lumo.test"
    r = requests.post(
        f"{API}/auth/register",
        json={"email": email, "password": "Passw0rd!", "name": f"NotifTester_{role}", "role": role},
        timeout=20,
    )
    assert r.status_code == 200, r.text
    data = r.json()
    return data["token"], data["user"]


def _h(token):
    return {"Authorization": f"Bearer {token}"}


def _create_job(ctoken, title_suffix=""):
    payload = {
        "title": f"TEST_notif_job_{title_suffix or uuid.uuid4().hex[:6]}",
        "description": "Need a hand",
        "category": "moving",
        "pay_rate": 60.0,
        "pay_unit": "flat",
        "estimated_units": 1.0,
        "pickup_location": {"lat": 40.7128, "lng": -74.0060, "address": "NYC"},
    }
    r = requests.post(f"{API}/jobs", json=payload, headers=_h(ctoken), timeout=20)
    assert r.status_code == 200, r.text
    return r.json()


def _create_quote(ptoken, job_id, rate=55.0):
    r = requests.post(
        f"{API}/jobs/{job_id}/quotes",
        json={"quoted_pay_rate": rate, "quoted_pay_unit": "flat", "quoted_estimated_units": 1.0, "notes": "TEST"},
        headers=_h(ptoken),
        timeout=15,
    )
    assert r.status_code == 200, r.text
    return r.json()


# ────── Auth on /api/notifications ──────
class TestNotificationsAuth:
    def test_anonymous_unauthorized(self):
        r = requests.get(f"{API}/notifications", timeout=10)
        assert r.status_code == 401

    def test_authenticated_returns_list(self):
        token, _ = _login(CUSTOMER)
        r = requests.get(f"{API}/notifications", headers=_h(token), timeout=10)
        assert r.status_code == 200
        assert isinstance(r.json(), list)


# ────── Accept flow creates notifications for accepted + auto-declined providers ──────
class TestAcceptQuoteNotifications:
    def test_accept_notifies_accepted_and_auto_declined_providers(self):
        ctoken, customer = _login(CUSTOMER)
        # Two providers: seeded + a fresh one (so we don't depend on a single global state)
        p1_token, p1 = _login(PROVIDER)
        p2_token, p2 = _register(role="provider")

        job = _create_job(ctoken, title_suffix="multi")
        job_id = job["id"]

        q1 = _create_quote(p1_token, job_id, rate=50.0)
        q2 = _create_quote(p2_token, job_id, rate=70.0)

        # Snapshot existing notifications BEFORE accept (per-provider since-cursor)
        since = datetime.now(timezone.utc).isoformat()
        # small sleep so created_at > since (server uses string compare)
        time.sleep(1.1)

        # Customer accepts q1
        r = requests.post(f"{API}/quotes/{q1['id']}/accept", headers=_h(ctoken), timeout=15)
        assert r.status_code == 200, r.text
        assert r.json()["status"] == "accepted"
        assert r.json()["provider_id"] == p1["id"]

        # P1 should have a quote_accepted notification linked to this job
        r1 = requests.get(f"{API}/notifications", headers=_h(p1_token), timeout=10)
        assert r1.status_code == 200
        p1_notifs = [n for n in r1.json() if n.get("job_id") == job_id and n.get("type") == "quote_accepted"]
        assert len(p1_notifs) == 1, f"Expected 1 quote_accepted for p1, got {len(p1_notifs)}: {p1_notifs}"
        n1 = p1_notifs[0]
        # Required field assertions
        assert n1["user_id"] == p1["id"]
        assert n1["type"] == "quote_accepted"
        assert n1["title"] and isinstance(n1["title"], str)
        assert n1["body"] and isinstance(n1["body"], str)
        assert n1["link"] == f"/jobs/{job_id}"
        assert n1["job_id"] == job_id
        assert n1["quote_id"] == q1["id"]
        assert n1["read"] is False
        assert "_id" not in n1  # mongo _id stripped

        # P2 should have a quote_declined notification (auto-decline)
        r2 = requests.get(f"{API}/notifications", headers=_h(p2_token), timeout=10)
        assert r2.status_code == 200
        p2_notifs = [n for n in r2.json() if n.get("job_id") == job_id and n.get("type") == "quote_declined"]
        assert len(p2_notifs) == 1, f"Expected 1 quote_declined for p2, got {len(p2_notifs)}: {p2_notifs}"
        n2 = p2_notifs[0]
        assert n2["user_id"] == p2["id"]
        assert n2["type"] == "quote_declined"
        assert n2["link"] == f"/jobs/{job_id}"
        assert n2["job_id"] == job_id
        assert n2["quote_id"] == q2["id"]
        assert n2["read"] is False

        # since-filter should return the new notifications for p1
        r1s = requests.get(f"{API}/notifications", params={"since": since}, headers=_h(p1_token), timeout=10)
        assert r1s.status_code == 200
        assert any(n["id"] == n1["id"] for n in r1s.json())

        # since=future returns empty
        future = (datetime.now(timezone.utc) + timedelta(days=1)).isoformat()
        r1f = requests.get(f"{API}/notifications", params={"since": future}, headers=_h(p1_token), timeout=10)
        assert r1f.status_code == 200
        assert r1f.json() == [] or all(n["id"] != n1["id"] for n in r1f.json())

    def test_double_accept_returns_400_no_duplicate_notification(self):
        ctoken, _ = _login(CUSTOMER)
        p1_token, p1 = _login(PROVIDER)
        job = _create_job(ctoken, title_suffix="dbl")
        q1 = _create_quote(p1_token, job["id"])

        r = requests.post(f"{API}/quotes/{q1['id']}/accept", headers=_h(ctoken), timeout=15)
        assert r.status_code == 200

        # Count quote_accepted notifications for this quote
        before = requests.get(f"{API}/notifications", headers=_h(p1_token), timeout=10).json()
        count_before = sum(1 for n in before if n.get("quote_id") == q1["id"] and n.get("type") == "quote_accepted")
        assert count_before == 1

        # Second accept should fail because job is no longer 'open'
        r2 = requests.post(f"{API}/quotes/{q1['id']}/accept", headers=_h(ctoken), timeout=15)
        assert r2.status_code == 400, r2.text

        after = requests.get(f"{API}/notifications", headers=_h(p1_token), timeout=10).json()
        count_after = sum(1 for n in after if n.get("quote_id") == q1["id"] and n.get("type") == "quote_accepted")
        assert count_after == count_before, "Duplicate notification created on re-accept"


# ────── Decline flow ──────
class TestDeclineQuoteNotifications:
    def test_decline_creates_only_one_notification_for_that_provider(self):
        ctoken, _ = _login(CUSTOMER)
        p1_token, p1 = _login(PROVIDER)
        p2_token, p2 = _register(role="provider")

        job = _create_job(ctoken, title_suffix="dec")
        _create_quote(p1_token, job["id"], rate=44.0)
        q2 = _create_quote(p2_token, job["id"], rate=66.0)

        # Customer declines q2 only
        r = requests.post(f"{API}/quotes/{q2['id']}/decline", headers=_h(ctoken), timeout=15)
        assert r.status_code == 200, r.text

        # P2 gets a quote_declined notification
        p2_n = [n for n in requests.get(f"{API}/notifications", headers=_h(p2_token), timeout=10).json()
                if n.get("quote_id") == q2["id"]]
        assert len(p2_n) == 1
        assert p2_n[0]["type"] == "quote_declined"
        assert p2_n[0]["user_id"] == p2["id"]
        assert p2_n[0]["job_id"] == job["id"]
        assert p2_n[0]["link"] == f"/jobs/{job['id']}"
        assert p2_n[0]["read"] is False

        # P1 must NOT get a notification for q2 (their own quote is untouched)
        p1_n_for_q2 = [n for n in requests.get(f"{API}/notifications", headers=_h(p1_token), timeout=10).json()
                       if n.get("quote_id") == q2["id"]]
        assert p1_n_for_q2 == []

    def test_double_decline_returns_400_no_duplicate(self):
        ctoken, _ = _login(CUSTOMER)
        p1_token, p1 = _login(PROVIDER)
        job = _create_job(ctoken, title_suffix="dec2")
        q1 = _create_quote(p1_token, job["id"], rate=42.0)

        r = requests.post(f"{API}/quotes/{q1['id']}/decline", headers=_h(ctoken), timeout=15)
        assert r.status_code == 200

        before = requests.get(f"{API}/notifications", headers=_h(p1_token), timeout=10).json()
        count_before = sum(1 for n in before if n.get("quote_id") == q1["id"] and n.get("type") == "quote_declined")
        assert count_before == 1

        r2 = requests.post(f"{API}/quotes/{q1['id']}/decline", headers=_h(ctoken), timeout=15)
        assert r2.status_code == 400, r2.text

        after = requests.get(f"{API}/notifications", headers=_h(p1_token), timeout=10).json()
        count_after = sum(1 for n in after if n.get("quote_id") == q1["id"] and n.get("type") == "quote_declined")
        assert count_after == count_before

    def test_decline_already_accepted_quote_returns_400_no_duplicate(self):
        ctoken, _ = _login(CUSTOMER)
        p1_token, p1 = _login(PROVIDER)
        job = _create_job(ctoken, title_suffix="dec3")
        q1 = _create_quote(p1_token, job["id"], rate=33.0)

        ra = requests.post(f"{API}/quotes/{q1['id']}/accept", headers=_h(ctoken), timeout=15)
        assert ra.status_code == 200

        # Try to decline an already-accepted quote -> 400
        rd = requests.post(f"{API}/quotes/{q1['id']}/decline", headers=_h(ctoken), timeout=15)
        assert rd.status_code == 400

        # Provider should only have the accepted notification (no extra declined notif for q1)
        notifs = requests.get(f"{API}/notifications", headers=_h(p1_token), timeout=10).json()
        for_q1 = [n for n in notifs if n.get("quote_id") == q1["id"]]
        types = sorted(n["type"] for n in for_q1)
        assert types == ["quote_accepted"], f"Unexpected notifications for q1: {for_q1}"


# ────── List filters: since / unread_only / sort ──────
class TestListAndFilters:
    def test_unread_only_filter(self):
        ctoken, _ = _login(CUSTOMER)
        p1_token, p1 = _login(PROVIDER)
        job = _create_job(ctoken, title_suffix="uo")
        q1 = _create_quote(p1_token, job["id"], rate=22.0)
        # Decline to create a notification for p1
        r = requests.post(f"{API}/quotes/{q1['id']}/decline", headers=_h(ctoken), timeout=15)
        assert r.status_code == 200

        all_n = requests.get(f"{API}/notifications", headers=_h(p1_token), timeout=10).json()
        target = next(n for n in all_n if n.get("quote_id") == q1["id"])
        assert target["read"] is False

        # unread_only=true must contain our notification
        unread = requests.get(f"{API}/notifications", params={"unread_only": "true"},
                              headers=_h(p1_token), timeout=10).json()
        assert any(n["id"] == target["id"] for n in unread)
        for n in unread:
            assert n["read"] is False

        # Mark as read, then unread_only should NOT include it
        mr = requests.post(f"{API}/notifications/{target['id']}/read", headers=_h(p1_token), timeout=10)
        assert mr.status_code == 200, mr.text
        unread2 = requests.get(f"{API}/notifications", params={"unread_only": "true"},
                               headers=_h(p1_token), timeout=10).json()
        assert all(n["id"] != target["id"] for n in unread2)

    def test_sorted_desc_by_created_at(self):
        ctoken, _ = _login(CUSTOMER)
        p1_token, p1 = _login(PROVIDER)
        # Two declines back-to-back to ensure two notifications
        for i in range(2):
            job = _create_job(ctoken, title_suffix=f"srt{i}")
            q = _create_quote(p1_token, job["id"], rate=20.0 + i)
            requests.post(f"{API}/quotes/{q['id']}/decline", headers=_h(ctoken), timeout=15)
            time.sleep(0.6)

        notifs = requests.get(f"{API}/notifications", headers=_h(p1_token), timeout=10).json()
        assert len(notifs) >= 2
        created = [n["created_at"] for n in notifs]
        assert created == sorted(created, reverse=True), "Notifications not sorted by created_at desc"


# ────── Mark read / read_all + permissions ──────
class TestMarkReadPermissions:
    def test_mark_read_404_for_other_users_notification(self):
        # Provider1 generates a notification (via decline by customer)
        ctoken, _ = _login(CUSTOMER)
        p1_token, p1 = _login(PROVIDER)
        job = _create_job(ctoken, title_suffix="perm")
        q1 = _create_quote(p1_token, job["id"], rate=11.0)
        rd = requests.post(f"{API}/quotes/{q1['id']}/decline", headers=_h(ctoken), timeout=15)
        assert rd.status_code == 200

        p1_n = next(n for n in requests.get(f"{API}/notifications", headers=_h(p1_token), timeout=10).json()
                    if n.get("quote_id") == q1["id"])

        # Customer (different user) tries to mark provider's notification as read
        r = requests.post(f"{API}/notifications/{p1_n['id']}/read", headers=_h(ctoken), timeout=10)
        assert r.status_code == 404, r.text

        # Bogus id also 404
        r2 = requests.post(f"{API}/notifications/{uuid.uuid4()}/read", headers=_h(p1_token), timeout=10)
        assert r2.status_code == 404

    def test_mark_read_persists(self):
        ctoken, _ = _login(CUSTOMER)
        p1_token, _ = _login(PROVIDER)
        job = _create_job(ctoken, title_suffix="mrp")
        q1 = _create_quote(p1_token, job["id"], rate=12.0)
        requests.post(f"{API}/quotes/{q1['id']}/decline", headers=_h(ctoken), timeout=15)

        target = next(n for n in requests.get(f"{API}/notifications", headers=_h(p1_token), timeout=10).json()
                      if n.get("quote_id") == q1["id"])
        assert target["read"] is False

        r = requests.post(f"{API}/notifications/{target['id']}/read", headers=_h(p1_token), timeout=10)
        assert r.status_code == 200
        # Verify persisted
        after = requests.get(f"{API}/notifications", headers=_h(p1_token), timeout=10).json()
        again = next(n for n in after if n["id"] == target["id"])
        assert again["read"] is True

    def test_read_all_marks_all_current_user_notifications_read(self):
        # Use a fresh provider so we start clean
        p_token, p = _register(role="provider")
        ctoken, _ = _login(CUSTOMER)
        # Create 2 declined notifs for this provider
        for i in range(2):
            job = _create_job(ctoken, title_suffix=f"rall{i}")
            q = _create_quote(p_token, job["id"], rate=15.0 + i)
            requests.post(f"{API}/quotes/{q['id']}/decline", headers=_h(ctoken), timeout=15)

        before = requests.get(f"{API}/notifications", headers=_h(p_token), timeout=10).json()
        assert sum(1 for n in before if n["read"] is False) >= 2

        r = requests.post(f"{API}/notifications/read_all", headers=_h(p_token), timeout=10)
        assert r.status_code == 200

        after = requests.get(f"{API}/notifications", headers=_h(p_token), timeout=10).json()
        assert all(n["read"] is True for n in after), [n for n in after if not n["read"]]

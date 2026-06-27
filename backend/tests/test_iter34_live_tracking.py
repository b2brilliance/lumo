"""Iteration 34 — Live tracking (Uber-style) backend tests.

Covers:
- POST /api/jobs/{id}/accept now sets tracking_status='accepted' and inserts provider_accepted notification.
- POST /api/jobs/{id}/location — provider-only, validation rules
- POST /api/jobs/{id}/status — provider-only, status transitions, notifications
- GET  /api/jobs/{id}/tracking — RBAC + payload shape + ETA computation
- POST /api/quotes/{id}/accept — sets tracking_status + customer notification
- POST /api/provider/dismiss-job/{id} — persistence on users.dismissed_jobs
"""

import math
import os
import time
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://lumo-bundle-checkout.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"

CUSTOMER = {"email": "customer@lumo.test", "password": "password123"}
PROVIDER = {"email": "provider@lumo.test", "password": "password123"}


# ──────────────────────────────── Fixtures ────────────────────────────────
def _login(creds):
    r = requests.post(f"{API}/auth/login", json=creds, timeout=30)
    assert r.status_code == 200, f"login failed for {creds['email']}: {r.status_code} {r.text}"
    return r.json()["token"]


@pytest.fixture(scope="session")
def customer_token():
    return _login(CUSTOMER)


@pytest.fixture(scope="session")
def provider_token():
    return _login(PROVIDER)


@pytest.fixture(scope="session")
def customer_id(customer_token):
    r = requests.get(f"{API}/auth/me", headers={"Authorization": f"Bearer {customer_token}"}, timeout=30)
    assert r.status_code == 200
    return r.json()["id"]


@pytest.fixture(scope="session")
def provider_id(provider_token):
    r = requests.get(f"{API}/auth/me", headers={"Authorization": f"Bearer {provider_token}"}, timeout=30)
    assert r.status_code == 200
    return r.json()["id"]


def _make_job(customer_token):
    """Create a fresh on_demand delivery job with dropoff lat/lng so haversine
    has something to chew on. Returns the job dict."""
    body = {
        "title": "TEST_iter34 live tracking package delivery",
        "description": "Pickup an envelope and drop off across town",
        "category": "delivery",
        "subcategory": "package",
        "job_type": "on_demand",
        "pay_rate": 25.0,
        "pay_unit": "flat",
        "estimated_units": 1,
        "pickup_location": {"address": "100 Pickup St", "lat": 37.7749, "lng": -122.4194},
        "dropoff_location": {"address": "200 Dropoff St", "lat": 37.7849, "lng": -122.4094},
    }
    r = requests.post(
        f"{API}/jobs",
        headers={"Authorization": f"Bearer {customer_token}"},
        json=body,
        timeout=30,
    )
    assert r.status_code in (200, 201), f"create job failed: {r.status_code} {r.text}"
    return r.json()


# ──────────────────────────── Helper: haversine ────────────────────────────
def _haversine_miles(a, b):
    R = 3958.7613
    lat1, lng1, lat2, lng2 = map(math.radians, [a["lat"], a["lng"], b["lat"], b["lng"]])
    dlat = lat2 - lat1
    dlng = lng2 - lng1
    h = math.sin(dlat / 2) ** 2 + math.cos(lat1) * math.cos(lat2) * math.sin(dlng / 2) ** 2
    return 2 * R * math.asin(math.sqrt(h))


# ───────────────────────────── Test class ─────────────────────────────────
class TestLiveTracking:
    def test_accept_sets_tracking_status_and_notification(self, customer_token, provider_token, customer_id):
        job = _make_job(customer_token)
        jid = job["id"]
        # Provider accepts
        r = requests.post(
            f"{API}/jobs/{jid}/accept",
            headers={"Authorization": f"Bearer {provider_token}"},
            timeout=30,
        )
        assert r.status_code == 200, f"accept failed: {r.status_code} {r.text}"
        job_after = r.json()
        assert job_after.get("tracking_status") == "accepted"
        assert job_after.get("status") == "accepted"
        assert job_after.get("provider_id")

        # Customer notification "provider_accepted" should exist with link
        time.sleep(0.4)
        r2 = requests.get(
            f"{API}/notifications",
            headers={"Authorization": f"Bearer {customer_token}"},
            timeout=30,
        )
        assert r2.status_code == 200
        notes = r2.json() if isinstance(r2.json(), list) else r2.json().get("items", [])
        match = [n for n in notes if n.get("type") == "provider_accepted" and n.get("job_id") == jid]
        assert match, f"no provider_accepted notification found for job {jid}; got types={set(n.get('type') for n in notes)}"
        assert match[0].get("link") == f"/jobs/{jid}/track"

    def test_location_endpoint_provider_only_and_persists(self, customer_token, provider_token):
        job = _make_job(customer_token)
        jid = job["id"]
        # provider accepts
        requests.post(f"{API}/jobs/{jid}/accept", headers={"Authorization": f"Bearer {provider_token}"}, timeout=30).raise_for_status()

        # Customer should NOT be able to send location
        r_cust = requests.post(
            f"{API}/jobs/{jid}/location",
            headers={"Authorization": f"Bearer {customer_token}"},
            json={"lat": 37.78, "lng": -122.41},
            timeout=30,
        )
        # Customer role does not satisfy require_role("provider") so 403 from auth layer
        assert r_cust.status_code in (401, 403), f"customer should be forbidden, got {r_cust.status_code}"

        # Provider sends a valid ping
        r_prov = requests.post(
            f"{API}/jobs/{jid}/location",
            headers={"Authorization": f"Bearer {provider_token}"},
            json={"lat": 37.7800, "lng": -122.4150, "heading": 90.0, "speed": 5.0},
            timeout=30,
        )
        assert r_prov.status_code == 200, f"provider ping failed: {r_prov.status_code} {r_prov.text}"
        data = r_prov.json()
        assert data["ok"] is True
        loc = data["provider_live_location"]
        assert loc["lat"] == 37.78 and loc["lng"] == -122.415
        assert loc.get("heading") == 90.0 and loc.get("speed") == 5.0
        assert "updated_at" in loc

    def test_status_endpoint_validation_and_transitions(self, customer_token, provider_token):
        job = _make_job(customer_token)
        jid = job["id"]
        requests.post(f"{API}/jobs/{jid}/accept", headers={"Authorization": f"Bearer {provider_token}"}, timeout=30).raise_for_status()

        # Invalid status → 400
        r_bad = requests.post(
            f"{API}/jobs/{jid}/status",
            headers={"Authorization": f"Bearer {provider_token}"},
            json={"status": "teleporting"},
            timeout=30,
        )
        assert r_bad.status_code == 400

        # Customer (not the assigned provider role) → 401/403
        r_cust = requests.post(
            f"{API}/jobs/{jid}/status",
            headers={"Authorization": f"Bearer {customer_token}"},
            json={"status": "on_the_way"},
            timeout=30,
        )
        assert r_cust.status_code in (401, 403)

        # Provider on_the_way → success, notification created for customer
        r1 = requests.post(
            f"{API}/jobs/{jid}/status",
            headers={"Authorization": f"Bearer {provider_token}"},
            json={"status": "on_the_way"},
            timeout=30,
        )
        assert r1.status_code == 200, r1.text
        assert r1.json().get("tracking_status") == "on_the_way"

        # Provider in_progress → job status flips
        r2 = requests.post(
            f"{API}/jobs/{jid}/status",
            headers={"Authorization": f"Bearer {provider_token}"},
            json={"status": "in_progress"},
            timeout=30,
        )
        assert r2.status_code == 200
        assert r2.json().get("status") == "in_progress"

        # Provider completed → job status flips + completed_at
        r3 = requests.post(
            f"{API}/jobs/{jid}/status",
            headers={"Authorization": f"Bearer {provider_token}"},
            json={"status": "completed"},
            timeout=30,
        )
        assert r3.status_code == 200
        body = r3.json()
        assert body.get("status") == "completed"
        assert body.get("completed_at")

        # Customer notifications should include tracking_on_the_way and tracking_completed
        time.sleep(0.4)
        r_notes = requests.get(f"{API}/notifications", headers={"Authorization": f"Bearer {customer_token}"}, timeout=30)
        notes = r_notes.json() if isinstance(r_notes.json(), list) else r_notes.json().get("items", [])
        kinds = [n.get("type") for n in notes if n.get("job_id") == jid]
        assert "tracking_on_the_way" in kinds, f"missing tracking_on_the_way; got {kinds}"
        assert "tracking_completed" in kinds, f"missing tracking_completed; got {kinds}"

        # Once completed, location update should be rejected with 400
        r4 = requests.post(
            f"{API}/jobs/{jid}/location",
            headers={"Authorization": f"Bearer {provider_token}"},
            json={"lat": 37.78, "lng": -122.41},
            timeout=30,
        )
        assert r4.status_code == 400, f"expected 400 on completed job location, got {r4.status_code}"

    def test_get_tracking_payload_and_eta(self, customer_token, provider_token):
        job = _make_job(customer_token)
        jid = job["id"]
        requests.post(f"{API}/jobs/{jid}/accept", headers={"Authorization": f"Bearer {provider_token}"}, timeout=30).raise_for_status()
        # Provider pings location near pickup
        prov_loc = {"lat": 37.7749, "lng": -122.4194}
        requests.post(
            f"{API}/jobs/{jid}/location",
            headers={"Authorization": f"Bearer {provider_token}"},
            json=prov_loc,
            timeout=30,
        ).raise_for_status()

        # Customer can GET tracking
        r = requests.get(
            f"{API}/jobs/{jid}/tracking",
            headers={"Authorization": f"Bearer {customer_token}"},
            timeout=30,
        )
        assert r.status_code == 200, r.text
        t = r.json()
        for k in ("tracking_status", "tracking_timestamps", "provider_live_location",
                  "destination", "pickup_location", "dropoff_location", "eta_minutes",
                  "job_status", "job_title"):
            assert k in t, f"missing key {k}"
        # destination = dropoff_location for this job
        assert t["destination"]["lat"] == 37.7849
        # ETA: haversine(prov, dropoff) / 25 * 60
        dest = {"lat": 37.7849, "lng": -122.4094}
        expected = round((_haversine_miles(prov_loc, dest) / 25.0) * 60.0, 1)
        assert abs(t["eta_minutes"] - expected) < 0.2, f"ETA mismatch: got {t['eta_minutes']} expected ~{expected}"

        # Provider can also GET
        r2 = requests.get(
            f"{API}/jobs/{jid}/tracking",
            headers={"Authorization": f"Bearer {provider_token}"},
            timeout=30,
        )
        assert r2.status_code == 200

        # Third party (e.g. a different account) — we'll fabricate by login admin
        admin_tok = _login({"email": "admin@lumo.test", "password": "password123"})
        r3 = requests.get(
            f"{API}/jobs/{jid}/tracking",
            headers={"Authorization": f"Bearer {admin_tok}"},
            timeout=30,
        )
        assert r3.status_code == 403, f"non-party should get 403, got {r3.status_code}"

    def test_quote_accept_sets_tracking_status_and_notification(self, customer_token, provider_token, customer_id):
        # Create job
        job = _make_job(customer_token)
        jid = job["id"]
        # Provider submits a quote
        r = requests.post(
            f"{API}/jobs/{jid}/quotes",
            headers={"Authorization": f"Bearer {provider_token}"},
            json={"quoted_pay_rate": 40.0, "quoted_pay_unit": "flat", "quoted_estimated_units": 1.0, "notes": "test"},
            timeout=30,
        )
        # accept_quote requires provider to have credentials for the category — quote may still be created
        if r.status_code not in (200, 201):
            pytest.skip(f"quote create returned {r.status_code} ({r.text}) — skipping quote-accept flow")
        quote_id = r.json()["id"]
        # Customer accepts quote
        r2 = requests.post(
            f"{API}/quotes/{quote_id}/accept",
            headers={"Authorization": f"Bearer {customer_token}"},
            timeout=30,
        )
        assert r2.status_code == 200, r2.text

        # Job should now have tracking_status='accepted'
        r3 = requests.get(f"{API}/jobs/{jid}", headers={"Authorization": f"Bearer {customer_token}"}, timeout=30)
        assert r3.status_code == 200
        assert r3.json().get("tracking_status") == "accepted"

        # Customer notification provider_accepted with link
        time.sleep(0.4)
        rn = requests.get(f"{API}/notifications", headers={"Authorization": f"Bearer {customer_token}"}, timeout=30)
        notes = rn.json() if isinstance(rn.json(), list) else rn.json().get("items", [])
        m = [n for n in notes if n.get("type") == "provider_accepted" and n.get("job_id") == jid]
        assert m, "no provider_accepted notification after quote acceptance"
        assert m[0]["link"] == f"/jobs/{jid}/track"


class TestProviderDismissJob:
    """Pending fix verification — dismiss-job persistence."""

    def test_dismiss_and_persist(self, customer_token, provider_token):
        job = _make_job(customer_token)
        jid = job["id"]

        r = requests.post(
            f"{API}/provider/dismiss-job/{jid}",
            headers={"Authorization": f"Bearer {provider_token}"},
            timeout=30,
        )
        assert r.status_code == 200, r.text
        assert r.json().get("ok") is True

        # Verify dismissed_jobs persisted on user
        me = requests.get(f"{API}/auth/me", headers={"Authorization": f"Bearer {provider_token}"}, timeout=30).json()
        assert jid in (me.get("dismissed_jobs") or []), "job id not in user.dismissed_jobs"

        # Undismiss for cleanup
        requests.post(
            f"{API}/provider/undismiss-job/{jid}",
            headers={"Authorization": f"Bearer {provider_token}"},
            timeout=30,
        )

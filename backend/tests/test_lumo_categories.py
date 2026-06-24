"""
Tests for the two new service categories: ride_share and towing.

Verifies:
  - POST /api/jobs with category='ride_share' returns 200 and
    category_group='physical_delivery'.
  - POST /api/jobs with category='towing' returns 200 and
    category_group='physical_delivery'.
  - Both jobs appear in /api/jobs feed.
  - Decline bug-fix sanity (non-owner 403 + missing booking 404).
"""
import os
import uuid
import requests
import pytest
from pathlib import Path

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
if not BASE_URL:
    env_file = Path("/app/frontend/.env")
    if env_file.exists():
        for line in env_file.read_text().splitlines():
            if line.startswith("REACT_APP_BACKEND_URL="):
                BASE_URL = line.split("=", 1)[1].strip().rstrip("/")
                break

API = f"{BASE_URL}/api"


def _login(email, password="password123"):
    r = requests.post(f"{API}/auth/login", json={"email": email, "password": password}, timeout=15)
    assert r.status_code == 200, f"Login failed for {email}: {r.status_code} {r.text}"
    body = r.json()
    return body.get("access_token") or body.get("token")


def _h(token):
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture(scope="module")
def customer_token():
    return _login("customer@lumo.test")


@pytest.fixture(scope="module")
def provider_token():
    return _login("provider@lumo.test")


# ── ride_share + towing job category tests ─────────────────────────────────
class TestNewJobCategories:
    """category=ride_share and category=towing must work end-to-end."""

    def _post_job(self, token, category, title):
        body = {
            "title": title,
            "description": f"TEST_{category} job",
            "category": category,
            "pay_rate": 25.0,
            "pay_unit": "flat",
            "estimated_units": 1.0,
            "details": {"subcategory": "standard"},
        }
        return requests.post(f"{API}/jobs", json=body, headers=_h(token), timeout=15)

    def test_create_ride_share_job(self, customer_token):
        r = self._post_job(customer_token, "ride_share", f"TEST_ride_{uuid.uuid4().hex[:8]}")
        assert r.status_code == 200, r.text
        j = r.json()
        assert j["category"] == "ride_share"
        assert j["category_group"] == "physical_delivery", j
        assert j["status"] == "open"
        # Persistence check
        g = requests.get(f"{API}/jobs/{j['id']}", timeout=15)
        assert g.status_code == 200
        assert g.json()["category"] == "ride_share"

    def test_create_towing_job(self, customer_token):
        r = self._post_job(customer_token, "towing", f"TEST_tow_{uuid.uuid4().hex[:8]}")
        assert r.status_code == 200, r.text
        j = r.json()
        assert j["category"] == "towing"
        assert j["category_group"] == "physical_delivery", j
        assert j["status"] == "open"
        # Persistence check
        g = requests.get(f"{API}/jobs/{j['id']}", timeout=15)
        assert g.status_code == 200
        assert g.json()["category"] == "towing"

    def test_categories_in_feed(self, customer_token):
        # Create one of each so we know they're queryable
        ride = self._post_job(customer_token, "ride_share", f"TEST_feed_ride_{uuid.uuid4().hex[:8]}")
        tow = self._post_job(customer_token, "towing", f"TEST_feed_tow_{uuid.uuid4().hex[:8]}")
        assert ride.status_code == 200 and tow.status_code == 200

        feed = requests.get(f"{API}/jobs", timeout=15)
        assert feed.status_code == 200
        ids = {j["id"] for j in feed.json()}
        assert ride.json()["id"] in ids, "ride_share job missing from /jobs feed"
        assert tow.json()["id"] in ids, "towing job missing from /jobs feed"

    def test_filter_by_physical_delivery_group(self, customer_token):
        # Filter feed by category_group=physical_delivery — should include ride/tow
        r = requests.get(
            f"{API}/jobs",
            params={"category_group_filter": "physical_delivery"},
            timeout=15,
        )
        assert r.status_code == 200
        cats = {j["category"] for j in r.json()}
        # At least one ride_share + one towing should be in the feed
        assert "ride_share" in cats or "towing" in cats, (
            f"physical_delivery feed missing new categories. got cats={cats}"
        )


# ── decline-bug-fix extra coverage (non-owner 403 + missing 404) ────────────
class TestDeclineGuards:
    def test_decline_missing_booking_404(self, customer_token):
        fake_id = f"nope-{uuid.uuid4().hex}"
        r = requests.post(
            f"{API}/rental-bookings/{fake_id}/decline",
            headers=_h(customer_token), timeout=15,
        )
        assert r.status_code == 404, r.text

    def test_decline_non_owner_forbidden(self, customer_token, provider_token):
        # 1) Create a request-mode rental as customer (owner)
        rental_body = {
            "title": f"TEST_cat_rental_{uuid.uuid4().hex[:8]}",
            "description": "Test rental for decline-guard non-owner check",
            "category": "tools_equipment",
            "pricing": {"daily": 30},
            "booking_mode": "request",
            "location": {"city": "Test City", "country": "US"},
        }
        cr = requests.post(f"{API}/rentals", json=rental_body, headers=_h(customer_token), timeout=15)
        assert cr.status_code == 200, cr.text
        rental_id = cr.json()["id"]

        # 2) Provider (renter) books it
        from datetime import datetime, timedelta
        sd = (datetime.utcnow() + timedelta(days=30)).date().isoformat()
        ed = (datetime.utcnow() + timedelta(days=32)).date().isoformat()
        book_body = {
            "rental_id": rental_id,
            "start_date": sd, "end_date": ed, "pricing_unit": "daily",
            "country": "US", "us_state": "CA", "origin_url": "https://example.com",
        }
        br = requests.post(
            f"{API}/rentals/{rental_id}/book",
            json=book_body, headers=_h(provider_token), timeout=15,
        )
        assert br.status_code == 200, br.text
        bid = br.json()["booking_id"]

        # 3) Provider (NOT owner) tries to decline → 403
        r = requests.post(
            f"{API}/rental-bookings/{bid}/decline",
            headers=_h(provider_token), timeout=15,
        )
        assert r.status_code == 403, f"non-owner decline should be 403, got {r.status_code}: {r.text}"

        # 4) Owner (customer) declines → 200 {declined: true}
        r2 = requests.post(
            f"{API}/rental-bookings/{bid}/decline",
            headers=_h(customer_token), timeout=15,
        )
        assert r2.status_code == 200, r2.text
        assert r2.json().get("declined") is True

        # 5) Owner declines again → should now 403 (status != pending_approval)
        r3 = requests.post(
            f"{API}/rental-bookings/{bid}/decline",
            headers=_h(customer_token), timeout=15,
        )
        assert r3.status_code in (400, 403), f"second decline should reject, got {r3.status_code}: {r3.text}"
        assert "not awaiting approval" in r3.text.lower(), (
            f"expected 'not awaiting approval' guard message, got: {r3.text}"
        )

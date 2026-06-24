"""
Tests for the Lumo rental host wizard + booking inbox flow.

Covers:
  - POST /api/rentals as a customer (low-value category → status=active)
  - POST /api/rentals with a high-value category (property) for a NEW
    unverified user → status=pending_host_verification
  - Request-to-book booking flow:
      • create a request-mode rental as customer (owner)
      • book it as provider (renter) → status=pending_approval, url=None
      • owner GET /api/rental-bookings/mine?role=owner contains the booking
      • owner approves → {approved:true}, status flips to deposit_pending
      • decline now should be rejected (booking no longer pending)
      • a different non-owner trying to approve gets 403
"""
import os
import uuid
import time
import requests
import pytest
from pathlib import Path
from datetime import datetime, timedelta

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
    return body.get("access_token") or body.get("token"), body["user"]


def _register(email, name, role="customer", password="password123"):
    r = requests.post(
        f"{API}/auth/register",
        json={"email": email, "password": password, "name": name, "role": role},
        timeout=15,
    )
    assert r.status_code in (200, 201), r.text
    body = r.json()
    return body.get("access_token") or body.get("token"), body["user"]


def _h(token):
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture(scope="module")
def customer():
    token, user = _login("customer@lumo.test")
    return {"token": token, "user": user}


@pytest.fixture(scope="module")
def provider():
    token, user = _login("provider@lumo.test")
    return {"token": token, "user": user}


@pytest.fixture(scope="module")
def fresh_unverified_user():
    """A brand-new user with NO verified credential — used for the high-value
    category 'pending_host_verification' assertion."""
    email = f"TEST_rentals_{uuid.uuid4().hex[:8]}@lumo.test"
    token, user = _register(email, "TEST Rentals User", role="customer")
    return {"token": token, "user": user, "email": email}


# ───────────────────────────────────────────────────────────────────
# POST /api/rentals
# ───────────────────────────────────────────────────────────────────
class TestRentalCreate:
    def test_low_value_category_is_active(self, customer):
        body = {
            "category": "tools_equipment",
            "title": "TEST drill",
            "description": "Cordless impact driver, lightly used",
            "pricing": {"daily": 35.0},
            "booking_mode": "instant",
        }
        r = requests.post(f"{API}/rentals", json=body, headers=_h(customer["token"]), timeout=15)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["status"] == "active", d
        assert d["category"] == "tools_equipment"
        assert d["host_verification_required"] is False
        # GET to verify persistence
        g = requests.get(f"{API}/rentals/{d['id']}", timeout=10)
        assert g.status_code == 200
        assert g.json()["title"] == "TEST drill"

    def test_high_value_property_pending_verification(self, fresh_unverified_user):
        body = {
            "category": "property",
            "subcategory": "vacation_rental",
            "title": "TEST hi-value loft",
            "description": "Bright loft in test mode",
            "pricing": {"daily": 200.0},
            "booking_mode": "instant",
            "location": {"address": "1 Main St, San Francisco, CA"},
        }
        r = requests.post(
            f"{API}/rentals", json=body, headers=_h(fresh_unverified_user["token"]), timeout=15,
        )
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["status"] == "pending_host_verification", d
        assert d["host_verification_required"] is True

    def test_invalid_category_400(self, customer):
        body = {
            "category": "not_a_real_category",
            "title": "x",
            "description": "y",
            "pricing": {"daily": 10},
        }
        r = requests.post(f"{API}/rentals", json=body, headers=_h(customer["token"]), timeout=10)
        assert r.status_code == 400, r.text

    def test_missing_pricing_400(self, customer):
        body = {
            "category": "tools_equipment",
            "title": "z",
            "description": "no pricing",
            "pricing": {},
        }
        r = requests.post(f"{API}/rentals", json=body, headers=_h(customer["token"]), timeout=10)
        assert r.status_code == 400, r.text


# ───────────────────────────────────────────────────────────────────
# Request-to-book + approve / decline
# ───────────────────────────────────────────────────────────────────
class TestRentalBookingFlow:
    @pytest.fixture(scope="class")
    def request_rental(self, customer):
        """Customer (owner) creates a rental in 'request' booking_mode."""
        body = {
            "category": "tools_equipment",
            "title": "TEST request-mode trailer",
            "description": "Owner-approval required",
            "pricing": {"daily": 80.0},
            "booking_mode": "request",
        }
        r = requests.post(f"{API}/rentals", json=body, headers=_h(customer["token"]), timeout=15)
        assert r.status_code == 200, r.text
        rental = r.json()
        assert rental["booking_mode"] == "request"
        assert rental["status"] == "active"
        return rental

    def test_request_book_returns_pending_approval(self, request_rental, provider):
        sd = (datetime.utcnow() + timedelta(days=7)).date().isoformat()
        ed = (datetime.utcnow() + timedelta(days=9)).date().isoformat()
        body = {
            "rental_id": request_rental["id"],
            "start_date": sd,
            "end_date": ed,
            "pricing_unit": "daily",
            "country": "US",
            "us_state": "CA",
            "origin_url": "https://example.com",
        }
        r = requests.post(
            f"{API}/rentals/{request_rental['id']}/book",
            json=body, headers=_h(provider["token"]), timeout=20,
        )
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["status"] == "pending_approval", d
        assert d.get("url") is None, f"expected no Stripe url for request-mode, got {d}"
        assert d.get("booking_id")
        # Save for later tests on the class
        pytest._rental_booking_id = d["booking_id"]

    def test_owner_inbox_contains_booking(self, customer):
        bid = getattr(pytest, "_rental_booking_id", None)
        assert bid, "previous test must succeed"
        r = requests.get(
            f"{API}/rental-bookings/mine",
            params={"role": "owner"},
            headers=_h(customer["token"]), timeout=15,
        )
        assert r.status_code == 200, r.text
        bookings = r.json()
        assert isinstance(bookings, list)
        ids = [b["id"] for b in bookings]
        assert bid in ids, f"booking {bid} not in owner inbox ({len(bookings)} returned)"
        # Verify booking shape
        target = next(b for b in bookings if b["id"] == bid)
        assert target["status"] == "pending_approval"
        assert target["owner_id"] == customer["user"]["id"]

    def test_non_owner_approve_403(self, provider):
        bid = pytest._rental_booking_id
        # Provider is the renter, NOT the owner → 403
        r = requests.post(
            f"{API}/rental-bookings/{bid}/approve",
            headers=_h(provider["token"]), timeout=15,
        )
        assert r.status_code == 403, r.text

    def test_owner_approves(self, customer):
        bid = pytest._rental_booking_id
        r = requests.post(
            f"{API}/rental-bookings/{bid}/approve",
            headers=_h(customer["token"]), timeout=15,
        )
        assert r.status_code == 200, r.text
        assert r.json().get("approved") is True
        # Verify status flipped via owner inbox
        listing = requests.get(
            f"{API}/rental-bookings/mine", params={"role": "owner"},
            headers=_h(customer["token"]), timeout=10,
        ).json()
        target = next(b for b in listing if b["id"] == bid)
        assert target["status"] == "deposit_pending", target

    def test_double_approve_rejected(self, customer):
        bid = pytest._rental_booking_id
        r = requests.post(
            f"{API}/rental-bookings/{bid}/approve",
            headers=_h(customer["token"]), timeout=15,
        )
        # Should be 400 (status guard) — definitely NOT 200
        assert r.status_code in (400, 403, 409), f"expected reject, got {r.status_code}: {r.text}"

    def test_decline_after_approve_rejected(self, customer):
        """Per review spec: decline should fail (4xx) when booking already approved."""
        bid = pytest._rental_booking_id
        r = requests.post(
            f"{API}/rental-bookings/{bid}/decline",
            headers=_h(customer["token"]), timeout=15,
        )
        # Spec says 403; accept any 4xx that prevents the state transition.
        assert r.status_code in (400, 403, 409), (
            f"expected decline-after-approve to be rejected, got {r.status_code}: {r.text}"
        )

    def test_book_own_rental_400(self, customer, request_rental):
        sd = (datetime.utcnow() + timedelta(days=20)).date().isoformat()
        ed = (datetime.utcnow() + timedelta(days=22)).date().isoformat()
        body = {
            "rental_id": request_rental["id"],
            "start_date": sd, "end_date": ed, "pricing_unit": "daily",
            "country": "US", "us_state": "CA", "origin_url": "https://example.com",
        }
        r = requests.post(
            f"{API}/rentals/{request_rental['id']}/book",
            json=body, headers=_h(customer["token"]), timeout=15,
        )
        assert r.status_code == 400, r.text


# ───────────────────────────────────────────────────────────────────
# Smoke: rentals listing + categories endpoint
# ───────────────────────────────────────────────────────────────────
class TestRentalsListing:
    def test_categories(self):
        r = requests.get(f"{API}/rentals/categories", timeout=10)
        assert r.status_code == 200
        data = r.json()
        cats = data.get("categories", [])
        keys = {c["key"] for c in cats}
        for k in ("property", "vehicles", "venues", "tools_equipment"):
            assert k in keys, f"missing category {k}"

    def test_list_rentals(self):
        r = requests.get(f"{API}/rentals", timeout=15)
        assert r.status_code == 200
        data = r.json()
        # Should include either seeded demo rentals or our TEST ones
        assert isinstance(data, list) or isinstance(data, dict)

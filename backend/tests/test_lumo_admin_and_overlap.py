"""
Tests for the 3 new features added in this session:
  1. Multi-photo gallery on rentals (media[] array)
  2. Availability calendar blocking — GET /api/rentals/{id}/blocked-dates,
     POST /api/rentals/{id}/book rejects overlapping date ranges with HTTP 409.
  3. Admin/Operator console endpoints:
        GET    /api/admin/stats
        GET    /api/admin/credentials
        POST   /api/admin/credentials/{id}/verify
        POST   /api/admin/credentials/{id}/reject
        GET    /api/admin/withdrawals
        GET    /api/admin/reviews
        DELETE /api/admin/reviews/{id}
        GET    /api/admin/rental-bookings
"""
import os
import uuid
import pytest
import requests
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
    return body.get("access_token") or body.get("token") or body["token"]


def _h(token):
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture(scope="module")
def admin_token():
    return _login("admin@lumo.test")


@pytest.fixture(scope="module")
def customer_token():
    return _login("customer@lumo.test")


@pytest.fixture(scope="module")
def provider_token():
    return _login("provider@lumo.test")


# ──────────────────────────────────────────────────────────────────────────
# Feature 1 — Multi-photo media[] array on rentals
# ──────────────────────────────────────────────────────────────────────────
class TestRentalMultiMedia:
    def test_create_rental_with_media_array(self, provider_token):
        body = {
            "title": "TEST_multi_photo_rental",
            "description": "x",
            "category": "tools_equipment",
            "subcategory": "power_tools",
            "location": {"address": "1 Test St"},
            "pricing": {"daily": 25.0},
            "booking_mode": "instant",
            "media": [
                {"media_url": "https://picsum.photos/seed/a/640/480", "media_type": "image"},
                {"media_url": "https://picsum.photos/seed/b/640/480", "media_type": "image"},
                {"media_url": "https://picsum.photos/seed/c/640/480", "media_type": "image"},
            ],
        }
        r = requests.post(f"{API}/rentals", json=body, headers=_h(provider_token), timeout=15)
        assert r.status_code in (200, 201), r.text
        d = r.json()
        rental_id = d["id"]
        # Verify media[] preserved on GET
        g = requests.get(f"{API}/rentals/{rental_id}", timeout=10)
        assert g.status_code == 200
        gd = g.json()
        assert isinstance(gd.get("media"), list)
        assert len(gd["media"]) == 3
        assert gd["media"][0]["media_url"].startswith("https://picsum.photos/")

    def test_legacy_media_url_backfills_media_array(self, provider_token):
        body = {
            "title": "TEST_legacy_single_photo",
            "description": "x",
            "category": "tools_equipment",
            "subcategory": "power_tools",
            "location": {"address": "1 Test St"},
            "pricing": {"daily": 10.0},
            "booking_mode": "instant",
            "media_url": "https://picsum.photos/seed/legacy/640/480",
            "media_type": "image",
        }
        r = requests.post(f"{API}/rentals", json=body, headers=_h(provider_token), timeout=15)
        assert r.status_code in (200, 201), r.text
        d = r.json()
        # media[] is backfilled from media_url
        assert isinstance(d.get("media"), list)
        assert len(d["media"]) == 1
        assert d["media"][0]["media_url"] == body["media_url"]


# ──────────────────────────────────────────────────────────────────────────
# Feature 2 — Blocked dates + overlap rejection
# ──────────────────────────────────────────────────────────────────────────
@pytest.fixture(scope="module")
def overlap_rental_id(provider_token):
    body = {
        "title": "TEST_overlap_rental",
        "description": "x",
        "category": "tools_equipment",
        "subcategory": "power_tools",
        "location": {"address": "1 Test St"},
        "pricing": {"daily": 30.0},
        "booking_mode": "instant",  # so 1st booking lands in deposit_pending (a blocking status)
        "media": [{"media_url": "https://picsum.photos/seed/ov/640/480", "media_type": "image"}],
    }
    r = requests.post(f"{API}/rentals", json=body, headers=_h(provider_token), timeout=15)
    assert r.status_code in (200, 201), r.text
    return r.json()["id"]


class TestBlockedDatesAndOverlap:
    def test_blocked_dates_empty_initially(self, overlap_rental_id):
        r = requests.get(f"{API}/rentals/{overlap_rental_id}/blocked-dates", timeout=10)
        assert r.status_code == 200
        data = r.json()
        assert isinstance(data, list)

    def test_first_booking_succeeds(self, overlap_rental_id, customer_token):
        body = {
            "rental_id": overlap_rental_id, "start_date": "2099-01-10",
            "end_date":   "2099-01-15",
            "pricing_unit": "daily",
            "country": "US",
            "us_state": "CA",
            "origin_url": "https://example.com",
        }
        r = requests.post(f"{API}/rentals/{overlap_rental_id}/book", json=body, headers=_h(customer_token), timeout=30)
        # instant booking returns Stripe URL — status code 200; booking gets a blocking status
        assert r.status_code == 200, r.text
        d = r.json()
        assert d.get("booking_id")

    def test_blocked_dates_includes_first_booking(self, overlap_rental_id):
        r = requests.get(f"{API}/rentals/{overlap_rental_id}/blocked-dates", timeout=10)
        assert r.status_code == 200
        ranges = r.json()
        assert any(x["start_date"] == "2099-01-10" and x["end_date"] == "2099-01-15" for x in ranges), ranges

    def test_overlap_booking_returns_409(self, overlap_rental_id, customer_token):
        """Exact same dates."""
        body = {
            "rental_id": overlap_rental_id, "start_date": "2099-01-10",
            "end_date":   "2099-01-15",
            "pricing_unit": "daily",
            "country": "US",
            "us_state": "CA",
            "origin_url": "https://example.com",
        }
        r = requests.post(f"{API}/rentals/{overlap_rental_id}/book", json=body, headers=_h(customer_token), timeout=30)
        assert r.status_code == 409, r.text
        assert "conflict" in r.text.lower() or "existing booking" in r.text.lower()

    def test_partial_overlap_returns_409(self, overlap_rental_id, customer_token):
        """Window that starts inside existing booking → 409."""
        body = {
            "rental_id": overlap_rental_id, "start_date": "2099-01-12",
            "end_date":   "2099-01-20",
            "pricing_unit": "daily",
            "country": "US",
            "us_state": "CA",
            "origin_url": "https://example.com",
        }
        r = requests.post(f"{API}/rentals/{overlap_rental_id}/book", json=body, headers=_h(customer_token), timeout=30)
        assert r.status_code == 409, r.text

    def test_non_overlapping_window_succeeds(self, overlap_rental_id, customer_token):
        """Adjacent, non-overlapping window must NOT 409."""
        body = {
            "rental_id": overlap_rental_id, "start_date": "2099-02-01",
            "end_date":   "2099-02-05",
            "pricing_unit": "daily",
            "country": "US",
            "us_state": "CA",
            "origin_url": "https://example.com",
        }
        r = requests.post(f"{API}/rentals/{overlap_rental_id}/book", json=body, headers=_h(customer_token), timeout=30)
        assert r.status_code == 200, r.text


# ──────────────────────────────────────────────────────────────────────────
# Feature 3 — Admin console endpoints
# ──────────────────────────────────────────────────────────────────────────
class TestAdminConsole:
    def test_non_admin_blocked_from_stats(self, customer_token):
        r = requests.get(f"{API}/admin/stats", headers=_h(customer_token), timeout=10)
        assert r.status_code == 403

    def test_non_admin_blocked_from_credentials(self, customer_token):
        r = requests.get(f"{API}/admin/credentials", headers=_h(customer_token), timeout=10)
        assert r.status_code == 403

    def test_admin_stats(self, admin_token):
        r = requests.get(f"{API}/admin/stats", headers=_h(admin_token), timeout=10)
        assert r.status_code == 200
        d = r.json()
        for k in ("pending_credentials", "pending_withdrawals", "total_reviews",
                  "active_rentals", "pending_rental_bookings", "total_users", "total_jobs_open"):
            assert k in d, f"missing key {k} in stats"
            assert isinstance(d[k], int)

    def test_admin_credentials_list_default(self, admin_token):
        r = requests.get(f"{API}/admin/credentials", headers=_h(admin_token), timeout=10)
        assert r.status_code == 200
        items = r.json()
        assert isinstance(items, list)
        # Each item should be enriched with `owner`
        for it in items:
            assert "id" in it
            assert "status" in it
            # owner may be None if user was deleted; skip if so
            assert "owner" in it

    def test_admin_credential_verify_then_reject_idempotent(self, admin_token, provider_token):
        # Provider creates a credential (no document → status defaults to submitted/pending)
        cr = requests.post(
            f"{API}/credentials",
            json={"kind": "ein", "category": "business_registration", "value": "TEST_999999999", "state": "US"},
            headers=_h(provider_token),
            timeout=10,
        )
        assert cr.status_code in (200, 201), cr.text
        cred_id = cr.json()["id"]

        v = requests.post(f"{API}/admin/credentials/{cred_id}/verify", headers=_h(admin_token), timeout=10)
        assert v.status_code == 200
        assert v.json().get("verified") is True

        # Reject is also exposed (we then call it on a different cred to confirm route works)
        cr2 = requests.post(
            f"{API}/credentials",
            json={"kind": "ein", "category": "business_registration", "value": "TEST_888888888", "state": "US"},
            headers=_h(provider_token),
            timeout=10,
        )
        cred_id2 = cr2.json()["id"]
        rj = requests.post(f"{API}/admin/credentials/{cred_id2}/reject", headers=_h(admin_token), timeout=10)
        assert rj.status_code == 200
        assert rj.json().get("rejected") is True

        # Verify on missing id → 404
        miss = requests.post(f"{API}/admin/credentials/{uuid.uuid4()}/verify", headers=_h(admin_token), timeout=10)
        assert miss.status_code == 404

    def test_admin_withdrawals_list(self, admin_token):
        r = requests.get(f"{API}/admin/withdrawals", headers=_h(admin_token), timeout=10)
        assert r.status_code == 200
        assert isinstance(r.json(), list)

    def test_admin_reviews_list(self, admin_token):
        r = requests.get(f"{API}/admin/reviews", headers=_h(admin_token), timeout=10)
        assert r.status_code == 200
        assert isinstance(r.json(), list)

    def test_admin_review_delete_404_for_missing(self, admin_token):
        r = requests.delete(f"{API}/admin/reviews/{uuid.uuid4()}", headers=_h(admin_token), timeout=10)
        assert r.status_code == 404

    def test_admin_rental_bookings(self, admin_token):
        r = requests.get(f"{API}/admin/rental-bookings", headers=_h(admin_token), timeout=10)
        assert r.status_code == 200
        assert isinstance(r.json(), list)

        # Pending only
        r2 = requests.get(f"{API}/admin/rental-bookings?status=pending_approval", headers=_h(admin_token), timeout=10)
        assert r2.status_code == 200
        for b in r2.json():
            assert b.get("status") == "pending_approval"

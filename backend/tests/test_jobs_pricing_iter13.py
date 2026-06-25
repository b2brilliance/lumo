"""
Iteration 13 — POST /api/jobs contract regression after CustomerHub
pricing UI change. Backend contract is unchanged: pay_rate is still required.
"""
import os
import uuid
import requests
import pytest

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://lumo-bundle-checkout.preview.emergentagent.com").rstrip("/")


def _login(email: str, password: str = "password123") -> str:
    r = requests.post(f"{BASE_URL}/api/auth/login", json={"email": email, "password": password}, timeout=15)
    assert r.status_code == 200, f"login failed for {email}: {r.status_code} {r.text}"
    return r.json()["token"]


@pytest.fixture(scope="module")
def customer_token():
    return _login("customer@lumo.test")


@pytest.fixture(scope="module")
def provider_token():
    return _login("provider@lumo.test")


# ── Delivery job POST contract — pay_rate still required ─────────────────────
class TestJobsDelivery:
    def test_post_delivery_job_with_autoquote_rate_creates_job(self, customer_token):
        payload = {
            "title": f"TEST_delivery {uuid.uuid4().hex[:6]}",
            "description": "Pickup→drop-off auto-quote from CustomerHub",
            "category": "delivery",
            "pay_rate": 25.00,
            "pay_unit": "flat",
            "estimated_units": 1,
            "payment_terms": "",
            "allowed_payment_methods": ["app", "cash"],
            "pickup_location": {"address": "100 Main St, Brooklyn, NY", "lat": 40.6782, "lng": -73.9442},
            "dropoff_location": {"address": "200 Wall St, New York, NY", "lat": 40.7060, "lng": -74.0086},
            "details": {"item_size": "small_box", "quantity": 1, "weight_estimate": 3, "fragile": "no"},
        }
        h = {"Authorization": f"Bearer {customer_token}"}
        r = requests.post(f"{BASE_URL}/api/jobs", json=payload, headers=h, timeout=15)
        assert r.status_code in (200, 201), r.text
        data = r.json()
        assert data["category"] == "delivery"
        assert abs(float(data["pay_rate"]) - 25.00) < 0.01
        assert data["pay_unit"] == "flat"

        # GET back via list
        g = requests.get(f"{BASE_URL}/api/jobs", headers=h, timeout=15)
        assert g.status_code == 200
        ids = [j["id"] for j in g.json()]
        assert data["id"] in ids

    def test_post_non_delivery_job_still_works(self, customer_token):
        payload = {
            "title": f"TEST_cleaning {uuid.uuid4().hex[:6]}",
            "description": "Manual rate (non-delivery) regression",
            "category": "cleaning",
            "pay_rate": 30.00,
            "pay_unit": "hour",
            "estimated_units": 3,
            "payment_terms": "",
            "allowed_payment_methods": ["app", "cash"],
            "service_location": {"address": "1 Park Pl, Brooklyn, NY", "lat": 40.6782, "lng": -73.9442},
            "details": {},
        }
        h = {"Authorization": f"Bearer {customer_token}"}
        r = requests.post(f"{BASE_URL}/api/jobs", json=payload, headers=h, timeout=15)
        assert r.status_code in (200, 201), r.text
        data = r.json()
        assert data["category"] == "cleaning"
        assert abs(float(data["pay_rate"]) - 30.0) < 0.01
        assert data["pay_unit"] == "hour"

    def test_pay_rate_still_required(self, customer_token):
        payload = {
            "title": "TEST_no_pay_rate",
            "description": "no pay rate",
            "category": "delivery",
            "pay_unit": "flat",
            "estimated_units": 1,
            "payment_terms": "",
            "allowed_payment_methods": ["app"],
            "pickup_location": {"address": "A", "lat": 40.0, "lng": -74.0},
            "dropoff_location": {"address": "B", "lat": 40.1, "lng": -74.1},
            "details": {},
        }
        h = {"Authorization": f"Bearer {customer_token}"}
        r = requests.post(f"{BASE_URL}/api/jobs", json=payload, headers=h, timeout=15)
        # Server should reject (422 validation, 400 bad request all fine).
        assert r.status_code in (400, 422), f"expected 4xx, got {r.status_code} {r.text}"


# ── Provider can fetch open jobs (used by ProviderHub) ──────────────────────
class TestProviderJobsList:
    def test_provider_can_list_open_jobs(self, provider_token):
        h = {"Authorization": f"Bearer {provider_token}"}
        r = requests.get(f"{BASE_URL}/api/jobs/open", headers=h, timeout=15)
        # Either /jobs/open or /jobs?status=open is acceptable
        if r.status_code == 404:
            r = requests.get(f"{BASE_URL}/api/jobs?status=open", headers=h, timeout=15)
        assert r.status_code == 200, r.text
        jobs = r.json()
        assert isinstance(jobs, list)


# ── Auth sanity ──────────────────────────────────────────────────────────────
def test_login_returns_jwt():
    r = requests.post(f"{BASE_URL}/api/auth/login", json={"email": "customer@lumo.test", "password": "password123"}, timeout=15)
    assert r.status_code == 200
    assert "token" in r.json()

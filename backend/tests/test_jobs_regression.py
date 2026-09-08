"""Regression: POST /api/jobs still accepts the wizard payload shape."""
import os
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://lumo-bundle-checkout.preview.emergentagent.com").rstrip("/")


@pytest.fixture(scope="module")
def customer_token():
    r = requests.post(f"{BASE_URL}/api/auth/login", json={
        "email": "customer@lumo.test", "password": "password123"
    }, timeout=30)
    assert r.status_code == 200, r.text
    return r.json()["token"]


@pytest.fixture(scope="module")
def customer_client(customer_token):
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json", "Authorization": f"Bearer {customer_token}"})
    return s


def test_login_customer(customer_token):
    assert isinstance(customer_token, str) and len(customer_token) > 10


def test_login_provider():
    r = requests.post(f"{BASE_URL}/api/auth/login", json={
        "email": "provider@lumo.test", "password": "password123"
    }, timeout=30)
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["user"]["role"] == "provider"


def test_login_admin_owner():
    r = requests.post(f"{BASE_URL}/api/auth/login", json={
        "email": "julius.a.mason@gmail.com", "password": "Mason0123"
    }, timeout=30)
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["user"]["role"] == "admin"


def test_post_jobs_delivery_shape(customer_client):
    body = {
        "title": "TEST_ Delivery from wizard",
        "description": "Wizard regression",
        "category": "delivery",
        "pay_rate": 25.0,
        "pay_unit": "flat",
        "estimated_units": 1,
        "payment_terms": "",
        "allowed_payment_methods": ["app"],
        "pickup_location": {"lat": 40.7128, "lng": -74.006, "address": "123 Test Pickup, NY"},
        "dropoff_location": {"lat": 40.7580, "lng": -73.9855, "address": "456 Test Dropoff, NY"},
        "details": {"subcategory": "small_package", "scheduled_for": None},
    }
    r = customer_client.post(f"{BASE_URL}/api/jobs", json=body, timeout=30)
    assert r.status_code in (200, 201), r.text
    data = r.json()
    assert "id" in data
    assert data.get("category") == "delivery"


def test_post_jobs_cleaning_shape(customer_client):
    body = {
        "title": "TEST_ Cleaning from wizard",
        "description": "Wizard regression",
        "category": "cleaning",
        "pay_rate": 80.0,
        "pay_unit": "flat",
        "estimated_units": 1,
        "payment_terms": "",
        "allowed_payment_methods": ["app"],
        "pickup_location": {"lat": 40.7128, "lng": -74.006, "address": "789 Clean Ave, NY"},
        "dropoff_location": None,
        "details": {"subcategory": "standard", "scheduled_for": None},
    }
    r = customer_client.post(f"{BASE_URL}/api/jobs", json=body, timeout=30)
    assert r.status_code in (200, 201), r.text
    data = r.json()
    assert data.get("category") == "cleaning"

"""Backend tests for P2P-only pivot (iteration 45)."""
import os
import uuid
import pytest
import requests

BASE_URL = os.environ["REACT_APP_BACKEND_URL"].rstrip("/")


@pytest.fixture(scope="module")
def s():
    return requests.Session()


# ── Register: business roles rejected ───────────────────────────────────
class TestBusinessRolesDisabled:
    def test_retailer_registration_rejected(self, s):
        r = s.post(f"{BASE_URL}/api/auth/register", json={
            "email": f"TEST_retailer_{uuid.uuid4().hex[:8]}@lumo.test",
            "password": "password123",
            "name": "Test Retailer",
            "role": "retailer",
        })
        assert r.status_code == 400, r.text
        detail = r.json().get("detail", "")
        assert "temporarily disabled" in detail.lower() or "business" in detail.lower()

    def test_restaurant_registration_rejected(self, s):
        r = s.post(f"{BASE_URL}/api/auth/register", json={
            "email": f"TEST_rest_{uuid.uuid4().hex[:8]}@lumo.test",
            "password": "password123",
            "name": "Test Restaurant",
            "role": "restaurant",
        })
        assert r.status_code == 400, r.text
        detail = r.json().get("detail", "")
        assert "temporarily disabled" in detail.lower() or "business" in detail.lower()


# ── Register: customer + provider still work ────────────────────────────
class TestAllowedRoles:
    def test_customer_registration_works(self, s):
        email = f"TEST_cust_{uuid.uuid4().hex[:8]}@lumo.test"
        r = s.post(f"{BASE_URL}/api/auth/register", json={
            "email": email, "password": "password123",
            "name": "Test Customer", "role": "customer",
        })
        assert r.status_code in (200, 201), r.text
        data = r.json()
        assert "token" in data
        assert data["user"]["role"] == "customer"
        assert data["user"]["email"] == email.lower()

    def test_provider_registration_works(self, s):
        email = f"TEST_prov_{uuid.uuid4().hex[:8]}@lumo.test"
        r = s.post(f"{BASE_URL}/api/auth/register", json={
            "email": email, "password": "password123",
            "name": "Test Provider", "role": "provider",
            "avatar_url": "/api/media/fake-id",
        })
        assert r.status_code in (200, 201), r.text
        assert r.json()["user"]["role"] == "provider"

    def test_provider_without_avatar_rejected(self, s):
        email = f"TEST_prov2_{uuid.uuid4().hex[:8]}@lumo.test"
        r = s.post(f"{BASE_URL}/api/auth/register", json={
            "email": email, "password": "password123",
            "name": "No Avatar", "role": "provider",
        })
        assert r.status_code == 400


# ── Login: owner-admin works ────────────────────────────────────────────
class TestOwnerAdmin:
    def test_owner_admin_login(self, s):
        r = s.post(f"{BASE_URL}/api/auth/login", json={
            "email": "julius.a.mason@gmail.com",
            "password": "Mason0123",
        })
        assert r.status_code == 200, r.text
        data = r.json()
        assert "token" in data
        assert data["user"]["role"] == "admin"

    def test_seed_admin_login(self, s):
        r = s.post(f"{BASE_URL}/api/auth/login", json={
            "email": "admin@lumo.test",
            "password": "password123",
        })
        assert r.status_code == 200, r.text
        assert r.json()["user"]["role"] == "admin"


# ── Legacy business accounts deactivated ────────────────────────────────
class TestLegacyDeactivation:
    def test_legacy_retailer_has_deactivated_at(self, s):
        """Verify at DB level via login: the retailer test account still logs in
        but its user doc has deactivated_at."""
        # Try to login the seed retailer account
        r = s.post(f"{BASE_URL}/api/auth/login", json={
            "email": "retailer@lumo.test",
            "password": "password123",
        })
        if r.status_code != 200:
            pytest.skip(f"No retailer@lumo.test seed account (status {r.status_code})")
        user = r.json()["user"]
        assert user.get("deactivated_at"), f"retailer missing deactivated_at: {user}"

    def test_legacy_restaurant_has_deactivated_at(self, s):
        r = s.post(f"{BASE_URL}/api/auth/login", json={
            "email": "restaurant@lumo.test",
            "password": "password123",
        })
        if r.status_code != 200:
            pytest.skip(f"No restaurant@lumo.test seed account (status {r.status_code})")
        user = r.json()["user"]
        assert user.get("deactivated_at"), f"restaurant missing deactivated_at: {user}"

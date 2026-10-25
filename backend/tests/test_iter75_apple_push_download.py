# Iteration 75: Apple sign-in config/verify, native push register, account deletion, app download links
import os
import uuid
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL").rstrip("/")
ADMIN = {"email": "julius.a.mason@gmail.com", "password": "Mason0123"}
PLAY = "https://play.google.com/store/apps/details?id=app.golumo.mobile"


def _login(creds):
    r = requests.post(f"{BASE_URL}/api/auth/login", json=creds, timeout=20)
    if r.status_code != 200:
        pytest.skip(f"login failed {creds['email']}: {r.status_code}")
    return r.json()["token"]


@pytest.fixture(scope="module")
def admin_h():
    return {"Authorization": f"Bearer {_login(ADMIN)}"}


@pytest.fixture(scope="module")
def customer_h():
    return {"Authorization": f"Bearer {_login({'email': 'customer@lumo.test', 'password': 'password123'})}"}


# Apple sign-in
class TestApple:
    def test_config(self):
        r = requests.get(f"{BASE_URL}/api/auth/apple/config", timeout=20)
        assert r.status_code == 200
        d = r.json()
        assert d["web_enabled"] is False
        assert d["native_enabled"] is True

    def test_invalid_token_401(self):
        r = requests.post(f"{BASE_URL}/api/auth/apple", json={"identity_token": "not.a.jwt", "nonce": "x"}, timeout=20)
        assert r.status_code == 401
        assert "Apple" in r.json().get("detail", "")

    def test_garbage_token_401(self):
        r = requests.post(f"{BASE_URL}/api/auth/apple", json={"identity_token": "garbage"}, timeout=20)
        assert r.status_code == 401

    def test_missing_token_422(self):
        r = requests.post(f"{BASE_URL}/api/auth/apple", json={}, timeout=20)
        assert r.status_code == 422


# Native push device registration
class TestNativePush:
    def test_register_requires_auth(self):
        r = requests.post(f"{BASE_URL}/api/push/native/register", json={"token": "t"}, timeout=20)
        assert r.status_code in (401, 403)

    def test_register_unregister(self, customer_h):
        tok = f"TEST_fcm_{uuid.uuid4().hex}"
        r = requests.post(f"{BASE_URL}/api/push/native/register", json={"token": tok, "platform": "ios"}, headers=customer_h, timeout=20)
        assert r.status_code == 200
        d = r.json()
        assert d["ok"] is True and d["configured"] is False
        r = requests.post(f"{BASE_URL}/api/push/native/unregister", json={"token": tok}, headers=customer_h, timeout=20)
        assert r.status_code == 200 and r.json()["ok"] is True


# Account deletion
class TestDeleteMe:
    def test_delete_new_customer(self):
        email = f"test_del_{uuid.uuid4().hex[:8]}@example.com"
        r = requests.post(f"{BASE_URL}/api/auth/register", json={"email": email, "password": "password123", "name": "TEST Del", "role": "customer"}, timeout=20)
        assert r.status_code == 200, r.text
        h = {"Authorization": f"Bearer {r.json()['token']}"}
        requests.post(f"{BASE_URL}/api/push/native/register", json={"token": f"TEST_{uuid.uuid4().hex}"}, headers=h, timeout=20)
        r = requests.delete(f"{BASE_URL}/api/auth/me", headers=h, timeout=20)
        assert r.status_code == 200 and r.json()["ok"] is True
        r = requests.get(f"{BASE_URL}/api/auth/me", headers=h, timeout=20)
        assert r.status_code == 401
        r = requests.post(f"{BASE_URL}/api/auth/login", json={"email": email, "password": "password123"}, timeout=20)
        assert r.status_code in (400, 401)

    def test_delete_admin_400(self, admin_h):
        r = requests.delete(f"{BASE_URL}/api/auth/me", headers=admin_h, timeout=20)
        assert r.status_code == 400
        assert requests.get(f"{BASE_URL}/api/auth/me", headers=admin_h, timeout=20).status_code == 200


# App download links in site settings
class TestAppLinks:
    def test_public_social_links(self):
        r = requests.get(f"{BASE_URL}/api/site/social", timeout=20)
        assert r.status_code == 200
        d = r.json()
        assert "ios_app_url" in d and "android_app_url" in d
        assert d["android_app_url"] == PLAY

    def test_admin_save_and_clear_ios(self, admin_h):
        r = requests.put(f"{BASE_URL}/api/admin/site/social", json={"ios_app_url": "apps.apple.com/app/id123"}, headers=admin_h, timeout=20)
        assert r.status_code == 200
        assert r.json()["ios_app_url"] == "https://apps.apple.com/app/id123"
        assert requests.get(f"{BASE_URL}/api/site/social", timeout=20).json()["ios_app_url"] == "https://apps.apple.com/app/id123"
        r = requests.put(f"{BASE_URL}/api/admin/site/social", json={"ios_app_url": ""}, headers=admin_h, timeout=20)
        assert r.status_code == 200 and r.json()["ios_app_url"] == ""
        assert requests.get(f"{BASE_URL}/api/site/social", timeout=20).json()["ios_app_url"] == ""

    def test_non_admin_forbidden(self, customer_h):
        r = requests.put(f"{BASE_URL}/api/admin/site/social", json={"ios_app_url": "x.com"}, headers=customer_h, timeout=20)
        assert r.status_code in (401, 403)

    def test_pricing_for_calculator(self):
        r = requests.get(f"{BASE_URL}/api/app/pricing", timeout=20)
        assert r.status_code == 200
        p = r.json()
        fee = (p["delivery_base"] + p["delivery_per_mile"] * 3) * p["size_multipliers"]["small"]
        assert round(fee, 2) == 8.49
        assert p["driver_share_pct"] == 90

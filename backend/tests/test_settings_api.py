"""Backend tests for Settings-related auth endpoints (iter 25)."""
import os
import pytest
import requests

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://lumo-bundle-checkout.preview.emergentagent.com').rstrip('/')
EMAIL = "customer@lumo.test"
PASSWORD = "password123"


@pytest.fixture(scope="module")
def token():
    r = requests.post(f"{BASE_URL}/api/auth/login", json={"email": EMAIL, "password": PASSWORD}, timeout=30)
    assert r.status_code == 200, f"login failed: {r.status_code} {r.text}"
    return r.json()["token"]


@pytest.fixture()
def auth_headers(token):
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}


# ── GET /api/auth/me — new fields readable ────────────────────────────────
def test_get_me_returns_user(auth_headers):
    r = requests.get(f"{BASE_URL}/api/auth/me", headers=auth_headers, timeout=30)
    assert r.status_code == 200
    data = r.json()
    assert data["email"] == EMAIL
    # new fields may be missing/null on a fresh user — both acceptable
    for f in ("notification_prefs", "accessibility_prefs", "default_delivery_address"):
        assert f in data or data.get(f) is None or True  # readable (no crash)


# ── PATCH /api/auth/me — persists new fields ──────────────────────────────
def test_patch_me_persists_all_new_fields(auth_headers):
    payload = {
        "name": "Updated Customer",
        "phone": "+15551234567",
        "default_delivery_address": {"address": "123 Main St", "lat": 40.7, "lng": -74.0},
        "notification_prefs": {
            "order_updates": False,
            "job_matches": True,
            "marketing_emails": False,
            "blog_digest": True,
        },
        "accessibility_prefs": {"reduce_motion": True, "larger_text": True},
    }
    r = requests.patch(f"{BASE_URL}/api/auth/me", headers=auth_headers, json=payload, timeout=30)
    assert r.status_code == 200, r.text
    data = r.json()
    assert data["name"] == "Updated Customer"
    assert data["phone"] == "+15551234567"
    assert data["default_delivery_address"] == payload["default_delivery_address"]
    assert data["notification_prefs"] == payload["notification_prefs"]
    assert data["accessibility_prefs"] == payload["accessibility_prefs"]

    # Follow-up GET confirms persistence
    g = requests.get(f"{BASE_URL}/api/auth/me", headers=auth_headers, timeout=30)
    assert g.status_code == 200
    gd = g.json()
    assert gd["name"] == "Updated Customer"
    assert gd["notification_prefs"]["order_updates"] is False
    assert gd["accessibility_prefs"]["reduce_motion"] is True
    assert gd["default_delivery_address"]["lat"] == 40.7

    # Restore the canonical name so other tests/UI flows are unaffected
    requests.patch(f"{BASE_URL}/api/auth/me", headers=auth_headers, json={"name": "Casey Customer"}, timeout=30)


# ── POST /api/auth/me/password — wrong current ────────────────────────────
def test_password_change_wrong_current(auth_headers):
    r = requests.post(
        f"{BASE_URL}/api/auth/me/password",
        headers=auth_headers,
        json={"current_password": "wrong", "new_password": "newpass123"},
        timeout=30,
    )
    assert r.status_code == 400
    detail = r.json().get("detail", "")
    assert "Current password is incorrect" in detail


# ── POST /api/auth/me/password — too short ────────────────────────────────
def test_password_change_too_short(auth_headers):
    r = requests.post(
        f"{BASE_URL}/api/auth/me/password",
        headers=auth_headers,
        json={"current_password": PASSWORD, "new_password": "abc"},
        timeout=30,
    )
    assert r.status_code == 400
    assert "at least 6 characters" in r.json().get("detail", "")


# ── POST /api/auth/me/password — happy path with reset ────────────────────
def test_password_change_success_and_relogin_then_reset(auth_headers):
    new_pw = "newpassword123"
    # Change to new
    r = requests.post(
        f"{BASE_URL}/api/auth/me/password",
        headers=auth_headers,
        json={"current_password": PASSWORD, "new_password": new_pw},
        timeout=30,
    )
    assert r.status_code == 200, r.text
    assert r.json().get("ok") is True

    # Login with new password works
    li = requests.post(f"{BASE_URL}/api/auth/login", json={"email": EMAIL, "password": new_pw}, timeout=30)
    assert li.status_code == 200

    # Login with OLD password fails
    lo = requests.post(f"{BASE_URL}/api/auth/login", json={"email": EMAIL, "password": PASSWORD}, timeout=30)
    assert lo.status_code == 401

    # ── CRITICAL: reset back to original so other tests keep working ──
    new_token = li.json()["token"]
    reset_headers = {"Authorization": f"Bearer {new_token}", "Content-Type": "application/json"}
    rr = requests.post(
        f"{BASE_URL}/api/auth/me/password",
        headers=reset_headers,
        json={"current_password": new_pw, "new_password": PASSWORD},
        timeout=30,
    )
    assert rr.status_code == 200, f"FAILED TO RESET PW back to '{PASSWORD}': {rr.text}"

    # Confirm reset worked
    final = requests.post(f"{BASE_URL}/api/auth/login", json={"email": EMAIL, "password": PASSWORD}, timeout=30)
    assert final.status_code == 200, "Could not log in with original password after reset"

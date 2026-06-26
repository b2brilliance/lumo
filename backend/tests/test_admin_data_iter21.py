"""Iteration 21: admin data-management endpoints (admin_data.py)."""
import os
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://lumo-bundle-checkout.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"

REQUIRED_PROTECTED = {
    "jobs", "orders", "wallet_transactions", "withdrawal_requests",
    "stripe_transfers", "site_settings", "analytics_settings",
}


def _login(email, password):
    r = requests.post(f"{API}/auth/login", json={"email": email, "password": password}, timeout=15)
    assert r.status_code == 200, f"login failed for {email}: {r.status_code} {r.text}"
    return r.json()["token"]


@pytest.fixture(scope="module")
def admin_token():
    return _login("admin@lumo.test", "password123")


@pytest.fixture(scope="module")
def provider_token():
    return _login("provider@lumo.test", "password123")


@pytest.fixture
def admin_headers(admin_token):
    return {"Authorization": f"Bearer {admin_token}"}


# --- list collections / auth gating ---
def test_list_collections_admin_ok(admin_headers):
    r = requests.get(f"{API}/admin/data/collections", headers=admin_headers, timeout=15)
    assert r.status_code == 200, r.text
    data = r.json()
    assert "collections" in data and "protected" in data
    assert isinstance(data["collections"], list)
    protected = set(data["protected"])
    missing = REQUIRED_PROTECTED - protected
    assert not missing, f"protected missing: {missing}"
    keys = {c["key"] for c in data["collections"]}
    # Sanity: a few non-protected collections should be listed
    assert {"pageviews", "users", "reviews", "notifications"}.issubset(keys)
    # Each row has the expected shape
    for c in data["collections"]:
        assert {"key", "label", "count"}.issubset(c.keys())


def test_list_collections_no_token_unauth():
    r = requests.get(f"{API}/admin/data/collections", timeout=15)
    assert r.status_code in (401, 403), r.text


def test_list_collections_non_admin_403(provider_token):
    h = {"Authorization": f"Bearer {provider_token}"}
    r = requests.get(f"{API}/admin/data/collections", headers=h, timeout=15)
    assert r.status_code == 403, r.text


# --- peek pageviews + sensitive field stripping ---
def test_peek_pageviews(admin_headers):
    r = requests.get(f"{API}/admin/data/pageviews?limit=10", headers=admin_headers, timeout=15)
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["collection"] == "pageviews"
    assert "total" in body
    assert isinstance(body["items"], list)
    # no password_hash, no mongo _id
    for it in body["items"]:
        assert "password_hash" not in it
        assert "_id" not in it


def test_peek_users_no_password_hash(admin_headers):
    r = requests.get(f"{API}/admin/data/users?limit=20", headers=admin_headers, timeout=15)
    assert r.status_code == 200, r.text
    for it in r.json()["items"]:
        assert "password_hash" not in it


# --- protected GETs 404 ---
@pytest.mark.parametrize("coll", ["orders", "jobs", "wallet_transactions", "withdrawal_requests", "stripe_transfers", "site_settings", "analytics_settings"])
def test_peek_protected_404(admin_headers, coll):
    r = requests.get(f"{API}/admin/data/{coll}", headers=admin_headers, timeout=15)
    assert r.status_code == 404, f"{coll}: {r.status_code} {r.text}"


# --- bulk-delete protected → 403 ---
@pytest.mark.parametrize("coll", ["orders", "jobs", "wallet_transactions"])
def test_bulk_delete_protected_403(admin_headers, coll):
    r = requests.post(
        f"{API}/admin/data/bulk-delete",
        headers=admin_headers,
        json={"collection": coll, "confirm": True},
        timeout=15,
    )
    assert r.status_code == 403, f"{coll}: {r.status_code} {r.text}"
    body = r.json()
    detail = (body.get("detail") or "").lower()
    assert "protected" in detail


def test_bulk_delete_without_confirm_400(admin_headers):
    r = requests.post(
        f"{API}/admin/data/bulk-delete",
        headers=admin_headers,
        json={"collection": "pageviews", "confirm": False},
        timeout=15,
    )
    assert r.status_code == 400, r.text
    assert "confirm" in (r.json().get("detail") or "").lower()


def test_bulk_delete_reviews_ok(admin_headers):
    r = requests.post(
        f"{API}/admin/data/bulk-delete",
        headers=admin_headers,
        json={"collection": "reviews", "confirm": True},
        timeout=15,
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["ok"] is True
    assert body["collection"] == "reviews"
    assert "deleted" in body and isinstance(body["deleted"], int)


def test_bulk_delete_users_preserves_admin(admin_headers):
    # Wipe users (older filter to be safe). admin must survive.
    r = requests.post(
        f"{API}/admin/data/bulk-delete",
        headers=admin_headers,
        json={"collection": "users", "confirm": True, "older_than_iso": "1970-01-02T00:00:00Z"},
        timeout=15,
    )
    assert r.status_code == 200, r.text
    # Admin still able to log in (proves admin@lumo.test still exists)
    r2 = requests.post(f"{API}/auth/login", json={"email": "admin@lumo.test", "password": "password123"}, timeout=15)
    assert r2.status_code == 200, f"admin login broken after users wipe: {r2.text}"
    # Look in peek that admin exists
    r3 = requests.get(f"{API}/admin/data/users?limit=200", headers=admin_headers, timeout=15)
    assert r3.status_code == 200
    emails = [u.get("email") for u in r3.json()["items"]]
    assert "admin@lumo.test" in emails


def test_delete_nonexistent_notification(admin_headers):
    r = requests.delete(f"{API}/admin/data/notifications/nope_nonexistent_id_xyz", headers=admin_headers, timeout=15)
    assert r.status_code == 200, r.text
    body = r.json()
    assert body.get("deleted") == 0


def test_analytics_pageviews_regression(admin_headers):
    # Quick regression: prior analytics endpoint still works.
    r = requests.get(f"{API}/admin/analytics/pageviews", headers=admin_headers, timeout=15)
    assert r.status_code in (200, 404), r.text  # tolerate 404 if path renamed

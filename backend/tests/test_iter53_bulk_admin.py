"""Iteration 53: bulk admin endpoints across users, shop, reviews,
withdrawals, credentials and rental-bookings.

Tests focus on:
  - auth guards (non-admin gets 401/403)
  - self-skip on user bulk-delete/patch
  - allowed-fields whitelist on bulk-patch
  - status-enum validation on withdrawals/rentals
"""
import os
import uuid
import pytest
import requests
from dotenv import load_dotenv

load_dotenv("/app/frontend/.env")
BASE = os.environ["REACT_APP_BACKEND_URL"].rstrip("/") + "/api"

ADMIN_EMAIL = "julius.a.mason@gmail.com"
ADMIN_PW = "Mason0123"
CUSTOMER_EMAIL = "customer@lumo.test"
CUSTOMER_PW = "password123"


def _login(email, pw):
    r = requests.post(f"{BASE}/auth/login", json={"email": email, "password": pw}, timeout=15)
    assert r.status_code == 200, f"login failed for {email}: {r.status_code} {r.text}"
    d = r.json()
    return d["token"], d["user"]


@pytest.fixture(scope="module")
def admin_ctx():
    tok, user = _login(ADMIN_EMAIL, ADMIN_PW)
    return {"token": tok, "user": user, "h": {"Authorization": f"Bearer {tok}"}}


@pytest.fixture(scope="module")
def customer_ctx():
    tok, user = _login(CUSTOMER_EMAIL, CUSTOMER_PW)
    return {"token": tok, "user": user, "h": {"Authorization": f"Bearer {tok}"}}


def _mk_user():
    suffix = uuid.uuid4().hex[:8]
    email = f"TEST_bulk_{suffix}@lumo.test"
    r = requests.post(f"{BASE}/auth/register", json={
        "email": email, "password": "password123", "name": f"Bulk {suffix}", "role": "customer"
    }, timeout=15)
    assert r.status_code == 200, r.text
    return r.json()["user"]


# ── AUTH GUARDS ─────────────────────────────────────────────────────
class TestAuthGuards:
    endpoints = [
        ("/admin/users/bulk-delete", {"ids": ["x"]}),
        ("/admin/users/bulk-patch", {"ids": ["x"], "updates": {"banned": True}}),
        ("/admin/shop/products/bulk-delete", {"ids": ["x"]}),
        ("/admin/shop/products/bulk-patch", {"ids": ["x"], "updates": {"is_active": False}}),
        ("/admin/reviews/bulk-delete", {"ids": ["x"]}),
        ("/admin/withdrawals/bulk-patch", {"ids": ["x"], "status": "denied"}),
        ("/admin/credentials/bulk-verify", {"ids": ["x"]}),
        ("/admin/credentials/bulk-reject", {"ids": ["x"], "reason": "bad"}),
        ("/admin/rental-bookings/bulk-patch", {"ids": ["x"], "status": "approved"}),
    ]

    def test_no_auth_rejected(self):
        for path, body in self.endpoints:
            r = requests.post(f"{BASE}{path}", json=body, timeout=15)
            assert r.status_code in (401, 403), f"{path} unauth got {r.status_code}"

    def test_non_admin_rejected(self, customer_ctx):
        for path, body in self.endpoints:
            r = requests.post(f"{BASE}{path}", json=body, headers=customer_ctx["h"], timeout=15)
            assert r.status_code in (401, 403), f"{path} as customer got {r.status_code}"


# ── USERS BULK ──────────────────────────────────────────────────────
class TestUsersBulk:
    def test_bulk_delete_with_self_skip(self, admin_ctx):
        u1 = _mk_user(); u2 = _mk_user(); u3 = _mk_user()
        ids = [u1["id"], u2["id"], u3["id"], admin_ctx["user"]["id"]]
        r = requests.post(f"{BASE}/admin/users/bulk-delete", json={"ids": ids}, headers=admin_ctx["h"], timeout=15)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["deleted_count"] == 3
        assert d["skipped_self"] == 1
        # admin still exists (login again)
        _login(ADMIN_EMAIL, ADMIN_PW)

    def test_bulk_patch_banned_and_self_skip(self, admin_ctx):
        u1 = _mk_user(); u2 = _mk_user()
        ids = [u1["id"], u2["id"], admin_ctx["user"]["id"]]
        r = requests.post(f"{BASE}/admin/users/bulk-patch",
                          json={"ids": ids, "updates": {"banned": True}},
                          headers=admin_ctx["h"], timeout=15)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["matched_count"] == 2
        assert d["skipped_self"] == 1
        # cleanup
        requests.post(f"{BASE}/admin/users/bulk-delete", json={"ids": [u1["id"], u2["id"]]},
                      headers=admin_ctx["h"], timeout=15)

    def test_bulk_patch_invalid_role_400(self, admin_ctx):
        u1 = _mk_user()
        r = requests.post(f"{BASE}/admin/users/bulk-patch",
                          json={"ids": [u1["id"]], "updates": {"role": "godmode"}},
                          headers=admin_ctx["h"], timeout=15)
        assert r.status_code == 400
        requests.post(f"{BASE}/admin/users/bulk-delete", json={"ids": [u1["id"]]},
                      headers=admin_ctx["h"], timeout=15)

    def test_bulk_patch_disallowed_field_ignored(self, admin_ctx):
        u1 = _mk_user()
        r = requests.post(f"{BASE}/admin/users/bulk-patch",
                          json={"ids": [u1["id"]], "updates": {"email": "hax@x.com"}},
                          headers=admin_ctx["h"], timeout=15)
        # allowed dict becomes empty → 400
        assert r.status_code == 400
        requests.post(f"{BASE}/admin/users/bulk-delete", json={"ids": [u1["id"]]},
                      headers=admin_ctx["h"], timeout=15)


# ── SHOP BULK ───────────────────────────────────────────────────────
def _mk_product(admin_h):
    suffix = uuid.uuid4().hex[:8]
    body = {
        "title": f"TEST_prod_{suffix}",
        "description": "test",
        "price": 9.99,
        "image_url": "https://example.com/a.png",
        "affiliate_url": "https://example.com/x",
        "retailer": "amazon",
        "retailer_label": "Amazon",
        "category": "test",
        "is_active": True,
        "is_featured": False,
    }
    r = requests.post(f"{BASE}/admin/shop/products", json=body, headers=admin_h, timeout=15)
    assert r.status_code in (200, 201), r.text
    return r.json().get("product") or r.json()


class TestShopBulk:
    def test_bulk_patch_is_active(self, admin_ctx):
        p1 = _mk_product(admin_ctx["h"])
        p2 = _mk_product(admin_ctx["h"])
        p3 = _mk_product(admin_ctx["h"])
        ids = [p1["id"], p2["id"], p3["id"]]
        r = requests.post(f"{BASE}/admin/shop/products/bulk-patch",
                          json={"ids": ids, "updates": {"is_active": False}},
                          headers=admin_ctx["h"], timeout=15)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["modified_count"] == 3

        # Verify via GET
        g = requests.get(f"{BASE}/admin/shop/products/{p1['id']}", headers=admin_ctx["h"], timeout=15)
        if g.status_code == 200:
            assert g.json().get("is_active") is False
        # cleanup
        r = requests.post(f"{BASE}/admin/shop/products/bulk-delete",
                          json={"ids": ids}, headers=admin_ctx["h"], timeout=15)
        assert r.status_code == 200
        assert r.json()["deleted_count"] == 3

    def test_bulk_patch_disallowed_field_400(self, admin_ctx):
        r = requests.post(f"{BASE}/admin/shop/products/bulk-patch",
                          json={"ids": ["x"], "updates": {"price": 1}},
                          headers=admin_ctx["h"], timeout=15)
        assert r.status_code == 400


# ── REVIEWS / WITHDRAWALS / CREDENTIALS / RENTALS bulk validation ───
class TestValidation:
    def test_reviews_bulk_delete_empty(self, admin_ctx):
        r = requests.post(f"{BASE}/admin/reviews/bulk-delete", json={"ids": []},
                          headers=admin_ctx["h"], timeout=15)
        assert r.status_code == 200
        assert r.json()["deleted_count"] == 0

    def test_withdrawals_invalid_status_400(self, admin_ctx):
        r = requests.post(f"{BASE}/admin/withdrawals/bulk-patch",
                          json={"ids": ["nope"], "status": "reticulated"},
                          headers=admin_ctx["h"], timeout=15)
        assert r.status_code == 400

    def test_withdrawals_valid_status_200(self, admin_ctx):
        r = requests.post(f"{BASE}/admin/withdrawals/bulk-patch",
                          json={"ids": ["nonexistent"], "status": "denied"},
                          headers=admin_ctx["h"], timeout=15)
        assert r.status_code == 200
        d = r.json()
        assert "matched_count" in d and "modified_count" in d

    def test_credentials_bulk_verify_empty(self, admin_ctx):
        r = requests.post(f"{BASE}/admin/credentials/bulk-verify",
                          json={"ids": []}, headers=admin_ctx["h"], timeout=15)
        assert r.status_code == 200
        assert r.json()["modified_count"] == 0

    def test_credentials_bulk_reject_empty(self, admin_ctx):
        r = requests.post(f"{BASE}/admin/credentials/bulk-reject",
                          json={"ids": [], "reason": "n/a"}, headers=admin_ctx["h"], timeout=15)
        assert r.status_code == 200
        assert r.json()["modified_count"] == 0

    def test_rental_bookings_invalid_status_400(self, admin_ctx):
        r = requests.post(f"{BASE}/admin/rental-bookings/bulk-patch",
                          json={"ids": ["x"], "status": "banana"},
                          headers=admin_ctx["h"], timeout=15)
        assert r.status_code == 400

    def test_rental_bookings_valid_status_200(self, admin_ctx):
        for s in ["pending_approval", "approved", "declined", "cancelled", "completed"]:
            r = requests.post(f"{BASE}/admin/rental-bookings/bulk-patch",
                              json={"ids": ["nonexistent"], "status": s},
                              headers=admin_ctx["h"], timeout=15)
            assert r.status_code == 200, f"status {s} → {r.status_code}"

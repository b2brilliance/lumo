"""
Iteration 43 — Admin CRUD for users + unified content.

Covers the new endpoints exposed by /app/backend/admin_crud.py:

  GET    /api/admin/content
  GET    /api/admin/content/types
  PATCH  /api/admin/users/{id}
  DELETE /api/admin/users/{id}
  PATCH  /api/admin/content/{type}/{id}
  DELETE /api/admin/content/{type}/{id}
  POST   /api/admin/content/bulk-delete
"""
import os
import uuid
import pytest
import requests

BASE = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
if not BASE:
    # Fall back to the same URL that /app/frontend/.env exposes at build time.
    with open("/app/frontend/.env") as fh:
        for line in fh:
            if line.startswith("REACT_APP_BACKEND_URL="):
                BASE = line.split("=", 1)[1].strip().rstrip("/")
                break

API = f"{BASE}/api"

ADMIN_EMAIL = "admin@lumo.test"
CUSTOMER_EMAIL = "customer@lumo.test"
PASSWORD = "password123"


# ── auth helpers ──────────────────────────────────────────────────────────────
def _login(email, password=PASSWORD):
    r = requests.post(f"{API}/auth/login", json={"email": email, "password": password}, timeout=15)
    assert r.status_code == 200, f"login failed for {email}: {r.status_code} {r.text}"
    return r.json()["token"], r.json()["user"]


@pytest.fixture(scope="module")
def admin_ctx():
    tok, user = _login(ADMIN_EMAIL)
    return {"token": tok, "user": user, "headers": {"Authorization": f"Bearer {tok}"}}


@pytest.fixture(scope="module")
def customer_ctx():
    tok, user = _login(CUSTOMER_EMAIL)
    return {"token": tok, "user": user, "headers": {"Authorization": f"Bearer {tok}"}}


# ── /admin/content/types ─────────────────────────────────────────────────────
class TestContentTypesMeta:
    def test_types_meta_as_admin(self, admin_ctx):
        r = requests.get(f"{API}/admin/content/types", headers=admin_ctx["headers"], timeout=10)
        assert r.status_code == 200, r.text
        data = r.json()
        assert isinstance(data, list)
        keys = {row["key"] for row in data}
        assert keys == {"listing", "rental", "auto", "inventory", "job"}, keys
        for row in data:
            assert "label" in row and isinstance(row["label"], str)
            assert "editable" in row and isinstance(row["editable"], list)

    def test_types_meta_no_auth_forbidden(self):
        r = requests.get(f"{API}/admin/content/types", timeout=10)
        assert r.status_code in (401, 403), f"unauth got {r.status_code}"

    def test_types_meta_non_admin_forbidden(self, customer_ctx):
        r = requests.get(f"{API}/admin/content/types", headers=customer_ctx["headers"], timeout=10)
        assert r.status_code in (401, 403), f"customer got {r.status_code}"


# ── GET /admin/content ────────────────────────────────────────────────────────
class TestListContent:
    @pytest.mark.parametrize("ctype", ["listing", "rental", "auto", "inventory", "job"])
    def test_list_each_type(self, admin_ctx, ctype):
        r = requests.get(f"{API}/admin/content", params={"type": ctype}, headers=admin_ctx["headers"], timeout=15)
        assert r.status_code == 200, f"{ctype}: {r.status_code} {r.text}"
        data = r.json()
        for k in ("items", "total", "type", "label"):
            assert k in data, f"{ctype} missing key {k}"
        assert data["type"] == ctype
        assert isinstance(data["items"], list)
        assert isinstance(data["total"], int)
        # Each item should have an id + status field at least (title/price may be null on jobs)
        for it in data["items"][:5]:
            assert "id" in it

    def test_list_bad_type(self, admin_ctx):
        r = requests.get(f"{API}/admin/content", params={"type": "banana"}, headers=admin_ctx["headers"], timeout=10)
        assert r.status_code == 400


# ── PATCH /admin/users/{id} ───────────────────────────────────────────────────
class TestUserPatch:
    def test_patch_user_and_revert(self, admin_ctx):
        # Pick a non-admin user
        r = requests.get(f"{API}/admin/users", params={"role": "customer", "limit": "5"}, headers=admin_ctx["headers"], timeout=10)
        assert r.status_code == 200, r.text
        items = r.json().get("items") or r.json().get("users") or []
        assert items, "no customer users to test with"
        target = items[0]
        original_name = target.get("name") or ""
        original_wallet = float(target.get("wallet_balance") or 0)

        # PATCH
        patch = {"name": "ADMIN_CRUD_TEST_Rename", "wallet_balance": 42.50}
        r = requests.patch(f"{API}/admin/users/{target['id']}", json=patch, headers=admin_ctx["headers"], timeout=15)
        assert r.status_code == 200, r.text
        body = r.json()
        assert body.get("ok") is True
        u = body["user"]
        assert u["name"] == "ADMIN_CRUD_TEST_Rename"
        assert float(u["wallet_balance"]) == pytest.approx(42.50)

        # Revert
        rev = {"name": original_name, "wallet_balance": original_wallet}
        r = requests.patch(f"{API}/admin/users/{target['id']}", json=rev, headers=admin_ctx["headers"], timeout=15)
        assert r.status_code == 200

    def test_patch_invalid_role(self, admin_ctx):
        r = requests.get(f"{API}/admin/users", params={"role": "customer", "limit": "1"}, headers=admin_ctx["headers"], timeout=10)
        items = r.json().get("items") or r.json().get("users") or []
        target = items[0]
        r = requests.patch(f"{API}/admin/users/{target['id']}", json={"role": "hacker"}, headers=admin_ctx["headers"], timeout=10)
        assert r.status_code == 400, f"expected 400 got {r.status_code} {r.text}"


# ── DELETE /admin/users/{id} ──────────────────────────────────────────────────
class TestUserDelete:
    def test_delete_throwaway_user(self, admin_ctx):
        email = f"test_admin_crud_delete_{uuid.uuid4().hex[:10]}@lumo.test"
        # Register
        r = requests.post(f"{API}/auth/register", json={
            "email": email, "password": PASSWORD, "name": "ADMIN_CRUD_TEST_Delete", "role": "customer"
        }, timeout=15)
        assert r.status_code in (200, 201), f"register failed: {r.status_code} {r.text}"
        user_id = r.json()["user"]["id"]

        # Delete
        r = requests.delete(f"{API}/admin/users/{user_id}", headers=admin_ctx["headers"], timeout=15)
        assert r.status_code == 200, r.text
        assert r.json().get("ok") is True

        # Verify no match
        r = requests.get(f"{API}/admin/users", params={"q": email}, headers=admin_ctx["headers"], timeout=10)
        items = r.json().get("items") or r.json().get("users") or []
        assert not any(u.get("email") == email for u in items), "deleted user still returned by search"

    def test_delete_own_admin_forbidden(self, admin_ctx):
        me = admin_ctx["user"]["id"]
        r = requests.delete(f"{API}/admin/users/{me}", headers=admin_ctx["headers"], timeout=10)
        assert r.status_code == 400, f"expected 400 got {r.status_code} {r.text}"
        assert "own" in r.text.lower() or "admin" in r.text.lower()


# ── PATCH /admin/content/listing/{id} ─────────────────────────────────────────
class TestContentPatch:
    def _pick_listing(self, admin_ctx):
        r = requests.get(f"{API}/admin/content", params={"type": "listing", "limit": "5"},
                         headers=admin_ctx["headers"], timeout=10)
        items = r.json().get("items") or []
        assert items, "no listings to patch"
        return items[0]

    def test_patch_listing_and_revert(self, admin_ctx):
        target = self._pick_listing(admin_ctx)
        orig = {"title": target.get("title"), "price": target.get("price")}

        r = requests.patch(
            f"{API}/admin/content/listing/{target['id']}",
            json={"updates": {"title": "ADMIN_CRUD_TEST_RENAMED", "price": 99.99}},
            headers=admin_ctx["headers"], timeout=15,
        )
        assert r.status_code == 200, r.text
        body = r.json()
        assert body.get("ok") is True
        assert body["item"]["title"] == "ADMIN_CRUD_TEST_RENAMED"
        assert float(body["item"]["price"]) == pytest.approx(99.99)

        # Verify search finds it
        r = requests.get(f"{API}/admin/content", params={"type": "listing", "q": "ADMIN_CRUD_TEST_RENAMED"},
                         headers=admin_ctx["headers"], timeout=10)
        assert r.status_code == 200
        assert any(it["id"] == target["id"] for it in r.json()["items"])

        # Revert
        rev = {"updates": {"title": orig["title"], "price": orig["price"]}}
        r = requests.patch(f"{API}/admin/content/listing/{target['id']}", json=rev,
                           headers=admin_ctx["headers"], timeout=10)
        assert r.status_code == 200

    def test_patch_non_editable_field(self, admin_ctx):
        target = self._pick_listing(admin_ctx)
        r = requests.patch(
            f"{API}/admin/content/listing/{target['id']}",
            json={"updates": {"seller_id": "hacker-id"}},
            headers=admin_ctx["headers"], timeout=10,
        )
        assert r.status_code == 400, f"got {r.status_code} {r.text}"
        assert "no editable" in r.text.lower() or "editable" in r.text.lower()


# ── DELETE /admin/content/listing/{id} + bulk-delete ─────────────────────────
class TestContentDelete:
    def _create_listing(self, customer_ctx, title):
        r = requests.post(
            f"{API}/marketplace/listings",
            json={
                "title": title,
                "description": "test throwaway",
                "price": 5.00,
                "category": "misc",
            },
            headers=customer_ctx["headers"], timeout=15,
        )
        assert r.status_code in (200, 201), f"listing create failed: {r.status_code} {r.text}"
        data = r.json()
        return data.get("id") or data.get("listing", {}).get("id") or data.get("item", {}).get("id")

    def test_delete_single_listing(self, admin_ctx, customer_ctx):
        title = f"ADMIN_CRUD_TEST_Del_{uuid.uuid4().hex[:8]}"
        listing_id = self._create_listing(customer_ctx, title)
        assert listing_id

        # count before
        r = requests.get(f"{API}/admin/content", params={"type": "listing", "limit": "1"},
                         headers=admin_ctx["headers"], timeout=10)
        total_before = r.json()["total"]

        r = requests.delete(f"{API}/admin/content/listing/{listing_id}",
                            headers=admin_ctx["headers"], timeout=10)
        assert r.status_code == 200, r.text
        body = r.json()
        assert body.get("deleted") == listing_id or body.get("ok") is True

        # count after
        r = requests.get(f"{API}/admin/content", params={"type": "listing", "limit": "1"},
                         headers=admin_ctx["headers"], timeout=10)
        total_after = r.json()["total"]
        assert total_after == total_before - 1, f"total {total_before} -> {total_after}"

    def test_bulk_delete_three(self, admin_ctx, customer_ctx):
        ids = []
        for _ in range(3):
            ids.append(self._create_listing(customer_ctx, f"ADMIN_CRUD_TEST_Bulk_{uuid.uuid4().hex[:6]}"))
        r = requests.post(
            f"{API}/admin/content/bulk-delete",
            json={"type": "listing", "ids": ids},
            headers=admin_ctx["headers"], timeout=15,
        )
        assert r.status_code == 200, r.text
        body = r.json()
        assert body.get("deleted_count") == 3, body

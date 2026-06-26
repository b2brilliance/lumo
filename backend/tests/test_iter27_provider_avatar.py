"""Iter 27 — Provider avatar gating + public anonymous avatar upload endpoint."""
import io
import os
import uuid

import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://lumo-bundle-checkout.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"

# 1x1 transparent PNG bytes (valid PNG header so PIL/content sniffers are happy if needed)
PNG_BYTES = (
    b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR"
    b"\x00\x00\x00\x01\x00\x00\x00\x01\x08\x06\x00\x00\x00\x1f\x15\xc4\x89"
    b"\x00\x00\x00\rIDATx\x9cc\xfa\xcf\x00\x00\x00\x03\x00\x01\xae'g{"
    b"\x00\x00\x00\x00IEND\xaeB`\x82"
)


def _unique_email(prefix: str) -> str:
    return f"TEST_iter27_{prefix}_{uuid.uuid4().hex[:8]}@lumo.test"


# ─────────────────────────── Avatar upload endpoint ───────────────────────────
class TestPublicAvatarUpload:
    def test_upload_image_returns_media_url(self):
        files = {"file": ("a.png", PNG_BYTES, "image/png")}
        r = requests.post(f"{API}/media/upload-avatar", files=files, timeout=30)
        assert r.status_code == 200, r.text
        data = r.json()
        assert "media_url" in data and data["media_url"].startswith("/api/media/")
        assert data["media_type"] == "image/png"
        assert isinstance(data["id"], str) and len(data["id"]) > 0

        # GET should serve back the bytes
        get_r = requests.get(f"{BASE_URL}{data['media_url']}", timeout=30)
        assert get_r.status_code == 200
        assert get_r.content == PNG_BYTES

    def test_upload_rejects_non_image(self):
        files = {"file": ("note.txt", b"hello world", "text/plain")}
        r = requests.post(f"{API}/media/upload-avatar", files=files, timeout=30)
        assert r.status_code == 400, r.text
        assert "image" in r.text.lower()

    def test_upload_rejects_oversize(self):
        big = b"A" * (5 * 1024 * 1024 + 1000)  # >5MB
        files = {"file": ("big.png", big, "image/png")}
        r = requests.post(f"{API}/media/upload-avatar", files=files, timeout=60)
        assert r.status_code == 413, r.text

    def test_upload_no_auth_header_required(self):
        """Even if someone sends a bogus auth header it should still succeed (endpoint is public)."""
        files = {"file": ("a.png", PNG_BYTES, "image/png")}
        r = requests.post(
            f"{API}/media/upload-avatar",
            files=files,
            headers={"Authorization": "Bearer bogus"},
            timeout=30,
        )
        assert r.status_code == 200, r.text


# ─────────────────────────── Provider registration gating ───────────────────────────
class TestProviderRegistrationGating:
    def test_provider_register_without_avatar_returns_400(self):
        r = requests.post(
            f"{API}/auth/register",
            json={
                "email": _unique_email("prov_noavatar"),
                "password": "password123",
                "name": "No Avatar Provider",
                "role": "provider",
            },
            timeout=30,
        )
        assert r.status_code == 400, r.text
        assert "Profile photo is required" in r.json().get("detail", "")

    def test_provider_register_with_avatar_succeeds(self):
        # 1) upload anonymously
        files = {"file": ("a.png", PNG_BYTES, "image/png")}
        up = requests.post(f"{API}/media/upload-avatar", files=files, timeout=30)
        assert up.status_code == 200
        media_url = up.json()["media_url"]

        # 2) register
        email = _unique_email("prov_ok")
        r = requests.post(
            f"{API}/auth/register",
            json={
                "email": email,
                "password": "password123",
                "name": "Avatar Provider",
                "role": "provider",
                "avatar_url": media_url,
            },
            timeout=30,
        )
        assert r.status_code == 200, r.text
        data = r.json()
        assert "token" in data and isinstance(data["token"], str) and data["token"]
        assert data["user"]["email"] == email.lower()
        assert data["user"]["role"] == "provider"
        assert data["user"]["avatar_url"] == media_url

        # 3) /auth/me echoes the same avatar_url
        me = requests.get(
            f"{API}/auth/me",
            headers={"Authorization": f"Bearer {data['token']}"},
            timeout=30,
        )
        assert me.status_code == 200, me.text
        assert me.json()["avatar_url"] == media_url

    @pytest.mark.parametrize("role", ["customer", "retailer", "restaurant"])
    def test_non_provider_register_without_avatar_succeeds(self, role):
        email = _unique_email(role)
        r = requests.post(
            f"{API}/auth/register",
            json={
                "email": email,
                "password": "password123",
                "name": f"No Avatar {role}",
                "role": role,
            },
            timeout=30,
        )
        assert r.status_code == 200, r.text
        u = r.json()["user"]
        assert u["role"] == role
        assert u.get("avatar_url") is None


# ─────────────────────────── PATCH /auth/me semantics ───────────────────────────
class TestPatchMeAvatar:
    @pytest.fixture
    def provider_token(self):
        r = requests.post(
            f"{API}/auth/login",
            json={"email": "provider@lumo.test", "password": "password123"},
            timeout=30,
        )
        assert r.status_code == 200, r.text
        return r.json()["token"], r.json()["user"]

    def test_patch_without_avatar_field_does_not_clear(self, provider_token):
        token, user = provider_token
        headers = {"Authorization": f"Bearer {token}"}
        # First set an avatar
        files = {"file": ("a.png", PNG_BYTES, "image/png")}
        up = requests.post(f"{API}/media/upload-avatar", files=files, timeout=30)
        media_url = up.json()["media_url"]
        set_r = requests.patch(f"{API}/auth/me", json={"avatar_url": media_url}, headers=headers, timeout=30)
        assert set_r.status_code == 200
        assert set_r.json()["avatar_url"] == media_url
        try:
            # PATCH with unrelated field — avatar_url should remain
            p = requests.patch(f"{API}/auth/me", json={"name": user["name"]}, headers=headers, timeout=30)
            assert p.status_code == 200
            assert p.json().get("avatar_url") == media_url
        finally:
            # RESTORE — clear avatar so seeded provider stays clean
            clear = requests.patch(f"{API}/auth/me", json={"avatar_url": None}, headers=headers, timeout=30)
            assert clear.status_code == 200

    def test_patch_with_avatar_null_clears(self, provider_token):
        token, _ = provider_token
        headers = {"Authorization": f"Bearer {token}"}
        files = {"file": ("a.png", PNG_BYTES, "image/png")}
        up = requests.post(f"{API}/media/upload-avatar", files=files, timeout=30)
        media_url = up.json()["media_url"]
        try:
            requests.patch(f"{API}/auth/me", json={"avatar_url": media_url}, headers=headers, timeout=30)
            p = requests.patch(f"{API}/auth/me", json={"avatar_url": None}, headers=headers, timeout=30)
            assert p.status_code == 200
            assert p.json().get("avatar_url") in (None, "")
        finally:
            # Ensure final state is cleared
            requests.patch(f"{API}/auth/me", json={"avatar_url": None}, headers=headers, timeout=30)


# ─────────────────────────── Regression — seeded users login ───────────────────────────
@pytest.mark.parametrize("email", ["customer@lumo.test", "provider@lumo.test", "admin@lumo.test"])
def test_seeded_users_login(email):
    r = requests.post(f"{API}/auth/login", json={"email": email, "password": "password123"}, timeout=30)
    assert r.status_code == 200, r.text
    assert "token" in r.json()

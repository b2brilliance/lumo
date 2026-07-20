"""Iteration 44 — Provider signup dropdown + dynamic qualifications tests.

Covers:
  • POST /api/media/upload-provider-doc — accepts image JPG (no auth) ✓
  • POST /api/media/upload-provider-doc — rejects text/plain (400) ✗
  • POST /api/media/upload-provider-doc — accepts application/pdf ✓
  • POST /api/auth/register (role=provider) — persists primary_category + qualifications
  • Regression: POST /api/auth/register (role=customer) still works
"""

import io
import os
import uuid

import pytest
import requests
from dotenv import load_dotenv

load_dotenv("/app/frontend/.env")
BASE_URL = os.environ["REACT_APP_BACKEND_URL"].rstrip("/")
API = f"{BASE_URL}/api"


# ── Fixtures ──────────────────────────────────────────────────────────────
@pytest.fixture
def api_client():
    s = requests.Session()
    return s


def _tiny_jpg_bytes():
    """Smallest valid JPEG header + EOI marker."""
    # A minimal 1x1 white JPEG — 125 bytes.
    return bytes.fromhex(
        "ffd8ffe000104a46494600010100000100010000ffdb004300080606070605080707"
        "07090908 0a0c140d0c0b0b0c1912130f141d1a1f1e1d1a1c1c20242e2720222c231c"
        "1c2837292c30313434341f27393d38323c2e333432ffdb0043010909090c0b0c180d"
        "0d1832211c213232323232323232323232323232323232323232323232323232323232"
        "3232323232323232323232323232323232323232323232ffc00011080001000103012200"
        "021101031101ffc4001f0000010501010101010100000000000000000102030405060708"
        "090a0bffc400b5100002010303020403050504040000017d01020300041105122131410613"
        "516107227114328191a1082342b1c11552d1f02433627282090a161718191a25262728292a"
        "3435363738393a434445464748494a535455565758595a636465666768696a737475767778"
        "797a838485868788898a92939495969798999aa2a3a4a5a6a7a8a9aab2b3b4b5b6b7b8b9ba"
        "c2c3c4c5c6c7c8c9cad2d3d4d5d6d7d8d9dae1e2e3e4e5e6e7e8e9eaf1f2f3f4f5f6f7f8f9"
        "faffc4001f0100030101010101010101010000000000000102030405060708090a0bffc400"
        "b51100020102040403040705040400010277000102031104052131061241510761711322328"
        "108144291a1b1c109233352f0156272d10a162434e125f11718191a262728292a35363738393a"
        "434445464748494a535455565758595a636465666768696a737475767778797a82838485868788"
        "898a92939495969798999aa2a3a4a5a6a7a8a9aab2b3b4b5b6b7b8b9bac2c3c4c5c6c7c8c9cad2"
        "d3d4d5d6d7d8d9dae2e3e4e5e6e7e8e9eaf2f3f4f5f6f7f8f9faffda000c03010002110311003f"
        "00fbe7ffd9".replace(" ", "")
    )


def _tiny_pdf_bytes():
    """Minimal valid-ish PDF (%PDF-1.4 + %%EOF)."""
    return b"%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n"


# ── Upload endpoint tests ─────────────────────────────────────────────────
class TestUploadProviderDoc:
    """Public /api/media/upload-provider-doc endpoint."""

    def test_upload_jpg_no_auth(self, api_client):
        files = {"file": ("license.jpg", _tiny_jpg_bytes(), "image/jpeg")}
        r = api_client.post(f"{API}/media/upload-provider-doc", files=files)
        assert r.status_code == 200, f"body={r.text}"
        body = r.json()
        assert "media_url" in body and body["media_url"].startswith("/api/media/")
        assert body["media_type"] == "image/jpeg"
        assert "id" in body and isinstance(body["id"], str) and len(body["id"]) > 0

        # Data persistence: GET the media by media_url
        get_r = api_client.get(f"{BASE_URL}{body['media_url']}")
        assert get_r.status_code == 200
        assert get_r.headers.get("content-type", "").startswith("image/")

    def test_upload_text_file_rejected(self, api_client):
        files = {"file": ("resume.txt", b"just some text", "text/plain")}
        r = api_client.post(f"{API}/media/upload-provider-doc", files=files)
        assert r.status_code == 400
        assert "Only images or PDF" in r.json().get("detail", "")

    def test_upload_pdf_accepted(self, api_client):
        files = {"file": ("consent.pdf", _tiny_pdf_bytes(), "application/pdf")}
        r = api_client.post(f"{API}/media/upload-provider-doc", files=files)
        assert r.status_code == 200
        body = r.json()
        assert body["media_type"] == "application/pdf"
        assert body["media_url"].startswith("/api/media/")


# ── Register endpoint tests ───────────────────────────────────────────────
class TestRegisterWithQualifications:
    """POST /api/auth/register persists primary_category + qualifications."""

    def test_provider_register_with_qualifications(self, api_client):
        # First upload a doc so we have a real media reference
        up = api_client.post(
            f"{API}/media/upload-provider-doc",
            files={"file": ("dl.jpg", _tiny_jpg_bytes(), "image/jpeg")},
        )
        assert up.status_code == 200, up.text
        media = up.json()

        # Also need an avatar (providers require it)
        av = api_client.post(
            f"{API}/media/upload-provider-doc",
            files={"file": ("avatar.jpg", _tiny_jpg_bytes(), "image/jpeg")},
        )
        assert av.status_code == 200
        avatar_url = av.json()["media_url"]

        unique = uuid.uuid4().hex[:8]
        email = f"test_provider_qual_{unique}@lumo.test"
        payload = {
            "email": email,
            "password": "password123",
            "name": "Test Provider Qual",
            "role": "provider",
            "avatar_url": avatar_url,
            "primary_category": "delivery",
            "categories": ["delivery"],
            "employment_types": ["on_demand"],
            "qualifications": {
                "delivery": {
                    "answers": {"vehicle_type": "car", "years_driving": "3-5"},
                    "documents": {
                        "drivers_license": {
                            "media_url": media["media_url"],
                            "id": media["id"],
                        }
                    },
                }
            },
        }
        r = api_client.post(f"{API}/auth/register", json=payload)
        assert r.status_code == 200, f"register failed: {r.status_code} {r.text}"
        data = r.json()
        assert "token" in data and "user" in data
        token = data["token"]
        assert data["user"]["email"] == email
        # Response should surface the persisted qualifications
        u = data["user"]
        assert u.get("primary_category") == "delivery"

        # GET /api/auth/me confirms persistence
        me = api_client.get(f"{API}/auth/me", headers={"Authorization": f"Bearer {token}"})
        assert me.status_code == 200
        me_user = me.json()
        assert me_user["primary_category"] == "delivery"
        assert me_user["qualifications"]["delivery"]["answers"]["vehicle_type"] == "car"
        assert me_user["qualifications"]["delivery"]["answers"]["years_driving"] == "3-5"
        assert (
            me_user["qualifications"]["delivery"]["documents"]["drivers_license"]["id"]
            == media["id"]
        )

    def test_customer_register_regression_no_qualifications(self, api_client):
        """Regression: customer signup still works without primary_category/quals."""
        unique = uuid.uuid4().hex[:8]
        email = f"test_customer_reg_{unique}@lumo.test"
        r = api_client.post(
            f"{API}/auth/register",
            json={
                "email": email,
                "password": "password123",
                "name": "Test Customer",
                "role": "customer",
            },
        )
        assert r.status_code == 200, f"customer register failed: {r.text}"
        data = r.json()
        assert data["user"]["email"] == email
        assert data["user"]["role"] == "customer"
        token = data["token"]

        # GET /api/auth/me — customer doesn't have qualifications set (empty dict OK)
        me = api_client.get(
            f"{API}/auth/me", headers={"Authorization": f"Bearer {token}"}
        )
        assert me.status_code == 200
        me_user = me.json()
        # primary_category should be None / missing / empty
        assert not me_user.get("primary_category")
        # qualifications either missing or empty
        assert not me_user.get("qualifications")

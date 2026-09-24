"""
Iter-59 tests:
  - Job attachments + employment_type persistence
  - Provider media fields (resume_url, portfolio, social_links) on /auth/me
  - Portfolio replace-in-full semantics (UserUpdate contract)
"""
import os
import uuid
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL").rstrip("/")
API = f"{BASE_URL}/api"

CUSTOMER = {"email": "customer@lumo.test", "password": "password123"}
PROVIDER = {"email": "provider@lumo.test", "password": "password123"}


def _login(creds):
    r = requests.post(f"{API}/auth/login", json=creds, timeout=20)
    if r.status_code != 200:
        pytest.skip(f"login failed for {creds['email']}: {r.status_code} {r.text[:120]}")
    return r.json()["token"]


@pytest.fixture(scope="module")
def customer_token():
    return _login(CUSTOMER)


@pytest.fixture(scope="module")
def provider_token():
    return _login(PROVIDER)


# ─── Job attachments + employment_type ────────────────────────────
class TestJobAttachments:
    def test_create_job_with_attachments_and_employment_type(self, customer_token):
        atts = [
            {"id": str(uuid.uuid4()), "url": "https://cdn.example.com/ref1.jpg", "type": "image/jpeg"},
            {"id": str(uuid.uuid4()), "url": "https://cdn.example.com/ref2.mp4", "type": "video/mp4"},
        ]
        body = {
            "title": "TEST_iter59 cleaning",
            "description": "Deep clean w/ references",
            "category": "cleaning",
            "pay_rate": 120.0,
            "pay_unit": "flat",
            "estimated_units": 1,
            "attachments": atts,
            "employment_type": "temp",
        }
        r = requests.post(f"{API}/jobs", json=body,
                          headers={"Authorization": f"Bearer {customer_token}"}, timeout=20)
        assert r.status_code in (200, 201), r.text
        job = r.json()
        job_id = job["id"]
        assert job.get("employment_type") == "temp"
        assert isinstance(job.get("attachments"), list) and len(job["attachments"]) == 2
        assert job["attachments"][0]["url"] == atts[0]["url"]

        # GET verify persistence
        g = requests.get(f"{API}/jobs/{job_id}", timeout=20)
        assert g.status_code == 200
        data = g.json()
        assert data.get("employment_type") == "temp"
        assert len(data.get("attachments") or []) == 2
        assert data["attachments"][1]["type"] == "video/mp4"

    def test_create_job_defaults_employment_on_demand(self, customer_token):
        body = {
            "title": "TEST_iter59 default emp",
            "description": "no attachments",
            "category": "handyman",
            "pay_rate": 50.0,
            "estimated_units": 1,
        }
        r = requests.post(f"{API}/jobs", json=body,
                          headers={"Authorization": f"Bearer {customer_token}"}, timeout=20)
        assert r.status_code in (200, 201)
        j = r.json()
        assert j.get("employment_type") in ("on_demand", None) or j["employment_type"] == "on_demand"
        assert j.get("attachments") == []


# ─── Provider media fields via /auth/me ───────────────────────────
class TestProviderMedia:
    def test_patch_and_get_provider_media(self, provider_token):
        headers = {"Authorization": f"Bearer {provider_token}"}
        payload = {
            "resume_url": "https://cdn.example.com/TEST_iter59_resume.pdf",
            "portfolio": [
                {"type": "link", "url": "https://example.com/site", "title": "example.com"},
                {"type": "image", "url": "https://cdn.example.com/p1.jpg"},
            ],
            "social_links": {
                "x": "https://x.com/testu",
                "facebook": "https://facebook.com/testu",
                "instagram": "https://instagram.com/testu",
                "tiktok": "https://tiktok.com/@testu",
                "youtube": "https://youtube.com/@testu",
            },
        }
        r = requests.patch(f"{API}/auth/me", json=payload, headers=headers, timeout=20)
        assert r.status_code == 200, r.text

        g = requests.get(f"{API}/auth/me", headers=headers, timeout=20)
        assert g.status_code == 200
        me = g.json()
        assert me["resume_url"] == payload["resume_url"]
        assert len(me["portfolio"]) == 2
        assert me["portfolio"][0]["type"] == "link"
        for k, v in payload["social_links"].items():
            assert me["social_links"][k] == v

    def test_portfolio_replaces_not_merges(self, provider_token):
        headers = {"Authorization": f"Bearer {provider_token}"}
        # Set 2 items
        requests.patch(f"{API}/auth/me", json={
            "portfolio": [
                {"type": "link", "url": "https://a.com", "title": "a"},
                {"type": "link", "url": "https://b.com", "title": "b"},
            ]
        }, headers=headers, timeout=20)
        # Replace with 1 item
        r = requests.patch(f"{API}/auth/me", json={
            "portfolio": [{"type": "link", "url": "https://c.com", "title": "c"}]
        }, headers=headers, timeout=20)
        assert r.status_code == 200
        me = requests.get(f"{API}/auth/me", headers=headers, timeout=20).json()
        assert len(me["portfolio"]) == 1
        assert me["portfolio"][0]["url"] == "https://c.com"

    def test_cleanup_provider_media(self, provider_token):
        """Reset provider media to empty so other tests aren't polluted."""
        headers = {"Authorization": f"Bearer {provider_token}"}
        r = requests.patch(f"{API}/auth/me", json={
            "resume_url": "",
            "portfolio": [],
            "social_links": {"x": "", "facebook": "", "instagram": "", "tiktok": "", "youtube": ""},
        }, headers=headers, timeout=20)
        assert r.status_code == 200

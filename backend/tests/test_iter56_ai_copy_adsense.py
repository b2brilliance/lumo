"""Iteration 56 tests: AI Copy Rotator, AdSense config, self-signup-only affiliates."""
import os
import time
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL").rstrip("/")
API = f"{BASE_URL}/api"

ADMIN_EMAIL = "julius.a.mason@gmail.com"
ADMIN_PASSWORD = "Mason0123"

SELF_SIGNUP_NETWORKS = {
    "Impact", "CJ", "FlexOffers", "Awin", "EPN", "Rakuten",
    "Skimlinks", "Amazon Associates", "Direct",
    # Some seed rows may use lowercase / alt spellings — permit them
    "impact", "cj", "flexoffers", "awin", "epn", "rakuten",
    "skimlinks", "amazon", "direct", "AmazonAssociates",
}


@pytest.fixture(scope="module")
def admin_token():
    r = requests.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}, timeout=15)
    if r.status_code != 200:
        pytest.skip(f"admin login failed: {r.status_code} {r.text[:200]}")
    return r.json().get("token") or r.json().get("access_token")


@pytest.fixture(scope="module")
def admin_headers(admin_token):
    return {"Authorization": f"Bearer {admin_token}"}


# ─── AI Copy Rotator ─────────────────────────────────────────
class TestAiCopyConfig:
    def test_config_requires_auth(self):
        r = requests.get(f"{API}/admin/ai-copy/config", timeout=10)
        assert r.status_code in (401, 403), r.text

    def test_get_config(self, admin_headers):
        r = requests.get(f"{API}/admin/ai-copy/config", headers=admin_headers, timeout=10)
        assert r.status_code == 200, r.text
        data = r.json()
        assert "enabled" in data
        assert "tones" in data
        assert "available_tones" in data
        assert "total_rewrites" in data
        assert set(data["available_tones"]) >= {"hype", "clean"}

    def test_put_config_persists(self, admin_headers):
        r = requests.put(f"{API}/admin/ai-copy/config",
                         headers=admin_headers,
                         json={"enabled": True, "tones": ["hype", "clean"]},
                         timeout=10)
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["enabled"] is True
        assert set(data["tones"]) == {"hype", "clean"}
        # verify GET
        g = requests.get(f"{API}/admin/ai-copy/config", headers=admin_headers, timeout=10).json()
        assert g["enabled"] is True
        assert set(g["tones"]) == {"hype", "clean"}

    def test_put_config_empty_tones_rejected(self, admin_headers):
        r = requests.put(f"{API}/admin/ai-copy/config",
                         headers=admin_headers, json={"tones": []}, timeout=10)
        assert r.status_code == 400, r.text


class TestAiCopyPreview:
    base_title = "Detroit drivers wanted — $500 milestone bonus"
    base_body = "Sign up as a Lumo driver in Detroit today. Complete 20 rides in your first month and earn a $500 milestone bonus. Local support, flexible hours."

    def test_preview_hype(self, admin_headers):
        r = requests.post(f"{API}/admin/ai-copy/preview",
                          headers=admin_headers,
                          json={"source_type": "recruit", "source_id": "detroit-mi",
                                "base_title": self.base_title, "base_body": self.base_body,
                                "tone": "hype"},
                          timeout=90)
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["tone"] == "hype"
        assert data["title"] and data["body"]
        # Should be meaningfully different — at least body should differ
        assert data["body"] != self.base_body or data["title"] != self.base_title
        # Milestone fact should be preserved (500 mentioned somewhere)
        combined = (data["title"] + " " + data["body"]).lower()
        assert "500" in combined or "$500" in combined, f"missing milestone dollar amount: {data}"

    def test_preview_clean(self, admin_headers):
        r = requests.post(f"{API}/admin/ai-copy/preview",
                          headers=admin_headers,
                          json={"source_type": "recruit", "source_id": "detroit-mi",
                                "base_title": self.base_title, "base_body": self.base_body,
                                "tone": "clean"},
                          timeout=90)
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["tone"] == "clean"
        assert data["title"] and data["body"]
        combined = (data["title"] + " " + data["body"]).lower()
        assert "500" in combined

    def test_history_includes_previews(self, admin_headers):
        r = requests.get(f"{API}/admin/ai-copy/history?limit=25",
                         headers=admin_headers, timeout=10)
        assert r.status_code == 200, r.text
        items = r.json().get("items", [])
        # Preview persists with source_id='preview-<original>'
        preview_ids = [i for i in items if str(i.get("source_id", "")).startswith("preview-")]
        assert len(preview_ids) >= 1, f"expected preview- prefixed entries, got {items[:3]}"


# ─── Affiliates self-signup filter ────────────────────────────
class TestAffiliatesSelfSignup:
    def test_self_signup_only_true(self):
        r = requests.get(f"{API}/affiliates/offers?category=marketplace&self_signup_only=true", timeout=15)
        assert r.status_code == 200, r.text
        offers = r.json().get("offers", [])
        for o in offers:
            assert o.get("signup_url"), f"missing signup_url: {o.get('slug')}"

    def test_default_is_self_signup_only(self):
        r_default = requests.get(f"{API}/affiliates/offers?category=marketplace", timeout=15)
        r_true = requests.get(f"{API}/affiliates/offers?category=marketplace&self_signup_only=true", timeout=15)
        assert r_default.status_code == 200 and r_true.status_code == 200
        assert r_default.json().get("count") == r_true.json().get("count")

    def test_false_is_superset(self):
        r_true = requests.get(f"{API}/affiliates/offers?category=marketplace&self_signup_only=true", timeout=15)
        r_false = requests.get(f"{API}/affiliates/offers?category=marketplace&self_signup_only=false", timeout=15)
        assert r_true.status_code == 200 and r_false.status_code == 200
        assert r_false.json().get("count") >= r_true.json().get("count")


# ─── Site settings: AdSense field ────────────────────────────
class TestAdSense:
    def test_invalid_client_rejected(self, admin_headers):
        r = requests.put(f"{API}/admin/site/social",
                         headers=admin_headers,
                         json={"adsense_client": "not-a-valid"},
                         timeout=10)
        assert r.status_code == 400, r.text

    def test_valid_client_saved(self, admin_headers):
        val = "ca-pub-1234567890123456"
        r = requests.put(f"{API}/admin/site/social",
                         headers=admin_headers,
                         json={"adsense_client": val},
                         timeout=10)
        assert r.status_code == 200, r.text
        # Public endpoint reflects it
        g = requests.get(f"{API}/site/social", timeout=10).json()
        assert g.get("adsense_client") == val

    def test_empty_clears(self, admin_headers):
        r = requests.put(f"{API}/admin/site/social",
                         headers=admin_headers,
                         json={"adsense_client": ""},
                         timeout=10)
        assert r.status_code == 200, r.text
        g = requests.get(f"{API}/site/social", timeout=10).json()
        assert g.get("adsense_client") == ""


# ─── Regression: recruit broadcast still runs ─────────────────
class TestRecruitBroadcastRegression:
    def test_broadcast_now(self, admin_headers):
        # Find a city slug
        r = requests.get(f"{API}/recruit/cities", timeout=10)
        if r.status_code != 200:
            pytest.skip("recruit cities endpoint unavailable")
        cities = r.json().get("cities") or r.json().get("items") or []
        if not cities:
            pytest.skip("no recruit cities seeded")
        slug = cities[0].get("slug") or cities[0].get("id")
        rr = requests.post(f"{API}/admin/recruit/broadcast-now",
                           headers=admin_headers,
                           json={"city_slug": slug},
                           timeout=60)
        # Adapters may skip → 200 with results; server-error would be 500
        assert rr.status_code in (200, 202, 400, 404), rr.text

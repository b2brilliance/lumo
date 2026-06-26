"""Iter 20 — Site social media links (public GET + admin PUT)."""
import os
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL").rstrip("/")
API = f"{BASE_URL}/api"

DEFAULT_PLATFORMS = {
    "instagram", "tiktok", "youtube", "facebook", "twitter", "threads",
    "linkedin", "pinterest", "snapchat", "discord", "reddit", "whatsapp",
    "telegram", "twitch",
}


def _login(email, password):
    r = requests.post(f"{API}/auth/login", json={"email": email, "password": password}, timeout=30)
    assert r.status_code == 200, f"login failed for {email}: {r.text}"
    return r.json()["token"]


@pytest.fixture(scope="module")
def admin_headers():
    t = _login("admin@lumo.test", "password123")
    return {"Authorization": f"Bearer {t}", "Content-Type": "application/json"}


@pytest.fixture(scope="module")
def provider_headers():
    t = _login("provider@lumo.test", "password123")
    return {"Authorization": f"Bearer {t}", "Content-Type": "application/json"}


@pytest.fixture(autouse=True)
def _clear_links(admin_headers):
    # Reset all links to empty before each test for predictable assertions
    body = {"links": {p: "" for p in DEFAULT_PLATFORMS}}
    requests.put(f"{API}/admin/site/social", json=body, headers=admin_headers, timeout=30)
    yield
    # cleanup again
    requests.put(f"{API}/admin/site/social", json=body, headers=admin_headers, timeout=30)


# ── Public GET ────────────────────────────────────────────────────────────
class TestPublicGet:
    def test_public_get_no_auth(self):
        r = requests.get(f"{API}/site/social", timeout=30)
        assert r.status_code == 200, r.text
        d = r.json()
        assert "links" in d and isinstance(d["links"], dict)
        assert "tagline" in d
        assert "platforms_supported" in d
        assert set(d["platforms_supported"]) == DEFAULT_PLATFORMS
        assert len(d["platforms_supported"]) == 14
        assert "updated_at" in d

    def test_public_filters_empty(self):
        r = requests.get(f"{API}/site/social", timeout=30)
        for _, url in r.json()["links"].items():
            assert url, "public GET must filter out empty URLs"


# ── Admin PUT ────────────────────────────────────────────────────────────
class TestAdminPut:
    def test_auto_prefix_https(self, admin_headers):
        r = requests.put(f"{API}/admin/site/social",
                         json={"links": {"instagram": "instagram.com/lumo"}},
                         headers=admin_headers, timeout=30)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["links"]["instagram"] == "https://instagram.com/lumo"

        # GET-verify (admin)
        g = requests.get(f"{API}/admin/site/social", headers=admin_headers, timeout=30)
        assert g.json()["links"]["instagram"] == "https://instagram.com/lumo"

        # Public GET also reflects it
        p = requests.get(f"{API}/site/social", timeout=30)
        assert p.json()["links"]["instagram"] == "https://instagram.com/lumo"

    def test_clear_url(self, admin_headers):
        # set then clear
        requests.put(f"{API}/admin/site/social",
                     json={"links": {"instagram": "https://instagram.com/x"}},
                     headers=admin_headers, timeout=30)
        r = requests.put(f"{API}/admin/site/social",
                         json={"links": {"instagram": ""}},
                         headers=admin_headers, timeout=30)
        assert r.status_code == 200
        assert r.json()["links"]["instagram"] == ""
        # public GET should no longer include it
        p = requests.get(f"{API}/site/social", timeout=30).json()
        assert "instagram" not in p["links"]

    def test_tagline_only_update(self, admin_headers):
        # First set a link so we can verify it isn't touched
        requests.put(f"{API}/admin/site/social",
                     json={"links": {"youtube": "youtube.com/@lumo"}},
                     headers=admin_headers, timeout=30)
        r = requests.put(f"{API}/admin/site/social",
                         json={"tagline": "Brand new tagline TEST"},
                         headers=admin_headers, timeout=30)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["tagline"] == "Brand new tagline TEST"
        assert d["links"]["youtube"] == "https://youtube.com/@lumo", "tagline update must not clobber links"

    def test_unknown_platform_ignored(self, admin_headers):
        r = requests.put(f"{API}/admin/site/social",
                         json={"links": {"myspace": "http://myspace.com/x", "facebook": "facebook.com/lumo"}},
                         headers=admin_headers, timeout=30)
        assert r.status_code == 200
        d = r.json()
        assert "myspace" not in d["links"], "unknown keys must be dropped"
        assert d["links"]["facebook"] == "https://facebook.com/lumo"

        # Confirm admin GET also doesn't have it
        g = requests.get(f"{API}/admin/site/social", headers=admin_headers, timeout=30).json()
        assert "myspace" not in g["links"]

    def test_public_filters_only_nonempty(self, admin_headers):
        requests.put(f"{API}/admin/site/social",
                     json={"links": {"tiktok": "tiktok.com/@lumo", "twitter": ""}},
                     headers=admin_headers, timeout=30)
        p = requests.get(f"{API}/site/social", timeout=30).json()
        assert p["links"].get("tiktok") == "https://tiktok.com/@lumo"
        assert "twitter" not in p["links"]
        # all non-empty keys present should be in DEFAULT_PLATFORMS
        assert set(p["links"].keys()) <= DEFAULT_PLATFORMS


# ── Auth gating ────────────────────────────────────────────────────────────
class TestAuthGating:
    def test_put_without_auth_401(self):
        r = requests.put(f"{API}/admin/site/social",
                         json={"links": {"instagram": "x.com"}}, timeout=30)
        assert r.status_code in (401, 403), f"expected 401/403, got {r.status_code}"

    def test_put_non_admin_403(self, provider_headers):
        r = requests.put(f"{API}/admin/site/social",
                         json={"links": {"instagram": "x.com"}},
                         headers=provider_headers, timeout=30)
        assert r.status_code == 403


# ── Regression ─────────────────────────────────────────────────────────────
class TestRegression:
    def test_analytics_overview_still_works(self, admin_headers):
        r = requests.get(f"{API}/admin/analytics/overview", headers=admin_headers, timeout=30)
        assert r.status_code == 200

    def test_provider_login(self):
        assert _login("provider@lumo.test", "password123")

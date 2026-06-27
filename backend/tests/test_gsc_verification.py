"""
Google Search Console verification routes - URL-prefix property:
  1) HTML meta-tag method on /
  2) HTML-file method on /googleQLpfJ_Vp5XhTC6VRffLMXJKpI3qPAN8mTpjLY6OqUn0.html
Plus sanity checks for / title, /api/health, /sitemap.xml.
"""

import os
import re
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://lumo-bundle-checkout.preview.emergentagent.com").rstrip("/")
GSC_TOKEN = "QLpfJ_Vp5XhTC6VRffLMXJKpI3qPAN8mTpjLY6OqUn0"


@pytest.fixture(scope="module")
def client():
    s = requests.Session()
    s.headers.update({"User-Agent": "GSC-Verification-Tester/1.0"})
    return s


# --- (1) HTML meta-tag method ---
class TestMetaTagVerification:
    def test_root_returns_200_html(self, client):
        r = client.get(f"{BASE_URL}/")
        assert r.status_code == 200
        assert "text/html" in r.headers.get("Content-Type", "").lower()

    def test_root_contains_google_site_verification_meta(self, client):
        r = client.get(f"{BASE_URL}/")
        assert r.status_code == 200
        # match either attribute order: name first or content first
        pattern = re.compile(
            r'<meta\s+[^>]*name=["\']google-site-verification["\'][^>]*content=["\']'
            + re.escape(GSC_TOKEN)
            + r'["\'][^>]*/?>'
            r'|<meta\s+[^>]*content=["\']'
            + re.escape(GSC_TOKEN)
            + r'["\'][^>]*name=["\']google-site-verification["\'][^>]*/?>',
            re.IGNORECASE,
        )
        assert pattern.search(r.text), "google-site-verification meta tag with expected token not found in / HTML"

    def test_root_has_lumo_title(self, client):
        r = client.get(f"{BASE_URL}/")
        assert "<title>" in r.text.lower()
        assert "Lumo" in r.text


# --- (2) HTML-file method ---
class TestHtmlFileVerification:
    FILE_PATH = f"/google{GSC_TOKEN}.html"
    EXPECTED_BODY_LINE = f"google-site-verification: google{GSC_TOKEN}.html"

    def test_html_file_returns_200(self, client):
        r = client.get(f"{BASE_URL}{self.FILE_PATH}")
        assert r.status_code == 200, f"Expected 200 from {self.FILE_PATH}, got {r.status_code}"

    def test_html_file_content_type(self, client):
        r = client.get(f"{BASE_URL}{self.FILE_PATH}")
        ct = r.headers.get("Content-Type", "").lower()
        assert "text/html" in ct, f"Expected text/html content-type, got {ct!r}"

    def test_html_file_body_contains_expected_line(self, client):
        r = client.get(f"{BASE_URL}{self.FILE_PATH}")
        assert self.EXPECTED_BODY_LINE in r.text, (
            f"Expected body to contain '{self.EXPECTED_BODY_LINE}', got: {r.text[:200]!r}"
        )


# --- (3) Sanity / unrelated routes still work ---
class TestSanityRoutes:
    def test_api_health(self, client):
        r = client.get(f"{BASE_URL}/api/health")
        assert r.status_code == 200
        try:
            data = r.json()
            # accept either {"ok": true} or {"status": "ok"}
            assert data.get("ok") is True or data.get("status") in ("ok", "healthy"), data
        except ValueError:
            pytest.fail("/api/health did not return JSON")

    def test_sitemap_xml(self, client):
        r = client.get(f"{BASE_URL}/sitemap.xml")
        assert r.status_code == 200
        ct = r.headers.get("Content-Type", "").lower()
        assert "xml" in ct, f"Expected xml content-type, got {ct!r}"
        assert "<sitemapindex" in r.text
        assert "https://golumo.app/api/sitemap.xml" in r.text

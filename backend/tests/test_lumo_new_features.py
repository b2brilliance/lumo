"""
Tests for Lumo new features in this session:
  - Backend i18n (FX, languages, translate, tax)
  - Per-country + US state tax engine
  - Multi-store cart + cart checkout
  - Reviews & ratings (provider + store) with eligibility gate
  - Country-specific business credentials
  - AI document verification (Claude → Gemini fallback)
"""
import os
import io
import uuid
import time
import base64
import pytest
import requests
from pathlib import Path

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
if not BASE_URL:
    env_file = Path("/app/frontend/.env")
    if env_file.exists():
        for line in env_file.read_text().splitlines():
            if line.startswith("REACT_APP_BACKEND_URL="):
                BASE_URL = line.split("=", 1)[1].strip().rstrip("/")
                break

API = f"{BASE_URL}/api"


# ── Helpers ──────────────────────────────────────────────────────────────────
def _login(email, password="password123"):
    r = requests.post(f"{API}/auth/login", json={"email": email, "password": password}, timeout=15)
    assert r.status_code == 200, f"Login failed for {email}: {r.status_code} {r.text}"
    body = r.json()
    return body.get("access_token") or body.get("token") or body["token"]


def _h(token):
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture(scope="module")
def customer_token():
    return _login("customer@lumo.test")


@pytest.fixture(scope="module")
def provider_token():
    return _login("provider@lumo.test")


@pytest.fixture(scope="module")
def retailer_token():
    return _login("retailer@lumo.test")


def _tiny_png_bytes():
    """A valid 32x32 red PNG."""
    # 1x1 red PNG (minimal valid PNG)
    return base64.b64decode(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg=="
    )


# ─────────────────────────────────────────────────────────────────────────────
# i18n endpoints
# ─────────────────────────────────────────────────────────────────────────────
class TestI18n:
    def test_fx_rates(self):
        r = requests.get(f"{API}/i18n/fx", timeout=15)
        assert r.status_code == 200
        data = r.json()
        assert data.get("base") == "USD"
        rates = data.get("rates") or {}
        for c in ("EUR", "GBP", "INR"):
            assert c in rates, f"missing {c} in FX rates"
            assert isinstance(rates[c], (int, float)) and rates[c] > 0

    def test_languages(self):
        r = requests.get(f"{API}/i18n/languages", timeout=10)
        assert r.status_code == 200
        langs = r.json()
        assert isinstance(langs, list)
        assert len(langs) >= 9
        codes = {l["code"] for l in langs}
        # must include core set
        for c in ("en", "es", "fr", "de", "ja", "hi", "ar", "zh"):
            assert c in codes, f"missing language {c}"

    def test_translate_to_japanese(self):
        body = {"texts": ["Hello", "Welcome to Lumo"], "target_lang": "ja"}
        r = requests.post(f"{API}/i18n/translate", json=body, timeout=60)
        assert r.status_code == 200, r.text
        data = r.json()
        translations = data.get("translations")
        assert isinstance(translations, dict)
        # Each input should map to a non-empty translation distinct from English ideally
        for src in body["texts"]:
            assert src in translations
            assert isinstance(translations[src], str)
            assert len(translations[src]) > 0


# ─────────────────────────────────────────────────────────────────────────────
# Tax engine: per-country + US per-state
# ─────────────────────────────────────────────────────────────────────────────
class TestTax:
    def test_gb_vat(self):
        r = requests.get(f"{API}/i18n/tax", params={"country": "GB"}, timeout=10)
        assert r.status_code == 200
        d = r.json()
        assert d["rate"] == 0.20
        assert d["label"] == "VAT"

    def test_us_ca(self):
        r = requests.get(f"{API}/i18n/tax", params={"country": "US", "us_state": "CA"}, timeout=10)
        assert r.status_code == 200
        d = r.json()
        assert d["rate"] == 0.0725
        assert d["label"] == "Sales Tax (CA)"

    def test_us_or_zero(self):
        r = requests.get(f"{API}/i18n/tax", params={"country": "US", "us_state": "OR"}, timeout=10)
        assert r.status_code == 200
        d = r.json()
        assert d["rate"] == 0.0

    def test_jp_label(self):
        r = requests.get(f"{API}/i18n/tax", params={"country": "JP"}, timeout=10)
        assert r.status_code == 200
        d = r.json()
        assert d["label"] == "消費税"
        assert d["rate"] == 0.10


# ─────────────────────────────────────────────────────────────────────────────
# Country-specific business credential requirements
# ─────────────────────────────────────────────────────────────────────────────
class TestCountryCredentials:
    def test_fr(self):
        r = requests.get(f"{API}/credentials/country-requirements", params={"country": "FR"}, timeout=10)
        assert r.status_code == 200
        d = r.json()
        creds = d["credentials"]
        assert len(creds) >= 5
        by_kind = {c["kind"]: c for c in creds}
        for k in ("siret", "siren", "tva_fr", "rcs", "micro_entrepreneur"):
            assert k in by_kind, f"missing FR kind {k}"
        # SIRET regex must be ^\d{14}$
        assert by_kind["siret"].get("format_regex") == r"^\d{14}$"

    def test_us(self):
        r = requests.get(f"{API}/credentials/country-requirements", params={"country": "US"}, timeout=10)
        assert r.status_code == 200
        kinds = {c["kind"] for c in r.json()["credentials"]}
        for k in ("ein", "ssn_last4", "state_business_license", "w9"):
            assert k in kinds, f"missing US kind {k}"

    def test_in(self):
        r = requests.get(f"{API}/credentials/country-requirements", params={"country": "IN"}, timeout=10)
        assert r.status_code == 200
        kinds = {c["kind"] for c in r.json()["credentials"]}
        for k in ("gstin", "pan", "aadhaar_last4", "udyam"):
            assert k in kinds, f"missing IN kind {k}"

    def test_jp_corporate_number(self):
        r = requests.get(f"{API}/credentials/country-requirements", params={"country": "JP"}, timeout=10)
        assert r.status_code == 200
        by_kind = {c["kind"]: c for c in r.json()["credentials"]}
        assert "corporate_number_jp" in by_kind
        assert by_kind["corporate_number_jp"].get("format_regex") == r"^\d{13}$"

    def test_all_profiles(self):
        r = requests.get(f"{API}/credentials/country-requirements", params={"country": "ALL"}, timeout=10)
        assert r.status_code == 200
        profiles = r.json()["profiles"]
        assert isinstance(profiles, dict)
        assert len(profiles) >= 15


# ─────────────────────────────────────────────────────────────────────────────
# Checkout deposit with tax
# ─────────────────────────────────────────────────────────────────────────────
class TestCheckoutDeposit:
    def _make_inventory(self, retailer_token):
        # ensure a storefront exists
        requests.post(
            f"{API}/stores",
            json={"display_name": "TEST Store", "tagline": "x", "bio": "x"},
            headers=_h(retailer_token),
            timeout=10,
        )
        r = requests.post(
            f"{API}/inventory",
            json={"name": "TEST_item_tax", "description": "x", "price": 100.0, "category": "retail"},
            headers=_h(retailer_token),
            timeout=10,
        )
        assert r.status_code in (200, 201), r.text
        return r.json()

    def test_gb_deposit_tax(self, customer_token, retailer_token):
        inv = self._make_inventory(retailer_token)
        body = {
            "listing_id": inv["id"],
            "item_price": 100.0,
            "delivery_fee": 20.0,
            "delivery_address": {"address": "1 Test St, London"},
            "origin_url": "https://example.com",
            "country": "GB",
        }
        r = requests.post(f"{API}/checkout/deposit", json=body, headers=_h(customer_token), timeout=30)
        assert r.status_code == 200, r.text
        d = r.json()
        order_id = d.get("order_id")
        assert order_id, f"no order_id in response: {d}"
        # Fetch order to verify tax
        order = requests.get(f"{API}/orders/{order_id}", headers=_h(customer_token), timeout=10).json()
        # tax = 20% of (100 + 20) = 24.00
        assert abs(float(order["tax_amount"]) - 24.0) < 0.01, order
        assert order["tax_label"] == "VAT"
        # deposit = 10 + 2 + 24 = 36
        assert abs(float(order["deposit_total"]) - 36.0) < 0.01, order

    def test_us_ca_deposit_tax(self, customer_token, retailer_token):
        inv = self._make_inventory(retailer_token)
        body = {
            "listing_id": inv["id"],
            "item_price": 100.0,
            "delivery_fee": 0.0,
            "delivery_address": {"address": "1 Market St, San Francisco, CA 94105"},
            "origin_url": "https://example.com",
            "country": "US",
            "us_state": "CA",
        }
        r = requests.post(f"{API}/checkout/deposit", json=body, headers=_h(customer_token), timeout=30)
        assert r.status_code == 200, r.text
        order_id = r.json().get("order_id")
        assert order_id
        order = requests.get(f"{API}/orders/{order_id}", headers=_h(customer_token), timeout=10).json()
        assert abs(float(order["tax_amount"]) - 7.25) < 0.01, order
        assert order.get("tax_us_state") == "CA"


# ─────────────────────────────────────────────────────────────────────────────
# Multi-store cart
# ─────────────────────────────────────────────────────────────────────────────
class TestCart:
    @pytest.fixture(scope="class")
    def inv_item(self, retailer_token):
        requests.post(
            f"{API}/stores",
            json={"display_name": "TEST CartStore", "tagline": "x", "bio": "x"},
            headers=_h(retailer_token),
            timeout=10,
        )
        r = requests.post(
            f"{API}/inventory",
            json={"name": "TEST_cart_item", "description": "x", "price": 25.0, "category": "retail"},
            headers=_h(retailer_token),
            timeout=10,
        )
        assert r.status_code in (200, 201), r.text
        return r.json()

    def test_cart_flow(self, customer_token, inv_item):
        # Clear first to ensure clean state
        requests.delete(f"{API}/cart", headers=_h(customer_token), timeout=10)
        # Add
        r = requests.post(
            f"{API}/cart/add",
            json={"inventory_item_id": inv_item["id"], "quantity": 2},
            headers=_h(customer_token),
            timeout=10,
        )
        assert r.status_code == 200, r.text
        cart = r.json()
        assert cart.get("total_items") == 2
        groups = cart.get("groups", [])
        assert len(groups) >= 1
        assert "store" in groups[0]
        # GET
        r2 = requests.get(f"{API}/cart", headers=_h(customer_token), timeout=10)
        assert r2.status_code == 200
        assert r2.json().get("total_items") == 2

        # Find the cart item id
        items = groups[0].get("items", [])
        assert items, "no items in group"
        cart_item_id = items[0]["id"]

        # PATCH quantity to 3
        r3 = requests.patch(
            f"{API}/cart/items/{cart_item_id}",
            json={"quantity": 3},
            headers=_h(customer_token),
            timeout=10,
        )
        assert r3.status_code == 200, r3.text
        assert r3.json().get("total_items") == 3

        # DELETE item
        r4 = requests.delete(f"{API}/cart/items/{cart_item_id}", headers=_h(customer_token), timeout=10)
        assert r4.status_code == 200, r4.text
        assert r4.json().get("total_items") == 0

        # Re-add then clear by store
        requests.post(
            f"{API}/cart/add",
            json={"inventory_item_id": inv_item["id"], "quantity": 1},
            headers=_h(customer_token),
            timeout=10,
        )
        store_id = inv_item["owner_id"]
        r5 = requests.delete(f"{API}/cart/store/{store_id}", headers=_h(customer_token), timeout=10)
        assert r5.status_code == 200
        assert r5.json().get("total_items") == 0

    def test_cart_checkout(self, customer_token, inv_item):
        requests.delete(f"{API}/cart", headers=_h(customer_token), timeout=10)
        requests.post(
            f"{API}/cart/add",
            json={"inventory_item_id": inv_item["id"], "quantity": 2},
            headers=_h(customer_token),
            timeout=10,
        )
        store_id = inv_item["owner_id"]
        r = requests.post(
            f"{API}/cart/checkout",
            json={
                "store_id": store_id,
                "delivery_fee": 5.0,
                "origin_url": "https://example.com",
                "country": "GB",
            },
            headers=_h(customer_token),
            timeout=30,
        )
        assert r.status_code == 200, r.text
        d = r.json()
        # Should return Stripe URL + order_id
        assert "url" in d
        assert d.get("order_id")
        # Fetch the order
        order = requests.get(f"{API}/orders/{d['order_id']}", headers=_h(customer_token), timeout=10).json()
        assert order.get("is_cart_order") is True
        assert order.get("tax_amount") is not None
        assert order.get("deposit_total") is not None
        assert isinstance(order.get("lines"), list) and len(order["lines"]) >= 1
        # Cart cleared for this store
        cart = requests.get(f"{API}/cart", headers=_h(customer_token), timeout=10).json()
        for g in cart.get("groups", []):
            if g.get("store", {}).get("id") == store_id:
                assert len(g.get("items", [])) == 0


# ─────────────────────────────────────────────────────────────────────────────
# Reviews — eligibility & happy path
# ─────────────────────────────────────────────────────────────────────────────
class TestReviews:
    def test_404_unknown_job(self, customer_token):
        # provider id from the seeded provider
        prov = requests.post(f"{API}/auth/login", json={"email": "provider@lumo.test", "password": "password123"}).json()
        provider_id = prov["user"]["id"]
        body = {
            "target_type": "provider",
            "target_id": provider_id,
            "job_id": str(uuid.uuid4()),
            "overall_stars": 5,
        }
        r = requests.post(f"{API}/reviews", json=body, headers=_h(customer_token), timeout=10)
        assert r.status_code == 404, r.text

    def test_job_not_completed(self, customer_token, provider_token):
        # Create a job as customer
        cj = requests.post(
            f"{API}/jobs",
            json={
                "title": "TEST_review_gate",
                "description": "x",
                "category": "cleaning",
                "category_group": "household",
                "address": {"address": "1 Test St"},
                "pay_rate": 50.0,
            },
            headers=_h(customer_token),
            timeout=10,
        )
        assert cj.status_code in (200, 201), cj.text
        job_id = cj.json()["id"]
        # provider accepts
        ra = requests.post(f"{API}/jobs/{job_id}/accept", headers=_h(provider_token), timeout=10)
        assert ra.status_code == 200, ra.text
        provider_id = requests.get(f"{API}/auth/me", headers=_h(provider_token)).json()["id"]

        body = {"target_type": "provider", "target_id": provider_id, "job_id": job_id, "overall_stars": 5}
        r = requests.post(f"{API}/reviews", json=body, headers=_h(customer_token), timeout=10)
        assert r.status_code == 400, r.text
        assert "not completed" in r.text.lower()
        return job_id, provider_id

    def test_happy_path_and_duplicate(self, customer_token, provider_token):
        # Fresh job → accept → complete → review
        cj = requests.post(
            f"{API}/jobs",
            json={
                "title": "TEST_review_happy",
                "description": "x",
                "category": "cleaning",
                "category_group": "household",
                "address": {"address": "1 Test St"},
                "pay_rate": 75.0,
            },
            headers=_h(customer_token),
            timeout=10,
        )
        assert cj.status_code in (200, 201), cj.text
        job_id = cj.json()["id"]
        ra = requests.post(f"{API}/jobs/{job_id}/accept", headers=_h(provider_token), timeout=10)
        assert ra.status_code == 200
        # Complete via dedicated endpoint as customer
        rc = requests.post(f"{API}/jobs/{job_id}/complete", headers=_h(customer_token), timeout=10)
        # complete endpoint may need provider; try both
        if rc.status_code != 200:
            rc = requests.post(f"{API}/jobs/{job_id}/complete", headers=_h(provider_token), timeout=10)
        assert rc.status_code == 200, rc.text

        provider_id = requests.get(f"{API}/auth/me", headers=_h(provider_token)).json()["id"]

        body = {
            "target_type": "provider",
            "target_id": provider_id,
            "job_id": job_id,
            "overall_stars": 5,
            "quality_stars": 5,
            "communication_stars": 4,
            "ontime_stars": 5,
            "body": "Great work",
        }
        r = requests.post(f"{API}/reviews", json=body, headers=_h(customer_token), timeout=10)
        assert r.status_code == 200, r.text

        # List
        rl = requests.get(f"{API}/reviews/target/provider/{provider_id}", timeout=10)
        assert rl.status_code == 200
        data = rl.json()
        assert data["summary"]["count"] >= 1
        assert data["summary"]["avg_overall"] is not None

        # Summary
        rs = requests.get(f"{API}/reviews/summary/provider/{provider_id}", timeout=10)
        assert rs.status_code == 200
        assert rs.json()["count"] >= 1

        # Duplicate → 400
        rd = requests.post(f"{API}/reviews", json=body, headers=_h(customer_token), timeout=10)
        assert rd.status_code == 400, rd.text
        assert "already" in rd.text.lower()


# ─────────────────────────────────────────────────────────────────────────────
# AI document verification
# ─────────────────────────────────────────────────────────────────────────────
class TestAiVerification:
    def test_verify_media_content_moderation(self, provider_token):
        # Upload tiny PNG
        files = {"file": ("tiny.png", _tiny_png_bytes(), "image/png")}
        u = requests.post(f"{API}/media/upload", files=files, headers=_h(provider_token), timeout=30)
        assert u.status_code in (200, 201), u.text
        media_id = u.json()["id"]

        v = requests.post(
            f"{API}/verify/media/{media_id}",
            json={"purpose": "content_moderation"},
            headers=_h(provider_token),
            timeout=120,
        )
        assert v.status_code == 200, v.text
        d = v.json()
        for k in ("verdict", "confidence", "used_model", "explanation"):
            assert k in d, f"missing {k} in AI response: {d}"
        assert d["used_model"] in ("anthropic/claude-sonnet-4-6", "gemini/gemini-3.1-pro-preview")
        assert 0.0 <= float(d["confidence"]) <= 1.0

    def test_verify_credential_requires_document(self, provider_token):
        # Create a credential without a document
        cr = requests.post(
            f"{API}/credentials",
            json={
                "kind": "siret",
                "category": "business_registration",
                "value": "12345678901234",
                "state": "FR",
            },
            headers=_h(provider_token),
            timeout=10,
        )
        assert cr.status_code in (200, 201), cr.text
        cred_id = cr.json()["id"]

        v = requests.post(f"{API}/verify/credential/{cred_id}", headers=_h(provider_token), timeout=30)
        assert v.status_code == 400, v.text
        assert "no document" in v.text.lower() or "document" in v.text.lower()

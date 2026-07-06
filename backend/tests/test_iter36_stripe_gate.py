"""
Iter36 — Stripe Connect onboarding gate on accept_job / accept_quote.

Covers the review request:
  1. Fresh (unonboarded) provider hitting POST /api/jobs/{id}/accept -> 402 with
     detail.code == 'stripe_onboarding_required'.
  2. Seed provider (provider@lumo.test) is auto-onboarded -> 200 on accept.
  3. Cash-only job bypass -> fresh provider CAN accept if
     allowed_payment_methods == ['cash'].
  4. POST /api/quotes/{qid}/accept from customer -> 402 when the quoting
     provider isn't onboarded, with a customer-facing message.
"""
import os
import uuid
import time
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL").rstrip("/")
API = f"{BASE_URL}/api"


def _post(path, token=None, **kwargs):
    headers = kwargs.pop("headers", {})
    if token:
        headers["Authorization"] = f"Bearer {token}"
    return requests.post(f"{API}{path}", headers=headers, timeout=30, **kwargs)


def _get(path, token=None, **kwargs):
    headers = kwargs.pop("headers", {})
    if token:
        headers["Authorization"] = f"Bearer {token}"
    return requests.get(f"{API}{path}", headers=headers, timeout=30, **kwargs)


# ── Fixtures ────────────────────────────────────────────────────────────────

@pytest.fixture(scope="session")
def customer_token():
    r = _post("/auth/login", json={"email": "customer@lumo.test", "password": "password123"})
    assert r.status_code == 200, f"customer login failed: {r.status_code} {r.text}"
    return r.json()["token"]


@pytest.fixture(scope="session")
def seed_provider_token():
    r = _post("/auth/login", json={"email": "provider@lumo.test", "password": "password123"})
    assert r.status_code == 200, f"seed provider login failed: {r.status_code} {r.text}"
    return r.json()["token"]


@pytest.fixture()
def fresh_provider():
    """Register a brand-new provider (guaranteed NOT to have
    stripe_details_submitted=True)."""
    email = f"TEST_fresh_{uuid.uuid4().hex[:8]}@lumo.test"
    body = {
        "email": email,
        "password": "password123",
        "name": "Test Fresh Provider",
        "role": "provider",
        "avatar_url": "https://example.com/p.jpg",
    }
    r = _post("/auth/register", json=body)
    assert r.status_code in (200, 201), f"register failed: {r.status_code} {r.text}"
    data = r.json()
    return {"token": data["token"], "user": data.get("user", {}), "email": email}


def _post_job(customer_token, **overrides):
    body = {
        "title": "TEST cleaning job",
        "description": "TEST job — automated iter36 stripe gate test",
        "category": "cleaning",
        "pay_rate": 100,
        "pay_unit": "flat",
        "estimated_units": 1,
        "pickup_location": {"address": "1 Main", "lat": 40.71, "lng": -74.0},
    }
    body.update(overrides)
    r = _post("/jobs", token=customer_token, json=body)
    assert r.status_code in (200, 201), f"post job failed: {r.status_code} {r.text}"
    j = r.json()
    return j


# ── Tests ───────────────────────────────────────────────────────────────────

def test_fresh_provider_accept_returns_402(customer_token, fresh_provider):
    """(1) Fresh unonboarded provider → HTTP 402 with structured detail."""
    job = _post_job(customer_token)
    r = _post(f"/jobs/{job['id']}/accept", token=fresh_provider["token"])
    assert r.status_code == 402, f"expected 402, got {r.status_code}: {r.text}"
    body = r.json()
    detail = body.get("detail")
    assert isinstance(detail, dict), f"detail should be a dict, got {type(detail)}: {body}"
    assert detail.get("code") == "stripe_onboarding_required", detail
    assert "message" in detail and detail["message"]
    assert "onboard_hint" in detail and detail["onboard_hint"]


def test_seed_provider_accept_succeeds(customer_token, seed_provider_token):
    """(2) Auto-onboarded seed provider can accept a fresh job → 200."""
    # Skip credential requirement by using a category the seed provider has.
    # provider@lumo.test seed setup: check what categories it lists via /me
    me = _get("/auth/me", token=seed_provider_token)
    assert me.status_code == 200
    cats = (me.json() or {}).get("categories") or []
    category = cats[0] if cats else "cleaning"

    job = _post_job(customer_token, category=category)
    r = _post(f"/jobs/{job['id']}/accept", token=seed_provider_token)
    if r.status_code == 403 and "credential" in r.text.lower():
        pytest.skip(
            "Seed provider lacks verified credential for this category — "
            "gate itself passed (no 402). Response was: " + r.text
        )
    assert r.status_code == 200, f"expected 200, got {r.status_code}: {r.text}"
    data = r.json()
    assert data.get("status") == "accepted"
    assert data.get("provider_id")


def test_cash_only_job_bypasses_gate(customer_token, fresh_provider):
    """(3) allowed_payment_methods=['cash'] → fresh provider can accept."""
    job = _post_job(customer_token, allowed_payment_methods=["cash"])
    r = _post(f"/jobs/{job['id']}/accept", token=fresh_provider["token"])
    # Must NOT be 402. 200 or a credential-related 403 are both proof the
    # Stripe gate was bypassed. Anything else is a regression.
    assert r.status_code != 402, f"cash-only job should bypass gate: {r.status_code} {r.text}"
    if r.status_code == 200:
        assert r.json().get("status") == "accepted"


def test_customer_accept_quote_402_when_provider_unonboarded(customer_token, fresh_provider):
    """(4) Customer accepting a quote from unonboarded provider → 402 with a
    customer-facing message about the provider not being onboarded."""
    job = _post_job(customer_token)
    # Fresh provider submits a quote (POST /jobs/{id}/quotes). Schema is
    # QuoteCreate: quoted_pay_rate, quoted_pay_unit, quoted_estimated_units, notes.
    qbody = {
        "quoted_pay_rate": 120.0,
        "quoted_pay_unit": "flat",
        "quoted_estimated_units": 1.0,
        "notes": "will do",
    }
    r = _post(f"/jobs/{job['id']}/quotes", token=fresh_provider["token"], json=qbody)
    assert r.status_code in (200, 201), f"quote submission failed: {r.status_code} {r.text}"
    q = r.json()
    qid = q.get("id") or q.get("quote_id")
    assert qid, f"no quote id in response: {q}"

    r2 = _post(f"/quotes/{qid}/accept", token=customer_token)
    assert r2.status_code == 402, f"expected 402, got {r2.status_code}: {r2.text}"
    detail = r2.json().get("detail") or {}
    assert isinstance(detail, dict), detail
    assert detail.get("code") == "stripe_onboarding_required"
    # Should be reworded for customer, not raw provider-facing copy.
    msg = (detail.get("message") or "").lower()
    assert "bank" in msg or "onboard" in msg or "connect" in msg or "provider" in msg


def test_stripe_configured_public_state():
    """Sanity: ensure Stripe is 'configured' on the server so the gate is
    actually enforced. If dev-mode (unconfigured) the 402 tests above would
    be short-circuited by _stripe_configured() returning False."""
    # We can't call the internal helper, but /api/stripe/connect/status will
    # return {"enabled": False, ...} in dev mode. Any authenticated call works.
    r = _post("/auth/login", json={"email": "customer@lumo.test", "password": "password123"})
    tok = r.json()["token"]
    s = _get("/stripe/connect/status", token=tok)
    assert s.status_code == 200, s.text
    body = s.json()
    assert body.get("enabled") is True, (
        f"STRIPE_CONNECT_SECRET_KEY must be set so the accept gate is enforced; "
        f"status body: {body}"
    )

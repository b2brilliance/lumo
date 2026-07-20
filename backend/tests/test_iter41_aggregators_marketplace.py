"""Iteration 41 backend tests

Covers:
- Aggregator admin endpoints (status, sync). Adzuna & Reed should log
  "skipped — key not set" and NOT raise 5xx.
- Existing /api/map/jobs endpoint still returns jobs from prior sources
  (usajobs / greenhouse / remoteok / wwr) — external firehose gated via
  include_external=true.
- Marketplace listings endpoint returns items (used by the client-side
  Marketplace filters — filter logic is UI-only, no backend contract
  needed beyond returning listings).
- Import guard for the new aggregator module functions.
"""
import os
import subprocess
import time
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/") or "http://localhost:8001"
ADMIN_EMAIL = "admin@lumo.test"
ADMIN_PASSWORD = "password123"


# ── fixtures ───────────────────────────────────────────────────────────
@pytest.fixture(scope="module")
def api_client():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


@pytest.fixture(scope="module")
def admin_token(api_client):
    r = api_client.post(f"{BASE_URL}/api/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD})
    if r.status_code != 200:
        pytest.skip(f"Admin login failed: {r.status_code} {r.text[:200]}")
    return r.json().get("token")


@pytest.fixture(scope="module")
def admin_client(api_client, admin_token):
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json", "Authorization": f"Bearer {admin_token}"})
    return s


# ── module import (feature 11) ─────────────────────────────────────────
def test_aggregator_module_imports():
    """New Adzuna/Reed functions must import without syntax errors."""
    from aggregators import fetch_adzuna, fetch_reed, ingest_aggregated_jobs
    assert callable(fetch_adzuna)
    assert callable(fetch_reed)
    assert callable(ingest_aggregated_jobs)


# ── /api/map/jobs still healthy ────────────────────────────────────────
def test_map_jobs_public_returns_list(api_client):
    r = api_client.get(f"{BASE_URL}/api/map/jobs")
    assert r.status_code == 200, r.text[:300]
    data = r.json()
    assert isinstance(data, list)


def test_map_jobs_include_external_returns_list(api_client):
    r = api_client.get(f"{BASE_URL}/api/map/jobs", params={"include_external": "true"})
    assert r.status_code == 200, r.text[:300]
    data = r.json()
    assert isinstance(data, list)
    # if external jobs are already ingested, ensure known sources still present
    sources = {j.get("source") for j in data if j.get("source")}
    # Sanity: at least one known aggregator source has been ingested at some point
    # (This is soft-checked — not a hard assert since fresh DBs may be empty.)
    print(f"[map/jobs external] present sources: {sources}")


# ── Aggregator admin ───────────────────────────────────────────────────
def test_admin_aggregators_status(admin_client):
    r = admin_client.get(f"{BASE_URL}/api/admin/aggregators")
    assert r.status_code == 200, r.text[:300]
    body = r.json()
    assert isinstance(body, list)


def test_admin_aggregators_sync_no_5xx(admin_client):
    """Trigger the ingest loop. Adzuna/Reed have no keys — expect the
    aggregators to be skipped (returning []) but the endpoint itself
    must return 200 with counts + no traceback."""
    # Truncate backend err log before invocation so we can grep just for
    # tracebacks caused by this call.
    err_log = "/var/log/supervisor/backend.err.log"
    try:
        prev_size = os.path.getsize(err_log)
    except Exception:
        prev_size = 0

    t0 = time.time()
    r = admin_client.post(f"{BASE_URL}/api/admin/aggregators/sync", timeout=180)
    elapsed = time.time() - t0
    print(f"[aggregators/sync] status={r.status_code} elapsed={elapsed:.1f}s")
    assert r.status_code == 200, r.text[:500]
    body = r.json()
    assert body.get("ok") is True
    assert "counts" in body and isinstance(body["counts"], dict)
    counts = body["counts"]
    print(f"[aggregators/sync] counts={counts} total={body.get('total')}")

    # Adzuna & Reed keys not set → they should either be absent from
    # counts (loop skipped them at fetch stage) OR present with 0.
    if "adzuna" in counts:
        assert counts["adzuna"] == 0, f"Adzuna should return 0 without keys, got {counts['adzuna']}"
    if "reed" in counts:
        assert counts["reed"] == 0, f"Reed should return 0 without keys, got {counts['reed']}"

    # No new traceback in backend err log
    try:
        with open(err_log, "rb") as f:
            f.seek(prev_size)
            new_log = f.read().decode("utf-8", errors="ignore")
        assert "Traceback (most recent call last)" not in new_log, f"Traceback found:\n{new_log[-2000:]}"
    except FileNotFoundError:
        pass


def test_admin_aggregators_sync_forbidden_for_non_admin(api_client):
    # login as customer
    r = api_client.post(f"{BASE_URL}/api/auth/login", json={"email": "customer@lumo.test", "password": "password123"})
    if r.status_code != 200:
        pytest.skip("customer login failed")
    tok = r.json().get("token")
    r2 = requests.post(f"{BASE_URL}/api/admin/aggregators/sync",
                       headers={"Authorization": f"Bearer {tok}", "Content-Type": "application/json"})
    assert r2.status_code in (401, 403), f"Expected 401/403, got {r2.status_code}: {r2.text[:200]}"


# ── Marketplace listings endpoint (used by filter UI) ──────────────────
def test_marketplace_listings_returns_list(api_client):
    r = api_client.get(f"{BASE_URL}/api/marketplace/listings")
    assert r.status_code == 200, r.text[:300]
    data = r.json()
    assert isinstance(data, list)
    # Sanity: check the response shape doesn't leak _id
    if data:
        first = data[0]
        assert "_id" not in first, "MongoDB _id leaked into API response"
        assert "id" in first
        assert "price" in first
        assert "category" in first
        assert "title" in first

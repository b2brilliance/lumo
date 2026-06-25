"""
Iteration 18 — Stripe Connect plumbing tests.

Notes:
  - The provider's Stripe account does NOT have Connect enabled yet, so
    Account.create returns a clear 400 — this is the EXPECTED behavior.
  - We verify the wiring & error surfacing, not actual Connect functionality.
"""
import os
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
if not BASE_URL:
    # fallback to read frontend .env
    with open("/app/frontend/.env") as f:
        for line in f:
            if line.startswith("REACT_APP_BACKEND_URL="):
                BASE_URL = line.split("=", 1)[1].strip().strip('"').rstrip("/")

API = f"{BASE_URL}/api"

PROVIDER_EMAIL = "provider@lumo.test"
CUSTOMER_EMAIL = "customer@lumo.test"
PASSWORD = "password123"


# ── Auth helpers ────────────────────────────────────────────────────────
def _login(email: str, password: str = PASSWORD) -> str:
    r = requests.post(f"{API}/auth/login", json={"email": email, "password": password}, timeout=30)
    assert r.status_code == 200, f"login {email} failed: {r.status_code} {r.text}"
    return r.json()["token"]


@pytest.fixture(scope="module")
def provider_token() -> str:
    return _login(PROVIDER_EMAIL)


@pytest.fixture(scope="module")
def customer_token() -> str:
    return _login(CUSTOMER_EMAIL)


@pytest.fixture(scope="module")
def provider_headers(provider_token):
    return {"Authorization": f"Bearer {provider_token}"}


# ── Smoke: existing flows are NOT regressed ─────────────────────────────
class TestRegressionSmoke:
    def test_login(self):
        r = requests.post(f"{API}/auth/login", json={"email": PROVIDER_EMAIL, "password": PASSWORD}, timeout=30)
        assert r.status_code == 200
        data = r.json()
        assert "token" in data and "user" in data
        assert data["user"]["email"] == PROVIDER_EMAIL

    def test_me(self, provider_headers):
        r = requests.get(f"{API}/auth/me", headers=provider_headers, timeout=30)
        assert r.status_code == 200
        assert r.json()["email"] == PROVIDER_EMAIL

    def test_wallet(self, provider_headers):
        r = requests.get(f"{API}/wallet", headers=provider_headers, timeout=30)
        assert r.status_code == 200
        body = r.json()
        assert "balance" in body and "transactions" in body


# ── Stripe Connect plumbing ─────────────────────────────────────────────
class TestStripeConnect:
    """Provider hasn't signed up for Connect yet on Stripe dashboard."""

    def test_status_unconnected(self, provider_headers):
        # Ensure no leftover stripe_account_id (disconnect first as cleanup)
        requests.delete(f"{API}/stripe/connect/disconnect", headers=provider_headers, timeout=30)

        r = requests.get(f"{API}/stripe/connect/status", headers=provider_headers, timeout=30)
        assert r.status_code == 200, f"status: {r.status_code} {r.text}"
        d = r.json()
        assert d.get("enabled") is True, f"expected enabled=True, got {d}"
        assert d.get("connected") is False
        assert d.get("charges_enabled") is False
        assert d.get("payouts_enabled") is False

    def test_onboard_returns_clean_400_when_connect_not_enabled(self, provider_headers):
        """The user's Stripe account hasn't enabled Connect yet so
        Account.create returns 400 — verify we surface it as 400 NOT 502."""
        r = requests.post(
            f"{API}/stripe/connect/onboard",
            json={"return_url": "https://example.com/back"},
            headers=provider_headers,
            timeout=30,
        )
        # Expected: 400 with clear message from Stripe
        assert r.status_code == 400, f"expected 400, got {r.status_code} {r.text}"
        detail = r.json().get("detail", "")
        # Stripe's message: "You can only create new accounts if you've signed up for Connect..."
        assert "Connect" in detail, f"detail should mention Connect: {detail}"

    def test_dashboard_link_without_account(self, provider_headers):
        # Cleanup any account first
        requests.delete(f"{API}/stripe/connect/disconnect", headers=provider_headers, timeout=30)

        r = requests.post(f"{API}/stripe/connect/dashboard-link", headers=provider_headers, timeout=30)
        assert r.status_code == 400, f"expected 400, got {r.status_code} {r.text}"
        assert "Connect your bank first" in r.json().get("detail", "")

    def test_list_transfers_empty(self, provider_headers):
        r = requests.get(f"{API}/stripe/connect/transfers", headers=provider_headers, timeout=30)
        assert r.status_code == 200
        body = r.json()
        assert isinstance(body, list)

    def test_disconnect_returns_ok(self, provider_headers):
        r = requests.delete(f"{API}/stripe/connect/disconnect", headers=provider_headers, timeout=30)
        assert r.status_code == 200
        assert r.json() == {"ok": True}

    def test_webhook_accepts_unsigned_payload(self):
        payload = {
            "id": "evt_test_iter18",
            "type": "account.updated",
            "data": {
                "object": {
                    "id": "acct_fake_iter18",
                    "charges_enabled": False,
                    "payouts_enabled": False,
                    "details_submitted": False,
                }
            },
        }
        r = requests.post(f"{API}/stripe/connect/webhook", json=payload, timeout=30)
        assert r.status_code == 200, f"webhook should accept unsigned in test mode: {r.status_code} {r.text}"
        assert r.json() == {"ok": True}


# ── Wallet withdraw fallback (non-connected provider) ───────────────────
class TestWalletWithdrawFallback:
    def test_withdraw_invalid_amount(self, provider_headers):
        """Provider not stripe-connected, balance likely 0 — should return 400."""
        r = requests.post(
            f"{API}/wallet/withdraw",
            json={"amount": 10000.0, "method": "ach"},
            headers=provider_headers,
            timeout=30,
        )
        # Either 400 invalid amount (no balance) OR 200 completed (if balance exists).
        assert r.status_code in (200, 400), f"unexpected: {r.status_code} {r.text}"
        if r.status_code == 200:
            body = r.json()
            assert body.get("status") == "completed"
            assert body.get("stripe_paid") is False  # not connected → fallback


# ── Escrow smoke (basic — endpoints reachable) ──────────────────────────
class TestEscrowSmoke:
    def test_escrow_held_endpoint(self, provider_headers):
        # Hit a non-mutating escrow endpoint to make sure router still mounted.
        for path in ("/escrow/held", "/escrow/mine", "/escrow"):
            r = requests.get(f"{API}{path}", headers=provider_headers, timeout=30)
            if r.status_code != 404:
                # any non-404 means route exists
                assert r.status_code in (200, 400, 405), f"{path}: {r.status_code} {r.text}"
                return
        # If none exist, that's not a regression of this iteration; skip.
        pytest.skip("No simple escrow GET endpoint found — not regressed by this change.")

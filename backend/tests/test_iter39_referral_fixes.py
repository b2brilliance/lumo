"""
Iteration 39 — Retest of 3 fixes surfaced by iter38:

  (HIGH) `_credit_referrer` now fires on BOTH Stripe transfer AND wallet
         fallback paths in `_credit_provider`. Test by importing
         `_credit_provider` from server.py, monkeypatching
         `_attempt_stripe_transfer` to force the Stripe branch, and
         confirming a referral_earnings row + wallet increment + notif
         are still written for the referrer.

  (LOW)  /api/referrals/me → share_url uses the public preview hostname
         (via X-Forwarded-Host), NOT the internal cluster hostname.

  (LOW)  Frontend register clears BOTH lumo_ref_code AND lumo_ref_code_ts
         from localStorage. (Verified via Playwright in a separate flow;
         here we just assert the code contains the removeItem call — a
         cheap regression check.)

Each backend test uses a UNIQUE X-Forwarded-For so the shared in-memory
rate limiter does not leak state between tests.
"""
from __future__ import annotations

import os
import sys
import uuid
import asyncio
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
assert BASE_URL, "REACT_APP_BACKEND_URL not set"

sys.path.insert(0, "/app/backend")


def _fresh_ip() -> str:
    b = uuid.uuid4().int
    return f"198.51.{(b >> 8) & 0xFF}.{b & 0xFF}"


def _unique_email(tag: str = "user") -> str:
    return f"TEST_iter39_{tag}_{uuid.uuid4().hex[:8]}@lumo.test"


# ── FIX 1 (HIGH) — _credit_referrer fires on Stripe transfer path ──────
class TestCreditReferrerOnStripePath:
    """The bug in iter38: `_credit_referrer` was only called on the
    wallet-fallback branch of `_credit_provider`. In iter39 the call was
    moved BEFORE the branch split so it fires unconditionally. This test
    forces `_attempt_stripe_transfer` to succeed (returns a dict) and
    asserts the referrer still gets credited.
    """

    def test_stripe_transfer_still_credits_referrer(self):
        from motor.motor_asyncio import AsyncIOMotorClient
        import server as server_mod  # noqa: E402  loads FastAPI app but that's ok

        mongo_url = os.environ.get("MONGO_URL")
        db_name = os.environ.get("DB_NAME") or "lumo_database"
        client = AsyncIOMotorClient(mongo_url)
        db = client[db_name]

        # ── Set up referrer A + provider B via public API ─────────────
        # A = customer with a referral code
        rA = requests.post(
            f"{BASE_URL}/api/auth/register",
            json={
                "email": _unique_email("stripeA_cust"),
                "password": "password123",
                "name": "Referrer A",
                "role": "customer",
            },
            headers={"X-Forwarded-For": _fresh_ip()}, timeout=15,
        )
        assert rA.status_code == 200, rA.text
        tokenA = rA.json()["token"]
        userA_id = rA.json()["user"]["id"]
        codeA = requests.get(
            f"{BASE_URL}/api/referrals/me",
            headers={"Authorization": f"Bearer {tokenA}"}, timeout=15,
        ).json()["code"]

        # B = provider referred by A + avatar_url set (some downstream
        # validation requires one).
        rB = requests.post(
            f"{BASE_URL}/api/auth/register",
            json={
                "email": _unique_email("stripeB_prov"),
                "password": "password123",
                "name": "Provider B",
                "role": "provider",
                "avatar_url": "https://example.com/p.jpg",
                "ref_code": codeA,
            },
            headers={"X-Forwarded-For": _fresh_ip()}, timeout=15,
        )
        assert rB.status_code == 200, rB.text
        providerB_id = rB.json()["user"]["id"]

        # ── Monkeypatch _attempt_stripe_transfer to FORCE the stripe
        # branch of _credit_provider ──────────────────────────────────
        source_id = f"TEST_iter39_stripe_{uuid.uuid4().hex[:8]}"

        async def _fake_transfer(*, db, provider_id, amount_usd, reason,
                                 ref_id=None, ref_kind=None):
            return {
                "transfer_id": f"tr_TEST_{uuid.uuid4().hex[:12]}",
                "amount": amount_usd,
                "provider_id": provider_id,
            }

        real_transfer = server_mod._attempt_stripe_transfer
        server_mod._attempt_stripe_transfer = _fake_transfer
        try:
            async def _run():
                before = await db.users.find_one(
                    {"id": userA_id}, {"_id": 0, "wallet_balance": 1}
                )
                before_bal = float(before.get("wallet_balance") or 0)
                await server_mod._credit_provider(
                    provider_id=providerB_id,
                    amount=100.0,
                    reason="TEST_iter39_stripe_path",
                    ref_id=source_id,
                    ref_kind="job",
                )
                after = await db.users.find_one(
                    {"id": userA_id}, {"_id": 0, "wallet_balance": 1}
                )
                after_bal = float(after.get("wallet_balance") or 0)
                earnings = await db.referral_earnings.find_one(
                    {"referrer_user_id": userA_id, "source_id": source_id},
                    {"_id": 0},
                )
                # Provider B should see a stripe_payout row (NOT credit)
                prov_wtx = await db.wallet_transactions.find_one(
                    {"user_id": providerB_id, "ref_id": source_id,
                     "type": "stripe_payout"},
                    {"_id": 0},
                )
                notif = await db.notifications.find_one(
                    {"user_id": userA_id, "type": "referral_earned"},
                    sort=[("created_at", -1)],
                    projection={"_id": 0},
                )
                return before_bal, after_bal, earnings, prov_wtx, notif

            before_bal, after_bal, earnings, prov_wtx, notif = (
                asyncio.new_event_loop().run_until_complete(_run())
            )
        finally:
            server_mod._attempt_stripe_transfer = real_transfer
            client.close()

        # (i) Provider B got a stripe_payout wallet_transactions row
        assert prov_wtx is not None, (
            "Expected provider B to have a wallet_transactions row of type "
            "'stripe_payout' after forced Stripe transfer"
        )
        assert prov_wtx["type"] == "stripe_payout"
        assert prov_wtx.get("stripe_transfer_id", "").startswith("tr_TEST_")

        # (ii) Referrer A's wallet increased by ≈ 100/900 = 0.1111
        delta = after_bal - before_bal
        assert abs(delta - 0.1111) < 1e-3, (
            f"referrer wallet delta expected ~0.1111, got {delta}"
        )

        # (iii) referral_earnings row exists with correct source
        assert earnings is not None
        assert earnings["source_user_id"] == providerB_id
        assert earnings["source_type"] == "job"
        assert abs(float(earnings["amount"]) - 0.1111) < 1e-3

        # (iv) Referrer notification landed
        assert notif is not None and "earned" in notif["title"].lower()


# ── FIX 2 (LOW) — share_url uses public host ───────────────────────────
class TestShareUrlPublicHost:
    def test_share_url_uses_public_host_not_cluster(self):
        # Register a fresh customer to isolate rate-limiter counters
        email = _unique_email("share_url")
        r = requests.post(
            f"{BASE_URL}/api/auth/register",
            json={"email": email, "password": "password123",
                  "name": "Share URL Test", "role": "customer"},
            headers={"X-Forwarded-For": _fresh_ip()}, timeout=15,
        )
        assert r.status_code == 200, r.text
        token = r.json()["token"]

        r2 = requests.get(
            f"{BASE_URL}/api/referrals/me",
            headers={"Authorization": f"Bearer {token}"},
            timeout=15,
        )
        assert r2.status_code == 200, r2.text
        share_url = r2.json()["share_url"]
        assert share_url.startswith("https://"), share_url
        # Public hostname from REACT_APP_BACKEND_URL should be preferred
        assert "cluster" not in share_url.lower(), (
            f"share_url leaks internal cluster hostname: {share_url}"
        )
        # Should contain the /register?ref= path
        assert "/register?ref=" in share_url, share_url
        # And should match the public preview hostname the frontend uses
        public_host = BASE_URL.replace("https://", "").replace("http://", "")
        assert public_host in share_url, (
            f"share_url {share_url!r} does not contain expected public host "
            f"{public_host!r}"
        )


# ── FIX 3 (LOW) — auth.jsx removes BOTH lumo_ref_code and _ts ──────────
class TestAuthJsxClearsBothRefKeys:
    """Cheap source-level regression: assert the removeItem call for
    lumo_ref_code_ts exists alongside lumo_ref_code in auth.jsx. The
    live browser flow is exercised separately via Playwright."""

    def test_register_removes_both_keys(self):
        path = "/app/frontend/src/lib/auth.jsx"
        with open(path) as f:
            src = f.read()
        assert 'removeItem("lumo_ref_code")' in src, (
            "auth.jsx no longer removes lumo_ref_code"
        )
        assert 'removeItem("lumo_ref_code_ts")' in src, (
            "auth.jsx must also remove lumo_ref_code_ts on successful register"
        )


# ── Regression: seed provider@lumo.test can still log in ──────────────
class TestSeedProviderRegression:
    def test_seed_provider_login_works(self):
        r = requests.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": "provider@lumo.test", "password": "password123"},
            headers={"X-Forwarded-For": _fresh_ip()}, timeout=15,
        )
        assert r.status_code == 200, r.text
        token = r.json()["token"]
        # Sanity: provider can hit /api/jobs?status=posted
        r2 = requests.get(
            f"{BASE_URL}/api/jobs?status=posted",
            headers={"Authorization": f"Bearer {token}"}, timeout=15,
        )
        assert r2.status_code == 200, r2.text


# ── Regression: /referrals/me still returns the correct schema ─────────
class TestReferralsMeSchemaRegression:
    def test_shape_still_correct(self):
        r = requests.post(
            f"{BASE_URL}/api/auth/register",
            json={"email": _unique_email("shape"), "password": "password123",
                  "name": "Shape Test", "role": "customer"},
            headers={"X-Forwarded-For": _fresh_ip()}, timeout=15,
        )
        token = r.json()["token"]
        d = requests.get(
            f"{BASE_URL}/api/referrals/me",
            headers={"Authorization": f"Bearer {token}"}, timeout=15,
        ).json()
        # All required keys present
        for k in ("code", "share_url", "referred_users", "events",
                  "total_earned", "recent", "reward_copy"):
            assert k in d, f"missing key {k} in /referrals/me → {d}"
        assert isinstance(d["recent"], list)

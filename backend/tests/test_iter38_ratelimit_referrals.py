"""
Iteration 38 — Rate limiting on auth endpoints + Referral engine.

Verifies:
  1. /api/auth/login rate limit: 10 per IP per 15 min; 11th → 429.
  2. Successful login RESETS the counter.
  3. /api/auth/register rate limit: 20 per IP per 15 min; 21st → 429.
  4. Registration auto-issues a 6-char referral code, /referrals/me exposes it.
  5. Referral code capture on register propagates to /auth/me
     (referred_by_user_id + referred_by_code uppercased).
  6. credit_referrer() credits 1/900 of provider_amount to the referrer's
     wallet, writes a referral_earnings row, wallet_transactions row, and
     notification.
  7. /api/referrals/me aggregates total_earned / events / referred_users.

Each test uses a UNIQUE X-Forwarded-For header so the shared in-memory
rate limiter doesn't leak state between tests.
"""
from __future__ import annotations

import os
import uuid
import time
import asyncio
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
assert BASE_URL, "REACT_APP_BACKEND_URL not set"


def _fresh_ip() -> str:
    """A unique IPv4 per call so the throttle state is isolated."""
    b = uuid.uuid4().int
    return f"198.51.{(b >> 8) & 0xFF}.{b & 0xFF}"


def _unique_email(tag: str = "user") -> str:
    return f"TEST_{tag}_{uuid.uuid4().hex[:8]}@lumo.test"


# ── 1. Login rate-limit ────────────────────────────────────────────────
class TestLoginRateLimit:
    def test_login_11th_attempt_returns_429(self):
        ip = _fresh_ip()
        headers = {"X-Forwarded-For": ip, "Content-Type": "application/json"}
        # Ensure a real account exists so the endpoint doesn't 400 early
        # (we use wrong password → 401).
        for i in range(1, 11):
            r = requests.post(
                f"{BASE_URL}/api/auth/login",
                json={"email": "customer@lumo.test", "password": "wrongpw"},
                headers=headers, timeout=15,
            )
            assert r.status_code == 401, f"attempt {i} expected 401, got {r.status_code} {r.text}"
            data = r.json()
            assert "Invalid" in (data.get("detail") or ""), data
        # 11th → 429
        r = requests.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": "customer@lumo.test", "password": "wrongpw"},
            headers=headers, timeout=15,
        )
        assert r.status_code == 429, f"expected 429, got {r.status_code} {r.text}"
        assert r.headers.get("Retry-After"), "Retry-After header missing"
        body = r.json()
        detail = body.get("detail") or {}
        assert detail.get("code") == "rate_limited", detail
        assert "15 minute" in (detail.get("message") or ""), detail

    def test_successful_login_resets_counter(self):
        ip = _fresh_ip()
        headers = {"X-Forwarded-For": ip, "Content-Type": "application/json"}
        # 5 wrong attempts
        for i in range(5):
            r = requests.post(
                f"{BASE_URL}/api/auth/login",
                json={"email": "customer@lumo.test", "password": "wrongpw"},
                headers=headers, timeout=15,
            )
            assert r.status_code == 401
        # 6th → SUCCESSFUL login (correct password) — should clear counter
        r = requests.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": "customer@lumo.test", "password": "password123"},
            headers=headers, timeout=15,
        )
        assert r.status_code == 200, f"correct login failed: {r.status_code} {r.text}"
        # After reset we should now be able to do 10 more wrong attempts
        # without hitting 429 (we'll do a subset — 7 more wrongs should
        # still return 401, not 429).
        for i in range(7):
            r = requests.post(
                f"{BASE_URL}/api/auth/login",
                json={"email": "customer@lumo.test", "password": "wrongpw"},
                headers=headers, timeout=15,
            )
            assert r.status_code == 401, (
                f"after successful login attempt {i+1} expected 401, "
                f"got {r.status_code} — counter did not reset"
            )


# ── 2. Register rate-limit ─────────────────────────────────────────────
class TestRegisterRateLimit:
    def test_21st_register_from_same_ip_returns_429(self):
        ip = _fresh_ip()
        headers = {"X-Forwarded-For": ip, "Content-Type": "application/json"}
        # 20 valid but conflicting-email registrations — email uniqueness
        # returns 400 but the rate limiter counts BEFORE the DB check, so
        # every attempt still consumes a slot.
        allowed_seen = 0
        for i in range(20):
            r = requests.post(
                f"{BASE_URL}/api/auth/register",
                json={
                    "email": _unique_email("rl_reg"),
                    "password": "password123",
                    "name": "RL Test",
                    "role": "customer",
                },
                headers=headers, timeout=15,
            )
            # 200 (created) is expected each time (unique emails).
            assert r.status_code in (200, 201, 400), (
                f"attempt {i+1}: unexpected {r.status_code} {r.text}"
            )
            if r.status_code != 429:
                allowed_seen += 1
        assert allowed_seen == 20, f"only {allowed_seen}/20 attempts got through before 429"
        # 21st → 429
        r = requests.post(
            f"{BASE_URL}/api/auth/register",
            json={
                "email": _unique_email("rl_reg21"),
                "password": "password123",
                "name": "RL Test",
                "role": "customer",
            },
            headers=headers, timeout=15,
        )
        assert r.status_code == 429, f"expected 429, got {r.status_code} {r.text}"
        assert (r.json().get("detail") or {}).get("code") == "rate_limited"


# ── 3. Referral code issuance + /referrals/me shape ────────────────────
class TestReferralIssuance:
    def test_new_user_gets_referral_code(self):
        ip = _fresh_ip()
        email = _unique_email("refme")
        r = requests.post(
            f"{BASE_URL}/api/auth/register",
            json={"email": email, "password": "password123",
                  "name": "Ref Owner", "role": "customer"},
            headers={"X-Forwarded-For": ip},
            timeout=15,
        )
        assert r.status_code == 200, r.text
        token = r.json()["token"]
        # /referrals/me
        r2 = requests.get(
            f"{BASE_URL}/api/referrals/me",
            headers={"Authorization": f"Bearer {token}", "X-Forwarded-For": ip},
            timeout=15,
        )
        assert r2.status_code == 200, r2.text
        data = r2.json()
        code = data["code"]
        assert isinstance(code, str) and len(code) == 6, f"bad code: {code!r}"
        # Uppercase letters + digits, excluding 0/O/1/I
        forbidden = set("0O1I")
        assert all(c.isalnum() and c.isupper() or c.isdigit() for c in code), code
        assert not (set(code) & forbidden), f"forbidden chars in code: {code}"
        # share_url ends with /register?ref=<code>
        assert data["share_url"].endswith(f"/register?ref={code}"), data["share_url"]
        assert data["referred_users"] == 0
        assert data["events"] == 0
        assert data["total_earned"] == 0


# ── 4. Referral capture on register + credit_referrer() ────────────────
class TestReferralCaptureAndPayout:
    def test_capture_and_payout_flow(self):
        ip = _fresh_ip()
        # (a) Register customer A → get their code
        emailA = _unique_email("refA_cust")
        rA = requests.post(
            f"{BASE_URL}/api/auth/register",
            json={"email": emailA, "password": "password123",
                  "name": "Customer A", "role": "customer"},
            headers={"X-Forwarded-For": ip}, timeout=15,
        )
        assert rA.status_code == 200, rA.text
        tokenA = rA.json()["token"]
        userA_id = rA.json()["user"]["id"]
        rMe = requests.get(
            f"{BASE_URL}/api/referrals/me",
            headers={"Authorization": f"Bearer {tokenA}"},
            timeout=15,
        )
        codeA = rMe.json()["code"]

        # (b) Register provider referring codeA — send lowercase to verify
        # backend upper-cases it before persisting.
        emailB = _unique_email("refB_prov")
        rB = requests.post(
            f"{BASE_URL}/api/auth/register",
            json={
                "email": emailB, "password": "password123",
                "name": "Provider B", "role": "provider",
                "avatar_url": "https://example.com/p.jpg",
                "ref_code": codeA.lower(),
            },
            headers={"X-Forwarded-For": _fresh_ip()}, timeout=15,
        )
        assert rB.status_code == 200, rB.text
        tokenB = rB.json()["token"]
        providerB_id = rB.json()["user"]["id"]

        # (c) /auth/me on provider B should show referred_by_*
        meB = requests.get(
            f"{BASE_URL}/api/auth/me",
            headers={"Authorization": f"Bearer {tokenB}"}, timeout=15,
        ).json()
        assert meB.get("referred_by_user_id") == userA_id, meB
        assert meB.get("referred_by_code") == codeA.upper(), meB

        # (d) Trigger credit_referrer directly against Mongo — cleanest
        # way to verify without spinning up a fake escrow flow.
        from motor.motor_asyncio import AsyncIOMotorClient
        import sys
        # Ensure backend module dir is importable
        sys.path.insert(0, "/app/backend")
        from referrals import credit_referrer  # type: ignore

        mongo_url = os.environ.get("MONGO_URL")
        db_name = os.environ.get("DB_NAME") or "test_database"
        client = AsyncIOMotorClient(mongo_url)
        db = client[db_name]

        # Read customer A's wallet balance BEFORE payout
        async def _run():
            before = await db.users.find_one({"id": userA_id}, {"_id": 0, "wallet_balance": 1})
            rec = await credit_referrer(
                db, provider_id=providerB_id, provider_amount=100.0,
                source_type="job", source_id="TEST_iter38_src",
            )
            after = await db.users.find_one({"id": userA_id}, {"_id": 0, "wallet_balance": 1})
            earnings = await db.referral_earnings.find_one(
                {"referrer_user_id": userA_id, "source_id": "TEST_iter38_src"},
                {"_id": 0},
            )
            wtx = await db.wallet_transactions.find_one(
                {"user_id": userA_id, "ref_id": rec["id"] if rec else "___"},
                {"_id": 0},
            )
            notif = await db.notifications.find_one(
                {"user_id": userA_id, "type": "referral_earned"},
                sort=[("created_at", -1)],
                projection={"_id": 0},
            )
            return before, after, rec, earnings, wtx, notif

        before, after, rec, earnings, wtx, notif = asyncio.get_event_loop().run_until_complete(_run())
        assert rec is not None, "credit_referrer returned None"
        assert abs(rec["amount"] - round(100.0 / 900.0, 4)) < 1e-6, rec
        # Wallet balance delta ≈ 0.1111
        delta = float(after["wallet_balance"]) - float(before.get("wallet_balance") or 0)
        assert abs(delta - 0.1111) < 1e-4, f"wallet delta = {delta}"
        assert earnings is not None and earnings["source_user_id"] == providerB_id
        assert wtx is not None and wtx["reason"].startswith("Referral bonus")
        assert notif is not None and "earned" in notif["title"]

        # (e) /referrals/me aggregates
        rAgg = requests.get(
            f"{BASE_URL}/api/referrals/me",
            headers={"Authorization": f"Bearer {tokenA}"}, timeout=15,
        ).json()
        assert rAgg["total_earned"] >= 0.11, rAgg
        assert rAgg["events"] >= 1
        assert rAgg["referred_users"] >= 1
        assert rAgg["recent"] and "amount" in rAgg["recent"][0]

        client.close()


# ── 5. First-touch ref precedence (client-side is JS but the backend
#      accepts whatever the client passes — verify backend upper-cases) ─
class TestRefCodeCanonicalization:
    def test_ref_code_uppercased_and_stripped(self):
        # Register a "referrer"
        r0 = requests.post(
            f"{BASE_URL}/api/auth/register",
            json={"email": _unique_email("canon_ref"), "password": "password123",
                  "name": "Canon Ref", "role": "customer"},
            headers={"X-Forwarded-For": _fresh_ip()}, timeout=15,
        )
        tok = r0.json()["token"]
        code = requests.get(
            f"{BASE_URL}/api/referrals/me",
            headers={"Authorization": f"Bearer {tok}"}, timeout=15,
        ).json()["code"]

        # Register a referee with weird whitespace + lowercase
        r1 = requests.post(
            f"{BASE_URL}/api/auth/register",
            json={"email": _unique_email("canon_referee"), "password": "password123",
                  "name": "Referee", "role": "customer",
                  "ref_code": f"  {code.lower()}  "},
            headers={"X-Forwarded-For": _fresh_ip()}, timeout=15,
        )
        assert r1.status_code == 200, r1.text
        me = requests.get(
            f"{BASE_URL}/api/auth/me",
            headers={"Authorization": f"Bearer {r1.json()['token']}"}, timeout=15,
        ).json()
        # Note: current impl stores code as `(body.ref_code or "").strip().upper()`
        # which will keep the whitespace-around variant intact after upper()...
        # actually .strip() is called, so leading/trailing spaces removed.
        assert me.get("referred_by_code") == code.upper(), me

# Iteration 60: demo/test-data hiding on public listings, admin/owner bypass, service copilot
import os
import re
import uuid
import time
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL").rstrip("/")
TEST_RE = re.compile(r"(\.test|@test\.com|@example\.com)$", re.I)
DEMO_FLAGS = ("is_demo", "is_global_demo", "is_career_demo")

PUBLIC_EPS = ["/api/real-estate", "/api/autos", "/api/rentals", "/api/marketplace/listings",
              "/api/map/jobs", "/api/inventory", "/api/stores", "/api/restaurants"]

_tok = {}


def login(email, pw):
    if email in _tok:
        return _tok[email]
    r = requests.post(f"{BASE_URL}/api/auth/login", json={"email": email, "password": pw}, timeout=30)
    if r.status_code != 200:
        pytest.skip(f"login failed {email}: {r.status_code} {r.text[:200]}")
    _tok[email] = (r.json()["token"], r.json()["user"])
    return _tok[email]


def H(t):
    return {"Authorization": f"Bearer {t}"}


def is_demo_row(d):
    return any(d.get(f) is True for f in DEMO_FLAGS) or ("seeded" in d)


# --- Anonymous public listings: no demo rows ---
@pytest.mark.parametrize("ep", PUBLIC_EPS)
def test_anon_public_empty(ep):
    r = requests.get(f"{BASE_URL}{ep}", timeout=60)
    assert r.status_code == 200, r.text[:200]
    data = r.json()
    rows = data if isinstance(data, list) else data.get("items") or data.get("pins") or data.get("jobs") or []
    assert not any(is_demo_row(d) for d in rows if isinstance(d, dict))
    print(ep, "count", len(rows))
    assert len(rows) == 0, f"{ep} returned {len(rows)} rows anonymously"


def test_anon_search_marketplaces():
    r = requests.get(f"{BASE_URL}/api/search/marketplaces", params={"q": "a"}, timeout=60)
    assert r.status_code == 200
    data = r.json()
    total = 0
    if isinstance(data, dict):
        for k, v in data.items():
            if isinstance(v, list):
                total += len(v)
                assert not any(is_demo_row(x) for x in v if isinstance(x, dict))
    print("search totals", total, list(data.keys()) if isinstance(data, dict) else type(data))
    assert total == 0


def test_anon_jobs_open_only_real():
    r = requests.get(f"{BASE_URL}/api/jobs", params={"status": "open"}, timeout=60)
    assert r.status_code == 200
    jobs = r.json()
    print("open jobs anon", len(jobs))
    assert not any(is_demo_row(j) for j in jobs)
    no_src = [j for j in jobs if not j.get("source")]
    print("jobs w/o source:", len(no_src), [j.get("title") for j in no_src[:5]])
    # customer_id of real jobs must not be a test owner
    cust, _ = login("customer@lumo.test", "password123")
    cid = _tok["customer@lumo.test"][1]["id"]
    assert not any(j.get("customer_id") == cid for j in jobs)


# --- Admin sees everything ---
@pytest.mark.parametrize("ep,minimum", [("/api/real-estate", 15), ("/api/autos", 15), ("/api/rentals", 15),
                                         ("/api/marketplace/listings", 10), ("/api/map/jobs", 50)])
def test_admin_sees_all(ep, minimum):
    t, u = login("julius.a.mason@gmail.com", "Mason0123")
    assert u["role"] == "admin"
    r = requests.get(f"{BASE_URL}{ep}", headers=H(t), timeout=60)
    assert r.status_code == 200
    data = r.json()
    rows = data if isinstance(data, list) else data.get("items") or data.get("pins") or []
    print(ep, "admin count", len(rows))
    assert len(rows) >= minimum


# --- Owner sees own items ---
def test_owner_sees_own_jobs():
    t, u = login("customer@lumo.test", "password123")
    r = requests.get(f"{BASE_URL}/api/jobs", params={"customer_id": u["id"]}, headers=H(t), timeout=60)
    assert r.status_code == 200
    print("own jobs", len(r.json()))
    assert len(r.json()) > 0
    # anonymous with same filter -> hidden
    r2 = requests.get(f"{BASE_URL}/api/jobs", params={"customer_id": u["id"]}, timeout=60)
    assert r2.status_code == 200 and len(r2.json()) == 0


def test_owner_sees_own_listings_and_real_estate():
    t, u = login("julius.a.mason@gmail.com", "Mason0123")
    at = t
    # find a seller id and owner id via admin
    ls = requests.get(f"{BASE_URL}/api/marketplace/listings", headers=H(at), timeout=60).json()
    re_ = requests.get(f"{BASE_URL}/api/real-estate", headers=H(at), timeout=60).json()
    print("listing sellers", {x.get("seller_id") for x in ls}, "re owners", {x.get("owner_id") for x in re_})
    ct, cu = login("customer@lumo.test", "password123")
    pt, pu = login("provider@lumo.test", "password123")
    for tok, usr in ((ct, cu), (pt, pu)):
        mine_l = [x for x in ls if x.get("seller_id") == usr["id"]]
        if mine_l:
            r = requests.get(f"{BASE_URL}/api/marketplace/listings", params={"seller_id": usr["id"]}, headers=H(tok), timeout=60)
            assert len(r.json()) == len(mine_l)
            print("own listings ok", usr["email"], len(mine_l))
        mine_r = [x for x in re_ if x.get("owner_id") == usr["id"]]
        if mine_r:
            r = requests.get(f"{BASE_URL}/api/real-estate", params={"owner_id": usr["id"]}, headers=H(tok), timeout=60)
            assert len(r.json()) == len(mine_r)
            print("own re ok", usr["email"], len(mine_r))


# --- Non-admin non-owner ---
@pytest.mark.parametrize("ep", PUBLIC_EPS)
def test_provider_public_hidden(ep):
    t, u = login("provider@lumo.test", "password123")
    r = requests.get(f"{BASE_URL}{ep}", headers=H(t), timeout=60)
    assert r.status_code == 200
    data = r.json()
    rows = data if isinstance(data, list) else data.get("items") or data.get("pins") or []
    assert not any(is_demo_row(d) for d in rows if isinstance(d, dict))
    others = [d for d in rows if isinstance(d, dict) and d.get("owner_id", d.get("seller_id", d.get("customer_id"))) not in (None, u["id"])]
    print(ep, "provider sees", len(rows), "others", len(others))
    assert len(others) == 0


def test_provider_opportunities_hidden():
    t, u = login("provider@lumo.test", "password123")
    ct, cu = login("customer@lumo.test", "password123")
    r = requests.get(f"{BASE_URL}/api/provider/opportunities", headers=H(t), timeout=60)
    assert r.status_code == 200
    data = r.json()
    rows = data if isinstance(data, list) else data.get("jobs") or data.get("items") or []
    print("opps", len(rows))
    assert not any(is_demo_row(j) for j in rows)
    assert not any(j.get("customer_id") == cu["id"] for j in rows)


# --- Fresh non-test user listing is public ---
def test_fresh_user_real_estate_public():
    email = f"qa_{uuid.uuid4().hex[:8]}@gmail.com"
    r = requests.post(f"{BASE_URL}/api/auth/register",
                      json={"email": email, "password": "Passw0rd!x", "name": "QA Fresh", "role": "customer"}, timeout=30)
    assert r.status_code in (200, 201), r.text[:300]
    tok = r.json()["token"]
    body = {"title": "TEST_QA House", "description": "qa test", "listing_kind": "sale", "property_type": "house",
            "price": 250000, "bedrooms": 3, "bathrooms": 2, "sqft": 1500, "address": "1 Test St",
            "city": "Austin", "state": "TX", "zip": "78701"}
    c = requests.post(f"{BASE_URL}/api/real-estate", json=body, headers=H(tok), timeout=30)
    print("create", c.status_code, c.text[:300])
    assert c.status_code in (200, 201)
    lid = c.json()["id"]
    try:
        pub = requests.get(f"{BASE_URL}/api/real-estate", timeout=30).json()
        assert any(x["id"] == lid for x in pub), "fresh listing not public"
    finally:
        d = requests.delete(f"{BASE_URL}/api/real-estate/{lid}", headers=H(tok), timeout=30)
        print("delete", d.status_code)
        assert d.status_code in (200, 204)
    pub = requests.get(f"{BASE_URL}/api/real-estate", timeout=30).json()
    assert not any(x["id"] == lid for x in pub)


# --- Service copilot ---
def test_service_copilot_multi_turn():
    sid = f"qa-{uuid.uuid4().hex[:8]}"
    msgs = ["My kitchen sink is leaking under the cabinet", "It's a steady drip from the pipe, I need a plumber today",
            "Yes please book that"]
    history, pick = [], None
    for m in msgs:
        r = requests.post(f"{BASE_URL}/api/service-copilot", json={"session_id": sid, "message": m, "history": history}, timeout=120)
        assert r.status_code == 200, r.text[:300]
        d = r.json()
        assert isinstance(d["reply"], str) and d["session_id"] == sid and "pick" in d
        print("reply:", d["reply"][:150], "pick:", d["pick"])
        history += [{"role": "user", "content": m}, {"role": "assistant", "content": d["reply"]}]
        if d["pick"]:
            pick = d["pick"]
            break
    assert pick and pick.get("service_key")


def test_service_copilot_empty_message():
    r = requests.post(f"{BASE_URL}/api/service-copilot", json={"session_id": "x", "message": ""}, timeout=30)
    assert r.status_code == 400

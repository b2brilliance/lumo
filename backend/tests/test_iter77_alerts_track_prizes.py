# Iteration 77: alert settings + filtering, busy map, live order tracking, recruiter prizes
import os
import sys
import time
import uuid
from datetime import datetime, timezone, timedelta

import pytest
import requests
from pymongo import MongoClient
from dotenv import dotenv_values

sys.path.insert(0, "/app/backend")
from job_alerts import wants_alert  # noqa: E402

BASE_URL = (os.environ.get("REACT_APP_BACKEND_URL") or dotenv_values("/app/frontend/.env")["REACT_APP_BACKEND_URL"]).rstrip("/")
_benv = dotenv_values("/app/backend/.env")
mdb = MongoClient(_benv["MONGO_URL"])[_benv["DB_NAME"]]


def login(email, pw="password123"):
    r = requests.post(f"{BASE_URL}/api/auth/login", json={"email": email, "password": pw})
    assert r.status_code == 200, r.text
    return r.json()["token"], r.json()["user"]


def H(t):
    return {"Authorization": f"Bearer {t}"}


@pytest.fixture(scope="module")
def cust():
    return login("customer@lumo.test")


@pytest.fixture(scope="module")
def prov():
    return login("provider@lumo.test")


@pytest.fixture(scope="module")
def admin():
    return login("julius.a.mason@gmail.com", "Mason0123")


@pytest.fixture(scope="module", autouse=True)
def cleanup():
    p0 = mdb.users.find_one({"email": "provider@lumo.test"}, {"_id": 0, "alert_prefs": 1, "wallet_balance": 1})
    c0 = mdb.users.find_one({"email": "customer@lumo.test"}, {"_id": 0, "wallet_balance": 1})
    state = {"badges": [], "users": []}
    yield state
    if "alert_prefs" in (p0 or {}):
        mdb.users.update_one({"email": "provider@lumo.test"}, {"$set": {"alert_prefs": p0["alert_prefs"]}})
    else:
        mdb.users.update_one({"email": "provider@lumo.test"}, {"$unset": {"alert_prefs": ""}})
    mdb.users.update_one({"email": "provider@lumo.test"}, {"$set": {"wallet_balance": p0.get("wallet_balance", 0)}})
    mdb.users.update_one({"email": "customer@lumo.test"}, {"$set": {"wallet_balance": c0.get("wallet_balance", 0)}})
    mdb.jobs.delete_many({"title": {"$regex": "^TEST_"}})
    mdb.notifications.delete_many({"title": {"$regex": "TEST_"}})
    for b in state["badges"]:
        mdb.recruiter_badges.delete_one({"id": b})
        mdb.wallet_transactions.delete_many({"ref_id": b})
        mdb.notifications.delete_many({"type": "recruiter_prize_paid", "created_at": {"$gte": "2026"}, "body": {"$regex": "Thanks for growing"}})
    for o in mdb.orders.find({"store_name": {"$regex": "^TEST_"}}, {"id": 1}):
        mdb.notifications.delete_many({"order_id": o["id"]})
        mdb.wallet_transactions.delete_many({"ref_id": o["id"]})
    mdb.orders.delete_many({"store_name": {"$regex": "^TEST_"}})
    mdb.users.delete_many({"id": {"$in": state["users"]}})


DEFAULT = {"off_duty": False, "delivery_runs": True, "categories": [],
           "hours": {"enabled": False, "start": "08:00", "end": "20:00", "tz": "UTC"}}


# --- wants_alert unit logic
class TestWantsAlertUnit:
    def test_defaults(self):
        assert wants_alert(None, delivery=True, category=None)
        assert wants_alert({}, delivery=False, category="cleaning")

    def test_off_duty(self):
        assert not wants_alert({"off_duty": True}, delivery=True, category=None)
        assert not wants_alert({"off_duty": True}, delivery=False, category="delivery")

    def test_delivery_runs_flag_only_blocks_runs(self):
        p = {"delivery_runs": False}
        assert not wants_alert(p, delivery=True, category=None)
        assert wants_alert(p, delivery=False, category="delivery")

    def test_categories(self):
        p = {"categories": ["cleaning"]}
        assert wants_alert(p, delivery=False, category="cleaning")
        assert not wants_alert(p, delivery=False, category="delivery")
        assert wants_alert(p, delivery=True, category=None)

    def test_hours(self):
        now = datetime.now(timezone.utc)
        s = (now + timedelta(hours=2)).strftime("%H:%M")
        e = (now + timedelta(hours=3)).strftime("%H:%M")
        assert not wants_alert({"hours": {"enabled": True, "start": s, "end": e, "tz": "UTC"}}, delivery=True, category=None)
        s2 = (now - timedelta(hours=1)).strftime("%H:%M")
        e2 = (now + timedelta(hours=1)).strftime("%H:%M")
        assert wants_alert({"hours": {"enabled": True, "start": s2, "end": e2, "tz": "UTC"}}, delivery=True, category=None)


# --- GET/PUT alert-settings
class TestAlertSettingsApi:
    def test_get_defaults_and_skills(self, prov):
        r = requests.get(f"{BASE_URL}/api/provider/alert-settings", headers=H(prov[0]))
        assert r.status_code == 200
        d = r.json()
        assert d["skills"] == ["delivery"]
        for k in ("off_duty", "delivery_runs", "categories", "hours"):
            assert k in d

    def test_customer_forbidden(self, cust):
        assert requests.get(f"{BASE_URL}/api/provider/alert-settings", headers=H(cust[0])).status_code == 403
        assert requests.put(f"{BASE_URL}/api/provider/alert-settings", json=DEFAULT, headers=H(cust[0])).status_code == 403

    def test_put_persist(self, prov):
        body = {**DEFAULT, "off_duty": True, "categories": ["delivery"],
                "hours": {"enabled": True, "start": "09:00", "end": "17:30", "tz": "America/New_York"}}
        r = requests.put(f"{BASE_URL}/api/provider/alert-settings", json=body, headers=H(prov[0]))
        assert r.status_code == 200 and r.json()["skills"] == ["delivery"]
        g = requests.get(f"{BASE_URL}/api/provider/alert-settings", headers=H(prov[0])).json()
        assert g["off_duty"] is True and g["hours"]["tz"] == "America/New_York" and g["hours"]["end"] == "17:30"
        assert g["categories"] == ["delivery"]

    def test_invalid_time_422(self, prov):
        body = {**DEFAULT, "hours": {"enabled": True, "start": "25:00", "end": "20:00", "tz": "UTC"}}
        assert requests.put(f"{BASE_URL}/api/provider/alert-settings", json=body, headers=H(prov[0])).status_code == 422

    def test_invalid_tz_400(self, prov):
        body = {**DEFAULT, "hours": {"enabled": True, "start": "08:00", "end": "20:00", "tz": "Mars/Base"}}
        r = requests.put(f"{BASE_URL}/api/provider/alert-settings", json=body, headers=H(prov[0]))
        assert r.status_code == 400


def _job(tok, title, cat="delivery", lat=40.73, lng=-73.99):
    r = requests.post(f"{BASE_URL}/api/jobs", headers=H(tok), json={
        "title": title, "description": "test", "category": cat, "pay_rate": 20, "pay_unit": "flat",
        "pickup_location": {"lat": lat, "lng": lng, "address": "x"}})
    assert r.status_code == 200, r.text
    return r.json()


def _put(prov, **kw):
    body = {**DEFAULT, **kw}
    r = requests.put(f"{BASE_URL}/api/provider/alert-settings", json=body, headers=H(prov[0]))
    assert r.status_code == 200, r.text


def _alerts(uid, ref):
    time.sleep(2)
    return mdb.notifications.count_documents({"user_id": uid, "ref_id": ref, "type": "nearby_job"})


# --- end-to-end alert filtering on POST /api/jobs
class TestAlertFiltering:
    def test_on_duty_gets_alert(self, cust, prov):
        _put(prov)
        j = _job(cust[0], "TEST_a77 on duty")
        assert _alerts(prov[1]["id"], j["id"]) == 1

    def test_off_duty_no_alert(self, cust, prov):
        _put(prov, off_duty=True)
        j = _job(cust[0], "TEST_a77 off duty")
        assert _alerts(prov[1]["id"], j["id"]) == 0

    def test_delivery_runs_false_still_gets_service_job(self, cust, prov):
        _put(prov, delivery_runs=False)
        j = _job(cust[0], "TEST_a77 runs off")
        assert _alerts(prov[1]["id"], j["id"]) == 1

    def test_categories_restrict(self, cust, prov):
        _put(prov, categories=["cleaning"])
        j = _job(cust[0], "TEST_a77 cats")
        assert _alerts(prov[1]["id"], j["id"]) == 0

    def test_hours_outside_blocks(self, cust, prov):
        now = datetime.now(timezone.utc)
        _put(prov, hours={"enabled": True, "start": (now + timedelta(hours=2)).strftime("%H:%M"),
                          "end": (now + timedelta(hours=3)).strftime("%H:%M"), "tz": "UTC"})
        j = _job(cust[0], "TEST_a77 hours out")
        assert _alerts(prov[1]["id"], j["id"]) == 0

    def test_hours_inside_allows(self, cust, prov):
        now = datetime.now(timezone.utc)
        _put(prov, hours={"enabled": True, "start": (now - timedelta(hours=1)).strftime("%H:%M"),
                          "end": (now + timedelta(hours=1)).strftime("%H:%M"), "tz": "UTC"})
        j = _job(cust[0], "TEST_a77 hours in")
        assert _alerts(prov[1]["id"], j["id"]) == 1
        _put(prov)


# --- busy map
class TestBusyMap:
    def test_busy_map(self, cust, prov):
        before = requests.get(f"{BASE_URL}/api/provider/busy-map?tz=America/New_York", headers=H(prov[0]))
        assert before.status_code == 200
        b = before.json()
        assert {"since", "center", "radius_miles", "cells", "totals"} <= set(b)
        oid = "TEST-" + str(uuid.uuid4())
        mdb.orders.insert_one({"id": oid, "is_cart_order": True, "store_name": "TEST_Busy", "status": "paid",
                               "paid_at": datetime.now(timezone.utc).isoformat(),
                               "pickup_location": {"lat": 40.7411, "lng": -73.9897}})
        far = "TEST-" + str(uuid.uuid4())
        mdb.orders.insert_one({"id": far, "is_cart_order": True, "store_name": "TEST_BusyFar", "status": "paid",
                               "paid_at": datetime.now(timezone.utc).isoformat(),
                               "pickup_location": {"lat": 34.05, "lng": -118.24}})
        a = requests.get(f"{BASE_URL}/api/provider/busy-map?tz=America/New_York", headers=H(prov[0])).json()
        assert a["totals"]["orders"] == b["totals"]["orders"] + 1
        cell = [c for c in a["cells"] if c["lat"] == 40.74 and c["lng"] == -73.99]
        assert cell and cell[0]["orders"] >= 1 and cell[0]["total"] == cell[0]["orders"] + cell[0]["jobs"]
        assert a["totals"]["jobs"] >= 1  # TEST jobs posted above (today, NYC)

    def test_busy_map_customer_403(self, cust):
        assert requests.get(f"{BASE_URL}/api/provider/busy-map", headers=H(cust[0])).status_code == 403


def _cart_order(cust_id, store_id):
    oid = "TEST-" + str(uuid.uuid4())
    mdb.orders.insert_one({
        "id": oid, "is_cart_order": True, "fulfillment": "delivery", "status": "deposit_paid", "provider_id": None,
        "customer_id": cust_id, "store_id": store_id, "store_name": "TEST_TrackStore",
        "pickup_location": {"lat": 40.72, "lng": -74.0, "address": "1 Test St"},
        "delivery_address": {"address": "2 Drop Ave", "lat": 40.75, "lng": -73.98},
        "split": {"driver": 6}, "lines": [{"name": "Thing", "quantity": 1, "price_usd": 10}],
        "created_at": datetime.now(timezone.utc).isoformat()})
    return oid


# --- live order tracking
class TestTracking:
    def test_track_flow(self, cust, prov, admin):
        store = mdb.users.find_one({"email": "retailer@lumo.test"})
        oid = _cart_order(cust[1]["id"], store["id"])
        # ping before accepted -> 404
        r = requests.post(f"{BASE_URL}/api/orders/{oid}/location", json={"lat": 40.73, "lng": -73.99}, headers=H(prov[0]))
        assert r.status_code == 404
        t = requests.get(f"{BASE_URL}/api/orders/{oid}/track", headers=H(cust[0]))
        assert t.status_code == 200 and t.json()["status"] == "deposit_paid" and t.json()["eta_minutes"] is None
        r = requests.post(f"{BASE_URL}/api/orders/{oid}/accept_delivery", headers=H(prov[0]))
        assert r.status_code == 200, r.text
        r = requests.post(f"{BASE_URL}/api/orders/{oid}/location", json={"lat": 40.73, "lng": -73.99, "heading": 10}, headers=H(prov[0]))
        assert r.status_code == 200
        assert mdb.orders.find_one({"id": oid})["provider_live_location"]["lat"] == 40.73
        t = requests.get(f"{BASE_URL}/api/orders/{oid}/track", headers=H(cust[0])).json()
        assert t["status"] == "in_progress" and t["driver"]["lat"] == 40.73
        assert isinstance(t["eta_minutes"], int) and t["eta_minutes"] >= 1
        assert t["pickup"]["lat"] == 40.72 and t["dropoff"]["lat"] == 40.75 and t["is_driver"] is False
        assert requests.get(f"{BASE_URL}/api/orders/{oid}/track", headers=H(prov[0])).json()["is_driver"] is True
        assert requests.get(f"{BASE_URL}/api/orders/{oid}/track", headers=H(admin[0])).status_code == 200
        rt, _ = login("retailer@lumo.test")
        assert requests.get(f"{BASE_URL}/api/orders/{oid}/track", headers=H(rt)).status_code == 200
        other, _ = login("restaurant@lumo.test")
        assert requests.get(f"{BASE_URL}/api/orders/{oid}/track", headers=H(other)).status_code == 404
        assert requests.post(f"{BASE_URL}/api/orders/{oid}/location", json={"lat": 1, "lng": 1}, headers=H(other)).status_code in (403, 404)
        TestTracking.oid = oid

    def test_track_missing_404(self, cust):
        assert requests.get(f"{BASE_URL}/api/orders/nope-{uuid.uuid4()}/track", headers=H(cust[0])).status_code == 404


# --- recruiter prizes
class TestRecruiterPrizes:
    def test_public_leaderboard_shape(self):
        r = requests.get(f"{BASE_URL}/api/referrals/leaderboard")
        assert r.status_code == 200
        d = r.json()
        assert d["prizes"] == [100, 50, 25]
        acts = [x["active_recruits"] for x in d["rows"]]
        assert acts == sorted(acts, reverse=True)

    def test_activation_counts(self, cleanup):
        rec_email = f"test_rec_{uuid.uuid4().hex[:6]}@example.com"
        r = requests.post(f"{BASE_URL}/api/auth/register", json={"email": rec_email, "password": "password123", "name": "TEST_Recruiter Zed", "role": "customer"})
        assert r.status_code == 200, r.text
        rec = r.json()["user"]
        cleanup["users"].append(rec["id"])
        recruit_id = "TEST-u-" + uuid.uuid4().hex[:8]
        mdb.users.insert_one({"id": recruit_id, "email": f"{recruit_id}@example.com", "name": "TEST_Recruit",
                              "role": "retailer", "referred_by_user_id": rec["id"], "created_at": datetime.now(timezone.utc).isoformat()})
        cleanup["users"].append(recruit_id)
        mdb.orders.insert_one({"id": "TEST-" + str(uuid.uuid4()), "is_cart_order": True, "store_id": recruit_id,
                               "store_name": "TEST_ActStore", "status": "paid", "paid_at": datetime.now(timezone.utc).isoformat()})
        d = requests.get(f"{BASE_URL}/api/referrals/leaderboard?limit=100").json()
        row = [x for x in d["rows"] if x["name"] == "TEST_Recruiter Z."]
        assert row and row[0]["active_recruits"] == 1 and row[0]["recruits"] == 1

    def test_admin_prize_approve_and_decline(self, admin, cust, cleanup):
        bal0 = float(mdb.users.find_one({"id": cust[1]["id"]}).get("wallet_balance") or 0)
        b1, b2 = str(uuid.uuid4()), str(uuid.uuid4())
        mdb.recruiter_badges.insert_many([
            {"id": b1, "user_id": cust[1]["id"], "month": "2019-01", "rank": 3, "tier": "bronze", "jobs": 1, "recruits": 1,
             "active_recruits": 1, "prize_amount": 25.0, "prize_status": "pending_approval", "created_at": "2019-02-01T00:00:00+00:00"},
            {"id": b2, "user_id": cust[1]["id"], "month": "2019-02", "rank": 3, "tier": "bronze", "jobs": 1, "recruits": 1,
             "active_recruits": 1, "prize_amount": 25.0, "prize_status": "pending_approval", "created_at": "2019-03-01T00:00:00+00:00"}])
        cleanup["badges"] += [b1, b2]
        assert requests.get(f"{BASE_URL}/api/referrals/admin/prizes", headers=H(cust[0])).status_code in (401, 403)
        lst = requests.get(f"{BASE_URL}/api/referrals/admin/prizes", headers=H(admin[0]))
        assert lst.status_code == 200
        row = [x for x in lst.json() if x["id"] == b1]
        assert row and row[0]["email"] == "customer@lumo.test" and row[0]["prize_status"] == "pending_approval"
        r = requests.post(f"{BASE_URL}/api/referrals/admin/prizes/{b1}/approve", headers=H(admin[0]))
        assert r.status_code == 200 and r.json()["prize_status"] == "paid"
        bal1 = float(mdb.users.find_one({"id": cust[1]["id"]}).get("wallet_balance") or 0)
        assert abs(bal1 - bal0 - 25) < 0.001
        assert mdb.wallet_transactions.count_documents({"ref_id": b1, "amount": 25.0}) == 1
        r = requests.post(f"{BASE_URL}/api/referrals/admin/prizes/{b1}/approve", headers=H(admin[0]))
        assert r.status_code == 400
        assert abs(float(mdb.users.find_one({"id": cust[1]["id"]}).get("wallet_balance") or 0) - bal1) < 0.001
        r = requests.post(f"{BASE_URL}/api/referrals/admin/prizes/{b2}/decline", headers=H(admin[0]))
        assert r.status_code == 200 and mdb.recruiter_badges.find_one({"id": b2})["prize_status"] == "declined"
        assert mdb.wallet_transactions.count_documents({"ref_id": b2}) == 0
        assert requests.post(f"{BASE_URL}/api/referrals/admin/prizes/{b2}/approve", headers=H(admin[0])).status_code == 400
        assert requests.post(f"{BASE_URL}/api/referrals/admin/prizes/{b2}/foo", headers=H(admin[0])).status_code == 400

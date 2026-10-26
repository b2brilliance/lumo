# Iteration 76: nearby job alerts, delivery runs, delivered payout, rate prompt, app feedback
import os
import time
import uuid
from datetime import datetime, timezone, timedelta

import pytest
import requests
from pymongo import MongoClient
from dotenv import dotenv_values

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL") or dotenv_values("/app/frontend/.env")["REACT_APP_BACKEND_URL"]
BASE_URL = BASE_URL.rstrip("/")
_benv = dotenv_values("/app/backend/.env")
mdb = MongoClient(_benv["MONGO_URL"])[_benv["DB_NAME"]]


def login(email, pw="password123"):
    r = requests.post(f"{BASE_URL}/api/auth/login", json={"email": email, "password": pw})
    assert r.status_code == 200, r.text
    d = r.json()
    return d["token"], d["user"]


def H(t):
    return {"Authorization": f"Bearer {t}"}


@pytest.fixture(scope="module")
def cust():
    return login("customer@lumo.test")


@pytest.fixture(scope="module")
def prov():
    return login("provider@lumo.test")


@pytest.fixture(scope="module", autouse=True)
def cleanup():
    created_jobs, created_orders = [], []
    yield {"jobs": created_jobs, "orders": created_orders}
    mdb.jobs.delete_many({"title": {"$regex": "^TEST_"}})
    mdb.notifications.delete_many({"title": {"$regex": "TEST_"}})
    for oid in created_orders:
        mdb.notifications.delete_many({"order_id": oid})
        mdb.wallet_transactions.delete_many({"ref_id": oid})
    mdb.orders.delete_many({"store_name": {"$regex": "^TEST_"}})
    mdb.contact_submissions.delete_many({"message": {"$regex": "^TEST_"}})


def _job(tok, title, cat, lat, lng, remote=None):
    body = {"title": title, "description": "test", "category": cat, "pay_rate": 20, "pay_unit": "flat",
            "pickup_location": {"lat": lat, "lng": lng, "address": "x"}}
    if remote is not None:
        body["is_remote"] = remote
    r = requests.post(f"{BASE_URL}/api/jobs", json=body, headers=H(tok))
    assert r.status_code == 200, r.text
    return r.json()


def _notifs(uid, ref):
    return list(mdb.notifications.find({"user_id": uid, "ref_id": ref, "type": "nearby_job"}, {"_id": 0}))


# --- Nearby job alerts on POST /api/jobs
class TestJobAlerts:
    def test_provider_setup(self, prov):
        u = mdb.users.find_one({"email": "provider@lumo.test"})
        print("provider loc", u.get("location"), u.get("service_radius_miles"), u.get("categories"))
        assert u["location"]["lat"] is not None

    def test_delivery_job_nyc_alerts(self, cust, prov):
        j = _job(cust[0], "TEST_Delivery NYC", "delivery", 40.73, -73.99)
        time.sleep(2)
        n = _notifs(prov[1]["id"], j["id"])
        assert len(n) == 1
        assert n[0]["title"].startswith("New job near you: TEST_Delivery NYC")
        assert n[0]["link"] == f"/jobs/{j['id']}"
        assert "mi away" in n[0]["body"]

    def test_cleaning_job_no_alert(self, cust, prov):
        j = _job(cust[0], "TEST_Cleaning NYC", "cleaning", 40.73, -73.99)
        time.sleep(2)
        assert _notifs(prov[1]["id"], j["id"]) == []

    def test_delivery_job_la_no_alert(self, cust, prov):
        j = _job(cust[0], "TEST_Delivery LA", "delivery", 34.05, -118.24)
        time.sleep(2)
        assert _notifs(prov[1]["id"], j["id"]) == []

    def test_remote_job_no_alert(self, cust, prov):
        j = _job(cust[0], "TEST_Remote delivery", "delivery", 40.73, -73.99, remote=True)
        time.sleep(2)
        assert mdb.notifications.count_documents({"ref_id": j["id"]}) == 0

    def test_poster_not_alerted(self, prov):
        j = _job(prov[0], "TEST_Provider posts", "delivery", 40.73, -73.99)
        time.sleep(2)
        assert _notifs(prov[1]["id"], j["id"]) == []


def _insert_order(cust_id, lat=40.72, lng=-74.0, status="deposit_paid", provider_id=None):
    oid = "TEST-" + str(uuid.uuid4())
    mdb.orders.insert_one({
        "id": oid, "is_cart_order": True, "fulfillment": "delivery", "status": status, "provider_id": provider_id,
        "customer_id": cust_id, "customer_name": "Test Customer", "store_id": None, "store_name": "TEST_Store",
        "pickup_location": {"lat": lat, "lng": lng, "address": "1 Test St"},
        "delivery_address": {"address": "2 Drop Ave"}, "delivery_miles": 3.2, "size_class": "small",
        "lines": [{"quantity": 2}, {"quantity": 1}], "split": {"driver": 5.5},
        "created_at": datetime.now(timezone.utc).isoformat()})
    return oid


# --- Delivery runs list / accept / delivered
class TestDeliveryRuns:
    def test_runs_list_and_flow(self, cust, prov, cleanup):
        oid = _insert_order(cust[1]["id"])
        far = _insert_order(cust[1]["id"], 34.05, -118.24)
        cleanup["orders"] += [oid, far]
        r = requests.get(f"{BASE_URL}/api/provider/delivery-runs", headers=H(prov[0]))
        assert r.status_code == 200
        runs = {x["id"]: x for x in r.json()}
        assert oid in runs and far not in runs
        run = runs[oid]
        assert run["store_name"] == "TEST_Store" and run["items"] == 3 and run["payout"] == 5.5
        assert run["delivery_miles"] == 3.2 and isinstance(run["distance_miles"], float)
        # customer forbidden
        r = requests.get(f"{BASE_URL}/api/provider/delivery-runs", headers=H(cust[0]))
        assert r.status_code == 403
        # delivered before accept -> 404 (not assigned)
        r = requests.post(f"{BASE_URL}/api/orders/{oid}/delivered", headers=H(prov[0]))
        assert r.status_code == 404
        bal0 = float(mdb.users.find_one({"id": prov[1]["id"]}).get("wallet_balance") or 0)
        r = requests.post(f"{BASE_URL}/api/orders/{oid}/accept_delivery", headers=H(prov[0]))
        assert r.status_code == 200 and r.json()["status"] == "in_progress"
        assert mdb.notifications.find_one({"order_id": oid, "title": "A driver is on the way", "user_id": cust[1]["id"]})
        r = requests.get(f"{BASE_URL}/api/provider/delivery-runs", headers=H(prov[0]))
        assert oid not in [x["id"] for x in r.json()]
        r = requests.post(f"{BASE_URL}/api/orders/{oid}/delivered", headers=H(prov[0]))
        assert r.status_code == 200 and r.json()["payout"] == 5.5
        o = mdb.orders.find_one({"id": oid})
        assert o["status"] == "completed"
        bal1 = float(mdb.users.find_one({"id": prov[1]["id"]}).get("wallet_balance") or 0)
        assert abs(bal1 - bal0 - 5.5) < 0.001
        assert mdb.wallet_transactions.find_one({"ref_id": oid, "amount": 5.5})
        assert mdb.notifications.find_one({"order_id": oid, "title": "Your order was delivered"})
        # second delivered -> 400
        r = requests.post(f"{BASE_URL}/api/orders/{oid}/delivered", headers=H(prov[0]))
        assert r.status_code == 400
        # restore wallet
        mdb.users.update_one({"id": prov[1]["id"]}, {"$inc": {"wallet_balance": -5.5}})

    def test_delivered_other_provider_404(self, cust, prov, cleanup):
        oid = _insert_order(cust[1]["id"], status="in_progress", provider_id="someone-else")
        cleanup["orders"].append(oid)
        r = requests.post(f"{BASE_URL}/api/orders/{oid}/delivered", headers=H(prov[0]))
        assert r.status_code == 404


# --- Rate prompt + app feedback
class TestRatePrompt:
    def _reset(self, uid):
        mdb.users.update_one({"id": uid}, {"$unset": {"rate_prompt_at": "", "rate_prompt_answer": ""}})

    def test_prompt_flow(self, cust):
        uid = cust[1]["id"]
        self._reset(uid)
        has_done = bool(mdb.orders.find_one({"customer_id": uid, "status": "completed"}) or
                        mdb.jobs.find_one({"$or": [{"customer_id": uid}, {"provider_id": uid}], "status": "completed"}))
        r = requests.get(f"{BASE_URL}/api/me/rate-prompt", headers=H(cust[0]))
        assert r.status_code == 200
        assert r.json()["show"] == has_done
        for ans in ("later", "unhappy", "happy"):
            self._reset(uid)
            r = requests.post(f"{BASE_URL}/api/me/rate-prompt", json={"answer": ans}, headers=H(cust[0]))
            assert r.status_code == 200
            assert requests.get(f"{BASE_URL}/api/me/rate-prompt", headers=H(cust[0])).json()["show"] is False
        # happy never again even with old timestamp
        mdb.users.update_one({"id": uid}, {"$set": {"rate_prompt_at": "2020-01-01T00:00:00+00:00"}})
        assert requests.get(f"{BASE_URL}/api/me/rate-prompt", headers=H(cust[0])).json()["show"] is False
        # unhappy with old timestamp -> show again (cooldown expired)
        mdb.users.update_one({"id": uid}, {"$set": {"rate_prompt_answer": "unhappy"}})
        assert requests.get(f"{BASE_URL}/api/me/rate-prompt", headers=H(cust[0])).json()["show"] == has_done
        self._reset(uid)

    def test_prompt_false_for_new_user(self):
        email = f"test_rp_{uuid.uuid4().hex[:6]}@example.com"
        r = requests.post(f"{BASE_URL}/api/auth/register", json={"email": email, "password": "password123", "name": "TEST_rp", "role": "customer"})
        assert r.status_code == 200, r.text
        tok = r.json()["token"]
        assert requests.get(f"{BASE_URL}/api/me/rate-prompt", headers=H(tok)).json()["show"] is False
        mdb.users.delete_one({"email": email})

    def test_prompt_unauth(self):
        assert requests.get(f"{BASE_URL}/api/me/rate-prompt").status_code in (401, 403)

    def test_app_feedback(self, cust):
        r = requests.post(f"{BASE_URL}/api/me/app-feedback", json={"message": "TEST_feedback hello"}, headers=H(cust[0]))
        assert r.status_code == 200
        d = mdb.contact_submissions.find_one({"message": "TEST_feedback hello"})
        assert d and d["topic"] == "app_feedback" and d["email"] == "customer@lumo.test"
        r = requests.post(f"{BASE_URL}/api/me/app-feedback", json={"message": "x"}, headers=H(cust[0]))
        assert r.status_code == 422

    def test_admin_inbox_sees_feedback(self, cust):
        requests.post(f"{BASE_URL}/api/me/app-feedback", json={"message": "TEST_feedback inbox"}, headers=H(cust[0]))
        tok, _ = login("julius.a.mason@gmail.com", "Mason0123")
        found = False
        for path in ("/api/admin/contact", "/api/admin/contact-submissions", "/api/admin/contacts", "/api/admin/inbox"):
            r = requests.get(f"{BASE_URL}{path}", headers=H(tok))
            if r.status_code == 200:
                found = "TEST_feedback inbox" in r.text
                print("admin inbox path", path, found)
                break
        assert found


# --- Regression: native push loop marks notifications
def test_native_pushed_marked():
    nid = str(uuid.uuid4())
    u = mdb.users.find_one({"email": "customer@lumo.test"})
    mdb.notifications.insert_one({"id": nid, "user_id": u["id"], "type": "info", "title": "TEST_push", "body": "x",
                                  "read": False, "created_at": datetime.now(timezone.utc).isoformat()})
    ok = False
    for _ in range(25):
        time.sleep(2)
        n = mdb.notifications.find_one({"id": nid})
        if "native_pushed" in n:
            ok = True
            break
    mdb.notifications.delete_one({"id": nid})
    assert ok

# Seed/cleanup helper for iteration 77 UI tests: python seed_iter77_ui.py seed|cleanup
import sys
import uuid
from datetime import datetime, timezone

import requests
from dotenv import dotenv_values
from pymongo import MongoClient

BASE = dotenv_values("/app/frontend/.env")["REACT_APP_BACKEND_URL"].rstrip("/")
env = dotenv_values("/app/backend/.env")
db = MongoClient(env["MONGO_URL"])[env["DB_NAME"]]


def tok(e, p="password123"):
    return requests.post(f"{BASE}/api/auth/login", json={"email": e, "password": p}).json()["token"]


if sys.argv[1] == "seed":
    cust = db.users.find_one({"email": "customer@lumo.test"})
    store = db.users.find_one({"email": "retailer@lumo.test"})
    ids = []
    for _ in range(2):
        oid = "TEST-" + str(uuid.uuid4())
        db.orders.insert_one({
            "id": oid, "is_cart_order": True, "fulfillment": "delivery", "status": "deposit_paid", "provider_id": None,
            "customer_id": cust["id"], "store_id": store["id"], "store_name": "TEST_TrackStore",
            "pickup_location": {"lat": 40.72, "lng": -74.0, "address": "1 Test St"},
            "delivery_address": {"address": "2 Drop Ave", "lat": 40.75, "lng": -73.98}, "total": 16, "item_total": 10, "delivery_fee": 6, "delivery_miles": 2.1,
            "split": {"driver": 6}, "lines": [{"name": "Thing", "quantity": 1, "price_usd": 10}],
            "paid_at": datetime.now(timezone.utc).isoformat(),
            "created_at": datetime.now(timezone.utc).isoformat()})
        ids.append(oid)
    pt = tok("provider@lumo.test")
    h = {"Authorization": f"Bearer {pt}"}
    print(requests.post(f"{BASE}/api/orders/{ids[0]}/accept_delivery", headers=h).status_code)
    print(requests.post(f"{BASE}/api/orders/{ids[0]}/location", json={"lat": 40.73, "lng": -73.99}, headers=h).status_code)
    bid = str(uuid.uuid4())
    db.recruiter_badges.insert_one({"id": bid, "user_id": cust["id"], "month": "2019-01", "rank": 3, "tier": "bronze",
                                    "jobs": 1, "recruits": 1, "active_recruits": 1, "prize_amount": 25.0,
                                    "prize_status": "pending_approval", "created_at": "2019-02-01T00:00:00+00:00"})
    print("ACTIVE", ids[0], "OPEN", ids[1], "BADGE", bid)
else:
    for o in db.orders.find({"store_name": {"$regex": "^TEST_"}}, {"id": 1}):
        db.notifications.delete_many({"order_id": o["id"]})
        db.wallet_transactions.delete_many({"ref_id": o["id"]})
    db.orders.delete_many({"store_name": {"$regex": "^TEST_"}})
    for b in db.recruiter_badges.find({"month": "2019-01"}):
        db.wallet_transactions.delete_many({"ref_id": b["id"]})
    db.recruiter_badges.delete_many({"month": "2019-01"})
    db.notifications.delete_many({"type": "recruiter_prize_paid", "user_id": db.users.find_one({"email": "customer@lumo.test"})["id"]})
    db.users.update_one({"email": "customer@lumo.test"}, {"$set": {"wallet_balance": 1}})
    db.users.update_one({"email": "provider@lumo.test"}, {"$unset": {"alert_prefs": ""}, "$set": {"wallet_balance": 0}})
    print("cleaned")

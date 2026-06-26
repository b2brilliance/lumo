"""
Iter 26 — Notification filter + Marketing email opt-out tests.

Backend tests for:
  (1) GET /api/notifications honors notification_prefs.order_updates / job_matches
  (2) Notifications of un-mapped types are always returned regardless of prefs
  (3) POST /api/admin/subscribers/send-now honors notification_prefs.marketing_emails=false
      and reports `opted_out` count + skips the user in email_sends.
"""
import os
import uuid
import datetime as dt
import pytest
import requests
import pymongo

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL").rstrip("/")
API = f"{BASE_URL}/api"

MONGO_URL = os.environ.get("MONGO_URL", "mongodb://localhost:27017")
DB_NAME = os.environ.get("DB_NAME", "test_database")

CUSTOMER_EMAIL = "customer@lumo.test"
ADMIN_EMAIL = "admin@lumo.test"
PW = "password123"


# ───────────────────── helpers / fixtures ─────────────────────
@pytest.fixture(scope="module")
def db():
    cli = pymongo.MongoClient(MONGO_URL)
    return cli[DB_NAME]


def _login(email, password=PW):
    r = requests.post(f"{API}/auth/login", json={"email": email, "password": password}, timeout=15)
    assert r.status_code == 200, f"login failed for {email}: {r.status_code} {r.text}"
    return r.json()


@pytest.fixture(scope="module")
def customer():
    return _login(CUSTOMER_EMAIL)


@pytest.fixture(scope="module")
def admin():
    return _login(ADMIN_EMAIL)


def _auth(token):
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture(autouse=True)
def _restore_customer_prefs(customer):
    """After each test, restore customer notification_prefs to all-true defaults."""
    yield
    requests.patch(
        f"{API}/auth/me",
        headers=_auth(customer["token"]),
        json={"notification_prefs": {
            "order_updates": True,
            "job_matches": True,
            "marketing_emails": True,
            "blog_digest": True,
        }},
        timeout=15,
    )


# ───────────────────── Tests: notification filter ─────────────────────
class TestNotificationFilter:
    def _insert_notif(self, db, user_id, ntype):
        nid = f"TEST_{uuid.uuid4().hex[:10]}"
        db.notifications.insert_one({
            "id": nid,
            "user_id": user_id,
            "type": ntype,
            "title": f"test {ntype}",
            "body": "iter26 test notif",
            "read": False,
            "created_at": dt.datetime.utcnow().isoformat() + "Z",
        })
        return nid

    def _cleanup(self, db, nids):
        if nids:
            db.notifications.delete_many({"id": {"$in": nids}})

    def test_order_updates_false_filters_quote_received(self, db, customer):
        uid = customer["user"]["id"]
        # Disable order_updates
        r = requests.patch(
            f"{API}/auth/me",
            headers=_auth(customer["token"]),
            json={"notification_prefs": {
                "order_updates": False,
                "job_matches": True,
                "marketing_emails": True,
                "blog_digest": True,
            }},
            timeout=15,
        )
        assert r.status_code == 200
        assert r.json().get("notification_prefs", {}).get("order_updates") is False

        nid = self._insert_notif(db, uid, "quote_received")
        try:
            r = requests.get(f"{API}/notifications", headers=_auth(customer["token"]), timeout=15)
            assert r.status_code == 200
            ids = [n["id"] for n in r.json()]
            assert nid not in ids, "quote_received should have been FILTERED OUT when order_updates=false"

            # Re-enable order_updates
            r = requests.patch(
                f"{API}/auth/me",
                headers=_auth(customer["token"]),
                json={"notification_prefs": {
                    "order_updates": True,
                    "job_matches": True,
                    "marketing_emails": True,
                    "blog_digest": True,
                }},
                timeout=15,
            )
            assert r.status_code == 200

            r = requests.get(f"{API}/notifications", headers=_auth(customer["token"]), timeout=15)
            assert r.status_code == 200
            ids = [n["id"] for n in r.json()]
            assert nid in ids, "quote_received should be returned again after order_updates=true"
        finally:
            self._cleanup(db, [nid])

    @pytest.mark.parametrize("ntype", [
        "quote_accepted", "quote_declined",
        "rental_request", "rental_approved", "rental_declined",
        "order_delivered", "order_confirmed", "order_disputed",
        "order_auto_released", "delivery_marked",
    ])
    def test_all_order_update_types_filtered(self, db, customer, ntype):
        uid = customer["user"]["id"]
        # Disable order_updates
        requests.patch(
            f"{API}/auth/me",
            headers=_auth(customer["token"]),
            json={"notification_prefs": {"order_updates": False,
                                         "job_matches": True,
                                         "marketing_emails": True,
                                         "blog_digest": True}},
            timeout=15,
        )
        nid = self._insert_notif(db, uid, ntype)
        try:
            r = requests.get(f"{API}/notifications", headers=_auth(customer["token"]), timeout=15)
            assert r.status_code == 200
            ids = [n["id"] for n in r.json()]
            assert nid not in ids, f"{ntype} should be filtered out when order_updates=false"
        finally:
            self._cleanup(db, [nid])

    @pytest.mark.parametrize("ntype", [
        "new_message", "review_received", "review_cashback",
        "payout_sent", "stripe_payout",
    ])
    def test_unmapped_types_always_returned(self, db, customer, ntype):
        """Notifications NOT in NOTIF_TYPE_TO_PREF should always be returned."""
        uid = customer["user"]["id"]
        # Disable ALL prefs to prove these still come through
        requests.patch(
            f"{API}/auth/me",
            headers=_auth(customer["token"]),
            json={"notification_prefs": {"order_updates": False,
                                         "job_matches": False,
                                         "marketing_emails": False,
                                         "blog_digest": False}},
            timeout=15,
        )
        nid = self._insert_notif(db, uid, ntype)
        try:
            r = requests.get(f"{API}/notifications", headers=_auth(customer["token"]), timeout=15)
            assert r.status_code == 200
            ids = [n["id"] for n in r.json()]
            assert nid in ids, f"{ntype} (unmapped) must always be returned regardless of prefs"
        finally:
            self._cleanup(db, [nid])


# ───────────────────── Tests: marketing email opt-out ─────────────────────
class TestMarketingEmailOptOut:
    def test_opted_out_user_skipped_in_batch(self, db, customer, admin):
        # 1) Make sure the customer is subscribed (insert directly with proper schema).
        db.email_subscribers.update_one(
            {"email": CUSTOMER_EMAIL},
            {"$setOnInsert": {
                "id": f"TEST_{uuid.uuid4().hex[:10]}",
                "email": CUSTOMER_EMAIL,
                "status": "active",
                "source": "iter26_test",
                "unsubscribe_token": uuid.uuid4().hex,
                "subscribed_at": dt.datetime.utcnow().isoformat() + "+00:00",
            }},
            upsert=True,
        )

        # 2) Opt-out
        r = requests.patch(
            f"{API}/auth/me",
            headers=_auth(customer["token"]),
            json={"notification_prefs": {"order_updates": True,
                                         "job_matches": True,
                                         "marketing_emails": False,
                                         "blog_digest": True}},
            timeout=15,
        )
        assert r.status_code == 200
        assert r.json().get("notification_prefs", {}).get("marketing_emails") is False

        # 3) Send-now (admin)
        r = requests.post(
            f"{API}/admin/subscribers/send-now",
            headers=_auth(admin["token"]),
            json={"subject": "TEST_iter26 opt-out", "html": "<p>test</p>"},
            timeout=60,
        )
        assert r.status_code == 200, f"send-now failed: {r.status_code} {r.text}"
        data = r.json()
        print("send-now response:", data)
        assert "opted_out" in data, f"response missing opted_out field: {data}"
        assert data["opted_out"] >= 1, f"expected at least 1 opted_out user (customer), got: {data}"

        batch_id = data.get("batch_id")
        if batch_id:
            # Verify no email_sends row for this customer in this batch
            cnt = db.email_sends.count_documents(
                {"batch_id": batch_id, "email": CUSTOMER_EMAIL}
            )
            assert cnt == 0, f"customer should NOT be in email_sends for batch {batch_id} (found {cnt})"

    def test_marketing_emails_true_user_is_sent(self, db, customer, admin):
        # ensure subscribed (direct insert with proper schema)
        db.email_subscribers.update_one(
            {"email": CUSTOMER_EMAIL},
            {"$setOnInsert": {
                "id": f"TEST_{uuid.uuid4().hex[:10]}",
                "email": CUSTOMER_EMAIL,
                "status": "active",
                "source": "iter26_test",
                "unsubscribe_token": uuid.uuid4().hex,
                "subscribed_at": dt.datetime.utcnow().isoformat() + "+00:00",
            }},
            upsert=True,
        )
        # Opt back in
        r = requests.patch(
            f"{API}/auth/me",
            headers=_auth(customer["token"]),
            json={"notification_prefs": {"order_updates": True,
                                         "job_matches": True,
                                         "marketing_emails": True,
                                         "blog_digest": True}},
            timeout=15,
        )
        assert r.status_code == 200

        r = requests.post(
            f"{API}/admin/subscribers/send-now",
            headers=_auth(admin["token"]),
            json={"subject": "TEST_iter26 opt-in", "html": "<p>test</p>"},
            timeout=60,
        )
        assert r.status_code == 200
        data = r.json()
        batch_id = data.get("batch_id")
        print("opt-in batch:", data)
        if batch_id:
            # The customer SHOULD have an email_sends row (sent OR queued OR failed but attempted)
            cnt = db.email_sends.count_documents(
                {"batch_id": batch_id, "email": CUSTOMER_EMAIL}
            )
            assert cnt >= 1, f"customer should be in email_sends for batch {batch_id} (none found)"

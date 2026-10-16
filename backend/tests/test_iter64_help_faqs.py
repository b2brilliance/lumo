# Iteration 64: Help Center FAQs — public endpoint + admin CRUD for 'faq' content type
import os
import subprocess
import time
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL").rstrip("/")
ADMIN = {"email": "julius.a.mason@gmail.com", "password": "Mason0123"}
CUSTOMER = {"email": "customer@lumo.test", "password": "password123"}
TOPIC_KEYS = ["getting_started", "booking", "payments", "earning", "buying_selling",
              "rentals", "real_estate", "account", "troubleshooting"]


def _login(creds):
    r = requests.post(f"{BASE_URL}/api/auth/login", json=creds, timeout=20)
    if r.status_code != 200:
        pytest.skip(f"login failed {creds['email']}: {r.status_code} {r.text[:120]}")
    return r.json()["token"]


@pytest.fixture(scope="module")
def admin_h():
    return {"Authorization": f"Bearer {_login(ADMIN)}"}


@pytest.fixture(scope="module")
def cust_h():
    return {"Authorization": f"Bearer {_login(CUSTOMER)}"}


@pytest.fixture(scope="module")
def created():
    ids = []
    yield ids
    tok = _login(ADMIN)
    for i in ids:
        requests.delete(f"{BASE_URL}/api/admin/content/faq/{i}", headers={"Authorization": f"Bearer {tok}"})


def _public():
    r = requests.get(f"{BASE_URL}/api/help/faqs", timeout=20)
    assert r.status_code == 200
    return r.json()


# Public endpoint
class TestPublicFaqs:
    def test_shape_and_counts(self):
        d = _public()
        assert [t["key"] for t in d["topics"]] == TOPIC_KEYS
        assert all(t["label"] for t in d["topics"])
        assert len(d["faqs"]) >= 56, len(d["faqs"])
        assert all("_id" not in f for f in d["faqs"])
        pos = [f["position"] for f in d["faqs"]]
        assert pos == sorted(pos)
        assert {f["topic"] for f in d["faqs"]} == set(TOPIC_KEYS)

    def test_each_faq_fields(self):
        for f in _public()["faqs"]:
            assert f["id"] and f["question"] and f["answer"]
            assert f.get("is_active") is not False


# Admin CRUD
class TestAdminFaq:
    def test_types_include_faq(self, admin_h):
        r = requests.get(f"{BASE_URL}/api/admin/content/types", headers=admin_h)
        assert r.status_code == 200
        faq = next(t for t in r.json() if t["key"] == "faq")
        fields = {f["name"]: f for f in faq["fields"]}
        assert set(fields) == {"question", "answer", "topic", "position", "is_active"}
        assert fields["topic"]["kind"] == "select" and fields["topic"]["options"] == TOPIC_KEYS
        assert fields["position"]["kind"] == "int" and fields["is_active"]["kind"] == "bool"

    def test_non_admin_blocked(self, cust_h):
        for method, path in [("get", "/api/admin/content?type=faq"), ("post", "/api/admin/content/faq")]:
            r = getattr(requests, method)(f"{BASE_URL}{path}", headers=cust_h, json={"updates": {"question": "x"}})
            assert r.status_code in (401, 403)
        r = requests.get(f"{BASE_URL}/api/admin/content?type=faq")
        assert r.status_code in (401, 403)

    def test_list_sorted(self, admin_h):
        r = requests.get(f"{BASE_URL}/api/admin/content?type=faq&limit=500", headers=admin_h)
        assert r.status_code == 200
        items = r.json()["items"]
        assert len(items) >= 56
        keys = [(i["topic"], i["position"]) for i in items]
        assert keys == sorted(keys)

    def test_create_auto_position(self, admin_h, created):
        before = [f for f in _public()["faqs"] if f["topic"] == "payments"]
        maxpos = max(f["position"] for f in before)
        r = requests.post(f"{BASE_URL}/api/admin/content/faq", headers=admin_h,
                          json={"updates": {"question": "TEST_ how do refunds work?", "answer": "TEST_ answer", "topic": "payments"}})
        assert r.status_code == 200, r.text
        it = r.json()["item"]
        created.append(it["id"])
        assert it["position"] == maxpos + 1
        assert it["is_active"] is True
        pub = [f for f in _public()["faqs"] if f["id"] == it["id"]]
        assert pub and pub[0]["question"] == "TEST_ how do refunds work?"

    def test_create_requires_question(self, admin_h):
        r = requests.post(f"{BASE_URL}/api/admin/content/faq", headers=admin_h, json={"updates": {"answer": "x"}})
        assert r.status_code == 400

    def test_create_bad_topic(self, admin_h):
        r = requests.post(f"{BASE_URL}/api/admin/content/faq", headers=admin_h,
                          json={"updates": {"question": "TEST_ q", "topic": "nope"}})
        assert r.status_code == 400

    def test_patch_edit_reorder_hide(self, admin_h, created):
        fid = created[0]
        r = requests.patch(f"{BASE_URL}/api/admin/content/faq/{fid}", headers=admin_h,
                           json={"updates": {"question": "TEST_ edited", "topic": "account", "position": 0}})
        assert r.status_code == 200, r.text
        it = r.json()["item"]
        assert it["question"] == "TEST_ edited" and it["topic"] == "account" and it["position"] == 0
        pub = _public()["faqs"]
        acct = [f for f in pub if f["topic"] == "account"]
        assert acct[0]["id"] == fid  # position 0 sorts first within its topic
        r = requests.patch(f"{BASE_URL}/api/admin/content/faq/{fid}", headers=admin_h,
                           json={"updates": {"is_active": False}})
        assert r.status_code == 200 and r.json()["item"]["is_active"] is False
        assert fid not in [f["id"] for f in _public()["faqs"]]
        # still in admin list
        r = requests.get(f"{BASE_URL}/api/admin/content?type=faq&limit=500", headers=admin_h)
        assert fid in [i["id"] for i in r.json()["items"]]

    def test_delete(self, admin_h):
        r = requests.post(f"{BASE_URL}/api/admin/content/faq", headers=admin_h,
                          json={"updates": {"question": "TEST_ delete me", "answer": "a", "topic": "troubleshooting"}})
        fid = r.json()["item"]["id"]
        r = requests.delete(f"{BASE_URL}/api/admin/content/faq/{fid}", headers=admin_h)
        assert r.status_code == 200
        r = requests.delete(f"{BASE_URL}/api/admin/content/faq/{fid}", headers=admin_h)
        assert r.status_code == 404
        assert fid not in [f["id"] for f in _public()["faqs"]]

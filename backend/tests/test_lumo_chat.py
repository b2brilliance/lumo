"""Lumo chat + anti-poach sanitizer integration tests."""
import os
import uuid
import time
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL").rstrip("/")
API = f"{BASE_URL}/api"

CUSTOMER = {"email": "customer@lumo.test", "password": "password123"}
PROVIDER = {"email": "provider@lumo.test", "password": "password123"}
RETAILER = {"email": "retailer@lumo.test", "password": "password123"}


def _login(creds):
    r = requests.post(f"{API}/auth/login", json=creds, timeout=20)
    assert r.status_code == 200, f"{creds['email']}: {r.text}"
    d = r.json()
    return d["token"], d["user"]


def _h(t):
    return {"Authorization": f"Bearer {t}"}


def _register(role):
    email = f"TEST_{role}_{uuid.uuid4().hex[:8]}@lumo.test"
    r = requests.post(f"{API}/auth/register", json={
        "email": email, "password": "Passw0rd!", "name": f"TEST_{role}", "role": role
    }, timeout=20)
    assert r.status_code == 200, r.text
    d = r.json()
    return d["token"], d["user"]


def _create_job(ctoken, category="cleaning", title=None):
    payload = {
        "title": title or f"TEST_chat_{uuid.uuid4().hex[:6]}",
        "description": "chat-test job",
        "category": category,
        "pay_rate": 25.0, "pay_unit": "hour", "estimated_units": 2.0,
        "pickup_location": {"lat": 40.7128, "lng": -74.0060, "address": "NYC"},
    }
    r = requests.post(f"{API}/jobs", json=payload, headers=_h(ctoken), timeout=15)
    assert r.status_code == 200, r.text
    return r.json()


# ────── Sanitizer (unit-ish via POST) ──────
class TestSanitizer:
    def setup_method(self):
        self.ctoken, self.cust = _login(CUSTOMER)
        self.ptoken, self.prov = _login(PROVIDER)
        self.job = _create_job(self.ctoken)

    def _post(self, token, text, thread_provider_id=None):
        body = {"body": text}
        if thread_provider_id:
            body["thread_provider_id"] = thread_provider_id
        r = requests.post(f"{API}/jobs/{self.job['id']}/messages",
                          json=body, headers=_h(token), timeout=10)
        return r

    def test_phone_redacted(self):
        r = self._post(self.ptoken, "call me at 555-123-4567 anytime")
        assert r.status_code == 200
        d = r.json()
        assert d["redacted"] is True
        assert "555" not in d["body"]
        assert "[hidden]" in d["body"]

    def test_phone_plain_digits(self):
        r = self._post(self.ptoken, "call me at 5551234567")
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["redacted"] is True
        assert "5551234567" not in d["body"]

    def test_email_redacted(self):
        r = self._post(self.ptoken, "email me at test@example.com please")
        assert r.status_code == 200
        d = r.json()
        assert d["redacted"] is True
        assert "test@example.com" not in d["body"]

    def test_complex_email_redacted(self):
        r = self._post(self.ptoken, "reach me at john.doe+test@gmail.co.uk")
        assert r.status_code == 200
        d = r.json()
        assert d["redacted"] is True
        assert "gmail.co.uk" not in d["body"]

    def test_url_redacted(self):
        r = self._post(self.ptoken, "see https://signal.me/abc thanks")
        assert r.status_code == 200
        d = r.json()
        assert d["redacted"] is True
        assert "signal.me/abc" not in d["body"]

    def test_contact_word_whatsapp(self):
        r = self._post(self.ptoken, "WhatsApp me later")
        assert r.status_code == 200
        d = r.json()
        assert d["redacted"] is True
        assert "whatsapp" not in d["body"].lower()

    def test_multiple_contact_words(self):
        r = self._post(self.ptoken, "telegram or venmo or zelle works, or cashapp")
        assert r.status_code == 200
        d = r.json()
        assert d["redacted"] is True
        # All occurrences should be replaced
        low = d["body"].lower()
        assert "telegram" not in low
        assert "venmo" not in low
        assert "zelle" not in low
        assert "cashapp" not in low or "cash app" not in low
        assert d["body"].count("[hidden]") >= 3

    def test_instagram_redacted(self):
        r = self._post(self.ptoken, "find me on instagram")
        assert r.status_code == 200
        assert r.json()["redacted"] is True

    def test_clean_message_not_redacted(self):
        r = self._post(self.ptoken, "Sounds good, see you at 3pm")
        assert r.status_code == 200
        d = r.json()
        assert d["redacted"] is False
        assert d["body"] == "Sounds good, see you at 3pm"


# ────── Threading / Permissions ──────
class TestThreading:
    def test_provider_starts_thread_on_open_job(self):
        ctoken, _ = _login(CUSTOMER)
        ptoken, prov = _login(PROVIDER)
        job = _create_job(ctoken)
        r = requests.post(f"{API}/jobs/{job['id']}/messages",
                          json={"body": "hi, interested"}, headers=_h(ptoken), timeout=10)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["thread_provider_id"] == prov["id"]
        assert d["sender_id"] == prov["id"]

    def test_customer_reply_requires_thread_provider_id_on_open_job(self):
        ctoken, _ = _login(CUSTOMER)
        job = _create_job(ctoken)
        # customer posts WITHOUT thread_provider_id, no provider has messaged → 400
        r = requests.post(f"{API}/jobs/{job['id']}/messages",
                          json={"body": "hello"}, headers=_h(ctoken), timeout=10)
        assert r.status_code == 400
        assert "thread" in r.text.lower()

    def test_customer_reply_with_thread_provider_id(self):
        ctoken, _ = _login(CUSTOMER)
        ptoken, prov = _login(PROVIDER)
        job = _create_job(ctoken)
        # provider opens thread
        r1 = requests.post(f"{API}/jobs/{job['id']}/messages",
                           json={"body": "I can help"}, headers=_h(ptoken), timeout=10)
        assert r1.status_code == 200
        # customer replies referencing that provider
        r2 = requests.post(f"{API}/jobs/{job['id']}/messages",
                           json={"body": "great, what's your rate?", "thread_provider_id": prov["id"]},
                           headers=_h(ctoken), timeout=10)
        assert r2.status_code == 200, r2.text
        d = r2.json()
        assert d["thread_provider_id"] == prov["id"]
        assert d["sender_id"] != prov["id"]

    def test_get_messages_since(self):
        ctoken, _ = _login(CUSTOMER)
        ptoken, prov = _login(PROVIDER)
        job = _create_job(ctoken)
        requests.post(f"{API}/jobs/{job['id']}/messages",
                      json={"body": "first"}, headers=_h(ptoken), timeout=10)
        # capture cutoff
        time.sleep(1.1)
        cutoff = requests.get(f"{API}/jobs/{job['id']}/messages",
                              headers=_h(ptoken), timeout=10).json()[-1]["created_at"]
        # post a second
        time.sleep(0.2)
        requests.post(f"{API}/jobs/{job['id']}/messages",
                      json={"body": "second"}, headers=_h(ptoken), timeout=10)
        # since=cutoff should only return the second one
        # NOTE: use params= so requests URL-encodes '+' in timezone offset to %2B,
        # otherwise the server decodes '+' as space and the filter silently no-ops.
        new_msgs = requests.get(f"{API}/jobs/{job['id']}/messages",
                                params={"since": cutoff},
                                headers=_h(ptoken), timeout=10).json()
        assert len(new_msgs) == 1, new_msgs
        assert new_msgs[0]["body"] == "second"

        # customer can also poll if passing thread_provider_id
        cnew = requests.get(
            f"{API}/jobs/{job['id']}/messages",
            params={"since": cutoff, "thread_provider_id": prov["id"]},
            headers=_h(ctoken), timeout=10).json()
        assert len(cnew) == 1
        assert cnew[0]["body"] == "second"

    def test_threads_endpoint_for_customer(self):
        ctoken, _ = _login(CUSTOMER)
        # use TWO different providers — seeded + a freshly registered one
        p1tok, p1 = _login(PROVIDER)
        p2tok, p2 = _register("provider")
        job = _create_job(ctoken)
        requests.post(f"{API}/jobs/{job['id']}/messages",
                      json={"body": "provider 1 here"}, headers=_h(p1tok), timeout=10)
        requests.post(f"{API}/jobs/{job['id']}/messages",
                      json={"body": "provider 2 here"}, headers=_h(p2tok), timeout=10)
        r = requests.get(f"{API}/jobs/{job['id']}/threads", headers=_h(ctoken), timeout=10)
        assert r.status_code == 200, r.text
        threads = r.json()
        ids = {t["provider_id"] for t in threads}
        assert p1["id"] in ids
        assert p2["id"] in ids
        assert len(threads) >= 2

    def test_threads_endpoint_forbidden_to_other(self):
        ctoken, _ = _login(CUSTOMER)
        job = _create_job(ctoken)
        ptoken, _ = _login(PROVIDER)
        # provider tries to fetch threads — only the customer should be able
        r = requests.get(f"{API}/jobs/{job['id']}/threads", headers=_h(ptoken), timeout=10)
        assert r.status_code == 403

    def test_retailer_cannot_message_or_read(self):
        ctoken, _ = _login(CUSTOMER)
        ptoken, prov = _login(PROVIDER)
        job = _create_job(ctoken)
        # seed: provider opens a thread (so messages exist)
        requests.post(f"{API}/jobs/{job['id']}/messages",
                      json={"body": "hi"}, headers=_h(ptoken), timeout=10)
        rtoken, _ = _login(RETAILER)
        # POST
        rp = requests.post(f"{API}/jobs/{job['id']}/messages",
                           json={"body": "nosy"}, headers=_h(rtoken), timeout=10)
        assert rp.status_code == 403
        # GET
        rg = requests.get(f"{API}/jobs/{job['id']}/messages", headers=_h(rtoken), timeout=10)
        assert rg.status_code == 403

    def test_thread_locks_after_assignment(self):
        ctoken, _ = _login(CUSTOMER)
        p1tok, p1 = _login(PROVIDER)
        p2tok, p2 = _register("provider")
        job = _create_job(ctoken)
        # provider 1 messages while open
        r1 = requests.post(f"{API}/jobs/{job['id']}/messages",
                           json={"body": "interested"}, headers=_h(p1tok), timeout=10)
        assert r1.status_code == 200
        # provider 1 accepts the job → status becomes accepted, provider_id locked
        acc = requests.post(f"{API}/jobs/{job['id']}/accept", headers=_h(p1tok), timeout=10)
        assert acc.status_code == 200, acc.text
        # provider 2 now tries to post → should be 403
        r2 = requests.post(f"{API}/jobs/{job['id']}/messages",
                           json={"body": "me too"}, headers=_h(p2tok), timeout=10)
        assert r2.status_code == 403

        # provider 1 (assigned) can still post
        r3 = requests.post(f"{API}/jobs/{job['id']}/messages",
                           json={"body": "on my way"}, headers=_h(p1tok), timeout=10)
        assert r3.status_code == 200
        assert r3.json()["thread_provider_id"] == p1["id"]

    def test_empty_message_rejected(self):
        ctoken, _ = _login(CUSTOMER)
        ptoken, _ = _login(PROVIDER)
        job = _create_job(ctoken)
        r = requests.post(f"{API}/jobs/{job['id']}/messages",
                          json={"body": "   "}, headers=_h(ptoken), timeout=10)
        assert r.status_code == 400


# ────── Inbox ──────
class TestChatInbox:
    def test_inbox_returns_threads(self):
        ctoken, cust = _login(CUSTOMER)
        ptoken, prov = _login(PROVIDER)
        job = _create_job(ctoken, title=f"TEST_inbox_{uuid.uuid4().hex[:6]}")
        # seed messages
        requests.post(f"{API}/jobs/{job['id']}/messages",
                      json={"body": "ping"}, headers=_h(ptoken), timeout=10)
        requests.post(f"{API}/jobs/{job['id']}/messages",
                      json={"body": "pong", "thread_provider_id": prov["id"]},
                      headers=_h(ctoken), timeout=10)
        # customer inbox
        r = requests.get(f"{API}/chats/inbox", headers=_h(ctoken), timeout=10)
        assert r.status_code == 200
        items = r.json()
        match = [i for i in items if i["job_id"] == job["id"]]
        assert match, "Customer inbox should include the job thread"
        item = match[0]
        assert item["thread_provider_id"] == prov["id"]
        assert item["job_title"] == job["title"]
        assert "last_message" in item and "last_at" in item and "last_sender" in item

        # provider inbox
        rp = requests.get(f"{API}/chats/inbox", headers=_h(ptoken), timeout=10)
        assert rp.status_code == 200
        pitems = rp.json()
        assert any(i["job_id"] == job["id"] and i["thread_provider_id"] == prov["id"] for i in pitems)

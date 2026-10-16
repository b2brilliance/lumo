# Iteration 63: AI guide chat, price history + price-drop alerts (RE/listings/autos), watchlist, badges.
import os
import uuid
import pytest
import requests
from pymongo import MongoClient
from dotenv import dotenv_values

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL").rstrip("/")
API = f"{BASE_URL}/api"
ADMIN = ("julius.a.mason@gmail.com", "Mason0123")
_env = dotenv_values("/app/backend/.env")
_db = MongoClient(_env["MONGO_URL"])[_env["DB_NAME"]]
S = {}


def H(t):
    return {"Authorization": f"Bearer {t}"}


def _register(name):
    email = f"qa_{uuid.uuid4().hex[:8]}@gmail.com"
    r = requests.post(f"{API}/auth/register", json={"email": email, "password": "Passw0rd!", "name": name, "role": "customer"}, timeout=30)
    assert r.status_code == 200, r.text
    d = r.json()
    return {"email": email, "token": d["token"], "id": d["user"]["id"]}


@pytest.fixture(scope="session")
def admin_t():
    r = requests.post(f"{API}/auth/login", json={"email": ADMIN[0], "password": ADMIN[1]}, timeout=30)
    if r.status_code != 200:
        pytest.skip(f"admin login failed {r.status_code}")
    return r.json()["token"]


@pytest.fixture(scope="session")
def users(admin_t):
    owner, watcher, other = _register("QA63 Owner"), _register("QA63 Watcher"), _register("QA63 Other")
    yield {"owner": owner, "watcher": watcher, "other": other}
    for kind, coll in (("real_estate", "real_estate"), ("auto", "autos"), ("listing", "listings")):
        if S.get(kind):
            requests.delete(f"{API}/admin/content/{kind}/{S[kind]}", headers=H(admin_t), timeout=30)
            _db[coll].delete_one({"id": S[kind]})
    for u in (owner, watcher, other):
        _db.watchlist.delete_many({"user_id": u["id"]})
        _db.notifications.delete_many({"user_id": u["id"]})
        requests.delete(f"{API}/admin/users/{u['id']}", headers=H(admin_t), timeout=30)


def _pd_notifs(uid, item_id):
    return list(_db.notifications.find({"user_id": uid, "type": "price_drop", "item_id": item_id}, {"_id": 0}))


# ── Guide chat ────────────────────────────────────────────────────────────
class TestGuide:
    def test_anon_chat_links(self):
        r = requests.post(f"{API}/guide/chat", json={"message": "I want to rent a 2 bed apartment in Lisbon under 2000", "history": [], "path": "/"}, timeout=90)
        assert r.status_code == 200, r.text
        d = r.json()
        assert isinstance(d["reply"], str) and d["reply"]
        assert "LINK:" not in d["reply"]
        assert 1 <= len(d["links"]) <= 3, d
        for l in d["links"]:
            assert l["path"].startswith("/") and "://" not in l["path"]
        assert any(l["path"].startswith("/real-estate") for l in d["links"]), d["links"]
        print("anon guide:", d)

    def test_auth_chat_persists(self, users):
        t = users["other"]["token"]
        r = requests.post(f"{API}/guide/chat", json={"message": "Where can I find a plumber?", "history": [], "path": "/"}, headers=H(t), timeout=90)
        assert r.status_code == 200, r.text
        assert len(r.json()["links"]) >= 1
        h = requests.get(f"{API}/assistant/history", headers=H(t), timeout=30).json()
        assert len(h["messages"]) >= 2 and h["messages"][-1]["role"] == "assistant"
        assert "links" in h["messages"][-1]

    def test_empty_message_400(self):
        r = requests.post(f"{API}/guide/chat", json={"message": "   ", "history": [], "path": "/"}, timeout=30)
        assert r.status_code == 400

    def test_too_long_400(self):
        r = requests.post(f"{API}/guide/chat", json={"message": "a" * 1501, "history": [], "path": "/"}, timeout=30)
        assert r.status_code == 400

    def test_parse_links_whitelist(self):
        import sys
        sys.path.insert(0, "/app/backend")
        from server import _parse_guide_links
        reply, links = _parse_guide_links("Hello\nLINK: Rent | /real-estate?kind=rent\nLINK: Evil | https://evil.com\nLINK: Bad | /evilpath\nLINK: Shop | /shop")
        assert reply == "Hello"
        assert [l["path"] for l in links] == ["/real-estate?kind=rent", "/shop"]


# ── Price history ─────────────────────────────────────────────────────────
class TestPriceHistory:
    def test_create_listing_history(self, users):
        r = requests.post(f"{API}/marketplace/listings", json={"title": "QA_ Bike", "description": "QA bike", "price": 200, "category": "other"}, headers=H(users["owner"]["token"]))
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["price_history"][0]["price"] == 200 and d["price_history"][0]["event"] == "listed"
        S["listing"] = d["id"]

    def test_create_auto_history(self, users):
        r = requests.post(f"{API}/autos", json={"title": "QA_ Civic", "price": 10000, "year": 2018, "make": "Honda", "model": "Civic", "city": "Austin"}, headers=H(users["owner"]["token"]))
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["price_history"][0]["event"] == "listed"
        S["auto"] = d["id"]

    def test_create_re_history(self, users):
        r = requests.post(f"{API}/real-estate", json={"title": "QA_ Flat", "price": 300000, "address": "1 Main St", "city": "Austin", "country": "US"}, headers=H(users["owner"]["token"]))
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["price_history"][0]["price"] == 300000
        S["real_estate"] = d["id"]

    def test_watch_toggle_and_ids(self, users):
        w = users["watcher"]["token"]
        for kind in ("listing", "auto"):
            r = requests.post(f"{API}/watch/{kind}/{S[kind]}", headers=H(w))
            assert r.status_code == 200 and r.json()["watching"] is True
            ids = requests.get(f"{API}/watch/{kind}/ids", headers=H(w)).json()["ids"]
            assert S[kind] in ids
        # owner watches own listing too (should never get own alert)
        requests.post(f"{API}/watch/listing/{S['listing']}", headers=H(users["owner"]["token"]))
        r = requests.post(f"{API}/real-estate/favorites/{S['real_estate']}", headers=H(w))
        assert r.status_code == 200, r.text
        assert requests.post(f"{API}/watch/bogus/x", headers=H(w)).status_code == 400
        assert requests.post(f"{API}/watch/auto/nonexistent-id", headers=H(w)).status_code == 404

    def test_watch_toggle_off_on(self, users):
        w = users["watcher"]["token"]
        assert requests.post(f"{API}/watch/auto/{S['auto']}", headers=H(w)).json()["watching"] is False
        assert requests.post(f"{API}/watch/auto/{S['auto']}", headers=H(w)).json()["watching"] is True

    def test_non_owner_403_and_invalid_price(self, users):
        o = users["other"]["token"]
        assert requests.patch(f"{API}/marketplace/listings/{S['listing']}", json={"price": 100}, headers=H(o)).status_code == 403
        assert requests.patch(f"{API}/autos/{S['auto']}", json={"price": 100}, headers=H(o)).status_code == 403
        assert requests.patch(f"{API}/real-estate/{S['real_estate']}", json={"price": 100}, headers=H(o)).status_code == 403
        own = users["owner"]["token"]
        assert requests.patch(f"{API}/marketplace/listings/{S['listing']}", json={"price": 0}, headers=H(own)).status_code == 422
        assert requests.patch(f"{API}/autos/{S['auto']}", json={"price": -5}, headers=H(own)).status_code == 422

    def test_listing_drop_alerts_watcher_not_owner(self, users):
        r = requests.patch(f"{API}/marketplace/listings/{S['listing']}", json={"price": 150}, headers=H(users["owner"]["token"]))
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["price"] == 150 and d["previous_price"] == 200 and d["price_drop_pct"] == 25.0
        assert [h["event"] for h in d["price_history"]] == ["listed", "drop"]
        g = requests.get(f"{API}/marketplace/listings/{S['listing']}").json()
        assert g["price_drop_pct"] == 25.0
        n = _pd_notifs(users["watcher"]["id"], S["listing"])
        assert len(n) == 1 and n[0]["title"].startswith("Price drop:")
        assert _pd_notifs(users["owner"]["id"], S["listing"]) == []

    def test_listing_increase_clears_no_alert(self, users):
        r = requests.patch(f"{API}/marketplace/listings/{S['listing']}", json={"price": 180}, headers=H(users["owner"]["token"]))
        d = r.json()
        assert d["previous_price"] is None and d["price_drop_pct"] is None
        assert d["price_history"][-1]["event"] == "increase"
        assert len(_pd_notifs(users["watcher"]["id"], S["listing"])) == 1

    def test_auto_drop_alert(self, users):
        r = requests.patch(f"{API}/autos/{S['auto']}", json={"price": 9000}, headers=H(users["owner"]["token"]))
        assert r.status_code == 200, r.text
        assert r.json()["price_drop_pct"] == 10.0
        g = requests.get(f"{API}/autos/{S['auto']}").json()
        assert g["previous_price"] == 10000 and len(g["price_history"]) == 2
        assert len(_pd_notifs(users["watcher"]["id"], S["auto"])) == 1

    def test_re_drop_alert(self, users):
        r = requests.patch(f"{API}/real-estate/{S['real_estate']}", json={"price": 270000}, headers=H(users["owner"]["token"]))
        assert r.status_code == 200, r.text
        g = requests.get(f"{API}/real-estate/{S['real_estate']}").json()
        assert g["price"] == 270000 and g["previous_price"] == 300000 and g["price_drop_pct"] == 10.0
        assert len(_pd_notifs(users["watcher"]["id"], S["real_estate"])) == 1
        # notification visible via API
        nl = requests.get(f"{API}/notifications", headers=H(users["watcher"]["token"])).json()
        items = nl if isinstance(nl, list) else nl.get("items") or nl.get("notifications") or []
        assert any(x.get("type") == "price_drop" for x in items), str(nl)[:300]

    def test_admin_patch_owner_endpoint(self, users, admin_t):
        r = requests.patch(f"{API}/autos/{S['auto']}", json={"price": 8500}, headers=H(admin_t))
        assert r.status_code == 200, r.text
        assert len(r.json()["price_history"]) == 3

    @pytest.mark.parametrize("kind", ["real_estate", "listing", "auto"])
    def test_admin_content_patch_records(self, users, admin_t, kind):
        coll = {"real_estate": "real_estate", "listing": "listings", "auto": "autos"}[kind]
        before = _db[coll].find_one({"id": S[kind]})
        newp = round(before["price"] * 0.8)
        r = requests.patch(f"{API}/admin/content/{kind}/{S[kind]}", json={"updates": {"price": newp}}, headers=H(admin_t))
        assert r.status_code == 200, r.text
        after = _db[coll].find_one({"id": S[kind]})
        assert after["price"] == newp
        assert len(after["price_history"]) == len(before["price_history"]) + 1
        assert after["previous_price"] == before["price"]


# ── Badges ────────────────────────────────────────────────────────────────
class TestBadges:
    def test_badges_and_seen(self, users):
        uid = users["other"]["id"]
        _db.notifications.insert_one({"id": f"qa-{uuid.uuid4().hex}", "user_id": uid, "type": "new_message", "title": "QA", "read": False})
        t = users["other"]["token"]
        b = requests.get(f"{API}/me/badges", headers=H(t)).json()
        assert b["messages"] >= 1
        assert requests.post(f"{API}/me/messages/seen", headers=H(t)).status_code == 200
        assert requests.get(f"{API}/me/badges", headers=H(t)).json()["messages"] == 0

    def test_badges_unauth(self):
        assert requests.get(f"{API}/me/badges").status_code == 401

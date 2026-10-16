# Iteration 62: retest of iter61 fixes — saved-search validation + robust alerts, PATCH validation,
# legacy price_unit backfill, admin-content alerts + rental mirror sync, user delete cascade.
import os
import time
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


def _register():
    email = f"qa_{uuid.uuid4().hex[:8]}@gmail.com"
    r = requests.post(f"{API}/auth/register", json={"email": email, "password": "Passw0rd!", "name": "QA62", "role": "customer"}, timeout=30)
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
    a, b = _register(), _register()
    yield {"a": a, "b": b}
    for u in (a, b):
        requests.delete(f"{API}/admin/users/{u['id']}", headers=H(admin_t), timeout=30)


class TestSavedSearchValidation:
    @pytest.mark.parametrize("filters", [
        {"min_price": "abc"}, {"kinds": ["bogus"]}, {"kinds": "sale"},
        {"bbox": {"north": 1, "south": 0}}, {"bbox": {"north": "x", "south": 0, "east": 1, "west": 0}},
    ])
    def test_bad_filters_422(self, users, filters):
        r = requests.post(f"{API}/real-estate/saved-searches", json={"name": "TEST_bad", "filters": filters}, headers=H(users["a"]["token"]))
        assert r.status_code == 422, r.text

    def test_valid_filters_ok(self, users):
        r = requests.post(f"{API}/real-estate/saved-searches", json={"name": "TEST_ok", "filters": {
            "kinds": ["sale", "rent", "short_stay", "room"], "min_price": "100", "bbox": {"north": 1, "south": 0, "east": 1, "west": 0}}},
            headers=H(users["a"]["token"]))
        assert r.status_code == 200, r.text
        f = r.json()["filters"]
        assert f["min_price"] == 100.0 and len(f["kinds"]) == 4 and f["bbox"]["east"] == 1.0
        requests.delete(f"{API}/real-estate/saved-searches/{r.json()['id']}", headers=H(users["a"]["token"]))


class TestRobustAlerts:
    def test_malformed_db_row_does_not_block(self, users):
        a, b = users["a"], users["b"]
        bad_id = str(uuid.uuid4())
        # malformed row inserted directly, created first so it's iterated first
        _db.re_saved_searches.insert_one({"id": bad_id, "user_id": a["id"], "name": "TEST_bad_db", "notify": True,
                                          "filters": {"min_price": "abc"}, "match_count": 0, "created_at": "2000-01-01"})
        bad2 = str(uuid.uuid4())
        _db.re_saved_searches.insert_one({"id": bad2, "user_id": a["id"], "name": "TEST_bad_bbox", "notify": True,
                                          "filters": {"bbox": {"north": 1}}, "match_count": 0, "created_at": "2000-01-01"})
        good = requests.post(f"{API}/real-estate/saved-searches", json={"name": "TEST_good", "filters": {"property_types": ["land"], "max_price": 2000}},
                             headers=H(a["token"])).json()
        r = requests.post(f"{API}/real-estate", headers=H(b["token"]), json={
            "listing_kind": "sale", "property_type": "land", "title": "TEST_ land62", "price": 1234,
            "address": "Nowhere", "lat": 5.0, "lng": 5.0}, timeout=30)
        assert r.status_code == 200, r.text
        S["land"] = r.json()["id"]
        time.sleep(3)
        ss = {s["id"]: s for s in requests.get(f"{API}/real-estate/saved-searches", headers=H(a["token"])).json()}
        _db.re_saved_searches.delete_many({"id": {"$in": [bad_id, bad2]}})
        requests.delete(f"{API}/real-estate/saved-searches/{good['id']}", headers=H(a["token"]))
        assert ss[good["id"]]["match_count"] == 1

    def test_patch_validation(self, users):
        t = users["b"]["token"]
        rid = S["land"]
        assert requests.patch(f"{API}/real-estate/{rid}", json={"price": "abc"}, headers=H(t)).status_code == 400
        r = requests.patch(f"{API}/real-estate/{rid}", json={"status": "rented"}, headers=H(t))
        assert r.status_code == 200 and r.json()["status"] == "rented"
        assert requests.patch(f"{API}/real-estate/{rid}", json={"status": "nope"}, headers=H(t)).status_code == 400
        r = requests.patch(f"{API}/real-estate/{rid}", json={"price": 1500}, headers=H(t))
        assert r.status_code == 200 and r.json()["price"] == 1500
        assert requests.get(f"{API}/real-estate/{rid}").json()["price"] == 1500
        assert requests.delete(f"{API}/real-estate/{rid}", headers=H(t)).status_code == 200


class TestBackfill:
    def test_legacy_units(self):
        missing_unit = _db.real_estate.count_documents({"price_unit": None})
        missing_cur = _db.real_estate.count_documents({"currency": None})
        assert missing_unit == 0 and missing_cur == 0
        assert _db.real_estate.count_documents({"listing_kind": "rent", "price_unit": "total"}) == 0
        assert _db.real_estate.count_documents({"listing_kind": "sale", "price_unit": {"$ne": "total"}}) == 0


class TestAdminContentHooks:
    def test_admin_re_create_fires_alert(self, users, admin_t):
        a = users["a"]
        ss = requests.post(f"{API}/real-estate/saved-searches", json={"name": "TEST_adm", "filters": {"q": "TEST_ADM62"}}, headers=H(a["token"])).json()
        r = requests.post(f"{API}/admin/content/real_estate", headers=H(admin_t), json={"updates": {
            "title": "TEST_ADM62 villa", "price": 999, "address": "x", "lat": 1, "lng": 1, "listing_kind": "sale"}})
        assert r.status_code == 200, r.text
        rid = r.json()["item"]["id"]
        time.sleep(2)
        got = [s for s in requests.get(f"{API}/real-estate/saved-searches", headers=H(a["token"])).json() if s["id"] == ss["id"]][0]
        notes = requests.get(f"{API}/notifications", headers=H(a["token"])).json()
        notes = notes if isinstance(notes, list) else notes.get("items", notes.get("notifications", []))
        requests.delete(f"{API}/admin/content/real_estate/{rid}", headers=H(admin_t))
        requests.delete(f"{API}/real-estate/saved-searches/{ss['id']}", headers=H(a["token"]))
        assert got["match_count"] == 1
        assert any(n.get("listing_id") == rid for n in notes)

    def test_rental_mirror_sync(self, admin_t):
        r = requests.post(f"{API}/admin/content/rental", headers=H(admin_t), json={"updates": {
            "title": "TEST_mirror62", "category": "property", "subcategory": "apartment", "pricing": '{"monthly": 1800}', "status": "active"}})
        assert r.status_code == 200, r.text
        rid = r.json()["item"]["id"]
        m = _db.real_estate.find_one({"source_rental_id": rid})
        assert m and m["price"] == 1800 and m["listing_kind"] == "rent" and m["price_unit"] == "month"
        r = requests.patch(f"{API}/admin/content/rental/{rid}", headers=H(admin_t), json={"updates": {"title": "TEST_mirror62b", "pricing": {"daily": 120}}})
        assert r.status_code == 200
        m = _db.real_estate.find_one({"source_rental_id": rid})
        assert m["title"] == "TEST_mirror62b" and m["listing_kind"] == "short_stay" and m["price_unit"] == "night"
        assert requests.delete(f"{API}/admin/content/rental/{rid}", headers=H(admin_t)).status_code == 200
        assert _db.real_estate.count_documents({"source_rental_id": rid}) == 0

    def test_rental_bulk_delete_mirror(self, admin_t):
        ids = []
        for i in range(2):
            r = requests.post(f"{API}/admin/content/rental", headers=H(admin_t), json={"updates": {
                "title": f"TEST_bulk62_{i}", "category": "property", "pricing": {"monthly": 1000 + i}}})
            assert r.status_code == 200
            ids.append(r.json()["item"]["id"])
        assert _db.real_estate.count_documents({"source_rental_id": {"$in": ids}}) == 2
        r = requests.post(f"{API}/admin/content/bulk-delete", headers=H(admin_t), json={"type": "rental", "ids": ids})
        assert r.status_code == 200 and r.json()["deleted_count"] == 2
        assert _db.real_estate.count_documents({"source_rental_id": {"$in": ids}}) == 0

    def test_bulk_delete_other_type(self, admin_t):
        r = requests.post(f"{API}/admin/content/blog_post", headers=H(admin_t), json={"updates": {"title": "TEST_blog62"}})
        bid = r.json()["item"]["id"]
        r = requests.post(f"{API}/admin/content/bulk-delete", headers=H(admin_t), json={"type": "blog_post", "ids": [bid]})
        assert r.status_code == 200 and r.json()["deleted_count"] == 1


class TestUserCascade:
    def _seed(self, u):
        ss = requests.post(f"{API}/real-estate/saved-searches", json={"name": "TEST_c", "filters": {}}, headers=H(u["token"]))
        assert ss.status_code == 200
        lid = _db.real_estate.find_one({}, {"id": 1})["id"]
        assert requests.post(f"{API}/real-estate/favorites/{lid}", headers=H(u["token"])).json()["favorited"] is True

    def test_single_delete(self, admin_t):
        u = _register()
        self._seed(u)
        assert requests.delete(f"{API}/admin/users/{u['id']}", headers=H(admin_t)).status_code == 200
        assert _db.re_saved_searches.count_documents({"user_id": u["id"]}) == 0
        assert _db.re_favorites.count_documents({"user_id": u["id"]}) == 0

    def test_bulk_delete(self, admin_t):
        us = [_register(), _register()]
        for u in us:
            self._seed(u)
        ids = [u["id"] for u in us]
        r = requests.post(f"{API}/admin/users/bulk-delete", headers=H(admin_t), json={"ids": ids})
        assert r.status_code == 200 and r.json()["deleted_count"] == 2
        assert _db.re_saved_searches.count_documents({"user_id": {"$in": ids}}) == 0
        assert _db.re_favorites.count_documents({"user_id": {"$in": ids}}) == 0

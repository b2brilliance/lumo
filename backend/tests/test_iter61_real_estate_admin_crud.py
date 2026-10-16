# Iteration 61: Real-estate module (map/search/bbox, saved searches+alerts, favorites, geo),
# admin full CRUD (content types + users), demo purge preview/guards (never runs real purge).
import os
import time
import uuid
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL").rstrip("/")
API = f"{BASE_URL}/api"
ADMIN = ("julius.a.mason@gmail.com", "Mason0123")
CUSTOMER = ("customer@lumo.test", "password123")
_state = {}


def _login(email, pw):
    r = requests.post(f"{API}/auth/login", json={"email": email, "password": pw}, timeout=30)
    if r.status_code != 200:
        pytest.skip(f"login failed {email}: {r.status_code} {r.text[:200]}")
    return r.json()["token"]


def _register():
    email = f"qa_{uuid.uuid4().hex[:8]}@gmail.com"
    r = requests.post(f"{API}/auth/register", json={"email": email, "password": "Passw0rd!", "name": "QA RE", "role": "customer"}, timeout=30)
    assert r.status_code == 200, r.text
    d = r.json()
    return {"email": email, "token": d["token"], "id": d["user"]["id"]}


def H(t):
    return {"Authorization": f"Bearer {t}"}


@pytest.fixture(scope="session")
def admin_t():
    return _login(*ADMIN)


@pytest.fixture(scope="session")
def cust_t():
    return _login(*CUSTOMER)


@pytest.fixture(scope="session")
def users(admin_t):
    a, b = _register(), _register()
    yield {"a": a, "b": b}
    for u in (a, b):
        requests.delete(f"{API}/admin/users/{u['id']}", headers=H(admin_t), timeout=30)


# ── Real-estate list / filters / privacy
class TestRealEstateList:
    def test_anon_no_demo(self):
        r = requests.get(f"{API}/real-estate", params={"limit": 500}, timeout=30)
        assert r.status_code == 200
        assert not any(d.get("is_demo") for d in r.json())

    def test_admin_sees_demo_and_no_contact(self, admin_t):
        r = requests.get(f"{API}/real-estate", params={"limit": 500}, headers=H(admin_t), timeout=30)
        docs = r.json()
        print("admin count", len(docs))
        assert len(docs) >= 20
        for d in docs:
            assert not ({"owner_email", "contact_email", "contact_phone"} & set(d)), d.get("id")

    def test_short_stay_merged(self, admin_t):
        r = requests.get(f"{API}/real-estate", params={"listing_kind": "short_stay"}, headers=H(admin_t), timeout=30)
        docs = r.json()
        assert len(docs) == 2, len(docs)
        assert all(d.get("source_rental_id") and d.get("price_unit") == "night" for d in docs)

    def test_kind_multi_and_sort(self, admin_t):
        r = requests.get(f"{API}/real-estate", params={"listing_kind": "sale,rent", "sort": "price_asc"}, headers=H(admin_t), timeout=30)
        docs = r.json()
        assert docs and all(d["listing_kind"] in ("sale", "rent") for d in docs)
        prices = [d["price"] for d in docs]
        assert prices == sorted(prices)
        r = requests.get(f"{API}/real-estate", params={"sort": "price_desc"}, headers=H(admin_t), timeout=30)
        p = [d["price"] for d in r.json()]
        assert p == sorted(p, reverse=True)

    def test_price_beds_baths_type(self, admin_t):
        r = requests.get(f"{API}/real-estate", params={"min_price": 1000, "max_price": 900000, "min_beds": 2, "min_baths": 1,
                                                       "property_type": "house,condo"}, headers=H(admin_t), timeout=30)
        for d in r.json():
            assert 1000 <= d["price"] <= 900000 and d["bedrooms"] >= 2 and d["bathrooms"] >= 1
            assert d["property_type"] in ("house", "condo")

    def test_q_regex_escaped(self, admin_t):
        r = requests.get(f"{API}/real-estate", params={"q": "(.*[", "limit": 5}, headers=H(admin_t), timeout=30)
        assert r.status_code == 200 and r.json() == []

    def test_bbox_and_antimeridian(self, admin_t):
        r = requests.get(f"{API}/real-estate", params={"north": 34.4, "south": 33.6, "east": -117.6, "west": -118.7}, headers=H(admin_t), timeout=30)
        assert r.status_code == 200
        for d in r.json():
            assert 33.6 <= d["lat"] <= 34.4 and -118.7 <= d["lng"] <= -117.6
        r2 = requests.get(f"{API}/real-estate", params={"north": 80, "south": -80, "east": -100, "west": 100}, headers=H(admin_t), timeout=30)
        assert r2.status_code == 200
        for d in r2.json():
            assert d["lng"] >= 100 or d["lng"] <= -100

    def test_country(self, admin_t):
        r = requests.get(f"{API}/real-estate", params={"country": "us"}, headers=H(admin_t), timeout=30)
        assert r.status_code == 200
        assert all((d.get("country") or "").upper() == "US" for d in r.json())


class TestGeo:
    def test_geo_search(self):
        r = requests.get(f"{API}/geo/search", params={"q": "Lisbon"}, timeout=30)
        assert r.status_code == 200
        rows = r.json()
        assert rows, "empty geo result"
        g = rows[0]
        assert {"label", "lat", "lng", "bbox", "country_code"} <= set(g)
        assert set(g["bbox"]) == {"north", "south", "east", "west"}


# ── Saved searches, alerts, create/patch listing, favorites
class TestSavedSearchFlow:
    def test_saved_search_crud_and_alert(self, users):
        a, b = users["a"], users["b"]
        filters = {"kinds": ["sale"], "max_price": 500000, "bbox": {"north": 39.0, "south": 38.5, "east": -8.9, "west": -9.5}}
        r = requests.post(f"{API}/real-estate/saved-searches", json={"name": "TEST_lisbon", "filters": filters}, headers=H(a["token"]), timeout=30)
        assert r.status_code == 200, r.text
        sid = r.json()["id"]
        _state["sid"] = sid
        assert any(s["id"] == sid for s in requests.get(f"{API}/real-estate/saved-searches", headers=H(a["token"])).json())
        # matching listing by B (geocoded Lisbon)
        r = requests.post(f"{API}/real-estate", headers=H(b["token"]), json={
            "listing_kind": "sale", "property_type": "condo", "title": "TEST_ Lisbon flat", "price": 300000,
            "address": "Praça do Comércio", "city": "Lisbon", "country": "PT", "currency": "eur", "bedrooms": 2, "bathrooms": 1}, timeout=40)
        assert r.status_code == 200, r.text
        d = r.json()
        _state["re_id"] = d["id"]
        assert d["lat"] is not None and d["lng"] is not None, "geocode failed"
        assert 38.5 < d["lat"] < 39.0
        assert d["price_unit"] == "total" and d["currency"] == "EUR"
        # non-matching listing (over max price)
        time.sleep(1.2)
        r2 = requests.post(f"{API}/real-estate", headers=H(b["token"]), json={
            "listing_kind": "rent", "property_type": "apartment", "title": "TEST_ Lisbon rent", "price": 2000,
            "address": "Rua Augusta", "city": "Lisbon", "country": "PT"}, timeout=40)
        assert r2.status_code == 200
        _state["re_id2"] = r2.json()["id"]
        assert r2.json()["price_unit"] == "month"
        time.sleep(3)
        notes = requests.get(f"{API}/notifications", headers=H(a["token"])).json()
        notes = notes if isinstance(notes, list) else notes.get("items", notes.get("notifications", []))
        matches = [n for n in notes if n.get("type") == "saved_search_match"]
        ids = {n.get("listing_id") for n in matches}
        assert _state["re_id"] in ids
        assert _state["re_id2"] not in ids
        ss = [s for s in requests.get(f"{API}/real-estate/saved-searches", headers=H(a["token"])).json() if s["id"] == sid][0]
        assert ss["match_count"] == 1
        # patch + delete
        r = requests.patch(f"{API}/real-estate/saved-searches/{sid}", json={"notify": False}, headers=H(a["token"]))
        assert r.status_code == 200 and r.json()["notify"] is False
        assert requests.patch(f"{API}/real-estate/saved-searches/{sid}", json={"notify": True}, headers=H(b["token"])).status_code == 404
        assert requests.delete(f"{API}/real-estate/saved-searches/{sid}", headers=H(a["token"])).status_code == 200
        assert requests.delete(f"{API}/real-estate/saved-searches/{sid}", headers=H(a["token"])).status_code == 404

    def test_short_stay_unit_default(self, users):
        r = requests.post(f"{API}/real-estate", headers=H(users["b"]["token"]), json={
            "listing_kind": "short_stay", "property_type": "apartment", "title": "TEST_ stay", "price": 90,
            "address": "1 Test St", "lat": 10.0, "lng": 10.0, "max_guests": 3}, timeout=30)
        assert r.status_code == 200 and r.json()["price_unit"] == "night"
        _state["re_id3"] = r.json()["id"]

    def test_patch_owner_and_non_owner(self, users):
        rid = _state["re_id"]
        r = requests.patch(f"{API}/real-estate/{rid}", json={"status": "pending"}, headers=H(users["b"]["token"]))
        assert r.status_code == 200 and r.json()["status"] == "pending"
        assert requests.patch(f"{API}/real-estate/{rid}", json={"status": "bogus"}, headers=H(users["b"]["token"])).status_code == 400
        assert requests.patch(f"{API}/real-estate/{rid}", json={"status": "sold"}, headers=H(users["a"]["token"])).status_code == 403
        requests.patch(f"{API}/real-estate/{rid}", json={"status": "active"}, headers=H(users["b"]["token"]))

    def test_public_detail_hides_contact(self, users):
        r = requests.get(f"{API}/real-estate/{_state['re_id']}")
        assert r.status_code == 200
        assert "owner_email" not in r.json() and r.json().get("seller_email_masked")

    def test_favorites_toggle(self, users):
        t = users["a"]["token"]
        rid = _state["re_id"]
        r = requests.post(f"{API}/real-estate/favorites/{rid}", headers=H(t))
        assert r.json()["favorited"] is True
        f = requests.get(f"{API}/real-estate/favorites", headers=H(t)).json()
        assert rid in f["ids"] and f["items"][0]["id"] == rid and "owner_email" not in f["items"][0]
        assert requests.post(f"{API}/real-estate/favorites/{rid}", headers=H(t)).json()["favorited"] is False
        assert rid not in requests.get(f"{API}/real-estate/favorites", headers=H(t)).json()["ids"]
        assert requests.post(f"{API}/real-estate/favorites/nope-id", headers=H(t)).status_code == 404

    def test_malformed_saved_search_does_not_block_others(self, users):
        # A saved search with garbage filters must not break alerts for other saved searches
        a, b = users["a"], users["b"]
        bad = requests.post(f"{API}/real-estate/saved-searches", json={"name": "TEST_bad", "filters": {"min_price": "abc"}}, headers=H(a["token"])).json()
        good = requests.post(f"{API}/real-estate/saved-searches", json={"name": "TEST_good", "filters": {"property_types": ["land"], "max_price": 2000}}, headers=H(a["token"])).json()
        r = requests.post(f"{API}/real-estate", headers=H(b["token"]), json={
            "listing_kind": "sale", "property_type": "land", "title": "TEST_ land parcel", "price": 1234,
            "address": "Nowhere", "lat": 5.0, "lng": 5.0}, timeout=30)
        assert r.status_code == 200, r.text
        _state["re_id4"] = r.json()["id"]
        time.sleep(3)
        ss = {s["id"]: s for s in requests.get(f"{API}/real-estate/saved-searches", headers=H(a["token"])).json()}
        for sid in (bad.get("id"), good.get("id")):
            if sid:
                requests.delete(f"{API}/real-estate/saved-searches/{sid}", headers=H(a["token"]))
        assert ss[good["id"]]["match_count"] == 1, "valid saved search was not notified (bad filter broke the loop?)"

    def test_regex_params_no_500(self, admin_t):
        assert requests.get(f"{API}/real-estate", params={"state": "("}).status_code == 200
        assert requests.get(f"{API}/autos", params={"city": "("}).status_code == 200
        assert requests.get(f"{API}/admin/content", params={"type": "blog_post", "q": "("}, headers=H(admin_t)).status_code == 200

    def test_cleanup_listings(self, users):
        for k in ("re_id", "re_id2", "re_id3", "re_id4"):
            if _state.get(k):
                r = requests.delete(f"{API}/real-estate/{_state[k]}", headers=H(users["b"]["token"]))
                assert r.status_code == 200
        assert requests.get(f"{API}/real-estate/{_state['re_id']}").status_code == 404


# ── Admin content CRUD
class TestAdminContent:
    def test_types(self, admin_t):
        r = requests.get(f"{API}/admin/content/types", headers=H(admin_t))
        keys = [t["key"] for t in r.json()]
        assert set(keys) == {"listing", "real_estate", "rental", "auto", "inventory", "job", "shop_product", "blog_post", "recruit_city"}
        for t in r.json():
            assert all({"name", "kind", "options"} <= set(f) for f in t["fields"])

    def test_non_admin_forbidden(self, cust_t):
        assert requests.get(f"{API}/admin/content/types", headers=H(cust_t)).status_code in (401, 403)
        assert requests.post(f"{API}/admin/content/blog_post", json={"updates": {"title": "x"}}, headers=H(cust_t)).status_code in (401, 403)
        assert requests.get(f"{API}/admin/content/types").status_code in (401, 403)

    def test_blog_post_crud(self, admin_t):
        r = requests.post(f"{API}/admin/content/blog_post", json={"updates": {"title": "TEST Blog Post QA", "tags": "a, b", "status": "draft"}}, headers=H(admin_t))
        assert r.status_code == 200, r.text
        it = r.json()["item"]
        assert it["slug"] == "test-blog-post-qa" and it["tags"] == ["a", "b"]
        bad = requests.post(f"{API}/admin/content/blog_post", json={"updates": {"title": "X", "status": "nope"}}, headers=H(admin_t))
        assert bad.status_code == 400
        p = requests.patch(f"{API}/admin/content/blog_post/{it['id']}", json={"updates": {"excerpt": "edited"}}, headers=H(admin_t))
        assert p.status_code == 200 and p.json()["item"]["excerpt"] == "edited"
        lst = requests.get(f"{API}/admin/content", params={"type": "blog_post", "q": "TEST Blog Post QA"}, headers=H(admin_t)).json()
        assert any(x["id"] == it["id"] for x in lst["items"])
        assert requests.delete(f"{API}/admin/content/blog_post/{it['id']}", headers=H(admin_t)).status_code == 200
        assert requests.delete(f"{API}/admin/content/blog_post/{it['id']}", headers=H(admin_t)).status_code == 404

    def test_recruit_city_crud(self, admin_t):
        r = requests.post(f"{API}/admin/content/recruit_city", json={"updates": {"city": "Testville QA", "state": "TX", "goal_workers": "12.0", "bonus_amount": "50", "neighborhoods": "A,B"}}, headers=H(admin_t))
        assert r.status_code == 200, r.text
        it = r.json()["item"]
        assert it["slug"] == "testville-qa-tx" and it["goal_workers"] == 12 and it["bonus_amount"] == 50.0 and it["is_active"] is True
        assert requests.patch(f"{API}/admin/content/recruit_city/{it['id']}", json={"updates": {"is_active": "false"}}, headers=H(admin_t)).json()["item"]["is_active"] is False
        assert requests.delete(f"{API}/admin/content/recruit_city/{it['id']}", headers=H(admin_t)).status_code == 200

    def test_job_and_rental_json(self, admin_t):
        r = requests.post(f"{API}/admin/content/rental", json={"updates": {"title": "TEST rental", "pricing": '{"daily": 10}', "is_demo": "true"}}, headers=H(admin_t))
        assert r.status_code == 200, r.text
        it = r.json()["item"]
        assert it["pricing"] == {"daily": 10} and it["is_demo"] is True and it["owner_id"]
        assert requests.post(f"{API}/admin/content/rental", json={"updates": {"title": "x", "pricing": "{bad"}}, headers=H(admin_t)).status_code == 400
        requests.delete(f"{API}/admin/content/rental/{it['id']}", headers=H(admin_t))
        j = requests.post(f"{API}/admin/content/job", json={"updates": {"title": "TEST job", "pay_rate": "20"}}, headers=H(admin_t))
        assert j.status_code == 200 and j.json()["item"]["status"] == "open"
        requests.delete(f"{API}/admin/content/job/{j.json()['item']['id']}", headers=H(admin_t))

    def test_bulk_delete_route(self, admin_t):
        # Route-order check: POST /content/{type} is registered before /content/bulk-delete
        r = requests.post(f"{API}/admin/content/bulk-delete", json={"type": "blog_post", "ids": []}, headers=H(admin_t))
        print("bulk-delete", r.status_code, r.text[:200])
        assert r.status_code == 200, r.text


class TestAdminUsers:
    def test_create_patch_user(self, admin_t):
        email = f"qa_adm_{uuid.uuid4().hex[:6]}@gmail.com"
        assert requests.post(f"{API}/admin/users", json={"email": email, "name": "Q", "password": "123"}, headers=H(admin_t)).status_code in (400, 422)
        assert requests.post(f"{API}/admin/users", json={"email": email, "name": "Q", "password": "123456", "role": "retailer"}, headers=H(admin_t)).status_code == 400
        r = requests.post(f"{API}/admin/users", json={"email": email, "name": "Q", "password": "123456", "role": "provider"}, headers=H(admin_t))
        assert r.status_code == 200, r.text
        uid = r.json()["user"]["id"]
        assert "password_hash" not in r.json()["user"]
        try:
            assert requests.post(f"{API}/admin/users", json={"email": email.upper(), "name": "Q", "password": "123456"}, headers=H(admin_t)).status_code == 400
            p = requests.patch(f"{API}/admin/users/{uid}", json={"phone": "+15550001111", "password": "NewPass99"}, headers=H(admin_t))
            assert p.status_code == 200 and p.json()["user"]["phone"] == "+15550001111"
            lg = requests.post(f"{API}/auth/login", json={"email": email, "password": "NewPass99"})
            assert lg.status_code == 200 and lg.json()["user"]["role"] == "provider"
        finally:
            requests.delete(f"{API}/admin/users/{uid}", headers=H(admin_t))


class TestPurgeGuards:
    def test_preview(self, admin_t):
        r = requests.get(f"{API}/admin/demo/purge-preview", headers=H(admin_t))
        assert r.status_code == 200
        d = r.json()
        print("preview", d)
        assert isinstance(d["collections"], dict) and isinstance(d["test_users"], int) and d["total"] >= d["test_users"]

    def test_bad_confirm(self, admin_t):
        assert requests.post(f"{API}/admin/demo/purge", json={"confirm": "purge"}, headers=H(admin_t)).status_code == 400

    def test_non_admin(self, cust_t):
        assert requests.get(f"{API}/admin/demo/purge-preview", headers=H(cust_t)).status_code in (401, 403)
        assert requests.post(f"{API}/admin/demo/purge", json={"confirm": "x"}, headers=H(cust_t)).status_code in (401, 403)

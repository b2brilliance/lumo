# Iteration 65: global markets, catalog feeds, admin feeds, AI ad kits, sitemap global URLs
import csv
import io
import os
import random
import string
import xml.etree.ElementTree as ET

import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL").rstrip("/")
ADMIN = {"email": "julius.a.mason@gmail.com", "password": "Mason0123"}
RAND = "".join(random.choices(string.ascii_lowercase + string.digits, k=8))
G = "{http://base.google.com/ns/1.0}"


@pytest.fixture(scope="session")
def admin_token():
    r = requests.post(f"{BASE_URL}/api/auth/login", json=ADMIN, timeout=30)
    if r.status_code != 200:
        pytest.skip(f"admin login failed {r.status_code} {r.text[:200]}")
    return r.json()["token"]


@pytest.fixture(scope="session")
def user_token():
    r = requests.post(f"{BASE_URL}/api/auth/register", json={
        "email": f"qa_{RAND}@gmail.com", "password": "Passw0rd!23", "name": f"QA {RAND}", "role": "customer"}, timeout=30)
    if r.status_code not in (200, 201):
        pytest.skip(f"register failed {r.status_code} {r.text[:200]}")
    return r.json()["token"]


def H(t):
    return {"Authorization": f"Bearer {t}"}


# --- Markets payload
class TestMarkets:
    def test_markets(self):
        r = requests.get(f"{BASE_URL}/api/global/markets", timeout=30)
        assert r.status_code == 200
        d = r.json()
        assert len(d["regions"]) == 7
        assert len(d["verticals"]) == 5
        assert len(d["countries"]) == 50
        assert len(d["marketplaces"]) == 51
        ng = next(c for c in d["countries"] if c["code"] == "NG")
        for k in ("code", "slug", "name", "region", "lang", "currency", "cities", "marketplaces"):
            assert k in ng
        assert ng["slug"] == "nigeria" and ng["currency"] == "NGN"
        assert {"name": "Lagos", "slug": "lagos"} in ng["cities"]
        assert "jiji_ng" in ng["marketplaces"] and "fb_marketplace" in ng["marketplaces"]
        mp = d["marketplaces"][0]
        for k in ("key", "name", "countries", "post_url"):
            assert k in mp
        slugs = [c["slug"] for c in d["countries"]]
        assert len(set(slugs)) == 50


# --- Feeds with real user content
class TestFeeds:
    created = {}

    def test_empty_feeds_valid(self):
        for p in ("google-products.xml", "tiktok-products.xml", "meta-home-listings.xml", "meta-vehicles.xml"):
            r = requests.get(f"{BASE_URL}/api/feeds/{p}", timeout=30)
            assert r.status_code == 200, p
            assert "xml" in r.headers.get("content-type", "")
            ET.fromstring(r.content)
        r = requests.get(f"{BASE_URL}/api/feeds/meta-products.csv", timeout=30)
        assert r.status_code == 200
        assert r.text.splitlines()[0].strip() == "id,title,description,availability,condition,price,link,image_link,brand"

    def test_create_items(self, user_token):
        r = requests.post(f"{BASE_URL}/api/marketplace/listings", headers=H(user_token), json={
            "title": f"QA_{RAND} Bike & <Helmet>", "description": "QA feed test & more", "price": 120, "category": "sports"}, timeout=30)
        assert r.status_code == 200, r.text
        self.__class__.created["listing"] = r.json()["id"]
        r = requests.post(f"{BASE_URL}/api/real-estate", headers=H(user_token), json={
            "title": f"QA_{RAND} Flat & <View>", "price": 1500, "listing_kind": "rent", "property_type": "apartment",
            "address": "1 Test Street", "city": "Lagos", "country": "NG", "lat": 6.5, "lng": 3.4, "bedrooms": 2, "bathrooms": 1}, timeout=60)
        assert r.status_code == 200, r.text
        self.__class__.created["re"] = r.json()["id"]
        r = requests.post(f"{BASE_URL}/api/autos", headers=H(user_token), json={
            "title": f"QA_{RAND} Corolla & <Clean>", "price": 9000, "year": 2015, "make": "Toyota", "model": "Corolla",
            "mileage": 80000, "city": "Lagos", "country": "NG"}, timeout=30)
        assert r.status_code == 200, r.text
        self.__class__.created["auto"] = r.json()["id"]

    def test_google_tiktok_contain_listing(self):
        lid = self.created.get("listing")
        assert lid
        for p in ("google-products.xml", "tiktok-products.xml"):
            r = requests.get(f"{BASE_URL}/api/feeds/{p}", timeout=30)
            root = ET.fromstring(r.content)
            assert root.tag == "rss" and root.attrib["version"] == "2.0"
            items = root.findall("./channel/item")
            it = next((i for i in items if i.find(f"{G}id").text == f"listing-{lid}"), None)
            assert it is not None, p
            assert it.find("title").text == f"QA_{RAND} Bike & <Helmet>"
            assert it.find(f"{G}price").text == "120.00 USD"
            assert it.find("link").text.startswith("http") and lid in it.find("link").text
            assert it.find(f"{G}image_link").text.startswith("http")

    def test_meta_csv_contains_listing(self):
        r = requests.get(f"{BASE_URL}/api/feeds/meta-products.csv", timeout=30)
        rows = list(csv.DictReader(io.StringIO(r.text)))
        row = next((x for x in rows if x["id"] == f"listing-{self.created['listing']}"), None)
        assert row and row["price"] == "120.00 USD" and row["link"].startswith("http")
        assert row["title"] == f"QA_{RAND} Bike & <Helmet>"

    def test_meta_homes_contains(self):
        r = requests.get(f"{BASE_URL}/api/feeds/meta-home-listings.xml", timeout=30)
        root = ET.fromstring(r.content)
        assert root.tag == "listings"
        l = next((x for x in root.findall("listing") if x.find("home_listing_id").text == self.created["re"]), None)
        assert l is not None
        assert l.find("name").text == f"QA_{RAND} Flat & <View>"
        assert l.find("price").text == "1500.00 USD"
        assert l.find("availability").text == "for_rent"
        assert l.find("url").text.startswith("http")

    def test_meta_vehicles_contains(self):
        r = requests.get(f"{BASE_URL}/api/feeds/meta-vehicles.xml", timeout=30)
        root = ET.fromstring(r.content)
        l = next((x for x in root.findall("listing") if x.find("vehicle_id").text == self.created["auto"]), None)
        assert l is not None
        assert l.find("title").text == f"QA_{RAND} Corolla & <Clean>"
        assert l.find("price").text == "9000.00 USD"
        assert l.find("make").text == "Toyota"

    def test_admin_feeds_counts(self, admin_token):
        r = requests.get(f"{BASE_URL}/api/admin/feeds", headers=H(admin_token), timeout=30)
        assert r.status_code == 200
        d = r.json()
        assert len(d) == 5
        for f in d:
            for k in ("key", "name", "url", "items", "setup"):
                assert k in f
        by = {f["key"]: f for f in d}
        assert by["google"]["items"] >= 1 and by["meta_homes"]["items"] >= 1 and by["meta_vehicles"]["items"] >= 1

    def test_cleanup(self, user_token):
        r = requests.patch(f"{BASE_URL}/api/marketplace/listings/{self.created['listing']}", headers=H(user_token),
                           json={"status": "inactive"}, timeout=30)
        print("listing patch", r.status_code, r.text[:200])
        r2 = requests.delete(f"{BASE_URL}/api/real-estate/{self.created['re']}", headers=H(user_token), timeout=30)
        r3 = requests.delete(f"{BASE_URL}/api/autos/{self.created['auto']}", headers=H(user_token), timeout=30)
        assert r2.status_code == 200 and r3.status_code == 200
        g = requests.get(f"{BASE_URL}/api/feeds/meta-vehicles.xml", timeout=30).text
        assert self.created["auto"] not in g
        assert r.status_code == 200, f"listing deactivate failed: {r.status_code} {r.text[:200]}"
        g = requests.get(f"{BASE_URL}/api/feeds/google-products.xml", timeout=30).text
        assert self.created["listing"] not in g


# --- Admin auth guards & ad kits
class TestAdminAdKits:
    def test_feeds_guard(self, user_token):
        assert requests.get(f"{BASE_URL}/api/admin/feeds", timeout=30).status_code in (401, 403)
        assert requests.get(f"{BASE_URL}/api/admin/feeds", headers=H(user_token), timeout=30).status_code in (401, 403)
        assert requests.post(f"{BASE_URL}/api/admin/ad-kits/generate", headers=H(user_token),
                             json={"country": "KE", "marketplace": "jiji_ke"}, timeout=30).status_code in (401, 403)

    def test_bad_inputs(self, admin_token):
        r = requests.post(f"{BASE_URL}/api/admin/ad-kits/generate", headers=H(admin_token),
                          json={"country": "KE", "marketplace": "nope"}, timeout=30)
        assert r.status_code == 400
        r = requests.post(f"{BASE_URL}/api/admin/ad-kits/generate", headers=H(admin_token),
                          json={"country": "XX", "marketplace": "jiji_ke"}, timeout=30)
        assert r.status_code == 400
        for s in ("listing", "real_estate", "auto"):
            r = requests.post(f"{BASE_URL}/api/admin/ad-kits/generate", headers=H(admin_token),
                              json={"country": "KE", "marketplace": "jiji_ke", "subject": s, "item_id": "bad-id"}, timeout=30)
            assert r.status_code == 404, s

    @pytest.mark.parametrize("country,mp,lang,check", [
        ("KE", "jiji_ke", "sw", lambda t: any(w in t.lower() for w in ("na ", "kwa", "wa ", "ya "))),
        ("BR", "olx_br", "pt-BR", lambda t: any(w in t.lower() for w in (" para ", " você", " com ", " de "))),
        ("AE", "dubizzle_ae", "ar", lambda t: any("\u0600" <= ch <= "\u06ff" for ch in t)),
    ])
    def test_generate_and_delete(self, admin_token, country, mp, lang, check):
        r = requests.post(f"{BASE_URL}/api/admin/ad-kits/generate", headers=H(admin_token),
                          json={"country": country, "marketplace": mp, "subject": "platform"}, timeout=120)
        assert r.status_code == 200, r.text[:300]
        k = r.json()
        for f in ("id", "title", "body", "tags", "lang", "post_url", "link", "image"):
            assert f in k
        assert k["lang"] == lang
        assert check(k["title"] + " " + k["body"]), k["body"][:300]
        print(country, k["title"], "|", k["link"])
        lst = requests.get(f"{BASE_URL}/api/admin/ad-kits", headers=H(admin_token), timeout=30).json()
        assert any(x["id"] == k["id"] for x in lst)
        assert all("_id" not in x for x in lst)
        d = requests.delete(f"{BASE_URL}/api/admin/ad-kits/{k['id']}", headers=H(admin_token), timeout=30)
        assert d.status_code == 200
        lst = requests.get(f"{BASE_URL}/api/admin/ad-kits", headers=H(admin_token), timeout=30).json()
        assert not any(x["id"] == k["id"] for x in lst)


# --- Sitemap
def test_sitemap_global():
    r = requests.get(f"{BASE_URL}/api/sitemap.xml", timeout=60)
    assert r.status_code == 200
    t = r.text
    assert "/global</loc>" in t
    assert "/in/nigeria</loc>" in t
    assert "/in/nigeria/lagos/rentals</loc>" in t
    n = t.count("/in/")
    print("global /in/ urls:", n)
    assert n >= 1150

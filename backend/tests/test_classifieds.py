"""Classifieds (Real Estate + Auto Sales + Inquiries) backend tests."""
import os
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL") or open("/app/frontend/.env").read().split("REACT_APP_BACKEND_URL=")[1].split("\n")[0].strip()
API = BASE_URL.rstrip("/") + "/api"
PWD = "password123"


def _login(email):
    r = requests.post(f"{API}/auth/login", json={"email": email, "password": PWD}, timeout=20)
    assert r.status_code == 200, r.text
    return r.json()["token"]


@pytest.fixture(scope="module")
def customer_token():
    return _login("customer@lumo.test")


@pytest.fixture(scope="module")
def provider_token():
    return _login("provider@lumo.test")


@pytest.fixture(scope="module")
def customer_headers(customer_token):
    return {"Authorization": f"Bearer {customer_token}"}


@pytest.fixture(scope="module")
def provider_headers(provider_token):
    return {"Authorization": f"Bearer {provider_token}"}


# ── Constants ────────────────────────────────────────────────────────────────
def test_classifieds_constants():
    r = requests.get(f"{API}/classifieds/constants", timeout=20)
    assert r.status_code == 200
    d = r.json()
    for k in ("property_types", "auto_makes", "auto_body_styles", "auto_transmissions", "auto_fuels", "auto_conditions"):
        assert k in d and isinstance(d[k], list) and len(d[k]) > 0
    assert len(d["auto_makes"]) >= 35


# ── Real Estate list + seed count ────────────────────────────────────────────
def test_real_estate_list_seeded():
    r = requests.get(f"{API}/real-estate", timeout=20)
    assert r.status_code == 200
    items = r.json()
    assert len(items) >= 21, f"got {len(items)} listings"
    sample = items[0]
    for k in ("id", "title", "price", "photos", "bedrooms", "bathrooms", "sqft", "listing_kind", "property_type"):
        assert k in sample, f"missing {k}"
    assert isinstance(sample["photos"], list) and len(sample["photos"]) > 0


@pytest.mark.parametrize("params", [
    {"listing_kind": "rent"},
    {"listing_kind": "sale"},
    {"property_type": "condo"},
    {"min_price": 100000},
    {"max_price": 5000},  # likely rentals
    {"min_beds": 3},
])
def test_real_estate_filters(params):
    r = requests.get(f"{API}/real-estate", params=params, timeout=20)
    assert r.status_code == 200, r.text
    items = r.json()
    for it in items:
        if "listing_kind" in params:
            assert it["listing_kind"] == params["listing_kind"]
        if "property_type" in params:
            assert it["property_type"] == params["property_type"]
        if "min_price" in params:
            assert it["price"] >= params["min_price"]
        if "max_price" in params:
            assert it["price"] <= params["max_price"]
        if "min_beds" in params:
            assert (it.get("bedrooms") or 0) >= params["min_beds"]


def test_real_estate_q_and_city_filters():
    # find any city in the dataset and refilter
    items = requests.get(f"{API}/real-estate", timeout=20).json()
    cities = [i.get("city") for i in items if i.get("city")]
    if not cities:
        pytest.skip("no city data")
    target = cities[0]
    r = requests.get(f"{API}/real-estate", params={"city": target}, timeout=20)
    assert r.status_code == 200
    for it in r.json():
        assert it.get("city", "").lower() == target.lower()


def test_real_estate_detail_masks_contact():
    items = requests.get(f"{API}/real-estate", timeout=20).json()
    lid = items[0]["id"]
    r = requests.get(f"{API}/real-estate/{lid}", timeout=20)
    assert r.status_code == 200
    d = r.json()
    assert "seller_email_masked" in d
    assert d.get("contact_email") is None and "contact_email" not in d
    assert d.get("owner_email") is None and "owner_email" not in d
    assert "contact_phone" not in d
    if d.get("seller_email_masked"):
        assert "•" in d["seller_email_masked"] or "@" in d["seller_email_masked"]


# ── Real Estate CRUD with auth ───────────────────────────────────────────────
def test_real_estate_create_get_delete(customer_headers, provider_headers):
    payload = {
        "listing_kind": "sale",
        "property_type": "house",
        "title": "TEST_re house",
        "description": "x",
        "price": 425000,
        "address": "123 TEST",
        "city": "Lagos",
        "bedrooms": 3, "bathrooms": 2, "sqft": 1500,
        "photos": ["https://images.pexels.com/photos/1/x.jpg"],
        "contact_email": "owner_test@example.com",
        "contact_phone": "+1 555 123 4567",
    }
    r = requests.post(f"{API}/real-estate", json=payload, headers=customer_headers, timeout=20)
    assert r.status_code == 200, r.text
    lid = r.json()["id"]

    g = requests.get(f"{API}/real-estate/{lid}", timeout=20).json()
    assert g["title"] == "TEST_re house"
    assert "contact_email" not in g and "owner_email" not in g
    assert g["seller_phone_masked"] and "4567" in g["seller_phone_masked"]

    # 403: other user
    d403 = requests.delete(f"{API}/real-estate/{lid}", headers=provider_headers, timeout=20)
    assert d403.status_code == 403

    # owner delete works
    d = requests.delete(f"{API}/real-estate/{lid}", headers=customer_headers, timeout=20)
    assert d.status_code == 200
    g2 = requests.get(f"{API}/real-estate/{lid}", timeout=20)
    assert g2.status_code == 404


# ── Autos ────────────────────────────────────────────────────────────────────
def test_autos_list_seeded():
    r = requests.get(f"{API}/autos", timeout=20)
    assert r.status_code == 200
    items = r.json()
    assert len(items) >= 24, f"got {len(items)}"
    s = items[0]
    for k in ("id", "title", "price", "year", "make", "model", "photos"):
        assert k in s
    assert isinstance(s["photos"], list) and len(s["photos"]) > 0


@pytest.mark.parametrize("params,checker", [
    ({"make": "Tesla"}, lambda it: it["make"].lower() == "tesla"),
    ({"make": "Toyota"}, lambda it: it["make"].lower() == "toyota"),
    ({"min_year": 2020}, lambda it: it["year"] >= 2020),
    ({"max_year": 2024}, lambda it: it["year"] <= 2024),
    ({"max_mileage": 20000}, lambda it: (it.get("mileage") or 0) <= 20000),
    ({"fuel": "Electric"}, lambda it: it.get("fuel") == "Electric"),
    ({"body_style": "Truck"}, lambda it: it.get("body_style") == "Truck"),
    ({"max_price": 30000}, lambda it: it["price"] <= 30000),
    ({"min_price": 40000}, lambda it: it["price"] >= 40000),
])
def test_autos_filters(params, checker):
    r = requests.get(f"{API}/autos", params=params, timeout=20)
    assert r.status_code == 200
    items = r.json()
    for it in items:
        assert checker(it), f"{params} failed for {it}"


def test_autos_detail_masks_contact():
    items = requests.get(f"{API}/autos", timeout=20).json()
    aid = items[0]["id"]
    r = requests.get(f"{API}/autos/{aid}", timeout=20)
    assert r.status_code == 200
    d = r.json()
    assert "seller_email_masked" in d
    assert "contact_email" not in d
    assert "owner_email" not in d
    assert "contact_phone" not in d


def test_autos_create_get_delete(customer_headers, provider_headers):
    payload = {
        "title": "TEST_auto", "description": "x", "price": 19999,
        "year": 2022, "make": "Toyota", "model": "Camry",
        "mileage": 12000, "body_style": "Sedan", "fuel": "Gasoline",
        "transmission": "Automatic", "photos": ["https://x/y.jpg"],
        "contact_email": "auto_test@example.com",
        "contact_phone": "555-987-6543",
    }
    r = requests.post(f"{API}/autos", json=payload, headers=customer_headers, timeout=20)
    assert r.status_code == 200, r.text
    aid = r.json()["id"]
    g = requests.get(f"{API}/autos/{aid}", timeout=20).json()
    assert g["title"] == "TEST_auto"
    assert "contact_email" not in g

    f403 = requests.delete(f"{API}/autos/{aid}", headers=provider_headers, timeout=20)
    assert f403.status_code == 403
    ok = requests.delete(f"{API}/autos/{aid}", headers=customer_headers, timeout=20)
    assert ok.status_code == 200


# ── Inquiries ────────────────────────────────────────────────────────────────
def test_inquiry_own_listing_400(customer_headers):
    # customer creates listing then tries to inquire about it themselves
    payload = {
        "listing_kind": "sale", "property_type": "condo",
        "title": "TEST_own_inquire", "price": 100000, "address": "TEST addr",
        "bedrooms": 1, "bathrooms": 1, "sqft": 500,
        "photos": ["https://x/p.jpg"],
    }
    r = requests.post(f"{API}/real-estate", json=payload, headers=customer_headers, timeout=20)
    lid = r.json()["id"]
    try:
        inq = requests.post(f"{API}/inquiries", json={
            "listing_kind": "real_estate", "listing_id": lid, "initial_message": "Hi me"
        }, headers=customer_headers, timeout=20)
        assert inq.status_code == 400, inq.text
    finally:
        requests.delete(f"{API}/real-estate/{lid}", headers=customer_headers, timeout=20)


def test_inquiry_create_dedupe_and_messages(customer_headers, provider_headers):
    # provider creates a listing, customer inquires
    payload = {
        "listing_kind": "rent", "property_type": "apartment",
        "title": "TEST_inq_target", "price": 1500, "address": "TEST addr", "city": "Austin",
        "bedrooms": 2, "bathrooms": 1, "sqft": 800,
        "photos": ["https://x/p.jpg"],
        "contact_email": "prov@example.com",
    }
    r = requests.post(f"{API}/real-estate", json=payload, headers=provider_headers, timeout=20)
    lid = r.json()["id"]
    try:
        # 1st inquiry
        a = requests.post(f"{API}/inquiries", json={
            "listing_kind": "real_estate", "listing_id": lid, "initial_message": "Is it available?"
        }, headers=customer_headers, timeout=20)
        assert a.status_code == 200, a.text
        inq_id = a.json()["id"]

        # 2nd inquiry by SAME buyer should reuse same thread
        b = requests.post(f"{API}/inquiries", json={
            "listing_kind": "real_estate", "listing_id": lid, "initial_message": "Still asking"
        }, headers=customer_headers, timeout=20)
        assert b.status_code == 200
        assert b.json()["id"] == inq_id, "duplicate thread created"

        # Buyer side: GET inquiries role=buyer should include it
        lst_buyer = requests.get(f"{API}/inquiries", params={"role": "buyer"}, headers=customer_headers, timeout=20)
        assert lst_buyer.status_code == 200
        assert any(t["id"] == inq_id for t in lst_buyer.json())

        # Seller side: GET role=seller should include it (provider)
        lst_seller = requests.get(f"{API}/inquiries", params={"role": "seller"}, headers=provider_headers, timeout=20)
        assert any(t["id"] == inq_id for t in lst_seller.json())

        # Seller fetches thread → seller_unread_count should reset to 0
        thread = requests.get(f"{API}/inquiries/{inq_id}", headers=provider_headers, timeout=20)
        assert thread.status_code == 200
        body = thread.json()
        assert "inquiry" in body and "messages" in body
        assert len(body["messages"]) >= 2  # 2 messages from buyer
        # Re-fetch to confirm seller_unread_count was reset on previous GET
        thread_again = requests.get(f"{API}/inquiries/{inq_id}", headers=provider_headers, timeout=20).json()
        assert thread_again["inquiry"]["seller_unread_count"] == 0

        # Seller replies → buyer's unread_count should increment
        m = requests.post(f"{API}/inquiries/{inq_id}/messages", json={"text": "Yes still available"},
                          headers=provider_headers, timeout=20)
        assert m.status_code == 200

        thread2 = requests.get(f"{API}/inquiries/{inq_id}", headers=customer_headers, timeout=20).json()
        assert len(thread2["messages"]) >= 3
        # Re-fetch — by now buyer_unread_count should be reset to 0
        thread2b = requests.get(f"{API}/inquiries/{inq_id}", headers=customer_headers, timeout=20).json()
        assert thread2b["inquiry"]["buyer_unread_count"] == 0
    finally:
        requests.delete(f"{API}/real-estate/{lid}", headers=provider_headers, timeout=20)


# ── Regression: existing endpoints still work ────────────────────────────────
@pytest.mark.parametrize("path", ["/stores", "/restaurants", "/rentals"])
def test_regression_existing_endpoints(path):
    r = requests.get(f"{API}{path}", timeout=20)
    assert r.status_code == 200
    assert isinstance(r.json(), list)

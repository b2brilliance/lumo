# Iteration 74: app marketplace, pricing, quote, checkout, inventory size_class, admin pricing
import os
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL").rstrip("/")
PW = "password123"


def login(email, pw=PW):
    r = requests.post(f"{BASE_URL}/api/auth/login", json={"email": email, "password": pw}, timeout=20)
    if r.status_code != 200:
        pytest.skip(f"login failed {email}: {r.status_code}")
    return {"Authorization": f"Bearer {r.json()['token']}"}


@pytest.fixture(scope="module")
def cust():
    return login("customer@lumo.test")


@pytest.fixture(scope="module")
def retailer():
    h = login("retailer@lumo.test")
    me = requests.get(f"{BASE_URL}/api/auth/me", headers=h).json()
    return h, me.get("id") or me.get("user", {}).get("id")


@pytest.fixture(scope="module")
def admin():
    return login("julius.a.mason@gmail.com", "Mason0123")


# --- public pricing & market ---
class TestPublic:
    def test_pricing(self):
        d = requests.get(f"{BASE_URL}/api/app/pricing").json()
        assert d["service_fee_pct"] == 5.0 and d["delivery_base"] == 3.99 and d["delivery_per_mile"] == 1.5
        assert d["driver_share_pct"] == 90.0
        assert d["size_multipliers"] == {"small": 1.0, "medium": 1.5, "large": 2.5, "xl": 4.0}
        assert "food_categories" in d and "product_categories" in d

    @pytest.mark.parametrize("kind", ["food", "products"])
    def test_market_kind(self, kind):
        r = requests.get(f"{BASE_URL}/api/app/market", params={"kind": kind})
        assert r.status_code == 200
        d = r.json()
        assert d["kind"] == kind and isinstance(d["stores"], list) and isinstance(d["items"], list)
        assert len(d["stores"]) > 0

    def test_market_q(self):
        d = requests.get(f"{BASE_URL}/api/app/market", params={"kind": "food", "q": "naan"}).json()
        assert all("naan" in (i["name"] + (i.get("description") or "") + (i.get("category") or "")).lower() for i in d["items"])
        assert len(d["items"]) >= 1

    def test_market_category(self):
        d = requests.get(f"{BASE_URL}/api/app/market", params={"kind": "food", "category": "Pizza"}).json()
        assert all(i.get("category") == "Pizza" for i in d["items"])
        print("Pizza items:", len(d["items"]), "stores:", len(d["stores"]))

    def test_market_bad_kind(self):
        assert requests.get(f"{BASE_URL}/api/app/market", params={"kind": "x"}).status_code == 422


# --- admin pricing ---
class TestAdminPricing:
    def test_unauth(self):
        p = requests.get(f"{BASE_URL}/api/app/pricing").json()
        body = {k: p[k] for k in ["service_fee_pct", "delivery_base", "delivery_per_mile", "driver_share_pct", "size_multipliers", "str_commission_pct"]}
        assert requests.put(f"{BASE_URL}/api/admin/pricing", json=body).status_code in (401, 403)

    def test_customer_forbidden(self, cust):
        p = requests.get(f"{BASE_URL}/api/app/pricing").json()
        body = {k: p[k] for k in ["service_fee_pct", "delivery_base", "delivery_per_mile", "driver_share_pct", "size_multipliers", "str_commission_pct"]}
        assert requests.put(f"{BASE_URL}/api/admin/pricing", json=body, headers=cust).status_code == 403

    def test_admin_put_same(self, admin):
        p = requests.get(f"{BASE_URL}/api/app/pricing").json()
        body = {k: p[k] for k in ["service_fee_pct", "delivery_base", "delivery_per_mile", "driver_share_pct", "size_multipliers", "str_commission_pct"]}
        r = requests.put(f"{BASE_URL}/api/admin/pricing", json=body, headers=admin)
        assert r.status_code == 200, r.text
        assert r.json()["service_fee_pct"] == 5.0


# --- inventory size_class + quote + checkout ---
class TestQuoteCheckout:
    item_id = None

    def test_create_item_size(self, retailer):
        h, _ = retailer
        r = requests.post(f"{BASE_URL}/api/inventory", headers=h, json={
            "name": "TEST_Couch", "description": "big", "price": 100.0, "stock": 5,
            "category": "Home & furniture", "size_class": "large"})
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["size_class"] == "large" and d["kind"] == "product"
        TestQuoteCheckout.item_id = d["id"]
        mine = requests.get(f"{BASE_URL}/api/inventory/mine", headers=h).json()
        it = next(i for i in mine if i["id"] == d["id"])
        assert it["size_class"] == "large" and it["kind"] == "product"

    def test_bad_size(self, retailer):
        h, _ = retailer
        r = requests.post(f"{BASE_URL}/api/inventory", headers=h, json={"name": "TEST_bad", "price": 1, "size_class": "huge"})
        assert r.status_code == 422

    def test_quote_pickup_delivery(self, cust, retailer):
        _, sid = retailer
        requests.delete(f"{BASE_URL}/api/cart/store/{sid}", headers=cust)
        r = requests.post(f"{BASE_URL}/api/cart/add", headers=cust, json={"inventory_item_id": self.item_id, "quantity": 2})
        assert r.status_code == 200, r.text
        q = requests.post(f"{BASE_URL}/api/app/quote", headers=cust, json={"store_id": sid, "fulfillment": "pickup"})
        assert q.status_code == 200, q.text
        q = q.json()
        print("pickup quote", {k: q[k] for k in ["subtotal", "service_fee", "delivery_fee", "tax_amount", "total"]})
        assert q["subtotal"] == 200.0 and q["service_fee"] == 10.0 and q["delivery_fee"] == 0
        d = requests.post(f"{BASE_URL}/api/app/quote", headers=cust, json={"store_id": sid, "fulfillment": "delivery"})
        assert d.status_code in (200, 400), d.text
        if d.status_code == 400:
            pytest.skip(f"store blocks delivery: {d.text}")
        d = d.json()
        print("delivery quote", {k: d[k] for k in ["miles", "size_class", "delivery_fee", "split", "total"]})
        assert d["size_class"] == "large"
        exp = round((3.99 + 1.5 * d["miles"]) * 2.5, 2)
        assert abs(d["delivery_fee"] - exp) < 0.02
        assert abs(d["split"]["driver"] - round(d["delivery_fee"] * 0.9, 2)) < 0.02
        assert abs(d["split"]["lumo"] - round(10.0 + d["delivery_fee"] * 0.1, 2)) < 0.02
        assert abs(d["total"] - round(d["subtotal"] + d["service_fee"] + d["delivery_fee"] + d["tax_amount"], 2)) < 0.02

    def test_quote_empty(self, cust):
        r = requests.post(f"{BASE_URL}/api/app/quote", headers=cust, json={"store_id": "nope", "fulfillment": "pickup"})
        assert r.status_code == 400

    def test_quote_unauth(self, retailer):
        _, sid = retailer
        assert requests.post(f"{BASE_URL}/api/app/quote", json={"store_id": sid, "fulfillment": "pickup"}).status_code in (401, 403)

    def test_checkout_delivery_requires_address(self, cust, retailer):
        _, sid = retailer
        r = requests.post(f"{BASE_URL}/api/app/checkout", headers=cust, json={
            "store_id": sid, "fulfillment": "delivery", "origin_url": BASE_URL})
        assert r.status_code in (422, 400)

    def test_checkout_pickup(self, cust, retailer):
        _, sid = retailer
        r = requests.post(f"{BASE_URL}/api/app/checkout", headers=cust, json={
            "store_id": sid, "fulfillment": "pickup", "origin_url": BASE_URL})
        assert r.status_code == 200, r.text
        d = r.json()
        assert "stripe.com" in d["url"] and d["order_id"]
        o = requests.get(f"{BASE_URL}/api/orders/{d['order_id']}", headers=cust)
        assert o.status_code == 200, o.text
        o = o.json()
        o = o.get("order", o)
        assert o["is_app_order"] is True and o["status"] == "payment_pending" and o["service_fee"] == 10.0

    def test_cleanup(self, cust, retailer):
        h, sid = retailer
        requests.delete(f"{BASE_URL}/api/cart/store/{sid}", headers=cust)
        mine = requests.get(f"{BASE_URL}/api/inventory/mine", headers=h).json()
        for i in mine:
            if i["name"].startswith("TEST_"):
                requests.delete(f"{BASE_URL}/api/inventory/{i['id']}", headers=h)

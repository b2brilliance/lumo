# Iteration 73: app-mode personas — register/login for seller & real-estate roles, re_mode PATCH
import os
import uuid
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL").rstrip("/")
API = f"{BASE_URL}/api"
PW = "password123"
CREATED = []


def _login(email, pw=PW):
    return requests.post(f"{API}/auth/login", json={"email": email, "password": pw}, timeout=20)


@pytest.fixture(scope="module")
def admin_token():
    r = _login("julius.a.mason@gmail.com", "Mason0123")
    if r.status_code != 200:
        r = _login("admin@lumo.test")
    if r.status_code != 200:
        pytest.skip("admin login failed")
    return r.json()["token"]


@pytest.fixture(scope="module", autouse=True)
def cleanup(admin_token):
    yield
    for uid in CREATED:
        requests.delete(f"{API}/admin/users/{uid}", headers={"Authorization": f"Bearer {admin_token}"}, timeout=20)


def _register(role, **extra):
    email = f"test_iter73_{role}_{uuid.uuid4().hex[:8]}@example.com"
    body = {"email": email, "password": PW, "name": f"TEST_{role}", "role": role, **extra}
    r = requests.post(f"{API}/auth/register", json=body, timeout=20)
    if r.status_code == 200:
        CREATED.append(r.json()["user"]["id"])
    return r, email


# Seeded logins for every persona
@pytest.mark.parametrize("email,role", [
    ("customer@lumo.test", "customer"), ("provider@lumo.test", "provider"),
    ("restaurant@lumo.test", "restaurant"), ("retailer@lumo.test", "retailer"),
    ("real_estate@lumo.test", "real_estate"),
])
def test_seeded_login(email, role):
    r = _login(email)
    assert r.status_code == 200, r.text
    d = r.json()
    assert d["user"]["role"] == role
    assert isinstance(d["token"], str) and d["token"]
    me = requests.get(f"{API}/auth/me", headers={"Authorization": f"Bearer {d['token']}"}, timeout=20)
    assert me.status_code == 200
    assert me.json()["role"] == role
    assert not me.json().get("deactivated_at")


@pytest.mark.parametrize("role", ["restaurant", "retailer"])
def test_register_seller(role):
    r, email = _register(role)
    assert r.status_code == 200, r.text
    assert r.json()["user"]["role"] == role
    lr = _login(email)
    assert lr.status_code == 200
    assert lr.json()["user"]["role"] == role


def test_register_real_estate_listing():
    r, email = _register("real_estate", re_mode="listing")
    assert r.status_code == 200, r.text
    assert r.json()["user"]["re_mode"] == "listing"
    tok = _login(email).json()["token"]
    me = requests.get(f"{API}/auth/me", headers={"Authorization": f"Bearer {tok}"}, timeout=20).json()
    assert me["re_mode"] == "listing"


def test_register_real_estate_default_seeking():
    r, _ = _register("real_estate")
    assert r.status_code == 200, r.text
    assert r.json()["user"]["re_mode"] == "seeking"


def test_register_invalid_re_mode():
    r, _ = _register("real_estate", re_mode="bogus")
    assert r.status_code == 422


def test_register_invalid_role():
    r, _ = _register("superuser")
    assert r.status_code == 422


def test_register_admin_role_blocked():
    """Security: public register must not mint admins."""
    r, _ = _register("admin")
    if r.status_code == 200:
        pytest.fail(f"SECURITY: /auth/register created role={r.json()['user']['role']}")
    assert r.status_code in (400, 403, 422)


def test_patch_re_mode_toggle():
    r, email = _register("real_estate", re_mode="seeking")
    tok = r.json()["token"]
    h = {"Authorization": f"Bearer {tok}"}
    p = requests.patch(f"{API}/auth/me", json={"re_mode": "listing"}, headers=h, timeout=20)
    assert p.status_code == 200
    assert p.json()["re_mode"] == "listing"
    assert requests.get(f"{API}/auth/me", headers=h, timeout=20).json()["re_mode"] == "listing"
    p2 = requests.patch(f"{API}/auth/me", json={"re_mode": "seeking"}, headers=h, timeout=20)
    assert p2.json()["re_mode"] == "seeking"
    bad = requests.patch(f"{API}/auth/me", json={"re_mode": "xx"}, headers=h, timeout=20)
    assert bad.status_code == 422


def test_seller_endpoints():
    tok = _login("restaurant@lumo.test").json()["token"]
    h = {"Authorization": f"Bearer {tok}"}
    o = requests.get(f"{API}/orders", headers=h, timeout=20)
    assert o.status_code == 200 and isinstance(o.json(), list)


def test_real_estate_owner_filter():
    tok = _login("real_estate@lumo.test").json()
    uid = tok["user"]["id"]
    r = requests.get(f"{API}/real-estate", params={"owner_id": uid, "limit": 100}, timeout=20)
    assert r.status_code == 200
    d = r.json()
    items = d.get("items", d) if isinstance(d, dict) else d
    assert all(i.get("owner_id") == uid for i in items)

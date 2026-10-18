# Iter66: Recruiter tiered program + Available Jobs board (API)
import os
import uuid
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL").rstrip("/")
API = f"{BASE_URL}/api"
DEFAULTS = {"base_pct": 0.1, "step_pct": 0.01, "step_jobs": 1000, "max_pct": 0.99}


def _login(email, pw):
    r = requests.post(f"{API}/auth/login", json={"email": email, "password": pw}, timeout=20)
    if r.status_code != 200:
        pytest.skip(f"login failed for {email}: {r.status_code} {r.text[:100]}")
    return r.json()["token"]


@pytest.fixture(scope="module")
def admin_h():
    return {"Authorization": f"Bearer {_login('julius.a.mason@gmail.com', 'Mason0123')}"}


@pytest.fixture(scope="module")
def cust_h():
    return {"Authorization": f"Bearer {_login('customer@lumo.test', 'password123')}"}


@pytest.fixture(scope="module")
def prov_h():
    return {"Authorization": f"Bearer {_login('provider@lumo.test', 'password123')}"}


@pytest.fixture(scope="module", autouse=True)
def restore_defaults(admin_h):
    yield
    requests.put(f"{API}/referrals/admin/program", json=DEFAULTS, headers=admin_h, timeout=20)


# Public program endpoint
class TestProgram:
    def test_program_public(self):
        r = requests.get(f"{API}/referrals/program", timeout=20)
        assert r.status_code == 200
        d = r.json()
        assert d["base_pct"] == 0.1 and d["step_pct"] == 0.01
        assert d["step_jobs"] == 1000 and d["max_pct"] == 0.99
        assert len(d["ladder"]) == 6
        assert d["ladder"][0] == {"jobs": 0, "rate_pct": 0.1}
        assert d["ladder"][5] == {"jobs": 5000, "rate_pct": 0.15}
        assert d["milestone_bonus_amount"] == 25 and d["milestone_bonus_goal"] == 10
        assert "_id" not in d and "id" not in d


# /referrals/me tier block
class TestMe:
    def test_me_tier(self, cust_h):
        r = requests.get(f"{API}/referrals/me", headers=cust_h, timeout=20)
        assert r.status_code == 200
        t = r.json()["tier"]
        for k in ("rate_pct", "level", "jobs_to_next", "next_rate_pct", "progress_pct", "at_max"):
            assert k in t
        assert t["at_max"] is False
        assert t["rate_pct"] >= 0.1

    def test_me_unauth(self):
        r = requests.get(f"{API}/referrals/me", timeout=20)
        assert r.status_code in (401, 403)


# Admin config update + validation
class TestAdminProgram:
    def test_update_and_persist(self, admin_h):
        r = requests.put(f"{API}/referrals/admin/program",
                         json={"base_pct": 0.2, "step_pct": 0.05, "step_jobs": 500, "max_pct": 0.5},
                         headers=admin_h, timeout=20)
        assert r.status_code == 200, r.text
        g = requests.get(f"{API}/referrals/program", timeout=20).json()
        assert g["base_pct"] == 0.2 and g["step_jobs"] == 500
        assert g["ladder"][1] == {"jobs": 500, "rate_pct": 0.25}
        assert g["ladder"][5]["rate_pct"] == 0.45
        requests.put(f"{API}/referrals/admin/program", json=DEFAULTS, headers=admin_h, timeout=20)
        g = requests.get(f"{API}/referrals/program", timeout=20).json()
        assert g["base_pct"] == 0.1 and g["step_jobs"] == 1000

    @pytest.mark.parametrize("body", [{"base_pct": 1}, {"step_pct": 1.5}, {"max_pct": 1.0},
                                      {"base_pct": -0.1}, {"step_jobs": 0}])
    def test_rejects_invalid(self, admin_h, body):
        r = requests.put(f"{API}/referrals/admin/program", json=body, headers=admin_h, timeout=20)
        assert r.status_code == 400, f"{body} -> {r.status_code} {r.text}"

    def test_rejects_non_numeric(self, admin_h):
        r = requests.put(f"{API}/referrals/admin/program", json={"base_pct": "abc"}, headers=admin_h, timeout=20)
        assert r.status_code in (400, 422), f"non-numeric -> {r.status_code}"

    def test_non_admin(self, cust_h):
        r = requests.put(f"{API}/referrals/admin/program", json={"base_pct": 0.5}, headers=cust_h, timeout=20)
        assert r.status_code in (401, 403)
        r = requests.get(f"{API}/referrals/admin/leaderboard", headers=cust_h, timeout=20)
        assert r.status_code in (401, 403)

    def test_unauth(self):
        assert requests.put(f"{API}/referrals/admin/program", json={}, timeout=20).status_code in (401, 403)

    def test_leaderboard(self, admin_h):
        r = requests.get(f"{API}/referrals/admin/leaderboard", headers=admin_h, timeout=20)
        assert r.status_code == 200
        rows = r.json()
        assert isinstance(rows, list)
        for row in rows:
            for k in ("user_id", "recruits", "recruit_jobs", "rate_pct", "earned"):
                assert k in row


# Available Jobs feed + accept
class TestAvailableJobs:
    def test_opportunities_provider_only(self, cust_h):
        r = requests.get(f"{API}/provider/opportunities", headers=cust_h, timeout=20)
        assert r.status_code in (401, 403)

    def test_feed_and_accept(self, prov_h):
        # Non-test customer so the job isn't demo-hidden
        email = f"qa_cust_{uuid.uuid4().hex[:8]}@lumoqa.io"
        rr = requests.post(f"{API}/auth/register", json={"email": email, "password": "Passw0rd!x",
                                                         "name": "QA Cust", "role": "customer"}, timeout=20)
        assert rr.status_code in (200, 201), rr.text
        h = {"Authorization": f"Bearer {rr.json()['token']}"}
        jr = requests.post(f"{API}/jobs", headers=h, json={
            "title": "TEST_ iter66 delivery", "description": "qa", "category": "delivery",
            "pay_rate": 12.5}, timeout=20)
        assert jr.status_code in (200, 201), jr.text
        job = jr.json()
        assert job["category_group"] == "physical_delivery"
        feed = requests.get(f"{API}/provider/opportunities", headers=prov_h, timeout=20)
        assert feed.status_code == 200
        ids = [j["id"] for j in feed.json()]
        print("provider feed size", len(ids), "job in feed:", job["id"] in ids)
        ar = requests.post(f"{API}/jobs/{job['id']}/accept", headers=prov_h, timeout=20)
        print("accept ->", ar.status_code, ar.text[:200])
        assert ar.status_code in (200, 402, 403)
        pytest.job_id = job["id"]
        pytest.job_in_feed = job["id"] in ids
        assert job["id"] in ids

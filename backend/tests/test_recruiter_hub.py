# Recruiter Hub API tests: /api/recruiter-hub/me and /leaderboard
import os
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL").rstrip("/")
REC = ("hubrec_8359b7@lumo.test", "password123")
EMPTY = ("customer.demo@golumo.app", "LumoReview2026!")


def _token(email, pw):
    r = requests.post(f"{BASE_URL}/api/auth/login", json={"email": email, "password": pw})
    if r.status_code != 200:
        pytest.skip(f"login failed {email}: {r.status_code} {r.text[:200]}")
    return r.json()["token"]


@pytest.fixture(scope="module")
def rec():
    return {"Authorization": f"Bearer {_token(*REC)}"}


@pytest.fixture(scope="module")
def empty():
    return {"Authorization": f"Bearer {_token(*EMPTY)}"}


# Auth required
@pytest.mark.parametrize("path", ["/api/recruiter-hub/me", "/api/recruiter-hub/leaderboard?scope=alltime",
                                  "/api/recruiter-hub/leaderboard?scope=city"])
def test_requires_auth(path):
    assert requests.get(f"{BASE_URL}{path}").status_code == 401


# Me summary + recruits
def test_me_summary(rec):
    r = requests.get(f"{BASE_URL}/api/recruiter-hub/me", headers=rec)
    assert r.status_code == 200
    d = r.json()
    s = d["summary"]
    assert s["recruits"] == 2 and s["active_recruits"] == 1 and s["jobs_completed"] == 1
    assert s["total_earned"] == 0.1
    names = [x["name"] for x in d["recruits"]]
    assert "Jamie Worker Smith" in names and "Riley Customer" in names
    jamie = next(x for x in d["recruits"] if x["name"] == "Jamie Worker Smith")
    assert jamie["jobs_completed"] == 1
    j = jamie["jobs"][0]
    assert j["title"] == "Deliver groceries to Park Slope"
    assert j["gross"] == 100.0 and abs(j["you_earned"] - 0.1) < 1e-6
    assert d["city"] == "New York"


def test_me_empty(empty):
    r = requests.get(f"{BASE_URL}/api/recruiter-hub/me", headers=empty)
    assert r.status_code == 200
    d = r.json()
    assert d["summary"]["recruits"] == 0 and d["recruits"] == []


# Leaderboards
def test_board_alltime(rec):
    r = requests.get(f"{BASE_URL}/api/recruiter-hub/leaderboard?scope=alltime", headers=rec)
    assert r.status_code == 200
    rows = r.json()["rows"]
    mine = [x for x in rows if x["is_me"]]
    assert len(mine) == 1 and mine[0]["recruits"] == 2 and mine[0]["active_recruits"] == 1
    assert [x["rank"] for x in rows if not x["is_me"] or True] == sorted(x["rank"] for x in rows)
    # names masked (no full surnames)
    for x in rows:
        parts = x["name"].split()
        assert len(parts) <= 2 and (len(parts) == 1 or parts[1].endswith("."))


def test_board_city(rec):
    r = requests.get(f"{BASE_URL}/api/recruiter-hub/leaderboard?scope=city", headers=rec)
    assert r.status_code == 200
    d = r.json()
    assert d["city"] == "New York"
    assert any(x["is_me"] for x in d["rows"])
    assert all((x["city"] or "").lower() == "new york" for x in d["rows"])


def test_board_city_no_address(empty):
    r = requests.get(f"{BASE_URL}/api/recruiter-hub/leaderboard?scope=city", headers=empty)
    assert r.status_code == 200
    assert r.json()["city"] is None and r.json()["rows"] == []


def test_board_invalid_scope(rec):
    r = requests.get(f"{BASE_URL}/api/recruiter-hub/leaderboard?scope=bogus", headers=rec)
    assert r.status_code == 422


def test_board_limit_clamped(rec):
    r = requests.get(f"{BASE_URL}/api/recruiter-hub/leaderboard?scope=alltime&limit=0", headers=rec)
    assert r.status_code == 200
    rows = r.json()["rows"]
    assert 1 <= len(rows) <= 2

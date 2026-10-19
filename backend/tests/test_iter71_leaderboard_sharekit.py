# Iter71: public recruiter leaderboard + recruiter share kit
import os
import uuid
import asyncio
from datetime import datetime, timezone

import pytest
import requests
from dotenv import load_dotenv
from pymongo import MongoClient

load_dotenv("/app/frontend/.env")
load_dotenv("/app/backend/.env")
BASE_URL = os.environ.get("REACT_APP_BACKEND_URL").rstrip("/")
API = f"{BASE_URL}/api"
db = MongoClient(os.environ["MONGO_URL"])[os.environ["DB_NAME"]]
TAG = "TEST_iter71"


def _login(email, pw):
    r = requests.post(f"{API}/auth/login", json={"email": email, "password": pw})
    if r.status_code != 200:
        pytest.skip(f"login failed {email}: {r.status_code}")
    return r.json()["token"]


@pytest.fixture(scope="module")
def seeded():
    month = requests.get(f"{API}/referrals/leaderboard").json()["month"]
    y, m = map(int, month.split("-"))
    ts = datetime(y, m, 15, 12, tzinfo=timezone.utc).isoformat()
    ids = {k: f"{TAG}_{k}_{uuid.uuid4().hex[:6]}" for k in ["a", "b", "c", "demo", "adm"]}
    users = [
        {"id": ids["a"], "name": "Zelda Alpha Recruiter", "email": f"{ids['a']}@x.test", "role": "provider", "created_at": ts, "location": {"city": "Paris"}},
        {"id": ids["b"], "name": "Bob Beta", "email": f"{ids['b']}@x.test", "role": "provider", "created_at": ts},
        {"id": ids["c"], "name": "Cher", "email": f"{ids['c']}@x.test", "role": "provider", "created_at": ts},
        {"id": ids["demo"], "name": "Demo Guy", "email": f"{ids['demo']}@x.test", "role": "provider", "created_at": ts, "is_demo": True},
        {"id": ids["adm"], "name": "Admin Person", "email": f"{ids['adm']}@x.test", "role": "admin", "created_at": ts},
    ]
    # recruits: a=1, b=3, c=2 ; jobs: a=5, b=5, c=0(+recruits only), demo=50, adm=40
    for ref, n in [("a", 1), ("b", 3), ("c", 2), ("demo", 4), ("adm", 4)]:
        for i in range(n):
            users.append({"id": f"{TAG}_r_{ref}_{i}_{uuid.uuid4().hex[:4]}", "name": "Recruit", "email": f"{TAG}r{ref}{i}{uuid.uuid4().hex[:4]}@x.test",
                          "role": "provider", "created_at": ts, "referred_by_user_id": ids[ref]})
    db.users.insert_many(users)
    earn = []
    for ref, n in [("a", 5), ("b", 5), ("demo", 50), ("adm", 40)]:
        for i in range(n):
            earn.append({"id": f"{TAG}_e_{uuid.uuid4().hex}", "referrer_user_id": ids[ref], "source_user_id": "x", "source_type": "test", "amount": 0.1, "created_at": ts})
    # out-of-month earning should not count
    earn.append({"id": f"{TAG}_e_old", "referrer_user_id": ids["c"], "source_type": "test", "amount": 1, "created_at": "2001-01-15T00:00:00+00:00"})
    db.referral_earnings.insert_many(earn)
    yield {"month": month, "ids": ids}
    db.users.delete_many({"id": {"$regex": f"^{TAG}"}})
    db.referral_earnings.delete_many({"id": {"$regex": f"^{TAG}"}})


class TestLeaderboard:
    def test_shape_and_public(self, seeded):
        r = requests.get(f"{API}/referrals/leaderboard?limit=100")
        assert r.status_code == 200
        d = r.json()
        assert d["month"] == seeded["month"]
        assert isinstance(d["rows"], list) and isinstance(d["total_recruiters"], int)
        for row in d["rows"]:
            assert set(row.keys()) == {"rank", "name", "jobs", "recruits", "city"}

    def test_ordering_masking_exclusion(self, seeded):
        d = requests.get(f"{API}/referrals/leaderboard?limit=100").json()
        names = [r["name"] for r in d["rows"]]
        mine = [r for r in d["rows"] if r["name"] in ("Zelda R.", "Bob B.", "Cher")]
        assert len(mine) == 3, names
        by = {r["name"]: r for r in mine}
        assert by["Zelda R."]["jobs"] == 5 and by["Zelda R."]["recruits"] == 1 and by["Zelda R."]["city"] == "Paris"
        assert by["Bob B."]["jobs"] == 5 and by["Bob B."]["recruits"] == 3
        assert by["Cher"]["jobs"] == 0 and by["Cher"]["recruits"] == 2
        assert by["Bob B."]["rank"] < by["Zelda R."]["rank"] < by["Cher"]["rank"]
        assert "Demo G." not in names and "Admin P." not in names
        ranks = [r["rank"] for r in d["rows"]]
        assert ranks == list(range(1, len(ranks) + 1))
        keys = [(-r["jobs"], -r["recruits"]) for r in d["rows"]]
        assert keys == sorted(keys)
        txt = r_text = requests.get(f"{API}/referrals/leaderboard?limit=100").text
        assert TAG not in txt and "@x.test" not in txt and "Alpha" not in r_text

    def test_month_param_and_bad_month(self, seeded):
        r = requests.get(f"{API}/referrals/leaderboard?month=2001-01")
        assert r.status_code == 200 and r.json()["month"] == "2001-01"
        old = [row for row in r.json()["rows"] if row["name"] == "Cher"]
        assert len(old) == 1 and old[0]["jobs"] == 1 and old[0]["recruits"] == 0
        assert all(row["name"] not in ("Bob B.", "Zelda R.") for row in r.json()["rows"])
        for bad in ["abc", "2026-13", "2026", "2026-00", "2026-06-01"]:
            rb = requests.get(f"{API}/referrals/leaderboard?month={bad}")
            assert rb.status_code == 400, (bad, rb.status_code)

    def test_limit(self, seeded):
        d = requests.get(f"{API}/referrals/leaderboard?limit=1").json()
        assert len(d["rows"]) <= 1


class TestShareKit:
    def test_requires_auth(self):
        assert requests.get(f"{API}/referrals/share-kit").status_code == 401

    def test_default_and_city(self):
        tok = _login("provider@lumo.test", "password123")
        h = {"Authorization": f"Bearer {tok}"}
        d = requests.get(f"{API}/referrals/share-kit", headers=h).json()
        code = d["code"]
        assert isinstance(code, str) and len(code) >= 6
        assert d["share_url"] == f"https://golumo.app/join/{d['city']['slug']}?ref={code}"
        assert d["photo_url"].endswith(f"/api/img/city/{d['city']['slug']}.jpg")
        assert [p["key"] for p in d["posts"]] == ["facebook", "whatsapp", "x", "instagram"]
        for p in d["posts"]:
            assert d["city"]["name"] in p["text"]
            assert d["share_url"] in p["text"] or code in p["text"]
        # pick a different city
        c = db.recruit_cities.find_one({"is_active": True, "slug": {"$ne": d["city"]["slug"]}}, {"_id": 0, "slug": 1, "city": 1, "country_name": 1})
        d2 = requests.get(f"{API}/referrals/share-kit?city={c['slug']}", headers=h).json()
        assert d2["city"]["slug"] == c["slug"] and d2["city"]["name"] == c["city"] and d2["city"]["country"] == c.get("country_name")
        assert d2["share_url"] == f"https://golumo.app/join/{c['slug']}?ref={code}"
        # unknown slug falls back
        d3 = requests.get(f"{API}/referrals/share-kit?city=nope-xyz", headers=h)
        assert d3.status_code == 200

    def test_photo_endpoint(self):
        tok = _login("provider@lumo.test", "password123")
        d = requests.get(f"{API}/referrals/share-kit", headers={"Authorization": f"Bearer {tok}"}).json()
        r = requests.get(f"{API}/img/city/{d['city']['slug']}.jpg", timeout=30)
        assert r.status_code == 200 and r.headers.get("content-type", "").startswith("image")

# Seed QA data for iter63 UI tests (price drop badges, watch hearts). Prints JSON with tokens/ids.
import json
import os
import uuid
import requests

API = os.environ["REACT_APP_BACKEND_URL"].rstrip("/") + "/api"


def reg(name):
    e = f"qa_{uuid.uuid4().hex[:8]}@gmail.com"
    r = requests.post(f"{API}/auth/register", json={"email": e, "password": "Passw0rd!", "name": name, "role": "customer"}).json()
    return {"email": e, "token": r["token"], "id": r["user"]["id"]}


H = lambda t: {"Authorization": f"Bearer {t}"}
o, w = reg("QA Owner"), reg("QA Watcher")
re_ = requests.post(f"{API}/real-estate", json={"title": "QA_ Drop Flat", "price": 300000, "address": "1 Congress Ave", "city": "Austin", "country": "US", "bedrooms": 2}, headers=H(o["token"])).json()
au = requests.post(f"{API}/autos", json={"title": "QA_ Drop Civic", "price": 10000, "year": 2018, "make": "Honda", "model": "Civic", "city": "Austin"}, headers=H(o["token"])).json()
li = requests.post(f"{API}/marketplace/listings", json={"title": "QA_ Drop Bike", "description": "QA", "price": 200, "category": "other"}, headers=H(o["token"])).json()
requests.patch(f"{API}/real-estate/{re_['id']}", json={"price": 270000}, headers=H(o["token"]))
requests.patch(f"{API}/autos/{au['id']}", json={"price": 9000}, headers=H(o["token"]))
requests.patch(f"{API}/marketplace/listings/{li['id']}", json={"price": 150}, headers=H(o["token"]))
print(json.dumps({"owner": o, "watcher": w, "re": re_["id"], "auto": au["id"], "listing": li["id"]}))

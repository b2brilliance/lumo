# Iter72: sweep all campaign city slugs -> business landing API + hero image reachability
import os, sys, requests
from concurrent.futures import ThreadPoolExecutor
sys.path.insert(0, "/app/backend")
import city_ads
B = os.environ["REACT_APP_BACKEND_URL"].rstrip("/")


def chk(row):
    slug = row[0]
    r = requests.get(f"{B}/api/business/cities/{slug}", timeout=20)
    if r.status_code != 200:
        return f"{slug}: API {r.status_code}"
    d = r.json()
    h = requests.head(d["hero_image"], timeout=20)
    if h.status_code != 200:
        return f"{slug}: hero {h.status_code}"
    j = requests.head(f"{city_ads.IMG}{row[2]}.jpeg", timeout=20)
    if j.status_code != 200:
        return f"{slug}: job img {j.status_code}"
    if d["lang"] != "en" and not d["local_line"]:
        return f"{slug}: lang {d['lang']} no local_line"
    return None


rows = city_ads.CITIES + city_ads.WAVE2
with ThreadPoolExecutor(10) as ex:
    res = [x for x in ex.map(chk, rows) if x]
print(f"checked {len(rows)}; problems: {len(res)}")
for x in res:
    print(x)

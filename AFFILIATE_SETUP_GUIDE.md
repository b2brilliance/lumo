# Lumo Affiliate Shop — Setup Guide

This is your step-by-step for turning `/shop` into a real revenue stream. Every product you add earns you a commission when someone clicks through and buys — Lumo never touches the item.

---

## How the shop already works

- **Public page:** `/shop` — categorized (electronics / home / furniture / etc.), retailer chips (Amazon, Best Buy, Wayfair, Target, Walmart), keyword search, price filter, sort by featured / most popular / price / newest.
- **Admin page:** `/admin?tab=shop` — add, edit, hide/show, delete products. Includes a "Paste retailer URL" auto-import that grabs the title, image and price from the URL you paste.
- **Featured widget:** 3 featured products on the customer home (`/`) driving traffic to the shop.
- **Click tracking:** Every card click is counted server-side (`shop_clicks` collection) — you can see per-product click counts in the admin table.

The affiliate URL you paste into a product is what actually earns you the money. Each program below tells you exactly what URL to paste.

---

## Step 1 — Apply to each affiliate program

You apply once per retailer. Most approve within 24–72 hours; a few (Amazon) need one live sale in the first 180 days to stay active.

### 1a. Amazon Associates 🥇 *(start here — largest catalog)*
1. Go to **https://affiliate-program.amazon.com/**
2. Click **Sign up** — use the same email as your Lumo admin login if you want.
3. Fill in:
   - Your website: `https://lumo-bundle-checkout.preview.emergentagent.com` (or your custom domain once launched)
   - Preferred store ID / **tracking ID**: `lumo-20` (or anything unique — Amazon calls this your `tag`)
   - App/website description: "Lumo is a P2P service marketplace with a curated affiliate shop feature."
   - Traffic and monetization method: "Content site with curated product recommendations."
4. Add your payment/tax info (SSN or EIN for US, otherwise W-8BEN).
5. Amazon issues you a tracking ID like **`lumo-20`**. Save it.
6. Every Amazon product URL you paste into Lumo must include `?tag=lumo-20` at the end. Amazon Site Stripe (the black bar at the top when you're logged in to Amazon) has a **"Get Link"** button that auto-appends your tag — the cleanest way to grab an affiliate-tagged URL.

**Rule to keep the account alive:** get at least 3 qualified sales in the first 180 days.

### 1b. Best Buy Affiliate Program (via Impact.com)
1. Go to **https://bestbuy.impact.com/** and click **Apply now**.
2. Sign in with an Impact.com account (create one if you don't have it — free).
3. Complete the program application: website + traffic sources.
4. Wait for approval (usually 2–5 business days).
5. Once approved, generate a tracking link from the Best Buy campaign inside Impact:
   - In Impact → **Ads & Links → Create link → paste the Best Buy product URL → Generate**
   - Copy the resulting `https://bestbuy.7tiv.net/...` link — that's what you paste into Lumo.

### 1c. Wayfair Partners (via CJ Affiliate)
1. Sign up at **https://www.cj.com/publisher-signup**.
2. In your CJ dashboard, search for **"Wayfair"** in Advertisers and click **Join Program**.
3. Approval usually within 24 hours.
4. Grab a **Deep Link** for any Wayfair product:
   - CJ dashboard → **Links → Deep Link Generator → paste product URL → Generate**
   - Resulting URL looks like `https://www.anrdoezrs.net/click-XXXXXX-XXXX?url=...` — paste that into Lumo.

### 1d. Target Partners (via Impact.com)
1. Same Impact.com account you used for Best Buy.
2. Apply to the **Target Affiliates** program inside Impact.
3. Approval is fast (24h).
4. Generate a tracked link the same way as Best Buy — result looks like `https://target.7tiv.net/...`.

### 1e. Walmart Creator / Walmart Affiliates (via Impact.com)
1. Same Impact.com account.
2. Apply to **Walmart Creator Program** (fastest) or **Walmart Affiliates**.
3. Approval within a few days.
4. Generate a Walmart-tagged link the same way — result: `https://goto.walmart.com/...`

### 1f. Optional add-ons (already supported in the admin retailer dropdown)
- **Home Depot** — Impact.com program.
- **Lowe's** — CJ Affiliate.
- **Etsy** — Awin (`https://www.awin.com/`).
- **eBay Partner Network** — `https://partnernetwork.ebay.com/`.

---

## Step 2 — Save your tracking IDs inside Lumo

You already have an admin tab for this: **`/admin?tab=affiliates`** — grouped list of every affiliate program with a text field for each tracking ID. Paste the code you get from step 1 into the matching row and hit save. Lumo will remember it.

For programs where the affiliate URL itself IS the tag (Impact / CJ / Awin — all use unique deep links per product), you don't need to enter a global ID; you just paste the deep-link URL directly into each product below.

For **Amazon only** — save your tag (e.g. `lumo-20`) in `/admin?tab=affiliates` under "Amazon Associates" so Lumo knows the tag exists. (Amazon URLs still need `?tag=lumo-20` in the affiliate URL you paste per product; the global stored tag is just for admin reference and future auto-tagging.)

---

## Step 3 — Add products (3 ways)

### Option A — Paste a single URL (best for hand-picking)
1. Open **`/admin?tab=shop`** as the admin (`julius.a.mason@gmail.com`).
2. Find the product on the retailer's site. Copy the URL.
   - **Amazon**: use Site Stripe → "Get Link" → Text — the URL already has `?tag=lumo-20`.
   - **Best Buy / Target / Walmart / Home Depot**: paste the retailer product URL into Impact → generate tracked link → copy that.
   - **Wayfair / Lowe's**: paste into CJ → Deep Link → copy.
   - **Etsy**: paste into Awin → generate link → copy.
   - **eBay**: paste into EPN Link Generator → copy.
3. In `/admin?tab=shop`:
   - Paste the URL into the "Paste retailer URL to auto-import…" input at the top → **Import**.
   - Lumo will fetch the title, image, price and detect the retailer automatically. Some sites (Amazon in particular) block bots — if a field comes back empty, fill it in manually from the retailer page.
   - Set **Category** (electronics / home / furniture / kitchen / etc.).
   - Toggle **Featured** for the 3 you want on the homepage widget.
   - Click **Save**. The product is live on `/shop` instantly.

### Option B — CSV bulk upload (best for hundreds/thousands at once)
1. In `/admin?tab=shop`, click **Template** to download the correct CSV header format.
2. Grab a product feed CSV from your affiliate network:
   - **Impact.com** (Best Buy / Target / Walmart / Home Depot): dashboard → **Content → Data Sync → Export product catalog**. Choose CSV. You'll get thousands of rows.
   - **CJ Affiliate** (Wayfair / Lowe's): **Advertisers → Product Catalog → Download CSV**.
   - **Awin** (Etsy): **Toolbox → Product Feeds → Download**.
   - **Amazon PA-API**: once you have API keys, use the `paapi5-python-sdk` to export a CSV — I can wire this for you separately.
3. Reshape the CSV columns to match Lumo's template. Required columns: `title, image_url, affiliate_url`. Optional: `retailer, retailer_label, category, price, price_display, description, rating, review_count, is_featured, is_active`.
4. Click **Upload CSV** in `/admin?tab=shop` and pick your file. Products appear on `/shop` immediately.

### Option C — Live API integration (when you have keys)
For a self-refreshing catalog (products update daily from the retailer), you'll want live API integrations:
- **Amazon PA-API 5** — needs your Associates account approved + 3 qualified sales in 180 days. Then hand me your access key / secret key / associate tag and I'll wire the ItemSearch loop.
- **Best Buy Products API** — free at `developer.bestbuy.com`. Rate-limited but fine for daily syncs.
- **Impact.com Publisher Feed API** — direct XML/JSON feed from your Impact account.
- Ping me with any of these keys and I'll build the sync as a nightly job.

*(Note: JD.com, Alibaba, and Temu don't offer public product APIs to non-mainland-China developers as of Feb 2026, so CSV / manual paste is the way for those.)*

## Step 4 — Watch it earn

- `/admin?tab=shop` shows per-product click counts.
- Payouts come from each affiliate network's dashboard, not from Lumo:
  - **Amazon**: monthly ACH ~60 days after month-end (net 60).
  - **Impact.com (Best Buy / Target / Walmart)**: bi-monthly to your bank.
  - **CJ (Wayfair)**: monthly, net 20.
  - **Awin (Etsy)**: fortnightly.
  - **EPN (eBay)**: monthly.

---

## Tips

- **Commission rates** vary by category (Amazon: 1–10%, Wayfair: 7%, Best Buy: 1%, Walmart: 4%). Prioritize categories with higher rates when curating.
- **Refresh links every 90 days.** Retailer URLs occasionally 404 as products are discontinued. Lumo's admin table shows dead links via the click-through count (0 clicks + old date = worth re-checking).
- **Compliance:** the `/shop` page already includes the required affiliate disclosure at the bottom — no extra work needed.
- **Do NOT list the same product twice** across retailers unless the price is materially different — it looks spammy.

---

## Quick checklist

- [ ] Amazon Associates approved, tag saved
- [ ] Impact.com account created + Best Buy / Target / Walmart programs joined
- [ ] CJ account created + Wayfair joined
- [ ] Awin account (optional, for Etsy)
- [ ] EPN account (optional, for eBay)
- [ ] Tracking IDs / links pasted into `/admin?tab=affiliates`
- [ ] At least 10 products added across 3+ retailers
- [ ] 3 products marked Featured for the homepage widget
- [ ] First sale (target: within 30 days)

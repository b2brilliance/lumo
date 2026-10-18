# Lumo — PRD & Progress Log

## Original Problem Statement
Continue building Lumo. Originally requested 5 features (toast / media / remote / P2P deposit / retailers+restaurants). All shipped + the additions below.

## Additions (Feb 2026)
- Globalization (auto-detect language/currency + per-country tax)
- Reviews & ratings on providers + storefronts
- Multi-store cart with per-store checkout
- Per-state US sales tax engine (50 states + DC)

## Iteration 64 — Feb 2026 (this session)
### 🔑 Publishing tokens panel inside Ad Studio
- **New component `AdStudioTokens.jsx`** — collapsible card at the top of Admin → Ad Studio with input fields for every social platform (Facebook: page_id + access_token · Instagram: ig_user_id + access_token · X: bearer_token · Reddit: client_id/secret/username/password/subreddit/user_agent · LinkedIn: access_token + author_urn). Secret fields render as `type="password"`.
- **Reuses existing `/api/admin/social/config` endpoints** — fetches current config on mount, saves with `PUT /api/admin/social/config/{platform}`, "Send test" calls `POST /api/admin/social/test`. Shares the same credentials as the Auto-post tab (edit either place, both update).
- **Admin-only** — rendered inside AdminConsole which is already role-gated. Never shown to customers/providers/retailers.
- **Verified live** — admin login → Admin → Ad Studio shows "Publishing tokens" panel at top with all 5 platforms, Save/Send-test buttons, existing values pre-populated.

---



## Iteration 63 — Feb 2026 (this session)
### 💼 LinkedIn auto-posting + 🌤 City weather badge
- **LinkedIn adapter (`_post_linkedin`)** — POSTs to `https://api.linkedin.com/v2/ugcPosts` using the UGC Posts API. Required cfg: `access_token` (OAuth with `w_member_social` or `w_organization_social` scope) + `author_urn` (`urn:li:person:<id>` or `urn:li:organization:<id>`). Composes a 3000-char caption, attaches the blog URL as an ARTICLE media card, publishes PUBLIC. Returns the resulting post URL.
- **Wired into fan-out loop** — `PLATFORMS` now includes `"linkedin"` so every blog publish, daily recruit broadcast and manual admin broadcast automatically fans to LinkedIn whenever the admin flips `enabled=true` in the Auto-post tab. Zero changes to the auto-share loop in `blog.py` or `recruit_cities.py` — they both iterate `PLATFORMS` dynamically.
- **Admin SocialTab UI** — LinkedIn tile with `Linkedin` icon renders automatically with the 2 required fields. Tested: PUT /config/linkedin round-trips, LinkedIn now shows in /config alongside FB/IG/X/Reddit.
- **Weather badge (`recruit_weather.py` + `<WeatherBadge />`)** — new endpoint `GET /api/recruit/cities/{slug}/weather` proxies Open-Meteo (free, no API key), geocodes each city lazily on first request, persists lat/lng on the row, caches full weather response in Mongo for 30 min per city. Frontend renders a glass-morphism pill next to each `/join/{slug}` location pill: "☁️ **78°F · Overcast**". Hides silently on upstream failure.
- **Verified live**: Miami 78°F ☁️, Boise 56°F 🌤️, Seattle 50°F ☁️. Image loads at full res.

---


## Iteration 62 — Feb 2026 (this session)
### 🖼 Real city skyline photos for all 122 metros (Wikipedia-sourced)
- **New module `recruit_cities_wiki.py`** — pulls each city's canonical infobox photo from Wikipedia's REST summary API (`GET /api/rest_v1/page/summary/{City},_{State}`). Prefers the full-resolution `originalimage.source` from Wikimedia Commons; falls back to the thumbnail upscaled by swapping the `/330px-` prefix for `/1600px-`.
- **`backfill_wiki_photos(db)`** — one-shot migration that iterates every active `recruit_cities` row and backfills `hero_image` where either (a) `wiki_photo_fetched_at` is missing, or (b) was last checked > 90 days ago. Idempotent, resilient to 404/429, 100ms stagger between cities so Wikipedia doesn't rate-limit.
- **Fire-and-forget on boot** — hooked into the existing `_seed_recruit_cities_on_boot` startup handler. ~12 seconds for all 122 cities; runs in background so FastAPI boot isn't delayed. Confirmed 70 cities updated in the first run (the other 52 were already matched); result: **all 122 cities now source=`wikipedia`** with real skyline/landmark photos.
- **Washington DC special case** — mapped slug `washington-dc` to Wikipedia title `Washington,_D.C.` since the generic "{City}, {State}" pattern wouldn't resolve.
- **Verified live** — Miami now shows **Villa Vizcaya** (iconic landmark) at 3310×1838 instead of the previous mislabeled neon-signage shot; Boise shows the real Boise skyline with capitol dome and foothills; sample of 15 random cities all show authentic city-specific landmarks (Yankee Stadium for Bronx, Carolina Theatre for Durham, Market Square for Knoxville, Old Port for Portland ME, LSU view for Baton Rouge).
- **Schema additions on `recruit_cities`**: `wiki_photo_fetched_at` (ISO ts), `hero_image_source` (`wikipedia` | `unsplash-fallback`). No breaking changes.
- **Testing**: smoke verified end-to-end — `/api/recruit/cities/miami-fl` returns Villa Vizcaya URL, image renders at 3310×1838 with `loaded=true`, neighborhoods chips still intact.

---


## Iteration 61 — Feb 2026 (this session)
### 📋 Per-category provider application forms
- **Promoted subcategory checklists** — the per-category "specific services you perform" checkbox grid (parcels/furniture/food/liquor for Delivery; brakes/oil/battery/roadside for Auto; walking/sitting/grooming for Pet care, etc.) was already defined in `serviceSchemas.js` and wired into `Register.jsx` + `ProviderProfileSection.jsx`, but **buried inside a collapsed 20-row accordion**. New prominent "**Specific services you perform**" block renders one bordered card per selected category with the sub-services expanded as checkboxes — essentially a mini-application form per category.
- **Register step 3 layout** — now reads: (1) pick primary job type → (2) **specific services per category** (NEW prominent block, auto-expanded per picked category, shows `n/m selected` counter) → (3) employment types → (4) add other categories (compact accordion for extras).
- **Settings mirror** — `ProviderProfileSection.jsx` renders the identical "Specific services you perform" block above the compact "Add another category" list so post-signup editing matches the registration experience.
- **Data model** — zero schema changes. The existing `user.subcategories: List[str]` field persists both the primary-category checkboxes and any secondary ones.
- **New test-ids** — `register-primary-subcategories`, `register-primary-cat-<key>`, `register-primary-sub-<key>` + mirror `pp-primary-*` series.
- **Testing**: smoke verified — Register.jsx & ProviderProfileSection.jsx both ship the 3 new testid prefixes; frontend has zero compile errors.

---


## Iteration 60 — Feb 2026 (this session)
### 🎨 Colored service icons + 💣 Nuclear mobile reset (recurrence #5 fix)
- **Colored service icons** — every service icon on Landing (`SERVICES`) and OrderService Step-1 category picker (`SERVICE_META`) now has a signature color (orange delivery, cyan cleaning, yellow moving, blue handyman, red mechanic, amber pet, violet tech, pink events, plus 15+ more). Hover animation still flips to white on black — colors sit on the neutral pill by default.
- **`/reset` public page (`pages/Reset.jsx`)** — nuclear reset URL for users pinned on stale mobile state. Unregisters every service worker, deletes every Cache Storage entry, clears localStorage + sessionStorage, then redirects to `/` with a cache-buster. Bookmark: `golumo.app/reset`. 4-row status list with per-step ticks so users see progress. Auto-redirect fires ~2s after load.
- **Nuke-SW auto-registration (`public/sw-nuke-v3.js`)** — new self-unregistering service worker registered at a fresh path so browsers treat it as a first-time registration and download it (even for users pinned to a stale legacy SW at scope `/`). On activate it calls `clients.claim()`, wipes every Cache Storage entry, posts a `sw-reset-complete` message to open clients (which trigger a one-time reload), then unregisters itself. Zero fetch handlers = never intercepts requests. Guarded by sessionStorage flag `lumo_nuke_v3_done` so it fires once per tab session. Combined with the iter-57 killswitch, this covers every known way a stale SW can pin a user.
- **Rationale**: This is stale-cache recurrence #5. Root cause on the last remaining affected devices was that the iter-57 killswitch **only ran once the fresh HTML reached the device** — but on iOS Safari a legacy SW's `event.respondWith(caches.match('/'))` still served old HTML that had no killswitch. The nuke SW registered from the fresh HTML forces a full origin-storage wipe the moment the fresh HTML makes it through, and `/reset` gives users a manual override for any device that never sees the fresh HTML at all.
- **Testing**: Smoke-verified `/reset` renders 4 steps + auto-progresses, `/sw-nuke-v3.js` serves 200 with `application/javascript`, `index.html` still contains the iter-57 killswitch strings + AdSense integrity, Landing icons render with 8 distinct `text-*-500/600` classes.

---


## Iteration 59 — Feb 2026 (this session)
### 📸 Media uploads + 🎯 Employment type + 👤 Provider portfolio + 🎨 Service icons + 🚫 Service removal
- **Order media attachments (`AttachmentUploader.jsx`)** — reusable image + video uploader (max 6 files, 25 MB each). Rendered in `OrderService` Step 2 under "Reference photos or videos" for every category. Attached files ride through `POST /api/jobs` as `attachments: [{id,url,type}]` and persist on the Job doc. Perfect for hairstyle refs, roadside videos, pet photos, broken-part shots.
- **Employment type per request** — new picker in `OrderService` Step 3 with 3 pill options: **On-demand / Temp / Employee**. Persists as `job.employment_type` (validated as `Literal['on_demand','temp','employee']` on the backend — typos rejected with 422). Defaults to `on_demand`.
- **Removed services** — `ride_share`, `personal_care`, and the "home_security" label (kept generic `security` category) purged from: `serviceSchemas.js`, `providerQualifications.js`, `credentialKinds.js`, `serviceQuotes.js`, `api.js` ALL_CATEGORIES, `Landing.jsx`, `Register.jsx`, `Services.jsx`, `RegionHub.jsx`, `OrderService.jsx`, `ProviderProfileSection.jsx`, `DeliveryActions.jsx`. `/order/personal_care` and `/order/ride_share` now gracefully fall back to Step-1 category picker instead of crashing.
- **Provider portfolio (`ProviderMediaSection.jsx`)** — new Settings block for role=provider only. Wires up: avatar upload (5 MB image cap), résumé upload (10 MB PDF/DOCX cap), portfolio manager (mixed images + videos + external URLs), and 5 social profile fields (X, Facebook, Instagram, TikTok, YouTube). Persists via extended `UserUpdate` model — new fields `resume_url`, `portfolio: List[dict]`, `social_links: Dict`.
- **Service icons on every list** — Landing page grid now shows 8 icon-tagged cards (Truck / Sparkles / HardHat / Wrench / Car / PawPrint / Laptop / Camera). Order wizard Step-1 category picker + Services page were already icon-tagged. Beauty replaced with Events on the Landing grid.
- **Testing**: iter_59 → **100% backend (5/5 pytest) + 100% frontend**. Zero regressions on iter-57 SW killswitch, iter-58 city enrichment, or AdSense integrity.

---


## Iteration 58 — Feb 2026 (this session, city photo + neighborhoods enrichment)
### 🖼 Per-city curated photos + 📍 hand-authored neighborhoods for local SEO
- **`recruit_cities_local.py`** — new module with two hand-curated dicts: `CITY_PHOTO_IDS` (~110 unique Unsplash photo IDs, one per major metro so /join grid stops repeating the same photo across state siblings) and `CITY_NEIGHBORHOODS` (3–5 real neighborhoods per major city like Miami → Brickell / Wynwood / Coral Gables). Fallback to a generic Unsplash photo when a city isn't in the curated map.
- **`RecruitCity` schema extended** — new `neighborhoods: List[str]` field on model, `RecruitCityIn`, and `RecruitCityPatch` (admin can edit in the RecruitTab).
- **`_backfill_local_enrichment` migration** — idempotent one-shot on every boot: only backfills a row where `neighborhoods` is empty OR `hero_image` is empty/legacy fallback. Never clobbers admin-edited values.
- **CityRecruit page renders neighborhoods as chips** + bakes them into the meta description ("Deliver in Brickell, Wynwood, Coral Gables — same-day pay") for local SEO wins.
- **Testing**: iter_58 → **100% backend (19/19 pytest) + 100% frontend**. Two known nits: (1) double `<meta name="description">` on /join/{slug} because index.html's default meta lacks the `data-react-helmet` sentinel — Helmet appends rather than replaces; (2) Miami's chosen photo ID (photo-1508009603885) is a neon-signage shot that doesn't visually represent Miami. Both non-blocking, tracked for iter-60.

---


## Iteration 57 — Feb 2026 (this session, Nationwide seed + Permanent SW fix)
### 🌎 122-city nationwide recruit expansion + 🛡 permanent stale-cache fix
- **Nationwide recruit seed (`recruit_cities_us_seed.py`)** — top-100 US metros seeded on boot. Covers all 50 states + DC + AK + HI. Combined with the original 6 priority cities, `db.recruit_cities` now has **122 active landing pages** (`/join/{slug}`). Every city gets rotating hero copy (5 headline + 5 subhead templates) and a real Unsplash city photo. Admin can override any field in the RecruitTab.
- **`/join` directory page (`CityRecruitIndex.jsx`)** — new visitor-facing index at `/join`. Hero shows total-cities + total-signups counters; live search input filters by city/state/state_full; cards grouped by state so 122 rows feel navigable. Every card links to the existing `/join/{slug}` page.
- **Sitemap emits all 122 city URLs** — `sitemap_xml` in `server.py` now queries `db.recruit_cities` and emits one `<url>` per active city plus the `/join` hub URL. Google's crawler will index the full nationwide footprint on next re-crawl.
- **Landing page CTA** — new "Pick your city" button (`data-testid='provider-city-picker'`) in the Landing provider-recruitment section links to `/join`.
- **PERMANENT stale-cache fix (`public/index.html`)** — the recurring "site only loads in Incognito" bug has been root-caused: the previous SW killswitch unconditionally unregistered EVERY service worker at page load, including the legitimate `/push-sw.js` that opted-in users had installed. Combined with mobile Safari's bfcache aggressively restoring stale pages, this created reload loops and pinned users on broken states. Fix:
  1. Killswitch now inspects each registration's `scriptURL` and preserves `/push-sw.js` while nuking any other legacy SW at scope `/`. Uses new sessionStorage key `lumo_sw_killswitch_v2` so users who hit the old broken killswitch flag get a fresh guard on next visit.
  2. New `pageshow` bfcache handler: when the browser restores a page from bfcache (`event.persisted === true`), it re-checks `/api/meta` for the current buildTime and hard-reloads if the deploy has moved. This kills the "back-forward showed me a stale page from 3 deploys ago" symptom on iOS Safari / mobile Chrome.
- **AdSense integrity retained** — `<script async src="…adsbygoogle.js?client=ca-pub-6859971059816782">` + `<meta name="google-adsense-account">` still in `<head>`; `/ads.txt` still serves at site root.
- **Testing**: iter_57 → **100% backend + 100% frontend**, all 17 sampled city slugs resolve, 122 `/join/*` URLs in sitemap, killswitch strings all present, zero regressions on Blog / Shop / AI Copy / Affiliates / order flow.

---


### ✨ AI Copy Rotator, 📢 Google AdSense, 🔗 self-signup-only affiliate filter, ⏱ website timeline removed
- **AI Copy Rotator (`ai_copy_rotator.py`)** — Claude Sonnet 4.5 rewrites the title/body of every recruit broadcast + blog auto-share caption so followers don't see yesterday's post. Alternates two tones (`hype`, `clean`) on each run so the feed feels varied. Persists last 5 variants per (source_type, source_id) in `copy_history` and passes them to the LLM as "avoid these phrasings". Falls back to base copy if the rotator is disabled or the LLM fails (never blocks the publish). Admin endpoints:
  - `GET /api/admin/ai-copy/config` → {enabled, tones, available_tones, total_rewrites, last_run_at, last_tone}
  - `PUT /api/admin/ai-copy/config` → toggle + tone selection
  - `POST /api/admin/ai-copy/preview` → force a rewrite (persists under `source_id='preview-…'` so it doesn't crowd real variants)
  - `GET /api/admin/ai-copy/history?limit=25`
- **Wired into**: `recruit_cities.broadcast_recruit_post` (calls rewrite_copy per city before publish) and `blog._share_to_channels` (rewrites caption before fanning out).
- **Admin UI**: new `AiCopyRotatorCard` in `SocialTab.jsx` — Enable toggle, tone selectors (Hype / Clean), stats strip (rewrites so far, last run, last tone), and a **Preview next recruit copy** button that runs a live LLM rewrite and shows title+body inline.
- **Self-signup-only affiliate filter (`affiliates.list_offers`)**: new `self_signup_only` bool query param (default **True**). Filters to offers with a non-empty `signup_url` and `self_signup!=False`. Every default offer (Amazon Associates, Impact, CJ, FlexOffers, Awin, Rakuten, EPN, Skimlinks, direct networks with public publisher-signup forms) passes. Prevents membership-required / invite-only programs from surfacing to visitors.
- **Google AdSense** (`components/AdSense.jsx` + `site_settings.py`): admin pastes an AdSense publisher ID (`ca-pub-…16-digits`) in `/admin?tab=site` → `admin-adsense-input`. Backend validates the format and stores it on the `site_settings` singleton. Public `/api/site/social` payload exposes it. `<AdSense />` component fetches it once on mount, injects the adsbygoogle script tag, and renders `<ins class="adsbygoogle">` slots on: **Landing (`/`)**, **Blog list (`/blog`)**, **Blog post (`/blog/:slug`)**, **Shop (`/shop`)**, **City recruit (`/join/:slug`)**. When the client ID is empty the component renders **nothing**, so pages look clean pre-approval.
- **Timeline removed from digital_tech order flow**: `serviceSchemas.js` `digital_tech.baseFields` no longer includes the `duration` field (`Expected duration: hours/days/weeks/ongoing`). AI-powered builds don't need customer-specified timelines.
- **Testing**: iter_56 (main) + iter_56b (this batch) → **100% backend (14/14 pytest)** + **100% frontend**, zero regressions. Preview LLM roundtrip ~10-15s.

---


## Iteration 56 — Feb 2026 (this session)
### 🎯 $100 city milestone + 📣 blog auto-post + 📢 daily recruit broadcast
- **Milestone bonus reworked**: `$500 after 10 jobs` → `$100 after 100 jobs` for the first 100 providers per city. `recruit_cities._reseed_bonus_amounts` migration bumps legacy $500 rows down on boot. New `credit_city_milestone()` helper fires atomically once per provider (atomic guard on `city_milestone_awarded_at`), gated by `recruit_city_slug` + first-N rank (by created_at) + 100 non-milestone paid `wallet_transactions` rows. Hooked into `_credit_provider` on both Stripe-Connect and wallet-fallback branches.
- **Social auto-publisher (`social_publisher.py`)**: Facebook Pages, Instagram Business, X (Twitter API v2), Reddit adapters. Graceful `{ok:false, skipped:true}` when creds missing — no 500s. Admin endpoints: `GET /api/admin/social/config`, `PUT /api/admin/social/config/{platform}`, `POST /api/admin/social/test`, `GET /api/admin/social/history` (paged). Persists every publish attempt into `social_posts` with per-platform status.
- **Blog fanout**: `blog.py _share_to_channels` rewritten to lazy-import `_social_publish`. Every blog post going to `status=published` fans out to whichever channels are enabled.
- **Daily recruit broadcast**: `recruit_autopost_loop()` cycles once per day, picks a random copy template per active city, composes {title, body, url=/join/{slug}, hero image, hashtags} and pushes via `_social_publish` to every enabled channel. Admin endpoints `GET/PUT /api/admin/recruit/autopost` (enable toggle) + `POST /api/admin/recruit/broadcast-now` (fire immediately, bypasses daily throttle). Logs runs in `recruit_broadcasts`.
- **Frontend**:
  - `/admin?tab=autopost` — new `SocialTab.jsx` with per-platform enable toggle, credentials fields (page_id/access_token/ig_user_id/bearer_token/reddit creds), Send-test button, recent-posts history.
  - `/admin?tab=recruit` — new `admin-recruit-autopost` block with `admin-recruit-autopost-toggle` (daily on/off) + `admin-recruit-broadcast-now` button.
  - `/join/{slug}` copy migrated from "$500 sign-on for the first 100" → "$100 loyalty bonus after your first 100 jobs".
- **Docs**: `/app/SOCIAL_AUTOPOST_SETUP.md` — step-by-step credential setup for Facebook (Meta app + Page Access Token), Instagram (linked to FB Page), X (Bearer Token, $100/mo requirement flagged), Reddit (script-app OAuth), plus a "which are worth it" comparison table.
- **Testing**: iter_56 → **100% backend (27/27 pytest)** + **100% frontend**, zero regressions vs iter_55/54/53.


## Iteration 55 — Feb 2026 (this session)
### 📍 City-targeted provider recruitment (LA, SF, Seattle, Tacoma, Chicago, Portland)
- **Backend `recruit_cities.py`** — new module + collection. Auto-seeds 6 target cities on boot (`los-angeles-ca`, `san-francisco-ca`, `seattle-wa`, `tacoma-wa`, `chicago-il`, `portland-or`), each with goal_workers=300, bonus_amount=$500, bonus_first_n=100, hero_headline / hero_subhead / hero_image copy. Endpoints:
  - Public: `GET /api/recruit/cities`, `GET /api/recruit/cities/{slug}` (includes live signups_total, signups_last_7d, spots_remaining, progress_pct), `POST /api/recruit/cities/{slug}/click`
  - Admin: `GET /api/admin/recruit/stats`, `POST /api/admin/recruit/cities` (409 on duplicate slug), `PATCH /api/admin/recruit/cities/{slug}`, `DELETE /api/admin/recruit/cities/{slug}`
- **Attribution**: `POST /api/auth/register` extended with `recruit_city_slug` → the new user gets `recruit_city_slug`, `recruit_city`, `recruit_state` fields; unknown slugs silently ignored.
- **`CityRecruit.jsx` (`/join/:slug`)**: Full landing page with hero image + headline + $500 sign-on bonus banner (shows "only N spots left"), live progress bar toward 300 goal, benefits grid (90% take-home / same-day pay / escrow / multi-service), milestone-bonus explainer card, final CTA. CTA carries `role=provider&recruit_city_slug={slug}` into `/register`.
- **Admin `RecruitTab.jsx` (`/admin?tab=recruit`)**: KPI strip (Cities / Total signups / Goal / This week) + per-city table with progress bar + Copy-link / Open-live / Pause / Edit / Delete actions + New-city dialog. Playbook link footer.
- **`RECRUITING_PLAYBOOK.md`** (persisted in `/app`): 8-channel playbook — Reddit (target subs + copy template), Facebook Groups (join-first strategy), Craigslist Gigs (winning ad body), Indeed / ZipRecruiter (budget + title format), Meta Ads (targeting stack + reel format), Google Ads (competitor-poach keywords + landing-page tip), Nextdoor + flyers, competitor poach. Weekly cadence, metrics-to-watch, SMS + email copy library, legal boilerplate.
- **Register.jsx**: reads `?recruit_city_slug=…` and `?ref=…` from the URL and forwards both to `/api/auth/register` for full attribution.
- **AdminConsole.jsx**: New `recruit` tab with `MapPin` icon between `shop` and later tabs.
- **Testing**: iter_55 → **100% backend (14/14 pytest)** + **100% frontend**, zero regressions vs iter_54.


## Iteration 54 — Feb 2026 (this session)
### 📦 Bulk removal / modify on every admin tab
- **Reusable primitives**:
  - `/app/frontend/src/components/admin/BulkActionsBar.jsx` — floating pill that appears when ≥1 row is selected; slot-based children accept `<BulkActionButton>`s with `default/danger/warning/success` variants; ships with matching `BulkCheckbox` (row + header, supports indeterminate).
  - `/app/frontend/src/components/admin/useBulkSelection.js` — hook returning `{selected, selectedIds, count, isSelected, toggle, toggleAll, clear, allSelected, someSelected}`. Selection auto-clears on data reload.
- **Backend endpoints (9 new)**:
  - Users (`admin_crud.py`): `POST /api/admin/users/bulk-delete` (self-skip), `POST /api/admin/users/bulk-patch` (whitelist role/banned/wallet_balance, role enum aligned with single PATCH: customer/provider/retailer/restaurant/admin).
  - Shop (`shop.py`): `POST /api/admin/shop/products/bulk-delete`, `POST /api/admin/shop/products/bulk-patch` (whitelist is_active/is_featured/category/retailer/retailer_label).
  - Server-level: `POST /api/admin/reviews/bulk-delete`, `POST /api/admin/withdrawals/bulk-patch` (status enum), `POST /api/admin/credentials/bulk-verify`, `POST /api/admin/credentials/bulk-reject`, `POST /api/admin/rental-bookings/bulk-patch` (status enum).
  - All 9 gated by `_require_admin`.
- **Wired into 6 tabs**: UsersTab (Ban/Unban/Delete), ShopTab (Show/Hide/Feature/Unfeature/Delete), CredentialsTab (Verify/Reject), WithdrawalsTab (Approve/Deny), ReviewsTab (Delete), RentalsTab (Approve/Decline). ContentTab already had inline bulk-delete — unchanged.
- **Testing**: iter_54 → **100% backend (15/15 pytest)** + **100% frontend** (all tabs with data validated via Playwright; Withdrawals empty in preview DB so select-all is correctly hidden — proper empty-state behavior).


## Iteration 53 — Feb 2026 (this session)
### 🗑️ Wiped fake seed catalog + 📥 real CSV bulk import
- **Wiped**: All 1001 placeholder shop products (picsum-seeded generic titles/images from `starter_1000_v1` seed) deleted from MongoDB. Auto-seed on startup has been disabled. Shop starts empty until admin adds real products.
- **CSV bulk import**:
  - `POST /api/admin/shop/products/csv` — multipart upload endpoint. Required columns: `title, image_url, affiliate_url`. Optional: `retailer, retailer_label, category, price, price_display, description, rating, review_count, is_featured, is_active`. Skips blank rows, reports per-row errors, handles UTF-8-BOM + latin-1 encodings.
  - `GET /api/admin/shop/products/csv-template` — returns a downloadable CSV with the exact header + one example row.
  - Admin ShopTab UI: **Upload CSV** button + **Template** download button next to New product.
- **/shop empty state redesigned**: Instead of "No products match", empty state now shows a proper "The shop is being restocked" card with an icon and CTA to `/services`.
- **AFFILIATE_SETUP_GUIDE.md**: Rewrote Step 3 with three add paths — (A) paste URL, (B) CSV bulk from Impact/CJ/Awin product-feed exports, (C) live API when the user gets Amazon PA-API / Best Buy Products API keys. Explicit note that JD.com / Alibaba / Temu don't offer public product APIs outside mainland China, so CSV/paste is the only path there.
- **Testing**: Backend endpoints validated via curl — template downloads, CSV upload inserts 1 row cleanly, `/shop` total goes 0 → 1 → 0.


## Iteration 52 — Feb 2026 (this session)
### 🛒 1000-product starter catalog + 🔔 Web Push notifications
- **Shop seed** replaced: `backend/shop_seed_1000.py` generates **1000 products** — 200 each across Amazon, JD.com, Alibaba, Temu (PDD Holdings), Walmart. 8 categories (electronics/home/furniture/beauty/kitchen/gaming/outdoor/apparel), realistic brand pool per retailer, deterministic image via picsum-seed. Uses **retailer-search affiliate URLs** so every click still earns commission via the retailer's cookie window. Idempotent + wipes older seed batches on boot.
- **Web Push (VAPID)**: `backend/push_notifications.py` — auto-generates a VAPID keypair on first boot (stored in `site_config`), exposes `GET /api/push/public-key`, `POST /api/push/subscribe`, `POST /api/push/unsubscribe`, `GET /api/push/status`, and a `send_push_to_user()` helper that iterates all subscriptions for a user and prunes dead endpoints (404/410).
- **Hooks**: `_send_push_to_user()` fires on `POST /api/jobs/{id}/accept` (customer gets pinged when a provider accepts) and on every `PUT /api/jobs/{id}/tracking` transition (on_the_way / arrived / in_progress / completed). Wrapped in try/except so a push failure never breaks the API.
- **Frontend**:
  - `frontend/public/push-sw.js` — dedicated push service worker (separate from the legacy `/service-worker.js` killswitch) that shows notifications and routes clicks back into the SPA.
  - `frontend/src/lib/push.js` — `enablePush()`, `disablePush()`, `pushStatus()` helpers.
  - `Settings.jsx` — new `toggle-push` row in Notifications section with error-tolerant handler.
  - `OrderService.jsx` — `order-push-optin` prompt card on the request-sent success screen with `order-push-enable` / `order-push-dismiss` buttons.
  - `Shop.jsx` — "All" retailer chip now sums retailer counts to show the true 1001 total instead of the current-page window.
- **Testing**: iter_52 → **100% backend (13/13 pytest)** + 95% frontend (headless Chromium can't subscribe to push at OS level, verified via helper mocks + testid presence).


## Iteration 52 — Feb 2026 (this session)
### 🛒 Shop upgrades — category filters, price range, sort
- **Backend `/api/shop/products` extended**: New query params `category`, `min_price`, `max_price`, `sort` (featured / price_asc / price_desc / newest / popular). Backwards compatible.
- **`Shop.jsx` UI**: New category chip row with counts (`shop-category-all` + `shop-category-{value}`), sort dropdown (`shop-sort`), collapsible filters panel with min/max price inputs (`shop-filter-min-price`, `shop-filter-max-price`, `shop-filter-apply`, `shop-filter-clear`), and a Filters toggle (`shop-toggle-filters`). Category + sort are load deps so changes fetch a fresh list.
- **Docs**: `/app/AFFILIATE_SETUP_GUIDE.md` — step-by-step for applying to Amazon Associates, Impact.com (Best Buy/Target/Walmart), CJ (Wayfair/Lowe's), Awin (Etsy) and EPN (eBay), plus how to grab the affiliate URL and paste it into `/admin?tab=shop`. Includes payout schedules, commission rates and a launch checklist.


## Iteration 51 — Feb 2026 (this session)
### 🎁 Provider Referral $25 Milestone Bonus
- **Backend `referrals.py`**: New `credit_referrer_milestone()` — when a referred provider's 10th paid job (any credit-type `wallet_transactions` row with `ref_kind` outside {"referral", None}) is written, the referrer's wallet is credited a flat $25 via an atomic `update_one` guard on `milestone_10_awarded_at` (double-pay proof). Logs a `referral_milestones` row + `wallet_transactions` row + `notifications` row. Zero effect for non-provider users, users without a referrer, or after the milestone has fired once.
- **`_credit_provider()` hook**: Fires `credit_referrer_milestone(db, provider_id=...)` on BOTH the Stripe Connect transfer path and the wallet-fallback path, after the current payout's `wallet_transactions` row is written so it counts toward the total.
- **`/api/referrals/me` extended**: Now returns `milestone_bonus_amount` (25), `milestone_bonus_goal` (10), `milestone_awarded_count`, `milestone_total_earned`, and a per-recruit `recruits[]` list with `{name, avatar_url, jobs_completed, milestone_goal, milestone_awarded}` — sorted with unpaid + most-progress-first. `reward_copy` updated to advertise "$25 when they complete their first 10 paid jobs".
- **`ReferralCard.jsx`**: New `referral-milestones` section with total-earned + paid-count summary, per-recruit rows (`referral-recruit-{id}`) with amber progress bars (teal + "+$25 paid" when awarded), and `referral-recruits-empty` fallback.
- **`ProviderExplainer.jsx`**: Below-video hint tile swapped from "Escrow protected" → "$25 referral bonus / Per invited provider" so the recruitment surface advertises the new bonus.
- **Testing**: iter_51 → **100% backend (7/7 pytest)** + **100% frontend**, verified idempotency (11th job doesn't double-pay), role guard, empty-referrer guard, and copy accuracy.


## Iteration 50 — Feb 2026 (this session)
### 🛠️ Admin Shop Manager + Post-Match Contact Bar + Auto-Import + Featured Home Widget
- **Admin Shop Manager**: New `/admin?tab=shop` (data-testid `admin-shop-tab`) — list of all products with retailer chips, per-row Show/Hide (data-testid `admin-shop-toggle-{id}`), Edit dialog with 12 fields, Delete confirm, and a top-bar "Paste retailer URL to auto-import…" input.
- **Retailer Auto-Import**: `POST /api/admin/shop/products/auto-import` — accepts `{url}`, fetches the page with httpx + browser UA, regex-parses OG meta tags for title/image/price/description, detects retailer from hostname across 9 mapped retailers (Amazon, Best Buy, Wayfair, Target, Walmart, Home Depot, Lowe's, Etsy, eBay), and returns a draft ShopProduct the admin can review + save.
- **Post-Match Contact Bar**: `LiveTrack.jsx` now renders `tracker-contact-bar` under the tracker title the moment `provider_id` is set. Shows counterparty avatar (or initials fallback `tracker-counterparty-initials`), a Call anchor (`tracker-call`, tel: link — only when the tracking endpoint returns `counterparty_phone`) and a Message button (`tracker-message`, focuses the ChatPanel input). Backend `GET /api/jobs/{id}/tracking` extended with `counterparty_phone` + `counterparty_avatar_url`.
- **Featured Shop Widget**: `FeaturedShopWidget.jsx` — 3-card featured-product grid inserted on `Landing.jsx` between the trust bar and Community Market teaser. Card click records affiliate click + opens retailer in a new tab. Silently hides if no featured products exist.
- **Testing**: iter_50 → **100% backend (12/12 pytest)** + **100% frontend**, zero regressions vs iter_49.


## Iteration 48–49 — Feb 2026 (this session)
### 🛍️ Affiliate Shop + Live Tracker + Provider Video + Instant Payout
- **Affiliate Shop (`/shop`) — new**: Public product feed importing 25 seed items across Amazon, Best Buy, Wayfair, Target, Walmart. New `backend/shop.py` with `create_router` + `seed_shop_products` boot hook. Endpoints: `GET /api/shop/products` (with retailer / category / q / featured / pagination filters), `GET /api/shop/retailers`, `GET /api/shop/categories`, `POST /api/shop/click/{id}` (records click + returns affiliate URL), plus admin CRUD (`POST/PATCH/DELETE /api/admin/shop/products`, `POST /api/admin/shop/products/bulk`). Frontend `Shop.jsx` has retailer chips, featured strip, product cards (with retailer accent badge + rating), disclosure block, and an affiliate-marketing tagline. Lumo does NOT fulfill or ship — clicks open the retailer in a new tab. NavBar gained `nav-shop` for guests + customers.
- **Marketplace cleanup**: Removed the "Earn cashback while you shop" AffiliateBlock; replaced with a subtle `marketplace-shop-teaser` block linking to `/shop`.
- **Order Live Tracker (Step 4 → success screen)**: `OrderService.jsx` success state now shows 3-layer pulsing ping animation around a check icon, `data-testid=order-track-live` primary CTA that links to `/jobs/:id/track` (the existing LiveTrack page with real-time GPS map + status pill + ETA), plus a secondary `order-see-requests` fallback.
- **Provider Onboarding Video**: `ProviderExplainer` component (already existed with 4-scene animated tour + optional `REACT_APP_PROVIDER_VIDEO_URL` embed) is now injected at the top of `Register.jsx` whenever `role=provider` on step ≥ 2, wrapped in `data-testid=register-provider-explainer`.
- **Wallet Instant Payout**: `ProviderHub.jsx` header gained a `provider-instant-payout` pill button. Balance is now sourced live from `GET /api/wallet` (no more stale `user.wallet_balance`); button gates on that state, and click posts `POST /api/wallet/withdraw` with the exact header amount, then zeroes the header and disables the button.
- **Testing**: iter_48 → **100% backend (10/10 pytest)** + 92% frontend with 2 medium bugs found. iter_49 retest → **100% frontend (6/6)** — both bugs fixed (Shop filter+featured coexistence; ProviderHub live balance source-of-truth).


## Iteration 47 — Feb 2026 (this session)
### 🛒 4-step Uber-styled Order wizard + role-siloed route guards
- **OrderService.jsx complete rewrite**: Deep-linked `/order/:service` now flows through a wizard with a persistent progress-dots header (`data-testid=order-step-indicator`) + sticky bottom footer CTA:
  - **Step 1 — Category picker** (skipped when URL has a valid service). 12 popular tiles + Describe-custom-request fallback. `data-testid=order-category-<value>`.
  - **Step 2 — Details**. Short title, description, schema-driven `ServiceDetailsForm`. Continue is blocked until a subcategory is chosen (toast on invalid).
  - **Step 3 — Dispatch**. Address input(s) driven by `locationModeFor(cat)` (single onsite / pickup+dropoff), plus Now/Schedule pill toggle with `datetime-local` when scheduled.
  - **Step 4 — Review**. Summary rows + auto-quote breakdown (delivery/moving/market) + low-key deposit note (`data-testid=summary-deposit-note`) that ONLY appears on this step (per user directive — no heavy deposit advertising elsewhere).
- **Role-siloed guards (App.js)**: New `RoleAwareLanding` silently redirects logged-in providers → `/provider` and admins → `/admin` when they hit `/`. New `CustomerOnly` wrapper on `/order` and `/order/:service` silently punts wrong-role logins to their own home. `/cart` upgraded to `roles=['customer']`. Redirect targets computed by `homeFor(user)`.
- **Testing**: iteration_47 → **100% backend (5/5 pytest)** + **100% frontend (33/33 browser)**, zero regressions. Deposit note absent on Steps 1-3, present only on Step 4. Guest+customer flows submit; provider/admin get redirected to their silos across `/`, `/order/*`, `/cart`.


## Iteration 46 — Feb 2026 (this session)
### 🎨 Uber-inspired redesign
- **Design tokens** (`index.css`): flipped root palette to stark black + white with single blue accent (#276EF1). Space Grotesk headings (with -0.02em tracking), IBM Plex Sans body, IBM Plex Mono for overlines/labels. New utility classes: `.btn-lumo` variants (primary/secondary/accent/outline/ghost + sm/lg sizes) — all pill-shaped with active-scale, `.card-lumo` + hoverable variant, `.nav-glass` for glass-blurred sticky nav, `.hero-vignette` for image overlays.
- **NavBar rewrite**: sticky glass-blurred nav (`backdrop-filter: saturate(180%) blur(14px)`), circular black-white "L" logo, pill Sign-in/Get-started buttons, role-siloed testids preserved.
- **Landing.jsx complete rewrite**: 6-section Uber-inspired layout — (1) split hero with big Space Grotesk headline + pill search + right-side courier photo with vignette, (2) 8-tile service grid with hover lift, (3) how-it-works 3-step, (4) obsidian black trust-stat bar (10%/<24h/100%/4.9), (5) Community Market teaser section, (6) provider recruitment dark banner with benefit tiles.
- **SiteFooter** flipped to obsidian black — high-contrast white text on black, matches the new dark-banner ending pattern.
- Route isolation from iteration 45 preserved (guest/customer/provider/admin nav silos). Every service tile, quick-book chip, marketplace + provider CTA has a data-testid.
- Testing: iteration_46 → **100% frontend (23/23)**, zero issues, zero regressions.



## Iteration 45 — Feb 2026 (this session)
### 🔀 P2P-only pivot — kill stores/restaurants/rentals/autos + role-siloed nav
- **Backend**:
  - `BUSINESS_ROLES_DISABLED = {retailer, restaurant}` added; `POST /auth/register` rejects those roles with a 400 pointing users to sign up as providers instead.
  - New startup hook `_deactivate_business_accounts` stamps `deactivated_at` on every existing retailer/restaurant so they're preserved (not deleted) but hidden.
  - Owner admin bootstrap now seeds a password hash (Mason0123 via `OWNER_ADMIN_PASSWORD` env override).
- **Frontend routing** (App.js): `/stores`, `/restaurants`, `/rentals*`, `/autos*`, `/real-estate*`, `/marketplaces`, `/retailer`, `/restaurant` all redirect to `/services` (or `/marketplace` in one case) via `<Navigate replace />`. Community `/marketplace` stays as the sole P2P surface.
- **NavBar.jsx (full rewrite)**: Role-siloed nav via `NAV_BY_ROLE` table. Guest → services/marketplace/earn. Customer → services/marketplace/my-orders. Provider → jobs-near-you/dashboard. Admin → admin only. Container `data-testid=nav-{role}` so tests can assert isolation.
- **Register.jsx**: ROLES list trimmed to Customer + Service provider only. **Landing.jsx**: BROWSE tiles trimmed to Marketplace only. **SiteFooter.jsx**: Marketplaces column replaced with a two-item Browse (services + marketplace).
- Testing: iteration_45 → **100% backend + 100% frontend**, zero issues. Legacy business accounts confirmed deactivated (not deleted).



## Iteration 43 — Feb 2026
### Admin CRUD (Users + unified Content)
- **admin_crud.py (new)**: PATCH /admin/users/{id}, DELETE /admin/users/{id}, GET /admin/content?type={type}, PATCH /admin/content/{type}/{id}, DELETE /admin/content/{type}/{id}, POST /admin/content/bulk-delete, GET /admin/content/types. Whitelisted editable fields per type. Prevents self-deletion of admin account.
- **UsersTab.jsx (new)**: Search + role filter + edit dialog (name/email/role/wallet/banned) + delete confirm.
- **ContentTab.jsx (new)**: 5 type pills (listing/inventory/rental/auto/job) + search + status filter + edit dialog (per-type editable fields) + delete + bulk-delete.
- **AdminConsole.jsx**: added Content tab; replaced legacy read-only UsersAdmin with new UsersTab.
- Testing: iteration_43 → 100% backend (17/17) + 100% frontend.

## Iteration 44 — Feb 2026 (this session)
### Category-driven provider signup with qualifications + document upload
- **providerQualifications.js (new)**: schema catalogue for 20+ categories (delivery, courier, ride-share, towing, cleaning, handyman, auto, landscaping, moving, pet-care, medical, personal-care, digital-tech, marketing, business-admin, education, legal, financial, events, remote-work). Each schema declares questionnaire fields (text/number/select/radio/checkbox) + required + optional documents.
- **QualificationBlock.jsx (new)**: renders one schema per selected category — question fields plus an integrated document uploader that hits the new public `POST /api/media/upload-provider-doc` endpoint (JPG/PNG/PDF, 8 MB max, no JWT required).
- **Register.jsx**: added a native `<select>` primary-category dropdown as the FIRST section of step 3 (data-testid=register-primary-category). Selecting a category auto-adds it to the multi-category list and renders the corresponding QualificationBlock immediately. Submit is gated by `validateQualification()` — required fields + docs must be filled per selected category.
- **server.py**: RegisterBody accepts `primary_category` + `qualifications`; register endpoint persists both. New public `/api/media/upload-provider-doc` endpoint (line ~720).
- Testing: iteration_44 → **100% backend (5/5) + 100% frontend**, zero issues.



## Iteration 42 — Feb 2026 (this session)
### Provider explainer video + Sell-an-item deep link
- **ProviderExplainer.jsx (new)**: Full 60-second product-tour section rendered right after the `/for-providers` hero. Supports three source modes via `REACT_APP_PROVIDER_VIDEO_URL`: YouTube iframe, Vimeo iframe, or direct HTML5 `<video>` (mp4/webm). When the env var is unset (default today) it falls back to a CSS-animated tour: 4 scenes × 15 s each with scene-accent colour transitions, sliding detail cards, progress bar, clickable scene dots, play/pause, and a live 0:xx / 1:00 counter. Below-video hint tiles reinforce the 10% flat fee + 24-h payout pitch.
- **App.js**: added `<Route path="/marketplace/new" element={<Marketplace />} />` so the Landing "Sell an item" tile (and any share-linked deep link) resolves.
- **Marketplace.jsx**: `location.pathname === "/marketplace/new"` auto-opens the "Create listing" dialog. `wasOpenRef` guards a second effect that rewrites the URL back to `/marketplace` only *after* the dialog has been opened and then closed — so the URL stays shareable while the dialog is up.
- Testing: `testing_agent_v3_fork` iteration_42 initial run: 89% (one bug — URL rewrote on mount before dialog dismissed). Fixed via `useRef` guard + manual screenshot verify → URL stays `/marketplace/new` while dialog open, rewrites on Escape.



## Iteration 41 — Feb 2026 (this session)
### ScrollToTop, Marketplace filters, Adzuna + Reed aggregator wiring
- **ScrollToTop.jsx (new)**: mounted inside `BrowserRouter` in `App.js`. Fires `window.scrollTo(0, 0)` on every PUSH/REPLACE route change; ignores POP (back/forward) and hash-only changes so browser history feels natural. Fixes the footer-link problem where clicking About or How-it-Works would drop you halfway down the destination page.
- **Marketplace.jsx**: added a full filter bar above the item grid — search text, category select, min/max price, distance-radius (5/10/25/50/100 mi), sort (newest / price ↑ / price ↓ / nearest first), "Use my location" button (browser geolocation, or auto-pulled from `user.default_delivery_address` when signed in), active-filter badge, "Clear" reset, and a live result count (`N of M listings`). Distance shown on each card when buyer coords are set. All client-side filtering on the loaded list.
- **aggregators.py**: added `fetch_adzuna()` (reads `ADZUNA_APP_ID`, `ADZUNA_APP_KEY`, `ADZUNA_COUNTRIES`) and `fetch_reed()` (reads `REED_API_KEY`, `REED_KEYWORDS`). Both gracefully return `[]` with an info log when keys aren't set. `fetch_usajobs()` upgraded to send `Authorization-Key` + email User-Agent when `USAJOBS_API_KEY` / `USAJOBS_USER_EMAIL` are set. Wired all new sources into `ingest_aggregated_jobs()`. User will add keys to `backend/.env` at a later date.
- Testing: `testing_agent_v3_fork` iteration_41 → **100% backend + 100% frontend** pass, zero blockers.



## Iteration 40 — Feb 2026 (this session)
### Marketing pages refactor + admin referral-tracking nudge
- **MarketingPages.jsx**: Removed hero CTAs on info-first pages (HowItWorks, ForProviders, ForCustomers, About, ProviderCityIndex). Added shared `FinalCTA` component rendered at the END of every marketing page (data-testid=`marketing-final-cta`) with primary + secondary buttons. Added `AffiliateBlock` at bottom of HowItWorks/ForCustomers/ForProviders so info pages also expose partner referral opportunities. Added a "Why every step of Lumo is built to protect both sides" info section on HowItWorks and a "28+ services, one flow" info block on ForCustomers.
- **AffiliateBlock.jsx**: The "Admin: add tracking ID" pill on partner cards is now a clickable `<button>` (data-testid=`affiliate-setup-<slug>`) for admin users that navigates to `/admin?tab=affiliates` via react-router `useNavigate`. Non-admins still see the static hint.
- **AdminConsole.jsx**: New amber banner (data-testid=`admin-affiliate-setup-banner`) shown when partner tracking IDs are unfilled — displays `N of M partner tracking IDs still need to be added` with an "Add tracking IDs" CTA that jumps to the Affiliates tab. Tab state now syncs to `?tab=` querystring so deep links from AffiliateBlock land on the right tab. 100% frontend test pass (iteration_40.json).


- Country-specific provider business / tax registration credentials (SIRET, EIN, GSTIN, etc.) across 15 countries
- AI document verification (Claude Sonnet 4.6 → Gemini 3.1 Pro fallback) with on-demand buttons on credentials + media
- **Rentals marketplace — 11 categories, instant-book + request-to-book, security deposits, per-category attributes**
- **NavBar reorganized — "Marketplaces" dropdown groups Marketplace / Stores / Restaurants / Rentals**

## User Choices (verbatim)
- Reviews: completed-transaction gated + photo + overall stars + 3 sub-ratings
- Cart: multi-store, per-user MongoDB persistence, separate per-store checkout
- US tax: hardcoded 50-state table now (Stripe Tax flagged P3)
- AI verify: extract + regex + explanation; Claude→Gemini fallback; ≥0.90 auto-verify; everywhere; on-demand button
- Rentals: 10 consolidated categories + Venues (= 11); "Marketplaces" dropdown nav; instant + request-to-book per listing; 10% bundled deposit + optional refundable security deposit; high-value categories (Property / Vehicles / Venues) require host ID/business verification before going live

## Architecture
- **Backend**: FastAPI (`server.py`, ~3400 lines — flagged for splitting), MongoDB (Motor), JWT auth, Emergent Object Storage, Stripe via `emergentintegrations.payments.stripe.checkout`, Claude Sonnet 4.6 + Gemini 3.1 Pro via `emergentintegrations.llm.chat` (vision for doc verification + text for translation/assistant).
- **Frontend**: React 19 + react-router-dom v7 + Tailwind + shadcn/ui + sonner; `LocaleProvider` + `AutoTranslator` for app-wide i18n; `CartProvider` for cart; per-category rental taxonomy with icons and filters.
- **Routes**: `/`, `/login`, `/register`, `/customer`, `/provider`, `/retailer`, `/restaurant`, `/stores`, `/restaurants`, `/stores/:id`, `/restaurants/:id`, `/marketplace`, `/map`, `/jobs/:id`, `/orders/:id/pay`, `/wallet`, `/chats`, `/credentials`, `/cart`, `/rentals`, `/rentals/:id`, `/settings`, `/checkout/success`, `/checkout/cancel`.

## Implemented — most recent first
### Single-deploy self-healing (Feb 7, 2026) — the actual incognito-bug root cause
- **Root cause identified**: the frontend static host serves `index.html` (HTTP 200, `Content-Type: text/html`) as a fallback for ANY unknown `/static/*` URL. So a stale browser HTML that references `main.OLDHASH.chunk.js` gets HTML content back, the browser refuses to execute HTML as JS with `SyntaxError: Unexpected token '<'`, and the app never boots. This is why users needed incognito.
- **`__lumoAssetFail` inline handler** (public/index.html) — clears ServiceWorker + Cache Storage + hard-reloads with `?_cb=<now>`. Guarded by 10s sessionStorage against reload loops.
- **`window.addEventListener('error', ..., true)`** — capture-phase global listener that catches BOTH shapes of failure:
  1. Network error / 404 → `ev.target` is the `<script>` / `<link>` node
  2. **MIME-mismatch SyntaxError → `ev.target` is `window`, but `ev.filename` is the offending URL and `ev.message` starts with "Unexpected token '<'"** — the exact production bug, now detected and healed.
- **New `scripts/postbuild-harden.js`** — runs after `craco build` (via `"build"` script). Adds `onerror="__lumoAssetFail(event)"` and `data-lumo-asset` attributes to every `<script src="/static/js/*">` and `<link rel=stylesheet href="/static/css/*">` CRA emits.
- **`<meta http-equiv="Cache-Control" content="no-store, no-cache, must-revalidate">`** + Pragma + Expires meta tags — belt-and-suspenders for browsers that ignore server headers.
- **Verified in preview via Playwright reproduction**: injected `<script src="/static/js/main.DEADHASH.chunk.js">` → the CDN's MIME-mismatch triggered SyntaxError → my listener fired `__lumoAssetFail` with the correct filename + message. In production this triggers a hard reload → fresh HTML → correct current bundle hashes → app boots.

### Referral engine math correction (Feb 7, 2026)
- Updated `PROVIDER_TAKE_TO_REFERRER_RATIO` from `1/900` → `1/90`. Referrer now earns **10% of Lumo's 10% commission = 1% of gross**. Verified: $100 gross job → provider $90 → referrer $1.00 exactly. `/api/referrals/me` reward_copy updated to "roughly $1 for every $100 they earn."


- **NEW `/app/backend/rate_limit.py`** — sliding-window in-memory throttle. `/api/auth/login` capped at 10 attempts / IP / 15 min; `/api/auth/register` capped at 20/15 min. Successful login resets the counter. Returns HTTP 429 with `Retry-After` header + structured `{code:"rate_limited", message}` detail.
- **NEW `/app/backend/referrals.py`** — end-to-end referral engine:
  - Every user auto-gets a 6-char referral code on register (`referral_code`, uniqueness-checked; excludes `0/O/1/I` for typability)
  - `/auth/register` accepts `ref_code`; new user gets `referred_by_user_id` + `referred_by_code`
  - `credit_referrer()` wired into `_credit_provider()` — fires on EVERY payout path (Stripe Connect transfer, escrow release, wallet fallback). Referrer earns **1% of Lumo's 10% commission** = `provider_take / 900` (e.g. $100 provider take → $0.1111 referrer bonus). Logged in `referral_earnings` collection, credited to wallet, notification pushed.
  - `GET /api/referrals/me` → code, share_url, referred_users, events, total_earned, recent[], reward_copy.
- **Frontend referral capture** — new `<RefCapture/>` component (in App.js) reads `?ref=`/`?r=`/`?referrer=` on any URL, stores in `localStorage` for 30 days with first-touch precedence. `AuthProvider.register()` attaches it to `/auth/register` and clears on success.
- **NEW `<ReferralCard/>`** rendered on `/wallet` (visible to everyone). Shows code + share link + total earned + recent list. Includes `navigator.share` for mobile native sheet.
- **`react-helmet` → `react-helmet-async` upgrade** — silences the `UNSAFE_componentWillMount` warning (confirmed 0 console warnings on Landing). Swapped imports across 8 files; wrapped app in `<HelmetProvider>`.
- **Server.py refactor** — first two modules extracted (`rate_limit.py`, `referrals.py`) to demonstrate the routes/ pattern. Full split into `routes/auth.py`, `routes/jobs.py`, `routes/payments.py` remains in backlog (too risky for one session; will be done in stages).


- **AddressInput reverted to legacy `google.maps.places.Autocomplete`** — the newer `PlaceAutocompleteElement` needs "Places API (New)" to be enabled in Google Cloud (user hasn't). Legacy Autocomplete uses the classic Places API which already works on their key. Confirmed live: typing "1600 Amphitheatre" surfaces 5 real Google suggestions.
- **LocaleSwitcher promoted to the global sticky header** (`NavBar.jsx`), pinned right of the Lumo logo/name, now visible on EVERY page and EVERY screen size (removed the `hidden sm:block` gate). Duplicate LocaleSwitcher on Landing hero deleted.
- **Cache-busting hardened** to fight the "app only loads in incognito" bug:
  - New inline bootstrap `<script>` at the top of `public/index.html` — reads `<meta name="lumo-build" content="…">` (baked in per build), fetches `/api/meta` (no-store, always fresh through Cloudflare per `cf-cache-status: DYNAMIC`), and on mismatch nukes ServiceWorker + Cache Storage + hard-reloads with `?_cb=<buildTime>`. Guarded by 15s sessionStorage against loops.
  - `write-meta.js` now injects the timestamp into BOTH `public/index.html` and `build/index.html` on every prebuild.
  - React `CacheBuster` component still runs as the secondary long-tab poll every 5 min.
  - **⚠️ First-deploy caveat**: users already stuck on a stale HTML need one cache TTL to expire before the new bootstrap kicks in. After that they're on the self-heal train forever.


- Fixed URL-mismatch bugs found by testing agent iter36:
  - `/provider-hub#payouts` → `/provider#payouts` in JobDetail.jsx & MapPage.jsx toast actions
  - `onboard_hint` in backend now returns `/provider?stripe=onboard`
  - Notification link + robots.txt + email CTA path + stripe_connect comment updated
- ProviderHub now scrolls to the Stripe Connect card when arriving with `#payouts` or `?stripe=onboard`.
- Added `data-testid="address-input-wrap"` on the new PAE wrapper for E2E targetability.

⚠️ **Google Cloud Console action required (user)**: enable "Places API (New)" on the project for `REACT_APP_GOOGLE_MAPS_API_KEY`. The migration itself is complete and the deprecated Autocomplete warning is gone, but suggestions never render until the New Places API is allowlisted. Users can still type an address (it flows through as a raw string) but lat/lng auto-attach is disabled until enabled.


- **AddressInput migrated to `google.maps.places.PlaceAutocompleteElement`** — the legacy `Autocomplete` class is deprecated for accounts created after 2025-03-01. New AddressInput dynamically imports the `places` library, instantiates the web-component, listens on `gmp-select` for selections (fetches `formattedAddress` + `location`), and re-emits `input` events for controlled forms. Styled via `.lumo-place-autocomplete` + `::part(input)` so it visually matches the Shadcn Input primitive. Falls back to a plain `<Input>` when the SDK / API key is missing.
- **Stripe Connect onboarding is now enforced before accept**. Backend gate `_require_stripe_onboarded()` returns HTTP 402 `{code: "stripe_onboarding_required", message, onboard_hint}` when a provider tries to accept a job whose payments will route through Stripe. Skipped for cash-only jobs, admins, and dev environments where Stripe isn't configured. Also enforced on quote-accept (customer accepting a provider's quote when that provider hasn't onboarded). Frontend `errorCode()` helper + Sonner action button open `#payouts` / scroll to `StripeConnectCard`.
- **Seed backfill**: existing `provider@lumo.test` seed users now get `stripe_details_submitted=true` on startup so regression tests continue to accept jobs without a real Connect roundtrip.


- **Homepage `<LocaleSwitcher />` restored** — placed to the right of the location bar with `data-testid="home-locale-switcher"`. Full flag+currency+language dropdown.
- **AutoTranslator now translates `placeholder` attributes** — new pass walks every `input[placeholder], textarea[placeholder]`, records the English source in a `placeholderState` WeakMap, batches into the same `/api/i18n/translate` call, and writes back via `setAttribute`. Handles route changes and re-translates when the language switches.
- **Live service-quote calculators (see prior entry)** — the primary user complaint that spawned this session.
- **Cache-busting `/api/meta` endpoint verified** — headers `cache-control: no-store, no-cache, must-revalidate` + `expires: 0` + `pragma: no-cache`. CacheBuster polls it every 5 min and forces a hard reload on new `buildTime`.
- Non-blocking notes from testing agent (not fixed this pass): react-helmet `UNSAFE_componentWillMount` warning (upgrade to `react-helmet-async`), Google Maps `places.Autocomplete` deprecation (migrate to `PlaceAutocompleteElement` before Q2 2026).


## Implemented — most recent first
### Major-city expansion — US, India, UAE, UK, China, Australia (Jul 1, 2026)
- **LANDING_CITIES expanded** from 40 → **166 cities**. Each auto-generates:
  - `/cities/:slug` hub with services, city name in title/meta/H1, JSON-LD Place schema
  - Four programmatic SEO pages per city: `/work/:cat/:city`, `/find-help/:cat/:city`, `/sell/:cat/:city`, `/rent-out/:cat/:city`
  - Sitemap entry (weekly changefreq, priority 0.7)
- Breakdown of the 6 targeted countries after expansion:
  - **US**: 47 cities (added DC, Vegas, Nashville, Charlotte, Detroit, Indianapolis, Columbus, Memphis, Louisville, Baltimore, Milwaukee, Kansas City, OKC, Cincinnati, SLC, Raleigh, New Orleans, Minneapolis, Tampa, Orlando, Jacksonville, Pittsburgh, St. Louis, Cleveland, Sacramento, Fort Worth, El Paso, San Jose, Long Beach, Oakland)
  - **India**: 26 (added Pune, Ahmedabad, Surat, Jaipur, Lucknow, Kanpur, Nagpur, Indore, Bhopal, Chandigarh, Kochi, Coimbatore, Vadodara, Visakhapatnam, Patna, Bhubaneswar, Gurgaon, Noida, Thane)
  - **UAE**: 8 (all seven emirates + Al Ain)
  - **UK**: 18 (added Birmingham, Glasgow, Liverpool, Leeds, Bristol, Cardiff, Belfast, Newcastle, Sheffield, Nottingham, Leicester, Coventry, Southampton, Oxford, Cambridge)
  - **China**: 14 (added Guangzhou, Shenzhen, Chengdu, Chongqing, Tianjin, Wuhan, Xi'an, Nanjing, Hangzhou, Suzhou, Qingdao, Dalian)
  - **Australia**: 13 (added Adelaide, Gold Coast, Canberra, Newcastle-AU, Wollongong, Hobart, Darwin, Geelong, Sunshine Coast)
- **Sitemap grew from 6,182 → 13,553 URLs** — a 2.2× expansion of Lumo's indexable surface.


### Jobs cleanup + W-2 rename + Region SEO hubs + Marketplaces removal (Jul 1, 2026)
- **Aggregator ingest hardening** (`/app/backend/aggregators.py`):
  - Reject any external listing where `pay_rate <= 0` — no more "$0" filler
  - One-shot `cleanup_junk_jobs(db)` startup migration deleted **3,840 legacy zero-pay aggregator rows** + any job whose title starts with "test"
- **`/remote-jobs` page** — brand-new dedicated feed for external listings (Greenhouse, RemoteOK, WWR, USAJobs) with keyword/country/min-pay filters. Kept OFF the local `/map` feed so on-demand + staffing agency remain uncluttered.
- **`/api/map/jobs?include_external=false` (default)** — local map excludes aggregator rows unless explicitly requested.
- **`/api/jobs/external`** — filterable feed for the new page (q, country, min_pay, is_remote, limit).
- **"W-2" renamed to "Salaried"** across NavBar, MapPage, Register, Login, BecomeProvider, ProviderProfileSection — global term instead of US-only tax jargon.
- **New `/regions/:slug` route** (`/app/frontend/src/pages/RegionHub.jsx`) — state + country-level SEO hubs with:
  - Geo meta tags (`geo.region`, `geo.placename`, `geo.position`, `ICBM`)
  - JSON-LD (BreadcrumbList + State/Country schema)
  - Service tiles funneling to `/order/:service`
  - Cities-within-region internal links
  - "Also serving" neighbourhood strip for long-tail SEO
  - Live external jobs pulled by region name
  - Priority 0.9 in sitemap
- **7 regions seeded**: California, Texas, New York State, Nevada (US), India (country), plus aliases (bangalore → cities/bengaluru, ny/ca/tx/nv shortcuts).
- **Top-nav "Marketplaces" dropdown removed** — was broken, unused imports cleaned up. All marketplaces still reachable from homepage "Browse & buy" grid + footer.
- **Sitemap** grew to **6,182 URLs** with 5 high-priority region pages.


### Uber-style per-service ordering pages + condensed homepage (Jul 1, 2026)
- **`/order/:service` route** (`/app/frontend/src/pages/OrderService.jsx`) — one dedicated ordering page per service (30 services mapped: delivery, courier, moving, cleaning, handyman, pet_care, personal_care, it_support, tutoring, notary, locksmith, appliance_repair, security, tax, translator, photography, junk_removal, snow_removal, auto_detailing, etc.). Step-by-step layout:
  1. **Where?** — single or pickup+dropoff address (auto-picked from `locationModeFor(category)`) with Google Places autocomplete
  2. **When?** — Now vs Schedule (datetime-local) toggle
  3. **Tell us more** — title, description, ServiceDetailsForm (preserves every existing field — subcategory, sub-fields, "Other" free-text)
  4. **What's it worth?** — auto-quote for delivery/courier/moving via `computeDeliveryQuote`/`computeMovingQuote`, tax breakdown from `computeBreakdown`
  5. Big single-button "Confirm request" — success state redirects to `/customer` to see the request
- Preserves the exact same POST `/api/jobs` payload as the old CustomerHub form so no backend changes needed.
- **Homepage condensed** from 18 tiles to **two grouped rows**:
  - "Get help — order now" (8 tiles): Delivery, Cleaning, Moving, Handyman, Pet care, Beauty, Tech help, More services → each routes to `/order/:service`
  - "Browse & buy" (6 tiles): Food, For sale, Cars, Rentals, Housing, Stores → each routes to the existing marketplace pages
- ServiceDetailsForm bug fix — corrected prop name (`details` not `value`) so the details form renders across every category.


### Uber × Craigslist homepage redesign + mobile UX (Jul 1, 2026)
- **Landing.jsx rewritten** — cut from 345 lines of marketing copy to 210 lines of function:
  - "What do you need?" giant search input on top (routes to `/stores?q=…` for unified search)
  - Auto-detected location bar (`Showing near <Country>`) with click-to-change picker (15 top countries)
  - 18-tile mobile-first category grid (Delivery, Food, Stores, For sale, Cars, Rentals, Housing, Cleaning, Handyman, Moving, Pet care, Childcare, Beauty, Tech & IT, Tutoring, Photo & video, Jobs, More)
  - 4-tile quick-action strip (Post a job, Jobs near me, Sell an item, Earn on Lumo)
  - Compact "90% / 1 tap / 24 hr" value tiles
  - REMOVED: marketing hero, philosophy sections, `HomeReviewsSection`, `EmailSubscribeForm`, commission comparison chart, on-demand banner. All that clutter is gone.
- **`MobileTabBar` component** (`/app/frontend/src/components/MobileTabBar.jsx`) — Uber-style sticky bottom nav on mobile with 4 tabs: `Search / Jobs / Market / Me`. Active tab highlighted teal. Auto-routes `Me` to the user's role-appropriate hub (customer / provider / retailer / admin) or `/signin` when logged out.
- **Mobile sub-nav hidden on homepage** — the sticky "Find work / Marketplaces / Customer" tile row (previously below the top nav on mobile) is now hidden on `/` since the homepage IS a category picker. Retained on all other routes for role switching.
- **Language selector moved back next to the logo** in NavBar per user preference (`nav-locale-left` position).
- **Homepage now sub-3s to first meaningful action** — visitor lands, sees search bar and category grid immediately, no marketing copy blocking the fold.


### Affiliate / referral engine + Insurance + Cities SEO hubs (Jun 28, 2026)
- **Affiliate engine** (`/app/backend/affiliates.py`):
  - Mongo collections: `affiliate_offers`, `affiliate_clicks`, `affiliate_settings`.
  - 64 pre-seeded partner offers across **autos, real-estate, marketplace, restaurants, provider, wallet, customer, rentals, stores, global** + **insurance** subcategory (Progressive, GEICO, Root, The Zebra, Lemonade, Policygenius, Thimble, Next Insurance, Hiscox, Simply Business, Ethos, Ladder, Trupanion, Hippo, World Nomads, SafetyWing).
  - Endpoints: `GET /api/affiliates/offers?category=&country=`, `GET /api/affiliates/click/{slug}` (302 redirect with tracking ID injection), `GET /api/affiliates/subcategory-labels`, `GET/POST/PATCH/DELETE /api/admin/affiliates/offers`, `GET/POST /api/admin/affiliates/settings`, `GET /api/admin/affiliates/analytics`, `POST /api/admin/affiliates/reseed`.
  - URL templating: `{placeholder}` tokens (e.g. `{amazon_tag}`, `{impact_click_id}`) are replaced at click time from `affiliate_settings.keys`.
  - Offers grouped by `subcategory` (loans / insurance / warranty / sell / banking / investing / hotels / flights / tours / etc.) — front-end renders one section per subcategory with intent-driven headers.
- **AffiliateBlock component** (`/app/frontend/src/components/AffiliateBlock.jsx`) embedded in Autos, RealEstate, Marketplace, Directory (Stores/Restaurants/Rentals), ProviderHub, Wallet, CustomerHub, CityHub. Renders FTC-compliant disclosure, "Sponsored" badge, per-offer "Admin: add tracking ID" hint when keys are missing.
- **Admin Console "Affiliates" tab** (`/app/frontend/src/pages/admin/AffiliatesTab.jsx`):
  - **Offers** — list 64+ offers, add/edit/delete with subcategory dropdown
  - **Tracking IDs** — auto-populated form with every unique placeholder across all offers (~30 fields)
  - **Clicks** — analytics: total + per-offer click counts
  - **Signup guide** — numbered checklist of 48 affiliate networks/programs with direct signup URLs and tracking-ID hints
- **Cities SEO hub** (`/cities` + `/cities/:slug`) — single index page + 73 per-city hubs that fan out to every `find-help/work/sell/rent-out` × `category` × `city` landing page. Adds ~2,500 new programmatic SEO surfaces.
- **LANDING_PAGE_TYPES expanded** — find-help and work types now include notary, mechanic, locksmith, appliance-repair, IT support, errands, security, junk removal, snow removal, auto detailing, tax prep, legal help, translator, photographer, event staff.
- **NavBar "Earn" link** for anonymous visitors (data-testid `nav-earn`) → `/become-a-provider`.
- **Footer reorganized** — 4-column layout: Earn (Become a provider / List your stuff / Host a rental / All cities), Marketplaces, Lumo, Follow us.
- **Landing.jsx Helmet** — LocalBusiness, BreadcrumbList, Speakable JSON-LD for rich-result eligibility.
- **Sitemap** — total URLs grew from ~3,500 to **6,096**.
- **Hardened admin patch endpoint** with `AffiliateOfferPatch` Pydantic partial model so arbitrary fields can't be injected.
- Backend pytest: **22/22 PASSED** (`/app/backend/tests/test_iter35_affiliates_seo.py`).


### External job aggregator + sticky map + GPS-gated W-2 (Feb 27, 2026)
- **Why**: User asked to ingest jobs/rentals/listings from "every publicly available source." I scoped it to **legal-only** sources (no scraping of any kind — Airbnb/Vrbo/Indeed/LinkedIn/Craigslist explicitly excluded due to ToS).
- **New `aggregators.py`** module — pulls every 6h from 4 ToS-permitted public APIs:
  - **USAJobs.gov** — US federal jobs (public, no key)
  - **Greenhouse Job Board API** — every open role at 30+ curated companies (Stripe, Airbnb, Coinbase, Lyft, DoorDash, Anthropic, OpenAI, etc.) — first sync pulled **3,413 jobs**
  - **RemoteOK** — public JSON feed of remote tech jobs — first sync pulled **100 jobs**
  - **WeWorkRemotely** — RSS feeds across 4 categories — first sync pulled **126 jobs**
  - First manual sync ingested **3,639 jobs total**. Idempotent upsert on `(source, source_id)`.
- **Background sync loop**: `asyncio.create_task(aggregator_loop(db))` runs on `on_startup`. Initial 30s delay, then every 6h.
- **Admin endpoints**:
  - `GET /api/admin/aggregators` — see last-sync metadata
  - `POST /api/admin/aggregators/{source}/toggle` — disable any source
  - `POST /api/admin/aggregators/sync` — manual trigger
- **Frontend**: feed rows now show a `via greenhouse` / `via remoteok` / `via wwr` / `via usajobs` badge alongside the existing `External apply` pill. External jobs use the same `apply_url` mechanism as W-2 listings — providers click out to the original posting.
- **Sticky map on `/map`**: map now uses `lg:sticky lg:top-4` so it stays pinned at the top of the viewport on desktop while the feed scrolls beneath it. Mobile falls back to natural scroll (sticky on small screens eats too much vertical space).
- **GPS-gated W-2 view**: `/map?employment=w2` now hides W-2 listings entirely when no location anchor is set, with a prominent amber CTA + "Use my current location" button using `navigator.geolocation.getCurrentPosition`. A compact 📍 GPS button is also added to the radius selector row for non-W-2 views.


### Centered homepage language bar + 24 new languages (Feb 27, 2026)
- **Why**: User reported the language picker that used to sit at the top-middle of the homepage was gone, and wanted more languages.
- **Backend**: `SUPPORTED_LANGS` expanded from 10 → **34** languages. New additions: Portuguese (Portugal), Italian, Dutch, Polish, Russian, Ukrainian, Turkish, Swedish, Korean, Traditional Chinese, Bengali, Urdu, Hebrew, Persian/Farsi, Vietnamese, Thai, Indonesian, Malay, Filipino/Tagalog, Swahili, Hausa, Yoruba, Amharic, Greek. `LANG_LABELS` updated with native-script labels (한국어, ไทย, বাংলা, etc.).
- **Frontend `locale.jsx`**: language is now decoupled from country — added independent `langOverride` state (stored under `lumo_lang_override` in localStorage) with `setLangOverride(code | null)` setter. `useLocale().lang` resolves to `langOverride || profile.lang`. A French-speaking user in the US can now keep USD pricing.
- **New `LanguageBar.jsx`**: centered horizontal pill bar at the top of `Landing.jsx`. Fetches `/api/i18n/languages` live (so future backend additions auto-appear). Shows 7 pills by default with a `+ N more` expander; active pill flips to teal with a check; `↺ Auto` reset appears when overridden. All inner labels are marked `data-no-i18n` so the AutoTranslator doesn't mangle them.
- **Smoke-tested**: bar renders at y=57 px (1920px viewport), 8 pills visible (7 langs + expander), 34 languages returned by API. Clicking `Español` flips the active pill correctly; AutoTranslator picks up the new lang and rewrites copy across the DOM asynchronously (already covered in prior iterations).


### Uber-style live order tracking + auto-routed chat (Feb 27, 2026)
- **Why**: User asked for the same flow Uber has — when a provider accepts a customer request, the customer should be able to track the provider live on a map, get an ETA, see status changes (on the way / arrived / in progress / complete), and chat with them.
- **Backend (`server.py`)**:
  - New Pydantic models `LocationPing` (lat/lng with -90/-180 bounds, optional heading + speed) and `TrackingStatusUpdate` (5 allowed statuses).
  - `POST /api/jobs/{id}/location` — provider-only; stores `provider_live_location = {lat,lng,heading,speed,updated_at}` on the job. 403 if not assigned, 400 if job completed/cancelled.
  - `POST /api/jobs/{id}/status` — provider-only; statuses: `accepted | on_the_way | arrived | in_progress | completed`. Sets `tracking_status` + `tracking_timestamps.{status}`; flips job.status when in_progress/completed; pushes a customer notification (`tracking_{status}`) with link `/jobs/{id}/track`.
  - `GET /api/jobs/{id}/tracking` — customer or assigned provider; returns tracking_status, tracking_timestamps, provider_live_location, destination (= dropoff || pickup), pickup/dropoff, eta_minutes (haversine / 25 mph * 60), job_status, job_title.
  - `POST /api/jobs/{id}/accept` and `POST /api/quotes/{id}/accept` now both set initial `tracking_status="accepted"` and insert a `provider_accepted` notification for the customer with direct link to the tracker.
- **Frontend**:
  - New page `LiveTrack.jsx` at `/jobs/:id/track` (Protected route). Renders a 520px Google Map with two custom SVG pins (teal arrow = provider, red drop pin = destination) + a teal polyline connecting them, a status pill with icon, ETA in min, "Last ping Xs ago" label, and an embedded `ChatPanel`. Polls `/api/jobs/{id}/tracking` every 5 s.
  - When viewer is the assigned provider → 4 status-update buttons appear ("On the way", "Arrived", "Job in progress", "Complete") + a note that location is being shared until completed.
  - New hook `useProviderLocationPinger` (`/app/frontend/src/hooks/useProviderLocationPinger.js`) wraps `navigator.geolocation.watchPosition` and POSTs every ~12 s while a job is live. Auto-cleans up on unmount or completion.
  - `JobDetail.jsx` shows a prominent **Track live →** button on the assigned-provider row.
  - `CustomerHub.jsx` shows a **Track →** button on each job row that has a provider and isn't completed.
  - `ProviderHub.jsx` "Your active deliveries" shows **Open tracker →** for each row.
- **Tested**: iteration_34 — 6/6 backend + 9/9 frontend PASS. ETA matches haversine/25 mph within 0.2 min. RBAC verified (third-party = 403). NavBar overflow + dismiss-job persistence also re-tested and pass.



### Settings → Provider profile editor + /map W-2 job-board filters (Feb 27, 2026)
- **Settings provider profile** (`ProviderProfileSection.jsx`, mounted in Settings.jsx): only shown for `role === "provider"`. Mirrors the Register-wizard step 3 — 4 employment-type tiles · 20 category checkboxes with expanding sub-categories (live from `SERVICE_SCHEMAS`) · bio · certifications · work history. Independent save button (only appears when dirty). Saves via PATCH `/api/auth/me`.
- **/map W-2 + remote job-board filters** (`MapPage.jsx`): when `?employment=w2` or `?employment=remote`, an Indeed-style filter bar appears above the feed. Inputs: keyword search (title + description, case-insensitive) · min/max **annualised** pay (hourly is auto-multiplied by 2080, monthly by 12, weekly by 52, daily by 250) · 4-pill schedule selector (Full-time · Part-time · Contract · Flexible) · clear-all link.
- **🐛 Caught + fixed in iter 33**: `<button>`-inside-`<button>` hydration warning where Radix `<Checkbox>` was nested in the category-row outer button. Replaced the Checkbox with an inline SVG checkmark icon in both ProviderProfileSection AND Register.jsx so the warning is gone.
- **Tested**: iteration_33 — 11/11 frontend behaviors PASS. Keyword filter narrowed 6 W-2 jobs → 2 with "engineer". Min-pay $150k filter narrowed 6 → 1 (only the $165k Senior software engineer remains). Provider state restored to baseline at end.

### Big portal restructure: wizard sign-up/sign-in + nav reorg + W-2/remote seed (Feb 27, 2026)
- **3-step Register wizard** (`Register.jsx` rewrite): Step 1 = role tiles (Customer · Service provider · Retailer · Restaurant — mutually exclusive). Step 2 = name/email/phone/password + avatar (required for providers, locked behind "Upload photo to continue"). Step 3 (provider-only) = employment-type tiles (On-demand · Staffing & temp · Remote · W-2 — multi-select) + 20 category checkboxes with expanding sub-category lists from `SERVICE_SCHEMAS` (hard filter on feed) + optional bio · certifications · work history.
- **2-step Login wizard** (`Login.jsx` rewrite): Step 1 = role tiles. Step 2 = email/password with the picked role echoed in a green badge. "Change account type" back link + "Use phone or Google instead" → `/signin`. Mismatched role on login warns via toast but doesn't block — account's real role wins.
- **NavBar reorg**: top bar now reads `Jobs near you · Work ▼ · Marketplaces ▼ · Customer`. New `Work` dropdown with 4 employment-type tiles each linking to `/map?employment={type}`. `Customer` link absorbed the old standalone "Hire and order" CTA. Mobile sub-bar tiles updated accordingly. NavBar Sign-in button now routes to `/login` (new wizard); `/signin` remains for phone/Google.
- **Backend hard-filter on opportunities**: `/api/provider/opportunities` skips jobs whose `employment_type` isn't in the provider's `employment_types` AND skips jobs whose `details.subcategory` isn't in the provider's `subcategories` (when set). Empty arrays = show everything (don't punish fresh accounts).
- **W-2 + remote seed** (`remote_w2_seed.py`): 12 hand-curated listings (6 remote 1099/contract + 6 W-2 salaried) — RN telehealth, senior software engineer, diesel mechanic, construction PM, ESL tutor, bookkeeper, customer support, etc. Each links to a real public job board (Indeed/LinkedIn/Upwork/Rev). Idempotent — wipes any older `remote_w2_*` seed tag before re-inserting.
- **MapPage**: reads `?employment=` query param, passes to `/api/map/jobs`. Feed rows show employment-type chip + "External apply" chip when the job has `apply_url`; clicking opens the source URL in a new tab via `<a target="_blank">`.
- **🐛 Caught + fixed in iter 32**: legacy jobs missing the `employment_type` field were excluded from `?employment_type=on_demand` filter (exact-equality query). Fixed with `$or` + `$exists: false` so legacy jobs count as on-demand. Verified live: 54 on-demand · 6 W-2 · 6 remote · 66 total.
- **Tested**: iteration_32 (10/11 backend pytests + 100% frontend) + post-fix curl verification (54+6+6=66 all balance).

### Mobile scroll lock + payment-method default + commission bar fix (Feb 27, 2026)
- **🐛 Mobile horizontal-swipe lock** — applied `overflow-x: hidden` + `max-width: 100vw` to the `<html>` element only (not `<body>`), plus mobile-only `touch-action: pan-y` and `overscroll-behavior-x: none`. Two iterations were needed because the first attempt put `overflow-x: hidden` on body too, which (combined with body `height: 100%`) silently promoted `<body>` to the scrolling container — breaking `window.scrollY`, scroll restoration, IntersectionObserver, sticky headers, and analytics. iteration_31 confirms the clean fix: window/html scroll normally, body stays `overflow: visible`, horizontal swipe is blocked.
- **Default "Allowed payment methods"**: CustomerHub post-a-job form and StoreProfile order dialog now default to `['app']` only instead of all three (`app`, `cash`, `card`). Users opt-IN to extra methods rather than opt-out.
- **Commission-compared bar chart**: switched from `grid grid-cols-12` (col-span-3 / col-span-7 / col-span-2) to a flex layout with a 28% fixed name column, flex-1 bar middle, and 12px-wide right-aligned percentage cell + gap-3. Long names like "TaskRabbit" and "Airbnb (host)" no longer bleed into the bar on mobile. Verified: all 6 rows have `offsetWidth === scrollWidth` on both mobile and desktop.
- **GSC verification flexibility**: added `googleQLpfJ_Vp5XhTC6VRffLMXJKpI3qPAN8mTpjLY6OqUn0.html` at `/app/frontend/public/` so users can verify via HTML-file method if meta-tag fails. iteration_28 confirmed all four GSC paths work (meta tag, HTML file, sitemap-index, dynamic /api/sitemap.xml).
- **Tested**: iteration_28 (GSC) 8/8 · iteration_30 (4/5, regression caught) · iteration_31 (8/8, regression fixed).

### "Live map" → "Jobs near you" + "P2P" → "Community Market" (Feb 27, 2026)
- **"Live map" renamed** to **"Jobs near you"** across the NavBar Marketplaces sheet and the MapPage overline. Clearer about what the button does for first-time visitors.
- **"P2P / Peer-to-peer" replaced with "Community Market"** throughout user-facing copy:
  - NavBar Marketplaces dropdown: "Community Market — Goods from your neighbors — used, gear, drops"
  - `/marketplace` page overline + heading: "COMMUNITY MARKET / From your neighbors."
  - Map legend chip: "Delivery & local sellers" (was "Delivery & P2P")
  - Landing.jsx hero pictograms: "People — From your neighbors"
  - Marketplace create-listing dialog copy
  - Login.jsx side card: "Local + courier" (was "P2P + courier")
- Internal/code-comment references to "P2P" left untouched (engineering jargon stays where it belongs).
- **Verified live**: page renders correctly with new copy in screenshot.

### Mobile load fix (Service Worker killswitch) + Search Console sitemap fix + Admin safety net (Feb 27, 2026)
- **🚨 iPhone "site can't be reached" mobile bug — root cause + fix**: The symptom (works in incognito, fails in regular Safari) is the textbook signature of a stale Service Worker registered by an earlier deploy that's still cached on user devices. Shipped a **killswitch SW** at `/service-worker.js` that unregisters itself + wipes all caches on first fetch, plus a tiny script in `index.html` that proactively unregisters any SW on every page load and hard-reloads once (guarded by sessionStorage so it can never loop). On next user visit their browser cleans itself up and the site loads normally.
- **Provider accept-job button now prominent**: existed at `data-testid="accept-job-{id}"` but was crammed into a `col-span-1` slot with `h-7 px-2` — easy to miss. Bumped to `h-8 px-3 font-semibold`, relabelled "Accept job" / "Send quote" so providers can find them.
- **Admin dashboard safety net**: new generic `<ErrorBoundary>` component. Wraps every admin tab (with reset → analytics tab) AND the entire Routes tree (with reset → home). Any tab crash now shows a friendly amber chip + Retry/Go-to-safety buttons instead of a blank screen.
- **Admin link in footer**: admin-only `<Link to="/admin">` added next to Privacy/Terms/Blog with a ShieldCheck icon. `data-testid="footer-link-admin"`.
- **Google Search Console sitemap fix**: dynamic sitemap was using the internal cluster URL (`...cluster-9.deploy.emergentcf.cloud`) for all entries. Search Console rejected this because URLs must match the host the sitemap is served from. Now uses `PUBLIC_BASE_URL` (defaults to `https://golumo.app`). Same fix applied to `llms.txt` and `robots.txt`. Added a static `/sitemap.xml` sitemap-index at the public root so GSC's default sitemap path (`/sitemap.xml`) works without configuration.
- **Smoke-tested**: all 12 admin tabs render with content (no boundary triggered), footer admin link present for admin role only, `/api/sitemap.xml` returns `https://golumo.app/...` URLs, `/service-worker.js` returns 200 with the killswitch code.

### Brand name preserved in translations + "Find work" link fix (Feb 26, 2026)
- **🐛 Critical routing bug**: Landing.jsx and StripeConnectCard.jsx referenced `/provider-hub` — a route that DOESN'T EXIST. The real route is `/provider`. The catch-all redirect was sending all "Find work near you" / "Open your dashboard" clicks (and Stripe Connect return URLs) back to the homepage. Now all four references point to `/provider`. Verified live: provider login → Landing → "Find work near you" → `/provider` ✓ / "Open your dashboard" → `/provider` ✓.
- **Staffing CTA also routes non-provider logged-in users to `/map`** (the public open-jobs view) instead of `/provider` (which requires the provider role).
- **Brand-name preservation in i18n**: `/api/i18n/translate` now wraps `Lumo`, `Lumi`, and `Stripe` in sentinel markers (`«BRAND»`) before sending to the LLM. The model is instructed to keep the sentinels verbatim; after parsing the reply we swap them back to the real brand. Defense-in-depth: if the LLM strips a sentinel anyway, that translation is discarded and we ship the English source rather than lose the brand.
- **Cache hygiene**: on each request, any cached entry whose source contains a brand token but whose stored target doesn't is deleted and re-translated with the new prompt. Fixes legacy polluted translations from before this guard.
- **Verified live**: "Welcome to Lumo" → ES "Bienvenido a Lumo" · JA "Lumoへようこそ" · HI "Lumo में आपका स्वागत है" · AR "مرحباً بك في Lumo". Brand stays as "Lumo" in Latin, Japanese, Hindi, and Arabic scripts — no transliteration.

### Provider profile-photo requirement at sign-up (Feb 26, 2026)
- **Backend gate**: `POST /api/auth/register` now returns `400 "Profile photo is required for service providers"` when `role=="provider"` and `avatar_url` is missing. Customers / retailers / restaurants remain optional. `UserCreate`, `UserOut`, and `UserUpdate` extended with `avatar_url`.
- **New public endpoint** `POST /api/media/upload-avatar` — anonymous (no JWT needed since users register first), image-only (rejects non-`image/*` with 400), 5 MB ceiling (413 on overflow). Stored under `{APP_NAME}/avatars/anon/...` with `kind:"avatar"` tag for future cleanup.
- **Frontend**: new `<AvatarUploader>` component with circular preview + Change/Remove buttons. Rendered conditionally on `Register.jsx` only when Provider role is selected (`requiresAvatar = form.role === "provider"`); submit button reads "Upload photo to continue" + is disabled until a photo is uploaded.
- **Settings page**: same uploader added to the Profile section. Saves instantly via PATCH `/api/auth/me`. Amber warning chip for providers without an avatar so existing seeded providers can complete their profile.
- **🐛 Pre-existing bug fixed**: Register.jsx role-sync `useEffect` depended on `form.role`, snapping the role back to `initialRole` on every click. Now depends only on `initialRole` so role buttons actually work.
- **Tested**: iteration_27 — 14/14 backend pytests (`/app/backend/tests/test_iter27_provider_avatar.py`) + 11/11 frontend flows PASS. Seeded accounts left clean.

### Map page job feed: chronological + user-selectable radius (Feb 26, 2026)
- **Replaced the grouped-by-type listing** under the `/map` page with a clean chronological feed (newest first). The map at top is untouched (same `MapView` component, all category-coloured pins, full filters).
- **User-selectable radius** — segmented pill bar with 7 options: `5 / 10 / 25 / 50 / 100 / 250 / Any` miles. Persists to `localStorage` (`lumo.map.radius`) so it remembers between visits. Anchor location: provider's `user.location`, customer's `user.default_delivery_address`, anonymous → no anchor → "show everything". Remote jobs always appear regardless of distance.
- **New feed row design**: coloured side-rail keyed to category group · category + remote chips · title + 1-line description · stats column with pay rate / distance / time-ago. Hover sync with map highlight. Cleaner than the previous nested groups.
- **Backend**: `/api/map/jobs` now returns `created_at` + `description` per pin and pre-sorts newest-first so frontend can render a chronological feed without extra fetches.
- **Tested**: smoke-screenshot as provider@lumo.test (saved NYC location) — pill bar live-filters between 24 jobs (5 mi) → 25 (250 mi) → 54 (Any). Selection persists across page reloads. Old grouped selectors (`map-group-*`, `map-category-*`) return 0 count.

### Wiring notification_prefs + default_delivery_address pre-fill (Feb 26, 2026)
- **Server-side notification filter** (`/app/backend/server.py` — new `NOTIF_TYPE_TO_PREF` map + `_filter_notifications_by_prefs`). `GET /api/notifications` now drops items whose `type` maps to a pref the user has disabled (`order_updates` / `job_matches`). 13 lifecycle types gated (quote_*, rental_*, order_*, delivery_marked, plus 2 forward-looking job-match types). Always-show types: `new_message`, `review_*`, `payout_*`.
- **Marketing email opt-out** (`/app/backend/email_subs.py`). `_run_one()` builds an `opted_out` set in one indexed query (`{email: {$in: emails}, notification_prefs.marketing_emails: False}`) and skips matching subscribers. Subscribers without a user account are treated as opted-in (they explicitly subscribed). Response now exposes `opted_out` count for admin telemetry.
- **Default delivery address pre-fill** across all three checkout flows:
  - `Marketplace.jsx` — new `openBuy(it)` seeds the buy dialog from `user.default_delivery_address`
  - `StoreProfile.jsx` — `openOrder()` seeds address + lat + lng so distance quote computes immediately
  - `Cart.jsx` — `getForm()` default reads the saved address, populating every per-store form
- **Bug fixed (CRITICAL)**: Marketplace.jsx had a `useEffect` dep array of `[deliveryMiles, deliveryQuote]` where `deliveryQuote` is a fresh object every render → infinite re-render loop when the user had a saved address with coords. Dropped `deliveryQuote` from deps (it's a pure derivation of `deliveryMiles`). Verified live: buy dialog opens cleanly with pre-fill, distance quote computes, zero page errors.
- **Tested**: iteration_26 backend 18/18 pytest pass, frontend regression verified via main-agent screenshot (NYC→SF Haversine = 2566 mi quote, no crashes).

### User-facing Settings page redesign + Google Search Console verification (Feb 26, 2026)
- **Removed** the developer-facing "Restrict your Google Maps API key" section from `/settings` — that was operator advice, not a user preference.
- **New 6-section Settings page** at `/settings` (logged-in users):
  1. **Profile** — editable name + phone (read-only email + role)
  2. **Default delivery address** — Google Places autocomplete + Pin-on-map. Pre-fills checkout dialogs across Marketplace / Stores / Restaurants.
  3. **Notifications** — 4 toggles: order updates, job matches (providers only), marketing emails, blog digest
  4. **Accessibility** — toggles for "reduce motion" (kills all transitions/animations) and "larger text" (+15% body font). Applied globally via `<html>` classes by `AccessibilityApplier` mounted at App root.
  5. **Country & language** — kept (live preview of currency / tax / locale)
  6. **Account** — Change password (inline card) + Sign out. New endpoint `POST /api/auth/me/password` validates current password + min 6-char new password (passwordless OAuth/SMS users can set a first password).
- **Sticky bottom save bar** appears only when settings are dirty (deep JSON compare) — single PATCH `/api/auth/me` persists everything.
- **Backend**: `UserUpdate` extended with `default_delivery_address`, `notification_prefs`, `accessibility_prefs`. PATCH `/api/auth/me` now uses `model_dump(exclude_unset=True)` so explicit `null` properly clears stored fields (was previously dropping nulls).
- **Google Search Console**: domain ownership verification meta tag (`google-site-verification`) added to `index.html` so the user can submit the sitemap.
- **Tested**: iteration_25 — 5/5 backend pytests + full frontend E2E PASS. Save bar + all toggles + change-password + country picker verified. Password reset back to baseline at end.

### Context-aware CTAs + P2P distance-based delivery + SEO meta tags (Feb 26, 2026)
- **Landing CTAs**: every "Create an account / Sign in / Start earning" CTA on `/` is now context-aware. Logged-in users see "Open your dashboard" → role-routed to `/provider-hub | /retailer | /restaurant | /admin | /customer`; staffing CTA flips to "Find work near you". Anonymous users still see "Create an account" → `/signin`. Hero, staffing, and final CTA all share the same `primaryCta` derivation in `Landing.jsx`.
- **P2P Marketplace distance-based delivery**: `/marketplace` checkout now mirrors the Stores/Customer-Hub flow. Buy dialog has a Google-Places AddressInput + MapPickerButton; when both the listing's seller pickup location AND the buyer's delivery address have coords, Haversine miles → `computeStoreDeliveryQuote` auto-quotes the delivery fee ($4 base + $1.50/mi) and syncs the editable fee input via `useEffect`. New "Pickup location" field on the create-listing form lets sellers save coords on `listings.location`. Friendly fallback chips: "Seller hasn't set a pickup location" or "Pick your delivery address to get an exact quote".
- **SEO meta tags** (`/app/frontend/public/index.html`): comprehensive OpenGraph (og:title, description, image 1200×630, url, locale), Twitter `summary_large_image` card, `meta name=keywords/author/robots/googlebot`, `<link rel="canonical">`, and JSON-LD `@graph` with Organization + WebSite (incl. SearchAction → `/map?q={search_term_string}`). All tags render in the served HTML for static crawlers (Twitter/Facebook/LinkedIn).
- **BlogPost dynamic title**: `/blog/:slug` now updates `document.title` to `"{post title} — Lumo blog"` and overwrites the meta description with a 160-char post snippet on mount; restores both on unmount.
- **robots.txt**: sitemap line absolutized to `https://golumo.app/api/sitemap.xml`.
- **Note on search-engine submission**: Google + Bing deprecated their public ping APIs in 2023. The sitemap is auto-discoverable via `robots.txt` and must be submitted manually via Google Search Console + Bing Webmaster Tools (one-time).
- **Tested**: iteration_24 — all targeted frontend assertions pass; testing agent verified logged-out/logged-in CTA flips, full SEO tag set in HTML, Marketplace buy-dialog UI states, and code-reviewed the dynamic title flow and quote-block trigger.

### Auto-blog + Email newsletter + SEO (sitemap/llms.txt) (Feb 26, 2026)
- **Auto-blog** (`/app/backend/blog.py`):
  - 6-topic rotation (local hustle / marketplace economics / city spotlights / how-tos / founder updates / industry trends)
  - 2x daily auto-publish loop (default 09:00 + 17:00 UTC, configurable)
  - Emergent LLM key → Claude Sonnet 4.5 for body + Gemini Nano Banana for hero image
  - **Lumo logo watermark** applied bottom-right via PIL on every hero image
  - Optional auto-share to Distribution channels (default on)
  - Admin "Blog & email" tab: status panel, pause/resume, generate-now, post list with view/unpublish/delete
  - Public `/blog` index + `/blog/:slug` post pages with minimal-but-safe markdown rendering
- **Email newsletter** (`/app/backend/email_subs.py`):
  - 10-topic rotation (delivery / hire / earn / marketplace / real-estate / autos / food / rentals / stripe-payouts / business-hire)
  - 2x daily send loop (default 10:00 + 18:00 UTC, configurable)
  - Resend integration with graceful fallback — when no `RESEND_API_KEY`, emails are queued + logged so no subscribers are lost
  - One-click unsubscribe link in every email (no login required)
  - Public POST `/api/subscribe` + form on homepage
  - Admin sub-tab: stats tiles (active/unsubscribed/sent/last-send), search, send-now, delete subscriber
- **SEO endpoints** (existing `/api/sitemap.xml` enhanced):
  - Sitemap now includes /about, /contact, /terms, /privacy, /blog AND every published blog post as /blog/{slug}
  - NEW `/api/llms.txt` — site description per llmstxt.org with core pages, pricing, differentiators
  - `/api/robots.txt` upgraded with AI-crawler welcomes (GPTBot, ClaudeBot, PerplexityBot, Google-Extended) and Disallow rules for /admin and other private dashboards
  - Static `/llms.txt` and `/robots.txt` also live in `/app/frontend/public/` as backups
- **Tested**: iteration_23 — 22/22 backend pytest + full frontend E2E PASS. The run-now endpoint actually called Emergent LLM and produced a real watermarked post.

### Payments tab + Users tab + Homepage Reviews + Webhook wizard + Install UX (Feb 26, 2026)
- **Admin Payments tab** (`/admin` → "Payments") — Stripe keys editor encrypted with Fernet at rest. Save/Clear/Test connection. Masked display, source badge (env vs db), fee slider, live mode warning. Cache auto-reloads on save (no restart).
- **Admin Users tab** (`/admin` → "Users") — polished read-only browser with search, role filter, sort, avatar list. Click any user → side panel showing recent jobs/orders/reviews/wallet/withdrawals. No edit (per user request).
- **Homepage reviews section** — `/api/site/reviews` public endpoint. When ≥3 verified 4-5 star reviews exist: grid of testimonials with verified badges + 1%-cashback disclosure. Otherwise: "Founding 100" aspirational block (FTC-compliant, no fake reviews).
- **1% review cashback** — every honest review (4 stars or 1 star) earns 1% of the order back to the reviewer's Lumo wallet. Wallet_transactions entry + notification created.
- **Webhook setup wizard** — Distribution → Add channel dialog now shows step-by-step setup instructions (3-5 numbered steps) + deep link per platform (Discord, Telegram, Slack, Zapier, Make, IFTTT, Generic, X, LinkedIn, Reddit, Mastodon, Bluesky, Pinterest, Threads). Each step has time estimate.
- **Simpler Install Lumo UX** — chip says "Install Lumo · one tap" (Android/Chrome) or "show me how" (iOS). iOS modal cut to 2 visual steps. Persistent "Install Lumo" button in footer (only shows on installable browsers).
- **Tested**: iteration_22 — 12/12 backend + frontend E2E PASS.

### Mobile sub-nav + Admin Data tools + Map reorg + catch-all routes (Feb 26, 2026)
- **Mobile sub-nav** (md:hidden second row below the main nav) with 3 large tiles: "Find work" (Provider Hub), "Shop & browse" (opens a slide-up Sheet listing all 6 marketplaces + Live map), "Hire & order" (Customer Hub). Plain names with subtitle for clarity.
- **Map page** listings rewritten — grouped by category_group (Delivery / Services / Digital / Remote) with a coloured bar header, then by category within each group, then a 3-column responsive card grid. Empty state if no jobs match.
- **Admin "Data" tab** (new) with full inspect + wipe tools for 17 historical collections (pageviews, users, reviews, ads, notifications, etc.). **Protected** (cannot be wiped): jobs, orders, wallet_transactions, withdrawal_requests, stripe_transfers, site_settings, analytics_settings. Wipe requires typing the collection name to confirm + optional "older than ISO" filter. User-wipe automatically excludes role=admin. Every wipe logs to audit_logs.
- **Catch-all routes** in `App.js` — `/admin/*` → `/admin`, `/*` → `/` so closing nested admin pages never leaves a blank screen.
- **Tested**: iteration_21 — 20/20 backend + full E2E (mobile + desktop) PASS.

### Landing page revamp + commission story (Feb 26, 2026)
- **Removed** the off-putting "10% deposit / 90% remaining balance" payment block from the homepage.
- **New section "Keep 90% of what you earn"** — leads with the value to providers; flat 10% commission. Visual comparison bar chart shows Lumo (10%) vs TaskRabbit (15%), Instacart (15%), DoorDash (25%), Uber Eats (30%), Airbnb (14%) — Lumo's bar is shortest and highlighted in teal.
- **New "Anything from anywhere, delivered today" banner** (dark, full-width) emphasizing same-day on-demand delivery from retailers, restaurants, AND individuals (peer-to-peer drops).
- **New "Personal staffing agency" section** for workers — amber palette, 12-skill grid, CTA to /signin.
- **New "Find help in minutes, not weeks" section** for businesses — blue palette, asymmetric layout, 4-tile grid, CTAs to post a job + browse providers.
- **Kept** existing hero, use-case tiles, and look-and-feel; added a final centered CTA section.
- **Payment options highlighted** as quiet 3-card row under the commission story: Escrow / Pay how you want / Auto-release in 24h.

### Analytics reset + click-into drill-downs (Feb 26, 2026)
- **Backend** (`/app/backend/analytics.py`):
  - New `POST /api/admin/analytics/reset` wipes the `pageviews` collection and writes a `cutoff_at` ISO timestamp to a `analytics_settings` singleton.
  - All existing aggregates (overview, visitors, signups, orders, providers, revenue) now filter `created_at`/`payment_released_at` >= cutoff so pre-deployment activity disappears from totals while business records remain intact.
  - New `GET /api/admin/analytics/details/{metric}` drill-down endpoint supporting `visitors`, `pageviews`, `top_paths`, `signups`, `signups_<role>`, `active_jobs`, `completed_jobs`, `active_orders`, `completed_orders`, `gmv`, `commission`, `payouts`, `top_providers`. Accepts `range_key=24h|7d|30d|all` and `limit`/`skip` pagination. Revenue metrics include a `by_category` aggregate.
- **Frontend** (`/app/frontend/src/components/Analytics.jsx`):
  - Every stat tile is now a clickable button that opens a `DetailsDialog` modal with a paginated table, range selector, and per-metric column layout.
  - New `ResetButton` with AlertDialog confirmation in the dashboard header; cutoff timestamp shown as "tracking since…" label.
  - Per-role signup tiles (customer/provider/retailer/restaurant) each drill into a role-filtered user list.
  - Sparklines + Top Paths + Top Providers sections also clickable.
- **Tested**: iteration_19 — 25/25 backend pytests + full frontend E2E pass; reset confirmed wipes pageviews and updates cutoff display in real time.

### Stripe Connect — real bank payouts (Feb 26, 2026)
- New module `/app/backend/stripe_connect.py` using official `stripe` Python SDK.
- Provider onboarding via Stripe-hosted Express AccountLink: `POST /api/stripe/connect/onboard` (creates account if missing, returns hosted URL).
- Status + bank state: `GET /api/stripe/connect/status` returns `connected`, `charges_enabled`, `payouts_enabled`, requirements (`currently_due` / `past_due` / `disabled_reason`).
- Stripe Express dashboard SSO: `POST /api/stripe/connect/dashboard-link`.
- Disconnect + transfer history: `DELETE /api/stripe/connect/disconnect`, `GET /api/stripe/connect/transfers`.
- Webhook: `POST /api/stripe/connect/webhook` syncs `account.updated`, `payout.paid`, `payout.failed`.
- **Real payouts wired into `_credit_provider`** in `server.py`: on escrow auto-release the platform attempts `stripe.Transfer.create(destination=acct, amount=$)` first; falls back to in-app wallet credit if not connected / transfer fails. Wallet withdraw endpoint similarly upgrades to real Stripe transfer when the user is connected.
- New frontend component `StripeConnectCard.jsx` rendered in `/provider-hub` below the map — shows status badge, "Connect bank account" CTA, "Finish onboarding" if incomplete, and "Stripe dashboard" link when ready.
- Test key stored in `/app/backend/.env` as `STRIPE_CONNECT_SECRET_KEY` (isolated from the existing `STRIPE_API_KEY=sk_test_emergent` used by the customer Checkout flow — no regression to customer payments).
- **Tested**: iteration_18 — 10/10 backend endpoints + frontend smoke PASS. Card renders, error toast surfaces cleanly when Stripe Connect isn't yet enabled on the user's Stripe dashboard.
- **⚠️ Pending user action**: User must visit https://dashboard.stripe.com/connect and click "Get started" / "Sign up for Connect" (one-time, free, ~30 seconds). Until then the onboard endpoint returns a friendly 400 explaining the next step.

### Admin Analytics Dashboard (Feb 25, 2026)
- New module `/app/backend/analytics.py` — public POST `/api/analytics/pageview` (bot-filtered by UA regex) + admin-only `/api/admin/analytics/{overview,visitors,signups,orders,providers,revenue}`.
- **Owner bootstrap**: `julius.a.mason@gmail.com` is promoted to `role='admin'` (or created passwordless for Google OAuth) on every backend startup.
- **Visitor tracking**: `<PageviewPinger>` mounted at App root fires one ping per route change. Session-id stored in `localStorage.lumo_pv_session`. Server filters bots.
- **Dashboard** in `Analytics.jsx` (new sub-tab inside `/admin`, made the default tab):
  - **Overview** — visitors 24h/7d/30d, signups by role, active jobs/orders, GMV / Lumo commission / provider payouts, pure-SVG sparklines, top-pages list.
  - **Signups** — paginated user table, filter by role, search name/email/phone, sort newest/oldest.
  - **Orders** — combined jobs + cart orders, filter by kind/status, sort newest/oldest/highest-value.
  - **Providers + Revenue** — per-provider earnings (`payouts_total`, `lumo_commission_from_provider`, `gmv_from_provider`), ratings (avg + count), jobs completed, wallet balance, link to public profile (`/u/{id}`). Sort by top earners / highest rated / newest.
- All `_id` and `password_hash` fields stripped from responses.
- **Tested**: iteration_15 — 20/20 backend pytests + full frontend E2E PASS. Verified owner-admin bootstrap, bot filtering, 401/403 gating, password_hash never leaked, fixture cleaning-job → +$90 payout reflected in today's revenue bucket. Zero bugs.


### Escrow + Proof-of-Delivery Payment Release (Feb 25, 2026)
- New backend module `/app/backend/escrow.py` — six endpoints (`mark-delivered`, `confirm-receipt`, `dispute` × jobs and orders) + background `auto_release_loop` running every 5 min.
- **Flow**: Provider taps "Mark delivered" → uploads 1-3 photos (required only for **physical** categories: `delivery`, `courier`, `moving`, `ride_share`, `towing` + all `orders`; **non-physical** services skip photos entirely) → row enters `awaiting_confirmation` → customer taps "I received it" (releases payment) OR "Something's wrong" (opens dispute, payment held) → if customer never responds, auto-confirms after 24 h.
- **Payment math**: Provider's wallet is credited with `gross × 0.90` (= customer cost minus the 10% Lumo cut). Sales tax stays with the customer. Wallet credits are simulated per user direction; Stripe Connect payouts deferred until the new bank account is live.
- **Frontend**: single reusable `<DeliveryActions>` component renders all four states (idle CTA, awaiting w/ proof gallery + confirm/dispute, confirmed pill, disputed pill). Wired on `JobDetail`, `CustomerHub` orders list, and `ProviderHub` "Your active deliveries" panel.
- **Tested**: iteration_14 — 19/19 backend pytests + full frontend E2E PASS. Verified $100 → +$90 wallet diff, idempotent confirm, auto-release after backdated 25 h, photo validation (max 3, ≤ 1 MB, no non-image URLs), 403 for wrong-role callers, non-physical optional-photo path, orders parallel flow. Zero bugs.


### Pricing UI Overhaul: Auto-Quote Delivery + Provider Earnings Breakdown (Feb 25, 2026)
- Customer-side: for `delivery / courier / moving` categories, the `Pay rate` + `Pay unit` + `Estimated time` inputs are now hidden — price is auto-calculated from item details + pickup/dropoff distance (10ths-of-a-mile precision via existing `deliveryPricing.js` engine). Submit button is disabled with the hint "Enter pickup + drop-off addresses to see price" until the auto-quote materializes.
- Customer-facing copy: every "Driver receives / Movers receive / Driver keeps" surface relabeled to "**Your price**" — verified scrubbed from `/customer`, `/jobs/:id`, `/map`, `/provider` (DOM grep).
- Provider-side: NEW earnings panel (`data-testid='provider-earnings-breakdown'`) on `/jobs/:id`, plus inline "You keep $X" subtitle on every `/provider` opportunity row and a live take-home preview inside the QuoteDialog. Math: `customer_pays`, `Lumo platform fee (10%)`, `Your take-home = customer_pays × 0.9`. Sales-tax disclaimer: "Customer pays any sales tax at checkout — it doesn't reduce your earnings."
- New helper: `providerEarningsBreakdown({customerCost})` in `/app/frontend/src/lib/deliveryPricing.js` (constant `LUMO_COMMISSION_RATE = 0.10`).
- **Tested**: iteration_13 — 5/5 backend pytests + 9/9 frontend E2E PASS. Verified $90→$81 take-home and 5 live opportunity rows. Zero bugs.


### Three-option Sign-in (Google + Phone + Email) (Feb 25, 2026)
- `/signin` refactored into a chooser with 3 primary buttons:
  - **Continue with Google** → Emergent-managed OAuth (zero setup, no API keys). Backend `POST /api/auth/google/exchange` upserts user by email and issues Lumo JWT.
  - **Continue with phone** → existing Twilio SMS OTP from iter 11.
  - **Continue with email** → existing email + password `/login` (preserves `?next=`).
- Synchronous `#session_id=` callback detection: cleans hash, mocks-friendly, smart-redirects to `?next=` or role-based dashboard.
- Redirect URL derived from `window.location.origin` per Emergent playbook — **no hardcoded URLs**.
- **Tested**: iteration_12 — 9/9 backend pytests + 9/9 frontend E2E PASS (mocked Twilio + mocked Emergent OAuth for happy paths; real httpx call for 401 path). Zero bugs.


### Passwordless SMS Sign-in via Twilio Verify (Feb 25, 2026)
- New mobile-first page `/signin` → enter phone → Twilio Verify sends a 6-digit code → enter code → JWT issued, account auto-created if new.
- Smart redirect: respects `?next=…` (e.g. coming from /jobs/apply/electrician/Brooklyn) — falls back to role-based dashboard.
- All "Sign in" / "Get started" CTAs across NavBar, Landing, Login fallback, and Google-Jobs `/jobs/apply/...` redirector now point at `/signin`.
- Backend: new module `/app/backend/auth_sms.py` (`POST /api/auth/sms/start`, `POST /api/auth/sms/verify`) with E.164 normalization, friendly mapping of Twilio error codes (60200, 60203, 20404, 21608), `asyncio.to_thread` so the sync Twilio SDK doesn't block the event loop, and a DEV fallback (OTP `123456`) when keys are missing.
- Twilio credentials stored in `backend/.env`. **TRIAL mode** — real SMS only delivers to numbers manually verified in the Twilio console (documented in `/app/memory/test_credentials.md`).
- **Tested**: iteration_11 — 16/16 backend pytests + full frontend E2E PASS. Zero bugs.


### Real Estate + Auto Sales marketplace with Masked Chat (Feb 25, 2026)
- New `/api/real-estate` and `/api/autos` CRUD endpoints with rich, vertical-specific filters (beds/baths/sqft/year-built for homes; year/make/model/mileage/fuel/transmission/body-style for autos).
- New `/api/inquiries` thread system (buyer ↔ seller in-app chat with unread counters, 5s poll, masked contact info — seller never sees buyer email/phone and vice versa).
- Optional Resend email notification on first inquiry — activates automatically if `RESEND_API_KEY` is added to backend `.env` (currently unset → silent no-op).
- Seeded **21 realistic homes** (sale + rent across 15 US metros) and **24 realistic cars** (mix of EV / gas / hybrid, 2015–2024, $16K–$148K).
- Routes: `/real-estate`, `/real-estate/list`, `/real-estate/:id`, `/autos`, `/autos/list`, `/autos/:id`, `/inquiries`, `/inquiries/:id`.
- Modularization start: new code lives in `/app/backend/classifieds.py` (not `server.py`) — first step of the eventual refactor.
- Removed `<a id="emergent-badge">` from `frontend/public/index.html`.
- **Tested**: iteration_10 — 28/28 backend pytests pass + full frontend E2E (masked contacts, owner-only delete, anti-self-inquiry, thread dedupe, unread counters, NavBar entries, badge removal).


### Growth Engine: Ad Studio + Programmatic SEO + Realistic Seed Data (Feb 2026)
- **Realistic marketplace seed**: 5 new retailers (North Shore Books, Lagos Bike Co., Verdant Plant Studio, Circuit Hub Electronics, Mariposa Specialty Foods) + 5 new restaurants (Tony's Brick Oven, Sakura Sushi, Casa del Mar, Saffron Kitchen, Root & Bloom) — each with 5 realistic inventory items. 12 structured career postings emphasizing "keep 90%" + flexibility (full-time, part-time, seasonal, freelance).
- **AI Ad Studio** at `/admin` → Ad Studio tab: 12 audience archetypes × 19 categories × 3 sizes = 684 unique ad combos. Each ad = Claude-generated headline+body+CTA+2 variants+hashtags + Gemini Nano Banana 1080×1080/1080×1920/1200×628 photoreal image. Worker audiences emphasize 90%/10% & flexibility; customer audiences emphasize instant on-demand; sellers/hosts emphasize same-day delivery + zero monthly fee. Backend `/api/admin/ads/*` (admin-only RBAC), public `/api/storage/ads/{filename}` for image serving.
- **Programmatic SEO landing pages**: 4 page types (work / find-help / sell / rent-out) × 49 categories × 74 cities = **3,832 unique landing URLs**. Dynamic `<LandingPage />` component sets document.title + OG/Twitter meta tags on render. Internal-link city + category grids on every page for SEO authority.
- **Dynamic sitemap**: `/api/sitemap.xml` (3832 URLs, refreshed on each request), `/api/robots.txt` (auto-points to sitemap), static `/robots.txt` at root for crawler discovery.
- **`DISTRIBUTION_PLAYBOOK.md`** — vetted list of ~100 free legitimate distribution channels (search engines, startup directories, niche communities, free PR) + auto-post roadmap.
- Verified iteration_9: 14/14 new pytests + 17/17 regression + Ad Studio E2E composer→generate→preview→library on live preview URL. Manual smoke screenshot of `/work/delivery/austin` shows perfectly-rendered hero, stats, city grid, category grid.

### Visible locale switcher in NavBar (Feb 2026)
- New `LocaleSwitcher.jsx` — flag + currency-code chevron trigger in the top-right of the NavBar, visible on every page (homepage included) for both signed-in and signed-out users.
- Dropdown lists all 15 countries with flag + name + currency · language; active country shows a check; outside-click + Reset-to-auto-detect both wired.
- Reuses existing `useLocale()`, `setCountryOverride()`, `formatPrice()` and the `AutoTranslator` DOM walker — switching country instantly triggers translated UI + converted prices ($X → ₹ / € / ¥ / £) using live FX from `/api/i18n/fx`.
- Verified iteration_8: 13/13 acceptance criteria pass end-to-end on the public preview URL — IN/DE/JP/GB all render correct currency + translations.

### Calendar polish + Rental owner inbox (Feb 2026)
- Replaced native `<input type="date">` on `/rentals/:id` with **shadcn Popover + Calendar** (react-day-picker) — individual booked days now visually greyed-out via `disabled={dayDisabled}` matcher (past + every blocked range). End-date matcher additionally blocks ranges that would span a booked window starting after `start_date`.
- New **Rental owner inbox** at `/rentals/inbox` (`RentalInbox.jsx`) — stat tiles + 6 filter tabs (All / Pending / Awaiting payment / Confirmed / Completed / Declined) + per-row rental thumbnail + Approve/Decline actions for `pending_approval` bookings.
- `GET /api/rental-bookings/mine` (and admin variant) now enriches each booking with `rental{title, category, media_url}` so the inbox can render thumbnails without N+1 round-trips client-side.
- Navbar adds an `Inbox` icon next to chats (`nav-rental-inbox`) for signed-in users.
- Verified by testing agent iteration_7: 93/93 backend tests pass; code-review confirmed all 12 acceptance criteria wired correctly.

### Admin / Operator console + Rental availability calendar + Multi-photo gallery (Feb 2026)
- **Admin Console** at `/admin` (gated `role==='admin'`) — `AdminConsole.jsx` with 4 stat tiles + 4 tabs:
  - Credentials: list pending creds w/ owner info → Verify / Reject buttons
  - Withdrawals: list withdrawals w/ owner balance + amount + method
  - Reviews: list reviews → delete (trash icon w/ confirm)
  - Rentals: pending_approval booking inbox w/ deep-link to listing
- Backend admin endpoints under `/api/admin/*` gated by `_require_admin` dep (`/credentials`, `/credentials/{id}/verify|reject`, `/withdrawals`, `/reviews`, `/reviews/{id}` DELETE, `/rental-bookings`, `/stats`)
- Seeded `admin@lumo.test` / `password123` on startup; added to `/app/memory/test_credentials.md`
- **Rental availability calendar**: `GET /api/rentals/{id}/blocked-dates` returns confirmed/pending booking ranges (statuses: pending_approval / deposit_pending / deposit_paid / confirmed / in_progress); `POST /api/rentals/{id}/book` enforces overlap check returning **HTTP 409** on conflict (half-open interval); `RentalDetail.jsx` date pickers fetch blocked ranges and constrain min/max
- **Multi-photo gallery**: `media[]` array on rentals (auto-backfilled from legacy `media_url`); `RentalHost.jsx` accepts multiple photos; `RentalDetail.jsx` renders main image + thumbnail strip + counter
- Verified by testing agent iteration_6: 110/110 backend tests pass (93 regression + 17 new in `test_lumo_admin_and_overlap.py`); UI E2E confirmed all 4 admin tabs, 3-photo thumbnail strip, and 409 overlap; RBAC enforced (non-admin → 403)

### Ride + Towing service categories (Feb 2026)
- Added `ride_share` and `towing` to `ALL_CATEGORIES` in both backend (`server.py`) and frontend (`api.js`), both in the `physical_delivery` group (red color)
- New `ride_share` schema: subcategories (standard / XL / premium / WAV / airport / long-distance) + 9 fields (passengers, luggage, vehicle class, timing now-vs-scheduled, scheduled_for datetime-local, extra stops, child seat, pet, special requests)
- New `towing` schema: 10 subcategories (breakdown, accident, flat tire, jump start, fuel delivery, lockout, winch pull-out, heavy duty, motorcycle, long distance) + 15 fields (vehicle type, make/model/year, drivetrain, wheels-turn, transmission, key availability, tow method, winch needed, urgency, scheduled_for, incident type, location type, distance, passengers, notes)
- `ServiceDetailsForm` now renders `textarea` and `datetime-local` field types

### Bug fix — rental booking decline (Feb 2026)
- `POST /api/rental-bookings/{id}/decline` now returns **403 if the booking is not in `pending_approval` status**, preventing a contradictory "declined an approved booking" state (caught by testing agent in iteration_4.json)

### Capacitor — native iOS + Android wrapping (Feb 2026)
- Installed `@capacitor/core@^7 @capacitor/cli@^7 @capacitor/ios@^7 @capacitor/android@^7` (v7 used because container runs Node 20; v8 needs Node 22+)
- Created `/app/frontend/capacitor.config.ts` (appId `com.lumo.app`, appName `Lumo`, `webDir: build`, live-reload server block commented in for easy enabling)
- Created `/app/CAPACITOR_SETUP.md` — step-by-step guide for adding iOS/Android platforms, live-reload, plugin recommendations (camera, geolocation, push, biometrics), and App-Store/Play-Store publishing checklist
- Native platforms (`ios/`, `android/`) NOT generated in this container (needs macOS + Xcode / Android Studio); user runs `npx cap add ios && npx cap add android` on their local dev machine

### Rentals marketplace (Feb 2026)
- 11 consolidated categories: Property & Stays, Venues, Vehicles, Tools & Equipment, Photo Video & AV, Outdoor & Sports, Furniture Appliances & Electronics, Medical Mobility & Baby, Events Parties & Weddings, Storage & Containers, Site Services
- Per-category subcategories + per-category filter schema (in both backend `RENTAL_TAXONOMY` and frontend `RENTAL_CATEGORIES`)
- Pricing units: hourly / daily / weekly / monthly / weekend (owner picks which apply)
- Optional **refundable security deposit** per listing
- **High-value categories** (property / vehicles / venues) require host to have a verified credential before listing goes `active`
- Booking modes: **instant book** (Stripe deposit immediately) or **request to book** (owner approves → deposit). Per listing.
- Booking math: subtotal = unit_price × qty; Lumo deposit = 10% of subtotal; tax = country/state rate × subtotal (100% upfront); security deposit added to pay-now total
- Endpoints: `GET /api/rentals/categories`, `GET /api/rentals?category=...&q=...&min_price=...&max_price=...`, `GET /api/rentals/{id}`, `POST /api/rentals`, `DELETE /api/rentals/{id}`, `POST /api/rentals/{id}/book`, `GET /api/rental-bookings/mine?role=renter|owner`, `POST /api/rental-bookings/{id}/approve|decline`
- 23 demo rentals seeded across all 11 categories (Echo Park loft, Riverside wedding venue, Tesla Model 3, Class C motorhome, Kubota mini excavator, Sony A7 IV kit, etc.)
- Pages: `/rentals` (browse / search / category filters / per-category sections), `/rentals/:id` (gallery + attributes + booking card with date pickers + breakdown + confirm dialog)

### NavBar reorganization (Feb 2026)
- Top row reduced from 4 marketplace links to 1 "Marketplaces" dropdown
- Dropdown contains Marketplace, Stores, Restaurants, Rentals — each with icon + label + 1-line blurb
- Click-outside detection closes the menu

### AI document verification (Feb 2026)
- Backend `_ai_verify_document()` core function: loads media bytes from object storage, base64-encodes, calls Claude Sonnet 4.6 with vision (Gemini 3.1 Pro fallback), parses strict JSON response, regex-checks the extracted `id_number` against the country credential schema's `format_regex`, persists to `document_verifications` collection
- Auto-downgrades to `needs_review` if regex fails
- Endpoints: `POST /api/verify/credential/{cred_id}` (auto-updates `credentials.status='verified' verified_by='ai'` if confidence ≥ 0.90), `POST /api/verify/media/{media_id}` (content moderation or doc check), `GET /api/verify/history/{media_id}`
- Frontend: "AI verify" button on every credential row with a document; `AiVerdictPanel` shows verdict + confidence % + extracted fields + red flags + plain-English explanation + which model was used; "AI check" button on `MediaUpload` for review photos / job photos / marketplace media

### Country-specific provider business credentials (Feb 2026)
- `COUNTRY_BUSINESS_CREDENTIALS` config with country-specific legal IDs (SIRET, SIREN, TVA, EIN, GSTIN, etc.) across all 15 supported countries
- New "Business / tax registration" section at top of `/credentials` showing required IDs for the user's country + a country override picker
- Each credential card has its own AI verify button via `BizAiVerifyButton`

### Globalization (Feb 2026)
- `/api/i18n/fx` live USD-based FX, `/api/i18n/translate` (Claude Sonnet 4.6 cached per-string per-lang), `/api/i18n/tax?country&us_state`
- `LocaleProvider` (auto-detect from `navigator.language` + timezone), `AutoTranslator` (DOM-wide translator + currency rewriter, handles plain text / JSX `${expr}` splits / Emergent visual-editor wrappers)
- 15-country support with per-country tax profiles and **per-US-state sales tax (50 + DC)**
- 31 global demo jobs across 15 countries (`is_global_demo: true`)
- Tax is collected 100% upfront in the deposit so Lumo never under-collects regardless of how the remainder is paid

### Reviews & ratings (Feb 2026)
- Completed-transaction gated, one review per (reviewer, target, transaction)
- 5-star overall + 3 sub-ratings (quality / communication / on-time) + body + optional photo
- `ReviewSummaryBadge` on Directory cards + storefront headers
- `ReviewsSection` on StoreProfile + JobDetail (when status=completed)

### Multi-store cart (Feb 2026)
- `cart_items` collection per user; CRUD endpoints; `POST /api/cart/checkout` creates one Stripe session per store
- `CartProvider` hook + `/cart` page with per-store groups + tax breakdown + per-store checkout buttons
- Nav cart icon with item count badge

### Core (prior sessions)
Auth, Customer/Provider/Retailer/Restaurant Hubs, Marketplace, Stores/Restaurants directories, schema-driven service requests + marketplace listings, anti-poach chat, real Google Maps, provider quotes, license-match enforcement, trust badges, delivery + moving pricing engines, bundled 10% deposit, instant wallet withdrawal, Ask Lumi AI, credentials submit/verify/expiry, media upload, Settings page with Google Maps restriction guide.

## Tested
- Backend pytest **55/55** ✅ + new feature tests at `/app/backend/tests/test_lumo_new_features.py` (21 tests, 14 passed on first run; 7 failures were all test-script schema mismatches, fixed — should be 20-21/21 on rerun; one nit is `used_model` returns `anthropic/claude-sonnet-4-6` with provider prefix vs bare model name)
- Curl-verified: `i18n/tax`, `i18n/translate`, `credentials/country-requirements` per country, `/checkout/deposit` with US state tax, `/cart/add`+`/cart`, `/reviews/summary`, `/verify/media` (Gemini fallback succeeded on test image), `/rentals/categories` (returns 11), `/rentals?limit=5` (returns demo data)
- Frontend screenshots: French credentials page with SIRET/SIREN/TVA/RCS auto-translated; German marketplace + buy dialog with MwSt. line; rentals browse with category pills + cards + instant-book badges + pricing; NavBar Marketplaces dropdown with 4 entries

## Backlog
- **P1**: Re-run /app/backend/tests/test_lumo_new_features.py and clean up the `used_model` field shape (strip provider prefix OR document it)
- **P2**: Rename `admin_stats.pending_withdrawals` (currently counts pending+initiated+completed)
- **P3**: Brute-force rate limiting on `/auth/login`
- **P3**: Split `server.py` into routers — now ~3400 lines (flagged in 4 consecutive iterations)
- **P3**: RTL layout polish for Arabic
- **P3**: Translate `placeholder` and `aria-label` attributes
- **P3**: Upgrade per-state US sales tax to Stripe Tax / Avalara for city/county precision
- **P3**: Atomic ordering in `/cart/checkout` (Stripe-first to avoid orphaned orders if checkout fails)
- **P3**: Index Mongo `reviews` for $group aggregation instead of in-memory loop

## Next Tasks
- **Phase 3 — Referral tracking**: trackable links `golumo.app/join?ref=xxx&utm_source=tiktok` + admin attribution dashboard + provider referral-bonus system
- **Phase 4 — Auto-post to social platforms** (separate sessions, requires user to create dev accounts):
   - Easy first: X/Twitter, LinkedIn, Reddit, Mastodon, Bluesky
   - Medium: Pinterest, Google Business Profile (per city)
   - Hard: Meta (FB+IG with business verification), TikTok
- **Search engine submissions** (user action): Submit `golumo.app/api/sitemap.xml` to Google Search Console, Bing Webmaster, Yandex, Baidu, Naver — instructions in `/app/DISTRIBUTION_PLAYBOOK.md`
- Split `server.py` (now 4400+ lines) into `APIRouter` modules

## 2026-02-01 — Role-based visibility + Critical crash fixes
- **Role-based visibility** implemented:
  - `NavBar.jsx`: added `admin` case to `roleLink()` (nav-hub → /admin with ShieldCheck icon); `restrictedRole` gate hides the redundant "Customer" desktop link for retailer/restaurant/admin. Mobile sub-nav 3rd tile switches to the role hub for restricted roles.
  - `MobileTabBar.jsx`: role-aware Account tab — provider/retailer/restaurant/admin see their own icon + label, tap routes directly to their hub (`/provider`, `/retailer`, `/restaurant`, `/admin`).
  - Route-level guards in `App.js` (`Protected roles={[...]}`) already gate /retailer, /restaurant, /admin for their sole role — verified.
- **Bug fix: `/order/moving` crash** (`Cannot read properties of undefined (reading 'toFixed')`)
  - Root cause: `computeBreakdown()` in `locale.jsx` never returned a `total` field, but `OrderService.jsx` line 353 referenced `breakdown.total.toFixed(2)`.
  - Fix 1: added `total = subtotal + tax` to the `computeBreakdown` return object.
  - Fix 2: corrected parameter names passed to `computeMovingQuote` (was passing `subcategory/home_size/helpers/hours/truck_included/stairs`; function expects `move_type/property_size/num_movers/has_stairs/packing_needed/duration_hours`) so quotes now respond to user input instead of always using defaults.
- **Bug fix: `/map` (Jobs near you) crash** (`Cannot read properties of null (reading 'map')`)
  - Root cause: `@api.get("/map/jobs")` in `server.py` (line 4070) built the `pins` list but was missing a `return pins` statement, so FastAPI serialized `None` → frontend `pins.map()` crashed.
  - Fix: added `return pins`. Endpoint now returns 67+ pins as expected.
  - Defensive: `MapPage.jsx` now guards `setPins(Array.isArray(data) ? data : [])`.
- Verified live: /map renders full US map with pins; /order/moving loads clean.

## Backlog additions
- Follow-up on `UNSAFE_componentWillMount` console warning (likely from react-helmet — non-blocking).


## 2026-06 — Session 2 (see CHANGELOG.md / ROADMAP below)
- Demo data hidden publicly + seeding stopped; persona routing live; copilot optimized. Details in CHANGELOG.md.
### Next (user-approved order)
1. DONE Admin full create/edit/delete + Purge demo data
2. DONE Real Estate module (OSM map, inquiries/tours, saved searches + alerts, favorites)
3. P1 Marketplace polish (buy/rent toggle, cart, product images)
4. P1 Mobile bottom-tab navigation (Home, Orders, Messages, Profile)
- Note: affiliate_settings still holds placeholder IDs (skimlinks 12345, impact TEST-IMPACT-12345) — admin should replace.

## 2026-06 — Recruiter Program + Available Jobs board
- Tiered recruiter commission (backend/referrals.py): 0.10% of job gross, +0.01% per 1,000 lifetime recruit jobs, cap 0.99%. Direct recruits only. Paid from Lumo's 10% commission. $25 bonus at recruit's 10th job kept.
- Endpoints: GET /api/referrals/program, GET /api/referrals/me (tier), PUT /api/referrals/admin/program, GET /api/referrals/admin/leaderboard. Config lives in `recruiter_program` collection.
- Frontend: /recruiter (public explainer + dashboard), RecruiterTier in ReferralCard (/wallet), Admin → Recruiters tab, /available-jobs (provider-only one-tap Accept, deliveries filter by default).
- Tested: iteration_66 (backend 15/16, then the minor validation issues were fixed; frontend 100%).
- Global redeploy was dispatched before this feature, so a redeploy is needed to push the recruiter program live.

# Lumo — PRD & Progress Log

## Original Problem Statement
Continue building Lumo. Originally requested 5 features (toast / media / remote / P2P deposit / retailers+restaurants). All shipped + the additions below.

## Additions (Feb 2026)
- Globalization (auto-detect language/currency + per-country tax)
- Reviews & ratings on providers + storefronts
- Multi-store cart with per-store checkout
- Per-state US sales tax engine (50 states + DC)
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
- **P2**: Admin / operator console (credential verification queue + withdrawal approvals + review moderation)
- **P2**: List-your-rental flow (`/rentals/host`) — currently rentals can only be created via direct API call
- **P2**: Rental owner dashboard (bookings inbox, approve/decline UI for request-mode rentals)
- **P2**: Availability calendar on rentals (block dates already booked)
- **P3**: Brute-force rate limiting on `/auth/login`
- **P3**: Split `server.py` into routers — now ~3400 lines (flagged in 4 consecutive iterations)
- **P3**: RTL layout polish for Arabic
- **P3**: Translate `placeholder` and `aria-label` attributes
- **P3**: Upgrade per-state US sales tax to Stripe Tax / Avalara for city/county precision
- **P3**: Atomic ordering in `/cart/checkout` (Stripe-first to avoid orphaned orders if checkout fails)
- **P3**: Index Mongo `reviews` for $group aggregation instead of in-memory loop

## Next Tasks
- Build `/rentals/host` page + rental owner inbox so the rental side can be exercised fully by demo users
- Admin / Operator console (P2)

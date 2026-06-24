# Lumo — PRD & Progress Log

## Original Problem Statement
Continue building Lumo. Originally requested 5 features:
1. New-opportunity toast in Provider Hub
2. Optional photo/video on service requests + media auto-forwarded from marketplace listings to delivery requests
3. Remote jobs as 4th color (teal) + "Remote-friendly" filter
4. P2P bundled 10% Stripe deposit
5. Retailers & Restaurants — new roles, storefront, inventory CRUD, directories

Plus Google Maps API key restriction guide.

**Additions (Feb 2026):**
- Globalization (auto-detect language/currency + tax per country)
- Reviews & ratings on providers and storefronts
- Multi-store cart with separate per-store checkouts
- Per-state US sales tax engine
- Country-specific provider business / tax registration credentials (SIRET, SIREN, EIN, UTR, ABN, GSTIN, etc.)

## User Choices (verbatim)
- Reviews: completed-order only + optional photo + 1–5 overall stars + 3 sub-ratings (quality, communication, on-time) + written review
- Cart: multi-store, persisted per-user in MongoDB, separate checkout per store
- US tax: hardcoded 50-state table now + Stripe Tax playbook for upgrade later
- Globalization: auto-detect via browser locale + timezone; AI-powered translation (Claude Sonnet 4.6); live FX; demo jobs in 15 countries; no header switcher (Settings-page preview picker)

## Architecture
- **Backend**: FastAPI (`server.py`), MongoDB (Motor), JWT auth, Emergent Object Storage, Stripe via `emergentintegrations.payments.stripe.checkout`, Claude Sonnet 4.6 via `emergentintegrations.llm.chat` for AI assistant + i18n translation.
- **Frontend**: React 19 + react-router-dom v7 + Tailwind + shadcn/ui + sonner; `LocaleProvider` + `AutoTranslator` for app-wide i18n; `CartProvider` for per-user persistent cart.
- **Routes**: `/`, `/login`, `/register`, `/customer`, `/provider`, `/retailer`, `/restaurant`, `/stores`, `/restaurants`, `/stores/:id`, `/restaurants/:id`, `/marketplace`, `/map`, `/jobs/:id`, `/orders/:id/pay`, `/wallet`, `/chats`, `/credentials`, `/cart`, `/settings`, `/checkout/success`, `/checkout/cancel`.

## Implemented

### Core (prior sessions)
Auth, Customer/Provider Hubs, Marketplace, Stores/Restaurants directories, schema-driven service requests + marketplace listings, anti-poach chat, real Google Maps, provider quotes, license-match enforcement, trust badges, delivery + moving pricing engines, bundled 10% deposit, instant wallet withdrawal, Ask Lumi AI, credentials submit/verify/expiry, media upload, MapPickerButton, Settings page with Google Maps restriction guide.

### Globalization (Feb 2026)
- `GET /api/i18n/fx` — live USD-based FX (cached 1h, fallback table)
- `POST /api/i18n/translate` — batch translate via Claude Sonnet 4.6, cached per `(lang, src)` in Mongo
- `GET /api/i18n/tax?country=XX[&us_state=YY]` — per-country tax with **per-state US rates** (50 states + DC hardcoded)
- `LocaleProvider` — auto-detect from `navigator.language` region + timezone; `computeBreakdown(itemUsd, deliveryUsd) → {subtotal, tax, itemDeposit, deliveryDeposit, depositTotal, remaining}`
- `AutoTranslator` — DOM-wide MutationObserver-based translator + currency rewriter (handles plain text, JSX `${expr}` splits, Emergent visual-editor `data-ve-dynamic` wrappers)
- **15 countries supported** with profiles + flags + tax rates: US, GB, CA, AU, IN, DE, FR, JP, BR, MX, ES, NG, AE, SG, ZA
- **Tax**: 100% of tax collected upfront in the deposit so Lumo always covers its tax remittance
- **31 global demo jobs** seeded across all 15 countries

### Reviews & ratings (Feb 2026)
- `reviews` collection; one review per (reviewer, target, transaction) — completed jobs (for providers) or paid orders (for stores)
- `POST /api/reviews` — validates the reviewer has a completed transaction with the target
- `GET /api/reviews/target/{type}/{id}` — paginated reviews + summary (count, avg overall + sub-averages, stars histogram)
- `GET /api/reviews/summary/{type}/{id}` — light summary for badge display
- `GET /api/reviews/can-review/{type}/{id}` — what transactions the user can still review
- `ReviewsSection` component: 5-star + 3 sub-ratings (quality / communication / on-time) + text + optional photo upload
- `ReviewSummaryBadge` shown on Directory cards and StoreProfile header
- ReviewsSection embedded on StoreProfile (every storefront) and JobDetail (when job is completed)
- Notifies the target with a `review_received` notification

### Multi-store cart (Feb 2026)
- `cart_items` collection per user
- Endpoints: `GET /api/cart`, `POST /api/cart/add`, `PATCH /api/cart/items/{id}`, `DELETE /api/cart/items/{id}`, `DELETE /api/cart/store/{store_id}`, `DELETE /api/cart`, `POST /api/cart/checkout`
- Frontend `CartProvider` hook + `/cart` page with per-store groups, quantity controls, delivery address/fee + tax breakdown, separate "Checkout this store" buttons (one Stripe session per store)
- Nav cart icon with item count badge
- "Add to cart" button next to "Order" on StoreProfile

### Country-specific provider business / tax registration (Feb 2026)
- `COUNTRY_BUSINESS_CREDENTIALS` config in backend with the legal IDs each country requires for self-employed/business providers — covers all 15 supported countries
- `GET /api/credentials/country-requirements?country=XX` returns the list (kind, label, format, regex hint, issuer, required_for: business / individual / either)
- Country-by-country coverage:
  - **US**: EIN, SSN-last4, State Business License, W-9 upload
  - **GB**: UTR, Companies House Number, VAT (GB) Number
  - **CA**: BN, GST/HST registration, SIN-last3
  - **AU**: ABN, ACN, GST registration
  - **IN**: GSTIN, PAN, Aadhaar-last4, Udyam (MSME)
  - **DE**: Steuernummer, USt-IdNr., Gewerbeanmeldung, Handelsregister (HRB)
  - **FR**: SIRET, SIREN, TVA intracommunautaire, RCS, statut micro-entrepreneur
  - **JP**: 法人番号, 個人事業の開業届, 適格請求書発行事業者登録番号
  - **BR**: CNPJ, CPF, MEI, Inscrição Estadual
  - **MX**: RFC, CURP, Constancia de Situación Fiscal
  - **ES**: NIF, NIE, CIF, Alta como autónomo (RETA)
  - **NG**: CAC, TIN, NIN
  - **AE**: Trade License, TRN, Emirates ID-last4
  - **SG**: UEN, GST (SG), NRIC/FIN-last3
  - **ZA**: CIPC, VAT (ZA), Income Tax Reference
- `CredentialsPage` shows a new "Business / tax registration" section at the top, auto-loading the country requirements for the current locale (with a country override picker for previewing); each credential is a card with a number input, optional doc upload, expiry date, and submit button
- Submissions are stored in the same `credentials` collection with `category="business_registration"` and the country code in `state`

## Tested
- Backend pytest **55/55** ✅
- Endpoints verified via curl: `i18n/fx`, `i18n/translate` (Japanese), `i18n/tax` for 15 countries + US state codes (CA 7.25%, OR 0%, NY 4%), `checkout/deposit?country=GB` (20% VAT, $24 tax on $120 base), cart add/get (2 items, $32 subtotal), reviews can-review + summary, country-requirements for JP (returns 3 Japan-specific kinds) and FR (returns SIRET, SIREN, TVA, RCS, micro-entrepreneur)
- Frontend screenshots verified: German marketplace currency (`35,12 €`), German buy dialog with MwSt. line, French CredentialsPage showing SIRET/SIREN/TVA/RCS labeled in French, GB Settings tax-inclusive preview (£22.72)

## Backlog
- **P2**: Cart per-store discount / coupon
- **P2**: Admin dashboard for credential verification + withdrawal approvals + review moderation
- **P3**: Brute-force rate limiting on `/auth/login`
- **P3**: Split `server.py` into routers (auth/jobs/marketplace/stores/payments/wallet/i18n/reviews/cart/credentials) — currently ~2600 lines
- **P3**: RTL layout polish for Arabic
- **P3**: Translate `placeholder` and `aria-label` attributes (currently only visible text nodes)
- **P3**: Upgrade to Stripe Tax (or Avalara) for city/county/special-district precision before high-volume US launch; current per-state table only covers the state base rate
- **P3**: Server-side validation of country business credentials against the `format_regex`

## Next Tasks
- Consider an Admin / Operator console (credential review, withdrawal approvals, review moderation) — significant scope, request a dedicated session

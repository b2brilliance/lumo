# Lumo — PRD & Progress Log

## Original Problem Statement
Continue building Lumo. Originally requested 5 features:
1. New-opportunity toast in Provider Hub (poll every 15s, sonner toast with title+miles, click flies to pin)
2. Optional photo/video attachment on service requests + auto-forwarded from marketplace listings to delivery requests
3. Remote jobs as 4th color (teal) + "Remote-friendly" filter; auto-flag categories
4. P2P bundled 10% Stripe deposit — one checkout for 10% of item + 10% of delivery fee
5. Retailers & Restaurants — new roles, storefront profile, inventory CRUD, /stores and /restaurants directories, reuse delivery engine

Also: restrict Google Maps API key in Cloud Console (Settings page).

**Latest additions (Feb 2026):**
- Global launch readiness: auto-detect country/language → translate UI to native idiomatic language + convert prices to local currency using live FX
- Per-country tax computation: VAT / GST / sales tax added at checkout and collected 100% upfront in deposit
- 15-country demo jobs seeded for global preview

## User Choices
- Filtered opportunity toast (radius + categories)
- Object storage (Emergent) for media
- Pod test Stripe key (sk_test_emergent)
- Storefronts fully purchasable via bundled Stripe checkout
- Pay unit on jobs: hour / day / week / flat
- Platform holds 10% deposit; remaining payable via app, cash, or card per mutual terms
- Providers have internal wallet balance with instant simulated withdrawal
- Globalization: auto-detect via browser locale + timezone; AI-powered runtime translation (native conversational style); live FX rates via open.er-api.com; demo jobs across 15 countries; no header switcher (auto-detect only) + Settings-page preview picker

## Architecture
- **Backend**: FastAPI (single `server.py`), MongoDB (Motor), JWT auth, Emergent Object Storage for media, Stripe Checkout via `emergentintegrations.payments.stripe.checkout`, Claude Sonnet 4.6 via `emergentintegrations.llm.chat` for both AI assistant and i18n translation.
- **Frontend**: React 19 + react-router-dom v7 + Tailwind + shadcn/ui + sonner; 4-color category system (red/blue/amber/teal); `LocaleProvider` + `AutoTranslator` for app-wide i18n.
- **Routes**: `/`, `/login`, `/register`, `/customer`, `/provider`, `/retailer`, `/restaurant`, `/stores`, `/restaurants`, `/stores/:id`, `/restaurants/:id`, `/marketplace`, `/map`, `/jobs/:id`, `/orders/:id/pay`, `/wallet`, `/settings`, `/checkout/success`, `/checkout/cancel`.

## Implemented

### Core (prior sessions)
- Auth (JWT) + 4 seed users (customer/provider/retailer/restaurant @ lumo.test / password123)
- Customer Hub, Provider Hub (with 15s opportunity toast), Marketplace, Stores & Restaurants directories
- Schema-driven service requests + marketplace listings (medical, legal, financial gating; license-match enforcement)
- Anti-poach chat sanitizer; job-scoped threads; chats inbox
- Real Google Maps integration (4-color SVG markers + InfoWindow); Google Places autocomplete on addresses; MapPickerButton drop-pin
- Provider counter-offer quotes; license-match badges; trust badges
- Delivery + Moving advanced pricing engines (P2P only — store/restaurant uses per-mile)
- Bundled 10% Stripe deposit + final-pay flow; payment_transactions; polling on success
- Wallet: balance + transactions + **instant simulated withdrawal** (`/wallet/withdraw` deducts immediately, fires payout_sent notification)
- AI assistant ("Ask Lumi") — floating widget powered by Claude Sonnet 4.6
- Credentials submit/list/delete/dev_verify + expiry reminders (lazy fire from `/credentials/mine`)
- Object storage backed media upload (25MB cap)
- Settings page with Google Maps API key restriction guide

### NEW — Globalization (Feb 2026)
- **Backend endpoints**
  - `GET /api/i18n/fx` — live USD-based FX rates from open.er-api.com (cached 1h, fallback table)
  - `GET /api/i18n/languages` — supported language list
  - `POST /api/i18n/translate` — batch translate strings via Claude Sonnet 4.6 with native-speaker tone; cached in `translations` collection per `(lang, src)` pair so subsequent loads are instant
  - `GET /api/i18n/tax?country=XX` — per-country tax profile (rate + label)
- **Frontend `LocaleProvider`** (`/app/frontend/src/lib/locale.jsx`)
  - Auto-detects country from `navigator.language` region → timezone heuristic → US default
  - Stores override in `localStorage.lumo_country_override`
  - Exposes `country, lang, currency, symbol, taxRate, taxLabel, formatPrice(usd), computeBreakdown(itemUsd, deliveryUsd)`
- **`AutoTranslator`** (`/app/frontend/src/components/AutoTranslator.jsx`) — runs once at boot, observes the entire `document.body` for DOM mutations, and:
  - Collects all visible English text nodes, batches them to `/api/i18n/translate`, swaps text content (per-node state in WeakMap → idempotent, handles React re-renders)
  - Rewrites `$NN.NN` USD prices into the local currency using live FX rates
  - Handles three patterns: pure text nodes, JSX `${expr}` split text nodes, and Emergent visual-editor's `<span data-ve-dynamic="true">` wrappers
  - Skips `<script>`, `<style>`, `<input>`, `<textarea>`, `<code>`, `<pre>`, SVG, and any element with `data-no-i18n="true"`
- **Tax**: Per-country `TAX_PROFILES` (US 8% sales tax demo, GB 20% VAT, CA 13% HST, AU 10% GST, IN 18% GST, DE 19% MwSt., FR 20% TVA, JP 10% 消費税, BR 17% ICMS, MX 16% IVA, ES 21% IVA, NG 7.5% VAT, AE 5% VAT, SG 9% GST, ZA 15% VAT)
  - Added as line item at marketplace & store-order checkout
  - **100% of tax collected upfront** in the deposit (deposit = 10%×item + 10%×delivery + 100%×tax) so Lumo never under-collects regardless of how the remaining balance is paid
  - Persisted on `orders.tax_country, tax_rate, tax_label, tax_amount` for remittance reporting
- **Settings page preview** — country/language/currency/tax picker; example $25 USD shows side-by-side pre-tax (e.g. £18.93) and tax-inclusive (£22.72) values
- **15-country demo seed**: 31 sample open jobs across US (LA, Austin), UK (London, Manchester), Canada (Toronto, Vancouver), Australia (Sydney, Melbourne), India (Mumbai, Bengaluru, Delhi), Germany (Berlin, Munich), France (Paris, Lyon), Japan (Tokyo, Osaka), Brazil (São Paulo, Rio), Mexico (CDMX, Guadalajara), Spain (Madrid, Barcelona), Nigeria (Lagos, Abuja), UAE (Dubai, Abu Dhabi), Singapore (×2), South Africa (Cape Town, Johannesburg). Varied categories: delivery, moving, cleaning, handyman, pet care, education, marketing, digital_tech, landscaping, personal_care, financial. Tagged `is_global_demo: true`.

## Tested
- Backend pytest **55/55** ✅
- i18n endpoints verified via curl: `/i18n/fx`, `/i18n/translate` (Japanese), `/i18n/tax` per country
- Checkout deposit verified with country=GB → 20% VAT computed and 100% included in deposit
- Frontend screenshots verified: German marketplace (35,12 €), German buy dialog (MwSt. 8,34 €, Jetzt bezahlen 12,73 €), Japanese landing (configurable), Hindi landing, GB Settings preview

## Backlog
- **P2**: Reviews & ratings on provider + storefront profiles
- **P2**: Cart / multi-item checkout for stores & restaurants
- **P2**: Admin dashboard for withdrawal approvals
- **P3**: Brute-force rate limiting on `/auth/login`
- **P3**: Split `server.py` into routers once it grows past 1800 lines (currently ~1800)
- **P3**: RTL layout polish for Arabic (currently translates but layout stays LTR)
- **P3**: Translate `placeholder` and `aria-label` attributes (currently only visible text nodes)
- **P3**: Replace static blended US sales tax with per-state engine (Stripe Tax / Avalara) before US launch

## Next Tasks
- Optionally: smoothen translation grouping for hero headlines split across many spans (current per-node translation works but is sometimes choppy on highly-styled text)
- Consider opt-in cart for stores

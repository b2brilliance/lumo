# Lumo — PRD & Progress Log

## Original Problem Statement
Continue building Lumo. Ship these 5 features in parallel:
1. New-opportunity toast in Provider Hub (poll every 15s, sonner toast with title+miles, click flies to pin)
2. Optional photo/video attachment on service requests + auto-forwarded from marketplace listings to delivery requests (media_url + media_type fields)
3. Remote jobs as 4th color (teal) + "Remote-friendly" filter; auto-flag categories: digital_tech, marketing, business_admin, education, legal, financial, remote_work, research
4. P2P bundled 10% Stripe deposit — one checkout for 10% of item + 10% of delivery fee
5. Retailers & Restaurants — new roles, storefront profile (logo, hours, address), inventory CRUD, /stores and /restaurants directories, reuse delivery engine

Also: restrict Google Maps API key in Cloud Console (Settings page).

## User Choices
- Filtered opportunity toast (radius + categories)
- Object storage (Emergent) for media
- Pod test Stripe key (sk_test_emergent)
- Storefronts fully purchasable via bundled Stripe checkout
- Pay unit on jobs: hour / day / week / flat
- Platform holds 10% deposit; remaining payable via app, cash, or card per mutual terms set at dispatch
- Providers have internal wallet balance with withdrawal request (no Stripe Connect)
- Full Lumo scope built from scratch

## Architecture
- **Backend**: FastAPI (single `server.py`), MongoDB (Motor), JWT auth (`Authorization: Bearer`), Emergent Object Storage for media, Stripe Checkout via `emergentintegrations.payments.stripe.checkout`.
- **Frontend**: React 19 + react-router-dom v7 + Tailwind + shadcn/ui + sonner; Cabinet/Space Grotesk display + IBM Plex Sans body; 4-color category system (red/blue/amber/teal).
- **Routes**: `/`, `/login`, `/register`, `/customer`, `/provider`, `/retailer`, `/restaurant`, `/stores`, `/restaurants`, `/stores/:id`, `/restaurants/:id`, `/marketplace`, `/map`, `/jobs/:id`, `/orders/:id/pay`, `/wallet`, `/settings`, `/checkout/success`, `/checkout/cancel`.

## User Personas
- Customer: posts service requests, buys from stores/restaurants, sees order status
- Provider: accepts jobs in radius+categories, gets 15s toast on new opportunities, internal wallet + withdrawal
- Retailer: storefront with logo/hours/address + inventory CRUD; listings purchasable with bundled deposit
- Restaurant: same as retailer but listed under `/restaurants` with cuisine instead of category

## Implemented (Feb 2026)
- Auth (JWT) + 4 seed users (customer/provider/retailer/restaurant @ lumo.test / password123)
- Customer Hub: post service requests with category, pay rate, pay unit (hour/day/week/flat), payment terms, allowed payment methods, optional photo/video; track jobs and orders
- Provider Hub: live map with colored pins, opportunity feed filtered by haversine distance + categories; 15s polling triggers sonner toast w/ "Fly to pin"; remote jobs always visible; match-settings panel (lat/lng/radius/categories); wallet shortcut
- Marketplace: P2P listings w/ photo/video; buy dialog with 10% item + 10% delivery deposit; auto-forwards media to delivery
- Stores & Restaurants directories + profile pages with logo/hours/address + inventory grid; order dialog with deposit breakdown and payment terms
- Retailer/Restaurant Hub: storefront profile editor + inventory CRUD with media
- Stripe Test bundled checkout: deposit + remaining final-pay flow; payment_transactions collection; polling on success page
- Wallet: balance + transactions list + withdrawal request endpoint
- Settings: full Google Maps API key restriction guide
- 4-color category system (red/blue/amber/teal) end-to-end; "Remote-friendly" toggle on /map and provider hub
- Object storage backed media upload (25MB cap)
- **Real Google Maps integration** via @react-google-maps/api with restricted REACT_APP_GOOGLE_MAPS_API_KEY; custom SVG drop-pin markers in 4 category colors + InfoWindow on click
- **Job-scoped real-time chat** (3s polling) with anti-poach sanitizer (phone, email, URL, contact-word redaction → `[hidden]`); per-job per-provider threads; customer thread tabs on open jobs; `/chats` inbox
- **Adaptive service-request form** — location fields change based on category: pickup+dropoff for delivery/courier/moving, single "Service address" for handyman/cleaning/landscaping/auto/pet_care/personal_care/events, no location for remote/digital roles
- **Provider counter-offers** — `POST /api/jobs/{id}/quotes` lets providers propose their own rate / unit / units / notes; one active quote per provider per job. Customer sees all quotes on the job detail page with Accept/Decline. Accepting locks the job at the quoted rate + assigns the provider and auto-declines other pending quotes. Providers see their `/quotes/mine` list on Provider Hub with withdraw support.
- **Schema-driven service detail subforms** — per-category `subcategory` + dynamic fields configured in `/app/frontend/src/lib/serviceSchemas.js` and rendered by `<ServiceDetailsForm>`. Persisted as `job.details` (dict) on the backend. Now includes **Medical & In-home care** category covering licensed medical (RN/LPN visits, PT/OT/ST, IV/infusion, wound care, mobile phlebotomy, vaccinations, mobile imaging, hospice/palliative, mental health, lactation, doulas) and ADL support (bathing, dressing, toileting, transferring, feeding, meal prep, med reminders, companion / respite / dementia care). Each medical request collects required license type (RN/LPN, CNA/HHA, DPT, OT, SLP, RT, CPT, etc.), patient age, mobility, visit type, duration, conditions, equipment source, and a default-on background-check requirement.
- **Marketplace listing schemas** — analogous to service schemas: electronics, furniture, appliances, apparel, home goods, vehicles, tools, sporting, books/media, toys/games, musical instruments, art/collectibles, baby/kids, garden/outdoor, free/giveaway. Each has subcategory + condition + category-specific attributes (brand, model, year, size, material, mileage/transmission/title for vehicles, etc.). Persisted as `listing.attributes` (dict).
- **Provider credentials & gating** — new `credentials` collection + `/api/credentials` endpoints (submit, list, delete, dev-verify, requirements). Providers add licenses, certifications, and insurance per category (RN/LPN/CNA/HHA/DPT/OT/SLP/RT/CPT/MD/NP/PA/IBCLC/doula for medical; bar/paralegal/notary for legal; CPA/EA/CFP/Series-7/65/insurance license for financial; ASE/EV-spec/tow for auto; general contractor/electrician/plumber/HVAC/EPA-608 for handyman; pesticide applicator/arborist/irrigation for landscaping; cosmetology/esthetician/barber/LMT/personal trainer for personal care; DVM/vet tech/groomer/CCPDT for pet care; food handler/ServSafe/TIPS/officiant for events; USDOT/CDL for moving; teaching license for education; plus universal liability insurance / workers' comp / bonded / background-check). Each entry collects state, license #, expiry, an uploaded document photo, optional insurance carrier/policy/expiry. 
- **Hard-gated categories**: `medical` and `legal` block `POST /jobs/{id}/accept` and `POST /jobs/{id}/quotes` with HTTP 403 unless the provider has at least one **verified** credential in that category. Other categories accept submissions and award a trust badge but don't block.
- **License-match enforcement**: medical jobs with `details.license_required` (e.g., `pt`, `rn_lpn`, `cna_hha`, `mental_health`) require a provider credential of an acceptable kind (mapped via `MEDICAL_LICENSE_MAP`). Accepting writes `credential_match: {matched_kind, required}` onto the job, surfaced on the job detail page and as a "✓ Match" pill on the provider's opportunity card.
- **Trust badges** — `<TrustBadges userId={...} />` fetches `/api/credentials/user/{id}` (verified only, no PII) and renders shield-icon chips on the job detail page next to the assigned provider's name.
- **Expiry reminders** — every call to `GET /credentials/mine` lazily inspects each credential's `expiry_date` and `insurance_expiry`. If within 30 days (or expired), a `license_expiring` / `insurance_expiring` / `license_expired` / `insurance_expired` notification is fired (rate-limited to once per 7 days per credential per kind via `last_*_expiry_notice_at` field).
- **Credentials page** at `/credentials` (provider-only). Includes a `dev_verify` shortcut for testing (would be admin-only in production).
- **Map pin picker** — `<MapPickerButton>` opens a real Google Map; click or drag-marker to place the pin; reverse-geocodes to get an address. Available next to every address input so customers without a precise street address (e.g., stranded on the road) can drop a pin.
- **AI assistant (Lumi)** — floating "Ask Lumi" widget bottom-right available to any logged-in user. Backed by Claude Sonnet 4.6 via Emergent LLM key; multi-turn conversation persisted per user. Trained via system prompt on Lumo's deposit / quote / wallet flows.
- **Delivery pricing engine** (`/app/frontend/src/lib/deliveryPricing.js`):
  - P2P delivery / courier: `$5 base + $1.50/mi + item-size base + extra-item surcharge + over-5 lb fee × fragile multiplier`. Auto-fills the customer's `pay_rate` and shows a transparent breakdown so the driver sees exactly what they receive.
  - Store / restaurant orders: per-mile only — `$4 base + $1.50/mi` from the storefront to the delivery address.
  - Delivery breakdown is persisted on the job as `delivery_quote`.
- **"Estimated units" verbiage** rewritten as "How many hours? / How many days? / How many weeks?" per pay-unit (or "Estimated time" when flat).
- **Landing page copy** rewritten for a clearer, more professional voice while keeping the colour-coded four-category headline.
- **Google Places Autocomplete** in service request fields (pickup/dropoff/service address), provider base location, marketplace buy delivery address, and store-profile order delivery address. Falls back to plain input if Maps key is missing/blocked.

## Tested
- Backend pytest **55/55** ✅ (24 base + 19 chat + 12 notifications). Zero regressions.

## Tested
- Backend pytest **43/43** (24 prior + 19 new chat tests). Sanitizer covers international phone formats, obfuscated emails, off-platform contact words. Role-based redirect after login/register fixed.

## Backlog
- **P1**: Real Google Maps integration on /map (currently schematic SVG with US bounds); use the user's restricted Google Maps API key.
- **P1**: Webhook hardening — `/api/webhook/stripe` currently logs only; rely on polling. Mark txns paid on webhook for resilience.
- **P1**: Provider job offers/quotes (counter-offer rate) instead of accept-only.
- **P2**: Reviews & ratings on provider + storefront profiles.
- **P2**: Real-time chat between customer ↔ provider during in_progress.
- **P2**: Cart / multi-item checkout for stores & restaurants.
- **P2**: Admin dashboard for withdrawal approvals.
- **P3**: Brute-force rate limiting on `/auth/login`.
- **P3**: Split `server.py` into routers (auth/jobs/marketplace/stores/payments/wallet) once it grows past 1500 lines.

## Next Tasks
- Wire real Google Maps API once the user restricts their key.
- Add provider-side counter-offer flow.
- Add admin/operator console for withdrawals.

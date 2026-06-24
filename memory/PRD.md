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

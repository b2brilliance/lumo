# Changelog (newer entries; older history lives in PRD.md "Implemented" sections)

## 2026-06 — Session 2 of 4-persona rebuild
- Demo/test data hidden from all public listing endpoints via `backend/demo_filter.py` (`hide_demo`, `is_hidden`):
  flags is_demo / is_global_demo / is_career_demo / seeded, plus anything owned by test accounts (emails ending .test, @test.com, @example.com).
  Admins see everything; owners see their own items. Applied to /jobs, /map/jobs, /provider/opportunities, /marketplace/listings(+detail),
  /stores, /restaurants, /search/marketplaces, /inventory, /rentals(+detail), /real-estate(+detail), /autos(+detail).
- Demo seeding disabled (set SEED_DEMO_CONTENT=1 in backend/.env to re-enable). Test user accounts still seeded.
- Routing wired: "/" → PersonaSplit (providers/admins redirected to their hubs), /for-you, /real-estate*, /rentals* restored; tiles → /for-you, /become-a-provider, /marketplace, /real-estate; aliases /market, /estate, /for-work.
- AI Service Copilot: single LLM call per turn (full transcript passed), no question+PICK in same reply.
- Footer tagline test value reset; Real Estate empty state with "List a property" CTA; tile label contrast.
- Tested: iteration_60 (backend 29/29, frontend all flows pass) + self-verification of fixes.

## 2026-06 — Real Estate module + Admin full control
- Real Estate rebuilt Redfin-style: worldwide OpenStreetMap (Leaflet) split map/list with price pins, "search as I move the map",
  worldwide place search (Nominatim proxy GET /api/geo/search), tabs Buy/Rent/Short stays/Rooms/Commercial/Land, filters + sort, mobile map/list toggle.
- Property rentals (db.rentals category=property) mirrored into real_estate (source_rental_id) → one search; "Check dates & book" links back to /rentals/:id.
- Saved searches (/api/real-estate/saved-searches, validated filters) + alerts on new matching listings (in-app notification + web push; email when RESEND_API_KEY set).
- Saved homes (favorites), /real-estate/saved page, tour requests + messages via inquiries, owner mark sold/rented/active, PATCH validation, auto-geocoding, currency + price units, photo upload.
- Detail page: embedded OSM map + public OpenStreetMap / Google Maps / Directions links to the exact property.
- Admin Content tab: create/edit/delete for real estate, listings, rentals, autos, inventory, jobs, shop products, blog posts, recruit cities (typed fields); Users tab create user + set password/phone.
- One-click "Purge demo data" (preview counts, type PURGE) deletes demo content + all test accounts and their data; seed() stops re-creating test users afterwards.
- Home tile renamed: "Real estate & rentals — Buy, rent or stay."
- Tested: iteration_61 + iteration_62 (all pass), pin-stacking fix verified by screenshot.

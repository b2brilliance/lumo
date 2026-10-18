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

## 2026-06 — Guide, price history, mobile tabs, incognito fix
- Copy sweep: removed how-to sentences on home, For You, Marketplace, Earn, Shop, Rentals, Autos heroes.
- AI site guide (AssistantWidget + components/guide/*): first-visit "Want a guide?" card (choice in localStorage lumo_guide_choice), exit-intent card once per session (desktop top-edge mouseout, mobile fast flick to top), suggests whitelisted link chips only (never auto-navigates). POST /api/guide/chat (anon + auth; history persisted for signed-in users).
- Price history + price-drop alerts for real estate, marketplace listings, autos (backend/price_watch.py): price_history, previous_price, price_drop_pct; watchers (re_favorites / watchlist) get in-app + push alerts. Owner PATCH /api/marketplace/listings/{id}, /api/autos/{id}; UI badges, was-price, history timeline, owner price editor, hearts. /autos routes re-enabled.
- Mobile tab bar: Home (role-aware) / Orders (/orders unified) / Messages (/messages unified chats + inquiries, unread badge via GET /api/me/badges) / Profile (/settings).
- INCOGNITO BUG ROOT CAUSE (deployer RCA): inline boot script compared HTML build stamp vs /api/meta (backend stamp never matches) → every normal session nuked SWs + reloaded; sw-nuke-v3 registered each session at scope "/". Fixed: removed boot /api/meta check, bfcache check and sw-nuke registration; kept asset-failure reload guard + one-time legacy SW cleanup; CacheBuster compares meta tag vs static /meta.json only. DO NOT reintroduce /api/meta comparisons. Requires redeploy.
- Tested: iteration_63 (20/21 backend, frontend pass) + fixes self-verified (guide link sanitizing, autos price history, cascades, listing price >0, orders money format, messages pagination).

## 2026-06 — Help Center + Lumi restyle
- Lumi chat restyled: rounded-3xl card, pill "Ask Lumi" button, iMessage-style bubbles, rounded input/send/chips; guide prompt matches.
- Help Center at /help: search, 9 topic tiles, accordions of 56 seeded FAQs (backend/faq_seed.py, seeded once via site_settings faq_seeded), Fix common problems (/reset, /signin, /orders, /settings), Ask Lumi (window event "lumo:open-guide") + Contact support. GET /api/help/faqs public.
- Admin Content → "Help FAQs" type (question, answer, topic, position, is_active) for add/edit/reorder/hide/delete.
- Help links: desktop nav (all roles), footer, Settings, 5th mobile tab. Customer "My orders" → /orders. Nav container testid renamed nav-links-<role>.
- Tested: iteration_64 (backend 10/10, frontend all pass); minor polish fixed after.

## 2026-06 — Global growth
- backend/global_markets.py: 50 countries (7 regions, lang, currency, top cities) + 51 regional marketplaces with post URLs; GET /api/global/markets.
- SEO hubs: /global, /in/:country, /in/:country/:city, /in/:country/:city/:vertical (services|jobs|rentals|homes|marketplace); ~1150 URLs added to /api/sitemap.xml. Home "Lumo in <country> · 50 countries" pill; footer "Lumo worldwide".
- Locale: 50 country profiles (currency, tax, timezone detection; tz beats en-US navigator), RTL dir for ar/he/fa/ur + letter-spacing reset; existing AutoTranslator (34 languages) handles translation.
- Feeds (public, demo-filtered): /api/feeds/google-products.xml, tiktok-products.xml, meta-products.csv, meta-home-listings.xml, meta-vehicles.xml; admin GET /api/admin/feeds.
- AI ad kits: POST /api/admin/ad-kits/generate (native-language ad per marketplace/country/city/subject), list/delete; Ad Studio "Global ad kits" panel with Copy & open.
- og-image.jpg share image + OG/Twitter tags; removed "Workers keep 90%" from meta description.
- Tested: iteration_65 (15/15 backend, frontend pass) + minor fixes self-verified.

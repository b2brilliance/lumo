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

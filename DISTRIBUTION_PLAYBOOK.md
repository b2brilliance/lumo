# Lumo — Free Distribution Playbook

The legitimate, ethical, zero-cost places to plant Lumo so workers, customers, sellers, and hosts find you organically. None of these violate ToS; none of them risk a domain blacklist. Submit once → permanent presence.

> ⚠️ This list excludes scrapeable classifieds (Craigslist, OLX, Gumtree, Kijiji) because their ToS explicitly prohibits automated posting and they'll IP-ban + blacklist `golumo.app` if you try.

---

## 1. Search engines — submit your sitemap (5 min each)
The most leveraged thing on the list. Each submission below indexes ~15,000+ Lumo URLs (~75 cities × ~50 categories × 4 page types) automatically.

| Where | Link |
|---|---|
| Google Search Console | https://search.google.com/search-console/welcome |
| Bing Webmaster Tools | https://www.bing.com/webmasters |
| Yandex Webmaster | https://webmaster.yandex.com |
| Baidu (China — required for CN traffic) | https://ziyuan.baidu.com |
| Naver (Korea) | https://searchadvisor.naver.com |
| Seznam (Czechia) | https://www.seznam.cz/sluzby |
| DuckDuckGo | Auto-indexes once Google does |
| Sogou (China) | http://zhanzhang.sogou.com |

Submit URL: `https://golumo.app/api/sitemap.xml`

## 2. Startup directories — one-time submit, lasting backlinks

### Top tier (high traffic, real users)
- **Product Hunt** — https://www.producthunt.com/posts/new (best Tuesday launch)
- **BetaList** — https://betalist.com/submit
- **AlternativeTo** — https://alternativeto.net/software/add/
- **Indie Hackers** — https://www.indiehackers.com/post
- **Hacker News (Show HN)** — https://news.ycombinator.com/submit
- **G2** — https://www.g2.com/products/new
- **Capterra** — https://www.capterra.com/vendors/sign-up
- **GetApp** — https://www.getapp.com/vendor
- **SaaSworthy** — https://www.saasworthy.com/product/new
- **Crunchbase** — https://www.crunchbase.com (free company profile)
- **AngelList / Wellfound** — https://wellfound.com
- **Trustpilot** — https://business.trustpilot.com

### Marketplace / on-demand directories
- **TheGigEconomy.com**
- **WorkFromHome.com**
- **SideHusl.com** (reviews gig-platforms; Lumo fits)
- **Steady App / Steady.com**
- **MillenialMoney.com** "best side hustles" lists — pitch them
- **DollarSprout / NerdWallet** — pitch as "best new gig app"

### Local / city directories (per city — start with top 20 cities)
- **Yelp for Business** — claim a Lumo profile per launched city
- **Google Business Profile** — one per city (free, huge SEO weight)
- **Bing Places** — one per city
- **Apple Maps Connect**
- **Foursquare for Business**

## 3. Social channels you control (auto-post via API in Phase 4)
Free to set up. Each becomes a content firehose later.

- X / Twitter — @lumoapp + per-category sub-handles
- Instagram — @golumo.app + Reels for each ad
- TikTok — @golumo.app
- LinkedIn Company Page — recruiting + B2B audience
- Facebook Page + Local Groups (per city)
- Pinterest — Boards per category ("Same-day delivery in Austin", etc.)
- Reddit — your own subreddit /r/lumo, plus genuine engagement (NOT spam) in /r/gigwork, /r/Entrepreneur, /r/sidehustle, /r/Flipping
- YouTube — Shorts cut from each Ad Studio image with TTS voiceover
- Mastodon — your own instance OR follow + post to mastodon.social
- Bluesky — @golumo.app
- Threads — same as IG handle (auto-cross-posts on Meta)
- WhatsApp Business + Telegram Channel per city
- Discord server for providers + customers

## 4. Niche communities (one organic post per launch, never spam)

### For workers / providers
- /r/gigwork, /r/sidehustle, /r/beermoney, /r/WorkOnline, /r/FreelanceWriters, /r/forhire, /r/Flipping
- Facebook Groups: "Side Hustle Nation", "Gig Workers Unite", "[City] Driver Network"
- LinkedIn Groups: "Freelancers Network", "Gig Economy Professionals"
- Indeed Community forums
- Glassdoor Community

### For sellers / restaurants
- /r/smallbusiness, /r/Entrepreneur, /r/restaurantowners, /r/RestaurantPro
- /r/Etsy (shift retailers from Etsy to Lumo)
- /r/EcomBuilders
- Foursquare communities
- LinkedIn "Restaurant Owners Network"

### For customers
- /r/AskAnAmerican, /r/NewYorkCity, /r/AskUK (one-city subreddits — pitch as "useful service" not "promo")
- Nextdoor — local neighborhood posts (per city)
- Local Facebook groups ("Moms of Austin", "DIY Bay Area", etc.)
- /r/lifehacks (only if Lumo genuinely solves the hack)

## 5. Free PR & media (one-shot, can yield massive returns)
- **HARO (Help a Reporter Out)** — https://www.helpareporter.com — sign up as a source; journalists writing about gig economy / marketplaces find you
- **Source of Sources** (HARO replacement) — https://www.sourceofsources.com
- **Quora** — answer questions like "best app for same-day delivery?", "alternatives to TaskRabbit?"
- **Medium / Substack** — write 10 essays about marketplace economics, distribute via SEO + email
- **Tech press tip line** emails: tips@techcrunch.com, tips@theverge.com, news@thenextweb.com (free, low hit rate, occasional 10K visit spike)
- **Y Combinator companies** community
- **Trends.vc / Trends.co** community shoutouts
- **Inflection Point / Failory** newsletter pitches

## 6. SEO-amplifying integrations (long game, free, defensible)
- **Schema.org markup** on all landing pages (`Service`, `LocalBusiness`, `JobPosting`) — already in roadmap
- **Google JobPosting structured data** — each open Lumo job listing appears in Google Jobs (free, massive)
- **OpenGraph + Twitter Card** image-rich previews on every share — already shipped
- **Sitemap submitted weekly** as new cities and categories light up
- **Hreflang tags** for languages we serve

## 7. App store presence (if/when you publish mobile shell)
- Google Play Store
- Apple App Store
- Huawei AppGallery
- Samsung Galaxy Store
- Amazon Appstore
- F-Droid (open-source community)
- Microsoft Store (PWA)

## 8. Web 3.0 / open networks (long-tail discovery)
- Mastodon instance
- Bluesky handle
- Nostr
- Lemmy communities
- Diaspora pods

---

## Roadmap for auto-posting (Phase 4 — separate sessions)
Each requires YOU to sign up + create app credentials, then I plug them in:

| Platform | Difficulty | Your prep | What I integrate |
|---|---|---|---|
| X / Twitter | Easy | Create developer account at developer.x.com | OAuth 2.0 + tweet posting from Ad Studio |
| LinkedIn | Easy | Create LinkedIn app at developers.linkedin.com | Company page posting |
| Reddit (your /r/lumo) | Easy | OAuth client at reddit.com/prefs/apps | Subreddit autopost |
| Mastodon + Bluesky | Easy | One token per server | Cross-post Ad Studio creative |
| Pinterest | Medium | Pinterest Developer account | Boards per category |
| Meta (FB + IG) | Hard | Meta Business verification (5-14 days) | Page + IG creator posting |
| TikTok | Hard | TikTok Business + dev review | Video posting |
| Google Business Profile | Medium | Verify ownership per city | Local posts per city |

## Outreach scripts (drafts you can hand-tune)

### To bloggers/press
> Subject: New marketplace where workers keep 90% — Lumo launched in [city] this week
>
> Hi [name], I'm the founder of Lumo (golumo.app), a same-day delivery + on-demand services + rentals marketplace. Two things that differentiate us: workers keep 90% of every job (vs DoorDash/Uber's ~70%), and we cover same-day rentals (Turo + Airbnb + Tool Rental in one).
>
> We're now live in [city]. If you cover the gig economy or local services, happy to share our launch numbers, talk to a few drivers, or be a source for any related piece.

### To Reddit communities (genuine, not spammy)
Wait until you have **real** results to share. Post in /r/sidehustle: "Our drivers in Lagos average $X/week on Lumo, keeping 90% — here's the breakdown" — link in second comment.

---

**Last updated**: 2026-02 — append new channels as you discover them.

# Social Auto-Post Setup Guide

Your Lumo admin dashboard has an **Auto-post** tab (`/admin?tab=autopost`) with four channels: Facebook, Instagram, X/Twitter, and Reddit. Once configured, every published blog post *and* every daily city-recruit broadcast fans out to whichever channels you've enabled.

This guide walks you through getting the credentials for each channel.

---

## 1. Facebook Page (30 minutes, free)

You need: a Facebook Page (business), a Meta app, and a long-lived Page Access Token.

1. Create/claim a Facebook Page for Lumo at https://facebook.com/pages/create.
2. Go to https://developers.facebook.com/apps → **Create App** → choose *Business* → name it "Lumo Auto-poster".
3. Add the **Facebook Login** and **Pages API** products to your app.
4. In the app dashboard → **Tools → Graph API Explorer**:
   - Application: your app
   - User: **Get User Access Token** with permissions: `pages_show_list`, `pages_manage_posts`, `pages_read_engagement`.
   - Click **Generate Access Token** → grant permissions.
5. In the Graph API Explorer, change the query to `me/accounts` → run. You'll get a JSON list of your pages with `id` and `access_token`.
   - Copy the `id` → this is your **page_id**.
   - Copy the `access_token` → this is a short-lived token. Convert it to long-lived: `GET /oauth/access_token?grant_type=fb_exchange_token&client_id={APP_ID}&client_secret={APP_SECRET}&fb_exchange_token={SHORT_TOKEN}`.
6. Paste `page_id` + long-lived `access_token` into `Admin → Auto-post → Facebook`. Toggle **Enable** → **Send test**.

**Gotcha:** if your app is still in *Development mode*, only listed test users see the posts. Submit for review (`pages_manage_posts` permission review) to publish to the public. Reviews take 2-5 business days.

---

## 2. Instagram Business (same 30 min, needs an FB Page)

You need: an Instagram Business or Creator account **linked to your Facebook Page**.

1. In the Instagram app → Settings → Account → **Switch to professional account** → *Business*.
2. Link it to your Facebook Page (settings → Linked Accounts → Facebook).
3. In the Graph API Explorer with the same Meta app: query `me/accounts?fields=instagram_business_account` → you'll get an `instagram_business_account.id` on the page — that's your **ig_user_id**.
4. Use the **same long-lived access_token** as Facebook.
5. Paste `ig_user_id` + `access_token` into `Admin → Auto-post → Instagram`. Toggle **Enable** → **Send test**.

**Gotcha:** Instagram requires an `image_url` on every post — text-only posts fail. Every Lumo blog auto-post has one; recruit broadcasts include the city hero image. You're covered.

---

## 3. X (Twitter) — $100/mo required as of 2024

You need: an X developer account with **Basic** or higher access ($100/mo minimum for write access).

1. Sign up at https://developer.x.com. Free tier is *read-only* — writes need paid Basic.
2. Create a Project + App.
3. In the App settings → **User authentication settings**:
   - App permissions: **Read and write**
   - Type of App: **Web App**
   - Callback URI: `https://your-lumo-domain.com/callback` (any value works, we use OAuth 2.0 client credentials)
4. In **Keys and tokens** → **OAuth 2.0** section → generate a **Bearer Token** with `tweet.write` scope.
5. Paste the token into `Admin → Auto-post → X/Twitter → bearer_token`. Enable → test.

**Gotcha:** Twitter has aggressive spam detection. First few posts might get rate-limited or flagged if you publish more than 3/day. Stagger via the daily recruit loop (one post per city per day is fine).

---

## 4. Reddit — Free, no API cost

You need: a Reddit account + a "script" app.

1. Go to https://www.reddit.com/prefs/apps → scroll to the bottom → **Create another app…**
2. Choose **script** (not web app).
3. Name: `lumo-autoposter`. Redirect URI: `http://localhost:8080`. Save.
4. You'll see the app appear with:
   - `client_id` — the 14-character string under the app name
   - `client_secret` — labelled *secret*
5. Paste into `Admin → Auto-post → Reddit`:
   - `client_id`, `client_secret`
   - `username` — your Reddit username
   - `password` — your Reddit password
   - `subreddit` — which sub to post to (start with `u_your_username` for your profile page, or `test` for the r/test sub, or a sub you moderate. **Do NOT** target subs where you're not a mod or you'll get shadowbanned.)
   - `user_agent` — free-form, e.g. `lumo-autoposter/1.0 by /u/{your_username}`
6. Enable → test.

**Gotcha:** Reddit's public subs (r/lyftdrivers, r/beermoney, r/SideHustle) don't allow automated posting — mods flag it fast. Use auto-posting for **your own profile page** (`u_your_username`) or subs you moderate. For actual recruitment posts in other subs, use the manual playbook at `/app/RECRUITING_PLAYBOOK.md`.

---

## Blog auto-post

Every time you publish a blog post (or the daily auto-blogger fires), the SocialPublisher fans it out to every enabled channel. Nothing else to configure — just enable the channel and it works.

## Recruit auto-post

- Toggle **Daily auto-broadcast** in `Admin → Recruit`. Once a day the backend cycles through your active cities and pushes one recruit post per city per enabled channel.
- **Broadcast now** — click this to fire immediately (skip the daily throttle) so you can preview the flow with your own eyes before letting it run on autopilot.
- Every fire is logged in `Admin → Auto-post → Recent auto-posts` with per-platform status.

## Which platforms are worth it?

| Channel | Setup effort | Cost | Signal |
|---|---|---|---|
| Facebook Page | Medium | Free | Medium (mostly older audience for gig work) |
| Instagram Business | Medium | Free | High (visual, drivers browse) |
| X / Twitter | Low | **$100/mo** | High (competitor-poach audience is here) |
| Reddit (own profile) | Low | Free | Low unless subs allow it |

**My recommendation:** enable Facebook Page + Instagram Business first (free, no risk). Add X only if you're willing to spend $100/mo on API access. Skip Reddit auto-post — do those manually via the `/app/RECRUITING_PLAYBOOK.md`.

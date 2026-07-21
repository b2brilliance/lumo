# Lumo → Google Play Store — Complete Playbook

**Total time**: ~2 hours (mostly waiting for Play review)
**Total cost**: $25 one-time (Google Play Developer registration)
**Approach**: Trusted Web Activity (TWA) — wraps your live golumo.app site in a real Android app. Google-endorsed method.

---

## Prerequisites (5 min)

1. **Google Play Console account** — $25 lifetime fee at https://play.google.com/console/signup
2. **Node.js 18+** on your local machine (Mac / Windows / Linux)
3. **Java JDK 17+** — required by Bubblewrap. Install:
   - Mac: `brew install openjdk@17`
   - Windows: https://adoptium.net/temurin/releases/
   - Linux: `sudo apt install openjdk-17-jdk`
4. Confirm https://golumo.app loads correctly and installs as a PWA when you visit it in Chrome on Android (three-dot menu → Install app).

---

## Step 1 — Install Bubblewrap (Google's official TWA generator)

```bash
npm install -g @bubblewrap/cli
```

Verify:
```bash
bubblewrap --help
```

If it complains about `JAVA_HOME`, set it:
```bash
# Mac / Linux
export JAVA_HOME=$(/usr/libexec/java_home -v17)     # Mac
export JAVA_HOME=/usr/lib/jvm/java-17-openjdk-amd64 # Linux (path may vary)

# Windows PowerShell
$env:JAVA_HOME = "C:\Program Files\Eclipse Adoptium\jdk-17.0.x"
```

---

## Step 2 — Initialize the Android project (10 min)

Create a fresh folder OUTSIDE the Lumo repo (this is a separate Android project):

```bash
cd ~/Desktop
mkdir lumo-android && cd lumo-android
bubblewrap init --manifest https://golumo.app/manifest.json
```

Bubblewrap will prompt for a bunch of values. Answer:

| Prompt | Answer |
| --- | --- |
| Domain being opened in the TWA | `golumo.app` |
| Name of the application | `Lumo` |
| Short name | `Lumo` |
| Application ID | `app.golumo.twa` |
| Starting version code | `1` |
| Display mode | `standalone` |
| Orientation | `portrait` |
| Theme color | `#0f172a` |
| Background color | `#ffffff` |
| Icon URL | (accept default from manifest — 512px) |
| Maskable icon URL | (accept default) |
| Include shortcuts? | `Y` |
| Signing key location | `./android.keystore` |
| Signing key alias | `android` |
| Signing key password | (choose a strong one — SAVE IT, you'll need it every release) |

Bubblewrap generates the Android project + a `twa-manifest.json` config file.

---

## Step 3 — Build the release AAB (2 min)

```bash
bubblewrap build
```

This produces:
- `app-release-bundle.aab` — this is what you upload to Play Console
- `app-release-signed.apk` — sideload version if you want to test on your own phone first

Install on your phone for a test:
```bash
adb install app-release-signed.apk
```

---

## Step 4 — Get your signing-key SHA-256 fingerprint

You'll need this for the assetlinks.json file that proves you own the domain:

```bash
bubblewrap fingerprint
```

Copy the SHA-256 fingerprint (looks like `AB:CD:EF:12:34:...`).

---

## Step 5 — Update the assetlinks.json on your domain

I already scaffolded the file at `/app/frontend/public/.well-known/assetlinks.json`.
Open it and replace `REPLACE_WITH_YOUR_APP_SIGNING_KEY_SHA256_FROM_PLAY_CONSOLE`
with the fingerprint from Step 4.

Then redeploy Lumo to production so `https://golumo.app/.well-known/assetlinks.json`
returns the correct content.

Verify:
```bash
curl -s https://golumo.app/.well-known/assetlinks.json | head
```

Google will also verify via:
https://digitalassetlinks.googleapis.com/v1/statements:list?source.web.site=https://golumo.app&relation=delegate_permission/common.handle_all_urls

---

## Step 6 — Play Console listing (30 min)

1. Go to https://play.google.com/console → **Create app**
2. Fill:
   - App name: `Lumo`
   - Default language: English (United States)
   - App or game: **App**
   - Free or paid: **Free** (recommended — matches marketplace apps)
3. Complete the **Dashboard checklist**:
   - **App content**: Privacy policy URL → `https://golumo.app/privacy`
   - **Data safety**: fill out the survey (location, name, email, photos — declare each honestly)
   - **Content rating**: run the questionnaire, "Lumo is a general marketplace"
   - **Target audience**: 18+ recommended (marketplace + payments)
   - **Store listing**:
     - Short description (80 chars): `Local delivery, jobs, rentals & marketplace in one app.`
     - Full description (4000 chars): use the copy from your `/for-customers` page
     - App icon: 512×512 PNG (use `logo512.png`)
     - Feature graphic: 1024×500 PNG — create in Figma / Canva
     - Screenshots: 4–8 phone screenshots (portrait 1080×1920 or similar) — capture your homepage, /order, /marketplace, /jobs-near-you
4. **Production** → **Create new release** → upload the `app-release-bundle.aab` from Step 3
5. Bump `versionCode` in `twa-manifest.json` for every re-upload (Google requires a unique version code per release)

---

## Step 7 — Submit for review

- Click **Send for review** at the bottom of the Production release page
- Google review takes **1–7 days for the first submission**, usually <24 h for updates
- If rejected, they cite the exact policy — fix and resubmit; no penalty

---

## Updating the app later

Every time you want to push a new version:

1. In `twa-manifest.json`: bump `appVersionCode` (integer, +1) and `appVersionName` (e.g. "1.0.1")
2. `bubblewrap update` — pulls latest manifest changes from your live PWA
3. `bubblewrap build`
4. Upload the new `.aab` to Play Console → Production → Create new release → Submit

Because it's a TWA, **most updates don't need a new .aab at all** — any change you push to `golumo.app` shows up in the app instantly (since the app just loads your live site). Only ship a new .aab when you change the wrapper (icons, name, shortcuts, permissions).

---

## Optional: iOS App Store

The iOS equivalent is **PWA Builder** (https://www.pwabuilder.com/) which generates an Xcode-openable iOS project. Apple review is stricter — expect 1–2 weeks and possibly a request to add native features. Same manifest.json is the input.

---

## Troubleshooting

**TWA opens a browser bar at the top instead of a real fullscreen app**
→ Your assetlinks.json isn't verified. Test with the Google tool above. Common cause: wrong SHA-256 fingerprint OR the .well-known file isn't reachable (CORS / caching).

**Play Console rejects for "broken functionality"**
→ Usually the reviewer's Wi-Fi timed out on your live site. Requesting a re-review with a note explaining Lumo requires internet access almost always passes on second attempt.

**"Your app must target Android 14 (API 34)"**
→ Bubblewrap already targets the latest. Just run `bubblewrap update` and rebuild — it pulls latest gradle + target SDK versions.

**Firebase / Push notifications**
→ Web push works out of the box in TWAs on Android 13+. No native code needed. Your service worker's push handler still fires.

---

## Cost recap

| Item | Cost |
| --- | --- |
| Google Play Developer registration | $25 one-time |
| Apple Developer Program (if you also want iOS) | $99/year |
| Bubblewrap + hosting | $0 |
| **Total to launch Android** | **$25** |

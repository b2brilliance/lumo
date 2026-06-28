# Lumo — Mobile App Build Guide (iOS + Android via Capacitor)

Everything in this doc happens **on your local Mac** (for iOS) and either Mac/Windows/Linux (for Android). The Linux container the agent works in cannot run Xcode or sign iOS builds — that has to happen on your machine.

The codebase is already 100% configured. You only need to:
1. Pull the repo to your Mac
2. Run the commands below
3. Open the generated Xcode + Android Studio projects
4. Hit Run / Archive / Upload

---

## ✅ What's already done in the repo (don't re-do)

- `@capacitor/core` + `@capacitor/cli` v7 installed
- `@capacitor/ios` and `@capacitor/android` platforms installed
- Plugins installed: **Geolocation, Push Notifications, App, Status Bar, Preferences, Share, Camera, Splash Screen, Keyboard**
- `capacitor.config.ts` configured with `appId: app.golumo.lumo` and `appName: Lumo`
- Native-aware GPS helper at `src/lib/native.js` — the same React code now uses OS-level GPS on device + browser GPS on web
- Provider location pinger swapped to native watcher (keeps tracking when phone screen sleeps)
- `MapPage` GPS button uses native API on device

---

## Prerequisites — One-time installs on your Mac

```bash
# 1. Node 22 (Capacitor 7 requires it)
brew install node@22
brew link --force node@22

# 2. Xcode (free from the Mac App Store) — needed for iOS build
# 3. Xcode Command Line Tools
xcode-select --install
# 4. CocoaPods (iOS dependency manager)
sudo gem install cocoapods

# 5. Android Studio — needed for Android build
# Download: https://developer.android.com/studio
# After install, open it once to let it set up the SDK.
```

**Apple Developer account:** Sign up at https://developer.apple.com → $99/year
**Google Play Developer account:** Sign up at https://play.google.com/console → $25 one-time

---

## Step 1 — Pull the repo + install

```bash
git clone <your-repo-url> lumo
cd lumo/frontend
yarn install
yarn build              # builds the React app into frontend/build (Capacitor reads from here)
```

## Step 2 — Add the native platforms (one-time)

```bash
cd frontend
npx cap add ios          # creates ios/App folder (a real Xcode project)
npx cap add android      # creates android/ folder (a real Android Studio project)
```

After this, two new folders exist: `frontend/ios/` and `frontend/android/`. Commit them to git.

## Step 3 — Sync any future code changes

Every time you change React code (or push from the agent), run:

```bash
cd frontend
yarn build
npx cap sync
```

This re-bundles your React app and copies it into both native projects.

---

## Step 4 — Run on iOS

```bash
cd frontend
npx cap open ios
```

This opens Xcode. Then:

1. **Top toolbar** — pick a simulator (e.g. *iPhone 15 Pro*) or your connected iPhone.
2. **Project navigator → App → Signing & Capabilities** — set Team to your Apple Developer team. Bundle ID defaults to `app.golumo.lumo` (matches our config).
3. **Capabilities to add:**
   - `Push Notifications`
   - `Background Modes` → check **Background fetch** + **Remote notifications** + **Location updates**
4. Edit `ios/App/App/Info.plist` and add (Xcode auto-prompts for these on first run, but you can pre-fill):

```xml
<key>NSLocationWhenInUseUsageDescription</key>
<string>Lumo shows your live location to customers while a job is in progress so they know when you'll arrive.</string>
<key>NSLocationAlwaysAndWhenInUseUsageDescription</key>
<string>Lumo continues to share your location with customers while a job is active, even when the app is in the background.</string>
<key>NSCameraUsageDescription</key>
<string>Lumo uses the camera so you can upload a profile photo or proof-of-delivery photo.</string>
<key>NSPhotoLibraryUsageDescription</key>
<string>Lumo uses photos so you can upload a profile picture or attach images to your listings.</string>
<key>UIBackgroundModes</key>
<array>
  <string>fetch</string>
  <string>remote-notification</string>
  <string>location</string>
</array>
```

5. Press ▶ to run. The Lumo web app boots inside the iOS shell.
6. To **publish to TestFlight**: Product → Archive → Distribute App → App Store Connect → Upload. After ~20 minutes you can invite testers from https://appstoreconnect.apple.com.
7. To **publish to App Store proper**: same Archive flow, then submit for review in App Store Connect.

---

## Step 5 — Run on Android

```bash
cd frontend
npx cap open android
```

This opens Android Studio. Then:

1. **Run** ▶ on a connected device or emulator.
2. **Edit `android/app/src/main/AndroidManifest.xml`** to add (already mostly auto-generated; verify these are there):

```xml
<uses-permission android:name="android.permission.INTERNET" />
<uses-permission android:name="android.permission.ACCESS_FINE_LOCATION" />
<uses-permission android:name="android.permission.ACCESS_COARSE_LOCATION" />
<uses-permission android:name="android.permission.ACCESS_BACKGROUND_LOCATION" />
<uses-permission android:name="android.permission.CAMERA" />
<uses-permission android:name="android.permission.POST_NOTIFICATIONS" />
<uses-permission android:name="android.permission.RECEIVE_BOOT_COMPLETED" />
<uses-permission android:name="android.permission.VIBRATE" />
```

3. **To publish to Play Store**:
   - `Build → Generate Signed Bundle / APK → Android App Bundle (.aab)`
   - Create a keystore (Android Studio guides you the first time — KEEP THIS FILE SAFE).
   - Upload the `.aab` to https://play.google.com/console.
   - For first launch, use the **Internal Testing** track to invite up to 100 testers without store review.

---

## Push Notifications — Wiring up

Push is already plumbed in `src/lib/native.js`. After login, call `registerPushNotifications` to get the device token and send it to the backend:

```js
import { registerPushNotifications } from "@/lib/native";
// inside a useEffect after the user is authenticated:
registerPushNotifications(
  async (token) => {
    // store the token against the user so the backend can target them
    await api.post('/me/push-token', { token, platform: 'ios' /* or 'android' */ });
  },
  (notification) => {
    // optional: handle in-app notifications while the app is in foreground
    console.log('push', notification);
  }
);
```

The backend endpoint `/me/push-token` is **NOT yet built** — say the word and I'll add it (~15 min). Once it is, you can fire APNs / FCM pushes from the backend whenever a job event happens.

**For sending actual pushes** you'll need:
- iOS: an **APNs key** from https://developer.apple.com/account/resources/authkeys (free, takes 5 min)
- Android: a **Firebase project** + `google-services.json` (free, https://console.firebase.google.com)

Tell me when you have them and I'll wire the backend.

---

## App icons + splash

Replace these files (1024×1024 PNG for icon, any size for splash):

```bash
# Install the helper once:
yarn global add @capacitor/assets

# Drop your source assets in:
#   frontend/assets/icon-only.png        (1024×1024 transparent)
#   frontend/assets/icon-foreground.png  (1024×1024 logo only)
#   frontend/assets/icon-background.png  (1024×1024 solid bg color)
#   frontend/assets/splash.png           (2732×2732)

cd frontend
npx @capacitor/assets generate --iconBackgroundColor '#0f172a' --splashBackgroundColor '#0f172a'
```

This auto-generates every iOS + Android resolution. If you don't have icons yet, the default Capacitor placeholder ships — you can submit to TestFlight + Play Internal Testing without final icons.

---

## Store-listing copy you can reuse

**App name:** Lumo
**Subtitle (iOS):** On-demand work, deliveries & services
**Short description (Play):** Hire local providers, get same-day deliveries, find W-2 jobs — all in one place. Live tracking, in-app chat, secure payments.
**Keywords:** uber, taskrabbit, doordash, jobs, gig, delivery, marketplace, hire, freelance, services
**Category:** Business (primary), Lifestyle (secondary)
**Privacy policy URL:** https://golumo.app/privacy
**Support URL:** https://golumo.app/contact

---

## Common pitfalls

| Problem | Fix |
|---|---|
| `Pod install` fails on iOS | `cd ios/App && pod install --repo-update` |
| White screen on launch | Make sure `yarn build` ran successfully — `frontend/build/index.html` must exist before `npx cap sync` |
| Geolocation prompts say "this app would like…" with wrong text | Re-edit the `Info.plist` strings above and rebuild |
| Push token never arrives in iOS | Confirm you turned on the Push Notifications capability AND uploaded an APNs auth key in App Store Connect |
| Android build fails with Gradle version error | Open `android/build.gradle`, bump Gradle to 8.2+, then File → Sync Project with Gradle Files |

---

## What's next after the first build

1. Run on a real iPhone or Android device — verify the live tracker, GPS pinger, and chat all work natively.
2. Add the backend `/me/push-token` endpoint + APNs/FCM credentials when you're ready for push.
3. Submit to TestFlight + Play Internal Testing — invite a few friends as beta testers.
4. Iterate, then submit for App Store + Play Store production review.
5. **Both review tracks reject "wrapper" apps that don't feel native** — Lumo passes this bar because GPS, push, and the share sheet now all use native APIs.

When you're ready, walk through this doc on your Mac. If you hit any issue, paste the error here and I'll diagnose.

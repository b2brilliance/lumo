# Publishing Lumo to the App Store and Google Play

The apps load the live site (https://golumo.app), so publish the website first. Later web updates reach the apps without resubmitting.

## 0. Before your first build (both required, or the app will close on launch)
Push alerts use Firebase. Do this once (about 15 minutes):
1. Go to https://console.firebase.google.com → **Add project** → name it "Lumo" → you can turn Google Analytics off → Create
2. **Add an iOS app**: Apple bundle ID `app.golumo.mobile` → Register → download **GoogleService-Info.plist**
3. **Add an Android app**: package name `app.golumo.mobile` → Register → download **google-services.json**
4. **Apple push key**: in https://developer.apple.com/account/resources/authkeys/list click **+**, tick **Apple Push Notifications service (APNs)**, continue, download the `.p8` file and note the **Key ID**. In Firebase → Project settings → **Cloud Messaging** → Apple app configuration → **APNs Authentication Key** → upload the `.p8`, enter the Key ID and your Team ID
5. **Server key for Lumo**: Firebase → Project settings → **Service accounts** → **Generate new private key**. Open the downloaded JSON file, copy everything, and paste it into the `FIREBASE_SERVICE_ACCOUNT_JSON` secret in Emergent
6. Put the files in the project on your Mac:
   - `google-services.json` → `frontend/android/app/google-services.json`
   - `GoogleService-Info.plist` → drag it into Xcode's **App/App** folder, with "Copy items if needed" and the **App** target ticked

## 1. Get the project on your Mac
1. In Emergent, use **Save to GitHub**, then on your Mac: `git clone <your repo>` and `cd <repo>/frontend`
2. Install Node 20+, then run `yarn install` and `npx cap sync`

## 2. iOS (Xcode 16+)
1. `npx cap open ios`
2. Select the **App** target → **Signing & Capabilities** → choose your Apple team. The bundle ID is already `app.golumo.mobile`. **Sign in with Apple** and **Push Notifications** are already listed; if Xcode shows a warning, click "Try again" so it updates your App ID
3. In App Store Connect → **My Apps → +** → New App, using bundle ID `app.golumo.mobile`
4. In Xcode pick **Any iOS Device (arm64)** → **Product → Archive** → **Distribute App → App Store Connect → Upload**
5. In App Store Connect: fill in the listing from `store-listing/LISTING.md`, upload the four `screenshots/iphone-6.9-*.png` files, pick the uploaded build, then **Submit for Review**

## 3. Android (Android Studio)
1. `npx cap open android`
2. **Build → Generate Signed App Bundle → Android App Bundle** → create a new keystore (back it up somewhere safe, you need it for every update) → release
3. In Play Console → your app → **Production** (or Internal testing first) → **Create release** → upload `android/app/release/app-release.aab`
4. Fill in the store listing with `store-listing/LISTING.md`, `play-store-icon-512.png`, `play-feature-graphic-1024x500.png` and the four `screenshots/android-phone-*.png` files
5. Complete **App content** (privacy policy, data safety, account deletion URL, ads: no, target audience 18+) and send for review

## 4. Sign in with Apple
Works in the iPhone app with no keys. For the **website** button and for removing Apple access when someone deletes their account, add these secrets in Emergent:
- `APPLE_TEAM_ID` — developer.apple.com/account → **Membership details** → Team ID (10 characters)
- `APPLE_SERVICES_ID` — Certificates, IDs & Profiles → **Identifiers** → **+** → **Services IDs** → identifier `app.golumo.web` → Register. Open it, tick **Sign in with Apple** → Configure → Primary App ID `app.golumo.mobile`, Domains `golumo.app`, Return URL `https://golumo.app/signin` → Save. The value is `app.golumo.web`
- `APPLE_KEY_ID` and `APPLE_PRIVATE_KEY` — **Keys** → **+** → name "Lumo Sign in" → tick **Sign in with Apple** → Configure → `app.golumo.mobile` → Register → **Download** the `.p8` (only once!). The Key ID is shown on that page. Open the `.p8` in a text editor and paste the whole contents as `APPLE_PRIVATE_KEY`

## 5. Turn on the homepage buttons
- Google Play works automatically once the app is live (it links to `app.golumo.mobile`)
- Apple: copy the link from App Store Connect → App Information → "View on App Store" and paste it into **Admin → Social links → App download links**
- Share `golumo.app/download` anywhere: it sends iPhones to the App Store and Android phones to Google Play

## Releasing updates
Website changes: just publish the website. Native changes (icons, permissions, plugins): bump `versionCode`/`versionName` in `android/app/build.gradle` and the Version/Build in Xcode, then repeat the archive/upload steps.

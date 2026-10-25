# Publishing Lumo to the App Store and Google Play

The apps load the live site (https://golumo.app), so publish the website first. Later web updates reach the apps without resubmitting.

## 1. Get the project on your Mac
1. In Emergent, use **Save to GitHub**, then on your Mac: `git clone <your repo>` and `cd <repo>/frontend`
2. Install Node 20+, then run `yarn install` and `npx cap sync`

## 2. iOS (Xcode 16+)
1. `npx cap open ios`
2. Select the **App** target → **Signing & Capabilities** → choose your Apple team. The bundle ID is already `app.golumo.mobile`
3. In App Store Connect → **My Apps → +** → New App, using bundle ID `app.golumo.mobile` (register it first under Certificates, IDs & Profiles → Identifiers if it isn't listed)
4. In Xcode pick **Any iOS Device (arm64)** → **Product → Archive** → **Distribute App → App Store Connect → Upload**
5. In App Store Connect: fill in the listing from `store-listing/LISTING.md`, add screenshots (6.9" iPhone: 1320×2868), pick the uploaded build, then **Submit for Review**

## 3. Android (Android Studio)
1. `npx cap open android`
2. **Build → Generate Signed App Bundle → Android App Bundle** → create a new keystore (back it up somewhere safe, you need it for every update) → release
3. In Play Console → your app → **Production** (or Internal testing first) → **Create release** → upload `android/app/release/app-release.aab`
4. Fill in the store listing with `store-listing/LISTING.md`, the 512 icon, the feature graphic and phone screenshots (at least 2, e.g. 1080×1920)
5. Complete **App content** (privacy policy, data safety, account deletion URL, ads: no, target audience 18+) and send for review

## 4. Turn on the homepage buttons
- Google Play works automatically once the app is live (it links to `app.golumo.mobile`)
- Apple: copy the link from App Store Connect → App Information → "View on App Store" and paste it into **Admin → Social links → App download links**

## Releasing updates
Website changes: just publish the website. Native changes (icons, permissions, plugins): bump `versionCode`/`versionName` in `android/app/build.gradle` and the Version/Build in Xcode, then repeat the archive/upload steps.

# Wrapping Lumo into native iOS + Android with Capacitor

Capacitor lets you ship the same React web app as native iOS and Android apps. The web bundle runs inside a native WebView, while Capacitor plugins give you access to native APIs (camera, push notifications, geolocation, biometrics, in-app purchase, etc.) when you need them.

> Why Capacitor (vs React Native)? Because your React + Tailwind + shadcn UI works **as-is**. No rewrite. Capacitor wraps it, signs it, and submits it to the App Store / Play Store.

---

## What's already installed

```bash
# Already in package.json:
@capacitor/core   ^7
@capacitor/cli    ^7
@capacitor/ios    ^7
@capacitor/android ^7
```

Plus `/app/frontend/capacitor.config.ts` is pre-configured with `appId: com.lumo.app`, `appName: Lumo`, and `webDir: build`.

> NOTE: We use Capacitor v7 because this dev container runs Node 20. If you're on Node 22+ on your local machine, feel free to upgrade to Capacitor 8 (`yarn upgrade @capacitor/core@latest @capacitor/cli@latest @capacitor/ios@latest @capacitor/android@latest`).

---

## What you need to do on your own Mac / Windows (not in this container)

These steps need real iOS / Android SDKs that don't exist in this Kubernetes pod. Run them on your dev machine after cloning Lumo locally.

### 1. Build the React web bundle

```bash
cd frontend
yarn install
yarn build         # produces frontend/build/
```

### 2. Add iOS and Android platforms

```bash
npx cap add ios
npx cap add android
```

This generates:
- `frontend/ios/`        — full Xcode project
- `frontend/android/`    — full Android Studio project

Commit both folders to git (they're real native source trees you'll edit).

### 3. Copy the web build into each platform

Run this every time you change the React app:

```bash
yarn build && npx cap copy
```

Or in one step: `npx cap sync` (also installs any new Capacitor plugins).

### 4. Open in the native IDEs

```bash
npx cap open ios       # opens Xcode
npx cap open android   # opens Android Studio
```

From Xcode: pick a simulator or your iPhone → click Run. From Android Studio: pick an emulator or device → click Run.

---

## Live-reload during development

Instead of rebuilding for every change, point Capacitor at the running React dev server (yours or the deployed preview).

In `capacitor.config.ts`, **uncomment** the `server` block:

```ts
server: {
  url: 'https://lumo-bundle-checkout.preview.emergentagent.com',
  cleartext: false,
  androidScheme: 'https',
},
```

Then `npx cap copy` and re-run from Xcode / Android Studio. The native app now loads from that URL — every save in React refreshes the device.

For LAN dev:
```bash
HOST=0.0.0.0 yarn start                                       # bind dev server to your LAN
# then set capacitor server.url = "http://192.168.x.x:3000"
```

---

## Optional Capacitor plugins to add

These map directly to features Lumo already uses:

| Feature in Lumo                          | Capacitor plugin              | Install                                              |
|------------------------------------------|-------------------------------|------------------------------------------------------|
| Camera / photo upload (credentials, reviews) | `@capacitor/camera`        | `yarn add @capacitor/camera`                         |
| Geolocation (provider hub map, jobs)     | `@capacitor/geolocation`      | `yarn add @capacitor/geolocation`                    |
| Push notifications (opportunity toasts)  | `@capacitor/push-notifications` | `yarn add @capacitor/push-notifications`          |
| Local notifications (booking reminders)  | `@capacitor/local-notifications` | `yarn add @capacitor/local-notifications`         |
| Status bar styling                       | `@capacitor/status-bar`       | `yarn add @capacitor/status-bar`                     |
| Splash screen                            | `@capacitor/splash-screen`    | `yarn add @capacitor/splash-screen`                  |
| Biometrics (sign-in)                     | `capacitor-native-biometric`  | `yarn add capacitor-native-biometric`                |
| App icons / splash generator             | `@capacitor/assets`           | `yarn add -D @capacitor/assets`                      |

After installing any plugin, run `npx cap sync` to update the native projects.

---

## App Store / Play Store checklist

Before submitting:

1. **App icon + splash screen** — drop `icon.png` (1024×1024) and `splash.png` (2732×2732) into `frontend/assets/`, then `npx capacitor-assets generate`.
2. **Bundle ID** — `com.lumo.app` (in `capacitor.config.ts`). Change before publishing if you want a different reverse-DNS namespace.
3. **iOS signing** — Xcode → Lumo target → Signing & Capabilities → assign your Apple Developer team.
4. **Android signing** — Android Studio → Build → Generate Signed Bundle. Keep `keystore.jks` + password secure.
5. **App Privacy** — Apple requires you to declare data collection in App Store Connect. Lumo collects: location (when posting jobs / browsing map), photos (credential uploads), contact info (auth), payment info (Stripe).
6. **Backend allow-list** — your backend CORS config must accept the Capacitor scheme (`capacitor://localhost` for iOS, `http://localhost` for Android in some modes). Already permissive in our FastAPI setup, but double-check before launch.
7. **Deep links** — register custom URL scheme `lumo://` in Xcode (Info → URL Types) and Android Studio (`<intent-filter>` in `AndroidManifest.xml`) so Stripe checkout redirects + push notifications can open the app.

---

## Local container note

This Kubernetes pod can't build iOS apps (needs macOS + Xcode) and can't run Android Studio. Do steps 2–4 above on your own machine. Everything else (web build, dev server, Capacitor config) works in this container.

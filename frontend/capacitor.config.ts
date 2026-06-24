/// <reference types="@capacitor/cli" />
// Capacitor config — wraps the Lumo React web build into native iOS + Android.
// Production: build the React app (`yarn build`), point webDir to the build/
// directory, then `npx cap copy` and open in Xcode / Android Studio.

import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.lumo.app',
  appName: 'Lumo',
  webDir: 'build',
  bundledWebRuntime: false,
  // ─────────────────────────────────────────────────────────────────────────
  // For LIVE DEV: uncomment the `server` block below + set `url` to your
  // running React dev server reachable from your phone (LAN IP, ngrok, or the
  // deployed preview). The app will live-reload against it. Comment out for
  // production builds — Capacitor will serve the bundled build/ directory.
  // ─────────────────────────────────────────────────────────────────────────
  // server: {
  //   url: 'https://lumo-bundle-checkout.preview.emergentagent.com',
  //   cleartext: false,
  //   androidScheme: 'https',
  // },
  ios: {
    contentInset: 'always',
    scheme: 'Lumo',
  },
  android: {
    allowMixedContent: false,
    captureInput: true,
    webContentsDebuggingEnabled: true,
  },
};

export default config;

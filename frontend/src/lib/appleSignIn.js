import { api } from "@/lib/api";
import { signupExtras } from "@/components/RefCapture";

const isIOSApp = () => window.Capacitor?.isNativePlatform?.() && window.Capacitor.getPlatform?.() === "ios";
const randomNonce = () => (crypto.randomUUID?.() || String(Math.random()).slice(2) + Date.now()).replace(/-/g, "");

let _cfg = null;
export async function appleConfig() {
  if (!_cfg) _cfg = api.get("/auth/apple/config").then((r) => r.data).catch(() => ({ web_enabled: false }));
  return _cfg;
}

// Apple sign-in is available in the iPhone app always, and on the website once the Services ID is set.
export async function appleAvailable() {
  if (window.Capacitor?.isNativePlatform?.()) return isIOSApp();
  return !!(await appleConfig()).web_enabled;
}

function loadAppleJs() {
  if (window.AppleID) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = "https://appleid.cdn-apple.com/appleauth/static/jsapi/appleid/1/en_US/appleid.auth.js";
    s.onload = resolve;
    s.onerror = reject;
    document.head.appendChild(s);
  });
}

async function authorize(nonce) {
  if (isIOSApp()) {
    const { SignInWithApple } = await import("@capacitor-community/apple-sign-in");
    const { response: r } = await SignInWithApple.authorize({
      clientId: "com.golumo.app", redirectURI: "https://golumo.app/signin", scopes: "email name", state: randomNonce(), nonce,
    });
    return { identity_token: r.identityToken, authorization_code: r.authorizationCode, first_name: r.givenName, last_name: r.familyName };
  }
  const cfg = await appleConfig();
  await loadAppleJs();
  window.AppleID.auth.init({ clientId: cfg.services_id, scope: "name email", redirectURI: `${window.location.origin}/signin`, state: randomNonce(), nonce, usePopup: true });
  const d = await window.AppleID.auth.signIn();
  return { identity_token: d.authorization.id_token, authorization_code: d.authorization.code, first_name: d.user?.name?.firstName, last_name: d.user?.name?.lastName };
}

// Returns the same {token, user, is_new} shape as the Google exchange.
export async function signInWithApple({ next, role } = {}) {
  const nonce = randomNonce();
  const creds = await authorize(nonce);
  const { data } = await api.post("/auth/apple", { ...creds, nonce, ...(role ? { role } : {}), ...signupExtras(next) });
  return data;
}

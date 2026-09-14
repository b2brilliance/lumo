/*
 * Push notifications helper — registers /push-sw.js and subscribes the
 * user's device to Web Push. Silently no-ops when the browser doesn't
 * support Notification / PushManager (older Safari, private mode, etc.).
 */

import { api } from "./api";

function urlBase64ToUint8Array(base64String) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = window.atob(base64);
  const output = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) output[i] = raw.charCodeAt(i);
  return output;
}

function isPushSupported() {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

async function registerSw() {
  const reg = await navigator.serviceWorker.register("/push-sw.js", { scope: "/" });
  await navigator.serviceWorker.ready;
  return reg;
}

export async function pushStatus() {
  if (!isPushSupported()) return { supported: false };
  const permission = Notification.permission;
  const reg = await navigator.serviceWorker.getRegistration("/push-sw.js");
  const sub = reg ? await reg.pushManager.getSubscription() : null;
  return { supported: true, permission, subscribed: Boolean(sub) };
}

export async function enablePush() {
  if (!isPushSupported()) return { ok: false, reason: "unsupported" };
  const permission = await Notification.requestPermission();
  if (permission !== "granted") return { ok: false, reason: "denied" };

  const { data } = await api.get("/push/public-key");
  const publicKey = data.public_key;
  const reg = await registerSw();
  let sub = await reg.pushManager.getSubscription();
  if (!sub) {
    sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(publicKey),
    });
  }
  await api.post("/push/subscribe", {
    endpoint: sub.endpoint,
    keys: {
      p256dh: btoa(String.fromCharCode(...new Uint8Array(sub.getKey("p256dh")))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, ""),
      auth:   btoa(String.fromCharCode(...new Uint8Array(sub.getKey("auth")))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, ""),
    },
  });
  return { ok: true };
}

export async function disablePush() {
  if (!isPushSupported()) return { ok: false };
  const reg = await navigator.serviceWorker.getRegistration("/push-sw.js");
  if (!reg) return { ok: true };
  const sub = await reg.pushManager.getSubscription();
  if (sub) {
    try { await api.post("/push/unsubscribe", { endpoint: sub.endpoint }); } catch (_) { /* ignore */ }
    await sub.unsubscribe();
  }
  return { ok: true };
}

/* SPA navigation on notification click */
if (typeof window !== "undefined" && "serviceWorker" in navigator) {
  navigator.serviceWorker.addEventListener?.("message", (e) => {
    if (e && e.data && e.data.type === "lumo-push-navigate" && e.data.url) {
      window.location.href = e.data.url;
    }
  });
}

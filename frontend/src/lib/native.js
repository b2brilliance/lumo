/**
 * Native-aware helpers that swap browser APIs for Capacitor native APIs
 * when the app is running inside the iOS/Android shell.
 *
 *   isNative()                 — true on real device, false in browser
 *   getCurrentPosition()       — single GPS read (works in web + native)
 *   watchPosition(callback)    — continuous GPS reads (returns a clearer fn)
 *   registerPushNotifications  — iOS/Android only; no-op on web
 *   shareLink                  — native share sheet on device, navigator.share on web
 *   initNativeShell            — call once at app boot
 */

let _cap = null;
let _geo = null;
let _push = null;
let _statusBar = null;
let _splash = null;
let _keyboard = null;
let _share = null;
let _app = null;

async function loadCap() {
  if (_cap) return _cap;
  try {
    _cap = (await import('@capacitor/core')).Capacitor;
  } catch (_) { _cap = { isNativePlatform: () => false, getPlatform: () => 'web' }; }
  return _cap;
}

export async function isNative() {
  const c = await loadCap();
  return c?.isNativePlatform?.() === true;
}

export async function getPlatform() {
  const c = await loadCap();
  return c?.getPlatform?.() || 'web';
}

// ── Geolocation ────────────────────────────────────────────────────────────
async function getGeo() {
  if (_geo) return _geo;
  try { _geo = (await import('@capacitor/geolocation')).Geolocation; }
  catch (_) { _geo = null; }
  return _geo;
}

export async function getCurrentPosition(opts = {}) {
  if (await isNative()) {
    const g = await getGeo();
    if (g) {
      const r = await g.getCurrentPosition({
        enableHighAccuracy: opts.enableHighAccuracy !== false,
        timeout: opts.timeout || 12000,
      });
      return {
        coords: {
          latitude: r.coords.latitude,
          longitude: r.coords.longitude,
          heading: r.coords.heading ?? null,
          speed: r.coords.speed ?? null,
          accuracy: r.coords.accuracy,
        },
        timestamp: r.timestamp,
      };
    }
  }
  // Web fallback
  return new Promise((resolve, reject) => {
    if (!('geolocation' in navigator)) return reject(new Error('No geolocation'));
    navigator.geolocation.getCurrentPosition(resolve, reject, {
      enableHighAccuracy: opts.enableHighAccuracy !== false,
      timeout: opts.timeout || 12000,
      maximumAge: opts.maximumAge || 60000,
    });
  });
}

/**
 * Continuous position updates. Returns a cleanup function. Works in both
 * web (navigator.geolocation.watchPosition) and native (Capacitor watcher).
 */
export async function watchPosition(callback, opts = {}) {
  if (await isNative()) {
    const g = await getGeo();
    if (g) {
      const watchId = await g.watchPosition(
        { enableHighAccuracy: opts.enableHighAccuracy !== false, timeout: opts.timeout || 15000 },
        (pos, err) => {
          if (err) return; // silent
          callback({
            coords: {
              latitude: pos.coords.latitude,
              longitude: pos.coords.longitude,
              heading: pos.coords.heading ?? null,
              speed: pos.coords.speed ?? null,
              accuracy: pos.coords.accuracy,
            },
            timestamp: pos.timestamp,
          });
        }
      );
      return () => g.clearWatch({ id: watchId });
    }
  }
  // Web fallback
  if (!('geolocation' in navigator)) return () => {};
  const id = navigator.geolocation.watchPosition(
    callback,
    () => {},
    { enableHighAccuracy: opts.enableHighAccuracy !== false, timeout: opts.timeout || 15000, maximumAge: opts.maximumAge || 8000 }
  );
  return () => navigator.geolocation.clearWatch(id);
}

// ── Push notifications (Firebase Cloud Messaging) ─────────────────────────
export async function registerPushNotifications(onToken, onTap) {
  if (!(await isNative())) return null;
  try {
    if (!_push) _push = (await import('@capacitor-firebase/messaging')).FirebaseMessaging;
    const perm = await _push.requestPermissions();
    if (perm.receive !== 'granted') return null;
    const { token } = await _push.getToken();
    if (token) onToken?.(token);
    await _push.removeAllListeners();
    _push.addListener('tokenReceived', (e) => onToken?.(e.token));
    _push.addListener('notificationActionPerformed', (e) => onTap?.(e?.notification?.data?.link));
    return _push;
  } catch (_) { return null; }
}

// ── Share sheet ────────────────────────────────────────────────────────────
export async function shareLink({ title, text, url }) {
  if (await isNative()) {
    try {
      if (!_share) _share = (await import('@capacitor/share')).Share;
      await _share.share({ title, text, url, dialogTitle: title });
      return true;
    } catch (_) { /* fall through */ }
  }
  if (navigator.share) {
    try { await navigator.share({ title, text, url }); return true; }
    catch (_) { return false; }
  }
  return false;
}

// ── Boot-time setup for the native shell ───────────────────────────────────
export async function initNativeShell() {
  if (!(await isNative())) return;
  try {
    if (!_statusBar) _statusBar = (await import('@capacitor/status-bar')).StatusBar;
    await _statusBar.setStyle({ style: 'LIGHT' });
  } catch (_) { /* status bar may not be available on all devices */ }
  try {
    if (!_splash) _splash = (await import('@capacitor/splash-screen')).SplashScreen;
    await _splash.hide();
  } catch (_) { /* no-op */ }
  try {
    if (!_keyboard) _keyboard = (await import('@capacitor/keyboard')).Keyboard;
    _keyboard.setAccessoryBarVisible({ isVisible: false }).catch(() => {});
  } catch (_) { /* no-op */ }
  // Hardware back button on Android — let the browser router handle it.
  try {
    if (!_app) _app = (await import('@capacitor/app')).App;
    _app.addListener('backButton', ({ canGoBack }) => {
      if (canGoBack) window.history.back();
    });
  } catch (_) { /* no-op */ }
}

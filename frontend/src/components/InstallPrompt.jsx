import React, { useEffect, useState } from "react";
import { X, Share, PlusSquare, Smartphone, Download, ChevronRight } from "lucide-react";

const DISMISS_KEY = "lumo_install_dismissed_at";
const DISMISS_DAYS = 14; // re-prompt after 2 weeks

function isIOS() {
  const ua = window.navigator.userAgent.toLowerCase();
  return /iphone|ipad|ipod/.test(ua) && !window.MSStream;
}
function isAndroid() {
  return /android/i.test(window.navigator.userAgent);
}
function isStandalone() {
  return window.matchMedia?.("(display-mode: standalone)").matches
    || window.navigator.standalone === true;
}
function recentlyDismissed() {
  try {
    const ts = parseInt(localStorage.getItem(DISMISS_KEY) || "0", 10);
    if (!ts) return false;
    return Date.now() - ts < DISMISS_DAYS * 24 * 60 * 60 * 1000;
  } catch { return false; }
}

export default function InstallPrompt() {
  const [deferred, setDeferred] = useState(null);  // beforeinstallprompt event for Android/Chrome
  const [chipVisible, setChipVisible] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [platform, setPlatform] = useState("other"); // ios | android | desktop | other

  useEffect(() => {
    if (isStandalone() || recentlyDismissed()) return;

    const onBeforeInstall = (e) => {
      e.preventDefault();
      setDeferred(e);
      setPlatform(isAndroid() ? "android" : "desktop");
      setChipVisible(true);
    };
    window.addEventListener("beforeinstallprompt", onBeforeInstall);

    // iOS Safari never fires beforeinstallprompt — show our manual instructions chip
    if (isIOS()) {
      setPlatform("ios");
      // Slight delay so the chip doesn't fight the page load
      const t = setTimeout(() => setChipVisible(true), 3500);
      return () => { clearTimeout(t); window.removeEventListener("beforeinstallprompt", onBeforeInstall); };
    }

    const onAppInstalled = () => { setChipVisible(false); setDeferred(null); };
    window.addEventListener("appinstalled", onAppInstalled);

    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstall);
      window.removeEventListener("appinstalled", onAppInstalled);
    };
  }, []);

  const dismiss = () => {
    try { localStorage.setItem(DISMISS_KEY, String(Date.now())); } catch { /* ignore */ }
    setChipVisible(false);
    setModalOpen(false);
  };

  const onChipClick = async () => {
    if (deferred) {
      // Android / Chromium: native prompt
      try {
        deferred.prompt();
        const choice = await deferred.userChoice;
        if (choice?.outcome === "accepted") setChipVisible(false);
        else dismiss();
        setDeferred(null);
      } catch {
        setModalOpen(true);
      }
    } else {
      // iOS or any browser without beforeinstallprompt: show instructions
      setModalOpen(true);
    }
  };

  if (!chipVisible) return null;

  return (
    <>
      {/* Floating chip — bottom-left to avoid the bottom-right Emergent badge */}
      <div
        className="fixed bottom-4 left-4 z-40 max-w-[calc(100vw-2rem)]"
        data-testid="install-prompt-chip"
      >
        <div className="flex items-center gap-2 bg-slate-900 text-white pl-3 pr-2 py-2 shadow-2xl border border-slate-800">
          <Smartphone className="w-4 h-4 text-teal-300 flex-shrink-0" />
          <button
            onClick={onChipClick}
            className="text-sm font-mono uppercase tracking-widest text-left hover:underline"
            data-testid="install-prompt-cta"
          >
            Add Lumo to Home Screen
            <ChevronRight className="w-3 h-3 inline ml-0.5 opacity-60" />
          </button>
          <button
            onClick={dismiss}
            className="ml-1 p-1 text-slate-400 hover:text-white"
            aria-label="Dismiss install prompt"
            data-testid="install-prompt-dismiss"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Manual-install instructions modal (iOS or any beforeinstallprompt-less browser) */}
      {modalOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-end md:items-center justify-center p-4"
          onClick={() => setModalOpen(false)}
          data-testid="install-prompt-modal"
        >
          <div
            className="bg-white w-full max-w-md border border-slate-200 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
              <div>
                <div className="overline text-teal-700">Faster than an app</div>
                <h3 className="font-display text-2xl font-black tracking-tight mt-1">Add Lumo to your Home Screen.</h3>
              </div>
              <button onClick={() => setModalOpen(false)} className="p-1 hover:bg-slate-100 rounded" aria-label="Close" data-testid="install-modal-close">
                <X className="w-4 h-4 text-slate-500" />
              </button>
            </div>

            <div className="px-5 py-5 space-y-4">
              {platform === "ios" ? (
                <>
                  <Step n="1" icon={<Share className="w-5 h-5 text-teal-700" />} title="Tap the Share button"
                    body="It's at the bottom of Safari — looks like a square with an arrow pointing up." />
                  <Step n="2" icon={<PlusSquare className="w-5 h-5 text-teal-700" />} title="Tap “Add to Home Screen”"
                    body="Scroll down the share sheet — it's usually in the second row of actions." />
                  <Step n="3" icon={<Smartphone className="w-5 h-5 text-teal-700" />} title="Tap “Add”"
                    body="Lumo will install as its own icon — no app store needed, no download wait." />
                </>
              ) : (
                <>
                  <Step n="1" icon={<Download className="w-5 h-5 text-teal-700" />} title="Open your browser menu"
                    body="In Chrome it's the ⋮ in the top-right. In Firefox/Edge it's the three dots." />
                  <Step n="2" icon={<PlusSquare className="w-5 h-5 text-teal-700" />} title='Tap "Install app" or "Add to Home Screen"'
                    body="It appears as an option in the menu. Some browsers say “Install Lumo”." />
                  <Step n="3" icon={<Smartphone className="w-5 h-5 text-teal-700" />} title="Confirm"
                    body="Lumo opens as a full-screen app — no browser bar, no tabs." />
                </>
              )}
              <div className="border-t border-slate-100 pt-3 mt-2">
                <p className="text-[11px] font-mono uppercase tracking-widest text-slate-500">
                  Why a Home Screen install? Faster launch · Full-screen · Notifications · Works on weak signals.
                </p>
              </div>
            </div>

            <div className="border-t border-slate-100 px-5 py-3 flex gap-2">
              <button
                onClick={() => setModalOpen(false)}
                className="flex-1 text-sm font-mono uppercase tracking-widest border border-slate-200 py-2 hover:bg-slate-50"
                data-testid="install-modal-got-it"
              >
                Got it
              </button>
              <button
                onClick={dismiss}
                className="text-xs font-mono uppercase tracking-widest text-slate-500 px-3 py-2 hover:text-slate-900"
                data-testid="install-modal-never"
              >
                Don&apos;t show again
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function Step({ n, icon, title, body }) {
  return (
    <div className="flex gap-3">
      <div className="flex-shrink-0">
        <div className="w-9 h-9 rounded-full bg-teal-50 border border-teal-200 flex items-center justify-center">
          {icon}
        </div>
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline gap-2">
          <span className="text-[10px] font-mono uppercase tracking-widest text-slate-400">Step {n}</span>
        </div>
        <div className="font-display font-bold text-sm mt-0.5">{title}</div>
        <p className="text-xs text-slate-600 mt-1 leading-relaxed">{body}</p>
      </div>
    </div>
  );
}

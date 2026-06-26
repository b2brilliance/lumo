import React, { useEffect, useState } from "react";
import { X, Share, Smartphone, Download, ArrowDown } from "lucide-react";

const DISMISS_KEY = "lumo_install_dismissed_at";
const DISMISS_DAYS = 14;

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

// Exported so other components (SiteFooter, NavBar) can trigger install too.
let _deferredEvent = null;
let _subscribers = new Set();
const broadcast = () => _subscribers.forEach((cb) => cb(_deferredEvent));

export function useInstallable() {
  const [evt, setEvt] = useState(_deferredEvent);
  useEffect(() => {
    _subscribers.add(setEvt);
    return () => { _subscribers.delete(setEvt); };
  }, []);
  return evt;
}

export async function triggerInstall(onIOSFallback) {
  if (_deferredEvent) {
    try {
      _deferredEvent.prompt();
      const choice = await _deferredEvent.userChoice;
      _deferredEvent = null;
      broadcast();
      return choice?.outcome === "accepted";
    } catch {
      return false;
    }
  }
  if (isIOS() && typeof onIOSFallback === "function") onIOSFallback();
  return false;
}

export default function InstallPrompt() {
  const [chipVisible, setChipVisible] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  // 0 unset, "android"/"desktop"/"ios"
  const [platform, setPlatform] = useState("other");

  useEffect(() => {
    if (isStandalone() || recentlyDismissed()) return;

    const onBeforeInstall = (e) => {
      e.preventDefault();
      _deferredEvent = e;
      broadcast();
      setPlatform(isAndroid() ? "android" : "desktop");
      setChipVisible(true);
    };
    window.addEventListener("beforeinstallprompt", onBeforeInstall);

    if (isIOS()) {
      setPlatform("ios");
      const t = setTimeout(() => setChipVisible(true), 3500);
      return () => { clearTimeout(t); window.removeEventListener("beforeinstallprompt", onBeforeInstall); };
    }

    const onAppInstalled = () => {
      _deferredEvent = null; broadcast();
      setChipVisible(false);
    };
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
    const installed = await triggerInstall(() => setModalOpen(true));
    if (installed) setChipVisible(false);
  };

  if (!chipVisible) return null;

  return (
    <>
      {/* One-tap install button (Android/Chrome native prompt) or iOS helper */}
      <div className="fixed bottom-4 left-4 z-40 max-w-[calc(100vw-2rem)]" data-testid="install-prompt-chip">
        <div className="flex items-center gap-2 bg-slate-900 text-white pl-3 pr-2 py-2 shadow-2xl border border-slate-800">
          <Download className="w-4 h-4 text-teal-300 flex-shrink-0" />
          <button
            onClick={onChipClick}
            className="text-sm font-display font-bold hover:underline"
            data-testid="install-prompt-cta"
          >
            Install Lumo
            <span className="text-[10px] font-mono uppercase tracking-wider text-teal-300 ml-2">
              {platform === "ios" ? "show me how" : "one tap"}
            </span>
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

      {modalOpen && <IOSInstallModal onClose={() => setModalOpen(false)} onNever={dismiss} />}
    </>
  );
}

// Compact iOS instructions — visual, only 2 steps.
export function IOSInstallModal({ onClose, onNever }) {
  return (
    <div
      className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-end md:items-center justify-center p-4"
      onClick={onClose}
      data-testid="install-prompt-modal"
    >
      <div
        className="bg-white w-full max-w-sm border border-slate-200 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <h3 className="font-display text-xl font-black tracking-tight">Two taps. Done.</h3>
          <button onClick={onClose} className="p-1 hover:bg-slate-100 rounded" aria-label="Close" data-testid="install-modal-close">
            <X className="w-4 h-4 text-slate-500" />
          </button>
        </div>

        <div className="px-5 py-6 space-y-5">
          <Step
            n="1"
            icon={<Share className="w-6 h-6 text-blue-600" />}
            title="Tap Share"
            body="The square with an arrow ↑ at the bottom of Safari."
          />
          <div className="flex justify-center text-slate-300">
            <ArrowDown className="w-4 h-4" />
          </div>
          <Step
            n="2"
            icon={<Smartphone className="w-6 h-6 text-teal-700" />}
            title="Add to Home Screen"
            body="Scroll the share menu, tap it, then tap Add. Lumo lives on your home screen like a real app."
          />
        </div>

        <div className="border-t border-slate-100 px-5 py-3 flex gap-2">
          <button
            onClick={onClose}
            className="flex-1 text-sm font-mono uppercase tracking-widest border border-slate-200 py-2 hover:bg-slate-50"
            data-testid="install-modal-got-it"
          >
            Got it
          </button>
          {onNever && (
            <button
              onClick={onNever}
              className="text-xs font-mono uppercase tracking-widest text-slate-500 px-3 py-2 hover:text-slate-900"
              data-testid="install-modal-never"
            >
              Don&apos;t show again
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function Step({ n, icon, title, body }) {
  return (
    <div className="flex gap-3 items-start">
      <div className="w-12 h-12 rounded-full bg-slate-50 border border-slate-200 flex items-center justify-center flex-shrink-0">
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-[10px] font-mono uppercase tracking-widest text-slate-400">Step {n}</div>
        <div className="font-display font-bold text-base mt-0.5">{title}</div>
        <p className="text-xs text-slate-600 mt-1 leading-relaxed">{body}</p>
      </div>
    </div>
  );
}

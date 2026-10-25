import React, { useCallback, useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import { useAppMode } from "@/lib/persona";
import { Sparkles, X } from "lucide-react";
import { useAuth } from "@/lib/auth";
import GuidePanel from "@/components/guide/GuidePanel";
import useExitIntent from "@/components/guide/useExitIntent";

const CHOICE_KEY = "lumo_guide_choice";
const EXIT_KEY = "lumo_guide_exit_shown";
const HIDDEN_ON = ["/admin", "/reset", "/signin", "/login", "/register", "/checkout"];

function GuidePrompt({ variant, onYes, onNo }) {
  return (
    <div className="fixed bottom-20 md:bottom-6 right-4 md:right-6 z-[1200] w-[320px] max-w-[calc(100vw-2rem)] bg-white rounded-3xl border border-slate-200 shadow-2xl p-5 animate-in fade-in slide-in-from-bottom-4 duration-300" data-testid="guide-prompt" data-variant={variant}>
      <button onClick={onNo} className="absolute top-2 right-2 text-slate-400 hover:text-slate-900" aria-label="Close" data-testid="guide-prompt-close"><X className="w-4 h-4" /></button>
      <div className="flex items-center gap-2"><Sparkles className="w-4 h-4 text-teal-600" /><span className="font-display font-bold">{variant === "exit" ? "Before you go…" : "Want a guide?"}</span></div>
      <p className="text-sm text-slate-600 mt-1">{variant === "exit" ? "Tell Lumi what you were looking for." : "Lumi can point you to the right place."}</p>
      <div className="flex gap-2 mt-3">
        <button onClick={onYes} className="flex-1 rounded-full bg-slate-900 text-white text-sm font-medium py-2 hover:bg-slate-800 transition-colors" data-testid="guide-prompt-yes">Yes, guide me</button>
        <button onClick={onNo} className="flex-1 rounded-full border border-slate-200 text-sm py-2 hover:border-slate-900 transition-colors" data-testid="guide-prompt-no">No thanks</button>
      </div>
    </div>
  );
}

export default function AssistantWidget() {
  const { user, loading } = useAuth();
  const { pathname } = useLocation();
  const [open, setOpen] = useState(false);
  const [prompt, setPrompt] = useState(null);
  const app = useAppMode();
  const hidden = HIDDEN_ON.some((p) => pathname.startsWith(p)) || (app && (pathname === "/" || pathname.startsWith("/start") || pathname === "/signin" || pathname === "/register"));

  useEffect(() => {
    const onOpen = () => { setPrompt(null); setOpen(true); };
    window.addEventListener("lumo:open-guide", onOpen);
    return () => window.removeEventListener("lumo:open-guide", onOpen);
  }, []);

  useEffect(() => {
    if (app || loading || hidden || pathname.startsWith("/help") || localStorage.getItem(CHOICE_KEY)) return undefined;
    const t = setTimeout(() => setPrompt((p) => p || "first"), 2500);
    return () => clearTimeout(t);
  }, [app, loading, hidden, pathname]);

  const onExit = useCallback(() => {
    if (sessionStorage.getItem(EXIT_KEY)) return;
    sessionStorage.setItem(EXIT_KEY, "1");
    setPrompt("exit");
  }, []);
  useExitIntent(onExit, { enabled: !app && !hidden && !open && !prompt && !pathname.startsWith("/help") });

  if (hidden) return null;

  const yes = () => { localStorage.setItem(CHOICE_KEY, "yes"); setPrompt(null); setOpen(true); };
  const no = () => { if (!localStorage.getItem(CHOICE_KEY)) localStorage.setItem(CHOICE_KEY, "no"); setPrompt(null); };

  if (open) return <GuidePanel user={user || null} path={pathname} onClose={() => setOpen(false)} />;
  if (prompt) return <GuidePrompt variant={prompt} onYes={yes} onNo={no} />;
  return (
    <button
      onClick={() => setOpen(true)}
      className="fixed bottom-20 md:bottom-6 right-4 md:right-6 z-[1200] h-12 md:h-14 px-5 md:px-6 rounded-full bg-slate-900 text-white hover:bg-slate-800 hover:scale-[1.03] transition-[transform,background-color] flex items-center gap-2 shadow-lg"
      data-testid="assistant-open"
    >
      <Sparkles className="w-4 h-4 text-teal-300" />
      <span className="font-display font-bold">Ask Lumi</span>
    </button>
  );
}

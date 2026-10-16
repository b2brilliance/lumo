import React, { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Sparkles, X, RotateCcw, Send, ArrowUpRight } from "lucide-react";
import { api, formatApiError } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const GREETING = { role: "assistant", content: "Hi, I'm Lumi. What are you looking for today?" };
const STARTERS = ["I need help at home", "I want to earn money", "Find a place to rent", "Sell something"];
const SS_KEY = "lumo_guide_msgs";

function Bubble({ m, onLink }) {
  const mine = m.role === "user";
  return (
    <div className={`flex flex-col ${mine ? "items-end" : "items-start"}`}>
      <div className={`max-w-[85%] px-3 py-2 text-sm leading-snug whitespace-pre-wrap ${mine ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-900"}`}>{m.content}</div>
      {m.links?.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mt-1.5 max-w-[90%]">
          {m.links.map((l) => (
            <Link key={l.path} to={l.path} onClick={onLink}
                  className="inline-flex items-center gap-1 border border-slate-900 bg-white px-2.5 py-1 text-xs font-medium hover:bg-slate-900 hover:text-white transition-colors"
                  data-testid="guide-link">
              {l.label}<ArrowUpRight className="w-3 h-3" />
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

export default function GuidePanel({ user, path, onClose }) {
  const [messages, setMessages] = useState(() => {
    if (user) return [GREETING];
    try { return JSON.parse(sessionStorage.getItem(SS_KEY)) || [GREETING]; } catch { return [GREETING]; }
  });
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const scrollRef = useRef(null);

  useEffect(() => {
    if (!user) return;
    api.get("/assistant/history").then(({ data }) => {
      if (data.messages?.length) setMessages([GREETING, ...data.messages]);
    }).catch(() => {});
  }, [user]);

  useEffect(() => {
    if (!user) sessionStorage.setItem(SS_KEY, JSON.stringify(messages.slice(-20)));
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, user]);

  const send = async (text) => {
    const msg = (text ?? input).trim();
    if (!msg || busy) return;
    const history = messages.filter((m) => m !== GREETING);
    setMessages((m) => [...m, { role: "user", content: msg }]);
    setInput("");
    setBusy(true);
    try {
      const { data } = await api.post("/guide/chat", { message: msg, history, path });
      setMessages((m) => [...m, { role: "assistant", content: data.reply, links: data.links }]);
    } catch (e) {
      setMessages((m) => [...m, { role: "assistant", content: `Sorry — ${formatApiError(e)}` }]);
    } finally { setBusy(false); }
  };

  const clear = async () => {
    if (user) { try { await api.post("/assistant/clear"); } catch { /* ignore */ } }
    sessionStorage.removeItem(SS_KEY);
    setMessages([GREETING]);
  };

  return (
    <div className="fixed bottom-20 md:bottom-6 right-4 md:right-6 z-[1200] w-[380px] max-w-[calc(100vw-2rem)] h-[540px] max-h-[calc(100vh-7rem)] bg-white border border-slate-900 shadow-2xl flex flex-col" data-testid="assistant-panel">
      <div className="px-4 py-3 flex items-center gap-2 bg-slate-900 text-white">
        <Sparkles className="w-4 h-4 text-teal-300" />
        <div className="font-display font-bold">Lumi</div>
        <button onClick={clear} className="ml-auto text-slate-400 hover:text-white" title="Start over" data-testid="assistant-clear"><RotateCcw className="w-4 h-4" /></button>
        <button onClick={onClose} className="text-slate-400 hover:text-white" data-testid="assistant-close"><X className="w-4 h-4" /></button>
      </div>
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-3" data-testid="assistant-messages">
        {messages.map((m, i) => <Bubble key={i} m={m} onLink={onClose} />)}
        {messages.length === 1 && (
          <div className="flex flex-wrap gap-1.5" data-testid="guide-starters">
            {STARTERS.map((s) => (
              <button key={s} onClick={() => send(s)} className="text-xs border border-slate-200 px-2.5 py-1 hover:border-slate-900 transition-colors">{s}</button>
            ))}
          </div>
        )}
        {busy && <div className="bg-slate-100 text-slate-500 px-3 py-2 text-sm font-mono w-fit">Lumi is typing…</div>}
      </div>
      <form onSubmit={(e) => { e.preventDefault(); send(); }} className="border-t border-slate-200 p-3 flex gap-2" data-testid="assistant-form">
        <Input value={input} onChange={(e) => setInput(e.target.value)} placeholder="Type what you need…" disabled={busy} data-testid="assistant-input" />
        <Button type="submit" disabled={busy || !input.trim()} className="bg-slate-900 hover:bg-slate-800" data-testid="assistant-send"><Send className="w-4 h-4" /></Button>
      </form>
    </div>
  );
}

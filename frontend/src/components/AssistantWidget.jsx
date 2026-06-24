import React, { useEffect, useRef, useState } from "react";
import { api, formatApiError } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/lib/auth";
import { Sparkles, X, RotateCcw, Send } from "lucide-react";

const INITIAL_PROMPT = "Hi! I'm Lumi — your Lumo assistant. Ask me anything about posting a request, getting quotes, payment terms, deliveries, or how to use any part of the app.";

export default function AssistantWidget() {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState([{ role: "assistant", content: INITIAL_PROMPT }]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const scrollRef = useRef(null);

  useEffect(() => {
    if (!user || user === false) return;
    api.get("/assistant/history").then(({ data }) => {
      if (data.messages && data.messages.length > 0) {
        setMessages([{ role: "assistant", content: INITIAL_PROMPT }, ...data.messages]);
      }
    }).catch(() => {});
  }, [user]);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, open]);

  if (!user || user === false) return null;

  const send = async (e) => {
    e?.preventDefault();
    if (!input.trim() || busy) return;
    const userMsg = { role: "user", content: input };
    setMessages((m) => [...m, userMsg]);
    setInput("");
    setBusy(true);
    try {
      const { data } = await api.post("/assistant/chat", { message: userMsg.content });
      setMessages((m) => [...m, { role: "assistant", content: data.reply }]);
    } catch (e) {
      setMessages((m) => [...m, { role: "assistant", content: `Sorry — ${formatApiError(e)}` }]);
    } finally { setBusy(false); }
  };

  const clear = async () => {
    try { await api.post("/assistant/clear"); } catch {}
    setMessages([{ role: "assistant", content: INITIAL_PROMPT }]);
  };

  return (
    <>
      {!open && (
        <button
          onClick={() => setOpen(true)}
          className="fixed bottom-6 right-6 z-40 h-14 px-5 bg-slate-900 text-white border border-slate-900 hover:bg-slate-800 transition-colors flex items-center gap-2 shadow-lg"
          data-testid="assistant-open"
        >
          <Sparkles className="w-4 h-4 text-teal-300" />
          <span className="font-display font-bold">Ask Lumi</span>
        </button>
      )}
      {open && (
        <div className="fixed bottom-6 right-6 z-40 w-[380px] max-w-[calc(100vw-2rem)] h-[560px] max-h-[calc(100vh-3rem)] bg-white border border-slate-200 shadow-2xl flex flex-col" data-testid="assistant-panel">
          <div className="px-4 py-3 border-b border-slate-200 flex items-center gap-2 bg-slate-900 text-white">
            <Sparkles className="w-4 h-4 text-teal-300" />
            <div className="font-display font-bold">Lumi · AI assistant</div>
            <button onClick={clear} className="ml-auto text-slate-400 hover:text-white" title="Clear conversation" data-testid="assistant-clear">
              <RotateCcw className="w-4 h-4" />
            </button>
            <button onClick={() => setOpen(false)} className="text-slate-400 hover:text-white" data-testid="assistant-close">
              <X className="w-4 h-4" />
            </button>
          </div>
          <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-3 scrollbar-thin" data-testid="assistant-messages">
            {messages.map((m, i) => (
              <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                <div className={`max-w-[85%] px-3 py-2 text-sm leading-snug whitespace-pre-wrap ${m.role === "user" ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-900"}`}>
                  {m.content}
                </div>
              </div>
            ))}
            {busy && (
              <div className="flex justify-start">
                <div className="bg-slate-100 text-slate-500 px-3 py-2 text-sm font-mono">Lumi is typing…</div>
              </div>
            )}
          </div>
          <form onSubmit={send} className="border-t border-slate-200 p-3 flex gap-2" data-testid="assistant-form">
            <Input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask anything about Lumo…"
              disabled={busy}
              data-testid="assistant-input"
            />
            <Button type="submit" disabled={busy || !input.trim()} className="bg-teal-700 hover:bg-teal-800" data-testid="assistant-send">
              <Send className="w-4 h-4" />
            </Button>
          </form>
        </div>
      )}
    </>
  );
}

import React, { useEffect, useRef, useState } from "react";
import { api, formatApiError } from "@/lib/api";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Sparkles, Send, Loader2, ArrowRight } from "lucide-react";
import { toast } from "sonner";

/**
 * AiServiceCopilot — a short chat modal that helps the user describe what
 * they need and routes them into the right /order/<service> page.
 *
 * Props:
 *   onClose(): closes the modal
 *   onPick(serviceKey, prefill): called when the LLM pins down a category
 *
 * Public endpoint — works for signed-out users too.
 */

const INTRO = "Tell me what you need help with — I'll ask a couple of quick questions and route you to the right pro.";
const EXAMPLES = [
  "I need a notary to come to my house Sunday",
  "My dishwasher is leaking",
  "Hire a CDL driver for a 2-day haul",
  "Someone to help on a short film shoot",
  "A dog walker weekday mornings",
];

export default function AiServiceCopilot({ onClose, onPick }) {
  const [sessionId] = useState(() => {
    const existing = typeof window !== "undefined" ? localStorage.getItem("lumo_copilot_sid") : null;
    if (existing) return existing;
    const sid = `copilot-${Math.random().toString(36).slice(2)}-${Date.now()}`;
    try { localStorage.setItem("lumo_copilot_sid", sid); } catch {}
    return sid;
  });
  const [messages, setMessages] = useState([
    { role: "assistant", content: INTRO },
  ]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [pick, setPick] = useState(null);
  const scrollRef = useRef(null);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, sending]);

  const send = async (text) => {
    const message = (text ?? input).trim();
    if (!message || sending) return;
    setInput("");
    setMessages((prev) => [...prev, { role: "user", content: message }]);
    setSending(true);
    try {
      const { data } = await api.post("/service-copilot", {
        session_id: sessionId,
        message,
        history: messages,
      });
      setMessages((prev) => [...prev, { role: "assistant", content: data.reply || "" }]);
      if (data.pick) setPick({ ...data.pick, prefill: message });
    } catch (err) {
      toast.error(formatApiError(err));
    } finally { setSending(false); }
  };

  const confirmPick = () => {
    if (!pick) return;
    onPick?.(pick.service_key, pick.prefill);
  };

  return (
    <Dialog open onOpenChange={(v) => !v && onClose?.()}>
      <DialogContent className="max-w-lg p-0 overflow-hidden" data-testid="ai-copilot">
        <DialogHeader className="px-5 pt-5 pb-3 border-b border-slate-100">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gradient-to-br from-fuchsia-500 to-indigo-600 flex items-center justify-center">
              <Sparkles className="w-5 h-5 text-white" />
            </div>
            <div>
              <DialogTitle className="font-display text-lg font-black tracking-tight">Ask Lumo</DialogTitle>
              <DialogDescription className="text-xs">Describe it however you want — I'll figure out the rest.</DialogDescription>
            </div>
          </div>
        </DialogHeader>

        {/* Messages */}
        <div ref={scrollRef} className="max-h-[55vh] overflow-y-auto px-5 py-4 space-y-3 bg-slate-50" data-testid="ai-copilot-messages">
          {messages.map((m, i) => (
            <div
              key={i}
              className={`max-w-[85%] px-3 py-2 text-sm whitespace-pre-wrap ${m.role === "assistant" ? "bg-white border border-slate-200 text-slate-900" : "bg-slate-900 text-white ml-auto"}`}
              data-testid={`ai-msg-${m.role}-${i}`}
            >
              {m.content}
            </div>
          ))}
          {sending && (
            <div className="max-w-[85%] px-3 py-2 text-sm bg-white border border-slate-200 inline-flex items-center gap-2 text-slate-500">
              <Loader2 className="w-3.5 h-3.5 animate-spin" /> thinking…
            </div>
          )}
          {messages.length === 1 && !sending && (
            <div className="pt-1" data-testid="ai-copilot-examples">
              <div className="text-[10px] font-mono uppercase tracking-widest text-slate-500 mb-2">try one of these</div>
              <div className="grid gap-1.5">
                {EXAMPLES.map((ex, i) => (
                  <button
                    key={i}
                    onClick={() => send(ex)}
                    className="text-left bg-white border border-slate-200 hover:border-slate-900 px-3 py-2 text-xs"
                    data-testid={`ai-example-${i}`}
                  >
                    {ex}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Pick confirmation banner */}
        {pick && (
          <div className="px-5 py-3 border-t border-emerald-200 bg-emerald-50 flex items-center justify-between gap-3" data-testid="ai-copilot-pick">
            <div className="text-xs text-emerald-900">
              <div className="font-mono uppercase tracking-widest text-[10px] text-emerald-700">suggested</div>
              <div className="font-bold">{pick.bucket} · {pick.service_key}</div>
            </div>
            <Button
              size="sm"
              onClick={confirmPick}
              className="bg-emerald-700 hover:bg-emerald-800 text-white"
              data-testid="ai-copilot-confirm"
            >
              Continue <ArrowRight className="w-3.5 h-3.5 ml-1" />
            </Button>
          </div>
        )}

        {/* Composer */}
        <form
          onSubmit={(e) => { e.preventDefault(); send(); }}
          className="px-5 py-3 border-t border-slate-100 bg-white flex gap-2"
          data-testid="ai-copilot-form"
        >
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Reply here…"
            className="flex-1 border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:border-slate-900"
            disabled={sending}
            data-testid="ai-copilot-input"
            autoFocus
          />
          <Button
            type="submit"
            disabled={sending || !input.trim()}
            className="bg-slate-900 hover:bg-slate-800 text-white"
            data-testid="ai-copilot-send"
          >
            {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

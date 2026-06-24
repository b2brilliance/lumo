import React, { useEffect, useRef, useState } from "react";
import { api, formatApiError } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { ShieldCheck, Send, Info } from "lucide-react";
import { useAuth } from "@/lib/auth";

export default function ChatPanel({ jobId, threadProviderId = null, compact = false }) {
  const { user } = useAuth();
  const [messages, setMessages] = useState([]);
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const lastTsRef = useRef(null);
  const scrollRef = useRef(null);

  const load = async (incremental = false) => {
    try {
      const params = new URLSearchParams();
      if (incremental && lastTsRef.current) params.set("since", lastTsRef.current);
      if (threadProviderId) params.set("thread_provider_id", threadProviderId);
      const { data } = await api.get(`/jobs/${jobId}/messages?${params.toString()}`);
      if (data.length > 0) {
        lastTsRef.current = data[data.length - 1].created_at;
        setMessages((prev) => {
          if (!incremental) return data;
          const ids = new Set(prev.map((m) => m.id));
          return [...prev, ...data.filter((d) => !ids.has(d.id))];
        });
      }
      setError(null);
    } catch (e) {
      setError(formatApiError(e));
    }
  };

  useEffect(() => {
    lastTsRef.current = null;
    setMessages([]);
    load(false);
    const t = setInterval(() => load(true), 3000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobId, threadProviderId]);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages.length]);

  const send = async (e) => {
    e?.preventDefault();
    if (!body.trim()) return;
    setBusy(true);
    try {
      const payload = { body };
      if (threadProviderId) payload.thread_provider_id = threadProviderId;
      const { data } = await api.post(`/jobs/${jobId}/messages`, payload);
      setMessages((prev) => [...prev, data]);
      lastTsRef.current = data.created_at;
      setBody("");
      if (data.redacted) {
        toast.warning("Some content was redacted to keep contact info on-platform.");
      }
    } catch (e) {
      toast.error(formatApiError(e));
    } finally { setBusy(false); }
  };

  if (error) return (
    <div className="border border-slate-200 p-4 text-sm text-slate-500" data-testid="chat-panel-error">
      {error}
    </div>
  );

  return (
    <div className="border border-slate-200 flex flex-col" style={{ height: compact ? 420 : 520 }} data-testid="chat-panel">
      <div className="px-4 py-3 border-b border-slate-200 flex items-center gap-2 bg-slate-50">
        <ShieldCheck className="w-4 h-4 text-teal-700" />
        <div className="overline">Job chat</div>
        <div className="ml-auto text-[10px] font-mono text-slate-400 flex items-center gap-1">
          <Info className="w-3 h-3" /> Phone, email, links & off-platform contacts are auto-hidden
        </div>
      </div>
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-3 scrollbar-thin" data-testid="chat-messages">
        {messages.length === 0 && (
          <div className="text-center text-sm text-slate-400 mt-12">
            No messages yet. Say hi 👋
          </div>
        )}
        {messages.map((m) => {
          const mine = m.sender_id === user.id;
          return (
            <div key={m.id} className={`flex ${mine ? "justify-end" : "justify-start"}`} data-testid={`chat-msg-${m.id}`}>
              <div className={`max-w-[78%] ${mine ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-900"} px-3 py-2`}>
                {!mine && (
                  <div className="text-[10px] font-mono uppercase tracking-widest opacity-70 mb-1">
                    {m.sender_name} · {m.sender_role}
                  </div>
                )}
                <div className="text-sm whitespace-pre-wrap leading-snug">{m.body}</div>
                <div className={`text-[10px] mt-1 font-mono ${mine ? "text-slate-400" : "text-slate-500"}`}>
                  {new Date(m.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                  {m.redacted && <span className="ml-2 text-amber-600">redacted</span>}
                </div>
              </div>
            </div>
          );
        })}
      </div>
      <form onSubmit={send} className="border-t border-slate-200 p-3 flex gap-2" data-testid="chat-form">
        <Input
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Type a message…"
          disabled={busy}
          data-testid="chat-input"
        />
        <Button type="submit" disabled={busy || !body.trim()} className="bg-teal-700 hover:bg-teal-800" data-testid="chat-send">
          <Send className="w-4 h-4" />
        </Button>
      </form>
    </div>
  );
}

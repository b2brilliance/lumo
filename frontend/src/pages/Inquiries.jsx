import React, { useEffect, useState, useRef } from "react";
import { Link, useParams, useNavigate } from "react-router-dom";
import { api, formatApiError } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/lib/auth";
import { toast } from "sonner";
import { MessageSquare, Send, ArrowLeft } from "lucide-react";

const formatTime = (iso) => {
  try { return new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }); }
  catch { return iso; }
};

function InquiriesList() {
  const { user } = useAuth();
  const [inquiries, setInquiries] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get("/inquiries").then(({ data }) => { setInquiries(data); setLoading(false); }).catch(() => setLoading(false));
  }, []);

  if (loading) return <div className="p-12 text-slate-500 font-mono text-sm">Loading…</div>;

  return (
    <div className="max-w-4xl mx-auto px-6 py-8" data-testid="inquiries-page">
      <p className="text-[11px] font-mono tracking-[0.2em] text-slate-500 uppercase">Lumo · Inbox</p>
      <h1 className="font-display text-3xl sm:text-4xl font-black tracking-tight">Marketplace Inquiries</h1>
      <p className="text-slate-600 mt-1 text-sm">Conversations about your listings, and listings you've inquired about. Contact info stays masked.</p>

      <div className="mt-6 divide-y divide-slate-200 border-y border-slate-200" data-testid="inquiries-list">
        {inquiries.length === 0 ? (
          <div className="py-16 text-center text-slate-500 font-mono text-sm">
            <MessageSquare className="w-8 h-8 mx-auto mb-2 opacity-40" />
            No inquiries yet. Browse <Link className="underline" to="/real-estate">Real Estate</Link> or <Link className="underline" to="/autos">Auto Sales</Link> to start a conversation.
          </div>
        ) : (
          inquiries.map((inq) => {
            const isBuyer = user?.id === inq.buyer_id;
            const unread = isBuyer ? inq.buyer_unread_count : inq.seller_unread_count;
            const other = isBuyer ? inq.seller_name : inq.buyer_name;
            return (
              <Link key={inq.id} to={`/inquiries/${inq.id}`} className="block py-4 px-2 hover:bg-slate-50 transition-colors" data-testid={`inquiry-row-${inq.id}`}>
                <div className="flex justify-between items-start gap-3">
                  <div className="min-w-0">
                    <div className="font-display font-bold truncate">{inq.listing_title}</div>
                    <div className="text-xs text-slate-500 mt-0.5">
                      {isBuyer ? "Seller" : "Buyer"}: <span className="font-medium">{other}</span> · {inq.listing_kind === "real_estate" ? "Real Estate" : "Auto Sales"}
                    </div>
                  </div>
                  <div className="text-right text-xs text-slate-500 flex-shrink-0">
                    <div className="font-mono">{formatTime(inq.last_message_at)}</div>
                    {unread > 0 && <span className="inline-block mt-1 bg-teal-700 text-white text-[10px] px-1.5 py-0.5 rounded-full font-mono">{unread} new</span>}
                  </div>
                </div>
              </Link>
            );
          })
        )}
      </div>
    </div>
  );
}

function InquiryThread() {
  const { id } = useParams();
  const nav = useNavigate();
  const { user } = useAuth();
  const [data, setData] = useState(null);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const endRef = useRef(null);

  const load = async () => {
    try { const { data } = await api.get(`/inquiries/${id}`); setData(data); }
    catch { setData(false); }
  };

  useEffect(() => { load(); }, [id]);
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [data?.messages?.length]);

  // Poll for new messages every 5s
  useEffect(() => {
    const t = setInterval(load, 5000);
    return () => clearInterval(t);
  }, [id]);

  if (data === null) return <div className="p-12 text-slate-500 font-mono text-sm">Loading…</div>;
  if (data === false) return <div className="p-12 text-slate-500 font-mono text-sm">Inquiry not found.</div>;

  const { inquiry, messages } = data;
  const isBuyer = user?.id === inquiry.buyer_id;
  const listingLink = inquiry.listing_kind === "real_estate" ? `/real-estate/${inquiry.listing_id}` : `/autos/${inquiry.listing_id}`;

  const send = async (e) => {
    e?.preventDefault?.();
    if (!text.trim()) return;
    setSending(true);
    try {
      await api.post(`/inquiries/${id}/messages`, { text: text.trim() });
      setText("");
      await load();
    } catch (e) { toast.error(formatApiError(e)); }
    finally { setSending(false); }
  };

  return (
    <div className="max-w-3xl mx-auto px-6 py-8 flex flex-col h-[calc(100vh-3.5rem)]" data-testid="inquiry-thread-page">
      <div className="flex items-start gap-3 mb-4">
        <Button variant="ghost" size="sm" onClick={() => nav("/inquiries")} data-testid="inquiry-back"><ArrowLeft className="w-4 h-4 mr-1" />Inbox</Button>
        <div className="min-w-0 flex-1">
          <Link to={listingLink} className="font-display font-bold text-lg truncate block hover:underline">{inquiry.listing_title}</Link>
          <div className="text-xs text-slate-500">
            {isBuyer ? `Talking to seller ${inquiry.seller_name}` : `Talking to buyer ${inquiry.buyer_name}`} · contact masked
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto border border-slate-200 p-3 space-y-3 bg-slate-50" data-testid="inquiry-messages">
        {messages.map((m) => {
          const mine = m.sender_id === user?.id;
          return (
            <div key={m.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
              <div className={`max-w-[78%] px-3 py-2 text-sm ${mine ? "bg-slate-900 text-white" : "bg-white border border-slate-200"}`}>
                <div className="whitespace-pre-wrap">{m.text}</div>
                <div className={`text-[10px] font-mono mt-1 ${mine ? "text-slate-300" : "text-slate-400"}`}>{formatTime(m.created_at)}</div>
              </div>
            </div>
          );
        })}
        <div ref={endRef} />
      </div>

      <form onSubmit={send} className="mt-3 flex gap-2" data-testid="inquiry-compose">
        <Input data-testid="inquiry-input" placeholder="Type a message…" value={text} onChange={(e) => setText(e.target.value)} disabled={sending} />
        <Button type="submit" className="bg-slate-900 hover:bg-slate-800" disabled={sending || !text.trim()} data-testid="inquiry-send">
          <Send className="w-4 h-4" />
        </Button>
      </form>
    </div>
  );
}

export default function Inquiries() {
  const { id } = useParams();
  return id ? <InquiryThread /> : <InquiriesList />;
}

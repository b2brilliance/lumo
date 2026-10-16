import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { MessageSquare, Briefcase, Home } from "lucide-react";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";

const when = (iso) => (iso ? new Date(iso).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }) : "");

function Row({ to, Icon, title, sub, at, unread, testid }) {
  return (
    <Link to={to} className="flex items-center gap-4 p-4 hover:bg-slate-50 transition-colors" data-testid={testid}>
      <Icon className="w-4 h-4 text-slate-400 shrink-0" />
      <div className="flex-1 min-w-0">
        <div className={`font-display truncate ${unread ? "font-black" : "font-bold"}`}>{title}</div>
        <div className="text-sm text-slate-600 truncate mt-0.5">{sub}</div>
      </div>
      <div className="flex flex-col items-end gap-1">
        <div className="text-xs font-mono text-slate-400 whitespace-nowrap">{when(at)}</div>
        {unread > 0 && <span className="min-w-[18px] h-[18px] px-1 rounded-full bg-red-600 text-white text-[10px] font-bold flex items-center justify-center">{unread}</span>}
      </div>
    </Link>
  );
}

export default function ChatsInbox() {
  const { user } = useAuth();
  const [threads, setThreads] = useState(null);
  const [inquiries, setInquiries] = useState(null);
  const [limit, setLimit] = useState(30);

  useEffect(() => {
    api.get("/chats/inbox").then(({ data }) => setThreads(data)).catch(() => setThreads([]));
    api.get("/inquiries").then(({ data }) => setInquiries(data)).catch(() => setInquiries([]));
    api.post("/me/messages/seen").catch(() => {});
  }, []);

  const rows = [
    ...(threads || []).map((t) => ({
      key: `j-${t.job_id}-${t.thread_provider_id}`, to: `/jobs/${t.job_id}`, Icon: Briefcase,
      title: t.job_title || "Job", sub: `${t.last_sender}: ${t.last_message}`, at: t.last_at, unread: 0,
      testid: `inbox-thread-${t.job_id}-${t.thread_provider_id}`,
    })),
    ...(inquiries || []).map((q) => {
      const buyer = q.buyer_id === user?.id;
      return {
        key: `i-${q.id}`, to: `/inquiries/${q.id}`, Icon: q.listing_kind === "real_estate" ? Home : MessageSquare,
        title: q.listing_title || "Listing", sub: buyer ? `with ${q.seller_name || "owner"}` : `from ${q.buyer_name || "buyer"}`,
        at: q.last_message_at || q.created_at, unread: (buyer ? q.buyer_unread_count : q.seller_unread_count) || 0,
        testid: `inbox-inquiry-${q.id}`,
      };
    }),
  ].sort((a, b) => (b.at || "").localeCompare(a.at || ""));
  const loading = threads === null || inquiries === null;

  return (
    <div className="max-w-screen-md mx-auto px-4 sm:px-6 py-8 pb-24" data-testid="messages-page">
      <h1 className="font-display text-4xl font-black tracking-tighter">Messages</h1>
      <div className="mt-6 border border-slate-200 divide-y divide-slate-200" data-testid="chats-inbox-list">
        {loading && <div className="p-8 text-sm text-slate-500 font-mono">Loading…</div>}
        {!loading && rows.length === 0 && (
          <div className="p-8 text-sm text-slate-500 flex items-center gap-2" data-testid="messages-empty"><MessageSquare className="w-4 h-4" /> No conversations yet.</div>
        )}
        {rows.slice(0, limit).map(({ key, ...r }) => <Row key={key} {...r} />)}
      </div>
      {rows.length > limit && (
        <button onClick={() => setLimit((l) => l + 30)} className="mt-3 w-full border border-slate-200 py-2 text-xs font-mono uppercase tracking-widest hover:border-slate-900" data-testid="messages-show-more">
          Show more ({rows.length - limit})
        </button>
      )}
    </div>
  );
}

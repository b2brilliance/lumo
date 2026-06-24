import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "@/lib/api";
import { MessageSquare } from "lucide-react";

export default function ChatsInbox() {
  const [threads, setThreads] = useState([]);

  useEffect(() => {
    api.get("/chats/inbox").then(({ data }) => setThreads(data));
  }, []);

  return (
    <div className="max-w-screen-md mx-auto px-6 py-10">
      <div className="overline">Messages</div>
      <h1 className="font-display text-4xl font-black tracking-tighter mt-2">Your chats.</h1>
      <p className="text-slate-600 mt-2 text-sm">
        All conversations are job-scoped. Contact info stays on-platform.
      </p>
      <div className="mt-6 border border-slate-200 divide-y divide-slate-200" data-testid="chats-inbox-list">
        {threads.length === 0 && (
          <div className="p-8 text-sm text-slate-500 flex items-center gap-2">
            <MessageSquare className="w-4 h-4" /> No conversations yet.
          </div>
        )}
        {threads.map((t) => (
          <Link
            key={`${t.job_id}-${t.thread_provider_id}`}
            to={`/jobs/${t.job_id}`}
            className="flex items-center gap-4 p-4 hover:bg-slate-50"
            data-testid={`inbox-thread-${t.job_id}-${t.thread_provider_id}`}
          >
            <div className="flex-1 min-w-0">
              <div className="font-display font-bold truncate">{t.job_title || "Job"}</div>
              <div className="text-sm text-slate-600 truncate mt-0.5">{t.last_sender}: {t.last_message}</div>
            </div>
            <div className="text-xs font-mono text-slate-400 whitespace-nowrap">
              {new Date(t.last_at).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}

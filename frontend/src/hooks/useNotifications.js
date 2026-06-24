import { useEffect, useRef } from "react";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";

const TYPE_VARIANT = {
  quote_accepted: "success",
  quote_declined: "warning",
  default: "info",
};

/**
 * Subscribes a logged-in user to notification toasts.
 * - Initial fetch sets baseline of seen ids (no spam on mount)
 * - Polls every `intervalMs` for new notifications (created_at > lastTs)
 */
export default function useNotifications({ enabled = true, intervalMs = 15000 } = {}) {
  const seen = useRef(new Set());
  const lastTs = useRef(null);
  const nav = useNavigate();

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;

    const initial = async () => {
      try {
        const { data } = await api.get("/notifications");
        data.forEach((n) => seen.current.add(n.id));
        if (data.length > 0) lastTs.current = data[0].created_at;
        else lastTs.current = new Date().toISOString();
      } catch (_) { /* ignore */ }
    };

    const tick = async () => {
      try {
        const since = lastTs.current || new Date(0).toISOString();
        const { data } = await api.get(`/notifications?since=${encodeURIComponent(since)}`);
        if (cancelled) return;
        const fresh = data.filter((n) => !seen.current.has(n.id));
        fresh.forEach((n) => seen.current.add(n.id));
        if (fresh.length > 0) lastTs.current = fresh[0].created_at;
        fresh.forEach((n) => {
          const variant = TYPE_VARIANT[n.type] || TYPE_VARIANT.default;
          const opts = {
            description: n.body,
            duration: 9000,
            action: n.link ? { label: "Open", onClick: () => { nav(n.link); api.post(`/notifications/${n.id}/read`).catch(() => {}); } } : undefined,
            id: `notif-${n.id}`,
          };
          if (variant === "success") toast.success(n.title, opts);
          else if (variant === "warning") toast.warning(n.title, opts);
          else toast(n.title, opts);
        });
      } catch (_) { /* ignore */ }
    };

    initial();
    const t = setInterval(tick, intervalMs);
    return () => { cancelled = true; clearInterval(t); };
  }, [enabled, intervalMs, nav]);
}

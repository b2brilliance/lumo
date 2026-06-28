import { useEffect, useRef } from "react";
import { useLocation } from "react-router-dom";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useLocale } from "@/lib/locale";

const SESSION_KEY = "lumo_pv_session";

function getSessionId() {
  try {
    let s = localStorage.getItem(SESSION_KEY);
    if (!s) {
      s = (crypto?.randomUUID?.() || Math.random().toString(36).slice(2)) + Date.now().toString(36);
      localStorage.setItem(SESSION_KEY, s);
    }
    return s;
  } catch { return "anon-" + Date.now(); }
}

/**
 * Fires a single pageview ping per route change. Mounted once at the App root.
 * Fully anonymous unless the user is signed in — we only attach user_id when
 * the AuthProvider has resolved a session.
 */
export default function PageviewPinger() {
  const loc = useLocation();
  const { user } = useAuth();
  const { country } = useLocale();
  const lastPath = useRef(null);

  useEffect(() => {
    const path = loc.pathname || "/";
    if (lastPath.current === path) return;
    lastPath.current = path;
    api.post("/analytics/pageview", {
      session_id: getSessionId(),
      path,
      referrer: document.referrer || null,
      user_id: (user && user.id) || null,
      country_hint: country || null,
    }).catch(() => { /* ignore — analytics is best-effort */ });
  }, [loc.pathname, user, country]);

  return null;
}

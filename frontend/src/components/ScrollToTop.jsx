import { useEffect } from "react";
import { useLocation } from "react-router-dom";

/* ScrollToTop — Every React Router client-side navigation preserves the
 * previous scroll position by default. That's fine for back-button flows,
 * but painful for footer link clicks: users tap "About" from the footer
 * and land halfway down the About page. This component listens for path
 * changes and scrolls the window back to the top on every new route.
 *
 * We keep scroll position on hash changes (anchor links inside a page)
 * and on "back/forward" navigation (POP) so browser history still feels
 * natural. */
export default function ScrollToTop() {
  const { pathname, hash } = useLocation();

  useEffect(() => {
    if (hash) return; // let anchor links resolve normally
    // Only jump to top for PUSH/REPLACE navigations. POP (back/forward)
    // is left to the browser's restored scroll behaviour.
    const nav = window.performance?.getEntriesByType?.("navigation")?.[0];
    if (nav && nav.type === "back_forward") return;
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
  }, [pathname, hash]);

  return null;
}

import { useEffect } from "react";

// Calls onExit once when the visitor looks like they're leaving:
// desktop → cursor exits through the top edge; touch → fast upward flick back to the top.
export default function useExitIntent(onExit, { enabled, armAfterMs = 15000 }) {
  useEffect(() => {
    if (!enabled) return undefined;
    let armed = false;
    let fired = false;
    const fire = () => { if (armed && !fired) { fired = true; onExit(); } };
    const armTimer = setTimeout(() => { armed = true; }, armAfterMs);

    const onMouseOut = (e) => { if (!e.relatedTarget && e.clientY <= 0) fire(); };
    let lastY = window.scrollY;
    let lastT = performance.now();
    const onScroll = () => {
      const y = window.scrollY;
      const t = performance.now();
      const v = (lastY - y) / Math.max(t - lastT, 1);
      if (v > 2.5 && y < 200 && lastY > 600) fire();
      lastY = y; lastT = t;
    };
    document.addEventListener("mouseout", onMouseOut);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      clearTimeout(armTimer);
      document.removeEventListener("mouseout", onMouseOut);
      window.removeEventListener("scroll", onScroll);
    };
  }, [enabled, onExit, armAfterMs]);
}

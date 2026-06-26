import { useEffect } from "react";
import { useAuth } from "@/lib/auth";

/**
 * Applies user.accessibility_prefs as <html> classes globally so the
 * preferences take effect on every page (not just Settings).
 */
export default function AccessibilityApplier() {
  const { user } = useAuth();
  useEffect(() => {
    const prefs = (user && user.accessibility_prefs) || {};
    document.documentElement.classList.toggle("reduce-motion", !!prefs.reduce_motion);
    document.documentElement.classList.toggle("larger-text", !!prefs.larger_text);
  }, [user]);
  return null;
}

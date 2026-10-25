import React, { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";

const KEY = "lumo_splash_seen";

// Short "you're in the app" intro, once per app launch.
export default function SplashIntro() {
  const [show, setShow] = useState(() => {
    try { return !sessionStorage.getItem(KEY); } catch { return false; }
  });
  useEffect(() => {
    if (!show) return undefined;
    try { sessionStorage.setItem(KEY, "1"); } catch { /* noop */ }
    const t = setTimeout(() => setShow(false), 2200);
    return () => clearTimeout(t);
  }, [show]);

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          className="fixed inset-0 z-[3000] bg-slate-950 flex flex-col items-center justify-center overflow-hidden"
          initial={{ opacity: 1 }} exit={{ opacity: 0, scale: 1.04 }} transition={{ duration: 0.45 }}
          onClick={() => setShow(false)} data-testid="app-splash"
        >
          <motion.div
            className="absolute w-[140vmax] h-[140vmax] rounded-full bg-gradient-to-tr from-amber-500 via-rose-500 to-indigo-600 opacity-30 blur-3xl"
            initial={{ scale: 0.2, rotate: 0 }} animate={{ scale: 1, rotate: 90 }} transition={{ duration: 2.2, ease: "easeOut" }}
          />
          <motion.div className="relative flex items-center gap-1" initial="h" animate="v"
            variants={{ v: { transition: { staggerChildren: 0.09, delayChildren: 0.2 } } }}>
            {"Lumo".split("").map((ch, i) => (
              <motion.span key={i} className="font-display font-black text-white text-7xl tracking-tighter"
                variants={{ h: { y: 40, opacity: 0 }, v: { y: 0, opacity: 1, transition: { type: "spring", damping: 12 } } }}>
                {ch}
              </motion.span>
            ))}
          </motion.div>
          <motion.div className="relative mt-4 h-1 rounded-full bg-white/80" initial={{ width: 0 }} animate={{ width: 120 }}
            transition={{ delay: 0.7, duration: 1.1, ease: "easeInOut" }} />
          <motion.p className="relative mt-5 text-white/70 text-sm tracking-wide" initial={{ opacity: 0 }} animate={{ opacity: 1 }}
            transition={{ delay: 1.1 }}>
            Everything local, in one app
          </motion.p>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

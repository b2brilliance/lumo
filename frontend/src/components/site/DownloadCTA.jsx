import React from "react";
import { motion } from "framer-motion";
import { StoreBadges } from "@/components/site/DownloadButtons";

export const DownloadCTA = ({ title = "Get Lumo on your phone", sub = "Free on iPhone and Android. Order, earn, sell or find a home in minutes.", prefix = "cta" }) => (
  <section className="px-4 sm:px-6 lg:px-8 py-20">
    <motion.div initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.5 }}
      className="relative max-w-7xl mx-auto overflow-hidden rounded-[32px] bg-slate-950 text-white px-8 py-14 sm:px-14 sm:py-20" data-testid={`${prefix}-banner`}>
      <div className="absolute -right-24 -top-24 w-[420px] h-[420px] rounded-full bg-gradient-to-tr from-amber-500 via-rose-500 to-indigo-600 opacity-40 blur-3xl" />
      <div className="relative max-w-2xl">
        <h2 className="font-display font-bold tracking-tight text-3xl sm:text-4xl lg:text-5xl leading-[1.05]">{title}</h2>
        <p className="mt-4 text-base sm:text-lg text-white/70">{sub}</p>
        <div className="mt-10"><StoreBadges dark prefix={prefix} /></div>
      </div>
    </motion.div>
  </section>
);

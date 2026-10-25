import React from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { ShoppingBag, HardHat, Store, Building2, Apple, Play } from "lucide-react";

const IOS_URL = process.env.REACT_APP_IOS_APP_URL;
const ANDROID_URL = process.env.REACT_APP_ANDROID_APP_URL;

const TYPES = [
  { Icon: ShoppingBag, t: "Customers", b: "Order from restaurants, food trucks and shops for pickup or delivery, or book a local pro for cleaning, repairs, moving and more." },
  { Icon: HardHat, t: "Workers", b: "Pick up delivery runs and service jobs near you. Set your own hours, keep 90% of every job and get paid the same day." },
  { Icon: Store, t: "Sellers", b: "Restaurants, food trucks, stores and people selling their own things get a free shop with photos, a menu or catalog, and orders." },
  { Icon: Building2, t: "Real estate", b: "List homes for sale and long-term rentals free. Short-term rentals pay a small 5% commission per booking." },
];

function StoreBadge({ href, Icon, top, name, testid }) {
  const cls = "inline-flex items-center gap-3 h-14 px-5 rounded-2xl bg-white text-slate-950 active:scale-95 transition-transform";
  const body = (<><Icon className="w-6 h-6" /><span className="text-left leading-tight"><span className="block text-[10px] uppercase tracking-wider text-slate-500">{top}</span><span className="block font-semibold">{name}</span></span></>);
  return href
    ? <a href={href} target="_blank" rel="noreferrer" className={cls} data-testid={testid}>{body}</a>
    : <span className={`${cls} opacity-90`} title="Coming soon" data-testid={testid}>{body}</span>;
}

export default function WebsiteHome() {
  return (
    <div className="bg-slate-950 text-white" data-testid="website-landing">
      <section className="relative overflow-hidden">
        <div className="absolute -top-40 -right-40 w-[700px] h-[700px] rounded-full bg-gradient-to-tr from-amber-500 via-rose-500 to-indigo-600 opacity-25 blur-3xl" />
        <div className="relative max-w-6xl mx-auto px-6 sm:px-10 py-24 lg:py-32">
          <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }}>
            <div className="text-xs uppercase tracking-[0.25em] text-white/50 font-mono">The Lumo app</div>
            <h1 className="font-display font-black tracking-tight text-4xl sm:text-5xl lg:text-6xl leading-[1.02] mt-5 max-w-3xl">
              Food, products, local help and places to live. One app.
            </h1>
            <p className="mt-6 text-lg text-white/70 max-w-xl">Order, earn, sell or find a home. Everyone gets their own Lumo, built for what they came to do.</p>
            <div className="mt-10 flex flex-wrap gap-3" data-testid="landing-download">
              <StoreBadge href={IOS_URL} Icon={Apple} top="Download on the" name="App Store" testid="landing-ios" />
              <StoreBadge href={ANDROID_URL} Icon={Play} top="Get it on" name="Google Play" testid="landing-android" />
            </div>
            {!(IOS_URL && ANDROID_URL) && <p className="mt-3 text-xs text-white/40" data-testid="landing-coming-soon">Coming soon to the App Store and Google Play.</p>}
          </motion.div>
        </div>
      </section>
      <section className="bg-white text-slate-950">
        <div className="max-w-6xl mx-auto px-6 sm:px-10 py-20">
          <div className="text-xs uppercase tracking-[0.25em] text-slate-500 font-mono">Four ways to use Lumo</div>
          <div className="grid sm:grid-cols-2 gap-5 mt-8">
            {TYPES.map(({ Icon, t, b }, i) => (
              <motion.div key={t} initial={{ opacity: 0, y: 16 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: i * 0.08 }}
                className="p-7 rounded-3xl border border-slate-200" data-testid={`landing-type-${i}`}>
                <Icon className="w-7 h-7" />
                <div className="font-display font-bold text-2xl mt-5">{t}</div>
                <p className="text-slate-600 mt-2 leading-relaxed">{b}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>
      <section className="bg-slate-50 text-slate-950">
        <div className="max-w-6xl mx-auto px-6 sm:px-10 py-20 grid lg:grid-cols-2 gap-12">
          <div>
            <div className="text-xs uppercase tracking-[0.25em] text-slate-500 font-mono">Simple, fair pricing</div>
            <h2 className="font-display font-bold text-3xl mt-4">No subscriptions. No hidden fees.</h2>
          </div>
          <ul className="space-y-4 text-slate-700" data-testid="landing-pricing">
            <li><b>Pickup orders:</b> a 5% service fee on the items.</li>
            <li><b>Delivery orders:</b> 5% plus a delivery fee based on distance and how big the order is. Drivers keep 90% of it.</li>
            <li><b>Workers:</b> keep 90% of every job, paid the same day.</li>
            <li><b>Real estate:</b> sales and long-term rentals are free to list. Short-term rentals pay 5% per booking.</li>
          </ul>
        </div>
      </section>
      <section className="max-w-6xl mx-auto px-6 sm:px-10 py-16 flex flex-wrap items-center justify-between gap-6">
        <div className="font-display text-2xl font-bold">Want to earn with Lumo?</div>
        <div className="flex gap-3">
          <Link to="/join" className="h-12 px-6 rounded-full bg-white text-slate-950 font-semibold inline-flex items-center" data-testid="landing-join">Become a worker</Link>
          <Link to="/recruiter" className="h-12 px-6 rounded-full border border-white/30 font-semibold inline-flex items-center" data-testid="landing-recruit">Recruit and earn</Link>
        </div>
      </section>
    </div>
  );
}

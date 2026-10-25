import React from "react";
import { MapPin, Star, Clock, Bed, Bath, Package, TrendingUp, Bell } from "lucide-react";

const Row = ({ title, sub, right, tint }) => (
  <div className="flex items-center gap-3 p-2.5 rounded-2xl bg-slate-50">
    <div className="w-10 h-10 rounded-xl shrink-0" style={{ background: tint }} />
    <div className="min-w-0 flex-1">
      <div className="text-[12px] font-semibold truncate">{title}</div>
      <div className="text-[10px] text-slate-500 truncate">{sub}</div>
    </div>
    <div className="text-[11px] font-semibold">{right}</div>
  </div>
);

const Head = ({ kicker, title, accent }) => (
  <div className="px-4 pt-9 pb-3">
    <div className="text-[10px] font-mono uppercase tracking-widest" style={{ color: accent }}>{kicker}</div>
    <div className="font-display font-bold text-[17px] leading-tight mt-1">{title}</div>
  </div>
);

function CustomerScreen() {
  return (<>
    <Head kicker="Deliver to · Home" title="What are you craving?" accent="#2563EB" />
    <div className="px-4 flex gap-1.5 text-[10px] font-medium">{["Food", "Shops", "Pros", "Groceries"].map((c, i) => <span key={c} className={`px-2.5 py-1 rounded-full ${i ? "bg-slate-100" : "bg-slate-900 text-white"}`}>{c}</span>)}</div>
    <div className="m-4 rounded-2xl h-24 bg-gradient-to-br from-amber-400 to-rose-500 p-3 text-white flex flex-col justify-end"><div className="text-[10px] opacity-90">Popular near you</div><div className="font-semibold text-sm">Rosa's Taqueria</div><div className="text-[10px] flex items-center gap-1"><Star className="w-3 h-3" /> 4.9 · 12 min · 1.4 mi</div></div>
    <div className="px-4 space-y-2"><Row title="Green Bowl Kitchen" sub="0.8 mi · Delivery $3.40" right="$12" tint="#BBF7D0" /><Row title="Home cleaning" sub="Maria · 4.9 · 120 jobs" right="$35/h" tint="#BFDBFE" /><Row title="Corner Market" sub="Pickup in 10 min" right="$8" tint="#FDE68A" /></div>
  </>);
}

function WorkerScreen() {
  return (<>
    <Head kicker="You're online" title="Today: $148.20" accent="#059669" />
    <div className="mx-4 rounded-2xl bg-emerald-600 text-white p-3"><div className="text-[10px] opacity-80 flex items-center gap-1"><Bell className="w-3 h-3" /> New delivery run</div><div className="font-semibold text-sm mt-1">Green Bowl → 2.1 mi</div><div className="flex justify-between items-end mt-2"><div className="text-[10px] opacity-90 flex items-center gap-1"><Clock className="w-3 h-3" /> ~14 min</div><div className="font-display font-bold text-lg">$9.45</div></div><div className="mt-2 bg-white text-emerald-700 text-center text-[11px] font-semibold rounded-full py-1.5">Accept</div></div>
    <div className="px-4 mt-3 space-y-2"><Row title="Move a sofa" sub="1.2 mi · Tomorrow 10am" right="$60" tint="#A7F3D0" /><Row title="Yard cleanup" sub="3.0 mi · Sat" right="$85" tint="#D9F99D" /></div>
    <div className="mx-4 mt-3 p-3 rounded-2xl bg-slate-50 flex items-center justify-between"><div className="text-[10px] text-slate-500">You keep</div><div className="font-display font-bold text-emerald-700">90%</div></div>
  </>);
}

function SellerScreen() {
  return (<>
    <Head kicker="Rosa's Taqueria" title="3 new orders" accent="#D97706" />
    <div className="mx-4 grid grid-cols-2 gap-2"><div className="rounded-2xl bg-amber-50 p-3"><TrendingUp className="w-4 h-4 text-amber-600" /><div className="font-display font-bold mt-1">$1,284</div><div className="text-[10px] text-slate-500">This week</div></div><div className="rounded-2xl bg-slate-50 p-3"><Package className="w-4 h-4 text-slate-700" /><div className="font-display font-bold mt-1">42</div><div className="text-[10px] text-slate-500">Orders</div></div></div>
    <div className="px-4 mt-3 space-y-2"><Row title="#1042 · 3 items" sub="Delivery · driver 4 min away" right="$31" tint="#FED7AA" /><Row title="#1041 · 1 item" sub="Pickup · ready" right="$9" tint="#FDE68A" /><Row title="Carnitas taco" sub="Stock: 24 left" right="$4" tint="#FECACA" /></div>
  </>);
}

function EstateScreen() {
  return (<>
    <Head kicker="Buy · Rent · Stay" title="Homes near you" accent="#7C3AED" />
    <div className="mx-4 rounded-2xl overflow-hidden bg-slate-100"><div className="h-24 bg-gradient-to-br from-violet-300 via-indigo-200 to-sky-200 relative"><span className="absolute top-2 left-2 bg-white text-[9px] font-semibold px-2 py-0.5 rounded-full">For rent</span></div><div className="p-3"><div className="font-semibold text-sm">$1,850 / month</div><div className="text-[10px] text-slate-500 flex items-center gap-2 mt-0.5"><Bed className="w-3 h-3" /> 2 <Bath className="w-3 h-3" /> 1 · 940 sq ft</div><div className="text-[10px] text-slate-500 flex items-center gap-1 mt-0.5"><MapPin className="w-3 h-3" /> Maple Ave · 1.1 mi</div></div></div>
    <div className="px-4 mt-3 space-y-2"><Row title="Lake view studio" sub="Short stay · 4.8" right="$92/n" tint="#DDD6FE" /><Row title="3 bed family home" sub="For sale · 1,900 sq ft" right="$389k" tint="#C7D2FE" /></div>
  </>);
}

const SCREENS = { customer: CustomerScreen, worker: WorkerScreen, seller: SellerScreen, estate: EstateScreen };

export const PhoneFrame = ({ screen = "customer", className = "" }) => {
  const Screen = SCREENS[screen];
  return (
    <div className={`relative mx-auto w-[280px] sm:w-[300px] ${className}`} data-testid={`phone-mockup-${screen}`}>
      <div className="absolute -inset-6 bg-gradient-to-tr from-amber-400/25 via-rose-400/25 to-indigo-500/25 rounded-[64px] blur-2xl -z-10" />
      <div className="aspect-[9/19] rounded-[46px] border-[9px] border-slate-900 bg-slate-900 shadow-2xl shadow-slate-900/30 overflow-hidden">
        <div className="relative w-full h-full rounded-[37px] bg-white overflow-hidden text-slate-900">
          <div className="absolute top-2.5 left-1/2 -translate-x-1/2 h-5 w-24 bg-slate-900 rounded-full z-10" />
          <Screen />
          <div className="absolute bottom-0 inset-x-0 h-16 border-t border-slate-100 bg-white/95 flex justify-around items-center px-4">
            {[0, 1, 2, 3].map((i) => <span key={i} className={`h-1.5 rounded-full ${i ? "w-5 bg-slate-200" : "w-8 bg-slate-900"}`} />)}
          </div>
        </div>
      </div>
    </div>
  );
};

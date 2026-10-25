import React, { useEffect, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { Play, QrCode } from "lucide-react";
import { api } from "@/lib/api";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

let _links = null;
export function useStoreLinks() {
  const [links, setLinks] = useState({ ios: "", android: "" });
  useEffect(() => {
    if (!_links) _links = api.get("/site/social").then(({ data }) => ({ ios: data.ios_app_url || "", android: data.android_app_url || "" })).catch(() => ({ ios: "", android: "" }));
    _links.then(setLinks);
  }, []);
  return links;
}

export const AppleIcon = ({ className }) => (
  <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden><path d="M16.4 12.7c0-2.4 2-3.6 2.1-3.7-1.1-1.7-2.9-1.9-3.5-1.9-1.5-.2-2.9.9-3.7.9-.8 0-1.9-.9-3.2-.8-1.6 0-3.1 1-4 2.4-1.7 3-.4 7.4 1.2 9.8.8 1.2 1.8 2.5 3 2.4 1.2 0 1.7-.8 3.1-.8 1.5 0 1.9.8 3.2.8 1.3 0 2.2-1.2 3-2.4.9-1.4 1.3-2.7 1.3-2.8 0 0-2.5-1-2.5-3.9zM14 5.4c.7-.8 1.1-1.9 1-3-1 0-2.1.7-2.8 1.5-.6.7-1.2 1.8-1 2.9 1.1.1 2.1-.6 2.8-1.4z" /></svg>
);

function Badge({ href, Icon, top, name, testid, dark }) {
  const cls = `group inline-flex items-center gap-3 h-14 pl-4 pr-6 rounded-2xl transition-transform duration-200 hover:-translate-y-0.5 active:scale-95 ${dark ? "bg-white text-slate-950" : "bg-slate-950 text-white"}`;
  const body = (<><Icon className="w-7 h-7" /><span className="text-left leading-tight"><span className={`block text-[10px] uppercase tracking-wider ${dark ? "text-slate-500" : "text-white/60"}`}>{top}</span><span className="block font-semibold text-[17px]">{name}</span></span></>);
  return href
    ? <a href={href} target="_blank" rel="noreferrer" className={cls} data-testid={testid}>{body}</a>
    : <span className={`${cls} opacity-60 cursor-default`} title="Coming soon" data-testid={testid}>{body}</span>;
}

export const DownloadQR = ({ dark, testid = "download-qr-btn" }) => (
  <Popover>
    <PopoverTrigger asChild>
      <button className={`hidden md:inline-flex items-center gap-2 h-14 px-5 rounded-2xl border transition-colors ${dark ? "border-white/25 text-white hover:bg-white/10" : "border-slate-300 text-slate-900 hover:border-slate-900"}`} data-testid={testid}>
        <QrCode className="w-5 h-5" /> <span className="text-sm font-semibold">Scan to get the app</span>
      </button>
    </PopoverTrigger>
    <PopoverContent className="w-64 p-5 rounded-3xl text-center" data-testid={`${testid}-panel`}>
      <QRCodeSVG value="https://golumo.app/download" size={176} className="mx-auto" />
      <div className="mt-3 text-sm font-semibold">Point your phone camera here</div>
      <div className="text-xs text-slate-500 mt-1">It opens the right store for your phone.</div>
    </PopoverContent>
  </Popover>
);

export const StoreBadges = ({ dark = false, qr = true, prefix = "download" }) => {
  const { ios, android } = useStoreLinks();
  return (
    <div className="flex flex-wrap items-center gap-3" data-testid={`${prefix}-badges`}>
      <Badge href={ios} Icon={AppleIcon} top="Download on the" name="App Store" testid={`${prefix}-ios`} dark={dark} />
      <Badge href={android} Icon={Play} top="Get it on" name="Google Play" testid={`${prefix}-android`} dark={dark} />
      {qr && <DownloadQR dark={dark} testid={`${prefix}-qr`} />}
    </div>
  );
};

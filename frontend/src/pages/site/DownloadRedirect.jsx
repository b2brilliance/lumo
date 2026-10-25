import React, { useEffect, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { useStoreLinks, StoreBadges } from "@/components/site/DownloadButtons";

// Smart link: golumo.app/download opens the right store for the visitor's phone.
export default function DownloadRedirect() {
  const { ios, android } = useStoreLinks();
  const [tried, setTried] = useState(false);
  useEffect(() => {
    const ua = navigator.userAgent || "";
    const isIOS = /iPhone|iPad|iPod/i.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
    const target = isIOS ? ios : /Android/i.test(ua) ? android : "";
    if (target) window.location.replace(target);
    else if (ios || android) setTried(true);
  }, [ios, android]);
  return (
    <div className="min-h-[70vh] bg-white text-slate-950 grid place-items-center px-6 py-20" data-testid="download-page">
      <div className="text-center max-w-md">
        <h1 className="font-display font-bold tracking-tight text-4xl sm:text-5xl">Get the Lumo app</h1>
        <p className="mt-4 text-slate-600">{tried ? "Scan with your phone camera, or pick your store below." : "Opening your app store…"}</p>
        <QRCodeSVG value="https://golumo.app/download" size={180} className="mx-auto mt-10" data-testid="download-page-qr" />
        <div className="mt-10 flex justify-center"><StoreBadges qr={false} prefix="download-page" /></div>
      </div>
    </div>
  );
}

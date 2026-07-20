import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import {
  Instagram, Youtube, Facebook, Linkedin, Twitch, MessageCircle, Download, ShieldCheck,
} from "lucide-react";
import { triggerInstall, useInstallable, IOSInstallModal } from "@/components/InstallPrompt";

/* Lucide doesn't ship icons for every brand we want, so we render some
 * platforms with inline SVGs. Each one is a 16×16 outline. */
const TikTokIcon = (p) => (
  <svg viewBox="0 0 24 24" fill="currentColor" {...p}>
    <path d="M19.6 6.7a5.6 5.6 0 0 1-3.3-1.2 5.6 5.6 0 0 1-2.1-3.5h-3.4v13.8c0 1.5-1.3 2.7-2.8 2.7s-2.8-1.2-2.8-2.7 1.3-2.7 2.8-2.7c.3 0 .6 0 .9.1V9.8a6.4 6.4 0 0 0-.9-.1A6.1 6.1 0 0 0 1.9 16a6.1 6.1 0 0 0 6.1 6.1A6.1 6.1 0 0 0 14.1 16V9.5a8.9 8.9 0 0 0 5.5 1.9V8.1a5.6 5.6 0 0 1 0-1.4z" />
  </svg>
);
const XIcon = (p) => (
  <svg viewBox="0 0 24 24" fill="currentColor" {...p}>
    <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
  </svg>
);
const ThreadsIcon = (p) => (
  <svg viewBox="0 0 24 24" fill="currentColor" {...p}>
    <path d="M17.5 11.4c-.1-.04-.1-.07-.2-.1-.1-2-1.2-3.1-3-3.2-1.1 0-2 .4-2.6 1.3l1 .7c.4-.7 1-1 1.7-1 .8 0 1.5.3 1.7 1.3-.5-.1-1-.2-1.6-.2-1.6.1-2.6 1-2.6 2.4 0 1.3 1 2.2 2.4 2.2 1.2 0 2.2-.4 2.7-1.3.5.6 1 1 1.7 1l.7-1c-1-.2-1.6-.7-1.9-1.4.5-.4.8-1 .8-1.7v-.3M14.5 14c-.6 0-1.2-.3-1.2-1 0-.5.5-.9 1.3-.9.4 0 .8 0 1.2.2 0 1.1-.8 1.7-1.3 1.7m-2.5 6.5c-4.7 0-9-3.8-9-8.5s4.3-8.5 9-8.5 9 3.8 9 8.5-4.3 8.5-9 8.5m0-17C7 3.5 2 8.4 2 12s5 8.5 10 8.5 10-4.9 10-8.5S17 3.5 12 3.5" />
  </svg>
);
const PinterestIcon = (p) => (
  <svg viewBox="0 0 24 24" fill="currentColor" {...p}>
    <path d="M12 2C6.5 2 2 6.5 2 12c0 4.2 2.6 7.8 6.3 9.3-.1-.8-.2-2 0-2.8.2-.8 1.2-5 1.2-5s-.3-.6-.3-1.5c0-1.4.8-2.4 1.8-2.4.9 0 1.3.7 1.3 1.4 0 .9-.6 2.2-.9 3.4-.2 1 .5 1.9 1.5 1.9 1.8 0 3.2-1.9 3.2-4.7 0-2.4-1.8-4.2-4.4-4.2-3 0-4.7 2.2-4.7 4.5 0 .9.3 1.8.8 2.4.1.1.1.2.1.3l-.4 1.4c-.1.2-.2.3-.4.2-1.4-.7-2.3-2.7-2.3-4.4 0-3.6 2.6-6.9 7.5-6.9 4 0 7 2.8 7 6.6 0 4-2.5 7.2-5.9 7.2-1.2 0-2.2-.6-2.6-1.3l-.7 2.7c-.2 1-1 2.3-1.5 3 1.1.3 2.4.6 3.7.6 5.5 0 10-4.5 10-10S17.5 2 12 2" />
  </svg>
);
const SnapchatIcon = (p) => (
  <svg viewBox="0 0 24 24" fill="currentColor" {...p}>
    <path d="M12 2C8.7 2 6 4.6 6 7.8v3.3c-.5.2-1 .4-1.2.7-.2.3-.4.7-.3 1 .1.4.5.5.9.5.5.5.8 1.1 1.1 1.7.3.6.6 1.2 1 1.6.4.4.9.6 1.7.7.2 0 .4.5.6.8.3.4.7.7 1.2.8.2.1.4.1.5.1.5 0 1.1-.2 1.5-.2.4 0 1 .2 1.5.2.2 0 .3 0 .5-.1.5-.1.9-.4 1.2-.8.2-.3.4-.7.6-.8.8-.1 1.3-.3 1.7-.7.4-.4.7-1 1-1.6.3-.6.6-1.2 1.1-1.7.4-.1.7-.2.8-.5.1-.3 0-.7-.2-1-.3-.3-.7-.5-1.2-.7V7.8C18 4.6 15.3 2 12 2z" />
  </svg>
);
const DiscordIcon = (p) => (
  <svg viewBox="0 0 24 24" fill="currentColor" {...p}>
    <path d="M19.27 5.33A18.4 18.4 0 0 0 14.69 4l-.23.41a17 17 0 0 0-4.92 0L9.3 4a18.36 18.36 0 0 0-4.58 1.33A17.5 17.5 0 0 0 1.7 16.5a18.5 18.5 0 0 0 5.6 2.8l1.1-1.7a12 12 0 0 1-1.7-.8l.4-.3a14.4 14.4 0 0 0 9.8 0l.4.3a13 13 0 0 1-1.7.8l1.1 1.7a18.4 18.4 0 0 0 5.6-2.8 17.5 17.5 0 0 0-3-11.2zM8.5 14.3c-1 0-1.9-1-1.9-2.2s.8-2.2 1.9-2.2 1.9 1 1.9 2.2-.8 2.2-1.9 2.2zm7 0c-1 0-1.9-1-1.9-2.2s.8-2.2 1.9-2.2 1.9 1 1.9 2.2-.9 2.2-1.9 2.2z" />
  </svg>
);
const RedditIcon = (p) => (
  <svg viewBox="0 0 24 24" fill="currentColor" {...p}>
    <path d="M22 12c0-1.4-1.1-2.5-2.5-2.5-.7 0-1.3.3-1.7.7-1.6-1-3.7-1.6-5.9-1.7l1-3.2 2.7.7c0 1 .9 1.9 1.9 1.9s1.9-.8 1.9-1.9-.8-1.9-1.9-1.9c-.7 0-1.3.4-1.7 1L13 4.1c-.1 0-.2 0-.3.1l-1.5 4.4c-2.4 0-4.6.6-6.3 1.7-.4-.4-1-.7-1.7-.7C1.8 9.6.7 10.7.7 12.1c0 1 .5 1.8 1.4 2.2 0 .2-.1.5-.1.7 0 3.5 4.1 6.3 9.2 6.3s9.2-2.8 9.2-6.3c0-.2 0-.5-.1-.7.9-.4 1.4-1.2 1.4-2.2zm-14.5 1.5c0-.9.8-1.7 1.7-1.7s1.7.8 1.7 1.7-.8 1.7-1.7 1.7-1.7-.8-1.7-1.7zm10.4 4.4c-1.2 1.2-3.5 1.3-4.2 1.3s-3-.1-4.2-1.3c-.2-.2-.2-.5 0-.7s.5-.2.7 0c.7.7 2.3 1 3.5 1s2.7-.3 3.5-1c.2-.2.5-.2.7 0s.2.5 0 .7zm-.1-2.6c-.9 0-1.7-.8-1.7-1.7s.8-1.7 1.7-1.7 1.7.8 1.7 1.7-.8 1.7-1.7 1.7z" />
  </svg>
);
const WhatsAppIcon = (p) => (
  <svg viewBox="0 0 24 24" fill="currentColor" {...p}>
    <path d="M17.5 14.4c-.3-.1-1.7-.8-2-1-.3-.1-.5-.1-.7.1-.2.3-.7 1-.9 1.2-.2.2-.3.2-.6.1-.3-.1-1.2-.5-2.3-1.5-.9-.8-1.4-1.7-1.6-2-.2-.3 0-.5.1-.6.1-.1.3-.3.4-.5.1-.2.2-.3.3-.5.1-.2 0-.4 0-.5s-.7-1.7-1-2.3c-.3-.6-.5-.5-.7-.5h-.6c-.2 0-.5.1-.8.4-.3.3-1 1-1 2.5s1.1 2.9 1.2 3.1c.1.2 2.1 3.2 5.1 4.5.7.3 1.3.5 1.7.6.7.2 1.4.2 1.9.1.6-.1 1.7-.7 1.9-1.4.2-.7.2-1.3.2-1.4-.1-.1-.3-.2-.6-.3M12 2C6.5 2 2 6.5 2 12c0 1.7.4 3.4 1.3 4.9L2 22l5.2-1.3c1.4.8 3.1 1.2 4.8 1.2 5.5 0 10-4.5 10-10S17.5 2 12 2z" />
  </svg>
);
const TelegramIcon = (p) => (
  <svg viewBox="0 0 24 24" fill="currentColor" {...p}>
    <path d="M9.78 18.65l.28-4.23 7.68-6.92c.34-.31-.07-.46-.52-.19L7.74 13.3 3.64 12c-.88-.25-.89-.86.2-1.3l15.97-6.16c.73-.33 1.43.18 1.15 1.3l-2.72 12.81c-.19.91-.74 1.13-1.5.71L12.6 16.3l-1.99 1.93c-.23.23-.42.42-.83.42z" />
  </svg>
);

// Map of platform key → {label, Icon, brand color}
const PLATFORM_META = {
  instagram: { label: "Instagram",  Icon: Instagram,     color: "#E4405F" },
  tiktok:    { label: "TikTok",     Icon: TikTokIcon,    color: "#000000" },
  youtube:   { label: "YouTube",    Icon: Youtube,       color: "#FF0000" },
  facebook:  { label: "Facebook",   Icon: Facebook,      color: "#1877F2" },
  twitter:   { label: "X (Twitter)", Icon: XIcon,        color: "#000000" },
  threads:   { label: "Threads",    Icon: ThreadsIcon,   color: "#000000" },
  linkedin:  { label: "LinkedIn",   Icon: Linkedin,      color: "#0A66C2" },
  pinterest: { label: "Pinterest",  Icon: PinterestIcon, color: "#BD081C" },
  snapchat:  { label: "Snapchat",   Icon: SnapchatIcon,  color: "#FFFC00" },
  discord:   { label: "Discord",    Icon: DiscordIcon,   color: "#5865F2" },
  reddit:    { label: "Reddit",     Icon: RedditIcon,    color: "#FF4500" },
  whatsapp:  { label: "WhatsApp",   Icon: WhatsAppIcon,  color: "#25D366" },
  telegram:  { label: "Telegram",   Icon: TelegramIcon,  color: "#26A5E4" },
  twitch:    { label: "Twitch",     Icon: Twitch,        color: "#9146FF" },
};

export { PLATFORM_META };

export default function SiteFooter() {
  const { user } = useAuth();
  const [social, setSocial] = useState({ links: {}, tagline: "" });
  const [iosModalOpen, setIosModalOpen] = useState(false);
  const installable = useInstallable();
  const isStandalone = typeof window !== "undefined" && (
    window.matchMedia?.("(display-mode: standalone)").matches
    || window.navigator.standalone === true
  );
  const isIOS = typeof window !== "undefined" && /iphone|ipad|ipod/i.test(window.navigator.userAgent);

  useEffect(() => {
    (async () => {
      try {
        const { data } = await api.get("/site/social");
        setSocial(data || { links: {}, tagline: "" });
      } catch {
        // Silent — footer is best-effort
      }
    })();
  }, []);

  const activeLinks = Object.entries(social.links || {}).filter(([, url]) => !!url);
  const hasLinks = activeLinks.length > 0;
  const year = new Date().getFullYear();

  return (
    <footer
      className="border-t border-slate-200 bg-slate-50 mt-auto"
      data-testid="site-footer"
    >
      <div className="max-w-7xl mx-auto px-6 py-10">
        <div className="grid grid-cols-1 md:grid-cols-12 gap-8 items-start">
          {/* Brand + tagline */}
          <div className="md:col-span-4">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 bg-slate-900 text-white grid place-items-center font-display font-black">
                L
              </div>
              <div className="font-display text-xl tracking-tighter font-black">
                Lumo
              </div>
            </div>
            {social.tagline && (
              <p className="text-sm text-slate-600 mt-3 max-w-md leading-relaxed">
                {social.tagline}
              </p>
            )}
          </div>

          {/* Earn / List — SEO recruiting */}
          <div className="md:col-span-2">
            <div className="overline text-slate-500 mb-2">Earn</div>
            <nav className="flex flex-col gap-1.5 text-sm">
              <Link to="/become-a-provider" className="text-slate-700 hover:text-teal-700" data-testid="footer-link-become-provider">Become a provider</Link>
              <Link to="/for-providers" className="text-slate-700 hover:text-teal-700" data-testid="footer-link-for-providers">For providers</Link>
              <Link to="/for-customers" className="text-slate-700 hover:text-teal-700" data-testid="footer-link-for-customers">For customers</Link>
              <Link to="/how-it-works" className="text-slate-700 hover:text-teal-700" data-testid="footer-link-how-it-works">How Lumo works</Link>
              <Link to="/careers"       className="text-slate-700 hover:text-teal-700" data-testid="footer-link-careers">Careers</Link>
              <Link to="/providers"     className="text-slate-700 hover:text-teal-700" data-testid="footer-link-providers">Provider cities</Link>
              <Link to="/apply"         className="text-slate-700 hover:text-teal-700" data-testid="footer-link-apply">Apply now</Link>
              <Link to="/list-your-stuff"   className="text-slate-700 hover:text-teal-700" data-testid="footer-link-list-stuff">List your stuff</Link>
              <Link to="/rentals/host"      className="text-slate-700 hover:text-teal-700" data-testid="footer-link-host-rental">Host a rental</Link>
              <Link to="/cities"            className="text-slate-700 hover:text-teal-700" data-testid="footer-link-cities">All cities</Link>
              <Link to="/map"               className="text-slate-700 hover:text-teal-700" data-testid="footer-link-jobs">Jobs near you</Link>
            </nav>
          </div>

          {/* Marketplaces */}
          <div className="md:col-span-2">
            <div className="overline text-slate-500 mb-2">Marketplaces</div>
            <nav className="flex flex-col gap-1.5 text-sm">
              <Link to="/marketplace"  className="text-slate-700 hover:text-teal-700" data-testid="footer-link-marketplace">Community Market</Link>
              <Link to="/stores"       className="text-slate-700 hover:text-teal-700" data-testid="footer-link-stores">Stores</Link>
              <Link to="/restaurants"  className="text-slate-700 hover:text-teal-700" data-testid="footer-link-restaurants">Restaurants</Link>
              <Link to="/rentals"      className="text-slate-700 hover:text-teal-700" data-testid="footer-link-rentals">Rentals</Link>
              <Link to="/real-estate"  className="text-slate-700 hover:text-teal-700" data-testid="footer-link-realestate">Real Estate</Link>
              <Link to="/autos"        className="text-slate-700 hover:text-teal-700" data-testid="footer-link-autos">Auto Sales</Link>
            </nav>
          </div>

          {/* Page links */}
          <div className="md:col-span-2">
            <div className="overline text-slate-500 mb-2">Lumo</div>
            <nav className="flex flex-col gap-1.5 text-sm">
              <Link to="/about"   className="text-slate-700 hover:text-teal-700" data-testid="footer-link-about">About</Link>
              <Link to="/press"   className="text-slate-700 hover:text-teal-700" data-testid="footer-link-press">Press</Link>
              <Link to="/contact" className="text-slate-700 hover:text-teal-700" data-testid="footer-link-contact">Contact</Link>
              <Link to="/terms"   className="text-slate-700 hover:text-teal-700" data-testid="footer-link-terms">Terms of service</Link>
              <Link to="/privacy" className="text-slate-700 hover:text-teal-700" data-testid="footer-link-privacy">Privacy policy</Link>
              <Link to="/blog"    className="text-slate-700 hover:text-teal-700" data-testid="footer-link-blog">Blog</Link>
              {user?.role === "admin" && (
                <Link to="/admin" className="text-slate-700 hover:text-teal-700 inline-flex items-center gap-1" data-testid="footer-link-admin">
                  <ShieldCheck className="w-3.5 h-3.5" /> Admin dashboard
                </Link>
              )}
              {!isStandalone && (installable || isIOS) && (
                <button
                  type="button"
                  onClick={() => triggerInstall(() => setIosModalOpen(true))}
                  className="text-left text-teal-700 hover:text-teal-900 font-bold flex items-center gap-1.5 mt-1"
                  data-testid="footer-install-btn"
                >
                  <Download className="w-3.5 h-3.5" />
                  Install Lumo
                  <span className="text-[9px] font-mono uppercase tracking-wider bg-teal-100 text-teal-800 px-1 py-0.5 ml-0.5">
                    {installable ? "1 tap" : "iOS"}
                  </span>
                </button>
              )}
            </nav>
          </div>

          {/* Socials */}
          <div className="md:col-span-2">
            <div className="overline text-slate-500 mb-2">Follow us</div>
            {hasLinks ? (
              <div className="flex flex-wrap gap-2" data-testid="footer-social-icons">
                {activeLinks.map(([key, url]) => {
                  const meta = PLATFORM_META[key];
                  if (!meta) return null;
                  const { Icon, label, color } = meta;
                  return (
                    <a
                      key={key}
                      href={url}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label={label}
                      title={label}
                      className="w-9 h-9 grid place-items-center border border-slate-300 text-slate-700 hover:text-white hover:border-transparent transition-colors"
                      style={{ ["--hover-bg"]: color }}
                      onMouseEnter={(e) => { e.currentTarget.style.background = color; }}
                      onMouseLeave={(e) => { e.currentTarget.style.background = ""; }}
                      data-testid={`footer-social-${key}`}
                    >
                      <Icon className="w-4 h-4" />
                    </a>
                  );
                })}
              </div>
            ) : (
              <div className="text-xs text-slate-400 italic">
                Social links coming soon — connect with us via the contact page.
                <Link to="/contact" className="block mt-1 not-italic text-teal-700 hover:underline">
                  <MessageCircle className="w-3 h-3 inline mr-1" />
                  Contact us →
                </Link>
              </div>
            )}
          </div>
        </div>

        <div className="border-t border-slate-200 mt-8 pt-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 text-xs text-slate-500">
          <div>© {year} Lumo. All rights reserved.</div>
          <div className="font-mono">Built for everyday hustle.</div>
        </div>
      </div>
      {iosModalOpen && <IOSInstallModal onClose={() => setIosModalOpen(false)} />}
    </footer>
  );
}

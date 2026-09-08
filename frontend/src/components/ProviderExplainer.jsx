import React, { useEffect, useState } from "react";
import { Play, Pause, ArrowRight, Wallet, MapPin, Clock, ShieldCheck, Zap, Star } from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";

/* ProviderExplainer — the 60-second "how you earn on Lumo" section for
 * the /for-providers page. Two modes:
 *
 *   1. If REACT_APP_PROVIDER_VIDEO_URL is set in the frontend .env, we
 *      render an HTML5 <video> (for direct .mp4/.webm/.mov links) or an
 *      <iframe> (for YouTube / Vimeo). The user drops in whatever URL
 *      they end up producing and it auto-swaps.
 *
 *   2. Otherwise we render an animated 60-second "product tour" built
 *      entirely from CSS + a progress bar so the section still feels
 *      alive on day one. 4 scenes × 15 s each = 60 s total, then loops.
 *      Users can click any dot to jump to that scene.
 *
 * All copy targets the value-prop applicants care about most: how they
 * get paid, how fast, and what protection they have. */

const SCENE_DURATION_MS = 15000;
const SCENES = [
  {
    id: "post",
    label: "1. Accept a job",
    title: "New jobs pop up in seconds.",
    body: "Lumo pings you the moment a nearby customer posts a request in a category you offer. Tap Accept, quote your price, done.",
    accent: "bg-teal-600",
    Icon: Zap,
    detail: [
      { Icon: MapPin, t: "GPS-matched", b: "You only see jobs within your radius." },
      { Icon: Clock, t: "Real-time", b: "New leads within 30 seconds of posting." },
      { Icon: Star, t: "First to bid wins", b: "No pay-to-play. No priority bumps." },
    ],
  },
  {
    id: "track",
    label: "2. Do the work",
    title: "Live GPS tracker keeps the customer in the loop.",
    body: "Your Uber-style live tracker sends the customer your ETA + current location. Fewer 'where are you?' texts. Fewer cancellations.",
    accent: "bg-amber-500",
    Icon: MapPin,
    detail: [
      { Icon: Clock, t: "One-tap chat", b: "Built-in messaging + call bridge." },
      { Icon: ShieldCheck, t: "Escrow-backed", b: "Payment is already secured before you leave." },
      { Icon: Zap, t: "Auto reroute", b: "Live traffic + optimal path." },
    ],
  },
  {
    id: "confirm",
    label: "3. Get confirmed",
    title: "Customer taps 'Done'. You get a 5-star review.",
    body: "Send a completion photo, mark the job complete, wait for the customer's one-tap confirmation. Both sides rate each other on the spot.",
    accent: "bg-purple-600",
    Icon: Star,
    detail: [
      { Icon: ShieldCheck, t: "Dispute protection", b: "Manual review if either side objects." },
      { Icon: Star, t: "Ratings compound", b: "Higher score = more first-look jobs." },
      { Icon: Zap, t: "Photo-verified", b: "Before / after shots baked in." },
    ],
  },
  {
    id: "pay",
    label: "4. Get paid",
    title: "90% hits your bank within 24 hours.",
    body: "Lumo takes 10% flat. Stripe Connect payouts settle same-day (24h max) directly to your bank. No lead fees. No weekly minimums.",
    accent: "bg-slate-900",
    Icon: Wallet,
    detail: [
      { Icon: Wallet, t: "Same-day payout", b: "Via Stripe Connect. Zero delay." },
      { Icon: ShieldCheck, t: "10% flat fee", b: "Half of TaskRabbit's 15–30%." },
      { Icon: Zap, t: "Instant tips", b: "Customer tips settle with the payout." },
    ],
  },
];

/** Renders a video URL:  YouTube iframe if it matches, else HTML5 video. */
function VideoEmbed({ url }) {
  const yt = url.match(/(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([A-Za-z0-9_-]{6,})/);
  const vimeo = url.match(/vimeo\.com\/(?:video\/)?(\d+)/);
  if (yt) {
    return (
      <iframe
        title="Lumo provider explainer"
        src={`https://www.youtube.com/embed/${yt[1]}?rel=0&modestbranding=1`}
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
        allowFullScreen
        className="w-full h-full"
        data-testid="provider-video-iframe"
      />
    );
  }
  if (vimeo) {
    return (
      <iframe
        title="Lumo provider explainer"
        src={`https://player.vimeo.com/video/${vimeo[1]}`}
        allow="autoplay; fullscreen; picture-in-picture"
        allowFullScreen
        className="w-full h-full"
        data-testid="provider-video-iframe"
      />
    );
  }
  return (
    <video
      src={url}
      controls
      preload="metadata"
      playsInline
      className="w-full h-full object-cover bg-black"
      data-testid="provider-video-native"
    >
      Sorry, your browser doesn&apos;t support embedded video.
    </video>
  );
}

/** CSS-animated placeholder that cycles through 4 scenes of 15s each.
 * Fully interactive — dots let you jump between scenes; a pause button
 * halts the auto-advance. */
function AnimatedTour() {
  const [active, setActive] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    if (!playing) return;
    setProgress(0);
    const start = Date.now();
    const step = setInterval(() => {
      const elapsed = Date.now() - start;
      const pct = Math.min(100, (elapsed / SCENE_DURATION_MS) * 100);
      setProgress(pct);
      if (elapsed >= SCENE_DURATION_MS) {
        setActive((a) => (a + 1) % SCENES.length);
      }
    }, 100);
    return () => clearInterval(step);
  }, [active, playing]);

  const s = SCENES[active];
  const Icon = s.Icon;

  return (
    <div className="relative w-full h-full flex flex-col text-white overflow-hidden" data-testid="provider-video-placeholder">
      {/* Scene background — colour-accented per scene */}
      <div className={`absolute inset-0 ${s.accent} transition-colors duration-700`} />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(255,255,255,0.15),transparent_60%),radial-gradient(circle_at_80%_80%,rgba(0,0,0,0.25),transparent_60%)]" />

      {/* Main scene */}
      <div className="relative flex-1 p-6 sm:p-10 flex flex-col justify-center">
        <div className="overline text-white/70 mb-3">{s.label}</div>
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 rounded-full bg-white/15 backdrop-blur border border-white/25 flex items-center justify-center flex-shrink-0">
            <Icon className="w-6 h-6" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="font-display font-black text-2xl sm:text-4xl leading-tight tracking-tighter">{s.title}</h3>
            <p className="mt-3 text-sm sm:text-base text-white/85 max-w-xl leading-relaxed">{s.body}</p>
          </div>
        </div>

        <div className="mt-6 grid grid-cols-1 sm:grid-cols-3 gap-2 max-w-2xl">
          {s.detail.map((d, i) => {
            const DIcon = d.Icon;
            return (
              <div
                key={i}
                className="border border-white/20 bg-white/10 backdrop-blur p-3"
                style={{
                  animation: `slideUp 500ms ease-out ${i * 120}ms both`,
                }}
              >
                <DIcon className="w-4 h-4 mb-1.5" />
                <div className="font-mono text-[10px] uppercase tracking-widest text-white/70">{d.t}</div>
                <div className="text-sm mt-0.5">{d.b}</div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Controls: progress bar + dots + play/pause */}
      <div className="relative border-t border-white/20 bg-black/25 backdrop-blur">
        {/* Progress bar */}
        <div className="h-0.5 bg-white/10 relative">
          <div
            className="h-full bg-white transition-[width]"
            style={{ width: `${progress}%`, transitionDuration: playing ? "100ms" : "0ms" }}
          />
        </div>
        <div className="flex items-center gap-2 px-4 py-3">
          <button
            onClick={() => setPlaying((p) => !p)}
            className="w-8 h-8 flex items-center justify-center rounded-full bg-white text-slate-900 hover:bg-amber-300 transition-colors"
            aria-label={playing ? "Pause" : "Play"}
            data-testid="provider-video-playpause"
          >
            {playing ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5 ml-0.5" />}
          </button>
          <div className="flex gap-1.5 flex-1">
            {SCENES.map((sc, i) => (
              <button
                key={sc.id}
                onClick={() => { setActive(i); setProgress(0); }}
                className={`h-1.5 flex-1 rounded-full transition-colors ${i === active ? "bg-white" : i < active ? "bg-white/50" : "bg-white/20"}`}
                aria-label={sc.label}
                data-testid={`provider-video-scene-${i}`}
              />
            ))}
          </div>
          <div className="font-mono text-[10px] uppercase tracking-widest text-white/60">
            {`0:${String(Math.min(59, Math.round((active * SCENE_DURATION_MS + progress * SCENE_DURATION_MS / 100) / 1000))).padStart(2, "0")}`} / 1:00
          </div>
        </div>
      </div>

      <style>{`
        @keyframes slideUp {
          from { opacity: 0; transform: translateY(12px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}

export default function ProviderExplainer() {
  const videoUrl = process.env.REACT_APP_PROVIDER_VIDEO_URL || "";

  return (
    <section className="border-b border-slate-200 bg-slate-950" data-testid="provider-explainer">
      <div className="max-w-6xl mx-auto px-4 py-16">
        <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3 mb-6">
          <div>
            <div className="overline text-teal-400 mb-2">Product tour</div>
            <h2 className="font-display font-black text-3xl sm:text-5xl text-white tracking-tighter">
              60 seconds to your first Lumo payout.
            </h2>
            <p className="mt-3 text-slate-400 text-sm sm:text-base max-w-2xl">
              Every step of what happens after you sign up — from accepting your first job to the money hitting your bank.
            </p>
          </div>
          <Link to="/register?role=provider" className="flex-shrink-0" data-testid="provider-explainer-cta">
            <Button className="rounded-none h-11 px-5 bg-white text-slate-900 hover:bg-amber-300 text-sm font-mono uppercase tracking-wider">
              Start earning <ArrowRight className="w-4 h-4 ml-2" />
            </Button>
          </Link>
        </div>

        {/* Video / animated placeholder */}
        <div className="relative w-full aspect-video border border-slate-800 shadow-2xl">
          {videoUrl ? <VideoEmbed url={videoUrl} /> : <AnimatedTour />}
        </div>

        {/* Below-video hints */}
        <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { Icon: Wallet, t: "10% flat fee", b: "You keep 90%" },
            { Icon: Clock, t: "24-hour payout", b: "Via Stripe Connect" },
            { Icon: ShieldCheck, t: "$25 referral bonus", b: "Per invited provider" },
            { Icon: Star, t: "No lead fees", b: "Only pay when you earn" },
          ].map((h, i) => {
            const HIcon = h.Icon;
            return (
              <div key={i} className="border border-slate-800 bg-slate-900/50 p-3">
                <HIcon className="w-4 h-4 text-teal-400" />
                <div className="mt-1.5 font-mono text-[10px] uppercase tracking-widest text-teal-400">{h.t}</div>
                <div className="text-white text-sm">{h.b}</div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

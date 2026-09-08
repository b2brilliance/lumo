import React from "react";
import { Link } from "react-router-dom";

function Page({ title, children, testId }) {
  return (
    <div className="min-h-screen bg-white">
      <div className="max-w-3xl mx-auto px-6 py-16" data-testid={testId}>
        <Link to="/" className="text-xs font-mono text-slate-500 hover:text-teal-700">← Back to Lumo</Link>
        <h1 className="font-display text-4xl sm:text-5xl font-black tracking-tighter mt-3 mb-6">{title}</h1>
        <div className="prose prose-slate max-w-none text-slate-700 leading-relaxed">
          {children}
        </div>
      </div>
    </div>
  );
}

export function AboutPage() {
  return (
    <Page title="About Lumo" testId="page-about">
      <p>Lumo is the local marketplace for getting things done — find work, hire help, sell stuff, or rent it out. We make it easy to connect with people in your neighborhood for everything from delivery and home services to selling your car or finding a place to live.</p>
      <h2>What you can do on Lumo</h2>
      <ul>
        <li><strong>Hire help</strong> — Delivery, labor, photography, moving, cleaning, repairs, and more</li>
        <li><strong>Earn money</strong> — Sign up as a provider, set your own hours, get paid via direct deposit</li>
        <li><strong>Buy & sell</strong> — Real estate, autos, gear, and everyday goods from people nearby</li>
        <li><strong>Order food & retail</strong> — Local restaurants and shops with on-demand delivery</li>
      </ul>
      <h2>Trust & safety</h2>
      <p>Every payment is held in escrow until you confirm the work is done. Providers verify their identity, customers leave ratings, and our platform handles disputes fairly.</p>
    </Page>
  );
}

export function ContactPage() {
  const [form, setForm] = React.useState({ name: "", email: "", topic: "general", subject: "", message: "" });
  const [busy, setBusy] = React.useState(false);
  const [sent, setSent] = React.useState(false);
  const [error, setError] = React.useState("");

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true); setError("");
    try {
      const { api } = await import("@/lib/api");
      await api.post("/contact", form);
      setSent(true);
      setForm({ name: "", email: "", topic: "general", subject: "", message: "" });
    } catch (err) {
      setError(err?.response?.data?.detail || "Something went wrong. Please email us directly.");
    } finally { setBusy(false); }
  };

  return (
    <Page title="Contact us" testId="page-contact">
      <p>Questions, feedback, partnerships, press — we&apos;d love to hear from you. Fill out the form and we&apos;ll reply within 24 hours.</p>

      {sent ? (
        <div className="not-prose mt-6 border-l-4 border-teal-600 bg-teal-50 p-6" data-testid="contact-form-success">
          <div className="font-display font-bold text-lg text-slate-900">Thanks — got it.</div>
          <p className="text-sm text-slate-700 mt-2">We&apos;ll get back to you at the email you provided within 24 hours. If it&apos;s urgent, message us via your in-app inbox once you have an account.</p>
          <button
            type="button"
            onClick={() => setSent(false)}
            className="mt-4 text-sm font-mono uppercase tracking-widest text-teal-700 hover:underline"
            data-testid="contact-form-send-another"
          >
            Send another →
          </button>
        </div>
      ) : (
        <form onSubmit={submit} className="not-prose mt-6 space-y-4" data-testid="contact-form">
          <div className="grid sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-mono uppercase tracking-widest text-slate-500 mb-1">Name</label>
              <input
                required
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                className="w-full border border-slate-300 bg-white h-11 px-3 text-sm focus:border-teal-700 focus:ring-2 focus:ring-teal-700/20 outline-none"
                data-testid="contact-form-name"
              />
            </div>
            <div>
              <label className="block text-xs font-mono uppercase tracking-widest text-slate-500 mb-1">Email</label>
              <input
                required
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                className="w-full border border-slate-300 bg-white h-11 px-3 text-sm focus:border-teal-700 focus:ring-2 focus:ring-teal-700/20 outline-none"
                data-testid="contact-form-email"
              />
            </div>
          </div>
          <div className="grid sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-mono uppercase tracking-widest text-slate-500 mb-1">Topic</label>
              <select
                value={form.topic}
                onChange={(e) => setForm({ ...form, topic: e.target.value })}
                className="w-full border border-slate-300 bg-white h-11 px-3 text-sm focus:border-teal-700 focus:ring-2 focus:ring-teal-700/20 outline-none"
                data-testid="contact-form-topic"
              >
                <option value="general">General inquiry</option>
                <option value="support">Account / support issue</option>
                <option value="partnership">Partnership / business</option>
                <option value="press">Press / media</option>
                <option value="feedback">Feedback / feature request</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-mono uppercase tracking-widest text-slate-500 mb-1">Subject (optional)</label>
              <input
                value={form.subject}
                onChange={(e) => setForm({ ...form, subject: e.target.value })}
                className="w-full border border-slate-300 bg-white h-11 px-3 text-sm focus:border-teal-700 focus:ring-2 focus:ring-teal-700/20 outline-none"
                data-testid="contact-form-subject"
              />
            </div>
          </div>
          <div>
            <label className="block text-xs font-mono uppercase tracking-widest text-slate-500 mb-1">Message</label>
            <textarea
              required
              rows={6}
              minLength={5}
              value={form.message}
              onChange={(e) => setForm({ ...form, message: e.target.value })}
              className="w-full border border-slate-300 bg-white p-3 text-sm focus:border-teal-700 focus:ring-2 focus:ring-teal-700/20 outline-none"
              data-testid="contact-form-message"
            />
          </div>
          {error && <div className="text-sm text-red-700 bg-red-50 border border-red-200 p-3" data-testid="contact-form-error">{error}</div>}
          <div className="flex items-center justify-between flex-wrap gap-3">
            <p className="text-[11px] font-mono uppercase tracking-widest text-slate-400">Never shared. Never sold.</p>
            <button
              type="submit"
              disabled={busy}
              className="bg-slate-900 text-white hover:bg-teal-700 disabled:opacity-60 h-11 px-6 text-sm font-mono uppercase tracking-widest"
              data-testid="contact-form-submit"
            >
              {busy ? "Sending…" : "Send message →"}
            </button>
          </div>
        </form>
      )}

      <hr className="my-8 border-slate-200" />
      <h2>Prefer email?</h2>
      <p>Reach us direct: <a href="mailto:hello@golumo.app">hello@golumo.app</a> for general questions, <a href="mailto:press@golumo.app">press@golumo.app</a> for media.</p>
    </Page>
  );
}

export function TermsPage() {
  return (
    <Page title="Terms of service" testId="page-terms">
      <p className="text-xs font-mono text-slate-500">Last updated: {new Date().toLocaleDateString(undefined, { month: "long", day: "numeric", year: "numeric" })}</p>
      <p>By creating an account or using Lumo, you agree to these terms. They&apos;re written to be readable — if anything is unclear, please email <a href="mailto:hello@golumo.app">hello@golumo.app</a>.</p>
      <h2>1. Your account</h2>
      <p>You&apos;re responsible for keeping your login secure and for the actions taken under your account. You must be 18+ to use Lumo.</p>
      <h2>2. Services & payments</h2>
      <p>Lumo connects customers with independent providers. Lumo is not a party to the work itself. Customer payments are held in escrow until the work is confirmed; Lumo charges a 10% platform fee on completed jobs.</p>
      <h2>3. Conduct</h2>
      <p>Don&apos;t post illegal content, harass users, or attempt to defraud the escrow system. Violations may result in account suspension.</p>
      <h2>4. Disputes</h2>
      <p>If a job or order is disputed, contact support within 24 hours of auto-release. We review evidence (photos, messages, ratings) and adjust escrow accordingly.</p>
      <h2>5. Changes</h2>
      <p>We may update these terms. Material changes will be emailed to you and posted here.</p>
    </Page>
  );
}

export function PrivacyPage() {
  return (
    <Page title="Privacy policy" testId="page-privacy">
      <p className="text-xs font-mono text-slate-500">Last updated: {new Date().toLocaleDateString(undefined, { month: "long", day: "numeric", year: "numeric" })}</p>
      <p>This policy explains what we collect, why, and your rights.</p>
      <h2>What we collect</h2>
      <ul>
        <li><strong>Account info</strong> — name, email, phone (for SMS verification), and optional profile photo</li>
        <li><strong>Location</strong> — when you list a job or browse the map, we use your approximate location to show nearby results</li>
        <li><strong>Payments</strong> — handled by Stripe; we store payout history but not full card numbers</li>
        <li><strong>Usage</strong> — pageviews, clicks, and device info so we can improve the product</li>
      </ul>
      <h2>How we use it</h2>
      <p>To match you with providers/customers, process payments, send notifications, and prevent abuse.</p>
      <h2>Sharing</h2>
      <p>We share data with Stripe (payments), Twilio (SMS), Google (sign-in), and our analytics provider. We never sell your personal data.</p>
      <h2>Your rights</h2>
      <p>You can request a copy of your data or deletion at any time by emailing <a href="mailto:privacy@golumo.app">privacy@golumo.app</a>.</p>
    </Page>
  );
}

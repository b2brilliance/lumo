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
  return (
    <Page title="Contact us" testId="page-contact">
      <p>We&apos;d love to hear from you — questions, feedback, partnerships, press.</p>
      <h2>General inquiries</h2>
      <p><a href="mailto:hello@golumo.app">hello@golumo.app</a></p>
      <h2>Support</h2>
      <p>If you have an issue with a job, order, or payout, please reach out via your in-app inbox or email <a href="mailto:support@golumo.app">support@golumo.app</a>.</p>
      <h2>Press & partnerships</h2>
      <p><a href="mailto:press@golumo.app">press@golumo.app</a></p>
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

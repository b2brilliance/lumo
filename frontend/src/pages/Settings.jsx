import React, { useEffect, useMemo, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import {
  Globe, User as UserIcon, MapPin, Bell, Accessibility, Lock,
  Save, Loader2, LogOut, AlertCircle, LifeBuoy,
} from "lucide-react";
import { toast } from "sonner";
import { useLocale, COUNTRY_PROFILES } from "@/lib/locale";
import { useAuth } from "@/lib/auth";
import { api, formatApiError } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import AddressInput from "@/components/AddressInput";
import MapPickerButton from "@/components/MapPickerButton";
import AvatarUploader from "@/components/AvatarUploader";
import ProviderProfileSection from "@/components/ProviderProfileSection";
import ProviderMediaSection from "@/components/ProviderMediaSection";
import { enablePush, disablePush, pushStatus } from "@/lib/push";

const DEFAULT_NOTIFS = {
  order_updates: true,
  job_matches: true,
  marketing_emails: true,
  blog_digest: true,
};
const DEFAULT_A11Y = {
  reduce_motion: false,
  larger_text: false,
};

export default function Settings() {
  const nav = useNavigate();
  const { country, profile, setCountryOverride, isAutoDetected, formatPrice } = useLocale();
  const { user, updateMe, logout } = useAuth();

  // ── Profile ────────────────────────────────────────────────────────────────
  const [name, setName] = useState(user?.name || "");
  const [phone, setPhone] = useState(user?.phone || "");

  // ── Default delivery address ───────────────────────────────────────────────
  const [addr, setAddr] = useState({
    address: user?.default_delivery_address?.address || "",
    lat: user?.default_delivery_address?.lat || null,
    lng: user?.default_delivery_address?.lng || null,
  });

  // ── Notifications & a11y ───────────────────────────────────────────────────
  const [notifs, setNotifs] = useState({ ...DEFAULT_NOTIFS, ...(user?.notification_prefs || {}) });
  const [a11y, setA11y] = useState({ ...DEFAULT_A11Y, ...(user?.accessibility_prefs || {}) });

  // ── UI state ───────────────────────────────────────────────────────────────
  const [saving, setSaving] = useState(false);
  const [pwOpen, setPwOpen] = useState(false);
  const [pushState, setPushState] = useState({ supported: false, permission: "default", subscribed: false });
  const [pushBusy, setPushBusy] = useState(false);

  useEffect(() => {
    pushStatus().then(setPushState).catch(() => {});
  }, []);

  const togglePush = async (v) => {
    setPushBusy(true);
    try {
      if (v) {
        let r;
        try {
          r = await enablePush();
        } catch (err) {
          r = { ok: false, reason: "error", err };
        }
        if (!r.ok) {
          if (r.reason === "denied") toast.error("Notifications blocked — enable them in your browser settings.");
          else if (r.reason === "unsupported") toast.error("This browser doesn't support push notifications.");
          else toast.error("Couldn't enable push notifications on this device.");
        } else {
          toast.success("Push notifications on");
        }
      } else {
        try { await disablePush(); } catch (_) { /* ignore */ }
        toast.success("Push notifications off");
      }
      setPushState(await pushStatus());
    } finally {
      setPushBusy(false);
    }
  };

  // Re-hydrate when the user object first arrives (Auth boots after first paint).
  useEffect(() => {
    if (!user) return;
    setName(user.name || "");
    setPhone(user.phone || "");
    setAddr({
      address: user.default_delivery_address?.address || "",
      lat: user.default_delivery_address?.lat ?? null,
      lng: user.default_delivery_address?.lng ?? null,
    });
    setNotifs({ ...DEFAULT_NOTIFS, ...(user.notification_prefs || {}) });
    setA11y({ ...DEFAULT_A11Y, ...(user.accessibility_prefs || {}) });
  }, [user]);

  // Apply accessibility prefs to the document immediately so the preview is live.
  useEffect(() => {
    document.documentElement.classList.toggle("reduce-motion", !!a11y.reduce_motion);
    document.documentElement.classList.toggle("larger-text", !!a11y.larger_text);
  }, [a11y.reduce_motion, a11y.larger_text]);

  const dirty = useMemo(() => {
    if (!user) return false;
    return (
      name !== (user.name || "") ||
      phone !== (user.phone || "") ||
      JSON.stringify(addr) !== JSON.stringify({
        address: user.default_delivery_address?.address || "",
        lat: user.default_delivery_address?.lat ?? null,
        lng: user.default_delivery_address?.lng ?? null,
      }) ||
      JSON.stringify(notifs) !== JSON.stringify({ ...DEFAULT_NOTIFS, ...(user.notification_prefs || {}) }) ||
      JSON.stringify(a11y) !== JSON.stringify({ ...DEFAULT_A11Y, ...(user.accessibility_prefs || {}) })
    );
  }, [user, name, phone, addr, notifs, a11y]);

  const save = async () => {
    if (!user) return;
    setSaving(true);
    try {
      await updateMe({
        name,
        phone: phone || null,
        default_delivery_address: addr.address ? addr : null,
        notification_prefs: notifs,
        accessibility_prefs: a11y,
      });
      toast.success("Settings saved");
    } catch (e) {
      toast.error(formatApiError(e));
    } finally {
      setSaving(false);
    }
  };

  if (!user) {
    return (
      <div className="max-w-screen-md mx-auto px-6 py-20 text-center text-slate-500">
        <Loader2 className="w-5 h-5 animate-spin mx-auto" />
      </div>
    );
  }
  if (user === false) {
    return (
      <div className="max-w-screen-md mx-auto px-6 py-20 text-center" data-testid="settings-anon">
        <h1 className="font-display text-3xl font-black tracking-tighter">Sign in to manage your settings.</h1>
        <Button className="mt-6" onClick={() => nav("/signin")}>Sign in</Button>
      </div>
    );
  }

  return (
    <div className="max-w-screen-md mx-auto px-6 py-10" data-testid="settings-page">
      <div className="overline">Settings</div>
      <h1 className="font-display text-4xl font-black tracking-tighter mt-2">Your preferences.</h1>
      <Link to="/help" className="mt-4 inline-flex items-center gap-2 rounded-full border border-slate-200 px-4 py-2 text-sm font-medium hover:border-slate-900 transition-colors" data-testid="settings-help-link">
        <LifeBuoy className="w-4 h-4" />Help Center
      </Link>

      {/* ── Profile ─────────────────────────────────────────────────────────── */}
      <SettingsSection icon={UserIcon} title="Profile" testid="section-profile" data-no-i18n="true">
        <div className="mb-6" data-testid="settings-avatar-row">
          <AvatarUploader
            value={user.avatar_url}
            onChange={async (url) => {
              try {
                await updateMe({ avatar_url: url });
                toast.success(url ? "Photo updated" : "Photo removed");
              } catch (e) { toast.error(formatApiError(e)); }
            }}
            required={user.role === "provider"}
            testid="settings-avatar"
          />
          {user.role === "provider" && !user.avatar_url && (
            <div className="mt-3 text-[11px] font-mono text-amber-700 bg-amber-50 border border-amber-200 px-3 py-2" data-testid="settings-avatar-warning">
              Service providers need a profile photo so customers can recognise you. Please upload one.
            </div>
          )}
        </div>
        <div className="grid sm:grid-cols-2 gap-4">
          <div>
            <Label className="overline">Name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} className="mt-1" data-testid="settings-name" />
          </div>
          <div>
            <Label className="overline">Phone</Label>
            <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+1 555…" className="mt-1" data-testid="settings-phone" />
          </div>
          <div className="sm:col-span-2 grid grid-cols-2 gap-4">
            <div>
              <Label className="overline">Email</Label>
              <div className="mt-1 px-3 py-2 border border-slate-200 bg-slate-50 text-sm font-mono text-slate-600" data-testid="settings-email">{user.email}</div>
            </div>
            <div>
              <Label className="overline">Account type</Label>
              <div className="mt-1 px-3 py-2 border border-slate-200 bg-slate-50 text-sm font-mono uppercase tracking-wider text-slate-600">{user.role}</div>
            </div>
          </div>
        </div>
      </SettingsSection>

      {/* ── Provider profile (role==provider only) ─────────────────────── */}
      <ProviderProfileSection />
      <ProviderMediaSection />

      {/* ── Default delivery address ────────────────────────────────────────── */}
      <SettingsSection
        icon={MapPin}
        title="Default delivery address"
        subtitle="Pre-fills your address on Marketplace, Stores, and Restaurant checkout dialogs."
        testid="section-address"
      >
        <div className="flex gap-2 items-start">
          <div className="flex-1">
            <AddressInput
              value={addr.address}
              onChange={(v) => setAddr({ ...addr, address: v })}
              onPlace={(p) => setAddr({ address: p.address, lat: p.lat, lng: p.lng })}
              placeholder="Start typing your address…"
              data-testid="settings-address-input"
            />
          </div>
          <MapPickerButton
            value={{ lat: addr.lat, lng: addr.lng, address: addr.address }}
            onPick={(p) => setAddr({ address: p.address, lat: p.lat, lng: p.lng })}
          />
        </div>
        {addr.lat != null && (
          <div className="text-[11px] font-mono text-teal-700 mt-2">
            📍 {addr.lat.toFixed(4)}, {addr.lng.toFixed(4)} — distance-based delivery quotes will use this.
          </div>
        )}
      </SettingsSection>

      {/* ── Notifications ───────────────────────────────────────────────────── */}
      <SettingsSection icon={Bell} title="Notifications" testid="section-notifs">
        {pushState.supported && (
          <ToggleRow
            label="Push notifications on this device"
            desc={
              pushState.permission === "denied"
                ? "Blocked in browser settings. Enable notifications for this site to turn on."
                : "Instant pings the moment a provider accepts, is on the way, arrives, or finishes."
            }
            checked={pushState.subscribed}
            onChange={togglePush}
            testid="toggle-push"
            disabled={pushBusy || pushState.permission === "denied"}
          />
        )}
        <ToggleRow
          label="Order & job updates"
          desc="Real-time pings when a provider responds, an order ships, or a delivery is confirmed."
          checked={notifs.order_updates}
          onChange={(v) => setNotifs({ ...notifs, order_updates: v })}
          testid="toggle-order-updates"
        />
        <ToggleRow
          label="New nearby job matches"
          desc="(Providers only) New jobs in your service radius and categories."
          checked={notifs.job_matches}
          onChange={(v) => setNotifs({ ...notifs, job_matches: v })}
          testid="toggle-job-matches"
        />
        <ToggleRow
          label="Marketing emails"
          desc="Two short emails a day with one Lumo use-case each. Unsubscribe in one click any time."
          checked={notifs.marketing_emails}
          onChange={(v) => setNotifs({ ...notifs, marketing_emails: v })}
          testid="toggle-marketing"
        />
        <ToggleRow
          label="Blog digest"
          desc="Weekly roundup of the best new posts from the Lumo blog."
          checked={notifs.blog_digest}
          onChange={(v) => setNotifs({ ...notifs, blog_digest: v })}
          testid="toggle-blog-digest"
        />
      </SettingsSection>

      {/* ── Accessibility ───────────────────────────────────────────────────── */}
      <SettingsSection icon={Accessibility} title="Accessibility" testid="section-a11y">
        <ToggleRow
          label="Reduce motion"
          desc="Disable transitions and animated sparklines. Helpful if motion makes you uncomfortable."
          checked={a11y.reduce_motion}
          onChange={(v) => setA11y({ ...a11y, reduce_motion: v })}
          testid="toggle-reduce-motion"
        />
        <ToggleRow
          label="Larger text"
          desc="Bumps body text +15% across the app."
          checked={a11y.larger_text}
          onChange={(v) => setA11y({ ...a11y, larger_text: v })}
          testid="toggle-larger-text"
        />
      </SettingsSection>

      {/* ── Country & language ──────────────────────────────────────────────── */}
      <SettingsSection icon={Globe} title="Country & language" testid="section-locale" data-no-i18n="true">
        <p className="text-slate-600 text-sm">
          Lumo auto-detects your country from your browser. Override below to preview how Lumo looks in any of our 15 supported regions.
        </p>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <label className="text-xs font-mono uppercase tracking-wider text-slate-500" htmlFor="country-picker">Preview country</label>
          <select
            id="country-picker"
            value={country}
            onChange={(e) => setCountryOverride(e.target.value)}
            className="px-3 py-2 border border-slate-300 bg-white text-sm font-medium min-w-[260px]"
            data-testid="settings-country-picker"
          >
            {Object.entries(COUNTRY_PROFILES).map(([code, p]) => (
              <option key={code} value={code}>
                {`${p.flag}  ${p.name} — ${p.lang.toUpperCase()} · ${p.currency}`}
              </option>
            ))}
          </select>
          {!isAutoDetected && (
            <button
              type="button"
              onClick={() => setCountryOverride(null)}
              className="text-xs text-slate-500 underline hover:text-slate-900"
              data-testid="settings-country-reset"
            >
              Reset to auto-detect
            </button>
          )}
        </div>
        <div className="mt-4 bg-slate-50 border border-slate-200 p-4 grid grid-cols-3 gap-3 text-xs font-mono">
          <div><div className="text-slate-500 uppercase">Country</div><div className="text-slate-900 mt-1">{profile.flag} {profile.name}</div></div>
          <div><div className="text-slate-500 uppercase">Language</div><div className="text-slate-900 mt-1">{profile.lang.toUpperCase()}</div></div>
          <div><div className="text-slate-500 uppercase">Currency</div><div className="text-slate-900 mt-1">{profile.currency} ({profile.symbol})</div></div>
          <div><div className="text-slate-500 uppercase">{profile.taxLabel}</div><div className="text-slate-900 mt-1">{(profile.taxRate * 100).toFixed(profile.taxRate * 100 % 1 ? 1 : 0)}%</div></div>
          <div className="col-span-2"><div className="text-slate-500 uppercase">$25 example, tax-inclusive</div><div className="text-slate-900 mt-1 text-sm">{formatPrice(25 * (1 + profile.taxRate))}</div></div>
        </div>
      </SettingsSection>

      {/* ── Account ─────────────────────────────────────────────────────────── */}
      <SettingsSection icon={Lock} title="Account" testid="section-account">
        <div className="flex flex-wrap gap-3">
          <Button variant="outline" onClick={() => setPwOpen(true)} data-testid="open-change-password">Change password</Button>
          <Button variant="outline" onClick={() => { logout(); nav("/"); }} data-testid="settings-signout">
            <LogOut className="w-3.5 h-3.5 mr-1" /> Sign out
          </Button>
        </div>
        {pwOpen && <ChangePasswordCard onClose={() => setPwOpen(false)} />}
        {user.role !== "admin" && <DeleteAccount onDone={() => { logout(); nav("/"); }} />}
      </SettingsSection>

      {/* ── Sticky save bar ────────────────────────────────────────────────── */}
      {dirty && (
        <div className="sticky bottom-4 mt-10 z-30" data-testid="settings-save-bar">
          <div className="bg-slate-900 text-white shadow-xl px-5 py-3 flex items-center justify-between gap-4 border border-slate-800">
            <div className="flex items-center gap-2 text-sm">
              <AlertCircle className="w-4 h-4 text-amber-400" />
              <span>You have unsaved changes</span>
            </div>
            <Button onClick={save} disabled={saving} className="bg-teal-600 hover:bg-teal-700" data-testid="settings-save">
              {saving ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Save className="w-4 h-4 mr-1" />}
              {saving ? "Saving…" : "Save changes"}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Sub-components
// ────────────────────────────────────────────────────────────────────────────
function SettingsSection({ icon: Icon, title, subtitle, children, testid, ...rest }) {
  return (
    <section className="mt-8 border border-slate-200 p-6 bg-white" data-testid={testid} {...rest}>
      <div className="flex items-center gap-2">
        <Icon className="w-5 h-5 text-teal-700" />
        <div className="font-display text-xl font-bold">{title}</div>
      </div>
      {subtitle && <p className="text-slate-600 text-sm mt-3">{subtitle}</p>}
      <div className="mt-5">{children}</div>
    </section>
  );
}

function ToggleRow({ label, desc, checked, onChange, testid }) {
  return (
    <div className="flex items-start justify-between gap-4 py-3 border-b border-slate-100 last:border-b-0">
      <div className="flex-1 min-w-0">
        <div className="font-medium text-slate-900 text-sm">{label}</div>
        {desc && <div className="text-xs text-slate-500 mt-1 leading-relaxed">{desc}</div>}
      </div>
      <Switch checked={!!checked} onCheckedChange={onChange} data-testid={testid} />
    </div>
  );
}

function ChangePasswordCard({ onClose }) {
  const [cur, setCur] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (next.length < 6) { toast.error("New password must be at least 6 characters"); return; }
    if (next !== confirm) { toast.error("Passwords don't match"); return; }
    setBusy(true);
    try {
      await api.post("/auth/me/password", { current_password: cur, new_password: next });
      toast.success("Password updated");
      onClose();
    } catch (e) {
      toast.error(formatApiError(e));
    } finally { setBusy(false); }
  };

  return (
    <div className="mt-5 border border-slate-200 p-4 bg-slate-50 space-y-3" data-testid="change-password-card">
      <div>
        <Label className="overline">Current password</Label>
        <Input type="password" value={cur} onChange={(e) => setCur(e.target.value)} className="mt-1" data-testid="pw-current" />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label className="overline">New password</Label>
          <Input type="password" value={next} onChange={(e) => setNext(e.target.value)} className="mt-1" data-testid="pw-new" />
        </div>
        <div>
          <Label className="overline">Confirm</Label>
          <Input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} className="mt-1" data-testid="pw-confirm" />
        </div>
      </div>
      <div className="flex gap-2 justify-end">
        <Button variant="ghost" onClick={onClose} data-testid="pw-cancel">Cancel</Button>
        <Button onClick={submit} disabled={busy} className="bg-slate-900 hover:bg-slate-800" data-testid="pw-submit">
          {busy ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : null}{busy ? "Saving…" : "Update password"}
        </Button>
      </div>
    </div>
  );
}

function DeleteAccount({ onDone }) {
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const run = async () => {
    setBusy(true);
    try {
      await api.delete("/auth/me");
      toast.success("Your account has been deleted");
      onDone();
    } catch (e) {
      toast.error(formatApiError(e));
      setBusy(false);
    }
  };
  if (!confirm) {
    return (
      <button onClick={() => setConfirm(true)} className="mt-5 text-sm text-red-600 underline" data-testid="settings-delete-account">
        Delete account
      </button>
    );
  }
  return (
    <div className="mt-5 border border-red-200 bg-red-50 p-4" data-testid="settings-delete-confirm">
      <div className="text-sm text-red-800">This permanently deletes your profile, login, shop and listings. This can&apos;t be undone.</div>
      <div className="mt-3 flex gap-2">
        <Button onClick={run} disabled={busy} className="bg-red-600 hover:bg-red-700" data-testid="settings-delete-confirm-btn">
          {busy ? "Deleting…" : "Yes, delete my account"}
        </Button>
        <Button variant="outline" onClick={() => setConfirm(false)} data-testid="settings-delete-cancel">Cancel</Button>
      </div>
    </div>
  );
}

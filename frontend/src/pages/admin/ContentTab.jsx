import React, { useEffect, useState } from "react";
import { api, formatApiError } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Search, Save, Trash2, Package, Home, Car, Store, Briefcase, Building2, ShoppingBag, BookOpen, MapPin, Plus, HelpCircle } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import DemoPurgeCard from "@/components/admin/DemoPurgeCard";
import { useLocale } from "@/lib/locale";

/* ContentTab — one unified admin surface for every user-generated
 * marketplace record on Lumo: community listings, rentals, autos, store
 * inventory items and jobs / service requests.
 *
 * Backend: /api/admin/content?type=<type>&q&status  +  PATCH & DELETE
 * `type` values and editable fields are defined in admin_crud.py.
 */
const TYPE_ICONS = {
  real_estate:  { Icon: Building2,   label: "Real estate" },
  listing:      { Icon: Package,     label: "Community listings" },
  rental:       { Icon: Home,        label: "Rentals" },
  auto:         { Icon: Car,         label: "Auto sales" },
  inventory:    { Icon: Store,       label: "Store items" },
  job:          { Icon: Briefcase,   label: "Jobs / requests" },
  shop_product: { Icon: ShoppingBag, label: "Shop products" },
  blog_post:    { Icon: BookOpen,    label: "Blog posts" },
  recruit_city: { Icon: MapPin,      label: "Recruit cities" },
  faq:          { Icon: HelpCircle,  label: "Help FAQs" },
};
const TYPE_ORDER = ["real_estate", "listing", "rental", "auto", "inventory", "job", "shop_product", "blog_post", "recruit_city", "faq"];

export default function ContentTab() {
  const [type, setType] = useState("real_estate");
  const [q, setQ] = useState("");
  const [debouncedQ, setDebouncedQ] = useState("");
  const [status, setStatus] = useState("all");
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [types, setTypes] = useState([]);
  const [editing, setEditing] = useState(null);
  const [selected, setSelected] = useState(new Set());
  const { formatPrice } = useLocale();

  useEffect(() => {
    api.get("/admin/content/types").then(({ data }) => setTypes(data || [])).catch(() => setTypes([]));
  }, []);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(q.trim()), 300);
    return () => clearTimeout(t);
  }, [q]);

  const load = () => {
    setLoading(true);
    const params = new URLSearchParams({ type, limit: "100" });
    if (debouncedQ) params.set("q", debouncedQ);
    if (status !== "all") params.set("status", status);
    api.get(`/admin/content?${params.toString()}`)
      .then(({ data }) => { setItems(data.items || []); setTotal(data.total || 0); setSelected(new Set()); })
      .catch(() => setItems([]))
      .finally(() => setLoading(false));
  };
  useEffect(load, [type, debouncedQ, status]); // eslint-disable-line react-hooks/exhaustive-deps

  const del = async (it) => {
    if (!window.confirm(`Delete "${it.title || it.id}"? This cannot be undone.`)) return;
    try {
      await api.delete(`/admin/content/${type}/${it.id}`);
      toast.success("Deleted");
      load();
    } catch (e) { toast.error(formatApiError(e)); }
  };

  const bulkDelete = async () => {
    if (selected.size === 0) return;
    if (!window.confirm(`Delete ${selected.size} selected item${selected.size === 1 ? "" : "s"}?`)) return;
    try {
      const { data } = await api.post("/admin/content/bulk-delete", { type, ids: [...selected] });
      toast.success(`${data.deleted_count} deleted`);
      load();
    } catch (e) { toast.error(formatApiError(e)); }
  };

  const toggleOne = (id) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id); else next.add(id);
    setSelected(next);
  };
  const toggleAll = () => {
    setSelected(selected.size === items.length ? new Set() : new Set(items.map((it) => it.id)));
  };

  const activeMeta = TYPE_ICONS[type] || { Icon: Package, label: type };
  const typeMeta = types.find((t) => t.key === type) || {};
  const fieldSpecs = typeMeta.fields || [];

  return (
    <div className="space-y-4" data-testid="admin-content-tab">
      <DemoPurgeCard onPurged={load} />
      <div className="flex items-center gap-2">
        <activeMeta.Icon className="w-4 h-4 text-teal-700" />
        <h3 className="font-display text-xl font-black tracking-tighter flex-1">
          Content <span className="text-slate-400 font-mono text-sm ml-2">{total} {activeMeta.label.toLowerCase()}</span>
        </h3>
        <Button size="sm" onClick={() => setEditing({})} className="bg-slate-900 hover:bg-slate-800" data-testid="admin-content-new">
          <Plus className="w-3.5 h-3.5 mr-1" /> New
        </Button>
        {selected.size > 0 && (
          <Button size="sm" variant="destructive" onClick={bulkDelete} className="bg-red-600 hover:bg-red-700" data-testid="admin-content-bulk-delete">
            <Trash2 className="w-3.5 h-3.5 mr-1" /> Delete {selected.size}
          </Button>
        )}
      </div>

      {/* Type pills */}
      <div className="flex flex-wrap gap-2" data-testid="admin-content-type-pills">
        {TYPE_ORDER.map((k) => {
          const meta = TYPE_ICONS[k];
          const isActive = type === k;
          const Icon = meta.Icon;
          return (
            <button
              key={k}
              type="button"
              onClick={() => setType(k)}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 border font-mono text-[11px] uppercase tracking-widest transition-colors ${
                isActive
                  ? "bg-slate-900 text-white border-slate-900"
                  : "bg-white text-slate-700 border-slate-300 hover:border-slate-900"
              }`}
              data-testid={`admin-content-type-${k}`}
            >
              <Icon className="w-3.5 h-3.5" />
              <span className="font-bold">{meta.label}</span>
            </button>
          );
        })}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[240px]">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={`Search ${activeMeta.label.toLowerCase()}…`}
            className="pl-9"
            data-testid="admin-content-search"
          />
        </div>
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="w-[160px]" data-testid="admin-content-status-filter">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="completed">Completed</SelectItem>
            <SelectItem value="deleted">Deleted</SelectItem>
            <SelectItem value="cancelled">Cancelled</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      <div className="border border-slate-200 divide-y divide-slate-100">
        <div className="hidden sm:grid grid-cols-12 gap-2 px-3 py-2 bg-slate-50 text-[10px] font-mono uppercase tracking-widest text-slate-500 items-center">
          <div className="col-span-1 flex justify-center">
            <input type="checkbox" checked={selected.size > 0 && selected.size === items.length} onChange={toggleAll} data-testid="admin-content-select-all" />
          </div>
          <div className="col-span-5">Title</div>
          <div className="col-span-2 text-right">Price</div>
          <div className="col-span-2">Status</div>
          <div className="col-span-2 text-right">Actions</div>
        </div>
        {loading && <div className="p-6 text-sm text-slate-500">Loading…</div>}
        {!loading && items.length === 0 && (
          <div className="p-6 text-sm text-slate-500" data-testid="admin-content-empty">
            No {activeMeta.label.toLowerCase()} match your filters.
          </div>
        )}
        {!loading && items.map((it) => {
          const priceVal =
            it.price != null ? it.price :
            it.price_per_night != null ? it.price_per_night :
            it.pay_rate != null ? it.pay_rate :
            it.bonus_amount != null ? it.bonus_amount : null;
          const priceSuffix = it.price_per_night != null ? " / night" : "";
          return (
            <div key={it.id} className="grid grid-cols-12 gap-2 items-center px-3 py-2.5 text-sm hover:bg-slate-50" data-testid={`admin-content-row-${it.id}`}>
              <div className="col-span-1 flex justify-center">
                <input type="checkbox" checked={selected.has(it.id)} onChange={() => toggleOne(it.id)} data-testid={`admin-content-check-${it.id}`} />
              </div>
              <div className="col-span-11 sm:col-span-5">
                <div className="font-display font-bold text-slate-900 truncate">{it.title || it.name || it.question || it.city || "(untitled)"}{it.is_demo && <span className="ml-2 text-[9px] font-mono uppercase bg-amber-100 text-amber-800 px-1">demo</span>}</div>
                <div className="text-xs text-slate-500 font-mono truncate">{it.seller_name || it.host_name || it.owner_name || it.customer_name || it.retailer_label || it.slug || it.category || (it.topic && `${it.topic} · #${it.position}`) || it.id.slice(0, 8)}</div>
              </div>
              <div className="col-span-4 sm:col-span-2 text-right font-mono">
                {priceVal != null ? `${formatPrice(priceVal)}${priceSuffix}` : "—"}
              </div>
              <div className="col-span-4 sm:col-span-2 text-[10px] font-mono uppercase tracking-widest text-slate-600">{it.status || (it.is_active === false ? "inactive" : it.is_active ? "active" : "—")}</div>
              <div className="col-span-4 sm:col-span-2 text-right flex justify-end gap-1">
                <Button size="sm" variant="outline" className="h-7 px-2" onClick={() => setEditing(it)} data-testid={`admin-content-edit-${it.id}`}>Edit</Button>
                <Button size="sm" variant="ghost" className="h-7 px-2 text-red-600 hover:text-red-800 hover:bg-red-50" onClick={() => del(it)} data-testid={`admin-content-del-${it.id}`}>
                  <Trash2 className="w-3.5 h-3.5" />
                </Button>
              </div>
            </div>
          );
        })}
      </div>

      {editing && (
        <ContentEditDialog
          type={type}
          item={editing}
          fieldSpecs={fieldSpecs}
          singular={typeMeta.label}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); load(); }}
        />
      )}
    </div>
  );
}

function FieldInput({ spec, value, onChange }) {
  const tid = `admin-content-edit-${spec.name}`;
  if (spec.kind === "bool") return <div><Switch checked={!!value} onCheckedChange={onChange} data-testid={tid} /></div>;
  if (spec.kind === "select") {
    return (
      <Select value={value || "__none"} onValueChange={(v) => onChange(v === "__none" ? "" : v)}>
        <SelectTrigger data-testid={tid}><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value="__none">—</SelectItem>
          {spec.options.map((o) => <SelectItem key={o} value={o}>{o.replace(/_/g, " ")}</SelectItem>)}
        </SelectContent>
      </Select>
    );
  }
  if (spec.kind === "textarea" || spec.kind === "json") {
    return <Textarea rows={spec.name === "body_md" ? 10 : 4} className={spec.kind === "json" ? "font-mono text-xs" : ""} value={value ?? ""} onChange={(e) => onChange(e.target.value)} data-testid={tid} />;
  }
  const type = spec.kind === "number" || spec.kind === "int" ? "number" : "text";
  return <Input type={type} step={spec.kind === "int" ? "1" : "any"} value={value ?? ""} onChange={(e) => onChange(e.target.value)} placeholder={spec.kind === "list" ? "comma, separated, values" : ""} data-testid={tid} />;
}

function toFormValue(spec, v) {
  if (v == null) return spec.kind === "bool" ? false : "";
  if (spec.kind === "list") return Array.isArray(v) ? v.join(", ") : v;
  if (spec.kind === "json") return typeof v === "string" ? v : JSON.stringify(v, null, 2);
  return v;
}

function ContentEditDialog({ type, item, fieldSpecs, singular, onClose, onSaved }) {
  const isNew = !item.id;
  const [form, setForm] = useState(() => Object.fromEntries(fieldSpecs.map((f) => [
    f.name, isNew && f.name === "is_active" ? true : toFormValue(f, item[f.name]),
  ])));
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    try {
      const updates = {};
      fieldSpecs.forEach((f) => {
        const v = form[f.name];
        const orig = toFormValue(f, item[f.name]);
        if (!isNew && v === orig) return;
        if (isNew && (v === "" || v == null || (f.kind === "bool" && v === false && f.name !== "is_active"))) return;
        updates[f.name] = v;
      });
      if (isNew) await api.post(`/admin/content/${type}`, { updates });
      else await api.patch(`/admin/content/${type}/${item.id}`, { updates });
      toast.success(isNew ? "Created" : "Updated");
      onSaved();
    } catch (e) {
      toast.error(formatApiError(e));
    } finally { setSaving(false); }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-2xl" data-testid="admin-content-edit-dialog">
        <DialogHeader>
          <DialogTitle>{isNew ? "New" : "Edit"} {(singular || type).toLowerCase()}</DialogTitle>
          <DialogDescription>{isNew ? "Fill in the fields you need — blanks are skipped." : "Only changed fields are saved."}</DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-h-[62vh] overflow-y-auto pr-1">
          {fieldSpecs.map((f) => (
            <div key={f.name} className={f.kind === "textarea" || f.kind === "json" ? "sm:col-span-2" : ""}>
              <Label className="overline text-[10px]">{f.name.replace(/_/g, " ")}</Label>
              <FieldInput spec={f} value={form[f.name]} onChange={(v) => setForm((prev) => ({ ...prev, [f.name]: v }))} />
            </div>
          ))}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={save} disabled={saving} className="bg-slate-900 hover:bg-slate-800" data-testid="admin-content-edit-save">
            <Save className="w-3.5 h-3.5 mr-1" /> {saving ? "Saving…" : isNew ? "Create" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

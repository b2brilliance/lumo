import React, { useEffect, useState } from "react";import { api, formatApiError } from "@/lib/api";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Plus, Trash2, Edit3, ExternalLink, Search, Star, Wand2, Eye, EyeOff, Loader2, Upload, Download,
} from "lucide-react";

/* Admin Shop Manager — list + add/import + edit + delete affiliate
 * products displayed on the public /shop page. */

const RETAILER_OPTIONS = [
  { value: "amazon",     label: "Amazon" },
  { value: "best_buy",   label: "Best Buy" },
  { value: "wayfair",    label: "Wayfair" },
  { value: "target",     label: "Target" },
  { value: "walmart",    label: "Walmart" },
  { value: "home_depot", label: "Home Depot" },
  { value: "lowes",      label: "Lowe's" },
  { value: "etsy",       label: "Etsy" },
  { value: "ebay",       label: "eBay" },
  { value: "other",      label: "Other" },
];

const CATEGORY_OPTIONS = [
  "electronics", "home", "furniture", "gaming", "apparel", "beauty",
  "outdoor", "kitchen", "tools", "office", "other",
];

const EMPTY_DRAFT = {
  title: "", description: "", image_url: "",
  price: "", price_display: "",
  retailer: "amazon", retailer_label: "Amazon",
  affiliate_url: "",
  category: "other",
  rating: "", review_count: "",
  is_active: true, is_featured: false,
};

export default function ShopTab() {
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [retailer, setRetailer] = useState("");
  const [editing, setEditing] = useState(null);
  const [importUrl, setImportUrl] = useState("");
  const [importing, setImporting] = useState(false);
  const [csvBusy, setCsvBusy] = useState(false);
  const csvInputRef = React.useRef(null);

  const uploadCsv = async (file) => {
    if (!file) return;
    setCsvBusy(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const { data } = await api.post("/admin/shop/products/csv", fd, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      if (data.inserted > 0) toast.success(`Imported ${data.inserted} products`);
      else toast.info("No rows imported");
      if (data.error_count > 0) {
        toast.warning(`${data.error_count} rows skipped — check CSV headers`);
        // eslint-disable-next-line no-console
        console.warn("CSV import errors:", data.errors);
      }
      load();
    } catch (err) {
      toast.error(formatApiError(err));
    } finally {
      setCsvBusy(false);
      if (csvInputRef.current) csvInputRef.current.value = "";
    }
  };

  const downloadTemplate = async () => {
    try {
      const { data } = await api.get("/admin/shop/products/csv-template", { responseType: "blob" });
      const url = window.URL.createObjectURL(data);
      const a = document.createElement("a");
      a.href = url; a.download = "lumo-shop-template.csv"; a.click();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      toast.error(formatApiError(err));
    }
  };

  const load = async () => {
    setLoading(true);
    try {
      const params = { limit: 200 };
      if (retailer) params.retailer = retailer;
      if (q.trim()) params.q = q.trim();
      const { data } = await api.get("/shop/products", { params });
      setItems(data.items || []);
      setTotal(data.total || 0);
    } catch (err) {
      toast.error(formatApiError(err));
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [retailer]);

  const openNew = () => setEditing({ ...EMPTY_DRAFT, _isNew: true });
  const openEdit = (p) => setEditing({ ...p, _isNew: false });
  const close = () => { setEditing(null); setImportUrl(""); };

  const save = async () => {
    if (!editing.title || !editing.image_url || !editing.affiliate_url) {
      toast.error("Title, image URL and affiliate URL are required");
      return;
    }
    const payload = {
      ...editing,
      price: editing.price === "" || editing.price == null ? null : parseFloat(editing.price),
      rating: editing.rating === "" || editing.rating == null ? null : parseFloat(editing.rating),
      review_count: editing.review_count === "" || editing.review_count == null ? null : parseInt(editing.review_count, 10),
    };
    delete payload._isNew;
    delete payload.id;
    delete payload.click_count;
    delete payload.created_at;
    delete payload.updated_at;
    try {
      if (editing._isNew) {
        await api.post("/admin/shop/products", payload);
        toast.success("Product added");
      } else {
        await api.patch(`/admin/shop/products/${editing.id}`, payload);
        toast.success("Product updated");
      }
      close();
      load();
    } catch (err) {
      toast.error(formatApiError(err));
    }
  };

  const del = async (p) => {
    if (!window.confirm(`Delete "${p.title}"?`)) return;
    try {
      await api.delete(`/admin/shop/products/${p.id}`);
      toast.success("Deleted");
      load();
    } catch (err) {
      toast.error(formatApiError(err));
    }
  };

  const toggleActive = async (p) => {
    try {
      await api.patch(`/admin/shop/products/${p.id}`, { is_active: !p.is_active });
      load();
    } catch (err) {
      toast.error(formatApiError(err));
    }
  };

  const doImport = async () => {
    if (!importUrl.trim()) { toast.error("Paste a retailer product URL"); return; }
    setImporting(true);
    try {
      const { data } = await api.post("/admin/shop/products/auto-import", { url: importUrl.trim() });
      const d = data.draft || {};
      setEditing({
        ...EMPTY_DRAFT,
        ...d,
        price: d.price ?? "",
        _isNew: true,
      });
      setImportUrl("");
      toast.success("Draft populated — review and save");
    } catch (err) {
      toast.error(formatApiError(err));
    } finally {
      setImporting(false);
    }
  };

  return (
    <div className="space-y-6" data-testid="admin-shop-tab">
      {/* Header + import + add */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="overline">Shop Manager</div>
          <h2 className="font-display text-2xl font-black tracking-tight">Affiliate products ({total})</h2>
          <p className="text-sm text-slate-500 mt-1">Add or hide products shown on the public /shop page.</p>
        </div>
        <div className="flex flex-col sm:flex-row gap-2">
          <div className="flex items-center gap-2 border border-slate-200 px-3 py-1.5 focus-within:border-slate-900 transition-colors">
            <Wand2 className="w-4 h-4 text-slate-500" />
            <input
              value={importUrl}
              onChange={(e) => setImportUrl(e.target.value)}
              placeholder="Paste retailer URL to auto-import…"
              className="text-sm bg-transparent outline-none w-72"
              data-testid="admin-shop-import-url"
              onKeyDown={(e) => { if (e.key === "Enter") doImport(); }}
            />
            <Button
              size="sm"
              disabled={importing}
              onClick={doImport}
              className="bg-slate-900 hover:bg-slate-800 rounded-none"
              data-testid="admin-shop-import-submit"
            >
              {importing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "Import"}
            </Button>
          </div>
          <Button onClick={openNew} className="bg-slate-900 hover:bg-slate-800" data-testid="admin-shop-new">
            <Plus className="w-4 h-4 mr-1" /> New product
          </Button>
          <input
            ref={csvInputRef}
            type="file"
            accept=".csv,text/csv"
            onChange={(e) => uploadCsv(e.target.files?.[0])}
            className="hidden"
            data-testid="admin-shop-csv-input"
          />
          <Button
            onClick={() => csvInputRef.current?.click()}
            disabled={csvBusy}
            variant="outline"
            className="rounded-none"
            data-testid="admin-shop-csv-upload"
          >
            {csvBusy ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Upload className="w-4 h-4 mr-1" />}
            {csvBusy ? "Uploading…" : "Upload CSV"}
          </Button>
          <Button
            onClick={downloadTemplate}
            variant="ghost"
            className="text-slate-600"
            title="Download a CSV template with correct headers"
            data-testid="admin-shop-csv-template"
          >
            <Download className="w-4 h-4 mr-1" /> Template
          </Button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2 items-center">
        <div className="relative">
          <Search className="w-4 h-4 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") load(); }}
            placeholder="Search title/description"
            className="pl-8 w-72"
            data-testid="admin-shop-search"
          />
        </div>
        <select
          value={retailer}
          onChange={(e) => setRetailer(e.target.value)}
          className="border border-slate-300 h-10 px-3 font-mono text-sm bg-white"
          data-testid="admin-shop-filter-retailer"
        >
          <option value="">All retailers</option>
          {RETAILER_OPTIONS.map((r) => (
            <option key={r.value} value={r.value}>{r.label}</option>
          ))}
        </select>
        <Button variant="ghost" size="sm" onClick={load} className="text-slate-600" data-testid="admin-shop-refresh">Refresh</Button>
      </div>

      {/* Products list */}
      <div className="border border-slate-200 divide-y divide-slate-100" data-testid="admin-shop-list">
        {loading ? (
          <div className="p-6 text-sm text-slate-500">Loading…</div>
        ) : items.length === 0 ? (
          <div className="p-6 text-sm text-slate-500">No products match your filters.</div>
        ) : (
          items.map((p) => (
            <div key={p.id} className="p-3 flex items-center gap-3" data-testid={`admin-shop-row-${p.id}`}>
              <img
                src={p.image_url}
                alt={p.title}
                className="w-14 h-14 object-contain bg-slate-50 flex-shrink-0"
                onError={(e) => { e.currentTarget.src = "https://placehold.co/80/f5f5f5/999999?text=?"; }}
              />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-mono text-[10px] uppercase tracking-widest px-1.5 py-0.5 bg-slate-100">{p.retailer_label || p.retailer}</span>
                  {p.is_featured && <Star className="w-3.5 h-3.5 text-amber-500 fill-current" />}
                  {!p.is_active && <span className="text-[10px] font-mono uppercase tracking-widest text-red-600">Hidden</span>}
                </div>
                <div className="font-display font-semibold text-sm mt-0.5 truncate">{p.title}</div>
                <div className="text-xs text-slate-500 flex items-center gap-3 mt-0.5">
                  <span>{p.price_display || (p.price ? `$${p.price.toFixed(2)}` : "—")}</span>
                  <span>· {p.category}</span>
                  <span>· {p.click_count || 0} clicks</span>
                </div>
              </div>
              <a href={p.affiliate_url} target="_blank" rel="noopener noreferrer" className="text-slate-400 hover:text-slate-900 p-2" title="Open retailer link">
                <ExternalLink className="w-4 h-4" />
              </a>
              <button
                onClick={() => toggleActive(p)}
                className="text-slate-400 hover:text-slate-900 p-2"
                title={p.is_active ? "Hide from /shop" : "Show on /shop"}
                data-testid={`admin-shop-toggle-${p.id}`}
              >
                {p.is_active ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
              </button>
              <button
                onClick={() => openEdit(p)}
                className="text-slate-400 hover:text-slate-900 p-2"
                data-testid={`admin-shop-edit-${p.id}`}
              >
                <Edit3 className="w-4 h-4" />
              </button>
              <button
                onClick={() => del(p)}
                className="text-slate-400 hover:text-red-600 p-2"
                data-testid={`admin-shop-delete-${p.id}`}
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ))
        )}
      </div>

      {/* Edit dialog */}
      <Dialog open={!!editing} onOpenChange={(v) => !v && close()}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto" data-testid="admin-shop-dialog">
          <DialogHeader>
            <DialogTitle>{editing?._isNew ? "New product" : "Edit product"}</DialogTitle>
          </DialogHeader>
          {editing && (
            <div className="grid gap-4">
              <Field label="Title *"><Input value={editing.title} onChange={(e) => setEditing({ ...editing, title: e.target.value })} data-testid="admin-shop-field-title" /></Field>
              <Field label="Description"><Textarea rows={3} value={editing.description || ""} onChange={(e) => setEditing({ ...editing, description: e.target.value })} data-testid="admin-shop-field-description" /></Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Image URL *"><Input value={editing.image_url} onChange={(e) => setEditing({ ...editing, image_url: e.target.value })} data-testid="admin-shop-field-image" /></Field>
                <Field label="Affiliate URL *"><Input value={editing.affiliate_url} onChange={(e) => setEditing({ ...editing, affiliate_url: e.target.value })} data-testid="admin-shop-field-url" /></Field>
              </div>
              {editing.image_url && (
                <img src={editing.image_url} alt="" className="w-24 h-24 object-contain bg-slate-50 border border-slate-200" onError={(e) => { e.currentTarget.style.display = "none"; }} />
              )}
              <div className="grid grid-cols-3 gap-3">
                <Field label="Price (number)"><Input type="number" step="0.01" value={editing.price} onChange={(e) => setEditing({ ...editing, price: e.target.value })} data-testid="admin-shop-field-price" /></Field>
                <Field label="Display price"><Input value={editing.price_display || ""} onChange={(e) => setEditing({ ...editing, price_display: e.target.value })} placeholder="$49.99 or From $19" /></Field>
                <Field label="Category">
                  <select
                    value={editing.category}
                    onChange={(e) => setEditing({ ...editing, category: e.target.value })}
                    className="w-full h-10 border border-slate-300 px-3 font-mono text-sm bg-white"
                    data-testid="admin-shop-field-category"
                  >
                    {CATEGORY_OPTIONS.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                </Field>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <Field label="Retailer">
                  <select
                    value={editing.retailer}
                    onChange={(e) => {
                      const opt = RETAILER_OPTIONS.find((r) => r.value === e.target.value);
                      setEditing({ ...editing, retailer: e.target.value, retailer_label: opt?.label || e.target.value });
                    }}
                    className="w-full h-10 border border-slate-300 px-3 font-mono text-sm bg-white"
                    data-testid="admin-shop-field-retailer"
                  >
                    {RETAILER_OPTIONS.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
                  </select>
                </Field>
                <Field label="Rating (0-5)"><Input type="number" step="0.1" min="0" max="5" value={editing.rating} onChange={(e) => setEditing({ ...editing, rating: e.target.value })} /></Field>
                <Field label="Review count"><Input type="number" value={editing.review_count} onChange={(e) => setEditing({ ...editing, review_count: e.target.value })} /></Field>
              </div>
              <div className="flex items-center gap-6 pt-2">
                <label className="flex items-center gap-2 text-sm cursor-pointer" data-testid="admin-shop-field-featured-wrap">
                  <input type="checkbox" checked={editing.is_featured} onChange={(e) => setEditing({ ...editing, is_featured: e.target.checked })} data-testid="admin-shop-field-featured" />
                  Featured (shows in the top strip)
                </label>
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <input type="checkbox" checked={editing.is_active} onChange={(e) => setEditing({ ...editing, is_active: e.target.checked })} data-testid="admin-shop-field-active" />
                  Active (visible on /shop)
                </label>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="ghost" onClick={close}>Cancel</Button>
            <Button onClick={save} className="bg-slate-900 hover:bg-slate-800" data-testid="admin-shop-save">Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <div>
      <Label className="text-xs overline">{label}</Label>
      <div className="mt-1">{children}</div>
    </div>
  );
}

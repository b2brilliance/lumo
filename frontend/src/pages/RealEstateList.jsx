import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, formatApiError } from "@/lib/api";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { useAuth } from "@/lib/auth";
import { toast } from "sonner";

const PROPERTY_TYPES = ["house", "condo", "townhouse", "apartment", "multi_family", "villa", "cabin", "studio", "land", "commercial"];
const KINDS = [["sale", "For sale"], ["rent", "Long-term rent"], ["short_stay", "Short stay / vacation"], ["room", "Room / shared"]];
const PRICE_HINT = { sale: "Asking price", rent: "Rent per month", room: "Rent per month", short_stay: "Price per night" };

export default function RealEstateList() {
  const { user } = useAuth();
  const nav = useNavigate();
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({
    listing_kind: "sale", property_type: "house",
    title: "", description: "", price: "", address: "", city: "", state: "", country: "US",
    bedrooms: "", bathrooms: "", sqft: "", lot_size_sqft: "", year_built: "", hoa_monthly: "", parking_spots: "",
    photos_text: "", contact_email: user?.email || "", contact_phone: "",
    currency: "USD", max_guests: "", amenities: "", available_from: "", furnished: "",
  });
  const [uploading, setUploading] = useState(false);
  const upload = async (e) => {
    const files = [...(e.target.files || [])].slice(0, 8);
    if (!files.length) return;
    setUploading(true);
    try {
      const urls = [];
      for (const f of files) {
        const fd = new FormData(); fd.append("file", f);
        const { data } = await api.post("/media/upload", fd);
        urls.push(data.media_url);
      }
      setForm((prev) => ({ ...prev, photos_text: [prev.photos_text, ...urls].filter(Boolean).join("\n") }));
      toast.success(`${urls.length} photo${urls.length > 1 ? "s" : ""} uploaded`);
    } catch (err) { toast.error(formatApiError(err)); } finally { setUploading(false); e.target.value = ""; }
  };
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e?.target ? e.target.value : e }));

  if (!user) { nav("/signin"); return null; }

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      const body = {
        listing_kind: form.listing_kind,
        property_type: form.property_type,
        title: form.title,
        description: form.description || null,
        price: parseFloat(form.price),
        address: form.address,
        city: form.city || null, state: form.state || null, country: form.country || null,
        bedrooms: form.bedrooms ? parseFloat(form.bedrooms) : null,
        bathrooms: form.bathrooms ? parseFloat(form.bathrooms) : null,
        sqft: form.sqft ? parseFloat(form.sqft) : null,
        lot_size_sqft: form.lot_size_sqft ? parseFloat(form.lot_size_sqft) : null,
        year_built: form.year_built ? parseInt(form.year_built, 10) : null,
        hoa_monthly: form.hoa_monthly ? parseFloat(form.hoa_monthly) : null,
        parking_spots: form.parking_spots ? parseInt(form.parking_spots, 10) : null,
        photos: form.photos_text.split(/[\n,]+/).map((s) => s.trim()).filter(Boolean).slice(0, 12),
        currency: (form.currency || "USD").toUpperCase(),
        max_guests: form.max_guests ? parseInt(form.max_guests, 10) : null,
        amenities: form.amenities.split(",").map((s) => s.trim()).filter(Boolean),
        available_from: form.available_from || null,
        furnished: form.furnished === "" ? null : form.furnished === "yes",
        contact_email: form.contact_email || null,
        contact_phone: form.contact_phone || null,
      };
      const { data } = await api.post("/real-estate", body);
      toast.success("Listing live");
      nav(`/real-estate/${data.id}`);
    } catch (e) { toast.error(formatApiError(e)); }
    finally { setBusy(false); }
  };

  return (
    <div className="max-w-3xl mx-auto px-6 py-8" data-testid="re-list-page">
      <p className="text-[11px] font-mono tracking-[0.2em] text-slate-500 uppercase">Lumo · Marketplace</p>
      <h1 className="font-display text-3xl sm:text-4xl font-black tracking-tight">List a property</h1>
      <p className="text-slate-600 mt-1 text-sm">Free to list. Lumo only takes a small fee when the deal closes.</p>

      <form onSubmit={submit} className="mt-6 space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>Listing type</Label>
            <Select value={form.listing_kind} onValueChange={set("listing_kind")}>
              <SelectTrigger data-testid="re-form-kind"><SelectValue /></SelectTrigger>
              <SelectContent>{KINDS.map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div>
            <Label>Property type</Label>
            <Select value={form.property_type} onValueChange={set("property_type")}>
              <SelectTrigger data-testid="re-form-type"><SelectValue /></SelectTrigger>
              <SelectContent>{PROPERTY_TYPES.map((t) => <SelectItem key={t} value={t}>{t.replace("_", " ")}</SelectItem>)}</SelectContent>
            </Select>
          </div>
        </div>

        <div>
          <Label>Title</Label>
          <Input data-testid="re-form-title" required value={form.title} onChange={set("title")} placeholder="Sunny 2BR with deck" />
        </div>

        <div className="grid grid-cols-3 gap-3">
          <div className="col-span-2">
            <Label>{PRICE_HINT[form.listing_kind]}</Label>
            <Input data-testid="re-form-price" required type="number" min="1" value={form.price} onChange={set("price")} placeholder={form.listing_kind === "sale" ? "895000" : form.listing_kind === "short_stay" ? "120" : "2400"} />
          </div>
          <div>
            <Label>Currency</Label>
            <Input data-testid="re-form-currency" maxLength={3} value={form.currency} onChange={set("currency")} placeholder="USD, EUR, GBP…" />
          </div>
        </div>
        <div>
          <Label>Street address (we pin it on the map automatically)</Label>
          <Input data-testid="re-form-address" required value={form.address} onChange={set("address")} placeholder="Rua Augusta 100, Lisbon — or 123 Main St, Brooklyn, NY" />
        </div>

        <div className="grid grid-cols-3 gap-3">
          <div><Label>City</Label><Input data-testid="re-form-city" value={form.city} onChange={set("city")} /></div>
          <div><Label>State / region</Label><Input data-testid="re-form-state" value={form.state} onChange={set("state")} /></div>
          <div><Label>Country</Label><Input data-testid="re-form-country" value={form.country} onChange={set("country")} /></div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div><Label>Bedrooms</Label><Input data-testid="re-form-beds" type="number" step="0.5" value={form.bedrooms} onChange={set("bedrooms")} /></div>
          <div><Label>Bathrooms</Label><Input data-testid="re-form-baths" type="number" step="0.5" value={form.bathrooms} onChange={set("bathrooms")} /></div>
          <div><Label>Sqft</Label><Input data-testid="re-form-sqft" type="number" value={form.sqft} onChange={set("sqft")} /></div>
          <div><Label>Year built</Label><Input data-testid="re-form-year" type="number" value={form.year_built} onChange={set("year_built")} /></div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          <div><Label>Lot size (sqft)</Label><Input data-testid="re-form-lot" type="number" value={form.lot_size_sqft} onChange={set("lot_size_sqft")} /></div>
          <div><Label>HOA / month</Label><Input data-testid="re-form-hoa" type="number" value={form.hoa_monthly} onChange={set("hoa_monthly")} /></div>
          <div><Label>Parking spots</Label><Input data-testid="re-form-parking" type="number" value={form.parking_spots} onChange={set("parking_spots")} /></div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {(form.listing_kind === "short_stay" || form.listing_kind === "room") && (
            <div><Label>Max guests</Label><Input data-testid="re-form-guests" type="number" value={form.max_guests} onChange={set("max_guests")} /></div>
          )}
          {form.listing_kind !== "sale" && (
            <div><Label>Available from</Label><Input data-testid="re-form-available" type="date" value={form.available_from} onChange={set("available_from")} /></div>
          )}
          {form.listing_kind !== "sale" && (
            <div>
              <Label>Furnished?</Label>
              <Select value={form.furnished || "unset"} onValueChange={(v) => setForm((f) => ({ ...f, furnished: v === "unset" ? "" : v }))}>
                <SelectTrigger data-testid="re-form-furnished"><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="unset">Not specified</SelectItem><SelectItem value="yes">Furnished</SelectItem><SelectItem value="no">Unfurnished</SelectItem></SelectContent>
              </Select>
            </div>
          )}
        </div>
        <div>
          <Label>Amenities (comma separated)</Label>
          <Input data-testid="re-form-amenities" value={form.amenities} onChange={set("amenities")} placeholder="WiFi, Parking, Pool, Washer, Pet friendly" />
        </div>

        <div>
          <Label>Description</Label>
          <Textarea data-testid="re-form-desc" rows={4} value={form.description} onChange={set("description")} placeholder="Highlights, neighborhood, what makes this place special." />
        </div>

        <div>
          <div className="flex items-center justify-between">
            <Label>Photos (upload or paste URLs, one per line)</Label>
            <label className="text-xs font-mono uppercase tracking-widest border border-slate-300 px-2 py-1 cursor-pointer hover:border-slate-900">
              {uploading ? "Uploading…" : "Upload photos"}
              <input type="file" accept="image/*" multiple className="hidden" onChange={upload} data-testid="re-form-upload" />
            </label>
          </div>
          <Textarea data-testid="re-form-photos" rows={3} value={form.photos_text} onChange={set("photos_text")} placeholder="https://… (paste hosted image URLs, one per line)" />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div><Label>Contact email (masked publicly)</Label><Input data-testid="re-form-email" type="email" value={form.contact_email} onChange={set("contact_email")} /></div>
          <div><Label>Contact phone (masked publicly)</Label><Input data-testid="re-form-phone" value={form.contact_phone} onChange={set("contact_phone")} /></div>
        </div>

        <div className="flex gap-2 pt-2">
          <Button type="button" variant="ghost" onClick={() => nav(-1)}>Cancel</Button>
          <Button type="submit" disabled={busy} className="bg-slate-900 hover:bg-slate-800" data-testid="re-form-submit">{busy ? "Publishing…" : "Publish listing"}</Button>
        </div>
      </form>
    </div>
  );
}

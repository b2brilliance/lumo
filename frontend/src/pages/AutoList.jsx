import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, formatApiError } from "@/lib/api";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { useAuth } from "@/lib/auth";
import { toast } from "sonner";

export default function AutoList() {
  const { user } = useAuth();
  const nav = useNavigate();
  const [busy, setBusy] = useState(false);
  const [constants, setConstants] = useState({ auto_makes: [], auto_body_styles: [], auto_transmissions: [], auto_fuels: [], auto_conditions: [] });
  const [form, setForm] = useState({
    title: "", description: "", price: "", year: new Date().getFullYear() - 1, make: "", model: "", trim: "",
    mileage: "", body_style: "", transmission: "", fuel: "", condition: "Used",
    exterior_color: "", interior_color: "", drivetrain: "", vin: "", city: "", state: "", country: "US",
    photos_text: "", contact_email: user?.email || "", contact_phone: "",
  });
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e?.target ? e.target.value : e }));

  useEffect(() => { api.get("/classifieds/constants").then(({ data }) => setConstants(data)); }, []);

  if (!user) { nav("/login"); return null; }

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      const body = {
        title: form.title, description: form.description || null,
        price: parseFloat(form.price), year: parseInt(form.year, 10),
        make: form.make, model: form.model, trim: form.trim || null,
        mileage: form.mileage ? parseFloat(form.mileage) : null,
        body_style: form.body_style || null, transmission: form.transmission || null,
        fuel: form.fuel || null, condition: form.condition || null,
        exterior_color: form.exterior_color || null, interior_color: form.interior_color || null,
        drivetrain: form.drivetrain || null, vin: form.vin || null,
        city: form.city || null, state: form.state || null, country: form.country || null,
        photos: form.photos_text.split(/[\n,]+/).map((s) => s.trim()).filter(Boolean),
        contact_email: form.contact_email || null, contact_phone: form.contact_phone || null,
      };
      const { data } = await api.post("/autos", body);
      toast.success("Listing live");
      nav(`/autos/${data.id}`);
    } catch (e) { toast.error(formatApiError(e)); }
    finally { setBusy(false); }
  };

  return (
    <div className="max-w-3xl mx-auto px-6 py-8" data-testid="auto-list-page">
      <p className="text-[11px] font-mono tracking-[0.2em] text-slate-500 uppercase">Lumo · Marketplace</p>
      <h1 className="font-display text-3xl sm:text-4xl font-black tracking-tight">Sell your car</h1>
      <p className="text-slate-600 mt-1 text-sm">Free to list. Talk to buyers directly through Lumo's in-app chat — your contact stays masked.</p>

      <form onSubmit={submit} className="mt-6 space-y-4">
        <div>
          <Label>Headline</Label>
          <Input data-testid="auto-form-title" required value={form.title} onChange={set("title")} placeholder="2021 Toyota Tacoma TRD Off-Road — 1 owner" />
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div><Label>Year</Label><Input data-testid="auto-form-year" required type="number" min="1900" max="2100" value={form.year} onChange={set("year")} /></div>
          <div>
            <Label>Make</Label>
            <Select value={form.make} onValueChange={set("make")}>
              <SelectTrigger data-testid="auto-form-make"><SelectValue placeholder="Select" /></SelectTrigger>
              <SelectContent className="max-h-72">{constants.auto_makes.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div><Label>Model</Label><Input data-testid="auto-form-model" required value={form.model} onChange={set("model")} /></div>
          <div><Label>Trim</Label><Input data-testid="auto-form-trim" value={form.trim} onChange={set("trim")} /></div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div><Label>Price (USD)</Label><Input data-testid="auto-form-price" required type="number" min="1" value={form.price} onChange={set("price")} /></div>
          <div><Label>Mileage</Label><Input data-testid="auto-form-mileage" type="number" value={form.mileage} onChange={set("mileage")} /></div>
          <div>
            <Label>Condition</Label>
            <Select value={form.condition} onValueChange={set("condition")}>
              <SelectTrigger data-testid="auto-form-cond"><SelectValue /></SelectTrigger>
              <SelectContent>{constants.auto_conditions.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div>
            <Label>Body style</Label>
            <Select value={form.body_style} onValueChange={set("body_style")}>
              <SelectTrigger data-testid="auto-form-body"><SelectValue placeholder="Select" /></SelectTrigger>
              <SelectContent>{constants.auto_body_styles.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}</SelectContent>
            </Select>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div>
            <Label>Transmission</Label>
            <Select value={form.transmission} onValueChange={set("transmission")}>
              <SelectTrigger data-testid="auto-form-trans"><SelectValue placeholder="Select" /></SelectTrigger>
              <SelectContent>{constants.auto_transmissions.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div>
            <Label>Fuel</Label>
            <Select value={form.fuel} onValueChange={set("fuel")}>
              <SelectTrigger data-testid="auto-form-fuel"><SelectValue placeholder="Select" /></SelectTrigger>
              <SelectContent>{constants.auto_fuels.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div>
            <Label>Drivetrain</Label>
            <Select value={form.drivetrain} onValueChange={set("drivetrain")}>
              <SelectTrigger data-testid="auto-form-drive"><SelectValue placeholder="Select" /></SelectTrigger>
              <SelectContent>{["FWD", "RWD", "AWD", "4WD"].map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div><Label>VIN (optional)</Label><Input data-testid="auto-form-vin" value={form.vin} onChange={set("vin")} /></div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div><Label>Exterior color</Label><Input data-testid="auto-form-ext" value={form.exterior_color} onChange={set("exterior_color")} /></div>
          <div><Label>Interior color</Label><Input data-testid="auto-form-int" value={form.interior_color} onChange={set("interior_color")} /></div>
          <div><Label>City</Label><Input data-testid="auto-form-city" value={form.city} onChange={set("city")} /></div>
          <div><Label>State</Label><Input data-testid="auto-form-state" value={form.state} onChange={set("state")} /></div>
        </div>

        <div>
          <Label>Description</Label>
          <Textarea data-testid="auto-form-desc" rows={4} value={form.description} onChange={set("description")} placeholder="Service history, modifications, anything a buyer should know." />
        </div>

        <div>
          <Label>Photo URLs (one per line, max 8)</Label>
          <Textarea data-testid="auto-form-photos" rows={3} value={form.photos_text} onChange={set("photos_text")} placeholder="https://… (paste hosted image URLs, one per line)" />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div><Label>Contact email (masked publicly)</Label><Input data-testid="auto-form-email" type="email" value={form.contact_email} onChange={set("contact_email")} /></div>
          <div><Label>Contact phone (masked publicly)</Label><Input data-testid="auto-form-phone" value={form.contact_phone} onChange={set("contact_phone")} /></div>
        </div>

        <div className="flex gap-2 pt-2">
          <Button type="button" variant="ghost" onClick={() => nav(-1)}>Cancel</Button>
          <Button type="submit" disabled={busy} className="bg-slate-900 hover:bg-slate-800" data-testid="auto-form-submit">{busy ? "Publishing…" : "Publish listing"}</Button>
        </div>
      </form>
    </div>
  );
}

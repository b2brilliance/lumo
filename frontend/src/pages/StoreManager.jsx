import React, { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth";
import MediaUpload from "@/components/MediaUpload";
import { toast } from "sonner";
import { Trash2 } from "lucide-react";

export default function StoreManager({ role, section = "all" }) {
  const { user, updateMe } = useAuth();
  const sf = user.storefront || {};
  const [storeForm, setStoreForm] = useState({
    name: sf.name || user.name || "",
    address: sf.address || "",
    hours: sf.hours || "",
    logo_url: sf.logo_url || "",
    description: sf.description || "",
    category: sf.category || "",
    cuisine: sf.cuisine || "",
  });
  const [items, setItems] = useState([]);
  const [itemForm, setItemForm] = useState({
    name: "", price: "", stock: "0", description: "", category: "",
    media_url: null, media_type: null,
  });

  const load = async () => {
    const { data } = await api.get("/inventory/mine");
    setItems(data);
  };
  useEffect(() => { load(); }, []);

  const saveStore = async (e) => {
    e.preventDefault();
    try {
      const body = { ...storeForm };
      if (role !== "restaurant") delete body.cuisine;
      else delete body.category;
      const { data } = await api.put("/storefront", body);
      await updateMe({ storefront: data, name: body.name });
      toast.success("Storefront saved");
    } catch (e) {
      toast.error("Failed to save");
    }
  };

  const addItem = async (e) => {
    e.preventDefault();
    try {
      await api.post("/inventory", {
        name: itemForm.name,
        description: itemForm.description,
        price: parseFloat(itemForm.price),
        stock: parseInt(itemForm.stock || "0"),
        category: itemForm.category,
        media_url: itemForm.media_url,
        media_type: itemForm.media_type,
      });
      toast.success("Item added");
      setItemForm({ name: "", price: "", stock: "0", description: "", category: "", media_url: null, media_type: null });
      load();
    } catch (e) {
      toast.error("Failed to add item");
    }
  };

  const remove = async (id) => {
    if (!window.confirm("Delete this item?")) return;
    await api.delete(`/inventory/${id}`);
    toast.success("Deleted");
    load();
  };

  const accent = role === "restaurant" ? "bg-amber-600" : "bg-blue-600";
  const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;

  return (
    <div className="max-w-screen-2xl mx-auto px-4 sm:px-6 py-6 sm:py-8" data-testid={`seller-${section}`}>
      <div className="overline">{role === "restaurant" ? "Restaurant Hub" : "Shop Hub"}</div>
      <h1 className="font-display text-4xl font-black tracking-tighter mt-2">{storeForm.name || "Your storefront"}</h1>

      {section === "dashboard" && (
        <div className="grid grid-cols-2 gap-3 mt-6" data-testid="seller-stats">
          <div className="border border-slate-200 rounded-2xl p-4" data-testid="seller-stat-items">
            <div className="overline">{role === "restaurant" ? "Menu items" : "Products"}</div>
            <div className="font-display text-3xl font-black mt-1">{items.length}</div>
          </div>
          <div className="border border-slate-200 rounded-2xl p-4" data-testid="seller-stat-status">
            <div className="overline">Storefront</div>
            <div className="font-display text-lg font-bold mt-2">{sf.name ? "Live" : "Not set up"}</div>
          </div>
        </div>
      )}
      <div className="grid lg:grid-cols-12 gap-8 mt-8">
        {section !== "products" && <form onSubmit={saveStore} className="lg:col-span-5 border border-slate-200 p-6 space-y-4" data-testid="storefront-form">
          <div className="overline">Storefront profile</div>
          <div>
            <Label className="overline">Store name</Label>
            <Input value={storeForm.name} onChange={(e) => setStoreForm({ ...storeForm, name: e.target.value })} required data-testid="store-name" className="mt-1" />
          </div>
          <div>
            <Label className="overline">Address</Label>
            <Input value={storeForm.address} onChange={(e) => setStoreForm({ ...storeForm, address: e.target.value })} required data-testid="store-address" className="mt-1" />
          </div>
          <div>
            <Label className="overline">Hours</Label>
            <Input value={storeForm.hours} onChange={(e) => setStoreForm({ ...storeForm, hours: e.target.value })} placeholder="Mon–Fri 9am–6pm" data-testid="store-hours" className="mt-1" />
          </div>
          {role === "restaurant" ? (
            <div>
              <Label className="overline">Cuisine</Label>
              <Input value={storeForm.cuisine} onChange={(e) => setStoreForm({ ...storeForm, cuisine: e.target.value })} placeholder="Italian, BBQ…" data-testid="store-cuisine" className="mt-1" />
            </div>
          ) : (
            <div>
              <Label className="overline">Category</Label>
              <Input value={storeForm.category} onChange={(e) => setStoreForm({ ...storeForm, category: e.target.value })} placeholder="Apparel, Books, Home…" data-testid="store-category" className="mt-1" />
            </div>
          )}
          <div>
            <Label className="overline">Logo URL</Label>
            <Input value={storeForm.logo_url} onChange={(e) => setStoreForm({ ...storeForm, logo_url: e.target.value })} placeholder="https://…" data-testid="store-logo" className="mt-1" />
          </div>
          <div>
            <Label className="overline">Description</Label>
            <Textarea value={storeForm.description} onChange={(e) => setStoreForm({ ...storeForm, description: e.target.value })} data-testid="store-description" className="mt-1" />
          </div>
          <Button type="submit" className={`w-full ${accent} hover:opacity-90`} data-testid="storefront-save">Save storefront</Button>
        </form>}

        {section !== "dashboard" && <div className={`${section === "products" ? "lg:col-span-12" : "lg:col-span-7"} space-y-8`}>
          <form onSubmit={addItem} className="border border-slate-200 p-6 space-y-4" data-testid="item-form">
            <div className="overline">{role === "restaurant" ? "Add menu item" : "Add product"}</div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="overline">Name</Label>
                <Input value={itemForm.name} onChange={(e) => setItemForm({ ...itemForm, name: e.target.value })} required data-testid="item-name" className="mt-1" />
              </div>
              <div>
                <Label className="overline">Category</Label>
                <Input value={itemForm.category} onChange={(e) => setItemForm({ ...itemForm, category: e.target.value })} data-testid="item-category" className="mt-1" />
              </div>
              <div>
                <Label className="overline">Price ($)</Label>
                <Input type="number" step="0.01" value={itemForm.price} onChange={(e) => setItemForm({ ...itemForm, price: e.target.value })} required data-testid="item-price" className="mt-1" />
              </div>
              <div>
                <Label className="overline">Stock</Label>
                <Input type="number" value={itemForm.stock} onChange={(e) => setItemForm({ ...itemForm, stock: e.target.value })} data-testid="item-stock" className="mt-1" />
              </div>
            </div>
            <div>
              <Label className="overline">Description</Label>
              <Textarea value={itemForm.description} onChange={(e) => setItemForm({ ...itemForm, description: e.target.value })} data-testid="item-description" className="mt-1" />
            </div>
            <MediaUpload value={itemForm} onChange={(v) => setItemForm((f) => ({ ...f, ...v }))} />
            <Button type="submit" className="bg-slate-900 hover:bg-slate-800" data-testid="item-add-submit">Add item</Button>
          </form>

          <div>
            <div className="overline">Inventory ({items.length})</div>
            <div className="grid sm:grid-cols-2 gap-px bg-slate-200 border border-slate-200 mt-3" data-testid="inventory-list">
              {items.length === 0 && <div className="bg-white p-6 text-sm text-slate-500 sm:col-span-2">No items yet — add your first above.</div>}
              {items.map((it) => {
                const img = it.media_url ? (it.media_url.startsWith("http") ? it.media_url : `${BACKEND_URL}${it.media_url}`) : null;
                return (
                  <div key={it.id} className="bg-white p-4 flex gap-3" data-testid={`inv-item-${it.id}`}>
                    <div className="w-16 h-16 bg-slate-100 flex-shrink-0 overflow-hidden">
                      {img && <img src={img} alt="" className="w-full h-full object-cover" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-display font-bold truncate">{it.name}</div>
                      <div className="text-xs text-slate-500 truncate">{it.description}</div>
                      <div className="text-xs font-mono mt-1">${Number(it.price).toFixed(2)} · stock {it.stock}</div>
                    </div>
                    <button onClick={() => remove(it.id)} className="text-slate-400 hover:text-red-600" data-testid={`inv-delete-${it.id}`}>
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        </div>}
      </div>
    </div>
  );
}

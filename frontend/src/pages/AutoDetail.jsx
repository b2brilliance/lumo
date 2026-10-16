import React, { useEffect, useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { api, formatApiError } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { useAuth } from "@/lib/auth";
import { toast } from "sonner";
import { PriceDropBadge, WasPrice, PriceHistory, OwnerPriceEditor, useWatch, WatchButton } from "@/components/price/PriceBits";
import { MapPin, Gauge, Fuel, Calendar, Settings2, Palette, MessageSquare, Mail, Phone, Trash2, Car } from "lucide-react";

const fmtUsd = (n) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n || 0);

export default function AutoDetail() {
  const { id } = useParams();
  const nav = useNavigate();
  const { user } = useAuth();
  const [listing, setListing] = useState(null);
  const [activePhoto, setActivePhoto] = useState(0);
  const [inquiryOpen, setInquiryOpen] = useState(false);
  const [msg, setMsg] = useState("");
  const [sending, setSending] = useState(false);
  const watch = useWatch("auto");

  useEffect(() => {
    api.get(`/autos/${id}`).then(({ data }) => setListing(data)).catch(() => setListing(false));
  }, [id]);

  if (listing === null) return <div className="p-12 text-slate-500 font-mono text-sm">Loading…</div>;
  if (listing === false) return <div className="p-12 text-slate-500 font-mono text-sm">Listing not found.</div>;

  const photos = listing.photos && listing.photos.length ? listing.photos : [];
  const isOwner = user && user.id === listing.owner_id;

  const sendInquiry = async () => {
    if (!user) { nav("/login"); return; }
    if (msg.trim().length < 2) return;
    setSending(true);
    try {
      const { data } = await api.post("/inquiries", {
        listing_kind: "auto", listing_id: listing.id, initial_message: msg.trim(),
      });
      toast.success("Message sent. Find it in your Inquiries inbox.");
      setInquiryOpen(false); setMsg("");
      nav(`/inquiries/${data.id}`);
    } catch (e) { toast.error(formatApiError(e)); }
    finally { setSending(false); }
  };

  const remove = async () => {
    if (!window.confirm("Remove this listing? This can't be undone.")) return;
    try { await api.delete(`/autos/${listing.id}`); toast.success("Listing removed"); nav("/autos"); }
    catch (e) { toast.error(formatApiError(e)); }
  };

  return (
    <div className="max-w-screen-xl mx-auto px-6 py-8" data-testid="auto-detail-page">
      <div className="mb-4 text-xs font-mono text-slate-500"><Link to="/autos" className="hover:underline">← Back to Auto Sales</Link></div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-2 mb-6">
        <div className="md:col-span-3 aspect-[16/10] bg-slate-100 overflow-hidden">
          {photos[activePhoto] ? (
            <img src={photos[activePhoto]} alt={listing.title} className="w-full h-full object-cover" />
          ) : <div className="w-full h-full flex items-center justify-center"><Car className="w-12 h-12 opacity-30" /></div>}
        </div>
        <div className="grid grid-cols-3 md:grid-cols-1 gap-2">
          {photos.slice(0, 4).map((p, idx) => (
            <button key={idx} onClick={() => setActivePhoto(idx)} className={`aspect-[4/3] overflow-hidden border-2 ${idx === activePhoto ? "border-slate-900" : "border-transparent"}`}>
              <img src={p} alt="" className="w-full h-full object-cover" />
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2">
          <p className="text-[11px] font-mono tracking-[0.2em] text-slate-500 uppercase">{listing.year} · {listing.condition || "Used"}{listing.body_style ? ` · ${listing.body_style}` : ""}</p>
          <h1 className="font-display text-3xl sm:text-4xl font-black tracking-tight mt-1">{listing.title}</h1>
          {listing.city && (
            <div className="flex items-center gap-1 text-sm text-slate-600 mt-2"><MapPin className="w-4 h-4" />{listing.city}{listing.state ? `, ${listing.state}` : ""}</div>
          )}

          <div className="mt-6 flex flex-wrap items-center gap-2">
            <span className="font-display text-4xl font-black">{fmtUsd(listing.price)}</span>
            <WasPrice item={listing} />
            <PriceDropBadge item={listing} />
            {isOwner ? <OwnerPriceEditor item={listing} endpoint={`/autos/${listing.id}`} onSaved={(d) => setListing({ ...listing, ...d })} /> : <WatchButton watch={watch} id={listing.id} />}
          </div>

          <div className="mt-6 grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
            <div className="border border-slate-200 p-3"><div className="flex items-center gap-1 text-slate-500 text-xs"><Calendar className="w-3 h-3" />Year</div><div className="font-display text-xl font-bold">{listing.year}</div></div>
            {listing.mileage != null && <div className="border border-slate-200 p-3"><div className="flex items-center gap-1 text-slate-500 text-xs"><Gauge className="w-3 h-3" />Mileage</div><div className="font-display text-xl font-bold">{Math.round(listing.mileage).toLocaleString()}</div></div>}
            {listing.fuel && <div className="border border-slate-200 p-3"><div className="flex items-center gap-1 text-slate-500 text-xs"><Fuel className="w-3 h-3" />Fuel</div><div className="font-display text-lg font-bold">{listing.fuel}</div></div>}
            {listing.transmission && <div className="border border-slate-200 p-3"><div className="flex items-center gap-1 text-slate-500 text-xs"><Settings2 className="w-3 h-3" />Trans</div><div className="font-display text-lg font-bold">{listing.transmission}</div></div>}
            {listing.drivetrain && <div className="border border-slate-200 p-3"><div className="text-slate-500 text-xs">Drivetrain</div><div className="font-display text-lg font-bold">{listing.drivetrain}</div></div>}
            {listing.exterior_color && <div className="border border-slate-200 p-3"><div className="flex items-center gap-1 text-slate-500 text-xs"><Palette className="w-3 h-3" />Exterior</div><div className="font-display text-base font-bold">{listing.exterior_color}</div></div>}
            {listing.interior_color && <div className="border border-slate-200 p-3"><div className="text-slate-500 text-xs">Interior</div><div className="font-display text-base font-bold">{listing.interior_color}</div></div>}
            {listing.vin && <div className="border border-slate-200 p-3"><div className="text-slate-500 text-xs">VIN</div><div className="font-mono text-xs font-bold">{listing.vin}</div></div>}
          </div>

          <div className="mt-6 grid grid-cols-2 sm:grid-cols-3 gap-3 text-sm">
            <div className="border border-slate-200 p-3"><div className="text-slate-500 text-xs">Make</div><div className="font-display font-bold">{listing.make}</div></div>
            <div className="border border-slate-200 p-3"><div className="text-slate-500 text-xs">Model</div><div className="font-display font-bold">{listing.model}</div></div>
            {listing.trim && <div className="border border-slate-200 p-3"><div className="text-slate-500 text-xs">Trim</div><div className="font-display font-bold">{listing.trim}</div></div>}
          </div>

          {listing.description && (
            <div className="mt-8">
              <h2 className="font-display text-xl font-bold mb-2">Seller's notes</h2>
              <p className="text-slate-700 whitespace-pre-wrap leading-relaxed">{listing.description}</p>
            </div>
          )}
          <PriceHistory item={listing} />
        </div>

        <aside className="lg:col-span-1">
          <div className="border border-slate-200 p-5 sticky top-20" data-testid="auto-contact-card">
            <p className="text-[11px] font-mono tracking-[0.2em] text-slate-500 uppercase">Contact seller</p>
            <p className="font-display font-bold text-lg mt-1">{listing.owner_name}</p>
            <div className="mt-2 text-xs text-slate-500 space-y-1">
              {listing.seller_email_masked && <div className="flex items-center gap-2"><Mail className="w-3 h-3" />{listing.seller_email_masked}</div>}
              {listing.seller_phone_masked && <div className="flex items-center gap-2"><Phone className="w-3 h-3" />{listing.seller_phone_masked}</div>}
              <p className="text-[11px] text-slate-400 mt-2">Direct contact is masked. Use Lumo's in-app chat to message securely.</p>
            </div>
            {isOwner ? (
              <Button variant="outline" className="w-full mt-4 border-red-200 text-red-600" onClick={remove} data-testid="auto-delete-btn">
                <Trash2 className="w-4 h-4 mr-2" />Remove listing
              </Button>
            ) : (
              <Button className="w-full mt-4 bg-slate-900 hover:bg-slate-800" onClick={() => setInquiryOpen(true)} data-testid="auto-inquire-btn">
                <MessageSquare className="w-4 h-4 mr-2" />Message seller
              </Button>
            )}
          </div>
        </aside>
      </div>

      <Dialog open={inquiryOpen} onOpenChange={setInquiryOpen}>
        <DialogContent data-testid="auto-inquiry-dialog">
          <DialogHeader>
            <DialogTitle>Message the seller</DialogTitle>
            <DialogDescription>Your real email and phone stay private. The seller will reply through Lumo.</DialogDescription>
          </DialogHeader>
          <Textarea data-testid="auto-inquiry-text" rows={5} placeholder="Hi! Is this car still available? I'd like to schedule a test drive." value={msg} onChange={(e) => setMsg(e.target.value)} />
          <DialogFooter>
            <Button variant="ghost" onClick={() => setInquiryOpen(false)}>Cancel</Button>
            <Button onClick={sendInquiry} disabled={sending || msg.trim().length < 2} className="bg-slate-900 hover:bg-slate-800" data-testid="auto-inquiry-send">Send message</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

import React, { useEffect, useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { api, formatApiError } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { useAuth } from "@/lib/auth";
import { toast } from "sonner";
import { MapPin, BedDouble, Bath, Maximize, Calendar, Trash2, MessageSquare, Mail, Phone, Heart, CalendarCheck, Users } from "lucide-react";
import { Input } from "@/components/ui/input";
import ReLocation from "@/components/realestate/ReLocation";
import { PriceDropBadge, WasPrice, PriceHistory, OwnerPriceEditor } from "@/components/price/PriceBits";
import { fmtPrice, KIND_LABEL, UNIT_LABEL, useReFavorites } from "@/components/realestate/reUtils";

export default function RealEstateDetail() {
  const { id } = useParams();
  const nav = useNavigate();
  const { user } = useAuth();
  const [listing, setListing] = useState(null);
  const [activePhoto, setActivePhoto] = useState(0);
  const [inquiryOpen, setInquiryOpen] = useState(false);
  const [msg, setMsg] = useState("");
  const [sending, setSending] = useState(false);
  const [tour, setTour] = useState({ date: "", time: "" });
  const [mode, setMode] = useState("message");
  const fav = useReFavorites();

  useEffect(() => {
    api.get(`/real-estate/${id}`).then(({ data }) => setListing(data)).catch(() => setListing(false));
  }, [id]);

  if (listing === null) return <div className="p-12 text-slate-500 font-mono text-sm">Loading…</div>;
  if (listing === false) return <div className="p-12 text-slate-500 font-mono text-sm">Listing not found.</div>;

  const photos = listing.photos && listing.photos.length ? listing.photos : [];
  const isOwner = user && user.id === listing.owner_id;
  const fmtUsd = (n) => fmtPrice(n, listing.currency);
  const openContact = (m) => {
    if (!user) { nav("/signin", { state: { from: `/real-estate/${id}` } }); return; }
    setMode(m);
    setMsg(m === "tour" ? "Hi! I'd like to schedule a viewing of this property." : "");
    setInquiryOpen(true);
  };
  const toggleFav = async () => {
    if (!user) { nav("/signin", { state: { from: `/real-estate/${id}` } }); return; }
    const on = await fav.toggle(listing.id);
    toast.success(on ? "Saved to your homes" : "Removed from saved homes");
  };
  const setStatus = async (status) => {
    try {
      const { data } = await api.patch(`/real-estate/${listing.id}`, { status });
      setListing({ ...listing, ...data });
      toast.success(`Marked as ${status}`);
    } catch (e) { toast.error(formatApiError(e)); }
  };

  const sendInquiry = async () => {
    if (!user) { nav("/signin"); return; }
    if (msg.trim().length < 2) return;
    if (mode === "tour" && !tour.date) { toast.error("Pick a preferred date"); return; }
    setSending(true);
    try {
      const prefix = mode === "tour" ? `TOUR REQUEST — preferred ${tour.date}${tour.time ? ` at ${tour.time}` : ""}\n\n` : "";
      const { data } = await api.post("/inquiries", {
        listing_kind: "real_estate", listing_id: listing.id, initial_message: prefix + msg.trim(),
      });
      toast.success("Message sent. Find it in your Inquiries inbox.");
      setInquiryOpen(false); setMsg("");
      nav(`/inquiries/${data.id}`);
    } catch (e) {
      toast.error(formatApiError(e));
    } finally {
      setSending(false);
    }
  };

  const remove = async () => {
    if (!window.confirm("Remove this listing? This can't be undone.")) return;
    try {
      await api.delete(`/real-estate/${listing.id}`);
      toast.success("Listing removed");
      nav("/real-estate");
    } catch (e) { toast.error(formatApiError(e)); }
  };

  return (
    <div className="max-w-screen-xl mx-auto px-6 py-8" data-testid="re-detail-page">
      <div className="mb-4 text-xs font-mono text-slate-500"><Link to="/real-estate" className="hover:underline">← Back to Real Estate</Link></div>

      {/* Photo gallery */}
      <div className={`grid grid-cols-1 ${photos.length > 1 ? "md:grid-cols-4" : ""} gap-2 mb-6`}>
        <div className={`${photos.length > 1 ? "md:col-span-3" : ""} aspect-[16/10] max-h-[560px] w-full bg-slate-100 overflow-hidden`}>
          {photos[activePhoto] ? (
            <img src={photos[activePhoto]} alt={listing.title} className="w-full h-full object-cover" />
          ) : <div className="w-full h-full flex items-center justify-center text-slate-400 font-mono">no photo</div>}
        </div>
        <div className={`${photos.length > 1 ? "grid" : "hidden"} grid-cols-3 md:grid-cols-1 gap-2`}>
          {photos.slice(0, 4).map((p, idx) => (
            <button key={idx} onClick={() => setActivePhoto(idx)} className={`aspect-[4/3] overflow-hidden border-2 ${idx === activePhoto ? "border-slate-900" : "border-transparent"}`}>
              <img src={p} alt="" className="w-full h-full object-cover" />
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2">
          <div className="flex items-start justify-between gap-3">
            <p className="text-[11px] font-mono tracking-[0.2em] text-slate-500 uppercase" data-testid="re-detail-kind">{KIND_LABEL[listing.listing_kind] || "Listing"} · {(listing.property_type || "").replace("_", " ")}{listing.status && listing.status !== "active" ? ` · ${listing.status}` : ""}</p>
            <button onClick={toggleFav} className="inline-flex items-center gap-1 text-xs font-mono uppercase tracking-widest border border-slate-200 px-3 py-1.5 hover:border-slate-900" data-testid="re-detail-fav">
              <Heart className={`w-4 h-4 ${fav.ids.has(listing.id) ? "fill-rose-600 text-rose-600" : ""}`} />{fav.ids.has(listing.id) ? "Saved" : "Save"}
            </button>
          </div>
          <h1 className="font-display text-3xl sm:text-4xl font-black tracking-tight mt-1">{listing.title}</h1>
          <div className="flex items-center gap-1 text-sm text-slate-600 mt-2" data-testid="re-detail-address"><MapPin className="w-4 h-4" />{[listing.address, ...[listing.city, listing.state, listing.country].filter((x) => x && !(listing.address || "").includes(x))].filter(Boolean).join(", ")}</div>

          <div className="mt-6 flex items-baseline gap-3">
            <div className="font-display text-4xl font-black">{fmtUsd(listing.price)}</div>
            {UNIT_LABEL[listing.price_unit] && <div className="text-sm font-mono text-slate-500">{UNIT_LABEL[listing.price_unit]}</div>}
            <WasPrice item={listing} />
            <PriceDropBadge item={listing} className="ml-2" />
            {isOwner && <span className="ml-3"><OwnerPriceEditor item={listing} endpoint={`/real-estate/${listing.id}`} onSaved={(d) => setListing({ ...listing, ...d })} /></span>}
          </div>

          <div className="mt-6 grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
            {listing.bedrooms != null && <div className="border border-slate-200 p-3"><div className="flex items-center gap-1 text-slate-500 text-xs"><BedDouble className="w-3 h-3" />Bedrooms</div><div className="font-display text-xl font-bold">{listing.bedrooms}</div></div>}
            {listing.bathrooms != null && <div className="border border-slate-200 p-3"><div className="flex items-center gap-1 text-slate-500 text-xs"><Bath className="w-3 h-3" />Bathrooms</div><div className="font-display text-xl font-bold">{listing.bathrooms}</div></div>}
            {listing.sqft != null && <div className="border border-slate-200 p-3"><div className="flex items-center gap-1 text-slate-500 text-xs"><Maximize className="w-3 h-3" />Sqft</div><div className="font-display text-xl font-bold">{Math.round(listing.sqft).toLocaleString()}</div></div>}
            {listing.year_built != null && <div className="border border-slate-200 p-3"><div className="flex items-center gap-1 text-slate-500 text-xs"><Calendar className="w-3 h-3" />Year built</div><div className="font-display text-xl font-bold">{listing.year_built}</div></div>}
            {listing.lot_size_sqft != null && <div className="border border-slate-200 p-3"><div className="text-slate-500 text-xs">Lot size</div><div className="font-display text-lg font-bold">{Math.round(listing.lot_size_sqft).toLocaleString()} sqft</div></div>}
            {listing.hoa_monthly != null && <div className="border border-slate-200 p-3"><div className="text-slate-500 text-xs">HOA / mo</div><div className="font-display text-lg font-bold">{fmtUsd(listing.hoa_monthly)}</div></div>}
            {listing.parking_spots != null && <div className="border border-slate-200 p-3"><div className="text-slate-500 text-xs">Parking</div><div className="font-display text-lg font-bold">{listing.parking_spots} spots</div></div>}
            {listing.max_guests != null && <div className="border border-slate-200 p-3"><div className="flex items-center gap-1 text-slate-500 text-xs"><Users className="w-3 h-3" />Guests</div><div className="font-display text-xl font-bold">{listing.max_guests}</div></div>}
          </div>
          {listing.amenities?.length > 0 && (
            <div className="mt-6 flex flex-wrap gap-2" data-testid="re-amenities">
              {listing.amenities.map((a) => <span key={a} className="text-xs font-mono border border-slate-200 px-2 py-1">{a}</span>)}
            </div>
          )}

          {listing.description && (
            <div className="mt-8">
              <h2 className="font-display text-xl font-bold mb-2">About this property</h2>
              <p className="text-slate-700 whitespace-pre-wrap leading-relaxed">{listing.description}</p>
            </div>
          )}
          <PriceHistory item={listing} />
          <ReLocation listing={listing} />
        </div>

        <aside className="lg:col-span-1">
          <div className="border border-slate-200 p-5 sticky top-20" data-testid="re-contact-card">
            <p className="text-[11px] font-mono tracking-[0.2em] text-slate-500 uppercase">Contact seller</p>
            <p className="font-display font-bold text-lg mt-1">{listing.owner_name}</p>
            <div className="mt-2 text-xs text-slate-500 space-y-1">
              {listing.seller_email_masked && <div className="flex items-center gap-2"><Mail className="w-3 h-3" />{listing.seller_email_masked}</div>}
              {listing.seller_phone_masked && <div className="flex items-center gap-2"><Phone className="w-3 h-3" />{listing.seller_phone_masked}</div>}
              <p className="text-[11px] text-slate-400 mt-2">Direct contact is masked. Use Lumo's in-app chat to message securely.</p>
            </div>
            {isOwner ? (
              <div className="mt-4 space-y-2">
                <div className="grid grid-cols-2 gap-2">
                  <Button variant="outline" onClick={() => setStatus(listing.listing_kind === "sale" ? "sold" : "rented")} data-testid="re-mark-closed">Mark {listing.listing_kind === "sale" ? "sold" : "rented"}</Button>
                  <Button variant="outline" onClick={() => setStatus("active")} data-testid="re-mark-active">Mark active</Button>
                </div>
                <Button variant="outline" className="w-full border-red-200 text-red-600" onClick={remove} data-testid="re-delete-btn">
                  <Trash2 className="w-4 h-4 mr-2" />Remove listing
                </Button>
              </div>
            ) : (
              <div className="mt-4 space-y-2">
                {listing.source_rental_id && (
                  <Link to={`/rentals/${listing.source_rental_id}`} className="block"><Button className="w-full bg-rose-600 hover:bg-rose-700" data-testid="re-book-stay-btn"><CalendarCheck className="w-4 h-4 mr-2" />Check dates & book</Button></Link>
                )}
                <Button className="w-full bg-slate-900 hover:bg-slate-800" onClick={() => openContact("tour")} data-testid="re-tour-btn">
                  <Calendar className="w-4 h-4 mr-2" />Request a tour
                </Button>
                <Button variant="outline" className="w-full" onClick={() => openContact("message")} data-testid="re-inquire-btn">
                  <MessageSquare className="w-4 h-4 mr-2" />Message {listing.listing_kind === "sale" ? "seller" : "owner"}
                </Button>
              </div>
            )}
          </div>
        </aside>
      </div>

      <Dialog open={inquiryOpen} onOpenChange={setInquiryOpen}>
        <DialogContent data-testid="re-inquiry-dialog">
          <DialogHeader>
            <DialogTitle>{mode === "tour" ? "Request a tour" : "Message the owner"}</DialogTitle>
            <DialogDescription>Your real email and phone stay private. The owner will reply through Lumo.</DialogDescription>
          </DialogHeader>
          {mode === "tour" && (
            <div className="grid grid-cols-2 gap-2">
              <Input type="date" value={tour.date} min={new Date().toISOString().slice(0, 10)} onChange={(e) => setTour({ ...tour, date: e.target.value })} data-testid="re-tour-date" />
              <Input type="time" value={tour.time} onChange={(e) => setTour({ ...tour, time: e.target.value })} data-testid="re-tour-time" />
            </div>
          )}
          <Textarea data-testid="re-inquiry-text" rows={5} placeholder="Hi! I'm interested in this listing. Is it still available?" value={msg} onChange={(e) => setMsg(e.target.value)} />
          <DialogFooter>
            <Button variant="ghost" onClick={() => setInquiryOpen(false)}>Cancel</Button>
            <Button onClick={sendInquiry} disabled={sending || msg.trim().length < 2} className="bg-slate-900 hover:bg-slate-800" data-testid="re-inquiry-send">Send message</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

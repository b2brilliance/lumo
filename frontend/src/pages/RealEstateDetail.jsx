import React, { useEffect, useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { api, formatApiError } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { useAuth } from "@/lib/auth";
import { toast } from "sonner";
import { MapPin, BedDouble, Bath, Maximize, Calendar, Trash2, MessageSquare, Mail, Phone } from "lucide-react";

const fmtUsd = (n) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n || 0);

export default function RealEstateDetail() {
  const { id } = useParams();
  const nav = useNavigate();
  const { user } = useAuth();
  const [listing, setListing] = useState(null);
  const [activePhoto, setActivePhoto] = useState(0);
  const [inquiryOpen, setInquiryOpen] = useState(false);
  const [msg, setMsg] = useState("");
  const [sending, setSending] = useState(false);

  useEffect(() => {
    api.get(`/real-estate/${id}`).then(({ data }) => setListing(data)).catch(() => setListing(false));
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
        listing_kind: "real_estate", listing_id: listing.id, initial_message: msg.trim(),
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
      <div className="grid grid-cols-1 md:grid-cols-4 gap-2 mb-6">
        <div className="md:col-span-3 aspect-[16/10] bg-slate-100 overflow-hidden">
          {photos[activePhoto] ? (
            <img src={photos[activePhoto]} alt={listing.title} className="w-full h-full object-cover" />
          ) : <div className="w-full h-full flex items-center justify-center text-slate-400 font-mono">no photo</div>}
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
          <p className="text-[11px] font-mono tracking-[0.2em] text-slate-500 uppercase">{listing.listing_kind === "rent" ? "For rent" : "For sale"} · {listing.property_type}</p>
          <h1 className="font-display text-3xl sm:text-4xl font-black tracking-tight mt-1">{listing.title}</h1>
          <div className="flex items-center gap-1 text-sm text-slate-600 mt-2"><MapPin className="w-4 h-4" />{listing.address}</div>

          <div className="mt-6 flex items-baseline gap-3">
            <div className="font-display text-4xl font-black">{fmtUsd(listing.price)}</div>
            {listing.listing_kind === "rent" && <div className="text-sm font-mono text-slate-500">/ month</div>}
          </div>

          <div className="mt-6 grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
            {listing.bedrooms != null && <div className="border border-slate-200 p-3"><div className="flex items-center gap-1 text-slate-500 text-xs"><BedDouble className="w-3 h-3" />Bedrooms</div><div className="font-display text-xl font-bold">{listing.bedrooms}</div></div>}
            {listing.bathrooms != null && <div className="border border-slate-200 p-3"><div className="flex items-center gap-1 text-slate-500 text-xs"><Bath className="w-3 h-3" />Bathrooms</div><div className="font-display text-xl font-bold">{listing.bathrooms}</div></div>}
            {listing.sqft != null && <div className="border border-slate-200 p-3"><div className="flex items-center gap-1 text-slate-500 text-xs"><Maximize className="w-3 h-3" />Sqft</div><div className="font-display text-xl font-bold">{Math.round(listing.sqft).toLocaleString()}</div></div>}
            {listing.year_built != null && <div className="border border-slate-200 p-3"><div className="flex items-center gap-1 text-slate-500 text-xs"><Calendar className="w-3 h-3" />Year built</div><div className="font-display text-xl font-bold">{listing.year_built}</div></div>}
            {listing.lot_size_sqft != null && <div className="border border-slate-200 p-3"><div className="text-slate-500 text-xs">Lot size</div><div className="font-display text-lg font-bold">{Math.round(listing.lot_size_sqft).toLocaleString()} sqft</div></div>}
            {listing.hoa_monthly != null && <div className="border border-slate-200 p-3"><div className="text-slate-500 text-xs">HOA / mo</div><div className="font-display text-lg font-bold">{fmtUsd(listing.hoa_monthly)}</div></div>}
            {listing.parking_spots != null && <div className="border border-slate-200 p-3"><div className="text-slate-500 text-xs">Parking</div><div className="font-display text-lg font-bold">{listing.parking_spots} spots</div></div>}
          </div>

          {listing.description && (
            <div className="mt-8">
              <h2 className="font-display text-xl font-bold mb-2">About this property</h2>
              <p className="text-slate-700 whitespace-pre-wrap leading-relaxed">{listing.description}</p>
            </div>
          )}
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
              <Button variant="outline" className="w-full mt-4 border-red-200 text-red-600" onClick={remove} data-testid="re-delete-btn">
                <Trash2 className="w-4 h-4 mr-2" />Remove listing
              </Button>
            ) : (
              <Button className="w-full mt-4 bg-slate-900 hover:bg-slate-800" onClick={() => setInquiryOpen(true)} data-testid="re-inquire-btn">
                <MessageSquare className="w-4 h-4 mr-2" />Message seller
              </Button>
            )}
          </div>
        </aside>
      </div>

      <Dialog open={inquiryOpen} onOpenChange={setInquiryOpen}>
        <DialogContent data-testid="re-inquiry-dialog">
          <DialogHeader>
            <DialogTitle>Message the seller</DialogTitle>
            <DialogDescription>Your real email and phone stay private. The seller will reply through Lumo.</DialogDescription>
          </DialogHeader>
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

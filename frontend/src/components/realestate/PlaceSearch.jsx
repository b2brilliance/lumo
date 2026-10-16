import React, { useState } from "react";
import { Search, Loader2 } from "lucide-react";
import { api } from "@/lib/api";
import { Input } from "@/components/ui/input";

// Worldwide place search (OpenStreetMap / Nominatim via backend proxy).
export default function PlaceSearch({ initial, onPick }) {
  const [q, setQ] = useState(initial || "");
  const [results, setResults] = useState([]);
  const [busy, setBusy] = useState(false);

  const run = async (e) => {
    e.preventDefault();
    if (q.trim().length < 2) return;
    setBusy(true);
    try {
      const { data } = await api.get(`/geo/search?q=${encodeURIComponent(q.trim())}`);
      if (data.length) { onPick(data[0]); setQ(data[0].label.split(",")[0]); }
      setResults([]);
    } finally { setBusy(false); }
  };

  return (
    <form onSubmit={run} className="relative flex-1 min-w-[220px]" data-testid="re-place-form">
      <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
      <Input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="City, neighborhood, address or country — anywhere"
        className="pl-9 pr-9 h-11"
        data-testid="re-place-input"
      />
      {busy && <Loader2 className="w-4 h-4 animate-spin absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" />}
      {results.length > 0 && (
        <div className="absolute z-[1100] mt-1 w-full bg-white border border-slate-900 shadow-xl" data-testid="re-place-results">
          {results.map((r, i) => (
            <button
              key={`${r.lat}-${r.lng}-${i}`}
              type="button"
              onClick={() => { onPick(r); setQ(r.label.split(",")[0]); setResults([]); }}
              className="block w-full text-left px-3 py-2 text-sm hover:bg-slate-100 truncate"
              data-testid={`re-place-result-${i}`}
            >
              {r.label}
            </button>
          ))}
        </div>
      )}
    </form>
  );
}

import React, { useEffect, useRef, useState } from "react";
import { GoogleMap, MarkerF, useJsApiLoader } from "@react-google-maps/api";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { MapPin } from "lucide-react";

const GOOGLE_KEY = process.env.REACT_APP_GOOGLE_MAPS_API_KEY;
const LIBRARIES = ["places"];

export default function MapPickerButton({ value, onPick, label = "Pin on map" }) {
  const [open, setOpen] = useState(false);
  const [pin, setPin] = useState(value?.lat && value?.lng ? { lat: value.lat, lng: value.lng } : null);
  const [address, setAddress] = useState(value?.address || "");
  const { isLoaded } = useJsApiLoader({
    id: "lumo-google-maps",
    googleMapsApiKey: GOOGLE_KEY || "",
    libraries: LIBRARIES,
  });
  const geocoderRef = useRef(null);

  useEffect(() => {
    if (open && isLoaded && window.google && !geocoderRef.current) {
      geocoderRef.current = new window.google.maps.Geocoder();
    }
    if (open) {
      // Try to get user's location for the initial center
      if (!pin && navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
          (pos) => setPin({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
          () => setPin({ lat: 39.8283, lng: -98.5795 }),
          { maximumAge: 60000, timeout: 5000 }
        );
      } else if (!pin) {
        setPin({ lat: 39.8283, lng: -98.5795 });
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, isLoaded]);

  const reverseGeocode = (lat, lng) => {
    if (!geocoderRef.current) return;
    geocoderRef.current.geocode({ location: { lat, lng } }, (results, status) => {
      if (status === "OK" && results?.[0]) setAddress(results[0].formatted_address);
      else setAddress(`Pin at ${lat.toFixed(5)}, ${lng.toFixed(5)}`);
    });
  };

  const onMapClick = (e) => {
    const lat = e.latLng.lat();
    const lng = e.latLng.lng();
    setPin({ lat, lng });
    reverseGeocode(lat, lng);
  };

  const onMarkerDrag = (e) => {
    const lat = e.latLng.lat();
    const lng = e.latLng.lng();
    setPin({ lat, lng });
    reverseGeocode(lat, lng);
  };

  const confirm = () => {
    if (!pin) return;
    onPick({ lat: pin.lat, lng: pin.lng, address: address || `Pin at ${pin.lat.toFixed(5)}, ${pin.lng.toFixed(5)}` });
    setOpen(false);
  };

  return (
    <>
      <Button type="button" variant="outline" size="sm" onClick={() => setOpen(true)} className="h-9 px-2" data-testid="map-picker-open">
        <MapPin className="w-3.5 h-3.5 mr-1" /> {label}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl" data-testid="map-picker-dialog">
          <DialogHeader>
            <DialogTitle className="font-display tracking-tight">Drop a pin where you need service</DialogTitle>
            <DialogDescription>Click the map or drag the pin. Great for spots without a street address.</DialogDescription>
          </DialogHeader>
          <div className="h-[420px] border border-slate-200">
            {!GOOGLE_KEY && <div className="p-6 text-sm text-slate-500">Google Maps key not configured.</div>}
            {GOOGLE_KEY && isLoaded && pin && (
              <GoogleMap
                mapContainerStyle={{ width: "100%", height: "100%" }}
                center={pin}
                zoom={14}
                onClick={onMapClick}
                options={{ streetViewControl: false, mapTypeControl: false, fullscreenControl: false }}
              >
                <MarkerF position={pin} draggable onDragEnd={onMarkerDrag} />
              </GoogleMap>
            )}
            {GOOGLE_KEY && isLoaded && !pin && (
              <div className="p-6 text-sm text-slate-500">Locating you…</div>
            )}
          </div>
          <div className="text-sm font-mono text-slate-700 mt-2" data-testid="map-picker-readout">
            {pin && (
              <>
                <div>{address || "Resolving address…"}</div>
                <div className="text-xs text-slate-400 mt-0.5">{pin.lat.toFixed(5)}, {pin.lng.toFixed(5)}</div>
              </>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={confirm} disabled={!pin} className="bg-teal-700 hover:bg-teal-800" data-testid="map-picker-confirm">Use this location</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

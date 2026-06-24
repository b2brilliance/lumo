import React, { useRef } from "react";
import { Autocomplete, useJsApiLoader } from "@react-google-maps/api";
import { Input } from "@/components/ui/input";

const GOOGLE_KEY = process.env.REACT_APP_GOOGLE_MAPS_API_KEY;
const LIBRARIES = ["places"];

/**
 * Address input with Google Places Autocomplete.
 * Props:
 *   value, onChange(address) — plain string interface
 *   onPlace({ address, lat, lng }) — fired when a place is selected
 *   placeholder, required, "data-testid"
 */
export default function AddressInput({ value, onChange, onPlace, placeholder, required, ...rest }) {
  const { isLoaded } = useJsApiLoader({
    id: "lumo-google-maps",
    googleMapsApiKey: GOOGLE_KEY || "",
    libraries: LIBRARIES,
  });
  const ref = useRef(null);

  const onLoad = (ac) => { ref.current = ac; };
  const onPlaceChanged = () => {
    if (!ref.current) return;
    const place = ref.current.getPlace();
    if (!place) return;
    const address = place.formatted_address || place.name || "";
    const loc = place.geometry?.location;
    const lat = loc?.lat?.();
    const lng = loc?.lng?.();
    onChange && onChange(address);
    onPlace && onPlace({ address, lat, lng });
  };

  if (!isLoaded || !GOOGLE_KEY) {
    // graceful fallback to plain input
    return <Input value={value || ""} onChange={(e) => onChange && onChange(e.target.value)} placeholder={placeholder} required={required} {...rest} />;
  }

  return (
    <Autocomplete
      onLoad={onLoad}
      onPlaceChanged={onPlaceChanged}
      options={{ types: ["geocode"], fields: ["formatted_address", "geometry", "name"] }}
    >
      <Input
        value={value || ""}
        onChange={(e) => onChange && onChange(e.target.value)}
        placeholder={placeholder || "Start typing an address…"}
        required={required}
        {...rest}
      />
    </Autocomplete>
  );
}

import React, { useCallback, useRef, useState } from "react";
import { Autocomplete, useJsApiLoader } from "@react-google-maps/api";
import { Input } from "@/components/ui/input";

const GOOGLE_KEY = process.env.REACT_APP_GOOGLE_MAPS_API_KEY;
const LIBRARIES = ["places"];

/**
 * Address input with Google Places auto-complete.
 *
 * Uses the classic `google.maps.places.Autocomplete` widget which is
 * enabled by default on every Google Cloud project that has the
 * "Places API" turned on. (This is intentional — the newer
 * `PlaceAutocompleteElement` requires "Places API (New)" which needs
 * a manual opt-in in the Cloud Console and returns 403 until enabled.)
 *
 * Props:
 *   value        — controlled string
 *   onChange     — (address: string) => void
 *   onPlace      — ({address, lat, lng}) => void, fired on selection
 *   placeholder  — passed to the input
 *   required     — HTML required flag
 */
export default function AddressInput({
  value,
  onChange,
  onPlace,
  placeholder = "Start typing your address",
  required,
  ...rest
}) {
  const { isLoaded } = useJsApiLoader({
    id: "lumo-google-maps",
    googleMapsApiKey: GOOGLE_KEY || "",
    libraries: LIBRARIES,
  });
  const autoRef = useRef(null);
  const [ready, setReady] = useState(false);

  const onLoad = useCallback((ac) => {
    autoRef.current = ac;
    // Bias to physical addresses, skip business POIs, and only pull the
    // fields we actually use to keep quota costs down.
    try {
      ac.setFields(["formatted_address", "geometry.location", "name"]);
    } catch { /* older SDK versions expose the fields via `fields` prop */ }
    setReady(true);
  }, []);

  const onPlaceChanged = useCallback(() => {
    const ac = autoRef.current;
    if (!ac) return;
    const place = ac.getPlace();
    if (!place) return;
    const address =
      place.formatted_address ||
      place.name ||
      (place.address_components || []).map((c) => c.long_name).join(", ");
    const loc = place.geometry?.location;
    const lat = typeof loc?.lat === "function" ? loc.lat() : loc?.lat;
    const lng = typeof loc?.lng === "function" ? loc.lng() : loc?.lng;
    onChange && onChange(address);
    onPlace && onPlace({ address, lat, lng });
  }, [onChange, onPlace]);

  // Fallback plain input while the SDK loads OR when no API key is set.
  // This ensures the field is always typeable — no white flash, no blocked
  // form submissions if Google is slow or the project has Places disabled.
  if (!isLoaded || !GOOGLE_KEY) {
    return (
      <Input
        value={value || ""}
        onChange={(e) => onChange && onChange(e.target.value)}
        placeholder={placeholder}
        required={required}
        data-testid="address-input-fallback"
        {...rest}
      />
    );
  }

  return (
    <Autocomplete
      onLoad={onLoad}
      onPlaceChanged={onPlaceChanged}
      options={{
        // "geocode" covers street addresses + intersections + landmarks
        // without dragging in business POIs.
        types: ["geocode"],
        fields: ["formatted_address", "geometry.location", "name"],
      }}
    >
      <Input
        value={value || ""}
        onChange={(e) => onChange && onChange(e.target.value)}
        placeholder={placeholder}
        required={required}
        data-testid="address-input"
        aria-busy={!ready}
        {...rest}
      />
    </Autocomplete>
  );
}

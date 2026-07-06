import React, { useEffect, useRef, useState } from "react";
import { useJsApiLoader } from "@react-google-maps/api";
import { Input } from "@/components/ui/input";

const GOOGLE_KEY = process.env.REACT_APP_GOOGLE_MAPS_API_KEY;
const LIBRARIES = ["places"];

/**
 * Address input using the NEW Google Places `PlaceAutocompleteElement`
 * (the classic `google.maps.places.Autocomplete` is deprecated for accounts
 * created after March 1, 2025). Falls back to a plain `<Input>` when the
 * Maps SDK isn't loaded or when no API key is configured.
 *
 * Props:
 *   value        — controlled string
 *   onChange     — (address: string) => void, fired on every keystroke
 *   onPlace      — ({address, lat, lng}) => void, fired on selection
 *   placeholder  — passed to the underlying element
 *   required     — HTML required flag (fallback only)
 *   data-testid  — kept on the wrapper for E2E tests
 */
export default function AddressInput({
  value,
  onChange,
  onPlace,
  placeholder,
  required,
  ...rest
}) {
  const { isLoaded } = useJsApiLoader({
    id: "lumo-google-maps",
    googleMapsApiKey: GOOGLE_KEY || "",
    libraries: LIBRARIES,
  });
  const wrapRef = useRef(null);
  const elRef = useRef(null);
  const [readyForElement, setReadyForElement] = useState(false);

  // Attach PlaceAutocompleteElement once the SDK is ready.
  useEffect(() => {
    if (!isLoaded || !GOOGLE_KEY || !wrapRef.current) return;

    let cancelled = false;
    let cleanupFns = [];

    (async () => {
      try {
        const g = window.google?.maps;
        if (!g?.importLibrary) return;
        const placesLib = await g.importLibrary("places");
        if (cancelled) return;
        const PAE = placesLib?.PlaceAutocompleteElement;
        if (!PAE) {
          // SDK loaded but new element unavailable on this key — stay in fallback.
          setReadyForElement(false);
          return;
        }

        const el = new PAE({
          types: ["geocode"],
        });
        // The element is a custom web component. Give it a class so we can
        // stretch it to fill its parent and blend with our design system.
        el.classList.add("lumo-place-autocomplete");
        el.style.width = "100%";
        // Set an accessible placeholder / initial value on the underlying input.
        if (placeholder) el.setAttribute("placeholder", placeholder);
        if (value) {
          try { el.value = value; } catch { /* not writable pre-mount */ }
        }

        wrapRef.current.appendChild(el);
        elRef.current = el;
        setReadyForElement(true);

        // Selection handler: convert prediction → Place, fetch fields, notify.
        const onSelect = async (ev) => {
          try {
            const prediction = ev?.placePrediction;
            if (!prediction) return;
            const place = prediction.toPlace();
            await place.fetchFields({
              fields: ["formattedAddress", "displayName", "location"],
            });
            const address = place.formattedAddress || place.displayName || "";
            const lat = place.location?.lat?.();
            const lng = place.location?.lng?.();
            onChange && onChange(address);
            onPlace && onPlace({ address, lat, lng });
          } catch (e) {
            // Non-fatal — leave whatever the user typed.
             
            console.warn("[AddressInput] place fetch failed", e);
          }
        };
        el.addEventListener("gmp-select", onSelect);
        cleanupFns.push(() => el.removeEventListener("gmp-select", onSelect));

        // Emit onChange on every keystroke so parent-controlled forms
        // stay in sync (mimics the old <input onChange> contract). The
        // new element renders its `<input>` inside a shadow root, so we
        // subscribe to the composed `input` event on the element itself.
        const onInput = () => {
          const v = el.value ?? "";
          onChange && onChange(v);
        };
        el.addEventListener("input", onInput);
        cleanupFns.push(() => el.removeEventListener("input", onInput));
      } catch (e) {
         
        console.warn("[AddressInput] PlaceAutocompleteElement setup failed", e);
        setReadyForElement(false);
      }
    })();

    return () => {
      cancelled = true;
      cleanupFns.forEach((fn) => {
        try { fn(); } catch { /* noop */ }
      });
      if (elRef.current?.parentNode) {
        elRef.current.parentNode.removeChild(elRef.current);
      }
      elRef.current = null;
      setReadyForElement(false);
    };
    // We intentionally exclude value/onChange/onPlace/placeholder from deps —
    // the element persists across renders and we sync value below.
     
  }, [isLoaded]);

  // Keep the element's `value` prop in sync with our controlled `value`.
  useEffect(() => {
    if (!elRef.current) return;
    try {
      if (typeof value === "string" && elRef.current.value !== value) {
        elRef.current.value = value;
      }
    } catch { /* noop */ }
  }, [value]);

  // Fallback: plain input when SDK / key aren't available.
  if (!isLoaded || !GOOGLE_KEY) {
    return (
      <Input
        value={value || ""}
        onChange={(e) => onChange && onChange(e.target.value)}
        placeholder={placeholder}
        required={required}
        {...rest}
      />
    );
  }

  return (
    <div ref={wrapRef} className="lumo-place-autocomplete-wrap w-full" {...rest}>
      {!readyForElement && (
        // Rendered until PlaceAutocompleteElement takes over. Uses the same
        // <Input> so users can start typing immediately even before the SDK
        // finishes wiring up.
        <Input
          value={value || ""}
          onChange={(e) => onChange && onChange(e.target.value)}
          placeholder={placeholder}
          required={required}
        />
      )}
    </div>
  );
}

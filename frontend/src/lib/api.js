import axios from "axios";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
export const API = `${BACKEND_URL}/api`;

export const api = axios.create({ baseURL: API });

api.interceptors.request.use((cfg) => {
  const t = localStorage.getItem("lumo_token");
  if (t) cfg.headers.Authorization = `Bearer ${t}`;
  return cfg;
});

export function formatApiError(err) {
  const d = err?.response?.data?.detail;
  if (!d) return err?.message || "Something went wrong.";
  if (typeof d === "string") return d;
  if (Array.isArray(d)) return d.map((e) => e?.msg || JSON.stringify(e)).join(" ");
  return String(d);
}

export const CATEGORY_COLORS = {
  physical_delivery: { hex: "#DC2626", tw: "bg-red-600", label: "Delivery & local sellers", dot: "dot-physical" },
  local_services: { hex: "#2563EB", tw: "bg-blue-600", label: "Local Services", dot: "dot-local" },
  tech_digital: { hex: "#D97706", tw: "bg-amber-600", label: "Digital & Tech", dot: "dot-tech" },
  remote_jobs: { hex: "#0F766E", tw: "bg-teal-700", label: "Remote Jobs", dot: "dot-remote" },
};

export const ALL_CATEGORIES = [
  { value: "delivery", label: "Delivery", group: "physical_delivery", location_mode: "pickup_dropoff" },
  { value: "courier", label: "Courier", group: "physical_delivery", location_mode: "pickup_dropoff" },
  { value: "moving", label: "Moving", group: "physical_delivery", location_mode: "pickup_dropoff" },
  { value: "ride_share", label: "Ride / Rideshare", group: "physical_delivery", location_mode: "pickup_dropoff" },
  { value: "towing", label: "Towing / Roadside", group: "physical_delivery", location_mode: "pickup_dropoff" },
  { value: "handyman", label: "Handyman", group: "local_services", location_mode: "onsite" },
  { value: "cleaning", label: "Cleaning", group: "local_services", location_mode: "onsite" },
  { value: "landscaping", label: "Landscaping", group: "local_services", location_mode: "onsite" },
  { value: "auto", label: "Auto / Mechanic", group: "local_services", location_mode: "onsite" },
  { value: "pet_care", label: "Pet Care", group: "local_services", location_mode: "onsite" },
  { value: "personal_care", label: "Personal Care", group: "local_services", location_mode: "onsite" },
  { value: "medical", label: "Medical & In-home Care", group: "local_services", location_mode: "onsite" },
  { value: "events", label: "Events", group: "local_services", location_mode: "onsite" },
  { value: "notary", label: "Notary", group: "local_services", location_mode: "onsite" },
  { value: "it_support", label: "IT / Tech support", group: "local_services", location_mode: "onsite" },
  { value: "errand", label: "Errands", group: "local_services", location_mode: "onsite" },
  { value: "appliance_repair", label: "Appliance repair", group: "local_services", location_mode: "onsite" },
  { value: "locksmith", label: "Locksmith", group: "local_services", location_mode: "onsite" },
  { value: "security", label: "Security / Bodyguard", group: "local_services", location_mode: "onsite" },
  { value: "digital_tech", label: "Digital & Tech", group: "remote_jobs", location_mode: "remote" },
  { value: "marketing", label: "Marketing", group: "remote_jobs", location_mode: "remote" },
  { value: "business_admin", label: "Business / Admin", group: "remote_jobs", location_mode: "remote" },
  { value: "education", label: "Education", group: "remote_jobs", location_mode: "remote" },
  { value: "legal", label: "Legal", group: "remote_jobs", location_mode: "remote" },
  { value: "financial", label: "Financial", group: "remote_jobs", location_mode: "remote" },
  { value: "remote_work", label: "Remote Work", group: "remote_jobs", location_mode: "remote" },
  { value: "research", label: "Research", group: "remote_jobs", location_mode: "remote" },
];

export const LOCATION_COPY = {
  pickup_dropoff: {
    title: "Pickup & drop-off",
    pickup_label: "Pickup address",
    dropoff_label: "Drop-off address",
    pickup_placeholder: "Where to collect the item",
    dropoff_placeholder: "Where to deliver it",
  },
  onsite: {
    title: "Where the work happens",
    pickup_label: "Service address",
    pickup_placeholder: "The address where the service is performed",
  },
  remote: { title: "Remote — no location needed" },
};

// Service-specific location verbiage.
// Returns { title, pickup_label, dropoff_label?, pickup_placeholder?, dropoff_placeholder? }
export function locationLabelsFor(category, subcategory) {
  // Deliveries / couriers
  if (category === "delivery" || category === "courier") {
    return {
      title: "Pickup & drop-off",
      pickup_label: "Pickup address",
      dropoff_label: "Drop-off address",
      pickup_placeholder: "Where to collect the item",
      dropoff_placeholder: "Where to deliver it",
    };
  }
  // Moving
  if (category === "moving") {
    return {
      title: "Origin & destination",
      pickup_label: "Where are you moving from?",
      dropoff_label: "Where are you moving to?",
      pickup_placeholder: "Current address",
      dropoff_placeholder: "New address",
    };
  }
  // Onsite categories — phrase by service
  if (category === "cleaning") {
    return { title: "Where the cleaning happens", pickup_label: "Where would you like cleaned?", pickup_placeholder: "Home, office, or property address" };
  }
  if (category === "handyman") {
    return { title: "Where the work happens", pickup_label: "Where do you need the handyman?", pickup_placeholder: "Property address" };
  }
  if (category === "landscaping") {
    return { title: "Where the work happens", pickup_label: "Where should the landscaping be done?", pickup_placeholder: "Property address" };
  }
  if (category === "auto") {
    if (subcategory === "roadside") {
      return {
        title: "Where you need help",
        pickup_label: "Where are you stuck?",
        pickup_placeholder: "Drop a pin on the map if you do not have an exact address",
      };
    }
    return { title: "Where the work happens", pickup_label: "Where should the work be done?", pickup_placeholder: "Address or shop location" };
  }
  if (category === "pet_care") {
    const verb = {
      veterinary: "seen by the vet",
      petsitting: "watched",
      dogwalking: "walked",
      training: "trained",
      grooming: "groomed",
      boarding: "boarded",
    }[subcategory] || "cared for";
    return { title: "Where your pet is being cared for", pickup_label: `Where is your pet being ${verb}?`, pickup_placeholder: "Home, clinic, or park address" };
  }
  if (category === "events") {
    return { title: "Event location", pickup_label: "Where is the event happening?", pickup_placeholder: "Venue or address" };
  }
  if (category === "personal_care") {
    const verb = {
      hair: "your hair done",
      makeup: "your makeup done",
      nails: "your nails done",
      skincare: "your facial",
      massage: "your massage",
      barber: "your haircut",
      fitness: "your training session",
      lashes: "your lashes done",
    }[subcategory] || "your appointment";
    return { title: "Where the appointment is", pickup_label: `Where would you like ${verb}?`, pickup_placeholder: "Home, salon, or studio address" };
  }
  if (category === "medical") {
    return { title: "Where care is provided", pickup_label: "Where is the patient receiving care?", pickup_placeholder: "Patient's home or care location" };
  }
  // Remote / digital — no location
  return null;
}

export function locationModeFor(category) {
  return ALL_CATEGORIES.find((c) => c.value === category)?.location_mode || "onsite";
}

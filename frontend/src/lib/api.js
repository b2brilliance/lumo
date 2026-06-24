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
  physical_delivery: { hex: "#DC2626", tw: "bg-red-600", label: "Delivery & P2P", dot: "dot-physical" },
  local_services: { hex: "#2563EB", tw: "bg-blue-600", label: "Local Services", dot: "dot-local" },
  tech_digital: { hex: "#D97706", tw: "bg-amber-600", label: "Digital & Tech", dot: "dot-tech" },
  remote_jobs: { hex: "#0F766E", tw: "bg-teal-700", label: "Remote Jobs", dot: "dot-remote" },
};

export const ALL_CATEGORIES = [
  { value: "delivery", label: "Delivery", group: "physical_delivery", location_mode: "pickup_dropoff" },
  { value: "courier", label: "Courier", group: "physical_delivery", location_mode: "pickup_dropoff" },
  { value: "moving", label: "Moving", group: "physical_delivery", location_mode: "pickup_dropoff" },
  { value: "handyman", label: "Handyman", group: "local_services", location_mode: "onsite" },
  { value: "cleaning", label: "Cleaning", group: "local_services", location_mode: "onsite" },
  { value: "landscaping", label: "Landscaping", group: "local_services", location_mode: "onsite" },
  { value: "auto", label: "Auto", group: "local_services", location_mode: "onsite" },
  { value: "pet_care", label: "Pet Care", group: "local_services", location_mode: "onsite" },
  { value: "personal_care", label: "Personal Care", group: "local_services", location_mode: "onsite" },
  { value: "events", label: "Events", group: "local_services", location_mode: "onsite" },
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

export function locationModeFor(category) {
  return ALL_CATEGORIES.find((c) => c.value === category)?.location_mode || "onsite";
}

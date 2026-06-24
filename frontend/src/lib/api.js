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
  { value: "delivery", label: "Delivery", group: "physical_delivery" },
  { value: "courier", label: "Courier", group: "physical_delivery" },
  { value: "moving", label: "Moving", group: "physical_delivery" },
  { value: "handyman", label: "Handyman", group: "local_services" },
  { value: "cleaning", label: "Cleaning", group: "local_services" },
  { value: "landscaping", label: "Landscaping", group: "local_services" },
  { value: "auto", label: "Auto", group: "local_services" },
  { value: "pet_care", label: "Pet Care", group: "local_services" },
  { value: "personal_care", label: "Personal Care", group: "local_services" },
  { value: "events", label: "Events", group: "local_services" },
  { value: "digital_tech", label: "Digital & Tech", group: "remote_jobs" },
  { value: "marketing", label: "Marketing", group: "remote_jobs" },
  { value: "business_admin", label: "Business / Admin", group: "remote_jobs" },
  { value: "education", label: "Education", group: "remote_jobs" },
  { value: "legal", label: "Legal", group: "remote_jobs" },
  { value: "financial", label: "Financial", group: "remote_jobs" },
  { value: "remote_work", label: "Remote Work", group: "remote_jobs" },
  { value: "research", label: "Research", group: "remote_jobs" },
];

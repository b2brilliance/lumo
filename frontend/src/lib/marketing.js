// Shared marketing constants — cities we operate in worldwide, the 4
// value-props that drive provider recruiting, and the categories we
// spin dedicated `/careers/[category]` SEO landing pages for.
//
// Source of truth for city list: /api/landing/cities on the backend
// (see server.py LANDING_CITIES). We mirror the slugs here so build-
// time route generation works, and fetch the live list at runtime for
// the index pages.
export const RECRUITING_CITIES = [
  // North America
  { slug: "new-york",     name: "New York",       country: "US" },
  { slug: "los-angeles",  name: "Los Angeles",    country: "US" },
  { slug: "chicago",      name: "Chicago",        country: "US" },
  { slug: "houston",      name: "Houston",        country: "US" },
  { slug: "phoenix",      name: "Phoenix",        country: "US" },
  { slug: "philadelphia", name: "Philadelphia",   country: "US" },
  { slug: "san-antonio",  name: "San Antonio",    country: "US" },
  { slug: "san-diego",    name: "San Diego",      country: "US" },
  { slug: "dallas",       name: "Dallas",         country: "US" },
  { slug: "san-francisco",name: "San Francisco",  country: "US" },
  { slug: "seattle",      name: "Seattle",        country: "US" },
  { slug: "boston",       name: "Boston",         country: "US" },
  { slug: "austin",       name: "Austin",         country: "US" },
  { slug: "miami",        name: "Miami",          country: "US" },
  { slug: "atlanta",      name: "Atlanta",        country: "US" },
  { slug: "denver",       name: "Denver",         country: "US" },
  { slug: "portland",     name: "Portland",       country: "US" },
  { slug: "toronto",      name: "Toronto",        country: "CA" },
  { slug: "vancouver",    name: "Vancouver",      country: "CA" },
  { slug: "montreal",     name: "Montreal",       country: "CA" },
  { slug: "mexico-city",  name: "Mexico City",    country: "MX" },
  // Europe
  { slug: "london",       name: "London",         country: "GB" },
  { slug: "manchester",   name: "Manchester",     country: "GB" },
  { slug: "edinburgh",    name: "Edinburgh",      country: "GB" },
  { slug: "dublin",       name: "Dublin",         country: "IE" },
  { slug: "paris",        name: "Paris",          country: "FR" },
  { slug: "berlin",       name: "Berlin",         country: "DE" },
  { slug: "munich",       name: "Munich",         country: "DE" },
  { slug: "madrid",       name: "Madrid",         country: "ES" },
  { slug: "barcelona",    name: "Barcelona",      country: "ES" },
  { slug: "rome",         name: "Rome",           country: "IT" },
  { slug: "amsterdam",    name: "Amsterdam",      country: "NL" },
  { slug: "stockholm",    name: "Stockholm",      country: "SE" },
  { slug: "copenhagen",   name: "Copenhagen",     country: "DK" },
  // Asia-Pacific
  { slug: "sydney",       name: "Sydney",         country: "AU" },
  { slug: "melbourne",    name: "Melbourne",      country: "AU" },
  { slug: "auckland",     name: "Auckland",       country: "NZ" },
  { slug: "singapore",    name: "Singapore",      country: "SG" },
  { slug: "hong-kong",    name: "Hong Kong",      country: "HK" },
  { slug: "tokyo",        name: "Tokyo",          country: "JP" },
  { slug: "seoul",        name: "Seoul",          country: "KR" },
  { slug: "bangalore",    name: "Bangalore",      country: "IN" },
  { slug: "mumbai",       name: "Mumbai",         country: "IN" },
  { slug: "delhi",        name: "Delhi",          country: "IN" },
  { slug: "dubai",        name: "Dubai",          country: "AE" },
  // Africa & LatAm
  { slug: "cape-town",    name: "Cape Town",      country: "ZA" },
  { slug: "johannesburg", name: "Johannesburg",   country: "ZA" },
  { slug: "lagos",        name: "Lagos",          country: "NG" },
  { slug: "nairobi",      name: "Nairobi",        country: "KE" },
  { slug: "sao-paulo",    name: "São Paulo",      country: "BR" },
  { slug: "buenos-aires", name: "Buenos Aires",   country: "AR" },
];

// Four provider hooks the user picked as priority (a, b, d, e). Ordering
// = the sequence they appear on landing / provider pages.
export const PROVIDER_HOOKS = [
  {
    id: "keep_90",
    title: "Keep 90% of every dollar",
    subtitle: "Half of what TaskRabbit / Instacart / Uber Eats take.",
    body: "Lumo takes a flat 10% platform fee — no lead fees, no boosts, no upsells. You do the work, you keep the payout.",
    icon: "wallet",
  },
  {
    id: "payout_24h",
    title: "Payouts in under 24 hours",
    subtitle: "Not 7 days. Not weekly batching. Same-day if you connect Stripe.",
    body: "The moment a customer confirms your work, funds move to your bank via Stripe Connect. Instant wallet withdrawal for cash-out anytime.",
    icon: "clock",
  },
  {
    id: "own_hours",
    title: "Pick your hours, pick your jobs",
    subtitle: "Zero quota, zero minimums, no ghost-employer boss.",
    body: "Post one job a month or one hundred — nothing changes on your side. Accept only the jobs you actually want; decline the rest with no penalty.",
    icon: "calendar",
  },
  {
    id: "gps_jobs",
    title: "Jobs come to you, GPS-first",
    subtitle: "Uber-style live tracker maps you to the customer.",
    body: "Set your service radius. Nearby jobs surface at the top of your feed with distance, walking-time, and photo evidence baked in. No cold-emailing bids.",
    icon: "map-pin",
  },
];

// Categories we mint dedicated `/careers/[category]` SEO landing pages
// for. Chosen to match common "X jobs near me" search intent.
export const RECRUITING_CATEGORIES = [
  { slug: "cleaner",       label: "Cleaner",           service: "cleaning",     rate: "$25–$45/hr" },
  { slug: "handyman",      label: "Handyman",          service: "handyman",     rate: "$45–$95/hr" },
  { slug: "mover",         label: "Mover",             service: "moving",       rate: "$40–$85/hr" },
  { slug: "delivery-driver", label: "Delivery driver", service: "delivery",     rate: "$18–$32/hr" },
  { slug: "landscaper",    label: "Landscaper",        service: "landscaping",  rate: "$30–$60/hr" },
  { slug: "roadside-tech", label: "Roadside tech",     service: "roadside",     rate: "$65–$150/job" },
  { slug: "tow-operator",  label: "Tow operator",      service: "towing",       rate: "$80–$220/job" },
  { slug: "auto-detailer", label: "Auto detailer",     service: "auto_detailing", rate: "$45–$120/job" },
  { slug: "mechanic",      label: "Mobile mechanic",   service: "auto",         rate: "$70–$140/hr" },
  { slug: "electrician",   label: "Electrician",       service: "electrical",   rate: "$60–$140/hr" },
  { slug: "plumber",       label: "Plumber",           service: "plumbing",     rate: "$60–$140/hr" },
  { slug: "pet-sitter",    label: "Pet sitter",        service: "pet_care",     rate: "$18–$45/visit" },
  { slug: "personal-shopper", label: "Personal shopper", service: "errand",     rate: "$25–$40/hr" },
  { slug: "notary",        label: "Mobile notary",     service: "notary",       rate: "$45–$200/job" },
  { slug: "appliance-tech",label: "Appliance tech",    service: "appliance_repair", rate: "$100–$220/job" },
  { slug: "event-staff",   label: "Event staff",       service: "events",       rate: "$22–$45/hr" },
  { slug: "beauty-pro",    label: "Beauty pro",        service: "beauty",       rate: "$40–$120/visit" },
  { slug: "photographer",  label: "Photographer",      service: "creative",     rate: "$85–$250/hr" },
];

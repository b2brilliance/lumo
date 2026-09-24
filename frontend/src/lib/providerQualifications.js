/* Per-provider-category qualification schemas — drives the dynamic
 * questionnaire + document upload UI that appears during provider
 * registration once a category has been selected.
 *
 * Shape:
 *   {
 *     summary: "one-line intro shown above the fields",
 *     fields: [
 *       { key, type: 'text'|'number'|'select'|'radio'|'checkbox'|'textarea',
 *         label, help?, required?, options?: [{value,label}] }
 *     ],
 *     documents: [
 *       { key, label, help?, required? }   // uploaded via /media/upload-provider-doc
 *     ]
 *   }
 *
 * The Register wizard iterates through the applicant's selected categories
 * and renders one <QualificationBlock> per category using this catalogue.
 * Anything NOT in the catalogue simply skips the qual step for that
 * category (the applicant still keeps the sub-services they ticked).
 */

const YEARS_OPTIONS = [
  { value: "0-1", label: "Less than 1 year" },
  { value: "1-2", label: "1–2 years" },
  { value: "3-5", label: "3–5 years" },
  { value: "6-10", label: "6–10 years" },
  { value: "10+", label: "10+ years" },
];

export const QUALIFICATION_SCHEMAS = {
  // ── DRIVING & TRANSPORT ───────────────────────────────────────────────
  delivery: {
    summary: "Anything you'll deliver — food, packages, groceries. We check for a valid licence + insurance before we send you jobs.",
    fields: [
      { key: "vehicle_type", type: "select", label: "Vehicle you'll use", required: true, options: [
        { value: "bike",  label: "Bike / e-bike" },
        { value: "scooter", label: "Scooter" },
        { value: "car", label: "Car" },
        { value: "van", label: "Van / cargo van" },
        { value: "truck", label: "Truck" },
        { value: "foot", label: "On foot / walking" },
      ]},
      { key: "years_driving", type: "select", label: "Years of driving experience", required: true, options: YEARS_OPTIONS },
      { key: "has_dashcam", type: "radio", label: "Do you have a dashcam?", options: [
        { value: "yes", label: "Yes" }, { value: "no", label: "No" },
      ]},
    ],
    documents: [
      { key: "drivers_license", label: "Driver's license (front)", required: true, help: "Clear photo of the front of your licence. We verify age & validity." },
      { key: "vehicle_insurance", label: "Vehicle insurance card", required: true, help: "Current insurance card showing your name and expiry date." },
      { key: "vehicle_registration", label: "Vehicle registration", required: false, help: "Optional but speeds up approval." },
    ],
  },
  courier: {
    summary: "Courier work — documents, small parcels, sensitive items. Signature + chain-of-custody matter here.",
    fields: [
      { key: "vehicle_type", type: "select", label: "Vehicle you'll use", required: true, options: [
        { value: "bike", label: "Bike" }, { value: "scooter", label: "Scooter" }, { value: "car", label: "Car" }, { value: "van", label: "Van" }, { value: "foot", label: "On foot" },
      ]},
      { key: "handles_fragile", type: "radio", label: "Comfortable handling fragile / medical items?", options: [
        { value: "yes", label: "Yes" }, { value: "sometimes", label: "Case-by-case" }, { value: "no", label: "No" },
      ]},
    ],
    documents: [
      { key: "drivers_license", label: "Government-issued ID", required: true },
      { key: "background_check_consent", label: "Background-check consent form (PDF)", required: false, help: "Speeds up approval for medical & legal courier work." },
    ],
  },
  towing: {
    summary: "Roadside & tow-truck work. We verify licencing + insurance because you'll be handling other people's vehicles.",
    fields: [
      { key: "truck_type", type: "select", label: "Truck / rig type", required: true, options: [
        { value: "flatbed", label: "Flatbed" }, { value: "wheel_lift", label: "Wheel-lift" }, { value: "integrated", label: "Integrated (heavy)" }, { value: "service_van", label: "Service van (roadside only)" },
      ]},
      { key: "years_experience", type: "select", label: "Years towing / roadside experience", required: true, options: YEARS_OPTIONS },
      { key: "aaa_approved", type: "radio", label: "Are you AAA-approved or motor-club affiliated?", options: [
        { value: "yes", label: "Yes" }, { value: "no", label: "No" },
      ]},
    ],
    documents: [
      { key: "cdl_license", label: "CDL / Class-A/B licence (if required in your state)", required: false },
      { key: "commercial_insurance", label: "Commercial towing insurance certificate", required: true },
      { key: "operator_permit", label: "State towing operator permit", required: false },
    ],
  },

  // ── HOME & FIELD SERVICES ────────────────────────────────────────────
  cleaning: {
    summary: "Residential + commercial cleaning. We ask about experience, insurance and background-check consent.",
    fields: [
      { key: "years_experience", type: "select", label: "Years of cleaning experience", required: true, options: YEARS_OPTIONS },
      { key: "supply_own_equipment", type: "radio", label: "Do you bring your own supplies + equipment?", required: true, options: [
        { value: "always", label: "Always" }, { value: "sometimes", label: "Case-by-case" }, { value: "never", label: "Never (client-supplied)" },
      ]},
      { key: "background_check_ok", type: "radio", label: "Willing to consent to a background check?", required: true, options: [
        { value: "yes", label: "Yes" }, { value: "no", label: "No" },
      ]},
      { key: "pet_friendly", type: "radio", label: "OK cleaning homes with pets?", options: [
        { value: "yes", label: "Yes" }, { value: "no", label: "No" },
      ]},
    ],
    documents: [
      { key: "liability_insurance", label: "General liability insurance", required: false, help: "Recommended — required for commercial jobs." },
      { key: "biohazard_cert", label: "Biohazard / trauma-clean cert", required: false, help: "Upload only if you offer deep-clean or biohazard services." },
    ],
  },
  handyman: {
    summary: "Small repairs, mounting, assembly, minor plumbing/electrical (where legal). We verify licence status by trade.",
    fields: [
      { key: "years_experience", type: "select", label: "Years handyman experience", required: true, options: YEARS_OPTIONS },
      { key: "licensed_trades", type: "checkbox", label: "Which trades are you licensed for?", options: [
        { value: "electrical", label: "Electrical" },
        { value: "plumbing", label: "Plumbing" },
        { value: "hvac", label: "HVAC" },
        { value: "general_contractor", label: "General contractor" },
        { value: "none", label: "None (handyman-scope only)" },
      ]},
      { key: "has_own_tools", type: "radio", label: "Do you have your own tools + transport?", required: true, options: [
        { value: "yes", label: "Yes" }, { value: "partial", label: "Some tools" }, { value: "no", label: "No" },
      ]},
    ],
    documents: [
      { key: "trade_license", label: "Trade licence (if applicable)", required: false, help: "Only needed if you offer electrical, plumbing, HVAC or GC work." },
      { key: "liability_insurance", label: "Liability insurance", required: false },
    ],
  },
  auto: {
    summary: "Auto repair & mobile mechanic work. ASE cert or equivalent boosts your ranking in the customer feed.",
    fields: [
      { key: "years_experience", type: "select", label: "Years as a mechanic", required: true, options: YEARS_OPTIONS },
      { key: "ase_certified", type: "radio", label: "ASE-certified?", required: true, options: [
        { value: "master", label: "Yes — ASE Master Tech" },
        { value: "some", label: "Yes — some ASE certs" },
        { value: "no", label: "Not yet" },
      ]},
      { key: "specialties", type: "checkbox", label: "Specialties (pick all that apply)", options: [
        { value: "brakes", label: "Brakes" }, { value: "engine", label: "Engine" },
        { value: "transmission", label: "Transmission" }, { value: "electrical", label: "Electrical" },
        { value: "diesel", label: "Diesel" }, { value: "ev", label: "EV / hybrid" },
        { value: "diagnostics", label: "Diagnostics" }, { value: "body", label: "Body & paint" },
      ]},
      { key: "mobile_capable", type: "radio", label: "Can you work as a mobile mechanic (travel to customer)?", options: [
        { value: "yes", label: "Yes" }, { value: "shop_only", label: "Shop-based only" },
      ]},
    ],
    documents: [
      { key: "ase_certificate", label: "ASE certificate(s)", required: false },
      { key: "trade_license", label: "State mechanic licence (if required)", required: false },
      { key: "liability_insurance", label: "Garagekeeper / liability insurance", required: false },
    ],
  },
  landscaping: {
    summary: "Lawn, gardening, tree work, snow removal. We ask about equipment + pesticide/chemical certs.",
    fields: [
      { key: "years_experience", type: "select", label: "Years landscaping experience", required: true, options: YEARS_OPTIONS },
      { key: "chemical_licensed", type: "radio", label: "Licensed to apply pesticides/fertilizers?", options: [
        { value: "yes", label: "Yes" }, { value: "no", label: "No, avoid these jobs" }, { value: "learning", label: "Studying for cert" },
      ]},
      { key: "own_equipment", type: "radio", label: "Do you bring your own mowers / equipment?", required: true, options: [
        { value: "yes", label: "Yes" }, { value: "no", label: "No" },
      ]},
    ],
    documents: [
      { key: "pesticide_license", label: "Pesticide-applicator licence", required: false },
      { key: "arborist_cert", label: "Certified arborist / ISA credential", required: false, help: "Only needed for tree-removal work." },
    ],
  },
  moving: {
    summary: "Moving, hauling, junk removal. We verify licence + a valid moving USDOT number when applicable.",
    fields: [
      { key: "team_size", type: "select", label: "How many movers on your crew?", required: true, options: [
        { value: "solo", label: "Just me" }, { value: "2", label: "2" }, { value: "3-4", label: "3–4" }, { value: "5+", label: "5+" },
      ]},
      { key: "truck_size", type: "select", label: "Truck size", required: true, options: [
        { value: "pickup", label: "Pickup" }, { value: "cargo_van", label: "Cargo van" }, { value: "box_15", label: "15 ft box" }, { value: "box_26", label: "26 ft box" }, { value: "none", label: "No truck (I'll rent per job)" },
      ]},
      { key: "usdot_number", type: "text", label: "USDOT number (if you have one)" },
    ],
    documents: [
      { key: "commercial_insurance", label: "Commercial / cargo insurance", required: true },
      { key: "usdot_authority", label: "USDOT authority certificate", required: false, help: "Only needed for interstate moves." },
    ],
  },

  // ── HEALTH / PERSONAL / SPECIALIST ───────────────────────────────────
  pet_care: {
    summary: "Dog walking, boarding, grooming, sitting. Background check + pet-first-aid boost placement.",
    fields: [
      { key: "years_experience", type: "select", label: "Years with animals", required: true, options: YEARS_OPTIONS },
      { key: "services", type: "checkbox", label: "Which services will you offer?", options: [
        { value: "walking", label: "Dog walking" }, { value: "sitting", label: "In-home sitting" },
        { value: "boarding", label: "Boarding (host at your home)" }, { value: "grooming", label: "Grooming" },
        { value: "training", label: "Training" }, { value: "day_care", label: "Daycare" },
      ]},
      { key: "comfortable_with_large_dogs", type: "radio", label: "Comfortable with large / high-energy dogs?", options: [
        { value: "yes", label: "Yes" }, { value: "small_only", label: "Small dogs only" },
      ]},
    ],
    documents: [
      { key: "pet_first_aid", label: "Pet CPR / first-aid cert", required: false },
      { key: "background_check_consent", label: "Background-check consent (PDF)", required: false },
    ],
  },
  medical: {
    summary: "Home-health, phlebotomy, nursing visits, medical courier. Strict credential check — expect verification calls.",
    fields: [
      { key: "credential", type: "select", label: "Highest medical credential", required: true, options: [
        { value: "cna", label: "CNA" }, { value: "hha", label: "Home Health Aide" },
        { value: "lpn", label: "LPN" }, { value: "rn", label: "RN" },
        { value: "phlebotomist", label: "Phlebotomist" }, { value: "medical_courier", label: "Medical courier only" },
        { value: "other", label: "Other (specify in bio)" },
      ]},
      { key: "years_experience", type: "select", label: "Years in role", required: true, options: YEARS_OPTIONS },
      { key: "hipaa_trained", type: "radio", label: "Completed HIPAA training in the last 12 months?", required: true, options: [
        { value: "yes", label: "Yes" }, { value: "no", label: "No" },
      ]},
    ],
    documents: [
      { key: "medical_license", label: "Medical licence / certification", required: true },
      { key: "hipaa_cert", label: "HIPAA training certificate", required: false },
      { key: "background_check_consent", label: "Background-check consent (PDF)", required: true },
    ],
  },

  // ── PROFESSIONAL / SKILLED ───────────────────────────────────────────
  digital_tech: {
    summary: "IT support, computer repair, software work. Portfolio + certs matter more than years.",
    fields: [
      { key: "specialties", type: "checkbox", label: "Specialties", options: [
        { value: "computer_repair", label: "Computer repair" }, { value: "network", label: "Networking / Wi-Fi" },
        { value: "smart_home", label: "Smart-home setup" }, { value: "web_dev", label: "Web development" },
        { value: "mobile_dev", label: "Mobile app development" }, { value: "data_recovery", label: "Data recovery" },
        { value: "av_install", label: "TV / AV install" },
      ]},
      { key: "years_experience", type: "select", label: "Years in field", required: true, options: YEARS_OPTIONS },
      { key: "portfolio_url", type: "text", label: "Portfolio / GitHub URL" },
    ],
    documents: [
      { key: "cert_scan", label: "Certifications (CompTIA, Cisco, AWS, etc.)", required: false, help: "Combine into one PDF if you have multiple." },
    ],
  },
  marketing: {
    summary: "Freelance marketing — social, ads, SEO, content. Show your work.",
    fields: [
      { key: "specialties", type: "checkbox", label: "Specialties", options: [
        { value: "seo", label: "SEO" }, { value: "paid_ads", label: "Paid ads (Google / Meta)" },
        { value: "social", label: "Social media management" }, { value: "content", label: "Content writing" },
        { value: "email", label: "Email marketing" }, { value: "brand", label: "Brand / logo design" },
      ]},
      { key: "years_experience", type: "select", label: "Years in marketing", required: true, options: YEARS_OPTIONS },
      { key: "portfolio_url", type: "text", label: "Portfolio URL" },
    ],
    documents: [
      { key: "portfolio_pdf", label: "Portfolio / case study PDF", required: false },
    ],
  },
  business_admin: {
    summary: "Admin, bookkeeping, VA work. QuickBooks + notary certs help.",
    fields: [
      { key: "specialties", type: "checkbox", label: "Specialties", options: [
        { value: "bookkeeping", label: "Bookkeeping" }, { value: "va", label: "Virtual assistant" },
        { value: "notary", label: "Notary" }, { value: "tax_prep", label: "Tax prep" },
        { value: "data_entry", label: "Data entry" }, { value: "translation", label: "Translation" },
      ]},
      { key: "years_experience", type: "select", label: "Years experience", required: true, options: YEARS_OPTIONS },
    ],
    documents: [
      { key: "notary_commission", label: "Notary commission (if applicable)", required: false },
      { key: "cpa_ea_license", label: "CPA / EA licence (if tax prep)", required: false },
    ],
  },
  education: {
    summary: "Tutoring, lessons, coaching. Subject + level + background-check consent all matter.",
    fields: [
      { key: "subjects", type: "checkbox", label: "Subjects you teach", options: [
        { value: "math", label: "Math" }, { value: "science", label: "Science" },
        { value: "english", label: "English / writing" }, { value: "reading", label: "Reading" },
        { value: "test_prep", label: "Test prep (SAT/ACT/GRE)" }, { value: "language", label: "Foreign language" },
        { value: "coding", label: "Coding / STEM" }, { value: "music", label: "Music" },
        { value: "art", label: "Art" }, { value: "test_online_only", label: "Adult ed / other" },
      ]},
      { key: "levels", type: "checkbox", label: "Levels you tutor", required: true, options: [
        { value: "elementary", label: "Elementary" }, { value: "middle", label: "Middle school" },
        { value: "high_school", label: "High school" }, { value: "college", label: "College" }, { value: "adult", label: "Adult" },
      ]},
      { key: "highest_degree", type: "select", label: "Highest degree", options: [
        { value: "hs", label: "High school" }, { value: "some_college", label: "Some college" },
        { value: "bachelor", label: "Bachelor's" }, { value: "master", label: "Master's" }, { value: "phd", label: "PhD / doctorate" },
      ]},
    ],
    documents: [
      { key: "degree_transcript", label: "Degree / transcript", required: false },
      { key: "background_check_consent", label: "Background-check consent (PDF)", required: true, help: "Required for tutoring minors." },
    ],
  },
  legal: {
    summary: "Legal document prep, paralegal, notary. State bar or paralegal-cert required.",
    fields: [
      { key: "credential", type: "select", label: "Credential", required: true, options: [
        { value: "attorney", label: "Licensed attorney" },
        { value: "paralegal_cert", label: "Certified paralegal" },
        { value: "legal_assistant", label: "Legal assistant / doc prep" },
        { value: "notary_public", label: "Notary public only" },
      ]},
      { key: "bar_state", type: "text", label: "Bar / cert state (if attorney or paralegal)" },
    ],
    documents: [
      { key: "bar_license", label: "Bar card / paralegal cert", required: true },
    ],
  },
  financial: {
    summary: "Tax prep, financial planning, bookkeeping. Fiduciary or PTIN status matters.",
    fields: [
      { key: "credential", type: "select", label: "Credential", required: true, options: [
        { value: "cpa", label: "CPA" }, { value: "ea", label: "Enrolled Agent" },
        { value: "cfp", label: "CFP" }, { value: "ptin_holder", label: "PTIN holder (tax prep only)" },
        { value: "bookkeeper", label: "Bookkeeper (no licence)" }, { value: "other", label: "Other" },
      ]},
      { key: "years_experience", type: "select", label: "Years experience", required: true, options: YEARS_OPTIONS },
    ],
    documents: [
      { key: "credential_scan", label: "Credential / licence scan", required: true },
    ],
  },
  events: {
    summary: "DJs, photographers, caterers, servers, bartenders. Alcohol licences + insurance matter for catering.",
    fields: [
      { key: "specialties", type: "checkbox", label: "Specialties", options: [
        { value: "photography", label: "Photography" }, { value: "videography", label: "Videography" },
        { value: "dj", label: "DJ" }, { value: "live_music", label: "Live music" },
        { value: "catering", label: "Catering" }, { value: "bartending", label: "Bartending" },
        { value: "florals", label: "Florals" }, { value: "planning", label: "Event planning" },
      ]},
      { key: "years_experience", type: "select", label: "Years experience", required: true, options: YEARS_OPTIONS },
      { key: "portfolio_url", type: "text", label: "Portfolio URL" },
      { key: "alcohol_permit", type: "radio", label: "Bartending: do you hold a state alcohol-server permit?", options: [
        { value: "yes", label: "Yes" }, { value: "no", label: "No" }, { value: "na", label: "N/A" },
      ]},
    ],
    documents: [
      { key: "food_handlers", label: "Food handler's / servsafe cert (catering)", required: false },
      { key: "liability_insurance", label: "General liability insurance", required: false },
    ],
  },
  remote_work: {
    summary: "1099 / remote contracts — writing, design, dev, VA. Portfolio-driven; light doc requirements.",
    fields: [
      { key: "specialties", type: "checkbox", label: "Specialties", options: [
        { value: "writing", label: "Writing" }, { value: "design", label: "Design" },
        { value: "dev", label: "Development" }, { value: "va", label: "VA" },
        { value: "customer_support", label: "Customer support" }, { value: "translation", label: "Translation" },
      ]},
      { key: "years_experience", type: "select", label: "Years experience", required: true, options: YEARS_OPTIONS },
      { key: "portfolio_url", type: "text", label: "Portfolio URL" },
    ],
    documents: [
      { key: "portfolio_pdf", label: "Portfolio PDF", required: false },
    ],
  },
};

/** Whether the applicant has satisfied every required field + doc for a
 * given category. Returns { ok: bool, missing: [labels] }. */
export function validateQualification(categoryKey, answers = {}, docs = {}) {
  const schema = QUALIFICATION_SCHEMAS[categoryKey];
  if (!schema) return { ok: true, missing: [] };
  const missing = [];
  (schema.fields || []).forEach((f) => {
    if (!f.required) return;
    const v = answers[f.key];
    if (v == null || v === "" || (Array.isArray(v) && v.length === 0)) missing.push(f.label);
  });
  (schema.documents || []).forEach((d) => {
    if (!d.required) return;
    if (!docs[d.key]) missing.push(d.label);
  });
  return { ok: missing.length === 0, missing };
}

// Credential kinds catalog (display labels) grouped by job category.
// Used by the Credentials page to drive the kind dropdown.

export const CREDENTIAL_KINDS_BY_CATEGORY = {
  medical: [
    { value: "rn", label: "Registered Nurse (RN)" },
    { value: "lpn", label: "Licensed Practical Nurse (LPN / LVN)" },
    { value: "cna", label: "Certified Nursing Assistant (CNA)" },
    { value: "hha", label: "Home Health Aide (HHA)" },
    { value: "dpt", label: "Physical Therapist (DPT / PT)" },
    { value: "pta", label: "Physical Therapist Assistant (PTA)" },
    { value: "ot", label: "Occupational Therapist (OT)" },
    { value: "slp", label: "Speech-Language Pathologist (SLP)" },
    { value: "rt", label: "Respiratory Therapist (RT)" },
    { value: "cpt", label: "Phlebotomist (CPT)" },
    { value: "rad_tech", label: "Radiologic Technologist (ARRT)" },
    { value: "lcsw", label: "Licensed Clinical Social Worker (LCSW)" },
    { value: "lmft", label: "Licensed Marriage & Family Therapist (LMFT)" },
    { value: "psychologist", label: "Licensed Psychologist (PhD / PsyD)" },
    { value: "md_do_np_pa", label: "Physician (MD/DO) / NP / PA" },
    { value: "ibclc", label: "Lactation Consultant (IBCLC)" },
    { value: "doula", label: "Certified Doula" },
  ],
  legal: [
    { value: "bar_license", label: "Bar License (Attorney)" },
    { value: "paralegal", label: "Certified Paralegal" },
    { value: "notary", label: "Notary Public" },
  ],
  financial: [
    { value: "cpa", label: "Certified Public Accountant (CPA)" },
    { value: "ea", label: "Enrolled Agent (EA)" },
    { value: "cfp", label: "Certified Financial Planner (CFP)" },
    { value: "series_65", label: "Series 65 (Investment Adviser)" },
    { value: "series_7", label: "Series 7 (General Securities)" },
    { value: "insurance_license", label: "Insurance License" },
  ],
  auto: [
    { value: "ase_master", label: "ASE Master Technician" },
    { value: "ase_general", label: "ASE Certification (general)" },
    { value: "ev_specialist", label: "EV / Hybrid Specialist" },
    { value: "tow_operator", label: "Tow Operator Permit" },
  ],
  handyman: [
    { value: "general_contractor", label: "General Contractor License" },
    { value: "electrician", label: "Electrician License" },
    { value: "plumber", label: "Plumber License" },
    { value: "hvac", label: "HVAC License" },
    { value: "epa_608", label: "EPA 608 (refrigerant)" },
  ],
  landscaping: [
    { value: "pesticide_applicator", label: "Pesticide Applicator License" },
    { value: "arborist", label: "Certified Arborist (ISA)" },
    { value: "irrigation", label: "Irrigation Contractor License" },
  ],
  cleaning: [
    { value: "iicrc", label: "IICRC Cleaning Certification" },
    { value: "bonded", label: "Bonded & Insured" },
  ],
  personal_care: [
    { value: "cosmetology", label: "Cosmetology License" },
    { value: "esthetician", label: "Esthetician License" },
    { value: "nail_tech", label: "Nail Technician License" },
    { value: "barber", label: "Barber License" },
    { value: "massage_therapist", label: "Licensed Massage Therapist (LMT)" },
    { value: "cpt_personal_trainer", label: "Certified Personal Trainer (NASM/ACE/etc.)" },
  ],
  pet_care: [
    { value: "dvm", label: "Doctor of Veterinary Medicine (DVM)" },
    { value: "vet_tech", label: "Veterinary Technician" },
    { value: "groomer_cert", label: "Certified Pet Groomer" },
    { value: "dog_trainer_cert", label: "Certified Dog Trainer (CCPDT)" },
  ],
  events: [
    { value: "food_handler", label: "Food Handler Permit" },
    { value: "servsafe", label: "ServSafe Manager" },
    { value: "tips_alcohol", label: "TIPS / Alcohol Service Permit" },
    { value: "wedding_officiant", label: "Ordained / Wedding Officiant" },
  ],
  moving: [
    { value: "usdot", label: "USDOT / Motor Carrier Authority" },
    { value: "cdl", label: "Commercial Driver's License (CDL)" },
  ],
  education: [
    { value: "teaching_license", label: "State Teaching License" },
    { value: "ell_cert", label: "ELL / TESOL Certificate" },
  ],
  // Universal — applies to any category as supplemental
  any: [
    { value: "background_check", label: "Background check (cleared)" },
    { value: "liability_insurance", label: "General Liability Insurance" },
    { value: "workers_comp", label: "Workers' Comp Insurance" },
    { value: "business_license", label: "Local Business License" },
  ],
};

export const ALL_KINDS = Object.values(CREDENTIAL_KINDS_BY_CATEGORY).flat();
export const KIND_LABEL = Object.fromEntries(ALL_KINDS.map((k) => [k.value, k.label]));

export function kindsForCategory(category) {
  return [
    ...(CREDENTIAL_KINDS_BY_CATEGORY[category] || []),
    ...CREDENTIAL_KINDS_BY_CATEGORY.any,
  ];
}

export const REQUIRED_CATEGORIES = new Set(["medical", "legal"]);

// Schema-driven service detail forms.
// Each schema has: { subcategoryLabel?, subcategories: { value: { label, fields?, helpText? } }, baseFields? }
// Field types: "select" | "number" | "text" | "textarea" | "multiselect" | "conditional"

const COMMON_ITEM_SIZES = [
  { value: "envelope", label: "Envelope / documents" },
  { value: "small_box", label: "Small box (≤ shoebox)" },
  { value: "medium_box", label: "Medium box (≤ moving box)" },
  { value: "large_box", label: "Large box / suitcase" },
  { value: "furniture", label: "Furniture" },
  { value: "appliance", label: "Appliance" },
  { value: "vehicle_parts", label: "Vehicle parts" },
  { value: "groceries", label: "Groceries / food" },
  { value: "other", label: "Other" },
];

const CLEANING_ROOMS = [
  { value: "living_room", label: "Living room" },
  { value: "kitchen", label: "Kitchen" },
  { value: "bathroom", label: "Bathroom" },
  { value: "bedroom", label: "Bedroom" },
  { value: "office", label: "Office / study" },
  { value: "laundry_room", label: "Laundry room" },
  { value: "garage", label: "Garage" },
  { value: "outdoor", label: "Patio / outdoor" },
];

const CLEANING_TASKS = [
  { value: "sweep", label: "Sweep" },
  { value: "mop", label: "Mop" },
  { value: "vacuum", label: "Vacuum" },
  { value: "dust", label: "Dust surfaces" },
  { value: "windows", label: "Windows / mirrors" },
  { value: "trash", label: "Take out trash" },
  { value: "laundry", label: "Laundry" },
  { value: "dishes", label: "Dishes" },
  { value: "fridge", label: "Clean fridge interior" },
  { value: "oven", label: "Clean oven interior" },
  { value: "toilet", label: "Toilet scrub" },
  { value: "shower", label: "Shower / tub scrub" },
];

const PROPERTY_TYPES = [
  { value: "apartment", label: "Apartment / condo" },
  { value: "house", label: "Single-family house" },
  { value: "townhouse", label: "Townhouse" },
  { value: "office", label: "Office / commercial" },
  { value: "airbnb", label: "Short-term rental" },
];

const HOUSE_SIZES = [
  { value: "studio", label: "Studio" },
  { value: "1br", label: "1 bedroom" },
  { value: "2br", label: "2 bedrooms" },
  { value: "3br", label: "3 bedrooms" },
  { value: "4br_plus", label: "4+ bedrooms" },
];

const TIRE_SIZES = [
  "13", "14", "15", "16", "17", "18", "19", "20", "21", "22"
].map((s) => ({ value: s, label: `${s}\" wheel` }));

const CAR_SECTIONS = [
  { value: "engine", label: "Engine" },
  { value: "transmission", label: "Transmission" },
  { value: "brakes", label: "Brakes" },
  { value: "suspension", label: "Suspension / steering" },
  { value: "exhaust", label: "Exhaust" },
  { value: "electrical", label: "Electrical / battery / alternator" },
  { value: "hvac", label: "HVAC / A/C / heater" },
  { value: "fuel_system", label: "Fuel system" },
  { value: "cooling", label: "Cooling system / radiator" },
  { value: "drivetrain", label: "Drivetrain / axles / differential" },
  { value: "tires_wheels", label: "Tires / wheels" },
  { value: "fluids", label: "Fluids (oil / coolant / brake / power steering)" },
  { value: "exterior", label: "Body / exterior" },
  { value: "glass", label: "Glass / windshield" },
  { value: "interior", label: "Interior / seats / dash" },
  { value: "lights", label: "Lights / signals" },
  { value: "diagnostic", label: "Diagnostic / check-engine light" },
  { value: "other", label: "Other / not sure" },
];

// ── Shared vehicle-picker fields ──────────────────────────────────────
// Year / Make / Model dropdowns used by any category that touches a
// customer vehicle (auto, roadside, auto_detailing, towing). Model
// options depend on the selected make — FieldRenderer supports
// `options: (details) => [...]` for that. Cars we don't recognise fall
// back to a single "Other (write in notes)" option so customers aren't
// blocked.
const VEHICLE_YEARS = (() => {
  const arr = [];
  for (let y = new Date().getFullYear() + 1; y >= 1980; y--) arr.push({ value: String(y), label: String(y) });
  return arr;
})();
const VEHICLE_MAKES = [
  "Acura","Audi","BMW","Buick","Cadillac","Chevrolet","Chrysler","Dodge",
  "Ford","GMC","Honda","Hyundai","Infiniti","Jaguar","Jeep","Kia",
  "Land Rover","Lexus","Lincoln","Mazda","Mercedes-Benz","Mini",
  "Mitsubishi","Nissan","Porsche","Ram","Subaru","Tesla","Toyota",
  "Volkswagen","Volvo","Other",
].map((m) => ({ value: m, label: m }));
const VEHICLE_MAKE_MODELS = {
  Acura: ["ILX","TLX","RLX","MDX","RDX","NSX","Integra"],
  Audi: ["A3","A4","A5","A6","A7","A8","Q3","Q5","Q7","Q8","e-tron","R8"],
  BMW: ["2 Series","3 Series","4 Series","5 Series","7 Series","X1","X3","X5","X6","X7","i3","i4","i7","iX","M3","M4","M5"],
  Buick: ["Encore","Envision","Enclave","Regal","LaCrosse"],
  Cadillac: ["ATS","CT4","CT5","CT6","XT4","XT5","XT6","Escalade","Lyriq"],
  Chevrolet: ["Spark","Sonic","Cruze","Malibu","Impala","Camaro","Corvette","Trailblazer","Trax","Equinox","Blazer","Traverse","Tahoe","Suburban","Colorado","Silverado 1500","Silverado 2500","Bolt"],
  Chrysler: ["300","Pacifica","Voyager"],
  Dodge: ["Charger","Challenger","Durango","Journey","Grand Caravan","Hornet"],
  Ford: ["Fiesta","Focus","Fusion","Mustang","Mustang Mach-E","EcoSport","Escape","Edge","Explorer","Expedition","Bronco","Bronco Sport","Ranger","F-150","F-150 Lightning","F-250","F-350","Maverick","Transit"],
  GMC: ["Terrain","Acadia","Yukon","Yukon XL","Canyon","Sierra 1500","Sierra 2500","Hummer EV"],
  Honda: ["Fit","Civic","Insight","Accord","HR-V","CR-V","Passport","Pilot","Ridgeline","Odyssey","Prologue"],
  Hyundai: ["Accent","Elantra","Sonata","Ioniq 5","Ioniq 6","Kona","Venue","Tucson","Santa Fe","Palisade","Santa Cruz"],
  Infiniti: ["Q50","Q60","QX50","QX55","QX60","QX80"],
  Jaguar: ["XE","XF","F-Type","E-Pace","F-Pace","I-Pace"],
  Jeep: ["Renegade","Compass","Cherokee","Grand Cherokee","Wrangler","Gladiator","Wagoneer","Grand Wagoneer"],
  Kia: ["Rio","Forte","K5","Stinger","Soul","Seltos","Sportage","Sorento","Telluride","Carnival","EV6","Niro"],
  "Land Rover": ["Range Rover","Range Rover Sport","Range Rover Velar","Range Rover Evoque","Discovery","Discovery Sport","Defender"],
  Lexus: ["IS","ES","GS","LS","NX","RX","GX","LX","UX","LC","RC"],
  Lincoln: ["MKZ","Continental","Corsair","Nautilus","Aviator","Navigator"],
  Mazda: ["Mazda3","Mazda6","MX-5 Miata","CX-3","CX-30","CX-5","CX-9","CX-50","CX-90"],
  "Mercedes-Benz": ["A-Class","C-Class","E-Class","S-Class","CLA","CLS","GLA","GLB","GLC","GLE","GLS","G-Class","EQS","EQE","Sprinter"],
  Mini: ["Cooper","Cooper Clubman","Cooper Countryman"],
  Mitsubishi: ["Mirage","Outlander","Outlander Sport","Eclipse Cross"],
  Nissan: ["Versa","Sentra","Altima","Maxima","Leaf","Ariya","Kicks","Rogue","Murano","Pathfinder","Armada","Frontier","Titan"],
  Porsche: ["911","718 Cayman","718 Boxster","Panamera","Macan","Cayenne","Taycan"],
  Ram: ["1500","2500","3500","ProMaster","ProMaster City"],
  Subaru: ["Impreza","Legacy","Outback","Forester","Ascent","Crosstrek","WRX","BRZ","Solterra"],
  Tesla: ["Model S","Model 3","Model X","Model Y","Cybertruck"],
  Toyota: ["Corolla","Camry","Avalon","Prius","Prius Prime","Crown","GR86","Supra","C-HR","Corolla Cross","RAV4","Venza","Highlander","Grand Highlander","4Runner","Sequoia","Tacoma","Tundra","Sienna","bZ4X"],
  Volkswagen: ["Jetta","Passat","Arteon","Golf","GTI","Golf R","Taos","Tiguan","Atlas","Atlas Cross Sport","ID.4"],
  Volvo: ["S60","S90","V60","V90","XC40","XC60","XC90","C40 Recharge"],
};
const VEHICLE_MODELS_FOR_MAKE = (make) => {
  const list = VEHICLE_MAKE_MODELS[make];
  if (!list) return [{ value: "other", label: "Other (write in notes)" }];
  return [...list.map((m) => ({ value: m, label: m })), { value: "other", label: "Other (write in notes)" }];
};
const VEHICLE_FIELDS = [
  { name: "vehicle_year", label: "Vehicle year", type: "select", required: true, options: VEHICLE_YEARS },
  { name: "vehicle_make", label: "Make", type: "select", required: true, options: VEHICLE_MAKES },
  {
    name: "vehicle_model", label: "Model", type: "select", required: true,
    options: (details) => VEHICLE_MODELS_FOR_MAKE(details.vehicle_make),
  },
];

export const SERVICE_SCHEMAS = {
  delivery: {
    subcategoryLabel: "Item type",
    subcategories: {
      package: { label: "Package / parcel" },
      documents: { label: "Documents" },
      food: { label: "Food / groceries" },
      flowers: { label: "Flowers / gifts" },
      furniture: { label: "Furniture (single item)" },
      other: { label: "Other" },
    },
    baseFields: [
      { name: "item_size", label: "Approx. size", type: "select", options: COMMON_ITEM_SIZES, required: true },
      { name: "quantity", label: "How many items", type: "number", min: 1, default: 1, required: true },
      { name: "weight_estimate", label: "Approx. weight (lbs)", type: "number", min: 0, step: 1 },
      { name: "fragile", label: "Fragile / handle with care", type: "select", options: [{ value: "no", label: "No" }, { value: "yes", label: "Yes" }] },
    ],
  },
  courier: {
    subcategoryLabel: "Courier type",
    subcategories: {
      same_day: { label: "Same-day" },
      next_day: { label: "Next-day" },
      scheduled: { label: "Scheduled" },
      other: { label: "Other" },
    },
    baseFields: [
      { name: "item_size", label: "Item size", type: "select", options: COMMON_ITEM_SIZES, required: true },
      { name: "quantity", label: "Number of items", type: "number", min: 1, default: 1, required: true },
    ],
  },
  towing: {
    subcategoryLabel: "Tow type",
    subcategories: {
      breakdown_tow: { label: "Broken-down vehicle — tow to shop/home" },
      accident_tow: { label: "Accident recovery" },
      heavy_duty_tow: { label: "Heavy-duty (RV, truck, bus)" },
      motorcycle_tow: { label: "Motorcycle tow" },
      long_distance_tow: { label: "Long-distance tow (50+ mi)" },
      other: { label: "Other" },
    },
    baseFields: [
      { name: "vehicle_type", label: "Vehicle type", type: "select", required: true, options: [
        { value: "sedan", label: "Sedan / hatchback" },
        { value: "suv", label: "SUV / crossover" },
        { value: "pickup", label: "Pickup truck" },
        { value: "van", label: "Van / minivan" },
        { value: "motorcycle", label: "Motorcycle" },
        { value: "rv", label: "RV / motorhome" },
        { value: "box_truck", label: "Box truck / commercial" },
        { value: "heavy_duty", label: "Heavy-duty / semi" },
        { value: "ev", label: "Electric vehicle (special handling)" },
      ]},
      ...VEHICLE_FIELDS,
      { name: "drivetrain", label: "Drivetrain", type: "select", required: true, options: [
        { value: "fwd", label: "Front-wheel drive (FWD)" },
        { value: "rwd", label: "Rear-wheel drive (RWD)" },
        { value: "awd", label: "All-wheel drive (AWD)" },
        { value: "4wd", label: "4-wheel drive (4WD)" },
        { value: "unknown", label: "Not sure" },
      ]},
      { name: "wheels_turn", label: "Do the wheels turn freely?", type: "select", required: true, options: [
        { value: "yes", label: "Yes — rolls normally" },
        { value: "no_locked", label: "No — wheel(s) locked or seized" },
        { value: "flat_only", label: "Has a flat tire" },
      ]},
      { name: "transmission", label: "Transmission can shift to neutral?", type: "select", options: [
        { value: "yes", label: "Yes" },
        { value: "no", label: "No / unsure" },
      ]},
      { name: "key_available", label: "Key in vehicle / available?", type: "select", required: true, options: [
        { value: "yes", label: "Yes" },
        { value: "lost", label: "Lost / locked inside" },
        { value: "no", label: "No key" },
      ]},
      { name: "tow_method", label: "Preferred tow method", type: "select", options: [
        { value: "any", label: "Whatever works — operator's call" },
        { value: "flatbed", label: "Flatbed (recommended for low-clearance, AWD, EV)" },
        { value: "wheel_lift", label: "Wheel lift" },
        { value: "hook_chain", label: "Hook & chain (last resort)" },
        { value: "dolly", label: "Tow dolly" },
      ]},
      { name: "winch_needed", label: "Winch required (stuck in ditch/mud)?", type: "select", options: [
        { value: "no", label: "No" },
        { value: "yes", label: "Yes" },
        { value: "unsure", label: "Not sure" },
      ]},
      { name: "urgency", label: "Urgency", type: "select", required: true, options: [
        { value: "now", label: "ASAP — unsafe location / blocking traffic" },
        { value: "hour", label: "Within the hour" },
        { value: "today", label: "Sometime today" },
        { value: "scheduled", label: "Schedule for a future date" },
      ]},
      { name: "scheduled_for", label: "If scheduled, when?", type: "datetime-local" },
      { name: "incident_type", label: "What happened?", type: "select", options: [
        { value: "breakdown", label: "Engine / mechanical breakdown" },
        { value: "battery", label: "Dead battery" },
        { value: "fuel", label: "Ran out of fuel" },
        { value: "tire", label: "Flat / blown tire" },
        { value: "accident", label: "Accident / collision" },
        { value: "stuck", label: "Stuck (ditch, mud, snow)" },
        { value: "illegal_park", label: "Illegally parked — owner-requested move" },
        { value: "other", label: "Other" },
      ]},
      { name: "location_type", label: "Pickup location type", type: "select", required: true, options: [
        { value: "roadside", label: "Roadside / shoulder" },
        { value: "parking_lot", label: "Parking lot / driveway" },
        { value: "highway", label: "Highway / freeway" },
        { value: "off_road", label: "Off-road / unpaved" },
        { value: "garage", label: "Inside a garage / structure (low clearance)" },
      ]},
      { name: "estimated_distance_miles", label: "Tow distance (miles)", type: "number", min: 0, step: 0.1, helpText: "Approximate pickup → drop-off mileage. We'll auto-quote based on this." },
      { name: "passengers_in_vehicle", label: "People who need a ride too", type: "number", min: 0, max: 6, default: 0, helpText: "Most tow trucks fit driver + 1–2 passengers in the cab." },
      { name: "notes", label: "Anything else the operator should know", type: "textarea" },
    ],
  },
  moving: {
    subcategoryLabel: "Move type",
    subcategories: {
      local: { label: "Local move (under 50 mi)" },
      long_distance: { label: "Long distance (50+ mi)" },
      single_item: { label: "Single bulky item" },
      labor_only: { label: "Labor only (loading / unloading)" },
      other: { label: "Other" },
    },
    baseFields: [
      { name: "property_size", label: "Property size", type: "select", options: HOUSE_SIZES, required: true },
      { name: "num_movers", label: "Movers requested", type: "number", min: 1, max: 6, default: 2 },
      { name: "has_stairs", label: "Stairs involved", type: "select", options: [{ value: "no", label: "No" }, { value: "yes_origin", label: "Yes — at pickup" }, { value: "yes_dest", label: "Yes — at drop-off" }, { value: "yes_both", label: "Yes — both" }] },
      { name: "packing_needed", label: "Packing service needed", type: "select", options: [{ value: "no", label: "No" }, { value: "partial", label: "Partial" }, { value: "full", label: "Full pack" }] },
    ],
  },
  handyman: {
    subcategoryLabel: "Type of work",
    subcategories: {
      repair: { label: "Repair (something is broken)" },
      installation: { label: "Installation (new item)" },
      assembly: { label: "Assembly (furniture, etc.)" },
      mounting: { label: "Mounting (TV, shelves, art)" },
      painting: { label: "Painting / patching" },
      plumbing_minor: { label: "Plumbing (minor)" },
      electrical_minor: { label: "Electrical (minor)" },
      other: { label: "Other" },
    },
    baseFields: [
      { name: "est_hours", label: "Estimated hours", type: "number", min: 0.5, step: 0.5, default: 1.5, helpText: "How long you think the job will take. Provider can counter." },
      { name: "tools_provided", label: "Tools provided by", type: "select", options: [{ value: "provider", label: "Provider" }, { value: "customer", label: "Customer" }, { value: "either", label: "Either is fine" }], default: "either" },
      { name: "materials_provided", label: "Materials provided by", type: "select", options: [{ value: "provider", label: "Provider" }, { value: "customer", label: "Customer" }, { value: "either", label: "Either is fine" }], default: "customer" },
    ],
  },
  cleaning: {
    subcategoryLabel: "Cleaning type",
    subcategories: {
      standard: { label: "Standard clean" },
      deep: { label: "Deep clean" },
      move_in_out: { label: "Move-in / move-out" },
      post_construction: { label: "Post-construction" },
      recurring: { label: "Recurring (weekly / bi-weekly)" },
      other: { label: "Other" },
    },
    baseFields: [
      { name: "property_type", label: "Property type", type: "select", options: PROPERTY_TYPES, required: true },
      { name: "property_size", label: "Size", type: "select", options: HOUSE_SIZES, required: true },
      { name: "rooms", label: "Rooms to clean", type: "multiselect", options: CLEANING_ROOMS, required: true },
      { name: "tasks", label: "Tasks to perform", type: "multiselect", options: CLEANING_TASKS, required: true },
      { name: "num_bathrooms", label: "Bathrooms to clean", type: "number", min: 0, default: 1 },
      { name: "bathroom_notes", label: "Bathroom details", type: "text", placeholder: "Shower scrub, grout, tub, etc." },
      { name: "kitchen_notes", label: "Kitchen details", type: "text", placeholder: "Fridge interior, oven, dishes…" },
      { name: "laundry_loads", label: "Laundry loads (if selected above)", type: "number", min: 0, default: 0 },
      { name: "pets_in_home", label: "Pets in home", type: "select", options: [{ value: "no", label: "No" }, { value: "dog", label: "Dog" }, { value: "cat", label: "Cat" }, { value: "both", label: "Both" }, { value: "other", label: "Other" }] },
      { name: "supplies", label: "Cleaning supplies", type: "select", options: [{ value: "provider", label: "Provider brings" }, { value: "customer", label: "Customer provides" }] },
    ],
  },
  landscaping: {
    subcategoryLabel: "Service type",
    subcategories: {
      maintenance: { label: "Routine maintenance" },
      cleanup: { label: "Yard cleanup" },
      install: { label: "Landscape installation" },
      hardscape: { label: "Hardscape (patio, walkway, walls)" },
      tree: { label: "Tree care / removal" },
      other: { label: "Other" },
    },
    baseFields: [
      { name: "services", label: "Tasks needed", type: "multiselect", required: true, options: [
        { value: "mow", label: "Mow lawn" },
        { value: "edge", label: "Edge / trim borders" },
        { value: "trim_bushes", label: "Trim bushes / shrubs" },
        { value: "leaves", label: "Leaf removal" },
        { value: "weed", label: "Weed removal" },
        { value: "mulch", label: "Mulching" },
        { value: "plant", label: "Plant flowers / new beds" },
        { value: "tree_prune", label: "Tree pruning" },
        { value: "tree_remove", label: "Tree removal" },
        { value: "snow", label: "Snow removal" },
      ]},
      { name: "lawn_size", label: "Approx. lawn size", type: "select", options: [
        { value: "small", label: "Small (< 1/8 acre)" },
        { value: "medium", label: "Medium (1/8 – 1/4 acre)" },
        { value: "large", label: "Large (1/4 – 1/2 acre)" },
        { value: "xl", label: "Extra large (1/2 + acre)" },
      ]},
      { name: "frequency", label: "Frequency", type: "select", options: [
        { value: "one_time", label: "One-time" },
        { value: "weekly", label: "Weekly" },
        { value: "biweekly", label: "Bi-weekly" },
        { value: "monthly", label: "Monthly" },
      ], default: "one_time" },
    ],
  },
  auto: {
    subcategoryLabel: "Service type",
    subcategories: {
      minor_repair: { label: "Minor repair" },
      major_repair: { label: "Major repair" },
      maintenance: { label: "Maintenance / tune-up" },
      other: { label: "Other" },
    },
    baseFields: [
      ...VEHICLE_FIELDS,
      // Mechanic-style section → part → issue workflow. Shown only when the
      // job is a repair / maintenance request.
      { name: "car_section", label: "Section of the car", type: "select", showIf: { subcategory: "minor_repair" }, options: CAR_SECTIONS },
      { name: "car_section", label: "Section of the car", type: "select", showIf: { subcategory: "major_repair" }, options: CAR_SECTIONS },
      { name: "car_section", label: "Section of the car", type: "select", showIf: { subcategory: "maintenance" }, options: CAR_SECTIONS },
      { name: "car_part", label: "Specific part (if known)", type: "text", showIf: { subcategory: "minor_repair" }, placeholder: "e.g. alternator, front-left brake pad" },
      { name: "car_part", label: "Specific part (if known)", type: "text", showIf: { subcategory: "major_repair" }, placeholder: "e.g. transmission, head gasket" },
      { name: "car_part", label: "Specific part (if known)", type: "text", showIf: { subcategory: "maintenance" }, placeholder: "e.g. oil filter, spark plugs" },
      { name: "issue_description", label: "Describe the issue / symptoms", type: "textarea", showIf: { subcategory: "minor_repair" }, placeholder: "What's happening? Noises, warning lights, when it started…" },
      { name: "issue_description", label: "Describe the issue / symptoms", type: "textarea", showIf: { subcategory: "major_repair" }, placeholder: "What's happening? Noises, warning lights, when it started…" },
      { name: "issue_description", label: "Service requested", type: "textarea", showIf: { subcategory: "maintenance" }, placeholder: "e.g. 60k-mile service, oil change, brake pad replacement" },
    ],
  },

  // Roadside — jump-starts, tire changes, lockouts, fuel delivery. Split
  // off from the old `auto` / `towing` categories so customers who need
  // urgent roadside help can find it directly.
  roadside: {
    subcategoryLabel: "Roadside service",
    subcategories: {
      jump_start: { label: "Battery jump-start" },
      flat_tire: { label: "Flat tire change / repair" },
      fuel_delivery: { label: "Out of fuel — delivery" },
      lockout: { label: "Locked out / lost key" },
      winch_out: { label: "Stuck (mud / ditch / snow) — winch pull-out" },
      other: { label: "Other" },
    },
    baseFields: [
      ...VEHICLE_FIELDS,
      { name: "fuel_grade", label: "Fuel grade", type: "select", showIf: { subcategory: "fuel_delivery" }, options: [
        { value: "regular", label: "Regular (87)" },
        { value: "midgrade", label: "Mid-grade (89)" },
        { value: "premium", label: "Premium (91+)" },
        { value: "diesel", label: "Diesel" },
      ]},
      { name: "fuel_gallons", label: "Gallons (max 5)", type: "number", showIf: { subcategory: "fuel_delivery" }, min: 1, max: 5, default: 2 },
      { name: "tire_service", label: "Tire service needed", type: "select", showIf: { subcategory: "flat_tire" }, options: [
        { value: "change_spare", label: "Change to spare" },
        { value: "repair_flat", label: "Repair flat" },
        { value: "bring_new", label: "Bring new tire" },
      ]},
      { name: "tire_size", label: "Tire / wheel size", type: "select", showIf: { subcategory: "flat_tire", tire_service: "bring_new" }, options: TIRE_SIZES },
      { name: "urgency", label: "Urgency", type: "select", required: true, options: [
        { value: "now", label: "ASAP — unsafe location / blocking traffic" },
        { value: "hour", label: "Within the hour" },
        { value: "today", label: "Sometime today" },
      ]},
      { name: "location_type", label: "Location type", type: "select", options: [
        { value: "roadside", label: "Roadside / shoulder" },
        { value: "parking_lot", label: "Parking lot / driveway" },
        { value: "highway", label: "Highway / freeway" },
        { value: "off_road", label: "Off-road / unpaved" },
      ]},
      { name: "notes", label: "Anything else the operator should know", type: "textarea" },
    ],
  },

  // Auto detailing — mobile wash / interior detail / paint correction /
  // ceramic coating. Split off from `auto` since it's non-mechanical work
  // and has entirely different pricing and provider pools.
  auto_detailing: {
    subcategoryLabel: "Detailing type",
    subcategories: {
      exterior_wash: { label: "Exterior wash & wax" },
      interior_detail: { label: "Interior deep-clean" },
      full_detail: { label: "Full detail (interior + exterior)" },
      paint_correction: { label: "Paint correction / polish" },
      ceramic_coating: { label: "Ceramic coating" },
      headlight_restore: { label: "Headlight restoration" },
      engine_bay: { label: "Engine bay cleaning" },
      other: { label: "Other" },
    },
    baseFields: [
      ...VEHICLE_FIELDS,
      { name: "vehicle_size", label: "Vehicle size", type: "select", required: true, options: [
        { value: "compact", label: "Compact / sedan" },
        { value: "midsize", label: "Mid-size SUV / crossover" },
        { value: "large", label: "Full-size SUV / pickup" },
        { value: "xl", label: "XL — 3-row SUV / van" },
      ]},
      { name: "condition", label: "Interior condition", type: "select", options: [
        { value: "light", label: "Light — regular tidy-up" },
        { value: "moderate", label: "Moderate — visible dirt / stains" },
        { value: "heavy", label: "Heavy — deep stains / pet hair / smoke" },
      ]},
      { name: "pet_hair", label: "Pet hair to remove?", type: "select", options: [
        { value: "no", label: "No" },
        { value: "some", label: "Some" },
        { value: "a_lot", label: "A lot" },
      ]},
      { name: "location_type", label: "Where should the work happen?", type: "select", required: true, options: [
        { value: "customer", label: "At my location (mobile)" },
        { value: "shop", label: "Drop-off at provider's shop" },
      ]},
      { name: "notes", label: "Anything else the detailer should know", type: "textarea" },
    ],
  },
  pet_care: {
    subcategoryLabel: "Care type",
    subcategories: {
      veterinary: { label: "Veterinary care" },
      petsitting: { label: "Pet-sitting" },
      dogwalking: { label: "Dog walking" },
      training: { label: "Training" },
      grooming: { label: "Grooming" },
      boarding: { label: "Boarding" },
      other: { label: "Other" },
    },
    baseFields: [
      { name: "animal_type", label: "Animal", type: "select", required: true, options: [
        { value: "dog", label: "Dog" },
        { value: "cat", label: "Cat" },
        { value: "bird", label: "Bird" },
        { value: "reptile", label: "Reptile" },
        { value: "small_mammal", label: "Small mammal (rabbit, hamster…)" },
        { value: "fish", label: "Fish" },
        { value: "other", label: "Other" },
      ]},
      { name: "breed", label: "Breed", type: "text", placeholder: "e.g. Golden Retriever, Maine Coon" },
      { name: "age_years", label: "Age (years)", type: "number", min: 0, step: 1, default: 1 },
      { name: "temperament", label: "Temperament", type: "select", options: [
        { value: "friendly", label: "Friendly" },
        { value: "shy", label: "Shy" },
        { value: "energetic", label: "High energy" },
        { value: "reactive", label: "Reactive / nervous" },
      ]},
    ],
  },
  events: {
    subcategoryLabel: "Event type",
    subcategories: {
      wedding: { label: "Wedding" },
      birthday: { label: "Birthday" },
      graduation: { label: "Graduation" },
      anniversary: { label: "Anniversary" },
      funeral: { label: "Funeral / memorial" },
      corporate: { label: "Corporate / work" },
      religious: { label: "Religious ceremony" },
      reunion: { label: "Reunion" },
      other: { label: "Other" },
    },
    baseFields: [
      { name: "service_needed", label: "Service needed", type: "select", required: true, options: [
        { value: "photography", label: "Photography" },
        { value: "video", label: "Videography" },
        { value: "catering", label: "Catering" },
        { value: "bartending", label: "Bartending" },
        { value: "dj", label: "DJ / music" },
        { value: "decor", label: "Decor / setup" },
        { value: "officiant", label: "Officiant" },
        { value: "planning", label: "Planning / coordination" },
        { value: "other", label: "Other" },
      ]},
      { name: "guest_count", label: "Approx. guest count", type: "number", min: 1, default: 25 },
      { name: "venue_type", label: "Venue", type: "select", options: [
        { value: "home", label: "Private home" },
        { value: "outdoor", label: "Outdoor" },
        { value: "rented_venue", label: "Rented venue" },
        { value: "church", label: "Place of worship" },
        { value: "tbd", label: "Not decided yet" },
      ]},
    ],
  },
  medical: {
    subcategoryLabel: "Care needed",
    subcategories: {
      // Licensed medical
      nursing: { label: "Skilled nursing visit (RN/LPN)" },
      home_health_aide: { label: "Home health aide" },
      iv_infusion: { label: "IV therapy / infusion" },
      wound_care: { label: "Wound care" },
      medication_admin: { label: "Medication administration" },
      blood_draw: { label: "Blood draw / mobile phlebotomy" },
      vaccination: { label: "Vaccination / immunization" },
      mobile_imaging: { label: "Mobile imaging (X-ray / ultrasound)" },
      // Therapies
      physical_therapy: { label: "Physical therapy" },
      occupational_therapy: { label: "Occupational therapy" },
      speech_therapy: { label: "Speech therapy" },
      respiratory_therapy: { label: "Respiratory therapy" },
      // Mental & specialty
      mental_health: { label: "Mental health visit (LCSW / LMFT / psychiatrist)" },
      hospice_palliative: { label: "Hospice / palliative care" },
      lactation: { label: "Lactation consultant (IBCLC)" },
      doula: { label: "Doula (birth / postpartum)" },
      // ADL support (CNA / HHA)
      bathing: { label: "ADL: Bathing assistance" },
      dressing: { label: "ADL: Dressing assistance" },
      toileting: { label: "ADL: Toileting / continence care" },
      transferring: { label: "ADL: Transfer / mobility assistance" },
      feeding: { label: "ADL: Feeding assistance" },
      meal_prep: { label: "Meal prep & feeding support" },
      med_reminders: { label: "Medication reminders" },
      companion_care: { label: "Companion care" },
      respite: { label: "Respite care (relief for family caregiver)" },
      dementia_care: { label: "Dementia / Alzheimer's care" },
      other: { label: "Other" },
    },
    baseFields: [
      { name: "license_required", label: "License required (we will verify)", type: "select", required: true, options: [
        { value: "rn_lpn", label: "RN / LPN (nursing)" },
        { value: "cna_hha", label: "CNA / HHA (aide)" },
        { value: "pt", label: "Physical therapist (DPT / PT)" },
        { value: "ot", label: "Occupational therapist (OT)" },
        { value: "slp", label: "Speech-language pathologist (SLP)" },
        { value: "rt", label: "Respiratory therapist (RT)" },
        { value: "phlebotomist", label: "Phlebotomist (CPT)" },
        { value: "mental_health", label: "LCSW / LMFT / psychologist / psychiatrist" },
        { value: "ibclc", label: "IBCLC (lactation)" },
        { value: "doula", label: "Certified doula" },
        { value: "md_do_np_pa", label: "Physician / NP / PA" },
        { value: "rad_tech", label: "Radiologic technologist" },
        { value: "other", label: "Other / unsure" },
      ]},
      { name: "patient_age", label: "Patient age", type: "select", options: [
        { value: "infant", label: "Infant (< 1)" },
        { value: "child", label: "Child (1–12)" },
        { value: "teen", label: "Teen (13–17)" },
        { value: "adult", label: "Adult (18–64)" },
        { value: "senior", label: "Senior (65+)" },
      ]},
      { name: "visit_type", label: "Visit type", type: "select", options: [
        { value: "one_time", label: "One-time visit" },
        { value: "short_term", label: "Short-term (a few visits)" },
        { value: "ongoing", label: "Ongoing / weekly" },
        { value: "24_7", label: "24/7 / live-in" },
      ]},
      { name: "duration_hours", label: "Approx. visit length (hours)", type: "number", min: 0.5, step: 0.5, default: 1 },
      { name: "mobility", label: "Patient mobility", type: "select", options: [
        { value: "ambulatory", label: "Ambulatory / independent" },
        { value: "assist", label: "Needs some assistance" },
        { value: "wheelchair", label: "Wheelchair" },
        { value: "bedbound", label: "Bedbound" },
      ]},
      { name: "conditions", label: "Relevant conditions (optional)", type: "text", placeholder: "Diabetes, Parkinson's, post-surgery, etc." },
      { name: "equipment_provided", label: "Equipment / supplies", type: "select", options: [
        { value: "provider", label: "Provider brings" },
        { value: "customer", label: "Customer has on hand" },
        { value: "either", label: "Either is fine" },
      ]},
      { name: "background_check", label: "Background check required", type: "select", options: [
        { value: "required", label: "Yes — required" },
        { value: "preferred", label: "Preferred" },
        { value: "not_needed", label: "Not needed" },
      ], default: "required" },
    ],
  },

  // Digital / remote
  digital_tech: {
    subcategoryLabel: "Service area",
    subcategories: {
      website: { label: "Website build / redesign" },
      mobile: { label: "Mobile app" },
      bug_fix: { label: "Bug fix / one-off task" },
      tech_support: { label: "Tech support" },
      ai_ml: { label: "AI / ML" },
      data: { label: "Data engineering / analytics" },
      devops: { label: "DevOps / hosting" },
      qa: { label: "QA / testing" },
      other: { label: "Other" },
    },
    baseFields: [
      { name: "tech_stack", label: "Stack / platform", type: "text", placeholder: "React, Node, Postgres, AWS…" },
    ],
  },
  marketing: {
    subcategoryLabel: "Channel",
    subcategories: {
      seo: { label: "SEO" },
      social: { label: "Social media" },
      paid_ads: { label: "Paid ads" },
      content: { label: "Content writing" },
      email: { label: "Email marketing" },
      branding: { label: "Branding / identity" },
      influencer: { label: "Influencer / PR" },
    },
    baseFields: [
      { name: "industry", label: "Industry", type: "text", placeholder: "e.g. SaaS, retail, hospitality" },
      { name: "engagement", label: "Engagement type", type: "select", options: [
        { value: "one_time", label: "One-time project" },
        { value: "monthly", label: "Monthly retainer" },
        { value: "campaign", label: "Specific campaign" },
      ]},
    ],
  },
  business_admin: {
    subcategoryLabel: "Service",
    subcategories: {
      bookkeeping: { label: "Bookkeeping" },
      data_entry: { label: "Data entry" },
      scheduling: { label: "Scheduling / calendar" },
      recruiting: { label: "Recruiting" },
      operations: { label: "Operations support" },
      research: { label: "Research / data gathering" },
      transcription: { label: "Transcription" },
      other: { label: "Other" },
    },
    baseFields: [
      { name: "tools", label: "Tools / software", type: "text", placeholder: "QuickBooks, Notion, HubSpot…" },
      { name: "hours_per_week", label: "Approx. hours / week", type: "number", min: 1, default: 5 },
    ],
  },
  education: {
    subcategoryLabel: "Subject area",
    subcategories: {
      k12: { label: "K-12 tutoring" },
      test_prep: { label: "Test prep (SAT, GRE, etc.)" },
      college: { label: "College-level subject" },
      adult_ed: { label: "Adult education" },
      language: { label: "Language" },
      music: { label: "Music" },
      coding: { label: "Coding / CS" },
      other: { label: "Other" },
    },
    baseFields: [
      { name: "topic", label: "Specific topic", type: "text", placeholder: "Algebra II, AP Physics, Spanish…" },
      { name: "student_level", label: "Student level", type: "select", options: [
        { value: "elementary", label: "Elementary" },
        { value: "middle", label: "Middle school" },
        { value: "high", label: "High school" },
        { value: "college", label: "College" },
        { value: "adult", label: "Adult" },
      ]},
      { name: "session_format", label: "Format", type: "select", options: [
        { value: "remote", label: "Remote (video)" },
        { value: "in_person", label: "In-person" },
        { value: "either", label: "Either" },
      ], default: "remote" },
    ],
  },
  legal: {
    subcategoryLabel: "Practice area",
    subcategories: {
      contract: { label: "Contract review / drafting" },
      filing: { label: "Filing / paperwork" },
      family: { label: "Family law" },
      immigration: { label: "Immigration" },
      small_claims: { label: "Small claims" },
      estate: { label: "Estate / wills" },
      business: { label: "Business / LLC" },
      other: { label: "Other" },
    },
    baseFields: [
      { name: "jurisdiction", label: "State / jurisdiction", type: "text", placeholder: "e.g. NY, CA, US Federal" },
      { name: "urgency", label: "Urgency", type: "select", options: [
        { value: "low", label: "No rush" },
        { value: "normal", label: "This month" },
        { value: "high", label: "This week" },
        { value: "urgent", label: "ASAP" },
      ]},
    ],
  },
  financial: {
    subcategoryLabel: "Service area",
    subcategories: {
      tax: { label: "Tax preparation" },
      bookkeeping: { label: "Bookkeeping" },
      planning: { label: "Financial planning" },
      audit: { label: "Audit / review" },
      insurance: { label: "Insurance" },
      payroll: { label: "Payroll" },
      other: { label: "Other" },
    },
    baseFields: [
      { name: "entity_type", label: "Entity type", type: "select", options: [
        { value: "individual", label: "Individual" },
        { value: "sole_prop", label: "Sole proprietor" },
        { value: "llc", label: "LLC" },
        { value: "scorp", label: "S-Corp" },
        { value: "ccorp", label: "C-Corp" },
        { value: "nonprofit", label: "Non-profit" },
      ]},
      { name: "tax_year", label: "Tax year (if applicable)", type: "text", placeholder: "2025" },
    ],
  },
  remote_work: {
    subcategoryLabel: "Role",
    subcategories: {
      va: { label: "Virtual assistant" },
      support: { label: "Customer support" },
      translation: { label: "Translation" },
      voice: { label: "Voice work / narration" },
      transcription: { label: "Transcription" },
      moderation: { label: "Community / moderation" },
      other: { label: "Other" },
    },
    baseFields: [
      { name: "engagement", label: "Engagement", type: "select", options: [
        { value: "one_time", label: "One-time gig" },
        { value: "part_time", label: "Part-time ongoing" },
        { value: "full_time", label: "Full-time" },
      ]},
      { name: "languages", label: "Languages needed", type: "text", placeholder: "English, Spanish…" },
    ],
  },
  research: {
    subcategoryLabel: "Research type",
    subcategories: {
      market: { label: "Market research" },
      academic: { label: "Academic" },
      investigative: { label: "Investigative" },
      survey: { label: "Survey / data collection" },
      competitive: { label: "Competitive analysis" },
      other: { label: "Other" },
    },
    baseFields: [
      { name: "depth", label: "Depth", type: "select", options: [
        { value: "summary", label: "Summary report" },
        { value: "detailed", label: "Detailed analysis" },
        { value: "deep_dive", label: "Deep-dive whitepaper" },
      ]},
      { name: "output_format", label: "Output format", type: "select", options: [
        { value: "doc", label: "Document" },
        { value: "slides", label: "Slides / deck" },
        { value: "spreadsheet", label: "Spreadsheet / data" },
        { value: "either", label: "Either" },
      ]},
    ],
  },

  // ────────────────────────────────────────────────────────────────────────
  // NEW on-demand categories (Uber-style: each one drops the customer into
  // a tight, structured form so the provider can quote/accept instantly).
  // ────────────────────────────────────────────────────────────────────────
  notary: {
    subcategoryLabel: "Document type",
    subcategories: {
      acknowledgment: { label: "Acknowledgment (general)" },
      jurat: { label: "Jurat / sworn statement" },
      real_estate: { label: "Real estate / mortgage closing" },
      power_of_attorney: { label: "Power of attorney" },
      vehicle_title: { label: "Vehicle title / DMV" },
      will_trust: { label: "Will / trust" },
      affidavit: { label: "Affidavit" },
      apostille: { label: "Apostille / authentication" },
      i9_employment: { label: "I-9 / employment verification" },
      copy_certification: { label: "Copy certification" },
      loan_signing: { label: "Loan signing (mortgage / refi)" },
      medical_consent: { label: "Medical consent / HIPAA" },
      other: { label: "Other" },
    },
    baseFields: [
      { name: "num_signers", label: "How many signers", type: "number", min: 1, max: 10, default: 1, required: true },
      { name: "num_documents", label: "Number of documents", type: "number", min: 1, default: 1, required: true },
      { name: "ids_ready", label: "Government-issued ID(s) ready", type: "select", required: true, options: [
        { value: "yes", label: "Yes — all signers have ID" },
        { value: "no", label: "No — need help" },
      ]},
      { name: "language", label: "Document language", type: "text", placeholder: "English, Spanish, etc.", default: "English" },
      { name: "mobile_or_office", label: "Where", type: "select", required: true, options: [
        { value: "mobile", label: "Notary comes to me" },
        { value: "office", label: "I'll come to the notary" },
        { value: "remote", label: "Remote online notarization (RON)" },
      ]},
      { name: "urgency", label: "Urgency", type: "select", required: true, options: [
        { value: "now", label: "ASAP (within 2 hours)" },
        { value: "today", label: "Today" },
        { value: "this_week", label: "This week" },
        { value: "scheduled", label: "Schedule" },
      ]},
      { name: "scheduled_for", label: "If scheduled, when?", type: "datetime-local" },
    ],
  },

  it_support: {
    subcategoryLabel: "Help needed",
    subcategories: {
      computer_setup: { label: "Computer / laptop setup" },
      wifi_network: { label: "Wi-Fi / home network" },
      printer: { label: "Printer setup / fix" },
      smart_home: { label: "Smart home (Nest, Ring, Alexa…)" },
      tv_streaming: { label: "TV / streaming / cable cutting" },
      data_recovery: { label: "Data recovery / backup" },
      virus_malware: { label: "Virus / malware removal" },
      slow_computer: { label: "Slow computer / cleanup" },
      software_install: { label: "Software install / training" },
      phone_tablet: { label: "Phone / tablet help" },
      cloud_email: { label: "Cloud / email setup (Gmail, iCloud, Drive)" },
      passwords_accounts: { label: "Account / password recovery" },
      remote_only: { label: "Remote screen-share help" },
      other: { label: "Other" },
    },
    baseFields: [
      { name: "device_type", label: "Device(s)", type: "multiselect", options: [
        { value: "windows_pc", label: "Windows PC" },
        { value: "mac", label: "Mac" },
        { value: "iphone", label: "iPhone" },
        { value: "android", label: "Android phone" },
        { value: "ipad_tablet", label: "iPad / tablet" },
        { value: "printer", label: "Printer" },
        { value: "router", label: "Router / modem" },
        { value: "smart_device", label: "Smart-home device" },
        { value: "other", label: "Other" },
      ]},
      { name: "remote_or_onsite", label: "Remote or on-site", type: "select", required: true, options: [
        { value: "remote", label: "Remote (screen share)" },
        { value: "onsite", label: "On-site at my home/office" },
        { value: "either", label: "Either" },
      ]},
      { name: "urgency", label: "Urgency", type: "select", options: [
        { value: "now", label: "Now (within 2 hours)" },
        { value: "today", label: "Today" },
        { value: "this_week", label: "This week" },
      ]},
      { name: "error_message", label: "Any error message / what's happening", type: "textarea" },
    ],
  },

  errand: {
    subcategoryLabel: "Errand type",
    subcategories: {
      grocery_shop: { label: "Grocery shopping" },
      pharmacy: { label: "Pharmacy / prescription pickup" },
      package_dropoff: { label: "Package drop-off (USPS / UPS / FedEx)" },
      package_pickup: { label: "Package / mail pickup" },
      dry_cleaning: { label: "Dry cleaning drop / pickup" },
      dmv_govt: { label: "DMV / government office wait" },
      gift_buy: { label: "Buy & deliver a gift" },
      return_item: { label: "Return an item to a store" },
      grocery_delivery: { label: "Cooked-meal pickup from restaurant" },
      misc_pickup: { label: "Misc. pickup / drop-off" },
      wait_in_line: { label: "Wait in line for me" },
      other: { label: "Other" },
    },
    baseFields: [
      { name: "stores", label: "Where (store / address)", type: "text", placeholder: "e.g. Trader Joe's on Main St" },
      { name: "item_list", label: "Shopping list / what to pick up", type: "textarea", placeholder: "List items, brands, sizes…" },
      { name: "est_hours", label: "Estimated hours", type: "number", min: 0.5, step: 0.5, helpText: "Leave blank to use category default." },
      { name: "max_budget", label: "Max budget for purchases ($)", type: "number", min: 0, step: 1, helpText: "Customer pre-funds this. Provider keeps receipts." },
      { name: "urgency", label: "When", type: "select", required: true, options: [
        { value: "now", label: "Now / next hour" },
        { value: "today", label: "Today" },
        { value: "scheduled", label: "Schedule" },
      ]},
    ],
  },

  appliance_repair: {
    subcategoryLabel: "Appliance",
    subcategories: {
      refrigerator: { label: "Refrigerator / freezer" },
      washer: { label: "Washing machine" },
      dryer: { label: "Dryer" },
      dishwasher: { label: "Dishwasher" },
      oven_range: { label: "Oven / range / cooktop" },
      microwave: { label: "Microwave" },
      ac_unit: { label: "Air conditioner / HVAC" },
      water_heater: { label: "Water heater" },
      garbage_disposal: { label: "Garbage disposal" },
      ice_maker: { label: "Ice maker" },
      small_appliance: { label: "Small appliance (toaster, blender…)" },
      vacuum: { label: "Vacuum cleaner" },
      other: { label: "Other" },
    },
    baseFields: [
      { name: "brand", label: "Brand", type: "text", placeholder: "e.g. Whirlpool, GE, Samsung" },
      { name: "model_number", label: "Model number (if known)", type: "text" },
      { name: "age_years", label: "Approx. age (years)", type: "number", min: 0, default: 5 },
      { name: "est_hours", label: "Estimated labor hours", type: "number", min: 0.5, step: 0.5, helpText: "Diagnostic + repair time. Leave blank to use category default." },
      { name: "symptoms", label: "What's wrong", type: "textarea", placeholder: "Won't turn on, leaking, strange noise…" },
      { name: "under_warranty", label: "Still under warranty?", type: "select", options: [
        { value: "yes", label: "Yes" },
        { value: "no", label: "No" },
        { value: "unsure", label: "Not sure" },
      ]},
      { name: "parts_needed", label: "Bring parts?", type: "select", options: [
        { value: "provider", label: "Provider brings if needed" },
        { value: "customer", label: "I'll buy the part" },
        { value: "diagnose_first", label: "Diagnose first" },
      ], default: "diagnose_first" },
    ],
  },

  locksmith: {
    subcategoryLabel: "Lock situation",
    subcategories: {
      home_lockout: { label: "Home lockout" },
      car_lockout: { label: "Car lockout" },
      business_lockout: { label: "Business lockout" },
      lost_keys: { label: "Lost all keys — need new ones cut" },
      rekey: { label: "Re-key existing locks" },
      install_lock: { label: "Install new lock(s)" },
      smart_lock: { label: "Smart-lock install / setup" },
      safe: { label: "Safe — unlock / install" },
      key_duplicate: { label: "Key duplicate" },
      car_key_fob: { label: "Car key fob programming" },
      other: { label: "Other" },
    },
    baseFields: [
      { name: "urgency", label: "Urgency", type: "select", required: true, options: [
        { value: "emergency", label: "Emergency (stranded / unsafe)" },
        { value: "today", label: "Today" },
        { value: "scheduled", label: "Schedule" },
      ]},
      { name: "lock_brand", label: "Lock brand (if known)", type: "text", placeholder: "Kwikset, Schlage, Yale…" },
      { name: "doors_count", label: "How many doors / locks", type: "number", min: 1, default: 1 },
      { name: "vehicle_info", label: "If car — year / make / model", type: "text", placeholder: "e.g. 2018 Toyota Camry" },
    ],
  },

  security: {
    subcategoryLabel: "Security need",
    subcategories: {
      event_security: { label: "Event security (party / venue)" },
      private_bodyguard: { label: "Private bodyguard / VIP" },
      home_watch: { label: "Home watch (while away)" },
      patrol: { label: "Patrol / walk-through" },
      cctv_install: { label: "CCTV / camera install" },
      alarm_install: { label: "Alarm system install" },
      asset_escort: { label: "Asset / cash escort" },
      crowd_control: { label: "Crowd control" },
      access_control: { label: "Access control / bouncer" },
      other: { label: "Other" },
    },
    baseFields: [
      { name: "hours_needed", label: "Hours needed", type: "number", min: 1, default: 4, required: true },
      { name: "guards_count", label: "Number of guards", type: "number", min: 1, default: 1 },
      { name: "armed_preference", label: "Armed?", type: "select", options: [
        { value: "unarmed", label: "Unarmed" },
        { value: "armed", label: "Armed (licensed)" },
        { value: "either", label: "Either" },
      ], default: "unarmed" },
      { name: "venue_capacity", label: "Approx. guest / attendance count", type: "number", min: 1 },
    ],
  },

  // Catch-all for any request that doesn't fit one of the 27 structured
  // categories. Forces the universal "Other → describe" flow by making
  // `other` the only subcategory.
  other: {
    subcategoryLabel: "What kind of help?",
    subcategories: {
      other: { label: "Other (describe in detail)" },
    },
    baseFields: [
      { name: "urgency", label: "When do you need it?", type: "select", required: true, options: [
        { value: "now", label: "Now / within 2 hours" },
        { value: "today", label: "Today" },
        { value: "this_week", label: "This week" },
        { value: "scheduled", label: "Schedule a date" },
      ]},
      { name: "scheduled_for", label: "If scheduled, when?", type: "datetime-local", showIf: { urgency: "scheduled" } },
    ],
  },
};

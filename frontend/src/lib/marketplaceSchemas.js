// Marketplace listing schemas — same shape as service schemas.
// Used by Marketplace create dialog to render category-specific attributes.

const CONDITIONS = [
  { value: "new", label: "Brand new" },
  { value: "like_new", label: "Like new" },
  { value: "excellent", label: "Excellent" },
  { value: "good", label: "Good" },
  { value: "fair", label: "Fair" },
  { value: "for_parts", label: "For parts / not working" },
];

export const MARKETPLACE_CATEGORIES = [
  "electronics", "furniture", "appliances", "apparel", "home_goods",
  "vehicles", "tools", "sporting", "books_media", "toys_games",
  "musical_instruments", "art_collectibles", "baby_kids", "garden_outdoor",
  "free", "other",
];

export const MARKETPLACE_SCHEMAS = {
  electronics: {
    label: "Electronics",
    subcategoryLabel: "Type",
    subcategories: {
      phone: { label: "Phone" },
      laptop: { label: "Laptop / computer" },
      tablet: { label: "Tablet" },
      audio: { label: "Audio (headphones, speakers)" },
      tv: { label: "TV / monitor" },
      gaming: { label: "Gaming console / accessory" },
      camera: { label: "Camera" },
      smart_home: { label: "Smart home" },
      other: { label: "Other" },
    },
    baseFields: [
      { name: "condition", label: "Condition", type: "select", options: CONDITIONS, required: true },
      { name: "brand", label: "Brand", type: "text", placeholder: "Apple, Samsung, Sony…" },
      { name: "model", label: "Model", type: "text" },
      { name: "year", label: "Year (approx.)", type: "number", min: 1990, max: new Date().getFullYear() + 1 },
      { name: "accessories", label: "Includes (charger, box, etc.)", type: "text" },
    ],
  },
  furniture: {
    label: "Furniture",
    subcategoryLabel: "Type",
    subcategories: {
      sofa: { label: "Sofa / couch" },
      chair: { label: "Chair" },
      table: { label: "Table" },
      desk: { label: "Desk" },
      bed: { label: "Bed / mattress" },
      dresser: { label: "Dresser / storage" },
      shelving: { label: "Shelving / bookcase" },
      outdoor: { label: "Outdoor furniture" },
      other: { label: "Other" },
    },
    baseFields: [
      { name: "condition", label: "Condition", type: "select", options: CONDITIONS, required: true },
      { name: "material", label: "Material", type: "select", options: [
        { value: "wood", label: "Wood" }, { value: "metal", label: "Metal" },
        { value: "upholstered", label: "Upholstered" }, { value: "leather", label: "Leather" },
        { value: "plastic", label: "Plastic" }, { value: "glass", label: "Glass" }, { value: "mixed", label: "Mixed" },
      ]},
      { name: "size", label: "Approx. size (LxWxH)", type: "text", placeholder: '72" x 36" x 18"' },
      { name: "color", label: "Color", type: "text" },
      { name: "assembly_required", label: "Assembly required", type: "select", options: [
        { value: "no", label: "No" }, { value: "yes", label: "Yes" },
      ]},
    ],
  },
  appliances: {
    label: "Appliances",
    subcategoryLabel: "Type",
    subcategories: {
      fridge: { label: "Refrigerator" },
      washer: { label: "Washer" },
      dryer: { label: "Dryer" },
      stove: { label: "Stove / range" },
      dishwasher: { label: "Dishwasher" },
      microwave: { label: "Microwave" },
      small: { label: "Small kitchen appliance" },
      vacuum: { label: "Vacuum / cleaner" },
      other: { label: "Other" },
    },
    baseFields: [
      { name: "condition", label: "Condition", type: "select", options: CONDITIONS, required: true },
      { name: "brand", label: "Brand", type: "text" },
      { name: "size", label: "Size / capacity", type: "text", placeholder: 'e.g. 28 cu ft, 24" wide' },
      { name: "year", label: "Year", type: "number", min: 1980, max: new Date().getFullYear() + 1 },
    ],
  },
  apparel: {
    label: "Apparel",
    subcategoryLabel: "Type",
    subcategories: {
      tops: { label: "Tops" },
      bottoms: { label: "Bottoms" },
      outerwear: { label: "Outerwear" },
      dresses: { label: "Dresses" },
      shoes: { label: "Shoes" },
      accessories: { label: "Accessories" },
      bags: { label: "Bags" },
      jewelry: { label: "Jewelry" },
    },
    baseFields: [
      { name: "condition", label: "Condition", type: "select", options: CONDITIONS, required: true },
      { name: "brand", label: "Brand", type: "text" },
      { name: "size", label: "Size", type: "text", placeholder: "S, M, L, 10, 32x32…" },
      { name: "color", label: "Color", type: "text" },
      { name: "gender", label: "Gender", type: "select", options: [
        { value: "womens", label: "Women's" }, { value: "mens", label: "Men's" },
        { value: "kids", label: "Kids" }, { value: "unisex", label: "Unisex" },
      ]},
    ],
  },
  home_goods: {
    label: "Home goods",
    subcategoryLabel: "Type",
    subcategories: {
      decor: { label: "Decor" }, kitchenware: { label: "Kitchenware" },
      bedding: { label: "Bedding / linens" }, rugs: { label: "Rugs" },
      lighting: { label: "Lighting" }, other: { label: "Other" },
    },
    baseFields: [
      { name: "condition", label: "Condition", type: "select", options: CONDITIONS, required: true },
      { name: "material", label: "Material", type: "text" },
      { name: "size", label: "Size", type: "text" },
    ],
  },
  vehicles: {
    label: "Vehicles",
    subcategoryLabel: "Type",
    subcategories: {
      car: { label: "Car" }, motorcycle: { label: "Motorcycle" },
      bike: { label: "Bicycle" }, scooter: { label: "Scooter / e-scooter" },
      truck: { label: "Truck" }, boat: { label: "Boat" }, parts: { label: "Parts" },
    },
    baseFields: [
      { name: "condition", label: "Condition", type: "select", options: CONDITIONS, required: true },
      { name: "year", label: "Year", type: "number", min: 1950, max: new Date().getFullYear() + 1 },
      { name: "make", label: "Make", type: "text" },
      { name: "model", label: "Model", type: "text" },
      { name: "mileage", label: "Mileage", type: "number", min: 0 },
      { name: "transmission", label: "Transmission", type: "select", options: [
        { value: "auto", label: "Automatic" }, { value: "manual", label: "Manual" }, { value: "na", label: "N/A" },
      ]},
      { name: "title", label: "Title status", type: "select", options: [
        { value: "clean", label: "Clean" }, { value: "rebuilt", label: "Rebuilt" },
        { value: "salvage", label: "Salvage" }, { value: "no_title", label: "No title" },
      ]},
    ],
  },
  tools: {
    label: "Tools",
    subcategoryLabel: "Type",
    subcategories: {
      power: { label: "Power tool" }, hand: { label: "Hand tool" },
      garden: { label: "Garden tool" }, automotive: { label: "Automotive tool" },
      other: { label: "Other" },
    },
    baseFields: [
      { name: "condition", label: "Condition", type: "select", options: CONDITIONS, required: true },
      { name: "brand", label: "Brand", type: "text" },
      { name: "corded", label: "Corded / cordless", type: "select", options: [
        { value: "corded", label: "Corded" }, { value: "cordless", label: "Cordless / battery" }, { value: "na", label: "N/A" },
      ]},
    ],
  },
  sporting: {
    label: "Sporting goods",
    subcategoryLabel: "Type",
    subcategories: {
      bike: { label: "Bicycle" }, camping: { label: "Camping / hiking" },
      fitness: { label: "Fitness equipment" }, water: { label: "Water sports" },
      winter: { label: "Winter sports" }, team: { label: "Team sport" }, other: { label: "Other" },
    },
    baseFields: [
      { name: "condition", label: "Condition", type: "select", options: CONDITIONS, required: true },
      { name: "brand", label: "Brand", type: "text" },
      { name: "size", label: "Size", type: "text" },
    ],
  },
  books_media: {
    label: "Books & media",
    subcategoryLabel: "Type",
    subcategories: {
      books: { label: "Books" }, vinyl: { label: "Vinyl" }, cd: { label: "CD" },
      dvd: { label: "DVD / Blu-ray" }, video_games: { label: "Video games" },
      magazines: { label: "Magazines" }, other: { label: "Other" },
    },
    baseFields: [
      { name: "condition", label: "Condition", type: "select", options: CONDITIONS, required: true },
      { name: "format", label: "Format / edition", type: "text" },
      { name: "quantity", label: "Number of items", type: "number", min: 1, default: 1 },
    ],
  },
  toys_games: {
    label: "Toys & games",
    subcategoryLabel: "Type",
    subcategories: {
      board: { label: "Board game" }, puzzle: { label: "Puzzle" },
      action: { label: "Action figure / collectible" }, plush: { label: "Plush / soft toy" },
      educational: { label: "Educational" }, other: { label: "Other" },
    },
    baseFields: [
      { name: "condition", label: "Condition", type: "select", options: CONDITIONS, required: true },
      { name: "age_range", label: "Age range", type: "text", placeholder: "3+, 8-12, all ages" },
    ],
  },
  musical_instruments: {
    label: "Musical instruments",
    subcategoryLabel: "Type",
    subcategories: {
      guitar: { label: "Guitar / bass" }, keyboard: { label: "Keyboard / piano" },
      drums: { label: "Drums / percussion" }, brass: { label: "Brass" },
      woodwind: { label: "Woodwind" }, string: { label: "Strings (violin, etc.)" },
      audio_gear: { label: "Audio gear / amps" }, other: { label: "Other" },
    },
    baseFields: [
      { name: "condition", label: "Condition", type: "select", options: CONDITIONS, required: true },
      { name: "brand", label: "Brand" , type: "text"},
      { name: "year", label: "Year", type: "number", min: 1900, max: new Date().getFullYear() + 1 },
    ],
  },
  art_collectibles: {
    label: "Art & collectibles",
    subcategoryLabel: "Type",
    subcategories: {
      painting: { label: "Painting / print" }, sculpture: { label: "Sculpture" },
      photography: { label: "Photography" }, antique: { label: "Antique" },
      coins: { label: "Coins / currency" }, sports_memorabilia: { label: "Sports memorabilia" },
      other: { label: "Other" },
    },
    baseFields: [
      { name: "condition", label: "Condition", type: "select", options: CONDITIONS, required: true },
      { name: "artist_maker", label: "Artist / maker", type: "text" },
      { name: "size", label: "Size", type: "text" },
      { name: "authentication", label: "Authentication", type: "select", options: [
        { value: "none", label: "None" }, { value: "signed", label: "Signed" },
        { value: "certified", label: "Certified" },
      ]},
    ],
  },
  baby_kids: {
    label: "Baby & kids",
    subcategoryLabel: "Type",
    subcategories: {
      stroller: { label: "Stroller" }, car_seat: { label: "Car seat" },
      crib: { label: "Crib / nursery" }, clothing: { label: "Clothing" },
      toys: { label: "Toys" }, gear: { label: "Gear / safety" }, other: { label: "Other" },
    },
    baseFields: [
      { name: "condition", label: "Condition", type: "select", options: CONDITIONS, required: true },
      { name: "brand", label: "Brand", type: "text" },
      { name: "age_range", label: "Age range", type: "text" },
    ],
  },
  garden_outdoor: {
    label: "Garden & outdoor",
    subcategoryLabel: "Type",
    subcategories: {
      plants: { label: "Plants" }, planters: { label: "Planters / pots" },
      grill: { label: "Grill / outdoor kitchen" }, patio: { label: "Patio furniture" },
      garden_tools: { label: "Garden tools" }, other: { label: "Other" },
    },
    baseFields: [
      { name: "condition", label: "Condition", type: "select", options: CONDITIONS, required: true },
      { name: "size", label: "Size", type: "text" },
    ],
  },
  free: {
    label: "Free / giveaway",
    subcategoryLabel: "Category",
    subcategories: {
      furniture: { label: "Furniture" }, electronics: { label: "Electronics" },
      apparel: { label: "Apparel" }, home_goods: { label: "Home goods" },
      moving_out: { label: "Moving out — take it all" }, other: { label: "Other" },
    },
    baseFields: [
      { name: "condition", label: "Condition", type: "select", options: CONDITIONS },
      { name: "pickup_only", label: "Pickup only", type: "select", options: [
        { value: "yes", label: "Yes — pickup only" }, { value: "no", label: "No — delivery available" },
      ]},
    ],
  },
  other: {
    label: "Other",
    subcategoryLabel: "Subcategory",
    subcategories: {
      misc: { label: "Miscellaneous" },
    },
    baseFields: [
      { name: "condition", label: "Condition", type: "select", options: CONDITIONS },
    ],
  },
};

export const MARKETPLACE_CATEGORY_OPTIONS = MARKETPLACE_CATEGORIES.map((v) => ({
  value: v,
  label: MARKETPLACE_SCHEMAS[v]?.label || v,
}));

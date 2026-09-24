"""Per-city enrichment for the nationwide recruit seed.

Two data layers keyed by slug:
  1. `CITY_NEIGHBORHOODS` — a hand-curated list of 3-5 famous
     neighborhoods / landmarks per major metro. Used in the hero
     subhead ("Deliver in Brickell, Wynwood, Coral Gables") for a
     local-feel SEO boost.
  2. `CITY_PHOTO_IDS` — a unique Unsplash photo ID per city that
     matches that specific skyline / landmark. Falls back to a
     state-generic photo when we don't have a curated match.

Admin can still override anything in the RecruitTab; this is
seed-time defaults only.
"""
from __future__ import annotations

# Unsplash photo IDs — curated to match each city's landmark or skyline.
# Format: bare photo ID → composed into full URL by _photo_url().
CITY_PHOTO_IDS: dict[str, str] = {
    # California
    "los-angeles-ca":    "photo-1580655653885-65763b2597d0",   # LA night skyline
    "san-francisco-ca":  "photo-1521747116042-5a810fda9664",   # Golden Gate
    "san-diego-ca":      "photo-1550333865-2438145d8f5b",      # San Diego harbor
    "san-jose-ca":       "photo-1590650046871-92c887180603",   # SJ skyline
    "sacramento-ca":     "photo-1526295895525-17e94810bc31",   # Sac tower bridge
    "oakland-ca":        "photo-1494522358652-f30e61a60313",   # Oakland waterfront
    "long-beach-ca":     "photo-1503328427499-d92d1ac3d174",   # LBC skyline
    "anaheim-ca":        "photo-1524492514790-2adbeee3f38f",   # SoCal palms
    "fresno-ca":         "photo-1449034446853-66c86144b0ad",   # central valley
    "bakersfield-ca":    "photo-1500534314209-a25ddb2bd429",   # highway
    "riverside-ca":      "photo-1470229722913-7c0e2dbbafd3",   # sunset mtns
    "santa-ana-ca":      "photo-1503328427499-d92d1ac3d174",
    # Texas
    "houston-tx":        "photo-1512389142860-9c449e58a543",   # Houston skyline
    "dallas-tx":         "photo-1531218614045-c0e2a2b3e8ef",   # Dallas skyline
    "austin-tx":         "photo-1531218150217-54595bc2b934",   # ATX skyline
    "san-antonio-tx":    "photo-1512188081-6fd5d7b40a9d",      # riverwalk
    "fort-worth-tx":     "photo-1587381420270-3e1a5b9e6904",   # FW skyline
    "el-paso-tx":        "photo-1594736797933-d0501ba2fe65",   # El Paso desert
    # NYC + boroughs
    "new-york-ny":       "photo-1522083165195-3424ed129620",   # Manhattan
    "brooklyn-ny":       "photo-1502920514313-52581002a659",   # Brooklyn bridge
    "queens-ny":         "photo-1544966503-7cc5ac882d5f",      # 7 train
    "bronx-ny":          "photo-1533105079780-92b9be482077",   # Yankee stadium area
    "staten-island-ny":  "photo-1546436836-07a91091f160",      # SI ferry
    "buffalo-ny":        "photo-1548943487-a2e4e43b4853",
    "rochester-ny":      "photo-1548943487-a2e4e43b4853",
    "syracuse-ny":       "photo-1548943487-a2e4e43b4853",
    "albany-ny":         "photo-1548943487-a2e4e43b4853",
    # Florida
    "miami-fl":          "photo-1508009603885-50cf7c579365",   # Miami beach skyline
    "orlando-fl":        "photo-1597466599360-3b9775841aec",   # theme park city
    "tampa-fl":          "photo-1571747022345-e88b18e40e40",   # Tampa waterfront
    "jacksonville-fl":   "photo-1584556812952-905ffd0c611a",   # Jax skyline
    "st-petersburg-fl":  "photo-1587059892333-7c8e0800f3ca",
    "hialeah-fl":        "photo-1508009603885-50cf7c579365",
    "fort-lauderdale-fl":"photo-1571747022345-e88b18e40e40",
    # Illinois / Midwest
    "chicago-il":        "photo-1477414348463-c0eb7f1359b6",   # Chi skyline
    "detroit-mi":        "photo-1568724353533-73a99d9497aa",   # Detroit skyline
    "grand-rapids-mi":   "photo-1477414348463-c0eb7f1359b6",
    "milwaukee-wi":      "photo-1548345680-f5475ea5df84",      # Milwaukee art museum
    "madison-wi":        "photo-1548345680-f5475ea5df84",
    "minneapolis-mn":    "photo-1595758228888-b60a7b8a4c39",   # Minneapolis skyline
    "st-paul-mn":        "photo-1595758228888-b60a7b8a4c39",
    "indianapolis-in":   "photo-1580655653885-65763b2597d0",
    "columbus-oh":       "photo-1531218614045-c0e2a2b3e8ef",
    "cleveland-oh":      "photo-1524492514790-2adbeee3f38f",
    "cincinnati-oh":     "photo-1524492514790-2adbeee3f38f",
    # Pacific NW / Mountain
    "seattle-wa":        "photo-1502175353174-a7a1d3d3cf19",   # Space needle
    "tacoma-wa":         "photo-1466354424719-343280fe118b",
    "spokane-wa":        "photo-1502175353174-a7a1d3d3cf19",
    "portland-or":       "photo-1518131945814-b32066ade60a",   # Portland skyline
    "eugene-or":         "photo-1518131945814-b32066ade60a",
    "salem-or":          "photo-1518131945814-b32066ade60a",
    "denver-co":         "photo-1546156929-a4c0ac411f47",      # Denver skyline
    "colorado-springs-co":"photo-1580655653885-65763b2597d0",
    "aurora-co":         "photo-1546156929-a4c0ac411f47",
    "salt-lake-city-ut": "photo-1544737151095-6e4c999de2a3",   # SLC mountains
    "boise-id":          "photo-1544737151095-6e4c999de2a3",
    # Nevada / AZ
    "las-vegas-nv":      "photo-1605833556294-ea5c7a74f57d",   # Vegas strip
    "henderson-nv":      "photo-1605833556294-ea5c7a74f57d",
    "reno-nv":           "photo-1518131945814-b32066ade60a",
    "phoenix-az":        "photo-1607793061524-3d5ce9b6f7c1",   # Phoenix skyline
    "tucson-az":         "photo-1597133830317-a63cae1a3b2f",
    "mesa-az":           "photo-1595828300254-83e35bd7e95c",
    "chandler-az":       "photo-1595828300254-83e35bd7e95c",
    "scottsdale-az":     "photo-1518131945814-b32066ade60a",
    # MA / New England
    "boston-ma":         "photo-1501979376754-2ff867a4f659",   # Boston skyline
    "worcester-ma":      "photo-1501979376754-2ff867a4f659",
    "springfield-ma":    "photo-1501979376754-2ff867a4f659",
    "providence-ri":     "photo-1501979376754-2ff867a4f659",
    "hartford-ct":       "photo-1501979376754-2ff867a4f659",
    "bridgeport-ct":     "photo-1501979376754-2ff867a4f659",
    # PA
    "philadelphia-pa":   "photo-1541423408907-49e2ba8a1c2f",   # Philly skyline
    "pittsburgh-pa":     "photo-1524492514790-2adbeee3f38f",
    # NJ
    "newark-nj":         "photo-1522083165195-3424ed129620",
    "jersey-city-nj":    "photo-1522083165195-3424ed129620",
    # Carolinas / South
    "charlotte-nc":      "photo-1524492514790-2adbeee3f38f",
    "raleigh-nc":        "photo-1524492514790-2adbeee3f38f",
    "greensboro-nc":     "photo-1524492514790-2adbeee3f38f",
    "durham-nc":         "photo-1524492514790-2adbeee3f38f",
    "charleston-sc":     "photo-1613574569075-7ab8fbc79fa9",   # Charleston streets
    "columbia-sc":       "photo-1613574569075-7ab8fbc79fa9",
    # Georgia + Tennessee + Kentucky + South
    "atlanta-ga":        "photo-1575931955096-2af2f2b12fca",   # ATL skyline
    "augusta-ga":        "photo-1575931955096-2af2f2b12fca",
    "savannah-ga":       "photo-1613574569075-7ab8fbc79fa9",
    "nashville-tn":      "photo-1568724353533-73a99d9497aa",
    "memphis-tn":        "photo-1568724353533-73a99d9497aa",
    "knoxville-tn":      "photo-1568724353533-73a99d9497aa",
    "louisville-ky":     "photo-1568724353533-73a99d9497aa",
    "lexington-ky":      "photo-1568724353533-73a99d9497aa",
    "new-orleans-la":    "photo-1571893544028-06b07af6dade",   # NOLA French Quarter
    "baton-rouge-la":    "photo-1571893544028-06b07af6dade",
    "birmingham-al":     "photo-1568724353533-73a99d9497aa",
    "montgomery-al":     "photo-1568724353533-73a99d9497aa",
    "mobile-al":         "photo-1568724353533-73a99d9497aa",
    "jackson-ms":        "photo-1568724353533-73a99d9497aa",
    # DC / MD / VA
    "washington-dc":     "photo-1501466044931-62695aada8e9",   # DC monuments
    "baltimore-md":      "photo-1501466044931-62695aada8e9",
    "virginia-beach-va": "photo-1497436072909-60f360e1d4b1",   # VB beach
    "norfolk-va":        "photo-1497436072909-60f360e1d4b1",
    "richmond-va":       "photo-1497436072909-60f360e1d4b1",
    # Great plains
    "omaha-ne":          "photo-1500534314209-a25ddb2bd429",
    "lincoln-ne":        "photo-1500534314209-a25ddb2bd429",
    "wichita-ks":        "photo-1500534314209-a25ddb2bd429",
    "des-moines-ia":     "photo-1500534314209-a25ddb2bd429",
    "oklahoma-city-ok":  "photo-1512389142860-9c449e58a543",
    "tulsa-ok":          "photo-1512389142860-9c449e58a543",
    "little-rock-ar":    "photo-1571893544028-06b07af6dade",
    # SW
    "albuquerque-nm":    "photo-1607793061524-3d5ce9b6f7c1",
    "santa-fe-nm":       "photo-1607793061524-3d5ce9b6f7c1",
    "billings-mt":       "photo-1544737151095-6e4c999de2a3",
    "manchester-nh":     "photo-1477414348463-c0eb7f1359b6",
    "portland-me":       "photo-1477414348463-c0eb7f1359b6",
    "burlington-vt":     "photo-1477414348463-c0eb7f1359b6",
    # AK / HI
    "anchorage-ak":      "photo-1544737151095-6e4c999de2a3",
    "honolulu-hi":       "photo-1542259009477-d625272157b7",   # Waikiki
    # Others
    "arlington-tx":      "photo-1580655653885-65763b2597d0",
    "plano-tx":          "photo-1449034446853-66c86144b0ad",
    "lubbock-tx":        "photo-1500534314209-a25ddb2bd429",
    "corpus-christi-tx": "photo-1502920514313-52581002a659",
    "toledo-oh":         "photo-1449034446853-66c86144b0ad",
    "fort-wayne-in":     "photo-1449034446853-66c86144b0ad",
    "kansas-city-mo":    "photo-1541423408907-49e2ba8a1c2f",
    "st-louis-mo":       "photo-1548943487-a2e4e43b4853",       # STL arch
}


def _photo_url(slug: str, fallback: str) -> str:
    """Return the full Unsplash image URL for a city, or the given
    fallback when we don't have a curated match."""
    pid = CITY_PHOTO_IDS.get(slug)
    if not pid:
        return fallback
    return f"https://images.unsplash.com/{pid}?auto=format&fit=crop&w=1600&q=80"


# Neighborhoods / landmarks — 3-5 real names per major metro. Used
# to fill in `{neighborhoods}` in the hero subhead and rendered as
# chips on the /join/{slug} page.
CITY_NEIGHBORHOODS: dict[str, list[str]] = {
    # California
    "los-angeles-ca":   ["Hollywood", "Silver Lake", "Venice", "DTLA", "Koreatown"],
    "san-francisco-ca": ["Mission", "SoMa", "North Beach", "Marina", "Sunset"],
    "san-diego-ca":     ["Gaslamp", "La Jolla", "Pacific Beach", "North Park", "Hillcrest"],
    "san-jose-ca":      ["Downtown", "Willow Glen", "Santana Row", "Japantown", "Almaden"],
    "sacramento-ca":    ["Midtown", "East Sac", "Land Park", "Natomas", "Oak Park"],
    "oakland-ca":       ["Rockridge", "Temescal", "Lake Merritt", "Fruitvale", "West Oakland"],
    "long-beach-ca":    ["Belmont Shore", "Downtown", "Naples", "Bixby Knolls", "East Village"],
    "anaheim-ca":       ["Downtown", "Anaheim Hills", "Platinum Triangle", "Colony", "West Anaheim"],
    # Texas
    "houston-tx":       ["Montrose", "Heights", "Midtown", "Museum District", "Rice Village"],
    "dallas-tx":        ["Deep Ellum", "Uptown", "Bishop Arts", "Oak Cliff", "Highland Park"],
    "austin-tx":        ["South Congress", "East Austin", "Zilker", "Domain", "Rainey"],
    "san-antonio-tx":   ["Pearl", "Southtown", "Alamo Heights", "King William", "Alamo Plaza"],
    "fort-worth-tx":    ["Sundance Square", "Near Southside", "TCU", "West 7th", "Fairmount"],
    # NYC boroughs
    "new-york-ny":      ["SoHo", "Midtown", "Upper East", "Harlem", "Financial District"],
    "brooklyn-ny":      ["Williamsburg", "DUMBO", "Park Slope", "Bushwick", "Bed-Stuy"],
    "queens-ny":        ["Astoria", "LIC", "Flushing", "Forest Hills", "Jackson Heights"],
    "bronx-ny":         ["Fordham", "Riverdale", "Belmont", "Mott Haven", "Concourse"],
    "staten-island-ny": ["St. George", "Stapleton", "Great Kills", "Tottenville", "New Dorp"],
    # Florida
    "miami-fl":         ["Brickell", "Wynwood", "Coral Gables", "Little Havana", "South Beach"],
    "orlando-fl":       ["Downtown", "Winter Park", "Lake Nona", "Mills 50", "Thornton Park"],
    "tampa-fl":         ["Ybor City", "Hyde Park", "SoHo", "Seminole Heights", "Channelside"],
    "jacksonville-fl":  ["Riverside", "San Marco", "Downtown", "Jax Beach", "Avondale"],
    "st-petersburg-fl": ["Downtown", "Grand Central", "Old Northeast", "Kenwood", "Snell Isle"],
    "fort-lauderdale-fl":["Las Olas", "Wilton Manors", "Victoria Park", "Rio Vista", "Flagler Village"],
    # Georgia
    "atlanta-ga":       ["Midtown", "Buckhead", "West Midtown", "Inman Park", "Decatur"],
    "savannah-ga":      ["Historic District", "Starland", "Ardsley Park", "Downtown", "Southside"],
    # Illinois + Midwest
    "chicago-il":       ["Wicker Park", "Logan Square", "Pilsen", "Loop", "Lincoln Park"],
    "detroit-mi":       ["Midtown", "Corktown", "Greektown", "Downtown", "Belle Isle"],
    "milwaukee-wi":     ["Third Ward", "Bay View", "Riverwest", "Downtown", "Walker's Point"],
    "minneapolis-mn":   ["Uptown", "North Loop", "Northeast", "Loring Park", "Dinkytown"],
    "st-paul-mn":       ["Cathedral Hill", "Grand Ave", "Summit Ave", "Downtown", "Highland Park"],
    "indianapolis-in":  ["Mass Ave", "Fountain Square", "Broad Ripple", "Downtown", "Fletcher Place"],
    "columbus-oh":      ["Short North", "German Village", "OSU Campus", "Downtown", "Grandview"],
    "cleveland-oh":     ["Ohio City", "Tremont", "Downtown", "University Circle", "Detroit-Shoreway"],
    "cincinnati-oh":    ["OTR", "Downtown", "Hyde Park", "Northside", "Mt. Adams"],
    # Pacific NW / Mountain
    "seattle-wa":       ["Capitol Hill", "Ballard", "Fremont", "Belltown", "Pioneer Square"],
    "tacoma-wa":        ["Downtown", "Proctor", "6th Ave", "Stadium", "Old Town"],
    "portland-or":      ["Pearl", "Alberta", "Hawthorne", "Mississippi", "Downtown"],
    "denver-co":        ["RiNo", "LoDo", "Highland", "Cap Hill", "Cherry Creek"],
    "colorado-springs-co":["Old Colorado City", "Downtown", "Manitou", "Rockrimmon", "Broadmoor"],
    "salt-lake-city-ut":["Sugar House", "9th & 9th", "Downtown", "The Avenues", "Marmalade"],
    "boise-id":         ["Downtown", "North End", "Hyde Park", "Bench", "East End"],
    # Nevada / AZ
    "las-vegas-nv":     ["Strip", "Fremont Street", "Arts District", "Summerlin", "Henderson"],
    "reno-nv":          ["Midtown", "Downtown", "Riverwalk", "Northwest", "Somersett"],
    "phoenix-az":       ["Roosevelt Row", "Arcadia", "Biltmore", "Downtown", "Camelback East"],
    "tucson-az":        ["4th Ave", "Downtown", "Sam Hughes", "El Presidio", "Foothills"],
    "scottsdale-az":    ["Old Town", "Downtown", "North Scottsdale", "Airpark", "Optima"],
    # MA / New England
    "boston-ma":        ["Back Bay", "North End", "Seaport", "Cambridge", "South End"],
    "worcester-ma":     ["Canal District", "Elm Park", "Shrewsbury St", "Downtown", "Kelley Square"],
    "providence-ri":    ["Federal Hill", "Downcity", "Wayland Square", "College Hill", "Fox Point"],
    "hartford-ct":      ["West End", "Downtown", "Frog Hollow", "Asylum Hill", "Parkville"],
    # PA
    "philadelphia-pa":  ["Fishtown", "Old City", "Rittenhouse", "South Philly", "Manayunk"],
    "pittsburgh-pa":    ["Strip District", "Lawrenceville", "Squirrel Hill", "Southside", "Shadyside"],
    # NJ
    "newark-nj":        ["Ironbound", "Downtown", "University Heights", "Forest Hill", "North Ward"],
    "jersey-city-nj":   ["Downtown", "Journal Square", "Heights", "Newport", "Grove Street"],
    # Carolinas / South
    "charlotte-nc":     ["NoDa", "South End", "Plaza Midwood", "Uptown", "Dilworth"],
    "raleigh-nc":       ["Glenwood South", "Warehouse District", "Five Points", "North Hills", "Cameron Village"],
    "durham-nc":        ["Downtown", "American Tobacco", "Ninth Street", "Brightleaf", "Trinity Park"],
    "greensboro-nc":    ["Downtown", "Fisher Park", "Lindley Park", "Old Irving Park", "Sunset Hills"],
    "charleston-sc":    ["King Street", "French Quarter", "Cannonborough", "West Ashley", "Mount Pleasant"],
    "columbia-sc":      ["Vista", "Five Points", "USC Campus", "West Columbia", "Rosewood"],
    # TN
    "nashville-tn":     ["Downtown", "East Nashville", "12 South", "Music Row", "Germantown"],
    "memphis-tn":       ["Beale Street", "Overton Square", "Cooper-Young", "Downtown", "Midtown"],
    "knoxville-tn":     ["Old City", "Market Square", "Bearden", "Fourth & Gill", "Sequoyah Hills"],
    "louisville-ky":    ["NuLu", "Highlands", "Downtown", "Butchertown", "Germantown"],
    "lexington-ky":     ["Downtown", "Chevy Chase", "Ashland", "Distillery District", "Woodland"],
    # LA / AL / MS
    "new-orleans-la":   ["French Quarter", "Bywater", "Uptown", "Marigny", "Warehouse"],
    "baton-rouge-la":   ["Downtown", "Mid City", "Garden District", "Southdowns", "LSU"],
    "birmingham-al":    ["Avondale", "Five Points", "Downtown", "Highland Park", "Lakeview"],
    # DC / MD / VA
    "washington-dc":    ["Georgetown", "Adams Morgan", "H Street", "Dupont", "U Street"],
    "baltimore-md":     ["Fells Point", "Federal Hill", "Hampden", "Inner Harbor", "Mt. Vernon"],
    "virginia-beach-va":["Oceanfront", "Town Center", "Chic's Beach", "Sandbridge", "Hilltop"],
    "richmond-va":      ["Fan District", "Church Hill", "Carytown", "Scott's Addition", "Shockoe Bottom"],
    "norfolk-va":       ["Ghent", "Downtown", "Ocean View", "Freemason", "NEON District"],
    # Plains
    "omaha-ne":         ["Old Market", "Blackstone", "Benson", "Dundee", "Downtown"],
    "kansas-city-mo":   ["Westport", "Crossroads", "Country Club Plaza", "River Market", "18th & Vine"],
    "st-louis-mo":      ["The Grove", "CWE", "Soulard", "Downtown", "Loop"],
    "des-moines-ia":    ["East Village", "Downtown", "Beaverdale", "Sherman Hill", "Ingersoll"],
    "wichita-ks":       ["Old Town", "Delano", "College Hill", "Douglas Design District", "Riverside"],
    # OK / AR / NM
    "oklahoma-city-ok": ["Bricktown", "Midtown", "Plaza District", "Deep Deuce", "Paseo"],
    "tulsa-ok":         ["Blue Dome", "Brady Arts", "Cherry Street", "Utica Square", "Kendall-Whittier"],
    "albuquerque-nm":   ["Nob Hill", "Old Town", "Downtown", "EDo", "North Valley"],
    "santa-fe-nm":      ["Canyon Road", "Railyard", "Plaza", "Guadalupe", "Southside"],
    # AK / HI
    "anchorage-ak":     ["Downtown", "Spenard", "South Addition", "Airport Heights", "Turnagain"],
    "honolulu-hi":      ["Waikiki", "Kaka'ako", "Chinatown", "Kailua", "Manoa"],
    # Others
    "arlington-tx":     ["Entertainment District", "Downtown", "UT Arlington", "Viridian", "Pantego"],
    "plano-tx":         ["Legacy West", "Downtown Plano", "Willow Bend", "Shops at Legacy", "Preston Lakes"],
    "el-paso-tx":       ["Downtown", "Kern Place", "Mission Valley", "West El Paso", "Northeast"],
    "buffalo-ny":       ["Elmwood Village", "Allentown", "Larkinville", "Downtown", "Hertel"],
    "rochester-ny":     ["East End", "Park Ave", "South Wedge", "Neighborhood of the Arts", "Downtown"],
}


def local_copy(slug: str) -> dict | None:
    """Return {'neighborhoods': [...], 'subhead_phrase': '…'} for a
    curated city, or None when we don't have a match."""
    hoods = CITY_NEIGHBORHOODS.get(slug)
    if not hoods:
        return None
    phrase = ", ".join(hoods[:3])
    return {
        "neighborhoods": hoods,
        "subhead_phrase": f"Deliver in {phrase} — same-day pay, no lead fees.",
    }

"""Global market data: countries, top cities, regional marketplaces (for SEO hubs + AI ad kits)."""

REGIONS = ["Africa", "Asia", "Middle East", "Latin America", "Europe", "North America", "Oceania"]

# code: (name, region, lang, currency, cities)
COUNTRIES = {
    "NG": ("Nigeria", "Africa", "en", "NGN", ["Lagos", "Abuja", "Port Harcourt", "Ibadan", "Kano", "Benin City"]),
    "KE": ("Kenya", "Africa", "sw", "KES", ["Nairobi", "Mombasa", "Kisumu", "Nakuru", "Eldoret"]),
    "GH": ("Ghana", "Africa", "en", "GHS", ["Accra", "Kumasi", "Tamale", "Takoradi", "Cape Coast"]),
    "EG": ("Egypt", "Africa", "ar", "EGP", ["Cairo", "Alexandria", "Giza", "Sharm El Sheikh", "Mansoura"]),
    "ZA": ("South Africa", "Africa", "en", "ZAR", ["Johannesburg", "Cape Town", "Durban", "Pretoria", "Port Elizabeth"]),
    "ET": ("Ethiopia", "Africa", "am", "ETB", ["Addis Ababa", "Dire Dawa", "Mekelle", "Bahir Dar"]),
    "TZ": ("Tanzania", "Africa", "sw", "TZS", ["Dar es Salaam", "Arusha", "Dodoma", "Mwanza", "Zanzibar"]),
    "UG": ("Uganda", "Africa", "en", "UGX", ["Kampala", "Entebbe", "Gulu", "Mbarara"]),
    "RW": ("Rwanda", "Africa", "en", "RWF", ["Kigali", "Musanze", "Huye"]),
    "MA": ("Morocco", "Africa", "fr", "MAD", ["Casablanca", "Marrakech", "Rabat", "Tangier", "Fes"]),
    "SN": ("Senegal", "Africa", "fr", "XOF", ["Dakar", "Thiès", "Saint-Louis"]),
    "CI": ("Côte d'Ivoire", "Africa", "fr", "XOF", ["Abidjan", "Yamoussoukro", "Bouaké"]),
    "IN": ("India", "Asia", "hi", "INR", ["Mumbai", "Delhi", "Bengaluru", "Hyderabad", "Chennai", "Kolkata", "Pune"]),
    "PK": ("Pakistan", "Asia", "ur", "PKR", ["Karachi", "Lahore", "Islamabad", "Faisalabad", "Rawalpindi"]),
    "BD": ("Bangladesh", "Asia", "bn", "BDT", ["Dhaka", "Chittagong", "Khulna", "Sylhet"]),
    "ID": ("Indonesia", "Asia", "id", "IDR", ["Jakarta", "Surabaya", "Bandung", "Bali", "Medan"]),
    "PH": ("Philippines", "Asia", "tl", "PHP", ["Manila", "Quezon City", "Cebu", "Davao", "Makati"]),
    "VN": ("Vietnam", "Asia", "vi", "VND", ["Ho Chi Minh City", "Hanoi", "Da Nang", "Hai Phong"]),
    "TH": ("Thailand", "Asia", "th", "THB", ["Bangkok", "Chiang Mai", "Phuket", "Pattaya"]),
    "MY": ("Malaysia", "Asia", "ms", "MYR", ["Kuala Lumpur", "Penang", "Johor Bahru", "Kota Kinabalu"]),
    "SG": ("Singapore", "Asia", "en", "SGD", ["Singapore"]),
    "JP": ("Japan", "Asia", "ja", "JPY", ["Tokyo", "Osaka", "Kyoto", "Yokohama", "Fukuoka"]),
    "KR": ("South Korea", "Asia", "ko", "KRW", ["Seoul", "Busan", "Incheon", "Daegu"]),
    "AE": ("United Arab Emirates", "Middle East", "ar", "AED", ["Dubai", "Abu Dhabi", "Sharjah", "Ajman"]),
    "SA": ("Saudi Arabia", "Middle East", "ar", "SAR", ["Riyadh", "Jeddah", "Dammam", "Mecca", "Medina"]),
    "QA": ("Qatar", "Middle East", "ar", "QAR", ["Doha", "Al Wakrah", "Lusail"]),
    "TR": ("Türkiye", "Middle East", "tr", "TRY", ["Istanbul", "Ankara", "Izmir", "Antalya", "Bursa"]),
    "IL": ("Israel", "Middle East", "he", "ILS", ["Tel Aviv", "Jerusalem", "Haifa"]),
    "JO": ("Jordan", "Middle East", "ar", "JOD", ["Amman", "Irbid", "Aqaba"]),
    "MX": ("Mexico", "Latin America", "es", "MXN", ["Mexico City", "Guadalajara", "Monterrey", "Cancún", "Puebla", "Tijuana"]),
    "BR": ("Brazil", "Latin America", "pt-BR", "BRL", ["São Paulo", "Rio de Janeiro", "Brasília", "Salvador", "Belo Horizonte", "Fortaleza"]),
    "CO": ("Colombia", "Latin America", "es", "COP", ["Bogotá", "Medellín", "Cali", "Barranquilla", "Cartagena"]),
    "AR": ("Argentina", "Latin America", "es", "ARS", ["Buenos Aires", "Córdoba", "Rosario", "Mendoza"]),
    "CL": ("Chile", "Latin America", "es", "CLP", ["Santiago", "Valparaíso", "Concepción"]),
    "PE": ("Peru", "Latin America", "es", "PEN", ["Lima", "Arequipa", "Cusco", "Trujillo"]),
    "DO": ("Dominican Republic", "Latin America", "es", "DOP", ["Santo Domingo", "Punta Cana", "Santiago de los Caballeros"]),
    "JM": ("Jamaica", "Latin America", "en", "JMD", ["Kingston", "Montego Bay", "Ocho Rios"]),
    "GB": ("United Kingdom", "Europe", "en", "GBP", ["London", "Manchester", "Birmingham", "Glasgow", "Leeds", "Bristol"]),
    "DE": ("Germany", "Europe", "de", "EUR", ["Berlin", "Munich", "Hamburg", "Frankfurt", "Cologne"]),
    "FR": ("France", "Europe", "fr", "EUR", ["Paris", "Lyon", "Marseille", "Toulouse", "Nice"]),
    "ES": ("Spain", "Europe", "es", "EUR", ["Madrid", "Barcelona", "Valencia", "Seville", "Málaga"]),
    "IT": ("Italy", "Europe", "it", "EUR", ["Rome", "Milan", "Naples", "Turin", "Florence"]),
    "PT": ("Portugal", "Europe", "pt", "EUR", ["Lisbon", "Porto", "Faro", "Braga"]),
    "NL": ("Netherlands", "Europe", "nl", "EUR", ["Amsterdam", "Rotterdam", "The Hague", "Utrecht"]),
    "PL": ("Poland", "Europe", "pl", "PLN", ["Warsaw", "Kraków", "Wrocław", "Gdańsk"]),
    "IE": ("Ireland", "Europe", "en", "EUR", ["Dublin", "Cork", "Galway"]),
    "US": ("United States", "North America", "en", "USD", ["New York", "Los Angeles", "Chicago", "Houston", "Miami", "Atlanta", "Dallas", "Phoenix"]),
    "CA": ("Canada", "North America", "en", "CAD", ["Toronto", "Vancouver", "Montreal", "Calgary", "Ottawa"]),
    "AU": ("Australia", "Oceania", "en", "AUD", ["Sydney", "Melbourne", "Brisbane", "Perth", "Adelaide"]),
    "NZ": ("New Zealand", "Oceania", "en", "NZD", ["Auckland", "Wellington", "Christchurch"]),
}

VERTICALS = {
    "services": "Local services",
    "jobs": "Jobs & gigs",
    "rentals": "Rentals",
    "homes": "Homes & real estate",
    "marketplace": "Buy & sell",
}

# key: (name, countries ["*" = global], post_url)
MARKETPLACES = {
    "craigslist": ("Craigslist", ["US", "CA"], "https://post.craigslist.org/"),
    "fb_marketplace": ("Facebook Marketplace", ["*"], "https://www.facebook.com/marketplace/create/item"),
    "fb_groups": ("Facebook Groups", ["*"], "https://www.facebook.com/groups/feed/"),
    "nextdoor": ("Nextdoor", ["US", "GB", "CA", "AU", "NL", "DE", "FR", "ES", "IT"], "https://nextdoor.com/"),
    "reddit": ("Reddit", ["*"], "https://www.reddit.com/submit"),
    "locanto": ("Locanto", ["*"], "https://www.locanto.com/"),
    "kijiji": ("Kijiji", ["CA"], "https://www.kijiji.ca/p-post-ad.html"),
    "gumtree_uk": ("Gumtree UK", ["GB"], "https://my.gumtree.com/postad"),
    "gumtree_au": ("Gumtree Australia", ["AU"], "https://www.gumtree.com.au/p-post-ad.html"),
    "gumtree_za": ("Gumtree South Africa", ["ZA"], "https://www.gumtree.co.za/"),
    "trademe": ("Trade Me", ["NZ"], "https://www.trademe.co.nz/a/listing"),
    "jiji_ng": ("Jiji Nigeria", ["NG"], "https://jiji.ng/add-advert"),
    "jiji_ke": ("Jiji Kenya", ["KE"], "https://jiji.co.ke/add-advert"),
    "jiji_gh": ("Jiji Ghana", ["GH"], "https://jiji.com.gh/add-advert"),
    "jiji_et": ("Jiji Ethiopia", ["ET"], "https://jiji.com.et/add-advert"),
    "jiji_tz": ("Jiji Tanzania", ["TZ"], "https://jiji.co.tz/add-advert"),
    "jiji_ug": ("Jiji Uganda", ["UG"], "https://jiji.ug/add-advert"),
    "dubizzle_eg": ("Dubizzle Egypt", ["EG"], "https://www.dubizzle.com.eg/"),
    "avito_ma": ("Avito Morocco", ["MA"], "https://www.avito.ma/"),
    "expat_dakar": ("Expat-Dakar", ["SN"], "https://www.expat-dakar.com/"),
    "olx_in": ("OLX India", ["IN"], "https://www.olx.in/post"),
    "olx_pk": ("OLX Pakistan", ["PK"], "https://www.olx.com.pk/post"),
    "bikroy": ("Bikroy", ["BD"], "https://bikroy.com/en/post-ad"),
    "olx_id": ("OLX Indonesia", ["ID"], "https://www.olx.co.id/post"),
    "carousell": ("Carousell", ["SG", "PH", "MY"], "https://www.carousell.sg/sell"),
    "chotot": ("Chợ Tốt", ["VN"], "https://www.chotot.com/"),
    "kaidee": ("Kaidee", ["TH"], "https://www.kaidee.com/"),
    "mudah": ("Mudah.my", ["MY"], "https://www.mudah.my/"),
    "mercari_jp": ("Mercari Japan", ["JP"], "https://jp.mercari.com/sell"),
    "danggeun": ("Karrot (Danggeun)", ["KR"], "https://www.daangn.com/"),
    "dubizzle_ae": ("Dubizzle UAE", ["AE"], "https://uae.dubizzle.com/place-an-ad/"),
    "haraj": ("Haraj", ["SA"], "https://haraj.com.sa/"),
    "qatar_living": ("Qatar Living", ["QA"], "https://www.qatarliving.com/"),
    "sahibinden": ("Sahibinden", ["TR"], "https://www.sahibinden.com/"),
    "yad2": ("Yad2", ["IL"], "https://www.yad2.co.il/"),
    "opensooq": ("OpenSooq", ["JO", "SA", "QA", "AE"], "https://jo.opensooq.com/"),
    "mercadolibre_mx": ("Mercado Libre México", ["MX"], "https://www.mercadolibre.com.mx/"),
    "mercadolibre_ar": ("Mercado Libre Argentina", ["AR"], "https://www.mercadolibre.com.ar/"),
    "mercadolibre_co": ("Mercado Libre Colombia", ["CO"], "https://www.mercadolibre.com.co/"),
    "mercadolibre_cl": ("Mercado Libre Chile", ["CL"], "https://www.mercadolibre.cl/"),
    "mercadolibre_pe": ("Mercado Libre Perú", ["PE"], "https://www.mercadolibre.com.pe/"),
    "olx_br": ("OLX Brasil", ["BR"], "https://www.olx.com.br/"),
    "corotos": ("Corotos", ["DO"], "https://www.corotos.com.do/"),
    "leboncoin": ("Leboncoin", ["FR"], "https://www.leboncoin.fr/deposer-une-annonce"),
    "kleinanzeigen": ("Kleinanzeigen", ["DE"], "https://www.kleinanzeigen.de/p-anzeige-aufgeben.html"),
    "wallapop": ("Wallapop", ["ES"], "https://es.wallapop.com/app/catalog/upload"),
    "subito": ("Subito", ["IT"], "https://www.subito.it/inserisci-annuncio"),
    "olx_pt": ("OLX Portugal", ["PT"], "https://www.olx.pt/"),
    "marktplaats": ("Marktplaats", ["NL"], "https://www.marktplaats.nl/plaats"),
    "olx_pl": ("OLX Poland", ["PL"], "https://www.olx.pl/d/nowe-ogloszenie/"),
    "donedeal": ("DoneDeal", ["IE"], "https://www.donedeal.ie/publish"),
}


def slugify(s: str) -> str:
    import re
    import unicodedata
    s = unicodedata.normalize("NFKD", s).encode("ascii", "ignore").decode()
    return re.sub(r"[^a-z0-9]+", "-", s.lower()).strip("-")


def markets_payload() -> dict:
    countries = []
    for code, (name, region, lang, cur, cities) in COUNTRIES.items():
        countries.append({
            "code": code, "slug": slugify(name), "name": name, "region": region, "lang": lang, "currency": cur,
            "cities": [{"name": c, "slug": slugify(c)} for c in cities],
            "marketplaces": [k for k, (_, cs, _u) in MARKETPLACES.items() if "*" in cs or code in cs],
        })
    return {
        "regions": REGIONS,
        "verticals": [{"key": k, "label": v} for k, v in VERTICALS.items()],
        "countries": countries,
        "marketplaces": [{"key": k, "name": n, "countries": cs, "post_url": u} for k, (n, cs, u) in MARKETPLACES.items()],
    }


def global_urls() -> list:
    urls = ["/global"]
    for code, (name, _r, _l, _c, cities) in COUNTRIES.items():
        cs = slugify(name)
        urls.append(f"/in/{cs}")
        for city in cities:
            for v in VERTICALS:
                urls.append(f"/in/{cs}/{slugify(city)}/{v}")
    return urls

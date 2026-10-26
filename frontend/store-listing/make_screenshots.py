from PIL import Image, ImageDraw, ImageFont

SHOTS = [
    ("customer", "Food, shops and local pros", "Order for pickup or delivery and see the fee up front.", "#2563EB"),
    ("worker", "Earn on your schedule", "Pick up runs and jobs near you. Keep 90%, paid same day.", "#059669"),
    ("seller", "Your shop, in every pocket", "Free storefront, live orders and stock. Just 5% per sale.", "#D97706"),
    ("estate", "Buy, rent or stay", "Homes near you on the map. Sales and rentals list free.", "#7C3AED"),
    ("tracking", "Watch it arrive", "Follow your driver live, see the drop-off photo and tip.", "#059669"),
    ("alerts", "Alerts for nearby work", "On-duty alerts for runs and jobs near you. Your hours.", "#E11D48"),
]
ART = "/app/frontend/store-listing/art"
W, H = 1320, 2868
OUT = "/app/frontend/store-listing/screenshots"


def font(size, weight):
    f = ImageFont.truetype(f"{ART}/SpaceGrotesk.ttf", size)
    try:
        f.set_variation_by_axes([weight])
    except Exception:
        pass
    return f


def wrap(draw, text, f, maxw):
    words, lines, cur = text.split(), [], ""
    for w in words:
        t = (cur + " " + w).strip()
        if draw.textlength(t, font=f) <= maxw:
            cur = t
        else:
            lines.append(cur)
            cur = w
    return lines + [cur]


for i, (slug, title, sub, accent) in enumerate(SHOTS, 1):
    art = Image.open(f"{ART}/shot_{slug}.jpg").convert("RGB")
    art = art.resize((W, int(art.height * W / art.width)), Image.LANCZOS)
    row = art.crop((0, 0, W, 4)).resize((1, 1), Image.LANCZOS)
    bg = row.getpixel((0, 0))
    canvas = Image.new("RGB", (W, H), bg)
    mask = Image.new("L", art.size, 255)
    md = ImageDraw.Draw(mask)
    for yy in range(400):
        md.line([(0, yy), (W, yy)], fill=int(255 * yy / 400))
    canvas.paste(art, (0, H - art.height), mask)
    d = ImageDraw.Draw(canvas)
    d.text((110, 190), {"estate": "REAL ESTATE", "tracking": "LIVE TRACKING", "alerts": "FOR WORKERS"}.get(slug, slug.upper()), font=font(44, 600), fill=accent)
    y = 270
    for line in wrap(d, title, font(124, 700), W - 220):
        d.text((110, y), line, font=font(124, 700), fill="#09090B")
        y += 140
    y += 30
    for line in wrap(d, sub, font(54, 400), W - 220):
        d.text((110, y), line, font=font(54, 400), fill="#475569")
        y += 70
    canvas.save(f"{OUT}/iphone-6.9-{i}-{slug}.png")
    canvas.resize((1080, int(H * 1080 / W)), Image.LANCZOS).crop((0, 0, 1080, 2340)).save(f"{OUT}/android-phone-{i}-{slug}.png")
print("done")

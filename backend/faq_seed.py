"""Starter Help Center FAQs (seeded once; admins manage them afterwards)."""
import uuid
from datetime import datetime, timezone

TOPICS = [
    ("getting_started", "Getting started"),
    ("booking", "Booking services"),
    ("payments", "Payments & deposits"),
    ("earning", "Working & earning"),
    ("buying_selling", "Buying & selling"),
    ("rentals", "Rentals & short stays"),
    ("real_estate", "Real estate"),
    ("account", "Account & security"),
    ("troubleshooting", "Troubleshooting"),
]

FAQS = {
    "getting_started": [
        ("What is Lumo?", "Lumo is one place to book local services, find work, buy and rent things, and search homes, rentals and short stays anywhere in the world."),
        ("Do I need an account to browse?", "No. You can browse services, products, rentals and real estate without signing in. You'll need a free account to book, buy, message, list or save anything."),
        ("How do I create an account?", "Tap Get started (or Profile on mobile), then sign up with Google, your phone number or an email and password."),
        ("Is Lumo available in my country?", "Products, rentals and real estate are global. Local services depend on providers in your area — new cities are added every week."),
        ("Can I use Lumo on my phone?", "Yes. Lumo works in any mobile browser. Add it to your home screen from your browser's share menu for an app-like experience with notifications."),
        ("Who is Lumi?", "Lumi is the built-in AI guide. Tap Ask Lumi, describe what you need, and Lumi suggests the right pages. It never takes actions for you."),
    ],
    "booking": [
        ("How do I book a service?", "Open Book a service, choose a category and fill in the details. Nearby providers see your request and can accept it or send a quote."),
        ("Can providers send me a different price?", "Yes. A provider can accept your asking rate or send a counter-offer. Nothing is final until you accept."),
        ("How do I know a provider is trustworthy?", "Check their rating, reviews, completed jobs and verified credentials on their profile before you accept."),
        ("Can I message a provider before booking?", "Yes. Each job has its own private chat. Your phone number and email stay hidden."),
        ("How do I cancel a booking?", "Open the job from Orders and choose Cancel. If a provider has already accepted, cancellation terms shown on the job apply."),
        ("Can I track my provider?", "For deliveries and on-the-way jobs, open the job and tap Track to see live progress."),
        ("What if the work isn't done right?", "Message the provider from the job first. If it isn't resolved, contact support from the Help page and we'll step in before funds are released."),
    ],
    "payments": [
        ("How does the deposit work?", "At checkout you pay a small bundled deposit (10% of the item or service plus 10% of delivery). Lumo holds it until the work is done."),
        ("How do I pay the rest?", "Pay the remaining balance in the app, by card, or in cash — whichever you and the provider agreed on."),
        ("Which payment methods are accepted?", "Major credit and debit cards through our secure payment partner, your Lumo wallet balance, and cash where the provider allows it."),
        ("Is my card information safe?", "Yes. Card details are handled by our PCI-compliant payment processor. Lumo never stores your full card number."),
        ("How do refunds work?", "If a job is cancelled before work starts, the held deposit is returned to your original payment method or wallet. Card refunds usually take 5–10 business days."),
        ("Are taxes included?", "Where sales tax or VAT applies, it is shown as its own line before you pay."),
    ],
    "earning": [
        ("How do I start earning on Lumo?", "Go to Get paid, create a provider profile, pick your categories and service area, and start accepting jobs near you."),
        ("How much do I keep?", "Providers keep 90% of every dollar they earn on Lumo."),
        ("When do I get paid?", "Earnings land in your Lumo wallet when a job is completed. You can cash out to your bank, with same-day payouts where available."),
        ("Do I need a license?", "Most categories don't. Licensed trades (for example notary or medical services) require you to upload valid credentials before you can accept those jobs."),
        ("Can I find full-time or remote jobs?", "Yes. Browse Remote jobs and Careers for long-term, W-2 and remote roles alongside on-demand gigs."),
        ("How do I get more jobs?", "Keep your profile complete, respond quickly, collect good reviews and widen your service radius."),
    ],
    "buying_selling": [
        ("How do I sell something?", "Open Shop the market and tap Create listing. Add photos, a price and a description — it goes live right away."),
        ("How do I buy an item?", "Tap Buy on a listing, choose pickup or delivery, and pay the small deposit. The rest is paid on handoff."),
        ("Can I get an item delivered?", "Yes. Choose delivery at checkout and a nearby courier picks it up for you."),
        ("How do I change my listing's price?", "Open your listing and tap Edit price. If you lower it, people who saved the item get a price-drop alert."),
        ("What are price-drop alerts?", "Tap the heart on any listing, home or car. If the price goes down, you'll get an in-app and phone notification."),
        ("How do I sell a car?", "Go to Autos and tap Sell my car. Add the year, make, model, mileage and photos."),
        ("What is the Lumo Shop?", "A hand-picked selection of products from major retailers. Purchases happen on the retailer's site, and Lumo may earn a commission."),
    ],
    "rentals": [
        ("What can I rent on Lumo?", "Tools, gear, vehicles, venues, workspaces and places to stay — by the hour, day, week or month."),
        ("How do I book a rental?", "Open the rental, pick your dates and confirm. Some hosts approve instantly; others review requests first."),
        ("How do I list my own rental?", "Go to Rentals and tap List a rental. Set your prices, availability and booking mode."),
        ("Is there a security deposit?", "Some hosts add one. It's shown before you book and returned after the item is returned in good condition."),
        ("Where do I find short stays and vacation rentals?", "They appear in Real estate under Short stays, alongside homes for sale and long-term rentals."),
    ],
    "real_estate": [
        ("Can I search homes anywhere in the world?", "Yes. Type any city, neighborhood, address or country in the Real estate search and the map flies there."),
        ("How does the map search work?", "Move or zoom the map and results update to that area. Turn off Search as I move the map to keep your current results."),
        ("How do I save a search?", "Run a search and tap Save search. We'll alert you whenever a new matching home is listed."),
        ("How do I request a tour?", "Open a listing and tap Request a tour. Pick a preferred date and time and the owner replies in Messages."),
        ("How do I list a property?", "Tap List a property. Choose for sale, long-term rent, short stay or room, add the address and photos — we pin it on the map automatically."),
        ("How do I mark my home as sold or rented?", "Open your listing and use Mark sold / Mark rented. You can make it active again anytime."),
        ("Can I see the exact location?", "Each listing has a map plus OpenStreetMap, Google Maps and Directions links to the property."),
    ],
    "account": [
        ("How do I change my name, email or phone?", "Open Profile (Settings) and edit your details."),
        ("I forgot my password. What do I do?", "On the sign-in screen, use phone or Google sign-in, or contact support to reset your password."),
        ("Is my contact information shared?", "No. Messages stay inside Lumo and your phone and email are never shown to other users."),
        ("How do I turn notifications on or off?", "Open Profile (Settings) and toggle notifications. On phones, also allow notifications for this site in your browser."),
        ("How do I delete my account?", "Contact support from the Help page and we'll remove your account and data."),
        ("How do I report a user or listing?", "Use Contact support with a link to the listing or job and a short description. We review every report."),
    ],
    "troubleshooting": [
        ("The site only loads in a private/incognito window.", "Your browser is holding an old copy of the site. Tap Reset this device in the Fix common problems section (or visit /reset) once and reload."),
        ("I can't sign in.", "Check your email and password, try phone or Google sign-in, and make sure cookies are allowed. Too many attempts trigger a short lockout — wait 15 minutes and try again."),
        ("My payment failed.", "Check your card details and balance, try another card, or contact your bank. Nothing is charged if a payment fails."),
        ("I'm not getting notifications.", "Allow notifications for this site in your browser and phone settings, then turn them on in Profile (Settings)."),
        ("The map or photos won't load.", "Check your connection and disable content blockers for this site, then reload."),
        ("Something else isn't working.", "Ask Lumi or contact support with a screenshot and the page you were on — we'll get it sorted."),
    ],
}


def topic_label(key: str) -> str:
    return dict(TOPICS).get(key, key)


async def seed_faqs(db) -> int:
    if await db.site_settings.find_one({"_id": "faq_seeded"}):
        return 0
    now = datetime.now(timezone.utc).isoformat()
    docs = []
    for t_index, (topic, _) in enumerate(TOPICS):
        for i, (q, a) in enumerate(FAQS[topic]):
            docs.append({"id": str(uuid.uuid4()), "topic": topic, "question": q, "answer": a,
                         "position": t_index * 100 + i, "is_active": True, "created_at": now})
    if docs:
        await db.faqs.insert_many(docs)
    await db.site_settings.update_one({"_id": "faq_seeded"}, {"$set": {"at": now, "count": len(docs)}}, upsert=True)
    return len(docs)

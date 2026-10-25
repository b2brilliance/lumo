import { ShoppingBag, HardHat, Store, Building2 } from "lucide-react";

export const CATEGORIES = {
  customers: {
    slug: "customers", label: "Customers", Icon: ShoppingBag, accent: "#2563EB", screen: "customer",
    kicker: "For customers",
    title: "Everything your neighborhood offers, delivered or done for you.",
    lead: "Order from restaurants, food trucks and local shops for pickup or delivery, or book a trusted local pro for cleaning, repairs, moving and more.",
    stats: [["Up front", "delivery price"], ["Live", "order tracking"], ["15+", "languages"]],
    image: "https://images.pexels.com/photos/8939510/pexels-photo-8939510.jpeg?auto=compress&cs=tinysrgb&w=1200",
    features: [
      ["Food and shops nearby", "Restaurants, food trucks, grocers and local stores, all in one feed sorted by distance."],
      ["Book local pros", "Cleaners, handymen, movers, tutors and more. Compare reviews and quotes before you book."],
      ["Know the price first", "You see the item total, the 5% service fee and the delivery fee before you pay. No surprises."],
      ["Track every order", "Follow your driver on the map and get a notification the moment it's on the way."],
    ],
    steps: [
      ["Open Lumo and choose Customer", "Sign in with Apple, phone or email in seconds."],
      ["Pick a store or a service", "Browse what's near you, add items to your cart or request a pro."],
      ["Choose pickup or delivery", "Delivery is priced by distance and order size, shown before checkout."],
      ["Pay and track", "Pay securely in the app and follow your order until it arrives."],
    ],
    fees: [
      ["Pickup orders", "5% service fee on the items"],
      ["Delivery orders", "5% + a delivery fee based on miles and order size"],
      ["Booking a pro", "Small deposit to lock it in, the rest after the job"],
      ["Membership", "None. Lumo is free to download and use"],
    ],
    faqs: [
      ["How is the delivery fee calculated?", "A small base fee, plus a per-mile charge for the distance from the store to you, scaled up for large or heavy orders. You always see the exact amount before paying."],
      ["Can I pick up my order instead?", "Yes. Choose pickup at checkout and you only pay the items plus the 5% service fee."],
      ["What if something goes wrong?", "Contact support from the app or golumo.app/support. We reply within 24 hours and make it right."],
      ["Is my payment safe?", "Payments are processed by Stripe. Lumo never stores your full card number."],
    ],
  },
  workers: {
    slug: "workers", label: "Workers", Icon: HardHat, accent: "#059669", screen: "worker",
    kicker: "For workers and drivers",
    title: "Earn on your schedule. Keep 90% of every job.",
    lead: "Pick up delivery runs and local service jobs near you. Set your own hours, choose the work you like and get paid the same day.",
    stats: [["90%", "of every job is yours"], ["Same day", "payouts"], ["$0", "to sign up"]],
    image: "https://images.pexels.com/photos/7706383/pexels-photo-7706383.jpeg?auto=compress&cs=tinysrgb&w=1200",
    features: [
      ["Delivery runs nearby", "See paid deliveries around you with the distance and payout shown before you accept."],
      ["Service jobs", "Cleaning, moving, handyman, yard work and more. Add your skills and get matched."],
      ["Your hours, your area", "Go online when you want and set how far you're willing to travel."],
      ["Fast, fair pay", "Keep 90% of the job and 90% of the delivery fee. Cash out the same day."],
    ],
    steps: [
      ["Open Lumo and choose Worker", "Create your account with Apple, phone or email."],
      ["Set up your profile", "Add your skills, service area and a photo of your ID for verification."],
      ["Accept jobs you want", "Get alerts for runs and jobs near you and accept with one tap."],
      ["Finish and get paid", "Mark the job complete and your earnings land in your wallet."],
    ],
    fees: [
      ["Your share", "90% of every job and every delivery fee"],
      ["Lumo's share", "10%, which covers payments, support and insurance tools"],
      ["Sign-up", "Free, no monthly fees"],
      ["Payouts", "Same day to your bank once the job is complete"],
    ],
    faqs: [
      ["Do I need a car?", "No. Bikes and scooters work for short food runs, and many service jobs only need you and your tools."],
      ["Why do you ask for an ID?", "Verifying every worker keeps customers safe and helps you get booked faster."],
      ["How do I get paid?", "Earnings go to your Lumo wallet and can be paid out to your bank the same day."],
      ["Can I recruit other workers?", "Yes. Share your invite link and earn a bonus when people you invite complete jobs."],
    ],
  },
  sellers: {
    slug: "sellers", label: "Sellers", Icon: Store, accent: "#D97706", screen: "seller",
    kicker: "For restaurants, stores and individuals",
    title: "A free shop in your customers' pocket.",
    lead: "Restaurants, food trucks, stores and people selling their own things get a free storefront with photos, a menu or catalog, stock tracking and orders.",
    stats: [["$0", "to open a shop"], ["5%", "only when you sell"], ["Local", "drivers included"]],
    image: "https://images.pexels.com/photos/16052344/pexels-photo-16052344.jpeg?auto=compress&cs=tinysrgb&w=1200",
    features: [
      ["Menu or catalog", "Add items with photos, prices, sizes and options in minutes."],
      ["Stock that stays right", "Inventory updates with every order so you never sell what you don't have."],
      ["Pickup and delivery", "Offer either or both. Local Lumo drivers handle the delivery for you."],
      ["Orders in real time", "Get notified the second an order is paid and see everything in one dashboard."],
    ],
    steps: [
      ["Open Lumo and choose Seller", "Pick restaurant, food truck, store or personal shop."],
      ["Build your shop", "Add your logo, hours, menu or products and prices."],
      ["Go live", "Customers nearby can find you right away in the app."],
      ["Fulfil and get paid", "Accept orders, hand them to the driver or customer, and get paid out."],
    ],
    fees: [
      ["Opening a shop", "Free"],
      ["Each order", "5% service fee, only when you make a sale"],
      ["Delivery", "Paid by the customer, drivers keep 90%"],
      ["Monthly fees", "None"],
    ],
    faqs: [
      ["Can I sell my own used items?", "Yes. Choose personal shop and list anything you'd like to sell locally."],
      ["Do I need my own drivers?", "No. Lumo workers nearby pick up and deliver your orders."],
      ["How do payouts work?", "Customers pay in the app. Your share, minus the 5% fee, is paid out to your bank."],
      ["Can I pause my shop?", "Yes. Turn off your shop or individual items any time, for example when you're closed."],
    ],
  },
  "real-estate": {
    slug: "real-estate", label: "Real Estate", Icon: Building2, accent: "#7C3AED", screen: "estate",
    kicker: "For buyers, renters, owners and agents",
    title: "Find your next place, or list yours for free.",
    lead: "Browse homes for sale, long-term rentals and short stays near you. Owners and agents list sales and long-term rentals free.",
    stats: [["Free", "sale and rental listings"], ["5%", "only on short stays"], ["Map", "search near you"]],
    image: "https://images.unsplash.com/photo-1758523670960-eb5512da12e8?crop=entropy&cs=srgb&fm=jpg&q=85&w=1200",
    features: [
      ["Buy, rent or stay", "Switch between homes for sale, long-term rentals and short stays in one tap."],
      ["Search on the map", "See listings around you with photos, price, beds, baths and size."],
      ["Free listings", "Sales and long-term rentals are free to list, with as many photos as you like."],
      ["Short stays made simple", "Accept bookings and payments in the app for a 5% commission."],
    ],
    steps: [
      ["Open Lumo and choose Real Estate", "Pick whether you're looking or listing."],
      ["Search or list", "Browse the map, or add your property with photos and details."],
      ["Connect", "Message owners, request viewings or approve booking requests."],
      ["Move in or get paid", "Close the deal or collect short-stay payments in the app."],
    ],
    fees: [
      ["Homes for sale", "Free to list"],
      ["Long-term rentals", "Free to list"],
      ["Short-term stays", "5% commission per booking"],
      ["Searching", "Always free"],
    ],
    faqs: [
      ["Who can list a property?", "Owners, landlords and licensed agents. Every listing is reviewed before it goes live."],
      ["Why are short stays charged?", "Short stays are booked and paid in the app, so the 5% covers payments and support."],
      ["Can I save homes I like?", "Yes. Save listings and get alerts when similar homes come up nearby."],
      ["Is Lumo available in my city?", "Lumo works worldwide, in 15+ languages, with local listings growing every day."],
    ],
  },
};

export const CATEGORY_LIST = Object.values(CATEGORIES);

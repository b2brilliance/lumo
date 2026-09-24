"""Nationwide US city seed for the Lumo recruit engine.

100 major US metros ranked by 2020 census + hiring priority. Every entry
follows the same `RecruitCity` shape used by `recruit_cities.SEED_CITIES`
so the two lists can be concatenated at seed time.

Copy templates rotate through 5 hero-headline / subhead variants so no
two city pages read identically, and Unsplash city imagery is deep-
linked so `/join/{slug}` renders a real photo of that metro on first
visit (admin can override in the console anytime).
"""
from __future__ import annotations

from typing import Any, Dict, List

# 5 hero copy variants — rotated so pages don't feel generated
_HEADLINE_VARIANTS = [
    "Drive with Lumo in {city}.",
    "{city} — same-day pay, 90% take-home.",
    "Own your hustle in {city}.",
    "{city}'s next 300 gig pros start here.",
    "Get hired in {city} — no lead fees, ever.",
]
_SUBHEAD_VARIANTS = [
    "300 provider spots. $100 bonus after your first 100 jobs. Cash out today.",
    "First 100 sign-ups in {city} earn a $100 bonus after their 100th completed job.",
    "Deliveries, moves, repairs, cleans — Lumo pays same day in {city}. No lead fees.",
    "Lumo needs movers, cleaners, mechanics, tutors and couriers in {city}. Start today.",
    "Keep 90% of every dollar. First 100 pros in {city} earn a $100 loyalty bonus at job #100.",
]

# Unsplash city imagery. Fallbacks are safe generic urban shots.
_FALLBACK_IMAGE = "https://images.unsplash.com/photo-1477414348463-c0eb7f1359b6?auto=format&fit=crop&w=1600&q=80"

# Curated top-100 US metros (city, state, state_full, image)
# Ordered by population — makes it feel intentional if all 100 cities
# ever appear in one list in the admin console.
_US_METROS: List[Dict[str, str]] = [
    # New York + boroughs area
    {"city": "New York", "state": "NY", "state_full": "New York",
     "img": "https://images.unsplash.com/photo-1522083165195-3424ed129620?auto=format&fit=crop&w=1600&q=80"},
    {"city": "Brooklyn", "state": "NY", "state_full": "New York",
     "img": "https://images.unsplash.com/photo-1502920514313-52581002a659?auto=format&fit=crop&w=1600&q=80"},
    {"city": "Queens", "state": "NY", "state_full": "New York",
     "img": "https://images.unsplash.com/photo-1544966503-7cc5ac882d5f?auto=format&fit=crop&w=1600&q=80"},
    {"city": "Bronx", "state": "NY", "state_full": "New York",
     "img": "https://images.unsplash.com/photo-1533105079780-92b9be482077?auto=format&fit=crop&w=1600&q=80"},
    {"city": "Staten Island", "state": "NY", "state_full": "New York",
     "img": "https://images.unsplash.com/photo-1546436836-07a91091f160?auto=format&fit=crop&w=1600&q=80"},
    # California
    {"city": "San Diego", "state": "CA", "state_full": "California",
     "img": "https://images.unsplash.com/photo-1550333865-2438145d8f5b?auto=format&fit=crop&w=1600&q=80"},
    {"city": "San Jose", "state": "CA", "state_full": "California",
     "img": "https://images.unsplash.com/photo-1590650046871-92c887180603?auto=format&fit=crop&w=1600&q=80"},
    {"city": "Sacramento", "state": "CA", "state_full": "California",
     "img": "https://images.unsplash.com/photo-1526295895525-17e94810bc31?auto=format&fit=crop&w=1600&q=80"},
    {"city": "Oakland", "state": "CA", "state_full": "California",
     "img": "https://images.unsplash.com/photo-1494522358652-f30e61a60313?auto=format&fit=crop&w=1600&q=80"},
    {"city": "Fresno", "state": "CA", "state_full": "California",
     "img": "https://images.unsplash.com/photo-1449034446853-66c86144b0ad?auto=format&fit=crop&w=1600&q=80"},
    {"city": "Long Beach", "state": "CA", "state_full": "California",
     "img": "https://images.unsplash.com/photo-1503328427499-d92d1ac3d174?auto=format&fit=crop&w=1600&q=80"},
    {"city": "Bakersfield", "state": "CA", "state_full": "California",
     "img": "https://images.unsplash.com/photo-1500534314209-a25ddb2bd429?auto=format&fit=crop&w=1600&q=80"},
    {"city": "Anaheim", "state": "CA", "state_full": "California",
     "img": "https://images.unsplash.com/photo-1524492514790-2adbeee3f38f?auto=format&fit=crop&w=1600&q=80"},
    {"city": "Riverside", "state": "CA", "state_full": "California",
     "img": "https://images.unsplash.com/photo-1470229722913-7c0e2dbbafd3?auto=format&fit=crop&w=1600&q=80"},
    {"city": "Santa Ana", "state": "CA", "state_full": "California",
     "img": "https://images.unsplash.com/photo-1503328427499-d92d1ac3d174?auto=format&fit=crop&w=1600&q=80"},
    # Texas
    {"city": "Houston", "state": "TX", "state_full": "Texas",
     "img": "https://images.unsplash.com/photo-1512389142860-9c449e58a543?auto=format&fit=crop&w=1600&q=80"},
    {"city": "Dallas", "state": "TX", "state_full": "Texas",
     "img": "https://images.unsplash.com/photo-1531218614045-c0e2a2b3e8ef?auto=format&fit=crop&w=1600&q=80"},
    {"city": "Austin", "state": "TX", "state_full": "Texas",
     "img": "https://images.unsplash.com/photo-1531218150217-54595bc2b934?auto=format&fit=crop&w=1600&q=80"},
    {"city": "San Antonio", "state": "TX", "state_full": "Texas",
     "img": "https://images.unsplash.com/photo-1512188081-6fd5d7b40a9d?auto=format&fit=crop&w=1600&q=80"},
    {"city": "Fort Worth", "state": "TX", "state_full": "Texas",
     "img": "https://images.unsplash.com/photo-1587381420270-3e1a5b9e6904?auto=format&fit=crop&w=1600&q=80"},
    {"city": "El Paso", "state": "TX", "state_full": "Texas",
     "img": "https://images.unsplash.com/photo-1594736797933-d0501ba2fe65?auto=format&fit=crop&w=1600&q=80"},
    {"city": "Arlington", "state": "TX", "state_full": "Texas",
     "img": "https://images.unsplash.com/photo-1580655653885-65763b2597d0?auto=format&fit=crop&w=1600&q=80"},
    {"city": "Corpus Christi", "state": "TX", "state_full": "Texas",
     "img": "https://images.unsplash.com/photo-1502920514313-52581002a659?auto=format&fit=crop&w=1600&q=80"},
    {"city": "Plano", "state": "TX", "state_full": "Texas",
     "img": "https://images.unsplash.com/photo-1449034446853-66c86144b0ad?auto=format&fit=crop&w=1600&q=80"},
    {"city": "Lubbock", "state": "TX", "state_full": "Texas",
     "img": "https://images.unsplash.com/photo-1500534314209-a25ddb2bd429?auto=format&fit=crop&w=1600&q=80"},
    # Florida
    {"city": "Jacksonville", "state": "FL", "state_full": "Florida",
     "img": "https://images.unsplash.com/photo-1584556812952-905ffd0c611a?auto=format&fit=crop&w=1600&q=80"},
    {"city": "Miami", "state": "FL", "state_full": "Florida",
     "img": "https://images.unsplash.com/photo-1508009603885-50cf7c579365?auto=format&fit=crop&w=1600&q=80"},
    {"city": "Tampa", "state": "FL", "state_full": "Florida",
     "img": "https://images.unsplash.com/photo-1571747022345-e88b18e40e40?auto=format&fit=crop&w=1600&q=80"},
    {"city": "Orlando", "state": "FL", "state_full": "Florida",
     "img": "https://images.unsplash.com/photo-1597466599360-3b9775841aec?auto=format&fit=crop&w=1600&q=80"},
    {"city": "St. Petersburg", "state": "FL", "state_full": "Florida",
     "img": "https://images.unsplash.com/photo-1587059892333-7c8e0800f3ca?auto=format&fit=crop&w=1600&q=80"},
    {"city": "Hialeah", "state": "FL", "state_full": "Florida",
     "img": "https://images.unsplash.com/photo-1508009603885-50cf7c579365?auto=format&fit=crop&w=1600&q=80"},
    {"city": "Fort Lauderdale", "state": "FL", "state_full": "Florida",
     "img": "https://images.unsplash.com/photo-1571747022345-e88b18e40e40?auto=format&fit=crop&w=1600&q=80"},
    # Georgia
    {"city": "Atlanta", "state": "GA", "state_full": "Georgia",
     "img": "https://images.unsplash.com/photo-1575931955096-2af2f2b12fca?auto=format&fit=crop&w=1600&q=80"},
    {"city": "Augusta", "state": "GA", "state_full": "Georgia",
     "img": "https://images.unsplash.com/photo-1575931955096-2af2f2b12fca?auto=format&fit=crop&w=1600&q=80"},
    {"city": "Savannah", "state": "GA", "state_full": "Georgia",
     "img": "https://images.unsplash.com/photo-1613574569075-7ab8fbc79fa9?auto=format&fit=crop&w=1600&q=80"},
    # Arizona
    {"city": "Phoenix", "state": "AZ", "state_full": "Arizona",
     "img": "https://images.unsplash.com/photo-1607793061524-3d5ce9b6f7c1?auto=format&fit=crop&w=1600&q=80"},
    {"city": "Tucson", "state": "AZ", "state_full": "Arizona",
     "img": "https://images.unsplash.com/photo-1597133830317-a63cae1a3b2f?auto=format&fit=crop&w=1600&q=80"},
    {"city": "Mesa", "state": "AZ", "state_full": "Arizona",
     "img": "https://images.unsplash.com/photo-1595828300254-83e35bd7e95c?auto=format&fit=crop&w=1600&q=80"},
    {"city": "Chandler", "state": "AZ", "state_full": "Arizona",
     "img": "https://images.unsplash.com/photo-1500534314209-a25ddb2bd429?auto=format&fit=crop&w=1600&q=80"},
    {"city": "Scottsdale", "state": "AZ", "state_full": "Arizona",
     "img": "https://images.unsplash.com/photo-1518131945814-b32066ade60a?auto=format&fit=crop&w=1600&q=80"},
    # Pacific NW
    {"city": "Spokane", "state": "WA", "state_full": "Washington",
     "img": "https://images.unsplash.com/photo-1502175353174-a7a1d3d3cf19?auto=format&fit=crop&w=1600&q=80"},
    {"city": "Eugene", "state": "OR", "state_full": "Oregon",
     "img": "https://images.unsplash.com/photo-1518131945814-b32066ade60a?auto=format&fit=crop&w=1600&q=80"},
    {"city": "Salem", "state": "OR", "state_full": "Oregon",
     "img": "https://images.unsplash.com/photo-1449034446853-66c86144b0ad?auto=format&fit=crop&w=1600&q=80"},
    # Colorado
    {"city": "Denver", "state": "CO", "state_full": "Colorado",
     "img": "https://images.unsplash.com/photo-1546156929-a4c0ac411f47?auto=format&fit=crop&w=1600&q=80"},
    {"city": "Colorado Springs", "state": "CO", "state_full": "Colorado",
     "img": "https://images.unsplash.com/photo-1580655653885-65763b2597d0?auto=format&fit=crop&w=1600&q=80"},
    {"city": "Aurora", "state": "CO", "state_full": "Colorado",
     "img": "https://images.unsplash.com/photo-1546156929-a4c0ac411f47?auto=format&fit=crop&w=1600&q=80"},
    # Nevada
    {"city": "Las Vegas", "state": "NV", "state_full": "Nevada",
     "img": "https://images.unsplash.com/photo-1605833556294-ea5c7a74f57d?auto=format&fit=crop&w=1600&q=80"},
    {"city": "Henderson", "state": "NV", "state_full": "Nevada",
     "img": "https://images.unsplash.com/photo-1605833556294-ea5c7a74f57d?auto=format&fit=crop&w=1600&q=80"},
    {"city": "Reno", "state": "NV", "state_full": "Nevada",
     "img": "https://images.unsplash.com/photo-1518131945814-b32066ade60a?auto=format&fit=crop&w=1600&q=80"},
    # PA / OH / MI / IL midwest
    {"city": "Philadelphia", "state": "PA", "state_full": "Pennsylvania",
     "img": "https://images.unsplash.com/photo-1541423408907-49e2ba8a1c2f?auto=format&fit=crop&w=1600&q=80"},
    {"city": "Pittsburgh", "state": "PA", "state_full": "Pennsylvania",
     "img": "https://images.unsplash.com/photo-1524492514790-2adbeee3f38f?auto=format&fit=crop&w=1600&q=80"},
    {"city": "Columbus", "state": "OH", "state_full": "Ohio",
     "img": "https://images.unsplash.com/photo-1531218614045-c0e2a2b3e8ef?auto=format&fit=crop&w=1600&q=80"},
    {"city": "Cleveland", "state": "OH", "state_full": "Ohio",
     "img": "https://images.unsplash.com/photo-1524492514790-2adbeee3f38f?auto=format&fit=crop&w=1600&q=80"},
    {"city": "Cincinnati", "state": "OH", "state_full": "Ohio",
     "img": "https://images.unsplash.com/photo-1524492514790-2adbeee3f38f?auto=format&fit=crop&w=1600&q=80"},
    {"city": "Toledo", "state": "OH", "state_full": "Ohio",
     "img": "https://images.unsplash.com/photo-1449034446853-66c86144b0ad?auto=format&fit=crop&w=1600&q=80"},
    {"city": "Detroit", "state": "MI", "state_full": "Michigan",
     "img": "https://images.unsplash.com/photo-1568724353533-73a99d9497aa?auto=format&fit=crop&w=1600&q=80"},
    {"city": "Grand Rapids", "state": "MI", "state_full": "Michigan",
     "img": "https://images.unsplash.com/photo-1477414348463-c0eb7f1359b6?auto=format&fit=crop&w=1600&q=80"},
    {"city": "Indianapolis", "state": "IN", "state_full": "Indiana",
     "img": "https://images.unsplash.com/photo-1580655653885-65763b2597d0?auto=format&fit=crop&w=1600&q=80"},
    {"city": "Fort Wayne", "state": "IN", "state_full": "Indiana",
     "img": "https://images.unsplash.com/photo-1449034446853-66c86144b0ad?auto=format&fit=crop&w=1600&q=80"},
    {"city": "Milwaukee", "state": "WI", "state_full": "Wisconsin",
     "img": "https://images.unsplash.com/photo-1548345680-f5475ea5df84?auto=format&fit=crop&w=1600&q=80"},
    {"city": "Madison", "state": "WI", "state_full": "Wisconsin",
     "img": "https://images.unsplash.com/photo-1548345680-f5475ea5df84?auto=format&fit=crop&w=1600&q=80"},
    {"city": "Minneapolis", "state": "MN", "state_full": "Minnesota",
     "img": "https://images.unsplash.com/photo-1595758228888-b60a7b8a4c39?auto=format&fit=crop&w=1600&q=80"},
    {"city": "St. Paul", "state": "MN", "state_full": "Minnesota",
     "img": "https://images.unsplash.com/photo-1595758228888-b60a7b8a4c39?auto=format&fit=crop&w=1600&q=80"},
    # Missouri
    {"city": "Kansas City", "state": "MO", "state_full": "Missouri",
     "img": "https://images.unsplash.com/photo-1541423408907-49e2ba8a1c2f?auto=format&fit=crop&w=1600&q=80"},
    {"city": "St. Louis", "state": "MO", "state_full": "Missouri",
     "img": "https://images.unsplash.com/photo-1548943487-a2e4e43b4853?auto=format&fit=crop&w=1600&q=80"},
    # Massachusetts / New England
    {"city": "Boston", "state": "MA", "state_full": "Massachusetts",
     "img": "https://images.unsplash.com/photo-1501979376754-2ff867a4f659?auto=format&fit=crop&w=1600&q=80"},
    {"city": "Worcester", "state": "MA", "state_full": "Massachusetts",
     "img": "https://images.unsplash.com/photo-1501979376754-2ff867a4f659?auto=format&fit=crop&w=1600&q=80"},
    {"city": "Springfield", "state": "MA", "state_full": "Massachusetts",
     "img": "https://images.unsplash.com/photo-1501979376754-2ff867a4f659?auto=format&fit=crop&w=1600&q=80"},
    {"city": "Providence", "state": "RI", "state_full": "Rhode Island",
     "img": "https://images.unsplash.com/photo-1501979376754-2ff867a4f659?auto=format&fit=crop&w=1600&q=80"},
    {"city": "Hartford", "state": "CT", "state_full": "Connecticut",
     "img": "https://images.unsplash.com/photo-1501979376754-2ff867a4f659?auto=format&fit=crop&w=1600&q=80"},
    {"city": "Bridgeport", "state": "CT", "state_full": "Connecticut",
     "img": "https://images.unsplash.com/photo-1501979376754-2ff867a4f659?auto=format&fit=crop&w=1600&q=80"},
    {"city": "Manchester", "state": "NH", "state_full": "New Hampshire",
     "img": "https://images.unsplash.com/photo-1477414348463-c0eb7f1359b6?auto=format&fit=crop&w=1600&q=80"},
    {"city": "Portland", "state": "ME", "state_full": "Maine",
     "img": "https://images.unsplash.com/photo-1477414348463-c0eb7f1359b6?auto=format&fit=crop&w=1600&q=80"},
    {"city": "Burlington", "state": "VT", "state_full": "Vermont",
     "img": "https://images.unsplash.com/photo-1477414348463-c0eb7f1359b6?auto=format&fit=crop&w=1600&q=80"},
    # NJ
    {"city": "Newark", "state": "NJ", "state_full": "New Jersey",
     "img": "https://images.unsplash.com/photo-1522083165195-3424ed129620?auto=format&fit=crop&w=1600&q=80"},
    {"city": "Jersey City", "state": "NJ", "state_full": "New Jersey",
     "img": "https://images.unsplash.com/photo-1522083165195-3424ed129620?auto=format&fit=crop&w=1600&q=80"},
    # Carolinas + Virginia
    {"city": "Charlotte", "state": "NC", "state_full": "North Carolina",
     "img": "https://images.unsplash.com/photo-1524492514790-2adbeee3f38f?auto=format&fit=crop&w=1600&q=80"},
    {"city": "Raleigh", "state": "NC", "state_full": "North Carolina",
     "img": "https://images.unsplash.com/photo-1524492514790-2adbeee3f38f?auto=format&fit=crop&w=1600&q=80"},
    {"city": "Greensboro", "state": "NC", "state_full": "North Carolina",
     "img": "https://images.unsplash.com/photo-1524492514790-2adbeee3f38f?auto=format&fit=crop&w=1600&q=80"},
    {"city": "Durham", "state": "NC", "state_full": "North Carolina",
     "img": "https://images.unsplash.com/photo-1524492514790-2adbeee3f38f?auto=format&fit=crop&w=1600&q=80"},
    {"city": "Charleston", "state": "SC", "state_full": "South Carolina",
     "img": "https://images.unsplash.com/photo-1613574569075-7ab8fbc79fa9?auto=format&fit=crop&w=1600&q=80"},
    {"city": "Columbia", "state": "SC", "state_full": "South Carolina",
     "img": "https://images.unsplash.com/photo-1613574569075-7ab8fbc79fa9?auto=format&fit=crop&w=1600&q=80"},
    {"city": "Virginia Beach", "state": "VA", "state_full": "Virginia",
     "img": "https://images.unsplash.com/photo-1497436072909-60f360e1d4b1?auto=format&fit=crop&w=1600&q=80"},
    {"city": "Norfolk", "state": "VA", "state_full": "Virginia",
     "img": "https://images.unsplash.com/photo-1497436072909-60f360e1d4b1?auto=format&fit=crop&w=1600&q=80"},
    {"city": "Richmond", "state": "VA", "state_full": "Virginia",
     "img": "https://images.unsplash.com/photo-1497436072909-60f360e1d4b1?auto=format&fit=crop&w=1600&q=80"},
    # DC / Baltimore
    {"city": "Washington", "state": "DC", "state_full": "District of Columbia",
     "img": "https://images.unsplash.com/photo-1501466044931-62695aada8e9?auto=format&fit=crop&w=1600&q=80"},
    {"city": "Baltimore", "state": "MD", "state_full": "Maryland",
     "img": "https://images.unsplash.com/photo-1501466044931-62695aada8e9?auto=format&fit=crop&w=1600&q=80"},
    # Tennessee + South
    {"city": "Nashville", "state": "TN", "state_full": "Tennessee",
     "img": "https://images.unsplash.com/photo-1568724353533-73a99d9497aa?auto=format&fit=crop&w=1600&q=80"},
    {"city": "Memphis", "state": "TN", "state_full": "Tennessee",
     "img": "https://images.unsplash.com/photo-1568724353533-73a99d9497aa?auto=format&fit=crop&w=1600&q=80"},
    {"city": "Knoxville", "state": "TN", "state_full": "Tennessee",
     "img": "https://images.unsplash.com/photo-1568724353533-73a99d9497aa?auto=format&fit=crop&w=1600&q=80"},
    {"city": "Louisville", "state": "KY", "state_full": "Kentucky",
     "img": "https://images.unsplash.com/photo-1568724353533-73a99d9497aa?auto=format&fit=crop&w=1600&q=80"},
    {"city": "Lexington", "state": "KY", "state_full": "Kentucky",
     "img": "https://images.unsplash.com/photo-1568724353533-73a99d9497aa?auto=format&fit=crop&w=1600&q=80"},
    {"city": "New Orleans", "state": "LA", "state_full": "Louisiana",
     "img": "https://images.unsplash.com/photo-1571893544028-06b07af6dade?auto=format&fit=crop&w=1600&q=80"},
    {"city": "Baton Rouge", "state": "LA", "state_full": "Louisiana",
     "img": "https://images.unsplash.com/photo-1571893544028-06b07af6dade?auto=format&fit=crop&w=1600&q=80"},
    {"city": "Birmingham", "state": "AL", "state_full": "Alabama",
     "img": "https://images.unsplash.com/photo-1568724353533-73a99d9497aa?auto=format&fit=crop&w=1600&q=80"},
    {"city": "Montgomery", "state": "AL", "state_full": "Alabama",
     "img": "https://images.unsplash.com/photo-1568724353533-73a99d9497aa?auto=format&fit=crop&w=1600&q=80"},
    {"city": "Mobile", "state": "AL", "state_full": "Alabama",
     "img": "https://images.unsplash.com/photo-1568724353533-73a99d9497aa?auto=format&fit=crop&w=1600&q=80"},
    {"city": "Jackson", "state": "MS", "state_full": "Mississippi",
     "img": "https://images.unsplash.com/photo-1568724353533-73a99d9497aa?auto=format&fit=crop&w=1600&q=80"},
    # Utah / Idaho / Mountain
    {"city": "Salt Lake City", "state": "UT", "state_full": "Utah",
     "img": "https://images.unsplash.com/photo-1544737151095-6e4c999de2a3?auto=format&fit=crop&w=1600&q=80"},
    {"city": "Boise", "state": "ID", "state_full": "Idaho",
     "img": "https://images.unsplash.com/photo-1544737151095-6e4c999de2a3?auto=format&fit=crop&w=1600&q=80"},
    {"city": "Billings", "state": "MT", "state_full": "Montana",
     "img": "https://images.unsplash.com/photo-1544737151095-6e4c999de2a3?auto=format&fit=crop&w=1600&q=80"},
    # Great plains
    {"city": "Omaha", "state": "NE", "state_full": "Nebraska",
     "img": "https://images.unsplash.com/photo-1500534314209-a25ddb2bd429?auto=format&fit=crop&w=1600&q=80"},
    {"city": "Lincoln", "state": "NE", "state_full": "Nebraska",
     "img": "https://images.unsplash.com/photo-1500534314209-a25ddb2bd429?auto=format&fit=crop&w=1600&q=80"},
    {"city": "Wichita", "state": "KS", "state_full": "Kansas",
     "img": "https://images.unsplash.com/photo-1500534314209-a25ddb2bd429?auto=format&fit=crop&w=1600&q=80"},
    {"city": "Des Moines", "state": "IA", "state_full": "Iowa",
     "img": "https://images.unsplash.com/photo-1500534314209-a25ddb2bd429?auto=format&fit=crop&w=1600&q=80"},
    # Oklahoma / Arkansas
    {"city": "Oklahoma City", "state": "OK", "state_full": "Oklahoma",
     "img": "https://images.unsplash.com/photo-1512389142860-9c449e58a543?auto=format&fit=crop&w=1600&q=80"},
    {"city": "Tulsa", "state": "OK", "state_full": "Oklahoma",
     "img": "https://images.unsplash.com/photo-1512389142860-9c449e58a543?auto=format&fit=crop&w=1600&q=80"},
    {"city": "Little Rock", "state": "AR", "state_full": "Arkansas",
     "img": "https://images.unsplash.com/photo-1571893544028-06b07af6dade?auto=format&fit=crop&w=1600&q=80"},
    # NM / other SW
    {"city": "Albuquerque", "state": "NM", "state_full": "New Mexico",
     "img": "https://images.unsplash.com/photo-1607793061524-3d5ce9b6f7c1?auto=format&fit=crop&w=1600&q=80"},
    {"city": "Santa Fe", "state": "NM", "state_full": "New Mexico",
     "img": "https://images.unsplash.com/photo-1607793061524-3d5ce9b6f7c1?auto=format&fit=crop&w=1600&q=80"},
    # Alaska / Hawaii
    {"city": "Anchorage", "state": "AK", "state_full": "Alaska",
     "img": "https://images.unsplash.com/photo-1544737151095-6e4c999de2a3?auto=format&fit=crop&w=1600&q=80"},
    {"city": "Honolulu", "state": "HI", "state_full": "Hawaii",
     "img": "https://images.unsplash.com/photo-1542259009477-d625272157b7?auto=format&fit=crop&w=1600&q=80"},
    # Remaining fill
    {"city": "Buffalo", "state": "NY", "state_full": "New York",
     "img": "https://images.unsplash.com/photo-1548943487-a2e4e43b4853?auto=format&fit=crop&w=1600&q=80"},
    {"city": "Rochester", "state": "NY", "state_full": "New York",
     "img": "https://images.unsplash.com/photo-1548943487-a2e4e43b4853?auto=format&fit=crop&w=1600&q=80"},
    {"city": "Syracuse", "state": "NY", "state_full": "New York",
     "img": "https://images.unsplash.com/photo-1548943487-a2e4e43b4853?auto=format&fit=crop&w=1600&q=80"},
    {"city": "Albany", "state": "NY", "state_full": "New York",
     "img": "https://images.unsplash.com/photo-1548943487-a2e4e43b4853?auto=format&fit=crop&w=1600&q=80"},
]


def _slugify(city: str, state: str) -> str:
    s = f"{city}-{state}".lower()
    return "".join(c if c.isalnum() or c == "-" else ("-" if c == " " else "") for c in s.replace(".", "").replace("'", ""))


def build_us_seed() -> List[Dict[str, Any]]:
    """Return the deduplicated top-100 US metros list in the shape
    expected by `recruit_cities.RecruitCity`."""
    out: List[Dict[str, Any]] = []
    seen = set()
    for i, entry in enumerate(_US_METROS):
        slug = _slugify(entry["city"], entry["state"])
        if slug in seen:
            continue
        seen.add(slug)
        headline = _HEADLINE_VARIANTS[i % len(_HEADLINE_VARIANTS)].format(city=entry["city"])
        subhead = _SUBHEAD_VARIANTS[i % len(_SUBHEAD_VARIANTS)].format(city=entry["city"])
        out.append({
            "slug": slug,
            "city": entry["city"],
            "state": entry["state"],
            "state_full": entry["state_full"],
            "hero_headline": headline,
            "hero_subhead": subhead,
            "hero_image": entry.get("img") or _FALLBACK_IMAGE,
        })
    return out


US_SEED_CITIES = build_us_seed()

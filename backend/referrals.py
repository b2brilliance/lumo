"""
Lumo referral engine.

Every user gets a short `referral_code` at signup. Anyone who signs up
with `?ref=<code>` (or explicitly passes `ref_code` to /auth/register)
is tagged with `referred_by_user_id`.

When a provider earns money on a paid job/order, the platform pockets a
10% commission. `credit_referrer()` splits **1% of that commission**
(= 0.1% of gross, = amount / 900 of the provider's take) into the
referrer's Lumo wallet AND logs a `referral_earnings` row for the
transparent /api/referrals/me stats endpoint.

Wired into `_credit_provider()` in server.py, so it fires on every
payout path (escrow release, Stripe Connect transfer, and the simulated
wallet fallback).
"""
from __future__ import annotations

import os
import secrets
import string
import uuid
from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field

CODE_ALPHABET = string.ascii_uppercase + string.digits
# Excluding easily-confused characters keeps referral URLs typable IRL.
CODE_ALPHABET = CODE_ALPHABET.translate(str.maketrans("", "", "0O1I"))


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def generate_code(length: int = 6) -> str:
    """Return a short human-friendly referral code, e.g. `X3K9AB`."""
    return "".join(secrets.choice(CODE_ALPHABET) for _ in range(length))


async def ensure_referral_code(db, user_id: str) -> str:
    """Return this user's referral code, generating + persisting one if
    they don't yet have one. Idempotent — safe to call on every request.
    """
    doc = await db.users.find_one({"id": user_id}, {"_id": 0, "referral_code": 1})
    if doc and doc.get("referral_code"):
        return doc["referral_code"]
    # Retry a few times on the astronomically-unlikely collision.
    for _ in range(6):
        code = generate_code()
        existing = await db.users.find_one({"referral_code": code}, {"_id": 1})
        if not existing:
            await db.users.update_one({"id": user_id}, {"$set": {"referral_code": code}})
            return code
    # Last-ditch — 12 chars, effectively unique.
    code = generate_code(12)
    await db.users.update_one({"id": user_id}, {"$set": {"referral_code": code}})
    return code


async def apply_signup_attribution(db, user_doc: dict, *, ref_code: Optional[str] = None,
                                   signup_source: Optional[dict] = None, recruit_city_slug: Optional[str] = None) -> None:
    """Tag a brand-new user doc (before insert) with recruiter, UTM source and recruit city."""
    from attribution import clean_source
    referred_by = await resolve_ref_code(db, ref_code)
    if referred_by and referred_by != user_doc.get("id"):
        user_doc["referred_by_user_id"] = referred_by
        user_doc["referred_by_code"] = (ref_code or "").strip().upper()
    src = clean_source(signup_source)
    if src:
        user_doc["signup_source"] = src
    slug = (recruit_city_slug or "").strip().lower()
    if not slug and src and (src.get("landing_path") or "").startswith("/join/"):
        slug = src["landing_path"].split("/")[2]
    if slug:
        city = await db.recruit_cities.find_one({"slug": slug}, {"_id": 0, "slug": 1, "state": 1, "country": 1})
        if city:
            user_doc["recruit_city_slug"] = city["slug"]
            user_doc["recruit_state"] = city.get("state")
            user_doc["recruit_country"] = city.get("country") or "US"


async def resolve_ref_code(db, ref_code: Optional[str]) -> Optional[str]:
    """Return the user_id whose referral_code matches, or None."""
    if not ref_code:
        return None
    ref_code = ref_code.strip().upper()
    if not ref_code:
        return None
    u = await db.users.find_one({"referral_code": ref_code}, {"_id": 0, "id": 1})
    return u["id"] if u else None


# ── Referral payout ────────────────────────────────────────────────────
# The provider's net take is 90% of gross (platform keeps 10% commission).
# We reward the referrer with 10% of that commission → 1% of gross → about
# 1.11% of the provider's take. Simple algebra:
#   gross      = provider_amount / 0.90
#   commission = gross * 0.10
#   payout     = commission * 0.10 = provider_amount * (10/9) * 0.10 * 0.10
#              = provider_amount / 90
#
# Concrete: a $100 gross job → platform earns $10 commission → referrer
# gets $1 (= referred provider's $90 take / 90).
PROVIDER_TAKE_TO_REFERRER_RATIO = 1.0 / 90.0
PLATFORM_COMMISSION = 0.10

# Tiered recruiter rate: % of each job's gross price, funded from Lumo's cut.
DEFAULT_PROGRAM = {"base_pct": 0.10, "step_pct": 0.01, "step_jobs": 1000, "max_pct": 0.99}


async def get_program(db) -> dict:
    doc = await db.recruiter_program.find_one({"id": "config"}, {"_id": 0, "id": 0}) or {}
    return {**DEFAULT_PROGRAM, **doc}


def rate_for(total_jobs: int, cfg: dict) -> float:
    """Return the recruiter rate in PERCENT for a given lifetime recruit-job count."""
    steps = int(total_jobs) // max(1, int(cfg["step_jobs"]))
    return round(min(cfg["base_pct"] + steps * cfg["step_pct"], cfg["max_pct"]), 4)


def tier_info(total_jobs: int, cfg: dict) -> dict:
    rate = rate_for(total_jobs, cfg)
    step = max(1, int(cfg["step_jobs"]))
    level = total_jobs // step
    at_max = rate >= cfg["max_pct"]
    next_at = None if at_max else (level + 1) * step
    return {
        "total_recruit_jobs": total_jobs,
        "level": level + 1,
        "rate_pct": rate,
        "next_rate_pct": None if at_max else rate_for(next_at, cfg),
        "next_at_jobs": next_at,
        "jobs_to_next": None if at_max else next_at - total_jobs,
        "progress_pct": 100 if at_max else round((total_jobs - level * step) / step * 100, 1),
        "at_max": at_max,
        "program": cfg,
    }


async def credit_referrer(
    db,
    *,
    provider_id: str,
    provider_amount: float,
    source_type: str,
    source_id: Optional[str] = None,
    notify: bool = True,
) -> Optional[dict]:
    """If the paying provider was referred by someone, credit that
    referrer's wallet with 1% of platform commission and log the event.

    Returns the created `referral_earnings` record (or None if the
    provider has no referrer / amount is negligible).
    """
    if not provider_id or provider_amount <= 0:
        return None
    provider = await db.users.find_one(
        {"id": provider_id},
        {"_id": 0, "referred_by_user_id": 1},
    )
    if not provider:
        return None
    referrer_id = provider.get("referred_by_user_id")
    if not referrer_id:
        return None

    cfg = await get_program(db)
    prior_jobs = await db.referral_earnings.count_documents({"referrer_user_id": referrer_id})
    rate_pct = rate_for(prior_jobs, cfg)
    gross = provider_amount / (1 - PLATFORM_COMMISSION)
    amount = round(gross * rate_pct / 100, 4)
    now = _now_iso()
    record = {
        "id": str(uuid.uuid4()),
        "referrer_user_id": referrer_id,
        "source_user_id": provider_id,
        "source_type": source_type,   # "job" | "order" | "escrow"
        "source_id": source_id,
        "provider_amount": provider_amount,
        "gross_amount": round(gross, 2),
        "rate_pct": rate_pct,
        "amount": amount,
        "created_at": now,
    }
    await db.referral_earnings.insert_one(record)
    await db.users.update_one({"id": referrer_id}, {"$inc": {"wallet_balance": amount}})
    await db.wallet_transactions.insert_one({
        "id": str(uuid.uuid4()),
        "user_id": referrer_id,
        "amount": amount,
        "type": "credit",
        "reason": f"Referral bonus ({source_type})",
        "ref_id": record["id"],
        "ref_kind": "referral",
        "created_at": now,
    })
    if notify:
        try:
            await db.notifications.insert_one({
                "id": str(uuid.uuid4()),
                "user_id": referrer_id,
                "type": "referral_earned",
                "title": f"You earned ${amount:.2f} 🎉",
                "body": (
                    "One of your referrals just completed a paid job. "
                    "You'll keep earning every time they work."
                ),
                "link": "/wallet",
                "read": False,
                "created_at": now,
            })
        except Exception:
            pass
    return record


# ── Provider referral milestone bonus (one-time $25 at job #10) ──────
# When a REFERRED PROVIDER completes their 10th paid job (payout event),
# their referrer gets a flat $25 milestone bonus on top of the running
# per-job commission split above. Fires at most once per referred
# provider — tracked by setting `milestone_10_awarded_at` on their user
# record before crediting.
BADGE_TIERS = ("gold", "silver", "bronze")
PRIZES = (100.0, 50.0, 25.0)
PROVIDER_MILESTONE_JOBS = 10
PROVIDER_MILESTONE_BONUS = 25.00


async def credit_referrer_milestone(
    db,
    *,
    provider_id: str,
) -> Optional[dict]:
    """If `provider_id` was referred, is a provider, has just crossed
    PROVIDER_MILESTONE_JOBS paid completions, and hasn't been paid the
    milestone bonus yet — credit their referrer's wallet with a flat
    PROVIDER_MILESTONE_BONUS and log a `referral_milestone` record.

    Returns the created record or None.
    """
    if not provider_id:
        return None
    prov = await db.users.find_one(
        {"id": provider_id},
        {"_id": 0, "role": 1, "referred_by_user_id": 1, "milestone_10_awarded_at": 1},
    )
    if not prov or prov.get("role") != "provider":
        return None
    referrer_id = prov.get("referred_by_user_id")
    if not referrer_id:
        return None
    if prov.get("milestone_10_awarded_at"):
        return None  # already paid

    # Count paid payout events for this provider. Any credit-type wallet
    # transaction with ref_kind != 'referral' counts (job or escrow).
    count = await db.wallet_transactions.count_documents({
        "user_id": provider_id,
        "type": {"$in": ["credit", "stripe_payout"]},
        "ref_kind": {"$nin": ["referral", None]},
    })
    if count < PROVIDER_MILESTONE_JOBS:
        return None

    now = _now_iso()
    # Guard: atomic set-if-absent so concurrent payouts don't double-pay.
    res = await db.users.update_one(
        {"id": provider_id, "milestone_10_awarded_at": {"$exists": False}},
        {"$set": {"milestone_10_awarded_at": now}},
    )
    if res.modified_count == 0:
        return None  # someone else got there first

    record = {
        "id": str(uuid.uuid4()),
        "referrer_user_id": referrer_id,
        "source_user_id": provider_id,
        "source_type": "provider_milestone_10",
        "amount": PROVIDER_MILESTONE_BONUS,
        "jobs_completed": count,
        "created_at": now,
    }
    await db.referral_milestones.insert_one(record)
    await db.users.update_one(
        {"id": referrer_id},
        {"$inc": {"wallet_balance": PROVIDER_MILESTONE_BONUS}},
    )
    await db.wallet_transactions.insert_one({
        "id": str(uuid.uuid4()),
        "user_id": referrer_id,
        "amount": PROVIDER_MILESTONE_BONUS,
        "type": "credit",
        "reason": f"Referral milestone — provider completed {PROVIDER_MILESTONE_JOBS} jobs",
        "ref_id": record["id"],
        "ref_kind": "referral_milestone",
        "created_at": now,
    })
    try:
        await db.notifications.insert_one({
            "id": str(uuid.uuid4()),
            "user_id": referrer_id,
            "type": "referral_milestone",
            "title": f"You just earned ${PROVIDER_MILESTONE_BONUS:.0f} 🚀",
            "body": (
                f"A provider you referred just completed their {PROVIDER_MILESTONE_JOBS}th job on Lumo. "
                "Nice work — keep inviting more."
            ),
            "link": "/wallet",
            "read": False,
            "created_at": now,
        })
    except Exception:
        pass
    return record


class ProgramUpdate(BaseModel):
    base_pct: Optional[float] = Field(default=None, ge=0, lt=1)
    step_pct: Optional[float] = Field(default=None, ge=0, lt=1)
    max_pct: Optional[float] = Field(default=None, ge=0, lt=1)
    step_jobs: Optional[int] = Field(default=None, ge=1, strict=True)


# ── Router ─────────────────────────────────────────────────────────────
def create_router(*, db, get_current_user, require_admin=None):
    r = APIRouter(prefix="/referrals", tags=["referrals"])

    def _month_range(month: Optional[str]):
        now = datetime.now(timezone.utc)
        try:
            y, m = (int(x) for x in (month or now.strftime("%Y-%m")).split("-"))
            start = datetime(y, m, 1, tzinfo=timezone.utc)
        except ValueError:
            raise HTTPException(400, "month must be YYYY-MM")
        return start, datetime(y + (m == 12), m % 12 + 1, 1, tzinfo=timezone.utc)

    async def _activations(start: datetime, end: datetime) -> dict:
        """Recruits whose FIRST completed job or sale happened in [start, end), counted per recruiter."""
        first: dict = {}
        async for x in db.referral_earnings.aggregate([{"$group": {"_id": "$source_user_id", "t": {"$min": "$created_at"}}}]):
            first[x["_id"]] = x["t"]
        async for x in db.orders.aggregate([
                {"$match": {"is_cart_order": True, "status": {"$in": ["paid", "deposit_paid", "in_progress", "completed"]}}},
                {"$group": {"_id": "$store_id", "t": {"$min": "$paid_at"}}}]):
            if x["t"] and (x["_id"] not in first or x["t"] < first[x["_id"]]):
                first[x["_id"]] = x["t"]
        lo, hi = start.isoformat(), end.isoformat()
        ids = [uid for uid, t in first.items() if t and lo <= t < hi]
        out: dict = {}
        async for u in db.users.find({"id": {"$in": ids}, "referred_by_user_id": {"$ne": None}, "is_demo": {"$ne": True}},
                                     {"_id": 0, "referred_by_user_id": 1}):
            out[u["referred_by_user_id"]] = out.get(u["referred_by_user_id"], 0) + 1
        return out

    async def _board(start: datetime, end: datetime) -> list:
        rng = {"$gte": start.isoformat(), "$lt": end.isoformat()}
        jobs = {x["_id"]: x["n"] for x in await db.referral_earnings.aggregate([
            {"$match": {"created_at": rng}}, {"$group": {"_id": "$referrer_user_id", "n": {"$sum": 1}}}]).to_list(None)}
        recs = {x["_id"]: x["n"] for x in await db.users.aggregate([
            {"$match": {"referred_by_user_id": {"$exists": True, "$ne": None}, "created_at": rng, "is_demo": {"$ne": True}}},
            {"$group": {"_id": "$referred_by_user_id", "n": {"$sum": 1}}}]).to_list(None)}
        acts = await _activations(start, end)
        ids = list(set(jobs) | set(recs) | set(acts))
        users = {u["id"]: u async for u in db.users.find(
            {"id": {"$in": ids}, "is_demo": {"$ne": True}, "role": {"$ne": "admin"}},
            {"_id": 0, "id": 1, "name": 1, "location": 1})}
        rows = []
        for uid in ids:
            u = users.get(uid)
            if not u:
                continue
            parts = (u.get("name") or "").split() or ["Lumo", "recruiter"]
            rows.append({"name": parts[0] + (f" {parts[-1][0]}." if len(parts) > 1 else ""),
                         "jobs": jobs.get(uid, 0), "recruits": recs.get(uid, 0), "active_recruits": acts.get(uid, 0),
                         "city": (u.get("location") or {}).get("city") if isinstance(u.get("location"), dict) else None,
                         "_uid": uid})
        rows.sort(key=lambda x: (-x["active_recruits"], -x["jobs"], -x["recruits"]))
        for n, row in enumerate(rows):
            row["rank"] = n + 1
        return rows

    async def award_month(month: str) -> int:
        """Idempotently award gold/silver/bronze badges for a finished month."""
        start, end = _month_range(month)
        if end > datetime.now(timezone.utc) or await db.recruiter_badges.count_documents({"month": month}):
            return 0
        top = [x for x in await _board(start, end) if x["active_recruits"] > 0][:3]
        for row in top:
            prize = PRIZES[top.index(row)]
            tier = BADGE_TIERS[top.index(row)]
            try:
                await db.recruiter_badges.insert_one({
                    "id": str(uuid.uuid4()), "user_id": row["_uid"], "month": month, "rank": top.index(row) + 1,
                    "tier": tier, "jobs": row["jobs"], "recruits": row["recruits"], "active_recruits": row["active_recruits"],
                    "prize_amount": prize, "prize_status": "pending_approval", "created_at": _now_iso()})
            except Exception:  # noqa: BLE001 — unique (month, rank) already awarded
                continue
            await db.notifications.insert_one({
                "id": str(uuid.uuid4()), "user_id": row["_uid"], "type": "recruiter_badge",
                "title": f"You won ${prize:.0f} and a {tier.title()} recruiter badge!",
                "body": f"You finished #{top.index(row) + 1} on the {start.strftime('%B %Y')} recruiter leaderboard. Your prize lands in your wallet once it's confirmed.",
                "link": "/recruiter", "read": False, "created_at": _now_iso()})
        return len(top)

    async def _badge_counts(uids: list) -> dict:
        out: dict = {}
        async for b in db.recruiter_badges.find({"user_id": {"$in": uids}}, {"_id": 0, "user_id": 1, "tier": 1}):
            out.setdefault(b["user_id"], {"gold": 0, "silver": 0, "bronze": 0})[b["tier"]] += 1
        return out

    @r.on_event("startup")
    async def _badge_index():
        await db.recruiter_badges.create_index([("month", 1), ("rank", 1)], unique=True)

    @r.get("/leaderboard")
    async def public_leaderboard(month: Optional[str] = None, limit: int = 20):
        """Public monthly board: recruit jobs completed + new recruits this month. Names are masked."""
        start, end = _month_range(month)
        now = datetime.now(timezone.utc)
        prev = (now.replace(day=1) - timedelta(days=1)).strftime("%Y-%m")
        await award_month(prev)  # lazy month-end awarding
        if end <= now:
            await award_month(start.strftime("%Y-%m"))
        rows = await _board(start, end)
        top_rows = rows[:max(1, min(limit, 100))]
        counts = await _badge_counts([x["_uid"] for x in top_rows])
        month_badges = {b["user_id"]: b["tier"] async for b in db.recruiter_badges.find(
            {"month": start.strftime("%Y-%m")}, {"_id": 0, "user_id": 1, "tier": 1})}
        top = [{**{k: v for k, v in row.items() if k != "_uid"},
                "badges": counts.get(row["_uid"], {"gold": 0, "silver": 0, "bronze": 0}),
                "month_badge": month_badges.get(row["_uid"])} for row in top_rows]
        hall = []
        async for b in db.recruiter_badges.find({}, {"_id": 0}).sort([("month", -1), ("rank", 1)]).limit(9):
            u = await db.users.find_one({"id": b["user_id"]}, {"_id": 0, "name": 1}) or {}
            parts = (u.get("name") or "").split() or ["Lumo", "recruiter"]
            hall.append({"month": b["month"], "rank": b["rank"], "tier": b["tier"],
                         "name": parts[0] + (f" {parts[-1][0]}." if len(parts) > 1 else "")})
        return {"month": start.strftime("%Y-%m"), "rows": top, "total_recruiters": len(rows), "hall_of_fame": hall, "prizes": list(PRIZES)}

    @r.get("/my-badges")
    async def my_badges(user: dict = Depends(get_current_user)):
        return await db.recruiter_badges.find({"user_id": user["id"]}, {"_id": 0, "user_id": 0}).sort("month", -1).to_list(100)

    @r.get("/share-kit")
    async def share_kit(city: Optional[str] = None, user: dict = Depends(get_current_user)):
        code = await ensure_referral_code(db, user["id"])
        slug = city or user.get("recruit_city_slug")
        c = await db.recruit_cities.find_one({"slug": slug, "is_active": True}, {"_id": 0}) if slug else None
        if not c:
            c = await db.recruit_cities.find_one({"is_active": True}, {"_id": 0}, sort=[("population", -1)])
        if not c:
            raise HTTPException(404, "No recruiting cities available")
        origin = os.environ.get("PUBLIC_BASE_URL", "").rstrip("/")
        url = f"{origin}/join/{c['slug']}?ref={code}"
        name, bonus = c["city"], float(c.get("bonus_amount") or 100)
        posts = [
            {"key": "facebook", "label": "Facebook / LinkedIn",
             "text": (f"Looking for work in {name}? Lumo is signing up delivery drivers and local pros right now. "
                      f"Pick the jobs you want, keep 90% of every job, get paid the same day, and earn a ${bonus:.0f} "
                      f"loyalty bonus after your 100th job. Sign up with my link: {url}")},
            {"key": "whatsapp", "label": "WhatsApp / text",
             "text": f"Hey! Lumo is hiring drivers & helpers in {name}. Same-day pay, keep 90%. Join with my link: {url}"},
            {"key": "x", "label": "X / Threads",
             "text": f"Need extra income in {name}? Deliveries + local jobs on @golumo. Keep 90%, paid same day. {url}"},
            {"key": "instagram", "label": "Instagram caption",
             "text": (f"Your skills are worth more than you're being paid. 💪 Lumo is hiring in {name}: delivery, "
                      f"moving, cleaning, handyman and more. Keep 90%, same-day pay. Link in bio or DM me for my invite "
                      f"code: {code}\n\n#{name.replace(' ', '')} #hiring #sidehustle #lumo")},
        ]
        return {"code": code, "city": {"slug": c["slug"], "name": name, "country": c.get("country_name")},
                "share_url": url, "photo_url": f"{origin}/api/img/city/{c['slug']}.jpg", "posts": posts}

    @r.get("/program")
    async def program():
        cfg = await get_program(db)
        ladder = [{"jobs": i * cfg["step_jobs"], "rate_pct": rate_for(i * cfg["step_jobs"], cfg)} for i in range(6)]
        return {**cfg, "ladder": ladder,
                "milestone_bonus_amount": PROVIDER_MILESTONE_BONUS,
                "milestone_bonus_goal": PROVIDER_MILESTONE_JOBS}

    if require_admin is not None:
        @r.put("/admin/program")
        async def update_program(body: ProgramUpdate, _admin: dict = Depends(require_admin)):
            upd = body.model_dump(exclude_none=True)
            merged = {**(await get_program(db)), **upd}
            if merged["base_pct"] > merged["max_pct"]:
                raise HTTPException(400, "Starting rate can't exceed max rate")
            await db.recruiter_program.update_one({"id": "config"}, {"$set": upd}, upsert=True)
            return await get_program(db)

        @r.get("/admin/prizes")
        async def list_prizes(_admin: dict = Depends(require_admin)):
            now = datetime.now(timezone.utc)
            await award_month((now.replace(day=1) - timedelta(days=1)).strftime("%Y-%m"))
            out = []
            async for b in db.recruiter_badges.find({"prize_amount": {"$gt": 0}}, {"_id": 0}).sort([("month", -1), ("rank", 1)]).limit(60):
                u = await db.users.find_one({"id": b["user_id"]}, {"_id": 0, "name": 1, "email": 1}) or {}
                out.append({**b, "name": u.get("name"), "email": u.get("email")})
            return out

        @r.post("/admin/prizes/{badge_id}/{action}")
        async def decide_prize(badge_id: str, action: str, admin: dict = Depends(require_admin)):
            if action not in ("approve", "decline"):
                raise HTTPException(400, "Action must be approve or decline")
            new = "paid" if action == "approve" else "declined"
            b = await db.recruiter_badges.find_one_and_update(
                {"id": badge_id, "prize_status": "pending_approval"},
                {"$set": {"prize_status": new, "prize_decided_at": _now_iso(), "prize_decided_by": admin["id"]}})
            if not b:
                raise HTTPException(400, "This prize was already handled")
            if new == "paid":
                amt = float(b["prize_amount"])
                await db.users.update_one({"id": b["user_id"]}, {"$inc": {"wallet_balance": amt}})
                await db.wallet_transactions.insert_one({
                    "id": str(uuid.uuid4()), "user_id": b["user_id"], "amount": amt, "type": "credit",
                    "reason": f"Recruiter prize #{b['rank']} ({b['month']})", "ref_id": b["id"], "ref_kind": "recruiter_prize",
                    "created_at": _now_iso()})
                await db.notifications.insert_one({
                    "id": str(uuid.uuid4()), "user_id": b["user_id"], "type": "recruiter_prize_paid",
                    "title": f"${amt:.0f} recruiter prize paid!", "body": "Your prize is in your Lumo wallet. Thanks for growing Lumo.",
                    "link": "/wallet", "read": False, "created_at": _now_iso()})
            return {"ok": True, "prize_status": new}

        @r.get("/admin/leaderboard")
        async def leaderboard(_admin: dict = Depends(require_admin)):
            cfg = await get_program(db)
            rows = await db.referral_earnings.aggregate([
                {"$group": {"_id": "$referrer_user_id", "jobs": {"$sum": 1}, "earned": {"$sum": "$amount"}}},
                {"$sort": {"jobs": -1}}, {"$limit": 100},
            ]).to_list(100)
            out = []
            for row in rows:
                u = await db.users.find_one({"id": row["_id"]}, {"_id": 0, "name": 1, "email": 1}) or {}
                recruits = await db.users.count_documents({"referred_by_user_id": row["_id"]})
                out.append({"user_id": row["_id"], "name": u.get("name"), "email": u.get("email"),
                            "recruits": recruits, "recruit_jobs": row["jobs"],
                            "earned": round(row["earned"], 2), "rate_pct": rate_for(row["jobs"], cfg)})
            return out

    @r.get("/me")
    async def me(request: Request, user: dict = Depends(get_current_user)):
        """Return the caller's own referral code + running stats."""
        code = await ensure_referral_code(db, user["id"])
        # Prefer an explicit PUBLIC_BASE_URL (e.g. https://golumo.app) set at
        # deploy time. Otherwise trust X-Forwarded-Host/X-Forwarded-Proto
        # from the ingress. Fall back to `request.base_url` only as a last
        # resort — that reflects the internal cluster hostname and looks
        # ugly in copied share links.
        import os as _os
        public_base = _os.environ.get("PUBLIC_BASE_URL", "").rstrip("/")
        if not public_base:
            fwd_host = request.headers.get("x-forwarded-host") or request.headers.get("host")
            fwd_proto = request.headers.get("x-forwarded-proto") or "https"
            if fwd_host:
                public_base = f"{fwd_proto}://{fwd_host}"
            else:
                public_base = str(request.base_url).rstrip("/")
        # Strip trailing /api if the base points at the API subpath.
        if public_base.endswith("/api"):
            public_base = public_base[:-4]
        share_url = f"{public_base}/register?ref={code}"

        # Aggregates
        cur = db.referral_earnings.find({"referrer_user_id": user["id"]})
        total_earned = 0.0
        count = 0
        recent = []
        async for row in cur:
            total_earned += float(row.get("amount") or 0.0)
            count += 1
            if len(recent) < 10:
                recent.append({
                    "amount": row.get("amount"),
                    "source_type": row.get("source_type"),
                    "rate_pct": row.get("rate_pct"),
                    "created_at": row.get("created_at"),
                })

        # How many people signed up with my code (even if they haven't
        # earned yet).
        referred_users = await db.users.count_documents(
            {"referred_by_user_id": user["id"]}
        )

        # Provider recruits — per-referred-provider progress toward the
        # $25 milestone bonus at PROVIDER_MILESTONE_JOBS completed jobs.
        recruits = []
        milestone_total = 0.0
        milestone_count = 0
        cur_users = db.users.find(
            {"referred_by_user_id": user["id"], "role": "provider"},
            {"_id": 0, "id": 1, "name": 1, "avatar_url": 1, "created_at": 1, "milestone_10_awarded_at": 1},
        )
        async for u in cur_users:
            uid = u["id"]
            jobs_done = await db.wallet_transactions.count_documents({
                "user_id": uid,
                "type": {"$in": ["credit", "stripe_payout"]},
                "ref_kind": {"$nin": ["referral", None]},
            })
            recruits.append({
                "id": uid,
                "name": u.get("name") or "New provider",
                "avatar_url": u.get("avatar_url"),
                "signed_up_at": u.get("created_at"),
                "jobs_completed": jobs_done,
                "milestone_goal": PROVIDER_MILESTONE_JOBS,
                "milestone_awarded": bool(u.get("milestone_10_awarded_at")),
                "milestone_awarded_at": u.get("milestone_10_awarded_at"),
            })
            if u.get("milestone_10_awarded_at"):
                milestone_count += 1
                milestone_total += PROVIDER_MILESTONE_BONUS
        # Sort: not-yet-earned with most progress first, then already-paid
        recruits.sort(key=lambda r: (r["milestone_awarded"], -r["jobs_completed"]))

        tier = tier_info(count, await get_program(db))
        return {
            "code": code,
            "share_url": share_url,
            "tier": tier,
            "referred_users": referred_users,
            "events": count,
            "total_earned": round(total_earned, 2),
            "recent": recent,
            "recruits": recruits,
            "milestone_bonus_amount": PROVIDER_MILESTONE_BONUS,
            "milestone_bonus_goal": PROVIDER_MILESTONE_JOBS,
            "milestone_awarded_count": milestone_count,
            "milestone_total_earned": round(milestone_total, 2),
            "reward_copy": (
                f"Invite a provider — get ${PROVIDER_MILESTONE_BONUS:.0f} when they complete "
                f"their first {PROVIDER_MILESTONE_JOBS} paid jobs, plus {tier['rate_pct']}% of every "
                "job they ever do — your rate grows as your recruits complete more jobs."
            ),
        }

    return r

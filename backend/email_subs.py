"""
Email subscriptions + automatic twice-daily newsletter.

Subscribers sign up via the homepage form (POST /api/subscribe). Every day
at the configured hours (default 10:00 and 18:00 UTC), the background loop
generates a short marketing email about a different Lumo capability,
rotating through delivery/hire/rent/realestate/autos/food/etc., and sends
it to all confirmed subscribers.

Email delivery uses Resend (env: RESEND_API_KEY + RESEND_FROM). If the key
is missing, sends are *queued only* — logged to MongoDB so the admin can
see what would have gone out and plug a key in later.

Unsubscribe is single-click via a token in the email footer (no login).
"""
from __future__ import annotations

import asyncio
import logging
import os
import re
import secrets
import uuid
from datetime import datetime, timezone
from typing import Optional

import httpx
from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi.responses import HTMLResponse
from pydantic import BaseModel, EmailStr

logger = logging.getLogger("lumo.email_subs")

RESEND_API_KEY = os.environ.get("RESEND_API_KEY", "").strip()
RESEND_FROM    = os.environ.get("RESEND_FROM", "Lumo <noreply@golumo.app>").strip()
BASE_URL       = os.environ.get("PUBLIC_BASE_URL", "https://golumo.app").rstrip("/")


# ── Newsletter topic rotation ──────────────────────────────────────────────
NEWSLETTER_TOPICS = [
    {"key": "delivery", "title": "Need it today? Lumo delivers from anywhere.",
     "blurb": "Order from any retailer, restaurant, or even your neighbor — couriers in your area handle the rest. Same-day, every day.",
     "cta_label": "Order delivery", "cta_path": "/customer"},
    {"key": "hire", "title": "Hire a hand for whatever you need done.",
     "blurb": "Movers, photographers, cleaners, tutors, handymen — local pros bid on your job within minutes. Pay only when the work is done.",
     "cta_label": "Post a job", "cta_path": "/customer"},
    {"key": "earn", "title": "Make money on your own schedule with Lumo.",
     "blurb": "Drive a delivery in the morning, photograph a wedding on the weekend. Keep 90% of every dollar — half of what TaskRabbit takes.",
     "cta_label": "Start earning", "cta_path": "/provider"},
    {"key": "marketplace", "title": "Buy & sell with people nearby.",
     "blurb": "Furniture, tools, gear, gadgets — anything you can ship across town. Lumo handles delivery and escrow so no one gets burned.",
     "cta_label": "Browse marketplace", "cta_path": "/marketplaces"},
    {"key": "real_estate", "title": "Find your next place on Lumo.",
     "blurb": "Apartments, houses, rentals — listed by real people in your city. Tour with a Lumo provider, sign safely.",
     "cta_label": "Browse listings", "cta_path": "/real-estate"},
    {"key": "autos", "title": "Used car? Sell it (or find one) on Lumo.",
     "blurb": "Multi-photo listings, escrow payments, and verified buyers. Skip Craigslist's drama.",
     "cta_label": "Open autos", "cta_path": "/autos"},
    {"key": "food", "title": "Local restaurants. Lumo delivery.",
     "blurb": "Every favorite spot in town — even the ones not on DoorDash. Same-day, fair fees, real people delivering.",
     "cta_label": "Order food", "cta_path": "/restaurants"},
    {"key": "rentals", "title": "Rent it instead of buying it.",
     "blurb": "Tools, equipment, instruments, party gear — by the hour, day, or week. Lumo handles deposits via escrow.",
     "cta_label": "Browse rentals", "cta_path": "/rentals"},
    {"key": "stripe_payouts", "title": "Your money, on your schedule.",
     "blurb": "Connect your bank in one tap — Stripe pays out every job directly to your account. No platform balance, no waiting.",
     "cta_label": "Set up payouts", "cta_path": "/provider-hub"},
    {"key": "business_hire", "title": "Need help for your business?",
     "blurb": "On-demand couriers, weekend warehouse hands, recurring crews — vet on Lumo, hire on Lumo, convert to full-time when you find your people.",
     "cta_label": "Hire for your business", "cta_path": "/customer"},
]


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _is_valid_email(e: str) -> bool:
    return bool(re.match(r"^[^@\s]+@[^@\s]+\.[^@\s]+$", e or ""))


def _render_html(topic: dict, unsub_url: str) -> str:
    """Inline-styled, dark-on-light, brand-faithful email body."""
    cta_url = f"{BASE_URL}{topic['cta_path']}"
    return f"""\
<!doctype html><html><body style="margin:0;padding:0;background:#f8fafc;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:#0f172a">
<table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background:#f8fafc;padding:32px 12px">
  <tr><td align="center">
    <table role="presentation" cellpadding="0" cellspacing="0" width="560" style="background:#ffffff;border:1px solid #e2e8f0">
      <tr><td style="padding:24px 28px;border-bottom:1px solid #f1f5f9">
        <div style="display:inline-block;background:#0f172a;color:#ffffff;font-weight:900;font-size:18px;padding:6px 10px;letter-spacing:-0.5px">Lumo</div>
        <div style="font-size:11px;font-family:monospace;color:#64748b;text-transform:uppercase;letter-spacing:1.5px;margin-top:8px">Newsletter</div>
      </td></tr>
      <tr><td style="padding:28px">
        <h1 style="font-size:28px;line-height:1.15;margin:0 0 16px 0;letter-spacing:-1px;font-weight:900">{topic['title']}</h1>
        <p style="font-size:15px;line-height:1.55;color:#334155;margin:0 0 24px 0">{topic['blurb']}</p>
        <a href="{cta_url}" style="display:inline-block;background:#0f172a;color:#ffffff;text-decoration:none;padding:12px 20px;font-weight:700;font-size:14px">{topic['cta_label']} →</a>
      </td></tr>
      <tr><td style="padding:18px 28px;background:#f8fafc;border-top:1px solid #e2e8f0;font-size:11px;color:#64748b;line-height:1.5">
        Sent by Lumo · <a href="{BASE_URL}" style="color:#0f766e">{BASE_URL.replace('https://','').replace('http://','')}</a>
        <br><a href="{unsub_url}" style="color:#94a3b8">Unsubscribe</a>
      </td></tr>
    </table>
  </td></tr>
</table></body></html>"""


async def _send_email(to_addr: str, subject: str, html: str) -> tuple[bool, Optional[str]]:
    if not RESEND_API_KEY:
        return False, "no_api_key"
    try:
        async with httpx.AsyncClient(timeout=15) as client:
            r = await client.post(
                "https://api.resend.com/emails",
                headers={"Authorization": f"Bearer {RESEND_API_KEY}", "Content-Type": "application/json"},
                json={"from": RESEND_FROM, "to": [to_addr], "subject": subject, "html": html},
            )
        if r.status_code in (200, 201, 202):
            return True, (r.json().get("id") if r.headers.get("content-type", "").startswith("application/json") else None)
        return False, f"http_{r.status_code}: {r.text[:200]}"
    except Exception as e:
        return False, str(e)


# ── Pydantic ───────────────────────────────────────────────────────────────
class SubscribeBody(BaseModel):
    email: EmailStr
    source: Optional[str] = None   # e.g. "landing_footer", "blog_sidebar"


# ── Router ─────────────────────────────────────────────────────────────────
def create_router(*, db, require_admin) -> APIRouter:
    router = APIRouter(tags=["email_subs"])

    # ── Public ────────────────────────────────────────────────────────────
    @router.post("/api/subscribe")
    async def subscribe(body: SubscribeBody, request: Request):
        email = body.email.lower().strip()
        existing = await db.email_subscribers.find_one({"email": email})
        if existing:
            return {"ok": True, "already_subscribed": True, "status": existing.get("status")}
        doc = {
            "id": str(uuid.uuid4()),
            "email": email,
            "status": "active",
            "source": (body.source or "")[:60],
            "unsubscribe_token": secrets.token_urlsafe(24),
            "subscribed_at": _now_iso(),
            "ip": (request.client.host if request.client else None),
        }
        await db.email_subscribers.insert_one(doc)
        return {"ok": True, "already_subscribed": False}

    @router.get("/api/unsubscribe", response_class=HTMLResponse)
    async def unsubscribe(token: str = Query(...)):
        result = await db.email_subscribers.update_one(
            {"unsubscribe_token": token},
            {"$set": {"status": "unsubscribed", "unsubscribed_at": _now_iso()}},
        )
        ok = result.matched_count > 0
        body = (
            "<h2>You're unsubscribed.</h2><p>We won't email you again. Sorry to see you go.</p>"
            if ok else
            "<h2>Link expired.</h2><p>That unsubscribe link is no longer valid.</p>"
        )
        return HTMLResponse(f"""<!doctype html><html><body style="font-family:system-ui;max-width:520px;margin:80px auto;padding:24px;color:#0f172a"><div style="background:#0f172a;color:#fff;font-weight:900;display:inline-block;padding:4px 8px">Lumo</div>{body}<p><a href="{BASE_URL}" style="color:#0f766e">Back to Lumo</a></p></body></html>""")

    # ── Admin ─────────────────────────────────────────────────────────────
    @router.get("/api/admin/subscribers")
    async def list_subs(limit: int = Query(100, le=500), skip: int = 0,
                        status: Optional[str] = None, q: Optional[str] = None,
                        _admin: dict = Depends(require_admin)):
        flt: dict = {}
        if status: flt["status"] = status
        if q:
            flt["email"] = {"$regex": re.escape(q), "$options": "i"}
        total = await db.email_subscribers.count_documents(flt)
        cursor = db.email_subscribers.find(flt, {"_id": 0}).sort("subscribed_at", -1).skip(skip).limit(limit)
        return {"total": total, "items": [d async for d in cursor]}

    @router.get("/api/admin/subscribers/stats")
    async def stats(_admin: dict = Depends(require_admin)):
        active = await db.email_subscribers.count_documents({"status": "active"})
        unsub = await db.email_subscribers.count_documents({"status": "unsubscribed"})
        sent = await db.email_sends.count_documents({})
        last_send = await db.email_sends.find_one({}, sort=[("sent_at", -1)])
        return {
            "active": active, "unsubscribed": unsub, "total_sends": sent,
            "last_send_at": (last_send or {}).get("sent_at"),
            "resend_configured": bool(RESEND_API_KEY),
        }

    @router.post("/api/admin/subscribers/send-now")
    async def send_now(_admin: dict = Depends(require_admin)):
        return await _run_one(db, force=True)

    @router.delete("/api/admin/subscribers/{sub_id}")
    async def remove_sub(sub_id: str, _admin: dict = Depends(require_admin)):
        result = await db.email_subscribers.delete_one({"id": sub_id})
        return {"ok": True, "deleted": int(result.deleted_count)}

    return router


# ── Send-batch logic ───────────────────────────────────────────────────────
async def _pick_topic(db) -> dict:
    """Rotate through the catalog, avoiding the last 3 used keys."""
    import random
    recent = []
    async for d in db.email_sends.find({}, {"topic": 1, "_id": 0}).sort("sent_at", -1).limit(3):
        if d.get("topic"): recent.append(d["topic"])
    pool = [t for t in NEWSLETTER_TOPICS if t["key"] not in recent] or NEWSLETTER_TOPICS
    return random.choice(pool)


async def _run_one(db, force: bool = False) -> dict:
    """Send one email batch to all active subscribers."""
    topic = await _pick_topic(db)
    subs = [s async for s in db.email_subscribers.find({"status": "active"}, {"_id": 0})]
    if not subs:
        logger.info("Email batch skipped — no active subscribers.")
        return {"ok": True, "topic": topic["key"], "sent": 0, "queued": 0, "skipped_reason": "no_subscribers"}

    # ── Respect per-user marketing_emails opt-out from /settings ────────────
    # Subscribers without an account are treated as opted-in (they explicitly
    # subscribed via the homepage form). For subscribers WITH an account,
    # we honor their notification_prefs.marketing_emails toggle.
    sub_emails = [s["email"] for s in subs]
    opted_out: set = set()
    async for u in db.users.find(
        {"email": {"$in": sub_emails}, "notification_prefs.marketing_emails": False},
        {"email": 1, "_id": 0},
    ):
        opted_out.add(u["email"])
    if opted_out:
        logger.info(f"Email batch: skipping {len(opted_out)} subscribers who opted out via Settings.")

    sent_count = 0; queued_count = 0; failed_count = 0; opted_out_count = 0
    batch_id = str(uuid.uuid4())
    for sub in subs:
        if sub["email"] in opted_out:
            opted_out_count += 1
            continue
        unsub_url = f"{BASE_URL}/api/unsubscribe?token={sub['unsubscribe_token']}"
        html = _render_html(topic, unsub_url)
        ok, info = await _send_email(sub["email"], topic["title"], html)
        record = {
            "id": str(uuid.uuid4()),
            "batch_id": batch_id,
            "subscriber_id": sub["id"],
            "email": sub["email"],
            "topic": topic["key"],
            "topic_title": topic["title"],
            "delivered": bool(ok),
            "provider_id": info if ok else None,
            "error": (info if not ok else None),
            "queued_only": not ok and info == "no_api_key",
            "sent_at": _now_iso(),
        }
        await db.email_sends.insert_one(record)
        if ok: sent_count += 1
        elif info == "no_api_key": queued_count += 1
        else: failed_count += 1

    logger.info(
        f"Email batch {batch_id}: topic={topic['key']} sent={sent_count} "
        f"queued={queued_count} failed={failed_count} opted_out={opted_out_count}"
    )
    return {
        "ok": True, "batch_id": batch_id, "topic": topic["key"],
        "topic_title": topic["title"],
        "sent": sent_count, "queued": queued_count, "failed": failed_count,
        "opted_out": opted_out_count,
        "resend_configured": bool(RESEND_API_KEY),
    }


# ── Background loop ────────────────────────────────────────────────────────
async def _loop(db):
    logger.info("Email newsletter loop started.")
    while True:
        try:
            cfg = await db.email_config.find_one({"_id": "singleton"}) or {}
            if cfg.get("paused"):
                await asyncio.sleep(60 * 5)
                continue
            hours = cfg.get("schedule_hours_utc") or [10, 18]
            now = datetime.now(timezone.utc)
            window_key = None
            for h in hours:
                if now.hour == h and now.minute < 30:
                    window_key = f"{now.date().isoformat()}_{h}"
                    break
            if window_key and window_key != cfg.get("last_window_key"):
                await _run_one(db)
                await db.email_config.update_one(
                    {"_id": "singleton"},
                    {"$set": {"last_window_key": window_key, "last_run_at": _now_iso()}},
                    upsert=True,
                )
        except Exception as e:
            logger.exception(f"Email loop failed: {e}")
        await asyncio.sleep(60 * 5)


def start_email_loop(app, db):
    @app.on_event("startup")
    async def _start():
        asyncio.create_task(_loop(db))

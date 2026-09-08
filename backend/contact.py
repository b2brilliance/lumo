"""
Contact form — the /contact page's submit handler.

Every submission is:
  1. Saved to `contact_submissions` (so a lead is never lost, even without email).
  2. Emailed to OWNER_ADMIN_EMAIL (julius.a.mason@gmail.com) if RESEND_API_KEY
     is set. Failing to send an email does NOT fail the request.

Admins can browse submissions at GET /api/admin/contact.
"""
from __future__ import annotations
import asyncio
import logging
import os
import uuid
from datetime import datetime, timezone
from typing import Optional, List

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, EmailStr, Field

logger = logging.getLogger(__name__)

# Where inbound contact emails get sent. Kept as an env override so we don't
# hard-code the owner's inbox forever — mirrors OWNER_ADMIN_EMAIL by default.
CONTACT_INBOX = os.environ.get("CONTACT_INBOX", "julius.a.mason@gmail.com")

try:
    import resend  # type: ignore
except Exception:
    resend = None  # type: ignore


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


class ContactSubmit(BaseModel):
    name: str = Field(..., min_length=1, max_length=200)
    email: EmailStr
    subject: Optional[str] = Field(default=None, max_length=200)
    message: str = Field(..., min_length=5, max_length=5000)
    topic: Optional[str] = Field(default="general", max_length=50)  # general/support/press/partnership


async def _send_resend_email(*, to_email: str, subject: str, html: str, reply_to: Optional[str] = None) -> Optional[dict]:
    """Send an email via Resend if RESEND_API_KEY is configured. Non-blocking."""
    api_key = os.environ.get("RESEND_API_KEY")
    if not api_key or resend is None:
        return None
    sender = os.environ.get("SENDER_EMAIL", "onboarding@resend.dev")
    resend.api_key = api_key
    params: dict = {"from": sender, "to": [to_email], "subject": subject, "html": html}
    if reply_to:
        params["reply_to"] = reply_to
    try:
        return await asyncio.to_thread(resend.Emails.send, params)
    except Exception as e:
        logger.error(f"Resend send failed for contact form: {e}")
        return None


def build_contact_router(*, get_db, require_admin) -> APIRouter:
    router = APIRouter()

    @router.post("/contact")
    async def submit_contact(body: ContactSubmit, request: Request):
        """Guest-facing contact form submit. Saves to DB + fires an email."""
        db = get_db()
        # Rate-limit by IP (in-memory, one-minute window) so bots don't hose
        # us with garbage. Simple, best-effort.
        ip = request.client.host if request.client else "unknown"
        recent = await db.contact_submissions.count_documents({
            "source_ip": ip,
            "created_at": {"$gt": (datetime.now(timezone.utc)).isoformat()[:16]},  # same minute
        })
        if recent > 3:
            raise HTTPException(status_code=429, detail="Too many submissions — try again in a minute.")

        doc = {
            "id": str(uuid.uuid4()),
            "name": body.name.strip(),
            "email": body.email,
            "subject": (body.subject or "").strip() or f"[{body.topic}] Contact from {body.name.strip()}",
            "message": body.message.strip(),
            "topic": body.topic or "general",
            "status": "new",
            "source_ip": ip,
            "user_agent": request.headers.get("user-agent", "")[:300],
            "created_at": _now_iso(),
        }
        await db.contact_submissions.insert_one(doc)

        # Fire and forget the email — if Resend isn't configured, the
        # submission is still safely stored in `contact_submissions`.
        subj = f"[Lumo contact] {doc['subject']}"
        html = f"""
        <div style="font-family:-apple-system,Segoe UI,sans-serif;max-width:600px;margin:0 auto;padding:24px;color:#0f172a;">
          <h2 style="margin:0 0 12px;">New contact form submission</h2>
          <p style="color:#64748b;font-size:13px;margin:0 0 24px;">Received {doc['created_at']} · Topic: <strong>{doc['topic']}</strong></p>
          <table style="border-collapse:collapse;width:100%;font-size:14px;">
            <tr><td style="padding:6px 0;color:#64748b;width:100px;">From</td><td style="padding:6px 0;"><strong>{doc['name']}</strong> &lt;<a href="mailto:{doc['email']}">{doc['email']}</a>&gt;</td></tr>
            <tr><td style="padding:6px 0;color:#64748b;">Subject</td><td style="padding:6px 0;">{doc['subject']}</td></tr>
          </table>
          <div style="margin-top:20px;padding:16px;background:#f8fafc;border-left:3px solid #0d9488;white-space:pre-wrap;">{doc['message']}</div>
          <p style="margin-top:24px;color:#64748b;font-size:12px;">Reply directly to this email — the sender's address is in Reply-To.</p>
        </div>
        """
        asyncio.create_task(_send_resend_email(
            to_email=CONTACT_INBOX,
            subject=subj,
            html=html,
            reply_to=body.email,
        ))
        return {"ok": True, "id": doc["id"]}

    @router.get("/admin/contact")
    async def list_contact_submissions(
        q: Optional[str] = None,
        status: Optional[str] = None,
        limit: int = 100,
        skip: int = 0,
        _: dict = Depends(require_admin),
    ):
        db = get_db()
        filt: dict = {}
        if status and status != "all":
            filt["status"] = status
        if q:
            rx = {"$regex": q.strip(), "$options": "i"}
            filt["$or"] = [{"name": rx}, {"email": rx}, {"subject": rx}, {"message": rx}]
        cur = db.contact_submissions.find(filt, {"_id": 0}).sort("created_at", -1).skip(int(skip)).limit(min(int(limit), 500))
        docs: List[dict] = await cur.to_list(length=min(int(limit), 500))
        total = await db.contact_submissions.count_documents(filt)
        return {"items": docs, "total": total}

    @router.patch("/admin/contact/{sub_id}")
    async def mark_contact(sub_id: str, body: dict, _: dict = Depends(require_admin)):
        db = get_db()
        allowed = {"status", "note"}
        update = {k: v for k, v in (body or {}).items() if k in allowed}
        if not update:
            raise HTTPException(400, f"No editable fields. Allowed: {sorted(allowed)}")
        res = await db.contact_submissions.update_one({"id": sub_id}, {"$set": update})
        if res.matched_count == 0:
            raise HTTPException(404, "Submission not found")
        return {"ok": True}

    @router.delete("/admin/contact/{sub_id}")
    async def delete_contact(sub_id: str, _: dict = Depends(require_admin)):
        db = get_db()
        res = await db.contact_submissions.delete_one({"id": sub_id})
        if res.deleted_count == 0:
            raise HTTPException(404, "Submission not found")
        return {"ok": True}

    return router

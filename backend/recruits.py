"""
Recruit-lead capture.

The marketing site (`/apply`, `/for-providers`, `/providers/<city>`,
`/careers/<category>`) posts lightweight lead forms here. Leads land in a
MongoDB `recruits` collection so the operator can export/CSV them, plus
we mirror them into `notifications` for the admin user so they show up
in the app's own bell tray without extra plumbing.

Small on purpose — this is a lead funnel, not full onboarding. Real
provider signup still happens through `/auth/register`.
"""
from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


class RecruitLead(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    email: Optional[str] = Field(default=None, max_length=200)
    phone: Optional[str] = Field(default=None, max_length=32)
    city: Optional[str] = Field(default=None, max_length=120)
    country: Optional[str] = Field(default=None, max_length=8)
    service: Optional[str] = Field(default=None, max_length=120)
    experience_years: Optional[int] = Field(default=None, ge=0, le=60)
    hours_per_week: Optional[int] = Field(default=None, ge=0, le=168)
    hook: Optional[str] = Field(default=None, max_length=120)  # which value prop brought them in
    message: Optional[str] = Field(default=None, max_length=2000)
    source_url: Optional[str] = Field(default=None, max_length=500)
    referrer: Optional[str] = Field(default=None, max_length=500)
    ref_code: Optional[str] = Field(default=None, max_length=32)


def create_router(*, db, throttle, get_current_user):
    r = APIRouter(prefix="/recruits", tags=["recruits"])

    @r.post("")
    async def create_recruit(body: RecruitLead, request: Request):
        # Rate-limit — 5 leads / IP / 15 min. Enough for a family filling
        # forms together but stops a scraper spraying leads.
        throttle(request, key="recruits.create", limit=5, window_sec=900, penalty_sec=900)
        if not (body.email or body.phone):
            raise HTTPException(400, "Provide an email or phone we can reach you at.")
        rec = {
            "id": str(uuid.uuid4()),
            **body.model_dump(),
            "status": "new",
            "ip": (request.headers.get("x-forwarded-for") or "").split(",")[0].strip() or None,
            "user_agent": request.headers.get("user-agent"),
            "created_at": _now_iso(),
        }
        await db.recruits.insert_one(rec)
        # Mirror to admin's notifications so it shows up in the bell tray.
        admin = await db.users.find_one({"role": "admin"}, {"_id": 0, "id": 1})
        if admin:
            await db.notifications.insert_one({
                "id": str(uuid.uuid4()),
                "user_id": admin["id"],
                "type": "recruit_lead",
                "title": f"New provider lead: {body.name}",
                "body": (
                    f"{body.name} · {body.city or 'unknown city'} · "
                    f"{body.service or 'general'}"
                ),
                "link": "/admin?tab=recruits",
                "read": False,
                "created_at": _now_iso(),
            })
        return {"ok": True, "id": rec["id"]}

    @r.get("")
    async def list_recruits(user: dict = Depends(get_current_user)) -> List[dict]:
        if user.get("role") != "admin":
            raise HTTPException(403, "Admin only")
        cur = db.recruits.find({}).sort("created_at", -1).limit(500)
        out = []
        async for d in cur:
            d.pop("_id", None)
            out.append(d)
        return out

    @r.patch("/{lead_id}")
    async def update_recruit(lead_id: str, body: dict, user: dict = Depends(get_current_user)):
        if user.get("role") != "admin":
            raise HTTPException(403, "Admin only")
        allowed = {"status", "notes"}
        upd = {k: v for k, v in body.items() if k in allowed}
        if not upd:
            raise HTTPException(400, "No fields to update")
        upd["updated_at"] = _now_iso()
        r2 = await db.recruits.update_one({"id": lead_id}, {"$set": upd})
        if r2.matched_count == 0:
            raise HTTPException(404, "Lead not found")
        return {"ok": True}

    return r

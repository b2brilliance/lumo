"""Recruiter Hub: a signed-in recruiter's crew, their completed jobs, and all-time / city leaderboards."""
from typing import Literal, Optional

from fastapi import APIRouter, Depends

PAID = ["paid", "deposit_paid", "in_progress", "completed"]


def _city(u: dict) -> Optional[str]:
    loc = u.get("location") if isinstance(u.get("location"), dict) else {}
    c = loc.get("city") or (loc.get("address") or "").split(",")[0].strip()
    if not c and u.get("recruit_city_slug"):
        c = u["recruit_city_slug"].replace("-", " ").title()
    return c or None


def _mask(name: Optional[str]) -> str:
    parts = (name or "").split() or ["Lumo", "recruiter"]
    return parts[0] + (f" {parts[-1][0]}." if len(parts) > 1 else "")


def create_router(*, db, get_current_user) -> APIRouter:
    r = APIRouter(prefix="/api/recruiter-hub", tags=["recruiter-hub"])

    async def _jobs_for(recruit_ids: list, referrer_id: Optional[str] = None) -> dict:
        """Completed jobs per recruit: referral-paid jobs plus paid shop sales."""
        out: dict = {uid: [] for uid in recruit_ids}
        q = {"source_user_id": {"$in": recruit_ids}}
        if referrer_id:
            q["referrer_user_id"] = referrer_id
        async for e in db.referral_earnings.find(q, {"_id": 0}).sort("created_at", -1):
            out.setdefault(e["source_user_id"], []).append({
                "id": e.get("id"), "kind": e.get("source_type"), "source_id": e.get("source_id"),
                "gross": e.get("gross_amount") or round(float(e.get("provider_amount") or 0) / 0.9, 2),
                "you_earned": round(float(e.get("amount") or 0), 4), "completed_at": e.get("created_at")})
        async for o in db.orders.find({"is_cart_order": True, "store_id": {"$in": recruit_ids}, "status": {"$in": PAID}},
                                      {"_id": 0, "id": 1, "store_id": 1, "subtotal": 1, "item_total": 1, "paid_at": 1}):
            out.setdefault(o["store_id"], []).append({
                "id": o["id"], "kind": "sale", "source_id": o["id"],
                "gross": round(float(o.get("subtotal") or o.get("item_total") or 0), 2),
                "you_earned": 0.0, "completed_at": o.get("paid_at")})
        return out

    async def _titles(jobs: list) -> None:
        job_ids = [j["source_id"] for j in jobs if j["kind"] in ("jobs", "job", "escrow") and j["source_id"]]
        titles = {d["id"]: d.get("title") async for d in db.jobs.find({"id": {"$in": job_ids}}, {"_id": 0, "id": 1, "title": 1})}
        for j in jobs:
            sid = j.get("source_id") or ""
            j["title"] = titles.get(sid) or ("Shop sale" if j["kind"] == "sale" else
                                             f"Order #{sid[:8]}" if j["kind"] in ("orders", "order") else "Completed job")

    @r.get("/me")
    async def me(user: dict = Depends(get_current_user)):
        recruits = await db.users.find({"referred_by_user_id": user["id"]},
                                       {"_id": 0, "id": 1, "name": 1, "role": 1, "avatar_url": 1, "created_at": 1}
                                       ).sort("created_at", -1).to_list(1000)
        jobs = await _jobs_for([u["id"] for u in recruits], user["id"])
        rows, flat = [], []
        for u in recruits:
            js = sorted(jobs.get(u["id"], []), key=lambda j: j.get("completed_at") or "", reverse=True)
            flat += js
            rows.append({"id": u["id"], "name": u.get("name") or "New member", "role": u.get("role"),
                         "avatar_url": u.get("avatar_url"), "joined_at": u.get("created_at"),
                         "jobs_completed": len(js), "you_earned": round(sum(j["you_earned"] for j in js), 2), "jobs": js[:50]})
        await _titles(flat)
        rows.sort(key=lambda x: (-x["jobs_completed"], x["joined_at"] or ""))
        milestones = sum([float(m.get("amount") or 0) async for m in db.referral_milestones.find({"referrer_user_id": user["id"]}, {"_id": 0, "amount": 1})])
        prizes = sum([float(b.get("prize_amount") or 0) async for b in db.recruiter_badges.find(
            {"user_id": user["id"], "prize_status": "paid"}, {"_id": 0, "prize_amount": 1})])
        commission = sum(x["you_earned"] for x in rows)
        return {"summary": {"recruits": len(rows), "active_recruits": sum(1 for x in rows if x["jobs_completed"]),
                            "jobs_completed": len(flat), "commission_earned": round(commission, 2),
                            "bonuses_earned": round(milestones + prizes, 2),
                            "total_earned": round(commission + milestones + prizes, 2)},
                "city": _city(user), "recruits": rows}

    async def _board(city: Optional[str], me_id: str, limit: int) -> list:
        groups = await db.users.aggregate([
            {"$match": {"referred_by_user_id": {"$exists": True, "$ne": None}, "is_demo": {"$ne": True}}},
            {"$group": {"_id": "$referred_by_user_id", "ids": {"$push": "$id"}}}]).to_list(None)
        recruiters = {u["id"]: u async for u in db.users.find(
            {"id": {"$in": [g["_id"] for g in groups]}, "is_demo": {"$ne": True}, "role": {"$ne": "admin"}},
            {"_id": 0, "id": 1, "name": 1, "location": 1, "recruit_city_slug": 1})}
        all_ids = [i for g in groups for i in g["ids"]]
        jobs = await _jobs_for(all_ids)
        rows = []
        for g in groups:
            u = recruiters.get(g["_id"])
            if not u or (city and (_city(u) or "").lower() != city.lower()):
                continue
            counts = [len(jobs.get(i, [])) for i in g["ids"]]
            rows.append({"name": _mask(u.get("name")), "city": _city(u), "recruits": len(g["ids"]),
                         "active_recruits": sum(1 for c in counts if c), "jobs": sum(counts), "is_me": u["id"] == me_id})
        rows.sort(key=lambda x: (-x["active_recruits"], -x["jobs"], -x["recruits"]))
        for n, row in enumerate(rows):
            row["rank"] = n + 1
        mine = next((x for x in rows if x["is_me"]), None)
        top = rows[:limit]
        if mine and mine not in top:
            top.append(mine)
        return top

    @r.get("/leaderboard")
    async def leaderboard(scope: Literal["alltime", "city"] = "alltime", limit: int = 20,
                          user: dict = Depends(get_current_user)):
        city = _city(user) if scope == "city" else None
        if scope == "city" and not city:
            return {"scope": scope, "city": None, "rows": []}
        return {"scope": scope, "city": city, "rows": await _board(city, user["id"], max(1, min(limit, 100)))}

    return r

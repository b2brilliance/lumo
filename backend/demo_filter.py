"""Hide seeded demo / test-account content from public listing endpoints."""
import time
from typing import Optional

TEST_EMAIL_REGEX = r"(\.test|@test\.com|@example\.com)$"

DEMO_FLAG_CLAUSES = [
    {"is_demo": {"$ne": True}},
    {"is_global_demo": {"$ne": True}},
    {"is_career_demo": {"$ne": True}},
    {"seeded": {"$exists": False}},
]

_cache = {"at": 0.0, "ids": []}


async def test_owner_ids(db) -> list:
    if time.time() - _cache["at"] < 60:
        return _cache["ids"]
    docs = await db.users.find(
        {"$or": [{"email": {"$regex": TEST_EMAIL_REGEX, "$options": "i"}}, {"is_test": True}]},
        {"id": 1, "_id": 0},
    ).to_list(10000)
    _cache.update(at=time.time(), ids=[d["id"] for d in docs if d.get("id")])
    return _cache["ids"]


def bypass(viewer: Optional[dict], owner_value: Optional[str] = None) -> bool:
    """Admins see everything; a user viewing their own items sees them."""
    if not viewer:
        return False
    return viewer.get("role") == "admin" or (owner_value is not None and owner_value == viewer.get("id"))


async def hide_demo(db, query: dict, owner_field: Optional[str] = None, viewer: Optional[dict] = None,
                    owner_value: Optional[str] = None, flags: bool = True) -> dict:
    if bypass(viewer, owner_value):
        return query
    clauses = list(DEMO_FLAG_CLAUSES) if flags else []
    if owner_field:
        clauses.append({owner_field: {"$nin": await test_owner_ids(db)}})
    if not clauses:
        return query
    return {**query, "$and": query.get("$and", []) + clauses}

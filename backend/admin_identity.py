"""Owner/admin identity allowlist (ADMIN_EMAILS, ADMIN_PHONES env, comma-separated)."""
import os
import uuid
from datetime import datetime, timezone


def _list(key: str) -> set:
    return {x.strip().lower() for x in os.environ.get(key, "").split(",") if x.strip()}


def is_admin_email(email: str) -> bool:
    return (email or "").strip().lower() in _list("ADMIN_EMAILS")


def is_admin_phone(phone: str) -> bool:
    return (phone or "").strip() in _list("ADMIN_PHONES")


async def ensure_admin_user(db, email: str, *, name: str = "", picture: str = None, provider: str = "google") -> dict:
    """Return the admin user for `email`, creating or promoting it to role=admin."""
    email = email.strip().lower()
    now = datetime.now(timezone.utc).isoformat()
    doc = await db.users.find_one({"email": email})
    if doc:
        if doc.get("role") != "admin":
            await db.users.update_one({"id": doc["id"]}, {"$set": {"role": "admin", "promoted_admin_at": now}})
            doc["role"] = "admin"
        return doc
    doc = {
        "id": str(uuid.uuid4()), "email": email, "name": name or email.split("@")[0], "role": "admin",
        "phone": None, "password_hash": None, "auth_provider": provider, "avatar_url": picture,
        "wallet_balance": 0.0, "location": None, "service_radius_miles": 25.0, "categories": [],
        "storefront": None, "created_at": now,
    }
    await db.users.insert_one(doc)
    return doc

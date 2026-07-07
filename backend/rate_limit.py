"""
Lightweight in-memory rate limiter.

Sliding-window per-key counter. Zero dependencies, safe for a single-instance
FastAPI deployment (which is our case). If we ever move to horizontally
scaled workers, swap the backing dict for Redis / MongoDB TTL collection.

Usage:

    from rate_limit import throttle
    from fastapi import Request

    @api.post("/auth/login")
    async def login(body: UserLogin, request: Request):
        throttle(request, key="auth.login", limit=10, window_sec=900,
                 penalty_sec=900)   # 10 tries / 15 min
        ...

`throttle()` raises `HTTPException(429)` with a `Retry-After` header when
the caller has exceeded the limit. Successful calls are counted the same
as failed ones (we're gating volume, not just failures) so a brute-forcer
can't dodge the limit by mixing valid-looking payloads.
"""
from __future__ import annotations

import time
from collections import deque
from threading import Lock
from typing import Deque, Dict, Optional, Tuple

from fastapi import HTTPException, Request

# In-memory store: key = f"{scope}:{ip}" → deque of monotonic timestamps
_STORE: Dict[str, Deque[float]] = {}
_LOCK = Lock()


def _client_ip(request: Request) -> str:
    """Best-effort client IP that respects reverse-proxy `X-Forwarded-For`.

    Falls back to `request.client.host` which is the peer socket IP —
    in K8s that's the ingress pod, so the header is what actually matters
    in production."""
    fwd = request.headers.get("x-forwarded-for") or request.headers.get("x-real-ip")
    if fwd:
        # X-Forwarded-For can be a comma-separated chain; the FIRST entry is
        # the original client (ingress appends its own IP after).
        return fwd.split(",")[0].strip()
    return getattr(request.client, "host", "0.0.0.0") if request.client else "0.0.0.0"


def throttle(
    request: Request,
    *,
    key: str,
    limit: int,
    window_sec: int,
    penalty_sec: Optional[int] = None,
) -> None:
    """Raise HTTP 429 if the caller has exceeded `limit` calls within
    the last `window_sec` seconds for this `key`.

    - `key`         Scope for the counter (e.g. "auth.login"). Different
                     scopes have independent quotas.
    - `limit`       Max allowed calls in the window.
    - `window_sec`  Sliding window duration.
    - `penalty_sec` If provided, when the limit is hit we set the
                     `Retry-After` header to THIS value (usually equal
                     to `window_sec`).
    """
    ip = _client_ip(request)
    scoped = f"{key}:{ip}"
    now = time.monotonic()
    cutoff = now - window_sec
    with _LOCK:
        dq = _STORE.setdefault(scoped, deque())
        # Evict everything outside the window.
        while dq and dq[0] < cutoff:
            dq.popleft()
        if len(dq) >= limit:
            retry_after = int(penalty_sec if penalty_sec is not None else window_sec)
            raise HTTPException(
                status_code=429,
                detail={
                    "code": "rate_limited",
                    "message": (
                        f"Too many attempts. Try again in "
                        f"{max(1, retry_after // 60)} minute(s)."
                    ),
                },
                headers={"Retry-After": str(retry_after)},
            )
        dq.append(now)


def peek(request: Request, *, key: str, window_sec: int) -> Tuple[int, int]:
    """Return (used, window_sec) — used = calls in the current window.

    Handy for surfacing "3/10 attempts left" hints in error responses.
    """
    ip = _client_ip(request)
    scoped = f"{key}:{ip}"
    now = time.monotonic()
    cutoff = now - window_sec
    with _LOCK:
        dq = _STORE.get(scoped)
        if not dq:
            return (0, window_sec)
        while dq and dq[0] < cutoff:
            dq.popleft()
        return (len(dq), window_sec)


def reset(request: Request, *, key: str) -> None:
    """Wipe the counter for this IP + scope. Call on SUCCESSFUL login so a
    user with the correct password can immediately try again even if
    they'd been near the limit."""
    ip = _client_ip(request)
    scoped = f"{key}:{ip}"
    with _LOCK:
        _STORE.pop(scoped, None)

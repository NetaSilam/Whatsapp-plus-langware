"""JWT signing/verification for the session cookie and terminal WS tickets."""

import os
import time

import jwt

SECRET = os.environ.get("APP_JWT_SECRET", "dev-secret-change-me")
ALGO = "HS256"

SESSION_TTL = 60 * 60 * 24 * 30  # 30 days
TICKET_TTL = 60  # 60s — short-lived terminal WebSocket ticket


def create_token(sub: str, kind: str = "session", ttl: int = SESSION_TTL, **extra) -> str:
    now = int(time.time())
    payload = {"sub": sub, "kind": kind, "iat": now, "exp": now + ttl, **extra}
    return jwt.encode(payload, SECRET, algorithm=ALGO)


def decode_token(token: str) -> dict:
    return jwt.decode(token, SECRET, algorithms=[ALGO])

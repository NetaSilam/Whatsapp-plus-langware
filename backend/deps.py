"""Auth dependency — resolves the current user from the session cookie."""

from fastapi import HTTPException, Request

from db import pool
from security import decode_token


async def current_user(request: Request) -> dict:
    token = request.cookies.get("session")
    if not token:
        auth = request.headers.get("authorization", "")
        if auth.lower().startswith("bearer "):
            token = auth[7:]
    if not token:
        raise HTTPException(status_code=401, detail="not authenticated")
    try:
        payload = decode_token(token)
        if payload.get("kind") != "session":
            raise ValueError("wrong token kind")
    except Exception:
        raise HTTPException(status_code=401, detail="invalid session")
    row = await pool().fetchrow(
        "select id, phone, username, photo_url, last_seen "
        "from public.users where id = $1::uuid",
        payload["sub"],
    )
    if row is None:
        raise HTTPException(status_code=401, detail="user not found")
    return dict(row)

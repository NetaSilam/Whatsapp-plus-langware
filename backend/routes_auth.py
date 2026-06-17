"""Phone + mock-OTP authentication.

WhatsApp-style flow, but free/offline: a 6-digit code is generated server-side
and returned in the response so the UI can show it (dev mode). On verify we
create the user (if new) and set an httpOnly `session` cookie (signed JWT).
"""

import datetime
import secrets

from fastapi import APIRouter, Depends, HTTPException, Response
from pydantic import BaseModel

from db import pool
from deps import current_user
from security import create_token
from serializers import user_public

router = APIRouter(prefix="/api/auth", tags=["auth"])


class RequestOtpIn(BaseModel):
    phone: str
    username: str | None = None
    photo_url: str | None = None


class VerifyIn(BaseModel):
    phone: str
    code: str


def _gen_code() -> str:
    return f"{secrets.randbelow(1_000_000):06d}"


def _now() -> datetime.datetime:
    return datetime.datetime.now(datetime.timezone.utc)


@router.post("/request-otp")
async def request_otp(body: RequestOtpIn):
    phone = body.phone.strip()
    if not phone:
        raise HTTPException(400, "Phone number is required")

    user = await pool().fetchrow("select id from public.users where phone = $1", phone)
    is_registration = user is None
    if is_registration and not (body.username and body.username.strip()):
        raise HTTPException(404, "This number isn't registered — add a username to sign up")

    code = _gen_code()
    expires = _now() + datetime.timedelta(minutes=10)
    # Invalidate any prior unconsumed codes for this phone.
    await pool().execute(
        "update public.otp_codes set consumed_at = now() "
        "where phone = $1 and consumed_at is null",
        phone,
    )
    await pool().execute(
        "insert into public.otp_codes (phone, code, purpose, username, photo_url, expires_at) "
        "values ($1, $2, $3, $4, $5, $6)",
        phone,
        code,
        "register" if is_registration else "login",
        (body.username or "").strip() or None,
        body.photo_url,
        expires,
    )
    # dev_code is surfaced in the UI (mock OTP). Swap for a real SMS send here.
    return {"phone": phone, "is_registration": is_registration, "dev_code": code}


@router.post("/verify")
async def verify(body: VerifyIn, response: Response):
    phone = body.phone.strip()
    row = await pool().fetchrow(
        "select * from public.otp_codes where phone = $1 and consumed_at is null "
        "order by created_at desc limit 1",
        phone,
    )
    if row is None:
        raise HTTPException(400, "No active code — request a new one")
    if row["expires_at"] < _now():
        raise HTTPException(400, "Code expired — request a new one")
    if row["attempts"] >= 5:
        raise HTTPException(429, "Too many attempts — request a new code")
    if body.code.strip() != row["code"].strip():
        await pool().execute(
            "update public.otp_codes set attempts = attempts + 1 where id = $1", row["id"]
        )
        raise HTTPException(400, "Incorrect code")

    await pool().execute(
        "update public.otp_codes set consumed_at = now() where id = $1", row["id"]
    )
    user = await pool().fetchrow("select * from public.users where phone = $1", phone)
    if user is None:
        user = await pool().fetchrow(
            "insert into public.users (phone, username, photo_url) "
            "values ($1, $2, $3) returning *",
            phone,
            row["username"] or "User",
            row["photo_url"],
        )

    token = create_token(str(user["id"]))
    response.set_cookie(
        "session",
        token,
        httponly=True,
        samesite="lax",
        secure=False,  # dev over http
        max_age=60 * 60 * 24 * 30,
        path="/",
    )
    return user_public(user)


@router.post("/logout")
async def logout(response: Response):
    response.delete_cookie("session", path="/")
    return {"ok": True}


@router.get("/me")
async def me(user=Depends(current_user)):
    return user_public(user)

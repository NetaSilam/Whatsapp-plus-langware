"""Supabase JWT verification for FastAPI.

Supabase Auth issues HS256 access tokens signed with the project's JWT secret
(SUPABASE_JWT_SECRET). The browser sends that token as `Authorization: Bearer
<token>`; `get_current_user` decodes and validates it, yielding the caller's
identity. Reused by REST endpoints and the terminal WebSocket (Phase 3).
"""

import os

import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pydantic import BaseModel

# Supabase signs user tokens with aud "authenticated".
JWT_AUDIENCE = "authenticated"

_bearer = HTTPBearer(auto_error=True)


class CurrentUser(BaseModel):
    id: str
    email: str | None = None


def decode_token(token: str) -> CurrentUser:
    """Validate a Supabase access token and return the user, or raise 401."""
    try:
        payload = jwt.decode(
            token,
            os.environ.get("SUPABASE_JWT_SECRET", ""),
            algorithms=["HS256"],
            audience=JWT_AUDIENCE,
        )
    except jwt.PyJWTError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
        )
    return CurrentUser(id=payload["sub"], email=payload.get("email"))


def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(_bearer),
) -> CurrentUser:
    """FastAPI dependency: resolve the authenticated user from the Bearer token."""
    return decode_token(credentials.credentials)

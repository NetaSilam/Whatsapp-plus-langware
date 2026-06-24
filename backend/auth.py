"""Supabase JWT verification for FastAPI.

Supabase Auth issues access tokens the browser sends as
`Authorization: Bearer <token>`. Recent Supabase signs them asymmetrically
(ES256) and publishes the public key at the project's JWKS endpoint; older
setups sign symmetrically (HS256) with SUPABASE_JWT_SECRET. We support both:
the token header's `alg` selects the path. `get_current_user` yields the
caller's identity, or raises 401. Reused by REST endpoints and the terminal
WebSocket (Phase 3).
"""

import os

import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jwt import PyJWKClient
from pydantic import BaseModel

# Supabase signs user tokens with aud "authenticated".
JWT_AUDIENCE = "authenticated"

_bearer = HTTPBearer(auto_error=True)
_jwk_client: PyJWKClient | None = None


class CurrentUser(BaseModel):
    id: str
    email: str | None = None


def _supabase_url() -> str:
    return (
        os.environ.get("SUPABASE_URL")
        or os.environ.get("NEXT_PUBLIC_SUPABASE_URL")
        or "http://127.0.0.1:54321"
    )


def _jwks() -> PyJWKClient:
    """Lazily build a cached JWKS client for the local Supabase auth server."""
    global _jwk_client
    if _jwk_client is None:
        _jwk_client = PyJWKClient(f"{_supabase_url()}/auth/v1/.well-known/jwks.json")
    return _jwk_client


def decode_token(token: str) -> CurrentUser:
    """Validate a Supabase access token and return the user, or raise 401."""
    try:
        alg = jwt.get_unverified_header(token).get("alg", "")
        if alg.startswith("HS"):
            key = os.environ.get("SUPABASE_JWT_SECRET", "")
            algorithms = [alg]
        else:
            key = _jwks().get_signing_key_from_jwt(token).key
            algorithms = [alg or "ES256"]

        payload = jwt.decode(
            token,
            key,
            algorithms=algorithms,
            audience=JWT_AUDIENCE,
        )
    except Exception:
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

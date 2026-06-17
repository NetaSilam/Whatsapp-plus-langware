"""Presence heartbeat — keeps users.last_seen fresh for the 'last seen' line.

Live online/offline is tracked client-side via Supabase Realtime Presence; this
endpoint just persists the durable last_seen timestamp (sendBeacon-friendly).
"""

from fastapi import APIRouter, Depends

from db import pool
from deps import current_user

router = APIRouter(prefix="/api/presence", tags=["presence"])


@router.post("/heartbeat")
async def heartbeat(user=Depends(current_user)):
    await pool().execute(
        "update public.users set last_seen = now() where id = $1::uuid", str(user["id"])
    )
    return {"ok": True}

"""Shared helpers for conversation/message routes."""

from fastapi import HTTPException

import realtime
from db import pool
from serializers import message_public, user_public

# Aggregate-state CASE: a message is 'sent' if any recipient is still 'sent',
# 'read' only when ALL recipients have read, else 'delivered'.
_AGG_SQL = (
    "select message_id, case "
    "when bool_or(state = 'sent') then 'sent' "
    "when bool_and(state = 'read') then 'read' "
    "else 'delivered' end as agg "
    "from public.message_receipts where message_id = any($1::uuid[]) group by message_id"
)


async def assert_member(conv_id: str, user_id: str) -> str:
    role = await pool().fetchval(
        "select role from public.conversation_members "
        "where conversation_id = $1::uuid and user_id = $2::uuid",
        conv_id,
        user_id,
    )
    if role is None:
        raise HTTPException(403, "You are not a member of this conversation")
    return role


async def member_ids(conv_id: str) -> list[str]:
    rows = await pool().fetch(
        "select user_id from public.conversation_members where conversation_id = $1::uuid",
        conv_id,
    )
    return [str(r["user_id"]) for r in rows]


async def aggregates_for(message_ids: list[str]) -> dict:
    if not message_ids:
        return {}
    rows = await pool().fetch(_AGG_SQL, message_ids)
    return {str(r["message_id"]): r["agg"] for r in rows}


async def serialize_messages(rows, viewer_id: str) -> list[dict]:
    """Attach files + (for the viewer's own messages) the receipt aggregate."""
    if not rows:
        return []
    ids = [str(r["id"]) for r in rows]
    at_rows = await pool().fetch(
        "select * from public.attachments where message_id = any($1::uuid[])", ids
    )
    by_msg: dict[str, list] = {}
    for a in at_rows:
        by_msg.setdefault(str(a["message_id"]), []).append(
            {
                "id": a["id"],
                "url": a["url"],
                "mime_type": a["mime_type"],
                "size_bytes": a["size_bytes"],
                "file_name": a["file_name"],
                "width": a["width"],
                "height": a["height"],
            }
        )
    sent_ids = [str(r["id"]) for r in rows if str(r["sender_id"]) == str(viewer_id)]
    aggs = await aggregates_for(sent_ids)
    out = []
    for r in rows:
        mid = str(r["id"])
        mine = str(r["sender_id"]) == str(viewer_id) and r["kind"] != "system"
        status = aggs.get(mid, "sent") if mine else None
        out.append(message_public(r, by_msg.get(mid, []), status))
    return out


async def notify_users(user_ids, event: str, payload: dict) -> None:
    """Push a conversation-level event to each user's personal channel."""
    for uid in set(str(u) for u in user_ids):
        await realtime.broadcast(f"user:{uid}", event, payload)

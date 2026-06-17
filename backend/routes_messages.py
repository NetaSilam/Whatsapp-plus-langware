"""Messages + the sent/delivered/read receipt state machine."""

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

import realtime
from chat_common import aggregates_for, assert_member, member_ids, serialize_messages
from db import pool
from deps import current_user
from serializers import message_public

router = APIRouter(prefix="/api/conversations", tags=["messages"])


class AttachmentIn(BaseModel):
    storage_path: str
    url: str
    mime_type: str
    size_bytes: int = 0
    file_name: str | None = None
    width: int | None = None
    height: int | None = None


class SendIn(BaseModel):
    body: str | None = None
    kind: str = "text"
    client_msg_id: str | None = None
    attachments: list[AttachmentIn] = []


@router.get("/{conv_id}/messages")
async def list_messages(
    conv_id: str, before: str | None = None, limit: int = 50, user=Depends(current_user)
):
    await assert_member(conv_id, str(user["id"]))
    limit = max(1, min(limit, 100))
    if before:
        rows = await pool().fetch(
            "select * from public.messages where conversation_id = $1::uuid "
            "and created_at < (select created_at from public.messages where id = $2::uuid) "
            "order by created_at desc limit $3",
            conv_id,
            before,
            limit,
        )
    else:
        rows = await pool().fetch(
            "select * from public.messages where conversation_id = $1::uuid "
            "order by created_at desc limit $2",
            conv_id,
            limit,
        )
    rows = list(reversed(rows))  # ascending for display
    return await serialize_messages(rows, str(user["id"]))


@router.post("/{conv_id}/messages")
async def send_message(conv_id: str, body: SendIn, user=Depends(current_user)):
    me = str(user["id"])
    await assert_member(conv_id, me)
    if not (body.body and body.body.strip()) and not body.attachments:
        raise HTTPException(400, "Message must have text or an attachment")

    async with pool().acquire() as con:
        async with con.transaction():
            if body.client_msg_id:
                existing = await con.fetchrow(
                    "select * from public.messages "
                    "where conversation_id = $1::uuid and client_msg_id = $2::uuid",
                    conv_id,
                    body.client_msg_id,
                )
                if existing is not None:
                    serialized = await serialize_messages([existing], me)
                    return serialized[0]

            msg = await con.fetchrow(
                "insert into public.messages "
                "(conversation_id, sender_id, body, kind, client_msg_id) "
                "values ($1::uuid, $2::uuid, $3, $4, $5) returning *",
                conv_id,
                me,
                (body.body or "").strip() or None,
                body.kind,
                body.client_msg_id,
            )
            mid = str(msg["id"])

            for a in body.attachments:
                await con.execute(
                    "insert into public.attachments "
                    "(message_id, storage_path, url, mime_type, size_bytes, file_name, width, height) "
                    "values ($1::uuid, $2, $3, $4, $5, $6, $7, $8)",
                    mid,
                    a.storage_path,
                    a.url,
                    a.mime_type,
                    a.size_bytes,
                    a.file_name,
                    a.width,
                    a.height,
                )

            # One 'sent' receipt per recipient (everyone but the sender).
            await con.execute(
                "insert into public.message_receipts (message_id, user_id, state) "
                "select $1::uuid, user_id, 'sent' from public.conversation_members "
                "where conversation_id = $2::uuid and user_id <> $3::uuid",
                mid,
                conv_id,
                me,
            )

    serialized = (await serialize_messages([msg], me))[0]
    # Broadcast to the open conversation, and bump everyone's list.
    await realtime.broadcast(f"conv:{conv_id}", "message.new", serialized)
    await _notify_list(conv_id)
    return serialized


class MarkIn(BaseModel):
    up_to_message_id: str | None = None


@router.post("/{conv_id}/delivered")
async def mark_delivered(conv_id: str, user=Depends(current_user)):
    me = str(user["id"])
    await assert_member(conv_id, me)
    rows = await pool().fetch(
        "update public.message_receipts r set state = 'delivered', delivered_at = now() "
        "from public.messages m "
        "where r.message_id = m.id and m.conversation_id = $1::uuid "
        "and r.user_id = $2::uuid and r.state = 'sent' returning r.message_id",
        conv_id,
        me,
    )
    await _broadcast_receipts(conv_id, me, "delivered", [str(r["message_id"]) for r in rows])
    return {"updated": len(rows)}


@router.post("/{conv_id}/read")
async def mark_read(conv_id: str, body: MarkIn, user=Depends(current_user)):
    me = str(user["id"])
    await assert_member(conv_id, me)
    if body.up_to_message_id:
        rows = await pool().fetch(
            "update public.message_receipts r set state = 'read', "
            "read_at = now(), delivered_at = coalesce(r.delivered_at, now()) "
            "from public.messages m where r.message_id = m.id "
            "and m.conversation_id = $1::uuid and r.user_id = $2::uuid and r.state <> 'read' "
            "and m.created_at <= (select created_at from public.messages where id = $3::uuid) "
            "returning r.message_id",
            conv_id,
            me,
            body.up_to_message_id,
        )
    else:
        rows = await pool().fetch(
            "update public.message_receipts r set state = 'read', "
            "read_at = now(), delivered_at = coalesce(r.delivered_at, now()) "
            "from public.messages m where r.message_id = m.id "
            "and m.conversation_id = $1::uuid and r.user_id = $2::uuid and r.state <> 'read' "
            "returning r.message_id",
            conv_id,
            me,
        )
    await pool().execute(
        "update public.conversation_members set last_read_at = now() "
        "where conversation_id = $1::uuid and user_id = $2::uuid",
        conv_id,
        me,
    )
    await _broadcast_receipts(conv_id, me, "read", [str(r["message_id"]) for r in rows])
    return {"updated": len(rows)}


async def _broadcast_receipts(conv_id: str, by_user: str, state: str, message_ids: list[str]):
    if not message_ids:
        return
    aggs = await aggregates_for(message_ids)
    await realtime.broadcast(
        f"conv:{conv_id}",
        "receipt.update",
        {
            "conversation_id": conv_id,
            "by_user": by_user,
            "state": state,
            "message_ids": message_ids,
            "aggregates": aggs,
        },
    )
    await _notify_list(conv_id)


async def _notify_list(conv_id: str):
    from chat_common import notify_users

    await notify_users(await member_ids(conv_id), "conversation.updated", {"conversation_id": conv_id})

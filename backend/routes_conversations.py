"""Conversations + group membership + manager rules.

All membership mutations lock the conversation row first (SELECT ... FOR UPDATE)
so concurrent leaves/removes/promotions are serialized — that's what makes the
'last manager leaves -> promote a random member' rule race-safe.
"""

import asyncpg
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

import realtime
from chat_common import notify_users
from db import pool
from deps import current_user
from serializers import message_public, user_public

router = APIRouter(prefix="/api/conversations", tags=["conversations"])


# --------------------------------------------------------------------------- #
# Serialization
# --------------------------------------------------------------------------- #
async def conv_detail(conv_id: str, viewer_id: str) -> dict:
    conv = await pool().fetchrow(
        "select * from public.conversations where id = $1::uuid", conv_id
    )
    if conv is None:
        raise HTTPException(404, "Conversation not found")

    members = await pool().fetch(
        "select u.id, u.phone, u.username, u.photo_url, u.last_seen, cm.role "
        "from public.conversation_members cm "
        "join public.users u on u.id = cm.user_id "
        "where cm.conversation_id = $1::uuid order by cm.joined_at",
        conv_id,
    )
    member_list = [{**user_public(m), "role": m["role"]} for m in members]
    my_role = next((m["role"] for m in member_list if str(m["id"]) == str(viewer_id)), None)

    other = None
    if conv["type"] == "direct":
        other = next((m for m in member_list if str(m["id"]) != str(viewer_id)), None)
        title = other["username"] if other else "Unknown"
        photo = other["photo_url"] if other else None
    else:
        title = conv["name"]
        photo = conv["photo_url"]

    last = await pool().fetchrow(
        "select * from public.messages where conversation_id = $1::uuid "
        "order by created_at desc limit 1",
        conv_id,
    )
    last_msg = (
        {
            "id": last["id"],
            "body": last["body"],
            "kind": last["kind"],
            "sender_id": last["sender_id"],
            "created_at": last["created_at"],
        }
        if last
        else None
    )
    unread = (
        await pool().fetchval(
            "select count(*) from public.message_receipts r "
            "join public.messages m on m.id = r.message_id "
            "where m.conversation_id = $1::uuid and r.user_id = $2::uuid and r.state <> 'read'",
            conv_id,
            viewer_id,
        )
        or 0
    )
    return {
        "id": conv["id"],
        "type": conv["type"],
        "title": title,
        "photo_url": photo,
        "name": conv["name"],
        "created_by": conv["created_by"],
        "created_at": conv["created_at"],
        "members": member_list,
        "my_role": my_role,
        "other_user": other,
        "last_message": last_msg,
        "unread": unread,
    }


async def _post_system(con, conv_id: str, sender_id: str, text: str):
    return await con.fetchrow(
        "insert into public.messages (conversation_id, sender_id, body, kind) "
        "values ($1::uuid, $2::uuid, $3, 'system') returning *",
        conv_id,
        sender_id,
        text,
    )


async def _broadcast_system(conv_id: str, row, members: list[str]):
    await realtime.broadcast(
        f"conv:{conv_id}", "message.new", message_public(row, [], None)
    )
    await notify_users(members, "conversation.updated", {"conversation_id": conv_id})


# --------------------------------------------------------------------------- #
# Listing / detail
# --------------------------------------------------------------------------- #
@router.get("")
async def list_conversations(user=Depends(current_user)):
    rows = await pool().fetch(
        "select c.id from public.conversations c "
        "join public.conversation_members cm "
        "on cm.conversation_id = c.id and cm.user_id = $1::uuid",
        str(user["id"]),
    )
    details = [await conv_detail(str(r["id"]), str(user["id"])) for r in rows]
    details.sort(
        key=lambda d: (d["last_message"] or {}).get("created_at") or d["created_at"],
        reverse=True,
    )
    return details


@router.get("/{conv_id}")
async def get_conversation(conv_id: str, user=Depends(current_user)):
    await _require_member(conv_id, str(user["id"]))
    return await conv_detail(conv_id, str(user["id"]))


async def _require_member(conv_id: str, user_id: str) -> str:
    role = await pool().fetchval(
        "select role from public.conversation_members "
        "where conversation_id = $1::uuid and user_id = $2::uuid",
        conv_id,
        user_id,
    )
    if role is None:
        raise HTTPException(403, "You are not a member of this conversation")
    return role


# --------------------------------------------------------------------------- #
# Create
# --------------------------------------------------------------------------- #
class DirectIn(BaseModel):
    peer_id: str


@router.post("/direct")
async def create_direct(body: DirectIn, user=Depends(current_user)):
    me = str(user["id"])
    peer = body.peer_id
    if me == peer:
        raise HTTPException(400, "You cannot start a chat with yourself")
    if not await pool().fetchval("select 1 from public.users where id = $1::uuid", peer):
        raise HTTPException(404, "User not found")

    direct_key = ":".join(sorted([me, peer]))
    existing = await pool().fetchval(
        "select id from public.conversations where direct_key = $1", direct_key
    )
    if existing:
        return await conv_detail(str(existing), me)

    try:
        async with pool().acquire() as con:
            async with con.transaction():
                conv = await con.fetchrow(
                    "insert into public.conversations (type, direct_key, created_by) "
                    "values ('direct', $1, $2::uuid) returning id",
                    direct_key,
                    me,
                )
                cid = str(conv["id"])
                for uid in (me, peer):
                    await con.execute(
                        "insert into public.conversation_members "
                        "(conversation_id, user_id, role) values ($1::uuid, $2::uuid, 'member')",
                        cid,
                        uid,
                    )
    except asyncpg.UniqueViolationError:
        existing = await pool().fetchval(
            "select id from public.conversations where direct_key = $1", direct_key
        )
        return await conv_detail(str(existing), me)

    await notify_users([me, peer], "conversation.updated", {"conversation_id": cid})
    return await conv_detail(cid, me)


class GroupIn(BaseModel):
    name: str
    photo_url: str | None = None
    member_ids: list[str] = []


@router.post("/group")
async def create_group(body: GroupIn, user=Depends(current_user)):
    me = str(user["id"])
    name = body.name.strip()
    if not name:
        raise HTTPException(400, "Group name is required")

    async with pool().acquire() as con:
        async with con.transaction():
            conv = await con.fetchrow(
                "insert into public.conversations (type, name, photo_url, created_by) "
                "values ('group', $1, $2, $3::uuid) returning id",
                name,
                body.photo_url,
                me,
            )
            cid = str(conv["id"])
            await con.execute(
                "insert into public.conversation_members (conversation_id, user_id, role) "
                "values ($1::uuid, $2::uuid, 'manager')",
                cid,
                me,
            )
            for mid in [m for m in body.member_ids if m != me]:
                await con.execute(
                    "insert into public.conversation_members (conversation_id, user_id, role) "
                    "values ($1::uuid, $2::uuid, 'member') on conflict do nothing",
                    cid,
                    mid,
                )
            sysmsg = await _post_system(
                con, cid, me, f'{user["username"]} created the group "{name}"'
            )

    members = await _member_ids(cid)
    await _broadcast_system(cid, sysmsg, members)
    return await conv_detail(cid, me)


# --------------------------------------------------------------------------- #
# Membership mutations (manager rules)
# --------------------------------------------------------------------------- #
class AddMembersIn(BaseModel):
    user_ids: list[str]


@router.post("/{conv_id}/members")
async def add_members(conv_id: str, body: AddMembersIn, user=Depends(current_user)):
    me = str(user["id"])
    added_names: list[str] = []
    async with pool().acquire() as con:
        async with con.transaction():
            conv = await con.fetchrow(
                "select id, type from public.conversations where id = $1::uuid for update",
                conv_id,
            )
            if conv is None:
                raise HTTPException(404, "Conversation not found")
            if conv["type"] != "group":
                raise HTTPException(400, "Can only add members to a group")
            role = await con.fetchval(
                "select role from public.conversation_members "
                "where conversation_id = $1::uuid and user_id = $2::uuid",
                conv_id,
                me,
            )
            if role != "manager":
                raise HTTPException(403, "Only managers can add members")
            for uid in body.user_ids:
                uname = await con.fetchval(
                    "select username from public.users where id = $1::uuid", uid
                )
                if not uname:
                    continue
                inserted = await con.fetchval(
                    "insert into public.conversation_members (conversation_id, user_id, role) "
                    "values ($1::uuid, $2::uuid, 'member') on conflict do nothing returning user_id",
                    conv_id,
                    uid,
                )
                if inserted:
                    added_names.append(uname)
            sysmsg = None
            if added_names:
                sysmsg = await _post_system(
                    con, conv_id, me, f'{user["username"]} added {", ".join(added_names)}'
                )

    members = await _member_ids(conv_id)
    if sysmsg is not None:
        await _broadcast_system(conv_id, sysmsg, members + body.user_ids)
    await realtime.broadcast(f"conv:{conv_id}", "members.changed", {"conversation_id": conv_id})
    return await conv_detail(conv_id, me)


@router.post("/{conv_id}/members/{target_id}/promote")
async def promote_member(conv_id: str, target_id: str, user=Depends(current_user)):
    me = str(user["id"])
    async with pool().acquire() as con:
        async with con.transaction():
            conv = await con.fetchrow(
                "select id from public.conversations where id = $1::uuid for update", conv_id
            )
            if conv is None:
                raise HTTPException(404, "Conversation not found")
            actor_role = await con.fetchval(
                "select role from public.conversation_members "
                "where conversation_id = $1::uuid and user_id = $2::uuid",
                conv_id,
                me,
            )
            if actor_role != "manager":
                raise HTTPException(403, "Only managers can promote members")
            target = await con.fetchrow(
                "select role from public.conversation_members "
                "where conversation_id = $1::uuid and user_id = $2::uuid for update",
                conv_id,
                target_id,
            )
            if target is None:
                raise HTTPException(404, "That user is not a member")
            tname = await con.fetchval(
                "select username from public.users where id = $1::uuid", target_id
            )
            await con.execute(
                "update public.conversation_members set role = 'manager' "
                "where conversation_id = $1::uuid and user_id = $2::uuid",
                conv_id,
                target_id,
            )
            sysmsg = await _post_system(
                con, conv_id, me, f"{tname} is now a manager"
            )

    members = await _member_ids(conv_id)
    await _broadcast_system(conv_id, sysmsg, members)
    await realtime.broadcast(f"conv:{conv_id}", "members.changed", {"conversation_id": conv_id})
    return await conv_detail(conv_id, me)


@router.delete("/{conv_id}/members/{target_id}")
async def remove_member(conv_id: str, target_id: str, user=Depends(current_user)):
    """Remove a member, or leave (target == self). Enforces manager rules and
    auto-promotes a random member if the last manager leaves a non-empty group."""
    me = str(user["id"])
    result = {"group_deleted": False, "auto_promoted": None}
    target_name = None

    async with pool().acquire() as con:
        async with con.transaction():
            conv = await con.fetchrow(
                "select id, type from public.conversations where id = $1::uuid for update",
                conv_id,
            )
            if conv is None:
                raise HTTPException(404, "Conversation not found")
            target = await con.fetchrow(
                "select role from public.conversation_members "
                "where conversation_id = $1::uuid and user_id = $2::uuid for update",
                conv_id,
                target_id,
            )
            if target is None:
                raise HTTPException(404, "That user is not a member")
            if target_id != me:
                actor_role = await con.fetchval(
                    "select role from public.conversation_members "
                    "where conversation_id = $1::uuid and user_id = $2::uuid",
                    conv_id,
                    me,
                )
                if actor_role != "manager":
                    raise HTTPException(403, "Only managers can remove members")

            target_name = await con.fetchval(
                "select username from public.users where id = $1::uuid", target_id
            )
            target_was_manager = target["role"] == "manager"
            await con.execute(
                "delete from public.conversation_members "
                "where conversation_id = $1::uuid and user_id = $2::uuid",
                conv_id,
                target_id,
            )
            remaining = await con.fetchval(
                "select count(*) from public.conversation_members where conversation_id = $1::uuid",
                conv_id,
            )
            if remaining == 0:
                await con.execute(
                    "delete from public.conversations where id = $1::uuid", conv_id
                )
                result["group_deleted"] = True
            elif conv["type"] == "group" and target_was_manager:
                mgr_count = await con.fetchval(
                    "select count(*) from public.conversation_members "
                    "where conversation_id = $1::uuid and role = 'manager'",
                    conv_id,
                )
                if mgr_count == 0:
                    new_mgr = await con.fetchval(
                        "select user_id from public.conversation_members "
                        "where conversation_id = $1::uuid order by random() limit 1 for update",
                        conv_id,
                    )
                    await con.execute(
                        "update public.conversation_members set role = 'manager' "
                        "where conversation_id = $1::uuid and user_id = $2",
                        conv_id,
                        new_mgr,
                    )
                    result["auto_promoted"] = str(new_mgr)

    # Notify the removed/left user and (if the group survives) the rest.
    await notify_users([target_id], "conversation.updated", {"conversation_id": conv_id})
    if result["group_deleted"]:
        await realtime.broadcast(f"conv:{conv_id}", "group.deleted", {"conversation_id": conv_id})
        return result

    members = await _member_ids(conv_id)
    verb = "left the group" if target_id == me else "was removed"
    sysmsg = await pool().fetchrow(
        "insert into public.messages (conversation_id, sender_id, body, kind) "
        "values ($1::uuid, $2::uuid, $3, 'system') returning *",
        conv_id,
        me,
        f"{target_name} {verb}",
    )
    await _broadcast_system(conv_id, sysmsg, members)
    if result["auto_promoted"]:
        pname = await pool().fetchval(
            "select username from public.users where id = $1::uuid", result["auto_promoted"]
        )
        promo = await pool().fetchrow(
            "insert into public.messages (conversation_id, sender_id, body, kind) "
            "values ($1::uuid, $2::uuid, $3, 'system') returning *",
            conv_id,
            me,
            f"{pname} was automatically made a manager",
        )
        await _broadcast_system(conv_id, promo, members)
    await realtime.broadcast(f"conv:{conv_id}", "members.changed", {"conversation_id": conv_id})
    return result


@router.delete("/{conv_id}")
async def delete_conversation(conv_id: str, user=Depends(current_user)):
    me = str(user["id"])
    async with pool().acquire() as con:
        async with con.transaction():
            conv = await con.fetchrow(
                "select id, type from public.conversations where id = $1::uuid for update",
                conv_id,
            )
            if conv is None:
                raise HTTPException(404, "Conversation not found")
            role = await con.fetchval(
                "select role from public.conversation_members "
                "where conversation_id = $1::uuid and user_id = $2::uuid",
                conv_id,
                me,
            )
            if conv["type"] == "group" and role != "manager":
                raise HTTPException(403, "Only managers can delete the group")
            members = await _member_ids_con(con, conv_id)
            await con.execute("delete from public.conversations where id = $1::uuid", conv_id)

    await realtime.broadcast(f"conv:{conv_id}", "group.deleted", {"conversation_id": conv_id})
    await notify_users(members, "conversation.updated", {"conversation_id": conv_id})
    return {"ok": True}


# --------------------------------------------------------------------------- #
async def _member_ids(conv_id: str) -> list[str]:
    rows = await pool().fetch(
        "select user_id from public.conversation_members where conversation_id = $1::uuid",
        conv_id,
    )
    return [str(r["user_id"]) for r in rows]


async def _member_ids_con(con, conv_id: str) -> list[str]:
    rows = await con.fetch(
        "select user_id from public.conversation_members where conversation_id = $1::uuid",
        conv_id,
    )
    return [str(r["user_id"]) for r in rows]

"""User directory + profile update."""

from fastapi import APIRouter, Depends
from pydantic import BaseModel

from db import pool
from deps import current_user
from serializers import user_public

router = APIRouter(prefix="/api/users", tags=["users"])


@router.get("")
async def list_users(search: str = "", user=Depends(current_user)):
    like = f"%{search.strip().lower()}%"
    rows = await pool().fetch(
        "select id, phone, username, photo_url, last_seen from public.users "
        "where id <> $1::uuid and (lower(username) like $2 or phone like $2) "
        "order by username limit 50",
        str(user["id"]),
        like,
    )
    return [user_public(r) for r in rows]


class ProfileIn(BaseModel):
    username: str | None = None
    photo_url: str | None = None


@router.patch("/me")
async def update_me(body: ProfileIn, user=Depends(current_user)):
    await pool().execute(
        "update public.users set username = coalesce($2, username), "
        "photo_url = coalesce($3, photo_url) where id = $1::uuid",
        str(user["id"]),
        body.username.strip() if body.username else None,
        body.photo_url,
    )
    row = await pool().fetchrow(
        "select id, phone, username, photo_url, last_seen from public.users where id = $1::uuid",
        str(user["id"]),
    )
    return user_public(row)

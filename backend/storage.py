"""Upload files to Supabase Storage (server-side, service-role key)."""

import os
import uuid

import httpx

SUPABASE_URL = os.environ.get("SUPABASE_URL", "http://127.0.0.1:54321")
KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")
BUCKET = os.environ.get("STORAGE_BUCKET", "media")


def _safe_name(name: str) -> str:
    keep = "-_.() "
    cleaned = "".join(c for c in name if c.isalnum() or c in keep).strip()
    return cleaned or "file"


async def upload(data: bytes, filename: str, content_type: str) -> dict:
    path = f"{uuid.uuid4().hex}/{_safe_name(filename)}"
    async with httpx.AsyncClient(timeout=30.0) as client:
        resp = await client.post(
            f"{SUPABASE_URL}/storage/v1/object/{BUCKET}/{path}",
            headers={
                "apikey": KEY,
                "Authorization": f"Bearer {KEY}",
                "Content-Type": content_type or "application/octet-stream",
                "x-upsert": "true",
            },
            content=data,
        )
        resp.raise_for_status()
    return {
        "storage_path": f"{BUCKET}/{path}",
        "url": f"{SUPABASE_URL}/storage/v1/object/public/{BUCKET}/{path}",
    }

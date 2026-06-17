"""File uploads -> Supabase Storage. Used for avatars, group photos, attachments."""

from fastapi import APIRouter, Depends, File, UploadFile

import storage
from deps import current_user

router = APIRouter(prefix="/api", tags=["uploads"])


@router.post("/uploads")
async def upload_file(file: UploadFile = File(...), user=Depends(current_user)):
    data = await file.read()
    result = await storage.upload(
        data, file.filename or "file", file.content_type or "application/octet-stream"
    )
    return {
        **result,
        "mime_type": file.content_type or "application/octet-stream",
        "size_bytes": len(data),
        "file_name": file.filename,
    }

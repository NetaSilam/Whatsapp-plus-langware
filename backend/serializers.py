"""Shape DB rows into JSON-friendly dicts. FastAPI encodes UUID/datetime."""


def user_public(row) -> dict | None:
    if row is None:
        return None
    return {
        "id": row["id"],
        "phone": row["phone"],
        "username": row["username"],
        "photo_url": row["photo_url"],
        "last_seen": row["last_seen"],
    }


def message_public(row, attachments: list | None = None, status: str | None = None) -> dict:
    return {
        "id": row["id"],
        "conversation_id": row["conversation_id"],
        "sender_id": row["sender_id"],
        "body": row["body"],
        "kind": row["kind"],
        "client_msg_id": row["client_msg_id"],
        "created_at": row["created_at"],
        "attachments": attachments or [],
        "status": status,  # sender's aggregate: sent|delivered|read (None for others)
    }

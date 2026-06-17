"""Server -> client realtime via Supabase Realtime's HTTP broadcast API.

Clients subscribe to channels (e.g. `conv:<id>`) with the anon key; the backend
pushes events to those topics over REST. Used for message.new and
receipt.update. Presence is handled entirely client-side.
"""

import os

import httpx

SUPABASE_URL = os.environ.get("SUPABASE_URL", "http://127.0.0.1:54321")
KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")

_client: httpx.AsyncClient | None = None


async def init() -> None:
    global _client
    _client = httpx.AsyncClient(timeout=5.0)


async def close() -> None:
    global _client
    if _client is not None:
        await _client.aclose()
        _client = None


async def broadcast(topic: str, event: str, payload: dict) -> None:
    """Fire-and-forget broadcast; never raise into the request path."""
    if _client is None:
        return
    try:
        await _client.post(
            f"{SUPABASE_URL}/realtime/v1/api/broadcast",
            headers={
                "apikey": KEY,
                "Authorization": f"Bearer {KEY}",
                "Content-Type": "application/json",
            },
            json={"messages": [{"topic": topic, "event": event, "payload": payload}]},
        )
    except Exception as exc:  # noqa: BLE001 — realtime is best-effort
        print(f"[realtime] broadcast to {topic} failed: {exc}")

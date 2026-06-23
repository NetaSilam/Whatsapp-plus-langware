"""FastAPI backend.

Run with: .venv/bin/uvicorn main:app --reload --port 8080

In development the Next.js frontend proxies /api/* here (next.config.ts
rewrite), so browser code calls relative /api/... paths on port 3000.
Interactive docs: http://localhost:8080/docs
"""

from __future__ import annotations

import asyncio
import logging
import os
import sys
from typing import Dict, List, Optional

import httpx
from dotenv import load_dotenv
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, status
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

load_dotenv()

logging.basicConfig(level=logging.INFO)
log = logging.getLogger("whatsapp-plus")

SUPABASE_URL = os.environ.get(
    "NEXT_PUBLIC_SUPABASE_URL", "http://127.0.0.1:54321"
)
SUPABASE_ANON_KEY = os.environ.get("NEXT_PUBLIC_SUPABASE_ANON_KEY", "")

app = FastAPI(title="Web App API", version="0.1.0")

# CORS for direct (non-proxied) calls from the dev frontend.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class HealthResponse(BaseModel):
    status: str
    service: str


@app.get("/api/health", response_model=HealthResponse)
async def health() -> HealthResponse:
    """Health check — also used by the landing-page status board."""
    return HealthResponse(status="ok", service="fastapi")


class EchoRequest(BaseModel):
    text: str


@app.post("/api/echo")
async def echo(req: EchoRequest) -> dict:
    """Example endpoint — replace with real Python-powered routes."""
    return {"echo": req.text}


# ---------------------------------------------------------------------------
# Shared terminals: PTY rooms over WebSockets
# ---------------------------------------------------------------------------

# pywinpty is Windows-only. The fallback is intentionally empty — Phase 6 is
# scoped to Windows. Swap in a unix `pty` shim if/when this needs to run on
# Linux.
if sys.platform == "win32":
    from winpty import PtyProcess  # type: ignore
else:  # pragma: no cover
    PtyProcess = None  # type: ignore


class TerminalRoom:
    """One PTY shared by multiple WebSocket clients.

    The PTY starts lazily on the first client connect and stays alive for the
    lifetime of this backend process. Output read in a thread (pty.read is
    blocking) and fanned out to every client; input from any client is
    written straight to the PTY.
    """

    def __init__(self, terminal_id: str) -> None:
        self.terminal_id = terminal_id
        self.pty: Optional["PtyProcess"] = None
        self.clients: List[WebSocket] = []
        self.reader_task: Optional[asyncio.Task] = None
        self.lock = asyncio.Lock()

    async def attach(self, ws: WebSocket) -> None:
        async with self.lock:
            if self.pty is None:
                self._spawn()
                self.reader_task = asyncio.create_task(self._read_loop())
            self.clients.append(ws)

    async def detach(self, ws: WebSocket) -> None:
        async with self.lock:
            if ws in self.clients:
                self.clients.remove(ws)

    def _spawn(self) -> None:
        if PtyProcess is None:
            raise RuntimeError("pywinpty not available on this platform")
        # Use PowerShell on Windows. `-NoLogo` skips the copyright banner.
        cmd = ["powershell.exe", "-NoLogo"]
        log.info("Spawning PTY for terminal %s: %s", self.terminal_id, cmd)
        self.pty = PtyProcess.spawn(cmd, dimensions=(24, 80))

    async def write_input(self, data: str) -> None:
        if self.pty is None:
            return
        loop = asyncio.get_running_loop()
        await loop.run_in_executor(None, self.pty.write, data)

    async def _read_loop(self) -> None:
        loop = asyncio.get_running_loop()
        assert self.pty is not None
        try:
            while True:
                try:
                    chunk = await loop.run_in_executor(
                        None, self.pty.read, 4096
                    )
                except EOFError:
                    break
                except Exception as exc:  # noqa: BLE001
                    log.warning("PTY read error on %s: %s", self.terminal_id, exc)
                    break
                if not chunk:
                    # Sleep briefly to avoid pegging CPU when no output.
                    await asyncio.sleep(0.05)
                    continue
                await self._broadcast(chunk)
        finally:
            log.info("PTY reader exit for terminal %s", self.terminal_id)

    async def _broadcast(self, data: str) -> None:
        dead: List[WebSocket] = []
        for ws in list(self.clients):
            try:
                await ws.send_text(data)
            except Exception:  # noqa: BLE001
                dead.append(ws)
        for ws in dead:
            if ws in self.clients:
                self.clients.remove(ws)


rooms: Dict[str, TerminalRoom] = {}
rooms_lock = asyncio.Lock()


async def _supabase_get(path: str, token: str) -> httpx.Response:
    async with httpx.AsyncClient(timeout=5.0) as client:
        return await client.get(
            f"{SUPABASE_URL}{path}",
            headers={
                "apikey": SUPABASE_ANON_KEY,
                "Authorization": f"Bearer {token}",
            },
        )


@app.websocket("/api/ws/terminal/{terminal_id}")
async def terminal_ws(websocket: WebSocket, terminal_id: str) -> None:
    """Bidirectional PTY stream for one shared terminal.

    Auth: client passes a Supabase access token via the `token` query param.
    The backend verifies the JWT against Supabase, then verifies terminal
    membership (RLS will return an empty list to non-members).
    """
    # Accept first, then enforce auth — closing AFTER accept lets us send a
    # CLOSE frame with a meaningful code (4401/4403) that the browser receives
    # in ws.onclose. Closing before accept turns into HTTP 403 with no code.
    await websocket.accept()

    token = websocket.query_params.get("token", "")
    if not token:
        await websocket.close(code=4401, reason="missing token")
        return

    try:
        u = await _supabase_get("/auth/v1/user", token)
    except httpx.RequestError as exc:
        log.warning("auth lookup failed: %s", exc)
        await websocket.close(code=4500, reason="auth service unreachable")
        return
    if u.status_code != 200:
        await websocket.close(code=4401, reason="invalid token")
        return

    try:
        m = await _supabase_get(
            f"/rest/v1/terminal_members"
            f"?select=user_id&terminal_id=eq.{terminal_id}&limit=1",
            token,
        )
    except httpx.RequestError as exc:
        log.warning("membership lookup failed: %s", exc)
        await websocket.close(code=4500, reason="membership lookup failed")
        return
    if m.status_code != 200 or not m.json():
        await websocket.close(code=4403, reason="not a member")
        return

    async with rooms_lock:
        room = rooms.get(terminal_id)
        if room is None:
            room = TerminalRoom(terminal_id)
            rooms[terminal_id] = room

    await room.attach(websocket)
    log.info(
        "Client attached to terminal %s (now %d clients)",
        terminal_id,
        len(room.clients),
    )

    try:
        while True:
            data = await websocket.receive_text()
            await room.write_input(data)
    except WebSocketDisconnect:
        pass
    finally:
        await room.detach(websocket)
        log.info(
            "Client detached from terminal %s (now %d clients)",
            terminal_id,
            len(room.clients),
        )


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8080)

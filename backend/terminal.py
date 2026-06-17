"""Live shared terminal: one disposable Docker container per conversation,
multiplexed to every connected member over a FastAPI WebSocket.

- First member to join boots a sandboxed container (`/bin/sh` in a TTY).
- A background thread reads the container's PTY and fans output to all members.
- Any member's keystrokes are written to the single shared PTY, so everyone
  sees the same live session (the TTY echoes typed input to all viewers).
- Idle/empty or over-age containers are reaped by a sweeper.

Security: network disabled, memory + pid capped, all Linux capabilities
dropped, no-new-privileges. Containers are ephemeral and removed on teardown.
"""

import asyncio
import base64
import os
import secrets
import threading
import time

import docker
from fastapi import APIRouter, Depends, HTTPException, WebSocket, WebSocketDisconnect
from pydantic import BaseModel

from db import pool
from deps import current_user
from security import create_token, decode_token

IMAGE = os.environ.get("TERMINAL_IMAGE", "alpine:3.20")
MAX_ROOMS = 10
IDLE_EMPTY_SECS = 60
MAX_LIFETIME_SECS = 30 * 60
BUFFER_CAP = 64 * 1024

router = APIRouter(tags=["terminal"])


class Room:
    def __init__(self, conv_id: str):
        self.conv_id = conv_id
        self.clients: set[WebSocket] = set()
        self.usernames: dict[WebSocket, str] = {}
        self.container = None
        self.sock = None
        self.raw = None
        self.reader: threading.Thread | None = None
        self.buffer = bytearray()
        self.loop: asyncio.AbstractEventLoop | None = None
        self.closed = False
        self.starting = asyncio.Lock()
        self.started_at = time.time()
        self.last_activity = time.time()
        self.cols = 80
        self.rows = 24


class TerminalManager:
    def __init__(self):
        self.rooms: dict[str, Room] = {}
        self.docker = None
        self.docker_ok = False
        self._sweeper: asyncio.Task | None = None

    # ----------------------------- lifecycle ----------------------------- #
    async def startup(self):
        loop = asyncio.get_running_loop()
        try:
            self.docker = await loop.run_in_executor(None, docker.from_env)
            await loop.run_in_executor(None, self.docker.ping)
            self.docker_ok = True
            await loop.run_in_executor(None, self._cleanup_orphans)
        except Exception as exc:  # noqa: BLE001
            print(f"[terminal] Docker unavailable: {exc}")
            self.docker_ok = False
        try:
            await pool().execute(
                "update public.terminal_sessions set status = 'stopped', stopped_at = now() "
                "where status <> 'stopped'"
            )
        except Exception:
            pass
        self._sweeper = asyncio.create_task(self._sweep())

    def _cleanup_orphans(self):
        try:
            for c in self.docker.containers.list(all=True, filters={"label": "app=chat-terminal"}):
                try:
                    c.remove(force=True)
                except Exception:
                    pass
        except Exception:
            pass

    async def shutdown(self):
        if self._sweeper:
            self._sweeper.cancel()
        for room in list(self.rooms.values()):
            await self._teardown(room)

    # ------------------------------- join -------------------------------- #
    async def join(self, conv_id: str, ws: WebSocket, user_id: str, username: str) -> bool:
        loop = asyncio.get_running_loop()
        room = self.rooms.get(conv_id)
        if room is None:
            active = len([r for r in self.rooms.values() if not r.closed])
            if active >= MAX_ROOMS:
                await ws.send_json(
                    {"type": "error", "message": "Too many active terminals on the server."}
                )
                return False
            room = Room(conv_id)
            room.loop = loop
            self.rooms[conv_id] = room

        room.clients.add(ws)
        room.usernames[ws] = username

        async with room.starting:
            if room.container is None and not room.closed:
                if not self.docker_ok:
                    await ws.send_json(
                        {
                            "type": "error",
                            "message": "Docker isn't running on the server — the shared terminal is unavailable.",
                        }
                    )
                    room.clients.discard(ws)
                    return False
                try:
                    await loop.run_in_executor(None, self._start_container, room)
                    await pool().execute(
                        "insert into public.terminal_sessions "
                        "(conversation_id, container_id, status, started_by) "
                        "values ($1::uuid, $2, 'running', $3::uuid)",
                        conv_id,
                        room.container.id,
                        user_id,
                    )
                except Exception as exc:  # noqa: BLE001
                    print(f"[terminal] start failed: {exc}")
                    await ws.send_json(
                        {"type": "error", "message": f"Failed to start terminal: {exc}"}
                    )
                    room.clients.discard(ws)
                    return False

        await ws.send_json({"type": "ready", "cols": room.cols, "rows": room.rows})
        if room.buffer:
            await ws.send_json(
                {"type": "output", "data": base64.b64encode(bytes(room.buffer)).decode()}
            )
        await self._broadcast(room, {"type": "joined", "username": username}, exclude=ws)
        return True

    def _start_container(self, room: Room):
        name = f"chatterm-{room.conv_id[:8]}-{secrets.token_hex(3)}"
        container = self.docker.containers.run(
            IMAGE,
            command=["/bin/sh"],
            detach=True,
            tty=True,
            stdin_open=True,
            network_disabled=True,
            mem_limit="256m",
            pids_limit=128,
            cap_drop=["ALL"],
            security_opt=["no-new-privileges:true"],
            labels={"app": "chat-terminal", "conv": room.conv_id},
            name=name,
            environment={"TERM": "xterm"},
            working_dir="/root",
            hostname="sandbox",
        )
        room.container = container
        sock = container.attach_socket(
            params={"stdin": 1, "stdout": 1, "stderr": 1, "stream": 1}
        )
        room.sock = sock
        room.raw = getattr(sock, "_sock", None) or sock
        try:
            room.raw.settimeout(None)
        except Exception:
            pass
        room.reader = threading.Thread(target=self._read_loop, args=(room,), daemon=True)
        room.reader.start()
        try:
            self._send(room.raw, b"\n")
        except Exception:
            pass

    # ----------------------------- I/O loops ----------------------------- #
    @staticmethod
    def _send(raw, data: bytes):
        if hasattr(raw, "sendall"):
            raw.sendall(data)
        else:
            raw.send(data)

    def _read_loop(self, room: Room):
        raw = room.raw
        while not room.closed:
            try:
                data = raw.recv(4096)
            except Exception:
                break
            if not data:
                break
            room.buffer += data
            if len(room.buffer) > BUFFER_CAP:
                del room.buffer[: len(room.buffer) - BUFFER_CAP]
            room.last_activity = time.time()
            try:
                fut = asyncio.run_coroutine_threadsafe(
                    self._broadcast(
                        room,
                        {"type": "output", "data": base64.b64encode(data).decode()},
                    ),
                    room.loop,
                )
                fut.result(timeout=5)
            except Exception:
                pass
        try:
            asyncio.run_coroutine_threadsafe(self._on_exit(room), room.loop)
        except Exception:
            pass

    async def handle(self, conv_id: str, ws: WebSocket, msg: dict):
        room = self.rooms.get(conv_id)
        if not room or room.closed or room.raw is None:
            return
        kind = msg.get("type")
        if kind == "input":
            room.last_activity = time.time()
            data = (msg.get("data") or "").encode()
            try:
                await room.loop.run_in_executor(None, self._send, room.raw, data)
            except Exception as exc:  # noqa: BLE001
                print(f"[terminal] write failed: {exc}")
        elif kind == "resize":
            room.cols = int(msg.get("cols", 80))
            room.rows = int(msg.get("rows", 24))
            if room.container is not None:
                try:
                    await room.loop.run_in_executor(
                        None,
                        lambda: room.container.resize(height=room.rows, width=room.cols),
                    )
                except Exception:
                    pass
        elif kind == "ping":
            try:
                await ws.send_json({"type": "pong"})
            except Exception:
                pass

    async def leave(self, conv_id: str, ws: WebSocket, username: str):
        room = self.rooms.get(conv_id)
        if not room:
            return
        room.clients.discard(ws)
        room.usernames.pop(ws, None)
        await self._broadcast(room, {"type": "left", "username": username})
        if not room.clients:
            room.last_activity = time.time()

    # ----------------------------- helpers ------------------------------- #
    async def _broadcast(self, room: Room, msg: dict, exclude: WebSocket | None = None):
        dead = []
        for c in list(room.clients):
            if c is exclude:
                continue
            try:
                await c.send_json(msg)
            except Exception:
                dead.append(c)
        for c in dead:
            room.clients.discard(c)

    async def _on_exit(self, room: Room):
        if room.closed:
            return
        await self._broadcast(room, {"type": "closed", "reason": "Terminal session ended"})
        await self._teardown(room)

    async def _teardown(self, room: Room):
        if room.closed:
            return
        room.closed = True
        loop = asyncio.get_running_loop()

        def _kill():
            try:
                if room.sock is not None:
                    try:
                        room.sock.close()
                    except Exception:
                        pass
                if room.container is not None:
                    room.container.remove(force=True)
            except Exception:
                pass

        try:
            await loop.run_in_executor(None, _kill)
        except Exception:
            pass
        try:
            await pool().execute(
                "update public.terminal_sessions set status = 'stopped', stopped_at = now() "
                "where conversation_id = $1::uuid and status <> 'stopped'",
                room.conv_id,
            )
        except Exception:
            pass
        self.rooms.pop(room.conv_id, None)

    async def _sweep(self):
        while True:
            try:
                await asyncio.sleep(20)
                now = time.time()
                for room in list(self.rooms.values()):
                    if room.closed:
                        continue
                    idle_empty = not room.clients and (now - room.last_activity) > IDLE_EMPTY_SECS
                    too_old = (now - room.started_at) > MAX_LIFETIME_SECS
                    if idle_empty or too_old:
                        if room.clients:
                            await self._broadcast(
                                room, {"type": "closed", "reason": "Terminal closed (timeout)"}
                            )
                        await self._teardown(room)
            except asyncio.CancelledError:
                break
            except Exception:
                pass


terminal_manager = TerminalManager()


# --------------------------------- routes --------------------------------- #
class TicketIn(BaseModel):
    conversation_id: str


async def _require_member(conv_id: str, user_id: str):
    member = await pool().fetchval(
        "select 1 from public.conversation_members "
        "where conversation_id = $1::uuid and user_id = $2::uuid",
        conv_id,
        user_id,
    )
    if not member:
        raise HTTPException(403, "You are not a member of this conversation")


@router.post("/api/terminal/ticket")
async def terminal_ticket(body: TicketIn, user=Depends(current_user)):
    await _require_member(body.conversation_id, str(user["id"]))
    ticket = create_token(
        str(user["id"]),
        kind="ws-terminal",
        ttl=60,
        conv=body.conversation_id,
        username=user["username"],
    )
    return {"ticket": ticket}


@router.get("/api/conversations/{conv_id}/terminal")
async def terminal_status(conv_id: str, user=Depends(current_user)):
    await _require_member(conv_id, str(user["id"]))
    room = terminal_manager.rooms.get(conv_id)
    live = room is not None and not room.closed and room.container is not None
    return {
        "live": live,
        "participants": len(room.clients) if room else 0,
        "docker_available": terminal_manager.docker_ok,
    }


@router.websocket("/ws/terminal/{conv_id}")
async def terminal_ws(ws: WebSocket, conv_id: str, ticket: str = ""):
    # Accept first so the client receives a meaningful close code on rejection
    # (closing before accept rejects the handshake as a bare HTTP 403 instead).
    await ws.accept()
    try:
        payload = decode_token(ticket)
        if payload.get("kind") != "ws-terminal" or payload.get("conv") != conv_id:
            raise ValueError("bad ticket")
        user_id = payload["sub"]
        username = payload.get("username", "User")
    except Exception:
        await ws.close(code=4401)
        return

    member = await pool().fetchval(
        "select 1 from public.conversation_members "
        "where conversation_id = $1::uuid and user_id = $2::uuid",
        conv_id,
        user_id,
    )
    if not member:
        await ws.close(code=4403)
        return

    ok = await terminal_manager.join(conv_id, ws, user_id, username)
    if not ok:
        await ws.close()
        return
    try:
        while True:
            msg = await ws.receive_json()
            await terminal_manager.handle(conv_id, ws, msg)
    except WebSocketDisconnect:
        pass
    except Exception:
        pass
    finally:
        await terminal_manager.leave(conv_id, ws, username)

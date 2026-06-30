"""PTY-backed terminal over WebSocket.

Spawns a shared PowerShell via ConPTY (pywinpty) and bridges it to xterm.js
clients. Multiple authenticated WebSocket clients can connect to the same
terminal_id and share the live session. The process is killed when the last
client disconnects.
"""

import asyncio
import json
import logging
from dataclasses import dataclass, field

from fastapi import HTTPException, WebSocket, WebSocketDisconnect
from winpty import PtyProcess

from auth import decode_token

log = logging.getLogger("terminal")


@dataclass
class _Session:
    proc: PtyProcess
    clients: set[WebSocket] = field(default_factory=set)
    pump_task: asyncio.Task | None = field(default=None, repr=False)


_sessions: dict[str, _Session] = {}
_lock = asyncio.Lock()


async def _pump(session: _Session, terminal_id: str) -> None:
    """Broadcast PTY output to all connected WebSocket clients."""
    loop = asyncio.get_running_loop()
    log.info("[%s] pump started", terminal_id[:8])
    try:
        while True:
            data = await loop.run_in_executor(None, session.proc.read, 4096)
            if not data:
                break
            dead: list[WebSocket] = []
            for ws in list(session.clients):
                try:
                    await ws.send_text(data)
                except Exception:
                    dead.append(ws)
            for ws in dead:
                session.clients.discard(ws)
    except (EOFError, RuntimeError):
        pass
    finally:
        for ws in list(session.clients):
            try:
                await ws.send_text("\r\n\x1b[31m*** disconnected ***\x1b[0m")
                await ws.close()
            except Exception:
                pass
        async with _lock:
            _sessions.pop(terminal_id, None)


async def terminal_session(ws: WebSocket, terminal_id: str, token: str) -> None:
    try:
        decode_token(token)
    except HTTPException:
        await ws.close(code=1008)
        return

    await ws.accept()

    async with _lock:
        if terminal_id not in _sessions:
            proc = PtyProcess.spawn(["powershell.exe", "-NoLogo"], dimensions=(24, 80))
            session = _Session(proc=proc)
            session.pump_task = asyncio.create_task(_pump(session, terminal_id))
            _sessions[terminal_id] = session
            log.info("[%s] session created", terminal_id[:8])
        else:
            session = _sessions[terminal_id]
            log.info("[%s] client joined existing session", terminal_id[:8])
        session.clients.add(ws)

    try:
        while True:
            raw = await ws.receive_text()
            try:
                msg = json.loads(raw)
            except json.JSONDecodeError:
                session.proc.write(raw)
                continue
            kind = msg.get("type")
            if kind == "input":
                session.proc.write(msg.get("data", ""))
            elif kind == "resize":
                try:
                    session.proc.setwinsize(
                        int(msg.get("rows", 24)), int(msg.get("cols", 80))
                    )
                except (ValueError, OSError):
                    pass
    except WebSocketDisconnect:
        pass
    finally:
        session.clients.discard(ws)
        if not session.clients:
            async with _lock:
                _sessions.pop(terminal_id, None)
            try:
                session.proc.terminate(force=True)
            except Exception:
                pass
            if session.pump_task:
                session.pump_task.cancel()
            log.info("[%s] session closed", terminal_id[:8])

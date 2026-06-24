"""PTY-backed terminal over a WebSocket.

Spawns a host PowerShell via ConPTY (pywinpty) and bridges it to an xterm.js
client: a background thread reads PTY output and forwards it to the socket;
inbound socket messages are JSON ({"type":"input"|"resize", ...}). Dev-only —
this runs real shell commands on the host with no sandbox.
"""

import asyncio
import json

from fastapi import HTTPException, WebSocket, WebSocketDisconnect
from winpty import PtyProcess

from auth import decode_token


async def terminal_session(ws: WebSocket, terminal_id: str, token: str) -> None:
    # Authenticate before accepting: the browser passes the Supabase access
    # token as a query param (WebSockets can't set Authorization headers).
    try:
        decode_token(token)
    except HTTPException:
        await ws.close(code=1008)  # policy violation
        return

    await ws.accept()
    proc = PtyProcess.spawn(["powershell.exe", "-NoLogo"], dimensions=(24, 80))
    loop = asyncio.get_running_loop()

    async def pump_output() -> None:
        try:
            while True:
                data = await loop.run_in_executor(None, proc.read, 4096)
                if not data:
                    break
                await ws.send_text(data)
        except (EOFError, WebSocketDisconnect, RuntimeError):
            pass
        finally:
            try:
                await ws.close()
            except RuntimeError:
                pass

    out_task = asyncio.create_task(pump_output())
    try:
        while True:
            raw = await ws.receive_text()
            try:
                msg = json.loads(raw)
            except json.JSONDecodeError:
                proc.write(raw)
                continue
            kind = msg.get("type")
            if kind == "input":
                proc.write(msg.get("data", ""))
            elif kind == "resize":
                try:
                    proc.setwinsize(int(msg.get("rows", 24)), int(msg.get("cols", 80)))
                except (ValueError, OSError):
                    pass
    except WebSocketDisconnect:
        pass
    finally:
        out_task.cancel()
        try:
            proc.terminate(force=True)
        except Exception:
            pass

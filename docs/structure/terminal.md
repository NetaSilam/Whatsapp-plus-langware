# Shared terminal (the headline feature)

A live shell shared by all members of a chat/group: anyone types, everyone sees
the same session and its output in real time. Backed by a disposable **Docker
container per conversation**, streamed over a FastAPI WebSocket.

- Backend: [`backend/terminal.py`](../../backend/terminal.py)
- Frontend: [`frontend/components/terminal-panel.tsx`](../../frontend/components/terminal-panel.tsx) (xterm.js)

## Connection & auth
1. The client calls `POST /api/terminal/ticket { conversation_id }`. The backend
   verifies membership and mints a short-lived (60s) signed JWT ticket.
2. The client opens `ws://<backend>/ws/terminal/{id}?ticket=…` **directly** to
   FastAPI (Next rewrites don't proxy WebSockets; `NEXT_PUBLIC_API_WS_URL`).
3. The server validates the ticket and re-checks membership before attaching.

## How it's shared (one PTY, N sockets)
The `TerminalManager` keeps an in-process room registry keyed by conversation:
- **First join** runs a container (`/bin/sh`, TTY) and starts one background
  thread reading the container's attached socket; output is base64-framed and
  fanned out to every connected client. A 64 KB ring buffer is replayed to late
  joiners as scrollback.
- **Every client's keystrokes** are written to that single PTY (writes guarded
  by a per-room lock). Because it's a TTY, typed input echoes to all viewers —
  so everyone sees the same live session.

## Protocol (JSON frames)
- client → server: `input{data}`, `resize{cols,rows}`, `ping`
- server → client: `ready{cols,rows}`, `output{data: base64}`, `joined{username}`,
  `left{username}`, `closed{reason}`, `error{message}`, `pong`

## Sandboxing & lifecycle
Containers are created with: `network_disabled=True`, `mem_limit=256m`,
`pids_limit=128`, `cap_drop=["ALL"]`, `no-new-privileges`, label
`app=chat-terminal`. A sweeper reaps containers that are empty/idle (>60s) or
over a max lifetime (30 min); orphans are cleaned on startup. There's a global
cap on concurrent containers. `terminal_sessions` tracks status in the DB (with
an EXCLUDE constraint guaranteeing one live session per conversation).

## Degradation
If Docker isn't running, the WebSocket sends an `error` frame and the panel
shows the reason instead of crashing.

> Security note for the interview: this runs real commands in an isolated,
> network-disabled, throwaway container. It's a deliberate sandbox; in
> production you'd additionally pin a read-only rootfs, run as a non-root user,
> and tighten CPU/disk quotas.

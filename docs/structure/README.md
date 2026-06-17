# Architecture & Structure

A WhatsApp-style chat app. Per-part structure docs:

- [database.md](./database.md) — schema, tables, RLS stance, storage.
- [backend.md](./backend.md) — FastAPI modules, endpoints, auth, manager rules.
- [frontend.md](./frontend.md) — Next.js routes, components, state, data flow.
- [realtime.md](./realtime.md) — presence, message delivery, receipt state machine.
- [terminal.md](./terminal.md) — the live shared Docker terminal.

## High-level shape

```
Browser (Next.js 16 @ :3000)
  │  relative /api/* fetches (cookies)        Supabase Realtime (broadcast+presence)
  │                                            ▲                    │ ws (anon key)
  ▼  Next rewrite proxy                        │ HTTP broadcast      ▼
FastAPI (@ :8080) ──────────────────────────► (server pushes)   Browser channels
  │  asyncpg (postgres role, bypasses RLS)
  ▼
Supabase Postgres (@ :54322)  +  Supabase Storage (bucket: media)

Browser ── ws (ticket) ──► FastAPI /ws/terminal/* ──► Docker container (per room)
```

## Ports
| Service            | Port  |
|--------------------|-------|
| Next.js frontend   | 3000  |
| FastAPI backend    | 8080  |
| Supabase API       | 54321 |
| Supabase Postgres  | 54322 |
| Supabase Studio    | 54323 |

## Key design choices
- **Single source of truth for data:** FastAPI over a direct `DATABASE_URL`
  connection (the `postgres` role bypasses RLS). The browser never queries
  Postgres directly — it only uses Supabase Realtime channels as a message bus.
- **Auth:** custom phone + on-screen OTP; a signed JWT in an httpOnly `session`
  cookie. The cookie is set by FastAPI and travels transparently through the
  Next rewrite proxy.
- **Realtime split:** Supabase Realtime for chat/presence/receipts (least
  code); a dedicated FastAPI WebSocket for the terminal (it needs a server-side
  PTY/Docker, which Supabase can't provide).

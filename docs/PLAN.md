# Plan — WhatsApp-like Web App ("interview build")

> This is the approved build plan. For how each part is actually structured, see
> [`structure/`](./structure/).

## Goal
A WhatsApp-style web app to demo in a job interview. It must *really work*
(real persistence, real-time, a real shared terminal) while staying **free and
runnable locally**. Built on the `web-app-builder` template (Next.js 16 +
FastAPI + Supabase Postgres + Drizzle), then customized.

## Features
1. **Registration** — phone number + username + optional photo, WhatsApp-style
   OTP (mock: the 6-digit code is shown on screen — free & offline).
2. **1:1 chat** — send/receive messages in real time.
3. **Groups** — name + photo; **managers** (creator is first manager; only
   managers promote others, add/remove members; **last manager leaving
   auto-promotes a random member**; managers delete the group).
4. **Attachments** — images and files in chats and groups.
5. **Status** — online / "last seen" under the name; sent / delivered / read
   checkmarks (✓ / ✓✓ / blue ✓✓), group reads go blue only when *everyone* read.
6. **Shared terminal** — a live shared shell per chat/group, backed by a
   **Docker container**, streamed over a WebSocket so all members see one session.

## Locked decisions
- **Auth:** custom phone + on-screen OTP, signed-JWT httpOnly `session` cookie.
- **Terminal isolation:** one disposable, network-disabled, resource-capped
  **Docker container per room**.
- **Realtime transport:** Supabase Realtime (broadcast + presence) for chat,
  presence and receipts; FastAPI **WebSocket** for the terminal only.

## Build phases (all completed)
0. Bootstrap template, run `setup.py`, start Supabase, wire env.
1. Schema migration + Drizzle mirror + storage bucket.
2. Backend: auth/OTP, users, conversations, members (manager rules), messages,
   receipts, presence, uploads.
3. Backend: shared-terminal WebSocket + Docker manager.
4. Frontend: auth pages, chat list, chat view, groups, attachments, terminal,
   realtime wiring.
5. Verify end-to-end; seed 3 demo users (Alice, Bob, Carol).

## Verification
- API-level: auth, receipt state machine, manager rules, realtime broadcast,
  cookie-through-proxy, and the terminal WebSocket all tested and passing.
- `npx tsc --noEmit` clean; all routes compile and serve.
- Demo seed: `backend/seed_demo.py` creates the 3 users + a 1:1 + a group.

## Risks / notes
- **Docker must be running** (used by both Supabase and the terminal).
- Realtime uses **broadcast** channels (not Postgres-changes + RLS) to stay
  simple with custom auth — in production you'd bind RLS to real auth JWTs.
- Real SMS would be a drop-in swap at the OTP "send" step (Twilio etc.).

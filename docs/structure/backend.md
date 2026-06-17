# Backend (FastAPI)

Entry point [`backend/main.py`](../../backend/main.py) — creates the app, CORS,
a lifespan that opens the asyncpg pool / realtime client / terminal manager, and
includes the routers. Run:

```
cd backend && .venv/Scripts/uvicorn main:app --reload --port 8080   # Windows
```

## Modules

| File | Responsibility |
|------|----------------|
| [`db.py`](../../backend/db.py) | asyncpg pool over `DATABASE_URL` (postgres role → bypasses RLS) |
| [`security.py`](../../backend/security.py) | JWT sign/verify for the `session` cookie and terminal WS tickets |
| [`deps.py`](../../backend/deps.py) | `current_user` dependency (reads the `session` cookie) |
| [`serializers.py`](../../backend/serializers.py) | row → JSON shaping (`user_public`, `message_public`) |
| [`realtime.py`](../../backend/realtime.py) | server → client broadcast via Supabase Realtime HTTP API |
| [`storage.py`](../../backend/storage.py) | uploads to Supabase Storage (service-role key) |
| [`chat_common.py`](../../backend/chat_common.py) | shared helpers: membership checks, receipt aggregates, message serialization, per-user notifications |
| [`routes_auth.py`](../../backend/routes_auth.py) | request-otp / verify / logout / me |
| [`routes_users.py`](../../backend/routes_users.py) | user directory + profile update |
| [`routes_conversations.py`](../../backend/routes_conversations.py) | conversations + membership + **manager rules** |
| [`routes_messages.py`](../../backend/routes_messages.py) | messages + **receipt state machine** |
| [`routes_presence.py`](../../backend/routes_presence.py) | last-seen heartbeat |
| [`routes_uploads.py`](../../backend/routes_uploads.py) | file upload endpoint |
| [`terminal.py`](../../backend/terminal.py) | shared-terminal WebSocket + Docker manager (see [terminal.md](./terminal.md)) |
| [`seed_demo.py`](../../backend/seed_demo.py) | seeds Alice/Bob/Carol + sample chats |

## API surface (all under `/api`, proxied from the frontend)

**Auth** — `POST /auth/request-otp`, `POST /auth/verify`, `POST /auth/logout`, `GET /auth/me`
**Users** — `GET /users?search=`, `PATCH /users/me`
**Uploads** — `POST /uploads` (multipart)
**Conversations** — `GET /conversations`, `GET /conversations/{id}`,
`POST /conversations/direct`, `POST /conversations/group`, `DELETE /conversations/{id}`
**Members** — `POST /conversations/{id}/members`,
`DELETE /conversations/{id}/members/{uid}`,
`POST /conversations/{id}/members/{uid}/promote`
**Messages** — `GET /conversations/{id}/messages`, `POST /conversations/{id}/messages`,
`POST /conversations/{id}/delivered`, `POST /conversations/{id}/read`
**Presence** — `POST /presence/heartbeat`
**Terminal** — `POST /terminal/ticket`, `GET /conversations/{id}/terminal`,
WebSocket `/ws/terminal/{id}?ticket=…`

## Manager rules (transaction-safe)
Every membership mutation in `routes_conversations.py` first does
`SELECT ... FROM conversations WHERE id = $1 FOR UPDATE`, serializing all
membership changes for that conversation. On a member delete:
- 0 members remain → the group is deleted;
- else if the leaver was a manager and 0 managers remain → a **random**
  remaining member is promoted (`ORDER BY random() LIMIT 1`).

Promote/delete follow the same lock-first pattern with manager authorization.
Group lifecycle events also post `kind='system'` messages ("X added Y", "X left",
"… was automatically made a manager").

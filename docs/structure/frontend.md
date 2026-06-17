# Frontend (Next.js 16, App Router)

Run: `cd frontend && npm run dev` → http://localhost:3000

## Routes

| Path | File | Notes |
|------|------|-------|
| `/` | [`app/page.tsx`](../../frontend/app/page.tsx) | redirects to `/chats` |
| `/login` | [`app/login/page.tsx`](../../frontend/app/login/page.tsx) | phone → OTP |
| `/register` | [`app/register/page.tsx`](../../frontend/app/register/page.tsx) | phone + username + photo → OTP |
| `/chats` | [`app/chats/layout.tsx`](../../frontend/app/chats/layout.tsx) + [`page.tsx`](../../frontend/app/chats/page.tsx) | two-pane shell; empty state |
| `/chats/[id]` | [`app/chats/[id]/page.tsx`](../../frontend/app/chats/[id]/page.tsx) | a conversation |

## Components (`frontend/components`)

| Component | Role |
|-----------|------|
| `app-provider.tsx` | Loads session (`/auth/me`), guards routes, owns the Supabase **presence** channel + per-user notification channel + the last-seen **heartbeat**; exposes `useApp()` (`refreshConversations`, `supabase`) |
| `sidebar.tsx` | Profile header, new-chat button, logout, conversation list |
| `conversation-list.tsx` | List items with avatar, presence dot, preview, unread badge |
| `new-chat-dialog.tsx` | Start a 1:1 or create a group (member picker) |
| `chat-view.tsx` | Per-conversation realtime subscription; composes header/messages/composer/terminal |
| `chat-header.tsx` | Title + online/last-seen line, terminal toggle, group settings |
| `message-list.tsx` / `message-bubble.tsx` | Message rendering; system messages centered |
| `checks.tsx` | ✓ / ✓✓ / blue ✓✓ receipt indicator |
| `composer.tsx` | Text (optimistic send) + attachment upload |
| `group-settings-sheet.tsx` | Members list, promote / remove / add, leave, delete (manager-gated) |
| `terminal-panel.tsx` | xterm.js bound to the FastAPI terminal WebSocket |
| `user-avatar.tsx` | Avatar with initials fallback + online dot |

## State & data flow
- **Store:** [`lib/store.ts`](../../frontend/lib/store.ts) (Zustand) — `me`,
  `conversations`, `messages` by conversation, `online` set. Actions reconcile
  optimistic messages by `client_msg_id` and apply receipt aggregates.
- **API client:** [`lib/api.ts`](../../frontend/lib/api.ts) — always relative
  `/api/*` with `credentials: "include"` (cookie travels through the rewrite).
- **Types:** [`lib/types.ts`](../../frontend/lib/types.ts);
  **formatting:** [`lib/format.ts`](../../frontend/lib/format.ts).
- **Supabase client:** [`lib/supabase/client.ts`](../../frontend/lib/supabase/client.ts)
  — used only for Realtime (broadcast + presence) with the anon key.

Server components are avoided for the app shell because everything is realtime
and session-driven; the chat surface is client-rendered and hydrated via `/api`.

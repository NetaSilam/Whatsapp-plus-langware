# Realtime: presence, delivery & receipts

Transport: **Supabase Realtime** (broadcast + presence) with the anon key,
driven from the browser; the backend pushes events via Supabase's HTTP broadcast
API ([`backend/realtime.py`](../../backend/realtime.py)).

## Channels
- `presence:online` — every client `track()`s itself; the union of presence keys
  is the set of online user ids → drives the green dot and "online" label.
- `user:<id>` — a per-user notification channel. The backend emits
  `conversation.updated` / `conversation.created` here so a client refreshes its
  conversation list (new chat, new message preview, unread count, membership).
- `conv:<id>` — the open conversation's channel. Carries `message.new`,
  `receipt.update`, `members.changed`, `group.deleted`.

## Presence & last seen
- **Live online** = membership of `presence:online` (no DB write).
- **Last seen** = `users.last_seen`, refreshed by `POST /api/presence/heartbeat`
  every 30s and on tab focus (see `app-provider.tsx`). When a user isn't present,
  the header shows `lastSeen(last_seen)`.

## Receipt state machine (sent → delivered → read)
Per `(message_id, recipient)` row in `message_receipts`, monotonic.

1. **Send** — `POST /conversations/{id}/messages` inserts the message plus one
   `sent` receipt per *other* member, then broadcasts `message.new`.
2. **Delivered** — when a recipient is online and receives the conversation
   notification, the client calls `POST /conversations/{id}/delivered`
   (`app-provider.tsx` does this for any conversation with unread > 0). State
   `sent → delivered`.
3. **Read** — when a recipient has the conversation open, `chat-view.tsx` calls
   `POST /conversations/{id}/read` (on open and on each incoming message). State
   → `read`, and `conversation_members.last_read_at` is bumped.

### Sender's checkmark (aggregate)
The server recomputes an aggregate over a message's receipts and includes it in
every `receipt.update` broadcast, so clients never count:
- any recipient still `sent` → **✓** (single);
- all `delivered` (none `sent`, not all `read`) → **✓✓** (grey);
- **all** recipients `read` → **✓✓** (blue).

In a group this means blue ticks appear only once *every* member has read —
exactly WhatsApp's behavior. The SQL lives in `chat_common.py` (`aggregates_for`).

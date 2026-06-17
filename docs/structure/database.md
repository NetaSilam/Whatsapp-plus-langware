# Database

- **Canonical schema:** [`supabase/migrations/20260101000000_init.sql`](../../supabase/migrations/20260101000000_init.sql)
- **Drizzle mirror (types):** [`frontend/lib/db/schema.ts`](../../frontend/lib/db/schema.ts)
- Apply locally with `supabase db reset` (replays migrations).

## Tables

| Table | Purpose | Key columns |
|-------|---------|-------------|
| `users` | accounts | `id`, `phone` (unique, E.164), `username`, `photo_url`, `last_seen` |
| `otp_codes` | mock-OTP verification | `phone`, `code` (char 6), `purpose`, pending `username`/`photo_url`, `expires_at`, `consumed_at`, `attempts` |
| `conversations` | unified 1:1 + group | `type` ('direct'\|'group'), `name`, `photo_url`, `created_by`, `direct_key` (unique sorted id-pair → dedups 1:1) |
| `conversation_members` | membership + roles | PK `(conversation_id, user_id)`, `role` ('member'\|'manager'), `joined_at`, `last_read_at` |
| `messages` | chat messages | `conversation_id`, `sender_id`, `body`, `kind` ('text'\|'image'\|'file'\|'system'), `client_msg_id`, unique `(conversation_id, client_msg_id)` |
| `message_receipts` | per-recipient delivery | PK `(message_id, user_id)`, `state` ('sent'\|'delivered'\|'read'), `delivered_at`, `read_at` |
| `attachments` | files on a message | `message_id`, `storage_path`, `url`, `mime_type`, `size_bytes`, `file_name`, `width`, `height` |
| `terminal_sessions` | terminal bookkeeping | `conversation_id`, `container_id`, `status`, `started_by`, `last_activity`; EXCLUDE constraint = ≤1 live session per conversation |

Indexes optimize the hot paths: messages by `(conversation_id, created_at desc)`,
members by `user_id`, a partial index on managers, receipts by `(user_id, state)`.
`btree_gist` is enabled for the terminal exclusion constraint.

## RLS stance
Every table has **RLS enabled with no policies**. All reads/writes go through
FastAPI on the direct `DATABASE_URL` connection (the `postgres` role bypasses
RLS), and the browser only uses Supabase Realtime *broadcast* channels (which
don't read these tables). So: locked to anon/PostgREST, open to the trusted
server. Production would add per-user policies bound to a real `auth.uid()`.

## Storage
A public Supabase Storage bucket **`media`** holds avatars, group photos, and
chat attachments. Uploads are server-side (service-role key) via
[`backend/storage.py`](../../backend/storage.py); files resolve to public URLs.

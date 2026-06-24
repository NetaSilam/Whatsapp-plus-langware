-- Phase 6b: typing indicators. A member pings while typing; other members poll
-- for anyone whose ping is recent. Reuses conversation_members (no new table).

alter table public.conversation_members
  add column if not exists last_typing_at timestamptz;

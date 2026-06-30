-- Phase 3b: shared terminal sessions.
-- Owners can invite other users; all members connect to the same live PTY.

create table if not exists public.terminal_members (
  terminal_id uuid not null references public.terminals (id) on delete cascade,
  user_id     uuid not null references auth.users (id) on delete cascade,
  invited_at  timestamptz not null default now(),
  primary key (terminal_id, user_id)
);

create index if not exists terminal_members_user_idx on public.terminal_members (user_id);

alter table public.terminal_members enable row level security;

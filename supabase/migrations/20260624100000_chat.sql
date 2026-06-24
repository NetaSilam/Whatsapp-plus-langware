-- Phase 2: direct messages. `conversation` + `conversation_members` also form
-- the base for groups (Phase 4); for now every conversation is a 1:1 'dm'.

create table if not exists public.conversation (
  id uuid primary key default gen_random_uuid(),
  type text not null default 'dm' check (type in ('dm', 'group')),
  created_by uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists public.conversation_members (
  conversation_id uuid not null references public.conversation (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null default 'member' check (role in ('admin', 'member')),
  last_read_at timestamptz,
  joined_at timestamptz not null default now(),
  primary key (conversation_id, user_id)
);

create index if not exists conversation_members_user_idx
  on public.conversation_members (user_id);

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversation (id) on delete cascade,
  sender_id uuid not null references auth.users (id) on delete cascade,
  body text not null,
  -- Millisecond precision so the value round-trips through JSON exactly; the
  -- polling `after` cursor relies on `created_at > lastSeen` being precise.
  created_at timestamptz not null default date_trunc('milliseconds', now())
);

create index if not exists messages_conversation_idx
  on public.messages (conversation_id, created_at);

-- RLS enabled with NO policies and NO grants: these tables are reachable only
-- through the server-side Drizzle connection (DATABASE_URL), where route
-- handlers enforce membership-based authorization. The browser Supabase client
-- cannot touch them, which sidesteps recursive-policy issues on the membership
-- table while keeping a safe default.
alter table public.conversation enable row level security;
alter table public.conversation_members enable row level security;
alter table public.messages enable row level security;

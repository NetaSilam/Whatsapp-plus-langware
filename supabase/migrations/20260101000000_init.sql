-- WhatsApp-like chat app — canonical schema (source of truth).
-- Mirror any change into frontend/lib/db/schema.ts (or `npm run db:pull`).
--
-- RLS stance: every table has RLS ENABLED with NO policies. All data access
-- goes through the FastAPI backend over the direct DATABASE_URL connection
-- (Postgres `postgres` role => bypasses RLS). The browser never queries these
-- tables; it only uses Supabase Realtime *broadcast/presence* channels (which
-- do not read these rows). So "RLS on, no policy" = locked to anon/PostgREST,
-- fully open to the trusted server. In production you'd add per-user policies
-- bound to a real auth.uid().

create extension if not exists btree_gist;

-- ============================ users ============================
create table public.users (
  id          uuid primary key default gen_random_uuid(),
  phone       text not null unique,              -- E.164, e.g. +15551234567
  username    text not null,
  photo_url   text,
  last_seen   timestamptz not null default now(),
  created_at  timestamptz not null default now()
);
create index idx_users_username on public.users (lower(username));

-- ===================== otp_codes (mock OTP) =====================
create table public.otp_codes (
  id          uuid primary key default gen_random_uuid(),
  phone       text not null,
  code        char(6) not null,                  -- shown on screen (dev mode)
  purpose     text not null default 'auth',       -- 'register' | 'login'
  username    text,                               -- pending profile (register)
  photo_url   text,
  consumed_at timestamptz,
  attempts    int not null default 0,
  expires_at  timestamptz not null,
  created_at  timestamptz not null default now()
);
create index idx_otp_phone_active on public.otp_codes (phone) where consumed_at is null;

-- ===== conversations (unified 1:1 + group, discriminated by type) =====
create table public.conversations (
  id          uuid primary key default gen_random_uuid(),
  type        text not null check (type in ('direct','group')),
  name        text,                               -- null for direct
  photo_url   text,                               -- group photo; null for direct
  created_by  uuid references public.users(id) on delete set null,
  direct_key  text unique,                        -- sorted "a:b" id pair; dedups 1:1
  created_at  timestamptz not null default now()
);
create index idx_conversations_type on public.conversations (type);

-- ===================== conversation_members =====================
create table public.conversation_members (
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  user_id         uuid not null references public.users(id) on delete cascade,
  role            text not null default 'member' check (role in ('member','manager')),
  joined_at       timestamptz not null default now(),
  last_read_at    timestamptz,
  primary key (conversation_id, user_id)
);
create index idx_members_user on public.conversation_members (user_id);
create index idx_members_managers on public.conversation_members (conversation_id) where role = 'manager';

-- ============================ messages ============================
create table public.messages (
  id              uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  sender_id       uuid not null references public.users(id),
  body            text,                            -- null if attachment-only
  kind            text not null default 'text' check (kind in ('text','image','file','system')),
  client_msg_id   uuid,                            -- idempotency / optimistic dedup
  created_at      timestamptz not null default now(),
  unique (conversation_id, client_msg_id)
);
create index idx_messages_conv_time on public.messages (conversation_id, created_at desc);

-- ============ message_receipts (per-recipient delivery state) ============
create table public.message_receipts (
  message_id   uuid not null references public.messages(id) on delete cascade,
  user_id      uuid not null references public.users(id) on delete cascade,  -- recipient
  state        text not null default 'sent' check (state in ('sent','delivered','read')),
  delivered_at timestamptz,
  read_at      timestamptz,
  primary key (message_id, user_id)
);
create index idx_receipts_user_state on public.message_receipts (user_id, state);
create index idx_receipts_message on public.message_receipts (message_id);

-- ============================ attachments ============================
create table public.attachments (
  id           uuid primary key default gen_random_uuid(),
  message_id   uuid not null references public.messages(id) on delete cascade,
  storage_path text not null,                      -- bucket path
  url          text not null,                      -- resolved public URL
  mime_type    text not null,
  size_bytes   bigint not null default 0,
  file_name    text,
  width        int,
  height       int,
  created_at   timestamptz not null default now()
);
create index idx_attachments_message on public.attachments (message_id);

-- ===================== terminal_sessions =====================
create table public.terminal_sessions (
  id              uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  container_id    text,
  status          text not null default 'starting' check (status in ('starting','running','stopped')),
  started_by      uuid references public.users(id) on delete set null,
  started_at      timestamptz not null default now(),
  last_activity   timestamptz not null default now(),
  stopped_at      timestamptz,
  -- at most one live session per conversation
  exclude using gist (conversation_id with =) where (status <> 'stopped')
);
create index idx_terminal_conv_live on public.terminal_sessions (conversation_id) where status <> 'stopped';

-- Lock down to anon; the trusted server bypasses RLS via the postgres role.
alter table public.users                enable row level security;
alter table public.otp_codes            enable row level security;
alter table public.conversations        enable row level security;
alter table public.conversation_members enable row level security;
alter table public.messages             enable row level security;
alter table public.message_receipts     enable row level security;
alter table public.attachments          enable row level security;
alter table public.terminal_sessions    enable row level security;

-- ===================== storage bucket for media =====================
-- Public bucket: profile photos, group photos, and chat attachments resolve to
-- direct public URLs (simplest for the demo). Uploads happen server-side with
-- the service-role key.
insert into storage.buckets (id, name, public)
values ('media', 'media', true)
on conflict (id) do nothing;

-- Phase 3: terminal sessions. Each row is a saved terminal; opening it starts a
-- PTY-backed shell over the FastAPI WebSocket. Server-only via Drizzle (RLS on,
-- no policies); the route handler scopes access to the owner.

create table if not exists public.terminals (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  status text not null default 'active' check (status in ('active', 'closed')),
  created_at timestamptz not null default now(),
  last_active_at timestamptz not null default now()
);

create index if not exists terminals_owner_idx on public.terminals (owner_id);

alter table public.terminals enable row level security;

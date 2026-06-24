-- Phase 4: groups. A group is a conversation (type='group') with a metadata
-- row here. Membership/messages reuse conversation_members/messages from
-- Phase 2. Server-only via Drizzle (RLS on, no policies); route handlers scope
-- access to members, and management to admins.

create table if not exists public.groups (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null unique
    references public.conversation (id) on delete cascade,
  name text not null,
  created_by uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table public.groups enable row level security;

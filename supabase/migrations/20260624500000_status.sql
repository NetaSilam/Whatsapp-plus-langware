-- Phase 6: status. WhatsApp-style ephemeral posts (text or image) that expire
-- 24h after creation. Visible to all signed-in users (no contacts model in the
-- MVP). Server-only via Drizzle (RLS on, no policies); image bytes reuse the
-- private 'attachments' bucket under a status/ prefix.

create table if not exists public.statuses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  type text not null check (type in ('text', 'image')),
  body text,
  media_path text,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '24 hours'
);

create index if not exists statuses_expires_idx on public.statuses (expires_at);

alter table public.statuses enable row level security;

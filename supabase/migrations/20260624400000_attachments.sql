-- Phase 5: attachments. Files live in a private Supabase Storage bucket; this
-- table holds metadata and links each file to a message. Server-only via
-- Drizzle (RLS on, no policies); route handlers gate access by membership and
-- upload/serve through the service role + signed URLs.

create table if not exists public.attachments (
  id uuid primary key default gen_random_uuid(),
  message_id uuid references public.messages (id) on delete cascade,
  uploader_id uuid not null references auth.users (id) on delete cascade,
  kind text not null check (kind in ('image', 'file')),
  file_name text not null,
  mime_type text not null,
  size_bytes bigint not null,
  storage_path text not null,
  created_at timestamptz not null default now()
);

create index if not exists attachments_message_idx on public.attachments (message_id);

alter table public.attachments enable row level security;

-- A message may now be attachment-only (no text body).
alter table public.messages alter column body drop not null;

-- Private bucket for attachment files.
insert into storage.buckets (id, name, public)
values ('attachments', 'attachments', false)
on conflict (id) do nothing;

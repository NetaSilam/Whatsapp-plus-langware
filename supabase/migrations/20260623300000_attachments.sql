-- Phase 4: attachments. messages gains optional attachment columns; a single
-- bucket holds all attachment kinds, gated by conversation membership.

alter table public.messages
  alter column body drop not null;

alter table public.messages
  add column attachment_path text,
  add column attachment_kind text,
  add column attachment_mime text,
  add column attachment_name text,
  add column attachment_size bigint;

alter table public.messages
  add constraint messages_attachment_kind_check
    check (
      attachment_kind is null
      or attachment_kind in ('image', 'file', 'audio', 'video')
    );

alter table public.messages
  add constraint messages_body_or_attachment_check
    check (
      (body is not null and length(body) > 0)
      or attachment_path is not null
    );

-- Bucket: public-read URLs (per the project's minimal-choice decision),
-- 25 MB cap enforced server-side as defense in depth alongside client check.
insert into storage.buckets (id, name, public, file_size_limit)
values ('chat-attachments', 'chat-attachments', true, 26214400)
on conflict (id) do nothing;

-- Storage RLS. INSERT requires conversation membership inferred from the
-- first path segment (we upload to "<conversation_id>/<random>/<filename>").
-- SELECT is mostly defensive — public buckets serve GETs without consulting
-- RLS, but list/download via PostgREST still does.
create policy "members can upload attachments"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'chat-attachments'
    and public.is_conversation_member(
      ((storage.foldername(name))[1])::uuid
    )
  );

create policy "members can read attachment metadata"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'chat-attachments'
    and public.is_conversation_member(
      ((storage.foldername(name))[1])::uuid
    )
  );

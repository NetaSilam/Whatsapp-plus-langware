-- Phase 5: presence + read receipts + typing + reactions.
-- Typing is broadcast-only — no schema. Presence reuses profiles.last_seen_at.

-- Read receipts: track each member's high-water mark per conversation.
alter table public.conversation_members
  add column last_read_at timestamptz;

-- Column-level update grant: members can write only last_read_at.
grant update (last_read_at) on public.conversation_members to authenticated;

create policy "members update own last_read"
  on public.conversation_members for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- Reactions: one row per (message, user). Toggle to a different emoji is an
-- upsert; removing a reaction is a delete.
create table public.message_reactions (
  message_id uuid not null references public.messages (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  emoji text not null,
  created_at timestamptz not null default now(),
  primary key (message_id, user_id)
);

create index message_reactions_message_id_idx
  on public.message_reactions (message_id);

alter table public.message_reactions enable row level security;

grant select, insert, update, delete on public.message_reactions to authenticated;

-- Reactions piggyback on messages RLS via subquery — keeps the schema lean
-- (no denormalized conversation_id) at the cost of a subquery per check.
create policy "members read reactions in their conversations"
  on public.message_reactions for select
  to authenticated
  using (
    exists (
      select 1 from public.messages m
      where m.id = message_id
        and public.is_conversation_member(m.conversation_id)
    )
  );

create policy "members react to messages in their conversations"
  on public.message_reactions for insert
  to authenticated
  with check (
    user_id = auth.uid()
    and exists (
      select 1 from public.messages m
      where m.id = message_id
        and public.is_conversation_member(m.conversation_id)
    )
  );

create policy "users update their own reactions"
  on public.message_reactions for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy "users delete their own reactions"
  on public.message_reactions for delete
  to authenticated
  using (user_id = auth.uid());

-- Realtime: clients subscribe to read receipt + reaction changes.
alter publication supabase_realtime add table public.conversation_members;
alter publication supabase_realtime add table public.message_reactions;

-- Phase 2: 1:1 + group chat tables. Groups-ready from day one (is_group flag
-- + N-way membership) so Phase 3 only adds UI, not schema.

create table public.conversations (
  id uuid primary key default gen_random_uuid(),
  is_group boolean not null default false,
  title text,
  created_by uuid not null references public.profiles (id) on delete restrict,
  created_at timestamptz not null default now()
);

create table public.conversation_members (
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (conversation_id, user_id)
);

create index conversation_members_user_id_idx
  on public.conversation_members (user_id);

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  sender_id uuid not null references public.profiles (id) on delete restrict,
  body text not null,
  created_at timestamptz not null default now()
);

create index messages_conversation_id_created_at_idx
  on public.messages (conversation_id, created_at desc);

-- Membership-check helper. SECURITY DEFINER so it bypasses RLS — necessary
-- because a SELECT policy on conversation_members cannot reference
-- conversation_members in its USING clause without infinite recursion.
create function public.is_conversation_member(conv_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.conversation_members
    where conversation_id = conv_id
      and user_id = auth.uid()
  );
$$;

alter table public.conversations enable row level security;
alter table public.conversation_members enable row level security;
alter table public.messages enable row level security;

grant select, insert on public.conversations to authenticated;
grant select, insert on public.conversation_members to authenticated;
grant select, insert on public.messages to authenticated;

-- conversations: members can read their own; anyone authenticated can create.
create policy "members can read their conversations"
  on public.conversations for select
  to authenticated
  using (public.is_conversation_member(id));

create policy "authenticated users can create conversations"
  on public.conversations for insert
  to authenticated
  with check (created_by = auth.uid());

-- conversation_members: visible to anyone who's a member of the same convo.
-- Insertion limited to adding YOURSELF; Phase 3 will relax this for groups.
create policy "members can read membership of their conversations"
  on public.conversation_members for select
  to authenticated
  using (public.is_conversation_member(conversation_id));

create policy "users can add themselves to conversations"
  on public.conversation_members for insert
  to authenticated
  with check (user_id = auth.uid());

-- messages: read + write require membership; sender_id must be auth.uid().
create policy "members can read messages in their conversations"
  on public.messages for select
  to authenticated
  using (public.is_conversation_member(conversation_id));

create policy "members can send messages as themselves"
  on public.messages for insert
  to authenticated
  with check (
    sender_id = auth.uid()
    and public.is_conversation_member(conversation_id)
  );

-- RPC: open or create a 1:1 conversation with another user. Avoids a race
-- where two clients each try to create the same direct conversation at once.
create function public.get_or_create_direct_conversation(other_user uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  conv_id uuid;
  me uuid := auth.uid();
begin
  if me is null then
    raise exception 'not authenticated';
  end if;
  if other_user = me then
    raise exception 'cannot start a chat with yourself';
  end if;
  if not exists (select 1 from public.profiles where id = other_user) then
    raise exception 'no such user';
  end if;

  select c.id into conv_id
  from public.conversations c
  where c.is_group = false
    and exists (
      select 1 from public.conversation_members m
      where m.conversation_id = c.id and m.user_id = me
    )
    and exists (
      select 1 from public.conversation_members m
      where m.conversation_id = c.id and m.user_id = other_user
    )
    and (
      select count(*) from public.conversation_members m
      where m.conversation_id = c.id
    ) = 2
  limit 1;

  if conv_id is not null then
    return conv_id;
  end if;

  insert into public.conversations (is_group, created_by)
  values (false, me)
  returning id into conv_id;

  insert into public.conversation_members (conversation_id, user_id)
  values (conv_id, me), (conv_id, other_user);

  return conv_id;
end;
$$;

grant execute on function public.get_or_create_direct_conversation(uuid) to authenticated;

-- Realtime: clients can subscribe to new messages.
alter publication supabase_realtime add table public.messages;

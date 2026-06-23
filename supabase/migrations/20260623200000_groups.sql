-- Phase 3: groups. Schema already supports N-way membership; this migration
-- only adjusts RLS and adds a create_group RPC.

-- Helper to keep policies short: is the caller the creator of this group?
create function public.is_group_creator(conv_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.conversations
    where id = conv_id
      and is_group = true
      and created_by = auth.uid()
  );
$$;

-- INSERT into conversation_members
--   Phase 2 allowed only "add yourself", which is fine for 1:1 (driven by the
--   get_or_create_direct_conversation RPC, security definer). Groups need
--   the creator to add others. Per user decision: only the creator adds.
drop policy "users can add themselves to conversations"
  on public.conversation_members;

create policy "self-join or group creator adds members"
  on public.conversation_members for insert
  to authenticated
  with check (
    user_id = auth.uid()
    or public.is_group_creator(conversation_id)
  );

-- DELETE from conversation_members
--   Any member can leave a group (delete their own row).
--   Group creator can remove anyone in the group.
--   1:1 conversations cannot be left this way (is_group=true required).
grant delete on public.conversation_members to authenticated;

create policy "members can leave a group; creator can kick"
  on public.conversation_members for delete
  to authenticated
  using (
    (
      user_id = auth.uid()
      and exists (
        select 1 from public.conversations
        where id = conversation_id and is_group = true
      )
    )
    or public.is_group_creator(conversation_id)
  );

-- RPC: create a group atomically.
create function public.create_group(title text, member_ids uuid[])
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  conv_id uuid;
  me uuid := auth.uid();
  clean_title text := coalesce(trim(title), '');
  uniq_ids uuid[];
  others uuid[];
begin
  if me is null then
    raise exception 'not authenticated';
  end if;
  if clean_title = '' then
    raise exception 'title required';
  end if;
  if member_ids is null or coalesce(array_length(member_ids, 1), 0) = 0 then
    raise exception 'at least one other member required';
  end if;

  -- Dedupe, drop the caller if they appear in member_ids, validate everyone
  -- has a profile, then re-add the caller.
  select array_agg(distinct id) into others
  from unnest(member_ids) as id
  where id <> me;

  if others is null or array_length(others, 1) = 0 then
    raise exception 'at least one other member required';
  end if;

  if (select count(*) from public.profiles where id = any(others))
      <> array_length(others, 1) then
    raise exception 'invalid member id';
  end if;

  uniq_ids := array_append(others, me);

  insert into public.conversations (is_group, title, created_by)
  values (true, clean_title, me)
  returning id into conv_id;

  insert into public.conversation_members (conversation_id, user_id)
  select conv_id, m from unnest(uniq_ids) as m;

  return conv_id;
end;
$$;

grant execute on function public.create_group(text, uuid[]) to authenticated;

-- Phase 6: shared external terminals. Schema mirrors groups: creator-only
-- membership management, members can leave. The actual PTY lives in the
-- FastAPI backend; this table just tracks who's authorized.

create table public.terminals (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  created_by uuid not null references public.profiles (id) on delete restrict,
  created_at timestamptz not null default now()
);

create table public.terminal_members (
  terminal_id uuid not null references public.terminals (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (terminal_id, user_id)
);

create index terminal_members_user_id_idx
  on public.terminal_members (user_id);

-- Same RLS pattern as conversations: avoid recursion in self-join policies
-- via SECURITY DEFINER helpers.
create function public.is_terminal_member(term_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.terminal_members
    where terminal_id = term_id
      and user_id = auth.uid()
  );
$$;

create function public.is_terminal_creator(term_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.terminals
    where id = term_id
      and created_by = auth.uid()
  );
$$;

alter table public.terminals enable row level security;
alter table public.terminal_members enable row level security;

grant select, insert on public.terminals to authenticated;
grant select, insert, delete on public.terminal_members to authenticated;

create policy "members read their terminals"
  on public.terminals for select to authenticated
  using (public.is_terminal_member(id));

create policy "authenticated users create terminals"
  on public.terminals for insert to authenticated
  with check (created_by = auth.uid());

create policy "members read membership of their terminals"
  on public.terminal_members for select to authenticated
  using (public.is_terminal_member(terminal_id));

create policy "self-join or creator adds members"
  on public.terminal_members for insert to authenticated
  with check (
    user_id = auth.uid()
    or public.is_terminal_creator(terminal_id)
  );

create policy "members leave or creator kicks"
  on public.terminal_members for delete to authenticated
  using (
    user_id = auth.uid()
    or public.is_terminal_creator(terminal_id)
  );

-- Atomic create: conversation + members in one transaction, bypassing the
-- self-join INSERT policy (the function runs SECURITY DEFINER).
create function public.create_terminal(title text, member_ids uuid[])
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  term_id uuid;
  me uuid := auth.uid();
  clean_title text := coalesce(trim(title), '');
  others uuid[];
  uniq_ids uuid[];
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

  insert into public.terminals (title, created_by)
  values (clean_title, me)
  returning id into term_id;

  insert into public.terminal_members (terminal_id, user_id)
  select term_id, m from unnest(uniq_ids) as m;

  return term_id;
end;
$$;

grant execute on function public.create_terminal(text, uuid[]) to authenticated;

-- Phase 1: user identity.
-- A `profiles` row mirrors each auth.users account with app-facing fields.
-- Supabase Auth owns credentials; this table owns display name / avatar.

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null,
  avatar_path text,
  last_seen timestamptz,
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

-- PostgREST checks table privileges in addition to RLS, so grant the
-- authenticated role access; RLS policies below scope what it can actually see.
grant select, update on public.profiles to authenticated;

-- Any signed-in user can read profiles (needed to find people to chat with).
create policy "profiles readable by authenticated"
  on public.profiles for select
  to authenticated
  using (true);

-- A user may update only their own profile.
create policy "users update own profile"
  on public.profiles for update
  to authenticated
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- Auto-create a profile whenever an auth user signs up. The display name comes
-- from signup metadata (options.data.display_name), falling back to the email
-- local-part so the row is always valid.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    coalesce(
      nullif(new.raw_user_meta_data ->> 'display_name', ''),
      split_part(new.email, '@', 1)
    )
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- WhatsApp+ schema, Phase 1: auth + profiles.
-- Canonical source of truth. Mirror any change into frontend/lib/db/schema.ts.

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null,
  avatar_url text,
  last_seen_at timestamptz,
  created_at timestamptz not null default now()
);

-- Auto-create a profile row for every new auth user. display_name defaults
-- to whatever was passed in user_metadata.display_name at signup, falling
-- back to the email local-part.
create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    coalesce(
      new.raw_user_meta_data ->> 'display_name',
      split_part(new.email, '@', 1)
    )
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

alter table public.profiles enable row level security;

-- RLS gates rows; underlying table privileges still need to be granted to
-- the auth roles or Postgres rejects the request before policies are
-- consulted ("permission denied for table profiles").
grant select, update on public.profiles to authenticated;

create policy "profiles are readable by authenticated users"
  on public.profiles for select
  to authenticated
  using (true);

create policy "profiles are updatable by owner"
  on public.profiles for update
  to authenticated
  using (auth.uid() = id)
  with check (auth.uid() = id);

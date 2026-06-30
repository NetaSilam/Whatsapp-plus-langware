-- Profile bio and group description + avatar.

alter table public.profiles
  add column if not exists bio text;

alter table public.groups
  add column if not exists description text,
  add column if not exists avatar_path text;

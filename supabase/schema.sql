-- Ultralight Racing: Supabase schema for online play off claude.ai (project "ultralight-racing", us-east-1).
-- Applied 2026-11-14 as migration ulr_rooms_pilots_leaderboard. Kept here for reference / to rebuild the project.
--
-- Dashboard settings this relies on:
--   Authentication → Sign In / Providers → Allow anonymous sign-ins: ON
--   Realtime → Settings → Allow public access: OFF   (only the private, passphrase-gated channel works)
--
-- Add a room or change a passphrase (run in the SQL editor; never commit real passphrases):
--   insert into public.rooms(id, pass_hash) values ('friends', extensions.crypt('NEW PASSPHRASE', extensions.gen_salt('bf', 10)))
--     on conflict (id) do update set pass_hash = excluded.pass_hash;
-- Pilots who joined with the old passphrase stay members until you remove them:
--   delete from public.pilots where room_id = 'friends';

create extension if not exists pgcrypto with schema extensions;
create schema if not exists private;

-- rooms: passphrase-protected groups; clients can never read this table
create table public.rooms (
  id text primary key check (id ~ '^[a-z0-9-]{2,24}$'),
  pass_hash text not null,
  created_at timestamptz not null default now()
);
alter table public.rooms enable row level security;
revoke all on public.rooms from anon, authenticated;

-- pilots: one row per (anonymous) signed-in player who has entered a valid passphrase
create table public.pilots (
  user_id uuid primary key references auth.users on delete cascade,
  room_id text not null references public.rooms on delete cascade,
  name text not null check (char_length(name) between 1 and 20),
  joined_at timestamptz not null default now()
);
alter table public.pilots enable row level security;
revoke all on public.pilots from anon, authenticated;
grant select on public.pilots to authenticated;

create function private.my_room() returns text
language sql stable security definer set search_path = '' as $$
  select room_id from public.pilots where user_id = (select auth.uid())
$$;
revoke all on function private.my_room() from public;
grant usage on schema private to authenticated;
grant execute on function private.my_room() to authenticated;

create policy "pilots: read your room" on public.pilots
  for select to authenticated using (room_id = (select private.my_room()));

-- join (or rename yourself in) a room with its passphrase
create function public.join_room(p_room text, p_pass text, p_name text) returns text
language plpgsql security definer set search_path = '' as $$
declare h text; n text := btrim(coalesce(p_name, ''));
begin
  if (select auth.uid()) is null then raise exception 'not signed in'; end if;
  if char_length(n) < 1 or char_length(n) > 20 then raise exception 'name must be 1-20 characters'; end if;
  select pass_hash into h from public.rooms where id = lower(btrim(p_room));
  if h is null or h <> extensions.crypt(p_pass, h) then
    perform pg_sleep(1);
    raise exception 'wrong room or passphrase';
  end if;
  insert into public.pilots(user_id, room_id, name) values ((select auth.uid()), lower(btrim(p_room)), n)
    on conflict (user_id) do update set room_id = excluded.room_id, name = excluded.name;
  return lower(btrim(p_room));
end $$;
revoke all on function public.join_room(text, text, text) from public, anon;
grant execute on function public.join_room(text, text, text) to authenticated;

-- time-trial leaderboard: one best run per pilot per course
create table public.tt_runs (
  course text not null check (course in ('tt', 'tt-lazy', 'tt-manic', 'tt-freaky')),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  t real not null check (t > 20 and t < 3600),
  rec jsonb not null check (pg_column_size(rec) < 80000),
  updated_at timestamptz not null default now(),
  primary key (course, user_id)
);
alter table public.tt_runs enable row level security;
revoke all on public.tt_runs from anon, authenticated;
grant select, insert, update on public.tt_runs to authenticated;
create index tt_runs_course_t on public.tt_runs (course, t);

create policy "tt: pilots read" on public.tt_runs
  for select to authenticated using ((select private.my_room()) is not null);
create policy "tt: pilots add their own" on public.tt_runs
  for insert to authenticated with check (user_id = (select auth.uid()) and (select private.my_room()) is not null);
create policy "tt: pilots update their own" on public.tt_runs
  for update to authenticated using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()) and (select private.my_room()) is not null);

-- realtime: only pilots of a room may join its private channel ulr:<room>
create policy "ulr: pilots receive" on realtime.messages
  for select to authenticated using (
    (select realtime.topic()) = 'ulr:' || (select private.my_room())
    and realtime.messages.extension in ('broadcast', 'presence'));
create policy "ulr: pilots send" on realtime.messages
  for insert to authenticated with check (
    (select realtime.topic()) = 'ulr:' || (select private.my_room())
    and realtime.messages.extension in ('broadcast', 'presence'));

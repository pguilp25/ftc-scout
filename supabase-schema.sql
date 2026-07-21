-- =============================================================================
-- Supabase table for shared scouting data.
-- Run this ONCE in your Supabase project:  SQL Editor → New query → paste → Run.
-- Then put your project URL + anon key into js/config.js.
-- =============================================================================

create table if not exists public.scouting (
  id     text primary key,
  team   text not null,
  match  text,
  scout  text,
  ts     timestamptz default now(),
  values jsonb not null default '{}'::jsonb
);

-- Let the app (using the public "anon" key) read and write.
-- This is fine for a scouting app: no secrets, just match stats. Anyone with the
-- site can add data — that's what you want for your team. If you'd rather lock it
-- down, turn on Supabase Auth and tighten these policies later.
alter table public.scouting enable row level security;

-- Drop-then-create so this whole script is safe to run again without errors.
drop policy if exists "anon can read"   on public.scouting;
drop policy if exists "anon can insert" on public.scouting;
drop policy if exists "anon can delete" on public.scouting;

create policy "anon can read"   on public.scouting for select using (true);
create policy "anon can insert" on public.scouting for insert with check (true);
create policy "anon can delete" on public.scouting for delete using (true);

-- Optional: keep the newest data first when querying.
create index if not exists scouting_team_idx on public.scouting (team);

-- Virtual THP-1 flow bench: saved virtual runs and the real bench results recorded against them.
-- Run in the Supabase SQL editor (or `supabase db push`) on the project already used by the E1 explorer.

create extension if not exists pgcrypto;

create table if not exists public.sim_runs (
  id              uuid primary key default gen_random_uuid(),
  created_at      timestamptz not null default now(),
  name            text not null check (char_length(name) between 1 and 120),
  author          text check (author is null or char_length(author) <= 80),
  notes           text check (notes is null or char_length(notes) <= 2000),
  protocol        jsonb not null,          -- culture, treatment, harvest and staining settings
  instrument      jsonb not null,          -- voltages, events, compensation mode
  gates           jsonb not null,          -- gate values and random seed
  summary         jsonb not null,          -- predicted live %, HLA-DR+ %, CD11b+ % per arm, plus pre-flight flags
  engine_version  text not null
);

create table if not exists public.sim_real_outcomes (
  id          uuid primary key default gen_random_uuid(),
  created_at  timestamptz not null default now(),
  sim_run_id  uuid not null references public.sim_runs(id) on delete cascade,
  arm         text not null check (arm in ('untreated', 'ifn', 'pma', 'combo')),
  run_date    date,
  live_pct    numeric check (live_pct is null or live_pct between 0 and 100),
  hla_pos     numeric check (hla_pos is null or hla_pos between 0 and 100),
  cd11b_pos   numeric check (cd11b_pos is null or cd11b_pos between 0 and 100),
  live_n      integer check (live_n is null or live_n >= 0),
  notes       text check (notes is null or char_length(notes) <= 2000)
);

create index if not exists sim_runs_created_idx on public.sim_runs (created_at desc);
create index if not exists sim_real_outcomes_run_idx on public.sim_real_outcomes (sim_run_id);

-- Row level security: the site uses the public anon key, like the E1 gate presets.
-- Anyone with the site can read and add rows; nobody can edit or delete through the anon key.
-- Tighten later (e.g. Supabase Auth + "to authenticated") if the site becomes public.
alter table public.sim_runs enable row level security;
alter table public.sim_real_outcomes enable row level security;

drop policy if exists "sim_runs read" on public.sim_runs;
drop policy if exists "sim_runs insert" on public.sim_runs;
drop policy if exists "sim_real read" on public.sim_real_outcomes;
drop policy if exists "sim_real insert" on public.sim_real_outcomes;

create policy "sim_runs read"   on public.sim_runs           for select to anon, authenticated using (true);
create policy "sim_runs insert" on public.sim_runs           for insert to anon, authenticated with check (true);
create policy "sim_real read"   on public.sim_real_outcomes  for select to anon, authenticated using (true);
create policy "sim_real insert" on public.sim_real_outcomes  for insert to anon, authenticated with check (true);

-- Notebook writes require a signed-in user. Anonymous read and insert are removed.

alter table public.sim_runs add column if not exists user_id uuid;
alter table public.sim_real_outcomes add column if not exists user_id uuid;

drop policy if exists "sim_runs read" on public.sim_runs;
drop policy if exists "sim_runs insert" on public.sim_runs;
drop policy if exists "sim_real read" on public.sim_real_outcomes;
drop policy if exists "sim_real insert" on public.sim_real_outcomes;

create policy "sim_runs read" on public.sim_runs
  for select to authenticated using (true);
create policy "sim_runs insert" on public.sim_runs
  for insert to authenticated with check (user_id = auth.uid());

create policy "sim_real read" on public.sim_real_outcomes
  for select to authenticated using (true);
create policy "sim_real insert" on public.sim_real_outcomes
  for insert to authenticated with check (user_id = auth.uid());

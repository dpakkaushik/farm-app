-- Why: three tables had RLS disabled, leaving them fully exposed to the anon
-- role (whose key ships in the frontend bundle — anyone can read it out of the
-- JS and hit these tables directly, bypassing the app).
--
--   test_table         — scratch table, no columns of value. Dropped.
--   crop_health_logs   — no farm_id, so nothing to scope a policy by.
--   daily_diary        — no farm_id either. Worse, its unique key was
--                        (diary_date) alone, so with more than one farm in the
--                        database two managers writing a diary on the same day
--                        would silently overwrite each other.
--
-- Both surviving tables predate multi-tenancy: every other table in this schema
-- carries farm_id and is scoped by is_farm_member()/has_farm_role(). These two
-- were never brought along. Both are empty and have no caller in the frontend,
-- so adding a NOT NULL farm_id needs no backfill.

-- ── test_table ───────────────────────────────────────────────────────────────
drop table if exists public.test_table;

-- ── crop_health_logs ─────────────────────────────────────────────────────────
alter table public.crop_health_logs
  add column if not exists farm_id uuid not null references public.farms(id) on delete cascade;

create index if not exists crop_health_logs_farm_id_idx on public.crop_health_logs(farm_id);

alter table public.crop_health_logs enable row level security;

drop policy if exists crop_health_logs_select on public.crop_health_logs;
drop policy if exists crop_health_logs_insert on public.crop_health_logs;
drop policy if exists crop_health_logs_update on public.crop_health_logs;
drop policy if exists crop_health_logs_delete on public.crop_health_logs;

create policy crop_health_logs_select on public.crop_health_logs
  for select using (is_farm_member(farm_id));
create policy crop_health_logs_insert on public.crop_health_logs
  for insert with check (has_farm_role(farm_id, 'manager'));
create policy crop_health_logs_update on public.crop_health_logs
  for update using (has_farm_role(farm_id, 'manager'));
create policy crop_health_logs_delete on public.crop_health_logs
  for delete using (has_farm_role(farm_id, 'admin'));

-- ── daily_diary ──────────────────────────────────────────────────────────────
alter table public.daily_diary
  add column if not exists farm_id uuid not null references public.farms(id) on delete cascade,
  add column if not exists logged_by uuid references auth.users(id);

-- One diary per farm per day, not one per day globally.
alter table public.daily_diary drop constraint if exists daily_diary_diary_date_key;
drop index if exists daily_diary_diary_date_key;

create unique index if not exists daily_diary_farm_id_diary_date_key
  on public.daily_diary(farm_id, diary_date);

alter table public.daily_diary enable row level security;

drop policy if exists daily_diary_select on public.daily_diary;
drop policy if exists daily_diary_insert on public.daily_diary;
drop policy if exists daily_diary_update on public.daily_diary;
drop policy if exists daily_diary_delete on public.daily_diary;

create policy daily_diary_select on public.daily_diary
  for select using (is_farm_member(farm_id));
create policy daily_diary_insert on public.daily_diary
  for insert with check (has_farm_role(farm_id, 'manager'));
create policy daily_diary_update on public.daily_diary
  for update using (has_farm_role(farm_id, 'manager'));
create policy daily_diary_delete on public.daily_diary
  for delete using (has_farm_role(farm_id, 'admin'));

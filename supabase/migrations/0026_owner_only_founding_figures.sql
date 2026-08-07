-- Founding figures are the owner's to set
--
-- Some numbers in this app are statements about the past. A party's opening
-- balance says what the farm owed Ankur on the day it started using the app;
-- the past does not change, so the number has no honest reason to ever change
-- again. It is set once and it is history.
--
-- What makes it dangerous is that it is the only kind of debit with nothing
-- behind it. Every other one is anchored to something — a bill number, a photo,
-- line items, a stock movement that has to reconcile. An opening balance is a
-- bare assertion. Raise Ankur's by ₹50,000 and ₹50,000 of cash can leave the
-- farm with the khata still balancing to the rupee. It is the easiest number
-- in the system to move and the hardest to notice moving.
--
-- Until now `vendors` and `labour_master` both took UPDATE at
-- has_farm_role(farm_id,'manager'), so any manager could change any of them,
-- silently, leaving no record. (The labour one has been open since
-- labour_master gained the column — this migration closes both.)
--
-- Three protected fields, one rule: only a farm admin may change them.
--
--   vendors.opening_balance / _date  — what was owed to a party before the app
--   labour_master.opening_balance    — the same, for a worker
--   farms.capex_threshold            — decides what stays out of the P&L
--
-- Enforced by trigger rather than policy because RLS is row-level: a policy
-- cannot say "a manager may update this table but not this column". Enforced in
-- the database rather than the UI because the anon key ships inside the browser
-- bundle — hiding a field is cosmetic, and anyone can call PostgREST directly.
--
-- Not made immutable, deliberately. The first opening balance entered for Ankur
-- was ₹67,770; the true figure was ₹55,580, because one of the five bills it
-- was meant to cover turned out to be in the app already. A write-once column
-- would have frozen the wrong number and left hand-editing the database as the
-- only way out — worse than an edit button, not better. So: the owner may
-- correct it, and every correction is recorded.

-- ── 1. The record of every change ────────────────────────────────────────────

create table if not exists public.protected_field_changes (
  id          uuid primary key default uuid_generate_v4(),
  farm_id     uuid        not null references public.farms(id) on delete cascade,
  table_name  text        not null,
  record_id   uuid        not null,
  field_name  text        not null,
  old_value   text,
  new_value   text,
  changed_by  uuid,
  changed_at  timestamptz not null default now()
);

create index if not exists idx_protected_field_changes_farm
  on public.protected_field_changes(farm_id, changed_at desc);

alter table public.protected_field_changes enable row level security;

-- This table deliberately breaks the four-policy convention in CLAUDE.md, and
-- the deviation is the point: members may READ the log, and nobody may write,
-- amend or delete a row through the API. Entries arrive only from the trigger
-- below, which is SECURITY DEFINER and so bypasses RLS. An audit trail an
-- attacker can rewrite is not an audit trail.
drop policy if exists protected_field_changes_select on public.protected_field_changes;
create policy protected_field_changes_select on public.protected_field_changes
  for select using (public.is_farm_member(farm_id));

comment on table public.protected_field_changes is
  'Append-only record of changes to founding figures (opening balances, capex threshold). Written only by guard_founding_figures(); no INSERT/UPDATE/DELETE policy exists, by design.';

-- ── 2. The guard ─────────────────────────────────────────────────────────────
--
-- auth.uid() is null for the service role and for migrations, which is how data
-- fixes and this file itself still work. It is also null for the anon key, but
-- that route is already shut: every one of these tables requires at least
-- has_farm_role(...,'manager') to UPDATE at all, and that is false without a
-- session. So the trigger guards the authenticated path, and RLS guards the
-- rest — neither is load-bearing alone.

create or replace function public.guard_founding_figures()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  fid       uuid;
  fld       text;
  old_val   text;
  new_val   text;
begin
  if tg_table_name = 'vendors' then
    fid := new.farm_id;
    if new.opening_balance is distinct from old.opening_balance then
      fld := 'opening_balance';
      old_val := old.opening_balance::text;  new_val := new.opening_balance::text;
    elsif new.opening_balance_date is distinct from old.opening_balance_date then
      fld := 'opening_balance_date';
      old_val := old.opening_balance_date::text; new_val := new.opening_balance_date::text;
    end if;

  elsif tg_table_name = 'labour_master' then
    fid := new.farm_id;
    if new.opening_balance is distinct from old.opening_balance then
      fld := 'opening_balance';
      old_val := old.opening_balance::text;  new_val := new.opening_balance::text;
    end if;

  elsif tg_table_name = 'farms' then
    fid := new.id;
    if new.capex_threshold is distinct from old.capex_threshold then
      fld := 'capex_threshold';
      old_val := old.capex_threshold::text;  new_val := new.capex_threshold::text;
    end if;
  end if;

  -- Nothing protected was touched: an ordinary edit, let it through untouched.
  if fld is null then
    return new;
  end if;

  if auth.uid() is not null and not public.has_farm_role(fid, 'admin') then
    raise exception
      'Only the farm owner can change %. This figure states what was true before the app started — ask the owner to correct it.', fld
      using errcode = '42501';
  end if;

  insert into public.protected_field_changes
    (farm_id, table_name, record_id, field_name, old_value, new_value, changed_by)
  values
    (fid, tg_table_name, new.id, fld, old_val, new_val, auth.uid());

  return new;
end $$;

comment on function public.guard_founding_figures() is
  'Rejects changes to opening balances and the capex threshold by anyone who is not a farm admin, and records every change that is allowed.';

-- ── 3. Attach it ─────────────────────────────────────────────────────────────

drop trigger if exists trg_guard_founding_figures on public.vendors;
create trigger trg_guard_founding_figures
  before update on public.vendors
  for each row execute function public.guard_founding_figures();

drop trigger if exists trg_guard_founding_figures on public.labour_master;
create trigger trg_guard_founding_figures
  before update on public.labour_master
  for each row execute function public.guard_founding_figures();

drop trigger if exists trg_guard_founding_figures on public.farms;
create trigger trg_guard_founding_figures
  before update on public.farms
  for each row execute function public.guard_founding_figures();

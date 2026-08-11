-- Founding figures are guarded at the door, not just after it
--
-- 0026/0027/0028 made every opening figure owner-only and audited — but only on
-- UPDATE. A manager could not restate an opening balance, yet could CREATE a
-- vendor, buyer, worker or account with any opening balance at all, and no row
-- in protected_field_changes would say so. Same figure, same power to move the
-- books, no guard and no record.
--
-- So the insert path gets the same two properties the update path has:
--   1. A non-zero opening figure on a brand-new row requires the admin role.
--   2. It is logged to protected_field_changes (old_value null — there was no
--      before), so "who stated this and when" has an answer from day one.
--
-- Rows inserted with a zero/absent opening figure are untouched — managers keep
-- creating vendors, buyers and workers exactly as before.

create or replace function public.guard_founding_figures_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  fid     uuid;
  fld     text;
  new_val text;
begin
  if tg_table_name = 'crop_cycles' then
    fid := new.farm_id;
    if coalesce(new.opening_cost, 0) <> 0 then
      fld := 'opening_cost';  new_val := new.opening_cost::text;
    end if;
  else
    fid := new.farm_id;
    if coalesce(new.opening_balance, 0) <> 0 then
      fld := 'opening_balance';  new_val := new.opening_balance::text;
    end if;
  end if;

  if fld is null then
    return new;
  end if;

  if auth.uid() is not null and not public.has_farm_role(fid, 'admin') then
    raise exception
      'Only the farm owner can state %. An opening figure says where the farm stood when it went live — ask the owner to enter it.', fld
      using errcode = '42501';
  end if;

  insert into public.protected_field_changes
    (farm_id, table_name, record_id, field_name, old_value, new_value, changed_by)
  values
    (fid, tg_table_name, new.id, fld, null, new_val, auth.uid());

  return new;
end $$;

drop trigger if exists trg_guard_founding_figures_insert on public.vendors;
create trigger trg_guard_founding_figures_insert
  before insert on public.vendors
  for each row execute function public.guard_founding_figures_insert();

drop trigger if exists trg_guard_founding_figures_insert on public.buyers;
create trigger trg_guard_founding_figures_insert
  before insert on public.buyers
  for each row execute function public.guard_founding_figures_insert();

drop trigger if exists trg_guard_founding_figures_insert on public.labour_master;
create trigger trg_guard_founding_figures_insert
  before insert on public.labour_master
  for each row execute function public.guard_founding_figures_insert();

drop trigger if exists trg_guard_founding_figures_insert on public.accounts;
create trigger trg_guard_founding_figures_insert
  before insert on public.accounts
  for each row execute function public.guard_founding_figures_insert();

drop trigger if exists trg_guard_founding_figures_insert on public.crop_cycles;
create trigger trg_guard_founding_figures_insert
  before insert on public.crop_cycles
  for each row execute function public.guard_founding_figures_insert();

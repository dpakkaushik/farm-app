-- The breakup is a founding figure too
--
-- 0024 itemises a cycle's opening cost into crop_cycle_opening_costs. Each row
-- is the same kind of figure as crop_cycles.opening_cost — a statement of where
-- the farm stood at go-live — so it gets the same door guard 0031 gave every
-- other opening figure: a non-zero amount on INSERT requires the admin role and
-- lands in protected_field_changes (old_value null — there was no before).
--
-- This file must run after 0031: it replaces guard_founding_figures_insert()
-- with a version that also understands the breakup table. Restating an existing
-- category (UPDATE) and removing one (DELETE) are admin-only via 0024's RLS;
-- the audited restatement path for the total remains crop_cycles.opening_cost.

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
  elsif tg_table_name = 'crop_cycle_opening_costs' then
    fid := new.farm_id;
    if coalesce(new.amount, 0) <> 0 then
      -- One audit line per category row, e.g. amount:labour.
      fld := 'amount:' || new.category;  new_val := new.amount::text;
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

drop trigger if exists trg_guard_founding_figures_insert on public.crop_cycle_opening_costs;
create trigger trg_guard_founding_figures_insert
  before insert on public.crop_cycle_opening_costs
  for each row execute function public.guard_founding_figures_insert();

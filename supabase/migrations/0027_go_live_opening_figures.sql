-- Going live: the rest of the opening figures
--
-- No farm joins this app on the day it was founded. It arrives mid-season, with
-- money already owed to shops, money owed to it by buyers, advances out with
-- labour, cash in the drawer and a crop half grown. Until it can state all of
-- that on day one, every ledger it shows is wrong — which is exactly how Pallia
-- came to read ₹2,34,666 against a paper ₹2,94,385.
--
-- 0025 gave parties an opening balance. This finishes the set:
--
--   farms.go_live_date     — the line. Before it, figures are stated;
--                            after it, everything is a transaction.
--   farms.opening_cash     — cash in the drawer on that date
--   buyers.opening_balance — what a buyer already owed the farm
--
-- Stock (OPENING-STOCK purchases), standing crops (crop_cycles.opening_cost)
-- and labour (labour_master.opening_balance) already existed. All six are now
-- reachable from one checklist.
--
-- Opening cash is a column on the farm, not a row in owner_cash_entries,
-- deliberately: it is one-time by nature and must never be mistakable for a
-- receipt. v_cash_book projects it as its first line so the running balance
-- starts from a real number instead of zero.
--
-- Like 0025's, none of these reach the P&L. They are positions carried in, not
-- costs incurred. The farm's P&L begins at go-live; a crop's lifetime P&L picks
-- up its pre-go-live spend from crop_cycles.opening_cost.

-- ── 1. The columns ───────────────────────────────────────────────────────────

alter table public.buyers
  add column if not exists opening_balance      numeric not null default 0,
  add column if not exists opening_balance_date date;

alter table public.farms
  add column if not exists go_live_date      date,
  add column if not exists opening_cash      numeric not null default 0,
  add column if not exists opening_cash_date date;

comment on column public.buyers.opening_balance is
  'What this buyer already owed the farm at go-live. A receivable carried in, with no sale behind it.';
comment on column public.farms.go_live_date is
  'The day this farm started recording transactions. Before it, positions are stated as opening figures; after it, everything is entered as it happens.';
comment on column public.farms.opening_cash is
  'Cash in hand on go-live day. Projected by v_cash_book as its opening line — never an entry in owner_cash_entries, which holds real receipts and payments only.';

-- ── 2. The cash book opens on a real number ──────────────────────────────────
--
-- Two things change beyond the opening line.
--
-- `amount` is exposed. It never was, and the frontend reduces over `r.amount`
-- to carry a balance forward across a period — so every figure in the Cash
-- Book's Balance column was arriving as NaN. Only the Summary card was right,
-- because it reads this view's own running_balance.
--
-- The window is partitioned by farm. It was not, so a user who belongs to two
-- farms had both farms' cash running into one balance. Harmless while everyone
-- had a single farm, wrong the moment this becomes a product.
--
-- Columns are appended, not inserted: `create or replace view` cannot renumber
-- existing columns and dropping this view would cascade.

create or replace view public.v_cash_book as
with entries as (
  select oce.id, oce.entry_date, oce.direction, oce.entry_type, oce.amount,
         oce.reference_id, oce.notes, oce.created_by, oce.created_at, oce.farm_id
    from public.owner_cash_entries oce
  union all
  select f.id,
         coalesce(f.opening_cash_date, f.go_live_date, '2000-01-01'::date),
         case when f.opening_cash >= 0 then 'in' else 'out' end,
         'opening_cash',
         abs(f.opening_cash),
         null::uuid,
         'Opening cash balance',
         null::uuid,
         '2000-01-01 00:00:00+00'::timestamptz,   -- sorts above same-day entries
         f.id
    from public.farms f
   where coalesce(f.opening_cash, 0) <> 0
)
select
    id,
    entry_date,
    case direction
      when 'in' then
        case entry_type
          when 'opening_cash'    then coalesce(notes, 'Opening cash balance')
          when 'owner_capital'   then coalesce(notes, 'Owner Capital Added')
          when 'revenue_receipt' then coalesce(notes, 'Revenue Received')
          else coalesce(notes, 'Cash Receipt')
        end
      else
        case entry_type
          when 'vendor_payment'  then coalesce(notes, 'Vendor Payment')
          when 'labour_payment'  then coalesce(notes, 'Labour Payment')
          when 'expense_payment' then coalesce(notes, 'Expense Payment')
          else coalesce(notes, 'Cash Payment')
        end
    end                                                        as particulars,
    case when direction = 'in'  then amount else 0::numeric end as receipt_amount,
    case when direction = 'out' then amount else 0::numeric end as payment_amount,
    direction,
    entry_type,
    reference_id,
    notes,
    created_by,
    created_at,
    sum(case when direction = 'in' then amount else - amount end)
      over (partition by farm_id order by entry_date, created_at
            rows unbounded preceding)                          as running_balance,
    amount,
    farm_id
  from entries
 order by entry_date, created_at;

alter view public.v_cash_book set (security_invoker = on);

-- ── 3. Every founding figure is the owner's ──────────────────────────────────
--
-- Extends 0026 to the figures added here, plus crop_cycles.opening_cost, which
-- had the same exposure — a manager could restate what a standing crop had cost
-- before the app and move its whole P&L, with nothing recording it.

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

  elsif tg_table_name = 'buyers' then
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

  elsif tg_table_name = 'crop_cycles' then
    fid := new.farm_id;
    if new.opening_cost is distinct from old.opening_cost then
      fld := 'opening_cost';
      old_val := old.opening_cost::text;  new_val := new.opening_cost::text;
    end if;

  elsif tg_table_name = 'farms' then
    fid := new.id;
    if new.capex_threshold is distinct from old.capex_threshold then
      fld := 'capex_threshold';
      old_val := old.capex_threshold::text;  new_val := new.capex_threshold::text;
    elsif new.opening_cash is distinct from old.opening_cash then
      fld := 'opening_cash';
      old_val := old.opening_cash::text;  new_val := new.opening_cash::text;
    elsif new.opening_cash_date is distinct from old.opening_cash_date then
      fld := 'opening_cash_date';
      old_val := old.opening_cash_date::text; new_val := new.opening_cash_date::text;
    elsif new.go_live_date is distinct from old.go_live_date then
      fld := 'go_live_date';
      old_val := old.go_live_date::text;  new_val := new.go_live_date::text;
    end if;
  end if;

  if fld is null then
    return new;
  end if;

  if auth.uid() is not null and not public.has_farm_role(fid, 'admin') then
    raise exception
      'Only the farm owner can change %. This figure states where the farm stood when it went live — ask the owner to correct it.', fld
      using errcode = '42501';
  end if;

  insert into public.protected_field_changes
    (farm_id, table_name, record_id, field_name, old_value, new_value, changed_by)
  values
    (fid, tg_table_name, new.id, fld, old_val, new_val, auth.uid());

  return new;
end $$;

drop trigger if exists trg_guard_founding_figures on public.buyers;
create trigger trg_guard_founding_figures
  before update on public.buyers
  for each row execute function public.guard_founding_figures();

drop trigger if exists trg_guard_founding_figures on public.crop_cycles;
create trigger trg_guard_founding_figures
  before update on public.crop_cycles
  for each row execute function public.guard_founding_figures();

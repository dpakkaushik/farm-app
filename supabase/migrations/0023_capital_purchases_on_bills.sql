-- Capital purchases on bills
--
-- A bill from a vendor is one document, but its lines do not all belong in one
-- register. Bill #4237 from NEW ANKUR BEEJ BHANDAR is the case that exposed it:
-- three fertiliser lines worth ₹8,060 went to inventory, and a ₹5,000 spray
-- machine went to machinery_master — where there is no vendor column, no bill
-- column, and nowhere to attach the bill image. Four things followed from that:
--
--   1. inventory_bills.total_amount said ₹8,060; the paper said ₹13,060.
--   2. The vendor was owed ₹5,000 the ledger could not see, and no payment
--      could ever settle it.
--   3. Capital spend appeared in neither the expense ledger nor the cash book.
--   4. There was no way to open the bill from the machine it paid for.
--
-- The fix is to make the bill the debit and let its lines land wherever they
-- belong. inventory_bills stops being an inventory-only document and becomes
-- the vendor bill header; machinery and assets can point at it. The table keeps
-- its name because renaming it would touch every caller for no gain.
--
-- Capital spend reaching the P&L is a separate question from reaching the
-- ledger. A ₹5,000 sprayer is this month's cost to a farm owner; an ₹8L tractor
-- is not, and expensing it would make the month look catastrophic. So a
-- per-farm threshold decides: under it the purchase is an ordinary expense on
-- its purchase date, over it the purchase is capital and stays out of the P&L
-- total. useful_life_years is added here for the depreciation that belongs on
-- top of this, but no depreciation is computed yet — capitalised purchases are
-- simply excluded from the expense ledger and reported on their own.

-- ── 1. The threshold, per farm ───────────────────────────────────────────────

alter table public.farms
  add column if not exists capex_threshold numeric not null default 10000;

comment on column public.farms.capex_threshold is
  'Asset/machinery purchases below this amount are expensed in the month bought; at or above it they are treated as capital and kept out of the P&L total.';

-- ── 2. Assets and machinery gain a money side ────────────────────────────────

alter table public.machinery_master
  add column if not exists vendor_id         uuid references public.vendors(id),
  add column if not exists bill_id           uuid references public.inventory_bills(id) on delete set null,
  add column if not exists useful_life_years integer;

alter table public.farm_assets
  add column if not exists vendor_id         uuid references public.vendors(id),
  add column if not exists bill_id           uuid references public.inventory_bills(id) on delete set null,
  add column if not exists useful_life_years integer;

-- inventory_purchases.bill_id has been a bare uuid with nothing enforcing that
-- it points at a real bill. Harmless while it was only used to group rows for
-- display; load-bearing now that a bill is the debit. Verified 0 dangling rows
-- before adding this.
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'inventory_purchases_bill_id_fkey') then
    alter table public.inventory_purchases
      add constraint inventory_purchases_bill_id_fkey
      foreign key (bill_id) references public.inventory_bills(id) on delete set null;
  end if;
end $$;

create index if not exists idx_inventory_purchases_bill on public.inventory_purchases(bill_id);
create index if not exists idx_machinery_master_bill   on public.machinery_master(bill_id);
create index if not exists idx_machinery_master_vendor on public.machinery_master(vendor_id);
create index if not exists idx_farm_assets_bill        on public.farm_assets(bill_id);
create index if not exists idx_farm_assets_vendor      on public.farm_assets(vendor_id);

comment on column public.machinery_master.bill_id is
  'The vendor bill this machine was bought on. When set, the bill header carries the debit — do not also count purchase_price against the vendor.';
comment on column public.farm_assets.bill_id is
  'The vendor bill this asset was bought on. When set, the bill header carries the debit — do not also count purchase_price against the vendor.';

-- ── 3. Every capital purchase, in one place ──────────────────────────────────
--
-- purchase_price is the unit price, so the amount is qty × price — the same
-- reading a bill line has. Rows with no price or no date are not purchases we
-- can account for, so they stay out.
--
-- The bill's invoice number and file come along because the vendor khata groups
-- a bill's lines by document: a capital line has to be able to name the invoice
-- it belongs to, including on a bill that is nothing but a machine.

drop view if exists public.v_capital_purchases;

create view public.v_capital_purchases as
select
    m.id,
    m.farm_id,
    'machinery'::text                                              as source,
    m.name,
    coalesce(m.machinery_type, 'machinery')                        as category,
    m.purchase_date,
    greatest(coalesce(m.quantity, 1), 1)                           as quantity,
    coalesce(m.purchase_price, 0)                                  as unit_price,
    round(coalesce(m.purchase_price, 0)
          * greatest(coalesce(m.quantity, 1), 1), 2)               as amount,
    m.vendor_id,
    m.bill_id,
    mb.invoice_number                                              as bill_invoice_number,
    mb.bill_file_url,
    m.useful_life_years,
    (coalesce(m.purchase_price, 0) * greatest(coalesce(m.quantity, 1), 1))
      >= coalesce(f.capex_threshold, 10000)                        as is_capitalised
  from public.machinery_master m
  join public.farms f on f.id = m.farm_id
  left join public.inventory_bills mb on mb.id = m.bill_id
 where m.is_active is distinct from false
   and m.purchase_date is not null
   and coalesce(m.purchase_price, 0) > 0
union all
select
    a.id,
    a.farm_id,
    'asset'::text,
    a.name,
    coalesce(a.category, 'equipment'),
    a.purchase_date,
    greatest(coalesce(a.quantity, 1), 1),
    coalesce(a.purchase_price, 0),
    round(coalesce(a.purchase_price, 0)
          * greatest(coalesce(a.quantity, 1), 1), 2),
    a.vendor_id,
    a.bill_id,
    ab.invoice_number,
    ab.bill_file_url,
    a.useful_life_years,
    (coalesce(a.purchase_price, 0) * greatest(coalesce(a.quantity, 1), 1))
      >= coalesce(f.capex_threshold, 10000)
  from public.farm_assets a
  join public.farms f on f.id = a.farm_id
  left join public.inventory_bills ab on ab.id = a.bill_id
 where a.is_active is distinct from false
   and a.purchase_date is not null
   and coalesce(a.purchase_price, 0) > 0;

alter view public.v_capital_purchases set (security_invoker = on);

-- ── 4. Vendor balances: one bill, one debit — and no more fan-out ────────────
--
-- The old definition left-joined inventory_purchases and vendor_payments in the
-- same query and summed both, which multiplies: a vendor with 18 purchase rows
-- and 1 payment returned that payment 18 times over. It read correctly only
-- because no vendor had been paid yet. Each side is now aggregated on its own
-- before it is joined, so the counts cannot cross-multiply.
--
-- Debits come from three places that never overlap:
--   · bills           — the document total, whatever its lines were
--   · purchase lines  — only those with no bill (recorded before bills existed)
--   · capital rows    — only those with no bill (bought without one)
--
-- A header with no lines at all is not a bill, it is a failed save. The old
-- recordBillPurchase wrote the header first and the lines after, with no
-- transaction, so every retry of a failing save left another header behind —
-- ten of them for invoice 4017, ₹378,500 of nothing. That was harmless while
-- the balance came from lines and is not harmless now that it comes from
-- headers, so an empty header is excluded here as well as being cleaned up.
-- A partly entered bill still counts in full: the vendor is owed the document.

create or replace view public.v_vendor_balances as
with bill_debits as (
  select b.vendor_id, sum(b.total_amount) as amt
    from public.inventory_bills b
   where b.vendor_id is not null
     and (   exists (select 1 from public.inventory_purchases p where p.bill_id = b.id)
          or exists (select 1 from public.machinery_master    m where m.bill_id = b.id)
          or exists (select 1 from public.farm_assets         a where a.bill_id = b.id))
   group by b.vendor_id
), unbilled_purchases as (
  select vendor_id, sum(total_cost) as amt
    from public.inventory_purchases
   where vendor_id is not null and bill_id is null
   group by vendor_id
), unbilled_capital as (
  select vendor_id, sum(amount) as amt
    from public.v_capital_purchases
   where vendor_id is not null and bill_id is null
   group by vendor_id
), payments as (
  select vendor_id, sum(amount) as amt
    from public.vendor_payments
   group by vendor_id
)
select
    v.id        as vendor_id,
    v.name      as vendor_name,
    v.category,
    v.phone,
    v.is_active,
    (coalesce(bd.amt, 0) + coalesce(up.amt, 0) + coalesce(uc.amt, 0)) as total_purchased,
    coalesce(pm.amt, 0)                                              as total_paid,
    (coalesce(bd.amt, 0) + coalesce(up.amt, 0) + coalesce(uc.amt, 0)
       - coalesce(pm.amt, 0))                                        as balance_due
  from public.vendors v
  left join bill_debits        bd on bd.vendor_id = v.id
  left join unbilled_purchases up on up.vendor_id = v.id
  left join unbilled_capital   uc on uc.vendor_id = v.id
  left join payments           pm on pm.vendor_id = v.id;

alter view public.v_vendor_balances set (security_invoker = on);

-- ── 5. The vendor khata gains its capital lines ──────────────────────────────
--
-- Billed capital rows are shown as their own line rather than folded into the
-- bill, because this view has no bill-level row to fold them into; the totals
-- still agree with v_vendor_balances since a bill's inventory lines and its
-- capital lines together are the bill.

create or replace view public.v_vendor_ledger as
select
    v.id   as vendor_id,
    v.name as vendor_name,
    v.category,
    ip.purchase_date as entry_date,
    concat('Purchase: ', ii.name, ' — ', ip.quantity, ' ', ii.unit,
           case when ip.invoice_number is not null
                then concat(' (Inv: ', ip.invoice_number, ')') else '' end) as particulars,
    ip.total_cost   as debit_amount,
    0::numeric      as credit_amount,
    ip.id           as ref_id,
    'purchase'::text as entry_type
  from public.vendors v
  join public.inventory_purchases ip on ip.vendor_id = v.id
  join public.inventory_items ii     on ii.id = ip.item_id
union all
select
    v.id,
    v.name,
    v.category,
    cp.purchase_date,
    concat(case cp.source when 'machinery' then 'Machinery: ' else 'Asset: ' end, cp.name,
           case when cp.bill_invoice_number is not null
                then concat(' (Inv: ', cp.bill_invoice_number, ')') else '' end),
    cp.amount,
    0::numeric,
    cp.id,
    'capital'::text
  from public.vendors v
  join public.v_capital_purchases cp on cp.vendor_id = v.id
union all
select
    v.id,
    v.name,
    v.category,
    vp.payment_date,
    coalesce(vp.notes, 'Cash Payment'::text),
    0::numeric,
    vp.amount,
    vp.id,
    'payment'::text
  from public.vendors v
  join public.vendor_payments vp on vp.vendor_id = v.id;

alter view public.v_vendor_ledger set (security_invoker = on);

-- ── 6. Small capital purchases become ordinary expenses ──────────────────────
--
-- Same column list as before, one branch added. Purchases at or above the
-- farm's threshold are deliberately absent: they are capital, they are reported
-- by v_capital_purchases, and folding them in here would distort every month
-- they fall in. v_monthly_summary reads this view and inherits the change.

create or replace view public.v_expense_ledger as
 select fe.id,
    fe.expense_date as entry_date,
    fe.category,
    coalesce(fe.description, fe.category) as description,
    fe.amount,
    fe.attributed_to,
    'farm_expense'::text as expense_type,
    (exists ( select 1 from expense_payments ep where ep.reference_id = fe.id)) as is_paid,
    ( select max(ep.payment_date) from expense_payments ep where ep.reference_id = fe.id) as paid_date,
    fe.payment_mode,
    fe.notes
   from farm_expenses fe
union all
 select ll.id,
    ll.activity_date as entry_date,
    'labour'::text as category,
    concat('Labour — ', ll.labour_name,
        case when ll.work_type is not null then concat(' (', ll.work_type, ')') else '' end) as description,
    ll.total_payment as amount,
    'general'::text as attributed_to,
    'labour'::text as expense_type,
    coalesce(ll.is_paid, false) as is_paid,
    ll.paid_date,
    ll.paid_via as payment_mode,
    ll.notes
   from labour_logs ll
     left join labour_master lm on lm.id = ll.labour_master_id
  where (lm.id is null) or (coalesce(lm.sub_type, ''::text) <> all (array['permanent'::text, 'regular'::text]))
union all
 select (md5((sa.labourer_id)::text || (sa.month)::text))::uuid as id,
    least(((sa.month + '1 mon'::interval) - '1 day'::interval)::date, current_date) as entry_date,
    'salary'::text as category,
    concat('Salary — ', sa.name, ' (', to_char((sa.month)::timestamp with time zone, 'Mon YYYY'::text), ')') as description,
    sa.earned as amount,
    'general'::text as attributed_to,
    'salary'::text as expense_type,
    false as is_paid,
    null::date as paid_date,
    null::text as payment_mode,
    null::text as notes
   from v_salary_accrual sa
  where sa.earned > 0::numeric
union all
 select ip.id,
    ip.purchase_date as entry_date,
    'inventory_purchase'::text as category,
    concat('Purchase from ', coalesce(v.name, ip.vendor_name, 'Vendor'::text)) as description,
    ip.total_cost as amount,
    'inventory'::text as attributed_to,
    'vendor_purchase'::text as expense_type,
    false as is_paid,
    null::date as paid_date,
    null::text as payment_mode,
    ip.notes
   from inventory_purchases ip
     left join vendors v on v.id = ip.vendor_id
union all
 select cp.id,
    cp.purchase_date as entry_date,
    'small_equipment'::text as category,
    concat(case cp.source when 'machinery' then 'Machinery — ' else 'Equipment — ' end, cp.name) as description,
    cp.amount,
    'general'::text as attributed_to,
    'capital_purchase'::text as expense_type,
    false as is_paid,
    null::date as paid_date,
    null::text as payment_mode,
    null::text as notes
   from v_capital_purchases cp
  where cp.is_capitalised = false;

alter view public.v_expense_ledger set (security_invoker = on);

-- Vendor opening balance
--
-- A farm does not start owing nothing. Pallia had been buying from NEW ANKUR
-- BEEJ BHANDAR for two months before the app existed: five bills, ₹67,770, on
-- the shop's khata and nowhere else. The app could only show ₹2,34,666 against
-- a paper balance of ₹2,94,385, and no amount of entering bills would close the
-- gap, because the missing money predates every bill the app can hold.
--
-- The alternative — back-entering those five bills as real purchases — is worse
-- than useless. Their stock arrived and was consumed months ago, so re-entering
-- them would inflate current stock, disturb weighted-average costs, and fight
-- the physical count the store was reconciled to on 2026-07-21. What is wanted
-- is only the money side: an amount owed, carried in, owing to nothing the app
-- can itemise.
--
-- So a party gets an opening balance, exactly as a labourer already does
-- (labour_master.opening_balance). It is a debit like any other, it settles
-- under the same payments, and it needs no bill behind it.
--
-- What it deliberately does NOT do: reach the P&L. An opening balance is a debt
-- carried in, not a cost incurred this season. The cost of goods bought before
-- the app belongs to crop_cycle_opening_costs (migration 0024) — putting it
-- here as well would count the same spend twice. v_expense_ledger is therefore
-- untouched by this migration, and that is the point, not an oversight.

-- ── 1. The column ────────────────────────────────────────────────────────────

alter table public.vendors
  add column if not exists opening_balance      numeric not null default 0,
  add column if not exists opening_balance_date date;

comment on column public.vendors.opening_balance is
  'Amount already owed to this party when the farm started using the app. A debit on the khata with no bill behind it. Never reaches the P&L — pre-app cost belongs in crop_cycle_opening_costs.';
comment on column public.vendors.opening_balance_date is
  'The date the opening balance is as of — the khata dates the opening row with it. Null sorts the row first.';

-- ── 2. Balances count it as a debit ──────────────────────────────────────────
--
-- Same three non-overlapping debit sources as 0023, plus the opening balance.
-- Each side stays aggregated on its own so nothing cross-multiplies.

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
    (coalesce(v.opening_balance, 0)
       + coalesce(bd.amt, 0) + coalesce(up.amt, 0) + coalesce(uc.amt, 0)
       - coalesce(pm.amt, 0))                                        as balance_due,
    -- appended, not inserted: `create or replace view` cannot renumber existing
    -- columns, and dropping this view would cascade to everything reading it.
    coalesce(v.opening_balance, 0)                                   as opening_balance
  from public.vendors v
  left join bill_debits        bd on bd.vendor_id = v.id
  left join unbilled_purchases up on up.vendor_id = v.id
  left join unbilled_capital   uc on uc.vendor_id = v.id
  left join payments           pm on pm.vendor_id = v.id;

alter view public.v_vendor_balances set (security_invoker = on);

-- ── 3. The khata opens with it ───────────────────────────────────────────────
--
-- One row per party that carries one, dated so it sorts above every bill. A
-- null date falls back to an epoch far enough back that nothing precedes it.

create or replace view public.v_vendor_ledger as
select
    v.id   as vendor_id,
    v.name as vendor_name,
    v.category,
    coalesce(v.opening_balance_date, '2000-01-01'::date) as entry_date,
    'Opening balance (carried in — before app)'::text    as particulars,
    v.opening_balance as debit_amount,
    0::numeric        as credit_amount,
    v.id              as ref_id,
    'opening'::text   as entry_type
  from public.vendors v
 where coalesce(v.opening_balance, 0) <> 0
union all
select
    v.id,
    v.name,
    v.category,
    ip.purchase_date,
    concat('Purchase: ', ii.name, ' — ', ip.quantity, ' ', ii.unit,
           case when ip.invoice_number is not null
                then concat(' (Inv: ', ip.invoice_number, ')') else '' end),
    ip.total_cost,
    0::numeric,
    ip.id,
    'purchase'::text
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

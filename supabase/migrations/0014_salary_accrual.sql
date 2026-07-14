-- Why: salary only entered the books when it was PAID. Unpaid salary was invisible
-- everywhere — no expense, no liability, no pending row. Five staff and twelve
-- regular workers had worked June and July; the ledger showed three May payments
-- and nothing else. The farm's expenses were understated by every rupee of wages
-- it owed but had not yet handed over.
--
-- Standard payroll accounting accrues the wage in the month it is EARNED, and
-- treats the payment as settling that liability. Income already works this way
-- (a sale is income on the sale date, not the payment date); wages now match.
--
-- Two views:
--   v_salary_accrual — what each worker earned, per month, from attendance and
--                      contract work. Replicates the Labour → Salary formula
--                      exactly, so the ledger and the salary screen agree.
--   v_salary_dues    — the khata balance per worker: opening + earned − advances
--                      − paid. This is the liability the Ledger must show.
--
-- v_expense_ledger's salary branch now carries the ACCRUAL, not the payment.
-- Payments remain cash-book entries (0011) and settle the khata; booking both
-- would double-count.

-- ── What each worker earned, by month ────────────────────────────────────────
create or replace view public.v_salary_accrual
with (security_invoker = on) as
with base as (
  select lm.id as labourer_id, lm.farm_id, lm.name, lm.sub_type,
         coalesce(lm.monthly_salary, 0)   as monthly_salary,
         coalesce(lm.daily_base_rate, 0)  as daily_rate,
         coalesce(lm.monthly_holiday, 2)  as holiday
    from labour_master lm
   where lm.sub_type in ('permanent', 'regular')
),
att as (
  -- A half day is half a day's wage — same as the Salary screen.
  select a.labour_master_id as lid,
         date_trunc('month', a.attendance_date)::date as m,
         sum(case a.status when 'present' then 1.0 when 'half_day' then 0.5 else 0 end) as days
    from attendance a
   group by 1, 2
),
logs as (
  -- Piece/contract work a rostered worker did on top of his daily wage.
  select ll.labour_master_id as lid,
         date_trunc('month', ll.activity_date)::date as m,
         sum(coalesce(ll.total_payment, 0)) as contract_pay
    from labour_logs ll
   where ll.labour_master_id is not null
   group by 1, 2
),
keys as (
  select lid, m from att
  union
  select lid, m from logs
)
select b.farm_id,
       b.labourer_id,
       b.name,
       b.sub_type,
       k.m as month,
       coalesce(a.days, 0) as days,
       case
         when b.monthly_salary > 0 then
           -- Monthly salary spread over working days (month days − holiday
           -- allowance), never exceeding the full salary.
           least(
             b.monthly_salary,
             round(coalesce(a.days, 0) * b.monthly_salary /
                   greatest(1, extract(day from (k.m + interval '1 month' - interval '1 day'))::int - b.holiday))
           )
         else round(coalesce(a.days, 0) * b.daily_rate)
       end as attendance_pay,
       coalesce(l.contract_pay, 0) as contract_pay,
       case
         when b.monthly_salary > 0 then
           least(
             b.monthly_salary,
             round(coalesce(a.days, 0) * b.monthly_salary /
                   greatest(1, extract(day from (k.m + interval '1 month' - interval '1 day'))::int - b.holiday))
           )
         else round(coalesce(a.days, 0) * b.daily_rate)
       end + coalesce(l.contract_pay, 0) as earned
  from keys k
  join base b on b.labourer_id = k.lid
  left join att  a on a.lid = k.lid and a.m = k.m
  left join logs l on l.lid = k.lid and l.m = k.m;

-- ── What the farm still owes each worker ─────────────────────────────────────
create or replace view public.v_salary_dues
with (security_invoker = on) as
select lm.farm_id,
       lm.id as labourer_id,
       lm.name,
       lm.sub_type,
       lm.status,
       coalesce(lm.opening_balance, 0) as opening_balance,
       coalesce((select sum(sa.earned)      from v_salary_accrual sa where sa.labourer_id = lm.id), 0) as total_earned,
       coalesce((select sum(ad.amount)      from salary_advances  ad where ad.labourer_id = lm.id), 0) as total_advances,
       coalesce((select sum(sp.amount_paid) from salary_payments  sp where sp.labourer_id = lm.id), 0) as total_paid,
       coalesce(lm.opening_balance, 0)
         + coalesce((select sum(sa.earned)      from v_salary_accrual sa where sa.labourer_id = lm.id), 0)
         - coalesce((select sum(ad.amount)      from salary_advances  ad where ad.labourer_id = lm.id), 0)
         - coalesce((select sum(sp.amount_paid) from salary_payments  sp where sp.labourer_id = lm.id), 0)
       as balance_due
  from labour_master lm
 where lm.sub_type in ('permanent', 'regular');

-- ── Expense ledger: salary accrues when earned ───────────────────────────────
create or replace view public.v_expense_ledger
with (security_invoker = on) as

 select fe.id,
    fe.expense_date as entry_date,
    fe.category,
    coalesce(fe.description, fe.category) as description,
    fe.amount,
    fe.attributed_to,
    'farm_expense'::text as expense_type,
    exists (select 1 from expense_payments ep where ep.reference_id = fe.id) as is_paid,
    (select max(ep.payment_date) from expense_payments ep where ep.reference_id = fe.id) as paid_date,
    fe.payment_mode,
    fe.notes
   from farm_expenses fe

union all

 select ll.id,
    ll.activity_date as entry_date,
    'labour'::text as category,
    concat('Labour — ', ll.labour_name,
        case when ll.work_type is not null then concat(' (', ll.work_type, ')') else ''::text end
    ) as description,
    ll.total_payment as amount,
    'general'::text as attributed_to,
    'labour'::text as expense_type,
    coalesce(ll.is_paid, false) as is_paid,
    ll.paid_date,
    ll.paid_via as payment_mode,
    ll.notes
   from labour_logs ll
     left join labour_master lm on lm.id = ll.labour_master_id
  -- Khata rule: rostered workers settle through Labour → Salary, and their
  -- contract work is already inside v_salary_accrual. Only outside labour here.
  where lm.id is null or coalesce(lm.sub_type, '') not in ('permanent', 'regular')

union all

 -- Wages earned, not wages paid. Dated to month end, or today if the month is
 -- still running, so a partial month is never booked in the future.
 select md5(sa.labourer_id::text || sa.month::text)::uuid as id,
    least((sa.month + interval '1 month' - interval '1 day')::date, current_date) as entry_date,
    'salary'::text as category,
    concat('Salary — ', sa.name, ' (', to_char(sa.month, 'Mon YYYY'), ')') as description,
    sa.earned as amount,
    'general'::text as attributed_to,
    'salary'::text as expense_type,
    false as is_paid,           -- settled against the khata, not row by row
    null::date as paid_date,
    null::text as payment_mode,
    null::text as notes
   from v_salary_accrual sa
  where sa.earned > 0

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
     left join vendors v on v.id = ip.vendor_id;

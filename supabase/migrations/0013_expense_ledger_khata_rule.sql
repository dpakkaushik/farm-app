-- Why: a regular labourer's daily work logs are part of his salary khata — the
-- Labour → Salary tab already includes them in his balance (earned + contract
-- work − advances − paid). But v_expense_ledger ALSO listed those same logs as
-- independently payable labour expense, so the same work counted twice and,
-- with the Expenses-tab Pay button, could be PAID twice: once on the row, once
-- inside the monthly salary.
--
-- The rule now: whoever has a khata is expensed through the khata's settlement.
-- Staff and regular workers' wages enter the books via salary_payments; only
-- outside/contractual labour (no khata) appears as payable rows here.
--
-- Cost attribution to plots is untouched — v_crop_pnl reads labour_logs
-- directly and still sees every log.

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
  -- Khata rule: workers on the salary roll settle through Labour → Salary.
  where lm.id is null or coalesce(lm.sub_type, '') not in ('permanent', 'regular')

union all

 select sp.id,
    sp.payment_date as entry_date,
    'salary'::text as category,
    concat('Salary — ', lm.name,
        case when sp.payment_month is not null
             then concat(' (', to_char(sp.payment_month::timestamptz, 'Mon YYYY'), ')')
             else ''::text end
    ) as description,
    sp.amount_paid as amount,
    'general'::text as attributed_to,
    'salary'::text as expense_type,
    true as is_paid,
    sp.payment_date as paid_date,
    sp.payment_mode,
    sp.notes
   from salary_payments sp
     join labour_master lm on lm.id = sp.labourer_id

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

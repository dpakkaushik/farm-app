-- Go-live conversion: a farm with history re-baselines as a fresh mid-year signup
--
-- A SaaS farm signs up mid-financial-year. It cannot re-enter months of history;
-- it states positions — cash in hand, who owes whom, stock on the shelf, what the
-- standing crop has already cost — and records transactions from a chosen date.
-- The opening slots for all of that already exist (0025–0028). What did not exist
-- is the converse: a farm that HAS transaction rows (Pallia — backfilled from
-- paper) and wants to become that fresh farm.
--
-- The rule: SETTLED HISTORY FOLDS, OPEN ITEMS SURVIVE.
--
-- A pre-cutover row is deleted only if it is fully settled before the cutover.
-- Open items (an unpaid sale, an unpaid contractor log, an unsold residual) keep
-- their rows and their dates, because the row itself is the only carrier of that
-- due. Where a khata slot exists (vendor, labour, account), settled and open
-- history both fold into it, because settlement there is party-level:
--
--   accounts.opening_balance   += signed sum of pre-cutover cash entries
--   vendors.opening_balance    += pre bills (minus capital lines) + pre unbilled
--                                 purchases − pre payments
--   labour_master.opening_balance += pre accrual + contract pay − advances − paid
--                                 (the exact v_salary_dues arithmetic)
--   crop_cycles.opening_cost   += pre issues + pre labour logs BEING DELETED
--   stock                      →  one OPENING-STOCK purchase per item, dated at
--                                 the FY boundary (the recordOpeningStock
--                                 convention), so carried-in stock never lands in
--                                 the current FY's expense ledger
--   tree / livestock counts    →  pre logs collapse to one opening_balance log
--                                 dated the cutover (counts are trigger-derived
--                                 from the full log history, so the opening row
--                                 is written and the old rows removed in the same
--                                 transaction and the recompute lands unchanged)
--
-- Buyers fold nothing: their settlement is row-level (receipts live on the sale),
-- so settled sales delete and open sales survive. buyers.opening_balance is only
-- for a fresh farm stating a carried-in receivable — 0031-adjacent frontend work
-- gives those a settlement path (buyer_receipt cash entries).
--
-- Safety, in order of paranoia:
--   1. Everything deleted is copied to go_live_archive first (owner-readable).
--   2. The function snapshots every balance the app can display — per account,
--      per vendor, per worker, per item, per kept cycle's cost, per buyer, per
--      count — and recomputes after surgery. Any mismatch raises, and the whole
--      transaction rolls back.
--   3. One shot: refuses if farms.go_live_date is already set.
--   4. Cutover must be the 1st of a month — v_salary_accrual caps monthly pay
--      with LEAST(salary, …) per month, and a mid-month split would break the
--      cap's additivity. Month boundaries also match how books are actually cut.
--
-- Intentionally erased, and reported rather than blocked: revenue of settled
-- pre-cutover sales on cycles that survive (their P&L starts at go-live, like a
-- fresh farm's would; the wizard shows the erased amount per cycle).

-- ── 1. The archive ────────────────────────────────────────────────────────────

create table if not exists public.go_live_archive (
  id          bigint generated always as identity primary key,
  farm_id     uuid not null references public.farms(id) on delete cascade,
  batch_id    uuid not null,
  table_name  text not null,
  row_data    jsonb not null,
  archived_at timestamptz not null default now()
);

create index if not exists idx_go_live_archive_farm
  on public.go_live_archive(farm_id, batch_id);

comment on table public.go_live_archive is
  'Every row the go-live conversion deletes, as jsonb, before it is deleted. Not a book of record — an emergency copy. Owner-readable, written only by go_live_convert.';

alter table public.go_live_archive enable row level security;

-- Deliberately select-only, like protected_field_changes: rows arrive solely
-- from the SECURITY DEFINER function.
drop policy if exists go_live_archive_select on public.go_live_archive;
create policy go_live_archive_select on public.go_live_archive
  for select using (public.has_farm_role(farm_id, 'admin'));

-- ── 2. The invariant snapshot ─────────────────────────────────────────────────
--
-- Everything the app can display as a balance, keyed by row id, rounded to the
-- paisa. Taken before and after; compared by _go_live_diff.

create or replace function public._go_live_state(p_farm_id uuid)
returns jsonb
language sql
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'accounts', coalesce((
      select jsonb_object_agg(a.id::text, round(a.opening_balance + coalesce(e.net, 0), 2))
      from accounts a
      left join (
        select account_id, sum(case when direction = 'in' then amount else -amount end) as net
        from owner_cash_entries where farm_id = p_farm_id group by account_id
      ) e on e.account_id = a.id
      where a.farm_id = p_farm_id
    ), '{}'::jsonb),
    'vendors', coalesce((
      select jsonb_object_agg(vb.vendor_id::text, round(vb.balance_due, 2))
      from v_vendor_balances vb join vendors v on v.id = vb.vendor_id
      where v.farm_id = p_farm_id
    ), '{}'::jsonb),
    'labour', coalesce((
      select jsonb_object_agg(sd.labourer_id::text, round(sd.balance_due, 2))
      from v_salary_dues sd where sd.farm_id = p_farm_id
    ), '{}'::jsonb),
    'stock', coalesce((
      select jsonb_object_agg(i.id::text, round(coalesce(i.current_stock, 0), 2))
      from inventory_items i where i.farm_id = p_farm_id
    ), '{}'::jsonb),
    'cycle_costs', coalesce((
      select jsonb_object_agg(pnl.cycle_id::text, round(pnl.total_cost, 2))
      from v_crop_pnl pnl where pnl.farm_id = p_farm_id
    ), '{}'::jsonb),
    'buyers', coalesce((
      select jsonb_object_agg(b.id::text, round(
        coalesce(b.opening_balance, 0) + coalesce((
          select sum(
            (s.total_amount - coalesce(s.commission_per_qtl, 0) * (s.quantity_kg / 100)
              - coalesce(s.freight_charges, 0) - coalesce(s.deductions, 0))
            - case when s.payment_status = 'paid'
                then (s.total_amount - coalesce(s.commission_per_qtl, 0) * (s.quantity_kg / 100)
                      - coalesce(s.freight_charges, 0) - coalesce(s.deductions, 0))
                else coalesce(s.amount_received, 0) end)
          from sales s where s.buyer_id = b.id
        ), 0), 2))
      from buyers b where b.farm_id = p_farm_id
    ), '{}'::jsonb),
    'livestock_counts', coalesce((
      select jsonb_object_agg(lm.id::text, coalesce(lm.current_count, 0))
      from livestock_master lm where lm.farm_id = p_farm_id
    ), '{}'::jsonb),
    'tree_counts', coalesce((
      select jsonb_object_agg(tp.id::text, coalesce(tp.current_count, 0))
      from tree_plantings tp where tp.farm_id = p_farm_id
    ), '{}'::jsonb)
  );
$$;

create or replace function public._go_live_diff(p_before jsonb, p_after jsonb)
returns text[]
language plpgsql
as $$
declare
  v_section text;
  v_key     text;
  v_diffs   text[] := '{}';
begin
  foreach v_section in array array[
    'accounts', 'vendors', 'labour', 'stock', 'cycle_costs',
    'buyers', 'livestock_counts', 'tree_counts'
  ] loop
    -- Every balance that exists after must equal what it was before. Keys that
    -- vanish (a deleted empty cycle) are fine; keys must never appear from
    -- nowhere with a value the before-state cannot vouch for.
    for v_key in select jsonb_object_keys(coalesce(p_after -> v_section, '{}'::jsonb)) loop
      if (p_before -> v_section -> v_key) is distinct from (p_after -> v_section -> v_key) then
        v_diffs := v_diffs || format('%s.%s: %s -> %s', v_section, v_key,
          coalesce((p_before -> v_section ->> v_key), 'absent'),
          (p_after -> v_section ->> v_key));
      end if;
    end loop;
  end loop;
  return v_diffs;
end $$;

-- ── 3. The plan (read-only preview) ───────────────────────────────────────────
--
-- Everything the conversion would do, as one jsonb document the wizard renders.
-- The same predicates as go_live_convert, verbatim — and if they ever drift,
-- the invariant check in convert is the net underneath.

create or replace function public.go_live_preview(p_farm_id uuid, p_cutover date)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_result jsonb;
begin
  if auth.uid() is not null and not public.has_farm_role(p_farm_id, 'admin') then
    raise exception 'Only the farm owner can preview a go-live conversion.' using errcode = '42501';
  end if;
  if extract(day from p_cutover) <> 1 then
    raise exception 'The cutover must be the first day of a month.';
  end if;

  select jsonb_build_object(
    'farm_id', p_farm_id,
    'cutover', p_cutover,
    'already_converted', (select f.go_live_date from farms f where f.id = p_farm_id),

    'accounts', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', a.id, 'name', a.name, 'current_opening', a.opening_balance,
        'fold', coalesce(e.net, 0),
        'new_opening', a.opening_balance + coalesce(e.net, 0)) order by a.name)
      from accounts a
      left join (
        select coalesce(account_id, (select id from accounts where farm_id = p_farm_id and is_default limit 1)) as account_id,
               sum(case when direction = 'in' then amount else -amount end) as net
        from owner_cash_entries
        where farm_id = p_farm_id and entry_date < p_cutover
        group by 1
      ) e on e.account_id = a.id
      where a.farm_id = p_farm_id
    ), '[]'::jsonb),

    'vendors', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', v.id, 'name', v.name, 'current_opening', v.opening_balance,
        'fold', f.amt, 'new_opening', v.opening_balance + f.amt) order by v.name)
      from vendors v
      join (
        select vendor_id, sum(amt) as amt from (
          select b.vendor_id,
                 b.total_amount - coalesce((select sum(cp.amount) from v_capital_purchases cp where cp.bill_id = b.id), 0) as amt
          from inventory_bills b
          where b.farm_id = p_farm_id and b.vendor_id is not null and b.bill_date < p_cutover
            and (exists(select 1 from inventory_purchases p where p.bill_id = b.id)
              or exists(select 1 from machinery_master m where m.bill_id = b.id)
              or exists(select 1 from farm_assets fa where fa.bill_id = b.id))
          union all
          select p.vendor_id, p.total_cost
          from inventory_purchases p
          where p.farm_id = p_farm_id and p.vendor_id is not null
            and p.bill_id is null and p.purchase_date < p_cutover
          union all
          select vp.vendor_id, -vp.amount
          from vendor_payments vp
          where vp.farm_id = p_farm_id and vp.payment_date < p_cutover
        ) x group by vendor_id
      ) f on f.vendor_id = v.id and f.amt <> 0
      where v.farm_id = p_farm_id
    ), '[]'::jsonb),

    'labour', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', w.id, 'name', w.name, 'sub_type', w.sub_type,
        'current_opening', w.opening_balance, 'fold', w.delta,
        'new_opening', w.opening_balance + w.delta) order by w.name)
      from (
        select lm.id, lm.name, lm.sub_type, coalesce(lm.opening_balance, 0) as opening_balance,
               coalesce(acc.earned, 0) + coalesce(cl.pay, 0) - coalesce(adv.amt, 0) - coalesce(pd.amt, 0) as delta
        from labour_master lm
        left join lateral (
          select sum(case when coalesce(lm.monthly_salary, 0) > 0
            then least(lm.monthly_salary,
                       round(t.days * lm.monthly_salary
                             / greatest(1, extract(day from t.m + interval '1 mon' - interval '1 day')::integer
                                           - coalesce(lm.monthly_holiday, 2))::numeric))
            else round(t.days * coalesce(lm.daily_base_rate, 0)) end) as earned
          from (
            select date_trunc('month', a.attendance_date)::date as m,
                   sum(case a.status when 'present' then 1.0 when 'half_day' then 0.5 else 0 end) as days
            from attendance a
            where a.labour_master_id = lm.id and a.attendance_date < p_cutover
            group by 1
          ) t
        ) acc on true
        left join lateral (select sum(ll.total_payment) as pay from labour_logs ll
                           where ll.labour_master_id = lm.id and ll.activity_date < p_cutover) cl on true
        left join lateral (select sum(sa.amount) as amt from salary_advances sa
                           where sa.labourer_id = lm.id and sa.advance_date < p_cutover) adv on true
        left join lateral (select sum(sp.amount_paid) as amt from salary_payments sp
                           where sp.labourer_id = lm.id and coalesce(sp.payment_date, sp.payment_month) < p_cutover) pd on true
        where lm.farm_id = p_farm_id and lm.sub_type in ('permanent', 'regular')
      ) w where w.delta <> 0
    ), '[]'::jsonb),

    'stock', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', s.item_id, 'name', s.name, 'qty', s.qty, 'unit', s.unit,
        'unit_cost', s.cost, 'value', round(s.qty * s.cost, 2)) order by s.name)
      from (
        -- Stored stock minus surviving rows — the same rule go_live_convert
        -- writes, so the preview shows exactly what will be written.
        select i.id as item_id, i.name, i.unit, coalesce(i.cost_per_unit, 0) as cost,
          coalesce(i.current_stock, 0)
          - ( coalesce((select sum(p.quantity) from inventory_purchases p
                    where p.item_id = i.id
                      and not ((p.bill_id is null and p.purchase_date < p_cutover)
                        or exists(select 1 from inventory_bills b where b.id = p.bill_id and b.bill_date < p_cutover))), 0)
            - coalesce((select sum(x.quantity) from inventory_issues x
                      where x.item_id = i.id and x.issue_date >= p_cutover), 0) ) as qty
        from inventory_items i where i.farm_id = p_farm_id
      ) s where s.qty <> 0
    ), '[]'::jsonb),

    'cycles', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', c.id, 'plot', c.plot, 'crop', c.crop, 'status', c.status,
        'current_opening_cost', c.opening_cost, 'fold', c.fold,
        'new_opening_cost', c.opening_cost + c.fold,
        'revenue_erased', c.revenue_erased) order by c.plot)
      from (
        select cc.id, p.name as plot, cr.name as crop, cc.status,
               coalesce(cc.opening_cost, 0) as opening_cost,
               coalesce((select sum(x.total_cost) from inventory_issues x
                         where x.cycle_id = cc.id and x.issue_date < p_cutover), 0)
             + coalesce((select sum(ll.total_payment) from labour_logs ll
                         left join labour_master lm on lm.id = ll.labour_master_id
                         where ll.cycle_id = cc.id and ll.activity_date < p_cutover
                           and (coalesce(lm.sub_type, '') in ('permanent', 'regular')
                                or coalesce(ll.is_paid, false))), 0) as fold,
               coalesce((select sum(s.total_amount - coalesce(s.commission_per_qtl, 0) * (s.quantity_kg / 100)
                                    - coalesce(s.freight_charges, 0) - coalesce(s.deductions, 0))
                         from sales s
                         left join harvest_sessions hs on hs.id = s.harvest_session_id
                         where coalesce(hs.cycle_id, s.cycle_id) = cc.id
                           and s.sale_date < p_cutover and s.payment_status = 'paid'
                           and coalesce(s.payment_date, s.sale_date) < p_cutover), 0) as revenue_erased
        from crop_cycles cc
        join plots p on p.id = cc.plot_id
        join crops cr on cr.id = cc.crop_id
        where cc.farm_id = p_farm_id
      ) c where c.fold <> 0 or c.revenue_erased <> 0
    ), '[]'::jsonb),

    'deletes', jsonb_build_object(
      'owner_cash_entries', (select count(*) from owner_cash_entries where farm_id = p_farm_id and entry_date < p_cutover),
      'sales_settled', (select count(*) from sales where farm_id = p_farm_id and sale_date < p_cutover
                        and payment_status = 'paid' and coalesce(payment_date, sale_date) < p_cutover),
      'inventory_purchases', (select count(*) from inventory_purchases p where p.farm_id = p_farm_id
                              and ((p.bill_id is null and p.purchase_date < p_cutover)
                                or exists(select 1 from inventory_bills b where b.id = p.bill_id and b.bill_date < p_cutover))),
      'inventory_issues', (select count(*) from inventory_issues where farm_id = p_farm_id and issue_date < p_cutover),
      'inventory_bills', (select count(*) from inventory_bills where farm_id = p_farm_id and bill_date < p_cutover),
      'vendor_payments', (select count(*) from vendor_payments where farm_id = p_farm_id and payment_date < p_cutover),
      'attendance', (select count(*) from attendance where farm_id = p_farm_id and attendance_date < p_cutover),
      'labour_logs', (select count(*) from labour_logs ll where ll.farm_id = p_farm_id and ll.activity_date < p_cutover
                      and (exists(select 1 from labour_master lm where lm.id = ll.labour_master_id
                                  and lm.sub_type in ('permanent', 'regular'))
                        or coalesce(ll.is_paid, false))),
      'salary_advances', (select count(*) from salary_advances where farm_id = p_farm_id and advance_date < p_cutover),
      'salary_payments', (select count(*) from salary_payments where farm_id = p_farm_id
                          and coalesce(payment_date, payment_month) < p_cutover),
      'farm_expenses_settled', (select count(*) from farm_expenses fe where fe.farm_id = p_farm_id and fe.expense_date < p_cutover
                                and exists(select 1 from expense_payments ep where ep.reference_id = fe.id)
                                and not exists(select 1 from expense_payments ep where ep.reference_id = fe.id and ep.payment_date >= p_cutover)),
      'livestock_revenue', (select count(*) from livestock_revenue where farm_id = p_farm_id and revenue_date < p_cutover),
      'tree_revenue_settled', (select count(*) from tree_revenue tr where tr.farm_id = p_farm_id
                               and coalesce(tr.agreement_date, tr.start_date) < p_cutover and tr.payment_status = 'paid'
                               and coalesce(tr.payment_date, tr.agreement_date, tr.start_date) < p_cutover),
      'crop_residuals_settled', (select count(*) from crop_residuals r where r.farm_id = p_farm_id
                                 and r.status = 'sold' and r.payment_status = 'paid'
                                 and coalesce(r.sale_date, r.created_at::date) < p_cutover),
      'livestock_count_logs', (select count(*) from livestock_count_logs where farm_id = p_farm_id and log_date < p_cutover),
      'tree_count_logs', (select count(*) from tree_count_logs where farm_id = p_farm_id and log_date < p_cutover)
    ),

    'kept_open_items', jsonb_build_object(
      'unpaid_sales', coalesce((
        select jsonb_agg(jsonb_build_object('date', s.sale_date, 'buyer', s.buyer_name,
          'outstanding', round(s.total_amount - coalesce(s.commission_per_qtl, 0) * (s.quantity_kg / 100)
                               - coalesce(s.freight_charges, 0) - coalesce(s.deductions, 0)
                               - coalesce(s.amount_received, 0), 2)))
        from sales s where s.farm_id = p_farm_id and s.sale_date < p_cutover
          and not (s.payment_status = 'paid' and coalesce(s.payment_date, s.sale_date) < p_cutover)
      ), '[]'::jsonb),
      'unpaid_labour_logs', coalesce((
        select jsonb_agg(jsonb_build_object('date', ll.activity_date, 'name', ll.labour_name, 'amount', ll.total_payment))
        from labour_logs ll
        left join labour_master lm on lm.id = ll.labour_master_id
        where ll.farm_id = p_farm_id and ll.activity_date < p_cutover
          and (lm.id is null or coalesce(lm.sub_type, '') not in ('permanent', 'regular'))
          and coalesce(ll.is_paid, false) = false
      ), '[]'::jsonb),
      'unpaid_expenses', coalesce((
        select jsonb_agg(jsonb_build_object('date', fe.expense_date, 'category', fe.category,
          'paid_to', fe.paid_to, 'amount', fe.amount))
        from farm_expenses fe where fe.farm_id = p_farm_id and fe.expense_date < p_cutover
          and not (exists(select 1 from expense_payments ep where ep.reference_id = fe.id)
                   and not exists(select 1 from expense_payments ep where ep.reference_id = fe.id and ep.payment_date >= p_cutover))
      ), '[]'::jsonb),
      'open_residuals', (select count(*) from crop_residuals r where r.farm_id = p_farm_id
                         and not (r.status = 'sold' and r.payment_status = 'paid'
                                  and coalesce(r.sale_date, r.created_at::date) < p_cutover)
                         and coalesce(r.sale_date, r.created_at::date) < p_cutover)
    )
  ) into v_result;

  return v_result;
end $$;

-- ── 4. The surgery ────────────────────────────────────────────────────────────

create or replace function public.go_live_convert(p_farm_id uuid, p_cutover date)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_batch      uuid := gen_random_uuid();
  v_before     jsonb;
  v_after      jsonb;
  v_diffs      text[];
  v_plan       jsonb;
  v_stock_date date;
  v_deleted    jsonb := '{}'::jsonb;
  v_n          bigint;
begin
  if auth.uid() is not null and not public.has_farm_role(p_farm_id, 'admin') then
    raise exception 'Only the farm owner can run a go-live conversion.' using errcode = '42501';
  end if;
  if extract(day from p_cutover) <> 1 then
    raise exception 'The cutover must be the first day of a month.';
  end if;
  if (select go_live_date from farms where id = p_farm_id) is not null then
    raise exception 'This farm has already gone live. The conversion runs once.';
  end if;
  if not exists (select 1 from farms where id = p_farm_id) then
    raise exception 'Farm not found.';
  end if;

  -- One conversion at a time per farm.
  perform pg_advisory_xact_lock(hashtextextended('go_live_' || p_farm_id::text, 0));

  -- Opening stock lives at the FY boundary before the cutover (31 March), the
  -- same date recordOpeningStock uses, so carried-in stock value never shows as
  -- a current-FY expense.
  v_stock_date := make_date(
    extract(year from p_cutover)::int - case when extract(month from p_cutover) < 4 then 1 else 0 end,
    3, 31);

  v_plan   := public.go_live_preview(p_farm_id, p_cutover);
  v_before := public._go_live_state(p_farm_id);

  -- ── Folds (before any delete) ──────────────────────────────────────────────

  -- Stray entries with no account land in the default account, exactly as the
  -- fill trigger would have routed them.
  update owner_cash_entries e
     set account_id = (select id from accounts a where a.farm_id = p_farm_id and a.is_default limit 1)
   where e.farm_id = p_farm_id and e.account_id is null;

  update accounts a
     set opening_balance      = a.opening_balance + f.net,
         opening_balance_date = p_cutover
    from (select account_id, sum(case when direction = 'in' then amount else -amount end) as net
            from owner_cash_entries
           where farm_id = p_farm_id and entry_date < p_cutover
           group by account_id) f
   where f.account_id = a.id and a.farm_id = p_farm_id and f.net <> 0;

  update vendors v
     set opening_balance      = v.opening_balance + f.amt,
         opening_balance_date = p_cutover
    from (
      select vendor_id, sum(amt) as amt from (
        select b.vendor_id,
               b.total_amount - coalesce((select sum(cp.amount) from v_capital_purchases cp where cp.bill_id = b.id), 0) as amt
        from inventory_bills b
        where b.farm_id = p_farm_id and b.vendor_id is not null and b.bill_date < p_cutover
          and (exists(select 1 from inventory_purchases p where p.bill_id = b.id)
            or exists(select 1 from machinery_master m where m.bill_id = b.id)
            or exists(select 1 from farm_assets fa where fa.bill_id = b.id))
        union all
        select p.vendor_id, p.total_cost
        from inventory_purchases p
        where p.farm_id = p_farm_id and p.vendor_id is not null
          and p.bill_id is null and p.purchase_date < p_cutover
        union all
        select vp.vendor_id, -vp.amount
        from vendor_payments vp
        where vp.farm_id = p_farm_id and vp.payment_date < p_cutover
      ) x group by vendor_id
    ) f
   where f.vendor_id = v.id and v.farm_id = p_farm_id and f.amt <> 0;

  update labour_master lm
     set opening_balance = coalesce(lm.opening_balance, 0) + w.delta
    from (
      select lm2.id,
             coalesce(acc.earned, 0) + coalesce(cl.pay, 0) - coalesce(adv.amt, 0) - coalesce(pd.amt, 0) as delta
      from labour_master lm2
      left join lateral (
        select sum(case when coalesce(lm2.monthly_salary, 0) > 0
          then least(lm2.monthly_salary,
                     round(t.days * lm2.monthly_salary
                           / greatest(1, extract(day from t.m + interval '1 mon' - interval '1 day')::integer
                                         - coalesce(lm2.monthly_holiday, 2))::numeric))
          else round(t.days * coalesce(lm2.daily_base_rate, 0)) end) as earned
        from (
          select date_trunc('month', a.attendance_date)::date as m,
                 sum(case a.status when 'present' then 1.0 when 'half_day' then 0.5 else 0 end) as days
          from attendance a
          where a.labour_master_id = lm2.id and a.attendance_date < p_cutover
          group by 1
        ) t
      ) acc on true
      left join lateral (select sum(ll.total_payment) as pay from labour_logs ll
                         where ll.labour_master_id = lm2.id and ll.activity_date < p_cutover) cl on true
      left join lateral (select sum(sa.amount) as amt from salary_advances sa
                         where sa.labourer_id = lm2.id and sa.advance_date < p_cutover) adv on true
      left join lateral (select sum(sp.amount_paid) as amt from salary_payments sp
                         where sp.labourer_id = lm2.id and coalesce(sp.payment_date, sp.payment_month) < p_cutover) pd on true
      where lm2.farm_id = p_farm_id and lm2.sub_type in ('permanent', 'regular')
    ) w
   where w.id = lm.id and w.delta <> 0;

  -- A cycle's opening cost absorbs exactly the rows this conversion deletes:
  -- all pre-cutover issues, and pre-cutover labour logs that are khata-folded
  -- (permanent/regular) or already paid. Unpaid outside logs survive and keep
  -- feeding v_crop_pnl directly — folding them too would count them twice.
  update crop_cycles cc
     set opening_cost = coalesce(cc.opening_cost, 0) + f.amt
    from (
      select c2.id,
             coalesce((select sum(x.total_cost) from inventory_issues x
                       where x.cycle_id = c2.id and x.issue_date < p_cutover), 0)
           + coalesce((select sum(ll.total_payment) from labour_logs ll
                       left join labour_master lm3 on lm3.id = ll.labour_master_id
                       where ll.cycle_id = c2.id and ll.activity_date < p_cutover
                         and (coalesce(lm3.sub_type, '') in ('permanent', 'regular')
                              or coalesce(ll.is_paid, false))), 0) as amt
      from crop_cycles c2 where c2.farm_id = p_farm_id
    ) f
   where f.id = cc.id and cc.farm_id = p_farm_id and f.amt <> 0;

  -- Opening qty per item = the stock figure the app displays, minus what the
  -- surviving (post-cutover) rows account for. Equivalent to the pre-cutover
  -- derived quantity when the stored figure and the rows agree — and where they
  -- do not (an old client used to clamp negative stock to zero), the displayed
  -- figure wins, because the invariant check holds every balance the app shows
  -- unchanged. Side effect: the item's history is internally consistent again.
  create temp table _glc_stock on commit drop as
    select i.id as item_id, coalesce(i.cost_per_unit, 0) as cost,
      coalesce(i.current_stock, 0)
      - ( coalesce((select sum(p.quantity) from inventory_purchases p
                where p.item_id = i.id
                  and not ((p.bill_id is null and p.purchase_date < p_cutover)
                    or exists(select 1 from inventory_bills b where b.id = p.bill_id and b.bill_date < p_cutover))), 0)
        - coalesce((select sum(x.quantity) from inventory_issues x
                  where x.item_id = i.id and x.issue_date >= p_cutover), 0) ) as qty
    from inventory_items i where i.farm_id = p_farm_id;

  -- ── Archive + delete, in dependency order ──────────────────────────────────

  -- Settled expenses and their payments.
  create temp table _glc_expenses on commit drop as
    select fe.id from farm_expenses fe
    where fe.farm_id = p_farm_id and fe.expense_date < p_cutover
      and exists(select 1 from expense_payments ep where ep.reference_id = fe.id)
      and not exists(select 1 from expense_payments ep where ep.reference_id = fe.id and ep.payment_date >= p_cutover);

  insert into go_live_archive (farm_id, batch_id, table_name, row_data)
    select p_farm_id, v_batch, 'expense_payments', to_jsonb(t) from expense_payments t
     where t.farm_id = p_farm_id and t.reference_id in (select id from _glc_expenses);
  delete from expense_payments where farm_id = p_farm_id and reference_id in (select id from _glc_expenses);
  get diagnostics v_n = row_count;
  v_deleted := v_deleted || jsonb_build_object('expense_payments', v_n);

  insert into go_live_archive (farm_id, batch_id, table_name, row_data)
    select p_farm_id, v_batch, 'farm_expenses', to_jsonb(t) from farm_expenses t
     where t.id in (select id from _glc_expenses);
  delete from farm_expenses where id in (select id from _glc_expenses);
  get diagnostics v_n = row_count;
  v_deleted := v_deleted || jsonb_build_object('farm_expenses', v_n);

  insert into go_live_archive (farm_id, batch_id, table_name, row_data)
    select p_farm_id, v_batch, 'vendor_payments', to_jsonb(t) from vendor_payments t
     where t.farm_id = p_farm_id and t.payment_date < p_cutover;
  delete from vendor_payments where farm_id = p_farm_id and payment_date < p_cutover;
  get diagnostics v_n = row_count;
  v_deleted := v_deleted || jsonb_build_object('vendor_payments', v_n);

  insert into go_live_archive (farm_id, batch_id, table_name, row_data)
    select p_farm_id, v_batch, 'salary_payments', to_jsonb(t) from salary_payments t
     where t.farm_id = p_farm_id and coalesce(t.payment_date, t.payment_month) < p_cutover;
  delete from salary_payments where farm_id = p_farm_id and coalesce(payment_date, payment_month) < p_cutover;
  get diagnostics v_n = row_count;
  v_deleted := v_deleted || jsonb_build_object('salary_payments', v_n);

  insert into go_live_archive (farm_id, batch_id, table_name, row_data)
    select p_farm_id, v_batch, 'salary_advances', to_jsonb(t) from salary_advances t
     where t.farm_id = p_farm_id and t.advance_date < p_cutover;
  delete from salary_advances where farm_id = p_farm_id and advance_date < p_cutover;
  get diagnostics v_n = row_count;
  v_deleted := v_deleted || jsonb_build_object('salary_advances', v_n);

  insert into go_live_archive (farm_id, batch_id, table_name, row_data)
    select p_farm_id, v_batch, 'attendance', to_jsonb(t) from attendance t
     where t.farm_id = p_farm_id and t.attendance_date < p_cutover;
  delete from attendance where farm_id = p_farm_id and attendance_date < p_cutover;
  get diagnostics v_n = row_count;
  v_deleted := v_deleted || jsonb_build_object('attendance', v_n);

  insert into go_live_archive (farm_id, batch_id, table_name, row_data)
    select p_farm_id, v_batch, 'labour_logs', to_jsonb(t) from labour_logs t
     where t.farm_id = p_farm_id and t.activity_date < p_cutover
       and (exists(select 1 from labour_master lm where lm.id = t.labour_master_id
                   and lm.sub_type in ('permanent', 'regular'))
         or coalesce(t.is_paid, false));
  delete from labour_logs ll
   where ll.farm_id = p_farm_id and ll.activity_date < p_cutover
     and (exists(select 1 from labour_master lm where lm.id = ll.labour_master_id
                 and lm.sub_type in ('permanent', 'regular'))
       or coalesce(ll.is_paid, false));
  get diagnostics v_n = row_count;
  v_deleted := v_deleted || jsonb_build_object('labour_logs', v_n);

  -- Settled sales, then sessions nothing references any more.
  insert into go_live_archive (farm_id, batch_id, table_name, row_data)
    select p_farm_id, v_batch, 'sales', to_jsonb(t) from sales t
     where t.farm_id = p_farm_id and t.sale_date < p_cutover
       and t.payment_status = 'paid' and coalesce(t.payment_date, t.sale_date) < p_cutover;
  delete from sales
   where farm_id = p_farm_id and sale_date < p_cutover
     and payment_status = 'paid' and coalesce(payment_date, sale_date) < p_cutover;
  get diagnostics v_n = row_count;
  v_deleted := v_deleted || jsonb_build_object('sales', v_n);

  insert into go_live_archive (farm_id, batch_id, table_name, row_data)
    select p_farm_id, v_batch, 'crop_residuals', to_jsonb(t) from crop_residuals t
     where t.farm_id = p_farm_id and t.status = 'sold' and t.payment_status = 'paid'
       and coalesce(t.sale_date, t.created_at::date) < p_cutover;
  delete from crop_residuals
   where farm_id = p_farm_id and status = 'sold' and payment_status = 'paid'
     and coalesce(sale_date, created_at::date) < p_cutover;
  get diagnostics v_n = row_count;
  v_deleted := v_deleted || jsonb_build_object('crop_residuals', v_n);

  insert into go_live_archive (farm_id, batch_id, table_name, row_data)
    select p_farm_id, v_batch, 'harvest_sessions', to_jsonb(t) from harvest_sessions t
     where t.farm_id = p_farm_id and t.harvest_date < p_cutover
       and not exists(select 1 from sales s where s.harvest_session_id = t.id)
       and not exists(select 1 from crop_residuals r where r.harvest_session_id = t.id);
  delete from harvest_sessions hs
   where hs.farm_id = p_farm_id and hs.harvest_date < p_cutover
     and not exists(select 1 from sales s where s.harvest_session_id = hs.id)
     and not exists(select 1 from crop_residuals r where r.harvest_session_id = hs.id);
  get diagnostics v_n = row_count;
  v_deleted := v_deleted || jsonb_build_object('harvest_sessions', v_n);

  insert into go_live_archive (farm_id, batch_id, table_name, row_data)
    select p_farm_id, v_batch, 'livestock_revenue', to_jsonb(t) from livestock_revenue t
     where t.farm_id = p_farm_id and t.revenue_date < p_cutover;
  delete from livestock_revenue where farm_id = p_farm_id and revenue_date < p_cutover;
  get diagnostics v_n = row_count;
  v_deleted := v_deleted || jsonb_build_object('livestock_revenue', v_n);

  insert into go_live_archive (farm_id, batch_id, table_name, row_data)
    select p_farm_id, v_batch, 'tree_revenue', to_jsonb(t) from tree_revenue t
     where t.farm_id = p_farm_id and coalesce(t.agreement_date, t.start_date) < p_cutover
       and t.payment_status = 'paid'
       and coalesce(t.payment_date, t.agreement_date, t.start_date) < p_cutover;
  delete from tree_revenue tr
   where tr.farm_id = p_farm_id and coalesce(tr.agreement_date, tr.start_date) < p_cutover
     and tr.payment_status = 'paid'
     and coalesce(tr.payment_date, tr.agreement_date, tr.start_date) < p_cutover;
  get diagnostics v_n = row_count;
  v_deleted := v_deleted || jsonb_build_object('tree_revenue', v_n);

  -- Inventory: issues, then purchase lines, then bill headers (capital masters
  -- detach via their SET NULL foreign keys).
  insert into go_live_archive (farm_id, batch_id, table_name, row_data)
    select p_farm_id, v_batch, 'inventory_issues', to_jsonb(t) from inventory_issues t
     where t.farm_id = p_farm_id and t.issue_date < p_cutover;
  delete from inventory_issues where farm_id = p_farm_id and issue_date < p_cutover;
  get diagnostics v_n = row_count;
  v_deleted := v_deleted || jsonb_build_object('inventory_issues', v_n);

  insert into go_live_archive (farm_id, batch_id, table_name, row_data)
    select p_farm_id, v_batch, 'inventory_purchases', to_jsonb(t) from inventory_purchases t
     where t.farm_id = p_farm_id
       and ((t.bill_id is null and t.purchase_date < p_cutover)
         or exists(select 1 from inventory_bills b where b.id = t.bill_id and b.bill_date < p_cutover));
  delete from inventory_purchases p
   where p.farm_id = p_farm_id
     and ((p.bill_id is null and p.purchase_date < p_cutover)
       or exists(select 1 from inventory_bills b where b.id = p.bill_id and b.bill_date < p_cutover));
  get diagnostics v_n = row_count;
  v_deleted := v_deleted || jsonb_build_object('inventory_purchases', v_n);

  insert into go_live_archive (farm_id, batch_id, table_name, row_data)
    select p_farm_id, v_batch, 'inventory_bills', to_jsonb(t) from inventory_bills t
     where t.farm_id = p_farm_id and t.bill_date < p_cutover;
  delete from inventory_bills where farm_id = p_farm_id and bill_date < p_cutover;
  get diagnostics v_n = row_count;
  v_deleted := v_deleted || jsonb_build_object('inventory_bills', v_n);

  -- The cash book last: payment tables that pointed at these rows are already
  -- gone, and the two FKs that remain are SET NULL.
  insert into go_live_archive (farm_id, batch_id, table_name, row_data)
    select p_farm_id, v_batch, 'owner_cash_entries', to_jsonb(t) from owner_cash_entries t
     where t.farm_id = p_farm_id and t.entry_date < p_cutover;
  delete from owner_cash_entries where farm_id = p_farm_id and entry_date < p_cutover;
  get diagnostics v_n = row_count;
  v_deleted := v_deleted || jsonb_build_object('owner_cash_entries', v_n);

  -- ── Rebuild the openings that live as rows ─────────────────────────────────

  -- total_cost is GENERATED (qty × price) on both tables — never inserted.
  insert into inventory_purchases
      (farm_id, item_id, purchase_date, quantity, unit_price,
       vendor_name, invoice_number, notes)
    select p_farm_id, s.item_id, v_stock_date, s.qty, s.cost,
           'Opening balance', 'OPENING-STOCK',
           'Stock on hand at go-live (' || p_cutover::text || ')'
    from _glc_stock s where s.qty > 0;

  -- inventory_issues has no notes column; purpose says what this is.
  insert into inventory_issues
      (farm_id, item_id, issue_date, quantity, cost_per_unit,
       purpose, unit_cost_at_issue)
    select p_farm_id, s.item_id, v_stock_date, -s.qty, 0,
           'stock_correction', 0
    from _glc_stock s where s.qty < 0;

  -- Counts: collapse pre-cutover logs into one opening line dated the cutover.
  insert into go_live_archive (farm_id, batch_id, table_name, row_data)
    select p_farm_id, v_batch, 'livestock_count_logs', to_jsonb(t) from livestock_count_logs t
     where t.farm_id = p_farm_id and t.log_date < p_cutover;
  create temp table _glc_livestock on commit drop as
    select livestock_id,
           sum(case when change_type in ('add', 'opening_balance', 'birth', 'transfer_in')
                    then quantity else -quantity end) as net
    from livestock_count_logs
    where farm_id = p_farm_id and log_date < p_cutover
    group by livestock_id;
  delete from livestock_count_logs where farm_id = p_farm_id and log_date < p_cutover;
  insert into livestock_count_logs (farm_id, livestock_id, log_date, change_type, reason, quantity, notes)
    select p_farm_id, livestock_id, p_cutover,
           case when net >= 0 then 'opening_balance' else 'remove' end,
           'Opening count at go-live',
           abs(net), 'Opening count at go-live'
    from _glc_livestock where net <> 0;

  insert into go_live_archive (farm_id, batch_id, table_name, row_data)
    select p_farm_id, v_batch, 'tree_count_logs', to_jsonb(t) from tree_count_logs t
     where t.farm_id = p_farm_id and t.log_date < p_cutover;
  create temp table _glc_trees on commit drop as
    select planting_id, sum(quantity) as net
    from tree_count_logs
    where farm_id = p_farm_id and log_date < p_cutover
    group by planting_id;
  delete from tree_count_logs where farm_id = p_farm_id and log_date < p_cutover;
  insert into tree_count_logs (farm_id, planting_id, log_date, change_type, reason, quantity, notes)
    select p_farm_id, planting_id, p_cutover, 'opening_balance', 'Opening count at go-live', net, 'Opening count at go-live'
    from _glc_trees where net <> 0;

  -- ── Closed pre-cutover cycles nothing references any more ──────────────────

  create temp table _glc_cycles on commit drop as
    select cc.id from crop_cycles cc
    where cc.farm_id = p_farm_id and cc.status <> 'active'
      and coalesce(cc.actual_harvest_end, cc.actual_harvest_start, cc.sow_date) < p_cutover
      and not exists(select 1 from crop_cycles k where k.parent_cycle_id = cc.id)
      and not exists(select 1 from inventory_issues x where x.cycle_id = cc.id)
      and not exists(select 1 from labour_logs l where l.cycle_id = cc.id)
      and not exists(select 1 from harvest_sessions h where h.cycle_id = cc.id)
      and not exists(select 1 from sales s where s.cycle_id = cc.id)
      and not exists(select 1 from crop_residuals r where r.crop_cycle_id = cc.id)
      and not exists(select 1 from diesel_logs dl where dl.cycle_id = cc.id);

  insert into go_live_archive (farm_id, batch_id, table_name, row_data)
    select p_farm_id, v_batch, 'activity_logs', to_jsonb(t) from activity_logs t
     where t.cycle_id in (select id from _glc_cycles);
  delete from activity_logs where cycle_id in (select id from _glc_cycles);

  insert into go_live_archive (farm_id, batch_id, table_name, row_data)
    select p_farm_id, v_batch, 'crop_health_logs', to_jsonb(t) from crop_health_logs t
     where t.cycle_id in (select id from _glc_cycles);
  delete from crop_health_logs where cycle_id in (select id from _glc_cycles);

  insert into go_live_archive (farm_id, batch_id, table_name, row_data)
    select p_farm_id, v_batch, 'crop_cycles', to_jsonb(t) from crop_cycles t
     where t.id in (select id from _glc_cycles);
  delete from crop_cycles where id in (select id from _glc_cycles);
  get diagnostics v_n = row_count;
  v_deleted := v_deleted || jsonb_build_object('crop_cycles', v_n);

  -- ── The line itself ────────────────────────────────────────────────────────

  update farms set go_live_date = p_cutover where id = p_farm_id;

  -- ── Verify, or roll everything back ────────────────────────────────────────

  v_after := public._go_live_state(p_farm_id);
  v_diffs := public._go_live_diff(v_before, v_after);
  if array_length(v_diffs, 1) is not null then
    raise exception 'Go-live conversion aborted — balances would have changed: %',
      array_to_string(v_diffs, '; ');
  end if;

  return jsonb_build_object(
    'ok', true,
    'cutover', p_cutover,
    'batch_id', v_batch,
    'plan', v_plan,
    'deleted', v_deleted,
    'state', v_after
  );
end $$;

-- Only the app's authenticated users may even attempt these; the functions
-- themselves insist on the admin role.
revoke execute on function public.go_live_preview(uuid, date) from public, anon;
revoke execute on function public.go_live_convert(uuid, date) from public, anon;
revoke execute on function public._go_live_state(uuid) from public, anon;
grant execute on function public.go_live_preview(uuid, date) to authenticated, service_role;
grant execute on function public.go_live_convert(uuid, date) to authenticated, service_role;

-- ── 5. Pre-go-live capital never expenses into the current FY ────────────────
--
-- v_expense_ledger's capital branch books small (non-capitalised) equipment as
-- an expense on its purchase date. A machine bought before go-live is part of
-- the opening position, not a current-period expense — but its master row must
-- stay (it is the asset register and, when it has a vendor, the carrier of the
-- payable). So the expense branch learns the line every other book already
-- respects. Only the capital branch changes; unpaid labour and expense rows
-- keep their pre-go-live dates on purpose — the row is the due.

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
  where lm.id is null or (coalesce(lm.sub_type, '') <> all (array['permanent'::text, 'regular'::text]))
union all
 select md5(sa.labourer_id::text || sa.month::text)::uuid as id,
    least((sa.month + '1 mon'::interval - '1 day'::interval)::date, current_date) as entry_date,
    'salary'::text as category,
    concat('Salary — ', sa.name, ' (', to_char(sa.month::timestamp with time zone, 'Mon YYYY'), ')') as description,
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
    concat('Purchase from ', coalesce(v.name, ip.vendor_name, 'Vendor')) as description,
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
     join farms f on f.id = cp.farm_id
  where cp.is_capitalised = false
    and (f.go_live_date is null or cp.purchase_date >= f.go_live_date);

alter view public.v_expense_ledger set (security_invoker = on);

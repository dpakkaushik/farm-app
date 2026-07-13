-- Baseline: the eight ledger/P&L views, captured from the live database 2026-07-13.
--
-- These were created through the dashboard and never existed in a migration —
-- the same drift class 0000/0000b were written to close. Captured verbatim via
-- pg_get_viewdef().
--
-- !! INSECURE AS CAPTURED: none of these set security_invoker, so they run with
-- the owner's privileges and BYPASS RLS on every table they read. Any caller
-- with the anon key could read every farm's complete financials through them.
-- Fixed by 0005_views_security_invoker.sql. Replaying this file on a fresh
-- database is safe only because 0005 runs after it.
--
-- Dependency order matters: v_monthly_summary reads v_income_ledger and
-- v_expense_ledger, so those two come first.

-- ── v_cash_book ──────────────────────────────────────────────────────────────
create or replace view public.v_cash_book as
 SELECT id,
    entry_date,
        CASE direction
            WHEN 'in'::text THEN
            CASE entry_type
                WHEN 'owner_capital'::text THEN COALESCE(notes, 'Owner Capital Added'::text)
                WHEN 'revenue_receipt'::text THEN COALESCE(notes, 'Revenue Received'::text)
                ELSE COALESCE(notes, 'Cash Receipt'::text)
            END
            ELSE
            CASE entry_type
                WHEN 'vendor_payment'::text THEN COALESCE(notes, 'Vendor Payment'::text)
                WHEN 'labour_payment'::text THEN COALESCE(notes, 'Labour Payment'::text)
                WHEN 'expense_payment'::text THEN COALESCE(notes, 'Expense Payment'::text)
                ELSE COALESCE(notes, 'Cash Payment'::text)
            END
        END AS particulars,
        CASE
            WHEN direction = 'in'::text THEN amount
            ELSE 0::numeric
        END AS receipt_amount,
        CASE
            WHEN direction = 'out'::text THEN amount
            ELSE 0::numeric
        END AS payment_amount,
    direction,
    entry_type,
    reference_id,
    notes,
    created_by,
    created_at,
    sum(
        CASE
            WHEN direction = 'in'::text THEN amount
            ELSE - amount
        END) OVER (ORDER BY entry_date, created_at ROWS UNBOUNDED PRECEDING) AS running_balance
   FROM owner_cash_entries
  ORDER BY entry_date, created_at;

-- ── v_crop_pnl ───────────────────────────────────────────────────────────────
create or replace view public.v_crop_pnl as
 SELECT cc.id AS cycle_id,
    p.name AS plot_name,
    cr.name AS crop_name,
    cc.sow_date,
    cc.season,
    cc.status AS cycle_status,
    COALESCE(p.area_acres::numeric, 0::numeric) AS acres,
    COALESCE(ii_cost.total, 0::numeric) AS input_cost,
    COALESCE(ll_cost.total, 0::numeric) AS labour_cost,
    COALESCE(ii_cost.total, 0::numeric) + COALESCE(ll_cost.total, 0::numeric) AS total_cost,
    COALESCE(rev.total, 0::numeric) AS revenue,
    COALESCE(rev.total, 0::numeric) - (COALESCE(ii_cost.total, 0::numeric) + COALESCE(ll_cost.total, 0::numeric)) AS profit_loss,
        CASE
            WHEN COALESCE(rev.total, 0::numeric) > 0::numeric THEN round((COALESCE(rev.total, 0::numeric) - (COALESCE(ii_cost.total, 0::numeric) + COALESCE(ll_cost.total, 0::numeric))) / COALESCE(rev.total, 0::numeric) * 100::numeric, 1)
            ELSE 0::numeric
        END AS margin_pct
   FROM crop_cycles cc
     JOIN plots p ON p.id = cc.plot_id
     JOIN crops cr ON cr.id = cc.crop_id
     LEFT JOIN ( SELECT inventory_issues.cycle_id,
            sum(inventory_issues.total_cost) AS total
           FROM inventory_issues
          GROUP BY inventory_issues.cycle_id) ii_cost ON ii_cost.cycle_id = cc.id
     LEFT JOIN ( SELECT labour_logs.cycle_id,
            sum(labour_logs.total_payment) AS total
           FROM labour_logs
          GROUP BY labour_logs.cycle_id) ll_cost ON ll_cost.cycle_id = cc.id
     LEFT JOIN ( SELECT hs.cycle_id,
            sum(s.total_amount - COALESCE(s.commission_per_qtl, 0::numeric) * (s.quantity_kg / 100::numeric) - COALESCE(s.freight_charges, 0::numeric) - COALESCE(s.deductions, 0::numeric)) AS total
           FROM sales s
             JOIN harvest_sessions hs ON hs.id = s.harvest_session_id
          GROUP BY hs.cycle_id) rev ON rev.cycle_id = cc.id;

-- ── v_expense_ledger ─────────────────────────────────────────────────────────
create or replace view public.v_expense_ledger as
 SELECT fe.id,
    fe.expense_date AS entry_date,
    fe.category,
    COALESCE(fe.description, fe.category) AS description,
    fe.amount,
    fe.attributed_to,
    'farm_expense'::text AS expense_type,
    false AS is_paid,
    NULL::date AS paid_date,
    fe.payment_mode,
    fe.notes
   FROM farm_expenses fe
UNION ALL
 SELECT ll.id,
    ll.activity_date AS entry_date,
    'labour'::text AS category,
    concat('Labour — ', ll.labour_name,
        CASE
            WHEN ll.work_type IS NOT NULL THEN concat(' (', ll.work_type, ')')
            ELSE ''::text
        END) AS description,
    ll.total_payment AS amount,
    'general'::text AS attributed_to,
    'labour'::text AS expense_type,
    COALESCE(ll.is_paid, false) AS is_paid,
    ll.paid_date,
    ll.paid_via AS payment_mode,
    ll.notes
   FROM labour_logs ll
UNION ALL
 SELECT sp.id,
    sp.payment_date AS entry_date,
    'salary'::text AS category,
    concat('Salary — ', lm.name,
        CASE
            WHEN sp.payment_month IS NOT NULL THEN concat(' (', to_char(sp.payment_month::timestamp with time zone, 'Mon YYYY'::text), ')')
            ELSE ''::text
        END) AS description,
    sp.amount_paid AS amount,
    'general'::text AS attributed_to,
    'salary'::text AS expense_type,
    true AS is_paid,
    sp.payment_date AS paid_date,
    sp.payment_mode,
    sp.notes
   FROM salary_payments sp
     JOIN labour_master lm ON lm.id = sp.labourer_id
UNION ALL
 SELECT ip.id,
    ip.purchase_date AS entry_date,
    'inventory_purchase'::text AS category,
    concat('Purchase from ', COALESCE(v.name, ip.vendor_name, 'Vendor'::text)) AS description,
    ip.total_cost AS amount,
    'inventory'::text AS attributed_to,
    'vendor_purchase'::text AS expense_type,
    false AS is_paid,
    NULL::date AS paid_date,
    NULL::text AS payment_mode,
    ip.notes
   FROM inventory_purchases ip
     LEFT JOIN vendors v ON v.id = ip.vendor_id;

-- ── v_income_ledger ──────────────────────────────────────────────────────────
create or replace view public.v_income_ledger as
 SELECT lr.id,
    lr.revenue_date AS entry_date,
    'livestock'::text AS source_type,
    lr.revenue_type AS description,
    lr.amount,
    lr.livestock_id AS entity_id,
    lm.name AS entity_name,
    lr.buyer_name,
    lr.payment_mode,
    'paid'::text AS payment_status
   FROM livestock_revenue lr
     LEFT JOIN livestock_master lm ON lm.id = lr.livestock_id
UNION ALL
 SELECT s.id,
    s.sale_date AS entry_date,
    'crop'::text AS source_type,
    concat(cr.name, ' sale') AS description,
    s.total_amount - COALESCE(s.commission_per_qtl, 0::numeric) * (s.quantity_kg / 100::numeric) - COALESCE(s.freight_charges, 0::numeric) - COALESCE(s.deductions, 0::numeric) AS amount,
    cc.id AS entity_id,
    concat(p.name, ' — ', cr.name) AS entity_name,
    s.buyer_name,
    s.payment_method AS payment_mode,
    s.payment_status
   FROM sales s
     LEFT JOIN harvest_sessions hs ON hs.id = s.harvest_session_id
     LEFT JOIN crop_cycles cc ON cc.id = hs.cycle_id
     LEFT JOIN plots p ON p.id = cc.plot_id
     LEFT JOIN crops cr ON cr.id = cc.crop_id
UNION ALL
 SELECT r.id,
    r.sale_date AS entry_date,
    'crop_residual'::text AS source_type,
    concat(cr.name, ' — ', r.product_name) AS description,
    r.actual_revenue AS amount,
    r.crop_cycle_id AS entity_id,
    concat(p.name, ' — ', cr.name, ' (', r.product_name, ')') AS entity_name,
    r.buyer_name,
    NULL::text AS payment_mode,
    r.payment_status
   FROM crop_residuals r
     LEFT JOIN crop_cycles cc ON cc.id = r.crop_cycle_id
     LEFT JOIN plots p ON p.id = cc.plot_id
     LEFT JOIN crops cr ON cr.id = cc.crop_id
  WHERE r.status = 'sold'::text;

-- ── v_livestock_pnl ──────────────────────────────────────────────────────────
create or replace view public.v_livestock_pnl as
 SELECT lm.id AS livestock_id,
    lm.name AS animal_name,
    COALESCE(lm.species, lm.animal_type) AS species,
    lm.status,
    COALESCE(lm.purchase_price, 0::numeric) AS purchase_price,
    COALESCE(feed.total, 0::numeric) AS total_feed_cost,
    COALESCE(vet.total, 0::numeric) AS total_vet_cost,
    COALESCE(other_exp.total, 0::numeric) AS total_other_cost,
    COALESCE(lm.purchase_price, 0::numeric) + COALESCE(feed.total, 0::numeric) + COALESCE(vet.total, 0::numeric) + COALESCE(other_exp.total, 0::numeric) AS total_cost,
    COALESCE(rev.total, 0::numeric) AS total_revenue,
    COALESCE(rev.total, 0::numeric) - (COALESCE(lm.purchase_price, 0::numeric) + COALESCE(feed.total, 0::numeric) + COALESCE(vet.total, 0::numeric) + COALESCE(other_exp.total, 0::numeric)) AS profit_loss
   FROM livestock_master lm
     LEFT JOIN ( SELECT farm_expenses.livestock_id,
            sum(farm_expenses.amount) AS total
           FROM farm_expenses
          WHERE farm_expenses.category = 'feed'::text
          GROUP BY farm_expenses.livestock_id) feed ON feed.livestock_id = lm.id
     LEFT JOIN ( SELECT farm_expenses.livestock_id,
            sum(farm_expenses.amount) AS total
           FROM farm_expenses
          WHERE farm_expenses.category = 'veterinary'::text
          GROUP BY farm_expenses.livestock_id) vet ON vet.livestock_id = lm.id
     LEFT JOIN ( SELECT farm_expenses.livestock_id,
            sum(farm_expenses.amount) AS total
           FROM farm_expenses
          WHERE (farm_expenses.category <> ALL (ARRAY['feed'::text, 'veterinary'::text])) AND farm_expenses.livestock_id IS NOT NULL
          GROUP BY farm_expenses.livestock_id) other_exp ON other_exp.livestock_id = lm.id
     LEFT JOIN ( SELECT livestock_revenue.livestock_id,
            sum(livestock_revenue.amount) AS total
           FROM livestock_revenue
          GROUP BY livestock_revenue.livestock_id) rev ON rev.livestock_id = lm.id;

-- ── v_monthly_summary (reads v_income_ledger + v_expense_ledger) ─────────────
create or replace view public.v_monthly_summary as
 WITH income_monthly AS (
         SELECT date_trunc('month'::text, v_income_ledger.entry_date::timestamp with time zone)::date AS month,
            sum(v_income_ledger.amount) AS total_income
           FROM v_income_ledger
          GROUP BY (date_trunc('month'::text, v_income_ledger.entry_date::timestamp with time zone)::date)
        ), expense_monthly AS (
         SELECT date_trunc('month'::text, v_expense_ledger.entry_date::timestamp with time zone)::date AS month,
            sum(v_expense_ledger.amount) AS total_expenses
           FROM v_expense_ledger
          GROUP BY (date_trunc('month'::text, v_expense_ledger.entry_date::timestamp with time zone)::date)
        ), cash_in_monthly AS (
         SELECT date_trunc('month'::text, owner_cash_entries.entry_date::timestamp with time zone)::date AS month,
            sum(
                CASE
                    WHEN owner_cash_entries.direction = 'in'::text THEN owner_cash_entries.amount
                    ELSE 0::numeric
                END) AS cash_in,
            sum(
                CASE
                    WHEN owner_cash_entries.direction = 'out'::text THEN owner_cash_entries.amount
                    ELSE 0::numeric
                END) AS cash_out
           FROM owner_cash_entries
          GROUP BY (date_trunc('month'::text, owner_cash_entries.entry_date::timestamp with time zone)::date)
        )
 SELECT COALESCE(i.month, e.month, c.month) AS month,
    COALESCE(i.total_income, 0::numeric) AS total_income,
    COALESCE(e.total_expenses, 0::numeric) AS total_expenses,
    COALESCE(i.total_income, 0::numeric) - COALESCE(e.total_expenses, 0::numeric) AS net_profit,
    COALESCE(c.cash_in, 0::numeric) AS owner_cash_in,
    COALESCE(c.cash_out, 0::numeric) AS owner_cash_out
   FROM income_monthly i
     FULL JOIN expense_monthly e ON e.month = i.month
     FULL JOIN cash_in_monthly c ON c.month = COALESCE(i.month, e.month)
  ORDER BY (COALESCE(i.month, e.month, c.month)) DESC;

-- ── v_vendor_balances ────────────────────────────────────────────────────────
create or replace view public.v_vendor_balances as
 SELECT v.id AS vendor_id,
    v.name AS vendor_name,
    v.category,
    v.phone,
    v.is_active,
    COALESCE(sum(ip.total_cost), 0::numeric) AS total_purchased,
    COALESCE(sum(vp.amount), 0::numeric) AS total_paid,
    COALESCE(sum(ip.total_cost), 0::numeric) - COALESCE(sum(vp.amount), 0::numeric) AS balance_due
   FROM vendors v
     LEFT JOIN inventory_purchases ip ON ip.vendor_id = v.id
     LEFT JOIN vendor_payments vp ON vp.vendor_id = v.id
  GROUP BY v.id, v.name, v.category, v.phone, v.is_active;

-- ── v_vendor_ledger ──────────────────────────────────────────────────────────
create or replace view public.v_vendor_ledger as
 SELECT v.id AS vendor_id,
    v.name AS vendor_name,
    v.category,
    ip.purchase_date AS entry_date,
    concat('Purchase: ', ii.name, ' — ', ip.quantity, ' ', ii.unit,
        CASE
            WHEN ip.invoice_number IS NOT NULL THEN concat(' (Inv: ', ip.invoice_number, ')')
            ELSE ''::text
        END) AS particulars,
    ip.total_cost AS debit_amount,
    0::numeric AS credit_amount,
    ip.id AS ref_id,
    'purchase'::text AS entry_type
   FROM vendors v
     JOIN inventory_purchases ip ON ip.vendor_id = v.id
     JOIN inventory_items ii ON ii.id = ip.item_id
UNION ALL
 SELECT v.id AS vendor_id,
    v.name AS vendor_name,
    v.category,
    vp.payment_date AS entry_date,
    COALESCE(vp.notes, 'Cash Payment'::text) AS particulars,
    0::numeric AS debit_amount,
    vp.amount AS credit_amount,
    vp.id AS ref_id,
    'payment'::text AS entry_type
   FROM vendors v
     JOIN vendor_payments vp ON vp.vendor_id = v.id;

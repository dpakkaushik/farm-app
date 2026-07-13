-- Why: the eight ledger/P&L views ran with their owner's privileges (Postgres
-- default for views), which bypasses RLS on every table they read. Combined
-- with the frontend querying them with a bare select('*'), any caller holding
-- the anon key could read every farm's complete financials. Flagged as 8 ERRORs
-- by the Supabase security advisor (security_definer_view).
--
-- security_invoker makes each view evaluate its underlying tables as the
-- caller, so the base tables' farm-scoped RLS policies do the filtering. No
-- frontend change needed — members now just get their own farm's rows.
--
-- v_monthly_summary reads v_income_ledger and v_expense_ledger, so the whole
-- chain must flip together for the fix to hold.

alter view public.v_cash_book        set (security_invoker = on);
alter view public.v_crop_pnl         set (security_invoker = on);
alter view public.v_expense_ledger   set (security_invoker = on);
alter view public.v_income_ledger    set (security_invoker = on);
alter view public.v_livestock_pnl    set (security_invoker = on);
alter view public.v_monthly_summary  set (security_invoker = on);
alter view public.v_vendor_balances  set (security_invoker = on);
alter view public.v_vendor_ledger    set (security_invoker = on);

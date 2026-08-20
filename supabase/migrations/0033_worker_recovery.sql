-- 0033 — money can come BACK from a worker
--
-- Six workers owe the farm ₹61,420 between them (v_salary_dues, 20 Aug 2026):
-- Deena ₹25,425, Deepak ₹13,933, Gambhira ₹13,495, Chote Lal ₹5,303, Jhingur
-- ₹2,125, Harinder ₹1,139. Most of it is opening balance — they were already
-- over-drawn on the day the app started.
--
-- The app had no door for that money coming back. An advance is cash going out
-- and a salary payment is cash going out, and every route into the books was
-- guarded by `amount > 0`, so a worker's debt could only ever grow. Recording it
-- as "revenue received" would have put the cash in the box while leaving the
-- worker's balance untouched — and recovering an advance is not income.
--
-- A recovery is the exact opposite of an advance, so that is how it is stored:
-- one salary_advances row with a NEGATIVE amount. v_salary_dues already computes
--
--     balance_due = opening + earned − advances − paid
--
-- so subtracting a negative advance adds the money back. The view needs no
-- change, which is why this migration is four lines: the arithmetic was already
-- right, only the CHECK stood in the way. The sign IS the record — no second
-- table, no flag that could drift out of step with it.
--
-- Zero stays illegal: a row that moves no money is a mistake, not a recovery.
--
-- The cash side needs nothing. owner_cash_entries keeps `amount > 0` and carries
-- direction separately, so a recovery is a plain positive row with
-- direction = 'in' and entry_type = 'advance_recovery'.
--
-- RLS: no new table, no new column. salary_advances keeps the four policies it
-- already has.

alter table public.salary_advances
  drop constraint if exists salary_advances_amount_check;

alter table public.salary_advances
  add constraint salary_advances_amount_nonzero check (amount <> 0);

comment on column public.salary_advances.amount is
  'Positive = advance given to the worker. Negative = money recovered FROM the '
  'worker (he was over-drawn). v_salary_dues subtracts this column, so the sign '
  'alone carries the direction — see lib/workerRecovery.js.';

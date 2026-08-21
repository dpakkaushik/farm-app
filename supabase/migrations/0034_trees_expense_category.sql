-- Why: buying saplings had no home. The owner asked where a new plant's cost
-- goes ("what abut three expenses if we buy new plants to grow tree") and the
-- honest answer was Log Expense → Other — which books the money correctly and
-- then hides it: "what have trees cost me" becomes unanswerable. So the form
-- gains a 🌳 Trees expense type, and this adds the category its spend lands in.
--
-- Saplings deliberately do NOT go through inventory purchases: a sapling
-- becomes a standing tree the tree_count_logs ledger already tracks (change
-- type 'planted'), not stock that gets consumed.
--
-- Idempotent: the constraint is dropped if present before being re-added.

alter table public.farm_expenses
  drop constraint if exists farm_expenses_category_check;

alter table public.farm_expenses
  add constraint farm_expenses_category_check check (category = any (array[
    -- livestock
    'feed'::text,
    'veterinary'::text,
    'medicine'::text,
    'accessories'::text,
    'livestock_care'::text,
    -- crop / field
    'machinery'::text,
    'maintenance'::text,
    -- trees
    'plants'::text,
    -- infrastructure
    'infrastructure'::text,
    'construction'::text,
    -- administrative
    'utilities'::text,
    'event'::text,
    'administrative'::text,
    -- fallback
    'other'::text
  ]));

comment on constraint farm_expenses_category_check on public.farm_expenses is
  'Must stay in sync with EXPENSE_CATS in frontend/src/pages/Expenses.jsx — a category the form offers but this list rejects fails the save with 23514.';

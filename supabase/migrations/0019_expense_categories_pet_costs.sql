-- Why: pets (dogs, cats) are now tracked on the Livestock screen alongside cattle
-- and poultry. A pet's spend is food, accessories, vet and medicine — and two of
-- those four had no category to go in. Adding them to the Expenses form alone is
-- not enough: `farm_expenses.category` carries a CHECK constraint, so an
-- unlisted value is rejected at insert with a 23514 and the save just fails.
--
-- The same constraint was already out of step with the form in two other places:
-- Expenses.jsx offers `machinery` (Crop / Field) and `construction`
-- (Infrastructure), neither of which the constraint allows. Nobody had hit it
-- yet only because farm_expenses is still empty. Both are folded in here so the
-- allowed list matches the form exactly.
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

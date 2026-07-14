-- Why: ploughing is done by a driver on a tractor, and until now there was nowhere
-- to record either. The manager could log that Plot H was ploughed, but not who
-- drove or which tractor — the two facts the owner actually asks about.
--
-- The driver gets his OWN column rather than joining regular_worker_ids. That is
-- the load-bearing decision here. Ram Bachan is permanent staff on a monthly
-- salary; the regular labourers are on a daily rate. Putting him in the labourer
-- array would inflate the daily worker count, and — now that salary accrues when
-- earned (0014) — risks his cost landing twice, once monthly and once daily.
-- Ploughing done by one driver and no labourers must read as ZERO daily-wage
-- workers.
--
-- Both columns are null for every existing row and for every non-ploughing
-- activity. Nothing is backfilled. The ledger, salary accrual and cost
-- attribution are untouched — activity logging exists for the owner's
-- visibility and creates no expense of its own.
--
-- No new table, so the existing activity_logs RLS policies stand unchanged.

alter table public.activity_logs
  add column if not exists driver_id    uuid references public.labour_master(id),
  add column if not exists machinery_id uuid references public.machinery_master(id);

comment on column public.activity_logs.driver_id is
  'Tractor driver for a ploughing activity. NOT a daily-wage worker — deliberately kept out of regular_worker_ids so the worker count and salary accrual stay correct.';
comment on column public.activity_logs.machinery_id is
  'Tractor used for a ploughing activity. Null for every other activity type.';

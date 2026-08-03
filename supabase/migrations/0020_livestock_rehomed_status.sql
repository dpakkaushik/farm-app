-- Why: an animal can now be closed from its own card without a sale — it died, it
-- was rehomed, it was given away. Three of those four reasons have a status
-- already ('deceased', 'sold'); a rehoming does not.
--
-- Without this, a dog given to a neighbour has to be recorded as 'sold', which is
-- false data: it says money changed hands when none did, and it puts the animal in
-- the same bucket as a buffalo sold for ₹60,000. `status` carries a CHECK
-- constraint, so 'rehomed' is rejected at update with a 23514 and the close simply
-- fails until the constraint allows it.
--
-- 'culled' stays in the list. Nothing in the UI writes it any more, but rows may
-- already hold it and dropping a value from a CHECK constraint would break them.
--
-- Idempotent: the constraint is dropped if present before being re-added.

alter table public.livestock_master
  drop constraint if exists livestock_master_status_check;

alter table public.livestock_master
  add constraint livestock_master_status_check check (status = any (array[
    'active'::text,
    'sold'::text,
    'rehomed'::text,
    'deceased'::text,
    'culled'::text
  ]));

comment on constraint livestock_master_status_check on public.livestock_master is
  'Must stay in sync with STATUS_STYLE in frontend/src/pages/livestock/ui.jsx and the reasons offered by CloseModal in livestock/modals.jsx — a status the form writes but this list rejects fails the close with 23514.';

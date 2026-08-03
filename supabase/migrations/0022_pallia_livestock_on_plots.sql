-- Pallia: put the herd and the flocks on the land they are actually kept on.
--
-- 0021 added livestock_master.plot_id and every row was null, so the new
-- "Livestock kept here" section on the plot card had nothing to show anywhere.
-- This is the first assignment.
--
-- Plot A and Plot N are the only two plots on the farm with no active crop
-- cycle, which is what makes them the plausible homes for stock — the other
-- fifteen are standing sugarcane and paddy.
--
-- Idempotent, and safe on a database where Pallia doesn't exist: every lookup
-- bails rather than assuming, and the flock split is guarded on the Batch 2 row
-- not already being there.
do $$
declare
  v_farm    uuid;
  v_plot_a  uuid;
  v_plot_n  uuid;
  v_broiler uuid;
  v_batch2  uuid := 'f0000002-0000-0000-0000-000000000001';
  v_move    int  := 21;   -- of 43: 22 stay on Plot A, 21 move to Plot N
begin
  select id into v_farm from farms where name = 'Pallia Farm';
  if v_farm is null then return; end if;

  select id into v_plot_a from plots where farm_id = v_farm and name = 'Plot A';
  select id into v_plot_n from plots where farm_id = v_farm and name = 'Plot N';
  if v_plot_a is null or v_plot_n is null then return; end if;

  -- The three buffalo on Plot A; the cow and the ox on Plot N.
  update livestock_master set plot_id = v_plot_a
   where farm_id = v_farm and plot_id is null and name in ('Rani', 'Kali', 'Nimmi');

  update livestock_master set plot_id = v_plot_n
   where farm_id = v_farm and plot_id is null and name in ('Ganga', 'Motu');

  -- ── The flock splits in two ────────────────────────────────────────────────
  select id into v_broiler from livestock_master
   where farm_id = v_farm and name in ('Broiler', 'Broiler — Batch 1') limit 1;
  if v_broiler is null then return; end if;
  if exists (select 1 from livestock_master where id = v_batch2) then return; end if;

  -- The ₹10,000 the 43 birds cost is apportioned by head — ₹5,116 against 22 and
  -- ₹4,884 against 21 — so the farm's book value is still ₹10,000 after the
  -- split. Copying the full price onto both rows would have invented ₹10,000 of
  -- poultry out of a filing change.
  update livestock_master
     set name           = 'Broiler — Batch 1',
         plot_id        = v_plot_a,
         purchase_price = 5116
   where id = v_broiler;

  insert into livestock_master (
    id, farm_id, tag_id, name, animal_type, species, gender, tracking_mode,
    current_count, acquisition_type, purchase_date, purchase_price,
    health_status, is_active, status, plot_id, notes
  ) values (
    v_batch2, v_farm, 'lv-broiler-b2', 'Broiler — Batch 2', 'poultry', 'poultry',
    'female', 'count', 0, 'purchased', '2026-06-15', 4884,
    'healthy', true, 'active', v_plot_n,
    'Split off the original 43-bird Broiler flock. ₹10,000 purchase cost apportioned by head: ₹5,116 to Batch 1 (22 birds), ₹4,884 here (21 birds).'
  );

  -- current_count is never written directly — trg_sync_livestock_count derives it
  -- from this log. transfer_out and transfer_in are the change types that
  -- function already counts (negative and positive respectively), so the move is
  -- a real audit line on both sides and the farm total stays 43. Recording it as
  -- a sale or a death, the only other reasons the count UI offers, would have put
  -- false data in the books.
  insert into livestock_count_logs (
    farm_id, livestock_id, log_date, change_type, reason, quantity, notes
  ) values
    (v_farm, v_broiler, current_date, 'transfer_out', 'Split into Batch 2', v_move,
     'Moved 21 birds out to Broiler — Batch 2, kept on Plot N'),
    (v_farm, v_batch2,  current_date, 'transfer_in',  'Split from Batch 1', v_move,
     'Received 21 birds from the original Broiler flock on Plot A');
end $$;

-- Why: the ledger audit (2026-07-15) found v_crop_pnl told only part of the
-- story the owner asked for:
--
--   1. Revenue counted only `sales` rows reachable through harvest_sessions.
--      A sale linked directly by sales.cycle_id (harvest_session_id null) was
--      silently dropped from its cycle's P&L.
--   2. Residual revenue (bhoosa, parali, hara chara) never appeared: sold
--      crop_residuals reached the farm-level income ledger but not crop P&L.
--   3. There was no expected-revenue path at all. 16 of 18 cycles are unsold,
--      so the P&L tab showed "0%" margin for almost every cycle — meaningless.
--      Expected revenue = acres × yield_per_acre × price_per_qtl for the crop,
--      plus the residual term: pending crop_residuals rows where they exist
--      (created at harvest), else the crop template's residuals jsonb
--      (qty_per_acre × expected_rate × acres).
--   4. Neither P&L view carried farm_id, so the frontend could not scope them
--      to the active farm — a member of two farms would see both mixed.
--
-- Existing columns keep their names, types, and order (create or replace view
-- requires it); new columns are appended. `revenue`, `profit_loss`, and
-- `margin_pct` now include sold-residual revenue and direct-cycle sales.

create or replace view public.v_crop_pnl
with (security_invoker = on) as
select
  cc.id as cycle_id,
  p.name as plot_name,
  cr.name as crop_name,
  cc.sow_date,
  cc.season,
  cc.status as cycle_status,
  coalesce(p.area_acres::numeric, 0::numeric) as acres,
  coalesce(ii_cost.total, 0::numeric) as input_cost,
  coalesce(ll_cost.total, 0::numeric) as labour_cost,
  coalesce(ii_cost.total, 0::numeric) + coalesce(ll_cost.total, 0::numeric) as total_cost,
  coalesce(rev.total, 0::numeric) + coalesce(res.sold_revenue, 0::numeric) as revenue,
  (coalesce(rev.total, 0::numeric) + coalesce(res.sold_revenue, 0::numeric))
    - (coalesce(ii_cost.total, 0::numeric) + coalesce(ll_cost.total, 0::numeric)) as profit_loss,
  case
    when coalesce(rev.total, 0::numeric) + coalesce(res.sold_revenue, 0::numeric) > 0::numeric
    then round(
      ((coalesce(rev.total, 0::numeric) + coalesce(res.sold_revenue, 0::numeric))
        - (coalesce(ii_cost.total, 0::numeric) + coalesce(ll_cost.total, 0::numeric)))
      / (coalesce(rev.total, 0::numeric) + coalesce(res.sold_revenue, 0::numeric)) * 100::numeric, 1)
    else 0::numeric
  end as margin_pct,
  -- appended by 0017 ─────────────────────────────────────────────────────────
  coalesce(res.sold_revenue, 0::numeric) as residual_revenue,
  -- Expected revenue while the crop stands: master-data estimate for the grain
  -- plus the residual term. Residual expectation prefers the pending rows
  -- auto-created at harvest (real quantities); before harvest it falls back to
  -- the crop template's residuals jsonb.
  round(
    coalesce(p.area_acres::numeric, 0::numeric) * coalesce(cr.yield_per_acre, 0::numeric) * coalesce(cr.price_per_qtl, 0::numeric)
    + case
        when res.n_rows > 0 then coalesce(res.pending_expected, 0::numeric)
        else coalesce(p.area_acres::numeric, 0::numeric) * coalesce(res_tpl.per_acre, 0::numeric)
      end
  ) as expected_revenue,
  case
    when coalesce(p.area_acres::numeric, 0::numeric) * coalesce(cr.yield_per_acre, 0::numeric) * coalesce(cr.price_per_qtl, 0::numeric)
       + case when res.n_rows > 0 then coalesce(res.pending_expected, 0::numeric)
              else coalesce(p.area_acres::numeric, 0::numeric) * coalesce(res_tpl.per_acre, 0::numeric) end > 0::numeric
    then round(
      (coalesce(p.area_acres::numeric, 0::numeric) * coalesce(cr.yield_per_acre, 0::numeric) * coalesce(cr.price_per_qtl, 0::numeric)
        + case when res.n_rows > 0 then coalesce(res.pending_expected, 0::numeric)
               else coalesce(p.area_acres::numeric, 0::numeric) * coalesce(res_tpl.per_acre, 0::numeric) end
        - (coalesce(ii_cost.total, 0::numeric) + coalesce(ll_cost.total, 0::numeric)))
      / (coalesce(p.area_acres::numeric, 0::numeric) * coalesce(cr.yield_per_acre, 0::numeric) * coalesce(cr.price_per_qtl, 0::numeric)
        + case when res.n_rows > 0 then coalesce(res.pending_expected, 0::numeric)
               else coalesce(p.area_acres::numeric, 0::numeric) * coalesce(res_tpl.per_acre, 0::numeric) end) * 100::numeric, 1)
    else 0::numeric
  end as expected_margin_pct,
  cc.crop_id,
  cc.plot_id,
  cc.farm_id
from crop_cycles cc
join plots p on p.id = cc.plot_id
join crops cr on cr.id = cc.crop_id
left join (
  select cycle_id, sum(total_cost) as total
  from inventory_issues group by cycle_id
) ii_cost on ii_cost.cycle_id = cc.id
left join (
  select cycle_id, sum(total_payment) as total
  from labour_logs group by cycle_id
) ll_cost on ll_cost.cycle_id = cc.id
left join (
  -- A sale normally hangs off a harvest session; tolerate rows linked to the
  -- cycle directly so they are never dropped from P&L.
  select coalesce(hs.cycle_id, s.cycle_id) as cycle_id,
         sum(s.total_amount
             - coalesce(s.commission_per_qtl, 0::numeric) * (s.quantity_kg / 100::numeric)
             - coalesce(s.freight_charges, 0::numeric)
             - coalesce(s.deductions, 0::numeric)) as total
  from sales s
  left join harvest_sessions hs on hs.id = s.harvest_session_id
  where coalesce(hs.cycle_id, s.cycle_id) is not null
  group by coalesce(hs.cycle_id, s.cycle_id)
) rev on rev.cycle_id = cc.id
left join (
  select crop_cycle_id,
         count(*) as n_rows,
         sum(actual_revenue)   filter (where status =  'sold') as sold_revenue,
         sum(expected_revenue) filter (where status <> 'sold') as pending_expected
  from crop_residuals group by crop_cycle_id
) res on res.crop_cycle_id = cc.id
left join lateral (
  select sum(coalesce((r->>'qty_per_acre')::numeric, 0::numeric)
             * coalesce((r->>'expected_rate')::numeric, 0::numeric)) as per_acre
  from jsonb_array_elements(
         case when jsonb_typeof(cr.residuals) = 'array' then cr.residuals else '[]'::jsonb end
       ) r
) res_tpl on true;

-- v_livestock_pnl: same shape as before, farm_id appended so the frontend can
-- scope it to the active farm.
create or replace view public.v_livestock_pnl
with (security_invoker = on) as
select
  lm.id as livestock_id,
  lm.name as animal_name,
  coalesce(lm.species, lm.animal_type) as species,
  lm.status,
  coalesce(lm.purchase_price, 0::numeric) as purchase_price,
  coalesce(feed.total, 0::numeric) as total_feed_cost,
  coalesce(vet.total, 0::numeric) as total_vet_cost,
  coalesce(other_exp.total, 0::numeric) as total_other_cost,
  coalesce(lm.purchase_price, 0::numeric) + coalesce(feed.total, 0::numeric)
    + coalesce(vet.total, 0::numeric) + coalesce(other_exp.total, 0::numeric) as total_cost,
  coalesce(rev.total, 0::numeric) as total_revenue,
  coalesce(rev.total, 0::numeric)
    - (coalesce(lm.purchase_price, 0::numeric) + coalesce(feed.total, 0::numeric)
       + coalesce(vet.total, 0::numeric) + coalesce(other_exp.total, 0::numeric)) as profit_loss,
  lm.farm_id
from livestock_master lm
left join (
  select livestock_id, sum(amount) as total
  from farm_expenses where category = 'feed'::text group by livestock_id
) feed on feed.livestock_id = lm.id
left join (
  select livestock_id, sum(amount) as total
  from farm_expenses where category = 'veterinary'::text group by livestock_id
) vet on vet.livestock_id = lm.id
left join (
  select livestock_id, sum(amount) as total
  from farm_expenses
  where category <> all (array['feed'::text, 'veterinary'::text]) and livestock_id is not null
  group by livestock_id
) other_exp on other_exp.livestock_id = lm.id
left join (
  select livestock_id, sum(amount) as total
  from livestock_revenue group by livestock_id
) rev on rev.livestock_id = lm.id;

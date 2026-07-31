-- Why: a farm that joins the app mid-season has crops in the ground whose money
-- was spent before signup. Nothing is logged against those cycles, so a
-- near-harvest crop shows a fake ~100% margin. This migration gives each cycle
-- one number — `opening_cost`, "spent before the app ₹" — entered once during
-- onboarding (docs/PLAN-mid-year-onboarding.md) and added into the P&L's cost
-- side. From go-live onward nothing changes: actual cost = opening_cost +
-- everything logged after.
--
-- Depends on 0017 (v_crop_pnl with expected revenue + residuals + farm_id).
-- The view body below is 0017's verbatim, with coalesce(cc.opening_cost, 0)
-- folded into every place the cost total appears: total_cost, profit_loss,
-- margin_pct, and expected_margin_pct.

alter table public.crop_cycles
  add column if not exists opening_cost numeric;

comment on column public.crop_cycles.opening_cost is
  'Money spent on this cycle before the farm started using the app (mid-year onboarding). Counted into v_crop_pnl total_cost; not an inventory issue or labour log.';

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
  coalesce(ii_cost.total, 0::numeric) + coalesce(ll_cost.total, 0::numeric)
    + coalesce(cc.opening_cost, 0::numeric) as total_cost,
  coalesce(rev.total, 0::numeric) + coalesce(res.sold_revenue, 0::numeric) as revenue,
  (coalesce(rev.total, 0::numeric) + coalesce(res.sold_revenue, 0::numeric))
    - (coalesce(ii_cost.total, 0::numeric) + coalesce(ll_cost.total, 0::numeric)
       + coalesce(cc.opening_cost, 0::numeric)) as profit_loss,
  case
    when coalesce(rev.total, 0::numeric) + coalesce(res.sold_revenue, 0::numeric) > 0::numeric
    then round(
      ((coalesce(rev.total, 0::numeric) + coalesce(res.sold_revenue, 0::numeric))
        - (coalesce(ii_cost.total, 0::numeric) + coalesce(ll_cost.total, 0::numeric)
           + coalesce(cc.opening_cost, 0::numeric)))
      / (coalesce(rev.total, 0::numeric) + coalesce(res.sold_revenue, 0::numeric)) * 100::numeric, 1)
    else 0::numeric
  end as margin_pct,
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
        - (coalesce(ii_cost.total, 0::numeric) + coalesce(ll_cost.total, 0::numeric)
           + coalesce(cc.opening_cost, 0::numeric)))
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

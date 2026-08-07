-- Opening cost, itemised
--
-- A crop sown before the farm joined the app carries its prior spend as one
-- number, crop_cycles.opening_cost. That was enough to keep the margin honest,
-- and it is not enough for a crop report: a cycle with ₹80,000 of pre-app spend
-- shows nothing about what the money went on, so any cost-by-category or
-- cost-per-acre breakdown puts the whole thing in a bucket called "unknown" and
-- the comparison against a post-app cycle is meaningless.
--
-- The fix is not to back-enter the real history. It cannot be done: an entry in
-- inventory_issues deducts stock, and this farm's stock was reconciled to a
-- physical count on 2026-07-21 (see data-fixes/2026-07-21). Replaying months of
-- past issues would deduct that stock a second time and destroy the count. Prior
-- spend has to stay outside the transaction tables. So it stays where it is, and
-- simply gains detail.
--
-- The categories deliberately mirror what live tracking already produces —
-- inventory_items.category (seed, fertilizer, chemical, fuel) plus labour from
-- labour_logs — so a report can union pre-app and post-app spend into the same
-- rows. machinery and other exist because hired equipment and land rent are real
-- pre-app costs that nothing tracks per cycle today; naming them beats letting
-- them hide.

create table if not exists public.crop_cycle_opening_costs (
  id         uuid primary key default extensions.uuid_generate_v4(),
  farm_id    uuid not null references public.farms(id) on delete cascade,
  cycle_id   uuid not null references public.crop_cycles(id) on delete cascade,
  category   text not null check (category in
               ('seed','fertilizer','chemical','fuel','labour','machinery','other')),
  amount     numeric not null check (amount >= 0),
  notes      text,
  created_by uuid,
  created_at timestamptz not null default now(),
  -- One row per category per cycle: the breakup is a summary of past spend, not
  -- a transaction log. Editing a category means changing its number.
  unique (cycle_id, category)
);

create index if not exists idx_cycle_opening_costs_cycle on public.crop_cycle_opening_costs(cycle_id);
create index if not exists idx_cycle_opening_costs_farm  on public.crop_cycle_opening_costs(farm_id);

comment on table public.crop_cycle_opening_costs is
  'Itemised pre-app spend for a crop cycle. When any row exists for a cycle it supersedes crop_cycles.opening_cost in v_crop_pnl.';

-- Same four policies as every other table (see CLAUDE.md §6).
alter table public.crop_cycle_opening_costs enable row level security;

drop policy if exists crop_cycle_opening_costs_select on public.crop_cycle_opening_costs;
drop policy if exists crop_cycle_opening_costs_insert on public.crop_cycle_opening_costs;
drop policy if exists crop_cycle_opening_costs_update on public.crop_cycle_opening_costs;
drop policy if exists crop_cycle_opening_costs_delete on public.crop_cycle_opening_costs;

create policy crop_cycle_opening_costs_select on public.crop_cycle_opening_costs
  for select using (public.is_farm_member(farm_id));
create policy crop_cycle_opening_costs_insert on public.crop_cycle_opening_costs
  for insert with check (public.has_farm_role(farm_id, 'manager'));
create policy crop_cycle_opening_costs_update on public.crop_cycle_opening_costs
  for update using (public.has_farm_role(farm_id, 'manager'));
create policy crop_cycle_opening_costs_delete on public.crop_cycle_opening_costs
  for delete using (public.has_farm_role(farm_id, 'admin'));

-- ── v_crop_pnl: the breakup supersedes the lump ──────────────────────────────
--
-- Only the opening-cost term changes. Where the view read
-- coalesce(cc.opening_cost, 0) it now reads coalesce(oc.total, cc.opening_cost, 0)
-- — itemised wins where it exists, and a cycle that only ever had the single
-- number is untouched. Two columns are appended: the resolved opening cost, and
-- whether it came from the breakup, so a report can say "unspecified" honestly
-- instead of pretending a lump is a category.

create or replace view public.v_crop_pnl as
 select cc.id as cycle_id,
    p.name as plot_name,
    cr.name as crop_name,
    cc.sow_date,
    cc.season,
    cc.status as cycle_status,
    coalesce(p.area_acres::numeric, 0::numeric) as acres,
    coalesce(ii_cost.total, 0::numeric) as input_cost,
    coalesce(ll_cost.total, 0::numeric) as labour_cost,
    (coalesce(ii_cost.total, 0::numeric) + coalesce(ll_cost.total, 0::numeric)
       + coalesce(oc.total, cc.opening_cost, 0::numeric)) as total_cost,
    (coalesce(rev.total, 0::numeric) + coalesce(res.sold_revenue, 0::numeric)) as revenue,
    ((coalesce(rev.total, 0::numeric) + coalesce(res.sold_revenue, 0::numeric))
       - (coalesce(ii_cost.total, 0::numeric) + coalesce(ll_cost.total, 0::numeric)
          + coalesce(oc.total, cc.opening_cost, 0::numeric))) as profit_loss,
    case
      when (coalesce(rev.total, 0::numeric) + coalesce(res.sold_revenue, 0::numeric)) > 0::numeric
      then round((((coalesce(rev.total, 0::numeric) + coalesce(res.sold_revenue, 0::numeric))
                   - (coalesce(ii_cost.total, 0::numeric) + coalesce(ll_cost.total, 0::numeric)
                      + coalesce(oc.total, cc.opening_cost, 0::numeric)))
                  / (coalesce(rev.total, 0::numeric) + coalesce(res.sold_revenue, 0::numeric))) * 100::numeric, 1)
      else 0::numeric
    end as margin_pct,
    coalesce(res.sold_revenue, 0::numeric) as residual_revenue,
    round(((coalesce(p.area_acres::numeric, 0::numeric) * coalesce(cr.yield_per_acre, 0::numeric))
            * coalesce(cr.price_per_qtl, 0::numeric))
          + case when res.n_rows > 0 then coalesce(res.pending_expected, 0::numeric)
                 else coalesce(p.area_acres::numeric, 0::numeric) * coalesce(res_tpl.per_acre, 0::numeric) end
         ) as expected_revenue,
    case
      when (((coalesce(p.area_acres::numeric, 0::numeric) * coalesce(cr.yield_per_acre, 0::numeric))
              * coalesce(cr.price_per_qtl, 0::numeric))
            + case when res.n_rows > 0 then coalesce(res.pending_expected, 0::numeric)
                   else coalesce(p.area_acres::numeric, 0::numeric) * coalesce(res_tpl.per_acre, 0::numeric) end) > 0::numeric
      then round(((((coalesce(p.area_acres::numeric, 0::numeric) * coalesce(cr.yield_per_acre, 0::numeric))
                     * coalesce(cr.price_per_qtl, 0::numeric))
                   + case when res.n_rows > 0 then coalesce(res.pending_expected, 0::numeric)
                          else coalesce(p.area_acres::numeric, 0::numeric) * coalesce(res_tpl.per_acre, 0::numeric) end
                   - (coalesce(ii_cost.total, 0::numeric) + coalesce(ll_cost.total, 0::numeric)
                      + coalesce(oc.total, cc.opening_cost, 0::numeric)))
                  / (((coalesce(p.area_acres::numeric, 0::numeric) * coalesce(cr.yield_per_acre, 0::numeric))
                       * coalesce(cr.price_per_qtl, 0::numeric))
                     + case when res.n_rows > 0 then coalesce(res.pending_expected, 0::numeric)
                            else coalesce(p.area_acres::numeric, 0::numeric) * coalesce(res_tpl.per_acre, 0::numeric) end))
                 * 100::numeric, 1)
      else 0::numeric
    end as expected_margin_pct,
    cc.crop_id,
    cc.plot_id,
    cc.farm_id,
    -- Appended (create or replace only allows new columns at the end).
    coalesce(oc.total, cc.opening_cost, 0::numeric) as opening_cost,
    (oc.total is not null)                          as opening_cost_is_itemised
   from crop_cycles cc
     join plots p on p.id = cc.plot_id
     join crops cr on cr.id = cc.crop_id
     left join ( select inventory_issues.cycle_id, sum(inventory_issues.total_cost) as total
                   from inventory_issues group by inventory_issues.cycle_id) ii_cost on ii_cost.cycle_id = cc.id
     left join ( select labour_logs.cycle_id, sum(labour_logs.total_payment) as total
                   from labour_logs group by labour_logs.cycle_id) ll_cost on ll_cost.cycle_id = cc.id
     left join ( select crop_cycle_opening_costs.cycle_id, sum(crop_cycle_opening_costs.amount) as total
                   from crop_cycle_opening_costs group by crop_cycle_opening_costs.cycle_id) oc on oc.cycle_id = cc.id
     left join ( select coalesce(hs.cycle_id, s.cycle_id) as cycle_id,
                        sum(s.total_amount - coalesce(s.commission_per_qtl, 0::numeric) * (s.quantity_kg / 100::numeric)
                            - coalesce(s.freight_charges, 0::numeric) - coalesce(s.deductions, 0::numeric)) as total
                   from sales s left join harvest_sessions hs on hs.id = s.harvest_session_id
                  where coalesce(hs.cycle_id, s.cycle_id) is not null
                  group by coalesce(hs.cycle_id, s.cycle_id)) rev on rev.cycle_id = cc.id
     left join ( select crop_residuals.crop_cycle_id, count(*) as n_rows,
                        sum(crop_residuals.actual_revenue) filter (where crop_residuals.status = 'sold'::text) as sold_revenue,
                        sum(crop_residuals.expected_revenue) filter (where crop_residuals.status <> 'sold'::text) as pending_expected
                   from crop_residuals group by crop_residuals.crop_cycle_id) res on res.crop_cycle_id = cc.id
     left join lateral ( select sum(coalesce((r.value ->> 'qty_per_acre')::numeric, 0::numeric)
                                    * coalesce((r.value ->> 'expected_rate')::numeric, 0::numeric)) as per_acre
                           from jsonb_array_elements(case when jsonb_typeof(cr.residuals) = 'array'
                                                          then cr.residuals else '[]'::jsonb end) r(value)) res_tpl on true;

alter view public.v_crop_pnl set (security_invoker = on);

-- ── Every crop cost in one shape, pre-app and post-app alike ─────────────────
--
-- The point of the whole exercise: a cost-by-category report can read this one
-- view and get comparable rows whichever side of the farm's signup date the
-- money was spent. is_opening marks the pre-app rows so a report can show them
-- apart when it wants to.

drop view if exists public.v_crop_cost_lines;

create view public.v_crop_cost_lines as
select ii.cycle_id, cc.farm_id,
       coalesce(i.category, 'other')        as category,
       ii.total_cost                        as amount,
       ii.issue_date                        as cost_date,
       false                                as is_opening
  from inventory_issues ii
  join crop_cycles cc on cc.id = ii.cycle_id
  left join inventory_items i on i.id = ii.item_id
 where ii.cycle_id is not null
union all
select ll.cycle_id, cc.farm_id,
       'labour'::text,
       ll.total_payment,
       ll.activity_date,
       false
  from labour_logs ll
  join crop_cycles cc on cc.id = ll.cycle_id
 where ll.cycle_id is not null
union all
select oc.cycle_id, oc.farm_id,
       oc.category,
       oc.amount,
       cc.sow_date,
       true
  from crop_cycle_opening_costs oc
  join crop_cycles cc on cc.id = oc.cycle_id
union all
-- A cycle still carrying only the old single number reports as one honest
-- 'unspecified' row rather than being silently absent from a category report.
select cc.id, cc.farm_id,
       'unspecified'::text,
       cc.opening_cost,
       cc.sow_date,
       true
  from crop_cycles cc
 where coalesce(cc.opening_cost, 0) > 0
   and not exists (select 1 from crop_cycle_opening_costs o where o.cycle_id = cc.id);

alter view public.v_crop_cost_lines set (security_invoker = on);

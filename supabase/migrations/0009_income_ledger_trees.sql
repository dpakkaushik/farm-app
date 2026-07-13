-- Why: tree money was invisible. v_income_ledger unioned three revenue streams —
-- crop sales, livestock, crop residuals — and tree_revenue was not one of them, so
-- a ₹50,000 mango lease showed on the Trees tab and nowhere else. It was absent
-- from Total Income, from the P&L, and from the monthly chart.
--
-- v_monthly_summary reads this view, so the fourth branch reaches the Summary and
-- P&L tabs with no further change.
--
-- The column list is unchanged, which is what lets `create or replace` work here.
-- security_invoker is re-stated so this view keeps honouring the base tables' RLS
-- (see 0005) rather than silently reverting to its owner's privileges.

create or replace view public.v_income_ledger
with (security_invoker = on) as

 select lr.id,
    lr.revenue_date as entry_date,
    'livestock'::text as source_type,
    lr.revenue_type as description,
    lr.amount,
    lr.livestock_id as entity_id,
    lm.name as entity_name,
    lr.buyer_name,
    lr.payment_mode,
    'paid'::text as payment_status
   from livestock_revenue lr
     left join livestock_master lm on lm.id = lr.livestock_id

union all

 select s.id,
    s.sale_date as entry_date,
    'crop'::text as source_type,
    concat(cr.name, ' sale') as description,
    s.total_amount
      - coalesce(s.commission_per_qtl, 0::numeric) * (s.quantity_kg / 100::numeric)
      - coalesce(s.freight_charges, 0::numeric)
      - coalesce(s.deductions, 0::numeric) as amount,
    cc.id as entity_id,
    concat(p.name, ' — ', cr.name) as entity_name,
    s.buyer_name,
    s.payment_method as payment_mode,
    s.payment_status
   from sales s
     left join harvest_sessions hs on hs.id = s.harvest_session_id
     left join crop_cycles cc on cc.id = hs.cycle_id
     left join plots p on p.id = cc.plot_id
     left join crops cr on cr.id = cc.crop_id

union all

 select r.id,
    r.sale_date as entry_date,
    'crop_residual'::text as source_type,
    concat(cr.name, ' — ', r.product_name) as description,
    r.actual_revenue as amount,
    r.crop_cycle_id as entity_id,
    concat(p.name, ' — ', cr.name, ' (', r.product_name, ')') as entity_name,
    r.buyer_name,
    null::text as payment_mode,
    r.payment_status
   from crop_residuals r
     left join crop_cycles cc on cc.id = r.crop_cycle_id
     left join plots p on p.id = cc.plot_id
     left join crops cr on cr.id = cc.crop_id
  where r.status = 'sold'::text

union all

-- Trees. The farm leases rather than harvests, so the income is the lump sum in
-- the agreement, not a per-kg total — `amount` is the deal and `payment_status`
-- carries whether it has landed, exactly as a crop sale does.
--
-- One lease can span several plantings and several species, so the species names
-- are aggregated into entity_name. entity_id is the revenue row itself: there is
-- no single tree to point at, and pointing at one of many would be a lie.
 select r.id,
    coalesce(r.agreement_date, r.start_date) as entry_date,
    'tree'::text as source_type,
    case r.revenue_type
      when 'fruit_lease' then 'Fruit lease'
      when 'timber_sale' then 'Timber sale'
      else r.revenue_type
    end as description,
    r.amount,
    r.id as entity_id,
    coalesce(sp.names, 'Trees') as entity_name,
    r.buyer_name,
    null::text as payment_mode,
    r.payment_status
   from tree_revenue r
     left join lateral (
       select string_agg(distinct coalesce(s.name_en, s.name_local), ', ') as names
         from tree_revenue_items i
         join tree_plantings p on p.id = i.planting_id
         join tree_species s on s.id = p.species_id
        where i.revenue_id = r.id
     ) sp on true;

-- Why: the Income tab called an entry "collected" only when payment_status was
-- exactly 'paid'. A part-paid deal counted as zero collected — ₹20,000 received
-- against a ₹50,000 lease showed as ₹50,000 still pending. The view now says how
-- much of each entry has actually landed, and the frontend sums that instead of
-- guessing from the status.
--
-- The new column is appended LAST in every branch: `create or replace view` only
-- permits adding columns at the end.
--
-- Per source:
--   livestock      — always cash at the gate; the view already hardcodes 'paid'.
--   crop sales     — the net amount when paid; else amount_received (raw, may be 0).
--   crop residuals — no partial-payment field exists; paid = all, else nothing.
--   trees          — amount_received is real and maintained by the app.

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
    'paid'::text as payment_status,
    lr.amount as amount_received
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
    s.payment_status,
    case when s.payment_status = 'paid'
         then s.total_amount
              - coalesce(s.commission_per_qtl, 0::numeric) * (s.quantity_kg / 100::numeric)
              - coalesce(s.freight_charges, 0::numeric)
              - coalesce(s.deductions, 0::numeric)
         else coalesce(s.amount_received, 0::numeric)
    end as amount_received
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
    r.payment_status,
    case when r.payment_status = 'paid' then r.actual_revenue else 0::numeric end as amount_received
   from crop_residuals r
     left join crop_cycles cc on cc.id = r.crop_cycle_id
     left join plots p on p.id = cc.plot_id
     left join crops cr on cr.id = cc.crop_id
  where r.status = 'sold'::text

union all

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
    r.payment_status,
    case when r.payment_status = 'paid' then r.amount else r.amount_received end as amount_received
   from tree_revenue r
     left join lateral (
       select string_agg(distinct coalesce(s.name_en, s.name_local), ', ') as names
         from tree_revenue_items i
         join tree_plantings p on p.id = i.planting_id
         join tree_species s on s.id = p.species_id
        where i.revenue_id = r.id
     ) sp on true;

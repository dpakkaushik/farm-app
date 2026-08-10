-- A buffalo is not an expense against her own milk
--
-- v_livestock_pnl added purchase_price into every animal's total_cost, so a
-- ₹55,000 buffalo could never be profitable: her milk was charged for her own
-- purchase, permanently. ₹2.6 lakh of individually-tracked animals sat as
-- costs this way. A dairy animal is capital — the same decision already made
-- for the tractor (farms.capex_threshold, no depreciation, capital stays out
-- of the P&L and is reported on its own).
--
-- The distinction the design already carries: tracking_mode.
--
--   individual  — a named animal kept for what it produces. Capital. Its
--                 purchase price is excluded from its running P&L.
--   count       — a batch bought to be sold (broilers). Inventory. Its
--                 purchase price IS its cost of goods and stays in.
--
-- purchase_price remains a column either way, so the screen can still show
-- what an animal cost without charging it against her.

create or replace view public.v_livestock_pnl as
select
    lm.id                                   as livestock_id,
    lm.name                                 as animal_name,
    coalesce(lm.species, lm.animal_type)    as species,
    lm.status,
    coalesce(lm.purchase_price, 0)          as purchase_price,
    coalesce(feed.total, 0)                 as total_feed_cost,
    coalesce(vet.total, 0)                  as total_vet_cost,
    coalesce(other_exp.total, 0)            as total_other_cost,
    case when lm.tracking_mode = 'count'
         then coalesce(lm.purchase_price, 0) else 0 end
      + coalesce(feed.total, 0) + coalesce(vet.total, 0)
      + coalesce(other_exp.total, 0)        as total_cost,
    coalesce(rev.total, 0)                  as total_revenue,
    coalesce(rev.total, 0)
      - (case when lm.tracking_mode = 'count'
              then coalesce(lm.purchase_price, 0) else 0 end
         + coalesce(feed.total, 0) + coalesce(vet.total, 0)
         + coalesce(other_exp.total, 0))    as profit_loss,
    lm.farm_id
  from public.livestock_master lm
  left join (select livestock_id, sum(amount) as total from public.farm_expenses
              where category = 'feed' group by livestock_id) feed
         on feed.livestock_id = lm.id
  left join (select livestock_id, sum(amount) as total from public.farm_expenses
              where category = 'veterinary' group by livestock_id) vet
         on vet.livestock_id = lm.id
  left join (select livestock_id, sum(amount) as total from public.farm_expenses
              where category not in ('feed', 'veterinary') and livestock_id is not null
              group by livestock_id) other_exp
         on other_exp.livestock_id = lm.id
  left join (select livestock_id, sum(amount) as total from public.livestock_revenue
              group by livestock_id) rev
         on rev.livestock_id = lm.id;

alter view public.v_livestock_pnl set (security_invoker = on);

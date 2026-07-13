-- Why: paying a salary or giving an advance never wrote a cash-book entry, so the
-- Cash Book showed money still in the drawer that had actually been handed out.
-- Vendor and expense payments already wrote their cash-out line; salaries and
-- advances did not. The app now writes these on every new payment (tagged with
-- reference_id = the payment row); this backfills the ones recorded before.
--
-- Idempotent: the NOT EXISTS on reference_id means re-running inserts nothing.

insert into owner_cash_entries
  (farm_id, entry_date, amount, direction, entry_type, notes, reference_id)
select sp.farm_id,
       sp.payment_date,
       sp.amount_paid,
       'out',
       'salary_payment',
       concat('Salary — ', lm.name,
              case when sp.payment_month is not null
                   then concat(' (', to_char(sp.payment_month::timestamptz, 'Mon YYYY'), ')')
                   else '' end),
       sp.id
from salary_payments sp
join labour_master lm on lm.id = sp.labourer_id
where sp.amount_paid > 0
  and not exists (select 1 from owner_cash_entries oce where oce.reference_id = sp.id);

insert into owner_cash_entries
  (farm_id, entry_date, amount, direction, entry_type, notes, reference_id)
select sa.farm_id,
       sa.advance_date,
       sa.amount,
       'out',
       'advance_payment',
       concat('Advance — ', lm.name),
       sa.id
from salary_advances sa
join labour_master lm on lm.id = sa.labourer_id
where sa.amount > 0
  and not exists (select 1 from owner_cash_entries oce where oce.reference_id = sa.id);

-- 0035 — a payment says which bills it settled
--
-- The owner, 1 Sep 2026: "lets say we settle 50000 and there was one 50000 bill
-- and two 20k bills and one 10k bill — how app will know which bill to clear?"
--
-- It could not. vendor_payments carried a vendor and an amount and nothing else,
-- so the khata showed a running balance and no bill ever said whether it was
-- settled. Balance Due was right; "what is this ₹50,000 for" had no answer.
--
-- So a payment now carries its breakup. One row per thing the money was put
-- against:
--
--   target = 'bill'       → bill_id names an inventory_bills row
--   target = 'opening'    → the vendor's carried-in opening balance (0025); it
--                           is a real debit with no document behind it, so it is
--                           settleable but it is not a bill
--   target = 'on_account' → money paid without saying what for. Not a fudge —
--                           it is how the app behaved until today, and a
--                           part-payment must stay legal without inventing an
--                           allocation nobody made.
--
-- What is NOT stored: a bill's paid amount or its status. Those are
-- sum(allocations) and total_amount − sum(allocations), derived on read, the
-- same rule every other balance in this app follows. A stored status drifts;
-- a sum cannot.
--
-- Deliberately unchanged: v_vendor_balances. An allocation explains a payment,
-- it does not move money, so Balance Due is the same figure before and after
-- this migration — by construction, not by luck. If a future edit makes
-- allocations affect a balance, that is a bug.

-- ── 1. The table ─────────────────────────────────────────────────────────────

create table if not exists public.vendor_payment_allocations (
  id         uuid primary key default gen_random_uuid(),
  farm_id    uuid not null references public.farms(id) on delete cascade,
  -- Deleting a payment must take its breakup with it: an allocation without a
  -- payment would show a bill as settled by money that no longer exists.
  payment_id uuid not null references public.vendor_payments(id) on delete cascade,
  -- Restrict, not cascade: a bill that has been paid against cannot quietly
  -- vanish and leave the payment claiming to have settled nothing.
  bill_id    uuid references public.inventory_bills(id) on delete restrict,
  target     text not null default 'bill'
             check (target in ('bill', 'opening', 'on_account')),
  amount     numeric(12,2) not null check (amount > 0),
  created_at timestamptz not null default now(),
  -- bill_id is exactly the rows that name a bill. Without this a 'bill' row
  -- could point at nothing and read as settling every bill or none.
  constraint vendor_payment_allocations_target_bill
    check ((target = 'bill') = (bill_id is not null))
);

create index if not exists idx_vpa_payment on public.vendor_payment_allocations (payment_id);
create index if not exists idx_vpa_bill    on public.vendor_payment_allocations (bill_id);

comment on table public.vendor_payment_allocations is
  'What one vendor payment settled: a bill, the carried-in opening balance, or nothing in particular (on account). Explains a payment — never changes what is owed.';
comment on column public.vendor_payment_allocations.target is
  'bill = bill_id names the document · opening = the vendor''s pre-app opening balance · on_account = unallocated.';

-- ── 2. RLS — the standard farm-scoped four ───────────────────────────────────

alter table public.vendor_payment_allocations enable row level security;

drop policy if exists vendor_payment_allocations_select on public.vendor_payment_allocations;
drop policy if exists vendor_payment_allocations_insert on public.vendor_payment_allocations;
drop policy if exists vendor_payment_allocations_update on public.vendor_payment_allocations;
drop policy if exists vendor_payment_allocations_delete on public.vendor_payment_allocations;

create policy vendor_payment_allocations_select on public.vendor_payment_allocations
  for select using (is_farm_member(farm_id));
create policy vendor_payment_allocations_insert on public.vendor_payment_allocations
  for insert with check (has_farm_role(farm_id, 'manager'::text));
create policy vendor_payment_allocations_update on public.vendor_payment_allocations
  for update using (has_farm_role(farm_id, 'manager'::text));
create policy vendor_payment_allocations_delete on public.vendor_payment_allocations
  for delete using (has_farm_role(farm_id, 'admin'::text));

-- ── 3. One call, or nothing ──────────────────────────────────────────────────
--
-- supabase-js has no client transaction. addVendorPayment wrote the cash entry
-- and then the payment as two separate calls, and on 1 Sep a salary save
-- interrupted between exactly such a pair left a ₹10,000 payment with no cash
-- line — money that had left the farm and was in no cash book. Adding a third
-- write (the allocations) to that pattern would make it likelier, not rarer.
--
-- So all three are one function, and it either all happens or none of it does.
-- SECURITY INVOKER (the default, stated for the reader): every insert runs
-- under the caller's RLS, so a viewer still cannot pay anybody.

create or replace function public.record_vendor_payment(
  p_vendor_id    uuid,
  p_payment_date date,
  p_amount       numeric,
  p_payment_mode text    default 'cash',
  p_notes        text    default null,
  p_account_id   uuid    default null,
  -- [{"target":"bill","bill_id":"…","amount":100}, {"target":"on_account","amount":50}]
  p_allocations  jsonb   default '[]'::jsonb
) returns jsonb
language plpgsql
set search_path = public
as $$
declare
  v_farm_id    uuid;
  v_vendor     public.vendors%rowtype;
  v_cash       public.owner_cash_entries%rowtype;
  v_payment    public.vendor_payments%rowtype;
  v_alloc_sum  numeric := 0;
  v_allocs     jsonb   := coalesce(p_allocations, '[]'::jsonb);
  v_bad        int;
begin
  if p_amount is null or p_amount <= 0 then
    raise exception 'Payment amount must be positive';
  end if;

  select * into v_vendor from public.vendors where id = p_vendor_id;
  if v_vendor.id is null then
    raise exception 'Vendor not found';
  end if;
  v_farm_id := v_vendor.farm_id;

  -- The breakup must account for the whole payment. A payment of ₹50,000 whose
  -- lines add to ₹40,000 would leave ₹10,000 settling nothing while still
  -- leaving the vendor — the khata would stop tying to the bills beneath it.
  select coalesce(sum(x.amount), 0) into v_alloc_sum
    from jsonb_to_recordset(v_allocs) as x(amount numeric);

  if round(v_alloc_sum, 2) <> round(p_amount, 2) then
    raise exception 'Allocations (%) must add up to the payment (%)', v_alloc_sum, p_amount;
  end if;

  -- Every named bill must be this vendor's, on this farm. Otherwise a payment
  -- to one party could mark another party's bill settled.
  select count(*) into v_bad
    from jsonb_to_recordset(v_allocs) as x(bill_id uuid, target text)
    left join public.inventory_bills b on b.id = x.bill_id
   where x.target = 'bill'
     and (b.id is null or b.vendor_id is distinct from p_vendor_id or b.farm_id is distinct from v_farm_id);
  if v_bad > 0 then
    raise exception 'A selected bill does not belong to this vendor';
  end if;

  insert into public.owner_cash_entries
    (farm_id, entry_date, amount, direction, entry_type, notes, account_id, created_by)
  values
    (v_farm_id, p_payment_date, p_amount, 'out', 'vendor_payment',
     coalesce(nullif(p_notes, ''), concat('Paid to ', v_vendor.name)),
     p_account_id, auth.uid())
  returning * into v_cash;

  insert into public.vendor_payments
    (farm_id, vendor_id, payment_date, amount, payment_mode, notes, cash_entry_id, created_by)
  values
    (v_farm_id, p_vendor_id, p_payment_date, p_amount,
     coalesce(p_payment_mode, 'cash'), nullif(p_notes, ''), v_cash.id, auth.uid())
  returning * into v_payment;

  -- Points the cash line back at the payment, so a row in the cash book can be
  -- traced to the bills it cleared rather than only to the vendor.
  update public.owner_cash_entries
     set reference_id = v_payment.id
   where id = v_cash.id
  returning * into v_cash;

  insert into public.vendor_payment_allocations (farm_id, payment_id, bill_id, target, amount)
  select v_farm_id, v_payment.id,
         case when x.target = 'bill' then x.bill_id else null end,
         x.target, x.amount
    from jsonb_to_recordset(v_allocs) as x(bill_id uuid, target text, amount numeric)
   where x.amount > 0;

  return jsonb_build_object(
    'payment',     to_jsonb(v_payment),
    'cash_entry',  to_jsonb(v_cash),
    'allocations', coalesce(
      (select jsonb_agg(to_jsonb(a))
         from public.vendor_payment_allocations a
        where a.payment_id = v_payment.id),
      '[]'::jsonb)
  );
end $$;

comment on function public.record_vendor_payment is
  'Records a vendor payment, its cash-book line and its bill-wise breakup in ONE transaction. Allocations must add up to the payment amount.';

-- Money lives in named accounts
--
-- The cash book was one undifferentiated pot. A cheque from the mill and notes
-- in the manager's pocket landed in the same balance, a vendor paid by bank
-- transfer drained "cash in hand" on screen, and the owner sending ₹50,000 to
-- the manager for expenses could not be recorded at all — the only door was
-- owner_capital, which would have overstated both the farm's cash and the
-- owner's stake while the bank that paid it never moved.
--
-- So: accounts. A farm holds money in named places — cash with the manager,
-- the bank — and every movement names the account it touches. Three kinds:
--
--   receipt   +one account     (crop sold by cheque → Bank; for cash → Cash)
--   payment   −one account     (Ankur by cheque → Bank; diesel → Cash)
--   transfer  −one, +another   (owner tops up the manager: Bank → Cash)
--
-- A transfer is two linked rows written in one function, so it can never
-- half-happen, nets to zero for the farm, and never touches the P&L — it is
-- the same money changing pockets.
--
-- Routing needs no new questions: every payment form already asks a payment
-- mode. The mode now decides the account (cash → Cash; bank/upi/cheque →
-- Bank) instead of being a recorded-and-ignored label, which is the same
-- disease the expense form had ("cash" that created no payment) and the bill
-- form had ("Other" that created no vendor).
--
-- SaaS: seed_farm_defaults gains an accounts block, so every farm is born
-- with Cash in hand and Bank. Nothing to configure on farm #3.
--
-- Supersedes farms.opening_cash from 0027 (never populated — verified 0 on
-- every farm): an opening balance belongs to each account, not the farm. The
-- column stays and v_cash_book still honours it as a fallback, because a
-- deployed checklist form may still write it during the deploy window; the
-- checklist now writes accounts.

-- ── 1. The master ────────────────────────────────────────────────────────────

create table if not exists public.accounts (
  id              uuid primary key default uuid_generate_v4(),
  farm_id         uuid not null references public.farms(id) on delete cascade,
  name            text not null,
  type            text not null check (type in ('cash', 'bank')),
  is_default      boolean not null default false,
  opening_balance numeric not null default 0,
  opening_balance_date date,
  is_active       boolean not null default true,
  created_at      timestamptz not null default now(),
  unique (farm_id, name)
);

-- Exactly one default per farm — the account unrouted money falls into.
create unique index if not exists idx_accounts_one_default
  on public.accounts(farm_id) where is_default;

comment on table public.accounts is
  'Where a farm''s money physically sits: cash with the manager, the bank. Every cash-book entry names one. The default account catches entries written by clients that predate accounts.';

alter table public.accounts enable row level security;

drop policy if exists accounts_select on public.accounts;
create policy accounts_select on public.accounts
  for select using (public.is_farm_member(farm_id));
drop policy if exists accounts_insert on public.accounts;
create policy accounts_insert on public.accounts
  for insert with check (public.has_farm_role(farm_id, 'manager'));
drop policy if exists accounts_update on public.accounts;
create policy accounts_update on public.accounts
  for update using (public.has_farm_role(farm_id, 'manager'));
drop policy if exists accounts_delete on public.accounts;
create policy accounts_delete on public.accounts
  for delete using (public.has_farm_role(farm_id, 'admin'));

-- ── 2. Entries name their account ────────────────────────────────────────────

alter table public.owner_cash_entries
  add column if not exists account_id  uuid references public.accounts(id),
  add column if not exists transfer_id uuid;

create index if not exists idx_owner_cash_entries_account
  on public.owner_cash_entries(account_id);

comment on column public.owner_cash_entries.transfer_id is
  'Set on the pair of rows a transfer writes — one out, one in — so they can be shown and deleted together.';

-- ── 3. Every farm gets its accounts, every entry gets its address ────────────

insert into public.accounts (farm_id, name, type, is_default)
select f.id, 'Cash in hand', 'cash', true from public.farms f
on conflict (farm_id, name) do nothing;

insert into public.accounts (farm_id, name, type, is_default)
select f.id, 'Bank', 'bank', false from public.farms f
on conflict (farm_id, name) do nothing;

update public.owner_cash_entries e
   set account_id = a.id
  from public.accounts a
 where e.account_id is null
   and a.farm_id = e.farm_id
   and a.is_default;

-- Old deployed clients insert entries with no account_id. They land in the
-- default account rather than nowhere.
create or replace function public.fill_cash_entry_account()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.account_id is null then
    select id into new.account_id from public.accounts
     where farm_id = new.farm_id and is_default limit 1;
  end if;
  return new;
end $$;

drop trigger if exists trg_fill_cash_entry_account on public.owner_cash_entries;
create trigger trg_fill_cash_entry_account
  before insert on public.owner_cash_entries
  for each row execute function public.fill_cash_entry_account();

-- ── 4. New farms are born with both ──────────────────────────────────────────
--
-- Same function as 0016, one block added at the top — before the early-return
-- guard, because a farm that somehow has crops but no accounts still needs
-- accounts. Idempotent via on-conflict.

create or replace function public.seed_farm_accounts(p_farm_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_farm_id is null then return; end if;
  insert into accounts (farm_id, name, type, is_default)
  values (p_farm_id, 'Cash in hand', 'cash', true)
  on conflict (farm_id, name) do nothing;
  insert into accounts (farm_id, name, type, is_default)
  values (p_farm_id, 'Bank', 'bank', false)
  on conflict (farm_id, name) do nothing;
end $$;

-- seed_farm_defaults itself is long and unchanged; rather than restate it and
-- risk drift, the accounts seeding is chained where farm creation already
-- calls it.
create or replace function public.create_farm_with_membership(
  p_name text, p_location text default 'India', p_total_acres double precision default 0,
  p_map_state jsonb default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_farm_id uuid;
  v_result  jsonb;
begin
  insert into farms (name, location, total_acres, map_state, owner_id)
  values (p_name, p_location, p_total_acres, p_map_state, auth.uid())
  returning id into v_farm_id;

  insert into farm_memberships (farm_id, user_id, role, status)
  values (v_farm_id, auth.uid(), 'admin', 'active');

  perform seed_farm_defaults(v_farm_id);
  perform seed_farm_accounts(v_farm_id);

  select to_jsonb(f) into v_result from farms f where f.id = v_farm_id;
  return v_result;
end $$;

-- ── 5. Transfers: two rows or none ───────────────────────────────────────────
--
-- SECURITY INVOKER on purpose: the inserts run under the caller's RLS, so only
-- a manager of the farm can move its money. Both rows share a transfer_id and
-- are written in one function call — supabase-js has no client transactions,
-- and a transfer that half-happens is money invented or destroyed.

create or replace function public.record_transfer(
  p_from_account uuid, p_to_account uuid, p_amount numeric,
  p_date date, p_notes text default null)
returns uuid
language plpgsql
set search_path = public
as $$
declare
  v_from     public.accounts%rowtype;
  v_to       public.accounts%rowtype;
  -- gen_random_uuid, not uuid_generate_v4: the latter lives in the extensions
  -- schema, which this function's pinned search_path cannot see.
  v_transfer uuid := gen_random_uuid();
begin
  select * into v_from from public.accounts where id = p_from_account;
  select * into v_to   from public.accounts where id = p_to_account;

  if v_from.id is null or v_to.id is null then
    raise exception 'Both accounts must exist';
  end if;
  if v_from.farm_id <> v_to.farm_id then
    raise exception 'Cannot transfer between farms';
  end if;
  if v_from.id = v_to.id then
    raise exception 'Cannot transfer an account to itself';
  end if;
  if p_amount is null or p_amount <= 0 then
    raise exception 'Transfer amount must be positive';
  end if;

  insert into public.owner_cash_entries
    (farm_id, entry_date, amount, direction, entry_type, notes, account_id, transfer_id, created_by)
  values
    (v_from.farm_id, p_date, p_amount, 'out', 'transfer',
     coalesce(p_notes, concat('To ', v_to.name)),   v_from.id, v_transfer, auth.uid()),
    (v_from.farm_id, p_date, p_amount, 'in',  'transfer',
     coalesce(p_notes, concat('From ', v_from.name)), v_to.id, v_transfer, auth.uid());

  return v_transfer;
end $$;

-- ── 6. The cash book knows its accounts ──────────────────────────────────────
--
-- Columns appended, never inserted (create-or-replace cannot renumber):
-- account_id, account_name, account_running_balance. The farm-level
-- running_balance stays — transfers net to zero inside it, which is exactly
-- right: moving money between pockets changes no farm total.

create or replace view public.v_cash_book as
with entries as (
  select oce.id, oce.entry_date, oce.direction, oce.entry_type, oce.amount,
         oce.reference_id, oce.notes, oce.created_by, oce.created_at, oce.farm_id,
         oce.account_id
    from public.owner_cash_entries oce
  union all
  -- Each account's opening balance is the first line of its book.
  select a.id,
         coalesce(a.opening_balance_date, f.go_live_date, '2000-01-01'::date),
         case when a.opening_balance >= 0 then 'in' else 'out' end,
         'opening_cash',
         abs(a.opening_balance),
         null::uuid,
         concat('Opening balance — ', a.name),
         null::uuid,
         '2000-01-01 00:00:00+00'::timestamptz,
         a.farm_id,
         a.id
    from public.accounts a
    join public.farms f on f.id = a.farm_id
   where coalesce(a.opening_balance, 0) <> 0
  union all
  -- Fallback for a farm-level opening cash written by a pre-accounts client
  -- (0027). Attributed to the default account. Zero everywhere today.
  select f.id,
         coalesce(f.opening_cash_date, f.go_live_date, '2000-01-01'::date),
         case when f.opening_cash >= 0 then 'in' else 'out' end,
         'opening_cash',
         abs(f.opening_cash),
         null::uuid,
         'Opening cash balance',
         null::uuid,
         '2000-01-01 00:00:00+00'::timestamptz,
         f.id,
         (select id from public.accounts a where a.farm_id = f.id and a.is_default limit 1)
    from public.farms f
   where coalesce(f.opening_cash, 0) <> 0
)
select
    e.id,
    e.entry_date,
    case e.direction
      when 'in' then
        case e.entry_type
          when 'opening_cash'    then coalesce(e.notes, 'Opening balance')
          when 'transfer'        then concat('Transfer — ', coalesce(e.notes, 'in'))
          when 'owner_capital'   then coalesce(e.notes, 'Owner Capital Added')
          when 'revenue_receipt' then coalesce(e.notes, 'Revenue Received')
          else coalesce(e.notes, 'Cash Receipt')
        end
      else
        case e.entry_type
          when 'transfer'        then concat('Transfer — ', coalesce(e.notes, 'out'))
          when 'owner_drawing'   then coalesce(e.notes, 'Owner Drawing')
          when 'vendor_payment'  then coalesce(e.notes, 'Vendor Payment')
          when 'labour_payment'  then coalesce(e.notes, 'Labour Payment')
          when 'expense_payment' then coalesce(e.notes, 'Expense Payment')
          else coalesce(e.notes, 'Cash Payment')
        end
    end                                                          as particulars,
    case when e.direction = 'in'  then e.amount else 0::numeric end as receipt_amount,
    case when e.direction = 'out' then e.amount else 0::numeric end as payment_amount,
    e.direction,
    e.entry_type,
    e.reference_id,
    e.notes,
    e.created_by,
    e.created_at,
    sum(case when e.direction = 'in' then e.amount else - e.amount end)
      over (partition by e.farm_id order by e.entry_date, e.created_at
            rows unbounded preceding)                            as running_balance,
    e.amount,
    e.farm_id,
    e.account_id,
    a.name                                                       as account_name,
    sum(case when e.direction = 'in' then e.amount else - e.amount end)
      over (partition by e.farm_id, e.account_id
            order by e.entry_date, e.created_at
            rows unbounded preceding)                            as account_running_balance
  from entries e
  left join public.accounts a on a.id = e.account_id
 order by e.entry_date, e.created_at;

alter view public.v_cash_book set (security_invoker = on);

-- ── 7. An account's opening balance is a founding figure ─────────────────────

create or replace function public.guard_founding_figures()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  fid       uuid;
  fld       text;
  old_val   text;
  new_val   text;
begin
  if tg_table_name = 'vendors' then
    fid := new.farm_id;
    if new.opening_balance is distinct from old.opening_balance then
      fld := 'opening_balance';
      old_val := old.opening_balance::text;  new_val := new.opening_balance::text;
    elsif new.opening_balance_date is distinct from old.opening_balance_date then
      fld := 'opening_balance_date';
      old_val := old.opening_balance_date::text; new_val := new.opening_balance_date::text;
    end if;

  elsif tg_table_name = 'buyers' then
    fid := new.farm_id;
    if new.opening_balance is distinct from old.opening_balance then
      fld := 'opening_balance';
      old_val := old.opening_balance::text;  new_val := new.opening_balance::text;
    elsif new.opening_balance_date is distinct from old.opening_balance_date then
      fld := 'opening_balance_date';
      old_val := old.opening_balance_date::text; new_val := new.opening_balance_date::text;
    end if;

  elsif tg_table_name = 'labour_master' then
    fid := new.farm_id;
    if new.opening_balance is distinct from old.opening_balance then
      fld := 'opening_balance';
      old_val := old.opening_balance::text;  new_val := new.opening_balance::text;
    end if;

  elsif tg_table_name = 'crop_cycles' then
    fid := new.farm_id;
    if new.opening_cost is distinct from old.opening_cost then
      fld := 'opening_cost';
      old_val := old.opening_cost::text;  new_val := new.opening_cost::text;
    end if;

  elsif tg_table_name = 'accounts' then
    fid := new.farm_id;
    if new.opening_balance is distinct from old.opening_balance then
      fld := 'opening_balance';
      old_val := old.opening_balance::text;  new_val := new.opening_balance::text;
    elsif new.opening_balance_date is distinct from old.opening_balance_date then
      fld := 'opening_balance_date';
      old_val := old.opening_balance_date::text; new_val := new.opening_balance_date::text;
    end if;

  elsif tg_table_name = 'farms' then
    fid := new.id;
    if new.capex_threshold is distinct from old.capex_threshold then
      fld := 'capex_threshold';
      old_val := old.capex_threshold::text;  new_val := new.capex_threshold::text;
    elsif new.opening_cash is distinct from old.opening_cash then
      fld := 'opening_cash';
      old_val := old.opening_cash::text;  new_val := new.opening_cash::text;
    elsif new.opening_cash_date is distinct from old.opening_cash_date then
      fld := 'opening_cash_date';
      old_val := old.opening_cash_date::text; new_val := new.opening_cash_date::text;
    elsif new.go_live_date is distinct from old.go_live_date then
      fld := 'go_live_date';
      old_val := old.go_live_date::text;  new_val := new.go_live_date::text;
    end if;
  end if;

  if fld is null then
    return new;
  end if;

  if auth.uid() is not null and not public.has_farm_role(fid, 'admin') then
    raise exception
      'Only the farm owner can change %. This figure states where the farm stood when it went live — ask the owner to correct it.', fld
      using errcode = '42501';
  end if;

  insert into public.protected_field_changes
    (farm_id, table_name, record_id, field_name, old_value, new_value, changed_by)
  values
    (fid, tg_table_name, new.id, fld, old_val, new_val, auth.uid());

  return new;
end $$;

drop trigger if exists trg_guard_founding_figures on public.accounts;
create trigger trg_guard_founding_figures
  before update on public.accounts
  for each row execute function public.guard_founding_figures();

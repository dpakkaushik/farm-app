-- 0031 — accounts carry a partner link
--
-- Bank accounts belong to people. The owner's sheet (13 Aug 2026) lists six
-- bank balances, each against a family member already present in the partners
-- master. His call, and it beat the one-lumped-Bank-row alternative proposed
-- to him: "all names in partners in master see if u can use that and extend
-- logic someway" — per-account balances stay reconcilable against real
-- passbooks, and the names join to rows every other feature already uses.
--
-- Nullable by design: the cash account has no partner, and a future account
-- may not either. A joint account points at its PRIMARY holder and carries
-- the second name in the account's display name — one joint row exists today,
-- and a join table for a single row is machinery nobody asked for.
--
-- RLS: accounts already carries the four standard policies from 0028; a new
-- column inherits them. No policy change needed.

alter table public.accounts
  add column if not exists partner_id uuid references public.partners(id);

create index if not exists accounts_partner_id_idx
  on public.accounts(partner_id) where partner_id is not null;

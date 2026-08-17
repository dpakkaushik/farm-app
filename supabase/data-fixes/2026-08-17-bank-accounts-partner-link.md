# 2026-08-17 — six bank accounts entered, linked to the partners master

Executes the plan in [`docs/PENDING-bank-accounts-and-partners.md`](../../docs/PENDING-bank-accounts-and-partners.md)
(figures received from the owner 2026-08-13, balances as at 31.07.26).

## Schema

Migration [`0031_accounts_partner_link.sql`](../migrations/0031_accounts_partner_link.sql):
`accounts.partner_id uuid references partners(id)`, nullable, partial-indexed. Applied to
production the same day.

## Data

The empty `Bank` row (`d0c37f41…`, opening ₹0) was **repurposed** into the main account —
renaming keeps any `owner_cash_entries.account_id` references valid, and avoids a dead
seventh row on the cash card. Five new rows inserted, guarded `where not exists` by name.

| Account (name on DB) | Bank a/c no. | Opening ₹ | partner_id → |
|---|---|---:|---|
| Punjab & Sind — Vipul Nanda *(repurposed)* | 0222100001160 | 22,150 | Vipul Nanda |
| Punjab & Sind — Puneet Nanda | 0222100001161 | 1,317 | Puneet Nanda |
| UP Gramin — Vipul / Puneet (joint) | 242610110000233 | 7,473 | Vipul Nanda *(primary; joint noted in name)* |
| UP Gramin — Naman Nanda | 242610110000340 | 2,867 | Naman Nanda |
| UP Gramin — Puja Nanda | 242610110000341 | 2,614 | Puja Nanda |
| UP Gramin — Jishnu Nanda | 242610110000342 | 2,984 | Jishnu Nanda |

All `type = 'bank'`, `is_default = false`, `opening_balance_date = '2026-08-01'` (the books
open 1 Aug; the sheet's balances are as at 31 Jul close). Account numbers live here, not on
the database — `accounts` has no number column and the names already distinguish every row.

"PUNEESH" on the sheet = **Puneet Nanda** in the master — settled by the owner
("punnet puneesh may be typo"), master spelling canonical.

## Verified after entry

`v_cash_book` synthesizes each account's opening row (0028), so balances flowed with no
frontend change: cash ₹11,979 + bank ₹39,405 = **₹51,384 total**, each account matching the
sheet to the rupee. The Summary hero card lists all seven rows automatically
(`accountBalances.length > 1`).

## Still open

**Sai Kiran Nanda** is an active partner with no account row — the sheet listed none, and
whether he has no account or it simply wasn't listed remains UNASKED. Do not invent a row.

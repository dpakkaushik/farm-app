# Pending — bank opening balances, linked to the partners master

**Status:** data received from the owner 2026-08-13, **not yet entered**. Nothing in this
file is on the database. Deliberately not built in-session: it needs a migration plus UI and
the session had hit a hard cost ceiling.

## The figures — balances as at 31.07.26

From the owner's sheet (column headed *BALANCE UPTO 31.07.26*). **Total ₹39,405.**

| Bank | Account | Amount | Partner (master) |
|---|---|---:|---|
| Punjab & Sind | 0222100001160 | 22,150 | Vipul Nanda — **main account owner** |
| Punjab & Sind | 0222100001161 | 1,317 | Puneet Nanda |
| UP Gramin | 242610110000233 | 7,473 | Vipul + Puneet — **joint** |
| UP Gramin | 242610110000340 | 2,867 | Naman Nanda |
| UP Gramin | 242610110000341 | 2,614 | Puja Nanda |
| UP Gramin | 242610110000342 | 2,984 | Jishnu Nanda |

The app currently holds **one** `Bank` account for Pallia
(`95aa3bcd…` is the *other* farm; Pallia's is `d0c37f41-dcb1-4747-804c-ac5469066a5a`) with
`opening_balance = 0`. Cash in hand is already correct at ₹11,979 dated 2026-08-01.

## Name resolution — settled by the owner

The sheet reads **PUNEESH NANDA**; the partners master holds **Puneet Nanda**. The owner:
*"punnet puneesh may be typo"* — one person. **Use `Puneet Nanda` (the master spelling) as
canonical**, since it is already the row every other feature joins to. Worth him correcting
whichever spelling is wrong at source eventually; it changes nothing structurally.

## Still open

**Sai Kiran Nanda** is an active partner with no account on the sheet. Unasked/unanswered:
does he have no account, or was it simply not listed? Do not invent a row for him.

## Design — the owner's call, and it beat my suggestion

I proposed collapsing all six into one `Bank` account at ₹39,405 to keep things light. The
owner countered: *"all names in partners in master see if u can use that and extend logic
someway."* He is right — the names are already partners, so the link is nearly free and the
per-account balances stay reconcilable against real passbooks.

Plan:
1. Migration: add nullable `partner_id uuid references partners(id)` to `accounts`. Nullable
   because the cash account has no partner, and because a future account may not either.
2. Seed the six accounts above with `type = 'bank'`, `opening_balance` as tabled,
   `opening_balance_date = '2026-08-01'`, `is_default = false`.
3. **The joint account breaks one-partner-per-account.** Do *not* build a join table for a
   single row — point `partner_id` at **Vipul Nanda** (the main owner) and carry the second
   holder in the account name: `UP Gramin — Vipul / Puneet (joint)`. Revisit only if joint
   accounts multiply.
4. Retire or repurpose the existing empty `Bank` account rather than leaving a seventh row
   reading ₹0 on the cash card.
5. Note the UI consequence: `SummaryTab` renders a per-account breakdown whenever
   `accountBalances.length > 1`, so the hero card will grow to seven rows (cash + six banks).
   Check it still reads well on a phone before shipping.

## Consequence once entered

Total balances become **₹51,384** (₹11,979 cash + ₹39,405 bank), up from ₹11,979. That is a
rise in the *reported* position only — no new money, just the bank side finally recorded.

# 2026-09-01 — Two salary payments reverted; Harinder's missing cash line written

**Owner's ask (with two screenshots):** (1) *"i want to revert these top two entries — is this
possible, earlier balances and cash in hand etc wont get disturbed?"* — the 31-Aug cash-book
lines "Salary — Chhote lal wife (2026-08)" ₹12,987 and "Salary — Vijay Pardeep (2026-08)" ₹13.
(2) *"a payment was done to Harinder yesterday but can't see this in cashbook — what is the
reason?"*

## What was found

- Both payments existed in `salary_payments` with linked `owner_cash_entries` rows
  (reference_id → payment id), all against the **Cash in hand** account. Deleting both pairs
  cannot disturb earlier rows: `v_cash_book` computes running balances from the rows, so lines
  before the deleted ones keep their figures and everything after recomputes.
- **Harinder's ₹10,000 payment (31 Aug, cash, "Th ramji") had NO cash entry** — the only such
  orphan in the whole table. Saving a payment is two writes (`salary_payments`, then
  `owner_cash_entries` from `writeCashEntry`); his save was interrupted between the two. That is
  why his khata showed the payment (khata reads `salary_payments`) while the cash book did not
  (it reads `owner_cash_entries`). Advances were swept for the same failure: none affected.

## What was done

Archived first — `go_live_archive` batch **`855d7c5c-0eb8-42e5-a457-d61c2494aa09`** (6th batch:
2 × `salary_payments`, 2 × `owner_cash_entries`) — then:

1. Deleted the two cash entries and the two payment rows.
2. Inserted Harinder's missing cash line exactly as the app would have written it:
   31 Aug, ₹10,000 OUT, `entry_type='salary_payment'`, notes `Salary — Harinder (2026-08)`,
   `reference_id` = his payment id, Cash in hand account.

## Asserted before → after

| Figure | Before | After | Why |
|---|---|---|---|
| Cash rows | 32 | 31 | −2 reverted, +1 Harinder |
| Cash-in-hand net (entries only) | −83,714.98 | −80,714.98 | +13,000 revert − 10,000 Harinder |
| Chhote lal wife `balance_due` | −12,987 | **0** | the payment that made *her* owe the farm is gone |
| Vijay Pardeep `balance_due` | 13,451 | 13,464 | +13 |
| Harinder `balance_due` | −13,989 | −13,989 | a cash line never touches the khata |
| Payments missing cash lines | 1 | **0** | |

## Worth knowing

- The Chhote lal wife payment had flipped her khata to "she owes ₹12,987" — she had no accrual
  to pay against, which is presumably why the owner wanted it reverted. The ₹13 was an obvious
  mis-key. If either payment was real, re-enter it in Manpower → Salary with the right figures.
- The half-write itself (payment saved, cash line lost) is a real app defect: the two inserts
  are not atomic. The right fix is a DB function doing both writes in one transaction, like
  `record_transfer` already does. Not built today — flagged in CLAUDE.md.

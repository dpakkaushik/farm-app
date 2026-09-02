# Salary in the Expenses tab — paid vs pending, month-wise

**Status:** design agreed with the owner 2026-09-02. Not built.
**Sibling:** [`SPEC-bill-wise-vendor-settlement.md`](SPEC-bill-wise-vendor-settlement.md) — the same
complaint for vendors, solved with an allocations table. **Deliberately not repeated here.**
Read *Why this is not the vendor fix* before proposing a table.

> **This file replaced a longer first draft** that proposed a declared per-payment settlement flag,
> snapshot columns and a new DB function. The owner's simplification — *"expense tab should only
> show the paid and pending and a redirect button"* — removed the need for all of it. The old
> design is in git history at `18da60a` if the reasoning is ever wanted; do not resurrect it
> without a new reason.

---

## The complaint

> "why it isnt showing status as paid here why?"

then, decisively:

> "we are showing it in expenses as a amount we need to pay while the user record he may pay
> different amount"

The Expenses tab presents an accrued wage as **a bill to be settled** — a fixed figure, a Pending
pill, a per-row "Pay in Labour → Salary →" button on all seventeen rows. A wage is not a bill.
What changes hands is decided at payment time: less if he took advances, less if old dues are
deducted, less if cash is short. So the tab asserts a payable that does not exist, then calls it
Pending forever because nothing ever matches it.

## What is wrong today

**1. The status can never say Paid.** `v_expense_ledger`'s salary branch hardcodes
`false as is_paid` ([`0014_salary_accrual.sql:156`](../supabase/migrations/0014_salary_accrual.sql)).
And [`LedgerPage.jsx:2362`](../frontend/src/pages/LedgerPage.jsx) tests `key === 'salary'` **before**
`row.is_paid`, so even a true flag would be swallowed by the link branch.

**2. The Paid total hides ₹29,500 of real cash.**
[`LedgerPage.jsx:2727`](../frontend/src/pages/LedgerPage.jsx) sums `salary_payments` only and
ignores `salary_advances`. All seven regular labourers were paid by advance, not by a salary
payment. That money left the cash box, is in the Cash Book, and did reduce their khata
(`v_salary_dues` subtracts advances identically to payments) — it just is not counted here.
Two further defects in the same two lines: `Math.min(total, paidTotal)` **clamps**, hiding
over-settlement rather than showing it; and the figure is **all-time and unfiltered** while the
accrual rows respect the View filter, so any FY or Month view reports a wrong Paid.

**3. Seventeen redirect buttons** where one would do.

## The design

The Expenses tab reports **cost and cash**. Settlement lives in Manpower → Salary. The salary
group shows two figures, a month-wise breakup, and one button.

```
Staff & Regular Salary                              ₹82,079
Wages earned by staff & regular workers
  Paid ₹72,610  ·  Pending ₹9,469

  Aug 2026        ₹78,400     Paid ₹72,610     Pending ₹5,790
  Sep 2026         ₹3,679     Paid      ₹0     Pending ₹3,679

  ┌──────────────────────────────────────────────────────────┐
  │            Open Manpower → Salary  →                     │
  └──────────────────────────────────────────────────────────┘
```

- **Rows are months, not worker-months.** The 17 per-worker rows go away; per-worker detail is
  already in Manpower → Salary (payment history per card, plus the ⤓ staff-balance CSV built
  31 Aug). No Status column anywhere, because no row claims settlement any more.
- **One button at the foot**, replacing all seventeen per-row links. Lands on Manpower → Salary.
  A payment made there changes these figures on next load — no new plumbing, the numbers derive
  from the same tables.

### The arithmetic — all of it

Per worker-month, from `v_salary_accrual`:

```
settled = min(earned, payments that month + advances that month)
pending = earned − settled
```

Then sum per calendar month for the rows, and over the period for the header.

Three things make this correct where the current code is not:

- **Advances count**, net of recoveries (a negative `salary_advances.amount` is money recovered
  *from* the worker — CLAUDE.md "do not undo" item 7). This is the ₹29,500.
- **The clamp moves to the row, where it means something.** A worker who over-drew (Deena took
  ₹9,000 against ₹4,700 earned) contributes zero pending, not negative — and his surplus cannot
  offset another man's shortfall, because you cannot pay Vikram with Deena's advance.
- **Period-filtered with the rows**, so Paid and Pending describe the chosen FY or month.

`paid + pending === earned` by construction, in every period view.

### Matching rules, decided

- **Payments** match on `salary_payments.payment_month` — `date NOT NULL`, populated on every
  live row. The link already exists; it was simply never read.
- **Advances** match on the calendar month of `advance_date`. An unrecovered advance from an
  earlier month does **not** offset this month's wage. Note the Labour card's own `advTotal` at
  [`Labour.jsx:820`](../frontend/src/pages/Labour.jsx) *does* fold in carried-forward advances —
  that is a per-worker khata view and may legitimately differ; do not "align" them without
  thinking, but never let the Ledger use the carried-forward figure.

### On Ram Bachan, who will read ₹1,790 pending

He earned ₹11,000 and was handed ₹9,210 — exactly his wage minus his ₹1,790 old dues. His month
is closed in reality but will show ₹1,790 pending here, and **that is right, not a flaw.** The
deduction was never recorded anywhere: no recovery row, no note, nothing. The figure is a prompt
to record something genuinely missing. Recording it as a recovery in Manpower — the mechanic
built 20 Aug — drops it to zero *and* correctly reduces his debt.

This is why no declared-settlement flag is needed. A shortfall is either explained by advances
(arithmetic) or it is a real gap in the records.

## Cost

**No migration, no schema change, no new table, no DB function.** Every figure comes from tables
already loaded in the store. `salary_payments.payment_month` already carries the month link.

Where the logic lives: pure and tested in `frontend/src/lib/salaryLedger.js`, in the shape of
[`billSettlement.js`](../frontend/src/lib/billSettlement.js) and
[`labourGroups.js`](../frontend/src/lib/labourGroups.js). `LedgerPage.jsx` consumes it; the
`salaryPaidTotal` prop, the `Math.min` clamp and the per-row salary link branch are deleted.

Optionally `v_expense_ledger`'s `false as is_paid` can stay exactly as it is — nothing reads it
for salary any more. Leaving the view untouched is preferred: fewer moving parts, and the comment
on that line remains true.

## Invariants to pin with tests

1. `paid + pending === earned`, per month row and for the header, in every period view.
2. A worker whose advances exceed his month's wage contributes zero pending, never negative.
3. One worker's surplus advance never reduces another worker's pending.
4. A recovery (negative advance) increases pending again — money given back is owed again.
5. Period filtering moves the rows and both figures together; no all-time leak.
6. With today's live data: Aug ₹78,400 → paid ₹72,610 / pending ₹5,790; Sep ₹3,679 → pending
   ₹3,679; header ₹82,079 → paid ₹72,610 / pending ₹9,469.

## Why this is not the vendor fix

Yesterday's vendor work needed `vendor_payment_allocations` because a payment had to choose
**among many open bills** — ₹50,000 against one ₹50,000 bill, two ₹20,000s and a ₹10,000. A bill
is a document with a fixed amount that is either cleared or not.

A worker's month is not a document. The wage is computed from attendance, money moves
continuously, and the authority on what is owed is the running khata — which `v_salary_dues`
already computes correctly. So the Expenses tab reports cost and cash and points at the khata,
rather than pretending each month is an invoice.

## Deliberately not in scope

- **`record_salary_payment()` atomicity.** `addSalaryPayment` still writes the payment row and the
  cash entry as two non-atomic writes — the defect that lost Harinder's ₹10,000 cash line on
  31 Aug (fixed by hand 1 Sep). It remains an **open defect** and should still be built the way
  `record_vendor_payment` was in [`0035`](../supabase/migrations/0035_vendor_payment_allocations.sql).
  It is unbundled from this work only because this change adds no new write, so it does not make
  the hole likelier. Advances and expense payments share the exposure.
- **No write-off**, unchanged. A worker who absconds owing money can only be cleared by editing
  his opening balance in Admin.
- **No change to `v_salary_dues` or the khata.** Its arithmetic is already right.

## Open questions for the owner

1. **Satya Pal Rajvanshi −₹1,32,900 and Ramj −₹28,700** — two workers carrying large opening
   debts, accruing nothing (no attendance, no salary rate), absent from the 21 Aug record.
   ₹1.6L of the ₹2.3L the khata says workers owe. Deliberate, or a data-entry problem?
2. **Deepak's salary is still ₹0** on both `monthly_salary` and `daily_base_rate`, so he accrues
   nothing and his ₹8,933 can never work itself off against wages. Flagged 20 Aug, still open.

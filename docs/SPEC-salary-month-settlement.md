# Salary month settlement — spec

**Status:** draft, awaiting owner review. Nothing built.
**Date:** 2026-09-02
**Sibling:** [`SPEC-bill-wise-vendor-settlement.md`](SPEC-bill-wise-vendor-settlement.md) — the same
complaint for vendors, solved differently and deliberately so. Read the *Why not allocations*
section below before proposing a table here.

---

## The owner's complaint, in his words

> "why it isnt showing status as paid here why?"

then, after we dug:

> "we are showing it in expenses as a amount we need to pay while the user record he may pay
> different amount"

That second sentence is the whole spec. The Expenses tab presents an accrued wage as **a bill to
be settled** — a fixed figure, a Pending pill, a per-row "Pay in Labour → Salary →" button. But a
wage is not a bill. What actually changes hands is decided at payment time: less if he took
advances, less if old dues are being deducted, less if cash is short that day. So the tab asserts
a payable that does not exist, then calls it Pending forever because nothing ever matches it.

## What is wrong today, with evidence

Three separate faults, all visible on one screen (Ledger → Money Out → Expenses → Staff & Regular
Salary, "Standing Crops · All"):

**1. The status can never say Paid.** `v_expense_ledger`'s salary branch hardcodes
`false as is_paid` ([`0014_salary_accrual.sql:156`](../supabase/migrations/0014_salary_accrual.sql)),
with the comment *"settled against the khata, not row by row"*. And
[`LedgerPage.jsx:2362`](../frontend/src/pages/LedgerPage.jsx) tests `key === 'salary'` **before**
`row.is_paid`, so even a true flag would be swallowed by the link branch.

**2. The Paid total hides ₹29,500 of real cash.**
[`LedgerPage.jsx:2727`](../frontend/src/pages/LedgerPage.jsx) sums `salary_payments` only and
ignores `salary_advances` entirely. Every one of the seven regular labourers was paid by advance,
not by a salary payment. That money left the cash box, is in the Cash Book, and did reduce their
khata (`v_salary_dues` subtracts advances identically to payments) — it just is not counted here.
Two further defects in the same two lines: `Math.min(total, paidTotal)` **clamps**, so
over-settlement is silently hidden rather than shown; and the paid figure is **all-time and
unfiltered** while the accrual rows respect the View filter, so any FY or Month view reports a
wrong Paid.

**3. The amount is hand-typed.** [`Labour.jsx:946`](../frontend/src/pages/Labour.jsx) calls
`openPayModal(w, 'salary')` with **no prefill** — the field opens empty and someone computes the
figure mentally. On 31 Aug this produced two different rules on one screen: Harinder was paid his
full ₹10,000 with his ₹14,346 old debt untouched, while Ram Bachan was paid ₹9,210 — exactly
₹11,000 *minus* his ₹1,790 old debt.

### Live figures at the time of writing

| | |
|---|---|
| Wages accrued (17 worker-months) | ₹82,079 |
| Recorded as `salary_payments` | ₹49,710 (5 rows, all 31 Aug, all staff) |
| Paid via `salary_advances`, net of recoveries | ₹29,500 (7 regular labourers) |
| Screen says pending | **₹32,369** |
| Actually not handed over | **₹7,679** |

## The model

Two kinds of difference between the wage and the cash, and they must be handled differently:

| Difference | Nature | Handled by |
|---|---|---|
| He took advances this month | mechanical, no judgment | **arithmetic** |
| Old dues deducted / cash short | a decision someone made | **a recorded declaration** |

So: **advances are always netted arithmetically; the flag carries only the judgment.** This is
what makes a differing paid amount safe — the difference is either *explained* by advances or
*declared* closed, and never guessed at.

### Definitions

For a worker-month row in `v_salary_accrual`:

```
net_payable = earned − advances taken that month − payments already made that month
```

`advances taken that month` is net of recoveries (a negative `salary_advances.amount` is money
recovered *from* the worker — see CLAUDE.md "do not undo" item 7). Clamped at zero: a worker who
over-drew has a net payable of nil, not a negative.

**Decided: advances are matched to the month they were taken in, by `advance_date`, and an
unrecovered advance from an earlier month does NOT offset this month's wage.** Note that the
Labour card's own `advTotal` at [`Labour.jsx:820`](../frontend/src/pages/Labour.jsx) *does* fold in
carried-forward unrecovered advances, so the card and this rule will disagree unless the modal's
prefill uses the month-scoped figure. Use the month-scoped one in both places — the Ledger status
and the Pay Salary prefill must derive from one definition or they will drift apart, which is the
class of bug this whole spec exists to remove.

### Row status rules

Evaluated in this order:

| Condition | Status shown | Link? |
|---|---|---|
| A payment for that worker-month with `status` settled | **Paid** | no |
| A payment for that worker-month with `status` part | **Part-paid · ₹X still owed** | yes |
| No payment, `net_payable ≤ 0` | **Paid** | no |
| No payment, `net_payable > 0` | **Pending · ₹X** | **yes** |

The "Pay in Labour → Salary →" per-row button is **deleted**. It survives nowhere; see the group
footer below.

### Group figures

The group header keeps its two figures, both now correct:

- **Amount** — wages accrued in the period. Unchanged.
- **Paid** — `Amount − Pending`, where Pending is the sum of the per-row pending/shortfall
  figures above. Ties by construction, so the two can never disagree.

**Paid here means "wage settled", not "cash handed over", and the difference is deliberate.**
Ram Bachan's row counts the full ₹11,000 as paid though only ₹9,210 left the box — the other
₹1,790 was settled by set-off against his old dues, so the wage expense is discharged. Cash
movement is the Cash Book's job and it already records this correctly. Do not "correct" this to
sum `amount_paid`: that would reintroduce fault 2 in a new form, and Paid would stop tying to
Amount − Pending.

The `Math.min` clamp is **removed** and the figure is **period-filtered** with the rows, fixing
fault 2 in full. Under a Month or FY view, Paid and Pending now describe that period only.

### One link, at the foot

Per the owner: *"just show how much is pending and how much is paid and a tab below that takes
user to salary tab where he can check the history or extract reports."*

One full-width action at the **bottom of the expanded salary group** — "Open Labour → Salary" —
replacing the seventeen per-row buttons. It lands on the Salary tab, which already holds the
per-worker payment and advance history and the ⤓ staff-balance CSV built on 31 Aug. Nothing new
is needed there.

### Pay Salary modal

The amount **stays editable** — this reverses the "prefilled uneditable" instruction of earlier
the same day, at the owner's own finding that no single correct figure exists to lock to. Do not
re-lock it.

What changes: the modal shows the breakup it already computes on the card, and prefills from it.

```
Ram Bachan · Aug 2026
  Wage earned          ₹11,000
  Advances taken      −     ₹0
  Old dues            − ₹1,790
  ────────────────────────────
  Net payable           ₹9,210
  Paying now          [ 9,210 ]   ← editable
```

On save:

- The calculation is written to the columns that **already exist and are never populated** —
  `days_present`, `gross_salary`, `opening_balance`, `advances_total`, `net_payable`,
  `closing_balance`. Every payment then carries a permanent record of *why* it was that amount
  instead of a bare number.
- **Amount ≥ net payable** → status settled, silently. No question asked. Covers the normal case
  and the Ram Bachan case alike.
- **Amount < net payable** → one question, once: *"₹1,790 less than payable — is August closed,
  or still owed?"* → **Closed** (settled) or **₹1,790 still owed** (part).

Old dues appear as a line only when the worker owes; the deduction defaults to the full amount
**capped at this month's wage**, and is editable to any figure including zero. Harinder's
₹14,346 must never reduce his ₹10,714 wage to nil — a man paid nothing walks off the farm.

## Schema

Verified on the live DB: `salary_payments` already carries `days_present`, `gross_salary`,
`opening_balance`, `advances_total`, `net_payable`, `amount_paid`, `closing_balance` and
`status text NOT NULL`. All six numeric snapshot columns read **0** on all five live rows. The
`status` column already reads **`'paid'`** on all five — written, never read back.

**So August needs no data fix.** The moment the tab reads that column, the five staff payments
read Paid correctly, Ram Bachan included.

**One thing to check before assuming no migration is needed:** the check constraint on
`salary_payments.status`. If it does not admit a part-payment value, one narrow migration widens
it. Treat `'paid'` as settled so existing rows carry over free.

## Atomicity — fold in the outstanding defect

CLAUDE.md records a known defect: `addSalaryPayment` writes the payment row and the cash entry as
**two non-atomic writes**, and an interrupted save on 31 Aug left Harinder's ₹10,000 payment with
no cash line at all (fixed by hand on 1 Sep). Vendors were retired by
[`0035`](../supabase/migrations/0035_vendor_payment_allocations.sql)'s `record_vendor_payment()`.

This work adds a third write (the snapshot columns) to that same two-write pattern, which would
make the hole **likelier, not rarer**. So `record_salary_payment()` — payment row, snapshot,
cash line, one transaction — ships with this, mirroring 0035's shape. Not optional.

## Why not allocations

The vendor fix needed `vendor_payment_allocations` because a payment had to choose **among many
open bills** — ₹50,000 against one ₹50,000 bill, two ₹20,000s and a ₹10,000. Here there is
exactly one thing being settled: one worker, one month. There is nothing to allocate among; the
only unknown is *done or not done*. A table for a boolean is over-engineering, and the boolean
column already exists.

## Invariants to pin with tests

Pure logic goes in `lib/salarySettlement.js`, tested with vitest like
[`billSettlement.js`](../frontend/src/lib/billSettlement.js):

1. `paid + pending === amount` for every group, in every period view.
2. A worker whose advances exceed his month's wage reads Paid, never negative-pending.
3. A settled payment of any amount reads Paid — including one below net payable.
4. A part payment reads its declared shortfall, not the arithmetic difference.
5. Recoveries (negative advances) reduce the advance offset, so a worker who gave money back
   still shows the wage as owed.
6. Period-filtering the rows and the paid figure move together — no all-time leak.

## What this deliberately does not do

- **No write-off.** Unchanged from CLAUDE.md: a worker who absconds owing money can only be
  cleared by editing his opening balance in Admin.
- **No change to `v_salary_dues` or the khata.** The balance arithmetic is already correct and
  is the authority on what is owed. This spec changes only what the *Expenses tab* reports.
- **No per-month closing of a worker's account.** The status says whether that month's wage was
  handed over, not that the man is square. Those are different questions and the khata answers
  the second.
- **The status is a human declaration** and can therefore be wrong. Accepted: the khata remains
  the arithmetic authority, and a settled month on a worker who still owes is explained by the
  old-dues deduction, exactly as it should be.

## Open questions for the owner

1. **Satya Pal Rajvanshi −₹1,32,900 and Ramj −₹28,700** — two workers carrying large opening
   debts, accruing nothing (no attendance, no salary rate), not present in the 21 Aug record.
   ₹1.6L of the ₹2.3L the khata says workers owe. Deliberate entries, or a data-entry problem?
2. **Deepak's salary is still ₹0** on both `monthly_salary` and `daily_base_rate`, so he accrues
   nothing and his ₹8,933 can never work itself off. Flagged since 20 Aug, still open.

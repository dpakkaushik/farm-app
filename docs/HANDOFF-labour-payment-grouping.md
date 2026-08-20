# Handoff — one job, one payment: grouping labour in the Ledger

**Written:** 2026-08-20 · **Status: SHIPPED 2026-08-20.** The plan below was built as
written, bar the three deviations recorded here. Kept as the reasoning behind the code.

## What shipped, and where it differs from the plan

| Plan | Shipped |
|---|---|
| 1. `lib/labourGroups.js`, pure + tested | ✅ `groupLabourRows`, `jobSummary`, `wholeShares`, `groupAnchorId`, `contractUnit`, `shortDate` — 21 specs |
| 2. `loadLedgerData` fetches labour logs | ❌ **not needed** — see below |
| 3. `ExpensesTab` renders the grouped line | ✅ with a `LabourLines` sibling to `BillLines` |
| 4. `markLabourGroupPaid` | ✅ replaces `markLabourPaid`, which is deleted |
| 5. Payment-method picker | ✅ `PayExpenseModal`, covering farm expenses too |

**Deviation 1 — step 2 was unnecessary.** The claim that "`labour_logs` is fetched only by
`loadAll`, so the Ledger page cannot see them" does not hold: `loadAll()` runs app-wide on
login from [`App.jsx:79`](../frontend/src/App.jsx#L79), so the logs are already in the store
when the Ledger mounts — it simply never *read* them. The Ledger now reads `labourLogs` from
the store; no second query for the same rows. (The `accounts` bug this was compared to was
genuinely different: `loadAll` did not fetch accounts at all.)

**Deviation 2 — the open question is answered with option 1.** `reference_id` points at the
group's anchor log, `groupAnchorId(ids)` = the lexicographically first id, stable whatever
order the rows arrive in. No unpay path exists today; when one is built it must resolve the
group through the same function. Option 2 (a synthetic md5 id) was rejected: it would point
the cash entry at a row no table holds.

**Deviation 3 — the picker covers farm expenses as well as labour.** `addExpensePayment`
already accepted `payment_mode` and routed the account by it; the Ledger just never passed
one. Same one-line hole, closed in the same modal.

**Smaller finding 1 is fixed both places.** The quantity now appears only on the grouped line
(`LabourLines` deliberately omits it), and the Manpower Work Logged list prefixes a part with
*"share of"* when `contract_qty × rate` does not equal that row's own payment.
**Smaller finding 2 is fixed**: the paid pill reads `Paid 19 Aug · Cash`.

**Left alone, deliberately:** the seven `owner_cash_entries` already written for the 10 Aug
job on 19 Aug. They are historic and predate the fix; consolidating them means unpaying and
re-paying live data, which is the owner's call, not a refactor's. New payments write one row.
The Excel **Expenses** sheet still lists every plot line — it is the itemised ledger, and the
**Cash Book** sheet is the one that reports what moved.

---

## What the owner asked

> *"see outside labour there was a single entry for that 10 aug amount 6520 and the amount got
> splitted in because if the plots that is good to see plot wise issues we also need that but as
> far as payment is concerned this is a single payment and showing it as a breakup in ledger will
> make it confusing and also make the process cumbersome also the process of payment user just
> click pay and it get paid neither ask for payment method etc. is it right ?"*

Then, on being shown the plan:

> *"yeah should also show the details not only the date"*

Two separate complaints. Both are correct.

1. **One payment is recorded as seven.** The cash book should show what actually left the box.
2. **The Pay button never asks how the money moved.** Everything is silently booked as cash.

And the refinement: the single grouped line must **describe the job**, not just carry a date.

---

## What was verified on the live database

The ₹6,520 is real, and the split is arithmetically right. One spraying job on **10 Aug 2026**,
163 tanks at ₹40/tank = **₹6,520 exactly**, spread across seven plots:

| Plot | Amount |
|---|---|
| Plot B | ₹1,156.77 |
| Plot E1 | ₹1,156.77 |
| Plot D | ₹1,051.61 |
| Plot C | ₹1,051.61 |
| Plot E2 | ₹1,051.61 |
| Plot L | ₹736.13 |
| Plot P | ₹315.48 |
| **Total** | **₹6,519.98** |

All seven are `labour_logs` rows: `labour_type = 'contractual'`, `labour_master_id = null`,
`work_type = 'Spray / Pesticide'`, `contract_type = 'tank_wise'`, `activity_date = 2026-08-10`,
`entry_date = 2026-08-19`. All are `is_paid = true`, `paid_date = 2026-08-19`, `paid_via = 'cash'`.

`owner_cash_entries` holds **seven separate `labour_payment` rows**, every one dated 19 Aug,
every one against the same account, every one carrying the *identical* note
`"Labour — Contractual (Spray / Pesticide)"`. Nothing distinguishes them. Reading the cash book,
there is no way to tell this was a single ₹6,520 handover — and the owner had to press Pay
seven times to get there.

---

## Rulings — do not relitigate these

1. **The per-plot split STAYS.** It is the only route to per-plot and per-crop cost, and the
   owner said explicitly it is good to see. This work changes **only how the payment is
   presented and recorded**, never how cost is attributed. The seven `labour_logs` rows survive
   untouched.
2. **The accrual/settlement date split is correct as built.** Labour accrues on the work date
   (10 Aug) and the cash leaves on the settlement date (19 Aug). That is deliberate — see the
   comment above `markLabourPaid` in [`store/index.js`](../frontend/src/store/index.js#L1156).

---

## The code, as it stands

| Fact | Where |
|---|---|
| Settles exactly **one** row per call; hardcodes `paid_via: 'cash'` and `payment_mode: 'cash'` | [`store/index.js:1158`](../frontend/src/store/index.js#L1158) |
| The Pay button — a bare `confirm()` that states "in cash today", then one `markLabourPaid` | [`LedgerPage.jsx:2651`](../frontend/src/pages/LedgerPage.jsx#L2651) |
| Renders the row and the Pay button | [`LedgerPage.jsx:1896`](../frontend/src/pages/LedgerPage.jsx#L1896) |
| The expenses table, its `openRows`/`toggleRow` expand state | [`LedgerPage.jsx:1755`](../frontend/src/pages/LedgerPage.jsx#L1755) |
| `Particulars` (chevron cell) and `BillLines` (expanded detail) — the pattern to reuse | [`LedgerPage.jsx:987`](../frontend/src/pages/LedgerPage.jsx#L987) |

**Two facts that shape the design:**

- **The grouping key already exists.** In `v_expense_ledger`, the labour branch builds
  `description` as `concat('Labour — ', labour_name, ' (', work_type, ')')`. All seven rows
  therefore share an identical `entry_date` **and** `description`. Collapsing on those two plus
  `is_paid` yields exactly one line — **no migration needed**.
- **The detail the owner wants is not reachable yet.** `v_expense_ledger` has **no plot column**,
  so a breakup built from ledger rows alone would be seven identical labels with different
  amounts. Plot names live on `labour_logs`, which is fetched **only by `loadAll`**
  ([`store/index.js:615`](../frontend/src/store/index.js#L615)) and **not** by `loadLedgerData`.
  So the Ledger page cannot see them today. This is the same shape as the `accounts` bug fixed
  on 17 Aug, where `accountFor()` returned null for anyone who had not opened the Ledger first.

---

## The build

**1. `frontend/src/lib/labourGroups.js` — new, pure, tested.**
Collapse `expense_type === 'labour'` rows sharing `(entry_date, description, is_paid)` into one
row: `amount` = sum, `items` = the underlying logs with plot names, `groupIds` = the log ids.
Non-labour rows pass through untouched. Also derive the summary line the owner asked for —
`"7 plots · 163 tanks @ ₹40"` — from the logs. Vitest specs alongside, matching
`lib/__tests__/labourMonth.test.js` in style.

> **Watch the rounding.** The parts are ₹1,156.77 and friends; the group must display ₹6,520 and
> the breakup must visibly add to it. Sum the raw values, round once at the end.

**2. `loadLedgerData` fetches labour logs with plot names.**
Otherwise the breakup has nothing to show. Keep it light — id, activity_date, plot name,
total_payment, work_type, contract_type, contract_qty, base_rate.

**3. `ExpensesTab` renders the grouped line.**
One row reading ₹6,520 with the job described, the per-plot breakup behind the existing chevron.
Reuse `Particulars`; `BillLines` is inventory-shaped, so a small `LabourLines` sibling is needed.

**4. `markLabourGroupPaid` — new store action.**
Flags every log in the group paid in one `.in('id', ids)` update and writes **one** cash entry
for the total. Carries the payment method.

**5. The payment-method picker.**
Replace the bare `confirm()`. Per the owner's standing steer — *"we are going too accounts heavy
… this is taking a toll on development time and user friendliness"* — keep it light: **cash as
the default** (the common case), a small cash/bank toggle, remember the last choice. One extra
tap only when it is not cash. This matters more now than it did last week: the six bank accounts
went live 17 Aug, and today **every labour payment silently drains the cash box** regardless of
how the money actually moved.

> This also closes a flag standing in CLAUDE.md: *"payment-mode pickers disagree across
> `Labour.jsx`, `Expenses.jsx`, `livestock/ui.jsx`. The owner has not ruled."* He has now ruled,
> at least for labour.

---

## The one open question

Cash entries key back to a single log through `reference_id`, and `removeCashEntriesFor(id)`
([`store/index.js:1145`](../frontend/src/store/index.js#L1145)) deletes by that reference. A
single cash entry covering seven logs needs a deliberate answer, or an unpay reverses one
seventh of the payment and leaves the books wrong.

Decide before writing the action. Options, roughly in order of preference:

1. Point `reference_id` at the first log id and have any reversal path resolve the whole group
   the same way the payment did (same grouping function — one source of truth).
2. Give the group a stable synthetic id derived from `(date, description)`, the way
   `v_expense_ledger` already does for salary rows via `md5(...)::uuid`.
3. Keep seven `owner_cash_entries` rows but display them grouped. **Rejected** — it leaves the
   cash book still claiming seven payments, which is the actual complaint.

---

## Two smaller findings, neither urgent

- **`contract_qty` is not split.** All seven rows store `163`, so a single row reads
  *"163 Tanks @ ₹40/Tank"* beside a ₹1,156.77 payment — 163 × 40 is ₹6,520, the whole job. Only
  the money was pro-rated. This contradiction is visible in the Work Logged list on the
  Attendance tab (shipped 19 Aug, commit `acf8829`). Either split the quantity too, or show the
  quantity only on the grouped line, never on a part.
- **`paid_via` is written but never read back into any UI**, so even once a method is captured
  there is nowhere showing it. Worth surfacing on the paid pill.

---

## Cost note

The session that produced this reached **$72** before stopping, largely accumulated context.
This document exists so the work can restart cheaply — everything needed is above, and no
re-investigation of the database or the call sites should be necessary.

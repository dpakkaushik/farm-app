# Decision — FY reporting and pre-app opening costs

**Date:** 2026-08-13 · **Status:** settled by the owner · **Supersedes:** the "extend the
expense ledger + P&L to a full FY report" plan in the previous handoff.

This file exists because two of these questions have already been answered twice, in
opposite directions. Read it before reopening any of them.

---

## The question that started it

The ledger runs April–March, so April–July sits inside FY 2026-27. The owner supplied his
sheet *EXPENSES DETAILS 1.04.26 TO 31.07.26* precisely so this financial year would be
complete. But the Ledger's Money Out and P&L showed ₹17,293 for the year, against ₹13.5 L
of real spend. He raised it, and he was right.

## What was verified first (read-only, before any change)

| Check | Result |
|---|---|
| Does the P&L headline read only `v_expense_ledger`? | **Yes.** [`LedgerPage.jsx:2206`](../frontend/src/pages/LedgerPage.jsx#L2206) |
| FY 2026-27 expense ledger | **₹17,293** over 11 rows — 10 salary accruals (₹15,293) + ₹2,000 Sepre machine |
| `farm_expenses`, `salary_payments` | **both empty tables** |
| Does `v_crop_pnl.total_cost` include openings? | **Yes** — 0024 folded them in |
| So what did the P&L tab show? | headline **₹17,293** above a crop table listing **₹4,72,834**. A ₹4,55,541 self-contradiction on one screen |
| Can openings reach `v_expense_ledger` by any path? | **No.** It draws only from `farm_expenses`, `labour_logs`, `v_salary_accrual`, `inventory_purchases`, `v_capital_purchases` |
| FY selector default | `currentFY()` → FY 2026-27. This *is* the screen he opens on |
| Is ₹1,69,166 farm-staff salary anywhere? | **Nowhere.** No row in that range in any table |
| Cane's FY, by the app's own logic | all 7 cycles sown 15 Oct 25 / 15 Jan 26 / 15 Feb 26 → **100% in FY 2025-26** |
| Paddy | 8 cycles, 15 Jun / 16 Jul 26 → all in FY 2026-27, ₹4,72,834 (matches his stated ₹4,72,833) |

A correction to the earlier handoff: it claimed the P&L understated by ₹13,53,366. The
true FY 2026-27 shortfall was ₹4,55,541 against its own crop table, with a further
₹8,80,532 of cane outside the year entirely. Different number, different fix.

## Ruling 1 — cane stays in FY 2025-26. Cost follows the crop cycle.

His cane block is headed 01.11.25–31.07.26, straddling the FY boundary. Asked for an
April-onward split, he said it would be too difficult to produce, and asked for a
recommendation. **No split.** A cycle's cost reports against the FY it was sown in.

Why this is defensible rather than merely convenient:
- It is what per-cycle costing already implies, and his own words — *"we are considering
  crop expense since beginning of crop cycle"* — state the same rule.
- `crop_cycle_opening_costs` **has no date column**; its only date is the cycle's
  `sow_date`, which `v_crop_cost_lines` borrows. There is nowhere to *store* a split
  without new schema. Not worth it.
- It needs nothing from the owner and is already how the app behaves.

**Consequence, accepted:** cane's ₹8,80,532 reports against FY 2025-26, paddy's ₹4,72,834
against 2026-27. Do not "fix" this later without re-reading this file.

## Ruling 2 — the ₹1,69,166 farm-staff salary gets NO entry. Third and final answer.

Previously ruled "no entry", then reversed on the FY argument, now settled back — but this
time for a stated reason instead of by accident:

**The app's labour frame begins 1 August, with attendance.** Salary is derived from
attendance rows, and the first is 1 Aug. Pre-August salary is outside that frame, and it is
already inside the ₹11,979 opening cash balance — that is *why* cash is that figure. It is
not missing; it is accounted for as cash already spent.

This is the owner's own framing: *"we have the opening balance from Aug 1 and the
attendance from there."* Crop cost is scoped per **cycle** (which legitimately predates the
app); salary is scoped per **attendance month** (which does not). Two different frames, and
that difference is the answer — not an inconsistency to repair.

**Do not add a carrier for this figure.** If a filing-grade FY total is ever needed, the
owner's sheet is the source, not the app.

## Ruling 3 — scope. What the app guarantees.

The owner's steer, verbatim: *"right now we are going too accounts heavy and this is taking
a toll on development time and user friendliness."*

So the goal is **not** to reproduce an accountant's FY P&L. The app guarantees that **its
own numbers never contradict each other**. The FY-complete-ledger ambition is dropped; it
was what made this accounts-heavy. Operational work (bill dates, data entry quality) comes
before further accounting depth.

## What shipped

One file, [`frontend/src/pages/LedgerPage.jsx`](../frontend/src/pages/LedgerPage.jsx). No
migration, no schema change, no new owner data entry.

- `openingCostFY` summed from `cropPnlFY` — **the same rows the crop tables render**, so
  headline and breakdown reconcile by construction rather than by coincidence.
- `opening_cost` only, never `total_cost`: a cycle's input/labour cost is already in the
  expense ledger as the purchase that supplied it. Adding the whole figure would
  double-count.
- `totalExpenses` = `expenseTxnsFY` + `openingCostFY`, applied to every consumer at once —
  Summary cards, P&L headline, Excel export — so the fix cannot just relocate the
  disagreement.
- Labelled everywhere it appears: Summary card sub-line, a "of which … spent before the
  app" line under the P&L headline, and a **non-category** card in Money Out → Expenses.
  That last one is deliberately not a normal group card: openings have no "paid" side, and
  rendering one would invent a payable that does not exist.
- The monthly chart and Cash Book stay transactions-only — openings are not money moving in
  a month. The Summary footnote now says so.

FY 2026-27 after the change: **₹4,90,127 out** = ₹17,293 recorded + ₹4,72,834 opening,
against a crop table summing to exactly ₹4,72,834.

Verified: `npm run build` clean, `npm test` 14/14.

## Flagged, not fixed

`Dashboard.jsx:258` sums `crop_cycles.opening_cost` — the **lump** column — while the
Ledger reads `v_crop_pnl.opening_cost`, where 0024 made the itemised breakup supersede the
lump. Today both equal ₹13,53,366 and no cycle has a zero lump beside an itemised breakup,
so nothing is wrong on screen. But edit a breakup without touching the lump and the two
screens drift. Worth a follow-up; not urgent, and not worth doing while the priority is
operational work.

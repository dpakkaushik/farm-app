# Go-Live Conversion — design

**Date:** 2026-08-11 · **Status:** approved by owner's directive ("treat Pallia like a fresh
mid-year signup — opening balances only, actuals from August 1st, nothing left open")

## The problem

A SaaS farm signs up mid-financial-year. It cannot re-enter months of history; it needs to
state *positions* — cash in hand, who owes whom, stock on the shelf, what the standing crop
has already cost — and record transactions only from a chosen date.

The app already models all of this (built across migrations 0025–0028): `farms.go_live_date`,
`accounts.opening_balance`, `vendors/buyers/labour_master.opening_balance`,
`crop_cycles.opening_cost`, OPENING-STOCK purchase rows, and opening count logs for trees and
livestock. A genuinely fresh farm can already board this way through the SetupChecklist.

What does **not** exist is the converse: a farm that *has* transaction history (Pallia — the
data was backfilled from paper) and wants to re-baseline as if it had just signed up.
`go_live_date` is decorative — nothing filters on it, and nothing derives opening figures
from history.

## Decision: derive-then-purge, not filter-everywhere

Two possible architectures:

1. **Filter everywhere** — teach every computation to cut at `go_live_date`. Rejected: the
   balance logic is duplicated across ~20 reducers in two layers (SQL views + JS), several
   pairs already drift; adding a cutover to each is permanent complexity and permanent risk.
2. **Derive-then-purge** — compute every position as of the cutover from the existing rows,
   write them into the opening slots that already exist, archive and delete the settled
   pre-cutover rows. After conversion the farm is indistinguishable from a fresh mid-year
   signup, which the app already handles. **Chosen.**

## The one rule: settled history folds, open items survive

A pre-cutover row is deleted only if it is **fully settled** before the cutover. Open items
(an unpaid sale, an unpaid contractor log, an unsold residual) survive with their original
dates, because the row itself is the only carrier of that due. Where a *khata slot* exists
(vendor, buyer, labour, account), settled-and-open history both fold into it, because
settlement there is party-level, not row-level.

Per domain, cutover date **D**:

| Domain | Fold target | Deleted | Survives |
|---|---|---|---|
| Cash/bank | `accounts.opening_balance` += signed Σ pre-D `owner_cash_entries` per account | all pre-D cash entries | — |
| Vendors | `vendors.opening_balance` += pre-D bill headers (minus capital lines) + pre-D unbilled purchases − pre-D payments | pre-D bills, purchases, vendor_payments | capital masters (bill_id nulled) keep feeding `unbilled_capital` |
| Buyers | nothing (settlement is row-level) | pre-D sales **paid before D** (+ their cash already folded) | unpaid / post-D-paid sales, `buyers.opening_balance` untouched |
| Labour (perm/regular) | `labour_master.opening_balance` += pre-D accrual + contract pay − advances − payments (exact `v_salary_dues` arithmetic) | pre-D attendance, master-linked labour_logs, advances, salary_payments | — |
| Outside labour | — | pre-D **paid** logs | pre-D **unpaid** logs (the due) |
| Stock | OPENING-STOCK purchase per item = qty at D @ WAC, dated FY-boundary (31 Mar) per existing convention; negative qty → `stock_correction` issue | pre-D purchases & issues | — |
| Standing crops | `crop_cycles.opening_cost` += pre-D issues + pre-D labour_logs **that are being deleted** | (the rows above) | the cycle rows |
| Closed crops | — | cycles closed pre-D with no surviving children (+ their activity logs) | cycles with open residuals or post-D rows (pre-D costs still fold into their opening_cost) |
| Residuals | — | sold-and-paid pre-D | open / pending rows (standing produce) |
| Livestock / trees | counts collapse to one `opening_balance` count log dated D per animal/planting | pre-D count logs | masters |
| Expenses | — | pre-D expenses fully paid pre-D (+ their payments) | unpaid or post-D-paid expenses |
| Tree/livestock revenue | — | settled pre-D | open items |
| Machinery/assets | — (masters are registers, not transactions) | — | everything; `v_expense_ledger` capital branch gains a `purchase_date >= go_live_date` filter so pre-go-live small equipment stops expensing into the current FY |
| Diary/activities/health/media | — | activity logs only of deleted cycles | everything else (operational history, no financial effect) |

## Safety

- **Archive before delete.** New table `go_live_archive(farm_id, batch_id, table_name, row_data jsonb)`;
  every deleted row is copied in first. Owner-only SELECT; rows written only by the definer function.
- **Invariants, or rollback.** The function snapshots, per farm: every account balance, every
  vendor `balance_due`, every worker `balance_due`, every item `current_stock`, every kept
  cycle's `total_cost`/`revenue`, every buyer's receivable, tree/livestock counts, and the
  cash-book closing balance. After surgery it recomputes and raises on any mismatch — the
  transaction rolls back whole.
- **One shot.** Refuses to run if `go_live_date` is already set.
- **Count triggers.** `sync_inventory_stock` / `sync_livestock_count` / `sync_tree_planting_count`
  recompute from full history on every insert/delete, so opening rows are inserted before the
  deletes and the final recompute lands on the same number.

## Interface

- `go_live_preview(p_farm_id, p_cutover) → jsonb` — read-only; everything the conversion
  *would* do: derived openings per account/vendor/worker/item/cycle, rows to delete per
  table, open items that will survive, warnings.
- `go_live_convert(p_farm_id, p_cutover) → jsonb` — the surgery, single transaction,
  admin-only (or service role), returns the before/after invariant report.
- **UI:** `pages/GoLive.jsx`, admin-only, reached from ProfileMenu ("Start fresh / Go live").
  Step 1 pick date → step 2 full preview rendered per domain → step 3 type-to-confirm
  ("START FRESH") → run → report. Farms already converted see the report of when.

## Also in scope (closes the loop for fresh SaaS farms)

1. **Buyer receipts.** A buyer `opening_balance` currently can never be settled (sale receipts
   live on sale rows). New store action + BuyersTab form writes an `owner_cash_entries` row,
   `entry_type='buyer_receipt'`, `reference_id=buyer_id`; khata, receivables total, and the
   Cash Flow statement all learn the type. Vendor side already has this (`vendor_payments`).
2. **Onboarding funnel.** `FarmOnboarding` finish() opens the SetupChecklist, so money is step
   4 of signup instead of prose.
3. **Checklist labour row** points at Admin → Manpower (where the editor actually is) and its
   done-detection covers permanent staff too.
4. **Opening-stock date** derives its FY boundary from `go_live_date` when set, not today.
5. **Dashboard/Field season cost** include `opening_cost` so a mid-year farm's standing-crop
   spend isn't understated outside the Ledger.

## Out of scope, recorded

- Livestock per-animal pre-app cost (no opening slot; same gap a fresh signup has).
- Partner arrears (partners are labels on harvest sessions; no money flows to fold).
- Balance Sheet figures (still blocked on the owner: land value, loans, owner capital).
- Physical deletion of `go_live_archive` (owner can ask later; it is not visible in any book).

## Pallia execution (cutover 2026-08-01)

Derived from live data, to be re-verified by `go_live_preview` at run time: Cash in hand
opening ₹1,34,330 (Bank ₹0); New Ankur Beej Bhandar opening ₹2,00,160 (55,580 existing +
1,44,580 bills, minus the ₹5,000 spray-machine capital line → ₹1,95,160 fold + master carries
₹5,000); buyer openings all ₹0 (the one pre-Aug sale was settled 06-Jul); labour openings per
`v_salary_dues` arithmetic; stock openings: Diesel 314.01L, Urea 128, Potash 14, DAP 10,
Aravali 9, minus a 0.03 stock correction; 15 active cycles fold their pre-Aug costs into
`opening_cost`; 3 cycles harvested Oct-2024 delete outright; the wheat cycle with the open
straw residual is kept. Survivors: 2 unpaid contractor logs (₹16,000), 1 open residual,
1 unpaid Aug expense. Jaagir Lodge farm untouched.

# Ledger audit — 2026-07-15

Executed per [HANDOFF-ledger-audit.md](HANDOFF-ledger-audit.md). Scope: every cost
and revenue source in the database, what the report code actually sums, attribution
gaps with row counts and amounts, and a worked crop-level P&L example from live data.

Farm audited: Pallia Farm (`ac8bef13-cf21-4849-b939-a2315e2863cc`).

## 1. Attribution gaps, per cost table

"Unattributed" = the row cannot reach any crop cycle's P&L.

| Table | Rows | Unattributed | Amount | Unattributed amt | Verdict |
|---|---|---|---|---|---|
| `inventory_issues` | 207 | 12 | ₹256,146 | ₹36,715 | See breakdown below |
| `labour_logs` | 69 | 0 | ₹78,825 | ₹0 | Clean |
| `diesel_logs` | 0 | — | — | — | **Dead table.** Diesel flows through `inventory_issues` (21 rows, ₹30,094, all carrying cycle + plot + machinery). No trigger needed; nothing writes here. |
| `farm_expenses` | 0 | all | ₹0 | ₹0 | **Structural**: no `cycle_id`/`plot_id` columns exist. Empty today, but the first rented-cultivator entry will be invisible to crop P&L. |
| `salary_payments` | 3 | all | ₹24,000 | ₹24,000 | **Structural/policy**: monthly payroll has no plausible cycle linkage. |
| `salary_advances` | 4 | all | ₹5,000 | ₹5,000 | Not an expense — recovered through the salary khata. Correctly excluded everywhere. |
| `sales` | 1 | 0 | ₹194,075 | ₹0 | Clean (linked via harvest session). |
| `crop_residuals` | 1 | 0 | ₹15,200 exp. | ₹0 | Attributed, but was invisible to crop P&L (fixed, see §3). |

The 12 unattributed `inventory_issues` rows:

- **5 rows, ₹0** — `historical_correction` (2024-01-01, zero-cost). Deliberate, harmless.
- **6 rows, ₹35,875** — `stock_correction` (2026-06-17). Corrections after the stock
  mishap, not spend. Correct that they skip crop P&L; they were, however, inflating
  the Dashboard's season-spend number (fixed, see §3).
- **1 row, ₹840** — Urea, 2026-04-15, purpose "Top dressing Urea — Wheat Plot A".
  Has a plot but no cycle: the auto-attribution trigger only attaches *active*
  cycles, and no wheat cycle exists (see §4). This is the one genuine attribution
  loss in the data. Unfixable honestly — there is no cycle to attach it to.

**Stock-adjustment distortion check (from the handoff): clear.** The 9
`STOCK-ADJ-20260714` purchases are all zero-amount. Issue costing snapshots the
weighted-average cost stored on `inventory_items.cost_per_unit`, which only the
app's purchase flow updates — the SQL-inserted adjustments never touched it. Item
WACs are sane (Urea ₹325/bag, DAP ₹1,580/bag, Diesel ₹96.15/l). The zero-amount
rows do appear as ₹0 "Purchase from Vendor" lines in the expense ledger — cosmetic
noise only, totals unaffected.

## 2. What the report code actually sums

There is no backend; aggregation is SQL views + `frontend/src/store/index.js` +
page-level math.

**Farm-level P&L** (`v_expense_ledger` + `v_income_ledger`, shown in Ledger → P&L
"Overall"): **sound**. Expenses = `farm_expenses` + outside-labour `labour_logs`
(khata workers excluded to avoid double counting) + salary accrual
(`v_salary_accrual`) + `inventory_purchases`. Income = crop sales (net of
commission/freight/deductions) + sold residuals + livestock + tree revenue.
Counting *purchases* rather than *issues* as farm-level expense is a defensible
accrual choice and avoids double counting.

**Crop-level P&L** (`v_crop_pnl`, before this audit): **incomplete**.
- Cost = `inventory_issues` + `labour_logs` only — correct set, given diesel rides
  on issues and payroll is farm-level by design.
- Revenue = `sales` reachable through `harvest_sessions` only; a sale linked
  directly by `sales.cycle_id` would be dropped.
- **Sold residual revenue never reached crop P&L** (it only hit the farm income ledger).
- **No expected-revenue path at all** — 16 of 18 cycles are unsold, so the P&L tab
  showed "0%" margin for nearly every row.
- No `farm_id` column, so the store selected it unscoped (RLS saves single-farm
  users; a member of two farms would see both mixed).
- No crop-level merge across plots anywhere in the UI.

**Dashboard**: expected revenue omitted residuals; season spend included the
₹35,875 of stock-correction issues.

## 3. Fixed in this commit (small)

- **Migration `0017`** — `v_crop_pnl`: revenue now includes sold residuals and
  direct-cycle sales; new columns `residual_revenue`, `expected_revenue`
  (acres × yield × price + residual term, preferring pending `crop_residuals` rows
  over the crop-template jsonb), `expected_margin_pct`, `crop_id`, `plot_id`,
  `farm_id`. `v_livestock_pnl`: `farm_id` appended. Both keep `security_invoker`.
  **⚠ Not yet applied to the live database** (production apply was withheld this
  session). Apply 0017 before deploying these frontend commits — the store now
  filters both views by `farm_id`.
- **`store/index.js`** — scopes `v_crop_pnl` / `v_livestock_pnl` to the active farm.
- **Ledger → P&L tab** — new "Crops — P&L (all plots merged)" table (one crop in
  N plots merges to one line), and unsold cycles now show *expected* margin
  (labelled "est.") instead of a meaningless 0%.
- **Dashboard** — expected revenue includes the residual term; season spend
  excludes correction issues.

## 4. Worked example (owner asked for Wheat; Wheat has no cycles)

**The Wheat crop exists in the master (15 qtl/ac @ ₹2,200 + bhoosa 18 qtl/ac @
₹150 = ₹35,700 expected/acre) but has zero crop cycles** — 410 kg of wheat seed
was issued and a "Wheat Plot A" urea top-dressing was logged, yet no wheat cycle
was ever created, so last rabi's wheat season is entirely absent from crop P&L.
That is itself the audit's clearest finding: costs only reach a crop if a cycle
exists when they're logged.

The same methodology worked on the crops that have live data:

**Paddy — one crop across 7 plots, merged (all unsold → expected margin):**

| Plot | Acres | Cost | Expected revenue | Expected margin |
|---|---|---|---|---|
| Plot F | 5.0 | ₹74,996 | ₹251,500 | 70.2% |
| Plot G | 5.0 | ₹58,737 | ₹251,500 | 76.6% |
| Plot I | 2.5 | ₹33,000 | ₹125,750 | 73.8% |
| Plot J | 4.0 | ₹52,845 | ₹201,200 | 73.7% |
| Plot K | 4.0 | ₹37,378 | ₹201,200 | 81.4% |
| Plot M | 1.0 | ₹14,161 | ₹50,300 | 71.8% |
| Plot O | 1.0 | ₹11,461 | ₹50,300 | 77.2% |
| **Merged** | **22.5** | **₹282,577** | **₹1,131,750** | **75.0%** |

Expected revenue per plot = acres × 25 qtl × ₹1,900 (grain) + acres × 28 qtl ×
₹100 (parali). Plot-level spread (70–81%) is exactly the per-plot visibility the
owner asked for.

**Chaini Paddy, Plot H — the one sold cycle (actual margin):** net crop revenue
₹188,530 (₹194,075 gross − ₹5,545 commission), pending bhoosa/parali residual
₹15,200 expected. But recorded cost is **₹0** — the cycle was harvested and sold
with no issues or labour ever attributed, so its "margin" reads 100%. Same lesson
as Wheat: the ledger machinery is sound, the discipline of logging against a live
cycle is what decides whether the number means anything.

## 5. Structural findings (not fixed — need decisions)

1. **`farm_expenses` cannot reach crop P&L.** No `cycle_id`/`plot_id` columns. The
   owner's rented-cultivator example lands here and would be invisible to the crop's
   margin. Recommend: add nullable `plot_id` + `cycle_id`, reuse the
   `auto_set_cycle_id` trigger, add a plot picker to the expense form.
2. **Regular payroll needs a policy, not a trigger.** Monthly salaries (₹24,000 so
   far) genuinely span cycles. Options: (a) keep them farm-level only (current
   behaviour, defensible — the khata staff also cook and mind livestock), or
   (b) allocate by acre-days of active cycles. Recommend (a), stated explicitly in
   the P&L UI as "farm overheads, not in crop margins".
3. **Cycle-creation discipline is the real gap.** Wheat (no cycle → season
   invisible) and Chaini Paddy (cycle but no costs → fake 100% margin) are both
   data-entry gaps the schema can't fix. Cheap guard: warn when seeds are issued to
   a plot with no active cycle (the `stage='preparation'` path already detects this).
4. **`diesel_logs` and `labour_activity_rates` are dead** — no code writes/reads
   them. Candidates for a cleanup migration.
5. **Old sugarcane cycles (2024) have zero cost and zero revenue** — harvested
   before the system existed. Consider marking them `archived` so they don't dilute
   averages.
6. **Remaining ledger views (`v_income_ledger`, `v_expense_ledger`, `v_cash_book`,
   `v_monthly_summary`, `v_vendor_balances`, `v_salary_dues`) still have no
   `farm_id`** and are selected unscoped. Safe today only because each user belongs
   to one farm. Must be fixed before real multi-farm SaaS (Phase 6).

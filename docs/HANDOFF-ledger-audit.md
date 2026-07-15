# Handoff — end-to-end account ledger audit

Written 2026-07-15. The owner asked for this audit in a session that had grown too
expensive to run it in; this brief front-loads what that session already knew so the
audit starts at the queries, not at re-derivation. Read this file first.

## The owner's requirements, verbatim in spirit

1. **Review the account ledgers end to end** and verify all is well. Every expense for
   the farm must be registered during the crop cycle **and reach the report**.
2. **No gaps in the accounting.**
3. **Crop-level P&L analysis.** Example — Wheat: expenses were inventory, ploughing
   (diesel), labour, harvesting, rented machinery (e.g. a cultivator). Margin =
   **expected** while the crop is unsold, **actual** after selling — and actual revenue
   is **crop + residual** (bhoosa etc.). Must be filterable **by plot and by crop**;
   one crop can sit in 5 plots, and at crop level those must **merge**.

So the deliverable is: (a) a gap list with row counts and amounts — cost rows that
cannot reach a crop cycle's P&L; (b) an audit of what the report code actually sums
vs. the cost sources that exist; (c) a worked Wheat example from live data, per plot
and merged; (d) fixes where small, recommendations where structural.

## Ground truth already established — do NOT re-verify

- **Demo farm id `ac8bef13-cf21-4849-b939-a2315e2863cc`** ("Pallia Farm"): 17 plots,
  18 crop cycles, 157 activity_logs, 28 inventory_items, 21 labourers, 25 machinery,
  22 assets, 5 vendors, 4 buyers, 6 partners — and **exactly 1 sales row**. Almost
  everything is unsold, so the *expected*-margin path is the one that matters most.
- **There is no backend.** CLAUDE.md §7 describes FastAPI services (`cost_service.py`
  etc.) that do not exist; the app is frontend → supabase-js direct. The `farmApi`
  block in `frontend/src/api/client.js` is no-op stubs (`getDashboard`, `submitDiary`,
  `uploadFile` return `Promise.resolve(...)`). **Audit the frontend aggregation code,
  not CLAUDE.md's Python.**
- **`labour_activity_rates` is dead config** — `labourApi.getRates()` is defined in
  `api/client.js:58` and called nowhere. 9 rows in the demo farm, read by nothing.
- **Attribution triggers exist for two tables only.** `auto_set_cycle_id()` runs
  BEFORE INSERT/UPDATE on `inventory_issues` and `labour_logs`: if `cycle_id` is null
  and `plot_id` is set, it copies the plot's latest *active* cycle. Consequences the
  audit must check: rows logged when the plot had **no active cycle** keep
  `cycle_id = null` (silent attribution loss); and **`diesel_logs` has no such
  trigger** — find how diesel reaches a cycle at all.
- **Stock adjustment 2026-07-14:** `inventory_purchases` rows with invoice
  `STOCK-ADJ-20260714`, **zero amounts**, backdated to FY start (see
  `supabase/data-fixes/2026-07-14-stock-adjustment.md`). These are corrections, not
  spend. If issue costing derives from purchase prices, zero-cost purchases can
  distort issue costs — check.
- **Crops master carries the expected-revenue inputs**: `price_per_qtl`,
  `yield_per_acre`, `harvest_window_days`, and `residuals` jsonb
  (`name, unit, qty_per_acre, expected_rate`). Expected revenue per cycle should be
  `acres × yield_per_acre × price_per_qtl + acres × qty_per_acre × expected_rate` —
  verify the code computes something equivalent, incl. the residual term.
- **RLS is on everywhere with the standard four policies; helper fns
  `is_farm_member` / `has_farm_role`. All queries in the MCP tool bypass RLS** (runs
  as postgres), so audit queries see everything — remember the app itself sees only
  the active farm.

## Where the money lives (schema domains)

| Flow | Tables |
|---|---|
| Input costs | `inventory_issues` (has `total_cost`? verify), fed by `inventory_items` / `inventory_purchases` |
| Labour | `labour_logs` (per-activity), `attendance` + `salary_payments` / `salary_advances` (regular payroll) |
| Fuel/machinery | `diesel_logs`, `machinery_master`, `farm_assets` |
| General expenses | `farm_expenses` + `expense_payments` (rented cultivator likely lands here — check `category`/linkage) |
| Revenue | `sales` (+ `buyers`), `harvest_sessions`, `crop_residuals`, `livestock_revenue` |
| Cash | `owner_cash_entries`, `vendor_payments`, `partners` |

Open question the audit must answer per table: **does it carry `cycle_id` (or
`plot_id` → derivable), and what fraction of rows/amount is unattributed?**
A known structural hole to confirm: **regular payroll** (`salary_payments`) has no
plausible cycle linkage — decide and report how monthly salaries should be spread
across cycles (or explicitly excluded from crop P&L and shown farm-level).

## Starter queries (adjust column names after checking information_schema)

```sql
-- 1. attribution gaps, per cost table (pattern; repeat per table)
select 'inventory_issues' as src, count(*) total,
       count(*) filter (where cycle_id is null) unattributed,
       sum(total_cost) total_amt,
       sum(total_cost) filter (where cycle_id is null) unattributed_amt
from inventory_issues where farm_id = 'ac8bef13-cf21-4849-b939-a2315e2863cc';

-- 2. wheat cycles across plots (the worked example)
select cc.id, p.name as plot, cc.status, cc.sow_date, p.area_acres
from crop_cycles cc join plots p on p.id = cc.plot_id
join crops c on c.id = cc.crop_id
where cc.farm_id = 'ac8bef13-cf21-4849-b939-a2315e2863cc' and c.name ilike '%wheat%';
```

## Where the report code lives

- `frontend/src/pages/ReportsPage.jsx` — `/reports`, wrapper with inner tabs
  (Harvest + Dashboard). Profile menu has separate Harvest and Reports entries.
- `frontend/src/pages/Dashboard.jsx`, `Harvest.jsx`, `Expenses.jsx`,
  `LedgerPage.jsx`, `Today.jsx` — candidate consumers of cost data.
- `frontend/src/store/index.js` (~2,260 lines) — the aggregation almost certainly
  happens here; find the P&L/margin computation and list **which of the cost tables
  above it actually sums**, whether expected-vs-actual is handled, whether residual
  revenue is included, and whether crop-level merging across plots exists or only
  per-plot views.

## Repo state warnings

- **Three local commits are unpushed by owner's request** (`49b2061` seed migration,
  `d7447fd` onboarding map picker, `db0237a` map-state fix). Do not assume Vercel has
  them; do not push without asking.
- The seed migration **is already applied to the live DB**, and the test account
  `deepak@eeetaxi.com` is deleted.
- Git identity: `dpakkaushik` / `palliaclaudeai@gmail.com`. No backticks in
  `git commit -m` — use `git commit -F -` with a heredoc.

## Suggested opening prompt

> Read docs/HANDOFF-ledger-audit.md, then run the ledger audit it describes: quantify
> attribution gaps per cost table, audit the report aggregation code, and produce the
> Wheat worked example (per plot + merged, expected vs actual margin incl. residuals).
> Fix what's small; report what's structural.

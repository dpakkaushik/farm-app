# 2026-08-12 — Phase 1 of the fresh-install standard: Pallia cleanup (executed)

**Farm:** Pallia Farm `ac8bef13-cf21-4849-b939-a2315e2863cc`
**Plan:** [`docs/PLAN-fresh-install-standard.md`](../../docs/PLAN-fresh-install-standard.md) — owner-confirmed 2026-08-11.
**Archive batch:** `cf70fd5a-6982-4242-902b-7a82e675cf89` in `go_live_archive` — **221 rows**, written before any delete.

The go-live conversion (2026-08-11, batch `fa8b0b3d…`) folded settled history but,
by its own rules, kept open items and referenced parents. The owner then confirmed
the stricter spec: *the app must look installed on 1 Aug*. This fix removes the
survivors a fresh install would not have. Ran as one transaction: archive → fold →
delete → verify → abort on any mismatch. It passed first run.

## What was removed (all archived first)

| # | What | Rows | Detail |
|---|---|---|---|
| 1 | Open straw residual | 1 | `9e5a5296…`, "Paddy Straw (Parali)", 152 qtl @ ₹100 expected. When the straw sells, the owner records a plain cash receipt that day. |
| 2 | Its harvest session | 1 | `35ac233d…`, 2026-06-29, on the harvested Plot H cycle. |
| 3 | Harvested Plot H cycle | 1 | `c0000004-…-0001`. The docs called it "wheat"; the live row is **Chaini Paddy** — same cycle (Plot H, harvested 2026-06-29, carried the straw residual). Its ₹1,88,530 settled revenue was already erased by the conversion. |
| 4 | Three empty 2024 cane cycles | 3 | `c0000001-…-0001/2/3` (Plots C, D, L). Zero issues/labour/sales/diesel/logs. Their only references were the three 2026 ratoon children — `parent_cycle_id` nulled first (pre-update snapshots archived as `crop_cycles_parent_unlink`). |
| 5 | Pre-Aug activity logs | 210 | All of Pallia's; includes the harvested Plot H cycle's 3. No `labour_logs`/`inventory_issues` referenced any of them. |
| 6 | Two July contractor logs | 2 | ₹4,800 (16 Jul) + ₹11,200 (17 Jul) = **₹16,000** — see the fold below. |

Pre-Aug crop-health rows: there were none (0).

## The ₹16,000 fold

Owner ruling: contract labour is paid in cash and **nothing is pending** — the
`is_paid=false` flag on these two rows was wrong data. So the amount was folded
into the crop's opening cost, not turned into a due:

- Both logs had `cycle_id = NULL`, so they never fed `v_crop_pnl` — they only
  showed in Expenses as (wrongly) unpaid. The target cycle is identified by the
  data: the 17 Jul log is explicitly on **Plot H**; both are `Sowing`, area-wise
  @ ₹3,200/acre (1.5 + 3.5 acres); the only cycle sown those days is the
  **Plot H paddy cycle `4dd3accf…` (sown 2026-07-16)**.
- `crop_cycles.opening_cost` on `4dd3accf…`: `null → 16000.00`, logged in
  `protected_field_changes` (old null, new 16000.00).
- The cash that paid it lives inside the 1 Aug cash-in-hand opening the owner
  will state. No due, no party, nothing to pay later.

## Verification (inside the same transaction)

- `_go_live_state` before/after: **identical** for accounts, vendors, labour,
  stock, buyers, livestock counts, tree counts — with exactly two intended
  differences in `cycle_costs`: the 4 deleted cycle keys vanish, and
  `4dd3accf…` rises by exactly ₹16,000 (₹17,308 → ₹33,308: the sowing cost the
  cycle was silently missing).
- Cash book closing: **₹1,33,230**, unchanged.
- Zero pre-Aug rows remain in: labour_logs, activity_logs, crop_health_logs,
  harvest_sessions, crop_residuals, sales, owner_cash_entries, inventory_issues,
  and inventory_purchases outside the 6 `OPENING-STOCK` rows (2026-03-31, stay).
- Zero non-active cycles remain; 15 cycles left, all active.

## Deliberately not touched

- **Media** — owner has not ruled (18 `farm_video` rows; storage files are not
  archived by any mechanism, so deletion is irreversible). Ask once.
- **3 pre-Aug `livestock_health_logs`** — not in the plan's Phase 1 list (it
  says *crop*-health rows). Animal health/vaccination history may be
  operationally valuable; flagged for the owner rather than deleted.
- The 6 OPENING-STOCK purchases dated 2026-03-31 — opening statements, stay.

## The SQL

One `DO` block, run 2026-08-12 via MCP (service role). Shape:

```text
advisory lock (same key as go_live_convert)
snapshot _go_live_state
sanity: exactly 2 contractor logs summing 16000, contractual, no master;
        residual open; 4 target cycles carry no financial rows;
        2024 parents have exactly the 3 ratoon children
archive: crop_residuals(1), harvest_sessions(1), activity_logs(210),
         crop_health_logs(0), labour_logs(2), crop_cycles(4),
         crop_cycles_parent_unlink(3)   → batch cf70fd5a…
fold:    crop_cycles.opening_cost += 16000 on 4dd3accf…
delete:  residual → session → activity logs → health logs → labour logs
         → null ratoon parent_cycle_id → 4 cycles (count asserted = 4)
verify:  _go_live_diff(expected, after) empty, where expected = before with
         only cycle_costs.4dd3accf… += 16000; cycle key count −4 exactly;
         zero pre-Aug rows outside OPENING-STOCK — raise (rollback) otherwise
```

The archived rows are the recovery path: every deleted row is in
`go_live_archive` batch `cf70fd5a-6982-4242-902b-7a82e675cf89` as jsonb.

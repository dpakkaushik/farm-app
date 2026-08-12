# 2026-08-12 — Phase 2 of the fresh-install standard: itemised opening costs (executed)

**Farm:** Pallia Farm `ac8bef13-cf21-4849-b939-a2315e2863cc`
**Plan:** [`docs/PLAN-fresh-install-standard.md`](../../docs/PLAN-fresh-install-standard.md), Phase 2.
**Requires:** migrations `0024` (amended) and `0032`, both applied 2026-08-12.

## Migrations applied

- **0024** (`crop_cycle_opening_costs` + `v_crop_pnl`/`v_crop_cost_lines`) — in the
  repo since before go-live, never applied; the owner reversed the "not applied"
  decision on 2026-08-11. Applied **amended**: insert/update RLS tightened from
  manager to **admin** — a breakup row is a founding figure, same as
  `crop_cycles.opening_cost` (0026 made that owner-only; the file's original
  manager-level write policies were the known guard mismatch). The live
  `v_crop_pnl` was verified identical to 0017's shape before replacing it, so
  the rewrite changes only the opening-cost term and appends two columns.
- **0032** (`0032_opening_breakup_insert_guard.sql`, new) — extends 0031's
  `guard_founding_figures_insert()` to the breakup table: a non-zero `amount`
  on INSERT requires admin and is logged to `protected_field_changes` as
  `amount:<category>`. Numbered after 0031 because it replaces that function —
  a fresh install must run them in order.

## The derived placeholder breakups

54 rows inserted for **all 15 cycles**, in one transaction with verification:

- **Source:** `go_live_archive` — the conversion batch's archived
  `inventory_issues` (item → `inventory_items.category`: seed / fertilizer /
  chemical / fuel; unknown or missing items → other) and archived `labour_logs`
  (→ labour), grouped per kept cycle; **plus ₹16,000 labour on the Plot H paddy
  cycle `4dd3accf…`** — the Phase 1 contractor-log fold (those rows carried
  `cycle_id = null`, so no archive line points at the cycle; the fold ruling does).
- **Verified inside the transaction, or rolled back:** every cycle's itemised
  sum equals its `crop_cycles.opening_cost` to the paisa (0 mismatches — the
  derivation reconciled with **zero residue** on all 15, so no filler row was
  needed); `_go_live_state` before/after byte-identical (0024's view takes the
  itemised total where rows exist, so no displayed balance moved).
- **After:** `v_crop_pnl.opening_cost_is_itemised` = true for 15/15;
  `v_crop_cost_lines` has zero `unspecified` rows for the farm; all 54 inserts
  audited in `protected_field_changes` (`changed_by` null = system derivation).

Category totals across the farm (placeholders, not confirmed):
fertilizer ₹1,22,987.50 · labour ₹95,875.01 · chemical ₹76,012.00 ·
fuel ₹30,093.98 · seed ₹1,100.00 — total ₹3,26,068.49.

## These are PLACEHOLDERS

The backfill was partial; the owner restates every breakup himself in
**Admin → Cycles → ✏️ opening cost** (`OpeningCostBreakup` editor).
`saveOpeningCostBreakup` replaces the whole breakup and keeps
`crop_cycles.opening_cost` equal to the sum — restating never double-counts.

## Also in this change

- `SetupChecklist.jsx` opening-stock copy fixed per the plan's Phase 4 note:
  it asked for "counted stock on the shelf today"; it now asks for stock on
  the go-live date.

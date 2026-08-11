# PLAN — the fresh-install standard (owner-confirmed 2026-08-11)

> **The spec, in the owner's words:** imagine 1 August is the date the app was
> installed. Nothing the farm did before that date exists as an entry. Positions
> are stated as opening balances; entries from 1 Aug to today stay exactly as
> they are. This plan finishes making Pallia — and the product — match that.

## The confirmed model (do not relitigate)

- **Stock**: opening quantity per item **as it stood on 1 Aug**, entered by the
  owner. Issues from 1 Aug onward stay as real entries. Issues before 1 Aug are
  neither shown nor entered — their cost lives inside the crop's opening balance.
- **Crops**: each running cycle carries an **opening balance with a breakup**
  (inventory, labour, fuel, etc.) — not one grey number. This reverses the
  earlier "0024 not applied" decision: the owner has now explicitly asked for
  the itemised breakup.
- **Labour**: nobody cares what workers did in July. Attendance exists from
  1 Aug; each worker carries one opening khata balance.
- **Everything else the same way**: cash/bank per account, vendor khata, buyer
  khata — one opening figure each, owner-entered, owner-only, audited.
- **All derived figures are placeholders.** The backfill was partial; the owner
  restates every figure himself. Every screen must show the current figure and
  replace (never add) when he types.

## Phase 1 — Pallia cleanup: remove what a fresh install would not have

Archive first (same `go_live_archive`, new batch), then delete, in this order:

1. The open straw **residual** row, its harvest session, and the harvested
   Plot H wheat cycle (delete its 3 activity logs first — FK). When the straw
   sells, the owner records the money as a cash receipt that day.
2. The **two July contractor logs** (₹16,000). Owner has confirmed: contract
   labour is paid in cash and NOTHING is pending — the app's `is_paid=false`
   flag on these rows was wrong data. So: **fold each log's amount into its
   cycle's opening cost (labour bucket), then delete**. The cash they were paid
   with is already inside the 1 Aug cash-in-hand opening the owner will state.
   There is no due, no party to create, nothing to pay later.
3. The **three empty 2024 cane cycles**: null `parent_cycle_id` on the three
   2026 ratoon cycles, then delete them (verify no other children).
4. **~210 pre-Aug activity logs** and any pre-Aug crop-health rows.
5. **Media** (pre-Aug photos/attachments): NOT deleted — owner has not ruled.
   Ask once; delete only on his yes (storage files are not archived).

Verify after: cash book, vendor/salary dues, stock, counts all unchanged
(reuse `_go_live_state` before/after); zero pre-Aug rows outside OPENING-STOCK.

## Phase 2 — crop opening breakup (0024)

1. Apply `0024_crop_opening_cost_breakup.sql` (in repo, never applied). Check
   it against the live schema first; fix the known guard mismatch (manager-level
   RLS on `crop_cycle_opening_costs` vs owner-only `opening_cost` — tighten the
   table's insert/update to admin, and add it to the 0031 insert-guard pattern).
2. Derive **placeholder breakups** for Pallia's 15 cycles from `go_live_archive`
   (the archived issues carry item categories → seed/fertilizer/chemical/fuel;
   archived labour logs + the ₹16k fold → labour). Sum must equal each cycle's
   `opening_cost` — 0024's view takes the itemised total when rows exist.
3. Confirm Admin → Cycles shows the `OpeningCostBreakup` editor for these
   cycles (component + `loadOpeningCostBreakup` already handle the table
   existing). The owner then restates each breakup himself.

## Phase 3 — converter matches the standard (future farms)

Update `go_live_convert` (+ repo 0030) so any future conversion lands exactly
here without a manual phase 1:
- also purge pre-cutover activity logs, crop-health logs, diary rows;
- drop closed pre-cutover cycles even when they are ratoon parents (null the
  child's `parent_cycle_id` first) and drop open residual rows by DEFAULT —
  the fresh-install standard; the sale money is simply recorded when it
  arrives. Keeping unsold-produce rows becomes the opt-in, never the default;
- write the opening-cost **breakup rows** (Phase 2 categories) during the fold,
  not just the aggregate;
- keep the financial fold rules unchanged (they are invariant-verified).

## Phase 4 — the owner's entry pass (from home)

In this order, all via the app, all as of **1 Aug** (not today — the app
already holds 1–11 Aug entries that move each figure):
1. Cash in hand + Bank (Opening balances → Cash & bank).
2. Vendor khata balances (Ledger → Party Khata → edit each).
3. Buyer khata balances (Opening balances → Buyer balances).
4. Worker khata balances — staff AND regulars (Admin → Manpower).
5. Opening stock per item (Opening balances → Opening stock — restating
   replaces). **Fix the form copy**: it says "counted stock on the shelf
   today"; it must say "stock on your go-live date".
6. Each running cycle's opening cost, with breakup (Admin → Cycles).
7. Livestock counts / tree counts — verify, already stated as 1 Aug openings.
Optional: machinery/asset register entries; dues to non-vendors (make them a
vendor with an opening balance, or keep off-app).

## Order of work for the next session

Phase 1 → verify → Phase 2 → verify → push. Phase 3 next. Phase 4 is the
owner's own pass once 1–2 are live. Commit + push after every phase; rewrite
CLAUDE.md's snapshot each time.

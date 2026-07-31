# Plan — onboarding a farm that joins mid-year

> Status: **final design, not started.** Simplified 2026-07-20 to the smallest
> version that keeps the numbers honest. Supersedes the earlier CSV/books-start-date
> draft. Amended 2026-07-31: must also serve an **already-running farm** (see below).
>
> Resume prompt: "Read docs/PLAN-mid-year-onboarding.md and build it. Migration
> 0017 is already applied to the live DB (verified 2026-07-21), so 0018 can go
> straight on top."
>
> **Owner requirement added 2026-07-31 — provision for BOTH cases:**
> 1. **A brand-new farm** (separate owner) — the original design below.
> 2. **The current farm (Pallia)** — it started in the app in June, so its
>    sugarcane cycles carry real pre-app expenses that are not showing in P&L.
>    Pallia already has 19 cycles and live stock, so the "looks un-set-up" card
>    visibility rule would never fire there. Therefore:
>    - **Form 2 must also list plots with EXISTING active cycles** and let the
>      owner enter/edit "spent before the app ₹" — written to `opening_cost` on
>      that existing cycle (update, not create).
>    - **Add a manual entry point** for set-up farms: a "Opening balances /
>      Finish setup" item in the profile menu (ProfileMenu.jsx) that opens the
>      same SetupChecklist, so the card being auto-hidden doesn't lock owners out.
>    - Note: Pallia's opening *stock* is already reconciled by hand
>      (supabase/data-fixes/2026-07-21-opening-stock-reconciliation.md) — only
>      its crop `opening_cost` values still need entering, through this UI.

## The problem

A farm signs up mid-season. It already has stock in the store and crops in the
ground — some near harvest. The app assumes it saw every purchase and sowing, so a
new farm looks empty, and a near-harvest crop (whose money was all spent before
signup) would show a fake ~100% margin because nothing was logged against it.

## What already works (so we don't rebuild it)

- Every entry screen already accepts **past dates**.
- A standing crop with zero logged cost **already shows correct *expected* profit**
  from the crop's yield × price (+ residuals). The expected side needs nothing.
- Stock is recomputed by a DB trigger as `SUM(purchases.qty) − SUM(issues.qty)`,
  and it **ignores dates** — so a backdated purchase sets stock correctly.

So onboarding only has to feed three things, and only one needs new database work.

## The design (smallest honest version)

The cutoff between "opening balances" and "live records" is simply the **current
financial-year start** (computed; no picker, no new field). Everything entered as
opening balance is dated just before it, so it never counts as this season's spend.

A **"Finish setting up" card** appears on the farm while it still looks un-set-up
(no crop cycles yet, or all stock at zero) and the owner hasn't dismissed it. Two
forms:

### Form 1 — Opening stock  *(reuses existing purchase save)*
List the farm's items; owner types **quantity on hand + rate paid** for each.
Saved as backdated `inventory_purchases` rows (marker `invoice_number =
'OPENING-STOCK'`, `vendor_name = 'Opening balance'`, no vendor id → creates no
payable), dated to the day before FY start, with the **real rate** (so weighted-
average cost is right and future issues cost correctly). The stock trigger sets
`current_stock`. Being pre-FY, it does **not** inflate this season's expenses.
This is the clean, permanent version of the manual `STOCK-ADJ` fix
(supabase/data-fixes/2026-07-14-stock-adjustment.md).

### Form 2 — Standing crops + cost-so-far  *(reuses add-cycle; one new column)*
List the plots; for each with a crop growing, owner picks **crop**, **roughly when
sown**, and **"spent so far ₹"** (one number). Each row:
- calls the existing `addCropCycle` (store/index.js:1951) with the past sow date →
  plot colours on the map, expected profit shows;
- writes the "spent so far" figure into the new `crop_cycles.opening_cost`, which
  the P&L view adds to the crop's cost → a near-harvest crop shows an **honest**
  margin, not 100%.

**Do-not-double-count note (must be on the form):** opening stock = what's *still in
the store*; cost-so-far = what a crop *already consumed/paid*. Different rupees.

### From go-live onward
Nothing new — normal purchases, issues, labour, harvest, sales. Actual cost =
`opening_cost` + everything logged after go-live.

## The only database change (migration 0018)

*Depends on 0017 being applied first.*
- `alter table crop_cycles add column opening_cost numeric;`
- In `v_crop_pnl`, add `+ coalesce(cc.opening_cost, 0)` into `total_cost` (and the
  profit/margin that derive from it). One line of real change.

No schema flag for the setup card — its visibility is derived from data +
localStorage dismissal.

## Where the code goes

- **New:** `frontend/src/components/SetupChecklist.jsx` — the card + the two forms.
  Model styling on `frontend/src/pages/FarmOnboarding.jsx`.
- **Store:** add `recordOpeningStock(items)` (loop → insert OPENING-STOCK purchases,
  reuse the WAC+insert logic in `recordPurchase`, store/index.js:1146-1179); reuse
  `addCropCycle` for crops and set `opening_cost` on insert.
- **Mount:** render `<SetupChecklist />` on Field/Dashboard (Field already gets
  `?newFarm=1`).
- **Copy fix:** FarmOnboarding.jsx:292-293 wrongly says issuing seed starts a cycle
  — reword to point at the setup card.

## How we'll check it works

1. New farm → the setup card appears.
2. Opening stock → `current_stock` matches; item rate set; **not** in this FY's
   expenses (dated pre-FY); switch FY filter to prior year and it appears there.
3. Near-harvest crop with cost-so-far → colours on map; P&L shows that real cost with
   a sensible margin (not 100%) plus expected profit; same crop on many plots merges.
4. Log a new expense after go-live → adds on top of `opening_cost`.
5. Dismiss card, reload → stays dismissed. `npm run build` clean.

## Deliberately left out (v1)

- **CSV import** — a farm's item/crop counts fit a form; add CSV only if a real user
  needs bulk.
- **Books-start-date picker** — the FY start is the cutoff; no separate field.
- **Category split of cost-so-far** — one number per crop is enough.
- **Opening cash / vendor dues / receivables** — full accounting-grade opening
  balances can follow; stock + crop cost are what make the farm usable and its P&L
  honest on day one.

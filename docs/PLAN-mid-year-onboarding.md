# Plan — onboarding a farm that joins mid-year

> Status: **approved-pending, not started.** Written 2026-07-15 at end of shift, to
> build next session. This is a design/plan doc, not implemented code.
>
> Resume prompt for next session:
> "Read docs/PLAN-mid-year-onboarding.md and build it. Apply migration 0017 first
> (it's committed but not yet on the live DB — see docs/AUDIT-ledger-2026-07-15.md)."

## The problem

Someone signs up in the middle of the season. Their farm already has stock in the
store and crops in the ground — some near harvest. The app assumes it saw every
purchase and every sowing, so a new farm looks empty. Two hard parts:

1. Stock already on hand that the app never saw bought.
2. A crop already growing (maybe near harvest) whose **money was all spent before
   signup** — so "just log from now on" captures almost nothing, and its profit
   would wrongly look like ~100%.

## How established platforms solve this (and what we'll copy)

Accounting and farm/ERP tools (QuickBooks, Xero, Tally, Zoho Books, Cropin) all hit
this and answer it the same way: **you don't re-type your history.** You pick a
**"books start date"** (your go-live day). Everything before it is entered **once,
as opening balances** — a snapshot of where you stand. Everything after it is
recorded normally. The start date keeps that opening snapshot from being counted as
this season's profit.

For a crop already in progress, the standard trick is **"work-in-progress": bring
the cost-so-far forward as one figure** (optionally split by category) instead of
listing every bag and wage. That figure becomes the crop's real cost, and new
spending adds on top.

We'll do exactly this.

## What we'll build

### 1. A "books start date" for each farm
Set at signup (default: today, or the start of the current season). It's the line
between "opening balances" and "live records."

### 2. Opening stock (snapshot)
For each item: **quantity on hand + rate paid**. Recorded as an opening balance
dated just before the books start date — so store quantities are right, but it
isn't counted as this season's spending (it was bought last season). Real prices,
so valuation is correct. This is the clean version of last week's manual "stock
adjustment" (see supabase/data-fixes/2026-07-14-stock-adjustment.md), made a proper
feature.

### 3. Standing crops with cost-so-far (the answer to the near-harvest worry)
For each plot with a crop growing, capture:
- which **crop** and roughly **when sown**, and
- **how much it has cost so far** — one number, or a quick split into
  inputs / labour / machinery / other for owners who know the breakdown.

That brought-forward cost becomes the crop's actual cost. From go-live, any new
spending logged against the crop simply adds to it. So a near-harvest crop shows an
honest margin immediately, and expected profit (from the crop's yield × price) keeps
working as it already does.

### 4. Two ways to enter all of the above
- **On-screen forms** — fastest for an owner who'll just type it in. Easiest onboarding.
- **CSV upload** — the bulk path: a downloadable template for opening stock, and one
  for standing crops + cost-so-far. Plus an **optional itemized past-expenses CSV**
  (date, category, amount, crop) for owners who keep digital records and want real
  line items instead of a lump — those import as normal backdated entries.

Both routes write the same opening balances; the owner picks whichever suits them.

### 5. From go-live onward
Nothing new — normal purchases, issues, labour, harvest, sales. Actual profit =
brought-forward cost + everything logged after go-live. Expected profit from crop
master data as today.

## What the owner gets

- Real plots and crops coloured on the map from day one.
- Correct stock in the store.
- Honest profit for crops already growing — including the near-harvest ones — not a
  fake 100% margin.
- A clean split so last season's stock/cost doesn't pollute this season's reports.

## Where the work is

- **Small database change** (a new migration, 0018): a `books_start_date` on the farm,
  and a place on each crop cycle to hold its **brought-forward cost** (so reports
  include it). Update `v_crop_pnl` to add that brought-forward cost into total cost.
  *Depends on migration `0017`, which is committed but not yet applied to the live
  database — apply `0017` first (see docs/AUDIT-ledger-2026-07-15.md).*
- **New setup screen**: a "Finish setting up" card with the opening-stock and
  standing-crop forms, plus the CSV upload option and template downloads. Mount it on
  Field/Dashboard; it already has a `?newFarm=1` signal. Model the wizard styling on
  frontend/src/pages/FarmOnboarding.jsx.
- **CSV importer**: parse the templates, validate, and write the opening balances,
  reusing existing store save paths — `recordPurchase`/`recordBillPurchase` for stock
  (store/index.js:1146-1230) and `addCropCycle` for crops (store/index.js:1951; it
  accepts a past sow_date and auto-links prep issues).
- **Tiny copy fix**: FarmOnboarding.jsx:292-293 ("done" step) wrongly says issuing
  seed starts a crop cycle — it doesn't (issueItem never inserts a cycle). Reword to
  point at the new setup card.

## How we'll check it works

1. New farm → set a books start date → the setup card appears.
2. Enter opening stock (form and via CSV) → store quantities match; this year's
   expenses do **not** include it (it sits before go-live); item rates are right.
3. Mark a near-harvest crop with a cost-so-far → the plot colours on the map and its
   report shows that real cost with a sensible margin (not 100%), alongside expected
   profit. Same crop on several plots adds up together (mergeByCrop in LedgerPage.jsx).
4. Log one new expense after go-live → it adds on top of the brought-forward cost.
5. Optional itemized-expenses CSV → rows import as dated entries against the right crop.
6. `npm run build` clean.

## Deliberately left out (can come later)

- Reconstructing full itemized history for every old crop (the brought-forward cost
  covers it; the optional CSV is there for those who want line items).
- Multi-file accounting-grade opening balances for cash/receivables/payables — this
  plan covers stock and crop cost, which is what makes the farm usable.

## Open decisions for tomorrow (owner deferred to recommendation)

- Exact CSV column layout (recommended: one combined opening-stock template + one
  standing-crops template; itemized past-expenses sheet optional).
- Whether `books_start_date` defaults to signup day or current FY start.
- Where brought-forward cost lives: recommended as columns on `crop_cycles`
  (e.g. opening_input_cost / opening_labour_cost / opening_other_cost) folded into
  v_crop_pnl, rather than synthetic issue/labour rows.

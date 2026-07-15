# 2026-07-14 — Stock reconciliation after purchase rows were deleted

**Status: REVERTED 2026-07-15.** The owner deleted the nine `STOCK-ADJ-20260714`
rows (and the orphan ₹840 urea issue of 2026-04-15) ahead of re-entering all
purchase data from April onward. Until that re-entry lands, stock is knowingly
negative again (Diesel −585.99, Wheat Seeds −530, Sugarcane Setts −400,
Paddy Seeds −80, DAP −32, Zinc Sulphate −15, Mustard Seeds −10; Urea 44,
Potash 9). Bill scans for the lost purchases are in Storage under
`inventory-docs/bills/` (25–29 Jun, 6 Jul).

## What went wrong

Purchase rows dating back to April were deleted. `inventory_items.current_stock` is not a
counter — the `sync_inventory_stock()` trigger recomputes it on every purchase/issue
insert, update or delete as:

```
current_stock = SUM(inventory_purchases.quantity) - SUM(inventory_issues.quantity)
```

There is no clamp at zero. With the purchases gone, the issues alone drove nine items
negative (Diesel −585.99, Wheat Seeds −530, Sugarcane Setts −400, Paddy Seeds −80,
DAP −32, Zinc Sulphate −15, Mustard Seeds −10; Urea and Potash understated).

This also means **any direct `UPDATE` of `current_stock` is cosmetic** — the next trigger
fire overwrites it. Stock can only be corrected by changing the ledger.

## What was done

Nine balancing rows were **inserted** into `inventory_purchases` (nothing was updated or
deleted — all real purchase and issue data is intact). Each carries:

- `invoice_number = 'STOCK-ADJ-20260714'`  ← the marker
- `unit_price = 0` → `total_cost` (generated) = 0, so no money enters the books
- `vendor_name = 'STOCK ADJUSTMENT (not a real vendor)'`, `vendor_id = NULL`
  → matches no vendor, so it creates no payable in the vendor ledger
- `purchase_date = 2026-04-01` (FY start). Originally dated 2026-07-14, which surfaced
  them in the Today feed as ₹0 purchases. Backdated because a reconciliation *is* an
  opening balance, not something that happened today. Date does not affect stock — the
  trigger sums quantities and ignores dates.

| Item | Qty added | Stock now |
|---|---|---|
| Potash (MOP) | 5 | 14 |
| Urea | 64 | 105 |
| DAP | 42 | 10 |
| Diesel | 899.99 | 314 |
| Wheat Seeds | 530 | 0 |
| Sugarcane Setts | 400 | 0 |
| Paddy Seeds PR 13 | 80 | 0 |
| Zinc Sulphate | 15 | 0 |
| Mustard Seeds | 10 | 0 |

`cost_per_unit` (weighted average cost) was deliberately **not** touched, so crop costing
and P&L remain correct.

## What is still wrong

Quantities are right; **the money is not.** The deleted purchases carried real prices and
real vendors, so that spend is still missing from the vendor ledger and your outstanding
payables are understated. Only re-entering the actual bills fixes that.

Recovery leads:
- Bill scans survive in Storage under `inventory-docs/bills/` (deleting DB rows does not
  delete uploaded files). Dated 25–29 Jun and 6 Jul.
- Check Supabase Dashboard → Database → Backups. If PITR or a daily backup predates the
  deletion, restore to a branch and lift the original `inventory_purchases` rows out —
  that recovers exact quantities, prices, vendors and dates with no retyping.

## How to revert

Deleting the marked rows is enough — the trigger recomputes stock automatically.

```sql
DELETE FROM inventory_purchases WHERE invoice_number = 'STOCK-ADJ-20260714';
```

To confirm the original (broken) state is back:

```sql
SELECT name, current_stock FROM inventory_items WHERE current_stock < 0 ORDER BY current_stock;
-- expect: Diesel -585.99, Wheat Seeds -530, Sugarcane Setts -400,
--         Paddy Seeds PR 13 -80, DAP -32, Zinc Sulphate -15, Mustard Seeds -10
```

When the real bills are entered, delete the marked rows **in the same sitting** — otherwise
the quantities double-count.

## Also found, not fixed

Ten duplicate `inventory_bills` headers for invoice **4017** (₹37,850, 2026-06-24,
NEW ANKUR BEEJ BHANDAR) with zero line items — almost certainly a repeated submission.
Harmless to money (the vendor ledger reads line items, not headers) but they are junk.

## Code bugs behind this

1. `deletePurchase` in `frontend/src/store/index.js` deletes a purchase with no warning
   that it will drive stock negative, and no guard against it.
2. The same file writes `current_stock` by hand on purchase/issue, using
   `Math.max(0, ...)` on issue. That fights the trigger and *temporarily hides* negative
   stock — which is why this went unnoticed. Those manual writes are redundant; the
   trigger is the sole authority.

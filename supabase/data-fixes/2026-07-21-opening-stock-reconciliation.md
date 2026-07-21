# 2026-07-21 — Opening-stock reconciliation (Pallia Farm)

**Farm:** Pallia Farm `ac8bef13-cf21-4849-b939-a2315e2863cc`
**Project:** `blyazwadtftokhjgdkvc` (test)

## Problem

The app had **211 inventory issues** logged (206 real, dated 2026-03-15 → 2026-07-17,
plot-attributed) but the matching **opening stock / purchases were missing**, so
`current_stock = sum(purchases) − sum(issues)` had gone **negative** across many items
(DAP −32, Diesel −585.99, Wheat −530, Sugarcane −400, etc.) and understated others
(Urea 33.5 vs real 128).

On top of that, **5 farm-wide `historical_correction` issues dated `2024-01-01`**
(cost ₹0) were a prior manual hack that pushed balances further negative.

Physical counts (owner, 2026-07-21): **Urea 128, DAP 10, Potash 14, Diesel 314** bags/L.
Consumed seasonal seeds assumed **0** on hand.

## Fix (Option A — honest reconstruction, anchored to physical count)

Chosen over "wipe all issues" so the 206 real plot-level issue costs are preserved.

1. **Deleted** the 5 `historical_correction` hack issues (see restore block below).
2. **Inserted** backdated `OPENING-STOCK` purchases (books start `2026-03-31`) to bridge
   each item to its physical count:
   - Urea +31.5 bag @ ₹352
   - Potash (MOP) +5 bag @ ₹1,950
   - Paddy Seeds PR 13 +30 kg @ ₹70
   - Wheat +120, Sugarcane Setts +400, Zinc Sulphate +15, Mustard +10 (priced at each
     item's own recorded issue cost) → consumed seeds reconciled to 0.
   - DAP needed nothing — removing the hack alone landed it at exactly 10.
3. **Diesel** would not reconcile by addition (after the hack it sat at 414 vs physical
   314 — the app is missing ~100 L of real consumption, not a purchase). Booked a
   labelled `opening_reconciliation` issue of **100 L @ ₹0** dated 2026-03-31 to land on
   314. **Follow-up:** replace with the real diesel consumption records if wanted.

Result verified: Urea 128, DAP 10, Potash 14, Diesel 314.01, all seeds/sprays 0, no
negatives remain.

## Restore (if this fix ever needs reverting)

Re-insert the 5 deleted correction issues and remove the opening entries:

```sql
-- re-create the 5 deleted historical_correction issues
INSERT INTO inventory_issues (id, item_id, issue_date, quantity, cost_per_unit, purpose, stage, farm_id)
SELECT v.id::uuid, it.id, DATE '2024-01-01', v.qty, 0, 'historical_correction', 'farm_wide', it.farm_id
FROM (VALUES
  ('3b2b6a4a-413e-486b-a925-91423788ff92','DAP',42.0),
  ('7a60c322-ec1e-4da0-a9cf-49a592d9ef4b','Diesel',1000.0),
  ('44abbffb-d704-4f53-96c2-7731988b0179','Paddy Seeds PR 13',50.0),
  ('6382d578-dd37-4bf4-a510-5e358a22845c','Urea',63.0),
  ('ed8800a9-9671-4d88-b761-11a20dacf1d7','Wheat Seeds',410.0)
) AS v(id,nm,qty)
JOIN inventory_items it ON trim(it.name)=v.nm AND it.farm_id='ac8bef13-cf21-4849-b939-a2315e2863cc';

-- remove the opening-stock entries added by this fix
DELETE FROM inventory_purchases
WHERE invoice_number='OPENING-STOCK' AND purchase_date=DATE '2026-03-31'
  AND farm_id='ac8bef13-cf21-4849-b939-a2315e2863cc';
DELETE FROM inventory_issues
WHERE purpose='opening_reconciliation' AND issue_date=DATE '2026-03-31'
  AND farm_id='ac8bef13-cf21-4849-b939-a2315e2863cc';
```

## Still open (separate task)

- **Crop opening cost (`crop_cycles.opening_cost`, migration 0018):** most standing-crop
  cost is already captured via the 206 real issues; opening_cost only needs to cover
  pre-2026-03-15 spend. Not done here.
- **Diesel 100 L** reconciliation entry — replace with real consumption if available.

# 2026-08-06 — Bill #4237, the spray machine that was off the books (Pallia Farm)

**Farm:** Pallia Farm `ac8bef13-cf21-4849-b939-a2315e2863cc`
**Project:** `blyazwadtftokhjgdkvc` (test)
**Requires:** migration `0023_capital_purchases_on_bills.sql` applied first — this
fix writes `machinery_master.bill_id`, which does not exist before it.

## Problem

Bill #4237 from NEW ANKUR BEEJ BHANDAR, dated 2026-07-11, is ₹13,060 on paper:

| Line | Qty | Rate | Amount | Where it went |
|---|---|---|---|---|
| F gold | 11 | 480 | 5,280 | `inventory_purchases` ✓ |
| Chempa | 11 | 180 | 1,980 | `inventory_purchases` ✓ |
| ROUND OFF FOR ALL WEED | 2 | 400 | 800 | `inventory_purchases` ✓ |
| Small spray machine | 1 | 5,000 | 5,000 | `machinery_master` — unlinked |

The bill photo was attached to the whole document, but only the three fertiliser
lines were entered as purchases. The sprayer was entered separately in Machinery
(`8820d84c-d095-4893-8cea-2d81ecf9c3d8`, "Small sprey machin", 2026-07-11,
₹5,000) where there was no vendor column and no bill column to fill in.

Consequences:

- `inventory_bills.total_amount` read **₹8,060** for a **₹13,060** document.
- Ankur's balance read **₹127,390** against a true payable of **₹132,390**. No
  payment could ever settle the missing ₹5,000, because nothing owed it.
- The ₹5,000 appeared in no expense ledger and no cash book.

## Fix

Migration 0023 makes the bill header the vendor's debit and gives machinery a
`bill_id`. This backfills the one bill that exposed it.

```sql
-- 1. The sprayer belongs to bill #4237, bought from Ankur.
update machinery_master
   set bill_id   = '4f486d75-00bd-481d-91a2-a4e11ab7b9ba',
       vendor_id = '98f0995f-6cf5-4afb-a352-e2bb40ce391f'
 where id = '8820d84c-d095-4893-8cea-2d81ecf9c3d8';

-- 2. The header now states what the paper states.
update inventory_bills
   set total_amount = 13060.00
 where id = '4f486d75-00bd-481d-91a2-a4e11ab7b9ba';
```

## Verify

```sql
-- Expect 13060.00, and 132390.00
select total_amount from inventory_bills where invoice_number = '4237';
select balance_due   from v_vendor_balances where vendor_name = 'NEW ANKUR BEEJ BHANDAR';

-- Expect one row: Small sprey machin, 5000.00, is_capitalised = false
-- (₹5,000 is under the ₹10,000 default threshold, so it is expensed in July.)
select name, amount, is_capitalised, bill_invoice_number
  from v_capital_purchases where bill_id = '4f486d75-00bd-481d-91a2-a4e11ab7b9ba';
```

## Restore

```sql
update machinery_master set bill_id = null, vendor_id = null
 where id = '8820d84c-d095-4893-8cea-2d81ecf9c3d8';
update inventory_bills set total_amount = 8060.00
 where id = '4f486d75-00bd-481d-91a2-a4e11ab7b9ba';
```

## Not fixed here

Other bills may have the same shape — a capital line entered separately from the
document it was bought on. There is no way to detect them automatically; they
surface when a vendor's balance disagrees with the paper. From now on the
Purchase Bill screen can tag a line as machinery or asset, so new bills record
whole.

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

## Second problem, found while checking the first

Ankur's bill headers sum to **₹505,890** against **₹127,390** of purchase lines.
Ten duplicate headers for invoice **4017**, each ₹37,850, each with **zero
lines**, created 2026-06-26 between 15:55:29 and 16:19:49 — ten retries of a
save that kept failing. The real 4017 saved the next morning (2026-06-27
07:59) with its 4 lines. 10 × 37,850 = ₹378,500, and 505,890 − 378,500 =
127,390 exactly. Every genuine bill's header matches its lines to the paisa.

`recordBillPurchase` wrote the header first and the lines after, with no
transaction. A failing line left the header behind, and each retry left
another. Invisible while the vendor balance was summed from lines — **and
₹378,500 of phantom debt the moment migration 0023 makes headers the debit.**

Fixed in three places: the retry loop can no longer leave a header
(`recordBillPurchase` deletes it when nothing was written), `v_vendor_balances`
ignores a header with no lines at all, and the ten already there are deleted
below.

## Fix

Migration 0023 makes the bill header the vendor's debit and gives machinery a
`bill_id`. Run it first, then all of this.

```sql
-- 1. The ten empty headers for invoice 4017. Deletes only headers with no
--    lines of any kind, so it cannot touch a real bill. Expect DELETE 10.
delete from inventory_bills b
 where b.invoice_number = '4017'
   and b.bill_date = '2026-06-24'
   and not exists (select 1 from inventory_purchases p where p.bill_id = b.id)
   and not exists (select 1 from machinery_master    m where m.bill_id = b.id)
   and not exists (select 1 from farm_assets         a where a.bill_id = b.id);

-- 2. The sprayer belongs to bill #4237, bought from Ankur.
update machinery_master
   set bill_id   = '4f486d75-00bd-481d-91a2-a4e11ab7b9ba',
       vendor_id = '98f0995f-6cf5-4afb-a352-e2bb40ce391f'
 where id = '8820d84c-d095-4893-8cea-2d81ecf9c3d8';

-- 3. The header now states what the paper states.
update inventory_bills
   set total_amount = 13060.00
 where id = '4f486d75-00bd-481d-91a2-a4e11ab7b9ba';
```

The ten deleted headers each carried a bill photo. Those files stay in Storage,
unreferenced — they are copies of the same 4017 bill, which the surviving
header still has.

## Verify

```sql
-- Expect 13060.00, and 132390.00
select total_amount from inventory_bills where invoice_number = '4237';
select balance_due   from v_vendor_balances where vendor_name = 'NEW ANKUR BEEJ BHANDAR';

-- Expect 0 rows: no header anywhere without at least one line behind it.
select b.invoice_number, b.total_amount from inventory_bills b
 where not exists (select 1 from inventory_purchases p where p.bill_id = b.id)
   and not exists (select 1 from machinery_master    m where m.bill_id = b.id)
   and not exists (select 1 from farm_assets         a where a.bill_id = b.id);

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

The ten deleted headers are not restorable from here — they held no information
beyond a duplicated total, and their ids were:

```
eef98663-f378-4bdd-a1a7-8d5acb3228f7  1a5acf90-b929-4496-be40-536c0c818cac
f2f528f4-944a-43e4-9d33-3a1a17db2e88  4d41aa3f-bfa5-4703-b390-80bce375b00b
064c4130-d308-4b80-842b-33b980b2d724  ca02ce3f-dbd2-482b-a644-281e3e9df8bc
2bc5b5d8-df02-4710-b054-de1aa53d5820  e90cdc06-b98d-4c41-8be6-97dc1de6f794
d8af84f7-144c-4d8c-94d4-b7bb6fbc94d8  4edc1fd7-4460-4ac9-9b6f-c41e1d279b2b
```

## Not fixed here

Other bills may have the same shape — a capital line entered separately from the
document it was bought on. There is no way to detect them automatically; they
surface when a vendor's balance disagrees with the paper. From now on the
Purchase Bill screen can tag a line as machinery or asset, so new bills record
whole.

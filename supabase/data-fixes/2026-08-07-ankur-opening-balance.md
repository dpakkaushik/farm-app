# 2026-08-07 — Reconciling NEW ANKUR BEEJ BHANDAR to the shop's khata (Pallia Farm)

**Farm:** Pallia Farm `ac8bef13-cf21-4849-b939-a2315e2863cc`
**Vendor:** NEW ANKUR BEEJ BHANDAR `98f0995f-6cf5-4afb-a352-e2bb40ce391f`
**Requires:** migrations `0023` and `0025` applied. Both were, before this ran.

## Problem

The shop's khata totals **₹2,94,385** across 15 bills. The app showed
**₹2,34,666**. Three unrelated causes, found by comparing line by line.

### 1. Five bills predate the app — ₹67,770

Bills 3815 (02.06), 3834 (04.06), 3867 (07.06), 3899 (11.06) and 3916 (13.06)
were bought before the farm started using the app. Four of them exist nowhere in
the database. Migration 0025 adds `vendors.opening_balance` for exactly this.

But the opening balance must cover only what the app **doesn't** have — and
bill 3899 turned out to be in the app already (below). So the lump is the other
four: 1,640 + 40,500 + 2,400 + 11,040 = **₹55,580**, not ₹67,770.

> **The rule for every other party:**
> `opening balance = paper balance − what is already correctly in the app`.
> Set the lump first and anything already entered is counted twice.

### 2. Bill 3899 was entered correctly but belonged to nobody — ₹12,190

Two purchase lines, right quantities, right prices, adding to the paper's
₹12,190 exactly:

| Item | Qty | Rate | Amount | Typed vendor name |
|---|---|---|---|---|
| Super Fit | 23 | 350 | 8,050 | `New Ankur Beej Bhandar` |
| Chempa | 23 | 180 | 4,140 | `New Ankur Beej Bhandar ` ← trailing space |

Both had **`vendor_id = null`** — the bill screen's "Other (type below)" option
saves the typed text and creates no party, so the debt existed nowhere.

Worse, the two lines behaved differently. `VendorTab` falls back to matching a
purchase to a party by name (`p.vendor.toLowerCase() === v.name.toLowerCase()`,
**no trim**), so the ₹8,050 line surfaced on Ankur's khata while the ₹4,140 line
— identical but for one trailing space — was invisible everywhere.

That name fallback is also why the screen and `v_vendor_balances` disagreed:
the view counts only real vendor ids, the screen adds name matches on top.

**Deleting these lines was considered and rejected.** The data is good; only the
vendor id was missing. Deleting would have dropped ₹12,190 out of the P&L for
goods genuinely bought and consumed this season, destroyed the line-item
history, and left `Super Fit` with issues and no purchase behind them. Repairing
reaches the same ₹2,94,385 and keeps all of it.

### 3. Bill 4551 was ₹1 over

`Agrowet plus sticker` at 1.52 × ₹1,300 = ₹1,976; the shop's bill says ₹1,975.
An ordinary round-off. Under 0023 the header is the debit — the vendor is owed
the document — so the header carries ₹36,475 and the ₹1 gap against its lines
is expected, not a failed save.

## Fix

```sql
-- 1. Bill 3899 gets the header it never had, and its lines get their party.
with new_bill as (
  insert into inventory_bills
    (farm_id, bill_date, vendor_name, vendor_id, invoice_number, total_amount, notes)
  values
    ('ac8bef13-cf21-4849-b939-a2315e2863cc', '2026-06-11',
     'NEW ANKUR BEEJ BHANDAR', '98f0995f-6cf5-4afb-a352-e2bb40ce391f',
     '3899 dt 11.06.26', 12190.00,
     'Header added 2026-08-07: lines existed with a typed vendor name and no vendor id, so the debt was invisible.')
  returning id
)
update inventory_purchases p
   set bill_id     = (select id from new_bill),
       vendor_id   = '98f0995f-6cf5-4afb-a352-e2bb40ce391f',
       vendor_name = 'NEW ANKUR BEEJ BHANDAR'
 where p.invoice_number ilike '%3899%'
   and p.vendor_id is null;

-- 2. The shop's round-off.
update inventory_bills set total_amount = 36475.00
 where invoice_number like '4551%';
```

Then, in the app — **Ledger → Party Ledger → ✏️ on the vendor**:
opening balance **55580**, as on **2026-06-13**.

## Verify

```sql
-- Expect 238805.00 before the opening balance is set, 294385.00 after.
select total_purchased, opening_balance, balance_due
  from v_vendor_balances where vendor_name = 'NEW ANKUR BEEJ BHANDAR';

-- Expect 0: no Ankur purchase line left without a party.
select count(*) from inventory_purchases
 where vendor_id is null and vendor_name ilike '%ankur%';

-- Expect only 4551, gap 1.00 — the shop's round-off. Anything else is a bug.
select b.invoice_number, b.total_amount - coalesce(p.amt,0) - coalesce(m.amt,0) as gap
  from inventory_bills b
  left join (select bill_id, sum(total_cost) amt from inventory_purchases
              where bill_id is not null group by bill_id) p on p.bill_id = b.id
  left join (select bill_id, sum(amount) amt from v_capital_purchases
              where bill_id is not null group by bill_id) m on m.bill_id = b.id
 where abs(b.total_amount - coalesce(p.amt,0) - coalesce(m.amt,0)) > 0.01;
```

Result at time of writing: **₹2,38,805**, becoming **₹2,94,385** once the
₹55,580 opening balance is entered. Matches the shop to the rupee.

## Not fixed here — the same disease, other shops

₹1.26 lakh of purchases still carry no `vendor_id`, so that debt is invisible or
half-visible. Each needs a real party, its purchases repointed, and only then an
opening balance for whatever remains:

| Typed name | Amount | Note |
|---|---|---|
| `Dhaliwal filling station ` | 42,306 | trailing space — invisible even to the name fallback |
| `HP Petrol Pump` | 27,600 | no vendor record |
| `Ram Fertilizers` | 25,850 | no vendor record |
| `Arun Seeds` | 25,000 | no vendor record |
| `New vendor` | 5,500 | bill 432, 07.08.26 — may have been a cash purchase |

(`Stock Correction` ₹1,02,225 and `Opening balance` ₹33,963 are deliberate
markers with no party behind them. Leave them.)

**Two root causes remain open**, and they will keep producing this:

1. "Other (type below)" on the purchase-bill screen creates no party, so the
   payable silently vanishes. It should create the vendor, or say plainly that
   nothing will be owed.
2. `VendorTab` matching purchases to parties by untrimmed name means the screen
   and `v_vendor_balances` answer "what do I owe" differently. There should be
   one answer.

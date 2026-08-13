# 2026-08-13 — Phase 4: the owner's stated figures replace every placeholder (executed)

**Farm:** Pallia Farm `ac8bef13-cf21-4849-b939-a2315e2863cc`
**Source:** the owner's sheet *EXPENSES DETAILS 1.04.26 TO 31.07.26*, which he states is
his complete data since April.
**Plan:** `C:\Users\Admin\.claude\plans\this-is-the-data-gentle-stardust.md`

Every opening figure in the app was derived from a partial backfill and always labelled a
placeholder. This replaces them with the owner's own numbers. Ran as two transactions,
each asserting its result against the sheet and rolling back on any mismatch.

## The discovery that shaped this pass

**The app was storing entry dates as bill dates.** The bill-date picker defaults to today
and was never changed, so everything typed on 6–7 August carries a 7-Aug date. The real
dates are inside the invoice numbers the owner typed (`4348/19.07.26` = bill 4348 of
19 July). `git log --since=2026-08-05 --until=2026-08-09` confirms 6–7 Aug is exactly when
the *abandoned* "match every historical record" approach was being built
(`a bill is one debt to the party`, `pre-app crop spend is itemised`, the Ankur
reconciliation). **Those rows are pre-August data wearing August dates.**

## Phase A — delete the abandoned 6–7 Aug backfill

Archived to `go_live_archive` batch (3rd batch for this farm) before any delete.

| Table | Rows | Amount |
|---|---|---|
| `inventory_issues` | 67 | ₹1,12,348 (₹1,10,748 was charged to cycles) |
| `inventory_purchases` (non-OPENING-STOCK) | 14 | ₹1,04,226 |
| `inventory_bills` | 6 | 5 Ankur ₹98,725 + "New vendor" 432 ₹7,500 |
| `vendor_payments` | 1 | ₹1,000 |
| `expense_payments` + `farm_expenses` | 1 + 1 | ₹100 medicine, "Medical store xyz" |
| `owner_cash_entries` | 2 | the two above |

**Kept:** 51 attendance rows (1–8 Aug) — genuine August operating data, asserted unchanged.
The 6 `OPENING-STOCK` purchases dated 2026-03-31.

Both inventory triggers (`trg_sync_stock_on_purchase`, `trg_sync_stock_on_issue`) fire on
DELETE, so `current_stock` self-corrected: stock is now exactly the 6 opening rows.
`farm_assets.bill_id` is SET NULL, so the "Sepre machine" survived bill 432's deletion —
asserted explicitly.

## Phase B — the stated figures

### Cash — ₹11,979, was ₹1,34,330

The sheet's `CASH IN HAND 11,979 CR`. With no cash entries left, the cash book both opens
and closes at ₹11,979 on 1 Aug. **Bank is still ₹0 — the owner said he will supply it.**

### Ankur — ₹2,94,385, was ₹1,95,160

The shop's khata upto 31.07.26. Ties exactly, and it is the only vendor carrying a balance
(asserted). Two things had to be resolved to make it tie:

- The five Ankur bills the app dated 7 Aug (₹98,725) are July paper → deleted in Phase A,
  their debt now inside the opening. Owner's ruling: "delete all… we can still make
  entries between 1 aug to 13 aug, there won't be many."
- **The ₹5,000 gap flagged in the plan turned out to be real.** A "Small Spray Machine",
  ₹5,000, bought **11 July** from Ankur, sat in `machinery_master` with `vendor_id` set and
  no bill, so `v_vendor_balances` raised a payable *beside* the opening. The machine's debt
  is inside the ₹2,94,385, so `vendor_id` was detached (row archived as
  `machinery_master_vendor_detached`). The machine stays in the asset register, and being
  pre-go-live and non-capitalised it is already excluded from `v_expense_ledger` by 0030 §5.

### Workers — net −₹55,888, was +₹52,799

The sheet is authoritative: negative/DR = the worker owes the farm. A ₹1,08,687 swing in
sign, not just size. Three were already right (Harinder −7,346, DEEPAK −13,933,
Gambhira −13,495).

| Worker | was | → sheet |
|---|---|---|
| Ram Bachan | +9,210 | −1,790 |
| Phool Chand | +18,500 | 0 |
| Krishna | +9,107 | 0 |
| Chote Lal | +10,751.01 | −6,003 |
| Deena | −10,031 | −20,825 |
| Ram Darash | +14,845 | +4,561 |
| Kailash | +9,003 | −97 |
| Vikram | +7,080 | +3,080 |
| Jhingur | −2,025 | −2,125 |

Zeroed (absent from the sheet, so they hold nothing): Shiv Kumar (−2,500), Chhote lal wife,
Kailash wife, Ramnaresh wife (+300 each).

**Ram Naresh duplicate:** `Ram Naresh ` (trailing space, `9ff70315…`) carries the 4 August
attendance rows, so it keeps the sheet's **+₹2,085**. The idle row `Ram Naresh`
(`d0000001-…-0002`) was asserted to have no attendance/advances/payments and set to **0** —
zeroed rather than deleted, because "same person" is an inference. Delete it from
Admin → Manpower if it is a duplicate.

> `v_salary_dues` shows net **−₹40,595**, not −₹55,888. That is correct: it adds ₹15,293 of
> August accrual from the 51 attendance rows on top of the openings. The first run of
> Phase B asserted the wrong one of these two and rolled back — the openings are what the
> sheet states.

### Crop opening costs — cane ₹8,80,533, paddy ₹4,72,833

75 breakup rows across all 15 cycles, split **pro-rata by acres** (owner's choice),
superseding the 54 derived placeholder rows.

Nomenclature, per the owner's correction: on the cane sheet **`EXP. LABOUR STAFF` is the
regular labour** (crop work) and `LABOUR CANE SOWING` is outside/contract labour — both are
the `labour` category. **`FARM STAFF` is the cook, driver etc.** and is *not* crop-related.

| Category | Cane | Paddy | Total |
|---|---|---|---|
| fertilizer | 1,13,115 | 68,660 | 1,81,775 |
| seed | 2,38,000 | 21,250 | 2,59,250 |
| labour | 1,31,943 | 1,07,705 | 2,39,648 |
| chemical | 3,05,785 | 1,92,010 | 4,97,795 |
| fuel | 91,690 | 83,208 | 1,74,898 |
| **Total** | **8,80,533** | **4,72,833** | **13,53,366** |

Cane is ₹28,404.29/acre over 31.0 acres (4 Sugarcane 17.5 + 3 Ratoon 13.5); paddy is
₹17,842.75/acre over 26.5 acres. The two HSD figures do not overlap — the cane block's
₹91,690 is cane's diesel, the separate 900 L / ₹83,208 is paddy's (owner confirmed).
Paisa remainders land on the largest plot of each crop so the totals tie exactly.

### Farm staff salary ₹1,69,166 — deliberately no entry

Paid money for the five permanent staff, Apr–Jul. The owner's rule is "no past entries in
the ledger": its effect is already the reason cash is down to ₹11,979, and anything still
unpaid is inside the per-person openings above. From August, attendance drives the accrual.
**Accepted consequence:** this ₹1.69 L never appears as an expense in any report, because
it belongs to before the books start.

## Verification (asserted inside the transactions)

Cane ₹8,80,533 · paddy ₹4,72,833 · every cycle's lump equals its breakup · 15/15 itemised ·
zero `unspecified` lines · worker openings −₹55,888 · Ankur ₹2,94,385 and no other vendor
carrying a balance · cash closes ₹11,979 · attendance still 51 rows · bills/issues/cash
entries all zero · 6 purchases (OPENING-STOCK only).

## Still open

1. **Bank balance at 31 July** — owner to supply; currently ₹0.
2. **Opening stock at 1 August.** Deleting the July purchases dropped 12 items to zero
   stock; only the 6 OPENING-STOCK items remain (Urea 128, Diesel 314.01 L, Potash 14,
   DAP 10, Aravali 9, Orme 0.01). Anything bought in July and still on the shelf — Chempa
   25 was the largest — now shows zero. **The owner must state his 1-Aug count.** Note the
   900 L HSD on the sheet is diesel *consumed*, not stock on hand.
3. **Plot H paddy = ₹71,371** under flat pro-rata, but it was sown **16 July**, six weeks
   after the other paddy (15 June), so it cannot have taken a full share of fertiliser,
   pesticide and diesel. Its only known real cost is the ₹16,000 contract sowing.
   Worth restating in Admin → Cycles.
4. **"Sepre machine" ₹2,000** (`farm_assets`, `purchase_date` 2026-08-07,
   non-capitalised) — its bill is gone, so it now shows as an August expense with no
   payable behind it. Confirm whether it was really bought in August.
5. **The ₹100 medicine expense was deleted** with the rest of the 7-Aug batch. Re-enter it
   if it was genuine August spending.
6. **The bill-date form fix is the next work** (owner chose "data first, form after"):
   entry date shown read-only, bill date editable from a calendar, bills displayed as
   `bill no. / bill date`. Until it ships, every new bill repeats this mis-dating.
7. **Animal and tree opening balances** — owner says later.

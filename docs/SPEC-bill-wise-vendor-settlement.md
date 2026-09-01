# Bill-wise vendor settlement + the vendor bill-list export

**Asked 2026-09-01.** Two connected requests, spec'd here so they can be built in a fresh
session (this one is expensive — scanned pages in context).

---

## 1. The problem with today's Pay Vendor

`PayVendorModal` ([`pages/LedgerPage.jsx`](../frontend/src/pages/LedgerPage.jsx)) takes a vendor
and an **amount**. Nothing says which bills that amount settles. His words:

> "lets say we settle 50000 and there was one 50000 bill and two 20k bills and one 10k bill —
> how app will know which bill to clear? only one 50k bill or 3 bills 2×20k+10k?"

It cannot know, and today it does not try: the payment lands against the vendor as a lump and
the khata shows a running balance only. There is no per-bill status anywhere.

## 2. What to build

### Data
New table **`vendor_payment_allocations`**: `id, farm_id, payment_id → vendor_payments,
bill_id → inventory_bills (nullable), amount`. RLS + the four policies like every other table.

- `bill_id NULL` = **on account** — money paid that the user did not pin to a bill. Keeps a
  part-payment legal without forcing a fake allocation.
- A bill's **paid** = `sum(allocations.amount)` for it; **outstanding** = `total_amount − paid`;
  status = unpaid / part / paid. Derive it, never store it — the same rule the rest of this app
  follows for balances.
- Invariant, enforced in the write function: `sum(allocations) = vendor_payments.amount`. One
  database function writing payment + allocations + cash entry **in a single transaction** —
  see the atomicity defect already logged in CLAUDE.md (a salary payment once wrote half).

### The modal
Pay Vendor becomes: vendor → **a list of that vendor's open bills**, each row showing
`bill no · date · amount · already paid · outstanding` with a checkbox. Ticking rows adds them
up and shows the **combined total beneath the list**; the amount field prefills with that total
and stays editable.

- Pay the exact total → each ticked bill closes.
- Pay less → fill the ticked bills oldest-first, and the shortfall stays as part-payment on the
  last one. Show that in words before saving ("₹10,000 will stay on bill 4725"), the way
  `recoveryOutcome` already narrates a part recovery in Labour.
- Pay more → the surplus is written as one `bill_id NULL` row (on account) and named as such.
- Tick nothing → the whole payment is on account, which is exactly today's behaviour, so
  nothing that exists breaks.

### The khata
Each bill row in `purchasesAsBillRows` gains a status pill (Unpaid / Part ₹X / Paid) and its
outstanding figure. The vendor's Balance Due stays as it is — computed in the database — so the
detail and the total still cannot disagree.

## 3. The dependency he needs to know about

**Bill-wise settlement only reaches the bills the app holds.** For Ankur that is three August
bills, ₹51,195. The other **₹2,94,385 is a single opening-balance lump with no bills behind
it** — so 85% of what he owes cannot be ticked, and the feature is half useless until the 18
bills on his sheet (BILL 3815 of 02.06.26 through BILL 4850 of 23.08.26) exist as records.

Two ways, pick one before building:

| | How | Cost |
|---|---|---|
| **A. Enter the 18 bills properly** (recommended) | Each as an `inventory_bills` row dated correctly, opening balance dropped to 0. Every bill becomes tickable; the khata reads like his register. | Re-keying 18 bills; must reconcile to exactly ₹3,45,580 first — see the ₹9,600 / ₹21,470 question below |
| B. Leave the lump | Show it as one pseudo-row "Opening balance (before the app)" that can be ticked and part-paid | Cheap, but the register never itemises and he keeps two sources of truth |

**Reconcile first, either way.** His list totals ₹3,45,580 highlighted. The app holds opening
₹2,94,385 + three bills ₹51,195 = the same ₹3,45,580. But his August lines are 4703 ₹9,600 ·
4725 ₹24,625 · 4850 ₹5,100 plus an unlabelled ₹21,470, and the app's three bills are ₹24,625
(dated 08.08) · ₹5,100 (10.08) · ₹21,470 (23.08). So **bill 4703's ₹9,600 is inside the opening
lump, and the app's bill dates are each one line off his**. Settle that before entering
anything, or the itemised khata will disagree with his register bill by bill even though the
totals match.

## 4. The export

His register photo is the shape: vendor name, then one line per bill —
`BY BILL NO.3815 DT 02.06.26 FOR PADDY PLANT … 1,640.00` — and the total at the foot.

Add a **⤓ on the vendor khata** and on the Vendor tab head: one `.xlsx` (the app already
depends on `xlsx`), **one sheet per vendor**, columns `S.No · Bill No · Date · Particulars ·
Amount · Paid · Outstanding · Status`, an opening-balance row first where one exists, and a
TOTAL row that ties to Balance Due. A first sheet listing every vendor with its balance makes
the workbook answer "who do I owe" as well as "what for" — that is the "for all vendors" half
of the ask.

## 5. Verification

- Ankur's khata lists his three August bills, each tickable, statuses correct.
- Pay ₹50,000 against 50k+20k+20k+10k selections and confirm the allocation matches what the
  modal said it would.
- A part payment leaves the right bill part-paid and the rest untouched.
- Vendor Balance Due is unchanged by the whole feature (allocations move nothing, they only
  explain what a payment settled).
- The workbook's TOTAL per vendor equals that vendor's Balance Due.

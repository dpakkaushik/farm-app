# Cash Flow statement — design

**Date:** 2026-08-10
**Status:** approved, ready for implementation planning
**Context:** `docs/HANDOFF-2026-08-10b.md` (the decision to build Cash Flow and not Trial Balance)

---

## What this is

A Cash Flow statement for the Farm App Ledger, direct method: actual cash movements
grouped into Operating, Investing and Financing. It answers "where did the farm's cash
come from and where did it go" for a financial year.

It is built from `owner_cash_entries` (via the existing `v_cash_book` view), which is
already the record of every rupee that moved. Nothing new is recorded; this is a
regrouping of what exists.

**Audience:** both the owner and the director/CA. One screen serves both — standard
section headings so it survives being shown to an accountant, plain-English wording and
drilldown so the owner can use it.

## Why direct and not indirect

The indirect method starts from profit and adjusts for non-cash items using an opening
and closing balance sheet. Those balance sheets do not exist and are blocked on three
figures only the owner has (land value, loans, owner capital). The direct method needs
none of that — every cash entry already carries an `entry_type` that says what kind of
movement it was.

---

## Placement

A view toggle under the existing **Cash Book** tab: `Entries | Cash Flow`.

Not a sixth tab. Cash Flow is the same rupees as the Cash Book seen a second way, which
is the pattern already established when seven tabs became five — `Money In` carries
`Sales | Buyer Khata`, `Money Out` carries `Expenses | Party Khata`. It also keeps the
tab row at five items, which matters on a phone.

Reuses the existing `ViewToggle` component (`LedgerPage.jsx:445`).

---

## Classification — all 18 entry types

Every `entry_type` the codebase can write is listed. This table is total by construction:
anything not listed lands in **Unclassified** (see below).

### Operating — running the farm

| Display line | Entry types | Direction |
|---|---|---|
| Crop & cane sales | `crop_sale`, `cane_sale` | in |
| Livestock, trees & other income | `livestock_sale`, `residual_sale`, `revenue_receipt`, `tree_sale` *(fruit lease only)* | in |
| Paid to vendors | `vendor_payment` | out |
| Labour & salaries | `labour_payment`, `salary_payment`, `advance_payment` | out |
| Other farm expenses | `expense_payment` | out |
| Selling costs | `commission_expense`, `freight_expense`, `sale_deduction` | out |

### Investing — things that last

| Display line | Entry types | Direction |
|---|---|---|
| Timber sales | `tree_sale` *(timber only)* | in |

No entry type produces investing **outflow**. See "The capital-cash gap" below.

### Financing — owner & lenders

| Display line | Entry types | Direction |
|---|---|---|
| Owner money brought in | `owner_capital` | in |
| Owner money taken out | `owner_drawing` | out |

No loan entry types exist yet. When loans are added they belong here.

### Excluded from all three sections

| Entry type | Why |
|---|---|
| `transfer` | Moving money between the farm's own pockets. The pair nets to zero; it is not a flow into or out of the farm. |
| `opening_cash` | Not a movement. It is the statement's opening line — see the reconciliation rule. |

---

## Splitting `tree_sale`

`tree_sale` covers two economically different events. `trees.js` writes both under one
entry type, distinguished only by the notes prefix it generates:

- `Fruit lease — …` → farming income → **Operating**
- `Timber sale — …` → disposal of an asset → **Investing**

A timber sale can be large, so lumping it into farming income would overstate operating
cash.

The split reads that notes prefix. To avoid the same string living in two files, the
prefix becomes an exported constant in `lib/cashflow.js`:

```js
export const TIMBER_NOTE_PREFIX = 'Timber sale'
```

`trees.js` imports it and uses it when composing the note, so writer and reader share one
definition. No extra query and no schema change.

**Rejected alternative:** joining `tree_revenue.revenue_type` on `reference_id`. More
robust in principle, but it adds a query to the Ledger's boot path for a case with zero
rows in live data today. The shared constant removes the fragility that made the join
attractive.

---

## The capital-cash gap

When the farm buys a sprayer, the cash leaves as `vendor_payment`. In this app a payment
settles the **party, not the bill** — a settled architectural decision. Ankur's bill 4237
contains a ₹5,000 sprayer line inside a ₹13,060 bill; a ₹1,000 payment to Ankur cannot be
attributed to that line. So capital cash is not separable from operating cash.

The screen says so rather than faking precision:

1. Investing outflow shows **₹0** with one sentence: *"No capital cash can be shown
   separately — a payment settles the vendor, not the individual bill."*
2. Below it, a visually distinct **memo box** headed *"memo, not cash"*: capital items
   billed in the period, from `v_capital_purchases` filtered on `is_capitalised = true`,
   with the sentence *"That cash sits inside 'Paid to vendors' above."*

The memo is excluded from every total. It is a bills figure shown next to a cash
statement, clearly labelled as such, so that a reader who expects an Investing section
gets an honest explanation instead of a blank.

**Explicitly rejected:** apportioning vendor payments across capital and operating bill
lines. It would produce a precise-looking number that is not true.

---

## Reconciliation — the correctness rule

```
Opening cash  +  Operating  +  Investing  +  Financing  =  Closing cash
```

This must equal the Cash Book's closing balance for the same period. A computed badge
shows `✓ matches Cash Book` in green, or the discrepancy in red — never a decorative tick.

**Opening cash depends on the period filter, and `opening_cash` entries must never be
dropped:**

| Filter | Opening cash is |
|---|---|
| A specific financial year | `cashBookOpening` — the running balance before the FY start (already computed in `LedgerPage.jsx`) |
| `all` | The sum of `opening_cash` entries, which fall inside the range |

Because `opening_cash` is excluded from the three sections, failing to count it as opening
when the filter is `all` would leave closing cash short by exactly the opening balances.
This is the one arithmetic trap in the feature and it gets a test.

Figures are farm-total across all pockets, not per-account. Transfers are excluded, so a
per-pocket cash flow would mislead rather than inform.

---

## Unclassified — the safety valve

Any `entry_type` not in the table above is collected into a visible **Unclassified**
section, included in the reconciliation so the totals still tie, and never folded silently
into Operating.

The codebase writes 18 types today. When a nineteenth is added, this section makes it
loud. Without it, a new income type would quietly land in a wrong total and the statement
would be confidently wrong. This section is not optional.

---

## Screen layout

Figures below are the **real live data** — Pallia Farm's 23 entries as at 2026-08-10.
They double as the fixture for test 4.

```
Opening cash (all pockets)                                  ₹0
  No opening balance set — Cash in hand and Bank both
  open at zero, pending the go-live pass.

OPERATING — running the farm
  Crop & cane sales                                 ₹1,94,075   ›
  Livestock, trees & other income                           ₹0   ›
  Paid to vendors                                     −₹1,000   ›
  Labour & salaries                                 −₹1,04,200   ›
  Other farm expenses                                   −₹100   ›
  Selling costs                                       −₹5,545   ›
  ─────────────────────────────────────────────────────────────
  Cash from farming                                   ₹83,230

INVESTING — things that last
  Timber sales                                              ₹0   ›
  No capital cash can be shown separately — a payment
  settles the vendor, not the individual bill.
  ┌─ memo, not cash ──────────────────────────────┐
  │ Capital items billed this year        ₹5,000  │
  │ That cash sits inside "Paid to vendors" above │
  └───────────────────────────────────────────────┘
  ─────────────────────────────────────────────────────────────
  Cash from investing                                       ₹0

FINANCING — owner & lenders
  Owner money brought in                             ₹50,000   ›
  Owner money taken out                                    ₹0   ›
  ─────────────────────────────────────────────────────────────
  Cash from financing                                ₹50,000

Closing cash (all pockets)                          ₹1,33,230
                                    ✓ matches Cash Book
```

Arithmetic: `0 + 83,230 + 0 + 50,000 = 1,33,230`, which is the farm's current cash total.
`Labour & salaries` is ₹1,04,200 because it carries `advance_payment` (₹5,000) alongside
`labour_payment` (₹75,200) and `salary_payment` (₹24,000).

- Zero-value lines are shown, not hidden — an income line reading ₹0 is information.
- Each `›` expands the entries behind that line: date, particulars, account, amount.
  Reuses the existing expand pattern (`Particulars`, `LedgerPage.jsx:1015`).
- Section subtotals are labelled in plain words (*"Cash from farming"*), section headings
  in standard terms (*OPERATING*), so both audiences are served by one line each.
- Existing design language: `--c-card`, `--c-border`, `--c-muted`, `--c-faint`,
  `#1D9E75` for positive, `#E24B4A` for negative, `rounded-2xl`, `0.5px` borders.

---

## Files

| File | Responsibility |
|---|---|
| `frontend/src/lib/cashflow.js` **(new)** | Classification table, `TIMBER_NOTE_PREFIX`, and `buildCashFlow(entries, { openingCash })` → sections, lines, totals, reconciliation result. Pure — no React, no Supabase. |
| `frontend/src/pages/ledger/CashFlowTab.jsx` **(new)** | Presentation only. Props in, JSX out. Matches the `pages/livestock/`, `pages/today/` subdirectory pattern. |
| `frontend/src/pages/LedgerPage.jsx` | Add `cashBookView` state, the `Entries \| Cash Flow` toggle, and render `<CashFlowTab>`. Passes `cashBookFY`, `cashBookOpening`, `capitalPurchases`, `fy` — all already loaded. |
| `frontend/src/store/trees.js` | Import `TIMBER_NOTE_PREFIX` instead of the inline `'Timber sale'` string. |
| `frontend/src/lib/__tests__/cashflow.test.js` **(new)** | Unit tests, below. |

The Excel export lives in `LedgerPage.jsx` (~line 2100) and gains one **Cash Flow** sheet,
built from the same `buildCashFlow` output the screen renders — so the sheet and the screen
cannot disagree. Section headings, line labels, amounts, the memo box as a labelled block
below the totals, and the reconciliation line. No new export machinery.

Splitting the logic out of `LedgerPage.jsx` is deliberate: that file is already 2,406
lines with every tab inside it. The classification table belongs somewhere it can be read
in one screen and tested without mounting a component.

**No database changes. No new queries.** Everything consumed is already loaded by the
Ledger.

---

## Tests

Unit tests against `buildCashFlow`:

1. **Classification is total** — every one of the 18 entry types maps to a known section;
   nothing falls through to Unclassified unintentionally.
2. **An unknown type surfaces** — a fabricated `entry_type` appears in Unclassified and is
   still counted in the reconciliation.
3. **Transfers net to zero** — a transfer pair changes no section total and no closing cash.
4. **Reconciliation ties on real data** — the 23 live entries (net ₹1,33,230) reconcile
   opening → closing.
5. **`opening_cash` under the `all` filter** — counted as opening, not dropped, and the
   statement still ties. This is the trap named in the reconciliation rule.
6. **`tree_sale` splits** — a `Timber sale — …` note lands in Investing, a
   `Fruit lease — …` note in Operating.

Manual check after deploy: Cash Flow's closing figure equals the Cash Book's closing
balance for the same FY, and the badge is green.

---

## Out of scope for v1

| Cut | Why |
|---|---|
| Month-by-month trend columns | Neither audience asked for it; it is the expensive part. Add it when the yearly view is missed. |
| Balance Sheet | Blocked on land value, loans, owner capital — the three figures only the owner/director has. |
| Trial Balance | Deliberately not built. The app is not double-entry; a screen resembling a trial balance would prove nothing while inviting trust it has not earned. See the handoff. |
| Unifying payment-mode pickers | Flagged across `Labour.jsx`, `Expenses.jsx`, `livestock/ui.jsx`; the owner has not ruled. Not to be touched unprompted. |

---

## Known approximations, stated in the UI

1. **Capital cash is inside operating cash.** A payment settles the party, not the bill,
   so capital outflow cannot be separated. Shown as an explanatory note plus a memo box.
2. **A lump payment to a mixed-supply vendor cannot be split.** Same root cause. A vendor
   who sold both seed and a sprayer receives one payment; it is reported as operating.

Both are consequences of a settled architectural decision, not defects to be fixed inside
this feature.

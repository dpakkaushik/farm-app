# 2026-08-20 — the 19 Aug labour payment collapses to one cash entry

**Applied to production.** Archived first; reversible from `go_live_archive`
batch **`dcda331b-e7bb-479a-b08c-0f8eba954151`** (5th batch).

## Why

The code fix shipped the same day ([`docs/HANDOFF-labour-payment-grouping.md`](../../docs/HANDOFF-labour-payment-grouping.md))
made every *new* labour payment write one cash entry. It could not touch the
seven already written on 19 Aug, so the owner opened the Cash Book and saw the
complaint he had just had fixed:

> *"still showing as breakup? not a single entry — and make sure it is only about
> ledger otherwise the cost should split plot (crop cycle) wise only to see what
> cost each plot get"*

Both halves honoured: the **cash book** collapses, the **cost split does not**.

## What changed

`owner_cash_entries` — seven `labour_payment` rows dated 2026-08-19, all against
Cash in hand, all carrying the identical note `Labour — Contractual (Spray /
Pesticide)`:

| Kept / deleted | id | amount |
|---|---|---|
| **kept, rewritten** | `2956e1ab-…c67a0` | 1156.77 → **6519.98** |
| deleted | `21cd9839-…c672f` | 1051.61 |
| deleted | `b78c8058-…2ad76` | 736.13 |
| deleted | `f257951a-…f1985fe` | 1156.77 |
| deleted | `30c612a1-…c982838` | 1051.61 |
| deleted | `3ac7d9b8-…29f27c1` | 1051.61 |
| deleted | `16a29323-…8c2c6fd` | 315.48 |

The kept row is the group's **anchor** — its `reference_id` is
`081f5e65-73d5-47bd-9e8c-b766f5e3cd47`, the lexicographically first of the seven
`labour_logs` ids, which is exactly what `groupAnchorId()` in
[`lib/labourGroups.js`](../../frontend/src/lib/labourGroups.js) returns. So the
historic row and any row the app writes from now on key back the same way.

Its note was rewritten to what the new code would have produced:

```
Labour — Contractual (Spray / Pesticide) — 7 plots · 163 tanks @ ₹40 · work of 10 Aug
```

## What deliberately did NOT change

**The seven `labour_logs` rows.** Plot B ₹1,156.77 · Plot E1 ₹1,156.77 · Plot D,
C, E2 ₹1,051.61 each · Plot L ₹736.13 · Plot P ₹315.48 — all still `is_paid`,
all still carrying their own plot and crop cycle. That split is the only route to
per-plot and per-crop cost and it is not a bookkeeping artefact. Verified after
the fix: 7 rows, same figures.

## Assertions, before → after

| | before | after |
|---|---|---|
| Cash-in-hand net of all entries | −28,819.98 | **−28,819.98** (unchanged) |
| `labour_payment` cash rows | 7 | **1** |
| `labour_payment` total | 6,519.98 | **6,519.98** (unchanged) |
| `labour_logs` for 10 Aug | 7 | **7** (untouched) |
| rows in archive batch | — | 7 |

## To reverse

```sql
delete from owner_cash_entries where id = '2956e1ab-d9a0-4225-a027-330ff01c67a0';
insert into owner_cash_entries
select * from jsonb_populate_recordset(null::owner_cash_entries,
  (select jsonb_agg(row_data) from go_live_archive
    where batch_id = 'dcda331b-e7bb-479a-b08c-0f8eba954151'));
```

## Noticed while in here, not acted on

**Cash in hand is negative — ₹−16,841** (opening ₹11,979 less ₹28,820 of
payments). Cash cannot go below zero in a real box, so some of what was booked as
cash was paid from a bank account. Every labour payment before today was
hardcoded `paid_via: 'cash'` regardless of how the money actually moved — that is
the hole the payment-method picker closed for future payments, but it does not
correct the past ones. Ask the owner which of the pre-20-Aug payments came out of
a bank before treating the cash figure as real.

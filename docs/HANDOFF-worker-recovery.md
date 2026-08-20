# Recovering money from a worker

**Shipped 2026-08-20.** Second ship of the day, after the labour payment grouping.

## The question

> "lets say deepak is a laborer or staff which has a negative opening balance and
> he leaves the job how we gonna recover money from him?"
>
> "make way to recover money from a deactive or active staff or labourer"

The answer, before this shipped, was: **you cannot** — and it was worse than a
missing button, because the debt detached from the person.

## What was actually broken

Three holes, found by reading the live database rather than the code alone.

### 1. No door for money coming IN from a worker

Every route into the books was guarded against it:

| Route | Why it failed |
|---|---|
| A negative advance | `salary_advances_amount_check: amount > 0` |
| A negative salary payment | `owner_cash_entries_amount_check: amount > 0` |
| Add Cash Entry → "Revenue received" | Cash lands in the box but the worker's balance never moves — **and recovering an advance is not income** |

So a worker's debt could only ever grow.

### 2. Remove made the man vanish while his debt kept counting

`deletePermanentStaff` / `deleteRegularLabourer` set `status = 'inactive'`, and
`loadAll` only fetches `status in ('active','paused')`. So a removed worker
disappears from every screen — but **`v_salary_dues` has no status filter**, so his
balance keeps feeding the Ledger's dues total. Money owed by nobody you can name.

This was already live in a milder form: two *paused* workers are filtered out of
the Salary tab by `isActive !== false` while the Ledger still counts them.

### 3. The worker's own khata was folding the numbers wrongly

`openLedger` in the History overlay folded advances and payments with
`running + credit − debit`, where **credit was the salary paid**. Both an advance
and a salary payment are cash going out to the worker, so one of them had the wrong
sign — paying a man his wages made the farm appear to owe him **more**. It also left
out wages *earned* entirely, so its closing figure could never match the Ledger's
whatever the signs. Adding a recovery row to that ledger would have made the new
feature look broken.

## The live figures (20 Aug 2026, `v_salary_dues`)

| Worker | Type | Status | Owes the farm |
|---|---|---|---|
| Deena | regular | active | ₹25,425 |
| DEEPAK | permanent | active | ₹13,933 |
| Gambhira | regular | **paused** | ₹13,495 |
| Chote Lal | regular | active | ₹5,303 |
| Jhingur | regular | **paused** | ₹2,125 |
| Harinder | permanent | active | ₹1,139 |

**₹61,420 total, ₹15,620 of it behind people no screen would show you.**

Mostly opening balances — they were already over-drawn on the day the app started.
Deepak's ₹13,933 is *entirely* opening: his `monthly_salary` and `daily_base_rate`
are both **0**, so he accrues nothing and the debt could never work itself off
against wages. **Still worth the owner's eye — his salary looks simply never
entered** (Harinder is ₹10,000, Ram Bachan ₹11,000).

## What was built

### The mechanic: a negative advance. No new table, no view change.

`v_salary_dues` already computes

```
balance_due = opening + earned − advances − paid
```

so **subtracting a negative advance adds the money back**. Migration
[`0033_worker_recovery.sql`](../supabase/migrations/0033_worker_recovery.sql) is
therefore four lines: swap `amount > 0` for `amount <> 0`. The arithmetic was
already right; only the CHECK stood in the way. **The sign IS the record** — there
is no second table and no flag that could drift out of step with it. Zero stays
illegal: a row that moves no money is a mistake, not a recovery.

The cash side needed nothing at all — `owner_cash_entries` keeps `amount > 0` and
carries `direction` separately, so a recovery is a plain positive row with
`direction: 'in'`, `entry_type: 'advance_recovery'`.

**Proven on the live database before the UI existed**, both probes rolled back:
- a −13,933 row takes Deepak's `balance_due` from −13,933 to exactly **0**
- the full store write (negative advance + inbound cash entry) takes Jhingur to
  **0** and the cash book from 22,564.02 to **24,689.02**, exactly +2,125

### `lib/workerRecovery.js` — the whole of the logic, 32 tests

`isRecovery` · `splitAdvances` · `owedToFarm` / `owedToWorker` · `isSettled` ·
`canHideWorker` · `hiddenWithBalance` · `totalOwedToFarm` · `khataEvents` ·
`buildWorkerKhata`.

Two decisions worth keeping:
- **`SETTLED_TOLERANCE = 1`.** Balances carry paise (the pro-rata labour split left
  ₹6,519.98 in the cash book), so "settled" cannot mean exactly zero.
- **`monthEnd` is built from local date parts.** `toISOString()` would shift IST
  back past midnight and return the 27th of February — the same off-by-one
  `period.js` was bitten by. The test for it is in the file.

### The store

- **`recordWorkerRecovery`** — the mirror of `addAdvance`: one negative
  `salary_advances` row, one cash entry `direction: 'in'`. Takes `name` as an
  argument rather than looking it up, because **a worker who has left is not in the
  store at all** and his cash entry must still say who paid.
- **`workerBalance(id)`** — reads `v_salary_dues`, so it sees workers the store
  never loaded.
- **`assertWorkerSettled`** — called by both Remove paths. Refuses while money is
  owed **in either direction**: the farm owing an ex-worker unpaid wages is the same
  bug pointing the other way.

### The screens

**Manpower → Salary** is where the money comes back:
- **"⬇️ Recover"** on a worker's card, rendered **only when he owes something**, so
  the button explains itself. Prefilled with what `v_salary_dues` says is
  outstanding — not the card's month-scoped figure.
- **"No longer working"** — a new section built from `hiddenWithBalance(dues)`,
  catching paused and removed workers alike (one rule: `status !== 'active'`). This
  is the only screen that can see them and the only door to their money. Each row
  offers History and **Recover ₹X**, or **Settle ₹X** if the farm is the one that
  owes. Rebuilt from the dues row alone, so it needs nothing from the store.
- **"₹61,420 to recover from workers"** under the tab heading.
- The card's Balance label now says **"Worker owes" / "Farm owes"** instead of an
  ambiguous amber minus sign, and a **Recovered** cell joins the breakdown grid only
  when there is something in it.
- The **History overlay is now a true statement**: wages earned come in from
  `v_salary_accrual`, payments and advances both reduce what the farm owes, and a
  recovery is a credit. Its closing balance equals `v_salary_dues.balance_due`
  **by construction** — tested against Harinder's live −7,346 + 6,207 = −1,139.

**Admin → Manpower**: Remove now asks the balance *before* showing the confirm, so
an owner never clicks through to a dead end. Blocked, it says what is owed and where
to recover it — plus the escape hatch, because there is no write-off feature: *"If
you are writing the money off, clear his opening balance here first."* The store
guard is the real gate; this is so the answer is never a toast that can be missed.
Admin's 6-month Salary Log splits given from recovered too — it guarded on
`advance > 0`, so a recovery would have been silently invisible there.

**Cash Flow**: `advance_recovery` maps to the **labour** line, not to any income
line — the farm got its own money back, it earned nothing. The recovery nets against
the advance that created the debt.

## Deliberate omissions

- **No write-off.** Money a worker leaves without paying is a genuine accounting
  entry (bad debt to expense), and the owner's steer is that the app should not go
  that way. The escape hatch is manual: clear the opening balance in Admin. If a
  worker ever absconds and the receivable should stop showing forever, this is the
  thing to build — one line with a reason.
- **UPI stayed in the mode picker.** The owner's Ledger ruling (cash/bank only,
  remembered) governs the Ledger's Pay button; this modal's three siblings share one
  picker and money genuinely arrives by UPI. Splitting one of the three would have
  made the screen inconsistent with itself.
- **Contractual labour has no guard**, because `v_salary_dues` filters to
  `permanent`/`regular` — contractual workers have no balance in it. They also still
  have no opening-balance field at all, which is a separate known gap.

## Still needs the owner

1. **Is Deepak's salary missing?** Both his rates are 0, so his ₹13,933 cannot work
   itself off against wages even while he is employed.
2. **Which pre-20-Aug payments actually came from a bank?** Cash in hand reads
   **−₹16,841**, which a cash box cannot do. Every labour payment before 20 Aug
   hardcoded `paid_via: 'cash'`; that is fixed forward but the past rows are still
   wrong. A cash recovery would mask it, so this stays worth asking. **Do not guess
   at a correction.**

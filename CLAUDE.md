# Farm Management App — Project Bible

> This file is the single source of truth for the Farm Management App. Every architectural decision, UI design, database schema, and feature is documented here. When building any part of this app, refer to this file first.

---

## Where we left off

> **Replace this whole section on every push.** It is not a log — it is a snapshot, and
> it stays roughly this length. This file loads into context automatically at the start of
> every session; the `docs/HANDOFF-*.md` files do not. So the state that must never be lost
> lives here, and the long reasoning lives in the handoff this section points at.

**Last updated:** 2026-08-21 (the Cash Book folded to two pockets — cash + one Bank figure) · **detail:** [`docs/DECISION-fy-and-opening-costs.md`](docs/DECISION-fy-and-opening-costs.md) ← **read before reopening any FY/opening-cost question** · [figures](supabase/data-fixes/2026-08-13-owner-stated-figures.md) · [plan](docs/PLAN-fresh-install-standard.md) · earlier: [Phase 1](supabase/data-fixes/2026-08-12-phase1-fresh-install-cleanup.md) · [Phase 2](supabase/data-fixes/2026-08-12-phase2-opening-cost-breakups.md)

**Just shipped (21 Aug) — the Cash Book's seven account chips became three.** The owner,
shown the seven-chip strip: *"it is not account heavy app mainly for keeping records …
can we combine all bank in one just for cash book and show as a overall figure?"* — his own
framing was the classic two-column cash book, confirmed via two choices: **one combined
🏦 Bank chip** (all six partner accounts summed — the alternative, showing only Vipul's,
would orphan revenue landing in the other five) and **the tab now OPENS ON 💵 Cash in hand**
(day-to-day spending is cash; Move Money tops it up from the bank). Display-only, no
migration: every row keeps its real `account_id` and the small line naming the actual bank;
Admin → Partners, Move Money (still the only place to pick among the six) and the Excel
export are untouched. The one non-obvious bit: `v_cash_book` has no combined-bank running
balance, so [`lib/cashPockets.js`](frontend/src/lib/cashPockets.js) (8 tests) annotates the
FULL cash book with `pocket` + `pocket_running_balance` **before** the period filter in
`LedgerPage` — all-time semantics mirroring `account_running_balance`; fed period rows it
would start a pocket at zero mid-history. Invariant pinned by test: the cash pocket's
running figure equals the view's `account_running_balance` (one cash account, so pocket ≡
account). **139 tests green.** Also live in production, seen in his screenshot: **the first
real recovery** — Deepak repaid **₹5,000 cash on 19 Aug** (still owes ₹8,933; workers' total
debt now ₹56,420), which moved cash in hand −16,841 → **−11,841** — the recovery makes the
hole look smaller without fixing the mis-booked rows, so the pre-20-Aug bank question below
still stands.

**Just shipped (20 Aug, 2nd of the day) — recovering money FROM a worker.** *"deepak … has
a negative opening balance and he leaves the job how we gonna recover money from him?"* →
*"make way to recover money from a deactive or active staff or labourer."* Full record in
[`docs/HANDOFF-worker-recovery.md`](docs/HANDOFF-worker-recovery.md). Six workers owe the
farm **₹61,420** (Deena 25,425 · Deepak 13,933 · Gambhira 13,495 · Chote Lal 5,303 ·
Jhingur 2,125 · Harinder 1,139) and there was **no door for that money coming back** — an
advance and a salary payment are both cash going *out*, and `amount > 0` guarded every route
in, so a debt could only grow. Worse, **Remove detached the debt from the person**:
`status='inactive'` hides a man from every screen while `v_salary_dues` (no status filter)
still holds his balance — ₹15,620 already sat behind two *paused* workers the Salary tab
filters out. (Precisely: the Ledger's dues strip clamps negatives with `Math.max(0, …)`, so
the debt never inflated that figure — it just became **invisible**, which is worse. It does
still print in the Excel "Salary Khata" sheet.) **The mechanic is a NEGATIVE
`salary_advances` row.** `balance_due = opening + earned −
advances − paid`, so subtracting a negative advance adds the money back: migration
[`0033`](supabase/migrations/0033_worker_recovery.sql) is four lines (`amount > 0` →
`amount <> 0`), **no view change, no new table — the sign IS the record**. Cash side needed
nothing: `direction:'in'`, `entry_type:'advance_recovery'` (→ the Cash Flow **labour** line,
never income — the farm got its own money back). Verified on the live DB before any UI, both
probes rolled back: Deepak −13,933 → **0**; the full write took Jhingur to 0 and the cash
book 22,564.02 → **24,689.02**. Logic in
[`lib/workerRecovery.js`](frontend/src/lib/workerRecovery.js) (**32 tests**; `SETTLED_TOLERANCE
= 1` because balances carry paise; `monthEnd` from LOCAL parts — `toISOString()` returns
27 Feb). New: **`recordWorkerRecovery`** (takes `name` as an argument — a worker who has left
is not in the store at all), **`workerBalance`**, **`assertWorkerSettled`** guarding both
Remove paths in either direction. UI: **"⬇️ Recover"** appears on a card only when he owes,
prefilled from `v_salary_dues`; a new **"No longer working"** section is the only screen that
can see paused/removed debtors; Admin's Remove asks the balance *before* the confirm and names
the escape hatch (clear the opening balance — **there is no write-off feature, deliberately**).
**Fixed en route, a real contradiction:** the History overlay folded salary payments the wrong
way (paying a man made the farm owe him *more*) and omitted wages earned, so it could never
close on the Ledger's figure. It now folds the same four things `v_salary_dues` does and closes
on `balance_due` **by construction**. **131 tests green.**
**Then, at his ask — a PART recovery had to be visibly possible.** Nothing ever capped the
amount, but the modal prefilled the full outstanding and said nothing, so all-or-nothing was
the only reading. `recoveryOutcome(outstanding, entered)` (5 specs, NaN-guarded) now drives a
live line — *"₹8,933 stays on his khata"* / *"✓ clears his khata"* / *"the farm will owe him
₹X"* — and the toast carries the remainder. Over-recovery stays allowed, just named.
**The prefill is a convenience, never a cap — do not add one.**
**Hotfixed before that — the Salary tab rendered BLANK:** an edit dropped two variables
`LabourSalary` still used; `npm run build` stayed green because **Vite does no
undefined-variable analysis and no test mounts a page component**, and there is no ESLint in
`frontend/`. Until there is, any edit that rewrites a block of a page must be re-read for
identifiers it no longer declares.

**Shipped 20 Aug (1st) — one job, one payment.** The ₹6,520 spraying job (10 Aug, 163 tanks @
₹40) showed as **seven** Ledger payments because its cost splits pro-rata across seven plots.
**The per-plot split STAYS** (the only route to per-plot cost, his own words); only the
*payment* collapses — one line reading ₹6,520 with the job described ("— 7 plots · 163 tanks @
₹40"), breakup behind the chevron via `LabourLines`. Pure and tested in
[`lib/labourGroups.js`](frontend/src/lib/labourGroups.js) (21 specs) on
`(entry_date, description, is_paid)` — a key `v_expense_ledger` already produces, so **no
migration**; paid and unpaid never merge; `wholeShares` hands the rounding residue to the
largest part. `markLabourPaid` → **`markLabourGroupPaid`**: one update, **one** cash entry,
`reference_id` on the group's anchor (`groupAnchorId` = lexicographically first id — **any
future unpay MUST resolve the group the same way** or it reverses one seventh of a payment).
**Pay now asks how the money moved** (`PayExpenseModal`, cash preselected, remembered in
`localStorage`) — the old bare `confirm()` hardcoded cash and had silently drained the cash box
since the six accounts went live. Detail:
[`docs/HANDOFF-labour-payment-grouping.md`](docs/HANDOFF-labour-payment-grouping.md).

**Shipped 19 Aug — Manpower lost a tab.** Logs folded into Attendance: `MonthSummaryStrip`
above the Staff/Labour toggle, the month's entries below as `MonthWorkLogs`. "Today's Work
Logged" was **deleted deliberately** — today is inside the selected month, so both printed the
same rows. Maths in [`lib/labourMonth.js`](frontend/src/lib/labourMonth.js) (20 tests);
`markAttendance` bumps an `attVersion` so Staff Salary cannot sit stale.

**Second/third ship of 17 Aug — the Ledger's FY default is gone, at the owner's explicit
ask, and the filter is TWO dropdowns after he refined it** (*"keep the FY filter with the
Over all Crop filter … one Standing crop beneath date years the other filter should be
month"*). Ledger header, "View:": **dropdown 1** = `Standing Crops · All` (DEFAULT — whole
cycles, no date cut, the Dashboard's lens) with the FY years beneath it; **dropdown 2** =
Month, which drills into the chosen FY (`All months` + Apr…Mar via `fyMonths()`), resets on
year change, and sits disabled under Standing Crops. Mechanically one `fy` value still
threads every tab; its value space grew to `'all' | 'YYYY' | 'YYYY-MM'` — all period logic
in [`lib/period.js`](frontend/src/lib/period.js) (14 tests): `inPeriod`/`periodRange`/
`periodLabel`/`periodSlug`/`fyMonths`, month end-bound `-31` lexical (valid even for Feb —
date strings compare), `currentFY`/`currentMonth` from LOCAL date parts (the old
`toISOString()` UTC off-by-one fixed). **Also at his ask: Expected Revenue on the Summary
tab** — a sixth MetricCard beside Total Income ("At harvest, if crops sell as expected"),
same rows and same rule as the Dashboard (`summarizeCropPnl(cropPnlFY).expected`), and an
Excel Summary row labelled *"(not in P&L)"* so no accountant reads a forecast as income.
**Design call, stated to the owner: "Standing Crops" = whole-cycle all-time, NOT
active-only** — an active-only filter would drop a cycle's cost the day it closes while its
sale revenue stayed in Money In. Today all 15 cycles are standing, identical either way.
**Fourth ship, same day — a MONTH is a transaction lens.** The owner caught July showing
"expense" though the books open 1 Aug (*"everything before aug 1 should be the opening
balance"*). Verified on live DB: **no July transactions exist** — it was Plot H paddy's
₹71,371 opening cost anchored to July by `sow_date` (June likewise: ₹4,01,462, 7 cycles).
Under a month view, whole-cycle figures now report **nowhere**: `cropPnlFY = []` when
`isMonth(fy)`, so opening cost, Expected Revenue and the crop P&L tables all drop out
(a note in the P&L tab says why, or their absence reads as data loss), and months show only
recorded transactions. The stated reason beats the go-live date alone: the owner's sheet
gives period totals ("EXP. 01.06.26 TO 31.07.26"), not month spend — a month attribution
claims precision the data does not have. **FY-level sow_date attribution unchanged**
(cane → 2025-26, paddy → 2026-27; still SETTLED). Consequence, deliberate: an FY's months
do not sum to the FY headline — the FY view's "incl. ₹X spent before the app" label is
exactly the difference.

**The Dashboard reads whole crop cycles, sowing → sale, no FY** (17 Aug, after *"as crop is
sown sometimes 12 month back it is tough to go by financial year"*): Expected ₹54,02,410 ·
Received/Pending (from `sales` paid/unpaid — both ₹0 today, correct) · **Spent on Crops
₹13,53,366** · Net +₹40.49L *"if crops sell as expected"*. All from **`v_crop_pnl`**, the same
rows the Ledger's crop tables render, so the two screens agree **by construction**. Ruled by
the owner: Spent = **crop costs only** (his sheet's frame); salaries/farm expenses stay in the
Ledger. Per-cycle rule (in [`lib/farmOverview.js`](frontend/src/lib/farmOverview.js), 11
tests): active → `max(revenue, expected_revenue)`, so a partly-sold standing crop keeps its
forecast; finished → `revenue`. `expected_revenue` = acres × `crops.yield_per_acre` ×
`price_per_qtl` (+ residuals), owner-editable in Admin → Crops. Nothing on the Dashboard reads
the `crop_cycles.opening_cost` **lump** any more — the itemised breakup supersedes it, so the
0024 drift risk is gone. **Also live from 14 Aug:** the bill-date form fix — Entry Date
read-only beside a required, empty-by-default Bill Date; bills display as `4348 / 19 Jul 26`;
amber "entered …" flag when dates diverge >1 day; helpers in
[`lib/billdates.js`](frontend/src/lib/billdates.js).

**The owner's steer, and it governs what comes next:** *"we are going too accounts heavy and
this is taking a toll on development time and user friendliness."* The app's job is that
**its own numbers never contradict each other** — NOT to reproduce an accountant's FY P&L.
That ambition is dropped. Operational work comes before more accounting depth.

**Prior session's figures, all still live and correct:** cash **₹11,979** · Ankur
**₹2,94,385** · worker openings **−₹55,888** (workers owe the farm) · crop openings
**cane ₹8,80,533 + paddy ₹4,72,833** across 75 rows, 15/15 cycles itemised, pro-rata by acres.

**Settled 14 Aug: the app had stored ENTRY dates as BILL dates.** The picker defaulted to
today and was never changed, so everything typed on 6–7 Aug carried a 7-Aug date while the
real dates sat inside the invoice numbers the owner typed (`4348/19.07.26`). The 6 bills, 14
purchase lines, 67 issues (₹1,12,348) and 2 cash entries were pre-August data in disguise —
archived and deleted (3rd `go_live_archive` batch). Attendance (51 rows, 1–8 Aug) is the only
genuine August data and was asserted untouched. The form fix has shipped.

**Do not undo these — they look like mistakes and are not:**
1. The 6 OPENING-STOCK purchases dated 2026-03-31 are opening statements and STAY.
2. Twelve items now show ZERO stock because their July purchases were deleted. That is
   correct pending the owner's 1-Aug count — do not "restore" them from the archive.
3. The "Small Spray Machine" ₹5,000 (11 Jul) had its `vendor_id` detached: its debt is
   inside Ankur's ₹2,94,385, and leaving the link raised a second payable beside it. That
   was the ₹5,000 gap. The machine stays in the asset register.
4. `FARM STAFF` on the sheet = cook/driver (not crop); `EXP. LABOUR STAFF` = the regular
   labour (crop work). The farm-staff-salary call was reversed, then settled BACK to
   "no entry" with a stated reason — see SETTLED item 2 below. That is now final.
5. `v_salary_dues` reads −₹40,595, not −₹55,888: it adds ₹15,293 of August accrual on top
   of the openings. The openings are what the sheet states.
6. Opening cash still sums from two sources in `cashflow.js`; `tree_sale` still splits on
   the notes prefix; `vitest.config.js` stays separate from `vite.config.js`.
7. **A NEGATIVE `salary_advances.amount` is money recovered FROM a worker, not a data-entry
   error.** `v_salary_dues` subtracts that column, so the sign is what carries the direction —
   do not restore the `amount > 0` check (0033 replaced it with `amount <> 0`) and do not
   `abs()` the column anywhere. Zero is still illegal.
8. The Ledger P&L, Summary, Excel export and Dashboard all now count pre-app opening cost,
   deliberately and labelled. **There is no double count** — verified that
   `v_expense_ledger` has no path to `crop_cycle_opening_costs`, and only `opening_cost` is
   ever added, never `total_cost` (a cycle's input/labour cost is already in the ledger as
   the purchase that supplied it). Do not "clean this up".

**SETTLED — do not reopen these three. Read [the decision doc](docs/DECISION-fy-and-opening-costs.md) first if tempted; two of them have already been answered twice in opposite directions.**
1. **Cane stays in FY 2025-26 — cost follows the crop cycle**, via `sow_date`. All 7 cane
   cycles were sown 15 Oct 25 / 15 Jan 26 / 15 Feb 26, so the whole **₹8,80,532** reports
   against FY 2025-26 and paddy's **₹4,72,834** against 2026-27. Offered an April-onward
   split, the owner said it was too difficult to produce and asked for a recommendation —
   and `crop_cycle_opening_costs` **has no date column** (its only date is the cycle's
   `sow_date`, borrowed by `v_crop_cost_lines`), so there is nowhere to store a split
   without new schema. His own framing backs the rule: *"we are considering crop expense
   since beginning of crop cycle."*
2. **The ₹1,69,166 farm-staff salary gets NO entry. Third and final answer** — and this
   time for a stated reason, not by accident. The app's labour frame begins **1 Aug with
   attendance**, and the pre-Aug salary is already inside the ₹11,979 opening cash; that is
   *why* cash is that figure. Crop cost is scoped per **cycle** (may legitimately predate
   the app); salary per **attendance month** (does not). Two frames — that difference IS
   the answer, not a gap to plug. **Do not build a carrier for it.**
3. **A closed pre-app cycle stays out entirely — both sides.** He reported a **paddy payment
   of ₹1,88,530 received 30.06.26** (a payment date, not a harvest date) and asked whether to
   show it. **No** — he confirmed no dues outstanding, and that crop's *costs* are not in the
   app either, so entering only the revenue would show ₹1.88 L of profit with nothing spent
   to earn it. Standing cycles carry opening cost in and earn revenue in-app; closed ones
   stay out. Had anything still been owed it would have needed a **buyer opening balance** —
   check that first if a similar figure appears. **Expect a large P&L loss** until cane and
   paddy sell: ₹13.5 L of cost against revenue still to come. Correct — do not offset it.
4. **No filing-grade FY report.** The owner's sheet is the source for that, not the app.

**NEXT, and needs nothing from the owner:** Phase 3 of the fresh-install plan — teach
`go_live_convert` the bill-date standard — then the Books Health check (cash book vs account
balances, bill header vs lines). Trial Balance stays rejected; do not relitigate.

**Done same day, at his ask — the seven HISTORIC cash entries were collapsed too.** He opened
the Cash Book and saw the breakup he had just had fixed (*"still showing as breakup? not a
single entry — and make sure it is only about ledger otherwise the cost should split plot
(crop cycle) wise only"*): the code fix only governs *new* payments. So the 19 Aug rows were
archived (`go_live_archive` batch `dcda331b`, 5th) and merged into one ₹6,519.98 entry on the
**anchor** row — its `reference_id` is the same log `groupAnchorId()` picks, so historic and
future rows key back identically. **The seven `labour_logs` were NOT touched** and must never
be: plot-wise cost is the point of the split. Asserted before/after — cash net −28,819.98
unchanged, 7 cash rows → 1, ₹6,519.98 unchanged, 7 logs still 7. Full record in
[`supabase/data-fixes/2026-08-20-collapse-historic-labour-payment.md`](supabase/data-fixes/2026-08-20-collapse-historic-labour-payment.md).

**Two things need the owner, both found by reading live data:**
1. **CASH IN HAND IS NEGATIVE, ₹−11,841** (opening ₹11,979 less ₹28,820 paid out, plus
   Deepak's ₹5,000 cash recovery of 19 Aug — which masks the hole exactly as predicted). A
   cash box cannot go below zero, so money booked as cash actually left a bank. Cause is known
   and fixed forward — every labour payment before 20 Aug hardcoded `paid_via: 'cash'` — but
   the past rows are still wrong, and the new default Cash chip puts the red figure first on
   the Cash Book. **Ask which pre-20-Aug payments came from a bank before trusting the cash
   figure**; do not "correct" it by guessing.
2. **Is Deepak's salary missing?** His `monthly_salary` AND `daily_base_rate` are both **0**, so
   he accrues nothing and his ₹13,933 can never work itself off against wages even while he is
   employed. Harinder is ₹10,000, Ram Bachan ₹11,000 — his looks simply never entered.

**Still needed from the owner:** his **1-Aug opening stock count**. The **bank balances are
DONE (2026-08-17)** — migration `0031_accounts_partner_link.sql` added `accounts.partner_id`
(his call: linked to the partners master, not one lumped Bank row); the empty `Bank` row was
repurposed as "Punjab & Sind — Vipul Nanda" and five more inserted, each with its partner
link and 1-Aug opening. Total position now **₹51,384** (cash ₹11,979 + bank ₹39,405), every
account matching his sheet to the rupee — details in
[`supabase/data-fixes/2026-08-17-bank-accounts-partner-link.md`](supabase/data-fixes/2026-08-17-bank-accounts-partner-link.md).
The joint UP Gramin account points at Vipul (primary) with "joint" in the name — no join
table for one row. Settled: sheet "PUNEESH" = master "Puneet Nanda". Still open: does partner
**Sai Kiran Nanda** have an account, or was it just not listed?
**Same day, the accounts went live in the UI at his ask** (*"show vipul nanda as main
account … in partners list add the bank detail and amount … when a ganna payment is done
they will get credits"*): (1) the Summary breakdown shows **ONLY cash + the MAIN account** (his refinement: *"only
show main account in summary dont show all while keep other account in master"*) — MAIN =
the first bank account, the same pick `accountFor('bank')` routes transactions through, so
badge and behaviour cannot disagree; the five partner accounts roll into one muted line
("5 partner accounts · in Partners master") so the card still sums to its own total, and
the Excel export keeps listing every account for the accountant;
(2) Admin → Partners shows each partner's linked account with its **live balance**
(new light loader `loadAccountBalances`: accounts + v_cash_book only);
(3) **`markCanePayment` credits the parchi's partner's own account** — session.partner_id →
accounts.partner_id → that account gets the gross IN and any deduction OUT; Vipul's two
accounts resolve to the older (his main); no partner/no account falls back to the main bank
door. Also fixed en route: `loadAll` now loads `accounts`, because until now `accountFor()`
returned null — and the DB trigger parked money in CASH — for anyone marking a cane payment
without first opening the Ledger. Money routing no longer depends on page-visit order. Cash ₹11,979 is *today's* figure, but no cash has moved
since 1 Aug, so it doubles as the opening — unless he paid cash 1–13 Aug without recording it. Also worth his eye: Plot H paddy got ₹71,371 by flat
pro-rata but was sown 16 July, six weeks after the rest, so it is likely overstated; the
**"Sepre machine" ₹2,000 was DELETED 2026-08-14 on his instruction** — archived to
`go_live_archive` first (4th batch); it was another 7-Aug mis-dated entry, so FY 2026-27
Money Out is now ₹15,293 and the P&L headline ₹4,88,127. He also queried the 6 OPENING-STOCK
purchase rows (₹1,21,207.06, 31 Mar): explained and KEPT — they are the only source of
inventory stock, and with `inventory_issues` at zero rows they do not double-count the crop
opening costs (used-up inputs) because this is stock still on the shelf. The ₹100 medicine
expense was deleted with the 7-Aug batch and needs re-entering if genuine. Deferred by
him: **animal and tree opening balances**. Unruled: 18 pre-Aug farm videos (storage files
are NOT archived — irreversible) and 3 pre-Aug `livestock_health_logs`. The duplicate
`Ram Naresh` row is zeroed, not deleted — he deletes it in Admin → Manpower if it is one
person.

**Where opening balances are entered:** avatar → Admin → "Opening balances" — a bottom
sheet, row 1 Cash & bank, row 2 Opening stock. The Field/Dashboard card that used to offer
it auto-hides once cycles and stock exist, so that menu row is the only way in; the owner
could not find it unaided.

**New-farm onboarding gaps (audited, nothing changed):** farm #2 onward skips the Books
step entirely — `CreateFarmModal` never runs `FarmOnboarding`, which only fires at
`farms.length === 0` — so no `go_live_date` and no opening cash; the "Spent before the
app" field renders only when `sowDate < farm_created_at`, making it invisible on a
genuinely new farm; Contract labour has no opening-balance field at all; buyer openings
live only in the dismissible checklist sheet; livestock and tree counts appear in no
checklist. Copy bugs: the labour row says "in Labour" but navigates to Admin → Manpower,
and the party row names "Party Ledger" while the toggle says "Party Khata".

**Blocked on the owner:** the three Balance Sheet numbers (land + plot value, loans against
the farm, what counts as owner capital).

**Flagged, not to be touched unprompted:** the two *add* forms in
[`Assets.jsx`](frontend/src/pages/Assets.jsx#L250) (machinery, asset) still default
`purchaseDate` to today — the **same pattern** the bill form just lost, and `TODAY` there is
still the UTC one. Not changed: the owner asked for the bill form, and an asset is usually
added when acquired. Fix it the same way when he wants it. Payment-mode pickers still disagree
across `Labour.jsx`, `Expenses.jsx`, `livestock/ui.jsx` — but he **has now ruled for the
Ledger's Pay button** (cash default, cash/bank only, remembered): match that shape when the
others are touched, and do not add an account picker there — choosing among the six accounts
lives in Move Money. **Labour.jsx's picker was deliberately left at cash/UPI/bank** when
Recover joined it on 20 Aug: its three modals share one picker, money genuinely arrives by
UPI, and splitting one of the three would make that screen disagree with itself.
**No write-off feature exists, on purpose** — a worker who absconds owing money can only be
cleared by editing his opening balance in Admin. If the owner ever wants the receivable to
stop showing, that is the thing to build (bad debt to expense, one line with a reason).
(The former flags here — Dashboard's lump `opening_cost` sum, the cane-only Net Position,
and the Dashboard-all-time vs Ledger-FY mismatch — were all retired by the 17 Aug farm-wide
Dashboard: it reads `v_crop_pnl` like the Ledger, and its whole-cycle scope is now the
labelled design, not an accident.) Dashboard and Ledger now share the same default lens:
whole cycles, no date cut. The Ledger alone can narrow to an FY or a month via its View
control; the Dashboard deliberately cannot.

---

## 0. Development Rules

- **After every code change, always commit and push to GitHub** (`git add` → `git commit` → `git push origin master`). Vercel deploys automatically on every push. Never leave changes uncommitted.
- **Rewrite the "Where we left off" section above in the same commit.** Replace it, never append — it is a snapshot of the present, not a history. Keep it about its current length; it costs context on every single session, so earn every line. Long reasoning belongs in a `docs/HANDOFF-*.md` that it links to.
- **Git identity** — always use `git config user.name "dpakkaushik"` and `git config user.email "palliaclaudeai@gmail.com"` before committing if not already set.

---

## 1. Project Vision

A farm management system for **medium-sized farm owners (50–100 acres)** who do not live on the farm but want real-time visibility into all farm operations remotely.

**The core problem:** Farm operations are managed through phone calls and paper registers. Owners lack visibility into activities, inventory usage, crop performance, and profitability.

**Long-term vision:** Evolve into a commercial SaaS product supporting multiple farms per owner.

---

## 2. Tech Stack

### Backend (Python-heavy — use Python wherever possible)

| Layer | Technology |
|---|---|
| API Framework | **FastAPI** (Python) |
| Language | **Python 3.11+** |
| ORM | **SQLAlchemy 2.0** (async) |
| Data Validation | **Pydantic v2** (comes with FastAPI) |
| Database Driver | **asyncpg** |
| Auth | **Supabase Auth** + **python-jose** for JWT |
| File Storage | **Supabase Storage** via `supabase-py` |
| Background Tasks | **Celery** + Redis (for alerts, notifications) |
| Geospatial | **Shapely** + **GeoJSON** for plot boundaries |
| PDF Generation | **WeasyPrint** or **ReportLab** |
| WhatsApp Alerts | **Twilio** Python SDK |
| Testing | **pytest** + **pytest-asyncio** |
| SDK | **anthropic** Python SDK (for AI features later) |

### Frontend (minimal JS — only for UI)

| Layer | Technology |
|---|---|
| Framework | **React 18** + **Vite** |
| Styling | **Tailwind CSS** |
| Components | **shadcn/ui** |
| Map | **Mapbox GL JS** (satellite tiles + plot polygons) |
| State | **Zustand** |
| API Client | **Axios** |
| Charts | **Recharts** |
| Testing | **vitest** — `npm test` in `frontend/`, specs in `src/**/__tests__/`. Config is `vitest.config.js`, kept deliberately separate from `vite.config.js` so a test setting can never break a Vercel deploy. |

### Infrastructure

| Layer | Technology |
|---|---|
| Database | **Supabase** (PostgreSQL 15) |
| File Storage | **Supabase Storage** |
| Backend Hosting | **Railway** |
| Frontend Hosting | **Vercel** |
| Cache / Queue | **Upstash Redis** |

---

## 3. Project Structure

```
farm-app/
│
├── backend/                        # Python FastAPI backend
│   ├── main.py                     # FastAPI app entry point
│   ├── config.py                   # Settings via pydantic-settings
│   ├── database.py                 # Async SQLAlchemy engine + session
│   ├── dependencies.py             # FastAPI dependency injection
│   │
│   ├── models/                     # SQLAlchemy ORM models
│   │   ├── __init__.py
│   │   ├── farm.py
│   │   ├── plot.py
│   │   ├── crop.py
│   │   ├── activity.py
│   │   ├── inventory.py
│   │   ├── harvest.py
│   │   ├── sale.py
│   │   ├── diary.py
│   │   ├── alert.py
│   │   └── media.py
│   │
│   ├── schemas/                    # Pydantic request/response schemas
│   │   ├── __init__.py
│   │   ├── farm.py
│   │   ├── plot.py
│   │   ├── crop.py
│   │   ├── activity.py
│   │   ├── inventory.py
│   │   ├── harvest.py
│   │   ├── sale.py
│   │   ├── diary.py
│   │   └── alert.py
│   │
│   ├── routers/                    # FastAPI routers (one per domain)
│   │   ├── __init__.py
│   │   ├── auth.py
│   │   ├── farms.py
│   │   ├── plots.py
│   │   ├── crops.py
│   │   ├── activities.py
│   │   ├── inventory.py
│   │   ├── harvest.py
│   │   ├── sales.py
│   │   ├── diary.py
│   │   ├── alerts.py
│   │   ├── dashboard.py
│   │   └── media.py
│   │
│   ├── services/                   # Business logic layer (Python)
│   │   ├── __init__.py
│   │   ├── crop_service.py         # Auto-generate activities from templates
│   │   ├── inventory_service.py    # Stock management, cost attribution
│   │   ├── alert_service.py        # Alert generation logic
│   │   ├── cost_service.py         # P&L calculation
│   │   ├── notification_service.py # WhatsApp via Twilio
│   │   ├── storage_service.py      # Supabase Storage file handling
│   │   └── report_service.py       # PDF report generation
│   │
│   ├── tasks/                      # Celery background tasks
│   │   ├── __init__.py
│   │   ├── alert_tasks.py          # Scheduled alert checks
│   │   └── notification_tasks.py   # WhatsApp message sending
│   │
│   ├── migrations/                 # Alembic DB migrations
│   │   └── versions/
│   │
│   ├── tests/
│   │   ├── conftest.py
│   │   ├── test_crops.py
│   │   ├── test_inventory.py
│   │   └── test_cost.py
│   │
│   ├── alembic.ini
│   ├── requirements.txt
│   └── Dockerfile
│
└── frontend/                       # React frontend
    ├── src/
    │   ├── pages/
    │   │   ├── Field.jsx           # Map view
    │   │   ├── Dashboard.jsx       # Owner morning screen
    │   │   ├── PlotDetail.jsx
    │   │   ├── Inventory.jsx
    │   │   ├── Diary.jsx           # Manager daily log
    │   │   └── Reports.jsx
    │   ├── components/
    │   ├── hooks/
    │   ├── api/                    # Axios API calls to FastAPI
    │   └── store/                  # Zustand state
    ├── package.json
    └── vite.config.js
```

---

## 4. User Roles

| Feature | Farm Manager | Farm Owner |
|---|---|---|
| Submit daily diary | ✅ | ❌ |
| Log activities | ✅ | ❌ |
| Issue inventory | ✅ | ❌ |
| Record harvest | ✅ | ❌ |
| Record sales | ✅ | ❌ |
| Log crop health | ✅ | ❌ |
| View dashboard | ✅ | ✅ |
| View field map | ✅ | ✅ |
| View P&L reports | ✅ | ✅ |
| Receive alerts | ✅ | ✅ |
| Manage crop templates | ✅ | ❌ |
| Farm settings | ❌ | ✅ |

Roles are enforced at the FastAPI dependency layer using JWT claims from Supabase Auth.

---

## 5. App UI — Screen Design

### Navigation
Two main screens accessible via **tabs at the top**:
- `Field` tab — map-first view of the farm
- `Dashboard` tab — owner's morning briefing

### 5.1 Field View (default screen)

**What it shows:**
- Full satellite map (Mapbox) of the farm
- Translucent colored polygon overlays for each plot
- Plot label on each polygon: plot name, crop, status pill
- Color coding by crop health status:
  - 🟢 Green (`rgba(29,158,117,0.55)`) — Healthy
  - 🟡 Amber (`rgba(186,117,23,0.55)`) — Harvest soon
  - 🔴 Red (`rgba(226,75,74,0.5)`) — Concern / issue
  - ⬜ Gray (`rgba(136,135,128,0.35)`) — Fallow / inactive
- Map legend bottom-left (always visible)
- Farm name + total acreage top-left overlay
- Zoom controls top-right

**On plot tap:**
- Detail panel slides up from bottom
- Shows: crop progress bar, size, season cost, last activity, days to harvest
- Three action buttons: Activity Log, Inputs Used, Full Details

### 5.2 Dashboard View

**Sections (top to bottom):**

1. **Greeting + date** — "Good morning, [Owner Name]"
2. **Alert banner** — highlighted strip if any alerts exist
3. **4 metric cards** — Active plots, Season spend, Expected revenue, Manager last logged
4. **Plot overview card** — list of all plots with health status pills
5. **Alerts card** — detailed alert list with icons
6. **Yesterday's farm diary** — what manager logged, tomorrow's plan
7. **Inventory status** — items with stock levels, red if low
8. **Upcoming harvests** — timeline of harvest dates

### 5.3 Manager Daily Diary Screen

Simple mobile-first form. Manager fills every evening in 5–7 minutes:
- Which plots were worked on (multi-select)
- Activity type per plot (irrigation / weeding / spraying / fertilizer / other)
- Worker count + hours
- Any inputs used (select from inventory, enter quantity — auto-deducts stock)
- Crop health observation (Good / Average / Concern) + optional photo
- Free text notes
- Tomorrow's plan
- Submit button

### 5.4 Design System

- **Font:** System sans-serif, clean
- **Primary color:** `#1D9E75` (teal-green — farm feel)
- **Danger:** `#E24B4A`
- **Warning:** `#BA7517`
- **Cards:** White background, `border-radius: 12px`, `0.5px border`
- **Status pills:** Rounded, color-coded, 10-12px font
- **Mobile first** — manager uses on phone in the field
- **Offline support planned** — service worker for diary submission queue

---

## 6. Database Schema

> **The source of truth is [`supabase/migrations/`](supabase/migrations/), not this file.**
>
> This section used to contain a hand-written copy of the schema. It drifted badly —
> it described 14 tables when the database had 43, and named tables (`activities`,
> `harvests`, `crop_templates`) that do not exist. Anyone reading it built a mental
> model of a database that wasn't there, which is a real source of bugs.
>
> So this section no longer lists columns. It records the **conventions** that every
> table follows, which is the part that stays true. For the actual DDL, read the
> migration files, or query the live database.

### The two rules every table follows

**1. Every table carries `farm_id`.** This app is multi-tenant — one Supabase project
holds several farms. Scoping is by column, not by database. The only two exceptions
are `farms` (its own `id` *is* the farm id) and `user_profiles` (keyed by user).

**2. RLS is on, with the same four policies, everywhere.** They key off `farm_id`
via two helper functions:

| Operation | Policy |
|---|---|
| `SELECT` | `is_farm_member(farm_id)` |
| `INSERT` | `has_farm_role(farm_id, 'manager')` |
| `UPDATE` | `has_farm_role(farm_id, 'manager')` |
| `DELETE` | `has_farm_role(farm_id, 'admin')` |

RLS is what actually enforces tenant separation. The frontend also filters by
`farm_id` (see `getFarmId()` in `store/index.js`), but that is defence in depth —
**never rely on the client filter alone.** A new table without RLS is exposed to the
`anon` role, whose key ships in the frontend bundle and is readable by anyone.

### Tables, by domain

Names only — for columns, read the migrations or query the database.

| Domain | Tables |
|---|---|
| Tenancy | `farms`, `farm_memberships`, `farm_invitations`, `user_profiles` |
| Land & crops | `plots`, `crops`, `crop_cycles`, `crop_activity_templates`, `activity_logs`, `activity_types`, `crop_health_logs`, `crop_residuals` |
| Inventory | `inventory_items`, `inventory_purchases`, `inventory_issues`, `inventory_bills` |
| Labour | `labour_master`, `labour_activity_rates`, `labour_logs`, `attendance`, `work_types`, `public_holidays`, `salary_advances`, `salary_payments` |
| Livestock | `livestock_master`, `livestock_health_logs`, `livestock_count_logs`, `livestock_revenue` |
| Assets | `machinery_master`, `farm_assets`, `diesel_logs` |
| Money | `sales`, `buyers`, `vendors`, `vendor_payments`, `partners`, `farm_expenses`, `expense_payments`, `owner_cash_entries` |
| Harvest | `harvest_sessions` |
| Cross-cutting | `media_files`, `alerts`, `daily_diary` |

### Storage

Files (photos, bills, receipts) go to **Supabase Storage**; the database stores only
the path. One `media_files` table serves every entity polymorphically via
`entity_type` + `entity_id`. Never store file bytes in the database.

Buckets: `farm-photos`, `inventory-docs`, `harvest-docs`, `sales-docs`, `diary-media`.

### Changing the schema

**Never hand-edit the schema in the Supabase dashboard.** Every change belongs in a
numbered, idempotent migration in `supabase/migrations/`. See
[`supabase/README.md`](supabase/README.md) — it explains why, with the list of bugs
the dashboard-only approach actually cost us.

If a migration adds a table, it must also enable RLS and add the four policies above.

---

## 7. Core Business Logic (Python Services)

### 7.1 Seed Issue Trigger — `crop_service.py`

When manager issues seeds from inventory, this is the trigger for everything:

```python
async def start_crop_cycle(
    plot_id: UUID,
    template_id: UUID,
    sow_date: date,
    seed_item_id: UUID,
    seed_quantity: float,
    db: AsyncSession
) -> CropCycle:
    # 1. Create crop cycle
    cycle = CropCycle(plot_id=plot_id, template_id=template_id, sow_date=sow_date)
    cycle.expected_harvest_date = sow_date + timedelta(days=template.duration_days)

    # 2. Auto-generate all activities from template schedule
    for activity_def in template.activity_schedule:
        activity = Activity(
            crop_cycle_id=cycle.id,
            activity_type=activity_def["type"],
            scheduled_date=sow_date + timedelta(days=activity_def["day"]),
            label=activity_def["label"],
            status="pending"
        )
        db.add(activity)

    # 3. Issue seeds from inventory (reduces stock, attributes cost)
    await inventory_service.issue_item(
        item_id=seed_item_id,
        quantity=seed_quantity,
        crop_cycle_id=cycle.id,
        purpose="sowing"
    )

    # 4. Update plot status to active
    await plot_service.set_status(plot_id, "active")

    return cycle
```

### 7.2 P&L Calculation — `cost_service.py`

```python
async def get_crop_cycle_pnl(cycle_id: UUID, db: AsyncSession) -> dict:
    # Input costs from inventory issues
    input_cost = await db.scalar(
        select(func.sum(InventoryIssue.total_cost))
        .where(InventoryIssue.crop_cycle_id == cycle_id)
    ) or 0

    # Labor costs from activities
    labor_cost = await db.scalar(
        select(func.sum(Activity.labor_cost))
        .where(Activity.crop_cycle_id == cycle_id)
    ) or 0

    # Revenue from sales
    revenue = await db.scalar(
        select(func.sum(Sale.total_revenue))
        .join(Harvest)
        .where(Harvest.crop_cycle_id == cycle_id)
    ) or 0

    total_cost = input_cost + labor_cost
    return {
        "input_cost": input_cost,
        "labor_cost": labor_cost,
        "total_cost": total_cost,
        "revenue": revenue,
        "profit": revenue - total_cost,
        "margin_pct": round(((revenue - total_cost) / revenue * 100), 1) if revenue else 0
    }
```

### 7.3 Alert Engine — `alert_service.py`

Runs as a Celery scheduled task every morning at 6 AM:

```python
async def run_daily_alert_check(farm_id: UUID, db: AsyncSession):
    checks = [
        check_diary_missing,       # no diary submitted yesterday
        check_low_inventory,       # stock below min_threshold
        check_harvest_due,         # harvest within 10 days
        check_irrigation_gap,      # no irrigation logged for 5+ days
        check_budget_exceeded,     # cycle spend > budget by 20%
        check_pending_payments,    # payment_status=pending for 15+ days
        check_health_concerns,     # health_rating='concern' not followed up
    ]
    for check in checks:
        await check(farm_id, db)
```

### 7.4 File Upload — `storage_service.py`

```python
async def upload_file(
    file: UploadFile,
    entity_type: str,
    entity_id: UUID,
    uploaded_by: UUID,
    db: AsyncSession
) -> MediaFile:
    bucket = BUCKET_MAP[entity_type]  # maps entity to correct bucket
    path = f"{entity_type}/{entity_id}/{uuid4()}_{file.filename}"

    # Upload to Supabase Storage
    supabase.storage.from_(bucket).upload(path, await file.read())

    # Store reference in DB
    media = MediaFile(
        entity_type=entity_type,
        entity_id=entity_id,
        bucket=bucket,
        storage_path=path,
        original_name=file.filename,
        file_size_bytes=file.size,
        mime_type=file.content_type,
        uploaded_by=uploaded_by
    )
    db.add(media)
    return media

BUCKET_MAP = {
    "inventory_purchase": "inventory-docs",
    "crop_health_log": "farm-photos",
    "harvest": "harvest-docs",
    "sale": "sales-docs",
    "daily_diary": "diary-media",
}
```

---

## 8. API Endpoints (FastAPI)

### Auth
```
POST   /auth/login
POST   /auth/logout
GET    /auth/me
```

### Farm & Plots
```
GET    /farms/{farm_id}
GET    /farms/{farm_id}/plots
POST   /farms/{farm_id}/plots
PUT    /plots/{plot_id}
GET    /plots/{plot_id}/summary       # full status for map popup
```

### Crop Cycles
```
POST   /plots/{plot_id}/cycles/start  # triggers seed issue + auto-activities
GET    /plots/{plot_id}/cycles
GET    /cycles/{cycle_id}
GET    /cycles/{cycle_id}/pnl         # profit & loss
```

### Activities
```
GET    /cycles/{cycle_id}/activities
PUT    /activities/{id}/complete       # mark done + log workers/cost
```

### Inventory
```
GET    /farms/{farm_id}/inventory
POST   /inventory/items               # add new item to master
POST   /inventory/purchase            # record purchase + upload bill
POST   /inventory/issue               # issue to plot (reduces stock)
GET    /inventory/items/{id}/history  # all transactions
```

### Harvest & Sales
```
POST   /cycles/{cycle_id}/harvest     # record harvest + upload photo
POST   /harvests/{id}/sales           # record sale + upload receipt
GET    /harvests/{id}/sales
```

### Diary
```
POST   /diary                         # manager submits daily diary
GET    /farms/{farm_id}/diary         # owner views diary feed
GET    /diary/{date}                  # specific day
```

### Dashboard
```
GET    /farms/{farm_id}/dashboard     # all data for owner morning screen
GET    /farms/{farm_id}/alerts        # all unread alerts
PUT    /alerts/{id}/read
```

### Media
```
POST   /media/upload                  # upload any file, returns media_file record
GET    /media/{entity_type}/{entity_id}   # all files for an entity
DELETE /media/{id}
```

---

## 9. Features — Development Phases

### Phase 1 — Foundation
- [ ] FastAPI project setup with SQLAlchemy + Supabase
- [ ] Auth (login, JWT, roles)
- [ ] Farm + Plot CRUD
- [ ] Crop Templates
- [ ] Basic React shell with Field + Dashboard tabs
- [ ] Mapbox integration with static plot polygons

### Phase 2 — Core Operations
- [ ] Crop cycle start (seed issue trigger)
- [ ] Auto-activity generation from template
- [ ] Daily diary submission (manager)
- [ ] Inventory master + purchase recording
- [ ] File upload (bills, receipts, photos)
- [ ] Inventory issue + auto stock deduction

### Phase 3 — Visibility & Alerts
- [ ] Owner dashboard with all sections
- [ ] Crop health logging with photos
- [ ] Alert engine (Celery tasks)
- [ ] WhatsApp notifications via Twilio
- [ ] Real-time map overlay with plot status

### Phase 4 — Harvest & Financials
- [ ] Harvest recording
- [ ] Sales recording
- [ ] P&L per crop cycle
- [ ] Season summary reports (PDF via WeasyPrint)
- [ ] Budget vs actual tracking

### Phase 5 — Intelligence
- [ ] Season-over-season comparison
- [ ] Yield benchmarking by plot and crop
- [ ] Cost per quintal analysis
- [ ] AI chat agent to query farm data (Anthropic SDK)

### Phase 6 — SaaS
- [ ] Multi-farm support
- [ ] Subscription billing (Razorpay)
- [ ] Onboarding flow
- [ ] Hindi / regional language support for manager UI
- [ ] Offline diary mode with sync

---

## 10. Key Design Decisions

1. **Python everywhere possible** — FastAPI, SQLAlchemy, Pydantic, Celery, Shapely, ReportLab, Twilio SDK. Only React for UI.
2. **Seed issue is the trigger** — crop cycle, activities, and cost tracking all start when seeds are issued from inventory. Nothing starts before that.
3. **Media is polymorphic** — one `media_files` table handles all documents and photos. Never store files in the database.
4. **Costs are derived, not entered** — P&L is always calculated from actual inventory issues + labor logged. No manual cost entry.
5. **Manager UI must be ≤3 taps** — if logging something takes more than 3 taps, redesign it. Manager compliance is everything.
6. **Alerts are proactive** — the owner should never have to check. The app tells him when something needs attention.
7. **WhatsApp over email** — Indian farm owners check WhatsApp, not email. All critical alerts go to WhatsApp.
8. **GeoJSON for plots** — `geo_polygon` stored as GeoJSON. Rendered as Mapbox polygon layers. Shapely used for area calculations in Python.
9. **Row Level Security** — Supabase RLS policies enforce that owners only see their own farm data. FastAPI also enforces this at the service layer.
10. **Offline first (Phase 6)** — diary submissions queued locally if no internet, synced when connection returns.

---

## 11. Environment Variables

```bash
# Backend (.env)
DATABASE_URL=postgresql+asyncpg://...
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_SERVICE_KEY=...
SUPABASE_ANON_KEY=...
JWT_SECRET=...
REDIS_URL=redis://...
TWILIO_ACCOUNT_SID=...
TWILIO_AUTH_TOKEN=...
TWILIO_WHATSAPP_FROM=whatsapp:+14155238886
ANTHROPIC_API_KEY=...            # for AI features in Phase 5

# Frontend (.env)
VITE_API_URL=https://api.yourfarm.app
VITE_MAPBOX_TOKEN=...
VITE_SUPABASE_URL=...
VITE_SUPABASE_ANON_KEY=...
```

---

## 12. Python Requirements

```
# requirements.txt
fastapi==0.111.0
uvicorn[standard]==0.29.0
sqlalchemy[asyncio]==2.0.30
asyncpg==0.29.0
pydantic==2.7.1
pydantic-settings==2.2.1
python-jose[cryptography]==3.3.0
python-multipart==0.0.9
supabase==2.4.2
celery==5.4.0
redis==5.0.4
shapely==2.0.4
geojson==3.1.0
weasyprint==62.3
twilio==9.0.5
anthropic==0.26.0
alembic==1.13.1
pytest==8.2.0
pytest-asyncio==0.23.6
httpx==0.27.0
python-dotenv==1.0.1
```

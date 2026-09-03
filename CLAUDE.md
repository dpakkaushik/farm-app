# Farm Management App — Project Bible

> This file is the single source of truth for the Farm Management App. Every architectural decision, UI design, database schema, and feature is documented here. When building any part of this app, refer to this file first.

---

## Where we left off

> **Replace this whole section on every push.** It is not a log — it is a snapshot, and
> it stays roughly this length. This file loads into context automatically at the start of
> every session; the `docs/HANDOFF-*.md` files do not. So the state that must never be lost
> lives here, and the long reasoning lives in the handoff this section points at.

**Last updated:** 2026-09-03 (the P&L tab stopped calling a standing crop a loss, and reads crops-first; every dropdown is now the app's own sheet, not Android's cream system dialog — 57 of them, via a drop-in `<select>` replacement; 2 Sep: the phone's back swipe finally works — the 26 Aug fix was missing its NATIVE half, `@capacitor/app` was never installed, and **the owner must install the rebuilt APK once**; earlier the same day: salary in the Ledger stopped pretending a wage is a bill) · **detail:** [`docs/HANDOFF-back-gesture.md`](docs/HANDOFF-back-gesture.md) ← **premise corrected 2 Sep, read before touching back-gesture code** · [`docs/SPEC-salary-month-settlement.md`](docs/SPEC-salary-month-settlement.md) · [`docs/SPEC-bill-wise-vendor-settlement.md`](docs/SPEC-bill-wise-vendor-settlement.md) · [`docs/DECISION-fy-and-opening-costs.md`](docs/DECISION-fy-and-opening-costs.md) ← **read before reopening any FY/opening-cost question** · [figures](supabase/data-fixes/2026-08-13-owner-stated-figures.md) · [plan](docs/PLAN-fresh-install-standard.md) · earlier: [Phase 1](supabase/data-fixes/2026-08-12-phase1-fresh-install-cleanup.md) · [Phase 2](supabase/data-fixes/2026-08-12-phase2-opening-cost-breakups.md)

**Just done (3 Sep, 2nd) — the P&L tab stopped calling a standing crop a LOSS.** His four
points, all shipped. **(1) Order is crops-first:** Crop P&L → Plot-wise P&L → Livestock. *"it is
mainly a farm app, livestock shouldnt be at top."* **(2) The headline was wrong, not just
wordy** — it read **"Net Loss ₹16,27,352"** while every rupee of it sits in cane and paddy that
have not been sold. *"showing Loss as such isnt good or say right."* New
[`lib/pnlHeadline.js`](frontend/src/lib/pnlHeadline.js) (**8 specs, 361 green**): a shortfall is
a **loss only when nothing is left to sell**; while cycles stand it is **"Yet to recover"** in
neutral, not red. `pnlPosition({income, expenses, expectedAhead})` → profit / invested / loss,
`expectedAhead` from `pendingExpected(cropPnl)` (unsold cycles' `expected_revenue`; a sold
cycle is excluded — its money is already income). **This does NOT offset or hide the gap**, the
CLAUDE.md rule stands; it names it correctly. Strip is shorter too: `₹16,27,352 spent · ₹0
earned` over `incl. ₹13,53,366 spent before the app`. **(3) Both revenue columns are named:**
every crop row now shows **Cost · Est. Revenue · Actual Revenue** as headed cells — the old
table appended a grey "est." to one figure and could not fit two. Titles are **"Crop P&L"**
(the "(all plots merged)" is a note beneath) and **"Plot-wise P&L"** (was "Crop Cycles — P&L
(per plot)"). **(4) The cramped 4-column tables are gone:** a row is now name + margin pill
above a **fused `gap-px` breakdown grid** — the house style for a breakdown INSIDE a card. The
label box is a fixed two lines tall so "Actual Revenue" wrapping cannot drop its figure below
its neighbours (it did on the first cut). **Verified in a 360px Chromium** — no cell overflows,
no sideways scroll, no page errors — because **`PnlTab` is now exported and drawn in `/uikit`
(new "P&L" tab)**: it takes pure props, so it needs no session. **Keep it props-only.**

**Also done (3 Sep) — every dropdown in the app is now the app's OWN sheet.** His report, with
a screenshot of the Ledger's View control: *"the drop down opens as a separate window instead of
a simple drop down … same happening at other places as well."* Cause, and it was never a bug in
our code: **Android draws a native `<select>`'s option list itself**, as a system dialog in the
phone's colours — cream over a dark app, uncontrollable by CSS. Offered him native (free, big
touch targets) vs custom (ours to maintain); **he chose custom.**
**The design that made a 57-dropdown sweep safe:** new
[`components/SelectField.jsx`](frontend/src/components/SelectField.jsx) is a **drop-in for
`<select>`** — it takes the SAME `<option>`/`<optgroup>` children and fires the same
`onChange({target:{value}})`, so converting a screen was a one-word tag change and **not one
handler or option list was rewritten**. It reads its rows from those children via pure
[`lib/selectOptions.js`](frontend/src/lib/selectOptions.js) (**10 specs, 353 green**):
optgroup headings kept, `.map()` arrays flattened, `{cond && …}` false-children skipped,
split labels joined (`{a.emoji} {a.label}`), values normalised to STRINGS because that is what a
real select hands back. `FilterSelect` (8 screens) was rewritten onto the same sheet, keeping
its funnel and API and gaining a `title`; the Ledger's two View controls fold in too.
**The back gesture came free** — the list opens in `BottomSheet`, which already traps it; that
is why the sheet, not a hand-rolled popover, is the right shell. **Convention for anything new:
never write a bare `<select>` — use `SelectField`, or `FilterSelect` when it is a filter.**
Verified in a phone-sized Chromium over `/uikit`: **zero native `<select>` elements render
anywhere**, pick applies and closes, back closes the sheet and stays on the page, a real form
field ("Select vendor…") renders at full `.finput` width and opens, no page errors on any tab.
A throwaway ESLint 9 `no-undef` sweep on a copy of `src/` came back clean (its two
`URLSearchParams` hits are my config's missing global, not code).

**Also done (2 Sep, evening) — the phone's back swipe works, and why it never did.** His
report: *"phones backswipe isnt working even though i already asked you to fix this before."*
The 26 Aug fix was real JS but verified only in desktop Chromium, and its premise — "the swipe
reaches a web app as a plain history back" — is **false inside the APK**: Capacitor core has NO
back handling at all (verified in the installed `@capacitor/android` source); that behaviour
lives in the **`@capacitor/app` plugin, which was never installed** (only app-launcher and
status-bar were). So on the phone every swipe fell through to Android and closed the whole app,
while `backTrap.js` waited for a popstate that could never arrive. Fixed:
`@capacitor/app@8.1.1` installed and synced into `frontend/android`, and
[`lib/nativeBack.js`](frontend/src/lib/nativeBack.js) (4 specs, **343 green**; injected env
like backTrap) registered once in `main.jsx` — `canGoBack → history.back()` (popstate fires,
backTrap closes the top overlay, else the router walks back a page), at the root →
`minimizeApp()`, because the plugin's own no-listener default SWALLOWS a root back (a dead
swipe), so the listener is not optional. **The catch, and it reverses the 26 Aug assumption:
this half is NATIVE — it reaches a phone only inside a rebuilt APK, never via a Vercel
deploy.** A fresh debug build with the plugin compiled in sits at
`frontend/android/app/build/outputs/apk/debug/app-debug.apk` (2 Sep); **the owner installs it
once**, then JS changes ride deploys as before. Any future native dep = rebuild + reinstall
again. Gotcha worth keeping: `android/local.properties` (gitignored) must write `sdk.dir` with
FORWARD slashes — Java-properties escaping silently mangles `C:\…` and gradle dies with
"Invalid file path". Build recipe that works on this machine:
`JAVA_HOME="C:\Program Files\Android\Android Studio\jbr" ./gradlew assembleDebug` in
`frontend/android`. Code-reviewed same day (approve, 0 critical/high); its one MEDIUM — the
async listener registration could fail silently — is closed with a logging `.catch` in
`main.jsx` (JS-only, rides Vercel, the built APK stays valid).

**Just done (2 Sep) — the Ledger stopped calling a wage a bill.** He opened Expenses → Staff &
Regular Salary and asked *"really 49k is paid out of 82k salaries?"*, then *"why it isnt showing
status as paid here why?"*. Three faults, all real: the view hardcoded `false as is_paid` on every
salary row ([`0014`](supabase/migrations/0014_salary_accrual.sql)) and `LedgerPage` tested
`key === 'salary'` **before** the flag anyway, so no salary row could ever read Paid; the group's
Paid summed `salary_payments` alone and **ignored `salary_advances` entirely**, hiding **₹29,500**
of real cash (all seven regular labourers are paid by advance, never by a salary payment); and the
figure was clamped with `Math.min` and unfiltered by period while the rows were filtered. Pending
read ₹32,369 when **₹9,469** was owed.
**The design took four rounds to get right, and the reversals matter.** He first asked for the Pay
Salary amount to be *prefilled and uneditable* "so that it always matches calculation". I built
nothing and asked, because his own 31-Aug data used two rules: Harinder got his full ₹10,000 with
his ₹14,346 old debt untouched, Ram Bachan got ₹9,210 — exactly ₹11,000 *minus* his ₹1,790 old
debt. He saw it himself — *"this wont be solved with my idea better wait and plan"* — then named
the real fault: *"we are showing it in expenses as a amount we need to pay while the user record he
may pay different amount."* **So the locked field is dead; do not re-lock it.** A first spec
proposing a declared settlement flag + snapshot columns + a DB function was then **deleted** by his
simplification (*"expense tab should only show the paid and pending and a redirect button"*) — it
is in git at `18da60a` if the reasoning is ever wanted.
**What shipped:** the salary group's rows are **months, not the 17 worker-months** (his ask:
*"even month wise overall breakup will also be good"*) — Aug ₹78,400 → paid ₹72,610 / pending
₹5,790, Sep ₹3,679 wholly pending, header ₹82,079 → **₹72,610 paid / ₹9,469 pending**. No Status
column and no per-row Pay anywhere; **one button at the foot** → `/labour?go=salary` (new deep
link). All of it is arithmetic in [`lib/salaryLedger.js`](frontend/src/lib/salaryLedger.js)
(**28 specs, 322 green**): `settled = clamp(payments + advances, 0, earned)` per worker-month,
summed per month, period-filtered on the same entry date the view uses (`min(month end, today)`).
**Two invariants worth keeping:** `paid + pending === earned` by construction, and **the clamp
lives on the worker-month, never the group** — Deena's ₹4,300 surplus advance must not pay
Vikram's ₹1,650 shortfall. **No migration, no schema change** — `payment_month` was already on
`salary_payments` and simply never read; the store now loads `v_salary_accrual` (the ledger row's
own id is an md5 of worker+month, so it cannot be matched back to a payment).
**Fixed the same day, after he challenged it — THE OPENING BALANCE IS THE THIRD WAY A WAGE GETS
SETTLED.** The first cut compared a month's wage only to that month's cash, so Ram Bachan showed
₹1,790 pending and I told him to record a missing recovery. **Both wrong**, and he caught it:
*"isnt 786 his salary for two days … 786 is deducted from the opening balance hence showing
1004 whats wrong"*. Checked every record he has — opening −₹1,790, Aug earned ₹11,000, paid
₹9,210 tagged Aug, **no advances** → **end-Aug exactly ₹0**, and `v_salary_dues` +₹786 for
September's 2 days. **His wage paid the debt off**; a recovery entry would have credited him
twice (+₹2,576). So `settleWorkerMonth` takes `carriedDebt` and the rule is **asymmetric**: a
negative carried balance (he owes) is settled *out of* the wage; a positive one (the farm owes —
Vikram's pre-app ₹3,080) is a separate liability and must NOT pretend the wage was paid. Each
month needs the balance the previous one left, so it is a chronological **walk per worker**
(`workerMonthSettlements`) and **the walk must cover ALL months before the period filter** — the
`annotatePockets` lesson. Figures now: **Aug ₹75,750 paid / ₹2,650 pending** (only Vikram ₹1,650
+ Ram Naresh ₹1,000 are short), Sep ₹714 / ₹2,965, header **₹76,464 / ₹5,615**. All three wrong
answers (₹32,369, ₹9,469) are pinned as regression tests. A worker who owes the farm overall has
**nothing** pending — Harinder's Sep ₹714 reduces his ₹13,632 debt, it is not a payable.
**Same root cause, second symptom, also fixed: the Salary card's Opening.** It used
`labour_master.opening_balance` EVERY month, so from month two it charged a settled debt again —
Ram Bachan's September card read "Worker owes ₹1,004" while the books said +₹786.
`balanceBeforeMonth` gives his balance at the chosen month's start, so the card now agrees with
`v_salary_dues`; its **Advance column is month-scoped too** (earlier unrecovered advances were
piled in there as well and, now that they sit inside Opening, were being subtracted twice).
`v_salary_accrual` moved into **`loadAll`** for it — a figure that depends on whether the Ledger
was opened first is a bug (the `accounts` lesson of 17 Aug).
**"Paid" means wage settled, not cash handed over:** Ram Bachan's row counts the full ₹11,000
though ₹9,210 left the box. Do not "fix" that to sum `amount_paid` — it breaks the tie to
`earned − pending`. **One latent trap, documented in the lib:** the store fetches `advances` with
`is_recovered = false`. No row carries that flag today (a recovery is a NEGATIVE advance row,
0033, not a flag) so it is a no-op — but if anything ever sets it, advances vanish from these
figures while the khata still counts them. Load them unfiltered that day.
**Also shipped, same round — the Salary tab shows BOTH SIDES and wears TWO COLOURS.** His asks:
*"can at top we show a combined overall what farm owes vs what worker owes with a better
nomenclature?"* and *"right now there are many colors for worker owes and farm owes shouldnt we
just have red and green"*. The one-sided "₹2,30,060 to recover from workers" is replaced by a
two-cell strip — **Farm owes workers ₹13,441 Cr. (7 workers)** · **Workers owe farm ₹2,30,060 Dr.
(9 workers · 2 left)** — from new `khataPosition(dues)` in
[`workerRecovery.js`](frontend/src/lib/workerRecovery.js) (4 specs, **339 green**). **No net
figure, deliberately**: one man's debt cannot pay another man's wage, the same reason the Ledger
clamps per worker-month. "2 no longer working" is there because paused/removed debtors get no card
on that screen (Gambhira ₹13,495 + Deepak ₹8,933), so their debt was invisible. Nomenclature
matches the cards' own "Farm owes"/"Worker owes" and his paper register's CR/DR.
**A UI rule he corrected me on, worth obeying everywhere:** page-level summary boxes are
**separate tinted cards** in a `grid gap-2` — `bg-[hex]/10 border border-[hex]/20 rounded-xl p-3
text-center`, 11px muted label, `text-sm font-bold` figure in the accent — exactly as
`MonthSummaryStrip` on the Attendance tab does. My first cut used the **fused** `gap-px
bg-[var(--c-border)]` block, which is the style for a breakdown grid INSIDE a card (a worker's
Opening/Earned/Advance/Paid), not for boxes at the top of a page. *"why these new pills are
combined why you arent using standar approach in UI"* — don't mix the two again.
**The colour rule, and it is now the only one on that screen: colour means DIRECTION of money.**
`OWES_OUT = #8A9A5B` green (the farm owes it out) · `OWED_BACK = #E24B4A` red (the farm is owed it
back — the figure worth chasing). It replaced five hues (red AND amber for the two directions,
sage for Earned/Paid, amber for Advance, indigo for Recovered). **Opening keeps the direction
colours because it IS a balance**; Earned, Advance, Paid and Recovered are plain amounts and are
now neutral, so a coloured number always answers "which way?". **Red on worker-owes was my call,
not his** — the alternative accounting convention (red for the farm's liability) is one constant
swap away if he prefers it.
**Also found, unresolved, and worth his eye:** two workers carrying large opening debts that were
NOT in the 21 Aug record and accrue nothing (no attendance, no salary rate) —
**Satya Pal Rajvanshi −₹1,32,900** and **Ramj −₹28,700**, ₹1.6L of the ₹2.3L the khata says
workers owe. Deliberate entries or a data-entry problem? Asked twice, not yet answered.

**Also done (1 Sep) — a payment finally says WHICH BILLS it cleared.** His question:
*"lets say we settle 50000 and there was one 50000 bill and two 20k bills and one 10k bill — how
app will know which bill to clear?"* It could not: `vendor_payments` held a vendor and an amount
and nothing else. Now **Pay Vendor lists that party's open items with a checkbox each** (bill no ·
date · what was on it · already paid · outstanding), the ticks add up **beneath the list**, the
amount prefills from them and stays editable, and the modal **says in words** what will happen
before saving — "Clears bill 4703. ₹275 extra recorded on account." Pay less than ticked and it
fills **oldest-first**, leaving the shortfall on the last bill; pay more and the surplus is **on
account**; tick nothing and it behaves exactly as every payment before today did, so nothing that
exists breaks. Migration [`0035`](supabase/migrations/0035_vendor_payment_allocations.sql)
(**applied to the live DB**) adds `vendor_payment_allocations` — `target` is `bill` (bill_id names
the document) · `opening` (the pre-app lump from 0025, settleable but not a bill) · `on_account` —
plus **`record_vendor_payment()`, which writes the cash line, the payment and the breakup in ONE
transaction**. That directly retires the atomicity defect logged below for vendors: adding a third
write to the old two-insert pattern would have made the Harinder-shaped hole likelier, not rarer.
**Nothing about what is owed changed** — a bill's paid is `sum(allocations)` and its status is
derived, never stored; `v_vendor_balances` is untouched, so Balance Due is the same figure before
and after, by construction. Verified on the live DB, both probes rolled back: 3 allocations
written with the cash entry's `reference_id` set, and a breakup that does not add up is refused
("Allocations (24625) must add up to the payment (50000)").
**Same round, at his follow-up ask: the khata leads with what is owed.** *"in khata tab only
unpaid will be shown and paid will go in history below the unpaid entries … when click over the
history will give monthly range."* So a vendor's khata is now **Outstanding** (unpaid + part-paid
bills, opening balance first, status pill and outstanding per row, total at the foot) and beneath
it a **History** fold — settled bills *and* the payments that settled them, narrowed by a from/to
month range. **The old flat and month-wise running-balance tables are DELETED**; History replaces
both, and dropping them was required by his instruction, not incidental. Where the Outstanding
total and Balance Due differ (a purchase entered with no bill, or money paid on account) the
screen **says by how much** rather than printing two figures.
**And the export he asked for:** **⤓ Excel** on the Vendor tab head (every party) and on a single
khata (that party) — sheet 1 "All Vendors" (who is owed what, biggest first), then one sheet per
party in his register's own columns (`S.No · Bill No · Date · Particulars · Amount · Paid ·
Outstanding · Status`, dates as `02.06.26`), an opening-balance row where there is one, and a
TOTAL that **ties to Balance Due** — a tested invariant, and a sheet that cannot tie prints why in
its own margin. Logic is pure and tested in
[`lib/billSettlement.js`](frontend/src/lib/billSettlement.js) (46 specs) and
[`lib/vendorWorkbook.js`](frontend/src/lib/vendorWorkbook.js) (18) — **289 green**.
**The decision worth knowing, and it is reversible:** 85% of Ankur's ₹3,45,580 is the opening
lump with no bills behind it, so **the lump itself is tickable** (spec option B) rather than
re-keying his 18 bills. Entering them later just replaces that one row with eighteen — but
**reconcile first**: his register reads 4703 ₹9,600 · 4725 ₹24,625 · 4850 ₹5,100 plus an
unlabelled ₹21,470, while the app holds 4703 ₹24,625 (08.08) · 4725 ₹5,100 (10.08) · 4850 ₹21,470
(23.08). **Each app bill number is one line off his**, and ₹9,600 is inside the lump. Both sides
total ₹3,45,580, so nothing is lost — but itemising before settling that would make the khata
disagree with his register bill by bill. Full record:
[`docs/SPEC-bill-wise-vendor-settlement.md`](docs/SPEC-bill-wise-vendor-settlement.md).
**One check worth reusing:** `frontend/` still has no ESLint, and the blank-Salary-tab bug was an
undefined identifier a green Vite build could not see. A throwaway ESLint 9 in the scratchpad with
only `no-undef` on a *copy* of `src/` sweeps the whole app in seconds and leaves the repo
untouched — it was clean here. Do that after any edit that rewrites a block of a page.

**Also done (1 Sep, earlier) — a live-DB fix, and a defect it exposed.** His two screenshots:
(1) *"revert these top two entries"* — the 31-Aug salary payments to Chhote lal wife (₹12,987,
which had flipped HER khata to owing the farm) and Vijay Pardeep (₹13, a mis-key). Archived
(`go_live_archive` batch `855d7c5c`, 6th) then deleted, payment + cash line both; earlier
balances untouched by construction (the cash book is a computed view), cash in hand +13,000.
(2) *"paid Harinder yesterday but can't see it in cashbook"* — his ₹10,000 payment row existed
with **no cash line**: `addSalaryPayment` does TWO non-atomic writes and his save was interrupted
between them. The missing line was written by hand exactly as the app would have (the only
orphan; advances swept clean). Record: [`supabase/data-fixes/2026-09-01-revert-two-salary-payments-and-harinder-cash-line.md`](supabase/data-fixes/2026-09-01-revert-two-salary-payments-and-harinder-cash-line.md).
**Known defect, now half fixed: payment + cash line must be ONE db function** (the way
`record_transfer` already is), or an interrupted save keeps splitting the books. **Vendor payments
are done** — `record_vendor_payment` (0035, above). **Salary payments, advances and expense
payments still write two rows in a row** and are the remaining exposure; copy 0035's shape.
Also: `deleteSalaryPayment` exists in the store and
cleans both rows, but NO screen calls it — deleting a mis-keyed payment is a fix the owner has
now needed once.

**Also shipped (31 Aug) — the paper STAFF BALANCE register, extractable from Manpower.**
His photo: a hand-ruled month sheet ("STAFF BALANCE UPTO 01.05.26 TO 31.05.26") — per worker:
OP. BALANCE · WAGES · TOTAL · CASH ADVANCE · CR BALANCE · DR BALANCE, with a TOTAL row. Now a
**⤓ button beside the month picker on Manpower → Salary** downloads exactly that for the picked
month as `staff_balance_YYYY-MM.csv` (columns: S.No, Name, Type, Opening, Wages Earned, Total,
Cash Advance, Salary Paid, Recovered, CR (farm owes), DR (worker owes), TOTAL row; his refinement
after the first extract: **Salary Wages (attendance) and Contractual Work are SEPARATE columns**,
straight from `v_salary_accrual`'s attendance_pay/contract_pay — Total stays OP + salary wages
like the paper sheet, so a recovery shows in its own column and only moves CR/DR, which is why
Deepak reads Total −13,933 but DR 8,933 and both are right). The maths is
pure and tested in [`lib/staffBalance.js`](frontend/src/lib/staffBalance.js) (**7 specs, 223
green**): it folds the SAME khata events as the per-worker statement (`khataEvents` /
`buildWorkerKhata`), so opening-at-month = app opening + everything before the month and the
closing agrees with `v_salary_dues` **by construction**; data comes fresh off `v_salary_accrual`
+ `salary_advances` + `salary_payments`, farm-filtered, roster from `v_salary_dues` (so a worker
who has LEFT still gets his row while anything is outstanding; all-zero rows drop; staff sort
before labour). `monthEnd` is now exported from `workerRecovery.js`. **Not in the CSV,
deliberately, and worth saying if he asks:** his sheet's "2 BHOOSA AMT" column (in-kind straw —
the app has no in-kind concept; today that is booked as an advance or not at all) and the
"OUTSIDE LABOUR" row (outside labour is a headcount on activity logs, not a khata).

**Also shipped (27 Aug) — the Farm Calendar became FOUR TABS with a crop filter on
top.** His refinement, after seeing the first cut live (*"crop filter should go up what you did
is stupid. Overdue, Recorded, Scheduled and Upcoming should be tabs, by default Overdue should
be Opened"*): the calendar panel now leads with a **crop `FilterSelect`** (drawn only when >1
crop has tasks; colours assigned from ALL tasks so a crop keeps its colour while filtered), the
grid beneath, the legend now purely explanatory, then **Overdue · Recorded · Scheduled ·
Upcoming** as tabs. **Overdue opens by default and includes DUE TODAY** — it replaced the day
card's Tasks Due block outright (his instruction reversed the old "the card keeps it" rule), so
one-tap Done lives here and the badge now counts today's pending too. **Tapping any date jumps
to Scheduled** for that date (his words); **Recorded** renders the tapped day's records IN the
panel via the new exported `BundleSections` from [`DayCard.jsx`](frontend/src/pages/today/DayCard.jsx)
(the day card renders the same piece inside its frame) plus an "Open this day in the feed →"
link — note Recorded reads live store slices, so recovered advances on old dates only appear via
that link's full fetch; **Upcoming** runs tomorrow → one month out (`plusOneMonth` clamps 31 Jan
→ end-Feb). Pure logic — `filterByCrop` / `plusOneMonth` / `partitionTasks` — in
[`lib/taskCalendar.js`](frontend/src/lib/taskCalendar.js), **10 new specs (216 green)**.
`DayCard` lost its `tasksDue`/`onMarkDone` props; the Scheduled/Done count pills above the feed
survive. Verified over `/uikit` in a real Chromium: default-Overdue, date-tap→Scheduled, and the
Recorded tab showing 25 Aug's "Issued 8 Urea" + the feed link, no page errors.
**Same day, earlier — three small fixes from one screenshot round.**
(1) **The bottom nav names the tab you are on.** Icon-only was his 21-Aug ask and he changed his
mind — *"earlier had names i guess … i want you to show the name of tab which is selected also
make the floating bottom navigation card smaller"*. The active tab is now an icon + label inside
the filled sage pill, the other three stay bare icons, and the white dot beneath is gone (the
label marks the tab instead). Bar height 52px → **44px** (`h-9`, `py-1`). All four labels are ≤6
chars, so the row fits a 320px phone with room to spare — check that if a fifth tab is ever added.
(2) **The plot sheet's Log Work / Issue Inputs buttons are DELETED** at his ask. Both merely
jumped to another screen; the sheet is for reading the plot. 🎯 Harvest stays (the one act the
plot says is due), and the whole button row now renders only when it does — no empty gap. Do not
resurrect the two in-place modals they replaced: one ignored the picked date, the other bypassed
contract labour. (3) **The bell is a calendar icon** — the panel behind it is a calendar, and a
bell promised notifications the app never sends. **The rest of his calendar ask is NEXT, spec'd
below.**

**Also shipped (27 Aug) — ONE box heads every register and every log.**
His screenshot of Purchase History, with the total, New Bill, a funnel and a download strung
across one row: *"i need this kind of box, remove new bill create a box and Amount Download and
filter inside that box … same thing is there in issue replicate"*, then the Machinery/Assets
summary circled — *"current value/amount is small same in assets"* — and *"check where you can
replicate in other screens"*. New shared
**[`components/SummaryBox.jsx`](frontend/src/components/SummaryBox.jsx)**: small caps label,
the figure big in the screen's accent (`tone`), `meta` facts beneath (a labelled one emphasises
its figure, a bare count stays quiet), and the list's **icon actions INSIDE the box** —
funnel + download, the funnel going solid sage while a filter is on. Now on five surfaces:
Purchase History (sage), Issue History (blue `#4169E1`), and — replacing the thin muted
`registerSummary` line — Inventory stock value, Machinery and Assets book value; **plus Trees**
(his next screenshots, same day: the fruit/🪵 counts were unreadable 10px chips beside the page
title — now a box in the trees tab, total big, the Fruiting/Timber split in SummaryBox's new
`side` slot BESIDE the figure, names only, no emoji — his correction: *"move to side … only name
is enough"*). Same round: **the fruit emoji pair is 🍍🍉 now**, everywhere the old 🍎🍇 pair sat
(Trees options + card placeholder, Ledger's Fruit lease row) — he sent a pineapple-watermelon
fruit sticker as the reference; still a PAIR, because the 21-Aug lesson stands (a single fruit
emoji reads as the wrong fruit on his phone). **New Bill is
GONE from the purchase log** at his word; the add door is "New Purchase" on Current Stock (stock
only arrives on a bill), and `PurchaseLogs` no longer takes `onNewBill`. `registerSummary`
became **`itemsLabel(count)`** (money left that line for the box; tests updated, still 206).
**This does NOT reverse his 25-Aug "one quiet line"** — that was about book value shouting from
every CARD, and cards still lead with quantity; it is the page total that reads clearly now.
**Deliberately not converted, and this is the rule:** SummaryBox is for ONE headline figure, so a
three-peer breakdown stays a grid — Labour's Monthly Summary (staff · regular · contractual) and
Trees → Sales (agreed · received · outstanding) keep theirs, and Media's header counts photos,
not money. Say the word and either becomes a box. The Machinery/Assets category dropdown stays
below the box, per his own 25-Aug rule that one filter is a `FilterSelect`.
Checked over `/uikit` in a real Chromium (all three Resources tabs + both logs, no page errors).

**Also shipped (26 Aug) — two things a hand holding a phone could not do.**
(1) **Media's delete was unusable on a phone.** The bin on each grid tile was `opacity-0
group-hover:opacity-100`, and a phone never hovers — so the only door to deleting a photo was
invisible. It now sits in the **viewer's** top bar beside the ✕ and the "3 / 34" count (admin
only), where every photo app puts it: tap photo → bin → confirm. Deleting the last item closes
the viewer, deleting the one on the end steps back, and `deleteMedia` finally has a try/catch
(a Storage failure used to delete the DB row and say nothing). Tiles now carry no buttons at all.
(2) **The Android back gesture no longer walks off the screen** — full record and the
convention for new overlays in [`docs/HANDOFF-back-gesture.md`](docs/HANDOFF-back-gesture.md).
The swipe reaches a web app as a plain history back, so it used to leave the whole page, taking
any half-filled sheet with it (a manager three fields into Log Activity loses the entry — and
nobody reports that, they just stop logging). An open overlay now **parks one history entry** and
closes itself when that entry is popped: [`lib/backTrap.js`](frontend/src/lib/backTrap.js)
(**7 tests**, browser plumbing injected so it runs under vitest's node env) +
[`hooks/useBackClose.js`](frontend/src/hooks/useBackClose.js). Wired once per shell —
`BottomSheet`, each page's local `Modal`, ImageViewer/Cropper, ProfileMenu, SetupChecklist,
AssetSheet, the farm modals, Admin's ConfirmDialog — plus one call per state for the bespoke
ones (Harvest ×8, Media's capture + viewer, Inventory's drill-down, Labour's khata + payment,
Today's Log Activity + bell, the Ledger's inline sale form, Field's plot sheet). **New overlay?
`useBackClose(onClose)` in its shell** — mounting is opening; pass a flag as the 2nd argument
if it stays mounted; guard with `if (!saving)` where the backdrop already does. Four traps
worth knowing, all test-pinned: the parked entry **copies** `history.state` (react-router
keeps its `idx` there); only the **top** overlay may act on a popstate; a navigation made from
inside an overlay is **never** undone; and a back still in flight from a remount can't close a
fresh overlay. **Deliberately NOT built: back-to-minimise and predictive-back** — they need
`@capacitor/app`, a native dep, so every phone would need a rebuilt APK reinstalled; this half
is pure JS and rides a normal Vercel deploy. **206 tests green.** Verified in a real Chromium
over `/uikit` (below), not just by the build.
**The 25–26 Aug UI pass, as rules rather than a log** (details in git; commits `0150174`…`47718cb`):
**one [`RegisterCard`](frontend/src/components/RegisterCard.jsx) draws every register card** —
Inventory stock and both Assets tabs — and any future register (livestock list, buyers, vendors)
should too; **one filter per screen wears a funnel**: [`FilterSelect`](frontend/src/components/FilterSelect.jsx)
(dropdown) when there is one thing to narrow by, [`FilterSheet`](frontend/src/components/FilterSheet.jsx)
+ `AppliedChips` over pure [`lib/filterSheet.js`](frontend/src/lib/filterSheet.js) (Zomato-style
combined sheet, draft until Apply, chips beneath, **no strip at all when unfiltered**) when there
are several — Media and Harvest use it; the Ledger's own View control is his stated exception.
Every register list opens with [`AddButton`](frontend/src/components/AddButton.jsx), and
[`BottomSheet`](frontend/src/components/BottomSheet.jsx) is the one sheet shell.
**Resources is ONE page head** (Inventory · Machinery · Assets — `Assets` takes a `kind` prop,
`RegisterTab` keyed on it), Inventory's Purchases/Issues are buttons that open log views over
the page, and **stock on the shelf sorts above empty shelves** (stable sort, copies first —
`inventoryMaster` is store state). **Today leads with the weather** (`hooks/useWeather.js` +
`lib/weather.js`, shared with the Field pill), no 👋 and no date line; **History is a filter
beside the bell** ([`HistorySheet`](frontend/src/pages/today/HistorySheet.jsx), the feed becomes
that range instead of Last 7 Days, never both); the bell is a **Farm Calendar** — blue dot on
days with records, "See what happened →" loads that day. Day cards de-noise merged rows
(`shortPlotLabel`, notes deduped, a note that merely echoes its label dropped) and Harvest's
cane and non-cane cards share `CycleClock`/`CycleProgress`/`EstYield`.
**Two rules from his corrections, both cheap to violate again:** when he says "empty space",
**take the space away** — never invent content to fill it (the ProfileMenu drawer narrowed to
`72%/280px`; a first cut that added live counts to every row was rejected outright); and
**anything drawn on a photo, a black viewer or a coloured FAB takes a fixed white**, never
`--c-text`/`--c-sub` (Media's overlays were invisible in light mode).
**The check that found that, and it is worth reusing: a dev-only `/uikit` route**
([`pages/UiKit.jsx`](frontend/src/pages/UiKit.jsx), gated on `import.meta.env.DEV`) renders the
REAL pages over a fake in-memory store — no login, no live data — driven by Playwright from the
scratchpad, never the repo, so Vercel builds are untouched (the `@playwright/mcp --extension`
MCP server cannot work here: no Chrome bridge extension). The harness must re-apply its fixture
on a store subscription — the app's own `loadAll()` runs for the seeded farm, fails, and empties
every slice. It covers Today, Harvest, Resources, Media; adding a screen means adding fixture data.

**Just shipped (21 Aug, latest) — Today lost its Expenses tab.** His ask, with a screenshot
of the two-tab strip: *"i rather want expense to be log expense like log activity not a
separate tab."* Today is a single board again; the day card's action row now carries TWO
buttons — **+ Log Activity** first, **🧾 Log Expense** second, both the same solid green at
his correction (the first cut styled Log Expense as a red outline and he read it as the odd
one out; the date row got `flex-wrap` so they drop to their own line on a narrow phone).
**Then, on his "ok go" — the bell became a TASK CALENDAR.** He'd noticed the bell list and
the card's Tasks Due were the same thing twice and proposed a calendar of upcoming activity
dates coloured by crop, asking my call first. The shipped shape is the recommended hybrid he
approved: the bell's popover now holds a month grid ([`lib/taskCalendar.js`](frontend/src/lib/taskCalendar.js),
17 tests — grid maths, month nav, colour assignment, dot rules; component in
[`TaskCalendar.jsx`](frontend/src/pages/today/TaskCalendar.jsx)), dates dotted per crop, a
missed date collapsing to ONE red dot; tapping a date lists its tasks underneath as the same
`ScheduledCard`s the day card uses, Done included. His follow-up from the live screen: task
dates must read as BOXES like today's cell, not just dots — so a task date now gets a
coloured border + tinted fill (red for missed, first crop's colour otherwise) with the day
number in that colour; the dots stay for multi-crop days; selection deepens the fill.
**Also on his word, same day: the Fields plot panel's two buttons became NAVIGATION.**
"Log Activity" → **"Log Work"**, going to `/labour?go=log-work` (Labour's new deep link:
Attendance tab, Log Work form scrolled into view via `#log-work-form`); "Issue Inputs" →
`/resources` (Inventory → Current Stock, where each item's "→ Issue to Plot" lives). The two
in-place modals they used to open — `LogActivityModal` and `IssueInputModal` at the bottom of
Field.jsx — are **DELETED, and deservedly**: the activity modal silently logged today's date
whatever date was picked, and the issue modal's labour path wrote plain day-rate `logLabour`
rows bypassing the contract-type Log Work system. Do not resurrect them.
**Trees, four screenshot points (21 Aug):** (1) Add-a-tree moved to the TOP of the list —
shipped. (2) "Add tree has no location" — the location was never missing, it lives on the
PLANTING (plot/boundary + sides, migration 0006), one step past the species form he was
looking at; now Add a tree CHAINS into the planting form automatically (`addSpecies` returns
the created row for this). (3) Sapling-purchase expenses: he approved the 🌳 Trees
expense type next turn — BUILT: migration [`0034`](supabase/migrations/0034_trees_expense_category.sql)
added a `plants` category to the check constraint (**applied to the live DB via MCP**), and
Log Expense gained type 🌳 Trees (cats: plants/maintenance/other). (4) Buyer-not-in-list on tree sales:
already handled by design — the Buyer dropdown plus a free-text name (`tree_revenue.
buyer_name`, the deliberate fallback); dues tracked per sale via pending/partial/paid, not in
the party khata. Told him: type the thekedar once; add him to Buyers only if he becomes a
regular.
**Next batch, same day (all four of his asks, shipped):** (1) **PRIMARY COLOUR IS NOW
`#8A9A5B`** (sage/olive) — one sweep replaced `#1D9E75` and its `29,158,117` rgba components
across all 47 frontend files + tailwind config + index.css; there is no colour token, the hex
is literal everywhere, so any future rebrand is another sweep. (2) **Tree species have a
photo slot** exactly like the livestock cards (tap empty → pick+crop → save; tap photo →
viewer with Change/Remove): `tree_species.photo_path` (existed since 0006, unused till now),
`updateSpeciesPhoto` in the tree store, URL derived via `resolveUrl` on map — the emoji is
now only the empty-slot placeholder. (3) 🌳 Trees expense type live (see above). (4) **Log
Expense's Crop/Field type leads with two dashed REDIRECT chips** — "👷 Log Work →"
(`/labour?go=log-work`) and "📦 Buy Inputs →" (`/resources`) — his call: one place to start
booking any spend, routed to the right screen. Audit finding, stated to him: crop_field is
the only type needing redirects (wages → Log Work; input/machine purchases → Resources bill
for vendor khata + stock); feed/vet/saplings/utilities are genuine farm_expenses and stay.
**The bottom nav is a floating icon-only pill** (his reference screenshot): dark olive
rounded-full bar, active tab = filled `#8A9A5B` circle + white dot beneath, labels now
aria-only, Media unread badge kept. His follow-up ("isn't looking nice over white
background") made it TRULY float: the nav is `absolute` over the page (translucent
`rgba(32,37,19,0.92)` + blur + deep shadow), the Field map runs edge-to-edge underneath, and
every page root keeps its tail clear via the `main > * { padding-bottom … !important }` rule
in [`index.css`](frontend/src/index.css) — a page's own bg paints that padding, so there is
no band anywhere. Field's legend climbed above the pill, MapLibre's bottom controls are
offset in the same CSS, and the plot detail sheet went z-50 so it covers the pill instead of
sliding up behind it. Any new bottom-anchored overlay must sit at z-50+. Also at his ask:
the tree "fruit" emoji is now the 🍎🍇 pair everywhere (a single 🍋 read as a mango on his
phone and confused a guava's row).
**"Profile image vanishes after every push" — diagnosed on live data, fixed, restored.** Not
the deploys: `Profile.jsx` uploaded the avatar to Storage instantly but wrote `avatar_url`
only on the form's Save button, so a picked photo LOOKED saved, never persisted, and any hard
reload (which a deploy forces) lost it — his two orphaned upload files sat in `farm-photos/
avatars/` with every `user_profiles.avatar_url` NULL. `pickPhoto` now writes `avatar_url`
immediately on upload (and deletes the replaced file); his latest upload was pointed back at
his row by direct SQL, so his photo is already back without re-uploading. **The day card's Tasks Due block
deliberately SURVIVES** (overdue + today, one-tap Done) — a calendar cannot nag about the
past and Done must stay one tap (design rule #5); do not fold it into the calendar. Crops
have no colour column: `cropColorMap` assigns from an 8-colour palette by alphabetical rank —
deterministic, distinct up to 8 crops; if he ever wants to pick colours, that becomes a
column on `crops` read first. `UpcomingBlock.jsx` is deleted (the calendar replaced it); the
bell badge still counts overdue + tomorrow + next-7-days. **156 tests green.** `Expenses.jsx` kept only the
form, exported as **`AddExpenseModal`** — the list page (summary header, category chips,
delete) is DELETED. Deep links still work: `/today?log=expense` and the old `?tab=expenses`
both open the form (param cleared after), `/expenses` redirects there, and Livestock →
Finance's Add Expense navigates to it. **Known, deliberate loss to flag if he misses it: the
delete-an-expense door.** `deleteFarmExpense` is now called from nowhere — the Ledger's
General Expenses rows show and pay but don't delete. If a mis-entered expense needs removing,
that is the thing to build (a bin on the Ledger row), not a tab revival. Browsing survives
elsewhere by design: day cards per day, Ledger for the full list.

**Also shipped (21 Aug) — the Cash Book's seven account chips became three.** The owner,
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
account). **139 tests green.** Follow-up same day, his ask: **the Summary card now matches**
— its breakdown shows 💵 Cash in hand + one **🏦 Bank** line (all six summed), tap Bank to
expand the per-account breakup (MAIN pill kept on Vipul's). This **reverses his 17 Aug
"only main account, no partner detail" ruling** — his words, 21 Aug: *"should show Bank and
should be expandable to show breakup of bank accounts"* — do not collapse it back. Move Money
keeps all six banks in its dropdowns (his call: *"keep the choice"*), reordered at his ask so
Vipul's main account leads the list, tagged "· main". **Also 21 Aug, three phone-screenshot
fixes:** (1) the per-card "📋 Assign / Log Task" button and its `LogTaskModal` are DELETED —
his call, Log Work below attendance does the job better; old logs it wrote (no contract type)
still render via the day-rate fallback in `MonthWorkLogs`; (2) full-screen overlays now pad
past the phone's status bar / gesture bar with `env(safe-area-inset-*)` (the pattern App.jsx
already used): ImageCropper's Done sat behind the gesture bar, ImageViewer's pencil/bin sat
under the clock, plus Labour's khata overlay header and Media's capture ✕ / tag form /
gallery nav (its guessed `pt-12` replaced with the exact inset). Also live
in production, seen in his screenshot: **the first
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
they will get credits"*): (1) the Summary breakdown — *superseded 21 Aug*: it now shows cash
+ one expandable **Bank** line (see "Just shipped" above; his 17 Aug "only main account"
refinement is reversed by his own 21 Aug ask). MAIN = the first bank account, the same pick
`accountFor('bank')` routes transactions through, so badge and behaviour cannot disagree, and
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
[`Assets.jsx`](frontend/src/pages/Assets.jsx#L250) (machinery, asset) still defaultat many places there are tiles instead of dropdown filter i want to replace those also place filter icon so that it is easily understandable
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
- **Primary color:** `#8A9A5B` (sage/olive — owner's pick, 21 Aug; replaced the original `#1D9E75` teal everywhere in one sweep)
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

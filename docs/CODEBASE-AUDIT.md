# Codebase Structure Audit

**Date:** 2026-08-05
**Commit audited:** `c7e83e7` (master, clean, synced with origin)
**Scope:** repository structure, coupling, and troubleshootability — *not* a bug hunt
**Method:** static tracing of imports, git history, and build configuration. No code was changed.

---

## Executive summary

The app is a **React 18 + Vite SPA talking directly to Supabase**. It works, it ships, and
the database layer is genuinely well disciplined. The structural problems are concentrated
in three places, and they compound each other:

| # | Problem | Why it slows troubleshooting |
|---|---|---|
| 1 | `backend/` is dead code that the project bible still presents as the architecture | Every investigation starts from a false map |
| 2 | One 2,409-line store owns every domain | A change to labour can break livestock, and nothing tells you |
| 3 | Nothing catches errors — no boundary, no lint, no CI, no tests | Failures reach you as a white screen or silence, not a message |

**The single highest-value fact in this audit:** the reason bugs reach you instead of being
caught is not the file sizes. It is that **there is no layer between "code is wrong" and
"owner sees broken app."** No lint, no CI, no error boundary, no test. Fixing that costs
roughly one day and pays back more than the entire refactor.

---

## 1. Is `backend/` used by anything?

### Verdict: **No. It is dead code, and it cannot run.**

This is definitive, not a judgement call. Five independent lines of evidence:

**1.1 — It cannot be imported, even locally.**
`backend/routers/*.py` import from two modules that are in `.gitignore` and do not exist
on disk:

```
.gitignore:
  backend/dependencies.py
  backend/schemas/
```

```
backend/routers/alerts.py:7    from dependencies import get_current_user
backend/routers/alerts.py:9    from schemas.alert import AlertRead
backend/routers/farms.py:11    from schemas.plot import PlotSummary
...  (7 routers total depend on these)
```

`ls backend/dependencies.py backend/schemas/` → **No such file or directory.**

A fresh clone cannot start this server. Neither can *this* working copy. It has not been
runnable for as long as those ignore rules have existed.

**1.2 — It targets the wrong database.**
`backend/config.py:22` builds a **SQL Server** connection string:

```python
return f"mssql+pyodbc:///?odbc_connect={quote_plus(odbc)}"
```

with `pyodbc==5.1.0` in `requirements.txt`. The live database is Supabase **PostgreSQL**.
This backend is a survivor of an earlier, abandoned architecture — the first commit that
touched it says so: *"farm app with SQL Server backend"*.

**1.3 — Nothing deploys it.**
No `Dockerfile`, no `Procfile`, no `railway.json`, no `*.toml` anywhere in the repo.
`vercel.json` builds the frontend and nothing else:

```json
{ "buildCommand": "cd frontend && npm install && npm run build",
  "outputDirectory": "frontend/dist" }
```

**1.4 — Nothing calls it.**
- `axios` is a declared dependency — **zero source files import it**.
- `VITE_API_URL=http://localhost:8000` exists in `.env.example` and `.env.local` —
  **zero source files reference it**.
- Every data call in the app goes through `frontend/src/lib/supabase.js`.

**1.5 — It is abandoned by history.**
Two commits, ever. Last touched **2026-06-11**, roughly two months before this audit,
while the frontend has been committed to continuously.

### What this means for "well-structured"

CLAUDE.md §2, §3, §7, §8 and §12 describe a FastAPI/SQLAlchemy/Celery service as *the*
architecture. **None of it is real.** Sections 7.1–7.4 give detailed Python service code
(`crop_service.py`, `cost_service.py`, `alert_service.py`) for files that do not exist and
never ran. The alert engine, the P&L service, the WhatsApp notifications, the PDF
reports — all of it is aspiration written in the present tense.

This is the same failure mode CLAUDE.md §6 already documents and fixed for the database
schema:

> *"It drifted badly — it described 14 tables when the database had 43 … Anyone reading it
> built a mental model of a database that wasn't there, which is a real source of bugs."*

The architecture sections have exactly that disease, and it has not been treated yet.

**The correct target architecture to hold yourself to is: a React SPA where Supabase RLS
is the security boundary and the Zustand store is the service layer.** That is a
legitimate, defensible architecture for this app. Judged against it, the codebase is
mid-quality with fixable problems. Judged against the fictional FastAPI architecture, it
looks catastrophic. Pick the real one.

### Recommendation

Delete `backend/` (it is recoverable from git history forever) and rewrite CLAUDE.md §2,
§3, §7, §8, §12 to describe what exists. Keep §6 — it is already honest.

> ⚠️ Also: `backend/**/__pycache__/*.pyc` files are **committed to git** (10 of them),
> despite `__pycache__/` being in `.gitignore`. They were added before the ignore rule.
> Build artifacts in version control.

---

## 2. Coupling map of `frontend/src`

### 2.1 The layer graph

```
                          main.jsx
                             │
                          App.jsx ──────────► 18 page components (routes)
                             │
        ┌────────────────────┼────────────────────────┐
        ▼                    ▼                        ▼
   store/auth.js       store/index.js            store/trees.js
    (399 lines)         (2,409 lines)             (322 lines)
        │                    │                        │
        └────────────────────┼────────────────────────┘
                             ▼
                      lib/supabase.js
                             │
                             ▼
                    Supabase (PostgREST)
```

There are **exactly two layers**: components and one giant store. There is no service
layer, no domain layer, and no data-access layer. `store/index.js` is simultaneously the
API client, the mapper, the cache, the business logic, and the derived-state engine.

### 2.2 Fan-in — who depends on what

| Module | Imported by | Assessment |
|---|---|---|
| **`store/index.js`** | **20 modules** | 🔴 God module. The tangle. |
| `lib/supabase.js` | 16 modules | 🟡 Expected for a client, but pages bypassing the store to query directly is a leak (see 2.4) |
| `store/auth.js` | 15 modules | 🟢 Cohesive — session, profile, farm membership |
| `lib/attachments.js` | 8 modules | 🟢 Well-bounded utility |
| `components/FilePicker` | 5 modules | 🟢 Fine |
| `components/Attachment` | 4 modules | 🟢 Fine |
| `store/trees.js` | 3 modules | 🟢 **This is the model to copy** — a domain store that already exists and works |
| `store/theme.js` | 1 module | 🟢 Fine |
| `api/client.js` | 2 modules | 🔴 Vestigial — see 2.5 |

### 2.3 The dependency tangles

**Tangle 1 — `store/index.js` is a hub with 20 spokes.**
Every page except `Login`, `Profile`, `ResetPassword`, `SuperAdmin`, `AcceptInvite`,
`FarmSettings` and `Diary` imports it. Because it is one Zustand store, **a change to any
domain's state invalidates every subscriber in the app.** There is no way to reason about
blast radius: editing a livestock action and editing a labour action have identical
apparent risk, which is to say unbounded.

**Tangle 2 — 33 of 38 consumers effectively subscribe to the *whole* store.**
This one is not obvious from file sizes, and it matters a lot. Of 38 `useAppStore` call
sites:

| Form | Count | Re-renders on *any* store change? |
|---|---|---|
| `useAppStore()` — no selector | 28 | **Yes** — subscribes to the whole store object |
| `useAppStore(s => ({ a, b }))` — object literal, no comparator | 5 | **Yes** — new object each render, `Object.is` always fails |
| `useAppStore(s => s.plots)` — scalar selector | 5 | No ✅ |

```js
// pages/Field.jsx:145 — the common case, 28 sites
const { cropCycles, cropMaster, activities, issues, labourLogs, plots, livestockMaster } = useAppStore()

// pages/livestock/health.jsx:149 — looks correct, behaves identically, 5 sites
const { livestockHealthLogs, addLivestockHealthLog, deleteLivestockHealthLog } = useAppStore(s => ({
  ...   // new object literal → Zustand's default Object.is comparison never matches
}))
```

Zustand v4 compares selector output with `Object.is`. A selector returning a fresh object
literal fails that check on every store update, so the 5 object-literal sites re-render
exactly as often as the 28 that pass no selector at all. The fix is `shallow` from
`zustand/shallow` — **which is never imported anywhere in this codebase** (the 6 grep hits
for "shallow" are all comments about `set()` merge semantics, unrelated).

Net effect: marking one labourer present re-renders the livestock page, the ledger page,
and the map. Only 5 call sites in the app are correctly scoped.

Consequence for troubleshooting: React DevTools' "why did this render" is useless here —
the answer is almost always "because something, somewhere, changed." You lose your best
tool for diagnosing UI staleness and performance.

**Tangle 3 — cross-domain writes are hidden inside domain actions.**
The ledger is written to from inside labour and livestock actions:

```
store/index.js:997    addAdvance          → get().writeCashEntry(...)   [labour  → ledger]
store/index.js:1053   markLabourPaid      → get().writeCashEntry(...)   [labour  → ledger]
store/index.js:1081   addSalaryPayment    → get().writeCashEntry(...)   [labour  → ledger]
store/index.js:1092   deleteSalaryPayment → get().removeCashEntriesFor  [labour  → ledger]
store/index.js:1726   addLivestockRevenue → get().writeCashEntry(...)   [livestk → ledger]
store/index.js:1755   deleteLivestockRev  → get().removeCashEntriesFor  [livestk → ledger]
store/index.js:1809   logActivity         → get().cropCycles            [activity→ crops ]
```

These are real, legitimate domain couplings — money *should* move when labour is paid. The
problem is they are **invisible**: `get()` reaches into the same flat object, so there is
no import, no interface, and no signal that a boundary is being crossed. When the cash book
is wrong, nothing in the file structure points you at labour.

**Tangle 4 — `loadAll` is a 28-query all-or-nothing bootstrap.**
`store/index.js:518-655` fires 28 Supabase queries in one `Promise.all`, then `set()`s all
28 results in a single call, wrapped in one try/catch whose failure path is:

```js
} catch (err) {
  console.error('loadAll error:', err)
  set({ loading: false })
}
```

If any one query fails — one RLS policy misconfigured on one table — **the entire app
silently loads empty**. No error surfaces to the user. `loading` goes false, `initialized`
never becomes true, and every page renders blank. This is the highest-frequency
"everything is broken and I can't tell why" generator in the codebase.

### 2.4 Layer violation — pages querying Supabase directly

11 pages import `lib/supabase.js` *and* `store/index.js`:

```
Admin, Dashboard, Expenses, Harvest, Inventory, Labour, Media, Today
```

So some reads/writes go through the store (cached, mapped, in the ledger's view of the
world) and some go straight to Postgres (uncached, unmapped, invisible to the store). Two
sources of truth for the same tables.

Practical effect: you fix data on one screen, another screen still shows the old value,
and there is no rule telling you which path a given piece of data took.

### 2.5 Dead and vestigial modules

| File | Status | Evidence |
|---|---|---|
| `backend/` (44 files) | **Dead** | Section 1 |
| `pages/Diary.jsx` (orphan) | **Dead** | Imported by 0 modules. `/diary` route redirects to `/today` (`App.jsx:145`) |
| `data/demo.js` | **Dead** | Imported by 0 modules |
| `lib/idMap.js` | **Dead** | Imported by 0 modules |
| `api/client.js` | **~95% dead** | See below |
| `src/ruvector.db` | **Stray artifact** | Untracked binary sitting in source tree |
| `axios` (dependency) | **Unused** | 0 imports |
| `typescript` (devDep) | **Unused** | 0 `.ts`/`.tsx` files |

**On `api/client.js`** — a small correction to your brief. It is 94 lines. Lines 1–85 are
*real* Supabase calls (`plotsApi`, `cropsApi`, `cyclesApi`, `harvestApi`, `salesApi`,
`activitiesApi`, `inventoryApi`, `labourApi`, `assetsApi`, `dashboardApi`) — a genuine,
reasonable API layer. **None of those ten exports is imported anywhere.** Only lines 86–94
are used, and those *are* fake:

```js
// ── Legacy stubs (kept so Field.jsx / old components don't break) ──
export const farmApi = {
  getDashboard: () => Promise.resolve({ data: null }),
  submitDiary:  () => Promise.resolve({ data: null }),
  saveMapState: () => Promise.resolve(),
  uploadFile:   () => Promise.resolve({ data: { public_url: null } }),
}
```

So the file is the inverse of what it looks like: the good part is unused, the stub part is
what survives.

### 2.6 A live bug found while tracing

Not a structural finding, but it fell out of the trace and it is the perfect illustration
of the problem, so it belongs here.

`pages/Diary.jsx:45` — the manager's daily diary submit handler:

```js
try {
  await farmApi.submitDiary(FARM_ID, payload)   // → Promise.resolve({ data: null })
} catch {
  // offline — will sync later                   // ← comment describes behaviour that does not exist
} finally {
  setSubmitting(false)
  setSubmitted(true)                             // ← always "success"
}
```

Then it renders:

> ✅ **Diary Submitted!** Owner has been notified. See you tomorrow.

Nothing is saved. Nothing is sent. Nobody is notified. The page is currently unreachable
(the `/diary` route redirects to `/today`), so no user is hitting it today — but the file
is still in the tree, still compiles, and is one route edit away from silently discarding
the manager's daily work.

**Every guard that should have caught this is absent**: a lint rule would have flagged the
empty catch; a type checker would have flagged a stub whose return type doesn't match; a
test would have asserted a row appears; CI would have blocked the merge. This is what "no
safety net" costs in practice.

---

## 3. Plan to split `store/index.js`

### 3.1 Current anatomy (2,409 lines)

| Lines | Contents |
|---|---|
| 1–8 | Imports + `getFarmId()` helper |
| 9–433 | **24 mapper functions** (`mapCrop`, `mapSale`, `mapLivestock`, …) — snake_case → camelCase |
| 434–448 | `useMapStore` (map viewport — already separate, tiny) |
| 449–2399 | **`useAppStore`** — 47 state keys + 108 actions |
| 2400–2407 | `useFarmStore` (farm meta — already separate, tiny) |
| 2408–2409 | Exports |

Precedent already exists in this repo: `store/trees.js` (322 lines) is a working domain
store with its own load, its own actions, and its own consumers. **The split is not
inventing a pattern — it is extending one that already works here.**

### 3.2 Target layout

```
store/
├── auth.js          (unchanged, 399)  — session, profile, active farm
├── theme.js         (unchanged, 14)
├── trees.js         (unchanged, 322)  — already a domain store ✅
├── map.js           (new, ~20)        — useMapStore, lifted out
├── farm.js          (new, ~15)        — useFarmStore, lifted out
├── mappers/         (new, ~430 total) — the 24 map* functions, one file per domain
│   ├── crops.js  inventory.js  labour.js  livestock.js  assets.js  sales.js  money.js
├── crops.js         (new, ~380)
├── plots.js         (new, ~120)
├── inventory.js     (new, ~330)
├── labour.js        (new, ~600)
├── livestock.js     (new, ~300)
├── assets.js        (new, ~220)
├── sales.js         (new, ~380)
├── ledger.js        (new, ~350)
├── media.js         (new, ~60)
└── bootstrap.js     (new, ~80)        — orchestrates per-store load()
```

No file over ~600 lines; most under 400. Within CLAUDE.md's own limits.

### 3.3 Exact allocation of every export

**`store/plots.js`**
- State: `plots`
- Actions: `addPlot`, `updatePlot`, `deletePlot`
- ⚠️ `deletePlot` reads `cropCycles` → must call `useCropStore.getState().cropCycles`

**`store/crops.js`**
- State: `cropMaster`, `cropCycles`, `cropResiduals`, `activities`, `activityTypes`, `sprayReminders`
- Actions: `addCrop`, `updateCrop`, `deleteCrop`, `addCropCycle`, `updateCropCycle`,
  `setCycleOpeningCost`, `recordResidualSale`, `logActivity`, `logActivities`,
  `addActivityType`, `deleteActivityType`, `addSprayReminder`, `dismissSprayReminder`
- ⚠️ `recordResidualSale` → `writeCashEntry` (ledger); `logActivity` reads `cropCycles` (internal)

**`store/inventory.js`**
- State: `inventoryMaster`, `purchases`, `issues`
- Actions: `addInventoryItem`, `updateInventoryItem`, `deleteInventoryItem`,
  `recordPurchase`, `recordOpeningStock`, `recordBillPurchase`, `issueItem`,
  `deletePurchase`, `deleteIssue`
- ✅ Cleanest slice — all cross-references are internal

**`store/labour.js`** (largest)
- State: `permanentStaff`, `regularLabourers`, `contractualLabour`, `workTypes`,
  `labourLogs`, `todayAttendance`, `staffMonthAttendance`, `publicHolidays`, `advances`,
  `salaryPayments`, `salaryDues`, `manpowerSettings`
- Actions: `addPermanentStaff`, `updatePermanentStaff`, `deletePermanentStaff`,
  `addRegularLabourer`, `updateRegularLabourer`, `deleteRegularLabourer`,
  `deactivateLabourer`, `reactivateLabourer`, `addContractualLabour`,
  `updateContractualLabour`, `deleteContractualLabour`, `markAttendance`,
  `refreshTodayAttendance`, `loadMonthAttendance`, `markAttendanceOnDate`,
  `loadPublicHolidays`, `addPublicHoliday`, `deletePublicHoliday`, `addAdvance`,
  `markAdvanceRecovered`, `markLabourPaid`, `addSalaryPayment`, `deleteSalaryPayment`,
  `labourerName`, `logLabour`, `logLabourBatch`, `addWorkType`, `deleteWorkType`,
  `setManpowerSettings`
- Selectors: `selectFieldWorkers`, `selectDrivers`
- ⚠️ **4 calls into ledger** — the heaviest cross-boundary dependency

**`store/livestock.js`**
- State: `livestockMaster`, `livestockCountLogs`, `livestockHealthLogs`,
  `livestockRevenue`, `livestockPnl`
- Actions: `addLivestock`, `updateLivestock`, `closeLivestock`, `addLivestockCountLog`,
  `deleteLivestockLog`, `addLivestockHealthLog`, `deleteLivestockHealthLog`,
  `addLivestockRevenue`, `deleteLivestockRevenue`
- ⚠️ 2 calls into ledger

**`store/assets.js`**
- State: `machineryMaster`, `farmAssets`
- Actions: `addMachinery`, `updateMachinery`, `disposeMachinery`, `addFarmAsset`,
  `updateFarmAsset`, `disposeFarmAsset`, `updateAssetPhoto`, `updateAssetPrice`
- Selector: `selectTractors`
- ✅ Fully self-contained

**`store/sales.js`**
- State: `harvestSessions`, `sales`, `buyers`, `partners`, `scrapSales`
- Actions: `addHarvestSession`, `addCaneSupply`, `markCanePayment`, `closeCaneHarvest`,
  `addCropSale`, `markCropSalePayment`, `addBuyer`, `updateBuyer`, `updatePartner`,
  `updateCaneMillInfo`, `addScrapSale`
- ⚠️ `addHarvestSession` reads `cropMaster` + `cropCycles` (crops)

**`store/ledger.js`** — extract **first**, everything else depends on it
- State: `farmExpenses`, `vendors`, `vendorPayments`, `ownerCashEntries`,
  `expensePayments`, `cashBook`, `vendorBalances`, `incomeLedger`, `expenseLedger`,
  `monthlySummary`, `cropPnl`
- Actions: `addFarmExpense`, `deleteFarmExpense`, `addVendor`, `addVendorPayment`,
  `addOwnerCashEntry`, `addExpensePayment`, `loadLedgerData`, **`writeCashEntry`**,
  **`removeCashEntriesFor`**
- 🔑 `writeCashEntry` / `removeCashEntriesFor` become the **public cross-domain interface**

**`store/media.js`** — `mediaItems`, `addMediaItem`

**`store/ui.js`** (or fold into `auth.js`) — `setupChecklistOpen`, `openSetupChecklist`,
`closeSetupChecklist`

**`store/bootstrap.js`** — replaces `loadAll`; holds `loading` / `initialized`

### 3.4 How cross-store calls work

The pattern is **already used in this codebase** — `store/index.js:5`:

```js
const getFarmId = () => useAuthStore.getState().activeFarmId
```

Same mechanism, made explicit at the top of each file:

```js
// store/labour.js
import { useLedgerStore } from './ledger'

markLabourPaid: async (labourerId, amount) => {
  // ... labour writes ...
  await useLedgerStore.getState().writeCashEntry({ ... })
}
```

The dependency becomes a **real import at the top of the file**. That is the entire point:
open `labour.js`, see `import { useLedgerStore }`, and you know instantly that paying
labour touches the cash book. Today that fact is buried on line 1053 of a 2,409-line file.

**Dependency direction must stay acyclic:**

```
ledger  ←── labour, livestock, crops, sales    (money is written to, never reads back)
crops   ←── plots, sales
auth    ←── everything (already true)
```

If a cycle appears, the shared piece belongs in `ledger.js` or a new `store/shared.js`.

### 3.5 What breaks — the honest list

**A. Every consumer call site — 38 of them across 20 files. This is the bulk of the work.**

```js
// BEFORE — pages/Field.jsx:145 (one hook, one store)
const { cropCycles, cropMaster, activities, issues, labourLogs, plots, livestockMaster } = useAppStore()

// AFTER — five stores, and now with selectors
const cropCycles      = useCropStore(s => s.cropCycles)
const cropMaster      = useCropStore(s => s.cropMaster)
const activities      = useCropStore(s => s.activities)
const issues          = useInventoryStore(s => s.issues)
const labourLogs      = useLabourStore(s => s.labourLogs)
const plots           = usePlotStore(s => s.plots)
const livestockMaster = useLivestockStore(s => s.livestockMaster)
```

Worst offenders by call-site count: `Admin.jsx` (10), `Labour.jsx` (3), `Field.jsx` (3),
then 17 files with 1–2 each.

The 5 object-literal selector sites (`Expenses.jsx:232`, `livestock/animals.jsx:20`,
`livestock/finance.jsx:75`, `livestock/health.jsx:149` and `:302`) need `shallow` added as
well as re-pointing — splitting the store alone will not fix their re-render behaviour.

**B. `loadAll` must be decomposed.** One `Promise.all` of 28 queries → per-store `load()`.
`bootstrap.js` runs them concurrently but **fails independently**:

```js
const results = await Promise.allSettled([
  useCropStore.getState().load(),
  useLabourStore.getState().load(),
  // ...
])
// one table's RLS failure no longer blanks the whole app
```

This is a **behaviour change, and a deliberate improvement** — see Tangle 4. It is the
single biggest troubleshooting win in the whole refactor.

**C. `initialized` / `loading` semantics change.** Anything gated on
`if (!initialized) return <Spinner/>` needs to decide: wait for all stores, or render
per-section. Recommend per-section — a failed livestock load should not blank the map.

**D. The 24 mappers move.** Pure functions, no state — mechanical, but they must move
*before* the slices that use them or you get import errors.

**E. Selector exports.** `selectFieldWorkers`, `selectDrivers` → `labour.js`;
`selectTractors` → `assets.js`. Import sites in `Field.jsx`, `Labour.jsx`, `Today.jsx`
must update.

**F. Live-data risk.** There is no test suite, so **nothing will tell you if this breaks.**
Sequence it so each step is independently verifiable by hand.

### 3.6 Suggested order (each step ships independently)

| Step | Work | Effort | Risk |
|---|---|---|---|
| 0 | **Add lint + error boundary + CI first** (Section 4 items 1–3) | 1 day | — |
| 1 | Mappers → `store/mappers/*` | 2 h | 🟢 Low |
| 2 | `useMapStore` → `map.js`, `useFarmStore` → `farm.js` | 1 h | 🟢 Low |
| 3 | **`ledger.js`** — everything depends on it | 4 h | 🟡 Med |
| 4 | `assets.js` — zero cross-deps, proves the pattern | 3 h | 🟢 Low |
| 5 | `media.js`, `plots.js` | 3 h | 🟢 Low |
| 6 | `inventory.js` | 4 h | 🟡 Med |
| 7 | `livestock.js` (2 ledger calls) | 5 h | 🟡 Med |
| 8 | `crops.js` | 6 h | 🟡 Med |
| 9 | `sales.js` | 6 h | 🟠 High — cane logic is intricate |
| 10 | `labour.js` (4 ledger calls, largest) | 8 h | 🟠 High |
| 11 | `bootstrap.js`, delete `index.js`, convert to selectors | 6 h | 🟡 Med |

**Total ≈ 6–7 working days**, in shippable increments. Do not attempt it in one pass —
without tests, a big-bang refactor is unverifiable.

---

## 4. Prioritised remediation roadmap

Ordered by **troubleshooting payoff per hour**, not by severity. The top four items total
about one day and change your failure experience more than everything below them combined.

### 🥇 Tier 1 — do these first (≈1 day, transforms daily experience)

**1. React error boundary + visible error UI — 2 h — 🔥 highest payoff in the audit**
Today any render throw produces a **white screen with no information**. You cannot tell a
crash from a slow load from a failed login. One `ErrorBoundary` at the app root, plus one
per route, converts every white screen into a readable error with a component stack and a
"reload" button. *(Note: this was built in the 2026-08-05 session and reverted with the iOS
redesign rollback — it is worth re-adding on its own.)*

**2. Surface `loadAll` failures — 1 h — 🔥 fixes the top "everything is broken" class**
`store/index.js:652` swallows a 28-query failure into `console.error` and renders an empty
app. Change to `Promise.allSettled`, keep per-domain error state, show a banner naming the
domain that failed. This one change removes the single most confusing failure mode you
have.

**3. ESLint + `eslint-plugin-react-hooks` — 2 h — catches whole bug classes for free**
No config exists. `react-hooks/exhaustive-deps` alone catches stale-closure bugs, which are
the hardest React bugs to diagnose by hand. `no-empty` catches the 9 silent
`catch {}` blocks. `no-unused-vars` catches the dead `farmApi` import in `Field.jsx`.
Run `--max-warnings=0` on the pre-existing set, then ratchet.

**4. GitHub Actions CI: build + lint on push — 1 h — closes the gap to production**
Right now **Vercel deploys every push to master with zero gates**. A syntax error reaches
production before you know it exists. A 20-line workflow running `npm ci && npx eslint . &&
npm run build` catches it in 90 seconds instead of via a phone call from the farm.

**5. Delete dead code — 2 h — shrinks the search space permanently**
`backend/` (44 files), `pages/Diary.jsx`, `data/demo.js`, `lib/idMap.js`, the unused 85% of
`api/client.js`, `axios` + `typescript` from `package.json`, and the committed `.pyc`
files. Roughly 3,000 lines you will never again grep through, wonder about, or read while
debugging something else. All recoverable from git.

**6. Rewrite CLAUDE.md §2/§3/§7/§8/§12 — 2 h — stops the map from lying**
Apply the treatment §6 already got. Describe the real architecture: React SPA + Supabase,
RLS as the security boundary, Zustand as the service layer. Move the FastAPI material to a
clearly-labelled "Possible future architecture" appendix or delete it.

### 🥈 Tier 2 — structural (≈2 weeks, compounding returns)

**7. Convert to Zustand selectors — 4 h — unlocks render debugging**
`useAppStore()` → `useAppStore(s => s.thing)` at 28 sites, plus `shallow` at the 5
object-literal sites that only *look* correct today (Tangle 2). Stops app-wide re-renders
and makes React DevTools' render tracing meaningful again. Cheap, mechanical, and best done
*during* the store split (Section 3.5A) rather than twice.

**8. Split `store/index.js` — 6–7 days — see Section 3**
The blast-radius fix. After this, "the cash book is wrong" points at `ledger.js` and its
four importers, not at a 2,409-line file.

**9. Fix the two-sources-of-truth leak — 1 day**
11 pages query Supabase directly *and* through the store. Pick one rule — *all writes go
through a store action* — and move the direct calls. Until then, cache-staleness bugs have
no systematic explanation.

**10. Split the 6 remaining oversized pages — 4–5 days**
`Admin.jsx` (2,365) is really 11 separate admin screens in one file — it has 10 separate
`useAppStore()` calls, one per embedded screen, which is the seam. `LedgerPage.jsx` (1,846),
`Harvest.jsx` (1,390), `Field.jsx` (1,293), `Labour.jsx` (1,285), `Trees.jsx` (1,057).
`pages/livestock/` and `pages/today/` already show the right pattern — copy it.

**11. Reorganise by domain — 2 days — do this LAST**
CLAUDE.md's own rules say organise by feature, not type. But moving files is pure churn
until items 8 and 10 have established where the domain boundaries actually are. Target:

```
src/features/{crops,labour,livestock,inventory,ledger,assets}/
    {pages,components,store,mappers}
src/shared/{components,lib}
```

### 🥉 Tier 3 — quality investment (ongoing)

**12. Tests on money paths first — 3 days for meaningful coverage**
Vitest + React Testing Library. Do **not** chase CLAUDE.md's 80% target — chase the code
where being wrong costs real money: `writeCashEntry`, `markLabourPaid`, `addAdvance`,
`issueItem`, `cropPnl`, `addCropSale`. Twenty tests over those paths are worth more than
500 over UI rendering. These also become the safety net that makes item 8 verifiable — a
strong argument for pulling some of this earlier.

**13. JSDoc typedefs on store shapes — 1 day — 80% of TypeScript's benefit, 5% of the cost**
Full TS migration on 22k lines of JSX is not justified. But `@typedef` blocks on the ~24
mapper outputs give editor autocomplete and catch `cycle.plotId` vs `cycle.plot_id`
mistakes — which, given the snake_case↔camelCase boundary running through every mapper, is
a live and recurring bug source. Then either drop the `typescript` devDependency or
actually use it via `checkJs`.

**14. Replace `alert()` with a toast component — 1 day**
39 `alert()` calls are the entire user-facing error system. Blocking, unstyled, invisible
on mobile web, and unloggable. A toast that also reports to `console.error` with context
makes user reports actionable.

**15. Error reporting (Sentry free tier) — 2 h — makes bugs come to you**
This is the item that best serves your stated goal of *"ideally it gets caught before it
reaches me."* With an error boundary (item 1) already in place, Sentry turns "the manager
says it's broken" into a stack trace with a user, a route, and a timestamp, delivered
before the phone call.

### Effort summary

| Tier | Effort | What it buys |
|---|---|---|
| **1** | **~1 day** | Failures become visible and named instead of silent white screens. **Start here.** |
| 2 | ~2 weeks | Failures become *localisable* — the file tells you where to look |
| 3 | ~1 week + ongoing | Failures get caught before they reach you |

---

## 5. What is already good

Worth stating plainly, because a list of problems reads worse than the codebase is:

- **`supabase/migrations/`** — 25 numbered, idempotent migrations with a documented
  discipline in `supabase/README.md` that explains *why*, citing real bugs the old
  dashboard-editing approach caused. This is genuinely professional practice and better
  than most commercial codebases. **Leave it alone.**
- **RLS as the real security boundary** — CLAUDE.md §6 is explicit that the client-side
  `farm_id` filter is defence in depth and never the enforcement point. Correct, and
  correctly documented.
- **`.gitignore` discipline** — no secrets tracked. `.env.local`, `.mcp.json`, and
  `*.db` are all properly ignored, with an explanatory comment on the token file. Only
  slip is the pre-existing `.pyc` files.
- **`store/trees.js`, `pages/livestock/`, `pages/today/`** — three places where someone
  already did the right thing. The refactor is extending a local pattern, not importing a
  foreign one.
- **Error handling *inside* store actions** — `if (error) throw error` appears 114 times.
  The discipline is real; what is missing is a catcher at the top (item 1), not care at
  the bottom.
- **Commit messages** — descriptive and intent-revealing (*"the card's action bar carries
  what a manager does, not what an owner edits"*). Better than conventional-commit noise.

---

## Appendix A — Metrics

```
Tracked files:                215
Frontend source:              22,724 lines across 49 files
Files over 800-line limit:    7  (CLAUDE.md's own threshold)
Largest file:                 store/index.js, 2,409 lines
Modules importing that file:  20

Dead code:                    ~3,000 lines (backend/ + 3 orphan modules + api/client 85%)
Unused dependencies:          axios, typescript

Tests:                        0
ESLint / Prettier configs:    0
CI workflows:                 0
Error boundaries:             0

alert() as error UI:          39 sites
Silent catch {} blocks:       9
console.log left in source:   0  ✅
if (error) guards:            114 ✅
Direct supabase calls in pages: 11 pages (bypassing store)

useAppStore call sites:       38
  ├─ no selector:             28   (subscribes to whole store)
  ├─ object-literal selector:  5   (no comparator — same behaviour as above)
  └─ scalar selector:          5   ✅ correctly scoped
zustand/shallow imports:       0
```

## Appendix B — Verification commands

```bash
# backend is unreachable from the frontend
grep -rn "VITE_API_URL\|axios" frontend/src/          # → no matches
ls backend/dependencies.py backend/schemas/           # → No such file or directory

# orphan modules
grep -rl "data/demo\|lib/idMap\|pages/Diary" frontend/src/   # → no matches

# whole-store subscriptions
grep -rn "useAppStore()"     frontend/src/ | wc -l    # → 28  (no selector)
grep -rn "useAppStore(s =>"  frontend/src/ | wc -l    # → 10  (5 of which return object literals)
grep -rn "zustand/shallow"   frontend/src/            # → no matches

# committed build artifacts
git ls-files backend/ | grep -c pyc                   # → 10
```

---

*Assessment only. No source files were modified in producing this audit.*

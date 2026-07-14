# Log Activity: who can be selected, and ploughing

**Status:** approved, not yet built
**Date:** 2026-07-14

## The problem

`Today.jsx` builds the named-worker picker by taking permanent staff *and* regular
labourers, then filtering both down to whoever has attendance punched today:

```js
// frontend/src/pages/Today.jsx  (~line 55)
const allNamedWorkers = useMemo(() => {
  const present = new Set(
    Object.entries(todayAttendance)
      .filter(([, a]) => a.status === 'present' || a.status === 'half_day')
      .map(([id]) => id)
  )
  return [
    ...permanentStaff.map(s  => ({ id: s.id, name: s.name, tag: 'S' })),
    ...regularLabourers.map(l => ({ id: l.id, name: l.name, tag: 'L' })),
  ].filter(w => present.has(w.id))
}, [permanentStaff, regularLabourers, todayAttendance])
```

That one filter causes both complaints from the farm owner:

1. **Staff appear who never do farm work.** The cook, the peon and the cattle
   caretaker have attendance punched, so they show up in a picker for field
   activities they have nothing to do with.

2. **The labourers who did the work disappear.** When regular labourers work on a
   contract basis, no attendance is punched — the manager only learns in the evening
   how much ground they covered, and pays on that. No attendance row means no name in
   the list, so the work cannot be logged against anybody.

Attendance is the wrong gate. Activity logging exists for the owner's *visibility*;
it creates no expense of its own. It must not depend on a payroll signal that, on
contract days, deliberately does not exist.

## The design

### 1. Who appears in the worker picker

Drop the attendance filter entirely. The list becomes **active regular labourers,
always** (`labour_master.sub_type = 'regular'`, `status = 'active'` — 12 people
today). No permanent staff at all.

Paused and inactive labourers stay out. A paused worker who turns up must be
un-paused first; that is a deliberate, visible act.

### 2. Ploughing gets a driver and a tractor

Selecting activity type `ploughing` (already exists: 🚜, `activity_types.name =
'ploughing'`) reveals two dropdowns, shown for no other activity:

- **Driver** — `labour_master` where designation is `Driver` (case-insensitive,
  trimmed; the data has trailing spaces). Today that is Ram Bachan alone.
- **Tractor** — `machinery_master` where `machinery_type = 'tractor'` and
  `is_active`. Two John Deeres; label them by `registration_no` (UP31BX-6422,
  UP31AN-8077) because their `name` is identical and useless for telling them apart.

### 3. The driver is NOT a selected worker

The driver gets his own column rather than joining `regular_worker_ids`. This is the
load-bearing decision.

Ram Bachan is permanent staff on ₹11,000/month. The labourers are ₹300/day. Putting
him in the same array as the labourers would inflate the daily worker count, and —
now that salary accrues when earned (migration 0014) — risks his cost landing twice,
once monthly and once daily. Ploughing done by one driver and no labourers must read
as **zero daily-wage workers**.

### 4. Data change

One migration, two nullable columns on `activity_logs`:

| Column | References | Notes |
|---|---|---|
| `driver_id` | `labour_master(id)` | null for every non-ploughing activity |
| `machinery_id` | `machinery_master(id)` | null for every non-ploughing activity |

Null for all existing rows. Nothing backfilled. The ledger, salary accrual and cost
attribution are untouched.

Per `CLAUDE.md`, the migration must also carry the four standard RLS policies if it
creates anything new — it does not, so the existing `activity_logs` policies stand.

## Explicitly out of scope

- **Diesel on ploughing.** This is where the real cost of ploughing lives, and it is
  the obvious next step — but the manager usually does not know litres at logging
  time, so it needs its own thought.
- **The implement picker** (Cultivator, Rajor, Carah — all already in
  `machinery_master` as `machinery_type = 'implement'`).
- **The tractor/driver picker on any activity other than ploughing.**

## Files to change

- `supabase/migrations/0015_activity_driver_machinery.sql` — new
- `frontend/src/store/index.js` — `mapActivity` (read the two new columns),
  `logActivity` / `logActivities` (write them), and a selector for drivers + tractors
- `frontend/src/pages/Today.jsx` — `allNamedWorkers` (drop the attendance filter,
  drop staff), plus the two conditional dropdowns in the Log Activity modal

## Verification

Not "it builds" — drive it:

1. Log a spray with two labourers. No staff appear in the picker. Both labourers do,
   with no attendance punched for either.
2. Log a ploughing on Plot H. Driver and Tractor dropdowns appear; pick Ram Bachan
   and UP31BX-6422. Saved row has `driver_id` and `machinery_id` set, and
   `regular_worker_ids` empty.
3. That ploughing shows **0 workers**, not 1, on the Today screen.
4. Switch the activity type away from ploughing — both dropdowns disappear and are
   not saved.

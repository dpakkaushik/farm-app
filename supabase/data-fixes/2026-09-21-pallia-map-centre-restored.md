# Pallia Farm's map centre was overwritten with a deleted farm's location

**Date:** 2026-09-21 · **Live DB, applied.**

## What the owner saw

> "i was at newly created farm screen from there i deleted my newly created farm.
> right now my field screen is still stuck at newly added farm screen though i only
> have pallia farm now in my app. even when i am clicking over pallia farm from top
> navigation i cant move to the farm on map. it is stucked"

## It was not stuck

The delete worked — `select * from farms` returned exactly one row, Pallia Farm.
But that row's `map_state.center` read **`[77.359087, 28.293335]`**, zoom
`18.0886`. That is Delhi NCR. Pallia's own plots sit at **`80.4864, 28.5068`** —
the average of all 68 corner coordinates, and within 50m of the `FARM_CENTER`
constant hardcoded at the top of `Field.jsx`.

So the map was flying precisely where it had been told to, 350km from the farm.
Every route in gave the same answer, which is why it felt stuck: the first load
reads `map_state` (`Field.jsx` ~351), the on-load handler flies to it (~361), and
the farm-switch effect flies to it again (~377).

## How a deleted farm's centre got onto Pallia's row

`Field.jsx`'s `moveend` handler captured the map position and wrote it **one
second later**, and the write read the active farm id *at the moment the timer
fired*:

```js
saveTimer.current = setTimeout(
  () => useAuthStore.getState().saveActiveFarmMapState(state), 1000)
```

Move the map while farm B is active, then switch or delete inside that second,
and B's coordinates land on whatever farm is active when the timer resolves.
Deleting the active farm does exactly that: `deleteFarm` → `refreshFarms` →
`activeFarmId` becomes Pallia, with a save for the Delhi farm still pending.

The saved zoom of `18.0886` is itself evidence — an arbitrary fractional zoom is
what a live map view produces, not anything a form would write.

## The fix

**Code** (shipped in the same commit): a captured position is now bound to the
farm it was captured on. `lib/mapState.js` holds the rule with 4 specs, the store
action takes a `capturedFarmId` and refuses a mismatch, and the farm-switch
effect cancels any pending save. It fails safe — a missing id saves nowhere,
because forgetting where the map was is trivial and writing it to the wrong farm
is this.

**Data:**

```sql
update farms
set map_state = jsonb_build_object(
      'center', jsonb_build_array(80.486354, 28.506793),
      'zoom',   15.5, 'bearing', 0, 'pitch', 0)
where id = 'ac8bef13-cf21-4849-b939-a2315e2863cc';
```

| | center | zoom |
|---|---|---|
| before | `[77.359087, 28.293335]` | 18.0886 |
| after  | `[80.486354, 28.506793]` | 15.5 |

The centre is derived from the farm's own plot corners, not typed. Zoom 15.5
frames the whole farm; 18.09 was one corner of a field somewhere else. Nothing
else was touched — one jsonb column on one row, and the owner can move the map
and let it re-save itself whenever he likes.

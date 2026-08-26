# The Android back gesture, and how far we took it

**Date:** 2026-08-26 · **Asked as:** *"Back swipe gesture should work on app. did u understood
this?"* then *"is it needed for app?"*

## What was broken

The app ships as a Capacitor Android build. On Android the edge swipe is how people dismiss
things — more reflexive than reaching for a ✕. That swipe reaches a web app as a plain history
`back`. Nothing in the app listened for it, so the swipe left the **screen**: the sheet, the
viewer or the half-filled form on top went with it, and the user landed on whatever page was
in history before.

The failure mode that mattered: a manager three fields into **Log Activity** — plots picked,
workers ticked — swipes out of habit and the entry is gone. Nobody reports that as a bug; they
just stop logging. CLAUDE.md's own rule is that manager compliance is everything.

## What we did, and what we deliberately did not

Two halves were on the table. Only one shipped.

| | Shipped? | Why |
|---|---|---|
| Back closes the overlay on top | **Yes** | The reflex above. Pure JS — rides a normal Vercel deploy, and the installed APK picks it up like any other change. |
| Back on a top-level screen minimises the app; predictive-back animation | **No** | Closing the app from the first screen is already normal Android behaviour, and the animation is cosmetics. Both need `@capacitor/app` — a **native dependency**, so every phone needs a rebuilt APK reinstalled. Not worth it for "the app closed when I expected it to close". |

If that second half is ever wanted, it is an `App.addListener('backButton', …)` in `App.jsx`
plus an APK rebuild. Nothing in this change blocks it.

## The mechanic

[`frontend/src/lib/backTrap.js`](../frontend/src/lib/backTrap.js) (7 tests) +
[`frontend/src/hooks/useBackClose.js`](../frontend/src/hooks/useBackClose.js).

While an overlay is open it **parks one extra history entry**. The gesture spends that entry,
`popstate` fires, and the overlay closes itself — the screen underneath never moves. Closing
from the UI instead (✕, backdrop, Apply, Save) spends the entry too, so the user's next back
press is not dead.

Four details that are easy to get wrong, all pinned by tests:

1. **The parked entry copies the state already there.** react-router keeps its own `idx`/`key`
   in `history.state` and reads them back on `popstate`; clobbering them confuses the router
   about where it is. We spread and add one field.
2. **One back press fires `popstate` on every listener.** Only the overlay on top of the stack
   may act, or a photo viewer opened over a sheet closes both at once.
3. **A navigation from inside an overlay must not be undone.** If the router pushed while we
   were open, our marker is no longer current — so the cleanup does *not* call `back()`. The
   cost is one stale entry (a single dead back press), which beats bouncing the user back off
   the page they just opened.
4. **A back still in flight from a previous mount must not close a fresh overlay.** Dev
   fast-refresh does exactly this. The marker carries the overlay's *depth*, and a `popstate`
   only counts if it landed shallower than us.

`env` (pushState/getState/back/onPop) is injected, which is why all of this is testable under
vitest's `node` environment with no jsdom dependency.

## Where it is wired

One hook call per overlay shell, so pages get it wholesale:

- `components/BottomSheet.jsx` → the filter sheet and Today's History sheet
- Each page's local `Modal` shell → Trees, Assets, Expenses, livestock, Ledger, Inventory
  (every modal on those pages at once)
- `ImageViewer`, `ImageCropper` (the cropper opens above the viewer — the stack rule matters
  here), `ProfileMenu` drawer, `SetupChecklist` sheet, `AssetSheet`, Admin's `ConfirmDialog`,
  `AboutModal`, `ManageFarmsModal`, `CreateFarmModal`
- Bespoke overlays, one call per state: Harvest's eight modals, Media's capture screen and
  viewer, Inventory's history drill-down, Labour's khata overlay and payment modal, Today's
  Log Activity form and bell calendar, the Ledger's inline Record-Sale form, Field's plot sheet

**Convention for anything new:** a modal shell calls `useBackClose(onClose)` — mounting *is*
opening. A component that stays mounted and toggles passes its flag as the second argument
(`useBackClose(() => setOpen(false), open)`). Where a save is in flight, guard the callback the
same way the backdrop already does: `() => { if (!saving) close() }`.

## How it was verified

`/uikit` (dev-only) + a Playwright script in the scratchpad, against a real Chromium:

- the filter sheet on Media and on Harvest — back closes the sheet and stays on the screen
- the asset sheet on Resources → Machinery — same, then the *next* back does leave
- Media's viewer — back closes it; and after a ✕ close, one back leaves (no dead press)
- no page errors on Today / Harvest / Media / Resources

Not covered by the harness (no fixture): Trees, Labour, Ledger, Admin, livestock, Field. Those
took a one-line hook inside an existing shell.

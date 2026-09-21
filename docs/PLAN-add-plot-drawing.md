# Add Plot: a two-step flow with a full-screen map

**Date:** 2026-09-21 · **Status: BUILT 2026-09-21.** Kept as the record of WHY it is
shaped this way — the three decisions below are his, not defaults to revisit.

**What shipped, against this plan:**
[`components/PlotDrawScreen.jsx`](../frontend/src/components/PlotDrawScreen.jsx) (step 2),
[`lib/plotDraft.js`](../frontend/src/lib/plotDraft.js) + 20 specs (the area rules),
`MapPicker` gained `height="fill"` and `chrome={false}`, and `/uikit?screen=plotdraw`
draws the step with no login. **Two deviations, both deliberate:**
1. **Save is enabled by four corners OR a typed area**, not by four corners alone. All 17
   live plots have boundaries, but a plot without one is savable today and renaming such a
   plot must not require inventing its corners. `saveBlock()` owns that rule and prints the
   reason under the button.
2. **GPS stays maplibre's own control, top-right**, beside zoom; Undo and Clear went
   bottom-right where a thumb reaches, rather than all three in one stack.

**Asked as:** the owner sent two screenshots of another farm app — a plain "Add New Plot"
form, then a full-screen satellite map where you tap four corners with Undo / Clear / GPS and
a Save Plot bar — and said *"i liked how they created plot here … think wisely and plan well."*

## Start here: most of this already exists

The previous session explored before designing, and the finding changed the job. **This is a
restructure, not new machinery.**

[`components/MapPicker.jsx`](../frontend/src/components/MapPicker.jsx) (261 lines) already has,
in `mode="corners"`:

- tap four points A–D, with `polygonAcres()` giving live acreage (exported, pure)
- **Undo** and **Clear** buttons (lines ~195–238) — small text buttons today
- **GPS** via maplibre's `GeolocateControl` (line ~97)
- an **`existing`** prop that draws other plots read-only underneath — *this is the owner's
  "when he adds plot 2, plot 1 will already be there", and `Admin.jsx` already passes it*
- ESRI World_Imagery satellite tiles, no Mapbox token (the tech-stack table in CLAUDE.md is
  wrong about Mapbox — the app has never used it)

What is missing is only the **presentation**: it renders at `height={240}` inside a long
scrolling form in Admin → Plots (`Admin.jsx` ~1440–1495), so the drawing surface is a small box
instead of the screen.

## His three decisions (asked and answered 21 Sep)

| Question | His answer |
|---|---|
| 4 corners, or any number of points? | **Keep 4.** No migration. Plots stay `point_a_lat`…`point_d_lng` (migration 0010). |
| Where does the flow start? | **Admin → Plots, where it is now.** No Field-map entry point. |
| Units on the bottom bar? | **Acres only, plus the point count.** No hectare/bigha/guntha toggle. |

## The design

**Step 1 — Plot details.** The existing form minus the map section: Plot name · Area (acres,
optional) · Soil type · Water source · **Next →**. **No Farm dropdown** (the reference app has
one): Admin already scopes to the active farm, and a picker invites saving a plot to the wrong
farm. The header names the farm instead.

**Step 2 — Draw the boundary.** Full-screen satellite map, zoomable, centred on the farm. Tap
A→B→C→D. Right-side control stack **Undo · Clear · GPS** (restyled from the existing tiny
buttons). The farm's other plots draw dimmed underneath with their names, via `existing`.
Bottom bar: **Area (acres) · Points n/4**, then **Save Plot**, disabled until four points.

Three details that are the actual design work:

1. **Typed area vs drawn area.** Area blank in step 1 → the drawn figure fills it. Area typed
   AND the shape disagrees by more than ~10% → say so in one line before saving. Do NOT
   silently overwrite a surveyed figure with a finger-tap; the owner catches exactly this kind
   of quiet wrongness.
2. **The 8 coordinate boxes survive**, behind a "Type coordinates" link on step 2. They were
   deliberately re-added on 20 Sep (`6903adf`) for surveyed figures and nudging one corner.
   Getting them off the main path is the goal, not removing them.
3. **Editing** an existing plot uses the same two steps, corners pre-loaded.

**After saving:** toast, back to the Plots list with the new plot visible; "Add New Plot" sits
at the top for plot 2. Deliberately NOT auto-reopening a blank form — that surprises someone
who wanted one plot. If adding ten in a row feels slow, "Save & add another" is a small
follow-up, and he was told so.

## How to build it

- A **full-screen overlay inside Admin** (z-50, `useBackClose(onClose)`), not a new route — no
  state handoff, and it matches every other overlay in the app. z-50 is required: the floating
  bottom nav sits above anything lower.
- `MapPicker` gains a **fill-its-container height** (it takes `height = 260` as a number today)
  and the new control/readout layout. **Its 4-corner logic is untouched.**
- New pure logic — step-1 validation, the area-mismatch check — goes in a small lib with
  vitest specs, per this repo's habit. `polygonAcres` and `lib/plotCorners.js` are already
  tested; reuse, do not reimplement.
- **Add the drawing step to `/uikit`** (dev-only harness, `pages/UiKit.jsx`) so it can be seen
  at 360px without a login. Keep the step props-only, like `PnlTab` and `ExpensesTab`. Two
  visual bugs in the previous week shipped because a screen could not be looked at.

## Do not touch

The `plots` table · [`lib/plotCorners.js`](../frontend/src/lib/plotCorners.js) · the Field map ·
`FarmOnboarding`'s own draft-plot flow.

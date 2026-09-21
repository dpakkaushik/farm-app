// Add Plot, as two steps: type the details, then draw the boundary on a
// full-screen satellite map. This module owns the rules that sit between the
// two — what step 1 must contain, whether the shape agrees with the area that
// was typed, and which area figure actually gets saved.
//
// Corner ⇄ column conversion is NOT here: that is lib/plotCorners.js, already
// tested. Acreage from a shape is polygonAcres() in components/MapPicker.jsx.

// How far the drawn shape may sit from a typed area before we say so. A finger
// on a satellite tile is not a survey, so some disagreement is expected; ten
// per cent is where it stops looking like tapping error.
export const AREA_TOLERANCE = 0.1

export const CORNER_COUNT = 4

// '' and '0' and 'abc' are all "no area". A plot of zero acres is not a plot,
// and every money view multiplies by this figure.
export function parseArea(value) {
  const n = parseFloat(value)
  return Number.isFinite(n) && n > 0 ? n : null
}

// Step 1. Area is OPTIONAL here — the shape drawn in step 2 can supply it —
// but a figure that was typed has to be a real one.
export function detailsError(draft = {}) {
  if (!String(draft.name ?? '').trim()) return 'Plot name is required'
  const raw = String(draft.area_acres ?? '').trim()
  if (raw !== '' && parseArea(raw) === null) return 'Area must be a number greater than zero'
  return null
}

// Does the shape agree with the figure that was typed?
//
// Returns null when there is nothing to compare — no typed area, or no finished
// shape. `off` is the only thing the UI should act on; the rest is what it says.
export function areaCheck(typedRaw, drawnAcres, cornerCount = CORNER_COUNT) {
  const typed = parseArea(typedRaw)
  if (typed === null) return null
  if (cornerCount < CORNER_COUNT) return null
  if (!Number.isFinite(drawnAcres) || drawnAcres <= 0) return null

  const diffPct = Math.abs(drawnAcres - typed) / typed
  // EPSILON absorbs binary-float error: 4.4 against 4 lands on 0.10000000000000009,
  // which would flag a shape sitting exactly on the tolerance as disagreeing.
  return { typed, drawn: drawnAcres, diffPct, off: diffPct > AREA_TOLERANCE + 1e-9 }
}

// The area figure to persist, as the string the form holds.
//
// A typed figure is NEVER overwritten by the drawn one. A surveyed number, or
// one off the owner's papers, beats four taps on a satellite tile — and quietly
// replacing it is exactly the kind of wrongness that gets noticed months later.
// Blank is the only case the shape fills.
export function resolveAreaAcres(typedRaw, drawnAcres, cornerCount = CORNER_COUNT) {
  const typed = parseArea(typedRaw)
  if (typed !== null) return String(typedRaw).trim()
  if (cornerCount === CORNER_COUNT && Number.isFinite(drawnAcres) && drawnAcres > 0) {
    return drawnAcres.toFixed(2)
  }
  return ''
}

// Why Save is disabled, in words the bottom bar can print. null = it is enabled.
//
// The normal path is "draw four corners". The typed-area escape is there
// because plots without a boundary already exist in this database — editing one
// to fix its name must not demand that its corners be invented first.
export function saveBlock({ name, area_acres, cornerCount = 0 } = {}) {
  if (!String(name ?? '').trim()) return 'Plot name is required'
  if (cornerCount >= CORNER_COUNT) return null
  if (parseArea(area_acres) !== null) return null
  if (cornerCount === 0) return 'Tap 4 corners, or type an area on the details step'
  const left = CORNER_COUNT - cornerCount
  return `${left} more corner${left === 1 ? '' : 's'} to go`
}

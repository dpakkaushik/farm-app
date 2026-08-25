// What a register card says at a glance, and what the detail sheet says when the
// card is opened. Pure — no React, no store — so the wording is unit-tested.
//
// The rule the owner set (25 Aug): the list is for finding a machine and seeing
// its state; price, dates, bills and notes are record-keeping and belong one tap
// deeper. Nothing in the app *reads* an asset's price except this sheet and the
// book-value strip, so hiding it from the card costs nothing.

import { fmtBillDate } from '../../lib/billdates'

export const RETIRED = new Set(['disposed', 'sold'])

export const fmtINR = n => (n || n === 0) && Number.isFinite(Number(n))
  ? `₹${Number(n).toLocaleString('en-IN')}`
  : null

/** 'water_motor' → 'Water motor' */
export const humanise = s => {
  const t = String(s || '').replace(/_/g, ' ').trim()
  return t ? t.charAt(0).toUpperCase() + t.slice(1) : ''
}

/** The sheet's grey line under the name: kind · make (or · where it is kept).
 *  The card shows only the make — the owner's call (25 Aug): the kind repeats
 *  the filter chip and, mostly, the name ("Trolly" under "Trailer"). */
export function sheetSubline(item, kind) {
  const parts = [
    humanise(kind === 'machinery' ? item.type : item.category),
    kind === 'machinery' ? item.make : item.location,
  ]
  return parts.filter(Boolean).join(' · ')
}

export const isRetired = item => RETIRED.has(item?.status)

/**
 * The detail sheet's fact grid. Each row is { label, value, missing? }.
 * `missing` marks a fact the owner has not filled in yet — the sheet renders it
 * muted and taps through to Edit, instead of hiding that the record is thin.
 * Optional facts with no value are simply omitted.
 */
export function assetFacts(item, kind, vendorName) {
  const rows = []
  const price = fmtINR(item.purchasePrice)
  rows.push(price
    ? { label: 'Purchase price', value: price }
    : { label: 'Purchase price', value: 'Not set', missing: true })
  rows.push(item.purchaseDate
    ? { label: 'Bought on', value: fmtBillDate(item.purchaseDate) }
    : { label: 'Bought on', value: 'Not set', missing: true })
  rows.push({ label: 'Quantity', value: String(Number(item.quantity) || 1) })
  if (vendorName)       rows.push({ label: 'Bought from', value: vendorName })
  if (kind === 'machinery') {
    if (item.model)     rows.push({ label: 'Model', value: item.model })
    if (item.regNo)     rows.push({ label: 'Registration', value: item.regNo })
  } else if (item.location) {
    rows.push({ label: 'Kept at', value: item.location })
  }
  if (item.usefulLife)  rows.push({ label: 'Useful life', value: `${item.usefulLife} yrs` })
  return rows
}

/** Rows for the greyed "Disposed" block; null when the item is still in service. */
export function disposalFacts(item) {
  if (!item?.disposalType) return null
  const sold = item.disposalType === 'sold'
  const rows = [{ label: sold ? 'Sold on' : 'Scrapped on', value: fmtBillDate(item.disposalDate) }]
  const amt = fmtINR(item.disposalAmount)
  if (amt)                  rows.push({ label: sold ? 'Sold for' : 'Scrap value', value: amt })
  if (item.disposalBuyer)   rows.push({ label: 'Buyer', value: item.disposalBuyer })
  if (item.disposalNotes)   rows.push({ label: 'Remarks', value: item.disposalNotes })
  return rows
}

/** The strip above the list: '25 items · Book value ₹23,00,000' */
export function registerSummary(count, tabValue) {
  const items = `${count} ${count === 1 ? 'item' : 'items'}`
  const value = fmtINR(tabValue)
  return tabValue > 0 && value ? `${items} · Book value ${value}` : items
}

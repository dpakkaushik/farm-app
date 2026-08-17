// The Ledger's period value, in one place.
//
// A period is a plain string with three forms:
//   'all'      — standing crops: whole cycles, no date cut. The DEFAULT lens,
//                because a crop sown in October and sold the following June
//                spans two financial years and any date cut slices it in half.
//   '2026'     — an Indian financial year, named by its start year
//                (1 Apr 2026 – 31 Mar 2027).
//   '2026-08'  — a single month.
//
// The whole Ledger filters through inPeriod(dateStr, period), so a new period
// form only ever needs to be taught here.

const MONTH_RE = /^\d{4}-\d{2}$/

export const isMonth = (p) => MONTH_RE.test(String(p || ''))

/** '2026' → '2026-27' — how the owner names a financial year. */
export const fyLabel = (startYear) =>
  `${startYear}-${String((Number(startYear) + 1) % 100).padStart(2, '0')}`

// Local calendar parts — toISOString() is UTC, which is yesterday for the
// first 5½ hours of every Indian morning (same fix as lib/billdates.js).
const localParts = () => {
  const d = new Date()
  return { y: d.getFullYear(), m: d.getMonth() + 1 }
}

/** The running FY's start year, e.g. '2026' from April 2026 to March 2027. */
export const currentFY = () => {
  const { y, m } = localParts()
  return String(m >= 4 ? y : y - 1)
}

/** Today's month as 'YYYY-MM'. */
export const currentMonth = () => {
  const { y, m } = localParts()
  return `${y}-${String(m).padStart(2, '0')}`
}

/** Date range for a period, or null for 'all' (no cut).
 *  A month's end is written '-31' regardless of the month's real length:
 *  these are zero-padded date STRINGS compared lexically, and no valid date
 *  in the month can exceed day 31 — so February rows still pass and March
 *  rows still fail, with no calendar arithmetic to get wrong. */
export const periodRange = (p) => {
  if (p === 'all') return null
  if (isMonth(p)) return { start: `${p}-01`, end: `${p}-31` }
  const y = Number(p)
  return { start: `${y}-04-01`, end: `${y + 1}-03-31` }
}

/** Is this date inside the period? Dateless rows always pass — a row with no
 *  date cannot be proven outside any period, and dropping it would silently
 *  shrink a total. */
export const inPeriod = (dateStr, p) => {
  if (p === 'all' || !dateStr) return true
  const r = periodRange(p)
  return dateStr >= r.start && dateStr <= r.end
}

/** The last `count` FY start years, newest first. No 'all' entry — the
 *  standing-crops mode covers that, above this dropdown, not inside it. */
export const fyOptions = (count = 5) => {
  const curStart = Number(currentFY())
  return Array.from({ length: count }, (_, i) => String(curStart - i))
}

/** '2026-08' → 'Aug 2026'. */
export const monthLabel = (p) => {
  if (!isMonth(p)) return String(p || '')
  return new Date(`${p}-01T00:00:00`)
    .toLocaleDateString('en-IN', { month: 'short', year: 'numeric' })
}

/** Human name for any period — headers, the Excel Summary sheet. */
export const periodLabel = (p) => {
  if (p === 'all') return 'Standing Crops · All Time'
  if (isMonth(p)) return monthLabel(p)
  return `FY ${fyLabel(p)}`
}

/** Filename-safe form for the Excel export. */
export const periodSlug = (p) => {
  if (p === 'all') return 'Standing-Crops'
  if (isMonth(p)) return p
  return `FY-${fyLabel(p)}`
}

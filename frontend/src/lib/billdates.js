// Bill date vs entry date — why the app now carries both.
//
// A purchase row has always stored two dates. `entry_date` is stamped by the
// database (`default now()`): the moment someone typed the bill in. `bill_date`
// is the date printed on the paper, and it is the one every account runs on —
// financial year, vendor ageing, crop cost.
//
// The form defaulted bill_date to today and nobody ever changed it, so the two
// silently became the same number. On 6–7 August 2026 that cost us 6 bills, 14
// purchase lines, 67 issues (₹1,12,348) and 2 cash entries, all July data stored
// as August and reported in the wrong FY. The real dates were sitting in the
// invoice numbers the owner had typed by hand — `4348/19.07.26` — which is the
// only reason they were recoverable at all.
//
// So: the form asks for the bill date deliberately (starts empty, cannot be
// left on today by accident), and both dates are shown wherever a bill appears.
// If they diverge again it is visible on the screen, not buried in a column
// nobody reads.

const DAY_MS = 86400000
const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/

// A bare 'YYYY-MM-DD' is parsed as UTC midnight by `new Date`, which renders as
// the previous day anywhere west of Greenwich. Parse those as local midnight so
// a date column always displays the day it says.
const parse = (d) => {
  if (!d) return null
  const s = String(d)
  const t = DATE_ONLY.test(s) ? new Date(`${s}T00:00:00`) : new Date(s)
  return Number.isNaN(t.getTime()) ? null : t
}

/** Today as 'YYYY-MM-DD' in the *local* calendar — `toISOString` gives UTC, which
 *  is the wrong day for the first 5½ hours of every Indian morning. */
export const localToday = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** '2026-07-19' → '19 Jul 26'. Matches the Ledger's date format. */
export const fmtBillDate = (d) => {
  const t = parse(d)
  if (!t) return '—'
  return t.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: '2-digit' })
}

/** '4348 / 19 Jul 26' — the number and the date on the paper, together, because
 *  that is how the owner writes a bill and how he looks one up. */
export const billRef = (invoiceNo, billDate) => {
  const date = fmtBillDate(billDate)
  const no   = String(invoiceNo || '').trim()
  return no ? `${no} / ${date}` : date
}

/** True when a bill was typed in on a materially different day from the date it
 *  carries — the signal that mis-dating is happening again. One day of slack: a
 *  bill written last night and entered this morning is ordinary, and the slack
 *  also absorbs the UTC/IST boundary on entry_date's timestamp. */
export const entryDiffers = (billDate, entryDate) => {
  const bill  = parse(String(billDate  || '').slice(0, 10))
  const entry = parse(String(entryDate || '').slice(0, 10))
  if (!bill || !entry) return false
  return Math.abs(entry - bill) > DAY_MS
}

// One job, one payment.
//
// A spraying job across seven plots is seven `labour_logs` rows, because the
// pro-rata split is the only route to per-plot and per-crop cost. But it was one
// handover of ₹6,520 — and the Ledger showed it as seven payments the owner had
// to press Pay on seven times: *"as far as payment is concerned this is a single
// payment and showing it as a breakup in ledger will make it confusing."*
//
// So the split stays and the payment collapses. `v_expense_ledger` already gives
// every row of one job an identical `entry_date` and `description`, so the
// grouping key exists without a migration; the plot names for the breakup come
// from `labour_logs`, which `loadAll` already holds.

export const CONTRACT_UNITS = {
  area_wise: 'Acres',
  bag_wise:  'Bags',
  tank_wise: 'Tanks',
  per_day:   'Days',
  kg_wise:   'KG',
  rate_wise: 'Units',
}

export function contractUnit(type) {
  return CONTRACT_UNITS[type] || ''
}

// '2026-08-10' → '10 Aug'. Built from the string's own parts rather than
// `new Date(d)`, which parses as UTC and lands a day earlier west of Greenwich —
// the same off-by-one period.js and labourMonth.js already had to fix.
const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
export function shortDate(d) {
  const [y, m, day] = String(d || '').split('-').map(Number)
  if (!y || !m || !day) return ''
  return `${day} ${MONTHS[m - 1]}`
}

/**
 * Whole-rupee shares that add up to the group's own total.
 *
 * The seven parts of the ₹6,520 job are ₹1,156.77 and friends. Rounded one by
 * one they display as 6,521 under a header reading 6,520 — a one-rupee gap that
 * costs more trust than it saves effort. So the residue is handed to the largest
 * part, where it is proportionally least visible.
 *
 * @param {number[]} values raw (unrounded) parts
 * @param {number}   total  the group total, rounded once
 * @returns {number[]} whole rupees, summing exactly to Math.round(total)
 */
export function wholeShares(values = [], total = 0) {
  if (!values.length) return []
  const rounded = values.map(v => Math.round(Number(v) || 0))
  const drift   = Math.round(Number(total) || 0) - rounded.reduce((s, v) => s + v, 0)
  if (!drift) return rounded
  let biggest = 0
  values.forEach((v, i) => {
    if (Math.abs(Number(v) || 0) > Math.abs(Number(values[biggest]) || 0)) biggest = i
  })
  return rounded.map((v, i) => (i === biggest ? v + drift : v))
}

/**
 * The one line that describes the job — *"yeah should also show the details not
 * only the date"*. e.g. `7 plots · 163 tanks @ ₹40`.
 *
 * The quantity belongs here and nowhere else: `contract_qty` is NOT split across
 * the plots, so every part carries the job's whole 163 tanks. Printed beside a
 * part's ₹1,157 it reads as a contradiction; printed on the group beside ₹6,520
 * it is simply true.
 */
export function jobSummary(items = []) {
  const plots = [...new Set(items.map(i => i.plotLabel).filter(Boolean))]
  const qty   = Math.max(0, ...items.map(i => Number(i.contractQty) || 0))
  const rate  = Math.max(0, ...items.map(i => Number(i.rate)        || 0))
  const unit  = contractUnit(items.find(i => i.contractType)?.contractType)

  const parts = []
  if (plots.length > 1)      parts.push(`${plots.length} plots`)
  else if (plots.length === 1) parts.push(plots[0])
  else                       parts.push(`${items.length} entries`)
  if (qty && rate && unit)   parts.push(`${qty} ${unit.toLowerCase()} @ ₹${rate}`)
  return parts.join(' · ')
}

// Which log a grouped cash entry keys back to. Sorted so the anchor is the same
// id whatever order the rows arrived in. There is no unpay path in the app
// today; when one is built it MUST resolve the group and delete by this id, or
// it will reverse one seventh of a payment and strand the rest.
export function groupAnchorId(ids = []) {
  return [...ids].sort()[0] || null
}

/**
 * Collapse the labour rows of one expense-ledger category into one row per job.
 *
 * Rows that are not labour pass through untouched, so this can be handed a
 * mixed list. A job of one row stays one row — it just takes its plot name into
 * the description and grows no chevron.
 *
 * @param {Array}  rows     v_expense_ledger rows
 * @param {object} logById  { [labour_logs.id]: store-mapped log } — for plot names
 * @returns {Array} rows carrying `key`, `groupIds`, and (when grouped) `items`
 */
export function groupLabourRows(rows = [], logById = {}) {
  const out   = []
  const byKey = new Map()

  for (const row of rows) {
    if (row.expense_type !== 'labour') {
      out.push({ ...row, key: `r:${row.id}` })
      continue
    }
    // Paid and unpaid never merge: settling half a job would otherwise hide
    // the unpaid half inside a line already marked Paid.
    const key = `l:${row.entry_date}|${row.description}|${row.is_paid ? 'paid' : 'due'}`
    let g = byKey.get(key)
    if (!g) {
      g = { ...row, key, amount: 0, groupIds: [], items: [] }
      byKey.set(key, g)
      out.push(g)
    }
    const log = logById[row.id] || null
    g.amount += Number(row.amount || 0)
    g.groupIds.push(row.id)
    g.items.push({
      id:           row.id,
      amount:       Number(row.amount || 0),
      plotLabel:    log?.plotLabel && log.plotLabel !== '—' ? log.plotLabel : '',
      contractType: log?.contractType || null,
      contractQty:  Number(log?.contractQty || 0),
      rate:         Number(log?.ratePerDay  || 0),
      workers:      Number(log?.workers     || 0),
    })
    if (!g.paid_date && row.paid_date) g.paid_date = row.paid_date
  }

  for (const g of byKey.values()) {
    const shares = wholeShares(g.items.map(i => i.amount), g.amount)
    g.items = g.items.map((item, i) => ({ ...item, share: shares[i] }))
    if (g.items.length < 2) {
      const only = g.items[0]
      if (only?.plotLabel) g.description = `${g.description} · ${only.plotLabel}`
      g.items = undefined       // nothing to expand — no chevron
      continue
    }
    g.description = `${g.description} — ${jobSummary(g.items)}`
  }
  return out
}

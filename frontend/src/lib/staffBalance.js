// The owner's paper register, as data: "STAFF BALANCE UPTO 01.05.26 TO 31.05.26"
// — one row per worker for one month: opening balance, wages earned, advances
// and salary paid in the month, and the closing balance split into CR (the farm
// owes the worker) and DR (the worker owes the farm).
//
// Everything folds through the SAME khata events the per-worker statement uses
// (lib/workerRecovery.js), so this report closes on v_salary_dues by
// construction: opening-at-month = app opening + everything before the month,
// and closing = opening + earned + recovered − advances − paid.
//
// Sign convention, same as the whole app: positive balance = farm owes the
// worker (CR); negative = worker owes the farm (DR). A negative advance amount
// is money RECOVERED from a worker — never abs() it (see CLAUDE.md rule 7).

import { khataEvents, monthEnd } from './workerRecovery'

export function monthWindow(month) {
  const ym = String(month).slice(0, 7)
  return { start: `${ym}-01`, end: monthEnd(ym) }
}

/** One worker's row for the month, from his full khata event list. */
export function monthStatementRow({ name, subType = '', openingBalance = 0, events = [], month }) {
  const { start, end } = monthWindow(month)
  let opening = Number(openingBalance || 0)
  let earned = 0, advances = 0, paid = 0, recovered = 0

  for (const e of events) {
    const d = String(e.date || '')
    if (d < start) { opening += (e.credit || 0) - (e.debit || 0); continue }
    if (d > end) continue
    if (e.type === 'earned')   earned    += e.credit || 0
    if (e.type === 'recovery') recovered += e.credit || 0
    if (e.type === 'advance')  advances  += e.debit  || 0
    if (e.type === 'payment')  paid      += e.debit  || 0
  }

  const closing = opening + earned + recovered - advances - paid
  return {
    name, subType,
    opening, earned,
    total: opening + earned,       // the register's TOTAL column: OP + WAGES
    advances, paid, recovered,
    closing,
    cr: closing > 0 ?  closing : 0,
    dr: closing < 0 ? -closing : 0,
  }
}

const isBlank = (r) =>
  !r.opening && !r.earned && !r.advances && !r.paid && !r.recovered && !r.closing

/**
 * The whole report. Raw rows come straight off the tables/views; grouping,
 * event-building and the fold all happen here so the caller only fetches.
 *   duesRows  — v_salary_dues (name, sub_type, opening_balance per labourer_id)
 *   accruals  — v_salary_accrual rows        (labourer_id, month, earned)
 *   advances  — salary_advances rows          (labourer_id, advance_date, amount)
 *   payments  — salary_payments rows          (labourer_id, payment_date, amount_paid)
 * Workers whose every figure is zero are dropped — a settled man who has left
 * the farm is not a row in the month's register. Staff sort before regular
 * labour, alphabetical within each, the same order the Salary screen reads.
 */
export function buildStaffBalance({ duesRows = [], accruals = [], advances = [], payments = [], month, today = null }) {
  const by = (rows, key) => {
    const m = {}
    for (const r of rows) { (m[r[key]] = m[r[key]] || []).push(r) }
    return m
  }
  const accBy = by(accruals, 'labourer_id')
  const advBy = by(advances, 'labourer_id')
  const payBy = by(payments, 'labourer_id')

  const rows = duesRows
    .map(d => monthStatementRow({
      name: (d.name || '').trim(),
      subType: d.sub_type || '',
      openingBalance: d.opening_balance,
      events: khataEvents({
        accruals: accBy[d.labourer_id] || [],
        advances: advBy[d.labourer_id] || [],
        payments: payBy[d.labourer_id] || [],
        today,
      }),
      month,
    }))
    .filter(r => !isBlank(r))
    .sort((a, b) =>
      a.subType === b.subType
        ? a.name.localeCompare(b.name)
        : a.subType === 'permanent' ? -1 : 1)

  const totals = rows.reduce((t, r) => ({
    opening:   t.opening   + r.opening,
    earned:    t.earned    + r.earned,
    total:     t.total     + r.total,
    advances:  t.advances  + r.advances,
    paid:      t.paid      + r.paid,
    recovered: t.recovered + r.recovered,
    closing:   t.closing   + r.closing,
    cr:        t.cr        + r.cr,
    dr:        t.dr        + r.dr,
  }), { opening: 0, earned: 0, total: 0, advances: 0, paid: 0, recovered: 0, closing: 0, cr: 0, dr: 0 })

  return { rows, totals }
}

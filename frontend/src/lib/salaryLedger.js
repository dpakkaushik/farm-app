// Salary in the Ledger's Expenses tab: what was earned, what has actually been
// settled, and what is still to hand over — month by month.
//
// Why this exists (docs/SPEC-salary-month-settlement.md): the tab used to present
// each worker-month as a BILL. It hardcoded every salary row to unpaid, then
// computed the group's "Paid" from `salary_payments` alone — so the ₹29,500 the
// farm handed over as ADVANCES counted nowhere, and a wage settled by advance
// read Pending forever. A wage is not a bill: what changes hands is decided at
// payment time, and the difference is explained by advances or it is a genuine
// gap in the records.
//
// Two rules carry all of it:
//   • Advances count as settlement, exactly as `v_salary_dues` treats them.
//   • The clamp lives on the WORKER-MONTH, never on the group — one man's
//     surplus advance cannot pay another man's wage.

import { monthEnd } from './workerRecovery'

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

const num = (v) => {
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

/** 'YYYY-MM' from anything month-shaped ('2026-08-01', '2026-08', a Date string). */
export const monthKey = (month) => String(month || '').slice(0, 7)

/** Today in LOCAL parts. `toISOString()` would hand back yesterday after 18:30 IST. */
export const localToday = (d = new Date()) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

/**
 * The date `v_expense_ledger` gives a salary accrual row: the month's end, or
 * today while the month is still running, so a part month is never booked into
 * the future. Replicated here so period filtering matches the view exactly.
 */
export const accrualEntryDate = (month, today = localToday()) => {
  const end = monthEnd(month)
  return end < today ? end : today
}

export const monthLabel = (month) => {
  const [y, m] = monthKey(month).split('-')
  return `${MONTHS[Number(m) - 1] || m} ${y}`
}

/**
 * What has been settled against ONE worker-month, and what is left.
 *
 * settled is clamped into [0, earned]:
 *   • over-advanced (Deena took ₹9,000 against ₹4,700 earned) → pending 0, and
 *     the ₹4,300 surplus stays on her khata rather than paying someone else;
 *   • a net RECOVERY (money given back — a negative advance, migration 0033)
 *     drives the offset below zero, and the wage is owed again in full.
 */
export const settleWorkerMonth = ({ earned, payments = 0, advances = 0 }) => {
  const due     = Math.max(0, num(earned))
  const offset  = num(payments) + num(advances)
  const settled = Math.min(due, Math.max(0, offset))
  return { earned: due, settled, pending: due - settled }
}

/**
 * Fold accrual rows into one row per calendar month.
 *
 * accrual  — v_salary_accrual rows: { labourer_id, month, earned }
 * payments — store `salaryPayments`: { labourerId, month: 'YYYY-MM', amount }
 * advances — store `advances`:       { labourerId, date: 'YYYY-MM-DD', amount }
 *
 * `inPeriod` is lib/period.js's, applied to the row's ledger entry date so these
 * figures narrow with the View control exactly as the ledger rows do. Advances
 * are matched to the month they were TAKEN in; an unrecovered advance from an
 * earlier month does not offset this month's wage.
 */
export const salaryMonthRows = ({
  accrual = [], payments = [], advances = [],
  inPeriod = () => true, period = 'all', today = localToday(),
} = {}) => {
  const paidBy = new Map()   // `${labourerId}|${YYYY-MM}` → ₹
  const advBy  = new Map()
  const add = (map, key, amount) => map.set(key, (map.get(key) || 0) + num(amount))

  payments.forEach(p => {
    if (p?.type && p.type !== 'salary') return
    add(paidBy, `${p.labourerId}|${monthKey(p.month)}`, p.amount)
  })
  advances.forEach(a => add(advBy, `${a.labourerId}|${monthKey(a.date)}`, a.amount))

  const byMonth = new Map()
  accrual.forEach(row => {
    const earned = num(row.earned)
    if (earned <= 0) return
    const month = monthKey(row.month)
    if (!inPeriod(accrualEntryDate(month, today), period)) return

    const key = `${row.labourer_id}|${month}`
    const { settled, pending } = settleWorkerMonth({
      earned, payments: paidBy.get(key), advances: advBy.get(key),
    })

    const acc = byMonth.get(month) || { month, label: monthLabel(month), earned: 0, paid: 0, pending: 0, workers: 0 }
    acc.earned  += earned
    acc.paid    += settled
    acc.pending += pending
    acc.workers += 1
    byMonth.set(month, acc)
  })

  // Newest month first, matching the ledger's own ordering.
  return [...byMonth.values()].sort((a, b) => (a.month < b.month ? 1 : a.month > b.month ? -1 : 0))
}

/** Group header figures. `paid + pending === earned` by construction. */
export const salaryTotals = (rows = []) => rows.reduce(
  (t, r) => ({
    earned:  t.earned  + num(r.earned),
    paid:    t.paid    + num(r.paid),
    pending: t.pending + num(r.pending),
  }),
  { earned: 0, paid: 0, pending: 0 },
)

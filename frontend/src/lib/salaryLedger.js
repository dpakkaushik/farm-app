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
 * `carriedDebt` is what the worker owed the farm at the START of the month, and
 * it is the third way a wage gets settled — the reason this function exists at
 * all. Ram Bachan opened August owing ₹1,790, earned ₹11,000 and was handed
 * ₹9,210: his wage paid the debt off, so **nothing is pending**. Reading the
 * ₹1,790 gap as unpaid wages (which the first cut of this file did) both
 * overstated Pending and invited a "missing" recovery entry that would have
 * credited him twice — his khata is already correct at +₹786.
 *
 * settled is clamped into [0, earned]:
 *   • over-advanced (Deena took ₹9,000 against ₹4,700 earned) → pending 0, and
 *     the ₹4,300 surplus stays on her khata rather than paying someone else;
 *   • a net RECOVERY (money given back — a negative advance, migration 0033)
 *     drives the offset below zero, and the wage is owed again in full.
 */
export const settleWorkerMonth = ({ earned, payments = 0, advances = 0, carriedDebt = 0 }) => {
  const due     = Math.max(0, num(earned))
  const offset  = num(payments) + num(advances) + Math.max(0, num(carriedDebt))
  const settled = Math.min(due, Math.max(0, offset))
  return { earned: due, settled, pending: due - settled }
}

/**
 * Every worker-month, walked in date order so each month knows what the worker
 * owed when it began.
 *
 * The walk must cover ALL months and only then be filtered to the period — the
 * same rule `annotatePockets` follows in lib/cashPockets.js. Handed only the
 * period's rows it would start every worker at his 1-Aug opening again, which
 * is precisely the bug being fixed.
 */
export const workerMonthSettlements = ({
  accrual = [], payments = [], advances = [], openings = {},
} = {}) => {
  const paidBy = new Map()
  const advBy  = new Map()
  const add = (map, key, amount) => map.set(key, (map.get(key) || 0) + num(amount))

  payments.forEach(p => {
    if (p?.type && p.type !== 'salary') return
    add(paidBy, `${p.labourerId}|${monthKey(p.month)}`, p.amount)
  })
  advances.forEach(a => add(advBy, `${a.labourerId}|${monthKey(a.date)}`, a.amount))

  const byWorker = new Map()
  accrual.forEach(row => {
    if (num(row.earned) <= 0) return
    const id = row.labourer_id
    if (!byWorker.has(id)) byWorker.set(id, [])
    byWorker.get(id).push({ month: monthKey(row.month), earned: num(row.earned) })
  })

  const out = []
  byWorker.forEach((months, id) => {
    // Positive = the farm owes him; negative = he owes the farm.
    let balance = num(openings[id])
    months.sort((a, b) => (a.month < b.month ? -1 : a.month > b.month ? 1 : 0))
    months.forEach(({ month, earned }) => {
      const key = `${id}|${month}`
      const paid = num(paidBy.get(key))
      const adv  = num(advBy.get(key))
      const { settled, pending } = settleWorkerMonth({
        earned, payments: paid, advances: adv, carriedDebt: -balance,
      })
      out.push({ labourerId: id, month, earned, settled, pending })
      balance = balance + earned - adv - paid   // the khata formula, unchanged
    })
  })
  return out
}

/**
 * Fold accrual rows into one row per calendar month.
 *
 * accrual  — v_salary_accrual rows: { labourer_id, month, earned }
 * payments — store `salaryPayments`: { labourerId, month: 'YYYY-MM', amount }
 * advances — store `advances`:       { labourerId, date: 'YYYY-MM-DD', amount }
 * openings — { [labourerId]: opening_balance } from v_salary_dues. Negative
 *            means he owed the farm at go-live, and his wage pays that off.
 *
 * CAUTION: the store's `advances` slice is fetched with `is_recovered = false`.
 * No row carries that flag today (a recovery is a NEGATIVE advance row, 0033,
 * not a flag), so the filter is a no-op and these figures match v_salary_dues.
 * If anything ever starts setting it, advances would go missing here while the
 * khata still counted them, and every figure below would drift. Load advances
 * unfiltered if that day comes.
 *
 * `inPeriod` is lib/period.js's, applied to the row's ledger entry date so these
 * figures narrow with the View control exactly as the ledger rows do. Advances
 * are matched to the month they were TAKEN in; an unrecovered advance from an
 * earlier month does not offset this month's wage.
 */
export const salaryMonthRows = ({
  accrual = [], payments = [], advances = [], openings = {},
  inPeriod = () => true, period = 'all', today = localToday(),
} = {}) => {
  const byMonth = new Map()
  workerMonthSettlements({ accrual, payments, advances, openings }).forEach(row => {
    if (!inPeriod(accrualEntryDate(row.month, today), period)) return
    const acc = byMonth.get(row.month)
      || { month: row.month, label: monthLabel(row.month), earned: 0, paid: 0, pending: 0, workers: 0 }
    acc.earned  += row.earned
    acc.paid    += row.settled
    acc.pending += row.pending
    acc.workers += 1
    byMonth.set(row.month, acc)
  })

  // Newest month first, matching the ledger's own ordering.
  return [...byMonth.values()].sort((a, b) => (a.month < b.month ? 1 : a.month > b.month ? -1 : 0))
}

/**
 * ONE worker's khata balance at the start of a month — his true "Opening" for
 * that month's card, rather than his 1-Aug figure re-applied for ever.
 *
 * The Salary card used `labour_master.opening_balance` every month, so from
 * month two it charged a settled debt again: Ram Bachan read "Worker owes
 * ₹1,004" in September (−1,790 + 786) while the books said the farm owed him
 * ₹786, because his ₹1,790 had already been cleared by August's wage.
 *
 * Pass only that worker's rows. Positive = the farm owes him.
 */
export const balanceBeforeMonth = ({
  month, opening = 0, accrual = [], payments = [], advances = [],
} = {}) => {
  const cut = monthKey(month)
  let bal = num(opening)
  accrual.forEach(r => { if (monthKey(r.month) < cut) bal += num(r.earned) })
  payments.forEach(p => {
    if (p?.type && p.type !== 'salary') return
    if (monthKey(p.month) < cut) bal -= num(p.amount)
  })
  advances.forEach(a => { if (monthKey(a.date) < cut) bal -= num(a.amount) })
  return bal
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

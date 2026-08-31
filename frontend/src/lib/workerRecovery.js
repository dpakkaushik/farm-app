// Money coming back FROM a worker.
//
// A worker's khata can go negative: he has drawn more than he has earned, so the
// farm is owed. Six workers are in that position today, ₹61,420 between them.
// Until now the app had no door for that money coming back — an advance is cash
// going out, a salary payment is cash going out, and the database blocks both
// from being negative. The debt could only ever grow.
//
// A recovery is the exact opposite of an advance, so that is how it is stored:
// ONE salary_advances row with a NEGATIVE amount. v_salary_dues already computes
//
//     balance_due = opening + earned − advances − paid
//
// so subtracting a negative advance adds the money back, and the view needed no
// change at all. The sign IS the record — there is no second table and no flag
// that could drift out of step with it.
//
// Sign convention, the same one v_salary_dues uses, everywhere in this file:
//   balance > 0  →  the FARM owes the worker (unpaid wages)
//   balance < 0  →  the WORKER owes the farm (over-drawn)

// Balances carry paise (a pro-rata labour split left ₹6,519.98 in the cash book),
// so "settled" cannot mean exactly zero. Under a rupee is settled.
export const SETTLED_TOLERANCE = 1

/** A recovery is an advance that went the other way. */
export function isRecovery(row) {
  return Number(row?.amount ?? 0) < 0
}

/**
 * Split a worker's advance rows into the two directions.
 * `net` is what v_salary_dues subtracts, so it is the only one that is arithmetic;
 * `given` and `recovered` exist so the screen can show both as positive numbers.
 */
export function splitAdvances(rows = []) {
  let given = 0, recovered = 0
  for (const r of rows) {
    const amt = Number(r?.amount ?? 0)
    if (amt < 0) recovered += -amt
    else given += amt
  }
  return { given, recovered, net: given - recovered }
}

/** What the worker owes the farm — 0 when he owes nothing. */
export function owedToFarm(balance) {
  const b = Number(balance ?? 0)
  return b < 0 ? -b : 0
}

/** What the farm owes the worker — 0 when it owes nothing. */
export function owedToWorker(balance) {
  const b = Number(balance ?? 0)
  return b > 0 ? b : 0
}

/** Settled means nothing worth chasing in either direction. */
export function isSettled(balance) {
  return Math.abs(Number(balance ?? 0)) < SETTLED_TOLERANCE
}

/**
 * A part recovery is the normal case, not the exception — a man who owes ₹13,933
 * pays back ₹5,000 and the rest stays on his khata. Nothing in the write path
 * caps the amount, so this exists purely so the modal can say what will still be
 * owed as the owner types, instead of leaving him to work it out. Typing MORE
 * than is owed is allowed too — it just leaves the farm owing him the difference,
 * which the 'over' outcome names so it is never a silent surprise.
 *
 * @param {number} outstanding what the worker owes now (positive)
 * @param {number} entered     what is being recovered
 * @returns {{ kind: 'part'|'settles'|'over', amount: number }} amount is always positive
 */
export function recoveryOutcome(outstanding, entered) {
  // A half-typed amount field hands over '' or NaN. Reading that as zero keeps
  // the line honest ("all of it still owed") instead of rendering ₹NaN.
  const num = (v) => { const n = Number(v ?? 0); return Number.isFinite(n) ? n : 0 }
  const left = num(outstanding) - num(entered)
  if (isSettled(left)) return { kind: 'settles', amount: 0 }
  return left > 0 ? { kind: 'part', amount: left } : { kind: 'over', amount: -left }
}

/**
 * Removing a worker sets his status to inactive, which hides him from every
 * screen — but v_salary_dues has no status filter, so his balance lives on in
 * the books (and in the Ledger's Excel export) with no screen that can reach it.
 * Money owed by nobody you can name. So hiding is only allowed once the balance
 * is settled.
 */
export function canHideWorker(balance) {
  return isSettled(balance)
}

/**
 * The workers no screen shows but the books still count: paused ones are loaded
 * and filtered out of the Salary tab, inactive ones are never loaded at all.
 * Both read as status !== 'active' in v_salary_dues, so one rule finds both.
 * Biggest debt first — that is the order they need chasing in.
 */
export function hiddenWithBalance(duesRows = []) {
  return duesRows
    .filter(r => r.status !== 'active' && !isSettled(r.balance_due))
    .sort((a, b) => Number(a.balance_due ?? 0) - Number(b.balance_due ?? 0))
}

/** Total still to collect from workers, across every row handed in. */
export function totalOwedToFarm(duesRows = []) {
  return duesRows.reduce((s, r) => s + owedToFarm(r.balance_due), 0)
}

// ── The worker's khata ───────────────────────────────────────────────────────
// The History overlay used to fold only advances and payments, and folded the
// payments the WRONG WAY — paying a man's wages made his balance go up. It also
// left out wages earned entirely, so its closing figure could not match the
// Ledger no matter what. Both are fixed here, where they can be tested: fold the
// same four things v_salary_dues does and the closing balance equals balance_due
// by construction.
//
// Credit = the farm owes more (wages earned, cash recovered from him).
// Debit  = the farm owes less (cash paid to him, advances given).

// Built from local date parts on purpose. toISOString() would shift IST back
// past midnight and hand back the 27th of February — the same off-by-one
// period.js was bitten by. Date strings are never routed through UTC here.
export const monthEnd = (month) => {
  const ym = String(month).slice(0, 7)
  const [y, m] = ym.split('-').map(Number)
  const lastDay = new Date(y, m, 0).getDate()
  return `${ym}-${String(lastDay).padStart(2, '0')}`
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const monthLabel = (month) => {
  const [y, m] = String(month).slice(0, 7).split('-')
  return `${MONTHS[Number(m) - 1]} ${y}`
}

/**
 * Normalise raw rows into dated khata events. Pure: no dates of its own except
 * the `today` you hand it, which clamps an accrual to today the way
 * v_expense_ledger does — a month's wages are not all earned on the 31st.
 */
export function khataEvents({ accruals = [], advances = [], payments = [], today = null } = {}) {
  const events = []

  for (const a of accruals) {
    const earned = Number(a.earned ?? 0)
    if (!earned) continue
    const end = monthEnd(a.month)
    events.push({
      type: 'earned',
      date: today && today < end ? today : end,
      label: `Wages earned · ${monthLabel(a.month)}`,
      credit: earned,
      debit: null,
    })
  }

  for (const a of advances) {
    const amt = Number(a.amount ?? 0)
    const recovery = amt < 0
    events.push({
      type: recovery ? 'recovery' : 'advance',
      date: a.advance_date,
      label: recovery
        ? `Recovered from worker${a.reason ? ' · ' + a.reason : ''}`
        : `Advance${a.reason ? ' · ' + a.reason : ''}`,
      credit: recovery ? -amt : null,
      debit: recovery ? null : amt,
      givenBy: a.given_by || '',
      mode: a.payment_mode || 'cash',
      recovered: recovery ? undefined : a.is_recovered,
    })
  }

  for (const p of payments) {
    events.push({
      type: 'payment',
      date: p.payment_date,
      label: `Salary paid${p.notes ? ' · ' + p.notes : ''}`,
      credit: null,
      debit: Number(p.amount_paid ?? 0),
      givenBy: p.given_by || '',
      mode: p.payment_mode || 'cash',
    })
  }

  return events.sort((a, b) => String(a.date || '').localeCompare(String(b.date || '')))
}

/**
 * Fold events onto an opening balance into a running statement.
 * @returns {{rows: Array, closing: number, totalCredit: number, totalDebit: number}}
 */
export function buildWorkerKhata({ openingBalance = 0, events = [] } = {}) {
  let running = Number(openingBalance ?? 0)
  const rows = [{ type: 'opening', date: '—', label: 'Opening balance', credit: null, debit: null, balance: running }]
  let totalCredit = 0, totalDebit = 0

  for (const e of events) {
    running = running + (e.credit || 0) - (e.debit || 0)
    totalCredit += e.credit || 0
    totalDebit += e.debit || 0
    rows.push({ ...e, balance: running })
  }

  return { rows, closing: running, totalCredit, totalDebit }
}

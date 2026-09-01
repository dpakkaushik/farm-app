// Bill-wise vendor settlement — which bills a payment actually cleared.
//
// The owner, 1 Sep 2026: "lets say we settle 50000 and there was one 50000 bill
// and two 20k bills and one 10k bill — how app will know which bill to clear?"
//
// It cannot be inferred, so it is chosen: the Pay Vendor modal ticks bills, and
// what is ticked is written as a breakup beside the payment
// (`vendor_payment_allocations`, migration 0035). This file is the arithmetic
// between the two — pure, so the rule "₹10,000 stays on bill 4725" is a tested
// fact rather than something the modal happens to print.
//
// Two things it deliberately does NOT do:
//   · It never changes what is owed. A vendor's Balance Due comes from
//     v_vendor_balances and an allocation moves nothing — it only explains.
//   · It never caps a payment at what is outstanding. Paying more is a real
//     thing that happens; the surplus is named "on account", not refused.

// Bills and payments both carry paise. A bill left short by less than a rupee
// is settled — the same reason SETTLED_TOLERANCE exists in workerRecovery.
export const PAID_TOLERANCE = 0.5

export const ON_ACCOUNT_KEY = 'on_account'
export const OPENING_KEY    = 'opening'

const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100
const money  = (n) => `₹${Math.round(Number(n) || 0).toLocaleString('en-IN')}`

/** unpaid · part · paid, from the bill's amount and what has been put against it. */
export function billStatus(amount, paid) {
  const outstanding = round2(amount) - round2(paid)
  if (outstanding <= PAID_TOLERANCE)       return 'paid'
  if (round2(paid) > PAID_TOLERANCE)       return 'part'
  return 'unpaid'
}

export const STATUS_LABEL = { unpaid: 'Unpaid', part: 'Part-paid', paid: 'Paid' }

/**
 * One settleable item per bill, plus the carried-in opening balance where the
 * vendor has one.
 *
 * `bills` are this vendor's bills ({ id, invoiceNo, date, amount }); the caller
 * filters, because only it knows which bill headers actually have lines behind
 * them — v_vendor_balances counts a bill as a debit only then, and an empty
 * header must not appear as money owed.
 *
 * `allocations` are this vendor's ({ billId, target, amount }).
 */
export function openItemsFor({ bills = [], allocations = [], opening = 0, openingDate = null }) {
  const paidOn = new Map()
  let paidOnOpening = 0
  for (const a of allocations) {
    const amount = round2(a.amount)
    if (a.target === OPENING_KEY)      paidOnOpening += amount
    // 'on_account' settles nothing in particular — that is what it means.
    else if (a.target === ON_ACCOUNT_KEY) continue
    else if (a.billId)                 paidOn.set(a.billId, (paidOn.get(a.billId) || 0) + amount)
  }

  const item = ({ key, kind, billId, invoiceNo, date, amount, paid, label, particulars }) => ({
    key, kind, billId, invoiceNo, date,
    amount: round2(amount), paid: round2(paid),
    outstanding: round2(round2(amount) - round2(paid)),
    status: billStatus(amount, paid),
    label, particulars: particulars || '',
  })

  const billItems = bills
    .map(b => item({
      key: `bill:${b.id}`, kind: 'bill', billId: b.id,
      invoiceNo: b.invoiceNo || '', date: b.date || '',
      amount: b.amount, paid: paidOn.get(b.id) || 0,
      label: b.invoiceNo ? `Bill ${b.invoiceNo}` : 'Purchase bill',
      particulars: b.particulars,
    }))
    .sort((a, b) => (a.date || '').localeCompare(b.date || '') || a.invoiceNo.localeCompare(b.invoiceNo))

  // The opening balance leads, whatever date it carries. It precedes every
  // document by definition — the on-screen khata already folds it in this way,
  // and dating it as an ordinary row once sorted Ankur's ₹55,580 in among June.
  const openingAmount = round2(opening)
  if (openingAmount <= 0) return billItems

  return [
    item({
      key: OPENING_KEY, kind: 'opening', billId: null, invoiceNo: '',
      date: openingDate || '', amount: openingAmount, paid: paidOnOpening,
      label: 'Opening balance (before the app)',
    }),
    ...billItems,
  ]
}

/** The ones still owing something — what the Pay modal offers to tick. */
export const unsettled = (items) => items.filter(i => i.status !== 'paid')

/** The ones squared away — the khata's history, below the outstanding list. */
export const settled = (items) => items.filter(i => i.status === 'paid')

/**
 * One vendor's allocations, in the shape openItemsFor takes.
 *
 * An allocation names a payment, not a party — the party is one hop away, on
 * the payment. Filtering here rather than in the query keeps the whole farm's
 * breakup in one small store slice instead of a fetch per vendor.
 */
export function allocationsForVendor({ vendorId, vendorPayments = [], allocations = [] }) {
  const mine = new Set(vendorPayments.filter(p => p.vendor_id === vendorId).map(p => p.id))
  return allocations
    .filter(a => mine.has(a.payment_id))
    .map(a => ({ billId: a.bill_id || null, target: a.target, amount: round2(a.amount) }))
}

/**
 * One vendor's bills, in the shape openItemsFor takes.
 *
 * Two rules live here, and both matter:
 *
 *  1. A bill counts only when something hangs off it. v_vendor_balances debits a
 *     bill only if it has a purchase, machinery or asset line, so an empty
 *     header — invoice 4017 once left ten of them — must not appear as money
 *     owed. The khata and the settlement list agree because both apply this.
 *  2. The amount is the header's `total_amount`, never the sum of its lines.
 *     That is the figure v_vendor_balances counts, so the ticked bills add up
 *     to Balance Due by construction. A header that disagrees with its own
 *     lines is a data problem to see, not one to paper over here.
 */
export function vendorBillsFrom({
  vendorId, bills = [], purchases = [], capitalPurchases = [], itemName = () => '',
}) {
  if (!vendorId) return []
  return bills
    .filter(b => b.vendor_id === vendorId)
    .map(b => {
      const names = [
        ...purchases.filter(p => p.billId === b.id).map(p => itemName(p.itemId) || 'Item'),
        ...capitalPurchases.filter(c => c.bill_id === b.id).map(c => c.name || 'Capital item'),
      ]
      return {
        id: b.id,
        invoiceNo: b.invoice_number || '',
        date: b.bill_date || '',
        amount: round2(b.total_amount),
        lineCount: names.length,
        particulars: names.length > 3
          ? `${names.slice(0, 3).join(', ')} +${names.length - 3} more`
          : names.join(', '),
      }
    })
    .filter(b => b.lineCount > 0)
}

/**
 * Spread `amount` across the ticked `items`, oldest first.
 *
 * Oldest-first is the only rule a shopkeeper's khata ever uses, and it is the
 * one the modal states in words before saving, so nothing is decided silently.
 */
export function planAllocation(items, amount) {
  const total = round2(amount)
  const selectedTotal = round2(items.reduce((s, i) => s + Number(i.outstanding || 0), 0))

  if (!(total > 0)) {
    return {
      valid: false, amount: 0, selectedTotal, lines: [],
      onAccount: 0, shortfall: 0, closed: [], untouched: [...items], partial: null,
    }
  }

  let left = total
  const lines = []
  const closed = []
  const untouched = []
  let partial = null

  for (const it of items) {
    const outstanding = round2(it.outstanding)
    if (left <= 0) { untouched.push(it); continue }
    const put = round2(Math.min(left, outstanding))
    if (put <= 0) { untouched.push(it); continue }
    left = round2(left - put)
    lines.push({
      key: it.key, kind: it.kind, billId: it.billId || null,
      invoiceNo: it.invoiceNo || '', amount: put,
    })
    if (outstanding - put <= PAID_TOLERANCE) closed.push(it)
    else partial = { ...it, allocated: put, remaining: round2(outstanding - put) }
  }

  const onAccount = round2(left)
  if (onAccount > 0) {
    lines.push({ key: ON_ACCOUNT_KEY, kind: ON_ACCOUNT_KEY, billId: null, invoiceNo: '', amount: onAccount })
  }

  return {
    valid: true, amount: total, selectedTotal, lines, onAccount,
    shortfall: round2(Math.max(0, selectedTotal - total)),
    closed, untouched, partial,
  }
}

const nameOf = (i) => (i.kind === 'opening' ? 'the opening balance'
  : i.invoiceNo ? `bill ${i.invoiceNo}` : 'the bill')

/** What the modal says before the money moves. Plain words, no jargon. */
export function settlementNarration(plan) {
  if (!plan.valid) return ''

  const parts = []
  const { closed, partial, onAccount, untouched, lines } = plan

  if (closed.length === 1)      parts.push(`Clears ${nameOf(closed[0])}.`)
  else if (closed.length > 1)   parts.push(`Clears ${closed.length} bills.`)

  if (partial) parts.push(`${money(partial.remaining)} stays on ${nameOf(partial)}.`)

  if (onAccount > 0) {
    parts.push(lines.length === 1
      ? `${money(onAccount)} recorded on account — no bill marked settled.`
      : `${money(onAccount)} extra recorded on account.`)
  }

  if (untouched.length === 1)    parts.push(`1 ticked bill left untouched.`)
  else if (untouched.length > 1) parts.push(`${untouched.length} ticked bills left untouched.`)

  return parts.join(' ')
}

// ── The khata's history ──────────────────────────────────────────────────────
//
// The owner, 1 Sep 2026: "in khata tab only unpaid will be shown and paid will
// go in history below the unpaid entries … when click over the history will
// give monthly range all paid entries in past within range will be shown."
//
// So the khata leads with what is still owed, and everything settled sits
// behind a month range. These two are that range's arithmetic.

/** Every month these rows touch, newest first — the range picker's options. */
export function khataMonths(dates = []) {
  const months = new Set()
  for (const d of dates) {
    const m = String(d || '').slice(0, 7)
    if (m.length === 7) months.add(m)
  }
  return [...months].sort().reverse()
}

/** Is this date inside the picked months? Bounds included, either may be open. */
export function inMonthRange(date, from, to) {
  const m = String(date || '').slice(0, 7)
  if (m.length !== 7) return false
  if (from && m < from) return false
  if (to   && m > to)   return false
  return true
}

/** The `p_allocations` payload record_vendor_payment takes. */
export function toAllocationRows(plan) {
  if (!plan.valid) return []
  return plan.lines.map(l => ({
    target:  l.kind === 'bill' ? 'bill' : l.kind,
    bill_id: l.kind === 'bill' ? l.billId : null,
    amount:  l.amount,
  }))
}

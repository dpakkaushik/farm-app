// The vendor register, as a workbook.
//
// The owner's ask, 1 Sep 2026, holding up a photo of his hand-ruled register:
// "download excel … it should get a report like this for all vendors". The
// paper reads one line per bill —
//
//     BY BILL NO.3815 DT 02.06.26 FOR PADDY PLANT ……… 1,640.00
//
// — and a total at the foot. So the workbook does the same: a first sheet
// answering "who do I owe", then one sheet per party answering "what for".
//
// Pure. It builds arrays of arrays and knows nothing about `xlsx`; the page
// loads that library on click and hands these rows to aoa_to_sheet. That keeps
// the arithmetic testable, and the one thing that must never be wrong — the
// foot of each sheet agreeing with the vendor's Balance Due — is a test, not a
// hope. Where it cannot agree, the sheet says so in its own margin rather than
// printing two numbers and leaving the reader to find the gap.

import { STATUS_LABEL } from './billSettlement'

const num = (n) => Math.round(Number(n) || 0)

// Excel refuses these in a tab name, and truncates past 31 characters.
const ILLEGAL_SHEET_CHARS = /[:\\/?*[\]]/g

/** His register's own date: 02.06.26. */
export function regDate(iso) {
  if (!iso) return ''
  const [y, m, d] = String(iso).slice(0, 10).split('-')
  if (!y || !m || !d) return ''
  return `${d}.${m}.${y.slice(2)}`
}

/** A tab name Excel will accept, and that no other tab has taken. */
export function sheetName(name, used = []) {
  const base = String(name || '').replace(ILLEGAL_SHEET_CHARS, '').trim().slice(0, 31) || 'Vendor'
  if (!used.includes(base)) return base
  for (let n = 2; n < 100; n++) {
    const suffix = ` (${n})`
    const candidate = base.slice(0, 31 - suffix.length) + suffix
    if (!used.includes(candidate)) return candidate
  }
  return base.slice(0, 28) + '…'
}

const COLUMNS = ['S.No', 'Bill No', 'Date', 'Particulars', 'Amount', 'Paid', 'Outstanding', 'Status']
const WIDTHS  = [6, 12, 11, 40, 13, 13, 13, 11]

/**
 * One party's khata.
 *
 * `items` are openItemsFor()'s rows with a `particulars` string added — the
 * caller builds that, because only it can name what was on the bill.
 * `onAccount` is money paid to this party without a bill named; it is why the
 * bills can sum to more than the balance, so it is printed as its own line.
 */
export function vendorSheet({ name, items = [], balanceDue = 0, onAccount = 0, note = '' }) {
  const rows = [
    [`VENDOR KHATA — ${String(name || '').toUpperCase()}`],
    ['Balance due', num(balanceDue)],
    [],
    COLUMNS,
  ]

  items.forEach((it, i) => rows.push([
    i + 1,
    // The opening balance has no bill number, and an empty cell reads as a
    // missing one. An em dash says there was never a document.
    it.kind === 'opening' ? '—' : (it.invoiceNo || '—'),
    regDate(it.date),
    it.particulars || it.label || '',
    num(it.amount), num(it.paid), num(it.outstanding),
    STATUS_LABEL[it.status] || '',
  ]))

  if (!items.length) rows.push(['Nothing outstanding on this khata.'])

  const totals = items.reduce((t, it) => ({
    amount:      t.amount      + num(it.amount),
    paid:        t.paid        + num(it.paid),
    outstanding: t.outstanding + num(it.outstanding),
  }), { amount: 0, paid: 0, outstanding: 0 })

  rows.push(['', '', '', 'TOTAL', totals.amount, totals.paid, totals.outstanding])

  if (num(onAccount) > 0) {
    rows.push(['', '', '', 'Less: paid on account (no bill named)', '', num(onAccount), -num(onAccount)])
  }
  rows.push(['', '', '', 'BALANCE DUE', '', '', num(balanceDue)])

  const ties = totals.outstanding - num(onAccount) === num(balanceDue)
  if (!ties) {
    rows.push([])
    rows.push(['', '', '', `Does not tie: the bills above come to ${totals.outstanding - num(onAccount)}, `
      + `the khata says ${num(balanceDue)}. Usually a purchase entered without a bill.`])
  }
  if (note) rows.push(['', '', '', note])

  return { rows, widths: WIDTHS, ties }
}

/** Who is owed what — the sheet the workbook opens on. */
export function allVendorsSheet(vendors = []) {
  const sorted = [...vendors].sort((a, b) => num(b.balanceDue) - num(a.balanceDue))
  const rows = [
    ['VENDORS — WHO THE FARM OWES'],
    ['Generated on', new Date().toLocaleDateString('en-IN')],
    [],
    ['S.No', 'Vendor', 'Purchased', 'Paid', 'Balance Due'],
  ]
  sorted.forEach((v, i) => rows.push([
    i + 1, v.name, num(v.purchased), num(v.paid), num(v.balanceDue),
  ]))
  if (!sorted.length) rows.push(['No vendors set up yet.'])
  rows.push(['', 'TOTAL',
    sorted.reduce((s, v) => s + num(v.purchased), 0),
    sorted.reduce((s, v) => s + num(v.paid), 0),
    sorted.reduce((s, v) => s + num(v.balanceDue), 0),
  ])
  return { rows, widths: [6, 34, 15, 15, 15] }
}

/** The whole workbook: the overview, then a sheet for each party. */
export function buildVendorWorkbook(vendors = []) {
  const overview = allVendorsSheet(vendors)
  const sheets = [{ name: 'All Vendors', ...overview }]
  const untied = []

  for (const v of vendors) {
    const sheet = vendorSheet(v)
    if (!sheet.ties) untied.push(v.name)
    sheets.push({ name: sheetName(v.name, sheets.map(s => s.name)), ...sheet })
  }
  return { sheets, untied }
}

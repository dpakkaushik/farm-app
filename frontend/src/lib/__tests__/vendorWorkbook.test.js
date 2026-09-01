import { describe, it, expect } from 'vitest'
import { regDate, sheetName, vendorSheet, allVendorsSheet, buildVendorWorkbook } from '../vendorWorkbook'

const item = (over = {}) => ({
  kind: 'bill', invoiceNo: '4725', date: '2026-08-08', particulars: 'Urea, DAP',
  amount: 24625, paid: 0, outstanding: 24625, status: 'unpaid', ...over,
})

describe('regDate', () => {
  // His register writes "BY BILL NO.3815 DT 02.06.26" — the sheet should read
  // the way the paper it replaces reads.
  it('is the register\'s own DD.MM.YY', () => {
    expect(regDate('2026-06-02')).toBe('02.06.26')
    expect(regDate('2026-12-31')).toBe('31.12.26')
  })

  it('is blank for a missing date rather than "Invalid Date"', () => {
    expect(regDate(null)).toBe('')
    expect(regDate('')).toBe('')
  })
})

describe('sheetName', () => {
  it('keeps a short name as it is', () => {
    expect(sheetName('Ankur', [])).toBe('Ankur')
  })

  it('trims to the 31 characters Excel allows', () => {
    expect(sheetName('NEW ANKUR BEEJ BHANDAR PALLIA KHERI', []).length).toBeLessThanOrEqual(31)
  })

  it('drops the characters Excel refuses in a tab name', () => {
    expect(sheetName('A/B:C*D?E[F]G', [])).toBe('ABCDEFG')
  })

  it('never repeats a name already used', () => {
    const used = ['Ankur']
    expect(sheetName('Ankur', used)).toBe('Ankur (2)')
    expect(sheetName('Ankur', [...used, 'Ankur (2)'])).toBe('Ankur (3)')
  })

  it('falls back to a name when the vendor has none Excel can use', () => {
    expect(sheetName('///', [])).toBe('Vendor')
  })
})

describe('vendorSheet', () => {
  const cell = (rows, r, c) => rows[r]?.[c]
  const rowStarting = (rows, label) => rows.find(r => r.some(c => c === label))

  it('has one numbered line per bill, in his register\'s columns', () => {
    const { rows } = vendorSheet({
      name: 'Ankur', balanceDue: 29725,
      items: [item(), item({ invoiceNo: '4850', date: '2026-08-23', amount: 5100, outstanding: 5100 })],
    })
    const header = rows.find(r => r[0] === 'S.No')
    expect(header).toEqual(['S.No', 'Bill No', 'Date', 'Particulars', 'Amount', 'Paid', 'Outstanding', 'Status'])
    const first = rows[rows.indexOf(header) + 1]
    expect(first).toEqual([1, '4725', '08.08.26', 'Urea, DAP', 24625, 0, 24625, 'Unpaid'])
    expect(rows[rows.indexOf(header) + 2][0]).toBe(2)
  })

  it('opens with the carried-in balance where there is one', () => {
    const { rows } = vendorSheet({
      name: 'Ankur', balanceDue: 294385,
      items: [item({ kind: 'opening', invoiceNo: '', particulars: 'Opening balance (before the app)',
                     amount: 294385, outstanding: 294385, date: '2026-08-01' })],
    })
    const first = rows[rows.findIndex(r => r[0] === 'S.No') + 1]
    expect(first[1]).toBe('—')
    expect(first[3]).toContain('Opening balance')
  })

  it('totals the three money columns', () => {
    const { rows } = vendorSheet({
      name: 'Ankur', balanceDue: 29725,
      items: [item({ amount: 24625, paid: 10000, outstanding: 14625, status: 'part' }),
              item({ invoiceNo: '4850', amount: 5100, paid: 0, outstanding: 5100 })],
    })
    const total = rowStarting(rows, 'TOTAL')
    expect(total.slice(4)).toEqual([29725, 10000, 19725])
  })

  // The whole point of the workbook is that it agrees with the screen. If the
  // sheet's own arithmetic misses the vendor's Balance Due, the sheet says so
  // rather than printing two numbers and letting the reader find the gap.
  it('ties to Balance Due, and says so when it cannot', () => {
    const tied = vendorSheet({
      name: 'Ankur', balanceDue: 19725,
      items: [item({ amount: 24625, paid: 10000, outstanding: 14625 }),
              item({ invoiceNo: '4850', amount: 5100, outstanding: 5100 })],
    })
    expect(rowStarting(tied.rows, 'BALANCE DUE').slice(4)).toEqual(['', '', 19725])
    expect(tied.ties).toBe(true)
    expect(tied.rows.some(r => String(r[3] || '').startsWith('Does not tie'))).toBe(false)

    const off = vendorSheet({
      name: 'Ankur', balanceDue: 15725, onAccount: 0,
      items: [item({ amount: 24625, paid: 10000, outstanding: 14625 }),
              item({ invoiceNo: '4850', amount: 5100, outstanding: 5100 })],
    })
    expect(off.ties).toBe(false)
    expect(off.rows.some(r => String(r[3] || '').startsWith('Does not tie'))).toBe(true)
  })

  it('shows money paid on account as the reason the bills do not add to the balance', () => {
    const { rows, ties } = vendorSheet({
      name: 'Ankur', balanceDue: 9625, onAccount: 5000,
      items: [item({ amount: 24625, paid: 10000, outstanding: 14625 }),
              item({ invoiceNo: '4850', amount: 5100, paid: 5100, outstanding: 0, status: 'paid' })],
    })
    expect(ties).toBe(true)
    const onAcct = rowStarting(rows, 'Less: paid on account (no bill named)')
    expect(onAcct[5]).toBe(5000)
  })

  it('says plainly when a vendor has nothing on his khata', () => {
    const { rows } = vendorSheet({ name: 'Dhaliwal', balanceDue: 0, items: [] })
    expect(rows.some(r => String(r[0] || '').includes('Nothing outstanding'))).toBe(true)
  })
})

describe('allVendorsSheet', () => {
  it('answers "who do I owe" before the workbook says what for', () => {
    const { rows } = allVendorsSheet([
      { name: 'Ankur', purchased: 51195, paid: 0, balanceDue: 345580 },
      { name: 'Dhaliwal', purchased: 42306, paid: 42306, balanceDue: 0 },
    ])
    expect(rows.find(r => r[0] === 'S.No'))
      .toEqual(['S.No', 'Vendor', 'Purchased', 'Paid', 'Balance Due'])
    expect(rows.find(r => r[1] === 'Ankur')).toEqual([1, 'Ankur', 51195, 0, 345580])
    expect(rows.find(r => r[1] === 'TOTAL').slice(2)).toEqual([93501, 42306, 345580])
  })

  it('puts the biggest debt first — that is the one that matters', () => {
    const { rows } = allVendorsSheet([
      { name: 'Small', balanceDue: 100 }, { name: 'Big', balanceDue: 90000 },
    ])
    const names = rows.filter(r => typeof r[0] === 'number').map(r => r[1])
    expect(names).toEqual(['Big', 'Small'])
  })
})

describe('buildVendorWorkbook', () => {
  const vendors = [
    { name: 'Ankur', balanceDue: 24625, purchased: 24625, paid: 0, items: [item()] },
    { name: 'Ankur', balanceDue: 100, purchased: 100, paid: 0, items: [item({ invoiceNo: '9' })] },
  ]

  it('leads with the all-vendors sheet, then one sheet per vendor', () => {
    const { sheets } = buildVendorWorkbook(vendors)
    expect(sheets).toHaveLength(3)
    expect(sheets[0].name).toBe('All Vendors')
    expect(sheets[1].name).toBe('Ankur')
    expect(sheets[2].name).toBe('Ankur (2)')
  })

  it('reports every vendor whose sheet does not tie, so a bad export is visible', () => {
    const { untied } = buildVendorWorkbook([
      { name: 'Ankur', balanceDue: 999, items: [item()] },
    ])
    expect(untied).toEqual(['Ankur'])
  })

  it('still produces a workbook when there are no vendors at all', () => {
    const { sheets } = buildVendorWorkbook([])
    expect(sheets).toHaveLength(1)
    expect(sheets[0].rows.some(r => String(r[0] || '').includes('No vendors'))).toBe(true)
  })
})

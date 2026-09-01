import { describe, it, expect } from 'vitest'
import {
  billStatus, openItemsFor, unsettled, settled, planAllocation, allocationsForVendor,
  khataMonths, inMonthRange,
  settlementNarration, toAllocationRows, vendorBillsFrom, PAID_TOLERANCE,
} from '../billSettlement'

// A vendor with the shape the Ledger hands in: bills already filtered to this
// party, allocations already filtered to this party's payments.
const bill = (id, invoiceNo, date, amount) => ({ id, invoiceNo, date, amount })
const alloc = (billId, amount, target = 'bill') => ({ billId, target, amount })

describe('billStatus', () => {
  it('is unpaid when nothing has been paid against it', () => {
    expect(billStatus(20000, 0)).toBe('unpaid')
  })

  it('is part when some of it has been paid', () => {
    expect(billStatus(20000, 5000)).toBe('part')
  })

  it('is paid when the whole amount has been paid', () => {
    expect(billStatus(20000, 20000)).toBe('paid')
  })

  // Bills and payments both carry paise; a bill left one paisa short is settled.
  it('treats a sub-rupee remainder as paid', () => {
    expect(billStatus(24625.4, 24625)).toBe('paid')
    expect(billStatus(24625, 24625 - PAID_TOLERANCE - 1)).toBe('part')
  })

  it('is paid when overpaid', () => {
    expect(billStatus(1000, 1500)).toBe('paid')
  })
})

describe('openItemsFor', () => {
  it('returns one item per bill, oldest first, with paid and outstanding', () => {
    const items = openItemsFor({
      bills: [bill('b2', '4850', '2026-08-23', 21470), bill('b1', '4725', '2026-08-08', 24625)],
      allocations: [alloc('b1', 10000)],
    })
    expect(items.map(i => i.invoiceNo)).toEqual(['4725', '4850'])
    expect(items[0]).toMatchObject({ kind: 'bill', billId: 'b1', paid: 10000, outstanding: 14625, status: 'part' })
    expect(items[1]).toMatchObject({ paid: 0, outstanding: 21470, status: 'unpaid' })
  })

  it('opens with the carried-in opening balance, above every bill', () => {
    const items = openItemsFor({
      bills: [bill('b1', '4725', '2026-08-08', 24625)],
      allocations: [],
      opening: 294385,
      openingDate: '2026-08-01',
    })
    expect(items[0]).toMatchObject({
      kind: 'opening', billId: null, amount: 294385, outstanding: 294385, status: 'unpaid',
    })
    expect(items).toHaveLength(2)
  })

  // The opening balance is the khata's first line whatever date it carries —
  // the same rule the on-screen khata already follows.
  it('keeps the opening balance first even when its date falls after a bill', () => {
    const items = openItemsFor({
      bills: [bill('b1', '3815', '2026-06-02', 1640)],
      opening: 5000,
      openingDate: '2026-08-01',
    })
    expect(items[0].kind).toBe('opening')
  })

  it('has no opening item when the vendor carries no opening balance', () => {
    const items = openItemsFor({ bills: [bill('b1', '1', '2026-08-08', 100)], opening: 0 })
    expect(items.every(i => i.kind === 'bill')).toBe(true)
  })

  it('counts payments made against the opening balance', () => {
    const items = openItemsFor({
      bills: [],
      allocations: [alloc(null, 50000, 'opening')],
      opening: 294385,
    })
    expect(items[0]).toMatchObject({ paid: 50000, outstanding: 244385, status: 'part' })
  })

  // On-account money settles nothing in particular — that is the whole point of
  // it. Counting it against a bill would claim a decision nobody made.
  it('ignores on-account money entirely', () => {
    const items = openItemsFor({
      bills: [bill('b1', '4725', '2026-08-08', 24625)],
      allocations: [alloc(null, 20000, 'on_account')],
      opening: 1000,
    })
    expect(items.find(i => i.kind === 'bill').paid).toBe(0)
    expect(items.find(i => i.kind === 'opening').paid).toBe(0)
  })

  it('drops settled items from the unsettled list but keeps them in the full one', () => {
    const items = openItemsFor({
      bills: [bill('b1', '4725', '2026-08-08', 24625), bill('b2', '4850', '2026-08-23', 5100)],
      allocations: [alloc('b1', 24625)],
    })
    expect(items).toHaveLength(2)
    expect(unsettled(items).map(i => i.invoiceNo)).toEqual(['4850'])
  })
})

describe('vendorBillsFrom', () => {
  const bills = [
    { id: 'b1', vendor_id: 'v1', invoice_number: '4725', bill_date: '2026-08-08', total_amount: 24625 },
    { id: 'b2', vendor_id: 'v1', invoice_number: '4017', bill_date: '2026-08-09', total_amount: 37850 },
    { id: 'b3', vendor_id: 'v2', invoice_number: '9', bill_date: '2026-08-10', total_amount: 500 },
  ]
  const purchases = [{ id: 'p1', billId: 'b1', itemId: 'i1' }, { id: 'p2', billId: 'b1', itemId: 'i2' }]
  const itemName = (id) => ({ i1: 'Urea', i2: 'DAP' }[id])

  it('takes only this vendor\'s bills', () => {
    const got = vendorBillsFrom({ vendorId: 'v1', bills, purchases, itemName })
    expect(got.map(b => b.id)).toEqual(['b1'])
  })

  // Invoice 4017 once left ten headers worth ₹378,500 with no lines under them.
  // v_vendor_balances ignores those, so this must too or the tickable bills
  // would add up to more than the vendor is owed.
  it('drops a header with nothing hanging off it', () => {
    expect(vendorBillsFrom({ vendorId: 'v1', bills, purchases, itemName })
      .some(b => b.invoiceNo === '4017')).toBe(false)
  })

  it('counts a machinery or asset line as a line', () => {
    const got = vendorBillsFrom({
      vendorId: 'v1', bills, purchases: [],
      capitalPurchases: [{ bill_id: 'b2', name: 'Spray machine' }], itemName,
    })
    expect(got.map(b => b.invoiceNo)).toEqual(['4017'])
    expect(got[0].particulars).toBe('Spray machine')
  })

  // The header's own total, not the sum of its lines — that is the figure
  // v_vendor_balances debits, so the two cannot disagree.
  it('takes the amount from the bill header', () => {
    expect(vendorBillsFrom({ vendorId: 'v1', bills, purchases, itemName })[0].amount).toBe(24625)
  })

  it('names what was on the bill, and stops at three', () => {
    const many = [{ id: 'p1', billId: 'b1', itemId: 'i1' }, { id: 'p2', billId: 'b1', itemId: 'i2' },
                  { id: 'p3', billId: 'b1', itemId: 'i3' }, { id: 'p4', billId: 'b1', itemId: 'i4' }]
    const name = (id) => ({ i1: 'Urea', i2: 'DAP', i3: 'Zinc', i4: 'Potash' }[id])
    expect(vendorBillsFrom({ vendorId: 'v1', bills, purchases: many, itemName: name })[0].particulars)
      .toBe('Urea, DAP, Zinc +1 more')
  })

  it('is empty when no vendor is given', () => {
    expect(vendorBillsFrom({ vendorId: null, bills, purchases })).toEqual([])
  })
})

describe('planAllocation', () => {
  const fifty  = { key: 'b1', kind: 'bill', billId: 'b1', invoiceNo: '50k', outstanding: 50000 }
  const twentyA = { key: 'b2', kind: 'bill', billId: 'b2', invoiceNo: '20kA', outstanding: 20000 }
  const twentyB = { key: 'b3', kind: 'bill', billId: 'b3', invoiceNo: '20kB', outstanding: 20000 }
  const ten    = { key: 'b4', kind: 'bill', billId: 'b4', invoiceNo: '10k', outstanding: 10000 }

  // The owner's own example: ₹50,000 paid, and the app must not have to guess.
  it('clears exactly the bills that were ticked', () => {
    const plan = planAllocation([fifty], 50000)
    expect(plan.lines).toEqual([{ key: 'b1', kind: 'bill', billId: 'b1', invoiceNo: '50k', amount: 50000 }])
    expect(plan.closed.map(i => i.key)).toEqual(['b1'])
    expect(plan.onAccount).toBe(0)
    expect(plan.partial).toBeNull()
  })

  it('clears three ticked bills that add to the same amount', () => {
    const plan = planAllocation([twentyA, twentyB, ten], 50000)
    expect(plan.lines.map(l => l.amount)).toEqual([20000, 20000, 10000])
    expect(plan.closed).toHaveLength(3)
    expect(plan.onAccount).toBe(0)
  })

  it('fills oldest-first and leaves the shortfall on the last bill', () => {
    const plan = planAllocation([twentyA, twentyB, ten], 40000)
    expect(plan.lines.map(l => [l.invoiceNo, l.amount])).toEqual([['20kA', 20000], ['20kB', 20000]])
    expect(plan.closed.map(i => i.invoiceNo)).toEqual(['20kA', '20kB'])
    expect(plan.untouched.map(i => i.invoiceNo)).toEqual(['10k'])
    expect(plan.shortfall).toBe(10000)
  })

  it('part-pays the bill the money runs out on', () => {
    const plan = planAllocation([twentyA, twentyB], 25000)
    expect(plan.lines.map(l => l.amount)).toEqual([20000, 5000])
    expect(plan.partial).toMatchObject({ invoiceNo: '20kB', remaining: 15000 })
    expect(plan.closed.map(i => i.invoiceNo)).toEqual(['20kA'])
  })

  it('records the surplus on account when more is paid than was ticked', () => {
    const plan = planAllocation([ten], 15000)
    expect(plan.lines).toEqual([
      { key: 'b4', kind: 'bill', billId: 'b4', invoiceNo: '10k', amount: 10000 },
      { key: 'on_account', kind: 'on_account', billId: null, invoiceNo: '', amount: 5000 },
    ])
    expect(plan.onAccount).toBe(5000)
  })

  // Today's behaviour, kept working: an amount with nothing ticked is a lump.
  it('puts the whole payment on account when nothing is ticked', () => {
    const plan = planAllocation([], 12000)
    expect(plan.lines).toEqual([
      { key: 'on_account', kind: 'on_account', billId: null, invoiceNo: '', amount: 12000 },
    ])
    expect(plan.valid).toBe(true)
  })

  it('allocates to the opening balance like any other item', () => {
    const opening = { key: 'opening', kind: 'opening', billId: null, invoiceNo: '', outstanding: 294385 }
    const plan = planAllocation([opening, twentyA], 300000)
    expect(plan.lines.map(l => [l.kind, l.amount])).toEqual([['opening', 294385], ['bill', 5615]])
  })

  it('adds every line up to the payment, whatever the mix', () => {
    for (const amount of [1, 9999, 50000, 123456.78]) {
      const plan = planAllocation([fifty, twentyA, ten], amount)
      const sum = plan.lines.reduce((s, l) => s + l.amount, 0)
      expect(Math.round(sum * 100) / 100).toBe(Math.round(amount * 100) / 100)
    }
  })

  it('is invalid for a missing, zero or negative amount', () => {
    for (const bad of [0, -5, NaN, null, undefined, '']) {
      expect(planAllocation([fifty], bad).valid).toBe(false)
    }
  })

  it('reads a typed string amount', () => {
    expect(planAllocation([ten], '10000').closed).toHaveLength(1)
  })
})

describe('settlementNarration', () => {
  const item = (key, invoiceNo, outstanding, kind = 'bill') =>
    ({ key, kind, billId: kind === 'bill' ? key : null, invoiceNo, outstanding })

  it('says nothing to say when the amount is not usable yet', () => {
    expect(settlementNarration(planAllocation([item('b1', '4725', 100)], 0))).toBe('')
  })

  it('names the single bill it clears', () => {
    const n = settlementNarration(planAllocation([item('b1', '4725', 24625)], 24625))
    expect(n).toContain('Clears bill 4725')
  })

  it('counts the bills it clears', () => {
    const n = settlementNarration(planAllocation(
      [item('b1', '4725', 20000), item('b2', '4850', 20000)], 40000))
    expect(n).toContain('Clears 2 bills')
  })

  it('spells out what stays on the part-paid bill', () => {
    const n = settlementNarration(planAllocation(
      [item('b1', '4703', 20000), item('b2', '4725', 20000)], 30000))
    expect(n).toContain('4725')
    expect(n).toContain('₹10,000')
    expect(n.toLowerCase()).toContain('stays')
  })

  it('names the surplus as on account', () => {
    const n = settlementNarration(planAllocation([item('b1', '4725', 10000)], 15000))
    expect(n).toContain('₹5,000')
    expect(n.toLowerCase()).toContain('on account')
  })

  it('says an untouched bill was left alone', () => {
    const n = settlementNarration(planAllocation(
      [item('b1', '4703', 10000), item('b2', '4725', 10000)], 10000))
    expect(n.toLowerCase()).toContain('untouched')
  })

  it('names the opening balance rather than calling it a bill', () => {
    const n = settlementNarration(planAllocation([item('opening', '', 5000, 'opening')], 5000))
    expect(n.toLowerCase()).toContain('opening balance')
  })

  it('says on account when nothing is ticked', () => {
    expect(settlementNarration(planAllocation([], 12000)).toLowerCase()).toContain('on account')
  })
})

describe('allocationsForVendor', () => {
  const vendorPayments = [{ id: 'pay1', vendor_id: 'v1' }, { id: 'pay2', vendor_id: 'v2' }]
  const allocations = [
    { payment_id: 'pay1', bill_id: 'b1', target: 'bill', amount: '100.00' },
    { payment_id: 'pay2', bill_id: 'b9', target: 'bill', amount: '900.00' },
    { payment_id: 'pay1', bill_id: null, target: 'on_account', amount: '50.00' },
  ]

  it('takes only the breakup of this vendor\'s own payments', () => {
    const got = allocationsForVendor({ vendorId: 'v1', vendorPayments, allocations })
    expect(got).toEqual([
      { billId: 'b1', target: 'bill', amount: 100 },
      { billId: null, target: 'on_account', amount: 50 },
    ])
  })

  it('is empty for a vendor who has never been paid', () => {
    expect(allocationsForVendor({ vendorId: 'v3', vendorPayments, allocations })).toEqual([])
  })
})

describe('settled / khataMonths / inMonthRange', () => {
  it('splits the khata into what is owed and what is done', () => {
    const items = openItemsFor({
      bills: [bill('b1', '1', '2026-08-08', 100), bill('b2', '2', '2026-08-09', 200)],
      allocations: [alloc('b1', 100)],
    })
    expect(unsettled(items).map(i => i.invoiceNo)).toEqual(['2'])
    expect(settled(items).map(i => i.invoiceNo)).toEqual(['1'])
  })

  it('offers every month the rows touch, newest first', () => {
    expect(khataMonths(['2026-06-02', '2026-08-23', '2026-06-30', null, '']))
      .toEqual(['2026-08', '2026-06'])
  })

  it('includes both ends of the picked range', () => {
    expect(inMonthRange('2026-06-01', '2026-06', '2026-08')).toBe(true)
    expect(inMonthRange('2026-08-31', '2026-06', '2026-08')).toBe(true)
    expect(inMonthRange('2026-05-31', '2026-06', '2026-08')).toBe(false)
    expect(inMonthRange('2026-09-01', '2026-06', '2026-08')).toBe(false)
  })

  it('treats an open end as no bound at all', () => {
    expect(inMonthRange('2020-01-01', null, '2026-08')).toBe(true)
    expect(inMonthRange('2099-01-01', '2026-06', null)).toBe(true)
  })

  it('excludes a row with no date rather than guessing one', () => {
    expect(inMonthRange(null, '2026-06', '2026-08')).toBe(false)
  })
})

describe('toAllocationRows', () => {
  it('is the payload the database function takes', () => {
    const plan = planAllocation([
      { key: 'b1', kind: 'bill', billId: 'b1', invoiceNo: '1', outstanding: 100 },
    ], 150)
    expect(toAllocationRows(plan)).toEqual([
      { target: 'bill', bill_id: 'b1', amount: 100 },
      { target: 'on_account', bill_id: null, amount: 50 },
    ])
  })

  it('adds up to the payment, which is what the function checks', () => {
    const plan = planAllocation([
      { key: 'a', kind: 'opening', billId: null, invoiceNo: '', outstanding: 300 },
      { key: 'b', kind: 'bill', billId: 'b', invoiceNo: '2', outstanding: 300 },
    ], 450)
    const sum = toAllocationRows(plan).reduce((s, r) => s + r.amount, 0)
    expect(sum).toBe(450)
    expect(toAllocationRows(plan)[0]).toEqual({ target: 'opening', bill_id: null, amount: 300 })
  })

  it('is empty for an unusable amount, so nothing can be written', () => {
    expect(toAllocationRows(planAllocation([], 0))).toEqual([])
  })
})

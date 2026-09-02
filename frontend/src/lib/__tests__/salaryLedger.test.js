import { describe, test, expect } from 'vitest'
import {
  accrualEntryDate, monthLabel, settleWorkerMonth, salaryMonthRows, salaryTotals,
} from '../salaryLedger'
import { inPeriod } from '../period'

// The live August/September position at the time this shipped, used as the
// end-to-end fixture. Five staff paid by salary payment, seven regular
// labourers paid by advance — the case the old code could not see.
const AUG = '2026-08-01', SEP = '2026-09-01'
const w = (id, month, earned) => ({ labourer_id: id, month, earned })

const LIVE = {
  accrual: [
    w('harinder', AUG, 10000), w('vijay', AUG, 13000), w('krishna', AUG, 7500),
    w('phool', AUG, 10000), w('bachan', AUG, 11000),
    w('chotelal', AUG, 5150), w('deena', AUG, 4700), w('jhingur', AUG, 1200),
    w('kailash', AUG, 3600), w('darash', AUG, 2100), w('naresh', AUG, 5000),
    w('vikram', AUG, 5150),
    w('harinder', SEP, 714), w('krishna', SEP, 536), w('phool', SEP, 714),
    w('bachan', SEP, 786), w('vijay', SEP, 929),
  ],
  payments: [
    { labourerId: 'harinder', month: '2026-08', amount: 10000, type: 'salary' },
    { labourerId: 'vijay',    month: '2026-08', amount: 13000, type: 'salary' },
    { labourerId: 'krishna',  month: '2026-08', amount: 7500,  type: 'salary' },
    { labourerId: 'phool',    month: '2026-08', amount: 10000, type: 'salary' },
    { labourerId: 'bachan',   month: '2026-08', amount: 9210,  type: 'salary' },
  ],
  advances: [
    { labourerId: 'chotelal', date: '2026-08-15', amount: 500 },
    { labourerId: 'chotelal', date: '2026-08-15', amount: 1500 },
    { labourerId: 'chotelal', date: '2026-08-31', amount: 2000 },
    { labourerId: 'deena',    date: '2026-08-15', amount: 7000 },
    { labourerId: 'deena',    date: '2026-08-31', amount: 2000 },
    { labourerId: 'jhingur',  date: '2026-08-31', amount: 2000 },
    { labourerId: 'jhingur',  date: '2026-08-31', amount: -1000 },  // gave some back
    { labourerId: 'kailash',  date: '2026-08-15', amount: 2000 },
    { labourerId: 'kailash',  date: '2026-08-31', amount: 2000 },
    { labourerId: 'darash',   date: '2026-08-15', amount: 2000 },
    { labourerId: 'darash',   date: '2026-08-31', amount: 2000 },
    { labourerId: 'naresh',   date: '2026-08-15', amount: 2000 },
    { labourerId: 'naresh',   date: '2026-08-31', amount: 2000 },
    { labourerId: 'vikram',   date: '2026-08-15', amount: 1500 },
    { labourerId: 'vikram',   date: '2026-08-31', amount: 2000 },
  ],
  today: '2026-09-02',
}

describe('accrualEntryDate', () => {
  test('a finished month is dated to its last day', () => {
    expect(accrualEntryDate('2026-08-01', '2026-09-02')).toBe('2026-08-31')
  })

  test('a running month is dated to today, never into the future', () => {
    expect(accrualEntryDate('2026-09-01', '2026-09-02')).toBe('2026-09-02')
  })

  test('February is 28 days, not 31 — the toISOString off-by-one', () => {
    expect(accrualEntryDate('2026-02-01', '2026-06-01')).toBe('2026-02-28')
  })
})

test('monthLabel reads like the ledger description', () => {
  expect(monthLabel('2026-08-01')).toBe('Aug 2026')
})

describe('settleWorkerMonth', () => {
  test('paid in full', () => {
    expect(settleWorkerMonth({ earned: 10000, payments: 10000 }))
      .toEqual({ earned: 10000, settled: 10000, pending: 0 })
  })

  test('settled entirely by advance — the case the old code could not see', () => {
    expect(settleWorkerMonth({ earned: 4700, advances: 4700 }))
      .toEqual({ earned: 4700, settled: 4700, pending: 0 })
  })

  test('an over-advance never turns into negative pending', () => {
    // Deena: ₹9,000 taken against ₹4,700 earned. The ₹4,300 surplus is a loan
    // on her khata, not a credit against anybody's wage.
    expect(settleWorkerMonth({ earned: 4700, advances: 9000 }))
      .toEqual({ earned: 4700, settled: 4700, pending: 0 })
  })

  test('a part advance leaves the remainder pending', () => {
    expect(settleWorkerMonth({ earned: 5150, advances: 4000 }))
      .toEqual({ earned: 5150, settled: 4000, pending: 1150 })
  })

  test('payments and advances add up', () => {
    expect(settleWorkerMonth({ earned: 5000, payments: 1000, advances: 2000 }).pending).toBe(2000)
  })

  test('a net recovery owes the wage again in full, never more', () => {
    // Money given back is money owed again — but pending can never exceed earned.
    expect(settleWorkerMonth({ earned: 1200, advances: -5000 }))
      .toEqual({ earned: 1200, settled: 0, pending: 1200 })
  })

  test('nothing paid is wholly pending', () => {
    expect(settleWorkerMonth({ earned: 786 }).pending).toBe(786)
  })

  test('junk amounts are treated as zero, not NaN', () => {
    const r = settleWorkerMonth({ earned: 1000, payments: undefined, advances: 'x' })
    expect(r.pending).toBe(1000)
    expect(Number.isNaN(r.settled)).toBe(false)
  })
})

describe('salaryMonthRows — the live position', () => {
  const rows = salaryMonthRows({ ...LIVE, inPeriod })

  test('one row per calendar month, newest first', () => {
    expect(rows.map(r => r.label)).toEqual(['Sep 2026', 'Aug 2026'])
  })

  test('August: advances counted, so paid is 72,610 and pending 5,790', () => {
    const aug = rows.find(r => r.month === '2026-08')
    expect(aug.earned).toBe(78400)
    expect(aug.paid).toBe(72610)
    expect(aug.pending).toBe(5790)
    expect(aug.workers).toBe(12)
  })

  test('September is wholly pending — the month is still running', () => {
    const sep = rows.find(r => r.month === '2026-09')
    expect(sep.earned).toBe(3679)
    expect(sep.paid).toBe(0)
    expect(sep.pending).toBe(3679)
  })

  test('the header reads 82,079 earned · 72,610 paid · 9,469 pending', () => {
    expect(salaryTotals(rows)).toEqual({ earned: 82079, paid: 72610, pending: 9469 })
  })

  test('NOT the old figures — this is the whole point of the change', () => {
    const { paid, pending } = salaryTotals(rows)
    expect(paid).not.toBe(49710)     // salary_payments alone
    expect(pending).not.toBe(32369)  // the advances it used to hide
  })

  test('Ram Bachan still shows ₹1,790 pending, deliberately', () => {
    // His old-dues deduction was never recorded anywhere. The figure is a
    // prompt to record a real missing entry, not a display bug.
    const one = salaryMonthRows({
      accrual: [w('bachan', AUG, 11000)],
      payments: [{ labourerId: 'bachan', month: '2026-08', amount: 9210, type: 'salary' }],
      inPeriod, today: LIVE.today,
    })
    expect(one[0].pending).toBe(1790)
  })
})

describe('invariants', () => {
  test('paid + pending === earned, on every row and in the header', () => {
    const rows = salaryMonthRows({ ...LIVE, inPeriod })
    rows.forEach(r => expect(r.paid + r.pending).toBe(r.earned))
    const t = salaryTotals(rows)
    expect(t.paid + t.pending).toBe(t.earned)
  })

  test("one worker's surplus never reduces another's pending", () => {
    // Deena +4,300 over-advanced, Vikram 1,650 short. Netting them at the group
    // would show 0 pending; per worker-month it correctly shows Vikram's gap.
    const rows = salaryMonthRows({
      accrual: [w('deena', AUG, 4700), w('vikram', AUG, 5150)],
      advances: [
        { labourerId: 'deena',  date: '2026-08-15', amount: 9000 },
        { labourerId: 'vikram', date: '2026-08-15', amount: 3500 },
      ],
      inPeriod, today: LIVE.today,
    })
    expect(rows[0].pending).toBe(1650)
  })

  test('an advance from another month does not settle this month', () => {
    const rows = salaryMonthRows({
      accrual: [w('x', SEP, 5000)],
      advances: [{ labourerId: 'x', date: '2026-08-15', amount: 5000 }],
      inPeriod, today: LIVE.today,
    })
    expect(rows[0].pending).toBe(5000)
  })

  test('a payment tagged to another month does not settle this one', () => {
    const rows = salaryMonthRows({
      accrual: [w('x', SEP, 5000)],
      payments: [{ labourerId: 'x', month: '2026-08', amount: 5000, type: 'salary' }],
      inPeriod, today: LIVE.today,
    })
    expect(rows[0].pending).toBe(5000)
  })

  test('an advance row is never mistaken for a salary payment', () => {
    const rows = salaryMonthRows({
      accrual: [w('x', AUG, 5000)],
      payments: [{ labourerId: 'x', month: '2026-08', amount: 5000, type: 'advance' }],
      inPeriod, today: LIVE.today,
    })
    expect(rows[0].pending).toBe(5000)
  })

  test('zero-earned worker-months are dropped, not shown as settled', () => {
    const rows = salaryMonthRows({ accrual: [w('x', AUG, 0)], inPeriod, today: LIVE.today })
    expect(rows).toEqual([])
  })
})

describe('period filtering moves rows and figures together', () => {
  test('a month view keeps only that month', () => {
    const rows = salaryMonthRows({ ...LIVE, inPeriod, period: '2026-08' })
    expect(rows).toHaveLength(1)
    expect(salaryTotals(rows)).toEqual({ earned: 78400, paid: 72610, pending: 5790 })
  })

  test('a month with no wages reports nothing rather than leaking all-time', () => {
    const rows = salaryMonthRows({ ...LIVE, inPeriod, period: '2026-07' })
    expect(rows).toEqual([])
    expect(salaryTotals(rows)).toEqual({ earned: 0, paid: 0, pending: 0 })
  })

  test("FY 2026-27 holds both months — August's ledger date is 31 Aug", () => {
    const rows = salaryMonthRows({ ...LIVE, inPeriod, period: '2026' })
    expect(rows).toHaveLength(2)
    expect(salaryTotals(rows).earned).toBe(82079)
  })

  test('empty input is safe', () => {
    expect(salaryMonthRows()).toEqual([])
    expect(salaryTotals()).toEqual({ earned: 0, paid: 0, pending: 0 })
  })
})

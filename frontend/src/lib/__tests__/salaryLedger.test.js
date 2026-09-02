import { describe, test, expect } from 'vitest'
import {
  accrualEntryDate, monthLabel, settleWorkerMonth, workerMonthSettlements,
  balanceBeforeMonth, salaryMonthRows, salaryTotals,
} from '../salaryLedger'
import { inPeriod } from '../period'

// The live August/September position, used as the end-to-end fixture. Five
// staff paid by salary payment, seven regular labourers paid by advance, and
// nine of the twelve carrying an opening balance — the three things the first
// cut of this file got wrong in turn.
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
  // Negative = he owed the farm at go-live. Straight off labour_master.
  openings: {
    harinder: -14346, vijay: 0, krishna: 0, phool: 0, bachan: -1790,
    chotelal: -6003, deena: -20825, jhingur: -2125, kailash: -97,
    darash: 4561, naresh: 2085, vikram: 3080,
  },
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

  test('a carried debt settles the wage — the Ram Bachan case', () => {
    // Opened August owing ₹1,790, earned ₹11,000, handed ₹9,210. His wage paid
    // the debt off: nothing is pending, and his khata is already right at +786.
    expect(settleWorkerMonth({ earned: 11000, payments: 9210, carriedDebt: 1790 }))
      .toEqual({ earned: 11000, settled: 11000, pending: 0 })
  })

  test('a carried CREDIT does not settle the wage', () => {
    // Vikram was owed ₹3,080 before the app. That is a separate liability — it
    // cannot pretend his August wage was paid.
    expect(settleWorkerMonth({ earned: 5150, advances: 3500, carriedDebt: -3080 }).pending)
      .toBe(1650)
  })

  test('payments and advances add up', () => {
    expect(settleWorkerMonth({ earned: 5000, payments: 1000, advances: 2000 }).pending).toBe(2000)
  })

  test('a net recovery owes the wage again in full, never more', () => {
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

describe('workerMonthSettlements — the chronological walk', () => {
  test("Ram Bachan: August closes at zero, September's wage is what is owed", () => {
    const rows = workerMonthSettlements({
      accrual:  [w('bachan', AUG, 11000), w('bachan', SEP, 786)],
      payments: [{ labourerId: 'bachan', month: '2026-08', amount: 9210, type: 'salary' }],
      openings: { bachan: -1790 },
    })
    expect(rows.find(r => r.month === '2026-08').pending).toBe(0)
    expect(rows.find(r => r.month === '2026-09').pending).toBe(786)
  })

  test('an opening balance is consumed once, not re-applied every month', () => {
    // The exact defect being fixed: the card charged Ram Bachan's ₹1,790 again
    // in September and read "Worker owes ₹1,004" while the books said +₹786.
    const rows = workerMonthSettlements({
      accrual:  [w('x', AUG, 1000), w('x', SEP, 1000)],
      payments: [{ labourerId: 'x', month: '2026-08', amount: 500, type: 'salary' }],
      openings: { x: -500 },
    })
    expect(rows.map(r => r.pending)).toEqual([0, 1000])
  })

  test('a worker who owes the farm has nothing pending — Harinder', () => {
    // He owes ₹13,632 all through; his wage reduces the debt rather than
    // becoming cash the farm must hand over.
    const rows = workerMonthSettlements({
      accrual:  [w('harinder', AUG, 10000), w('harinder', SEP, 714)],
      payments: [{ labourerId: 'harinder', month: '2026-08', amount: 10000, type: 'salary' }],
      openings: { harinder: -14346 },
    })
    expect(rows.every(r => r.pending === 0)).toBe(true)
  })

  test('months are walked in date order however they arrive', () => {
    const rows = workerMonthSettlements({
      accrual: [w('x', SEP, 1000), w('x', AUG, 1000)],   // out of order on purpose
      openings: { x: -1000 },
    })
    expect(rows.map(r => r.month)).toEqual(['2026-08', '2026-09'])
    expect(rows.map(r => r.pending)).toEqual([0, 1000])
  })

  test('a missing opening is treated as zero', () => {
    const rows = workerMonthSettlements({ accrual: [w('x', AUG, 500)] })
    expect(rows[0].pending).toBe(500)
  })
})

describe('balanceBeforeMonth — the card Opening bug', () => {
  const RB = {
    opening: -1790,
    accrual:  [w('bachan', AUG, 11000), w('bachan', SEP, 786)],
    payments: [{ labourerId: 'bachan', month: '2026-08', amount: 9210, type: 'salary' }],
  }

  test('August opens on his go-live figure', () => {
    expect(balanceBeforeMonth({ ...RB, month: AUG })).toBe(-1790)
  })

  test('September opens at ZERO — August already cleared the ₹1,790', () => {
    // The card read −1,790 here and so showed "Worker owes ₹1,004".
    expect(balanceBeforeMonth({ ...RB, month: SEP })).toBe(0)
  })

  test('September closing then agrees with the books: farm owes ₹786', () => {
    const open = balanceBeforeMonth({ ...RB, month: SEP })
    expect(open + 786).toBe(786)
  })

  test('advances before the month reduce the opening', () => {
    expect(balanceBeforeMonth({
      month: SEP, opening: 0,
      accrual: [w('x', AUG, 5000)],
      advances: [{ labourerId: 'x', date: '2026-08-15', amount: 2000 }],
    })).toBe(3000)
  })

  test('nothing before the month leaves the go-live figure untouched', () => {
    expect(balanceBeforeMonth({ month: AUG, opening: 4561 })).toBe(4561)
  })

  test('an advance row is not counted as a salary payment', () => {
    expect(balanceBeforeMonth({
      month: SEP, opening: 0, accrual: [w('x', AUG, 1000)],
      payments: [{ labourerId: 'x', month: '2026-08', amount: 1000, type: 'advance' }],
    })).toBe(1000)
  })
})

describe('salaryMonthRows — the live position', () => {
  const rows = salaryMonthRows({ ...LIVE, inPeriod })

  test('one row per calendar month, newest first', () => {
    expect(rows.map(r => r.label)).toEqual(['Sep 2026', 'Aug 2026'])
  })

  test('August: only Vikram and Ram Naresh are short — ₹2,650', () => {
    const aug = rows.find(r => r.month === '2026-08')
    expect(aug.earned).toBe(78400)
    expect(aug.paid).toBe(75750)
    expect(aug.pending).toBe(2650)
    expect(aug.workers).toBe(12)
  })

  test('September: the four staff who are square are owed their days', () => {
    const sep = rows.find(r => r.month === '2026-09')
    expect(sep.earned).toBe(3679)
    expect(sep.pending).toBe(2965)   // Harinder's ₹714 is not owed — he owes the farm
    expect(sep.paid).toBe(714)
  })

  test('the header reads 82,079 earned · 76,464 paid · 5,615 pending', () => {
    expect(salaryTotals(rows)).toEqual({ earned: 82079, paid: 76464, pending: 5615 })
  })

  test('none of the three wrong answers this file has given', () => {
    const { paid, pending } = salaryTotals(rows)
    expect(paid).not.toBe(49710)     // salary_payments alone
    expect(pending).not.toBe(32369)  // the advances it hid
    expect(pending).not.toBe(9469)   // ignoring carried debt
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
    const rows = salaryMonthRows({
      accrual: [w('deena', AUG, 4700), w('vikram', AUG, 5150)],
      advances: [
        { labourerId: 'deena',  date: '2026-08-15', amount: 9000 },
        { labourerId: 'vikram', date: '2026-08-15', amount: 3500 },
      ],
      openings: { deena: -20825, vikram: 3080 },
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

describe('period filtering', () => {
  test('a month view keeps only that month', () => {
    const rows = salaryMonthRows({ ...LIVE, inPeriod, period: '2026-08' })
    expect(rows).toHaveLength(1)
    expect(salaryTotals(rows)).toEqual({ earned: 78400, paid: 75750, pending: 2650 })
  })

  test('the walk still runs over ALL months, so September is not re-opened', () => {
    // Filtered to September alone, Ram Bachan must still show ₹786 — not
    // ₹1,004-worth of re-applied opening. The cashPockets lesson: annotate
    // everything, then filter.
    const rows = salaryMonthRows({ ...LIVE, inPeriod, period: '2026-09' })
    expect(rows).toHaveLength(1)
    expect(rows[0].pending).toBe(2965)
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

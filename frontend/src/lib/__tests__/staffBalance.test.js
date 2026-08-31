import { describe, test, expect } from 'vitest'
import { monthWindow, monthStatementRow, buildStaffBalance } from '../staffBalance'

const MONTH = '2026-08'
const TODAY = '2026-08-31'

describe('monthWindow', () => {
  test('first to last day, February included', () => {
    expect(monthWindow('2026-08')).toEqual({ start: '2026-08-01', end: '2026-08-31' })
    expect(monthWindow('2026-02')).toEqual({ start: '2026-02-01', end: '2026-02-28' })
  })
})

describe('monthStatementRow', () => {
  const ev = (type, date, credit, debit) => ({ type, date, credit, debit })

  test('events before the month fold into the opening balance', () => {
    const row = monthStatementRow({
      name: 'Deena', openingBalance: -1000, month: MONTH,
      events: [
        ev('earned',  '2026-07-31', 500, null),   // last month: joins the opening
        ev('advance', '2026-07-10', null, 200),
        ev('earned',  '2026-08-31', 800, null),   // this month: comes from accruals, not events
      ],
      accruals: [
        { month: '2026-07-01', attendance_pay: 500, contract_pay: 0 },   // not this month
        { month: '2026-08-01', attendance_pay: 800, contract_pay: 0 },
      ],
    })
    expect(row.opening).toBe(-700)                 // −1000 + 500 − 200
    expect(row.salaryWages).toBe(800)
    expect(row.total).toBe(100)                    // the register's OP + SALARY WAGES
    expect(row.closing).toBe(100)                  // the in-month earned event did NOT double-count
  })

  test('salary wages and contractual work are separate columns, both in the closing', () => {
    const row = monthStatementRow({
      name: 'Vikram', openingBalance: 0, month: MONTH,
      accruals: [{ month: '2026-08-01', attendance_pay: 3300, contract_pay: 1200, days: 26.5 }],
    })
    expect(row.days).toBe(26.5)                    // half days count as 0.5
    expect(row.salaryWages).toBe(3300)
    expect(row.contract).toBe(1200)
    expect(row.total).toBe(3300)                   // TOTAL is op + salary wages only
    expect(row.closing).toBe(4500)
  })

  test('an accrual row without the split counts wholly as salary wages', () => {
    const row = monthStatementRow({
      name: 'Old', openingBalance: 0, month: MONTH,
      accruals: [{ month: '2026-08-01', earned: 900 }],
    })
    expect(row.salaryWages).toBe(900)
    expect(row.contract).toBe(0)
  })

  test('events after the month are ignored entirely', () => {
    const row = monthStatementRow({
      name: 'X', openingBalance: 0, month: MONTH,
      events: [ev('payment', '2026-09-01', null, 999)],
    })
    expect(row.paid).toBe(0)
    expect(row.closing).toBe(0)
  })

  test('a positive closing is CR (farm owes him), a negative is DR (he owes)', () => {
    const cr = monthStatementRow({ name: 'A', openingBalance: 0, month: MONTH,
      accruals: [{ month: '2026-08-01', attendance_pay: 5000, contract_pay: 0 }] })
    expect(cr.cr).toBe(5000); expect(cr.dr).toBe(0)

    const dr = monthStatementRow({ name: 'B', openingBalance: 0, month: MONTH,
      events: [ev('advance', '2026-08-10', null, 3000)] })
    expect(dr.dr).toBe(3000); expect(dr.cr).toBe(0)
  })

  test('a recovery counts as its own column, not as wages', () => {
    const row = monthStatementRow({ name: 'Deepak', openingBalance: -13933, month: MONTH,
      events: [ev('recovery', '2026-08-19', 5000, null)] })
    expect(row.recovered).toBe(5000)
    expect(row.salaryWages).toBe(0)
    expect(row.closing).toBe(-8933)
    expect(row.dr).toBe(8933)
  })
})

describe('buildStaffBalance', () => {
  const dues = [
    { labourer_id: 'l1', name: 'Zorawar',  sub_type: 'regular',   opening_balance: 0 },
    { labourer_id: 's1', name: 'Harinder', sub_type: 'permanent', opening_balance: 0 },
    { labourer_id: 'l2', name: 'Settled',  sub_type: 'regular',   opening_balance: 0 },
  ]
  const accruals = [
    { labourer_id: 'l1', month: '2026-08-01', earned: 2000,  attendance_pay: 1500,  contract_pay: 500 },
    { labourer_id: 's1', month: '2026-08-01', earned: 10000, attendance_pay: 10000, contract_pay: 0 },
  ]
  const advances = [{ labourer_id: 'l1', advance_date: '2026-08-05', amount: 500 }]

  test('staff sort before regular; the all-zero worker is dropped', () => {
    const { rows } = buildStaffBalance({ duesRows: dues, accruals, advances, month: MONTH, today: TODAY })
    expect(rows.map(r => r.name)).toEqual(['Harinder', 'Zorawar'])
  })

  test('totals sum every column and CR/DR agree with the closings', () => {
    const { rows, totals } = buildStaffBalance({ duesRows: dues, accruals, advances, month: MONTH, today: TODAY })
    expect(totals.salaryWages).toBe(11500)
    expect(totals.contract).toBe(500)
    expect(totals.advances).toBe(500)
    expect(totals.closing).toBe(11500)
    expect(totals.cr - totals.dr).toBe(rows.reduce((s, r) => s + r.closing, 0))
  })
})

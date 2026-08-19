import { describe, it, expect } from 'vitest'
import {
  calcStaffEarned, daysInMonth, monthLabel, logsInMonth, monthlyLabourSummary,
} from '../labourMonth'

// Workers as the store shapes them (camelCase — the store maps the DB rows).
const staff  = (over = {}) => ({ id: 's1', monthlySalary: 12000, monthlyHoliday: 2, ...over })
const worker = (over = {}) => ({ id: 'w1', ratePerDay: 300, ...over })
const log    = (over = {}) => ({ id: 'l1', date: '2026-08-05', labourMasterId: null, totalCost: 0, ...over })

describe('calcStaffEarned', () => {
  it('pays the full salary for full presence across the working days', () => {
    // August: 31 days, 2 paid holidays → 29 working days.
    expect(calcStaffEarned(29, 31, 12000, 2)).toBe(12000)
  })

  it('never pays more than the salary, however many days are marked', () => {
    expect(calcStaffEarned(31, 31, 12000, 2)).toBe(12000)
  })

  it('docks pay for absence beyond the holiday allowance', () => {
    // 24 of 29 working days at ₹12,000/29 ≈ ₹413.79/day.
    expect(calcStaffEarned(24, 31, 12000, 2)).toBe(9931)
  })

  it('earns nothing without a monthly salary — a day-rate worker is priced elsewhere', () => {
    expect(calcStaffEarned(20, 31, 0)).toBe(0)
  })
})

describe('daysInMonth', () => {
  it('counts a 31-day month', () => expect(daysInMonth('2026-08')).toBe(31))
  it('counts a 30-day month', () => expect(daysInMonth('2026-06')).toBe(30))
  it('counts February in a non-leap year', () => expect(daysInMonth('2026-02')).toBe(28))
  it('counts February in a leap year', () => expect(daysInMonth('2028-02')).toBe(29))
})

describe('monthLabel', () => {
  it('names the month it was given, not the one before it', () => {
    // Guards the UTC off-by-one: `new Date('2026-08-01')` is midnight UTC, which
    // is 31 July anywhere west of Greenwich.
    expect(monthLabel('2026-08')).toBe('August 2026')
    expect(monthLabel('2026-01')).toBe('January 2026')
  })

  it('returns empty for a missing month rather than "Invalid Date"', () => {
    expect(monthLabel(undefined)).toBe('')
  })
})

describe('logsInMonth', () => {
  it('keeps only the selected month and ignores logs with no date', () => {
    const logs = [
      log({ id: 'a', date: '2026-08-01' }),
      log({ id: 'b', date: '2026-07-31' }),
      log({ id: 'c', date: '2026-08-31' }),
      log({ id: 'd', date: undefined }),
    ]
    expect(logsInMonth(logs, '2026-08').map(l => l.id)).toEqual(['a', 'c'])
  })
})

describe('monthlyLabourSummary', () => {
  it('reports zero on an empty farm rather than NaN', () => {
    expect(monthlyLabourSummary({ month: '2026-08' }))
      .toEqual({ staffSalary: 0, regularTotal: 0, contractualTotal: 0, total: 0 })
  })

  it('prices salaried staff from attendance days', () => {
    const { staffSalary } = monthlyLabourSummary({
      permanentStaff: [staff({ id: 's1', monthlySalary: 12000 })],
      month: '2026-08', attDays: { s1: 29 },
    })
    expect(staffSalary).toBe(12000)
  })

  it('prices a day-rate staff member by rate, not by salary', () => {
    const { staffSalary } = monthlyLabourSummary({
      permanentStaff: [staff({ id: 's1', monthlySalary: null, ratePerDay: 400 })],
      month: '2026-08', attDays: { s1: 10 },
    })
    expect(staffSalary).toBe(4000)
  })

  it('counts a half day as half a day of pay', () => {
    const { regularTotal } = monthlyLabourSummary({
      regularLabourers: [worker({ id: 'w1', ratePerDay: 300 })],
      month: '2026-08', attDays: { w1: 2.5 },
    })
    expect(regularTotal).toBe(750)
  })

  it('adds a named labourer\'s logged work on top of their attendance', () => {
    const { regularTotal } = monthlyLabourSummary({
      regularLabourers: [worker({ id: 'w1', ratePerDay: 300 })],
      labourLogs: [log({ labourMasterId: 'w1', totalCost: 1200 })],
      month: '2026-08', attDays: { w1: 3 },
    })
    expect(regularTotal).toBe(900 + 1200)
  })

  it('treats a log with no master id as contractual, never as regular labour', () => {
    const s = monthlyLabourSummary({
      regularLabourers: [worker({ id: 'w1', ratePerDay: 300 })],
      labourLogs: [log({ labourMasterId: null, totalCost: 5000 })],
      month: '2026-08', attDays: {},
    })
    expect(s.contractualTotal).toBe(5000)
    expect(s.regularTotal).toBe(0)
  })

  it('leaves a log naming an unknown worker out of both buckets', () => {
    // A labourer since made inactive: the log is theirs, so it is not a daily
    // hire, but they are not on the roll being summarised either.
    const s = monthlyLabourSummary({
      regularLabourers: [worker({ id: 'w1' })],
      labourLogs: [log({ labourMasterId: 'gone', totalCost: 700 })],
      month: '2026-08',
    })
    expect(s.regularTotal).toBe(0)
    expect(s.contractualTotal).toBe(0)
  })

  it('ignores another month entirely', () => {
    const s = monthlyLabourSummary({
      labourLogs: [log({ date: '2026-07-15', totalCost: 9999 })],
      month: '2026-08',
    })
    expect(s.contractualTotal).toBe(0)
  })

  it('totals the three buckets', () => {
    const s = monthlyLabourSummary({
      permanentStaff:   [staff({ id: 's1', monthlySalary: 12000 })],
      regularLabourers: [worker({ id: 'w1', ratePerDay: 300 })],
      labourLogs:       [log({ labourMasterId: null, totalCost: 5000 })],
      month: '2026-08', attDays: { s1: 29, w1: 4 },
    })
    expect(s).toEqual({
      staffSalary: 12000, regularTotal: 1200, contractualTotal: 5000, total: 18200,
    })
  })
})

import { describe, it, expect } from 'vitest'
import {
  isMonth, fyLabel, periodRange, inPeriod, fyOptions, fyMonths,
  monthLabel, periodLabel, periodSlug, currentFY, currentMonth,
} from '../period'

describe('period forms', () => {
  it('tells a month from an FY and from all', () => {
    expect(isMonth('2026-08')).toBe(true)
    expect(isMonth('2026')).toBe(false)
    expect(isMonth('all')).toBe(false)
    expect(isMonth(null)).toBe(false)
  })

  it('names an FY the way the owner writes it', () => {
    expect(fyLabel('2026')).toBe('2026-27')
    expect(fyLabel('2025')).toBe('2025-26')
    expect(fyLabel('2029')).toBe('2029-30') // decade rollover keeps two digits
  })
})

describe('periodRange', () => {
  it('is open-ended for standing crops', () => {
    expect(periodRange('all')).toBeNull()
  })

  it('runs an Indian FY April to March', () => {
    expect(periodRange('2026')).toEqual({ start: '2026-04-01', end: '2027-03-31' })
  })

  it('bounds a month with the -31 string trick, valid even for February', () => {
    expect(periodRange('2026-02')).toEqual({ start: '2026-02-01', end: '2026-02-31' })
  })
})

describe('inPeriod', () => {
  it('passes everything under standing crops', () => {
    expect(inPeriod('1999-01-01', 'all')).toBe(true)
  })

  it('cuts by FY — the cane question', () => {
    // Cane sown 15 Oct 25 belongs to FY 2025-26, not 2026-27.
    expect(inPeriod('2025-10-15', '2025')).toBe(true)
    expect(inPeriod('2025-10-15', '2026')).toBe(false)
    // FY boundary days
    expect(inPeriod('2026-03-31', '2025')).toBe(true)
    expect(inPeriod('2026-04-01', '2026')).toBe(true)
  })

  it('cuts by month, February included', () => {
    expect(inPeriod('2026-08-01', '2026-08')).toBe(true)
    expect(inPeriod('2026-08-31', '2026-08')).toBe(true)
    expect(inPeriod('2026-09-01', '2026-08')).toBe(false)
    expect(inPeriod('2026-02-28', '2026-02')).toBe(true)
    expect(inPeriod('2026-03-01', '2026-02')).toBe(false)
  })

  it('never drops a dateless row from a total', () => {
    expect(inPeriod(null, '2026')).toBe(true)
    expect(inPeriod('', '2026-08')).toBe(true)
  })
})

describe('labels and options', () => {
  it('offers recent FYs only — standing crops lives above the dropdown', () => {
    const opts = fyOptions(3)
    expect(opts).toHaveLength(3)
    expect(opts).not.toContain('all')
    expect(opts[0]).toBe(currentFY())
  })

  it('lists an FY as twelve months, April to March, year rolling at January', () => {
    const months = fyMonths('2026')
    expect(months).toHaveLength(12)
    expect(months[0]).toBe('2026-04')
    expect(months[8]).toBe('2026-12')
    expect(months[9]).toBe('2027-01')
    expect(months[11]).toBe('2027-03')
    // every entry is a month the rest of the period machinery understands
    months.forEach(m => expect(isMonth(m)).toBe(true))
  })

  it('labels every period form', () => {
    expect(periodLabel('all')).toBe('Standing Crops · All Time')
    expect(periodLabel('2026')).toBe('FY 2026-27')
    expect(monthLabel('2026-08')).toMatch(/Aug.*2026/)
    expect(periodLabel('2026-08')).toMatch(/Aug.*2026/)
  })

  it('slugs every period form for filenames', () => {
    expect(periodSlug('all')).toBe('Standing-Crops')
    expect(periodSlug('2026')).toBe('FY-2026-27')
    expect(periodSlug('2026-08')).toBe('2026-08')
  })

  it('currentFY and currentMonth agree on the local calendar', () => {
    const d = new Date()
    const m = d.getMonth() + 1
    expect(currentMonth()).toBe(`${d.getFullYear()}-${String(m).padStart(2, '0')}`)
    expect(currentFY()).toBe(String(m >= 4 ? d.getFullYear() : d.getFullYear() - 1))
  })
})

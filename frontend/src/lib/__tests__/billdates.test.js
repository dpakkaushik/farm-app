import { describe, it, expect } from 'vitest'
import { fmtBillDate, billRef, entryDiffers, localToday } from '../billdates'

// The August 2026 mis-dating, as data: a bill the owner wrote on 19 July, typed
// into the app on 7 August with the date picker left sitting on today.
const BILL_DATE  = '2026-07-19'
const TYPED_ON   = '2026-08-07T09:14:22.331+00:00'

describe('fmtBillDate', () => {
  it('renders a date column as the day it says, not the day before', () => {
    // 'YYYY-MM-DD' parsed as UTC midnight renders as the 18th west of Greenwich.
    expect(fmtBillDate(BILL_DATE)).toBe('19 Jul 26')
  })

  it('renders a timestamp', () => {
    expect(fmtBillDate(TYPED_ON)).toBe('07 Aug 26')
  })

  it('returns a dash for nothing, rather than "Invalid Date"', () => {
    expect(fmtBillDate(null)).toBe('—')
    expect(fmtBillDate('')).toBe('—')
    expect(fmtBillDate('not a date')).toBe('—')
  })
})

describe('billRef', () => {
  it('reads as the owner writes it — number then date', () => {
    expect(billRef('4348', BILL_DATE)).toBe('4348 / 19 Jul 26')
  })

  it('falls back to the date alone when the bill has no number', () => {
    expect(billRef('',    BILL_DATE)).toBe('19 Jul 26')
    expect(billRef(null,  BILL_DATE)).toBe('19 Jul 26')
    expect(billRef('  ',  BILL_DATE)).toBe('19 Jul 26')
  })
})

describe('entryDiffers', () => {
  it('flags the July bill typed in on 7 August', () => {
    expect(entryDiffers(BILL_DATE, TYPED_ON)).toBe(true)
  })

  it('stays quiet when the bill was entered the same day', () => {
    expect(entryDiffers('2026-08-07', TYPED_ON)).toBe(false)
  })

  it('stays quiet on next-morning entry — that is ordinary, not a mistake', () => {
    expect(entryDiffers('2026-08-06', TYPED_ON)).toBe(false)
  })

  it('flags a two-day gap', () => {
    expect(entryDiffers('2026-08-05', TYPED_ON)).toBe(true)
  })

  it('flags a bill dated after it was entered — that is impossible on paper', () => {
    expect(entryDiffers('2026-08-20', TYPED_ON)).toBe(true)
  })

  it('says nothing when either date is missing', () => {
    expect(entryDiffers(null, TYPED_ON)).toBe(false)
    expect(entryDiffers(BILL_DATE, null)).toBe(false)
  })
})

describe('localToday', () => {
  it('gives the local calendar day, which UTC does not before 5.30am IST', () => {
    const d = new Date()
    expect(localToday()).toBe(
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`)
  })

  it('is a date the picker will accept', () => {
    expect(localToday()).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })
})

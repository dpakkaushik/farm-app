import { describe, it, expect } from 'vitest'
import { cleanDescription } from '../expenseRows'

describe('cleanDescription', () => {
  it('drops "Purchase from" — under Vendor Purchases the words say nothing', () => {
    // Owner, 3 Sep: "purchase from was not required even in the current flow,
    // it is unneccesary to write it." What he wants left is the vendor.
    expect(cleanDescription('Purchase from New Ankur')).toBe('New Ankur')
  })

  it('keeps the bill number and item count the row still needs', () => {
    expect(cleanDescription('Purchase from New Ankur · Bill #4703 — 4 items'))
      .toBe('New Ankur · Bill #4703 — 4 items')
  })

  it('leaves a description that does not start with the phrase alone', () => {
    expect(cleanDescription('Diesel for tractor')).toBe('Diesel for tractor')
  })

  it('does not strip the phrase from the middle of a sentence', () => {
    expect(cleanDescription('Refund of purchase from Ankur')).toBe('Refund of purchase from Ankur')
  })

  it('ignores case and stray spacing, as typed data does', () => {
    expect(cleanDescription('purchase  from   Ankur')).toBe('Ankur')
  })

  it('keeps the original when stripping would leave nothing to read', () => {
    expect(cleanDescription('Purchase from')).toBe('Purchase from')
    expect(cleanDescription('Purchase from   ')).toBe('Purchase from   ')
  })

  it('survives an empty or missing description', () => {
    expect(cleanDescription('')).toBe('')
    expect(cleanDescription(undefined)).toBe('')
  })
})

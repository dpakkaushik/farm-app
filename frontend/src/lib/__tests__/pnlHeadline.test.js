import { describe, it, expect } from 'vitest'
import { pnlPosition, pendingExpected } from '../pnlHeadline'

describe('pnlPosition', () => {
  it('calls money earned above money spent a profit', () => {
    expect(pnlPosition({ income: 500, expenses: 200, expectedAhead: 0 }))
      .toEqual({ key: 'profit', label: 'Net profit', amount: 300, tone: 'good' })
  })

  it('does NOT call a standing crop a loss — the money is in the ground, not lost', () => {
    // The owner, 3 Sep: "showing Loss as such isnt good or say right." His farm
    // has spent ₹16.27L against crops that have not been sold yet; every rupee
    // of it is expected back at harvest.
    expect(pnlPosition({ income: 0, expenses: 1627352, expectedAhead: 5402410 }))
      .toEqual({ key: 'invested', label: 'Yet to recover', amount: 1627352, tone: 'neutral' })
  })

  it('does call it a loss once nothing is left to sell', () => {
    expect(pnlPosition({ income: 100, expenses: 400, expectedAhead: 0 }))
      .toEqual({ key: 'loss', label: 'Net loss', amount: 300, tone: 'bad' })
  })

  it('reports a profit as profit even while more crop is still standing', () => {
    expect(pnlPosition({ income: 900, expenses: 400, expectedAhead: 5000 }).key).toBe('profit')
  })

  it('treats breaking even as a profit, not a loss', () => {
    expect(pnlPosition({ income: 300, expenses: 300, expectedAhead: 0 }))
      .toMatchObject({ key: 'profit', amount: 0 })
  })
})

describe('pendingExpected', () => {
  const row = (revenue, expected_revenue) => ({ revenue, expected_revenue })

  it('adds up what the UNSOLD cycles still expect to fetch', () => {
    expect(pendingExpected([row(0, 1000), row(0, 500)])).toBe(1500)
  })

  it('ignores a cycle that has already sold — its revenue is real money now', () => {
    expect(pendingExpected([row(800, 1000), row(0, 500)])).toBe(500)
  })

  it('survives an empty list and missing figures', () => {
    expect(pendingExpected([])).toBe(0)
    expect(pendingExpected([{ }, { revenue: null, expected_revenue: null }])).toBe(0)
  })
})

import { describe, it, expect } from 'vitest'
import { cycleExpected, summarizeCropPnl } from '../farmOverview'

// Rows shaped like v_crop_pnl output (snake_case, numerics may arrive as strings
// from PostgREST — the helpers must coerce).
const row = (over = {}) => ({
  cycle_id: 'c1', cycle_status: 'active',
  total_cost: 0, revenue: 0, expected_revenue: 0, opening_cost: 0,
  ...over,
})

describe('cycleExpected', () => {
  it('keeps the full-harvest forecast for a partly-sold standing crop', () => {
    // Pallia cane today: ₹1.94L billed against a much larger expectation.
    expect(cycleExpected(row({ revenue: 194075, expected_revenue: 1500000 })))
      .toBe(1500000)
  })

  it('lets actual billing overtake the estimate on an active cycle', () => {
    expect(cycleExpected(row({ revenue: 1600000, expected_revenue: 1500000 })))
      .toBe(1600000)
  })

  it('collapses to actual earnings once the cycle is finished — under estimate', () => {
    expect(cycleExpected(row({ cycle_status: 'harvested', revenue: 90000, expected_revenue: 120000 })))
      .toBe(90000)
  })

  it('collapses to actual earnings once the cycle is finished — over estimate', () => {
    expect(cycleExpected(row({ cycle_status: 'completed', revenue: 130000, expected_revenue: 120000 })))
      .toBe(130000)
  })

  it('uses the estimate for an unsold standing crop', () => {
    expect(cycleExpected(row({ expected_revenue: 472834 }))).toBe(472834)
  })

  it('coerces PostgREST string numerics', () => {
    expect(cycleExpected(row({ revenue: '100.50', expected_revenue: '200.25' }))).toBe(200.25)
  })

  it('treats null/missing money as zero', () => {
    expect(cycleExpected(row({ revenue: null, expected_revenue: null }))).toBe(0)
  })
})

describe('summarizeCropPnl', () => {
  // Pallia in miniature: standing cane partly billed, standing paddy unsold,
  // and one finished cycle that earned less than hoped.
  const FARM = [
    row({ total_cost: 880533,  revenue: 194075, expected_revenue: 1500000, opening_cost: 880533 }),
    row({ total_cost: 472834,  revenue: 0,      expected_revenue: 600000,  opening_cost: 472833 }),
    row({ cycle_status: 'harvested', total_cost: 50000, revenue: 40000, expected_revenue: 90000 }),
  ]

  it('sums spent, billed and opening cost as plain totals', () => {
    const s = summarizeCropPnl(FARM)
    expect(s.spent).toBe(1403367)
    expect(s.billed).toBe(234075)
    expect(s.openingCost).toBe(1353366)
    expect(s.cycles).toBe(3)
  })

  it('builds expected from per-cycle rules, not a blanket sum of estimates', () => {
    // 1500000 (forecast holds) + 600000 (unsold) + 40000 (finished → actual)
    expect(summarizeCropPnl(FARM).expected).toBe(2140000)
  })

  it('net answers "if the crops sell as expected"', () => {
    expect(summarizeCropPnl(FARM).net).toBe(2140000 - 1403367)
  })

  it('is calm about an empty farm', () => {
    expect(summarizeCropPnl([]))
      .toEqual({ spent: 0, billed: 0, expected: 0, openingCost: 0, net: 0, cycles: 0 })
    expect(summarizeCropPnl().cycles).toBe(0)
  })
})

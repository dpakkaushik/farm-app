import { describe, it, expect } from 'vitest'
import { cornersFromPlot, plotFromCorners } from '../plotCorners'

const SQUARE = {
  point_a_lat: '28.5', point_a_lng: '80.4',
  point_b_lat: '28.6', point_b_lng: '80.4',
  point_c_lat: '28.6', point_c_lng: '80.5',
  point_d_lat: '28.5', point_d_lng: '80.5',
}

describe('cornersFromPlot', () => {
  it('reads four complete corners, in order', () => {
    expect(cornersFromPlot(SQUARE)).toEqual([
      { lat: 28.5, lng: 80.4 }, { lat: 28.6, lng: 80.4 },
      { lat: 28.6, lng: 80.5 }, { lat: 28.5, lng: 80.5 },
    ])
  })

  it('takes a prefix, so a half-drawn plot yields only what is set', () => {
    expect(cornersFromPlot({ point_a_lat: '28.5', point_a_lng: '80.4' }))
      .toEqual([{ lat: 28.5, lng: 80.4 }])
  })

  // The reason it is a prefix and not a filter.
  it('stops at a gap instead of shifting later corners forward', () => {
    expect(cornersFromPlot({
      point_b_lat: '28.6', point_b_lng: '80.4',
      point_c_lat: '28.6', point_c_lng: '80.5',
    })).toEqual([])
  })

  it('ignores half a pair', () => {
    expect(cornersFromPlot({ point_a_lat: '28.5', point_a_lng: '' })).toEqual([])
  })

  it('treats a non-numeric cell as absent rather than NaN', () => {
    expect(cornersFromPlot({ point_a_lat: 'abc', point_a_lng: '80.4' })).toEqual([])
  })

  it('accepts numbers as well as the strings the form holds', () => {
    expect(cornersFromPlot({ point_a_lat: 28.5, point_a_lng: 80.4 }))
      .toEqual([{ lat: 28.5, lng: 80.4 }])
  })

  it('survives empty, absent and null input', () => {
    expect(cornersFromPlot({})).toEqual([])
    expect(cornersFromPlot()).toEqual([])
    expect(cornersFromPlot(null)).toEqual([])
  })
})

describe('plotFromCorners', () => {
  it('writes all eight columns', () => {
    expect(plotFromCorners([
      { lat: 28.5, lng: 80.4 }, { lat: 28.6, lng: 80.4 },
      { lat: 28.6, lng: 80.5 }, { lat: 28.5, lng: 80.5 },
    ])).toEqual(SQUARE)
  })

  it('blanks the corners that were removed', () => {
    const patch = plotFromCorners([{ lat: 28.5, lng: 80.4 }])
    expect(patch.point_a_lat).toBe('28.5')
    expect(patch.point_b_lat).toBe('')
    expect(patch.point_d_lng).toBe('')
  })

  it('blanks every column for an empty or absent shape', () => {
    expect(Object.values(plotFromCorners([])).every(v => v === '')).toBe(true)
    expect(Object.values(plotFromCorners()).every(v => v === '')).toBe(true)
  })
})

describe('the round trip', () => {
  it('returns the same four corners it was given, to six decimals', () => {
    const pts = [
      { lat: 28.512345, lng: 80.456789 }, { lat: 28.612345, lng: 80.456789 },
      { lat: 28.612345, lng: 80.556789 }, { lat: 28.512345, lng: 80.556789 },
    ]
    expect(cornersFromPlot(plotFromCorners(pts))).toEqual(pts)
  })

  it('survives a partial shape too', () => {
    const pts = [{ lat: 28.5, lng: 80.4 }, { lat: 28.6, lng: 80.4 }]
    expect(cornersFromPlot(plotFromCorners(pts))).toEqual(pts)
  })
})

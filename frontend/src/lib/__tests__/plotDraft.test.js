import { describe, it, expect } from 'vitest'
import {
  parseArea, detailsError, areaCheck, resolveAreaAcres, saveBlock, AREA_TOLERANCE,
} from '../plotDraft'

describe('parseArea', () => {
  it('reads a typed figure', () => {
    expect(parseArea('2.5')).toBe(2.5)
    expect(parseArea(4)).toBe(4)
  })

  // Every money view multiplies by area_acres, so zero and junk are both "none".
  it('treats blank, zero, negative and junk as no area', () => {
    expect(parseArea('')).toBeNull()
    expect(parseArea('   ')).toBeNull()
    expect(parseArea('0')).toBeNull()
    expect(parseArea('-3')).toBeNull()
    expect(parseArea('abc')).toBeNull()
    expect(parseArea(undefined)).toBeNull()
    expect(parseArea(null)).toBeNull()
  })
})

describe('detailsError — step 1', () => {
  it('passes a named plot with no area, because the shape can supply it', () => {
    expect(detailsError({ name: 'Plot A', area_acres: '' })).toBeNull()
  })

  it('passes a named plot with an area', () => {
    expect(detailsError({ name: 'Plot A', area_acres: '4.5' })).toBeNull()
  })

  it('demands a name', () => {
    expect(detailsError({ name: '', area_acres: '4' })).toMatch(/name/i)
    expect(detailsError({ name: '   ', area_acres: '4' })).toMatch(/name/i)
    expect(detailsError({})).toMatch(/name/i)
  })

  it('rejects an area that was typed but is not a number', () => {
    expect(detailsError({ name: 'Plot A', area_acres: 'two' })).toMatch(/number/i)
    expect(detailsError({ name: 'Plot A', area_acres: '0' })).toMatch(/number/i)
  })
})

describe('areaCheck — typed figure vs drawn shape', () => {
  it('says nothing when no area was typed', () => {
    expect(areaCheck('', 4.2, 4)).toBeNull()
  })

  it('says nothing until the shape is finished', () => {
    expect(areaCheck('4', 2.1, 3)).toBeNull()
    expect(areaCheck('4', 0, 4)).toBeNull()
  })

  it('agrees when the shape is within tolerance', () => {
    const r = areaCheck('4', 4.3, 4)
    expect(r.off).toBe(false)
    expect(r.typed).toBe(4)
    expect(r.drawn).toBe(4.3)
    expect(r.diffPct).toBeCloseTo(0.075, 5)
  })

  it('flags a shape that disagrees by more than the tolerance', () => {
    expect(areaCheck('4', 5.2, 4).off).toBe(true)     // +30%
    expect(areaCheck('4', 2, 4).off).toBe(true)       // −50%
  })

  it('is exclusive at the boundary — exactly 10% off is still agreement', () => {
    expect(AREA_TOLERANCE).toBe(0.1)
    expect(areaCheck('4', 4.4, 4).off).toBe(false)
    expect(areaCheck('4', 4.41, 4).off).toBe(true)
  })
})

describe('resolveAreaAcres — which figure gets saved', () => {
  // The rule that matters: a surveyed number is never replaced by four taps.
  it('keeps a typed figure even when the shape disagrees wildly', () => {
    expect(resolveAreaAcres('4', 9.87, 4)).toBe('4')
  })

  it('fills a blank area from the finished shape', () => {
    expect(resolveAreaAcres('', 4.567, 4)).toBe('4.57')
  })

  it('leaves the area blank when the shape is unfinished', () => {
    expect(resolveAreaAcres('', 2.1, 3)).toBe('')
    expect(resolveAreaAcres('', 0, 4)).toBe('')
  })

  it('trims the typed figure it hands back', () => {
    expect(resolveAreaAcres(' 4.5 ', 9, 4)).toBe('4.5')
  })
})

describe('saveBlock — why Save is disabled', () => {
  it('enables Save on four corners', () => {
    expect(saveBlock({ name: 'Plot A', area_acres: '', cornerCount: 4 })).toBeNull()
  })

  it('demands a name before anything else', () => {
    expect(saveBlock({ name: '', area_acres: '4', cornerCount: 4 })).toMatch(/name/i)
  })

  it('counts down the corners still to tap', () => {
    expect(saveBlock({ name: 'Plot A', cornerCount: 3 })).toBe('1 more corner to go')
    expect(saveBlock({ name: 'Plot A', cornerCount: 2 })).toBe('2 more corners to go')
  })

  it('names both ways out when nothing is drawn', () => {
    expect(saveBlock({ name: 'Plot A', cornerCount: 0 })).toMatch(/4 corners.*area/i)
  })

  // Plots with no boundary already exist in this database. Renaming one must
  // not require inventing its corners first.
  it('lets a typed area stand in for a boundary', () => {
    expect(saveBlock({ name: 'Plot A', area_acres: '4', cornerCount: 0 })).toBeNull()
    expect(saveBlock({ name: 'Plot A', area_acres: '4', cornerCount: 2 })).toBeNull()
  })
})

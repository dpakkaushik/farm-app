import { describe, it, expect } from 'vitest'
import { buildDayBundle, shortPlotLabel } from '../dayBundle'

// Minimal slices/resolvers — only farm activity is under test here.
const emptySlices = {
  activities: [], purchases: [], issues: [], harvestSessions: [], sales: [],
  cropResiduals: [], labourLogs: [], advances: [], salaryPayments: [],
  livestockCountLogs: [], farmExpenses: [], livestockRevenue: [], mediaItems: [],
}
const resolvers = {
  cropCycles: [], cropMaster: [], livestockMaster: [], inventoryMaster: [],
  workerMap: {}, activityTypes: [{ name: 'spray', label: 'Spray / Pesticide' }],
}
const D = '2026-08-23'
const act = (over = {}) => ({ date: D, type: 'spray', ...over })
const farmActivity = activities =>
  buildDayBundle(D, { ...emptySlices, activities }, resolvers).farmActivity

describe('shortPlotLabel', () => {
  it('strips the "Plot " prefix', () => {
    expect(shortPlotLabel('Plot E1')).toBe('E1')
    expect(shortPlotLabel('plot f')).toBe('f')
  })
  it('leaves custom names untouched', () => {
    expect(shortPlotLabel('Back field')).toBe('Back field')
  })
  it('never strips down to an empty label', () => {
    expect(shortPlotLabel('Plot ')).toBe('Plot ')
  })
})

describe('farm activity merged rows', () => {
  it('lists plots short and sorted, without repeating the word Plot', () => {
    const rows = farmActivity([
      act({ plotLabel: 'Plot G' }), act({ plotLabel: 'Plot E1' }), act({ plotLabel: 'Plot F' }),
    ])
    expect(rows[0].plotLabels).toEqual(['E1', 'F', 'G'])
  })

  it('keeps a custom plot name whole in the list', () => {
    const rows = farmActivity([act({ plotLabel: 'Plot A' }), act({ plotLabel: 'Back field' })])
    expect(rows[0].plotLabels).toEqual(['A', 'Back field'])
  })

  it('shows an identical note once, not once per plot', () => {
    const rows = farmActivity(
      ['F', 'G', 'H', 'I'].map(p => act({ plotLabel: `Plot ${p}`, notes: 'Pesticides sprey' })),
    )
    expect(rows[0].notes).toEqual(['Pesticides sprey'])
  })

  it('dedupes notes differing only in case or surrounding space', () => {
    const rows = farmActivity([
      act({ plotLabel: 'Plot F', notes: 'Pesticides sprey' }),
      act({ plotLabel: 'Plot G', notes: '  pesticides sprey ' }),
    ])
    expect(rows[0].notes).toEqual(['Pesticides sprey'])
  })

  it('keeps genuinely different notes, in entry order', () => {
    const rows = farmActivity([
      act({ plotLabel: 'Plot F', notes: 'Monocrotophos' }),
      act({ plotLabel: 'Plot G', notes: 'Chlorpyrifos' }),
    ])
    expect(rows[0].notes).toEqual(['Monocrotophos', 'Chlorpyrifos'])
  })

  it('ignores whitespace-only notes', () => {
    const rows = farmActivity([act({ plotLabel: 'Plot F', notes: '   ' })])
    expect(rows[0].notes).toEqual([])
  })
})

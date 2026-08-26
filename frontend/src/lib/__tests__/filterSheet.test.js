import { describe, it, expect } from 'vitest'
import {
  activeGroups, activeCount, valueLabel, appliedChips, sanitizeDraft, clearedValue,
} from '../filterSheet'

const plot = {
  key: 'plot', label: 'Plot',
  options: [['all', 'All plots'], ['p1', 'Plot F'], ['p2', 'Plot G']],
}
const activity = {
  key: 'activity', label: 'Activity',
  options: [['all', 'All activity'], ['weeding', 'Weeding'], ['sowing', 'Sowing']],
}
const sort = {
  key: 'sort', label: 'Sort', allValue: 'newest',
  options: [['newest', 'Newest first'], ['oldest', 'Oldest first']],
}
const groups = [plot, activity, sort]

const monthsOf = (year) => ({
  key: 'month', label: 'Month',
  options: year === '2026'
    ? [['all', 'All months'], ['07', 'Jul'], ['08', 'Aug']]
    : [['all', 'All months'], ['03', 'Mar']],
})

describe('activeGroups / activeCount', () => {
  it('counts nothing when every group sits on its default', () => {
    const value = { plot: 'all', activity: 'all', sort: 'newest' }
    expect(activeGroups(value, groups)).toEqual([])
    expect(activeCount(value, groups)).toBe(0)
  })

  it('counts only the groups narrowed away from their default', () => {
    const value = { plot: 'p1', activity: 'all', sort: 'newest' }
    expect(activeCount(value, groups)).toBe(1)
    expect(activeGroups(value, groups).map(g => g.key)).toEqual(['plot'])
  })

  it('treats a missing key as that group default', () => {
    expect(activeCount({}, groups)).toBe(0)
  })

  it("respects a group whose default is not 'all' — sort only counts once moved", () => {
    expect(activeCount({ sort: 'newest' }, groups)).toBe(0)
    expect(activeCount({ sort: 'oldest' }, groups)).toBe(1)
  })
})

describe('valueLabel', () => {
  it('reads the label out of the option row', () => {
    expect(valueLabel(activity, 'weeding')).toBe('Weeding')
  })

  it('falls back to the raw value when the option is gone', () => {
    expect(valueLabel(activity, 'ploughing')).toBe('ploughing')
  })
})

describe('appliedChips', () => {
  it('returns one labelled chip per applied filter, carrying how to clear it', () => {
    const chips = appliedChips({ plot: 'p2', activity: 'weeding', sort: 'oldest' }, groups)
    expect(chips).toEqual([
      { key: 'plot', label: 'Plot G', allValue: 'all' },
      { key: 'activity', label: 'Weeding', allValue: 'all' },
      { key: 'sort', label: 'Oldest first', allValue: 'newest' },
    ])
  })

  it('is empty on an unfiltered list', () => {
    expect(appliedChips({ plot: 'all' }, groups)).toEqual([])
  })
})

describe('sanitizeDraft', () => {
  it('drops a dependent value the new options no longer offer', () => {
    // August was picked inside 2026; switching to 2025 leaves no August.
    const next = { year: '2025', month: '08' }
    expect(sanitizeDraft(next, [monthsOf('2025')])).toEqual({ year: '2025', month: 'all' })
  })

  it('keeps a dependent value that survives the change', () => {
    const next = { year: '2026', month: '08' }
    expect(sanitizeDraft(next, [monthsOf('2026')])).toBe(next)
  })

  it('never mutates the draft it was given', () => {
    const draft = { plot: 'gone', activity: 'weeding' }
    const out = sanitizeDraft(draft, groups)
    expect(draft.plot).toBe('gone')
    expect(out).toEqual({ plot: 'all', activity: 'weeding' })
  })
})

describe('clearedValue', () => {
  it('returns every group to its own default, sort included', () => {
    expect(clearedValue({ plot: 'p1', activity: 'sowing', sort: 'oldest' }, groups))
      .toEqual({ plot: 'all', activity: 'all', sort: 'newest' })
  })

  it('leaves keys that are not groups alone', () => {
    expect(clearedValue({ plot: 'p1', page: 3 }, groups))
      .toEqual({ plot: 'all', activity: 'all', sort: 'newest', page: 3 })
  })
})

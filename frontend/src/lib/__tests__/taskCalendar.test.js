import { describe, test, expect } from 'vitest'
import {
  buildMonthGrid, monthOf, monthLabel, prevMonth, nextMonth,
  cropColorMap, groupTasksByDate, dateDots, OVERDUE_RED, CROP_PALETTE,
  filterByCrop, plusOneMonth, partitionTasks,
} from '../taskCalendar'

// August 2026: the 1st is a Saturday, the 31st a Monday. A Sunday-first grid
// therefore pads back to Sun 26 Jul and forward to Sat 5 Sep — six weeks.
describe('buildMonthGrid', () => {
  test('pads August 2026 to six Sunday-first weeks', () => {
    const grid = buildMonthGrid('2026-08')

    expect(grid).toHaveLength(6)
    grid.forEach(week => expect(week).toHaveLength(7))
    expect(grid[0][0].dateStr).toBe('2026-07-26')
    expect(grid[0][6].dateStr).toBe('2026-08-01')
    expect(grid[5][6].dateStr).toBe('2026-09-05')
  })

  test('marks only the month\'s own days as inMonth', () => {
    const grid = buildMonthGrid('2026-08')

    const inMonth = grid.flat().filter(c => c.inMonth)

    expect(inMonth).toHaveLength(31)
    expect(grid[0][0].inMonth).toBe(false)          // 26 Jul
    expect(grid[0][6].inMonth).toBe(true)           // 1 Aug
    expect(grid[5][0].inMonth).toBe(true)           // 30 Aug
    expect(grid[5][2].inMonth).toBe(false)          // 1 Sep
  })

  test('February 2026 starts on a Sunday and needs no padding at all', () => {
    const grid = buildMonthGrid('2026-02')

    expect(grid).toHaveLength(4)
    expect(grid[0][0].dateStr).toBe('2026-02-01')
    expect(grid[3][6].dateStr).toBe('2026-02-28')
    expect(grid.flat().every(c => c.inMonth)).toBe(true)
  })
})

describe('month navigation', () => {
  test('monthOf takes the month of a date string', () => {
    expect(monthOf('2026-08-21')).toBe('2026-08')
  })

  test('prevMonth rolls January back into the previous year', () => {
    expect(prevMonth('2026-01')).toBe('2025-12')
    expect(prevMonth('2026-08')).toBe('2026-07')
  })

  test('nextMonth rolls December into the next year', () => {
    expect(nextMonth('2026-12')).toBe('2027-01')
    expect(nextMonth('2026-08')).toBe('2026-09')
  })

  test('monthLabel names the month in full', () => {
    expect(monthLabel('2026-08')).toBe('August 2026')
    expect(monthLabel('2027-01')).toBe('January 2027')
  })
})

describe('cropColorMap', () => {
  test('gives every crop a colour from the palette', () => {
    const map = cropColorMap(['Sugarcane', 'Paddy'])

    expect(CROP_PALETTE).toContain(map.Sugarcane)
    expect(CROP_PALETTE).toContain(map.Paddy)
  })

  test('distinct crops get distinct colours', () => {
    const map = cropColorMap(['Sugarcane', 'Paddy', 'Wheat'])

    expect(map.Sugarcane).not.toBe(map.Paddy)
    expect(map.Paddy).not.toBe(map.Wheat)
    expect(map.Sugarcane).not.toBe(map.Wheat)
  })

  test('assignment is stable regardless of input order or duplicates', () => {
    const a = cropColorMap(['Paddy', 'Sugarcane'])
    const b = cropColorMap(['Sugarcane', 'Paddy', 'Sugarcane'])

    expect(a).toEqual(b)
  })

  test('more crops than palette entries wrap around instead of failing', () => {
    const names = Array.from({ length: CROP_PALETTE.length + 2 }, (_, i) => `Crop${String(i).padStart(2, '0')}`)

    const map = cropColorMap(names)

    names.forEach(n => expect(CROP_PALETTE).toContain(map[n]))
  })
})

describe('groupTasksByDate', () => {
  test('groups tasks under their dateStr preserving order', () => {
    const t1 = { id: 'a', dateStr: '2026-08-25' }
    const t2 = { id: 'b', dateStr: '2026-08-25' }
    const t3 = { id: 'c', dateStr: '2026-08-27' }

    const byDate = groupTasksByDate([t1, t2, t3])

    expect(byDate['2026-08-25']).toEqual([t1, t2])
    expect(byDate['2026-08-27']).toEqual([t3])
  })

  test('returns an empty object for no tasks', () => {
    expect(groupTasksByDate([])).toEqual({})
  })
})

describe('dateDots', () => {
  const colorMap = cropColorMap(['Sugarcane', 'Paddy'])
  const TODAY = '2026-08-21'

  test('a past date shows a single red overdue dot however many tasks it holds', () => {
    const tasks = [
      { cropName: 'Sugarcane' }, { cropName: 'Paddy' }, { cropName: 'Paddy' },
    ]

    expect(dateDots(tasks, '2026-08-05', TODAY, colorMap)).toEqual([OVERDUE_RED])
  })

  test('today and future dates show one dot per crop, deduped', () => {
    const tasks = [
      { cropName: 'Paddy' }, { cropName: 'Paddy' }, { cropName: 'Sugarcane' },
    ]

    const dots = dateDots(tasks, '2026-08-25', TODAY, colorMap)

    expect(dots).toEqual([colorMap.Paddy, colorMap.Sugarcane])
  })

  test('caps the dots at three crops', () => {
    const map = cropColorMap(['A', 'B', 'C', 'D'])
    const tasks = ['A', 'B', 'C', 'D'].map(c => ({ cropName: c }))

    expect(dateDots(tasks, '2026-08-25', TODAY, map)).toHaveLength(3)
  })

  test('no tasks means no dots', () => {
    expect(dateDots([], '2026-08-25', TODAY, colorMap)).toEqual([])
    expect(dateDots(undefined, '2026-08-25', TODAY, colorMap)).toEqual([])
  })
})

describe('filterByCrop', () => {
  const tasks = [{ cropName: 'Paddy' }, { cropName: 'Sugarcane' }, { cropName: 'Paddy' }]

  test("'all' returns the same array, not a copy", () => {
    expect(filterByCrop(tasks, 'all')).toBe(tasks)
  })
  test('a crop narrows to that crop only', () => {
    expect(filterByCrop(tasks, 'Paddy')).toEqual([{ cropName: 'Paddy' }, { cropName: 'Paddy' }])
  })
  test('an unknown crop matches nothing', () => {
    expect(filterByCrop(tasks, 'Wheat')).toEqual([])
  })
})

describe('plusOneMonth', () => {
  test('mid-month just bumps the month', () => {
    expect(plusOneMonth('2026-08-27')).toBe('2026-09-27')
  })
  test('day overflow clamps to the last day, never rolls over', () => {
    expect(plusOneMonth('2026-01-31')).toBe('2026-02-28')   // not 2/3 March
    expect(plusOneMonth('2024-01-31')).toBe('2024-02-29')   // leap year
    expect(plusOneMonth('2026-08-31')).toBe('2026-09-30')
  })
  test('December crosses the year', () => {
    expect(plusOneMonth('2026-12-15')).toBe('2027-01-15')
  })
})

describe('partitionTasks', () => {
  const TODAY = '2026-08-27'
  const t = (dateStr, label) => ({ dateStr, label })
  const tasks = [
    t('2026-08-10', 'old-b'), t('2026-08-04', 'old-a'),          // overdue, out of order
    t('2026-08-27', 'today'),
    t('2026-09-05', 'soon'), t('2026-08-30', 'sooner'),          // upcoming, out of order
    t('2026-09-27', 'edge'),                                     // exactly one month out
    t('2026-09-28', 'beyond'),                                   // past the horizon
  ]

  test('due = overdue (most-late first) then today', () => {
    const { due } = partitionTasks(tasks, TODAY, TODAY)
    expect(due.map(x => x.label)).toEqual(['old-a', 'old-b', 'today'])
  })
  test('scheduled is exactly the tapped date, past dates included', () => {
    const { scheduled } = partitionTasks(tasks, TODAY, '2026-08-10')
    expect(scheduled.map(x => x.label)).toEqual(['old-b'])
  })
  test('upcoming runs tomorrow through one month out, soonest first', () => {
    const { upcoming } = partitionTasks(tasks, TODAY, TODAY)
    expect(upcoming.map(x => x.label)).toEqual(['sooner', 'soon', 'edge'])
  })
  test("today's tasks sit in due, not in upcoming", () => {
    const { upcoming } = partitionTasks(tasks, TODAY, TODAY)
    expect(upcoming.some(x => x.label === 'today')).toBe(false)
  })
})

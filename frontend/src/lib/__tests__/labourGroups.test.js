import { describe, it, expect } from 'vitest'
import {
  contractUnit, shortDate, wholeShares, jobSummary, groupAnchorId, groupLabourRows,
} from '../labourGroups'

// The real ₹6,520 spraying job of 10 Aug 2026: 163 tanks at ₹40, its cost split
// pro-rata across seven plots. These are the live figures, to the paisa.
const SPRAY = [
  ['Plot B',  1156.77], ['Plot E1', 1156.77], ['Plot D', 1051.61],
  ['Plot C',  1051.61], ['Plot E2', 1051.61], ['Plot L',  736.13],
  ['Plot P',   315.48],
]
const DESC = 'Labour — Contractual (Spray / Pesticide)'

const ledgerRow = (id, amount, over = {}) => ({
  id, amount, entry_date: '2026-08-10', description: DESC,
  expense_type: 'labour', category: 'labour', is_paid: false, paid_date: null,
  ...over,
})
// A log as the store maps it (`ratePerDay`), and a grouped item as
// groupLabourRows emits it (`rate`, `share`) — jobSummary reads the latter.
const logOf = (plotLabel, over = {}) => ({
  plotLabel, contractType: 'tank_wise', contractQty: 163, ratePerDay: 40, workers: 0, ...over,
})
const itemOf = (plotLabel, over = {}) => ({
  plotLabel, contractType: 'tank_wise', contractQty: 163, rate: 40, ...over,
})

// The seven ledger rows and the seven logs behind them.
const sprayRows = () => SPRAY.map(([, amt], i) => ledgerRow(`log-${i}`, amt))
const sprayLogs = () => Object.fromEntries(SPRAY.map(([plot], i) => [`log-${i}`, logOf(plot)]))

describe('contractUnit', () => {
  it('names the unit a contract is priced in', () => {
    expect(contractUnit('tank_wise')).toBe('Tanks')
    expect(contractUnit('area_wise')).toBe('Acres')
  })
  it('is blank for a log with no contract type — an assigned task has no unit', () => {
    expect(contractUnit(null)).toBe('')
    expect(contractUnit('something_else')).toBe('')
  })
})

describe('shortDate', () => {
  it('names the day it was given, not the one before it', () => {
    // Guards the UTC off-by-one: `new Date('2026-08-10')` is midnight UTC, which
    // is 9 August anywhere west of Greenwich.
    expect(shortDate('2026-08-10')).toBe('10 Aug')
    expect(shortDate('2026-01-01')).toBe('1 Jan')
  })
  it('is blank for a missing date', () => {
    expect(shortDate(null)).toBe('')
    expect(shortDate('')).toBe('')
  })
})

describe('wholeShares', () => {
  it('makes the seven parts add up to the ₹6,520 the header shows', () => {
    const raw    = SPRAY.map(([, amt]) => amt)
    const total  = raw.reduce((s, v) => s + v, 0)   // 6519.98
    const shares = wholeShares(raw, total)
    expect(shares.reduce((s, v) => s + v, 0)).toBe(6520)
    // Rounded one by one these would sum to 6,521 — the extra rupee comes off
    // the largest part, so no part is out by more than a rupee.
    expect(shares).toEqual([1156, 1157, 1052, 1052, 1052, 736, 315])
  })

  it('leaves already-exact parts alone', () => {
    expect(wholeShares([100, 200, 300], 600)).toEqual([100, 200, 300])
  })

  it('returns nothing for no parts', () => {
    expect(wholeShares([], 500)).toEqual([])
  })
})

describe('jobSummary', () => {
  it('describes the job, not just its date', () => {
    const items = SPRAY.map(([plot]) => itemOf(plot))
    expect(jobSummary(items)).toBe('7 plots · 163 tanks @ ₹40')
  })

  it('names the plot when a job stands in only one', () => {
    expect(jobSummary([itemOf('Plot B')])).toBe('Plot B · 163 tanks @ ₹40')
  })

  it('counts entries when no plot is known — a farm-wide job', () => {
    expect(jobSummary([itemOf(''), itemOf('')])).toBe('2 entries · 163 tanks @ ₹40')
  })

  it('omits the quantity when the work was not priced by contract', () => {
    const items = [itemOf('Plot B', { contractType: null, contractQty: 0 }),
                   itemOf('Plot C', { contractType: null, contractQty: 0 })]
    expect(jobSummary(items)).toBe('2 plots')
  })
})

describe('groupAnchorId', () => {
  it('picks the same anchor whatever order the rows arrived in', () => {
    expect(groupAnchorId(['c', 'a', 'b'])).toBe('a')
    expect(groupAnchorId(['b', 'c', 'a'])).toBe('a')
  })
  it('is null for an empty group', () => expect(groupAnchorId([])).toBe(null))
})

describe('groupLabourRows', () => {
  it('turns one job into one payable line', () => {
    const rows = groupLabourRows(sprayRows(), sprayLogs())
    expect(rows).toHaveLength(1)
    expect(Math.round(rows[0].amount)).toBe(6520)
    expect(rows[0].groupIds).toHaveLength(7)
  })

  it('describes the job on the line the owner presses Pay on', () => {
    const [row] = groupLabourRows(sprayRows(), sprayLogs())
    expect(row.description).toBe(`${DESC} — 7 plots · 163 tanks @ ₹40`)
  })

  it('keeps the per-plot breakup behind it, adding to the same total', () => {
    const [row] = groupLabourRows(sprayRows(), sprayLogs())
    expect(row.items).toHaveLength(7)
    expect(row.items.map(i => i.plotLabel)).toContain('Plot P')
    expect(row.items.reduce((s, i) => s + i.share, 0)).toBe(6520)
  })

  it('never merges a paid job into an unpaid one', () => {
    const rows = groupLabourRows([
      ledgerRow('a', 100),
      ledgerRow('b', 100, { is_paid: true, paid_date: '2026-08-19' }),
    ], {})
    expect(rows).toHaveLength(2)
  })

  it('keeps different jobs apart, even on the same day', () => {
    const rows = groupLabourRows([
      ledgerRow('a', 100),
      ledgerRow('b', 100, { description: 'Labour — Contractual (Weeding)' }),
    ], {})
    expect(rows).toHaveLength(2)
  })

  it('leaves a one-plot job as one row with no breakup to open', () => {
    const rows = groupLabourRows([ledgerRow('solo', 500)], { solo: logOf('Plot B') })
    expect(rows).toHaveLength(1)
    expect(rows[0].items).toBeUndefined()
    expect(rows[0].description).toBe(`${DESC} · Plot B`)
    expect(rows[0].groupIds).toEqual(['solo'])
  })

  it('passes non-labour rows through untouched', () => {
    const purchase = { id: 'p1', amount: 900, expense_type: 'vendor_purchase',
                       description: 'Purchase from Ankur', entry_date: '2026-08-02' }
    const rows = groupLabourRows([purchase, ...sprayRows()], sprayLogs())
    expect(rows).toHaveLength(2)
    expect(rows[0].description).toBe('Purchase from Ankur')
    expect(rows[0].groupIds).toBeUndefined()
  })

  it('still groups when the logs have not loaded yet — only the names are missing', () => {
    // The money and the grouping key come from the ledger; the plot names come
    // from `labour_logs`. If loadAll has not landed the line is still one line.
    const rows = groupLabourRows(sprayRows(), {})
    expect(rows).toHaveLength(1)
    expect(Math.round(rows[0].amount)).toBe(6520)
    expect(rows[0].description).toBe(`${DESC} — 7 entries`)
  })
})

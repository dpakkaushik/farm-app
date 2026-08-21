import { describe, it, expect } from 'vitest'
import { annotatePockets } from '../cashPockets'

// The two pockets the Cash Book shows. Underneath there are seven real accounts
// (one cash + six partner banks); this lib is what folds the six banks into the
// single "Bank" figure the owner asked for, without touching a single row's
// real account_id.

const CASH = { id: 'acc-cash', name: 'Cash in hand', type: 'cash' }
const BANK1 = { id: 'acc-b1', name: 'Punjab & Sind — Vipul Nanda', type: 'bank' }
const BANK2 = { id: 'acc-b2', name: 'UP Gramin — Puja Nanda', type: 'bank' }
const ACCOUNTS = [CASH, BANK1, BANK2]

let seq = 0
const row = (account_id, direction, amount, extra = {}) =>
  ({ id: `r${++seq}`, entry_date: '2026-08-01', account_id, direction, amount, ...extra })

describe('pocket resolution', () => {
  it('maps each row to cash or bank by its account type', () => {
    const out = annotatePockets(
      [row(CASH.id, 'in', 100), row(BANK1.id, 'in', 200), row(BANK2.id, 'in', 300)],
      ACCOUNTS,
    )
    expect(out.map(r => r.pocket)).toEqual(['cash', 'bank', 'bank'])
  })

  it('reads a null or unknown account_id as cash — pre-0028 rows carried no account', () => {
    const out = annotatePockets(
      [row(null, 'in', 100), row('acc-deleted', 'out', 50)],
      ACCOUNTS,
    )
    expect(out.map(r => r.pocket)).toEqual(['cash', 'cash'])
  })
})

describe('pocket running balance', () => {
  it('folds every bank account into ONE bank figure; cash rows never move it', () => {
    const out = annotatePockets([
      row(BANK1.id, 'in', 22150),   // opening — Vipul
      row(BANK2.id, 'in', 2614),    // opening — Puja
      row(CASH.id,  'in', 11979),   // opening — cash box
      row(CASH.id,  'out', 6520),   // labour paid in cash
      row(BANK2.id, 'in', 8000),    // cane payment lands in Puja's account
    ], ACCOUNTS)

    expect(out.map(r => r.pocket_running_balance)).toEqual([
      22150,          // bank after Vipul's opening
      24764,          // bank after Puja's opening
      11979,          // cash after its opening — bank figure untouched
      5459,           // cash after the labour payment
      32764,          // bank after the cane payment — cash figure untouched
    ])
  })

  it('matches account_running_balance for cash rows — one cash account means pocket ≡ account', () => {
    // The invariant that pins the client walk to the view's window function:
    // v_cash_book computes account_running_balance per account, and the cash
    // pocket has exactly one account, so the two figures must agree row by row.
    const rows = [
      row(CASH.id,  'in', 11979, { account_running_balance: 11979 }),
      row(BANK1.id, 'in', 22150, { account_running_balance: 22150 }),
      row(CASH.id,  'out', 1400, { account_running_balance: 10579 }),
      row(CASH.id,  'out', 2800, { account_running_balance: 7779 }),
    ]
    const out = annotatePockets(rows, ACCOUNTS)
    for (const r of out.filter(r => r.pocket === 'cash')) {
      expect(r.pocket_running_balance).toBe(Number(r.account_running_balance))
    }
  })

  it('moves both pockets in opposite directions on a bank→cash transfer pair', () => {
    const out = annotatePockets([
      row(BANK1.id, 'in', 20000),
      row(CASH.id,  'in', 1000),
      row(BANK1.id, 'out', 5000, { entry_type: 'transfer' }),
      row(CASH.id,  'in', 5000, { entry_type: 'transfer' }),
    ], ACCOUNTS)
    expect(out[2].pocket_running_balance).toBe(15000)  // bank down
    expect(out[3].pocket_running_balance).toBe(6000)   // cash up
  })

  it('reads string amounts the way the view can hand them over', () => {
    const out = annotatePockets([row(CASH.id, 'in', '11979.50')], ACCOUNTS)
    expect(out[0].pocket_running_balance).toBe(11979.5)
  })
})

describe('safety', () => {
  it('never mutates its inputs', () => {
    const rows = [Object.freeze(row(CASH.id, 'in', 100))]
    const accounts = [Object.freeze({ ...CASH })]
    const out = annotatePockets(Object.freeze(rows), Object.freeze(accounts))
    expect(out[0]).not.toBe(rows[0])
    expect(rows[0].pocket).toBeUndefined()
  })

  it('handles empty inputs — no rows, or a pre-0028 database with no accounts', () => {
    expect(annotatePockets([], ACCOUNTS)).toEqual([])
    const out = annotatePockets([row('anything', 'in', 100)], [])
    expect(out[0].pocket).toBe('cash')
    expect(out[0].pocket_running_balance).toBe(100)
  })
})

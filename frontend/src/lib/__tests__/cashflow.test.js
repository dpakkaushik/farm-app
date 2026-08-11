import { describe, it, expect } from 'vitest'
import { buildCashFlow, CLASSIFIED_TYPES, TIMBER_NOTE_PREFIX } from '../cashflow'

// Every entry_type the codebase can write, gathered by grepping for `entry_type:`
// across store/index.js, store/trees.js and the migrations. If someone adds a
// nineteenth, test 1 fails and the classification table gets updated — which is
// the entire point of keeping this list here rather than in a comment.
const ALL_TYPES = [
  'crop_sale', 'cane_sale', 'livestock_sale', 'residual_sale', 'tree_sale',
  'revenue_receipt', 'buyer_receipt', 'owner_capital', 'opening_cash', 'transfer',
  'vendor_payment', 'labour_payment', 'salary_payment', 'advance_payment',
  'expense_payment', 'owner_drawing', 'commission_expense', 'freight_expense',
  'sale_deduction',
]

const row = (entry_type, direction, amount, notes = '') =>
  ({ id: `${entry_type}-${amount}`, entry_date: '2026-06-01', entry_type, direction, amount, notes })

// Pallia Farm as at 2026-08-10 — the eight (type, direction, total) groups the
// live database actually holds across its 23 rows. Nets to ₹1,33,230, which is
// the farm's cash total.
const PALLIA = [
  row('crop_sale',          'in',  194075),
  row('owner_capital',      'in',   50000),
  row('vendor_payment',     'out',   1000),
  row('labour_payment',     'out',  75200),
  row('salary_payment',     'out',  24000),
  row('advance_payment',    'out',   5000),
  row('expense_payment',    'out',    100),
  row('commission_expense', 'out',   5545),
]

const lineIn = (result, sectionKey, lineKey) =>
  result.sections.find(s => s.key === sectionKey)?.lines.find(l => l.key === lineKey)

const section = (result, key) => result.sections.find(s => s.key === key)

describe('classification', () => {
  it('covers every entry_type the codebase can write', () => {
    for (const type of ALL_TYPES) {
      expect(CLASSIFIED_TYPES, `${type} is not classified`).toContain(type)
    }
  })

  it('leaves nothing in Unclassified when every type is known', () => {
    const result = buildCashFlow(ALL_TYPES.map(t => row(t, 'in', 100)))
    expect(section(result, 'unclassified')).toBeUndefined()
  })

  it('surfaces an unknown type instead of hiding it in Operating', () => {
    const result = buildCashFlow([...PALLIA, row('crypto_windfall', 'in', 9999)])
    const unclassified = section(result, 'unclassified')

    expect(unclassified).toBeDefined()
    expect(unclassified.lines.map(l => l.label)).toContain('crypto_windfall')
    expect(unclassified.subtotal).toBe(9999)
    // Still counted, so the statement continues to tie.
    expect(result.closingCash).toBe(133230 + 9999)
    expect(result.reconciles).toBe(true)
  })
})

describe('transfers', () => {
  it('change no section total and no closing cash', () => {
    const withTransfer = [
      ...PALLIA,
      row('transfer', 'out', 20000, 'To Bank'),
      row('transfer', 'in',  20000, 'From Cash in hand'),
    ]
    const plain = buildCashFlow(PALLIA)
    const moved = buildCashFlow(withTransfer)

    expect(moved.closingCash).toBe(plain.closingCash)
    expect(section(moved, 'operating').subtotal).toBe(section(plain, 'operating').subtotal)
    expect(moved.reconciles).toBe(true)
  })
})

describe('reconciliation on real data', () => {
  it('ties opening → closing for Pallia Farm', () => {
    const result = buildCashFlow(PALLIA, { openingCash: 0 })

    expect(result.openingCash).toBe(0)
    expect(section(result, 'operating').subtotal).toBe(83230)
    expect(section(result, 'investing').subtotal).toBe(0)
    expect(section(result, 'financing').subtotal).toBe(50000)
    expect(result.closingCash).toBe(133230)
    expect(result.reconciles).toBe(true)
    expect(result.discrepancy).toBe(0)
  })

  it('puts advance payments in Labour & salaries, not Other expenses', () => {
    const result = buildCashFlow(PALLIA)
    // 75,200 labour + 24,000 salary + 5,000 advance
    expect(lineIn(result, 'operating', 'labour').amount).toBe(-104200)
    expect(lineIn(result, 'operating', 'other_expenses').amount).toBe(-100)
  })

  it('shows zero-value lines rather than dropping them', () => {
    const result = buildCashFlow(PALLIA)
    expect(lineIn(result, 'operating', 'other_income').amount).toBe(0)
    expect(lineIn(result, 'investing', 'timber')).toBeDefined()
  })
})

describe('opening cash', () => {
  it('counts an opening_cash entry that falls inside the period', () => {
    // The "all time" case: no balance carried in, and the opening entries sit
    // inside the range. Excluded from the three sections, so if they were not
    // added as opening, closing would be short by exactly ₹1,33,230.
    const result = buildCashFlow(
      [row('opening_cash', 'in', 133230, 'Opening balance — Cash in hand'), ...PALLIA],
      { openingCash: 0 },
    )

    expect(result.openingCash).toBe(133230)
    expect(result.closingCash).toBe(266460)
    expect(result.reconciles).toBe(true)
  })

  it('carries forward a balance from before the period', () => {
    const result = buildCashFlow(PALLIA, { openingCash: 40000 })
    expect(result.openingCash).toBe(40000)
    expect(result.closingCash).toBe(173230)
    expect(result.reconciles).toBe(true)
  })

  it('does not double-count when both sources are present', () => {
    const result = buildCashFlow(
      [row('opening_cash', 'in', 10000, 'Opening balance — Bank'), ...PALLIA],
      { openingCash: 40000 },
    )
    expect(result.openingCash).toBe(50000)
    expect(result.closingCash).toBe(183230)
  })
})

describe('buyer receipts', () => {
  it('lands a receipt against an opening balance in Operating income', () => {
    // The settlement of a carried-in receivable: real farm income arriving as
    // cash, with no sale row behind it. Must reach Operating, never Financing.
    const result = buildCashFlow([...PALLIA, row('buyer_receipt', 'in', 55000, 'Receipt against old balance — Mill')])
    expect(lineIn(result, 'operating', 'other_income').amount).toBe(55000)
    expect(section(result, 'unclassified')).toBeUndefined()
    expect(result.closingCash).toBe(133230 + 55000)
    expect(result.reconciles).toBe(true)
  })
})

describe('tree_sale splits on its notes', () => {
  it('sends a timber sale to Investing', () => {
    const result = buildCashFlow([row('tree_sale', 'in', 30000, `${TIMBER_NOTE_PREFIX} — Sharma Timbers`)])
    expect(lineIn(result, 'investing', 'timber').amount).toBe(30000)
    expect(lineIn(result, 'operating', 'other_income').amount).toBe(0)
  })

  it('sends a fruit lease to Operating', () => {
    const result = buildCashFlow([row('tree_sale', 'in', 12000, 'Fruit lease — Verma')])
    expect(lineIn(result, 'operating', 'other_income').amount).toBe(12000)
    expect(lineIn(result, 'investing', 'timber').amount).toBe(0)
  })
})

describe('capital memo', () => {
  it('totals capitalised purchases and stays out of every section', () => {
    const result = buildCashFlow(PALLIA, {
      capitalPurchases: [
        { amount: 5000,  is_capitalised: true,  item_name: 'Sprayer' },
        { amount: 800,   is_capitalised: false, item_name: 'Spanner set' },
      ],
    })

    expect(result.memo.capitalBilled).toBe(5000)
    expect(result.memo.items).toHaveLength(1)
    // The memo is bills, not cash — totals must be untouched by it.
    expect(result.closingCash).toBe(133230)
    expect(section(result, 'investing').subtotal).toBe(0)
  })
})

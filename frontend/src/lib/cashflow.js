// Cash Flow statement — direct method.
//
// Design: docs/superpowers/specs/2026-08-10-cash-flow-statement-design.md
//
// Takes cash book rows and regroups them into Operating / Investing / Financing.
// Records nothing, queries nothing — every rupee here already moved and is already
// in owner_cash_entries. Pure on purpose: the classification table is the whole
// substance of the statement, and it belongs somewhere readable in one screen and
// testable without mounting a component.

// trees.js writes one entry_type for two economically different events — a fruit
// lease is farming income, felling a tree is disposing of an asset. The notes
// prefix is what tells them apart, so writer and reader share this constant
// rather than each spelling the string themselves.
export const TIMBER_NOTE_PREFIX = 'Timber sale'

// ── The three sections ────────────────────────────────────────────────────────
// `heading` is the accountant's word, `plain` is the farmer's. Showing both costs
// one line each and means a single screen serves the owner and the director.
const SECTIONS = [
  { key: 'operating',    heading: 'Operating',    plain: 'running the farm',   subtotalLabel: 'Cash from farming'   },
  { key: 'investing',    heading: 'Investing',    plain: 'things that last',   subtotalLabel: 'Cash from investing' },
  { key: 'financing',    heading: 'Financing',    plain: 'owner & lenders',    subtotalLabel: 'Cash from financing' },
  { key: 'unclassified', heading: 'Unclassified', plain: 'not recognised',     subtotalLabel: 'Unclassified cash'   },
]

// ── Display lines, in the order they appear ───────────────────────────────────
const LINES = [
  { key: 'crop_sales',     section: 'operating', label: 'Crop & cane sales'               },
  { key: 'other_income',   section: 'operating', label: 'Livestock, trees & other income'  },
  { key: 'vendors',        section: 'operating', label: 'Paid to vendors'                  },
  { key: 'labour',         section: 'operating', label: 'Labour & salaries'                },
  { key: 'other_expenses', section: 'operating', label: 'Other farm expenses'              },
  { key: 'selling_costs',  section: 'operating', label: 'Selling costs'                    },
  { key: 'timber',         section: 'investing', label: 'Timber sales'                     },
  { key: 'owner_in',       section: 'financing', label: 'Owner money brought in'           },
  { key: 'owner_out',      section: 'financing', label: 'Owner money taken out'            },
]

// ── Which line each entry_type belongs to ─────────────────────────────────────
// All 18 types the codebase can write are accounted for here or in EXCLUDED,
// except tree_sale which splits on its notes (see lineOf). Live data uses 8 of
// them; the rest are mapped so that next season's first cane sale does not land
// in Unclassified.
const LINE_OF_TYPE = {
  crop_sale:          'crop_sales',
  cane_sale:          'crop_sales',
  livestock_sale:     'other_income',
  residual_sale:      'other_income',
  revenue_receipt:    'other_income',
  buyer_receipt:      'other_income',
  vendor_payment:     'vendors',
  labour_payment:     'labour',
  salary_payment:     'labour',
  advance_payment:    'labour',
  expense_payment:    'other_expenses',
  commission_expense: 'selling_costs',
  freight_expense:    'selling_costs',
  sale_deduction:     'selling_costs',
  owner_capital:      'owner_in',
  owner_drawing:      'owner_out',
}

// Not flows into or out of the farm:
//   transfer     — money moving between the farm's own pockets; the pair nets to zero
//   opening_cash — the statement's opening line, not a movement
const EXCLUDED = new Set(['transfer', 'opening_cash'])

export const CLASSIFIED_TYPES = Object.freeze([
  ...Object.keys(LINE_OF_TYPE), 'tree_sale', ...EXCLUDED,
])

const signed = (row) => (row.direction === 'in' ? 1 : -1) * Number(row.amount || 0)

// tree_sale is the only type whose line depends on more than the type itself.
function lineOf(row) {
  if (row.entry_type !== 'tree_sale') return LINE_OF_TYPE[row.entry_type] || null
  return String(row.notes || '').startsWith(TIMBER_NOTE_PREFIX) ? 'timber' : 'other_income'
}

/**
 * Build the statement.
 *
 * @param {Array} entries      cash book rows for the period (v_cash_book shape)
 * @param {object} opts
 * @param {number} opts.openingCash        balance carried in from before the period
 * @param {Array}  opts.capitalPurchases   v_capital_purchases rows, for the memo
 * @returns {object} sections, memo, opening/closing cash, reconciliation
 */
export function buildCashFlow(entries = [], { openingCash = 0, capitalPurchases = [] } = {}) {
  // Opening cash has two sources and needs both. `openingCash` carries the balance
  // from before the period. But opening_cash entries are excluded from the three
  // sections, so any that fall INSIDE the period — always, when the filter is
  // "all time" — must be added here or closing cash comes up short by exactly the
  // opening balances. This is the one arithmetic trap in the feature.
  const openingInPeriod = entries
    .filter(r => r.entry_type === 'opening_cash')
    .reduce((s, r) => s + signed(r), 0)
  const opening = Number(openingCash || 0) + openingInPeriod

  // Group entries onto lines. Unknown types get a line of their own so they are
  // loud rather than silently folded into Operating.
  const buckets = new Map()
  const unknownLines = []

  for (const row of entries) {
    if (EXCLUDED.has(row.entry_type)) continue
    let key = lineOf(row)
    if (!key) {
      key = `unclassified:${row.entry_type}`
      if (!unknownLines.some(l => l.key === key)) {
        unknownLines.push({ key, section: 'unclassified', label: row.entry_type || '(no type)' })
      }
    }
    if (!buckets.has(key)) buckets.set(key, [])
    buckets.get(key).push(row)
  }

  const allLines = [...LINES, ...unknownLines]

  const sections = SECTIONS.map(section => {
    const lines = allLines
      .filter(l => l.section === section.key)
      .map(l => {
        const rows = buckets.get(l.key) || []
        return {
          key:     l.key,
          label:   l.label,
          amount:  rows.reduce((s, r) => s + signed(r), 0),
          entries: rows,
        }
      })
    return { ...section, lines, subtotal: lines.reduce((s, l) => s + l.amount, 0) }
  })
  // An empty Unclassified section is the normal case — drop it rather than show a
  // heading with nothing under it. The other three always show, zeros included:
  // an income line reading ₹0 is information.
  .filter(s => s.key !== 'unclassified' || s.lines.length > 0)

  const movement = sections.reduce((s, sec) => s + sec.subtotal, 0)
  const closing  = opening + movement

  // What the cash book itself says the closing balance is. If these disagree the
  // statement is wrong and says so — the badge is computed, never decorative.
  const bookClosing = opening + entries
    .filter(r => r.entry_type !== 'opening_cash')
    .reduce((s, r) => s + signed(r), 0)
  const discrepancy = Math.round((closing - bookClosing) * 100) / 100

  const capitalBilled = (capitalPurchases || [])
    .filter(c => c.is_capitalised)
    .reduce((s, c) => s + Number(c.amount || 0), 0)

  return {
    openingCash: opening,
    sections,
    memo: {
      capitalBilled,
      items: (capitalPurchases || []).filter(c => c.is_capitalised),
    },
    closingCash: closing,
    reconciles:  discrepancy === 0,
    discrepancy,
  }
}

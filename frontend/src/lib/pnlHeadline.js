// What the P&L tab's headline should CALL the difference between money in and
// money out. The owner, 3 Sep: "showing Loss as such isnt good or say right."
//
// He is correct, and it matters. His farm has spent ₹16.27L on cane and paddy
// that are still in the ground. The books show ₹0 revenue against that, and the
// old headline read "Net Loss ₹16,27,352" — but nothing has been lost. That
// money is invested in a standing crop expected to fetch ₹54L. A farm owner
// reading "loss" on a normal, healthy season learns to distrust the screen.
//
// So a shortfall is only a LOSS when there is nothing left to sell. While
// cycles are standing, the same figure is what the farm has yet to recover.
// (CLAUDE.md's standing rule: expect a large gap until cane and paddy sell —
// that is correct and must NOT be offset. This names it, it does not hide it.)

/** @param {{income: number, expenses: number, expectedAhead?: number}} p
 *  @returns {{key: 'profit'|'invested'|'loss', label: string, amount: number,
 *             tone: 'good'|'neutral'|'bad'}} */
export function pnlPosition({ income, expenses, expectedAhead = 0 }) {
  const net = Number(income || 0) - Number(expenses || 0)
  if (net >= 0)          return { key: 'profit',   label: 'Net profit',     amount: net,  tone: 'good' }
  if (expectedAhead > 0) return { key: 'invested', label: 'Yet to recover', amount: -net, tone: 'neutral' }
  return { key: 'loss', label: 'Net loss', amount: -net, tone: 'bad' }
}

/** What the cycles that have NOT sold yet still expect to fetch. A sold cycle
 *  is excluded: its money is real and already counted as income. */
export function pendingExpected(cropRows = []) {
  return cropRows.reduce((sum, r) =>
    Number(r?.revenue || 0) > 0 ? sum : sum + Number(r?.expected_revenue || 0), 0)
}

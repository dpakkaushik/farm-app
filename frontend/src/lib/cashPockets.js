// The Cash Book's two pockets.
//
// The farm keeps seven real accounts — one cash box and six partner bank
// accounts — and every cash-book row belongs to exactly one of them. But the
// owner's mental model is the classic two-column cash book: Cash in hand for
// day-to-day payments, one combined Bank figure for everything else, Move Money
// bridging the two when the box runs short. This lib folds the six banks into
// that single Bank pocket FOR DISPLAY ONLY — each row keeps its real
// account_id, so Admin → Partners and the Excel export keep full per-account
// detail.
//
// v_cash_book provides running_balance (farm-level) and account_running_balance
// (per account), but nothing per POCKET — that combined bank running figure has
// to be computed here, client-side.

/**
 * Annotate every cash-book row with its pocket ('cash' | 'bank') and an
 * all-time per-pocket running balance, mirroring account_running_balance
 * semantics (never period-rebased).
 *
 * MUST receive the FULL cash book in view order (oldest→newest), BEFORE any
 * period filter — the running figure is cumulative from row one, so feeding it
 * period rows would start a pocket from zero mid-history.
 *
 * Rows with a null or unknown account_id read as cash: pre-0028 rows carried
 * no account, and the cash box is what they historically meant.
 *
 * Pure: returns new row objects { ...row, pocket, pocket_running_balance };
 * inputs untouched.
 *
 * @param {Array} rows     full v_cash_book rows (need account_id, direction, amount)
 * @param {Array} accounts store accounts (need id, type)
 * @returns {Array}
 */
export function annotatePockets(rows = [], accounts = []) {
  const typeOf = new Map(accounts.map(a => [a.id, a.type]))
  const running = { cash: 0, bank: 0 }

  return rows.map(row => {
    const pocket = typeOf.get(row.account_id) === 'bank' ? 'bank' : 'cash'
    const signed = (row.direction === 'in' ? 1 : -1) * Number(row.amount || 0)
    running[pocket] += signed
    return { ...row, pocket, pocket_running_balance: running[pocket] }
  })
}

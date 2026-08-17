// The farm-wide money picture — whole crop cycles, no financial year.
//
// The owner's question is a farmer's question: what have I put into the crops
// standing in my fields, what have I got back so far, and what do I expect
// when they sell? A crop sown in October and sold the following June spans two
// financial years; any FY cut slices it in half and produces the confusion of
// August 2026, when ₹8,80,533 of cane cost "disappeared" into FY 2025-26 while
// the cane still stood in the field. So the Dashboard reads sowing → sale.
//
// Everything here sums raw `v_crop_pnl` rows — the same view the Ledger's crop
// tables render — so the two screens agree by construction:
//   total_cost        inputs + labour + opening cost (the view already applies
//                     the 0024 rule: an itemised breakup supersedes the lump)
//   revenue           billed, net of commission/freight/deductions
//   expected_revenue  acres × yield/acre × price/qtl from the crop master
//                     (owner-editable in Admin → Crops) + residuals

const num = (v) => Number(v) || 0

/** What a cycle is expected to bring in the end.
 *  Active cycle → max(billed so far, the estimate): a partly-sold standing crop
 *  keeps its full-harvest forecast until actual billing overtakes it.
 *  Finished cycle → what it actually earned; the estimate no longer matters. */
export const cycleExpected = (row) => {
  const revenue = num(row.revenue)
  return row.cycle_status === 'active'
    ? Math.max(revenue, num(row.expected_revenue))
    : revenue
}

/** Farm-wide totals over v_crop_pnl rows.
 *  `net` is the forward-looking number — "if the crops sell as expected" —
 *  not cash in hand today, which stays negative until harvest by design. */
export const summarizeCropPnl = (rows = []) => {
  const sum = (f) => rows.reduce((n, r) => n + f(r), 0)
  const spent       = sum(r => num(r.total_cost))
  const billed      = sum(r => num(r.revenue))
  const expected    = sum(cycleExpected)
  const openingCost = sum(r => num(r.opening_cost))
  return { spent, billed, expected, openingCost, net: expected - spent, cycles: rows.length }
}

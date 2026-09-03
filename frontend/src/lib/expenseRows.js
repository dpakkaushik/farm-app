// The Money Out list already says what it is looking at — the group is named
// "Vendor Purchases", the column is headed "Description". Repeating "Purchase
// from" on every row inside it is words the reader has to step over to reach
// the only part that identifies the entry: the vendor's name.
//
// Owner, 3 Sep: "purchase from was not required even in the current flow, it is
// unneccesary to write it … such unneccesary details are every where in app,
// remove such details from everywhere, keep a standard approch."

const LEAD = /^purchase\s+from\s+/i

/** Strip the dead lead-in from a ledger row's description. The original is kept
 *  whenever stripping would leave nothing — a blank cell is worse than a
 *  redundant one. */
export function cleanDescription(text) {
  if (!text) return ''
  if (!LEAD.test(text)) return text
  const rest = text.replace(LEAD, '')
  return rest.trim() ? rest : text
}

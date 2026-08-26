// Pure logic behind the combined filter sheet (components/FilterSheet.jsx).
//
// A screen with ONE thing to narrow by uses components/FilterSelect. A screen
// with several — Media narrows by plot, activity, year, month and sort — folds
// them into one funnel button that opens a sheet of sub-filters (the owner's
// ask, 26 Aug: "a zomato type of combined filter … when clicked sub filter
// will be seen"). Four dropdowns cost four rows of chrome above the photos;
// one button costs one, and only shows the applied ones back as chips.
//
// A GROUP is one sub-filter:
//   { key, label, options: [[value, label], …], allValue = 'all' }
// with its "everything" row included first, exactly like FilterSelect. A group
// whose default is not "all" (Sort defaults to 'newest') says so via allValue —
// it is then only counted as a filter once it moves off that default.
//
// A VALUE is a flat object keyed by group key: { plot:'…', activity:'all', … }.

export const ALL = 'all'

const allOf = (group) => group.allValue ?? ALL

const optionValues = (group) => (group.options || []).map(([v]) => v)

const valueOf = (value, group) => (value?.[group.key] ?? allOf(group))

/** Groups narrowed away from their default, in the order they were declared. */
export function activeGroups(value, groups) {
  return (groups || []).filter(g => valueOf(value, g) !== allOf(g))
}

/** How many sub-filters are applied — the number on the funnel button. */
export function activeCount(value, groups) {
  return activeGroups(value, groups).length
}

/** The label a value carries inside its group ('weeding' → 'Weeding'). */
export function valueLabel(group, v) {
  const row = (group.options || []).find(([val]) => val === v)
  return row ? row[1] : String(v ?? '')
}

/** One chip per narrowed group: what the list is showing, and how to undo it. */
export function appliedChips(value, groups) {
  return activeGroups(value, groups).map(g => ({
    key: g.key,
    label: valueLabel(g, valueOf(value, g)),
    allValue: allOf(g),
  }))
}

// A group's options can depend on another group's value — Media's months are
// the months inside the chosen year. When a change makes a value impossible,
// that group falls back to its default instead of filtering everything away.
export function sanitizeDraft(draft, groups) {
  let out = draft
  for (const g of groups || []) {
    const v = valueOf(out, g)
    if (v === allOf(g)) continue
    if (!optionValues(g).includes(v)) out = { ...out, [g.key]: allOf(g) }
  }
  return out
}

/** Every group back to its default, other keys on the value left alone. */
export function clearedValue(value, groups) {
  return (groups || []).reduce((acc, g) => ({ ...acc, [g.key]: allOf(g) }), { ...value })
}

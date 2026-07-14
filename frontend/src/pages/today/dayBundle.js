// ── Pure data-shaping logic for the Today page's day-wise activity feed ────────
// No React/JSX here — takes raw store slices + resolvers, returns a plain object
// per calendar day. Used identically for "today" and for each day in a History
// date-range fetch, so both render through the same <DayCard>.

export const ACT_EMOJI = {
  irrigation: '💧', weeding: '🌿', fertilizer: '🧪', spray: '🧴',
  pesticide: '🧴', ploughing: '🚜', sowing: '🌱', harvesting: '🌾',
  harvest: '🌾', intercultural: '🔧', crop_ops: '🌻', events: '📅', other: '📋',
}
export const ACT_COLOR = {
  irrigation: '#3b82f6', weeding: '#f97316', fertilizer: '#a855f7',
  spray: '#ef4444', pesticide: '#ef4444', ploughing: '#f59e0b',
  sowing: '#34d399', harvesting: '#1D9E75', harvest: '#1D9E75',
  intercultural: '#64748b', crop_ops: '#22c55e', events: '#ec4899', other: '#6b7280',
}

// Group same-day activities by TYPE (not plot) — merges "Plot A fertilized" and
// "Plot B fertilized" into one row listing both plots, per the owner's spec.
function buildFarmActivityRows(dayActivities, activityTypes) {
  const byType = new Map()

  for (const a of dayActivities) {
    if (!byType.has(a.type)) {
      byType.set(a.type, { plotLabels: new Set(), namedIds: new Set(), outside: 0, notes: [] })
    }
    const g = byType.get(a.type)
    if (a.plotLabel) g.plotLabels.add(a.plotLabel)
    ;(a.regularWorkerIds || []).forEach(id => g.namedIds.add(id))
    g.outside += (a.outsideLabourCount || 0)
    if (a.notes) g.notes.push(a.notes)
  }

  return [...byType.entries()].map(([type, g]) => ({
    type,
    label:              activityTypes.find(t => t.name === type)?.label || type,
    emoji:              ACT_EMOJI[type] || '📋',
    color:              ACT_COLOR[type] || '#6b7280',
    plotLabels:         [...g.plotLabels].sort(),
    namedWorkerCount:   g.namedIds.size,
    outsideWorkerCount: g.outside,
    notes:              g.notes,   // caller joins these (concatenate, per confirmed preference)
  })).sort((a, b) => a.label.localeCompare(b.label))
}

function resolveCropCycle(cropCycles, cycleId) {
  return cropCycles.find(c => c.id === cycleId) || null
}
function cropNameFor(cropMaster, cropId) {
  return cropMaster.find(c => c.id === cropId)?.name || ''
}
function plotCropLabel(cropCycles, cropMaster, cycleId) {
  const cycle = resolveCropCycle(cropCycles, cycleId)
  if (!cycle) return { plotLabel: '—', cropName: '' }
  return { plotLabel: cycle.plotLabel || '—', cropName: cropNameFor(cropMaster, cycle.cropId) }
}

function buildHarvestSalesRows(dateStr, { harvestSessions, sales, cropResiduals }, { cropCycles, cropMaster }) {
  const rows = []

  harvestSessions.filter(h => h.date === dateStr).forEach(h => {
    const { plotLabel, cropName } = plotCropLabel(cropCycles, cropMaster, h.cycleId)
    rows.push({ kind: 'harvest', plotLabel, cropName, qtyQtl: h.qtyQtl, quality: h.quality })
  })

  sales.filter(s => s.date === dateStr).forEach(s => {
    const session = harvestSessions.find(h => h.id === s.sessionId)
    const { plotLabel, cropName } = session
      ? plotCropLabel(cropCycles, cropMaster, session.cycleId)
      : { plotLabel: '—', cropName: '' }
    rows.push({ kind: 'sale', plotLabel, cropName, buyerName: s.buyerName, amount: s.netAmount, paymentStatus: s.paymentStatus })
  })

  cropResiduals.filter(r => r.saleDate === dateStr).forEach(r => {
    const { plotLabel, cropName } = plotCropLabel(cropCycles, cropMaster, r.cropCycleId)
    rows.push({ kind: 'residual', plotLabel, cropName, productName: r.productName, buyerName: r.buyerName, amount: r.actualRevenue })
  })

  return rows
}

function animalNameFor(livestockMaster, livestockId) {
  const a = livestockMaster.find(x => x.id === livestockId)
  return a ? (a.name || a.tagId) : '—'
}

function buildLivestockRows(dateStr, { livestockCountLogs, livestockRevenue }, { livestockMaster }) {
  const rows = []
  livestockCountLogs.filter(l => l.date === dateStr).forEach(l => {
    rows.push({ kind: 'count', animalName: animalNameFor(livestockMaster, l.livestockId), changeType: l.changeType, reason: l.reason, quantity: l.quantity })
  })
  livestockRevenue.filter(r => r.revenueDate === dateStr).forEach(r => {
    rows.push({ kind: 'revenue', animalName: r.livestockId ? animalNameFor(livestockMaster, r.livestockId) : null, revenueType: r.revenueType, buyerName: r.buyerName, amount: r.amount, isSale: r.isSale })
  })
  return rows
}

function workerNameFor(workerMap, id) {
  return workerMap[id] || 'Unknown'
}

function buildExpensePayrollRows(dateStr, { farmExpenses, salaryPayments, advances, labourLogs }, { workerMap }) {
  const rows = []
  farmExpenses.filter(e => e.expenseDate === dateStr).forEach(e => {
    rows.push({ kind: 'expense', category: e.category, description: e.description, amount: e.amount })
  })
  salaryPayments.filter(p => p.date === dateStr).forEach(p => {
    rows.push({ kind: 'salary', workerName: workerNameFor(workerMap, p.labourerId), amount: p.amount })
  })
  advances.filter(a => a.date === dateStr).forEach(a => {
    rows.push({ kind: 'advance', workerName: workerNameFor(workerMap, a.labourerId), reason: a.reason, amount: a.amount })
  })
  // Contractual only (no labourMasterId) — named regular/staff work-logs are already
  // represented via the Farm Activity category through the crop-activity log flow.
  labourLogs.filter(l => l.date === dateStr && !l.labourMasterId).forEach(l => {
    rows.push({ kind: 'labour', workerName: l.labourName || 'Contractual', plotLabel: l.plotLabel, purpose: l.purpose, amount: l.totalCost })
  })
  return rows
}

function buildMediaSummary(dateStr, mediaItems) {
  const dayItems = mediaItems.filter(m => m.date === dateStr)
  const plotLabels = [...new Set(dayItems.map(m => m.plotLabel).filter(Boolean))]
  return { count: dayItems.length, plotLabels, photoCount: dayItems.filter(m => m.type === 'photo').length, videoCount: dayItems.filter(m => m.type === 'video').length }
}

// Two decimals is enough for every unit the farm issues (bags, litres, kg), and
// it clears the float dust that summing them leaves behind — 0.1 + 0.2 = 0.30000000000000004.
const round2 = n => Math.round(n * 100) / 100

// One inventory_issues row per plot is correct in the database — plot-wise rows are
// what make plot-wise cost attribution possible, and they stay. But they read badly
// on the card: urea issued to six plots became six near-identical lines. So for the
// card, group by item — name once, quantity and cost combined, plots listed. This is
// a display fold only; it changes nothing about how issues are stored or costed.
function groupIssuesByItem(dayIssues, itemName) {
  const byItem = new Map()

  for (const i of dayIssues) {
    if (!byItem.has(i.itemId)) {
      byItem.set(i.itemId, { itemName: itemName(i.itemId), qty: 0, totalCost: 0, plotLabels: new Set(), purposes: new Set() })
    }
    const g = byItem.get(i.itemId)
    g.qty       += Number(i.qty)       || 0
    g.totalCost += Number(i.totalCost) || 0
    // '—' is the store's stand-in for an issue with no plot. Naming it adds nothing.
    if (i.plotLabel && i.plotLabel !== '—') g.plotLabels.add(i.plotLabel)
    if (i.purpose) g.purposes.add(i.purpose)
  }

  return [...byItem.values()]
    .map(g => ({
      itemName:   g.itemName,
      qty:        round2(g.qty),
      totalCost:  round2(g.totalCost),
      plotLabels: [...g.plotLabels].sort(),
      purposes:   [...g.purposes],
    }))
    .sort((a, b) => a.itemName.localeCompare(b.itemName))
}

function buildInventoryRows(dateStr, { purchases, issues }, { inventoryMaster }) {
  const itemName = id => inventoryMaster.find(i => i.id === id)?.name || 'Item'
  return {
    purchases: purchases.filter(p => p.date === dateStr).map(p => ({ itemName: itemName(p.itemId), qty: p.qty, vendor: p.vendor, totalCost: p.totalCost })),
    issues:    groupIssuesByItem(issues.filter(i => i.date === dateStr), itemName),
  }
}

/**
 * slices: { activities, purchases, issues, harvestSessions, sales, cropResiduals,
 *           labourLogs, advances, salaryPayments, livestockCountLogs, farmExpenses,
 *           livestockRevenue, mediaItems }
 *   `advances` should be the store's live (unrecovered-only) array for "today",
 *   or a dedicated full range fetch (recovered + unrecovered) for History.
 * resolvers: { cropCycles, cropMaster, livestockMaster, inventoryMaster, workerMap, activityTypes }
 */
export function buildDayBundle(dateStr, slices, resolvers) {
  const farmActivity    = buildFarmActivityRows(slices.activities.filter(a => a.date === dateStr), resolvers.activityTypes)
  const inventory       = buildInventoryRows(dateStr, slices, resolvers)
  const harvestSales    = buildHarvestSalesRows(dateStr, slices, resolvers)
  const livestock       = buildLivestockRows(dateStr, slices, resolvers)
  const expensesPayroll = buildExpensePayrollRows(dateStr, slices, resolvers)
  const media           = buildMediaSummary(dateStr, slices.mediaItems)

  const isEmpty =
    farmActivity.length === 0 &&
    inventory.purchases.length === 0 && inventory.issues.length === 0 &&
    harvestSales.length === 0 &&
    livestock.length === 0 &&
    expensesPayroll.length === 0 &&
    media.count === 0

  return { date: dateStr, isEmpty, farmActivity, inventory, harvestSales, livestock, expensesPayroll, media }
}

// Distinct date strings (descending) that have at least one event across any slice,
// restricted to [start, end] inclusive. Used to know which days to render in History.
export function datesInRange(slices, start, end) {
  const inRange = d => !!d && d >= start && d <= end
  const set = new Set()
  slices.activities.forEach(a => inRange(a.date) && set.add(a.date))
  slices.purchases.forEach(p => inRange(p.date) && set.add(p.date))
  slices.issues.forEach(i => inRange(i.date) && set.add(i.date))
  slices.harvestSessions.forEach(h => inRange(h.date) && set.add(h.date))
  slices.sales.forEach(s => inRange(s.date) && set.add(s.date))
  slices.cropResiduals.forEach(r => inRange(r.saleDate) && set.add(r.saleDate))
  slices.labourLogs.forEach(l => inRange(l.date) && set.add(l.date))
  slices.advances.forEach(a => inRange(a.date) && set.add(a.date))
  slices.salaryPayments.forEach(p => inRange(p.date) && set.add(p.date))
  slices.livestockCountLogs.forEach(l => inRange(l.date) && set.add(l.date))
  slices.farmExpenses.forEach(e => inRange(e.expenseDate) && set.add(e.expenseDate))
  slices.livestockRevenue.forEach(r => inRange(r.revenueDate) && set.add(r.revenueDate))
  slices.mediaItems.forEach(m => inRange(m.date) && set.add(m.date))
  return [...set].sort((a, b) => b.localeCompare(a))
}

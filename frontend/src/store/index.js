import { create } from 'zustand'
import { supabase } from '../lib/supabase'
import { groupAnchorId, shortDate } from '../lib/labourGroups'
import { useAuthStore } from './auth'

const getFarmId = () => useAuthStore.getState().activeFarmId

// ── Data mappers (Supabase column names → local field names) ──────────────────

function mapCrop(c, templates = []) {
  return {
    id:                  c.id,
    name:                c.name,
    emoji:               c.icon,
    color:               c.color,
    duration_days:       c.duration_days,
    harvest_window_days: c.harvest_window_days || 14,
    season_type:         c.season_type || null,
    pricePerQtl:         Number(c.price_per_qtl) || 0,
    yieldPerAcre:        Number(c.yield_per_acre) || 0,
    ratoonCropId:        c.ratoon_crop_id || null,
    varietyCategory:     c.variety_category || null,
    residuals:           Array.isArray(c.residuals) ? c.residuals : [],
    activities:   templates
      .filter(t => t.crop_id === c.id)
      .sort((a, b) => a.day_offset - b.day_offset)
      .map(t => ({ day: t.day_offset, type: t.activity_type, label: t.label, inputs: [] })),
  }
}

function mapResidual(r) {
  return {
    id:               r.id,
    cropCycleId:      r.crop_cycle_id,
    harvestSessionId: r.harvest_session_id,
    productName:      r.product_name,
    quantity:         Number(r.quantity) || 0,
    unit:             r.unit || 'quintal',
    expectedRate:     r.expected_rate ? Number(r.expected_rate) : null,
    expectedRevenue:  r.expected_revenue ? Number(r.expected_revenue) : null,
    status:           r.status || 'open',
    saleDate:         r.sale_date || null,
    buyerName:        r.buyer_name || null,
    actualRate:       r.actual_rate ? Number(r.actual_rate) : null,
    actualRevenue:    r.actual_revenue ? Number(r.actual_revenue) : null,
    paymentStatus:    r.payment_status || 'pending',
    notes:            r.notes || null,
    createdAt:        r.created_at,
  }
}

function mapCycle(c) {
  return {
    id:                c.id,
    plotId:            c.plot_id,
    plotLabel:         c.plots?.name || '',
    cropId:            c.crop_id,
    sowDate:           c.sow_date,
    harvestDate:       c.expected_harvest_end || null,
    actualHarvestDate: c.actual_harvest_end   || null,
    status:            c.status,
    acres:             Number(c.plots?.area_acres) || 0,
    season:            c.season,
    parentCycleId:     c.parent_cycle_id || null,
    millName:          c.mill_name   || null,
    growerCode:        c.grower_code || null,
    openingCost:       c.opening_cost != null ? Number(c.opening_cost) : null,
  }
}

function mapSession(s) {
  return {
    id:                   s.id,
    cycleId:              s.cycle_id,
    date:                 s.harvest_date,
    qtyQtl:               Number(s.quantity_kg) / 100,
    quality:              s.quality_grade || null,
    parchiNumber:         s.parchi_number || null,
    notes:                s.notes || null,
    partnerId:            s.partner_id || null,
    parchiAttachmentPath: s.parchi_attachment_path || null,
    storageLocation:      s.storage_location || null,
    moisturePct:          s.moisture_pct != null ? Number(s.moisture_pct) : null,
  }
}

function mapSale(s) {
  const gross            = Number(s.total_amount) || 0
  const qtyQtl            = Number(s.quantity_kg) / 100 || 0
  const commissionPerQtl = s.commission_per_qtl != null ? Number(s.commission_per_qtl) : null
  const commissionAmt    = commissionPerQtl != null ? Math.round(commissionPerQtl * qtyQtl) : 0
  const freight           = Number(s.freight_charges) || 0
  const payDeductions     = Number(s.deductions)       || 0
  const totalDeductions   = commissionAmt + freight + payDeductions
  return {
    id:                    s.id,
    sessionId:             s.harvest_session_id,
    cycleId:               s.cycle_id,
    date:                  s.sale_date,
    buyerName:             s.buyer_name || '',
    buyerId:               s.buyer_id || null,
    qtyQtl,
    ratePerQtl:            Number(s.rate_per_kg) * 100 || 0,
    grossAmount:           gross,
    commissionPerQtl,
    commissionAmt,
    freightCharges:        freight,
    deductions:            payDeductions,
    deductionsNote:        s.deductions_note || null,
    netAmount:             Math.max(0, gross - totalDeductions),
    paymentStatus:         s.payment_status || 'pending',
    amountReceived:        Number(s.amount_received) || 0,
    paymentDate:           s.payment_date || null,
    paymentAttachmentPath: s.payment_attachment_path || null,
  }
}

function mapBuyer(b) {
  return { id: b.id, name: b.name, address: b.address || '', contact: b.contact || '', type: b.type || 'trader', buys: b.buys || [], isActive: b.is_active,
    // `|| 0` so this still reads against a database where 0027 has not landed.
    openingBalance:     Number(b.opening_balance || 0),
    openingBalanceDate: b.opening_balance_date || null }
}

function mapPartner(p) {
  return { id: p.id, name: p.name, isActive: p.is_active }
}

function mapItem(i) {
  return {
    id:           i.id,
    name:         i.name,
    category:     i.category,
    unit:         i.unit,
    currentStock: Number(i.current_stock) || 0,
    minThreshold: Number(i.min_threshold) || 0,
    costPerUnit:  Number(i.cost_per_unit) || 0,
  }
}

function mapPurchase(p) {
  return {
    id:            p.id,
    itemId:        p.item_id,
    date:          p.purchase_date,
    invoiceDate:   p.invoice_date || null,
    entryDate:     p.entry_date || null,
    qty:           Number(p.quantity),
    unitPrice:     Number(p.unit_price),
    totalCost:     Number(p.total_cost) || Number(p.quantity) * Number(p.unit_price),
    vendor:        p.vendor_name || '',
    invoiceNo:     p.invoice_number || '',
    billImagePath: p.bill_image_path || null,
    billId:        p.bill_id || null,
    billFileUrl:   p.inventory_bills?.bill_file_url || null,
  }
}

function mapIssue(i) {
  const plotName = i.plots?.name || i.crop_cycles?.plots?.name || null
  return {
    id:          i.id,
    itemId:      i.item_id,
    cropCycleId: i.cycle_id,
    plotId:      i.plot_id || null,
    plotLabel:   plotName || (i.stage === 'farm_wide' ? 'Farm-wide' : i.stage === 'preparation' ? 'Preparation' : '—'),
    stage:       i.stage || 'active',
    date:        i.issue_date,
    qty:         Number(i.quantity),
    unitCost:    Number(i.unit_cost_at_issue || i.cost_per_unit) || 0,
    totalCost:   Number(i.total_cost) || 0,
    purpose:     i.purpose || '',
  }
}

function mapActivity(a) {
  return {
    id:                 a.id,
    cropCycleId:        a.cycle_id,
    plotId:             a.plot_id,
    plotLabel:          a.plots?.name || '',
    type:               a.activity_type,
    notes:              a.activity_name || '',
    date:               a.actual_date || a.created_at?.slice(0, 10),
    workers:            a.worker_count || 0,
    regularWorkerIds:   a.regular_worker_ids || [],
    outsideLabourCount: a.outside_labour_count || 0,
    // Ploughing only. The driver is deliberately NOT in regularWorkerIds — he is
    // salaried staff, not a daily-wage worker. See migration 0015.
    driverId:           a.driver_id    || null,
    machineryId:        a.machinery_id || null,
  }
}

function mapMediaFile(mf) {
  const isVideo  = mf.entity_type === 'farm_video'
  const bucket   = isVideo ? 'farm-videos' : 'farm-photos'

  const { data: { publicUrl } } = supabase.storage.from(bucket).getPublicUrl(mf.storage_path)

  const thumbUrl = mf.thumbnail_path
    ? supabase.storage.from(bucket).getPublicUrl(mf.thumbnail_path).data.publicUrl
    : publicUrl

  return {
    id:           mf.id,
    type:         isVideo ? 'video' : 'photo',
    plotId:       mf.plot_id || mf.entity_id,
    plotLabel:    mf.plots?.name || (mf.activity_type === 'events' ? 'Event' : ''),
    activity:     mf.activity_type || 'other',
    date:         mf.photo_date || mf.created_at?.slice(0, 10),
    caption:      mf.caption || '',
    url:          publicUrl,
    thumbnailUrl: thumbUrl,
    storagePath:  mf.storage_path,
    thumbnailPath: mf.thumbnail_path || null,
    uploadedBy:   mf.uploaded_by || 'Manager',
  }
}

function mapStaff(l) {
  return {
    id:             l.id,
    name:           l.name,
    designation:    l.designation || '',
    phone:          l.phone || '',
    monthlySalary:  Number(l.monthly_salary) || 0,
    dailyRate:      Number(l.daily_base_rate) || 0,
    monthlyHoliday: Number(l.monthly_holiday) ?? 2,
    openingBalance: Number(l.opening_balance) || 0,
    joinDate:       l.join_date || null,
    photoUrl:       l.photo_url || null,
    isActive:       l.status !== 'paused',
  }
}

function mapRegularLabourer(l) {
  return {
    id:             l.id,
    name:           l.name,
    designation:    l.designation || '',
    workType:       'Farm Worker',
    ratePerDay:     Number(l.daily_base_rate) || 400,
    phone:          l.phone || '',
    openingBalance: Number(l.opening_balance) || 0,
    joinDate:       l.join_date || null,
    photoUrl:       l.photo_url || null,
    isActive:       l.status !== 'paused',
  }
}

function mapAdvance(a) {
  return {
    id:             a.id,
    labourerId:     a.labourer_id,
    date:           a.advance_date,
    amount:         Number(a.amount),
    reason:         a.reason || '',
    isRecovered:    a.is_recovered,
    recoveryMonth:  a.recovery_month || null,
    givenBy:        a.given_by || '',
    paymentMode:    a.payment_mode || 'cash',
    attachmentUrl:  a.attachment_url || null,
  }
}

function mapSalaryPayment(p) {
  return {
    id:            p.id,
    labourerId:    p.labourer_id,
    date:          p.payment_date,
    amount:        Number(p.amount_paid),
    type:          'salary',
    notes:         p.notes || '',
    month:         p.payment_month ? String(p.payment_month).slice(0, 7) : '',
    givenBy:       p.given_by || '',
    paymentMode:   p.payment_mode || 'cash',
    attachmentUrl: p.attachment_url || null,
  }
}

function mapLabourLog(l) {
  return {
    id:           l.id,
    labourName:   l.labour_name,
    labourType:   l.labour_type || 'contractual',
    labourMasterId: l.labour_master_id || null,
    plotId:       l.plot_id,
    plotLabel:    l.plots?.name || '—',
    cropCycleId:  l.cycle_id,
    date:         l.activity_date,
    workers:      Number(l.quantity) || 0,
    ratePerDay:   Number(l.base_rate) || 0,
    totalCost:    Number(l.total_payment) || 0,
    purpose:      l.work_type || '',
    workTypeId:   l.work_type_id || null,
    contractType: l.contract_type || null,
    contractQty:  Number(l.contract_qty) || 0,
    isPaid:       l.is_paid === true,
    paidDate:     l.paid_date || null,
    paidVia:      l.paid_via  || null,
  }
}

// The bill behind a capital purchase made straight from the Assets screen. Only
// when a vendor was named — no vendor means nobody is owed and there is no
// document. Total is qty × price, the same reading a bill line has, so the
// vendor is debited the amount actually agreed.
async function createCapitalBill(data) {
  if (!data.vendorId) return null
  const qty   = Math.max(1, parseInt(data.quantity) || 1)
  const price = parseFloat(data.purchasePrice) || 0
  const { data: bill, error } = await supabase.from('inventory_bills').insert({
    farm_id:        getFarmId(),
    bill_date:      data.purchaseDate || new Date().toISOString().slice(0, 10),
    vendor_id:      data.vendorId,
    vendor_name:    data.vendorName || null,
    invoice_number: data.invoiceNo || null,
    bill_file_url:  data.billFileUrl || null,
    total_amount:   Math.round(qty * price * 100) / 100,
  }).select().single()
  if (error) throw error
  return bill
}

// billsById is optional: a machine recorded before it could carry a bill, or a
// load that ran before the bill columns existed, simply has no bill to show.
function mapMachinery(m, billsById = {}) {
  const bill = m.bill_id ? billsById[m.bill_id] : null
  return {
    id:             m.id,
    displayId:      m.display_id || '',
    name:           m.name,
    type:           m.machinery_type || '',
    make:           m.make || '',
    model:          m.model || '',
    regNo:          m.registration_no || '',
    quantity:       Number(m.quantity) || 1,
    requiresDiesel: m.requires_diesel || false,
    status:         m.status || 'in_use',
    purchaseDate:   m.purchase_date || null,
    purchasePrice:  m.purchase_price ? Number(m.purchase_price) : null,
    photoUrl:       m.photo_url || null,
    notes:          m.notes || '',
    isActive:       m.is_active !== false,
    vendorId:       m.vendor_id || null,
    billId:         m.bill_id || null,
    billFileUrl:    bill?.bill_file_url || null,
    billInvoiceNo:  bill?.invoice_number || null,
    usefulLife:     m.useful_life_years || null,
    disposalType:   m.disposal_type || null,
    disposalDate:   m.disposal_date || null,
    disposalAmount: m.disposal_amount ? Number(m.disposal_amount) : null,
    disposalBuyer:  m.disposal_buyer || null,
    disposalNotes:  m.disposal_notes || null,
  }
}

function mapFarmAsset(a, billsById = {}) {
  const bill = a.bill_id ? billsById[a.bill_id] : null
  return {
    id:            a.id,
    displayId:     a.display_id || '',
    name:          a.name,
    category:      a.category || '',
    quantity:      Number(a.quantity) || 1,
    status:        a.status || 'in_use',
    purchaseDate:  a.purchase_date || null,
    purchasePrice: a.purchase_price ? Number(a.purchase_price) : null,
    currentValue:  a.current_value ? Number(a.current_value) : null,
    photoUrl:      a.photo_url || null,
    location:      a.location || '',
    notes:         a.notes || '',
    isActive:      a.is_active !== false,
    vendorId:      a.vendor_id || null,
    billId:        a.bill_id || null,
    billFileUrl:   bill?.bill_file_url || null,
    billInvoiceNo: bill?.invoice_number || null,
    usefulLife:    a.useful_life_years || null,
    disposalType:   a.disposal_type || null,
    disposalDate:   a.disposal_date || null,
    disposalAmount: a.disposal_amount ? Number(a.disposal_amount) : null,
    disposalBuyer:  a.disposal_buyer || null,
    disposalNotes:  a.disposal_notes || null,
  }
}

function mapLivestock(l) {
  return {
    id:            l.id,
    tagId:         l.tag_id || '',
    name:          l.name || '',
    species:       l.species || l.animal_type || '',
    trackingMode:  l.tracking_mode || 'individual',
    currentCount:  l.current_count != null ? Number(l.current_count) : null,
    plotId:        l.plot_id || null,
    breed:         l.breed || '',
    gender:        l.gender || '',
    dob:           l.dob || null,
    purchaseDate:    l.purchase_date || null,
    purchasePrice:   l.purchase_price ? Number(l.purchase_price) : null,
    photoUrl:        l.photo_url || null,
    acquisitionType: l.acquisition_type || 'purchased',
    healthStatus:    l.health_status || 'healthy',
    isActive:        l.is_active !== false,
    status:          l.status || 'active',
    soldDate:        l.sold_date || null,
    notes:           l.notes || '',
  }
}

function mapFarmExpense(r) {
  return {
    id:             r.id,
    expenseDate:    r.expense_date,
    category:       r.category,
    amount:         Number(r.amount),
    description:    r.description,
    attributedTo:   r.attributed_to || 'general',
    livestockId:    r.livestock_id || null,
    paymentMode:    r.payment_mode || null,
    paidTo:         r.paid_to || null,
    attachmentPath: r.attachment_path || null,
    notes:          r.notes || null,
    createdAt:      r.created_at,
  }
}

function mapLivestockRevenue(r) {
  return {
    id:             r.id,
    livestockId:    r.livestock_id || null,
    revenueDate:    r.revenue_date,
    revenueType:    r.revenue_type,
    quantity:       r.quantity ? Number(r.quantity) : null,
    unit:           r.unit || null,
    ratePerUnit:    r.rate_per_unit ? Number(r.rate_per_unit) : null,
    amount:         Number(r.amount),
    buyerName:      r.buyer_name || null,
    paymentMode:    r.payment_mode || null,
    attachmentPath: r.attachment_path || null,
    notes:          r.notes || null,
    isSale:         r.is_sale || false,
    createdAt:      r.created_at,
  }
}

function mapCountLog(l) {
  return {
    id:           l.id,
    livestockId:  l.livestock_id,
    date:         l.log_date,
    changeType:   l.change_type,
    reason:       l.reason,
    quantity:     Number(l.quantity),
    notes:        l.notes || '',
    addedBy:      l.added_by || '',
  }
}

function mapHealthLog(h) {
  return {
    id:           h.id,
    livestockId:  h.livestock_id,
    date:         h.log_date,
    healthStatus: h.health_status || 'healthy',
    symptoms:     h.symptoms  || '',
    treatment:    h.treatment || '',
    vetName:      h.vet_name  || '',
    nextCheckup:  h.next_checkup || null,
    notes:        h.notes || '',
  }
}

// ── Map store (persisted separately for map state) ────────────────────────────
const useMapStore = create(
  (set) => ({
    // Neutral wide-India view. This is only the fallback for a farm with no saved
    // map_state — the real position comes from the farm's own centre (the onboarding
    // pin, or wherever an admin last left the map). It must NOT be any one farm's
    // coordinates, or every new farm opens on that farm's location.
    zoom: 4.2, center: [78.9629, 22.5937], bearing: 0, pitch: 0,
    setMapState: (state) => set(state),
    overlay: null,
    setOverlay: (overlay) => set({ overlay }),
    clearOverlay: () => set({ overlay: null }),
  })
)

// ── Main app store ────────────────────────────────────────────────────────────
const useAppStore = create((set, get) => ({

  // ── Global manpower settings (localStorage) ─────────────────────────────────
  manpowerSettings: (() => {
    try { return JSON.parse(localStorage.getItem('manpower_settings') || 'null') || { staffMonthlyHolidays: 2 } }
    catch { return { staffMonthlyHolidays: 2 } }
  })(),
  setManpowerSettings: (s) => {
    localStorage.setItem('manpower_settings', JSON.stringify(s))
    set({ manpowerSettings: s })
  },

  // ── Setup checklist (mid-year onboarding) ───────────────────────────────────
  // ProfileMenu sets this to force the checklist open on a farm that no longer
  // "looks un-set-up" (e.g. Pallia — live stock and cycles, but crop opening
  // costs still to enter). SetupChecklist reads it and clears it on close.
  setupChecklistOpen:  false,
  openSetupChecklist:  () => set({ setupChecklistOpen: true }),
  closeSetupChecklist: () => set({ setupChecklistOpen: false }),

  // ── State — all loaded from Supabase ────────────────────────────────────────
  plots:             [],
  cropMaster:        [],
  inventoryMaster:   [],
  permanentStaff:    [],   // sub_type = 'permanent' — monthly salary, attendance tracked
  regularLabourers:  [],   // sub_type = 'regular'   — per-day rate, attendance tracked
  contractualLabour: [],   // sub_type = 'contractual' — per-day rate, count only
  workTypes:         [],   // work_types table — admin-managed labels, no rate
  activityTypes:     [],   // activity_types table — admin-managed (system + custom)
  purchases:         [],
  issues:            [],
  labourLogs:        [],
  activities:        [],
  cropCycles:        [],
  harvestSessions:   [],
  sales:             [],
  buyers:            [],
  partners:          [],
  scrapSales:        [],
  sprayReminders:    [],
  mediaItems:        [],
  todayAttendance:   {},   // { [labourerId]: { id, status } }
  advances:          [],   // salary_advances rows
  salaryPayments:    [],   // salary_payments rows
  salaryDues:        [],   // v_salary_dues — khata balance per worker
  machineryMaster:   [],
  farmAssets:        [],
  livestockMaster:   [],
  livestockCountLogs: [],
  livestockHealthLogs: [],
  farmExpenses:      [],
  livestockRevenue:  [],
  cropResiduals:     [],
  // ── Ledger (lazy-loaded on /ledger page) ──────────────────────────────────
  vendors:           [],
  vendorPayments:    [],
  ownerCashEntries:  [],
  expensePayments:   [],
  cashBook:          [],
  vendorBalances:    [],
  capitalPurchases:  [],
  incomeLedger:      [],
  expenseLedger:     [],
  monthlySummary:    [],
  livestockPnl:      [],
  cropPnl:           [],
  loading:           false,
  initialized:       false,

  // ── Load all data from Supabase ─────────────────────────────────────────────
  loadAll: async () => {
    const farmId = getFarmId()
    if (!farmId) { set({ loading: false }); return }
    set({ loading: true })
    try {
      const [
        { data: plotsRaw },
        { data: cropsRaw },
        { data: templates },
        { data: cyclesRaw },
        { data: itemsRaw },
        { data: purchasesRaw },
        { data: issuesRaw },
        { data: activitiesRaw },
        { data: labourRaw },
        { data: labourLogsRaw },
        { data: mediaRaw },
        { data: attendanceRaw },
        { data: advancesRaw },
        { data: salaryPaymentsRaw },
        { data: workTypesRaw },
        { data: activityTypesRaw },
        { data: machineryRaw },
        { data: farmAssetsRaw },
        { data: livestockRaw },
        { data: countLogsRaw },
        { data: healthLogsRaw },
        { data: harvestSessionsRaw },
        { data: salesRaw },
        { data: buyersRaw },
        { data: partnersRaw },
        { data: farmExpensesRaw },
        { data: livestockRevenueRaw },
        { data: cropResidualsRaw },
        { data: billsRaw },
        { data: accountsRaw },
      ] = await Promise.all([
        supabase.from('plots').select('*').eq('farm_id', farmId).order('name'),
        supabase.from('crops').select('*').eq('farm_id', farmId).order('name'),
        supabase.from('crop_activity_templates').select('*').eq('farm_id', farmId).order('day_offset'),
        supabase.from('crop_cycles')
          .select('*, plots(name,area_acres), crops(name,color,icon)')
          .eq('farm_id', farmId)
          .order('created_at', { ascending: false }),
        supabase.from('inventory_items').select('*').eq('farm_id', farmId).order('category').order('name'),
        supabase.from('inventory_purchases')
          .select('*, inventory_bills(bill_file_url)')
          .eq('farm_id', farmId)
          .order('purchase_date', { ascending: false }),
        supabase.from('inventory_issues')
          .select('*, plots(name), crop_cycles(season, plots(name))')
          .eq('farm_id', farmId)
          .order('issue_date', { ascending: false }),
        supabase.from('activity_logs')
          .select('*, plots(name)')
          .eq('farm_id', farmId)
          .order('created_at', { ascending: false }),
        supabase.from('labour_master').select('*').eq('farm_id', farmId).in('status', ['active', 'paused']).order('name'),
        supabase.from('labour_logs')
          .select('*, plots(name)')
          .eq('farm_id', farmId)
          .order('activity_date', { ascending: false }),
        supabase.from('media_files')
          .select('*, plots(name)')
          .eq('farm_id', farmId)
          .in('entity_type', ['farm_photo', 'farm_video'])
          .order('created_at', { ascending: false }),
        supabase.from('attendance')
          .select('id, labour_master_id, status')
          .eq('farm_id', farmId)
          .eq('attendance_date', new Date().toISOString().slice(0, 10)),
        supabase.from('salary_advances')
          .select('*')
          .eq('farm_id', farmId)
          .eq('is_recovered', false)
          .order('advance_date', { ascending: false }),
        supabase.from('salary_payments').select('*').eq('farm_id', farmId).order('payment_date', { ascending: false }),
        supabase.from('work_types').select('*').eq('farm_id', farmId).eq('is_active', true).order('name'),
        supabase.from('activity_types').select('*').eq('farm_id', farmId).eq('is_active', true).order('sort_order'),
        supabase.from('machinery_master').select('*').eq('farm_id', farmId).eq('is_active', true).order('display_id'),
        supabase.from('farm_assets').select('*').eq('farm_id', farmId).eq('is_active', true).order('display_id'),
        supabase.from('livestock_master').select('*').eq('farm_id', farmId).eq('is_active', true).order('name'),
        supabase.from('livestock_count_logs').select('*').eq('farm_id', farmId).order('log_date', { ascending: false }),
        supabase.from('livestock_health_logs').select('*').eq('farm_id', farmId).order('log_date', { ascending: false }),
        supabase.from('harvest_sessions').select('*').eq('farm_id', farmId).order('harvest_date'),
        supabase.from('sales').select('*').eq('farm_id', farmId).order('sale_date'),
        supabase.from('buyers').select('*').eq('farm_id', farmId).eq('is_active', true).order('name'),
        supabase.from('partners').select('*').eq('farm_id', farmId).eq('is_active', true).order('name'),
        supabase.from('farm_expenses').select('*').eq('farm_id', farmId).order('expense_date', { ascending: false }),
        supabase.from('livestock_revenue').select('*').eq('farm_id', farmId).order('revenue_date', { ascending: false }),
        supabase.from('crop_residuals').select('*').eq('farm_id', farmId).order('created_at', { ascending: false }),
        // Bills are read as their own small table rather than embedded into
        // machinery/assets. An embed needs the foreign key to exist, which ties
        // the whole farm load to a migration having been applied; this does not,
        // so the app degrades to "no bill chip" instead of "no data".
        supabase.from('inventory_bills').select('id, bill_file_url, invoice_number').eq('farm_id', farmId),
        // Accounts used to arrive only with the Ledger's bundle, which meant
        // accountFor() silently returned null — and the DB trigger parked the
        // money in the DEFAULT (cash) account — for anyone who marked a cane
        // payment without ever opening the Ledger. Money routing must not
        // depend on which page was visited first.
        supabase.from('accounts').select('*').eq('farm_id', farmId).eq('is_active', true).order('created_at'),
      ])

      const tpl = templates || []
      const billsById = Object.fromEntries((billsRaw || []).map(b => [b.id, b]))
      set({
        plots:             plotsRaw || [],
        cropMaster:        (cropsRaw || []).map(c => mapCrop(c, tpl)),
        cropCycles:        (cyclesRaw || []).map(mapCycle),
        inventoryMaster:   (itemsRaw || []).map(mapItem),
        purchases:         (purchasesRaw || []).map(mapPurchase),
        issues:            (issuesRaw || []).map(mapIssue),
        activities:        (activitiesRaw || []).map(mapActivity),
        permanentStaff: (labourRaw || [])
          .filter(l => l.sub_type === 'permanent')
          .map(mapStaff),
        regularLabourers:  (labourRaw || [])
          .filter(l => l.sub_type === 'regular')
          .map(mapRegularLabourer),
        contractualLabour: (labourRaw || [])
          .filter(l => l.sub_type === 'contractual' || l.sub_type === 'seasonal')
          .map(l => ({ id: l.id, name: l.name, defaultRate: Number(l.daily_base_rate) || 400 })),
        labourLogs:        (labourLogsRaw || []).map(mapLabourLog),
        mediaItems:        (mediaRaw || []).map(mapMediaFile),
        todayAttendance:   Object.fromEntries(
          (attendanceRaw || []).map(a => [a.labour_master_id, { id: a.id, status: a.status }])
        ),
        advances:          (advancesRaw || []).map(mapAdvance),
        salaryPayments:    (salaryPaymentsRaw || []).map(mapSalaryPayment),
        workTypes:         (workTypesRaw || []).map(w => ({ id: w.id, name: w.name })),
        activityTypes:     (activityTypesRaw || []).map(a => ({ id: a.id, name: a.name, label: a.label, emoji: a.emoji, isSystem: a.is_system })),
        machineryMaster:    (machineryRaw || []).map(m => mapMachinery(m, billsById)),
        farmAssets:         (farmAssetsRaw || []).map(a => mapFarmAsset(a, billsById)),
        livestockMaster:    (livestockRaw || []).map(mapLivestock),
        livestockCountLogs: (countLogsRaw || []).map(mapCountLog),
        livestockHealthLogs:(healthLogsRaw || []).map(mapHealthLog),
        harvestSessions:    (harvestSessionsRaw || []).map(mapSession),
        sales:              (salesRaw || []).map(mapSale),
        buyers:             (buyersRaw || []).map(mapBuyer),
        partners:           (partnersRaw || []).map(mapPartner),
        farmExpenses:       (farmExpensesRaw || []).map(mapFarmExpense),
        livestockRevenue:   (livestockRevenueRaw || []).map(mapLivestockRevenue),
        cropResiduals:      (cropResidualsRaw || []).map(mapResidual),
        accounts:           accountsRaw || [],
        loading:           false,
        initialized:       true,
      })
    } catch (err) {
      console.error('loadAll error:', err)
      set({ loading: false })
    }
  },

  // ── Crop master ─────────────────────────────────────────────────────────────
  addCrop: async (crop) => {
    const farmId = getFarmId()
    const { data, error } = await supabase.from('crops').insert({
      farm_id:             farmId,
      name:                crop.name,
      icon:                crop.emoji || '🌾',
      color:               crop.color || '#dcb428',
      duration_days:       parseInt(crop.duration_days),
      harvest_window_days: parseInt(crop.harvest_window_days) || 14,
      price_per_qtl:       parseFloat(crop.pricePerQtl) || null,
      yield_per_acre:      parseFloat(crop.yieldPerAcre) || null,
      season_type:         crop.season_type || null,
      variety_category:    crop.varietyCategory || null,
      residuals:           crop.residuals || [],
    }).select().single()
    if (error) throw error
    set(s => ({ cropMaster: [...s.cropMaster, mapCrop(data)] }))
    return data
  },

  updateCrop: async (id, data) => {
    const { error } = await supabase.from('crops').update({
      name:                data.name,
      icon:                data.emoji,
      color:               data.color,
      duration_days:       parseInt(data.duration_days) || 120,
      harvest_window_days: parseInt(data.harvest_window_days) || 14,
      season_type:         data.season_type || null,
      price_per_qtl:       parseFloat(data.pricePerQtl) || null,
      yield_per_acre:      parseFloat(data.yieldPerAcre) || null,
      variety_category:    data.varietyCategory || null,
      residuals:           data.residuals || [],
    }).eq('id', id)
    if (error) throw error
    set(s => ({ cropMaster: s.cropMaster.map(c => c.id === id ? { ...c, ...data } : c) }))
  },

  // ── Harvest sessions (non-cane crops) ──────────────────────────────────────
  addHarvestSession: async (cycleId, { date, qtyQtl, quality, notes, weighingSlipPath, storageLocation, moisturePct }) => {
    const { cropMaster, cropCycles } = get()
    const qtyKg = Math.round(parseFloat(qtyQtl) * 100)
    const { data: session, error } = await supabase
      .from('harvest_sessions')
      .insert({
        farm_id:              getFarmId(),
        cycle_id:             cycleId,
        harvest_date:         date,
        quantity_kg:          qtyKg,
        quality_grade:        quality || null,
        notes:                notes || null,
        parchi_attachment_path: weighingSlipPath || null,
        storage_location:     storageLocation || null,
        moisture_pct:         moisturePct != null ? parseFloat(moisturePct) : null,
      })
      .select().single()
    if (error) throw error

    // Auto-create residual entries from crop template
    const cycle = cropCycles.find(c => c.id === cycleId)
    const crop  = cropMaster.find(c => c.id === cycle?.cropId)
    const residualDefs = crop?.residuals || []
    const acres = cycle?.acres || 0

    let newResiduals = []
    if (residualDefs.length > 0 && acres > 0) {
      const residualRows = residualDefs.map(r => ({
        farm_id:            getFarmId(),
        crop_cycle_id:      cycleId,
        harvest_session_id: session.id,
        product_name:       r.name,
        quantity:           parseFloat(r.qty_per_acre) * acres,
        unit:               r.unit || 'quintal',
        expected_rate:      parseFloat(r.expected_rate) || null,
        expected_revenue:   parseFloat(r.qty_per_acre) * acres * (parseFloat(r.expected_rate) || 0) || null,
        status:             'open',
      }))
      const { data: inserted } = await supabase.from('crop_residuals').insert(residualRows).select()
      newResiduals = (inserted || []).map(mapResidual)
    }

    set(s => ({
      harvestSessions: [...s.harvestSessions, mapSession(session)],
      cropResiduals:   [...s.cropResiduals, ...newResiduals],
    }))
    return { session: mapSession(session), residuals: newResiduals }
  },

  // ── Residual sale recording ─────────────────────────────────────────────────
  recordResidualSale: async (id, { actualRate, buyerName, saleDate, paymentStatus, notes }) => {
    const qty = get().cropResiduals.find(r => r.id === id)?.quantity || 0
    const actualRevenue = parseFloat(actualRate) * qty
    const { error } = await supabase.from('crop_residuals').update({
      status:         'sold',
      sale_date:      saleDate,
      buyer_name:     buyerName || null,
      actual_rate:    parseFloat(actualRate),
      actual_revenue: actualRevenue,
      payment_status: paymentStatus || 'pending',
      notes:          notes || null,
    }).eq('id', id)
    if (error) throw error

    // Cash only moves if the buyer actually paid; a pending residual sale is a
    // receivable, not cash.
    if ((paymentStatus || 'pending') === 'paid') {
      await get().writeCashEntry({
        entry_date: saleDate, amount: actualRevenue, direction: 'in',
        entry_type: 'residual_sale',
        notes: `Residual sale${buyerName ? ` — ${buyerName}` : ''}`, reference_id: id,
      })
    }
    set(s => ({
      cropResiduals: s.cropResiduals.map(r => r.id !== id ? r : {
        ...r, status: 'sold', saleDate, buyerName: buyerName || null,
        actualRate: parseFloat(actualRate), actualRevenue, paymentStatus: paymentStatus || 'pending', notes: notes || null,
      }),
    }))
  },

  deleteCrop: async (id) => {
    const count = get().cropCycles.filter(c => c.cropId === id && c.status === 'active').length
    if (count > 0) return { blocked: true, count }
    const { error } = await supabase.from('crops').delete().eq('id', id)
    if (error) throw error
    set(s => ({ cropMaster: s.cropMaster.filter(c => c.id !== id) }))
    return { blocked: false }
  },

  // ── Inventory master ────────────────────────────────────────────────────────
  addInventoryItem: async (item) => {
    const farmId = getFarmId()
    const { data, error } = await supabase.from('inventory_items').insert({
      farm_id:       farmId,
      name:          item.name,
      category:      item.category,
      unit:          item.unit,
      current_stock: 0,
      min_threshold: parseFloat(item.minThreshold) || 0,
      cost_per_unit: parseFloat(item.costPerUnit) || 0,
    }).select().single()
    if (error) throw error
    set(s => ({ inventoryMaster: [...s.inventoryMaster, mapItem(data)] }))
  },

  updateInventoryItem: async (id, data) => {
    const { error } = await supabase.from('inventory_items').update({
      name:          data.name,
      category:      data.category,
      unit:          data.unit,
      min_threshold: parseFloat(data.minThreshold) || 0,
      cost_per_unit: parseFloat(data.costPerUnit) || 0,
    }).eq('id', id)
    if (error) throw error
    set(s => ({ inventoryMaster: s.inventoryMaster.map(i =>
      i.id === id ? { ...i, name: data.name, category: data.category, unit: data.unit, minThreshold: parseFloat(data.minThreshold) || 0, costPerUnit: parseFloat(data.costPerUnit) || 0 } : i
    ) }))
  },

  deleteInventoryItem: async (id) => {
    const hasPurchases = get().purchases.some(p => p.itemId === id)
    const hasIssues    = get().issues.some(i => i.itemId === id)
    if (hasPurchases || hasIssues) return { blocked: true }
    const { error } = await supabase.from('inventory_items').delete().eq('id', id)
    if (error) throw error
    set(s => ({ inventoryMaster: s.inventoryMaster.filter(i => i.id !== id) }))
    return { blocked: false }
  },

  // ── Labour masters ──────────────────────────────────────────────────────────

  updateRegularLabourer: async (id, data) => {
    const { error } = await supabase.from('labour_master').update({
      name:            data.name,
      phone:           data.phone || null,
      daily_base_rate: parseFloat(data.ratePerDay) || 400,
      opening_balance: parseFloat(data.openingBalance) || 0,
    }).eq('id', id)
    if (error) throw error
    set(s => ({ regularLabourers: s.regularLabourers.map(l => l.id === id ? { ...l, ...data } : l) }))
  },

  deleteRegularLabourer: async (id) => {
    const { error } = await supabase.from('labour_master').update({ status: 'inactive' }).eq('id', id)
    if (error) throw error
    set(s => ({ regularLabourers: s.regularLabourers.filter(l => l.id !== id) }))
  },

  deactivateLabourer: async (id) => {
    const { error } = await supabase.from('labour_master').update({ status: 'paused' }).eq('id', id)
    if (error) throw error
    const pause = arr => arr.map(p => p.id === id ? { ...p, isActive: false } : p)
    set(s => ({ permanentStaff: pause(s.permanentStaff), regularLabourers: pause(s.regularLabourers) }))
  },

  reactivateLabourer: async (id) => {
    const { error } = await supabase.from('labour_master').update({ status: 'active' }).eq('id', id)
    if (error) throw error
    const activate = arr => arr.map(p => p.id === id ? { ...p, isActive: true } : p)
    set(s => ({ permanentStaff: activate(s.permanentStaff), regularLabourers: activate(s.regularLabourers) }))
  },

  addContractualLabour: async (l) => {
    const farmId = getFarmId()
    const { data, error } = await supabase.from('labour_master').insert({
      farm_id:         farmId,
      name:            l.name,
      sub_type:        'contractual',
      daily_base_rate: parseFloat(l.defaultRate) || 400,
      status:          'active',
    }).select().single()
    if (error) throw error
    set(s => ({
      contractualLabour: [...s.contractualLabour, {
        id: data.id, name: data.name, defaultRate: Number(data.daily_base_rate),
      }],
    }))
  },

  updateContractualLabour: async (id, data) => {
    const { error } = await supabase.from('labour_master').update({
      name:            data.name,
      daily_base_rate: parseFloat(data.defaultRate) || 400,
    }).eq('id', id)
    if (error) throw error
    set(s => ({ contractualLabour: s.contractualLabour.map(l => l.id === id ? { ...l, ...data } : l) }))
  },

  deleteContractualLabour: async (id) => {
    const { error } = await supabase.from('labour_master').update({ status: 'inactive' }).eq('id', id)
    if (error) throw error
    set(s => ({ contractualLabour: s.contractualLabour.filter(l => l.id !== id) }))
  },

  // ── Permanent staff ─────────────────────────────────────────────────────────
  addPermanentStaff: async (s) => {
    const farmId = getFarmId()
    const { data, error } = await supabase.from('labour_master').insert({
      farm_id:         farmId,
      name:            s.name,
      phone:           s.phone || null,
      designation:     s.designation || null,
      sub_type:        'permanent',
      monthly_salary:  parseFloat(s.monthlySalary) || 0,
      daily_base_rate: parseFloat(s.dailyRate) || 0,
      monthly_holiday: parseInt(s.monthlyHoliday) || 2,
      opening_balance: parseFloat(s.openingBalance) || 0,
      join_date:       s.joinDate || null,
      photo_url:       s.photoUrl || null,
      status:          'active',
    }).select().single()
    if (error) throw error
    set(st => ({ permanentStaff: [...st.permanentStaff, mapStaff(data)] }))
  },

  updatePermanentStaff: async (id, s) => {
    const upd = {
      name:            s.name,
      phone:           s.phone || null,
      designation:     s.designation || null,
      monthly_salary:  parseFloat(s.monthlySalary) || 0,
      daily_base_rate: parseFloat(s.dailyRate) || 0,
      monthly_holiday: parseInt(s.monthlyHoliday) || 2,
      opening_balance: parseFloat(s.openingBalance) || 0,
      join_date:       s.joinDate || null,
    }
    if (s.photoUrl !== undefined) upd.photo_url = s.photoUrl
    const { error } = await supabase.from('labour_master').update(upd).eq('id', id)
    if (error) throw error
    set(st => ({ permanentStaff: st.permanentStaff.map(p => p.id === id ? { ...p, ...s } : p) }))
  },

  deletePermanentStaff: async (id) => {
    const { error } = await supabase.from('labour_master').update({ status: 'inactive' }).eq('id', id)
    if (error) throw error
    set(st => ({ permanentStaff: st.permanentStaff.filter(p => p.id !== id) }))
  },

  addRegularLabourer: async (l) => {
    const farmId = getFarmId()
    const { data, error } = await supabase.from('labour_master').insert({
      farm_id:         farmId,
      name:            l.name,
      phone:           l.phone || null,
      sub_type:        'regular',
      daily_base_rate: parseFloat(l.ratePerDay) || 400,
      opening_balance: parseFloat(l.openingBalance) || 0,
      join_date:       l.joinDate || null,
      photo_url:       l.photoUrl || null,
      status:          'active',
    }).select().single()
    if (error) throw error
    set(s => ({ regularLabourers: [...s.regularLabourers, mapRegularLabourer(data)] }))
  },

  // ── Attendance ──────────────────────────────────────────────────────────────
  markAttendance: async (labourerId, status) => {
    const today = new Date().toISOString().slice(0, 10)
    const existing = get().todayAttendance[labourerId]
    if (existing) {
      const { error } = await supabase.from('attendance')
        .update({ status }).eq('id', existing.id)
      if (error) throw error
    } else {
      const { data, error } = await supabase.from('attendance')
        .insert({ farm_id: getFarmId(), labour_master_id: labourerId, attendance_date: today, status })
        .select('id').single()
      if (error) throw error
      set(s => ({ todayAttendance: { ...s.todayAttendance, [labourerId]: { id: data.id, status } } }))
      return
    }
    set(s => ({ todayAttendance: { ...s.todayAttendance, [labourerId]: { ...s.todayAttendance[labourerId], status } } }))
  },

  // Reload today's attendance (e.g. after date change)
  refreshTodayAttendance: async () => {
    const today = new Date().toISOString().slice(0, 10)
    const { data } = await supabase.from('attendance')
      .select('id, labour_master_id, status')
      .eq('attendance_date', today)
    set({ todayAttendance: Object.fromEntries((data || []).map(a => [a.labour_master_id, { id: a.id, status: a.status }])) })
  },

  // ── Salary advances ─────────────────────────────────────────────────────────
  // An advance is cash leaving the drawer today; the recovery happens later as a
  // smaller salary payment, which is why booking both never double-counts.
  addAdvance: async (adv) => {
    const { data, error } = await supabase.from('salary_advances').insert({
      farm_id:         getFarmId(),
      labourer_id:     adv.labourerId,
      advance_date:    adv.date,
      amount:          parseFloat(adv.amount),
      reason:          adv.reason || null,
      given_by:        adv.givenBy || null,
      payment_mode:    adv.paymentMode || 'cash',
      attachment_url:  adv.attachmentUrl || null,
    }).select().single()
    if (error) throw error

    const who = get().labourerName(adv.labourerId)
    await get().writeCashEntry({
      entry_date: adv.date, amount: parseFloat(adv.amount), direction: 'out',
      entry_type: 'advance_payment', notes: `Advance — ${who}`, reference_id: data.id,
      payment_mode: adv.paymentMode,
    })
    set(s => ({ advances: [mapAdvance(data), ...s.advances] }))
  },

  markAdvanceRecovered: async (id, recoveryMonth) => {
    const { error } = await supabase.from('salary_advances')
      .update({ is_recovered: true, recovery_month: recoveryMonth })
      .eq('id', id)
    if (error) throw error
    set(s => ({ advances: s.advances.filter(a => a.id !== id) }))
  },

  // ── Cash book helpers ───────────────────────────────────────────────────────
  // Every rupee that actually moves writes exactly one cash entry, tagged with
  // reference_id so deleting the source record can clean up after itself.
  labourerName: (id) => {
    const { permanentStaff, regularLabourers, contractualLabour } = get()
    const all = [...permanentStaff, ...regularLabourers, ...(contractualLabour || [])]
    return all.find(l => l.id === id)?.name || 'Worker'
  },

  // Which pocket a payment mode reaches into. Every payment form already asks
  // the mode; this makes the answer route the money instead of being a
  // recorded-and-ignored label — paying the mill by cheque must drain the
  // bank, not the manager's pocket. Unknown/absent mode falls to the default
  // account, which the DB-side trigger would also do; resolving it here keeps
  // the store's optimistic state honest.
  accounts: [],
  accountFor: (mode) => {
    const { accounts } = get()
    if (!accounts.length) return null   // pre-0028 database: trigger-less, column ignored
    // Matched loosely because modes arrive in several spellings — 'bank',
    // 'bank_transfer', 'cheque', 'upi' — and a miss silently drains the wrong
    // pocket, which is the exact bug this exists to kill.
    const wantBank = /bank|upi|cheque|online|neft|rtgs|account/.test((mode || '').toLowerCase())
    return (wantBank && accounts.find(a => a.type === 'bank'))
        || accounts.find(a => a.is_default)
        || accounts[0]
  },

  writeCashEntry: async ({ entry_date, amount, direction, entry_type, notes, reference_id, payment_mode, account_id }) => {
    if (!amount || amount <= 0) return
    const { data: { user } } = await supabase.auth.getUser()
    const account = account_id || get().accountFor(payment_mode)?.id || null
    const { data, error } = await supabase.from('owner_cash_entries').insert({
      farm_id: getFarmId(), entry_date, amount, direction, entry_type,
      notes: notes || null, reference_id: reference_id || null,
      account_id: account,
      created_by: user?.id || null,
    }).select().single()
    if (error) throw error
    const { data: cb } = await supabase.from('v_cash_book').select('*')
    set(s => ({ ownerCashEntries: [...s.ownerCashEntries, data], cashBook: cb || [] }))
  },

  // Owner tops up the manager, or banks the cash box: the same money changing
  // pockets. Two linked rows written by one database function so it can never
  // half-happen; nets to zero for the farm; never income, never expense.
  recordTransfer: async ({ fromAccountId, toAccountId, amount, date, notes }) => {
    const { error } = await supabase.rpc('record_transfer', {
      p_from_account: fromAccountId,
      p_to_account:   toAccountId,
      p_amount:       parseFloat(amount),
      p_date:         date,
      p_notes:        notes || null,
    })
    if (error) throw error
    const [{ data: entries }, { data: cb }] = await Promise.all([
      supabase.from('owner_cash_entries').select('*').eq('farm_id', getFarmId()).order('entry_date'),
      supabase.from('v_cash_book').select('*'),
    ])
    set({ ownerCashEntries: entries || [], cashBook: cb || [] })
  },

  // An account's opening balance — cash actually in the box, money actually in
  // the bank, on go-live day. Owner-only and logged (guard in 0028).
  setAccountOpening: async (accountId, amount, asOnDate) => {
    const { data, error } = await supabase.from('accounts').update({
      opening_balance:      parseFloat(amount) || 0,
      opening_balance_date: asOnDate || null,
    }).eq('id', accountId).select().single()
    if (error) throw error
    const { data: cb } = await supabase.from('v_cash_book').select('*')
    set(s => ({
      accounts: s.accounts.map(a => (a.id === accountId ? data : a)),
      cashBook: cb || s.cashBook,
    }))
    return data
  },

  removeCashEntriesFor: async (referenceId) => {
    const { error } = await supabase.from('owner_cash_entries').delete().eq('reference_id', referenceId)
    if (error) throw error
    const { data: cb } = await supabase.from('v_cash_book').select('*')
    set(s => ({
      ownerCashEntries: s.ownerCashEntries.filter(e => e.reference_id !== referenceId),
      cashBook: cb || [],
    }))
  },

  // ── Settle an unpaid expense row (Ledger → Expenses tab) ────────────────────
  //
  // Daily labour accrues when logged and is settled here: the logs are flagged
  // paid and the cash leaves the book on the settlement date, not the work date.
  //
  // One job, one payment. A spraying job across seven plots is seven
  // `labour_logs` rows — the pro-rata split is the only route to per-plot cost —
  // but it was a single handover of ₹6,520, so it settles as ONE cash entry.
  // `group.groupIds` is built by groupLabourRows(); a lone row arrives as a group
  // of one, so there is only this door.
  //
  // The cash entry keys back to the group's anchor log. There is no unpay path in
  // the app today; when one is built it MUST resolve the group and delete by
  // groupAnchorId(), or it reverses one seventh of a payment and strands the
  // rest. `paidVia` is now asked for rather than assumed — until 2026-08-20 this
  // hardcoded cash and silently drained the cash box however the money moved.
  markLabourGroupPaid: async (group, { paidVia = 'cash', paidDate } = {}) => {
    const ids  = group.groupIds?.length ? group.groupIds : [group.id]
    const date = paidDate || new Date().toISOString().slice(0, 10)
    const { error } = await supabase.from('labour_logs')
      .update({ is_paid: true, paid_date: date, paid_via: paidVia })
      .in('id', ids)
    if (error) throw error
    // The cash book is read on its own; without the work date a payment dated
    // the 19th says nothing about the job of the 10th it settled.
    const worked = group.entry_date && group.entry_date !== date
      ? ` · work of ${shortDate(group.entry_date)}` : ''
    await get().writeCashEntry({
      entry_date: date, amount: Number(group.amount), direction: 'out',
      entry_type: 'labour_payment', notes: group.description + worked,
      reference_id: groupAnchorId(ids),
      payment_mode: paidVia,   // matches the paid_via written above
    })
    const { data: el } = await supabase.from('v_expense_ledger').select('*').order('entry_date', { ascending: false })
    set(s => ({
      expenseLedger: el || [],
      labourLogs: s.labourLogs.map(l =>
        ids.includes(l.id) ? { ...l, isPaid: true, paidDate: date, paidVia } : l),
    }))
  },

  // ── Salary payments ─────────────────────────────────────────────────────────
  addSalaryPayment: async (p) => {
    const { data, error } = await supabase.from('salary_payments').insert({
      farm_id:        getFarmId(),
      labourer_id:    p.labourerId,
      payment_date:   p.date,
      amount_paid:    parseFloat(p.amount),
      notes:          p.notes || null,
      payment_month:  p.month ? p.month + '-01' : null,
      given_by:       p.givenBy || null,
      payment_mode:   p.paymentMode || 'cash',
      attachment_url: p.attachmentUrl || null,
      status:         'paid',
    }).select().single()
    if (error) throw error

    const who = get().labourerName(p.labourerId)
    await get().writeCashEntry({
      entry_date: p.date, amount: parseFloat(p.amount), direction: 'out',
      entry_type: 'salary_payment',
      notes: `Salary — ${who}${p.month ? ` (${p.month})` : ''}`, reference_id: data.id,
      payment_mode: p.paymentMode,
    })
    set(s => ({ salaryPayments: [mapSalaryPayment(data), ...s.salaryPayments] }))
  },

  deleteSalaryPayment: async (id) => {
    const { error } = await supabase.from('salary_payments').delete().eq('id', id)
    if (error) throw error
    await get().removeCashEntriesFor(id)
    set(s => ({ salaryPayments: s.salaryPayments.filter(p => p.id !== id) }))
  },

  // ── Staff attendance calendar ────────────────────────────────────────────────
  staffMonthAttendance: {},   // { 'YYYY-MM': { [labourerId]: { [dateStr]: {id,status} } } }
  publicHolidays: [],

  loadMonthAttendance: async (year, month) => {
    const { permanentStaff, regularLabourers } = get()
    const allTracked = [...permanentStaff, ...regularLabourers]
    if (!allTracked.length) return
    const mm        = String(month).padStart(2, '0')
    const startDate = `${year}-${mm}-01`
    const lastDay   = new Date(year, month, 0).getDate()
    const endDate   = `${year}-${mm}-${String(lastDay).padStart(2, '0')}`
    const { data }  = await supabase.from('attendance')
      .select('id, labour_master_id, attendance_date, status')
      .in('labour_master_id', allTracked.map(s => s.id))
      .gte('attendance_date', startDate)
      .lte('attendance_date', endDate)
    const byPerson = {}
    for (const rec of (data || [])) {
      if (!byPerson[rec.labour_master_id]) byPerson[rec.labour_master_id] = {}
      byPerson[rec.labour_master_id][rec.attendance_date] = { id: rec.id, status: rec.status }
    }
    const key = `${year}-${mm}`
    set(s => ({ staffMonthAttendance: { ...s.staffMonthAttendance, [key]: byPerson } }))
  },

  markAttendanceOnDate: async (labourerId, date, status) => {
    const ym      = date.slice(0, 7)
    const cur     = get().staffMonthAttendance[ym]?.[labourerId]?.[date]
    let newRec    = null
    if (status === null) {
      if (cur) await supabase.from('attendance').delete().eq('id', cur.id)
    } else if (cur) {
      await supabase.from('attendance').update({ status }).eq('id', cur.id)
      newRec = { id: cur.id, status }
    } else {
      const { data, error } = await supabase.from('attendance')
        .insert({ farm_id: getFarmId(), labour_master_id: labourerId, attendance_date: date, status })
        .select('id').single()
      if (error) throw error
      newRec = { id: data.id, status }
    }
    set(s => {
      const monthData  = { ...(s.staffMonthAttendance[ym] || {}) }
      const personData = { ...(monthData[labourerId] || {}) }
      if (status === null) delete personData[date]; else personData[date] = newRec
      monthData[labourerId] = personData
      const updated = { ...s.staffMonthAttendance, [ym]: monthData }
      // Sync today's quick attendance map if the date is today
      const today = new Date().toISOString().slice(0, 10)
      if (date === today) {
        const ta = { ...s.todayAttendance }
        if (status === null) delete ta[labourerId]; else ta[labourerId] = newRec
        return { staffMonthAttendance: updated, todayAttendance: ta }
      }
      return { staffMonthAttendance: updated }
    })
  },

  loadPublicHolidays: async () => {
    const { data } = await supabase.from('public_holidays').select('*').order('date')
    set({ publicHolidays: (data || []).map(h => ({ id: h.id, date: h.date, name: h.name })) })
  },

  addPublicHoliday: async (date, name) => {
    const { data, error } = await supabase.from('public_holidays')
      .insert({ date, name }).select().single()
    if (error) throw error
    set(s => ({ publicHolidays: [...s.publicHolidays, { id: data.id, date: data.date, name: data.name }]
      .sort((a, b) => a.date.localeCompare(b.date)) }))
  },

  deletePublicHoliday: async (id) => {
    await supabase.from('public_holidays').delete().eq('id', id)
    set(s => ({ publicHolidays: s.publicHolidays.filter(h => h.id !== id) }))
  },

  // ── Purchases — adds stock ──────────────────────────────────────────────────
  recordPurchase: async (purchase) => {
    const item     = get().inventoryMaster.find(i => i.id === purchase.itemId)
    const oldStock = item?.currentStock || 0
    const oldWAC   = item?.costPerUnit  || 0
    const newStock = oldStock + purchase.qty
    // Weighted Average Cost
    const newWAC   = newStock > 0
      ? Math.round(((oldStock * oldWAC) + (purchase.qty * purchase.unitPrice)) / newStock * 100) / 100
      : purchase.unitPrice

    const { data, error } = await supabase.from('inventory_purchases').insert({
      farm_id:         getFarmId(),
      item_id:         purchase.itemId,
      purchase_date:   purchase.date,
      invoice_date:    purchase.invoiceDate || null,
      quantity:        purchase.qty,
      unit_price:      purchase.unitPrice,
      vendor_name:     purchase.vendor || null,
      invoice_number:  purchase.invoiceNo || null,
      bill_image_path: purchase.billImagePath || null,
    }).select().single()
    if (error) throw error

    await supabase.from('inventory_items')
      .update({ current_stock: newStock, cost_per_unit: newWAC })
      .eq('id', purchase.itemId)

    set(s => ({
      purchases: [mapPurchase(data), ...s.purchases],
      inventoryMaster: s.inventoryMaster.map(i =>
        i.id === purchase.itemId ? { ...i, currentStock: newStock, costPerUnit: newWAC } : i
      ),
    }))
  },

  // ── Opening stock (mid-year onboarding) ─────────────────────────────────────
  // What's already in the store when a farm joins mid-season. Saved as ordinary
  // backdated purchases — marker invoice 'OPENING-STOCK', vendor name only (no
  // vendor id, so no payable is created) — dated the day before the current
  // financial year starts, so stock and weighted-average cost are right but
  // this season's expenses are untouched. rows: [{ itemId, qty, unitPrice }].
  //
  // An item's opening is ONE figure, not a series: restating an item replaces
  // its earlier OPENING-STOCK rows before writing the new one. That is what
  // keeps a retry after a mid-batch failure — or the owner correcting a derived
  // figure with his own count — from ever doubling a quantity or skewing the
  // weighted-average cost.
  recordOpeningStock: async (rows) => {
    // Indian FY starts 1 April; the opening date is the 31 March just before it.
    // The FY is the go-live date's when one is set — a farm entering its opening
    // stock in April for books that start 1 August must not land the rows in the
    // new FY just because today moved on.
    const glDate   = get().farmOpening?.goLiveDate
    const base     = glDate ? new Date(`${glDate}T00:00:00`) : new Date()
    const fyStart  = base.getMonth() >= 3 ? base.getFullYear() : base.getFullYear() - 1
    const date     = `${fyStart}-03-31`
    for (const r of rows) {
      const existing = get().purchases.filter(p => p.invoiceNo === 'OPENING-STOCK' && p.itemId === r.itemId)
      for (const p of existing) await get().deletePurchase(p.id)
      await get().recordPurchase({
        itemId:    r.itemId,
        qty:       r.qty,
        unitPrice: r.unitPrice,
        date,
        vendor:    'Opening balance',
        invoiceNo: 'OPENING-STOCK',
      })
    }
  },

  // ── Purchase Bill — multi-item, one bill record ─────────────────────────────
  //
  // A bill is one document, but its lines do not all belong in one register. A
  // line tagged 'machinery' or 'asset' is a thing the farm now owns, not stock
  // it will consume, so it goes to machinery_master / farm_assets carrying this
  // bill's id — which is what lets the vendor be owed the whole bill and the
  // bill image open from the machine it paid for. The bill total covers every
  // line regardless of where it landed; that total is the vendor's debit.
  recordBillPurchase: async ({ billDate, vendorId, vendor, invoiceNo, notes, billFileUrl, lineItems }) => {
    const totalAmount = lineItems.reduce((s, l) => s + l.qty * l.unitPrice, 0)

    const { data: bill, error: billErr } = await supabase
      .from('inventory_bills')
      .insert({ farm_id: getFarmId(), bill_date: billDate, vendor_id: vendorId || null, vendor_name: vendor,
                invoice_number: invoiceNo || null, notes: notes || null,
                bill_file_url: billFileUrl || null,
                total_amount: Math.round(totalAmount * 100) / 100 })
      .select().single()
    if (billErr) throw billErr

    const stockUpdates = {}
    const newPurchaseRows = []
    const newMachinery    = []
    const newAssets       = []

    // The header has to be written before its lines, because they carry its id —
    // but a line that fails then leaves a header standing for a bill that was
    // never saved. The manager sees "Save failed", retries, and leaves another.
    // That is how invoice 4017 ended up with ten empty headers worth ₹378,500,
    // harmless while the vendor balance came from lines and not harmless once it
    // comes from headers. Supabase-js has no transaction, so the header is
    // removed by hand on the way out and the original error is re-thrown.
    try {
    for (const line of lineItems.filter(l => (l.kind || 'stock') !== 'stock')) {
      // purchase_price is the unit price — v_capital_purchases reads the amount
      // as qty × price, the same way a bill line does.
      const common = {
        farm_id:        getFarmId(),
        name:           line.name,
        quantity:       Math.max(1, Math.round(line.qty)),
        status:         'in_use',
        purchase_date:  billDate,
        purchase_price: line.unitPrice,
        vendor_id:      vendorId || null,
        bill_id:        bill.id,
        notes:          invoiceNo ? `Bill #${invoiceNo}` : null,
        is_active:      true,
      }
      if (line.kind === 'machinery') {
        const { data: row, error } = await supabase.from('machinery_master')
          .insert({ ...common, machinery_type: line.subType || 'other', requires_diesel: false })
          .select().single()
        if (error) throw error
        newMachinery.push(mapMachinery(row, { [bill.id]: bill }))
      } else {
        const { data: row, error } = await supabase.from('farm_assets')
          .insert({ ...common, category: line.subType || 'equipment' })
          .select().single()
        if (error) throw error
        newAssets.push(mapFarmAsset(row, { [bill.id]: bill }))
      }
    }

    for (const line of lineItems.filter(l => (l.kind || 'stock') === 'stock')) {
      const item     = get().inventoryMaster.find(i => i.id === line.itemId)
      const oldStock = stockUpdates[line.itemId]?.newStock ?? (item?.currentStock || 0)
      const oldWAC   = stockUpdates[line.itemId]?.newWAC   ?? (item?.costPerUnit  || 0)
      const newStock = oldStock + line.qty
      const newWAC   = newStock > 0
        ? Math.round(((oldStock * oldWAC) + (line.qty * line.unitPrice)) / newStock * 100) / 100
        : line.unitPrice

      const { data: row, error: purchErr } = await supabase
        .from('inventory_purchases')
        .insert({ farm_id: getFarmId(), item_id: line.itemId, purchase_date: billDate, invoice_date: billDate,
                  quantity: line.qty, unit_price: line.unitPrice,
                  vendor_name: vendor, vendor_id: vendorId || null,
                  invoice_number: invoiceNo || null, bill_id: bill.id })
        .select().single()
      if (purchErr) throw purchErr

      await supabase.from('inventory_items')
        .update({ current_stock: newStock, cost_per_unit: newWAC })
        .eq('id', line.itemId)

      stockUpdates[line.itemId] = { newStock, newWAC }
      // mapPurchase reads the bill file off the joined inventory_bills row, which a
      // fresh insert has no way of returning — attach it so the "View bill" chip
      // appears straight away instead of only after the next full reload.
      newPurchaseRows.push({ ...row, bill_id: bill.id, inventory_bills: { bill_file_url: bill.bill_file_url } })
    }
    } catch (err) {
      // Only when the bill is genuinely empty. Once a line has been written the
      // header must stay: deleting it would leave those rows pointing at a bill
      // that no longer exists, and inventory_purchases.bill_id has no foreign
      // key to catch that. A partly saved bill keeps its full header total —
      // the vendor is owed the document — and the missing lines are visible as
      // a header that does not add up, which is a problem someone can see.
      const wroteNothing = !newPurchaseRows.length && !newMachinery.length && !newAssets.length
      if (wroteNothing) await supabase.from('inventory_bills').delete().eq('id', bill.id)
      throw err
    }

    set(s => ({
      purchases: [...newPurchaseRows.map(mapPurchase), ...s.purchases],
      machineryMaster: newMachinery.length ? [...s.machineryMaster, ...newMachinery] : s.machineryMaster,
      farmAssets:      newAssets.length    ? [...s.farmAssets,      ...newAssets]    : s.farmAssets,
      inventoryMaster: s.inventoryMaster.map(i => {
        const u = stockUpdates[i.id]
        return u ? { ...i, currentStock: u.newStock, costPerUnit: u.newWAC } : i
      }),
    }))
  },

  // ── Issue item — plot-based, WAC snapshot ───────────────────────────────────
  issueItem: async (issue) => {
    const { cropCycles } = get()
    const item = get().inventoryMaster.find(i => i.id === issue.itemId)
    const wac  = item?.costPerUnit || 0

    // Auto-resolve cycle from plot
    let cycleId = null
    let stage   = 'farm_wide'
    if (issue.plotId) {
      const activeCycle = cropCycles.find(c => c.plotId === issue.plotId && c.status === 'active')
      cycleId = activeCycle?.id || null
      stage   = activeCycle ? 'active' : 'preparation'
    }

    const totalCost = issue.qty * wac
    const { data, error } = await supabase.from('inventory_issues').insert({
      farm_id:            getFarmId(),
      item_id:            issue.itemId,
      plot_id:            issue.plotId || null,
      cycle_id:           cycleId,
      stage,
      issue_date:         issue.date,
      quantity:           issue.qty,
      cost_per_unit:      wac,
      unit_cost_at_issue: wac,
      purpose:            issue.purpose || null,
      machinery_id:       issue.machineryId || null,
    }).select('*, plots(name), crop_cycles(season, plots(name))').single()
    if (error) throw error

    const newStock = Math.max(0, (item?.currentStock || 0) - issue.qty)
    await supabase.from('inventory_items').update({ current_stock: newStock }).eq('id', issue.itemId)

    set(s => ({
      issues: [mapIssue(data), ...s.issues],
      inventoryMaster: s.inventoryMaster.map(i =>
        i.id === issue.itemId ? { ...i, currentStock: newStock } : i
      ),
    }))
  },

  deletePurchase: async (id) => {
    const purchase = get().purchases.find(p => p.id === id)
    if (!purchase) return
    const { error } = await supabase.from('inventory_purchases').delete().eq('id', id)
    if (error) throw error
    const { data: item } = await supabase.from('inventory_items').select('current_stock').eq('id', purchase.itemId).single()
    set(s => ({
      purchases: s.purchases.filter(p => p.id !== id),
      inventoryMaster: s.inventoryMaster.map(i =>
        i.id === purchase.itemId ? { ...i, currentStock: parseFloat(item?.current_stock ?? 0) } : i
      ),
    }))
  },

  deleteIssue: async (id) => {
    const issue = get().issues.find(i => i.id === id)
    if (!issue) return
    const { error } = await supabase.from('inventory_issues').delete().eq('id', id)
    if (error) throw error
    const { data: item } = await supabase.from('inventory_items').select('current_stock').eq('id', issue.itemId).single()
    set(s => ({
      issues: s.issues.filter(i => i.id !== id),
      inventoryMaster: s.inventoryMaster.map(i =>
        i.id === issue.itemId ? { ...i, currentStock: parseFloat(item?.current_stock ?? 0) } : i
      ),
    }))
  },

  // ── Labour log ──────────────────────────────────────────────────────────────
  logLabour: async (log) => {
    const { data, error } = await supabase.from('labour_logs').insert({
      farm_id:          getFarmId(),
      labour_type:      log.labourType || 'contractual',
      labour_master_id: log.labourMasterId || null,
      labour_name:      log.labourName,
      plot_id:          log.plotId || null,
      cycle_id:         log.cropCycleId || null,
      work_type:        log.purpose || 'General',
      work_type_id:     log.workTypeId || null,
      activity_date:    log.date,
      quantity:         log.workers || null,
      quantity_unit:    'workers',
      base_rate:        log.ratePerDay || null,
      total_payment:    log.totalCost || null,
      contract_type:    log.contractType || null,
      contract_qty:     log.contractQty || null,
    }).select('*, plots(name)').single()
    if (error) throw error
    set(s => ({ labourLogs: [mapLabourLog(data), ...s.labourLogs] }))
  },

  // ── Labour log — batch (multi-worker × multi-plot) ──────────────────────────
  logLabourBatch: async (logs) => {
    const farmId = getFarmId()
    const rows = logs.map(log => ({
      farm_id:          farmId,
      labour_type:      log.labourType || 'regular',
      labour_master_id: log.labourMasterId || null,
      labour_name:      log.labourName,
      plot_id:          log.plotId || null,
      cycle_id:         log.cropCycleId || null,
      work_type:        log.purpose || 'General',
      work_type_id:     log.workTypeId || null,
      activity_date:    log.date,
      quantity:         log.workers || 1,
      quantity_unit:    'workers',
      base_rate:        log.rate || null,
      total_payment:    log.totalCost || null,
      contract_type:    log.contractType || null,
      contract_qty:     log.contractQty || null,
    }))
    const { data, error } = await supabase.from('labour_logs')
      .insert(rows)
      .select('*, plots(name)')
    if (error) throw error
    set(s => ({ labourLogs: [...(data || []).map(mapLabourLog), ...s.labourLogs] }))
  },

  addWorkType: async (name) => {
    const { data, error } = await supabase.from('work_types').insert({ farm_id: getFarmId(), name }).select().single()
    if (error) throw error
    set(s => ({ workTypes: [...s.workTypes, { id: data.id, name: data.name }].sort((a,b) => a.name.localeCompare(b.name)) }))
  },

  deleteWorkType: async (id) => {
    const { error } = await supabase.from('work_types').delete().eq('id', id)
    if (error) throw error
    set(s => ({ workTypes: s.workTypes.filter(w => w.id !== id) }))
  },

  addActivityType: async ({ label, emoji }) => {
    const name = label.trim().toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '')
    const { data, error } = await supabase.from('activity_types')
      .insert({ farm_id: getFarmId(), name, label: label.trim(), emoji: emoji || '📋', is_system: false })
      .select().single()
    if (error) throw error
    set(s => ({ activityTypes: [...s.activityTypes, { id: data.id, name: data.name, label: data.label, emoji: data.emoji, isSystem: false }] }))
  },

  deleteActivityType: async (id) => {
    const { error } = await supabase.from('activity_types').update({ is_active: false }).eq('id', id)
    if (error) throw error
    set(s => ({ activityTypes: s.activityTypes.filter(a => a.id !== id) }))
  },

  // ── Assets & Machinery ──────────────────────────────────────────────────────
  disposeMachinery: async (id, disposal) => {
    const { error } = await supabase.from('machinery_master').update({
      status:          disposal.type === 'sold' ? 'sold' : 'disposed',
      is_active:       false,
      disposal_type:   disposal.type,
      disposal_date:   disposal.date,
      disposal_amount: disposal.amount ? parseFloat(disposal.amount) : null,
      disposal_buyer:  disposal.buyer || null,
      disposal_notes:  disposal.notes || null,
    }).eq('id', id)
    if (error) throw error
    set(s => ({ machineryMaster: s.machineryMaster.filter(m => m.id !== id) }))
  },

  disposeFarmAsset: async (id, disposal) => {
    const { error } = await supabase.from('farm_assets').update({
      status:          disposal.type === 'sold' ? 'sold' : 'disposed',
      is_active:       false,
      disposal_type:   disposal.type,
      disposal_date:   disposal.date,
      disposal_amount: disposal.amount ? parseFloat(disposal.amount) : null,
      disposal_buyer:  disposal.buyer || null,
      disposal_notes:  disposal.notes || null,
    }).eq('id', id)
    if (error) throw error
    set(s => ({ farmAssets: s.farmAssets.filter(a => a.id !== id) }))
  },

  addLivestockCountLog: async (log) => {
    const { data, error } = await supabase.from('livestock_count_logs').insert({
      farm_id:      getFarmId(),
      livestock_id: log.livestockId,
      log_date:     log.date,
      change_type:  log.changeType,
      reason:       log.reason,
      quantity:     log.quantity,
      notes:        log.notes || null,
      added_by:     log.addedBy || null,
    }).select().single()
    if (error) throw error

    const ADDITIVE = new Set(['add', 'opening_balance', 'birth', 'transfer_in'])
    const delta = ADDITIVE.has(log.changeType) ? log.quantity : -log.quantity
    const animal = get().livestockMaster.find(l => l.id === log.livestockId)
    const newCount = Math.max(0, (animal?.currentCount || 0) + delta)

    set(s => ({
      livestockCountLogs: [mapCountLog(data), ...s.livestockCountLogs],
      livestockMaster: s.livestockMaster.map(l =>
        l.id === log.livestockId ? { ...l, currentCount: newCount } : l
      ),
    }))
  },

  deleteLivestockLog: async (id) => {
    const log = get().livestockCountLogs.find(l => l.id === id)
    if (!log) return
    const { error } = await supabase.from('livestock_count_logs').delete().eq('id', id)
    if (error) throw error
    const { data: master } = await supabase.from('livestock_master').select('current_count').eq('id', log.livestockId).single()
    set(s => ({
      livestockCountLogs: s.livestockCountLogs.filter(l => l.id !== id),
      livestockMaster: s.livestockMaster.map(l =>
        l.id === log.livestockId ? { ...l, currentCount: master?.current_count || 0 } : l
      ),
    }))
  },

  // A tractor is bought from a dealer, not out of the fertiliser shed — so it is
  // added here, not through the Inventory bill screen. When a vendor is named,
  // the purchase gets a bill of its own so the party ledger shows one row per
  // document exactly as it does for a stock bill, and the paper can be attached
  // to it. Without a vendor this stays what it always was: a register entry for
  // something already owned or paid for in cash nobody is tracking.
  //
  // The vendor and bill keys are only sent when there is a vendor, so this still
  // works against a database where migration 0023 has not added those columns —
  // the form hides the fields there, so vendorId is never set.
  addMachinery: async (data) => {
    const bill = await createCapitalBill(data)
    const { data: row, error } = await supabase.from('machinery_master').insert({
      farm_id:         getFarmId(),
      name:            data.name,
      machinery_type:  data.type,
      make:            data.make || null,
      model:           data.model || null,
      quantity:        parseInt(data.quantity) || 1,
      requires_diesel: data.requiresDiesel || false,
      status:          'in_use',
      purchase_date:   data.purchaseDate || null,
      purchase_price:  data.purchasePrice ? parseFloat(data.purchasePrice) : null,
      notes:           data.notes || null,
      is_active:       true,
      ...(data.vendorId ? { vendor_id: data.vendorId, bill_id: bill?.id || null } : {}),
    }).select().single()
    if (error) throw error
    set(s => ({ machineryMaster: [...s.machineryMaster, mapMachinery(row, bill ? { [bill.id]: bill } : {})] }))
  },

  addFarmAsset: async (data) => {
    const bill = await createCapitalBill(data)
    const { data: row, error } = await supabase.from('farm_assets').insert({
      farm_id:        getFarmId(),
      name:           data.name,
      category:       data.category,
      quantity:       parseInt(data.quantity) || 1,
      status:         'in_use',
      purchase_date:  data.purchaseDate || null,
      purchase_price: data.purchasePrice ? parseFloat(data.purchasePrice) : null,
      notes:          data.notes || null,
      is_active:      true,
      ...(data.vendorId ? { vendor_id: data.vendorId, bill_id: bill?.id || null } : {}),
    }).select().single()
    if (error) throw error
    set(s => ({ farmAssets: [...s.farmAssets, mapFarmAsset(row, bill ? { [bill.id]: bill } : {})] }))
  },

  addLivestock: async (data) => {
    const initialCount = data.trackingMode === 'count' ? (parseInt(data.currentCount) || 0) : 0
    const { data: row, error } = await supabase.from('livestock_master').insert({
      farm_id:          getFarmId(),
      tag_id:           data.tagId || `lv-${Date.now()}`,
      name:             data.name,
      animal_type:      data.species,
      species:          data.species,
      breed:            data.breed || null,
      gender:           data.gender || null,
      dob:              data.dob || null,
      tracking_mode:    data.trackingMode || 'individual',
      current_count:    0,
      plot_id:          data.plotId || null,
      acquisition_type: data.acquisitionType || 'purchased',
      purchase_date:    data.acquisitionType !== 'born' ? (data.purchaseDate || null) : null,
      purchase_price:   data.acquisitionType !== 'born' ? (data.purchasePrice ? parseFloat(data.purchasePrice) : null) : null,
      health_status:    'healthy',
      is_active:        true,
      notes:            data.notes || null,
    }).select().single()
    if (error) throw error

    if (data.trackingMode === 'count' && initialCount > 0) {
      await supabase.from('livestock_count_logs').insert({
        farm_id:      getFarmId(),
        livestock_id: row.id,
        log_date:     data.purchaseDate || new Date().toISOString().split('T')[0],
        change_type:  'opening_balance',
        reason:       'Opening balance',
        quantity:     initialCount,
        notes:        'Initial count at setup',
      })
    }

    set(s => ({ livestockMaster: [...s.livestockMaster, mapLivestock({ ...row, current_count: initialCount })] }))
  },

  updateAssetPhoto: async (table, id, photoUrl) => {
    const { error } = await supabase.from(table).update({ photo_url: photoUrl }).eq('id', id)
    if (error) throw error
    const KEY = { machinery_master: 'machineryMaster', farm_assets: 'farmAssets', livestock_master: 'livestockMaster' }
    const k = KEY[table]
    if (k) set(s => ({ [k]: s[k].map(a => a.id === id ? { ...a, photoUrl } : a) }))
  },

  updateAssetPrice: async (table, id, price) => {
    const parsed = price ? parseFloat(price) : null
    const { error } = await supabase.from(table).update({ purchase_price: parsed }).eq('id', id)
    if (error) throw error
    const KEY = { machinery_master: 'machineryMaster', farm_assets: 'farmAssets', livestock_master: 'livestockMaster' }
    const k = KEY[table]
    if (k) set(s => ({ [k]: s[k].map(a => a.id === id ? { ...a, purchasePrice: parsed } : a) }))
  },

  updateMachinery: async (id, data) => {
    const payload = {
      name:             data.name,
      machinery_type:   data.type,
      make:             data.make || null,
      model:            data.model || null,
      quantity:         parseInt(data.quantity) || 1,
      requires_diesel:  data.requiresDiesel || false,
      status:           data.status || 'in_use',
      purchase_date:    data.purchaseDate || null,
      purchase_price:   data.purchasePrice ? parseFloat(data.purchasePrice) : null,
      notes:            data.notes || null,
    }
    const { error } = await supabase.from('machinery_master').update(payload).eq('id', id)
    if (error) throw error
    set(s => ({ machineryMaster: s.machineryMaster.map(m => m.id === id ? { ...m, name: payload.name, type: payload.machinery_type, make: payload.make, quantity: payload.quantity, requiresDiesel: payload.requires_diesel, status: payload.status, purchaseDate: payload.purchase_date, purchasePrice: payload.purchase_price, notes: payload.notes } : m) }))
  },

  updateFarmAsset: async (id, data) => {
    const payload = {
      name:           data.name,
      category:       data.category,
      quantity:       parseInt(data.quantity) || 1,
      status:         data.status || 'in_use',
      purchase_date:  data.purchaseDate || null,
      purchase_price: data.purchasePrice ? parseFloat(data.purchasePrice) : null,
      notes:          data.notes || null,
    }
    const { error } = await supabase.from('farm_assets').update(payload).eq('id', id)
    if (error) throw error
    set(s => ({ farmAssets: s.farmAssets.map(a => a.id === id ? { ...a, name: payload.name, category: payload.category, quantity: payload.quantity, status: payload.status, purchaseDate: payload.purchase_date, purchasePrice: payload.purchase_price, notes: payload.notes } : a) }))
  },

  updateLivestock: async (id, data) => {
    const payload = {
      name:             data.name,
      species:          data.species,
      animal_type:      data.species,
      gender:           data.gender || null,
      breed:            data.breed || null,
      dob:              data.dob || null,
      // health_status is deliberately absent. The vet log owns it — a visit sets it
      // and nothing else should. While the Edit form carried a health picker this
      // wrote `data.healthStatus || 'healthy'`, so saving an edit for any other
      // reason could quietly downgrade an animal that was under treatment.
      acquisition_type: data.acquisitionType || 'purchased',
      purchase_date:    data.acquisitionType !== 'born' ? (data.purchaseDate || null) : null,
      purchase_price:   data.acquisitionType !== 'born' && data.purchasePrice ? parseFloat(data.purchasePrice) : null,
      plot_id:          data.plotId || null,
      notes:            data.notes || null,
    }
    const { error } = await supabase.from('livestock_master').update(payload).eq('id', id)
    if (error) throw error
    set(s => ({ livestockMaster: s.livestockMaster.map(l => l.id === id ? { ...l, name: payload.name, species: payload.species, gender: payload.gender, breed: payload.breed, dob: payload.dob, acquisitionType: payload.acquisition_type, purchaseDate: payload.purchase_date, purchasePrice: payload.purchase_price, plotId: payload.plot_id, notes: payload.notes } : l) }))
  },

  // Close an animal's account without any money changing hands — it died, it was
  // rehomed, it was given away. Until this existed the only way to close anything
  // was to record a sale, which meant a dog that died had to be entered as sold.
  //
  // livestock_master has three columns for a close: status, sold_date and notes.
  // There is no reason column and no amount column (farm_assets has disposal_*;
  // this table does not), so the reason is appended to notes rather than
  // replacing what is already there. A close that does involve money goes through
  // addLivestockRevenue instead, which has somewhere real to put the figure.
  closeLivestock: async (id, { status, date, reason, notes }) => {
    const current = get().livestockMaster.find(l => l.id === id)
    const line    = `Closed ${date} — ${reason}${notes ? `: ${notes}` : ''}`
    const merged  = [current?.notes?.trim(), line].filter(Boolean).join('\n')

    const { error } = await supabase.from('livestock_master')
      .update({ status, sold_date: date, is_active: false, notes: merged })
      .eq('id', id)
    if (error) throw error

    set(s => ({
      livestockMaster: s.livestockMaster.map(l =>
        l.id === id ? { ...l, status, soldDate: date, isActive: false, notes: merged } : l
      ),
    }))
  },

  // ── Farm Expenses ────────────────────────────────────────────────────────────
  // `paidNow` is the question that actually matters, and it used not to be
  // asked. The form offered a payment mode — defaulting to 'cash' — which reads
  // as "I paid this in cash", but the mode was only ever a label: nothing read
  // it, and is_paid is computed from whether an expense_payments row exists. So
  // ₹100 of Dawai could sit there saying "cash" and "unpaid" at once, and the
  // cash it was paid with never left the Cash Book.
  //
  // Now a paid expense settles itself in the same save. The mode describes a
  // payment that happened rather than one imagined; an unpaid expense carries
  // no mode at all and waits in Pending for the existing Pay button.
  addFarmExpense: async (exp) => {
    const paidNow = exp.paidNow !== false
    const { data, error } = await supabase.from('farm_expenses').insert({
      farm_id:        getFarmId(),
      expense_date:   exp.expenseDate,
      category:       exp.category,
      amount:         exp.amount,
      description:    exp.description,
      attributed_to:  exp.attributedTo || 'general',
      livestock_id:   exp.livestockId || null,
      payment_mode:   paidNow ? (exp.paymentMode || 'cash') : null,
      paid_to:        exp.paidTo || null,
      attachment_path: exp.attachmentPath || null,
      notes:          exp.notes || null,
    }).select().single()
    if (error) throw error
    set(s => ({ farmExpenses: [mapFarmExpense(data), ...s.farmExpenses] }))

    // The expense is saved either way — a payment that fails must not lose the
    // record of what was spent, so this is not rolled back. It surfaces as an
    // unpaid expense, which is recoverable with the Pay button.
    if (paidNow) {
      await get().addExpensePayment({
        payment_date: exp.expenseDate,
        amount:       exp.amount,
        expense_type: 'farm_expense',
        reference_id: data.id,
        payment_mode: exp.paymentMode || 'cash',
        notes:        exp.description || 'Expense Payment',
      })
    }
    return data
  },

  deleteFarmExpense: async (id) => {
    const { error } = await supabase.from('farm_expenses').delete().eq('id', id)
    if (error) throw error
    set(s => ({ farmExpenses: s.farmExpenses.filter(e => e.id !== id) }))
  },

  // ── Livestock Revenue ────────────────────────────────────────────────────────
  addLivestockRevenue: async (rev) => {
    const { data, error } = await supabase.from('livestock_revenue').insert({
      farm_id:        getFarmId(),
      livestock_id:   rev.livestockId || null,
      revenue_date:   rev.revenueDate,
      revenue_type:   rev.revenueType,
      quantity:       rev.quantity || null,
      unit:           rev.unit || null,
      rate_per_unit:  rev.ratePerUnit || null,
      amount:         rev.amount,
      buyer_name:     rev.buyerName || null,
      payment_mode:   rev.paymentMode || null,
      attachment_path: rev.attachmentPath || null,
      notes:          rev.notes || null,
      is_sale:        rev.isSale || false,
    }).select().single()
    if (error) throw error

    // Livestock money (milk, dung, an animal sold) is cash at the gate — the
    // income view hardcodes it 'paid' — so it enters the cash book on record.
    await get().writeCashEntry({
      entry_date: rev.revenueDate, amount: Number(rev.amount), direction: 'in',
      entry_type: 'livestock_sale',
      notes: `Livestock — ${rev.revenueType || 'revenue'}${rev.buyerName ? ` — ${rev.buyerName}` : ''}`,
      reference_id: data.id,
      payment_mode: rev.paymentMode,
    })

    if (rev.isSale && rev.livestockId) {
      const today = new Date().toISOString().slice(0, 10)
      await supabase.from('livestock_master')
        .update({ status: 'sold', sold_date: rev.revenueDate || today, is_active: false })
        .eq('id', rev.livestockId)
      set(s => ({
        livestockRevenue: [mapLivestockRevenue(data), ...s.livestockRevenue],
        livestockMaster: s.livestockMaster.map(l =>
          l.id === rev.livestockId
            ? { ...l, status: 'sold', soldDate: rev.revenueDate || today, isActive: false }
            : l
        ),
      }))
    } else {
      set(s => ({ livestockRevenue: [mapLivestockRevenue(data), ...s.livestockRevenue] }))
    }
    return data
  },

  deleteLivestockRevenue: async (id) => {
    const { error } = await supabase.from('livestock_revenue').delete().eq('id', id)
    if (error) throw error
    await get().removeCashEntriesFor(id)
    set(s => ({ livestockRevenue: s.livestockRevenue.filter(r => r.id !== id) }))
  },

  // ── Livestock Health ─────────────────────────────────────────────────────────
  // A visit is the record; the animal's health_status is only ever the latest
  // visit's verdict. Writing both keeps the herd list honest without making the
  // card read from a join.
  addLivestockHealthLog: async (log) => {
    const { data, error } = await supabase.from('livestock_health_logs').insert({
      farm_id:       getFarmId(),
      livestock_id:  log.livestockId,
      log_date:      log.date,
      health_status: log.healthStatus,
      symptoms:      log.symptoms  || null,
      treatment:     log.treatment || null,
      vet_name:      log.vetName   || null,
      next_checkup:  log.nextCheckup || null,
      notes:         log.notes || null,
    }).select().single()
    if (error) throw error

    // Only a later visit may move the animal's current status backwards in time.
    const newer = get().livestockHealthLogs
      .filter(h => h.livestockId === log.livestockId)
      .some(h => h.date > log.date)
    if (!newer) {
      const { error: upErr } = await supabase.from('livestock_master')
        .update({ health_status: log.healthStatus }).eq('id', log.livestockId)
      if (upErr) throw upErr
    }

    set(s => ({
      livestockHealthLogs: [mapHealthLog(data), ...s.livestockHealthLogs]
        .sort((a, b) => (a.date < b.date ? 1 : -1)),
      livestockMaster: newer ? s.livestockMaster : s.livestockMaster.map(l =>
        l.id === log.livestockId ? { ...l, healthStatus: log.healthStatus } : l
      ),
    }))
  },

  deleteLivestockHealthLog: async (id) => {
    const { error } = await supabase.from('livestock_health_logs').delete().eq('id', id)
    if (error) throw error
    set(s => ({ livestockHealthLogs: s.livestockHealthLogs.filter(h => h.id !== id) }))
  },

  // ── Activity log ────────────────────────────────────────────────────────────
  logActivity: async (act) => {
    const isPloughing = act.type === 'ploughing'
    // A plot with no active cycle logs against no cycle. Work happens on empty
    // land — ploughing follows a harvest and precedes a sowing — so requiring a
    // cycle here silently discarded exactly the rows that mattered.
    const cycleId = act.cropCycleId || (() => {
      const cycle = get().cropCycles.find(c => c.plotId === act.plotId && c.status === 'active')
      return cycle?.id || null
    })()

    const { data, error } = await supabase.from('activity_logs').insert({
      farm_id:              getFarmId(),
      cycle_id:             cycleId,
      plot_id:              act.plotId || null,
      activity_type:        act.type,
      activity_name:        act.notes || act.label || act.type,
      actual_date:          act.date || new Date().toISOString().slice(0, 10),
      worker_count:         act.workers || 0,
      regular_worker_ids:   act.regularWorkerIds   || [],
      outside_labour_count: act.outsideLabourCount || 0,
      driver_id:            isPloughing ? (act.driverId    || null) : null,
      machinery_id:         isPloughing ? (act.machineryId || null) : null,
      status:               'done',
      notes:                act.notes || null,
    }).select('*, plots(name)').single()
    if (error) { console.error('logActivity:', error.message); return }

    set(s => ({ activities: [mapActivity(data), ...s.activities] }))
  },

  // Creates one activity record per plot
  logActivities: async (plotIds, actData) => {
    const { cropCycles, plots } = get()
    const today       = new Date().toISOString().slice(0, 10)
    const isPloughing = actData.type === 'ploughing'
    const n          = plotIds.length
    const totalOut   = actData.outsideLabourCount || 0
    const namedCount = (actData.regularWorkerIds || []).length

    // Distribute outside labour proportionally by plot area (total must equal totalOut).
    // Uses largest-remainder method so rounding never drifts.
    let outsidePerPlot = plotIds.map(() => 0)
    if (totalOut > 0 && n > 0) {
      const areas = plotIds.map(id => {
        if (id === '__all__') return 1
        return Number(plots.find(p => p.id === id)?.area_acres) || 1
      })
      const totalArea = areas.reduce((s, a) => s + a, 0)
      const exact  = areas.map(a => totalOut * a / totalArea)
      const floors = exact.map(v => Math.floor(v))
      let rem = totalOut - floors.reduce((s, v) => s + v, 0)
      exact.map((v, i) => ({ i, f: v - floors[i] }))
           .sort((a, b) => b.f - a.f)
           .slice(0, rem)
           .forEach(({ i }) => floors[i]++)
      outsidePerPlot = floors
    }

    const farmId = getFarmId()
    const rows = plotIds.map((plotId, idx) => {
      // No active cycle → cycle_id null. Fallow and harvested plots are loggable.
      const cycle   = cropCycles.find(c => c.plotId === plotId && c.status === 'active')
      const outside = outsidePerPlot[idx]
      return {
        farm_id:              farmId,
        cycle_id:             cycle?.id || null,
        plot_id:              plotId === '__all__' ? null : plotId,
        activity_type:        actData.type,
        activity_name:        actData.notes || actData.type,
        actual_date:          actData.date || today,
        worker_count:         namedCount + outside,
        regular_worker_ids:   actData.regularWorkerIds || [],
        outside_labour_count: outside,
        // Ploughing only, and never a worker: the driver is salaried staff, so he
        // stays out of regular_worker_ids and out of worker_count. See 0015.
        driver_id:            isPloughing ? (actData.driverId    || null) : null,
        machinery_id:         isPloughing ? (actData.machineryId || null) : null,
        status:               'done',
        notes:                actData.notes || null,
      }
    })

    if (!rows.length) return
    const { data, error } = await supabase.from('activity_logs').insert(rows).select('*, plots(name)')
    if (error) { console.error('logActivities:', error.message); return }
    set(s => ({ activities: [...(data || []).map(mapActivity), ...s.activities] }))
  },

  // ── Crop cycles ─────────────────────────────────────────────────────────────
  addCaneSupply: async (cycleId, { date, qtyQtl, parchiNumber, notes, sap, buyerId, partnerId, parchiAttachmentPath }) => {
    const qtyKg = Math.round(parseFloat(qtyQtl) * 100)
    const { data: session, error: e1 } = await supabase
      .from('harvest_sessions')
      .insert({ farm_id: getFarmId(), cycle_id: cycleId, harvest_date: date, quantity_kg: qtyKg, parchi_number: parchiNumber || null, notes: notes || null, partner_id: partnerId || null, parchi_attachment_path: parchiAttachmentPath || null })
      .select().single()
    if (e1) throw e1
    const buyer = buyerId ? get().buyers.find(b => b.id === buyerId) : null
    const { data: sale, error: e2 } = await supabase
      .from('sales')
      .insert({
        farm_id:            getFarmId(),
        cycle_id:           cycleId,
        harvest_session_id: session.id,
        sale_date:          date,
        buyer_id:           buyerId || null,
        buyer_name:         buyer?.name || 'Mill',
        quantity_kg:        qtyKg,
        rate_per_kg:        parseFloat(sap) / 100,
        payment_status:     'pending',
      })
      .select().single()
    if (e2) throw e2
    set(s => ({ harvestSessions: [...s.harvestSessions, mapSession(session)], sales: [...s.sales, mapSale(sale)] }))
  },

  markCanePayment: async (saleId, { paymentDate, deductions, deductionsNote, paymentAttachmentPath, paymentMode }) => {
    const { sales: allSales } = get()
    const sale = allSales.find(s => s.id === saleId)
    const ded = parseFloat(deductions) || 0
    const buyerLabel = sale?.buyerName || 'Mill'
    const { error } = await supabase.from('sales')
      .update({ payment_status: 'paid', payment_date: paymentDate, deductions: ded, deductions_note: deductionsNote || null, payment_attachment_path: paymentAttachmentPath || null })
      .eq('id', saleId)
    if (error) throw error

    // Record in cash book: gross received in, extra deduction (if any) out —
    // this was previously never written to the cash book at all.
    // The mill pays for a partner's cane into that partner's OWN account:
    // the parchi carries the partner, the partner carries the account
    // (accounts.partner_id, 0031) — this is how "when a ganna payment is
    // done they will get credits". A partner with two accounts (Vipul: main
    // + joint-primary) credits the older one, his main. No partner on the
    // parchi, or no linked account, falls back to the main bank door; the
    // deduction leaves the same account the payment arrived in.
    const { data: { user } } = await supabase.auth.getUser()
    const session = get().harvestSessions.find(h => h.id === sale?.sessionId)
    const partnerAccount = session?.partnerId
      ? get().accounts.find(a => a.partner_id === session.partnerId)
      : null
    const account = partnerAccount?.id || get().accountFor(paymentMode || 'bank')?.id || null
    const cashRows = [{
      farm_id: getFarmId(), entry_date: paymentDate, amount: sale?.grossAmount || 0,
      direction: 'in', entry_type: 'cane_sale', account_id: account,
      notes: `Cane sale — ${buyerLabel}`, created_by: user?.id || null,
    }]
    if (ded > 0) cashRows.push({
      farm_id: getFarmId(), entry_date: paymentDate, amount: ded,
      direction: 'out', entry_type: 'sale_deduction', account_id: account,
      notes: deductionsNote || `Deduction — ${buyerLabel}`, created_by: user?.id || null,
    })
    const { data: newEntries, error: cashErr } = await supabase.from('owner_cash_entries').insert(cashRows).select()
    if (cashErr) throw cashErr

    set(s => ({
      sales: s.sales.map(sale => {
        if (sale.id !== saleId) return sale
        return { ...sale, paymentStatus: 'paid', paymentDate, deductions: ded, deductionsNote: deductionsNote || null, netAmount: sale.grossAmount - ded, paymentAttachmentPath: paymentAttachmentPath || null }
      }),
      ownerCashEntries: [...s.ownerCashEntries, ...(newEntries || [])],
    }))
  },

  closeCaneHarvest: async (cycleId, confirmedParchiNos) => {
    const { harvestSessions, updateCropCycle } = get()
    const loggedNos = harvestSessions
      .filter(s => s.cycleId === cycleId && s.parchiNumber)
      .map(s => s.parchiNumber.trim())
    const confirmedSet = new Set(confirmedParchiNos.map(n => n.trim()))
    const loggedSet    = new Set(loggedNos)
    const missing = loggedNos.filter(n => !confirmedSet.has(n))
    const extra   = confirmedParchiNos.map(n => n.trim()).filter(n => !loggedSet.has(n))
    if (missing.length || extra.length) return { ok: false, missing, extra }
    const today = new Date().toISOString().slice(0, 10)
    await updateCropCycle(cycleId, { status: 'harvested', actualHarvestDate: today })
    return { ok: true }
  },

  // ── Non-cane crop sale & payment ────────────────────────────────────────────
  addCropSale: async (sessionId, { cycleId, date, buyerName, buyerId, qtyQtl, ratePerQtl, commissionPerQtl, freightCharges }) => {
    const qty  = parseFloat(qtyQtl)
    const rate = parseFloat(ratePerQtl)
    const { data: sale, error } = await supabase.from('sales').insert({
      farm_id:             getFarmId(),
      cycle_id:            cycleId,
      harvest_session_id:  sessionId,
      sale_date:           date,
      buyer_name:          buyerName,
      buyer_id:            buyerId || null,
      quantity_kg:         Math.round(qty * 100),
      rate_per_kg:         rate / 100,
      commission_per_qtl:  commissionPerQtl != null ? parseFloat(commissionPerQtl) : null,
      freight_charges:     freightCharges ? parseFloat(freightCharges) : null,
      payment_status:      'pending',
    }).select().single()
    if (error) throw error
    set(s => ({ sales: [...s.sales, mapSale(sale)] }))
    return mapSale(sale)
  },

  markCropSalePayment: async (saleId, { paymentDate, deductions, deductionsNote, paymentAttachmentPath, paymentMode }) => {
    const { sales: allSales } = get()
    const sale = allSales.find(s => s.id === saleId)
    const ded         = parseFloat(deductions) || 0
    const commissionAmt = sale?.commissionAmt   || 0
    const freight        = sale?.freightCharges || 0
    const netAmount = Math.max(0, (sale?.grossAmount || 0) - commissionAmt - freight - ded)
    const buyerLabel = sale?.buyerName || 'Buyer'

    const { error } = await supabase.from('sales').update({
      payment_status:          'paid',
      payment_date:             paymentDate,
      deductions:               ded,
      deductions_note:          deductionsNote || null,
      payment_attachment_path:  paymentAttachmentPath || null,
    }).eq('id', saleId)
    if (error) throw error

    // Record the full picture in the cash book: gross received in, then each
    // deduction (commission/freight/extra) as its own cash-out line — instead
    // of a single opaque net figure — so the cash book stays auditable.
    // Every leg lands in the account the money actually arrived in.
    const { data: { user } } = await supabase.auth.getUser()
    const account = get().accountFor(paymentMode)?.id || null
    const cashRows = [{
      farm_id:     getFarmId(),
      entry_date:  paymentDate,
      amount:      sale?.grossAmount || 0,
      direction:   'in',
      entry_type:  'crop_sale',
      account_id:  account,
      notes:       `Crop sale — ${buyerLabel}`,
      created_by:  user?.id || null,
    }]
    if (commissionAmt > 0) cashRows.push({
      farm_id: getFarmId(), entry_date: paymentDate, amount: commissionAmt,
      direction: 'out', entry_type: 'commission_expense', account_id: account,
      notes: `Commission — ${buyerLabel}`, created_by: user?.id || null,
    })
    if (freight > 0) cashRows.push({
      farm_id: getFarmId(), entry_date: paymentDate, amount: freight,
      direction: 'out', entry_type: 'freight_expense', account_id: account,
      notes: `Freight — ${buyerLabel}`, created_by: user?.id || null,
    })
    if (ded > 0) cashRows.push({
      farm_id: getFarmId(), entry_date: paymentDate, amount: ded,
      direction: 'out', entry_type: 'sale_deduction', account_id: account,
      notes: deductionsNote || `Deduction — ${buyerLabel}`, created_by: user?.id || null,
    })
    const { data: newEntries, error: cashErr } = await supabase.from('owner_cash_entries').insert(cashRows).select()
    if (cashErr) throw cashErr

    set(s => ({
      sales: s.sales.map(sl => sl.id !== saleId ? sl : {
        ...sl,
        paymentStatus:         'paid',
        paymentDate,
        deductions:            ded,
        deductionsNote:        deductionsNote || null,
        netAmount,             // gross − commission − freight − extra
        paymentAttachmentPath: paymentAttachmentPath || null,
      }),
      ownerCashEntries: [...s.ownerCashEntries, ...(newEntries || [])],
    }))
  },

  addBuyer: async ({ name, address, contact, type, buys }) => {
    const { data, error } = await supabase.from('buyers')
      .insert({ farm_id: getFarmId(), name, address: address || null, contact: contact || null, type: type || 'trader', buys: buys || [] })
      .select().single()
    if (error) throw error
    set(s => ({ buyers: [...s.buyers, mapBuyer(data)].sort((a, b) => a.name.localeCompare(b.name)) }))
    return data
  },

  updateBuyer: async (id, { name, address, contact, type, buys }) => {
    const { error } = await supabase.from('buyers')
      .update({ name, address: address || null, contact: contact || null, type: type || 'trader', buys: buys || [] })
      .eq('id', id)
    if (error) throw error
    set(s => ({ buyers: s.buyers.map(b => b.id === id ? { ...b, name, address: address || '', contact: contact || '', type: type || 'trader', buys: buys || [] } : b) }))
  },

  // What a buyer already owed the farm at go-live — a receivable with no sale
  // behind it. Owner-only and logged, enforced by the trigger in 0027.
  setBuyerOpeningBalance: async (id, amount, asOnDate) => {
    const { data, error } = await supabase.from('buyers')
      .update({
        opening_balance:      parseFloat(amount) || 0,
        opening_balance_date: asOnDate || null,
      })
      .eq('id', id).select().single()
    if (error) throw error
    set(s => ({ buyers: s.buyers.map(b => (b.id === id ? mapBuyer(data) : b)) }))
    return data
  },

  updatePartner: async (id, { name }) => {
    const { error } = await supabase.from('partners').update({ name }).eq('id', id)
    if (error) throw error
    set(s => ({ partners: s.partners.map(p => p.id === id ? { ...p, name } : p) }))
  },

  updateCaneMillInfo: async (cycleId, { millName, growerCode }) => {
    const { error } = await supabase.from('crop_cycles')
      .update({ mill_name: millName || null, grower_code: growerCode || null })
      .eq('id', cycleId)
    if (error) throw error
    set(s => ({ cropCycles: s.cropCycles.map(c => c.id === cycleId ? { ...c, millName: millName || null, growerCode: growerCode || null } : c) }))
  },

  addCropCycle: async (cycle) => {
    const { data, error } = await supabase.from('crop_cycles').insert({
      farm_id:              getFarmId(),
      plot_id:              cycle.plotId,
      crop_id:              cycle.cropId,
      season:               cycle.season,
      sow_date:             cycle.sowDate,
      expected_harvest_end: cycle.harvestDate || null,
      status:               'active',
      budget:               cycle.budget || null,
      parent_cycle_id:      cycle.parentCycleId || null,
      opening_cost:         cycle.openingCost || null,
    }).select('*, plots(name, area_acres), crops(name, color, icon)').single()
    if (error) throw error

    // Auto-link preparation issues for this plot — only those AFTER the last cycle ended
    const { cropCycles: existingCycles } = get()
    const lastCycle = existingCycles
      .filter(c => c.plotId === cycle.plotId && c.status !== 'active')
      .sort((a, b) => (b.harvestDate || b.sowDate || '').localeCompare(a.harvestDate || a.sowDate || ''))
      [0]
    const cutoffDate = lastCycle?.harvestDate || lastCycle?.sowDate || null

    let query = supabase.from('inventory_issues')
      .update({ cycle_id: data.id, stage: 'active' })
      .eq('plot_id', cycle.plotId)
      .eq('stage', 'preparation')
    if (cutoffDate) query = query.gt('issue_date', cutoffDate)
    await query

    set(s => ({
      cropCycles: [mapCycle(data), ...s.cropCycles],
      issues: s.issues.map(i => {
        if (i.plotId !== cycle.plotId || i.stage !== 'preparation') return i
        if (cutoffDate && i.date <= cutoffDate) return i
        return { ...i, cropCycleId: data.id, stage: 'active' }
      }),
    }))
    return data
  },

  updateCropCycle: async (id, data) => {
    const updates = {}
    if (data.status)             updates.status              = data.status
    if (data.actualHarvestDate)  updates.actual_harvest_end  = data.actualHarvestDate
    const { error } = await supabase.from('crop_cycles').update(updates).eq('id', id)
    if (error) throw error
    set(s => ({ cropCycles: s.cropCycles.map(c => c.id === id ? { ...c, ...data } : c) }))
  },

  // Mid-year onboarding: "spent before the app ₹" on a cycle that already
  // existed when the farm joined. v_crop_pnl adds it into the cycle's cost.
  setCycleOpeningCost: async (cycleId, amount) => {
    const openingCost = amount === null || amount === '' ? null : parseFloat(amount)
    const { error } = await supabase.from('crop_cycles')
      .update({ opening_cost: openingCost })
      .eq('id', cycleId)
    if (error) throw error
    set(s => ({ cropCycles: s.cropCycles.map(c => c.id === cycleId ? { ...c, openingCost } : c) }))
  },

  // ── Pre-app spend, itemised ─────────────────────────────────────────────────
  //
  // One number for what a crop cost before the farm joined keeps its margin
  // honest but tells a crop report nothing — every pre-app cycle lands in a
  // bucket called "unknown", and comparing it to a post-app cycle is
  // meaningless. The categories here are the ones live tracking already
  // produces (inventory_items.category plus labour), so both sides of the
  // signup date land in the same rows.
  //
  // Read lazily by the screens that show it, never in the farm load — the
  // dashboard gets the right totals from v_crop_pnl without this table, so a
  // deploy that lands before migration 0024 degrades to the single number
  // instead of breaking.
  loadOpeningCostBreakup: async (cycleId) => {
    const { data, error } = await supabase
      .from('crop_cycle_opening_costs')
      .select('category, amount, notes')
      .eq('cycle_id', cycleId)
    if (error) return null              // table not there yet — caller hides the detail
    return (data || []).map(r => ({ category: r.category, amount: Number(r.amount), notes: r.notes || '' }))
  },

  // Replaces the whole breakup for a cycle: it is a summary of past spend, not
  // a transaction log, so editing means restating it. crop_cycles.opening_cost
  // is kept equal to the sum so anything still reading the single number — and
  // any cycle whose breakup is later removed — stays correct.
  saveOpeningCostBreakup: async (cycleId, lines) => {
    const farmId = getFarmId()
    const { data: { user } } = await supabase.auth.getUser()
    const rows = (lines || [])
      .map(l => ({ category: l.category, amount: parseFloat(l.amount) || 0, notes: (l.notes || '').trim() || null }))
      .filter(l => l.amount > 0)

    const { error: delErr } = await supabase
      .from('crop_cycle_opening_costs').delete().eq('cycle_id', cycleId)
    if (delErr) throw delErr

    if (rows.length) {
      const { error } = await supabase.from('crop_cycle_opening_costs').insert(
        rows.map(r => ({ ...r, farm_id: farmId, cycle_id: cycleId, created_by: user?.id || null }))
      )
      if (error) throw error
    }

    const total = rows.reduce((s, r) => s + r.amount, 0)
    const openingCost = rows.length ? total : null
    const { error: upErr } = await supabase.from('crop_cycles')
      .update({ opening_cost: openingCost }).eq('id', cycleId)
    if (upErr) throw upErr

    set(s => ({ cropCycles: s.cropCycles.map(c => c.id === cycleId ? { ...c, openingCost } : c) }))
    return openingCost
  },

  addPlot: async (data) => {
    const { data: row, error } = await supabase.from('plots').insert({
      farm_id:     getFarmId(),
      name:        data.name,
      area_acres:  parseFloat(data.area_acres) || 0,
      soil_type:   data.soil_type || null,
      water_source: data.water_source || null,
      status:      'active',
      point_a_lat: parseFloat(data.point_a_lat) || null,
      point_a_lng: parseFloat(data.point_a_lng) || null,
      point_b_lat: parseFloat(data.point_b_lat) || null,
      point_b_lng: parseFloat(data.point_b_lng) || null,
      point_c_lat: parseFloat(data.point_c_lat) || null,
      point_c_lng: parseFloat(data.point_c_lng) || null,
      point_d_lat: parseFloat(data.point_d_lat) || null,
      point_d_lng: parseFloat(data.point_d_lng) || null,
    }).select().single()
    if (error) throw error
    set(s => ({ plots: [...s.plots, row].sort((a, b) => (a.name || '').localeCompare(b.name || '')) }))
    return row
  },

  updatePlot: async (id, data) => {
    const allowed = ['name','area_acres','soil_type','water_source',
      'point_a_lat','point_a_lng','point_b_lat','point_b_lng',
      'point_c_lat','point_c_lng','point_d_lat','point_d_lng','geo_polygon']
    const updates = Object.fromEntries(
      Object.entries(data).filter(([k]) => allowed.includes(k))
    )
    const { error } = await supabase.from('plots').update(updates).eq('id', id)
    if (error) throw error
    set(s => ({ plots: s.plots.map(p => p.id === id ? { ...p, ...updates } : p) }))
  },

  deletePlot: async (id) => {
    const hasCycles = get().cropCycles.some(c => c.plotId === id)
    if (hasCycles) return { blocked: true }
    const { error } = await supabase.from('plots').delete().eq('id', id)
    if (error) throw error
    set(s => ({ plots: s.plots.filter(p => p.id !== id) }))
    return { blocked: false }
  },

  // ── Spray reminders (local only) ────────────────────────────────────────────
  addSprayReminder:    (r)  => set(s => ({ sprayReminders: [{ ...r, id: 'sr' + Date.now(), done: false }, ...s.sprayReminders] })),
  dismissSprayReminder:(id) => set(s => ({ sprayReminders: s.sprayReminders.map(r => r.id === id ? { ...r, done: true } : r) })),

  // ── Scrap sales (local only — no DB table yet) ──────────────────────────────
  addScrapSale: (sale) => set(s => ({ scrapSales: [{ ...sale, id: 'sc' + Date.now() }, ...s.scrapSales] })),

  // ── Media ───────────────────────────────────────────────────────────────────
  addMediaItem: async (item) => {
    const isVideo = item.type === 'video'
    const { data, error } = await supabase.from('media_files').insert({
      farm_id:        getFarmId(),
      entity_type:    isVideo ? 'farm_video' : 'farm_photo',
      entity_id:      item.plotId,
      file_type:      isVideo ? 'video' : 'image',
      storage_path:   item.storagePath,
      thumbnail_path: item.thumbnailPath || null,
      original_name:  item.caption || null,
      mime_type:      isVideo ? 'video/mp4' : 'image/jpeg',
      uploaded_by:    item.uploadedBy || 'Manager',
      plot_id:        item.plotId,
      activity_type:  item.activity,
      caption:        item.caption || null,
      photo_date:     item.date,
    }).select().single()
    if (error) throw error
    set(s => ({ mediaItems: [{ ...item, id: data.id }, ...s.mediaItems] }))
  },

  // ── Ledger ──────────────────────────────────────────────────────────────────

  // Accounts plus the cash book, alone — enough for any screen that shows
  // account balances (Admin's partner list) without paying for the Ledger's
  // full bundle.
  loadAccountBalances: async () => {
    const farmId = getFarmId()
    if (!farmId) return
    const [{ data: acc }, { data: cb }] = await Promise.all([
      supabase.from('accounts').select('*').eq('farm_id', farmId).eq('is_active', true).order('created_at'),
      supabase.from('v_cash_book').select('*'),
    ])
    set({ accounts: acc || [], cashBook: cb || [] })
  },

  // The Dashboard's farm-wide cards read v_crop_pnl — the same rows the
  // Ledger's crop tables render, so the two screens agree by construction.
  // The Dashboard needs only this one view, not the Ledger's full bundle.
  loadCropPnl: async () => {
    const farmId = getFarmId()
    if (!farmId) return
    const { data } = await supabase.from('v_crop_pnl').select('*').eq('farm_id', farmId)
    set({ cropPnl: data || [] })
  },

  loadLedgerData: async () => {
    const farmId = getFarmId()
    if (!farmId) return
    const [
      { data: vendorsRaw },
      { data: vendorPaymentsRaw },
      { data: ownerCashRaw },
      { data: expPaymentsRaw },
      { data: cashBookRaw },
      { data: vendorBalancesRaw },
      { data: capitalRaw },
      { data: incomeRaw },
      { data: expenseRaw },
      { data: monthlyRaw },
      { data: livestockPnlRaw },
      { data: cropPnlRaw },
      { data: salaryDuesRaw },
      { data: accountsRaw },
    ] = await Promise.all([
      supabase.from('vendors').select('*').eq('farm_id', farmId).order('name'),
      supabase.from('vendor_payments').select('*, vendors(name)').eq('farm_id', farmId).order('payment_date', { ascending: false }),
      supabase.from('owner_cash_entries').select('*').eq('farm_id', farmId).order('entry_date'),
      supabase.from('expense_payments').select('*').eq('farm_id', farmId).order('payment_date', { ascending: false }),
      supabase.from('v_cash_book').select('*'),
      supabase.from('v_vendor_balances').select('*'),
      supabase.from('v_capital_purchases').select('*').order('purchase_date', { ascending: false }),
      supabase.from('v_income_ledger').select('*').order('entry_date', { ascending: false }),
      supabase.from('v_expense_ledger').select('*').order('entry_date', { ascending: false }),
      supabase.from('v_monthly_summary').select('*'),
      supabase.from('v_livestock_pnl').select('*').eq('farm_id', farmId),
      supabase.from('v_crop_pnl').select('*').eq('farm_id', farmId),
      supabase.from('v_salary_dues').select('*'),
      supabase.from('accounts').select('*').eq('farm_id', farmId).eq('is_active', true).order('created_at'),
    ])
    set({
      salaryDues:       salaryDuesRaw       || [],
      accounts:         accountsRaw         || [],
      vendors:          vendorsRaw          || [],
      vendorPayments:   vendorPaymentsRaw   || [],
      ownerCashEntries: ownerCashRaw        || [],
      expensePayments:  expPaymentsRaw      || [],
      cashBook:         cashBookRaw         || [],
      vendorBalances:   vendorBalancesRaw   || [],
      capitalPurchases: capitalRaw          || [],
      incomeLedger:     incomeRaw           || [],
      expenseLedger:    expenseRaw          || [],
      monthlySummary:   monthlyRaw          || [],
      livestockPnl:     livestockPnlRaw     || [],
      cropPnl:          cropPnlRaw          || [],
    })
  },

  // A party's opening balance is what the farm already owed it on the day the
  // app started — five bills of Ankur's that predate every bill the app can
  // hold. It is a debit with no document behind it, so it is stored on the
  // vendor rather than faked as a purchase: back-entering those bills would
  // re-add stock consumed months ago and fight the physical count.
  addVendor: async (vendor) => {
    const { data, error } = await supabase.from('vendors').insert({
      farm_id:     getFarmId(),
      name:        vendor.name.trim(),
      category:    vendor.category || 'other',
      phone:       vendor.phone    || null,
      address:     vendor.address  || null,
      credit_days: parseInt(vendor.credit_days) || 0,
      opening_balance:      parseFloat(vendor.opening_balance) || 0,
      opening_balance_date: vendor.opening_balance_date || null,
    }).select().single()
    if (error) throw error
    set(s => ({ vendors: [...s.vendors, data].sort((a,b) => a.name.localeCompare(b.name)) }))
    return data
  },

  // ── Go-live: the farm's own opening figures ─────────────────────────────────
  //
  // Read straight off `farms` rather than through the memberships query in
  // auth.js. That query is load-bearing — a `capex_threshold` column added to
  // its select once made PostgREST reject the whole thing, the error was
  // swallowed, and every existing member was shown the "create your first farm"
  // wizard (fixed in faf795e). It does not get touched again for this.
  //
  // Degrades to nulls if 0027 has not landed, so the checklist hides the row
  // rather than the page failing.
  farmOpening: null,

  loadFarmOpening: async () => {
    const farmId = getFarmId()
    if (!farmId) return null
    const { data, error } = await supabase.from('farms')
      .select('go_live_date, opening_cash, opening_cash_date')
      .eq('id', farmId).single()
    if (error) { set({ farmOpening: null }); return null }
    const mapped = {
      goLiveDate:      data.go_live_date || null,
      openingCash:     Number(data.opening_cash || 0),
      openingCashDate: data.opening_cash_date || null,
    }
    set({ farmOpening: mapped })
    return mapped
  },

  // Owner-only and logged — enforced by guard_founding_figures() in 0027.
  setFarmOpening: async ({ openingCash, openingCashDate, goLiveDate }) => {
    const farmId = getFarmId()
    if (!farmId) throw new Error('No active farm')
    const { error } = await supabase.from('farms').update({
      opening_cash:      parseFloat(openingCash) || 0,
      opening_cash_date: openingCashDate || null,
      go_live_date:      goLiveDate || null,
    }).eq('id', farmId)
    if (error) throw error
    const { data: cb } = await supabase.from('v_cash_book').select('*')
    set(s => ({
      farmOpening: {
        openingCash: parseFloat(openingCash) || 0,
        openingCashDate: openingCashDate || null,
        goLiveDate: goLiveDate || null,
      },
      cashBook: cb || s.cashBook,
    }))
  },

  // ── Go-live conversion ───────────────────────────────────────────────────────
  // A farm that backfilled history re-baselines as a fresh mid-year signup:
  // every position folds into its opening slot, settled pre-cutover rows are
  // archived and deleted, open items survive. All the arithmetic and all the
  // safety (archive first, balance invariants, one-shot) live in the database
  // functions from migration 0030 — these are thin doors.
  goLivePreview: async (cutover) => {
    const { data, error } = await supabase.rpc('go_live_preview', {
      p_farm_id: getFarmId(), p_cutover: cutover,
    })
    if (error) throw error
    return data
  },

  goLiveConvert: async (cutover) => {
    const { data, error } = await supabase.rpc('go_live_convert', {
      p_farm_id: getFarmId(), p_cutover: cutover,
    })
    if (error) throw error
    // Every book changed shape — reload the lot rather than patch state.
    await get().loadAll()
    await get().loadFarmOpening()
    return data
  },

  // Money received against a buyer's carried-in opening balance — the one
  // receivable that has no sale row to mark paid. The mirror of a vendor
  // payment: one cash entry, keyed to the buyer, that the khata subtracts.
  addBuyerReceipt: async ({ buyerId, buyerName, date, amount, mode, notes }) => {
    if (!buyerId) throw new Error('Receipts against old balance need a registered buyer')
    await get().writeCashEntry({
      entry_date:   date,
      amount:       parseFloat(amount),
      direction:    'in',
      entry_type:   'buyer_receipt',
      notes:        notes || `Receipt against old balance — ${buyerName || 'buyer'}`,
      reference_id: buyerId,
      payment_mode: mode,
    })
  },

  // Existing parties need this as much as new ones: Ankur and Dhaliwal were
  // created long before there was an opening balance to put on them.
  updateVendor: async (id, patch) => {
    const { data, error } = await supabase.from('vendors').update({
      name:        patch.name.trim(),
      category:    patch.category || 'other',
      phone:       patch.phone || null,
      credit_days: parseInt(patch.credit_days) || 0,
      opening_balance:      parseFloat(patch.opening_balance) || 0,
      opening_balance_date: patch.opening_balance_date || null,
    }).eq('id', id).select().single()
    if (error) throw error
    const { data: balances } = await supabase.from('v_vendor_balances').select('*')
    set(s => ({
      vendors: s.vendors.map(v => (v.id === id ? data : v))
                        .sort((a, b) => a.name.localeCompare(b.name)),
      vendorBalances: balances || s.vendorBalances,
    }))
    return data
  },

  addOwnerCashEntry: async (entry) => {
    const { data: { user } } = await supabase.auth.getUser()
    const { data, error } = await supabase.from('owner_cash_entries').insert({
      farm_id:    getFarmId(),
      entry_date: entry.entry_date,
      amount:     parseFloat(entry.amount),
      direction:  entry.direction,
      entry_type: entry.entry_type || 'owner_capital',
      notes:      entry.notes || null,
      account_id: entry.account_id || get().accountFor(null)?.id || null,
      created_by: user?.id || null,
    }).select().single()
    if (error) throw error
    const { data: cb } = await supabase.from('v_cash_book').select('*')
    set(s => ({
      ownerCashEntries: [...s.ownerCashEntries, data],
      cashBook: cb || [],
    }))
    return data
  },

  addVendorPayment: async (payment) => {
    const { data: { user } } = await supabase.auth.getUser()
    const farmId = getFarmId()
    const { data: cashEntry, error: ce } = await supabase.from('owner_cash_entries').insert({
      farm_id:    farmId,
      entry_date: payment.payment_date,
      amount:     parseFloat(payment.amount),
      direction:  'out',
      entry_type: 'vendor_payment',
      notes:      payment.notes || `Paid to ${payment.vendorName || 'Vendor'}`,
      account_id: get().accountFor(payment.payment_mode)?.id || null,
      created_by: user?.id || null,
    }).select().single()
    if (ce) throw ce
    const { data, error } = await supabase.from('vendor_payments').insert({
      farm_id:       farmId,
      vendor_id:     payment.vendor_id,
      payment_date:  payment.payment_date,
      amount:        parseFloat(payment.amount),
      payment_mode:  payment.payment_mode || 'cash',
      notes:         payment.notes || null,
      cash_entry_id: cashEntry.id,
      created_by:    user?.id || null,
    }).select('*, vendors(name)').single()
    if (error) throw error
    const [{ data: balances }, { data: cb }] = await Promise.all([
      supabase.from('v_vendor_balances').select('*'),
      supabase.from('v_cash_book').select('*'),
    ])
    set(s => ({
      vendorPayments:   [data, ...s.vendorPayments],
      ownerCashEntries: [...s.ownerCashEntries, cashEntry],
      vendorBalances:   balances || [],
      cashBook:         cb       || [],
    }))
    return data
  },

  addExpensePayment: async (payment) => {
    const { data: { user } } = await supabase.auth.getUser()
    const farmId = getFarmId()
    const { data: cashEntry, error: ce } = await supabase.from('owner_cash_entries').insert({
      farm_id:    farmId,
      entry_date: payment.payment_date,
      amount:     parseFloat(payment.amount),
      direction:  'out',
      entry_type: 'expense_payment',
      notes:      payment.notes || 'Expense Payment',
      account_id: get().accountFor(payment.payment_mode)?.id || null,
      created_by: user?.id || null,
    }).select().single()
    if (ce) throw ce
    const { data, error } = await supabase.from('expense_payments').insert({
      farm_id:       farmId,
      payment_date:  payment.payment_date,
      amount:        parseFloat(payment.amount),
      expense_type:  payment.expense_type,
      reference_id:  payment.reference_id || null,
      payment_mode:  payment.payment_mode || 'cash',
      cash_entry_id: cashEntry.id,
      notes:         payment.notes || null,
      created_by:    user?.id || null,
    }).select().single()
    if (error) throw error
    const [{ data: el }, { data: cb }] = await Promise.all([
      supabase.from('v_expense_ledger').select('*').order('entry_date', { ascending: false }),
      supabase.from('v_cash_book').select('*'),
    ])
    set(s => ({
      expensePayments:  [data, ...s.expensePayments],
      ownerCashEntries: [...s.ownerCashEntries, cashEntry],
      expenseLedger:    el || [],
      cashBook:         cb || [],
    }))
    return data
  },
}))

// ── Selectors ────────────────────────────────────────────────────────────────
// Plain functions over state, not getters on the store object: set() does a
// shallow merge, so a getter would not survive the first write.

// Who may be picked to log farm work. Active regular labourers, always — no
// attendance filter, because on contract days no attendance is punched, and no
// permanent staff, because the cook and the peon do not plough fields.
const selectFieldWorkers = (s) =>
  s.regularLabourers
    .filter(l => l.isActive)
    .map(l => ({ id: l.id, name: l.name }))

// Designations in the data carry trailing spaces and inconsistent case.
const selectDrivers = (s) =>
  [...s.permanentStaff, ...s.regularLabourers]
    .filter(w => w.isActive && (w.designation || '').trim().toLowerCase() === 'driver')
    .map(w => ({ id: w.id, name: w.name }))

// Every tractor is named "Tractor" — only the registration number tells them apart.
const selectTractors = (s) =>
  s.machineryMaster
    .filter(m => m.type === 'tractor' && m.isActive)
    .map(m => ({ id: m.id, label: m.regNo || m.name }))

// Legacy store (kept for Field.jsx compatibility)
const useFarmStore = create((set) => ({
  farm: null, plots: [], alerts: [], diary: null,
  setFarm:   (farm)   => set({ farm }),
  setPlots:  (plots)  => set({ plots }),
  setAlerts: (alerts) => set({ alerts }),
  setDiary:  (diary)  => set({ diary }),
}))

export { useMapStore, useAppStore, useFarmStore }
export { selectFieldWorkers, selectDrivers, selectTractors }

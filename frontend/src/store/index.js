import { create } from 'zustand'
import { supabase } from '../lib/supabase'
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
  const gross      = Number(s.total_revenue) || 0
  const deductions = Number(s.deductions)    || 0
  return {
    id:                    s.id,
    sessionId:             s.harvest_id,
    date:                  s.sale_date,
    buyerName:             s.buyer_name || '',
    buyerId:               s.buyer_id || null,
    ratePerQtl:            Number(s.rate_per_unit) || 0,
    grossAmount:           gross,
    deductions,
    deductionsNote:        s.deductions_note || null,
    netAmount:             gross - deductions,
    paymentStatus:         s.payment_status || 'pending',
    paymentDate:           s.payment_date || null,
    paymentAttachmentPath: s.payment_attachment_path || null,
  }
}

function mapBuyer(b) {
  return { id: b.id, name: b.name, address: b.address || '', contact: b.contact || '', type: b.type || 'trader', buys: b.buys || [], isActive: b.is_active }
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
  }
}

function mapMachinery(m) {
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
    disposalType:   m.disposal_type || null,
    disposalDate:   m.disposal_date || null,
    disposalAmount: m.disposal_amount ? Number(m.disposal_amount) : null,
    disposalBuyer:  m.disposal_buyer || null,
    disposalNotes:  m.disposal_notes || null,
  }
}

function mapFarmAsset(a) {
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

// ── Map store (persisted separately for map state) ────────────────────────────
const useMapStore = create(
  (set) => ({
    zoom: 15, center: [80.486362, 28.506379], bearing: 0, pitch: 0,
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
  machineryMaster:   [],
  farmAssets:        [],
  livestockMaster:   [],
  livestockCountLogs: [],
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
        { data: harvestSessionsRaw },
        { data: salesRaw },
        { data: buyersRaw },
        { data: partnersRaw },
        { data: farmExpensesRaw },
        { data: livestockRevenueRaw },
        { data: cropResidualsRaw },
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
        supabase.from('harvest_sessions').select('*').eq('farm_id', farmId).order('harvest_date'),
        supabase.from('sales').select('*').eq('farm_id', farmId).order('sale_date'),
        supabase.from('buyers').select('*').eq('farm_id', farmId).eq('is_active', true).order('name'),
        supabase.from('partners').select('*').eq('farm_id', farmId).eq('is_active', true).order('name'),
        supabase.from('farm_expenses').select('*').eq('farm_id', farmId).order('expense_date', { ascending: false }),
        supabase.from('livestock_revenue').select('*').eq('farm_id', farmId).order('revenue_date', { ascending: false }),
        supabase.from('crop_residuals').select('*').eq('farm_id', farmId).order('created_at', { ascending: false }),
      ])

      const tpl = templates || []
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
        machineryMaster:    (machineryRaw || []).map(mapMachinery),
        farmAssets:         (farmAssetsRaw || []).map(mapFarmAsset),
        livestockMaster:    (livestockRaw || []).map(mapLivestock),
        livestockCountLogs: (countLogsRaw || []).map(mapCountLog),
        harvestSessions:    (harvestSessionsRaw || []).map(mapSession),
        sales:              (salesRaw || []).map(mapSale),
        buyers:             (buyersRaw || []).map(mapBuyer),
        partners:           (partnersRaw || []).map(mapPartner),
        farmExpenses:       (farmExpensesRaw || []).map(mapFarmExpense),
        livestockRevenue:   (livestockRevenueRaw || []).map(mapLivestockRevenue),
        cropResiduals:      (cropResidualsRaw || []).map(mapResidual),
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
    set(s => ({ advances: [mapAdvance(data), ...s.advances] }))
  },

  markAdvanceRecovered: async (id, recoveryMonth) => {
    const { error } = await supabase.from('salary_advances')
      .update({ is_recovered: true, recovery_month: recoveryMonth })
      .eq('id', id)
    if (error) throw error
    set(s => ({ advances: s.advances.filter(a => a.id !== id) }))
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
    set(s => ({ salaryPayments: [mapSalaryPayment(data), ...s.salaryPayments] }))
  },

  deleteSalaryPayment: async (id) => {
    const { error } = await supabase.from('salary_payments').delete().eq('id', id)
    if (error) throw error
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

  // ── Purchase Bill — multi-item, one bill record ─────────────────────────────
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

    for (const line of lineItems) {
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
      newPurchaseRows.push({ ...row, bill_id: bill.id })
    }

    set(s => ({
      purchases: [...newPurchaseRows.map(mapPurchase), ...s.purchases],
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

  addMachinery: async (data) => {
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
    }).select().single()
    if (error) throw error
    set(s => ({ machineryMaster: [...s.machineryMaster, mapMachinery(row)] }))
  },

  addFarmAsset: async (data) => {
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
    }).select().single()
    if (error) throw error
    set(s => ({ farmAssets: [...s.farmAssets, mapFarmAsset(row)] }))
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
      health_status:    data.healthStatus || 'healthy',
      acquisition_type: data.acquisitionType || 'purchased',
      purchase_date:    data.acquisitionType !== 'born' ? (data.purchaseDate || null) : null,
      purchase_price:   data.acquisitionType !== 'born' && data.purchasePrice ? parseFloat(data.purchasePrice) : null,
      notes:            data.notes || null,
    }
    const { error } = await supabase.from('livestock_master').update(payload).eq('id', id)
    if (error) throw error
    set(s => ({ livestockMaster: s.livestockMaster.map(l => l.id === id ? { ...l, name: payload.name, species: payload.species, gender: payload.gender, breed: payload.breed, dob: payload.dob, healthStatus: payload.health_status, acquisitionType: payload.acquisition_type, purchaseDate: payload.purchase_date, purchasePrice: payload.purchase_price, notes: payload.notes } : l) }))
  },

  // ── Farm Expenses ────────────────────────────────────────────────────────────
  addFarmExpense: async (exp) => {
    const { data, error } = await supabase.from('farm_expenses').insert({
      farm_id:        getFarmId(),
      expense_date:   exp.expenseDate,
      category:       exp.category,
      amount:         exp.amount,
      description:    exp.description,
      attributed_to:  exp.attributedTo || 'general',
      livestock_id:   exp.livestockId || null,
      payment_mode:   exp.paymentMode || null,
      paid_to:        exp.paidTo || null,
      attachment_path: exp.attachmentPath || null,
      notes:          exp.notes || null,
    }).select().single()
    if (error) throw error
    set(s => ({ farmExpenses: [mapFarmExpense(data), ...s.farmExpenses] }))
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
    set(s => ({ livestockRevenue: s.livestockRevenue.filter(r => r.id !== id) }))
  },

  // ── Activity log ────────────────────────────────────────────────────────────
  logActivity: async (act) => {
    const isEvent = act.type === 'events'
    const cycleId = act.cropCycleId || (() => {
      const cycle = get().cropCycles.find(c => c.plotId === act.plotId && c.status === 'active')
      return cycle?.id || null
    })()
    if (!cycleId && !isEvent) return  // non-events require a cycle

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
      status:               'done',
      notes:                act.notes || null,
    }).select('*, plots(name)').single()
    if (error) { console.error('logActivity:', error.message); return }

    set(s => ({ activities: [mapActivity(data), ...s.activities] }))
  },

  // Creates one activity record per plot
  logActivities: async (plotIds, actData) => {
    const { cropCycles, plots } = get()
    const today      = new Date().toISOString().slice(0, 10)
    const isEvent    = actData.type === 'events'
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
      const cycle   = cropCycles.find(c => c.plotId === plotId && c.status === 'active')
      if (!cycle && !isEvent) return null
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
        status:               'done',
        notes:                actData.notes || null,
      }
    }).filter(Boolean)

    if (!rows.length) return
    const { data, error } = await supabase.from('activity_logs').insert(rows).select('*, plots(name)')
    if (error) { console.error('logActivities:', error.message); return }
    set(s => ({ activities: [...(data || []).map(mapActivity), ...s.activities] }))
  },

  // ── Crop cycles ─────────────────────────────────────────────────────────────
  addCaneSupply: async (cycleId, { date, qtyQtl, parchiNumber, notes, sap, buyerId, partnerId, parchiAttachmentPath }) => {
    const qtyKg = Math.round(parseFloat(qtyQtl) * 100)
    const gross  = Math.round(parseFloat(qtyQtl) * parseFloat(sap))
    const { data: session, error: e1 } = await supabase
      .from('harvest_sessions')
      .insert({ farm_id: getFarmId(), cycle_id: cycleId, harvest_date: date, quantity_kg: qtyKg, parchi_number: parchiNumber || null, notes: notes || null, partner_id: partnerId || null, parchi_attachment_path: parchiAttachmentPath || null })
      .select().single()
    if (e1) throw e1
    const { data: sale, error: e2 } = await supabase
      .from('sales')
      .insert({ farm_id: getFarmId(), harvest_id: session.id, sale_date: date, buyer_id: buyerId || null, quantity_sold: parseFloat(qtyQtl), rate_per_unit: parseFloat(sap), total_revenue: gross, payment_status: 'pending' })
      .select().single()
    if (e2) throw e2
    set(s => ({ harvestSessions: [...s.harvestSessions, mapSession(session)], sales: [...s.sales, mapSale(sale)] }))
  },

  markCanePayment: async (saleId, { paymentDate, deductions, deductionsNote, paymentAttachmentPath }) => {
    const ded = parseFloat(deductions) || 0
    const { error } = await supabase.from('sales')
      .update({ payment_status: 'paid', payment_date: paymentDate, deductions: ded, deductions_note: deductionsNote || null, payment_attachment_path: paymentAttachmentPath || null })
      .eq('id', saleId)
    if (error) throw error
    set(s => ({
      sales: s.sales.map(sale => {
        if (sale.id !== saleId) return sale
        return { ...sale, paymentStatus: 'paid', paymentDate, deductions: ded, deductionsNote: deductionsNote || null, netAmount: sale.grossAmount - ded, paymentAttachmentPath: paymentAttachmentPath || null }
      }),
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
  addCropSale: async (sessionId, { date, buyerName, buyerId, qtyQtl, ratePerQtl }) => {
    const gross = Math.round(parseFloat(qtyQtl) * parseFloat(ratePerQtl))
    const { data: sale, error } = await supabase.from('sales').insert({
      farm_id:        getFarmId(),
      harvest_id:     sessionId,
      sale_date:      date,
      buyer_name:     buyerName || null,
      buyer_id:       buyerId   || null,
      quantity_sold:  parseFloat(qtyQtl),
      rate_per_unit:  parseFloat(ratePerQtl),
      total_revenue:  gross,
      payment_status: 'pending',
    }).select().single()
    if (error) throw error
    set(s => ({ sales: [...s.sales, mapSale(sale)] }))
    return mapSale(sale)
  },

  markCropSalePayment: async (saleId, { paymentDate, deductions, deductionsNote, paymentAttachmentPath }) => {
    const { sales: allSales } = get()
    const sale = allSales.find(s => s.id === saleId)
    const ded       = parseFloat(deductions) || 0
    const netAmount = Math.max(0, (sale?.grossAmount || 0) - ded)

    const { error } = await supabase.from('sales').update({
      payment_status:          'paid',
      payment_date:             paymentDate,
      deductions:               ded,
      deductions_note:          deductionsNote || null,
      payment_attachment_path:  paymentAttachmentPath || null,
    }).eq('id', saleId)
    if (error) throw error

    // Record in cash book as income
    const { data: { user } } = await supabase.auth.getUser()
    await supabase.from('owner_cash_entries').insert({
      farm_id:     getFarmId(),
      entry_date:  paymentDate,
      amount:      netAmount,
      direction:   'in',
      entry_type:  'crop_sale',
      notes:       `Crop sale — ${sale?.buyerName || 'Buyer'}`,
      created_by:  user?.id || null,
    })

    set(s => ({
      sales: s.sales.map(sl => sl.id !== saleId ? sl : {
        ...sl,
        paymentStatus:         'paid',
        paymentDate,
        deductions:            ded,
        deductionsNote:        deductionsNote || null,
        netAmount,
        paymentAttachmentPath: paymentAttachmentPath || null,
      }),
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
      { data: incomeRaw },
      { data: expenseRaw },
      { data: monthlyRaw },
      { data: livestockPnlRaw },
      { data: cropPnlRaw },
    ] = await Promise.all([
      supabase.from('vendors').select('*').eq('farm_id', farmId).order('name'),
      supabase.from('vendor_payments').select('*, vendors(name)').eq('farm_id', farmId).order('payment_date', { ascending: false }),
      supabase.from('owner_cash_entries').select('*').eq('farm_id', farmId).order('entry_date'),
      supabase.from('expense_payments').select('*').eq('farm_id', farmId).order('payment_date', { ascending: false }),
      supabase.from('v_cash_book').select('*'),
      supabase.from('v_vendor_balances').select('*'),
      supabase.from('v_income_ledger').select('*').order('entry_date', { ascending: false }),
      supabase.from('v_expense_ledger').select('*').order('entry_date', { ascending: false }),
      supabase.from('v_monthly_summary').select('*'),
      supabase.from('v_livestock_pnl').select('*'),
      supabase.from('v_crop_pnl').select('*'),
    ])
    set({
      vendors:          vendorsRaw          || [],
      vendorPayments:   vendorPaymentsRaw   || [],
      ownerCashEntries: ownerCashRaw        || [],
      expensePayments:  expPaymentsRaw      || [],
      cashBook:         cashBookRaw         || [],
      vendorBalances:   vendorBalancesRaw   || [],
      incomeLedger:     incomeRaw           || [],
      expenseLedger:    expenseRaw          || [],
      monthlySummary:   monthlyRaw          || [],
      livestockPnl:     livestockPnlRaw     || [],
      cropPnl:          cropPnlRaw          || [],
    })
  },

  addVendor: async (vendor) => {
    const { data, error } = await supabase.from('vendors').insert({
      farm_id:     getFarmId(),
      name:        vendor.name,
      category:    vendor.category || 'other',
      phone:       vendor.phone    || null,
      address:     vendor.address  || null,
      credit_days: parseInt(vendor.credit_days) || 0,
    }).select().single()
    if (error) throw error
    set(s => ({ vendors: [...s.vendors, data].sort((a,b) => a.name.localeCompare(b.name)) }))
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

// Legacy store (kept for Field.jsx compatibility)
const useFarmStore = create((set) => ({
  farm: null, plots: [], alerts: [], diary: null,
  setFarm:   (farm)   => set({ farm }),
  setPlots:  (plots)  => set({ plots }),
  setAlerts: (alerts) => set({ alerts }),
  setDiary:  (diary)  => set({ diary }),
}))

export { useMapStore, useAppStore, useFarmStore }

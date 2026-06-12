import { create } from 'zustand'
import { supabase } from '../lib/supabase'

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
    activities:   templates
      .filter(t => t.crop_id === c.id)
      .sort((a, b) => a.day_offset - b.day_offset)
      .map(t => ({ day: t.day_offset, type: t.activity_type, label: t.label, inputs: [] })),
  }
}

function mapCycle(c) {
  return {
    id:         c.id,
    plotId:     c.plot_id,
    plotLabel:  c.plots?.name || '',
    cropId:     c.crop_id,
    sowDate:    c.sow_date,
    harvestDate: c.expected_harvest_end || null,
    status:     c.status,
    acres:      Number(c.plots?.area_acres) || 0,
    season:     c.season,
  }
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
    amount:        Number(p.amount),
    type:          p.payment_type || 'salary',
    notes:         p.notes || '',
    month:         p.payment_month || '',
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
  scrapSales:        [],
  sprayReminders:    [],
  mediaItems:        [],
  todayAttendance:   {},   // { [labourerId]: { id, status } }
  advances:          [],   // salary_advances rows
  salaryPayments:    [],   // salary_payments rows
  loading:           false,
  initialized:       false,

  // ── Load all data from Supabase ─────────────────────────────────────────────
  loadAll: async () => {
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
      ] = await Promise.all([
        supabase.from('plots').select('*').order('name'),
        supabase.from('crops').select('*').order('name'),
        supabase.from('crop_activity_templates').select('*').order('day_offset'),
        supabase.from('crop_cycles')
          .select('*, plots(name,area_acres), crops(name,color,icon)')
          .order('created_at', { ascending: false }),
        supabase.from('inventory_items').select('*').order('category').order('name'),
        supabase.from('inventory_purchases')
          .select('*').order('purchase_date', { ascending: false }),
        supabase.from('inventory_issues')
          .select('*, plots(name), crop_cycles(season, plots(name))')
          .order('issue_date', { ascending: false }),
        supabase.from('activity_logs')
          .select('*, plots(name)').order('created_at', { ascending: false }),
        supabase.from('labour_master').select('*').in('status', ['active', 'paused']).order('name'),
        supabase.from('labour_logs')
          .select('*, plots(name)').order('activity_date', { ascending: false }),
        supabase.from('media_files')
          .select('*, plots(name)')
          .in('entity_type', ['farm_photo', 'farm_video'])
          .order('created_at', { ascending: false }),
        supabase.from('attendance')
          .select('id, labour_master_id, status')
          .eq('attendance_date', new Date().toISOString().slice(0, 10)),
        supabase.from('salary_advances')
          .select('*')
          .eq('is_recovered', false)
          .order('advance_date', { ascending: false }),
        supabase.from('salary_payments').select('*').order('payment_date', { ascending: false }),
        supabase.from('work_types').select('*').eq('is_active', true).order('name'),
        supabase.from('activity_types').select('*').eq('is_active', true).order('sort_order'),
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
    const { data, error } = await supabase.from('crops').insert({
      name:                crop.name,
      icon:                crop.emoji || '🌾',
      color:               crop.color || '#dcb428',
      duration_days:       parseInt(crop.duration_days),
      harvest_window_days: parseInt(crop.harvest_window_days) || 14,
      price_per_qtl:       parseFloat(crop.pricePerQtl) || null,
      yield_per_acre:      parseFloat(crop.yieldPerAcre) || null,
      season_type:         crop.season_type || null,
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
    }).eq('id', id)
    if (error) throw error
    set(s => ({ cropMaster: s.cropMaster.map(c => c.id === id ? { ...c, ...data } : c) }))
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
    const { data, error } = await supabase.from('inventory_items').insert({
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
    const { data, error } = await supabase.from('labour_master').insert({
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
    const { data, error } = await supabase.from('labour_master').insert({
      name:            s.name,
      phone:           s.phone || null,
      designation:     s.designation || null,
      sub_type:        'permanent',
      monthly_salary:  parseFloat(s.monthlySalary) || 0,
      daily_base_rate: parseFloat(s.dailyRate) || 0,
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
    const { data, error } = await supabase.from('labour_master').insert({
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
        .insert({ labour_master_id: labourerId, attendance_date: today, status })
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
      labourer_id:    p.labourerId,
      payment_date:   p.date,
      amount:         parseFloat(p.amount),
      payment_type:   p.type || 'salary',
      notes:          p.notes || null,
      payment_month:  p.month || null,
      given_by:       p.givenBy || null,
      payment_mode:   p.paymentMode || 'cash',
      attachment_url: p.attachmentUrl || null,
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
    const { permanentStaff } = get()
    if (!permanentStaff.length) return
    const mm        = String(month).padStart(2, '0')
    const startDate = `${year}-${mm}-01`
    const lastDay   = new Date(year, month, 0).getDate()
    const endDate   = `${year}-${mm}-${String(lastDay).padStart(2, '0')}`
    const { data }  = await supabase.from('attendance')
      .select('id, labour_master_id, attendance_date, status')
      .in('labour_master_id', permanentStaff.map(s => s.id))
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
        .insert({ labour_master_id: labourerId, attendance_date: date, status })
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
      item_id:            issue.itemId,
      plot_id:            issue.plotId || null,
      cycle_id:           cycleId,
      stage,
      issue_date:         issue.date,
      quantity:           issue.qty,
      cost_per_unit:      wac,
      unit_cost_at_issue: wac,
      total_cost:         totalCost,
      purpose:            issue.purpose || null,
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

  // ── Labour log ──────────────────────────────────────────────────────────────
  logLabour: async (log) => {
    const { data, error } = await supabase.from('labour_logs').insert({
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

  addWorkType: async (name) => {
    const { data, error } = await supabase.from('work_types').insert({ name }).select().single()
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
      .insert({ name, label: label.trim(), emoji: emoji || '📋', is_system: false })
      .select().single()
    if (error) throw error
    set(s => ({ activityTypes: [...s.activityTypes, { id: data.id, name: data.name, label: data.label, emoji: data.emoji, isSystem: false }] }))
  },

  deleteActivityType: async (id) => {
    const { error } = await supabase.from('activity_types').update({ is_active: false }).eq('id', id)
    if (error) throw error
    set(s => ({ activityTypes: s.activityTypes.filter(a => a.id !== id) }))
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
    const { cropCycles } = get()
    const today    = new Date().toISOString().slice(0, 10)
    const isEvent  = actData.type === 'events'
    const rows  = plotIds.map(plotId => {
      const cycle   = cropCycles.find(c => c.plotId === plotId && c.status === 'active')
      if (!cycle && !isEvent) return null   // events don't need a cycle
      return {
        cycle_id:             cycle?.id || null,
        plot_id:              plotId === '__all__' ? null : plotId,
        activity_type:        actData.type,
        activity_name:        actData.notes || actData.type,
        actual_date:          actData.date || today,
        worker_count:         actData.workers         || 0,
        regular_worker_ids:   actData.regularWorkerIds   || [],
        outside_labour_count: actData.outsideLabourCount || 0,
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
  addCropCycle: async (cycle) => {
    const { data, error } = await supabase.from('crop_cycles').insert({
      plot_id:              cycle.plotId,
      crop_id:              cycle.cropId,
      season:               cycle.season,
      sow_date:             cycle.sowDate,
      expected_harvest_end: cycle.harvestDate || null,
      status:               'active',
      budget:               cycle.budget || null,
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

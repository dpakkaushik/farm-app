import { create } from 'zustand'
import { supabase } from '../lib/supabase'

// ── Data mappers (Supabase column names → local field names) ──────────────────

function mapCrop(c, templates = []) {
  return {
    id:           c.id,
    name:         c.name,
    emoji:        c.icon,
    color:        c.color,
    duration_days: c.duration_days,
    pricePerQtl:  Number(c.price_per_qtl) || 0,
    yieldPerAcre: Number(c.yield_per_acre) || 0,
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
    id:        p.id,
    itemId:    p.item_id,
    date:      p.purchase_date,
    qty:       Number(p.quantity),
    unitPrice: Number(p.unit_price),
    totalCost: Number(p.total_cost) || Number(p.quantity) * Number(p.unit_price),
    vendor:    p.vendor_name || '',
    invoiceNo: p.invoice_number || '',
    notes:     p.notes || '',
  }
}

function mapIssue(i) {
  return {
    id:          i.id,
    itemId:      i.item_id,
    cropCycleId: i.cycle_id,
    plotLabel:   i.crop_cycles?.plots?.name || (i.cycle_id ? '' : 'Farm-wide'),
    date:        i.issue_date,
    qty:         Number(i.quantity),
    totalCost:   Number(i.total_cost) || 0,
    purpose:     i.purpose || '',
    activityType: 'manual',
  }
}

function mapActivity(a) {
  return {
    id:          a.id,
    cropCycleId: a.cycle_id,
    plotId:      a.plot_id,
    plotLabel:   a.plots?.name || '',
    type:        a.activity_type,
    notes:       a.activity_name || '',
    date:        a.actual_date || a.created_at?.slice(0, 10),
    workers:     a.worker_count || 0,
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

function mapLabourLog(l) {
  return {
    id:          l.id,
    labourName:  l.labour_name,
    plotId:      l.plot_id,
    plotLabel:   l.plots?.name || '—',
    cropCycleId: l.cycle_id,
    date:        l.activity_date,
    workers:     Number(l.quantity) || 0,
    hours:       8,
    ratePerDay:  Number(l.base_rate) || 0,
    totalCost:   Number(l.total_payment) || 0,
    purpose:     l.work_type || '',
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
  regularLabourers:  [],
  contractualLabour: [],
  purchases:         [],
  issues:            [],
  labourLogs:        [],
  activities:        [],
  cropCycles:        [],
  scrapSales:        [],
  sprayReminders:    [],
  mediaItems:        [],
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
          .select('*, crop_cycles(season, plots(name))')
          .order('issue_date', { ascending: false }),
        supabase.from('activity_logs')
          .select('*, plots(name)').order('created_at', { ascending: false }),
        supabase.from('labour_master').select('*').eq('status', 'active').order('name'),
        supabase.from('labour_logs')
          .select('*, plots(name)').order('activity_date', { ascending: false }),
        supabase.from('media_files')
          .select('*, plots(name)')
          .in('entity_type', ['farm_photo', 'farm_video'])
          .order('created_at', { ascending: false }),
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
        regularLabourers:  (labourRaw || [])
          .filter(l => l.sub_type === 'regular' || l.sub_type === 'permanent')
          .map(l => ({ id: l.id, name: l.name, workType: 'Farm Worker', ratePerDay: Number(l.daily_base_rate) || 400, phone: l.phone || '' })),
        contractualLabour: (labourRaw || [])
          .filter(l => l.sub_type === 'contractual' || l.sub_type === 'seasonal')
          .map(l => ({ id: l.id, name: l.name, defaultRate: Number(l.daily_base_rate) || 400 })),
        labourLogs:        (labourLogsRaw || []).map(mapLabourLog),
        mediaItems:        (mediaRaw || []).map(mapMediaFile),
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
      name:          data.name,
      icon:          data.emoji,
      color:         data.color,
      duration_days: data.duration_days,
      price_per_qtl: data.pricePerQtl,
      yield_per_acre: data.yieldPerAcre,
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
      supplier_name: item.supplier || null,
    }).select().single()
    if (error) throw error
    set(s => ({ inventoryMaster: [...s.inventoryMaster, mapItem(data)] }))
  },

  updateInventoryItem: async (id, data) => {
    const { error } = await supabase.from('inventory_items').update({
      name:          data.name,
      min_threshold: data.minThreshold,
      cost_per_unit: data.costPerUnit,
    }).eq('id', id)
    if (error) throw error
    set(s => ({ inventoryMaster: s.inventoryMaster.map(i => i.id === id ? { ...i, ...data } : i) }))
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
  addRegularLabourer: async (l) => {
    const { data, error } = await supabase.from('labour_master').insert({
      name:            l.name,
      phone:           l.phone || null,
      sub_type:        'regular',
      daily_base_rate: parseFloat(l.ratePerDay) || 400,
      status:          'active',
    }).select().single()
    if (error) throw error
    set(s => ({
      regularLabourers: [...s.regularLabourers, {
        id: data.id, name: data.name, workType: l.workType || 'Farm Worker',
        ratePerDay: Number(data.daily_base_rate), phone: data.phone || '',
      }],
    }))
  },

  deleteRegularLabourer: async (id) => {
    const { error } = await supabase.from('labour_master').update({ status: 'inactive' }).eq('id', id)
    if (error) throw error
    set(s => ({ regularLabourers: s.regularLabourers.filter(l => l.id !== id) }))
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

  deleteContractualLabour: async (id) => {
    const { error } = await supabase.from('labour_master').update({ status: 'inactive' }).eq('id', id)
    if (error) throw error
    set(s => ({ contractualLabour: s.contractualLabour.filter(l => l.id !== id) }))
  },

  // ── Purchases — adds stock ──────────────────────────────────────────────────
  recordPurchase: async (purchase) => {
    const { data, error } = await supabase.from('inventory_purchases').insert({
      item_id:        purchase.itemId,
      purchase_date:  purchase.date,
      quantity:       purchase.qty,
      unit_price:     purchase.unitPrice,
      vendor_name:    purchase.vendor || null,
      invoice_number: purchase.invoiceNo || null,
      notes:          purchase.notes || null,
    }).select().single()
    if (error) throw error

    const item     = get().inventoryMaster.find(i => i.id === purchase.itemId)
    const newStock = (item?.currentStock || 0) + purchase.qty
    await supabase.from('inventory_items')
      .update({ current_stock: newStock, cost_per_unit: purchase.unitPrice })
      .eq('id', purchase.itemId)

    set(s => ({
      purchases: [mapPurchase(data), ...s.purchases],
      inventoryMaster: s.inventoryMaster.map(i =>
        i.id === purchase.itemId
          ? { ...i, currentStock: newStock, costPerUnit: purchase.unitPrice }
          : i
      ),
    }))
  },

  // ── Issue item — reduces stock ──────────────────────────────────────────────
  issueItem: async (issue) => {
    const cycleId = (issue.cropCycleId && issue.cropCycleId !== '__farm__')
      ? issue.cropCycleId : null
    const item    = get().inventoryMaster.find(i => i.id === issue.itemId)

    const { data, error } = await supabase.from('inventory_issues').insert({
      item_id:      issue.itemId,
      cycle_id:     cycleId,
      issue_date:   issue.date,
      quantity:     issue.qty,
      cost_per_unit: item?.costPerUnit || 0,
      purpose:      issue.purpose || null,
    }).select().single()
    if (error) throw error

    const newStock = Math.max(0, (item?.currentStock || 0) - issue.qty)
    await supabase.from('inventory_items')
      .update({ current_stock: newStock })
      .eq('id', issue.itemId)

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
      activity_date:    log.date,
      quantity:         log.workers || null,
      quantity_unit:    'workers',
      base_rate:        log.ratePerDay || null,
      total_payment:    log.totalCost || null,
    }).select('*, plots(name)').single()
    if (error) throw error
    set(s => ({ labourLogs: [mapLabourLog(data), ...s.labourLogs] }))
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
      cycle_id:      cycleId,
      plot_id:       act.plotId || null,
      activity_type: act.type,
      activity_name: act.notes || act.label || act.type,
      actual_date:   act.date || new Date().toISOString().slice(0, 10),
      worker_count:  act.workers || 0,
      status:        'done',
      notes:         act.notes || null,
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
        cycle_id:      cycle?.id || null,
        plot_id:       plotId === '__all__' ? null : plotId,
        activity_type: actData.type,
        activity_name: actData.notes || actData.type,
        actual_date:   actData.date || today,
        worker_count:  actData.workers || 0,
        status:        'done',
        notes:         actData.notes || null,
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
    set(s => ({ cropCycles: [mapCycle(data), ...s.cropCycles] }))
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

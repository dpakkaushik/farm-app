import { supabase } from '../lib/supabase'

// ── Plots ────────────────────────────────────────────────────────────────────
export const plotsApi = {
  getAll: () => supabase.from('plots').select('*').order('name'),
}

// ── Crops ────────────────────────────────────────────────────────────────────
export const cropsApi = {
  getAll: () => supabase.from('crops').select('*').order('name'),
  getTemplates: (cropId) =>
    supabase.from('crop_activity_templates').select('*').eq('crop_id', cropId).order('day_offset'),
}

// ── Crop Cycles ──────────────────────────────────────────────────────────────
export const cyclesApi = {
  getAll:    () => supabase.from('crop_cycles').select('*, plots(name,area_acres), crops(name,color,icon)').order('created_at', { ascending: false }),
  getActive: () => supabase.from('crop_cycles').select('*, plots(name,area_acres), crops(name,color,icon)').eq('status', 'active'),
  create:    (data) => supabase.from('crop_cycles').insert(data).select().single(),
  update:    (id, data) => supabase.from('crop_cycles').update(data).eq('id', id),
}

// ── Harvest ──────────────────────────────────────────────────────────────────
export const harvestApi = {
  getSessions: (cycleId) => supabase.from('harvest_sessions').select('*').eq('cycle_id', cycleId).order('harvest_date'),
  addSession:  (data) => supabase.from('harvest_sessions').insert(data).select().single(),
}

// ── Sales ────────────────────────────────────────────────────────────────────
export const salesApi = {
  getByCycle: (cycleId) => supabase.from('sales').select('*').eq('cycle_id', cycleId).order('sale_date'),
  getAll:     () => supabase.from('sales').select('*, crop_cycles(season, plots(name), crops(name))').order('sale_date', { ascending: false }),
  create:     (data) => supabase.from('sales').insert(data).select().single(),
  update:     (id, data) => supabase.from('sales').update(data).eq('id', id),
}

// ── Activity Logs ────────────────────────────────────────────────────────────
export const activitiesApi = {
  getAll:      () => supabase.from('activity_logs').select('*, plots(name)').order('created_at', { ascending: false }),
  getByCycle:  (cycleId) => supabase.from('activity_logs').select('*').eq('cycle_id', cycleId).order('actual_date', { ascending: false }),
  create:      (data) => supabase.from('activity_logs').insert(data).select().single(),
  createMany:  (rows) => supabase.from('activity_logs').insert(rows).select(),
}

// ── Inventory ────────────────────────────────────────────────────────────────
export const inventoryApi = {
  getItems:     () => supabase.from('inventory_items').select('*').order('category').order('name'),
  getPurchases: () => supabase.from('inventory_purchases').select('*, inventory_items(name,unit)').order('purchase_date', { ascending: false }),
  getIssues:    () => supabase.from('inventory_issues').select('*, inventory_items(name,unit), crop_cycles(season, plots(name))').order('issue_date', { ascending: false }),
  purchase:     (data) => supabase.from('inventory_purchases').insert(data).select().single(),
  issue:        (data) => supabase.from('inventory_issues').insert(data).select().single(),
  updateStock:  (id, stock) => supabase.from('inventory_items').update({ current_stock: stock }).eq('id', id),
}

// ── Labour ───────────────────────────────────────────────────────────────────
export const labourApi = {
  getMaster:     () => supabase.from('labour_master').select('*').eq('status', 'active').order('name'),
  getRates:      () => supabase.from('labour_activity_rates').select('*'),
  getLogs:       () => supabase.from('labour_logs').select('*, plots(name)').order('activity_date', { ascending: false }),
  createLog:     (data) => supabase.from('labour_logs').insert(data).select().single(),
  createLogs:    (rows) => supabase.from('labour_logs').insert(rows).select(),
  getAttendance: (date) => supabase.from('attendance').select('*, labour_master(name,sub_type)').eq('attendance_date', date),
  markAttendance:(rows) => supabase.from('attendance').upsert(rows, { onConflict: 'labour_master_id,attendance_date' }),
  getWorkTypes:  () => supabase.from('work_types').select('*').eq('is_active', true).order('name'),
  addWorkType:   (name) => supabase.from('work_types').insert({ name }).select().single(),
  deleteWorkType:(id) => supabase.from('work_types').delete().eq('id', id),
}

// ── Assets ───────────────────────────────────────────────────────────────────
export const assetsApi = {
  getLivestock:      () => supabase.from('livestock_master').select('*').eq('is_active', true).order('tag_id'),
  getLivestockHealth:(id) => supabase.from('livestock_health_logs').select('*').eq('livestock_id', id).order('log_date', { ascending: false }),
  getMachinery:      () => supabase.from('machinery_master').select('*').order('name'),
  getDieselLogs:     () => supabase.from('diesel_logs').select('*, machinery_master(name)').order('fill_date', { ascending: false }),
  getFarmAssets:     () => supabase.from('farm_assets').select('*').order('name'),
}

// ── Dashboard ────────────────────────────────────────────────────────────────
export const dashboardApi = {
  getAlerts: () => supabase.from('alerts').select('*').eq('is_read', false).order('created_at', { ascending: false }),
  markRead:  (id) => supabase.from('alerts').update({ is_read: true }).eq('id', id),
  getDiary:  (farmId, date) => supabase.from('daily_diary').select('*').eq('farm_id', farmId).eq('diary_date', date).maybeSingle(),
  saveDiary: (data) => supabase.from('daily_diary').upsert(data, { onConflict: 'farm_id,diary_date' }),
}

// ── Legacy stubs (kept so Field.jsx / old components don't break) ─────────────
export const farmApi = {
  getPlots:     () => Promise.reject('use plotsApi'),
  getDashboard: () => Promise.resolve({ data: null }),
  submitDiary:  () => Promise.resolve({ data: null }),
  saveMapState: () => Promise.resolve(),
  uploadFile:   () => Promise.resolve({ data: { public_url: null } }),
}
export const api = { loadAll: () => Promise.resolve({}) }

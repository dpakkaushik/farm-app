import { create } from 'zustand'
import { supabase } from '../lib/supabase'
import { useAuthStore } from './auth'

// Trees live in their own store, not in the 2,100-line app store, for two reasons:
// its loadAll already fires ~26 parallel queries on every boot, and trees are only
// needed on one page and the map. Loaded on demand.

const getFarmId = () => useAuthStore.getState().activeFarmId

const mapSpecies = s => ({
  id:        s.id,
  nameLocal: s.name_local,
  nameEn:    s.name_en,
  purpose:   s.purpose,          // 'fruit' | 'timber'
  notes:     s.notes,
  photoPath: s.photo_path,
})

const mapPlanting = p => ({
  id:            p.id,
  speciesId:     p.species_id,
  plantedOn:     p.planted_on,          // null when genuinely unknown — do not fabricate
  locationType:  p.location_type,       // 'plot' | 'boundary'
  plotId:        p.plot_id,
  plotName:      p.plots?.name || null,
  boundarySides: p.boundary_sides || [],
  geoPoints:     p.geo_points || null,  // null => the map synthesizes dots
  count:         p.current_count,       // derived by trigger from the ledger; never write it
  notes:         p.notes,
})

const mapCountLog = l => ({
  id:         l.id,
  plantingId: l.planting_id,
  logDate:    l.log_date,
  changeType: l.change_type,
  quantity:   l.quantity,               // signed
  reason:     l.reason,
  notes:      l.notes,
})

export const useTreeStore = create((set, get) => ({
  species:   [],
  plantings: [],
  countLogs: [],
  loading:   false,
  loaded:    false,

  load: async () => {
    const farmId = getFarmId()
    if (!farmId) return
    set({ loading: true })
    try {
      const [{ data: sp, error: e1 }, { data: pl, error: e2 }, { data: cl, error: e3 }] = await Promise.all([
        supabase.from('tree_species').select('*').eq('farm_id', farmId).order('name_local'),
        supabase.from('tree_plantings').select('*, plots(name)').eq('farm_id', farmId).order('created_at'),
        supabase.from('tree_count_logs').select('*').eq('farm_id', farmId).order('log_date', { ascending: false }),
      ])
      if (e1 || e2 || e3) throw (e1 || e2 || e3)
      set({
        species:   (sp || []).map(mapSpecies),
        plantings: (pl || []).map(mapPlanting),
        countLogs: (cl || []).map(mapCountLog),
        loading:   false,
        loaded:    true,
      })
    } catch (err) {
      set({ loading: false })
      throw err
    }
  },

  addSpecies: async ({ nameLocal, nameEn, purpose, notes }) => {
    const { error } = await supabase.from('tree_species').insert({
      farm_id:    getFarmId(),
      name_local: nameLocal.trim(),
      name_en:    nameEn?.trim() || null,
      purpose,
      notes:      notes?.trim() || null,
    })
    if (error) throw error
    await get().load()
  },

  updateSpecies: async (id, { nameLocal, nameEn, purpose, notes }) => {
    const { error } = await supabase.from('tree_species').update({
      name_local: nameLocal.trim(),
      name_en:    nameEn?.trim() || null,
      purpose,
      notes:      notes?.trim() || null,
    }).eq('id', id)
    if (error) throw error
    await get().load()
  },

  deleteSpecies: async (id) => {
    // Cascades to its plantings and their ledger rows.
    const { error } = await supabase.from('tree_species').delete().eq('id', id)
    if (error) throw error
    await get().load()
  },

  // A planting and its opening count are one act. The count column is derived, so
  // the only way to give a planting a number is to write the ledger row that
  // creates it — which is exactly the property that keeps the count honest.
  addPlanting: async ({ speciesId, quantity, plantedOn, locationType, plotId, boundarySides, notes }) => {
    const farmId = getFarmId()
    const { data, error } = await supabase.from('tree_plantings').insert({
      farm_id:        farmId,
      species_id:     speciesId,
      planted_on:     plantedOn || null,
      location_type:  locationType,
      plot_id:        locationType === 'plot' ? plotId : (plotId || null),
      boundary_sides: locationType === 'boundary' ? (boundarySides || []) : [],
      notes:          notes?.trim() || null,
    }).select().single()
    if (error) throw error

    const { error: logError } = await supabase.from('tree_count_logs').insert({
      farm_id:     farmId,
      planting_id: data.id,
      log_date:    plantedOn || new Date().toISOString().slice(0, 10),
      change_type: 'planted',
      quantity:    Math.abs(parseInt(quantity, 10)),
      reason:      'Planting recorded',
    })
    // The planting exists but has no trees in it — a count of zero would be a lie
    // by omission, so roll it back rather than leave an empty husk behind.
    if (logError) {
      await supabase.from('tree_plantings').delete().eq('id', data.id)
      throw logError
    }
    await get().load()
  },

  // Location, date and notes only. Count is never edited here — it moves through
  // the ledger, so that every change to it has a reason attached.
  updatePlanting: async (id, { plantedOn, locationType, plotId, boundarySides, notes }) => {
    const { error } = await supabase.from('tree_plantings').update({
      planted_on:     plantedOn || null,
      location_type:  locationType,
      plot_id:        locationType === 'plot' ? plotId : (plotId || null),
      boundary_sides: locationType === 'boundary' ? (boundarySides || []) : [],
      notes:          notes?.trim() || null,
    }).eq('id', id)
    if (error) throw error
    await get().load()
  },

  deletePlanting: async (id) => {
    const { error } = await supabase.from('tree_plantings').delete().eq('id', id)
    if (error) throw error
    await get().load()
  },

  // changeType: 'planted' | 'died' | 'felled' | 'transplanted' | 'correction'
  // Losses are stored negative. The caller passes a plain positive number and the
  // sign is applied here, in one place, so no screen can get it backwards.
  addCountLog: async ({ plantingId, changeType, quantity, logDate, reason, notes }) => {
    const n = Math.abs(parseInt(quantity, 10))
    const loses = changeType === 'died' || changeType === 'felled' || changeType === 'transplanted'
    const { error } = await supabase.from('tree_count_logs').insert({
      farm_id:     getFarmId(),
      planting_id: plantingId,
      log_date:    logDate || new Date().toISOString().slice(0, 10),
      change_type: changeType,
      quantity:    changeType === 'correction' ? parseInt(quantity, 10) : (loses ? -n : n),
      reason:      reason?.trim() || null,
      notes:       notes?.trim() || null,
    })
    if (error) throw error
    await get().load()
  },
}))

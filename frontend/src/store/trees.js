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

// The farm leases, it does not harvest: fruit is sold on the tree for a lump sum
// and the thekedar picks it. Timber is the same shape — a buyer, a lump sum, a
// payment status — so one row type serves both, split by revenueType.
const mapRevenue = r => ({
  id:             r.id,
  revenueType:    r.revenue_type,       // 'fruit_lease' | 'timber_sale'
  seasonYear:     r.season_year,
  buyerId:        r.buyer_id,
  buyerName:      r.buyer_name,         // free text, for a thekedar not in `buyers`
  agreementDate:  r.agreement_date,
  startDate:      r.start_date,
  endDate:        r.end_date,
  amount:         Number(r.amount) || 0,
  paymentStatus:  r.payment_status,     // 'pending' | 'partial' | 'paid'
  amountReceived: Number(r.amount_received) || 0,
  paymentDate:    r.payment_date,
  attachmentPath: r.attachment_path,
  notes:          r.notes,
  plantingIds:    (r.tree_revenue_items || []).map(i => i.planting_id),
})

export const useTreeStore = create((set, get) => ({
  species:   [],
  plantings: [],
  countLogs: [],
  revenue:   [],
  loading:   false,
  loaded:    false,

  load: async () => {
    const farmId = getFarmId()
    if (!farmId) return
    set({ loading: true })
    try {
      const [{ data: sp, error: e1 }, { data: pl, error: e2 }, { data: cl, error: e3 }, { data: rv, error: e4 }] = await Promise.all([
        supabase.from('tree_species').select('*').eq('farm_id', farmId).order('name_local'),
        supabase.from('tree_plantings').select('*, plots(name)').eq('farm_id', farmId).order('created_at'),
        supabase.from('tree_count_logs').select('*').eq('farm_id', farmId).order('log_date', { ascending: false }),
        supabase.from('tree_revenue').select('*, tree_revenue_items(planting_id)').eq('farm_id', farmId)
          .order('agreement_date', { ascending: false, nullsFirst: false }),
      ])
      if (e1 || e2 || e3 || e4) throw (e1 || e2 || e3 || e4)
      set({
        species:   (sp || []).map(mapSpecies),
        plantings: (pl || []).map(mapPlanting),
        countLogs: (cl || []).map(mapCountLog),
        revenue:   (rv || []).map(mapRevenue),
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

  // ── Revenue ─────────────────────────────────────────────────────────────────
  // A sale is the revenue row plus the plantings it covered, and — for timber that
  // has actually been cut — the felled rows that take those trees off the books.
  // The three must not half-land, so anything after the first insert rolls the
  // revenue row back; deleting it cascades to the items.
  addRevenue: async (rev) => {
    const farmId = getFarmId()
    const today  = new Date().toISOString().slice(0, 10)
    const paid   = rev.paymentStatus === 'paid'

    const { data, error } = await supabase.from('tree_revenue').insert({
      farm_id:         farmId,
      revenue_type:    rev.revenueType,
      season_year:     rev.seasonYear || null,
      buyer_id:        rev.buyerId || null,
      buyer_name:      rev.buyerName?.trim() || null,
      agreement_date:  rev.agreementDate || null,
      start_date:      rev.startDate || null,
      end_date:        rev.endDate || null,
      amount:          Number(rev.amount),
      payment_status:  rev.paymentStatus,
      // "Paid" means the whole amount landed. Storing anything else here would let
      // the status and the number disagree.
      amount_received: paid ? Number(rev.amount) : (Number(rev.amountReceived) || 0),
      payment_date:    rev.paymentDate || null,
      notes:           rev.notes?.trim() || null,
    }).select().single()
    if (error) throw error

    const rollback = async (err) => {
      await supabase.from('tree_revenue').delete().eq('id', data.id)
      throw err
    }

    const plantingIds = rev.plantingIds || []
    if (plantingIds.length) {
      const { error: itemError } = await supabase.from('tree_revenue_items').insert(
        plantingIds.map(id => ({ farm_id: farmId, revenue_id: data.id, planting_id: id }))
      )
      if (itemError) await rollback(itemError)
    }

    // Selling standing timber and cutting it are different days. The ledger tracks
    // what is on the ground, so it only moves when the manager says the trees came
    // down — which is why this is application logic and not a trigger on insert.
    if (rev.revenueType === 'timber_sale' && rev.felled && plantingIds.length) {
      const covered = get().plantings.filter(p => plantingIds.includes(p.id) && p.count > 0)
      if (covered.length) {
        const { error: logError } = await supabase.from('tree_count_logs').insert(
          covered.map(p => ({
            farm_id:     farmId,
            planting_id: p.id,
            log_date:    rev.agreementDate || today,
            change_type: 'felled',
            quantity:    -p.count,          // the sale takes the whole planting
            reason:      `Timber sale${rev.buyerName ? ` — ${rev.buyerName.trim()}` : ''}`,
          }))
        )
        if (logError) await rollback(logError)
      }
    }

    await get().load()
    return data
  },

  updatePayment: async (id, { paymentStatus, amountReceived, paymentDate, amount }) => {
    const { error } = await supabase.from('tree_revenue').update({
      payment_status:  paymentStatus,
      amount_received: paymentStatus === 'paid' ? Number(amount) : (Number(amountReceived) || 0),
      payment_date:    paymentDate || null,
    }).eq('id', id)
    if (error) throw error
    await get().load()
  },

  // Cascades to tree_revenue_items. Any `felled` rows it wrote are deliberately
  // left alone: the trees really were cut, and the sale record going away does not
  // put them back. A sale logged in error is undone in the count ledger with a
  // `correction`, which is what that change type is for.
  deleteRevenue: async (id) => {
    const { error } = await supabase.from('tree_revenue').delete().eq('id', id)
    if (error) throw error
    await get().load()
  },
}))

import React, { useState, useEffect } from 'react'
import { Plus, Trash2, AlertTriangle, CheckCircle2, X, UserPlus } from 'lucide-react'
import { useAppStore } from '../store'
import { useAuthStore } from '../store/auth'

const TABS = ['Crops', 'Cycles', 'Inventory', 'Labour', 'Plots', 'Users']

const PALETTE_COLORS = [
  '#DCBC28','#1D9E75','#BA7517','#4169E1','#C23B22',
  '#7B2D8B','#2AB5B5','#86B335','#E8742A','#E84393',
  '#8B4513','#1A3A5C','#FF6B6B','#5F8A5E','#8B2252',
]

const FARM_EMOJIS = [
  '🌾','🌽','🍃','🌱','🌻','🍀','🌲','🌳','🪴',
  '🍅','🥦','🥕','🧅','🧄','🫘','🥜','🌿','🌵',
  '🪵','🌰','🫛','🍂','☘️','🍁','🌴','🍋','🍇',
  '🍓','🫐','🍑','🍎','🍒','🌊','🪨','🧺','🪺',
]

export default function Admin() {
  const [tab, setTab] = useState('Crops')
  return (
    <div className="h-full flex flex-col bg-[#0f1117]">
      <div className="shrink-0 px-4 pt-4 pb-0">
        <h2 className="text-lg font-bold text-white">Admin — Masters</h2>
        <p className="text-xs text-white/40 mb-3">Manage crop types, cycles, inventory, labour</p>
        <div className="flex gap-2 border-b border-white/8 overflow-x-auto no-scrollbar">
          {TABS.map(t => (
            <button key={t} onClick={() => setTab(t)}
              className={`px-4 py-2.5 text-xs font-semibold border-b-2 transition-colors
                ${tab === t ? 'border-[#1D9E75] text-[#1D9E75]' : 'border-transparent text-white/40'}`}>
              {t}
            </button>
          ))}
        </div>
      </div>
      <div className="flex-1 overflow-y-auto">
        {tab === 'Crops'     && <CropsMaster />}
        {tab === 'Cycles'    && <CyclesMaster />}
        {tab === 'Inventory' && <InventoryMaster />}
        {tab === 'Labour'    && <LabourMaster />}
        {tab === 'Plots'     && <PlotsMaster />}
        {tab === 'Users'     && <UsersMaster />}
      </div>
    </div>
  )
}

// ── Crops ─────────────────────────────────────────────────────────────────────
function CropsMaster() {
  const { cropMaster, cropCycles, addCrop, deleteCrop } = useAppStore()
  const [form, setForm]   = useState(null)
  const [saving, setSaving] = useState(false)
  const [toast, setToast] = useState(null)
  const [toastType, setToastType] = useState('success')

  const showToast = (m, type = 'success') => {
    setToast(m); setToastType(type)
    setTimeout(() => setToast(null), 3000)
  }

  const save = async () => {
    if (!form.name || !form.duration_days) return
    setSaving(true)
    try {
      await addCrop(form)
      showToast('Crop saved to database ✓')
      setForm(null)
    } catch (e) {
      showToast('Save failed: ' + e.message, 'warn')
    }
    setSaving(false)
  }

  const handleDelete = async (id) => {
    try {
      const result = await deleteCrop(id)
      if (result?.blocked) {
        showToast(`Cannot delete — ${result.count} active cycle${result.count > 1 ? 's' : ''} use this crop`, 'warn')
      } else {
        showToast('Crop removed')
      }
    } catch (e) {
      showToast('Delete failed: ' + e.message, 'warn')
    }
  }

  const usedEmojis = new Set(cropMaster.map(c => c.emoji).filter(Boolean))
  const usedColors = new Set(cropMaster.map(c => c.color).filter(Boolean))
  const SEASONS = [
    { value: 'rabi',   label: 'Rabi (Winter)' },
    { value: 'kharif', label: 'Kharif (Monsoon)' },
    { value: 'zaid',   label: 'Zaid (Summer)' },
  ]

  return (
    <div className="p-4 space-y-3 pb-6">
      <button onClick={() => setForm({})}
        className="w-full flex items-center justify-center gap-2 py-3 border-2 border-dashed border-[#1D9E75]/30 rounded-2xl text-xs text-[#1D9E75] hover:border-[#1D9E75]/60">
        <Plus size={14} /> Add Crop to Master
      </button>

      {form !== null && (
        <div className="bg-[#161a23] rounded-2xl border border-[#1D9E75]/30 p-4 space-y-3">
          <p className="text-xs font-bold text-[#1D9E75]">New Crop</p>
          <FRow label="Crop name">
            <input className="finput" placeholder="e.g. Cotton"
              value={form.name || ''} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} />
          </FRow>
          <FRow label="Crop Icon">
            <div className="flex flex-wrap gap-1.5 mt-0.5">
              {FARM_EMOJIS.map(emoji => {
                const isUsed = usedEmojis.has(emoji)
                const isSel  = form.emoji === emoji
                return (
                  <button key={emoji} type="button"
                    onClick={() => !isUsed && setForm(p => ({ ...p, emoji }))}
                    className={`text-lg p-1 rounded-lg border transition-all ${isSel ? 'bg-[#1D9E75]/30 border-[#1D9E75] scale-110' : isUsed ? 'opacity-25 cursor-not-allowed border-transparent' : 'border-white/10 hover:border-white/30'}`}
                    title={isUsed ? 'Already used by another crop' : emoji}>
                    {emoji}
                  </button>
                )
              })}
            </div>
            {form.emoji && <p className="text-[10px] text-white/40 mt-1">Selected: {form.emoji}</p>}
          </FRow>
          <FRow label="Season">
            <select className="finput" value={form.season_type || ''} onChange={e => setForm(p => ({ ...p, season_type: e.target.value }))} style={{ background: '#1a2030' }}>
              <option value="" style={{ background: '#1a2030' }}>Select…</option>
              {SEASONS.map(s => <option key={s.value} value={s.value} style={{ background: '#1a2030' }}>{s.label}</option>)}
            </select>
          </FRow>
          <div className="grid grid-cols-2 gap-2">
            <FRow label="Growing days">
              <input type="number" className="finput" placeholder="120"
                value={form.duration_days || ''} onChange={e => setForm(p => ({ ...p, duration_days: e.target.value }))} />
            </FRow>
            <FRow label="Harvest window (days)">
              <input type="number" className="finput" placeholder="14"
                value={form.harvest_window_days || ''} onChange={e => setForm(p => ({ ...p, harvest_window_days: e.target.value }))} />
            </FRow>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <FRow label="Yield/acre (qtl)">
              <input type="number" className="finput"
                value={form.yieldPerAcre || ''} onChange={e => setForm(p => ({ ...p, yieldPerAcre: e.target.value }))} />
            </FRow>
            <FRow label="Price/qtl (₹)">
              <input type="number" className="finput"
                value={form.pricePerQtl || ''} onChange={e => setForm(p => ({ ...p, pricePerQtl: e.target.value }))} />
            </FRow>
          </div>
          <FRow label="Map colour">
            <div className="flex flex-wrap gap-2 mt-0.5">
              {PALETTE_COLORS.map(color => {
                const isUsed = usedColors.has(color)
                const isSel  = form.color === color
                return (
                  <button key={color} type="button"
                    onClick={() => !isUsed && setForm(p => ({ ...p, color }))}
                    className={`w-8 h-8 rounded-lg border-2 relative transition-all ${isSel ? 'border-white scale-110' : isUsed ? 'opacity-30 cursor-not-allowed border-transparent' : 'border-transparent hover:border-white/50'}`}
                    style={{ background: color }} title={isUsed ? 'Used by another crop' : color}>
                    {isUsed && <span className="absolute inset-0 flex items-center justify-center text-white text-xs font-bold">✕</span>}
                  </button>
                )
              })}
            </div>
            {form.color && (
              <div className="flex items-center gap-2 mt-1.5">
                <div className="w-3 h-3 rounded" style={{ background: form.color }} />
                <span className="text-[10px] text-white/40">{form.color}</span>
              </div>
            )}
          </FRow>
          <div className="flex gap-2">
            <button onClick={save} disabled={saving}
              className="flex-1 py-2.5 bg-[#1D9E75] text-white text-xs font-bold rounded-xl disabled:opacity-40">
              {saving ? 'Saving…' : 'Save to Database'}
            </button>
            <button onClick={() => setForm(null)} className="px-4 py-2.5 bg-white/8 text-white/60 text-xs rounded-xl">Cancel</button>
          </div>
        </div>
      )}

      {cropMaster.map(c => {
        const activeCycles = cropCycles.filter(cc => cc.cropId === c.id && cc.status === 'active').length
        return (
          <div key={c.id} className="bg-[#161a23] rounded-2xl border border-white/8 p-4 flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg shrink-0" style={{ background: c.color }} />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-white">{c.emoji} {c.name}</p>
              <p className="text-[10px] text-white/40">{c.duration_days}d · {c.yieldPerAcre} qtl/ac · ₹{c.pricePerQtl}/qtl</p>
              {activeCycles > 0 && <p className="text-[10px] text-[#1D9E75] mt-0.5">{activeCycles} active cycle{activeCycles > 1 ? 's' : ''}</p>}
            </div>
            <button onClick={() => handleDelete(c.id)} className="text-white/20 hover:text-[#E24B4A] shrink-0 ml-2">
              <Trash2 size={15} />
            </button>
          </div>
        )
      })}
      {toast && <Toast msg={toast} type={toastType} />}
      <Style />
    </div>
  )
}

// ── Inventory ─────────────────────────────────────────────────────────────────
function InventoryMaster() {
  const { inventoryMaster, addInventoryItem, deleteInventoryItem } = useAppStore()
  const [form, setForm]     = useState(null)
  const [saving, setSaving] = useState(false)
  const [toast, setToast]   = useState(null)
  const [toastType, setToastType] = useState('success')

  const showToast = (m, type = 'success') => {
    setToast(m); setToastType(type)
    setTimeout(() => setToast(null), 3000)
  }

  const CATS = ['seed', 'fertilizer', 'chemical', 'fuel', 'other']
  const CAT_LABEL = { seed: 'Seed', fertilizer: 'Fertilizer', chemical: 'Chemical', fuel: 'Fuel', other: 'Other' }

  const save = async () => {
    if (!form.name || !form.category || !form.unit) return
    setSaving(true)
    try {
      await addInventoryItem(form)
      showToast('Item saved to database ✓')
      setForm(null)
    } catch (e) {
      showToast('Save failed: ' + e.message, 'warn')
    }
    setSaving(false)
  }

  const handleDelete = async (id) => {
    try {
      const result = await deleteInventoryItem(id)
      if (result?.blocked) {
        showToast('Cannot delete — item has purchase or issue records', 'warn')
      } else {
        showToast('Item removed')
      }
    } catch (e) {
      showToast('Delete failed: ' + e.message, 'warn')
    }
  }

  return (
    <div className="p-4 space-y-3 pb-6">
      <button onClick={() => setForm({ category: 'fertilizer' })}
        className="w-full flex items-center justify-center gap-2 py-3 border-2 border-dashed border-[#1D9E75]/30 rounded-2xl text-xs text-[#1D9E75] hover:border-[#1D9E75]/60">
        <Plus size={14} /> Add Inventory Item
      </button>

      {form !== null && (
        <div className="bg-[#161a23] rounded-2xl border border-[#1D9E75]/30 p-4 space-y-3">
          <p className="text-xs font-bold text-[#1D9E75]">New Item</p>
          <FRow label="Name">
            <input className="finput" placeholder="e.g. DAP"
              value={form.name || ''} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} />
          </FRow>
          <FRow label="Category">
            <select className="finput" value={form.category || ''} onChange={e => setForm(p => ({ ...p, category: e.target.value }))} style={{ background: '#1a2030' }}>
              {CATS.map(c => <option key={c} value={c} style={{ background: '#1a2030' }}>{CAT_LABEL[c]}</option>)}
            </select>
          </FRow>
          <div className="grid grid-cols-2 gap-2">
            <FRow label="Unit">
              <input className="finput" placeholder="kg / litre / bag"
                value={form.unit || ''} onChange={e => setForm(p => ({ ...p, unit: e.target.value }))} />
            </FRow>
            <FRow label="Cost/unit (₹)">
              <input type="number" className="finput"
                value={form.costPerUnit || ''} onChange={e => setForm(p => ({ ...p, costPerUnit: e.target.value }))} />
            </FRow>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <FRow label="Min stock alert">
              <input type="number" className="finput" placeholder="0"
                value={form.minThreshold || ''} onChange={e => setForm(p => ({ ...p, minThreshold: e.target.value }))} />
            </FRow>
            <FRow label="Supplier (optional)">
              <input className="finput"
                value={form.supplier || ''} onChange={e => setForm(p => ({ ...p, supplier: e.target.value }))} />
            </FRow>
          </div>
          <div className="flex gap-2">
            <button onClick={save} disabled={saving}
              className="flex-1 py-2.5 bg-[#1D9E75] text-white text-xs font-bold rounded-xl disabled:opacity-40">
              {saving ? 'Saving…' : 'Save to Database'}
            </button>
            <button onClick={() => setForm(null)} className="px-4 py-2.5 bg-white/8 text-white/60 text-xs rounded-xl">Cancel</button>
          </div>
        </div>
      )}

      {inventoryMaster.map(i => (
        <div key={i.id} className="bg-[#161a23] rounded-2xl border border-white/8 p-4 flex items-center justify-between">
          <div>
            <p className="text-sm font-semibold text-white">{i.name}</p>
            <p className="text-[10px] text-white/40">{CAT_LABEL[i.category]} · {i.unit} · ₹{i.costPerUnit}/unit · min {i.minThreshold}</p>
            <p className="text-[10px] text-[#1D9E75] mt-0.5">Stock: {i.currentStock} {i.unit}</p>
          </div>
          <button onClick={() => handleDelete(i.id)} className="text-white/20 hover:text-[#E24B4A] ml-3">
            <Trash2 size={15} />
          </button>
        </div>
      ))}
      {toast && <Toast msg={toast} type={toastType} />}
      <Style />
    </div>
  )
}

// ── Labour ────────────────────────────────────────────────────────────────────
const WORK_TYPES = ['Farm Worker', 'Driver', 'Cook', 'Cleaning', 'Watchman', 'Gardener', 'Mechanic', 'Other']

function LabourMaster() {
  const { regularLabourers, contractualLabour, addRegularLabourer, deleteRegularLabourer, addContractualLabour, deleteContractualLabour } = useAppStore()
  const [tab, setTab]       = useState('regular')
  const [form, setForm]     = useState(null)
  const [saving, setSaving] = useState(false)
  const [toast, setToast]   = useState(null)

  const showToast = (m) => { setToast(m); setTimeout(() => setToast(null), 2500) }

  const saveRegular = async () => {
    if (!form.name || !form.workType) return
    setSaving(true)
    try {
      await addRegularLabourer(form)
      showToast('Labourer saved to database ✓')
      setForm(null)
    } catch (e) {
      showToast('Save failed: ' + e.message)
    }
    setSaving(false)
  }

  const saveContractual = async () => {
    if (!form.name || !form.defaultRate) return
    setSaving(true)
    try {
      await addContractualLabour(form)
      showToast('Category saved to database ✓')
      setForm(null)
    } catch (e) {
      showToast('Save failed: ' + e.message)
    }
    setSaving(false)
  }

  const handleDeleteRegular = async (id) => {
    try {
      await deleteRegularLabourer(id)
      showToast('Labourer removed')
    } catch (e) {
      showToast('Delete failed: ' + e.message)
    }
  }

  const handleDeleteContractual = async (id) => {
    try {
      await deleteContractualLabour(id)
      showToast('Category removed')
    } catch (e) {
      showToast('Delete failed: ' + e.message)
    }
  }

  return (
    <div className="p-4 space-y-3 pb-6">
      <div className="flex gap-1 bg-[#161a23] rounded-xl p-1">
        {[['regular', '👤 Regular'], ['contractual', '🏗️ Contractual']].map(([k, lbl]) => (
          <button key={k} onClick={() => { setTab(k); setForm(null) }}
            className={`flex-1 py-2 text-xs font-semibold rounded-lg transition-colors ${tab === k ? 'bg-[#1D9E75] text-white' : 'text-white/40'}`}>
            {lbl}
          </button>
        ))}
      </div>

      {tab === 'regular' && (<>
        <p className="text-[11px] text-white/30 px-1">People you regularly call — tracked by name, work type and rate.</p>
        <button onClick={() => setForm({ workType: 'Farm Worker' })}
          className="w-full flex items-center justify-center gap-2 py-3 border-2 border-dashed border-[#1D9E75]/30 rounded-2xl text-xs text-[#1D9E75] hover:border-[#1D9E75]/60">
          <Plus size={14} /> Add Regular Labourer
        </button>
        {form !== null && (
          <div className="bg-[#161a23] rounded-2xl border border-[#1D9E75]/30 p-4 space-y-3">
            <p className="text-xs font-bold text-[#1D9E75]">New Regular Labourer</p>
            <FRow label="Full name">
              <input className="finput" placeholder="e.g. Ramesh Kumar"
                value={form.name || ''} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} />
            </FRow>
            <FRow label="Kind of work">
              <select className="finput" value={form.workType || ''} onChange={e => setForm(p => ({ ...p, workType: e.target.value }))} style={{ background: '#1a2030' }}>
                {WORK_TYPES.map(w => <option key={w} value={w} style={{ background: '#1a2030' }}>{w}</option>)}
              </select>
            </FRow>
            <div className="grid grid-cols-2 gap-2">
              <FRow label="Rate/day (₹)">
                <input type="number" className="finput" placeholder="400"
                  value={form.ratePerDay || ''} onChange={e => setForm(p => ({ ...p, ratePerDay: e.target.value }))} />
              </FRow>
              <FRow label="Phone">
                <input type="tel" className="finput" placeholder="optional"
                  value={form.phone || ''} onChange={e => setForm(p => ({ ...p, phone: e.target.value }))} />
              </FRow>
            </div>
            <div className="flex gap-2">
              <button onClick={saveRegular} disabled={saving}
                className="flex-1 py-2.5 bg-[#1D9E75] text-white text-xs font-bold rounded-xl disabled:opacity-40">
                {saving ? 'Saving…' : 'Save to Database'}
              </button>
              <button onClick={() => setForm(null)} className="px-4 py-2.5 bg-white/8 text-white/60 text-xs rounded-xl">Cancel</button>
            </div>
          </div>
        )}
        {regularLabourers.map(l => (
          <div key={l.id} className="bg-[#161a23] rounded-2xl border border-white/8 p-4 flex items-center gap-3">
            <div className="w-9 h-9 rounded-full bg-[#1D9E75]/15 flex items-center justify-center text-sm font-bold text-[#1D9E75] shrink-0">
              {l.name.charAt(0)}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-white">{l.name}</p>
              <p className="text-[10px] text-white/40">{l.workType} · ₹{l.ratePerDay}/day{l.phone ? ` · ${l.phone}` : ''}</p>
            </div>
            <button onClick={() => handleDeleteRegular(l.id)} className="text-white/15 hover:text-[#E24B4A] shrink-0">
              <Trash2 size={15} />
            </button>
          </div>
        ))}
      </>)}

      {tab === 'contractual' && (<>
        <p className="text-[11px] text-white/30 px-1">Bulk workers for harvesting, ploughing etc. Tracked by category.</p>
        <button onClick={() => setForm({})}
          className="w-full flex items-center justify-center gap-2 py-3 border-2 border-dashed border-[#1D9E75]/30 rounded-2xl text-xs text-[#1D9E75] hover:border-[#1D9E75]/60">
          <Plus size={14} /> Add Labour Category
        </button>
        {form !== null && (
          <div className="bg-[#161a23] rounded-2xl border border-[#1D9E75]/30 p-4 space-y-3">
            <p className="text-xs font-bold text-[#1D9E75]">New Category</p>
            <FRow label="Category name">
              <input className="finput" placeholder="e.g. Harvesting Labour"
                value={form.name || ''} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} />
            </FRow>
            <FRow label="Standard rate/day (₹)">
              <input type="number" className="finput" placeholder="400"
                value={form.defaultRate || ''} onChange={e => setForm(p => ({ ...p, defaultRate: e.target.value }))} />
            </FRow>
            <div className="flex gap-2">
              <button onClick={saveContractual} disabled={saving}
                className="flex-1 py-2.5 bg-[#1D9E75] text-white text-xs font-bold rounded-xl disabled:opacity-40">
                {saving ? 'Saving…' : 'Save to Database'}
              </button>
              <button onClick={() => setForm(null)} className="px-4 py-2.5 bg-white/8 text-white/60 text-xs rounded-xl">Cancel</button>
            </div>
          </div>
        )}
        {contractualLabour.map(l => (
          <div key={l.id} className="bg-[#161a23] rounded-2xl border border-white/8 p-4 flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold text-white">{l.name}</p>
              <p className="text-[10px] text-white/40">₹{l.defaultRate}/day standard rate</p>
            </div>
            <button onClick={() => handleDeleteContractual(l.id)} className="text-white/15 hover:text-[#E24B4A]">
              <Trash2 size={15} />
            </button>
          </div>
        ))}
      </>)}

      {toast && <Toast msg={toast} />}
      <Style />
    </div>
  )
}

// ── Plots — full CRUD with GPS boundary points ────────────────────────────────
const SOIL_TYPES   = ['loamy', 'clay', 'sandy', 'black', 'red', 'silty', 'other']
const WATER_SRCS   = ['borewell', 'canal', 'rain-fed', 'river', 'drip', 'other']
const EMPTY_PLOT   = { name:'', area_acres:'', soil_type:'loamy', water_source:'borewell',
  point_a_lat:'', point_a_lng:'', point_b_lat:'', point_b_lng:'',
  point_c_lat:'', point_c_lng:'', point_d_lat:'', point_d_lng:'' }

function PlotsMaster() {
  const { plots, cropCycles, addPlot, updatePlot, deletePlot } = useAppStore()
  const [form,      setForm]    = useState(null)   // null = closed, {} = new, {id,...} = edit
  const [saving,    setSaving]  = useState(false)
  const [toast,     setToast]   = useState(null)

  const showToast = (m, type = 'success') => { setToast({ m, type }); setTimeout(() => setToast(null), 3000) }
  const f = (field, val) => setForm(p => ({ ...p, [field]: val }))

  const hasAllPoints = (d) =>
    d.point_a_lat && d.point_a_lng && d.point_b_lat && d.point_b_lng &&
    d.point_c_lat && d.point_c_lng && d.point_d_lat && d.point_d_lng

  const save = async () => {
    if (!form.name || !form.area_acres) return showToast('Name and area are required', 'warn')
    setSaving(true)
    try {
      if (form.id) {
        await updatePlot(form.id, form)
        showToast('Plot updated ✓')
      } else {
        await addPlot(form)
        showToast('Plot added ✓')
      }
      setForm(null)
    } catch (e) { showToast('Save failed: ' + e.message, 'warn') }
    setSaving(false)
  }

  const handleDelete = async (id) => {
    try {
      const res = await deletePlot(id)
      if (res?.blocked) showToast('Cannot delete — plot has active crop cycles', 'warn')
      else showToast('Plot removed')
    } catch (e) { showToast('Delete failed: ' + e.message, 'warn') }
  }

  const PointRow = ({ label, latKey, lngKey }) => (
    <div className="flex items-center gap-2">
      <span className="text-xs font-mono font-semibold text-[#1D9E75] w-6 shrink-0">{label}</span>
      <div className="flex-1">
        <input type="number" step="any" placeholder="Latitude (28.xxx)"
          value={form?.[latKey] || ''}
          onChange={e => f(latKey, e.target.value)}
          className="w-full bg-white/8 border border-white/12 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-[#1D9E75]" />
      </div>
      <div className="flex-1">
        <input type="number" step="any" placeholder="Longitude (80.xxx)"
          value={form?.[lngKey] || ''}
          onChange={e => f(lngKey, e.target.value)}
          className="w-full bg-white/8 border border-white/12 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-[#1D9E75]" />
      </div>
    </div>
  )

  return (
    <div className="p-4 space-y-3 pb-6">
      <button onClick={() => setForm({ ...EMPTY_PLOT })}
        className="w-full flex items-center justify-center gap-2 py-3 border-2 border-dashed border-[#1D9E75]/30 rounded-2xl text-xs text-[#1D9E75] hover:border-[#1D9E75]/60">
        <Plus size={14} /> Add New Plot
      </button>

      {form !== null && (
        <div className="bg-[#161a23] rounded-2xl border border-[#1D9E75]/30 p-4 space-y-3">
          <p className="text-xs font-bold text-[#1D9E75]">{form.id ? 'Edit Plot' : 'New Plot'}</p>

          <div className="grid grid-cols-2 gap-2">
            <FRow label="Plot name">
              <input className="finput" placeholder="e.g. Plot A"
                value={form.name || ''} onChange={e => f('name', e.target.value)} />
            </FRow>
            <FRow label="Area (acres)">
              <input type="number" step="0.5" className="finput" placeholder="2.0"
                value={form.area_acres || ''} onChange={e => f('area_acres', e.target.value)} />
            </FRow>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <FRow label="Soil type">
              <select className="finput" value={form.soil_type || ''} onChange={e => f('soil_type', e.target.value)} style={{ background: '#1a2030' }}>
                {SOIL_TYPES.map(s => <option key={s} value={s} style={{ background: '#1a2030' }}>{s.charAt(0).toUpperCase()+s.slice(1)}</option>)}
              </select>
            </FRow>
            <FRow label="Water source">
              <select className="finput" value={form.water_source || ''} onChange={e => f('water_source', e.target.value)} style={{ background: '#1a2030' }}>
                {WATER_SRCS.map(w => <option key={w} value={w} style={{ background: '#1a2030' }}>{w.charAt(0).toUpperCase()+w.slice(1)}</option>)}
              </select>
            </FRow>
          </div>

          <div className="border-t border-white/8 pt-3">
            <p className="text-[10px] text-white/40 mb-2">GPS boundary corners — A→B→C→D→A draws the plot on the map</p>
            <div className="grid grid-cols-2 gap-[2px] text-[9px] text-white/30 px-7 mb-1">
              <span>Latitude</span><span>Longitude</span>
            </div>
            <div className="space-y-2">
              <PointRow label="A" latKey="point_a_lat" lngKey="point_a_lng" />
              <PointRow label="B" latKey="point_b_lat" lngKey="point_b_lng" />
              <PointRow label="C" latKey="point_c_lat" lngKey="point_c_lng" />
              <PointRow label="D" latKey="point_d_lat" lngKey="point_d_lng" />
            </div>
            {!hasAllPoints(form || {}) && (
              <p className="text-[10px] text-[#BA7517] mt-1.5">⚠ Fill all 4 points to draw on map</p>
            )}
          </div>

          <div className="flex gap-2">
            <button onClick={save} disabled={saving}
              className="flex-1 py-2.5 bg-[#1D9E75] text-white text-xs font-bold rounded-xl disabled:opacity-40">
              {saving ? 'Saving…' : form.id ? 'Update Plot' : 'Save to Database'}
            </button>
            <button onClick={() => setForm(null)} className="px-4 py-2.5 bg-white/8 text-white/60 text-xs rounded-xl">Cancel</button>
          </div>
        </div>
      )}

      {plots.map(plot => {
        const hasPoints = plot.point_a_lat && plot.point_a_lng
        const activeCycles = cropCycles.filter(c => c.plotId === plot.id && c.status === 'active').length
        return (
          <div key={plot.id} className="bg-[#161a23] rounded-2xl border border-white/8 p-4">
            <div className="flex items-start justify-between">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-white">{plot.name}</p>
                <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-0.5">
                  <span className="text-[10px] text-white/40">{plot.area_acres} acres</span>
                  {plot.soil_type   && <span className="text-[10px] text-white/30">{plot.soil_type}</span>}
                  {plot.water_source && <span className="text-[10px] text-white/30">{plot.water_source}</span>}
                </div>
                {hasPoints ? (
                  <div className="mt-1 grid grid-cols-2 gap-x-4 gap-y-0.5">
                    {[['A', plot.point_a_lat, plot.point_a_lng], ['B', plot.point_b_lat, plot.point_b_lng],
                      ['C', plot.point_c_lat, plot.point_c_lng], ['D', plot.point_d_lat, plot.point_d_lng]].map(([lbl, lat, lng]) => (
                      <span key={lbl} className="text-[9px] text-[#1D9E75]/70 font-mono">
                        {lbl}: {Number(lat).toFixed(5)}, {Number(lng).toFixed(5)}
                      </span>
                    ))}
                  </div>
                ) : (
                  <p className="text-[10px] text-[#BA7517]/70 mt-0.5">No boundary set</p>
                )}
                {activeCycles > 0 && <p className="text-[10px] text-[#1D9E75] mt-0.5">{activeCycles} active cycle{activeCycles > 1 ? 's' : ''}</p>}
              </div>
              <div className="flex items-center gap-2 ml-3 shrink-0">
                <button onClick={() => setForm({
                  id: plot.id, name: plot.name, area_acres: String(plot.area_acres || ''),
                  soil_type: plot.soil_type || 'loamy', water_source: plot.water_source || 'borewell',
                  point_a_lat: String(plot.point_a_lat || ''), point_a_lng: String(plot.point_a_lng || ''),
                  point_b_lat: String(plot.point_b_lat || ''), point_b_lng: String(plot.point_b_lng || ''),
                  point_c_lat: String(plot.point_c_lat || ''), point_c_lng: String(plot.point_c_lng || ''),
                  point_d_lat: String(plot.point_d_lat || ''), point_d_lng: String(plot.point_d_lng || ''),
                })} className="text-xs text-[#1D9E75] px-2 py-1 border border-[#1D9E75]/30 rounded-lg hover:bg-[#1D9E75]/10 transition-colors">
                  Edit
                </button>
                <button onClick={() => handleDelete(plot.id)} className="text-white/20 hover:text-[#E24B4A]">
                  <Trash2 size={15} />
                </button>
              </div>
            </div>
          </div>
        )
      })}

      {toast && <Toast msg={toast.m} type={toast.type} />}
      <Style />
    </div>
  )
}

// ── Users ─────────────────────────────────────────────────────────────────────
const ROLES = [
  { value: 'admin',     label: 'Admin',     color: '#1D9E75', desc: 'Full access including masters' },
  { value: 'manager',   label: 'Manager',   color: '#BA7517', desc: 'Log activities, issue inventory' },
  { value: 'view_only', label: 'View Only', color: '#888',    desc: 'View + save media only' },
]

function UsersMaster() {
  const { users, loadUsers, createUser, updateUser, deactivateUser, reactivateUser, profile: me } = useAuthStore()
  const [form,    setForm]    = useState(null)
  const [saving,  setSaving]  = useState(false)
  const [toast,   setToast]   = useState(null)

  useEffect(() => { loadUsers() }, [])

  const showToast = (m, type = 'success') => { setToast({ m, type }); setTimeout(() => setToast(null), 3000) }

  const save = async () => {
    if (!form.email || !form.password || !form.full_name || !form.role)
      return showToast('All fields are required', 'warn')
    if (form.password.length < 6)
      return showToast('Password must be at least 6 characters', 'warn')
    setSaving(true)
    try {
      await createUser(form)
      showToast('User created ✓')
      setForm(null)
    } catch (e) { showToast(e.message, 'warn') }
    setSaving(false)
  }

  const changeRole = async (id, role) => {
    try {
      await updateUser(id, { role })
      showToast('Role updated ✓')
    } catch (e) { showToast(e.message, 'warn') }
  }

  const toggleActive = async (user) => {
    try {
      if (user.is_active) { await deactivateUser(user.id); showToast('User deactivated') }
      else               { await reactivateUser(user.id); showToast('User reactivated') }
    } catch (e) { showToast(e.message, 'warn') }
  }

  const roleStyle = (role) => {
    const r = ROLES.find(x => x.value === role)
    return r ? { color: r.color, background: r.color + '20', border: r.color + '40' } : {}
  }

  return (
    <div className="p-4 space-y-3 pb-6">
      <button onClick={() => setForm({ email:'', password:'', full_name:'', role:'manager', phone:'' })}
        className="w-full flex items-center justify-center gap-2 py-3 border-2 border-dashed border-[#1D9E75]/30 rounded-2xl text-xs text-[#1D9E75] hover:border-[#1D9E75]/60">
        <UserPlus size={14} /> Add New User
      </button>

      {form !== null && (
        <div className="bg-[#161a23] rounded-2xl border border-[#1D9E75]/30 p-4 space-y-3">
          <p className="text-xs font-bold text-[#1D9E75]">New User</p>
          <div className="grid grid-cols-2 gap-2">
            <FRow label="Full name">
              <input className="finput" placeholder="Ramesh Kumar"
                value={form.full_name} onChange={e => setForm(p => ({ ...p, full_name: e.target.value }))} />
            </FRow>
            <FRow label="Phone (optional)">
              <input className="finput" placeholder="9876543210"
                value={form.phone} onChange={e => setForm(p => ({ ...p, phone: e.target.value }))} />
            </FRow>
          </div>
          <FRow label="Email">
            <input type="email" className="finput" placeholder="user@example.com"
              value={form.email} onChange={e => setForm(p => ({ ...p, email: e.target.value }))} />
          </FRow>
          <FRow label="Password">
            <input type="password" className="finput" placeholder="Min. 6 characters"
              value={form.password} onChange={e => setForm(p => ({ ...p, password: e.target.value }))} />
          </FRow>
          <FRow label="Role">
            <div className="space-y-1.5 mt-0.5">
              {ROLES.map(r => (
                <button key={r.value} type="button"
                  onClick={() => setForm(p => ({ ...p, role: r.value }))}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl border transition-all text-left ${form.role === r.value ? 'border-[#1D9E75]/60 bg-[#1D9E75]/10' : 'border-white/8 bg-white/4'}`}>
                  <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: r.color }} />
                  <div>
                    <p className="text-xs font-semibold text-white">{r.label}</p>
                    <p className="text-[10px] text-white/35">{r.desc}</p>
                  </div>
                  {form.role === r.value && <span className="ml-auto text-[#1D9E75] text-xs">✓</span>}
                </button>
              ))}
            </div>
          </FRow>
          <div className="flex gap-2">
            <button onClick={save} disabled={saving}
              className="flex-1 py-2.5 bg-[#1D9E75] text-white text-xs font-bold rounded-xl disabled:opacity-40">
              {saving ? 'Creating…' : 'Create User'}
            </button>
            <button onClick={() => setForm(null)} className="px-4 py-2.5 bg-white/8 text-white/60 text-xs rounded-xl">Cancel</button>
          </div>
        </div>
      )}

      {users.map(user => {
        const isSelf = user.id === me?.id
        return (
          <div key={user.id} className={`bg-[#161a23] rounded-2xl border p-4 ${user.is_active ? 'border-white/8' : 'border-white/4 opacity-50'}`}>
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="text-sm font-semibold text-white">{user.full_name}</p>
                  <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded border" style={roleStyle(user.role)}>
                    {ROLES.find(r => r.value === user.role)?.label}
                  </span>
                  {!user.is_active && <span className="text-[9px] text-[#E24B4A] bg-[#E24B4A]/10 px-1.5 py-0.5 rounded">Inactive</span>}
                  {isSelf && <span className="text-[9px] text-white/30 bg-white/5 px-1.5 py-0.5 rounded">You</span>}
                </div>
                <p className="text-[10px] text-white/40 mt-0.5">{user.email}</p>
                {user.phone && <p className="text-[10px] text-white/30">{user.phone}</p>}
              </div>
              {!isSelf && (
                <div className="flex items-center gap-2 shrink-0">
                  <select value={user.role}
                    onChange={e => changeRole(user.id, e.target.value)}
                    className="text-[10px] bg-white/8 border border-white/12 rounded-lg px-1.5 py-1 text-white focus:outline-none"
                    style={{ background: '#1a2030' }}>
                    {ROLES.map(r => <option key={r.value} value={r.value} style={{ background: '#1a2030' }}>{r.label}</option>)}
                  </select>
                  <button onClick={() => toggleActive(user)}
                    className={`text-[10px] px-2 py-1 rounded-lg border transition-colors ${user.is_active ? 'border-[#E24B4A]/30 text-[#E24B4A] hover:bg-[#E24B4A]/10' : 'border-[#1D9E75]/30 text-[#1D9E75] hover:bg-[#1D9E75]/10'}`}>
                    {user.is_active ? 'Deactivate' : 'Reactivate'}
                  </button>
                </div>
              )}
            </div>
          </div>
        )
      })}

      {users.length === 0 && <p className="text-xs text-white/30 text-center py-6">No users yet.</p>}
      {toast && <Toast msg={toast.m} type={toast.type} />}
      <Style />
    </div>
  )
}

// ── Shared ────────────────────────────────────────────────────────────────────
const FRow = ({ label, children }) => (
  <div><label className="text-xs font-medium text-white/50 block mb-1.5">{label}</label>{children}</div>
)

function Toast({ msg, type = 'success' }) {
  const bg   = type === 'warn' ? '#BA7517' : '#1D9E75'
  const Icon = type === 'warn' ? AlertTriangle : CheckCircle2
  return (
    <div className="fixed bottom-24 left-4 right-4 px-4 py-3 rounded-2xl text-sm font-medium text-white shadow-xl z-50 flex items-center gap-2"
      style={{ background: bg }}>
      <Icon size={16} /> {msg}
    </div>
  )
}

const Style = () => (
  <style>{`.finput{width:100%;background:rgba(255,255,255,0.08);border:1px solid rgba(255,255,255,0.12);border-radius:12px;padding:10px 14px;color:white;font-size:14px;outline:none;}.finput:focus{border-color:#1D9E75;}.no-scrollbar::-webkit-scrollbar{display:none}.no-scrollbar{-ms-overflow-style:none;scrollbar-width:none}`}</style>
)

// ── Cycles Master — start / view crop cycles ───────────────────────────────────
function CyclesMaster() {
  const { cropCycles, cropMaster, plots, addCropCycle, updateCropCycle } = useAppStore()
  const [form,   setForm]   = useState(null)
  const [saving, setSaving] = useState(false)
  const [toast,  setToast]  = useState(null)
  const [toastType, setToastType] = useState('success')

  const showToast = (m, type = 'success') => {
    setToast(m); setToastType(type); setTimeout(() => setToast(null), 3000)
  }

  // Plots that already have an active cycle
  const activePlotIds = new Set(cropCycles.filter(c => c.status === 'active').map(c => c.plotId))

  const save = async () => {
    if (!form.plotId || !form.cropId || !form.sowDate || !form.season) {
      return showToast('Fill all fields', 'warn')
    }
    // Warn if plot already has active cycle
    if (activePlotIds.has(form.plotId)) {
      return showToast('This plot already has an active cycle. End the existing cycle first.', 'warn')
    }
    setSaving(true)
    try {
      const crop = cropMaster.find(c => c.id === form.cropId)
      const sow  = new Date(form.sowDate)
      const harv = new Date(sow)
      harv.setDate(harv.getDate() + (crop?.duration_days || 120))
      await addCropCycle({
        plotId:      form.plotId,
        cropId:      form.cropId,
        season:      form.season,
        sowDate:     form.sowDate,
        harvestDate: harv.toISOString().slice(0, 10),
        budget:      parseFloat(form.budget) || null,
      })
      showToast('Crop cycle started ✓')
      setForm(null)
    } catch (e) { showToast('Failed: ' + e.message, 'warn') }
    setSaving(false)
  }

  const endCycle = async (id) => {
    try {
      await updateCropCycle(id, { status: 'harvested' })
      showToast('Cycle marked as harvested')
    } catch (e) { showToast('Failed: ' + e.message, 'warn') }
  }

  const today = new Date().toISOString().slice(0, 10)
  const activeCycles   = cropCycles.filter(c => c.status === 'active')
  const inactiveCycles = cropCycles.filter(c => c.status !== 'active')

  // Plots without active cycles (available for new sowing)
  const availablePlots = plots.filter(p => !activePlotIds.has(p.id))

  return (
    <div className="p-4 space-y-3 pb-6">
      <button onClick={() => setForm({ sowDate: today })}
        className="w-full flex items-center justify-center gap-2 py-3 border-2 border-dashed border-[#1D9E75]/30 rounded-2xl text-xs text-[#1D9E75] hover:border-[#1D9E75]/60">
        <Plus size={14} /> Start New Crop Cycle
      </button>

      {form !== null && (
        <div className="bg-[#161a23] rounded-2xl border border-[#1D9E75]/30 p-4 space-y-3">
          <p className="text-xs font-bold text-[#1D9E75]">New Crop Cycle</p>

          <FRow label="Plot (empty plots only)">
            <select className="finput" value={form.plotId || ''} onChange={e => setForm(p => ({ ...p, plotId: e.target.value }))} style={{ background: '#1a2030' }}>
              <option value="" style={{ background: '#1a2030' }}>Select plot…</option>
              {availablePlots.map(p => (
                <option key={p.id} value={p.id} style={{ background: '#1a2030' }}>{p.name}</option>
              ))}
              {availablePlots.length === 0 && (
                <option disabled style={{ background: '#1a2030' }}>All plots have active cycles</option>
              )}
            </select>
            {availablePlots.length === 0 && (
              <p className="text-[10px] text-[#BA7517] mt-1">⚠ All plots have active cycles. End a cycle before starting a new one.</p>
            )}
          </FRow>

          <FRow label="Crop">
            <select className="finput" value={form.cropId || ''} onChange={e => setForm(p => ({ ...p, cropId: e.target.value }))} style={{ background: '#1a2030' }}>
              <option value="" style={{ background: '#1a2030' }}>Select crop…</option>
              {cropMaster.map(c => (
                <option key={c.id} value={c.id} style={{ background: '#1a2030' }}>{c.emoji} {c.name} ({c.duration_days} days)</option>
              ))}
            </select>
          </FRow>

          <div className="grid grid-cols-2 gap-2">
            <FRow label="Sow Date">
              <input type="date" className="finput" value={form.sowDate || ''} onChange={e => setForm(p => ({ ...p, sowDate: e.target.value }))} style={{ colorScheme: 'dark' }} />
            </FRow>
            <FRow label="Season">
              <select className="finput" value={form.season || ''} onChange={e => setForm(p => ({ ...p, season: e.target.value }))} style={{ background: '#1a2030' }}>
                <option value="" style={{ background: '#1a2030' }}>Select…</option>
                {['kharif_2025','rabi_2025','kharif_2026','rabi_2026','zaid_2026','kharif_2027','rabi_2027'].map(s => (
                  <option key={s} value={s} style={{ background: '#1a2030' }}>{s}</option>
                ))}
              </select>
            </FRow>
          </div>

          <FRow label="Budget (₹, optional)">
            <input type="number" className="finput" placeholder="Expected spend" value={form.budget || ''} onChange={e => setForm(p => ({ ...p, budget: e.target.value }))} />
          </FRow>

          {form.cropId && form.sowDate && (() => {
            const crop = cropMaster.find(c => c.id === form.cropId)
            if (!crop) return null
            const harv = new Date(form.sowDate)
            harv.setDate(harv.getDate() + crop.duration_days)
            return (
              <div className="bg-white/5 rounded-xl px-3 py-2 text-xs text-white/50">
                Expected harvest: <span className="text-white font-semibold">{harv.toISOString().slice(0, 10)}</span>
                {' '}(day {crop.duration_days})
              </div>
            )
          })()}

          <div className="flex gap-2">
            <button onClick={save} disabled={saving || availablePlots.length === 0}
              className="flex-1 py-2.5 bg-[#1D9E75] text-white text-xs font-bold rounded-xl disabled:opacity-40">
              {saving ? 'Starting…' : 'Start Cycle'}
            </button>
            <button onClick={() => setForm(null)} className="px-4 py-2.5 bg-white/8 text-white/60 text-xs rounded-xl">Cancel</button>
          </div>
        </div>
      )}

      {/* Active cycles */}
      {activeCycles.length > 0 && (
        <div>
          <p className="text-[10px] font-bold text-white/40 uppercase tracking-wide mb-2">Active Cycles ({activeCycles.length})</p>
          {activeCycles.map(c => {
            const crop = cropMaster.find(cr => cr.id === c.cropId)
            const today = new Date(); today.setHours(0,0,0,0)
            const sow   = new Date(c.sowDate)
            const days  = Math.floor((today - sow) / 86400000)
            const left  = Math.max(0, (crop?.duration_days || 120) - days)
            return (
              <div key={c.id} className="bg-[#161a23] rounded-2xl border border-white/8 p-4 mb-2 flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg shrink-0 flex items-center justify-center text-base"
                  style={{ background: crop?.color || '#1D9E7520' }}>
                  {crop?.emoji || '🌱'}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-white">{c.plotLabel} — {crop?.name || 'Unknown'}</p>
                  <p className="text-[10px] text-white/40">Sown {c.sowDate} · Day {days} · {left}d left</p>
                  <p className="text-[10px] text-white/30">{c.season}</p>
                </div>
                <button onClick={() => endCycle(c.id)}
                  className="shrink-0 px-2 py-1.5 text-[10px] font-semibold border border-[#BA7517]/40 text-[#BA7517] rounded-lg hover:bg-[#BA7517]/10">
                  End
                </button>
              </div>
            )
          })}
        </div>
      )}

      {/* Past cycles */}
      {inactiveCycles.length > 0 && (
        <div>
          <p className="text-[10px] font-bold text-white/40 uppercase tracking-wide mb-2">Past Cycles ({inactiveCycles.length})</p>
          {inactiveCycles.map(c => {
            const crop = cropMaster.find(cr => cr.id === c.cropId)
            return (
              <div key={c.id} className="bg-[#161a23]/60 rounded-2xl border border-white/5 p-3 mb-1.5 opacity-60">
                <p className="text-xs font-semibold text-white">{c.plotLabel} — {crop?.name || 'Unknown'}</p>
                <p className="text-[10px] text-white/40">{c.sowDate} · {c.status} · {c.season}</p>
              </div>
            )
          })}
        </div>
      )}

      {toast && <Toast msg={toast} type={toastType} />}
      <Style />
    </div>
  )
}

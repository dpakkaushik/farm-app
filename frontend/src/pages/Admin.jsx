import React, { useState } from 'react'
import { Plus, Trash2, AlertTriangle, CheckCircle2 } from 'lucide-react'
import { useAppStore } from '../store'

const TABS = ['Crops', 'Cycles', 'Inventory', 'Labour']

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

  const COLORS = [
    { label: 'Golden (Wheat)',   fill: 'rgba(220,180,40,0.65)' },
    { label: 'Teal (Sugarcane)', fill: 'rgba(29,158,117,0.55)' },
    { label: 'Amber (Mustard)',  fill: 'rgba(186,117,23,0.65)' },
    { label: 'Aqua (Paddy)',     fill: 'rgba(100,180,150,0.60)' },
    { label: 'Green (Grass)',    fill: 'rgba(134,179,53,0.45)' },
    { label: 'Blue (Other)',     fill: 'rgba(120,140,200,0.55)' },
  ]
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
          <div className="grid grid-cols-2 gap-2">
            <FRow label="Emoji / Icon">
              <input className="finput" placeholder="🌾"
                value={form.emoji || ''} onChange={e => setForm(p => ({ ...p, emoji: e.target.value }))} />
            </FRow>
            <FRow label="Season">
              <select className="finput" value={form.season_type || ''} onChange={e => setForm(p => ({ ...p, season_type: e.target.value }))} style={{ background: '#1a2030' }}>
                <option value="" style={{ background: '#1a2030' }}>Select…</option>
                {SEASONS.map(s => <option key={s.value} value={s.value} style={{ background: '#1a2030' }}>{s.label}</option>)}
              </select>
            </FRow>
          </div>
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
            <select className="finput" value={form.color || ''} onChange={e => setForm(p => ({ ...p, color: e.target.value }))} style={{ background: '#1a2030' }}>
              <option value="" style={{ background: '#1a2030' }}>Select…</option>
              {COLORS.map(c => <option key={c.fill} value={c.fill} style={{ background: '#1a2030' }}>{c.label}</option>)}
            </select>
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

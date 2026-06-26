import React, { useState, useEffect } from 'react'
import { Plus, Trash2, AlertTriangle, CheckCircle2, X, UserPlus, Pencil, Wallet } from 'lucide-react'
import FilePicker from '../components/FilePicker'
import { supabase } from '../lib/supabase'
import { useAppStore } from '../store'
import { useAuthStore } from '../store/auth'

const TABS = ['Crops', 'Cycles', 'Inventory', 'Manpower', 'Activity', 'Plots', 'Users', 'Buyers', 'Partners']

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

const CROP_NAME_LIST = [
  'Wheat', 'Paddy', 'Chaini Paddy', 'Sugarcane', 'Sugarcane Ratoon',
  'Mustard', 'Maize', 'Cotton', 'Soybean', 'Potato', 'Onion', 'Tomato',
  'Garlic', 'Chilli', 'Sunflower', 'Groundnut', 'Gram (Chickpea)',
  'Lentil (Masoor)', 'Green Gram (Moong)', 'Black Gram (Urad)',
  'Pigeon Pea (Arhar)', 'Pearl Millet (Bajra)', 'Sorghum (Jowar)',
  'Barley', 'Banana', 'Mango', 'Guava', 'Turmeric', 'Ginger',
  'Cauliflower', 'Cabbage', 'Brinjal', 'Bitter Gourd', 'Bottle Gourd',
]

export default function Admin() {
  const [tab, setTab] = useState('Crops')
  return (
    <div className="h-full flex flex-col bg-[var(--c-bg)]">
      <div className="shrink-0 px-4 pt-4 pb-0">
        <h2 className="text-lg font-bold text-[var(--c-text)]">Admin — Masters</h2>
        <p className="text-xs text-[var(--c-muted)] mb-3">Manage crop types, cycles, inventory, labour</p>
        <div className="flex gap-2 border-b border-[var(--c-border)] overflow-x-auto no-scrollbar">
          {TABS.map(t => (
            <button key={t} onClick={() => setTab(t)}
              className={`px-4 py-2.5 text-xs font-semibold border-b-2 transition-colors
                ${tab === t ? 'border-[#1D9E75] text-[#1D9E75]' : 'border-transparent text-[var(--c-muted)]'}`}>
              {t}
            </button>
          ))}
        </div>
      </div>
      <div className="flex-1 overflow-y-auto">
        {tab === 'Crops'     && <CropsMaster />}
        {tab === 'Cycles'    && <CyclesMaster />}
        {tab === 'Inventory' && <InventoryMaster />}
        {tab === 'Manpower'  && <LabourMaster />}
        {tab === 'Activity'  && <ActivityTypesMaster />}
        {tab === 'Plots'     && <PlotsMaster />}
        {tab === 'Users'     && <UsersMaster />}
        {tab === 'Buyers'    && <BuyersMaster />}
        {tab === 'Partners'  && <PartnersMaster />}
      </div>
    </div>
  )
}

// ── Crops ─────────────────────────────────────────────────────────────────────
function CropsMaster() {
  const { cropMaster, cropCycles, addCrop, updateCrop, deleteCrop } = useAppStore()
  const [form, setForm]     = useState(null)
  const [enterCustom, setEnterCustom] = useState(false)
  const [saving, setSaving] = useState(false)
  const [toast, setToast]   = useState(null)
  const [toastType, setToastType] = useState('success')
  const [confirm, setConfirm] = useState(null)

  const showToast = (m, type = 'success') => {
    setToast(m); setToastType(type)
    setTimeout(() => setToast(null), 3000)
  }

  const save = async () => {
    if (!form.name || !form.duration_days) return
    setSaving(true)
    try {
      if (form.id) {
        await updateCrop(form.id, form)
        showToast('Crop updated ✓')
      } else {
        await addCrop(form)
        showToast('Crop saved to database ✓')
      }
      setForm(null)
    } catch (e) {
      showToast('Save failed: ' + e.message, 'warn')
    }
    setSaving(false)
  }

  const handleDelete = (id, name) => {
    setConfirm({
      title: `Delete "${name}"?`,
      message: 'This crop will be permanently removed from the master list. Active cycles using this crop will be unaffected.',
      confirmLabel: 'Delete',
      onConfirm: async () => {
        setConfirm(null)
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
      },
    })
  }

  // Exclude current editing item so it can keep its own emoji/color
  const usedEmojis = new Set(cropMaster.filter(c => c.id !== form?.id).map(c => c.emoji).filter(Boolean))
  const usedColors = new Set(cropMaster.filter(c => c.id !== form?.id).map(c => c.color).filter(Boolean))
  const SEASONS = [
    { value: 'rabi',   label: 'Rabi (Winter)' },
    { value: 'kharif', label: 'Kharif (Monsoon)' },
    { value: 'zaid',   label: 'Zaid (Summer)' },
  ]

  return (
    <div className="p-4 space-y-3 pb-6">
      <button onClick={() => { setEnterCustom(false); setForm({}) }}
        className="w-full flex items-center justify-center gap-2 py-3 border-2 border-dashed border-[#1D9E75]/30 rounded-2xl text-xs text-[#1D9E75] hover:border-[#1D9E75]/60">
        <Plus size={14} /> Add Crop to Master
      </button>

      {form !== null && (
        <div className="bg-[var(--c-nav)] rounded-2xl border border-[#1D9E75]/30 p-4 space-y-3">
          <p className="text-xs font-bold text-[#1D9E75]">{form.id ? 'Edit Crop' : 'New Crop'}</p>
          <FRow label="Crop">
            <select
              className="finput"
              style={{ background: 'var(--c-surface)' }}
              value={enterCustom ? '__custom__' : (form.name || '')}
              onChange={e => {
                if (e.target.value === '__custom__') {
                  setEnterCustom(true)
                  setForm(p => ({ ...p, name: '' }))
                } else {
                  setEnterCustom(false)
                  setForm(p => ({ ...p, name: e.target.value }))
                }
              }}>
              <option value="">Select crop…</option>
              {CROP_NAME_LIST.map(n => <option key={n} value={n} style={{ background: 'var(--c-surface)' }}>{n}</option>)}
              <option value="__custom__" style={{ background: 'var(--c-surface)' }}>＋ Not in list — add name below</option>
            </select>
            {enterCustom && (
              <input
                className="finput mt-1.5"
                placeholder="Type exact crop name (e.g. Bajra)"
                value={form.name || ''}
                onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
              />
            )}
            <p className="text-[9px] text-[#BA7517] mt-1">
              Names are case-sensitive and must use Title Case — "Wheat" not "wheat" or "WHEAT". Custom names must match exactly throughout the app.
            </p>
          </FRow>
          <FRow label="Crop Icon">
            <div className="flex flex-wrap gap-1.5 mt-0.5">
              {FARM_EMOJIS.map(emoji => {
                const isUsed = usedEmojis.has(emoji)
                const isSel  = form.emoji === emoji
                return (
                  <button key={emoji} type="button"
                    onClick={() => !isUsed && setForm(p => ({ ...p, emoji }))}
                    className={`text-lg p-1 rounded-lg border transition-all ${isSel ? 'bg-[#1D9E75]/30 border-[#1D9E75] scale-110' : isUsed ? 'opacity-25 cursor-not-allowed border-transparent' : 'border-[var(--c-border-md)] hover:border-white/30'}`}
                    title={isUsed ? 'Already used by another crop' : emoji}>
                    {emoji}
                  </button>
                )
              })}
            </div>
            {form.emoji && <p className="text-[10px] text-[var(--c-muted)] mt-1">Selected: {form.emoji}</p>}
          </FRow>
          <FRow label="Season">
            <select className="finput" value={form.season_type || ''} onChange={e => setForm(p => ({ ...p, season_type: e.target.value }))} style={{ background: 'var(--c-surface)' }}>
              <option value="" style={{ background: 'var(--c-surface)' }}>Select…</option>
              {SEASONS.map(s => <option key={s.value} value={s.value} style={{ background: 'var(--c-surface)' }}>{s.label}</option>)}
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
          {(form.name || '').toLowerCase().includes('sugarcane') && (
            <FRow label="Sugarcane variety">
              <select className="finput" style={{ background: 'var(--c-surface)' }}
                value={form.varietyCategory || ''} onChange={e => setForm(p => ({ ...p, varietyCategory: e.target.value || null }))}>
                <option value="" style={{ background: 'var(--c-surface)' }}>Select variety…</option>
                <option value="early"  style={{ background: 'var(--c-surface)' }}>Early Maturing (SAP ₹400/qtl)</option>
                <option value="common" style={{ background: 'var(--c-surface)' }}>Common Variety (SAP ₹390/qtl)</option>
                <option value="late"   style={{ background: 'var(--c-surface)' }}>Late Maturing (SAP ₹390/qtl)</option>
              </select>
            </FRow>
          )}
          <FRow label="Map colour">
            <div className="flex flex-wrap gap-2 mt-0.5">
              {PALETTE_COLORS.map(color => {
                const isUsed = usedColors.has(color)
                const isSel  = form.color === color
                return (
                  <button key={color} type="button"
                    onClick={() => !isUsed && setForm(p => ({ ...p, color }))}
                    className={`w-8 h-8 rounded-lg border-2 relative transition-all ${isSel ? 'border-white scale-110' : isUsed ? 'opacity-30 cursor-not-allowed border-transparent' : 'border-transparent hover:border-[var(--c-border)]0'}`}
                    style={{ background: color }} title={isUsed ? 'Used by another crop' : color}>
                    {isUsed && <span className="absolute inset-0 flex items-center justify-center text-[var(--c-text)] text-xs font-bold">✕</span>}
                  </button>
                )
              })}
            </div>
            {form.color && (
              <div className="flex items-center gap-2 mt-1.5">
                <div className="w-3 h-3 rounded" style={{ background: form.color }} />
                <span className="text-[10px] text-[var(--c-muted)]">{form.color}</span>
              </div>
            )}
          </FRow>
          {/* Residuals section */}
          <div className="border-t border-[var(--c-border)] pt-3 space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-[11px] font-semibold text-[var(--c-text)]">By-products / Residuals</p>
              <button type="button"
                onClick={() => setForm(p => ({ ...p, residuals: [...(p.residuals || []), { name: '', unit: 'quintal', qty_per_acre: '', expected_rate: '' }] }))}
                className="text-[10px] text-[#1D9E75] border border-[#1D9E75]/40 px-2 py-0.5 rounded-lg hover:bg-[#1D9E75]/10">
                + Add Residual
              </button>
            </div>
            <p className="text-[9px] text-[var(--c-faint)]">e.g. Bhoosa from Wheat, Husk from Rice — tracked automatically when harvest is recorded</p>
            {(form.residuals || []).map((r, i) => (
              <div key={i} className="bg-[var(--c-surface)] rounded-xl border border-[var(--c-border)] p-2.5 space-y-1.5">
                <div className="flex gap-1.5 items-center">
                  <input className="finput flex-1" placeholder="Name (e.g. Bhoosa)"
                    value={r.name} onChange={e => setForm(p => ({ ...p, residuals: p.residuals.map((x, j) => j === i ? { ...x, name: e.target.value } : x) }))} />
                  <button type="button" onClick={() => setForm(p => ({ ...p, residuals: p.residuals.filter((_, j) => j !== i) }))}
                    className="text-[var(--c-faint)] hover:text-[#E24B4A] shrink-0">✕</button>
                </div>
                <div className="flex gap-1.5 items-center">
                  <select className="finput flex-1" style={{ background: 'var(--c-surface)' }}
                    value={r.unit} onChange={e => setForm(p => ({ ...p, residuals: p.residuals.map((x, j) => j === i ? { ...x, unit: e.target.value } : x) }))}>
                    {['quintal','kg','bag','trolley','litre','bundle'].map(u => <option key={u} value={u} style={{ background: 'var(--c-surface)' }}>{u}</option>)}
                  </select>
                  <input type="number" className="finput w-20" placeholder="Qty/ac"
                    value={r.qty_per_acre} onChange={e => setForm(p => ({ ...p, residuals: p.residuals.map((x, j) => j === i ? { ...x, qty_per_acre: e.target.value } : x) }))} />
                  <input type="number" className="finput w-20" placeholder="₹/unit"
                    value={r.expected_rate} onChange={e => setForm(p => ({ ...p, residuals: p.residuals.map((x, j) => j === i ? { ...x, expected_rate: e.target.value } : x) }))} />
                </div>
              </div>
            ))}
            {(form.residuals || []).length > 0 && (
              <p className="text-[9px] text-[var(--c-faint)]">Qty/ac × plot acres = auto quantity at harvest time</p>
            )}
          </div>

          <div className="flex gap-2">
            <button onClick={save} disabled={saving}
              className="flex-1 py-2.5 bg-[#1D9E75] text-[var(--c-text)] text-xs font-bold rounded-xl disabled:opacity-40">
              {saving ? 'Saving…' : form.id ? 'Update Crop' : 'Save to Database'}
            </button>
            <button onClick={() => setForm(null)} className="px-4 py-2.5 bg-[var(--c-ghost)] text-[var(--c-sub)] text-xs rounded-xl">Cancel</button>
          </div>
        </div>
      )}

      {cropMaster.map(c => {
        const activeCycles = cropCycles.filter(cc => cc.cropId === c.id && cc.status === 'active').length
        return (
          <div key={c.id} className="bg-[var(--c-nav)] rounded-2xl border border-[var(--c-border)] p-4 flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg shrink-0" style={{ background: c.color }} />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-[var(--c-text)]">{c.emoji} {c.name}</p>
              <p className="text-[10px] text-[var(--c-muted)]">{c.duration_days}d · {c.yieldPerAcre} qtl/ac · ₹{c.pricePerQtl}/qtl</p>
              {activeCycles > 0 && <p className="text-[10px] text-[#1D9E75] mt-0.5">{activeCycles} active cycle{activeCycles > 1 ? 's' : ''}</p>}
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button
                onClick={() => {
                  setEnterCustom(!CROP_NAME_LIST.includes(c.name))
                  setForm({ id: c.id, name: c.name, emoji: c.emoji, color: c.color, duration_days: c.duration_days, harvest_window_days: c.harvest_window_days, season_type: c.season_type, yieldPerAcre: c.yieldPerAcre, pricePerQtl: c.pricePerQtl, varietyCategory: c.varietyCategory || null, residuals: c.residuals || [] })
                }}
                className="text-xs text-[#1D9E75] px-2 py-1 border border-[#1D9E75]/30 rounded-lg hover:bg-[#1D9E75]/10 transition-colors">
                Edit
              </button>
              <button onClick={() => handleDelete(c.id, c.name)} className="text-[var(--c-faint)] hover:text-[#E24B4A] shrink-0">
                <Trash2 size={15} />
              </button>
            </div>
          </div>
        )
      })}

      {confirm && <ConfirmDialog {...confirm} onCancel={() => setConfirm(null)} />}
      {toast && <Toast msg={toast} type={toastType} />}
      <Style />
    </div>
  )
}

// ── Inventory ─────────────────────────────────────────────────────────────────
function InventoryMaster() {
  const { inventoryMaster, addInventoryItem, updateInventoryItem, deleteInventoryItem } = useAppStore()
  const [form, setForm]     = useState(null)
  const [saving, setSaving] = useState(false)
  const [toast, setToast]   = useState(null)
  const [toastType, setToastType] = useState('success')
  const [confirm, setConfirm] = useState(null)

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
      if (form.id) {
        await updateInventoryItem(form.id, form)
        showToast('Item updated ✓')
      } else {
        await addInventoryItem(form)
        showToast('Item saved to database ✓')
      }
      setForm(null)
    } catch (e) {
      showToast('Save failed: ' + e.message, 'warn')
    }
    setSaving(false)
  }

  const handleDelete = (id, name) => {
    setConfirm({
      title: `Delete "${name}"?`,
      message: 'This inventory item will be removed from the master list. Items with purchase or issue records cannot be deleted.',
      confirmLabel: 'Delete',
      onConfirm: async () => {
        setConfirm(null)
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
      },
    })
  }

  return (
    <div className="p-4 space-y-3 pb-6">
      <button onClick={() => setForm({ category: 'fertilizer' })}
        className="w-full flex items-center justify-center gap-2 py-3 border-2 border-dashed border-[#1D9E75]/30 rounded-2xl text-xs text-[#1D9E75] hover:border-[#1D9E75]/60">
        <Plus size={14} /> Add Inventory Item
      </button>

      {form !== null && (
        <div className="bg-[var(--c-nav)] rounded-2xl border border-[#1D9E75]/30 p-4 space-y-3">
          <p className="text-xs font-bold text-[#1D9E75]">{form.id ? 'Edit Item' : 'New Item'}</p>
          <FRow label="Name">
            <input className="finput" placeholder="e.g. DAP"
              value={form.name || ''} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} />
          </FRow>
          <FRow label="Category">
            <select className="finput" value={form.category || ''} onChange={e => setForm(p => ({ ...p, category: e.target.value }))} style={{ background: 'var(--c-surface)' }}>
              {CATS.map(c => <option key={c} value={c} style={{ background: 'var(--c-surface)' }}>{CAT_LABEL[c]}</option>)}
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
          </div>
          <div className="flex gap-2">
            <button onClick={save} disabled={saving}
              className="flex-1 py-2.5 bg-[#1D9E75] text-[var(--c-text)] text-xs font-bold rounded-xl disabled:opacity-40">
              {saving ? 'Saving…' : form.id ? 'Update Item' : 'Save to Database'}
            </button>
            <button onClick={() => setForm(null)} className="px-4 py-2.5 bg-[var(--c-ghost)] text-[var(--c-sub)] text-xs rounded-xl">Cancel</button>
          </div>
        </div>
      )}

      {inventoryMaster.map(i => (
        <div key={i.id} className="bg-[var(--c-nav)] rounded-2xl border border-[var(--c-border)] p-4 flex items-center justify-between">
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-[var(--c-text)]">{i.name}</p>
            <p className="text-[10px] text-[var(--c-muted)]">{CAT_LABEL[i.category]} · {i.unit} · ₹{i.costPerUnit}/unit · min {i.minThreshold}</p>
            <p className="text-[10px] text-[#1D9E75] mt-0.5">Stock: {i.currentStock} {i.unit}</p>
          </div>
          <div className="flex items-center gap-2 ml-3 shrink-0">
            <button
              onClick={() => setForm({ id: i.id, name: i.name, category: i.category, unit: i.unit, costPerUnit: i.costPerUnit, minThreshold: i.minThreshold })}
              className="text-xs text-[#1D9E75] px-2 py-1 border border-[#1D9E75]/30 rounded-lg hover:bg-[#1D9E75]/10 transition-colors">
              Edit
            </button>
            <button onClick={() => handleDelete(i.id, i.name)} className="text-[var(--c-faint)] hover:text-[#E24B4A]">
              <Trash2 size={15} />
            </button>
          </div>
        </div>
      ))}

      {confirm && <ConfirmDialog {...confirm} onCancel={() => setConfirm(null)} />}
      {toast && <Toast msg={toast} type={toastType} />}
      <Style />
    </div>
  )
}

// ── Activity Types ────────────────────────────────────────────────────────────
const ACT_EMOJIS = ['💧','🌿','🧪','🧴','🚜','🌱','🌾','🔧','🌻','📅','📋','✂️','🌊','🪣','⚗️','🧹','🌡️','🐛','🔥','💊']

function ActivityTypesMaster() {
  const { activityTypes, addActivityType, deleteActivityType } = useAppStore()
  const [form,    setForm]    = useState(null)
  const [saving,  setSaving]  = useState(false)
  const [confirm, setConfirm] = useState(null)
  const [toast,   setToast]   = useState(null)

  const showToast = (m, type = 'success') => { setToast({ m, type }); setTimeout(() => setToast(null), 3000) }

  const save = async () => {
    if (!form?.label?.trim()) return
    setSaving(true)
    try { await addActivityType({ label: form.label, emoji: form.emoji || '📋' }); setForm(null); showToast('Activity type added ✓') }
    catch (e) { showToast(e.message, 'warn') }
    setSaving(false)
  }

  const del = (id, label) => setConfirm({
    title: `Remove "${label}"?`, message: 'Existing logged activities keep their type name. Only removed from future dropdowns.',
    onConfirm: async () => { setConfirm(null); try { await deleteActivityType(id); showToast('Removed') } catch (e) { showToast(e.message, 'warn') } },
  })

  const systemTypes = activityTypes.filter(a => a.isSystem)
  const customTypes = activityTypes.filter(a => !a.isSystem)

  return (
    <div className="p-4 space-y-3 pb-6">
      {confirm && <ConfirmDialog {...confirm} onCancel={() => setConfirm(null)} />}
      {toast && <Toast msg={toast.m} type={toast.type} />}

      <p className="text-[11px] text-[var(--c-faint)] px-1">
        Activity types used in Log Activity and crop templates. System types cannot be removed. Add custom types below.
      </p>

      {/* System types — display only */}
      <p className="text-[10px] font-bold text-[var(--c-muted)] uppercase tracking-wide">System (built-in)</p>
      <div className="flex flex-wrap gap-2">
        {systemTypes.map(a => (
          <span key={a.id} className="flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-semibold border"
            style={{ background: 'var(--c-card)', borderColor: 'var(--c-border-md)', color: 'var(--c-sub)' }}>
            {a.emoji} {a.label}
          </span>
        ))}
      </div>

      {/* Custom types */}
      <p className="text-[10px] font-bold text-[var(--c-muted)] uppercase tracking-wide mt-2">Custom</p>
      <button onClick={() => setForm({ label: '', emoji: '📋' })}
        className="w-full flex items-center justify-center gap-2 py-3 border-2 border-dashed border-[#1D9E75]/30 rounded-2xl text-xs text-[#1D9E75] hover:border-[#1D9E75]/60">
        <Plus size={14} /> Add Custom Activity Type
      </button>

      {form !== null && (
        <div className="bg-[var(--c-nav)] rounded-2xl border border-[#1D9E75]/30 p-4 space-y-3">
          <p className="text-xs font-bold text-[#1D9E75]">New Activity Type</p>
          <FRow label="Name">
            <input className="finput" placeholder="e.g. Land Levelling"
              value={form.label} onChange={e => setForm(p => ({ ...p, label: e.target.value }))}
              onKeyDown={e => e.key === 'Enter' && save()} />
          </FRow>
          <FRow label="Icon">
            <div className="flex flex-wrap gap-1.5">
              {ACT_EMOJIS.map(e => (
                <button key={e} onClick={() => setForm(p => ({ ...p, emoji: e }))}
                  className={`text-lg p-1 rounded-lg border transition-all ${form.emoji === e ? 'bg-[#1D9E75]/30 border-[#1D9E75] scale-110' : 'border-[var(--c-border-md)]'}`}>
                  {e}
                </button>
              ))}
            </div>
          </FRow>
          <div className="flex gap-2">
            <button onClick={save} disabled={saving || !form.label.trim()}
              className="flex-1 py-2.5 bg-[#1D9E75] text-white text-xs font-bold rounded-xl disabled:opacity-40">
              {saving ? 'Saving…' : 'Save'}
            </button>
            <button onClick={() => setForm(null)} className="px-4 py-2.5 bg-[var(--c-ghost)] text-[var(--c-sub)] text-xs rounded-xl">Cancel</button>
          </div>
        </div>
      )}

      {customTypes.map(a => (
        <div key={a.id} className="bg-[var(--c-nav)] rounded-2xl border border-[var(--c-border)] px-4 py-3 flex items-center justify-between">
          <p className="text-sm font-semibold text-[var(--c-text)]">{a.emoji} {a.label}</p>
          <button onClick={() => del(a.id, a.label)} className="text-[var(--c-faint)] hover:text-[#E24B4A]">
            <Trash2 size={15} />
          </button>
        </div>
      ))}
      {customTypes.length === 0 && !form && (
        <p className="text-xs text-[var(--c-faint)] text-center py-2">No custom types yet.</p>
      )}
    </div>
  )
}

// ── Work Types ────────────────────────────────────────────────────────────────
function WorkTypesSection({ showToast }) {
  const { workTypes, addWorkType, deleteWorkType } = useAppStore()
  const [newName, setNewName] = useState('')
  const [saving, setSaving]   = useState(false)
  const [confirm, setConfirm] = useState(null)

  const save = async () => {
    const name = newName.trim()
    if (!name) return
    setSaving(true)
    try { await addWorkType(name); setNewName(''); showToast('Work type added ✓') }
    catch (e) { showToast(e.message, 'warn') }
    setSaving(false)
  }

  const del = (id, name) => setConfirm({
    title: `Remove "${name}"?`, message: 'Any existing logs referencing this type will be unlinked.',
    onConfirm: async () => {
      setConfirm(null)
      try { await deleteWorkType(id); showToast('Removed') }
      catch (e) { showToast(e.message, 'warn') }
    },
  })

  return (
    <>
      {confirm && <ConfirmDialog {...confirm} onCancel={() => setConfirm(null)} />}
      <p className="text-[11px] text-[var(--c-faint)] px-1">
        Work type labels used when logging contractual or regular work. No rate attached — rate is filled at log time.
      </p>
      <div className="bg-[var(--c-nav)] rounded-2xl border border-[var(--c-border)] p-3 flex gap-2">
        <input
          className="finput flex-1"
          placeholder="e.g. Harvesting, Ploughing, Spray…"
          value={newName}
          onChange={e => setNewName(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && save()}
        />
        <button onClick={save} disabled={saving || !newName.trim()}
          className="px-4 py-2 bg-[#1D9E75] text-white text-xs font-bold rounded-xl disabled:opacity-40">
          {saving ? '…' : 'Add'}
        </button>
      </div>
      {workTypes.length === 0 && (
        <p className="text-xs text-[var(--c-faint)] text-center py-4">No work types yet — add some above.</p>
      )}
      {workTypes.map(w => (
        <div key={w.id} className="bg-[var(--c-nav)] rounded-2xl border border-[var(--c-border)] px-4 py-3 flex items-center justify-between">
          <p className="text-sm font-semibold text-[var(--c-text)]">{w.name}</p>
          <button onClick={() => del(w.id, w.name)} className="text-[var(--c-faint)] hover:text-[#E24B4A]">
            <Trash2 size={15} />
          </button>
        </div>
      ))}
    </>
  )
}

// ── Labour ────────────────────────────────────────────────────────────────────
const WORK_TYPES = ['Farm Worker', 'Driver', 'Cook', 'Cleaning', 'Watchman', 'Gardener', 'Mechanic', 'Other']
const LABOUR_TABS = [
  ['staff',       '🏢 Staff'],
  ['regular',     '👤 Regular'],
  ['contractual', '🏗️ Contract'],
  ['advances',    '💰 Advances'],
  ['regularize',  '📅 Regularize'],
]

function LabourMaster() {
  const {
    permanentStaff, regularLabourers, contractualLabour, advances,
    addPermanentStaff, updatePermanentStaff, deletePermanentStaff,
    addRegularLabourer, updateRegularLabourer, deleteRegularLabourer,
    addContractualLabour, updateContractualLabour, deleteContractualLabour,
    addAdvance, deactivateLabourer, reactivateLabourer,
  } = useAppStore()
  const [tab, setTab]             = useState('staff')
  const [form, setForm]           = useState(null)
  const [photoFile, setPhotoFile] = useState(null)
  const [openLog, setOpenLog]     = useState(null)   // id of person whose log is expanded
  const [advForm, setAdvForm]     = useState(null)
  const [saving, setSaving]       = useState(false)
  const [toast, setToast]         = useState(null)
  const [confirm, setConfirm]     = useState(null)

  const showToast = (m) => { setToast(m); setTimeout(() => setToast(null), 2500) }
  const today = new Date().toISOString().slice(0, 10)

  const uploadPhoto = async (file, folder) => {
    const ext  = (file.name && file.name.includes('.')) ? file.name.split('.').pop() : 'jpg'
    const path = `${folder}/${Date.now()}.${ext}`
    const { error } = await supabase.storage.from('farm-photos').upload(path, file)
    if (error) throw new Error('Upload failed: ' + error.message)
    return supabase.storage.from('farm-photos').getPublicUrl(path).data.publicUrl
  }

  // ── Permanent Staff ─────────────────────────────────────────────────────────
  const saveStaff = async () => {
    if (!form.name) return
    setSaving(true)
    try {
      let photoUrl = form.photoUrl   // keep existing if no new file chosen
      if (photoFile) {
        try {
          photoUrl = await uploadPhoto(photoFile, 'staff-photos')
        } catch (upErr) {
          showToast(upErr.message, 'warn')
          setSaving(false)
          return   // don't save with a broken/null photo URL
        }
      }
      const payload = { ...form, photoUrl }
      if (form.id) { await updatePermanentStaff(form.id, payload); showToast('Staff updated ✓') }
      else         { await addPermanentStaff(payload);              showToast('Staff saved ✓') }
      setForm(null); setPhotoFile(null)
    } catch (e) { showToast('Save failed: ' + e.message) }
    setSaving(false)
  }

  const handleDeleteStaff = (id, name) => setConfirm({
    title: `Remove "${name}"?`, message: 'Staff member will be marked inactive.',
    confirmLabel: 'Remove',
    onConfirm: async () => { setConfirm(null); try { await deletePermanentStaff(id); showToast('Removed') } catch (e) { showToast(e.message) } },
  })

  // ── Regular Labour ──────────────────────────────────────────────────────────
  const saveRegular = async () => {
    if (!form.name) return
    setSaving(true)
    try {
      let photoUrl = form.photoUrl
      if (photoFile) {
        try {
          photoUrl = await uploadPhoto(photoFile, 'labour-photos')
        } catch (upErr) {
          showToast(upErr.message, 'warn')
          setSaving(false)
          return
        }
      }
      const payload = { ...form, photoUrl }
      if (form.id) { await updateRegularLabourer(form.id, payload); showToast('Labourer updated ✓') }
      else         { await addRegularLabourer(payload);              showToast('Labourer saved ✓') }
      setForm(null); setPhotoFile(null)
    } catch (e) { showToast('Save failed: ' + e.message) }
    setSaving(false)
  }

  const handleDeleteRegular = (id, name) => setConfirm({
    title: `Remove "${name}"?`, message: 'Labourer will be marked inactive.',
    confirmLabel: 'Remove',
    onConfirm: async () => { setConfirm(null); try { await deleteRegularLabourer(id); showToast('Removed') } catch (e) { showToast(e.message) } },
  })

  // ── Contractual ─────────────────────────────────────────────────────────────
  const saveContractual = async () => {
    if (!form.name || !form.defaultRate) return
    setSaving(true)
    try {
      if (form.id) { await updateContractualLabour(form.id, form); showToast('Category updated ✓') }
      else         { await addContractualLabour(form);              showToast('Category saved ✓') }
      setForm(null)
    } catch (e) { showToast('Save failed: ' + e.message) }
    setSaving(false)
  }

  const handleDeleteContractual = (id, name) => setConfirm({
    title: `Remove "${name}"?`, message: 'Category will be marked inactive.',
    confirmLabel: 'Remove',
    onConfirm: async () => { setConfirm(null); try { await deleteContractualLabour(id); showToast('Removed') } catch (e) { showToast(e.message) } },
  })

  // ── Advances ────────────────────────────────────────────────────────────────
  const allTracked = [...permanentStaff, ...regularLabourers]
  const saveAdvance = async () => {
    if (!advForm.labourerId || !advForm.amount) return
    setSaving(true)
    try {
      await addAdvance({ ...advForm, date: advForm.date || today })
      showToast('Advance recorded ✓')
      setAdvForm(null)
    } catch (e) { showToast('Failed: ' + e.message) }
    setSaving(false)
  }

  return (
    <div className="p-4 space-y-3 pb-6">
      {/* Tab strip */}
      <div className="flex gap-1 bg-[var(--c-nav)] rounded-xl p-1 overflow-x-auto no-scrollbar">
        {LABOUR_TABS.map(([k, lbl]) => (
          <button key={k} onClick={() => { setTab(k); setForm(null) }}
            className={`flex-1 py-2 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap ${tab === k ? 'bg-[#1D9E75] text-[var(--c-text)]' : 'text-[var(--c-muted)]'}`}>
            {lbl}
          </button>
        ))}
      </div>

      {/* ── Permanent Staff ── */}
      {tab === 'staff' && (<>
        <p className="text-[11px] text-[var(--c-faint)] px-1">Office staff with fixed monthly salary. Attendance tracked daily.</p>
        <button onClick={() => setForm({ monthlySalary: '', dailyRate: '', monthlyHoliday: '2', openingBalance: '0' })}
          className="w-full flex items-center justify-center gap-2 py-3 border-2 border-dashed border-[#1D9E75]/30 rounded-2xl text-xs text-[#1D9E75] hover:border-[#1D9E75]/60">
          <Plus size={14} /> Add Staff Member
        </button>
        {form !== null && (
          <div className="bg-[var(--c-nav)] rounded-2xl border border-[#1D9E75]/30 p-4 space-y-3">
            <p className="text-xs font-bold text-[#1D9E75]">{form.id ? 'Edit Staff' : 'New Staff Member'}</p>
            <div className="grid grid-cols-2 gap-2">
              <FRow label="Full name">
                <input className="finput" placeholder="e.g. Suresh Sharma"
                  value={form.name || ''} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} />
              </FRow>
              <FRow label="Designation">
                <input className="finput" placeholder="e.g. Farm Manager"
                  value={form.designation || ''} onChange={e => setForm(p => ({ ...p, designation: e.target.value }))} />
              </FRow>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <FRow label="Monthly salary (₹)">
                <input type="number" className="finput" placeholder="15000"
                  value={form.monthlySalary || ''} onChange={e => setForm(p => ({ ...p, monthlySalary: e.target.value }))} />
              </FRow>
              <FRow label="Phone">
                <input type="tel" className="finput" placeholder="optional"
                  value={form.phone || ''} onChange={e => setForm(p => ({ ...p, phone: e.target.value }))} />
              </FRow>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <FRow label="Monthly holidays">
                <input type="number" className="finput" placeholder="2" min="0" max="31"
                  value={form.monthlyHoliday ?? '2'} onChange={e => setForm(p => ({ ...p, monthlyHoliday: e.target.value }))} />
              </FRow>
              <FRow label="Join date">
                <input type="date" className="finput" value={form.joinDate || ''} onChange={e => setForm(p => ({ ...p, joinDate: e.target.value }))} style={{ colorScheme: 'dark' }} />
              </FRow>
            </div>
            <p className="text-[10px] text-[var(--c-faint)] px-0.5">Monthly holidays: days off per month that still count as paid (default 2)</p>
            <div className="grid grid-cols-2 gap-2">
              <FRow label="Opening balance (₹)">
                <input type="number" className="finput" placeholder="0"
                  value={form.openingBalance || ''} onChange={e => setForm(p => ({ ...p, openingBalance: e.target.value }))} />
              </FRow>
            </div>
            <p className="text-[10px] text-[var(--c-faint)] px-0.5">Opening balance: positive = farm owes them, negative = they owe farm</p>
            <FRow label="Photo">
              <FilePicker accept="image/*" file={photoFile} preview={form.photoUrl}
                onFile={f => { setPhotoFile(f); if (!f) setForm(p => ({ ...p, photoUrl: null })) }} />
            </FRow>
            <div className="flex gap-2">
              <button onClick={saveStaff} disabled={saving}
                className="flex-1 py-2.5 bg-[#1D9E75] text-[var(--c-text)] text-xs font-bold rounded-xl disabled:opacity-40">
                {saving ? 'Saving…' : form.id ? 'Update' : 'Save to Database'}
              </button>
              <button onClick={() => { setForm(null); setPhotoFile(null) }} className="px-4 py-2.5 bg-[var(--c-ghost)] text-[var(--c-sub)] text-xs rounded-xl">Cancel</button>
            </div>
          </div>
        )}
        {permanentStaff.map(s => (
          <PersonCard key={s.id}
            person={s} accentColor="#4169E1"
            isLogOpen={openLog === s.id}
            onToggleLog={() => setOpenLog(openLog === s.id ? null : s.id)}
            onEdit={() => { setPhotoFile(null); setOpenLog(null); setForm({ id: s.id, name: s.name, designation: s.designation, monthlySalary: s.monthlySalary, dailyRate: s.dailyRate, monthlyHoliday: s.monthlyHoliday ?? 2, phone: s.phone, openingBalance: s.openingBalance, joinDate: s.joinDate || '', photoUrl: s.photoUrl }) }}
            onDelete={() => handleDeleteStaff(s.id, s.name)}
            onDeactivate={() => { setConfirm({ title: `Deactivate "${s.name}"?`, message: 'They will be hidden from attendance lists until reactivated. All history is preserved.', confirmLabel: 'Deactivate', onConfirm: async () => { setConfirm(null); try { await deactivateLabourer(s.id); showToast('Deactivated') } catch (e) { showToast(e.message) } } }) }}
            onReactivate={async () => { try { await reactivateLabourer(s.id); showToast('Reactivated ✓') } catch (e) { showToast(e.message) } }}
            subLabel={`${s.designation || 'Staff'} · ₹${s.monthlySalary?.toLocaleString()}/mo`}
            ratePerDay={null} monthlySalary={s.monthlySalary}
          />
        ))}
        {permanentStaff.length === 0 && !form && <p className="text-xs text-[var(--c-faint)] text-center py-4">No permanent staff added yet</p>}
      </>)}

      {/* ── Regular Labour ── */}
      {tab === 'regular' && (<>
        <p className="text-[11px] text-[var(--c-faint)] px-1">Regular farm workers paid per day. Attendance tracked daily.</p>
        <button onClick={() => setForm({ workType: 'Farm Worker', openingBalance: '0' })}
          className="w-full flex items-center justify-center gap-2 py-3 border-2 border-dashed border-[#1D9E75]/30 rounded-2xl text-xs text-[#1D9E75] hover:border-[#1D9E75]/60">
          <Plus size={14} /> Add Regular Labourer
        </button>
        {form !== null && (
          <div className="bg-[var(--c-nav)] rounded-2xl border border-[#1D9E75]/30 p-4 space-y-3">
            <p className="text-xs font-bold text-[#1D9E75]">{form.id ? 'Edit Labourer' : 'New Regular Labourer'}</p>
            <FRow label="Full name">
              <input className="finput" placeholder="e.g. Ramesh Kumar"
                value={form.name || ''} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} />
            </FRow>
            <FRow label="Kind of work">
              <select className="finput" value={form.workType || ''} onChange={e => setForm(p => ({ ...p, workType: e.target.value }))} style={{ background: 'var(--c-surface)' }}>
                {WORK_TYPES.map(w => <option key={w} value={w} style={{ background: 'var(--c-surface)' }}>{w}</option>)}
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
            <FRow label="Opening balance (₹)">
              <input type="number" className="finput" placeholder="0"
                value={form.openingBalance || ''} onChange={e => setForm(p => ({ ...p, openingBalance: e.target.value }))} />
            </FRow>
            <p className="text-[10px] text-[var(--c-faint)] px-0.5">Positive = farm owes them from last month. Negative = they owe farm.</p>
            <FRow label="Photo">
              <FilePicker accept="image/*" file={photoFile} preview={form.photoUrl}
                onFile={f => { setPhotoFile(f); if (!f) setForm(p => ({ ...p, photoUrl: null })) }} />
            </FRow>
            <div className="flex gap-2">
              <button onClick={saveRegular} disabled={saving}
                className="flex-1 py-2.5 bg-[#1D9E75] text-[var(--c-text)] text-xs font-bold rounded-xl disabled:opacity-40">
                {saving ? 'Saving…' : form.id ? 'Update Labourer' : 'Save to Database'}
              </button>
              <button onClick={() => { setForm(null); setPhotoFile(null) }} className="px-4 py-2.5 bg-[var(--c-ghost)] text-[var(--c-sub)] text-xs rounded-xl">Cancel</button>
            </div>
          </div>
        )}
        {regularLabourers.map(l => (
          <PersonCard key={l.id}
            person={l} accentColor="#1D9E75"
            isLogOpen={openLog === l.id}
            onToggleLog={() => setOpenLog(openLog === l.id ? null : l.id)}
            onEdit={() => { setPhotoFile(null); setOpenLog(null); setForm({ id: l.id, name: l.name, workType: l.workType, ratePerDay: l.ratePerDay, phone: l.phone || '', openingBalance: l.openingBalance, photoUrl: l.photoUrl }) }}
            onDelete={() => handleDeleteRegular(l.id, l.name)}
            onDeactivate={() => { setConfirm({ title: `Deactivate "${l.name}"?`, message: 'They will be hidden from attendance lists until reactivated. All history is preserved.', confirmLabel: 'Deactivate', onConfirm: async () => { setConfirm(null); try { await deactivateLabourer(l.id); showToast('Deactivated') } catch (e) { showToast(e.message) } } }) }}
            onReactivate={async () => { try { await reactivateLabourer(l.id); showToast('Reactivated ✓') } catch (e) { showToast(e.message) } }}
            subLabel={`${l.workType} · ₹${l.ratePerDay}/day`}
            ratePerDay={l.ratePerDay} monthlySalary={null}
          />
        ))}
        {regularLabourers.length === 0 && !form && <p className="text-xs text-[var(--c-faint)] text-center py-4">No regular labour added yet</p>}
      </>)}

      {/* ── Work Types ── */}
      {tab === 'contractual' && <WorkTypesSection showToast={showToast} />}

      {/* ── Advances ── */}
      {tab === 'advances' && (<>
        <p className="text-[11px] text-[var(--c-faint)] px-1">Salary advances given to permanent staff or regular labour. Deducted at month-end salary.</p>
        {allTracked.length === 0 ? (
          <p className="text-xs text-[var(--c-faint)] text-center py-6">Add staff or regular labour first to record advances.</p>
        ) : (<>
          <button onClick={() => setAdvForm({ labourerId: '', amount: '', date: today, reason: '' })}
            className="w-full flex items-center justify-center gap-2 py-3 border-2 border-dashed border-[#BA7517]/30 rounded-2xl text-xs text-[#BA7517] hover:border-[#BA7517]/60">
            <Wallet size={14} /> Record Advance
          </button>

          {advForm !== null && (
            <div className="bg-[var(--c-nav)] rounded-2xl border border-[#BA7517]/30 p-4 space-y-3">
              <p className="text-xs font-bold text-[#BA7517]">New Salary Advance</p>
              <FRow label="Person">
                <select className="finput" value={advForm.labourerId} onChange={e => setAdvForm(p => ({ ...p, labourerId: e.target.value }))} style={{ background: 'var(--c-surface)' }}>
                  <option value="" style={{ background: 'var(--c-surface)' }}>Select…</option>
                  {permanentStaff.length > 0 && (
                    <optgroup label="Permanent Staff" style={{ background: 'var(--c-surface)' }}>
                      {permanentStaff.map(s => <option key={s.id} value={s.id} style={{ background: 'var(--c-surface)' }}>{s.name}</option>)}
                    </optgroup>
                  )}
                  {regularLabourers.length > 0 && (
                    <optgroup label="Regular Labour" style={{ background: 'var(--c-surface)' }}>
                      {regularLabourers.map(l => <option key={l.id} value={l.id} style={{ background: 'var(--c-surface)' }}>{l.name}</option>)}
                    </optgroup>
                  )}
                </select>
              </FRow>
              <div className="grid grid-cols-2 gap-2">
                <FRow label="Amount (₹)">
                  <input type="number" className="finput" placeholder="0"
                    value={advForm.amount} onChange={e => setAdvForm(p => ({ ...p, amount: e.target.value }))} />
                </FRow>
                <FRow label="Date">
                  <input type="date" className="finput" value={advForm.date} onChange={e => setAdvForm(p => ({ ...p, date: e.target.value }))} style={{ colorScheme: 'dark' }} />
                </FRow>
              </div>
              <FRow label="Reason (optional)">
                <input className="finput" placeholder="e.g. Medical emergency"
                  value={advForm.reason} onChange={e => setAdvForm(p => ({ ...p, reason: e.target.value }))} />
              </FRow>
              <div className="flex gap-2">
                <button onClick={saveAdvance} disabled={saving || !advForm.labourerId || !advForm.amount}
                  className="flex-1 py-2.5 bg-[#BA7517] text-[var(--c-text)] text-xs font-bold rounded-xl disabled:opacity-40">
                  {saving ? 'Saving…' : 'Record Advance'}
                </button>
                <button onClick={() => setAdvForm(null)} className="px-4 py-2.5 bg-[var(--c-ghost)] text-[var(--c-sub)] text-xs rounded-xl">Cancel</button>
              </div>
            </div>
          )}

          {advances.length === 0 ? (
            <p className="text-xs text-[var(--c-faint)] text-center py-4">No pending advances</p>
          ) : (
            <div className="space-y-2">
              <p className="text-[10px] font-bold text-[var(--c-muted)] uppercase tracking-wide">Pending Recovery</p>
              {advances.map(adv => {
                const person = allTracked.find(p => p.id === adv.labourerId)
                return (
                  <div key={adv.id} className="bg-[var(--c-nav)] rounded-2xl border border-[var(--c-border)] p-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-semibold text-[var(--c-text)]">{person?.name || '—'}</p>
                        <p className="text-[10px] text-[var(--c-muted)]">{adv.date}{adv.reason ? ` · ${adv.reason}` : ''}</p>
                      </div>
                      <p className="text-base font-bold text-[#BA7517]">₹{adv.amount}</p>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </>)}
      </>)}

      {/* ── Regularize ── */}
      {tab === 'regularize' && <AttendanceRegularize />}

      {confirm && <ConfirmDialog {...confirm} onCancel={() => setConfirm(null)} />}
      {toast && <Toast msg={toast} />}
      <Style />
    </div>
  )
}

// ── Attendance Regularization Calendar ────────────────────────────────────────
const DAY_LABELS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa']
const MONTH_NAMES = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

const ATT_STYLES = {
  present:    { bg: '#1D9E75', label: 'P' },
  half_day:   { bg: '#BA7517', label: 'H' },
  leave:      { bg: '#4169E1', label: 'L' },
  holiday:    { bg: '#7B2D8B', label: 'PH' },
  absent:     { bg: '#E24B4A', label: 'A' },
  weekly_off: { bg: '#2a2a2a', label: '' },
}
// Cycle for normal days: null→P→H→L→A→null
const NORMAL_CYCLE  = [null, 'present', 'half_day', 'leave', 'absent']
// Cycle for public holiday days: null(shows PH)→present→absent→null
const HOLIDAY_CYCLE = [null, 'present', 'absent']

// Sunday tap cycle: null(weekly_off) → present → null
const SUN_CYCLE = [null, 'present']

function AttendanceRegularize() {
  const {
    permanentStaff, regularLabourers, staffMonthAttendance, publicHolidays,
    loadMonthAttendance, markAttendanceOnDate,
    loadPublicHolidays, addPublicHoliday, deletePublicHoliday,
  } = useAppStore()

  const now  = new Date()
  const [year,     setYear]    = React.useState(now.getFullYear())
  const [month,    setMonth]   = React.useState(now.getMonth() + 1)
  const [personId, setPersonId] = React.useState(null)
  const [saving,   setSaving]  = React.useState(null)
  const [hForm,    setHForm]   = React.useState(null)
  const [hSaving,  setHSaving] = React.useState(false)
  const [toast,    setToast]   = React.useState(null)

  const showToast = (m) => { setToast(m); setTimeout(() => setToast(null), 2500) }

  const allPeople = [...permanentStaff, ...regularLabourers]

  React.useEffect(() => { loadPublicHolidays() }, [])

  React.useEffect(() => {
    if (allPeople.length && !personId) setPersonId(allPeople[0].id)
  }, [permanentStaff.length, regularLabourers.length])

  React.useEffect(() => { loadMonthAttendance(year, month) }, [year, month])

  const mm         = String(month).padStart(2, '0')
  const monthKey   = `${year}-${mm}`
  const personAtt  = staffMonthAttendance[monthKey]?.[personId] || {}

  const isStaffPerson = !!permanentStaff.find(s => s.id === personId)
  const person        = allPeople.find(p => p.id === personId)

  // Public holidays this month
  const phMap = React.useMemo(() =>
    publicHolidays.filter(h => h.date.startsWith(monthKey))
      .reduce((acc, h) => { acc[h.date] = h; return acc }, {}),
    [publicHolidays, monthKey]
  )

  // Build calendar cells
  const todayStr    = now.toISOString().slice(0, 10)
  const firstDow    = new Date(year, month - 1, 1).getDay()
  const daysInMonth = new Date(year, month, 0).getDate()
  const cells = []
  for (let i = 0; i < firstDow; i++) cells.push(null)
  for (let d = 1; d <= daysInMonth; d++) {
    const ds        = `${year}-${mm}-${String(d).padStart(2, '0')}`
    const dow       = new Date(year, month - 1, d).getDay()
    const isSun     = dow === 0
    const isPH      = !!phMap[ds]
    const isFuture  = ds > todayStr
    const recStatus = personAtt[ds]?.status
    const dispStatus = recStatus || (isSun ? 'weekly_off' : isPH ? 'holiday' : null)
    cells.push({ ds, d, isSun, isPH, isFuture, recStatus, dispStatus })
  }

  // Stats — count Sundays separately (they can be marked present now)
  const stats = { present: 0, half_day: 0, leave: 0, holiday: 0, absent: 0 }
  cells.filter(Boolean).forEach(c => {
    if (!c.isFuture && c.dispStatus && stats[c.dispStatus] !== undefined)
      stats[c.dispStatus]++
  })
  const sundayPresent  = cells.filter(Boolean).filter(c => c.isSun && !c.isFuture && c.recStatus === 'present').length
  const workingDays    = cells.filter(Boolean).filter(c => !c.isSun && !c.isFuture).length
  const phCount        = cells.filter(Boolean).filter(c => c.isPH && !c.isFuture && (!c.recStatus || c.recStatus === 'holiday')).length

  // Salary estimate differs by person type
  let estSalary = null
  let salaryNote = ''
  if (isStaffPerson && person?.monthlySalary && workingDays > 0) {
    const monthlyHoliday  = person.monthlyHoliday ?? 2
    const regularPaid     = stats.present - sundayPresent + stats.half_day * 0.5 + stats.leave + phCount
    const coveredAbsences = Math.min(stats.absent, monthlyHoliday)
    const effectivePaid   = Math.min(regularPaid + coveredAbsences, workingDays) + sundayPresent
    estSalary  = Math.round(person.monthlySalary * effectivePaid / workingDays)
    salaryNote = `₹${person.monthlySalary} × ${effectivePaid.toFixed(1)} paid / ${workingDays} working · ${monthlyHoliday} free holidays/mo`
  } else if (!isStaffPerson && person?.ratePerDay) {
    const paidDays = stats.present + stats.half_day * 0.5
    estSalary  = Math.round(paidDays * person.ratePerDay)
    salaryNote = `${paidDays.toFixed(1)} days × ₹${person.ratePerDay}/day`
  }

  const handleDayTap = async (cell) => {
    if (cell.isFuture || !personId) return
    let cycle
    if (cell.isSun)  cycle = SUN_CYCLE
    else if (cell.isPH) cycle = HOLIDAY_CYCLE
    else             cycle = NORMAL_CYCLE
    const idx  = cycle.indexOf(cell.recStatus ?? null)
    const next = cycle[(idx + 1) % cycle.length]
    setSaving(cell.ds)
    try { await markAttendanceOnDate(personId, cell.ds, next) }
    catch (e) { showToast('Failed: ' + e.message) }
    finally { setSaving(null) }
  }

  const handleAddHoliday = async () => {
    if (!hForm?.date || !hForm?.name) return
    setHSaving(true)
    try { await addPublicHoliday(hForm.date, hForm.name); showToast('Holiday added ✓'); setHForm(null) }
    catch (e) { showToast(e.message) }
    setHSaving(false)
  }

  const prevMonth = () => { if (month === 1) { setYear(y => y - 1); setMonth(12) } else setMonth(m => m - 1) }
  const nextMonth = () => { if (month === 12) { setYear(y => y + 1); setMonth(1) } else setMonth(m => m + 1) }

  if (allPeople.length === 0) return (
    <div className="p-4 pt-0">
      <div className="rounded-2xl border border-[var(--c-border)] p-6 text-center">
        <p className="text-2xl mb-2">📅</p>
        <p className="text-sm font-semibold text-[var(--c-sub)]">No staff or workers added</p>
        <p className="text-xs text-[var(--c-faint)] mt-1">Add staff in the Staff tab or workers in the Regular tab first</p>
      </div>
      <Style />
    </div>
  )

  return (
    <div className="p-4 pt-0 space-y-3 pb-6">
      <div className="bg-[var(--c-nav)] rounded-2xl p-2.5 text-[10px] text-[var(--c-muted)] leading-relaxed">
        Staff: <span className="text-[var(--c-sub)]">monthly salary · free holidays + leaves + PH paid · Sunday can be marked present</span>
        &nbsp;·&nbsp;Regular: <span className="text-[var(--c-sub)]">days present × daily rate</span>
      </div>

      {/* Person selector */}
      {allPeople.length > 1 ? (
        <select className="finput" value={personId || ''} onChange={e => setPersonId(e.target.value)} style={{ background: 'var(--c-surface)' }}>
          {permanentStaff.length > 0 && (
            <optgroup label="Permanent Staff" style={{ background: 'var(--c-surface)' }}>
              {permanentStaff.map(s => <option key={s.id} value={s.id} style={{ background: 'var(--c-surface)' }}>{s.name} — {s.designation || 'Staff'}</option>)}
            </optgroup>
          )}
          {regularLabourers.length > 0 && (
            <optgroup label="Regular Workers" style={{ background: 'var(--c-surface)' }}>
              {regularLabourers.map(l => <option key={l.id} value={l.id} style={{ background: 'var(--c-surface)' }}>{l.name} — {l.workType || 'Worker'}</option>)}
            </optgroup>
          )}
        </select>
      ) : (
        <div className="flex items-center gap-2 px-1">
          <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold"
            style={{ background: isStaffPerson ? '#4169E1' + '20' : '#1D9E75' + '20', color: isStaffPerson ? '#4169E1' : '#1D9E75' }}>
            {person?.name?.charAt(0)}
          </div>
          <div>
            <p className="text-sm font-semibold text-[var(--c-text)]">{person?.name}</p>
            <p className="text-[10px] text-[var(--c-muted)]">
              {isStaffPerson ? `${person?.designation} · ₹${person?.monthlySalary}/mo · ${person?.monthlyHoliday ?? 2} holidays/mo` : `${person?.workType} · ₹${person?.ratePerDay}/day`}
            </p>
          </div>
        </div>
      )}

      {/* Month navigation */}
      <div className="flex items-center justify-between bg-[var(--c-nav)] rounded-2xl px-4 py-3">
        <button onClick={prevMonth} className="text-[var(--c-sub)] hover:text-[var(--c-text)] px-2 py-1 rounded-lg hover:bg-[var(--c-ghost)] text-lg">‹</button>
        <p className="text-sm font-bold text-[var(--c-text)]">{MONTH_NAMES[month - 1]} {year}</p>
        <button onClick={nextMonth} className="text-[var(--c-sub)] hover:text-[var(--c-text)] px-2 py-1 rounded-lg hover:bg-[var(--c-ghost)] text-lg">›</button>
      </div>

      {/* Calendar */}
      <div className="bg-[var(--c-nav)] rounded-2xl overflow-hidden">
        <div className="grid grid-cols-7 border-b border-[var(--c-border)]">
          {DAY_LABELS.map((d, i) => (
            <div key={d} className="text-center py-2 text-[10px] font-bold"
              style={{ color: i === 0 ? '#E24B4A80' : 'var(--c-faint)' }}>{d}</div>
          ))}
        </div>
        <div className="grid grid-cols-7">
          {cells.map((cell, i) => {
            if (!cell) return <div key={`e${i}`} className="aspect-square" />
            const style    = cell.dispStatus ? ATT_STYLES[cell.dispStatus] : null
            const isToday  = cell.ds === todayStr
            const isTapping = saving === cell.ds
            return (
              <button key={cell.ds} onClick={() => handleDayTap(cell)}
                disabled={cell.isFuture || isTapping}
                className="aspect-square flex flex-col items-center justify-center gap-0.5 border border-white/[0.04] transition-opacity disabled:cursor-default"
                style={{ background: style ? style.bg + '30' : 'transparent', opacity: cell.isFuture ? 0.35 : 1 }}>
                <span className="text-[10px] font-semibold leading-none"
                  style={{ color: cell.isSun && !cell.recStatus ? '#E24B4A60' : style ? style.bg : 'var(--c-sub)' }}>
                  {cell.d}
                </span>
                {style && style.label && (
                  <span className="text-[8px] font-bold leading-none px-1 py-0.5 rounded"
                    style={{ background: style.bg + '50', color: style.bg }}>
                    {isTapping ? '…' : style.label}
                  </span>
                )}
                {cell.isPH && !cell.recStatus && (
                  <span className="text-[7px] text-[#7B2D8B] leading-none">PH</span>
                )}
                {isToday && !style && (
                  <div className="w-1 h-1 rounded-full bg-[#1D9E75] mt-0.5" />
                )}
              </button>
            )
          })}
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-2">
        {[
          { label: 'Present',      val: stats.present,  color: '#1D9E75' },
          { label: 'Half Day',     val: stats.half_day, color: '#BA7517' },
          { label: 'Leave',        val: stats.leave,    color: '#4169E1' },
          { label: 'P. Holiday',   val: phCount,         color: '#7B2D8B' },
          { label: 'Absent',       val: stats.absent,   color: '#E24B4A' },
          { label: 'Working Days', val: workingDays,    color: '#888' },
        ].map(({ label, val, color }) => (
          <div key={label} className="bg-[var(--c-nav)] rounded-xl p-3 text-center border border-[var(--c-border)]">
            <p className="text-lg font-bold" style={{ color }}>{val}</p>
            <p className="text-[10px] text-[var(--c-muted)] mt-0.5">{label}</p>
          </div>
        ))}
      </div>
      {estSalary !== null && (
        <div className="bg-[var(--c-surface)] rounded-2xl p-4 flex items-center justify-between border border-[var(--c-border)]">
          <div>
            <p className="text-xs text-[var(--c-muted)]">Estimated salary</p>
            <p className="text-[10px] text-[var(--c-faint)] mt-0.5">{salaryNote}</p>
          </div>
          <p className="text-xl font-bold text-[#1D9E75]">₹{estSalary.toLocaleString('en-IN')}</p>
        </div>
      )}

      {/* Legend */}
      <div className="flex flex-wrap gap-2">
        {Object.entries(ATT_STYLES).filter(([k]) => k !== 'weekly_off').map(([s, cfg]) => (
          <div key={s} className="flex items-center gap-1.5">
            <div className="w-4 h-4 rounded text-[8px] font-bold flex items-center justify-center"
              style={{ background: cfg.bg + '30', color: cfg.bg, border: `1px solid ${cfg.bg}60` }}>
              {cfg.label}
            </div>
            <span className="text-[10px] text-[var(--c-faint)] capitalize">{s.replace('_', ' ')}</span>
          </div>
        ))}
      </div>
      <p className="text-[10px] text-[var(--c-faint)] text-center">Tap a day to cycle · Sunday tap marks present (overtime)</p>

      {/* Public Holidays */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <p className="text-[10px] font-bold text-[var(--c-muted)] uppercase tracking-wide">Public Holidays</p>
          <button onClick={() => setHForm({ date: '', name: '' })}
            className="text-[10px] text-[#7B2D8B] px-2 py-1 border border-[#7B2D8B]/30 rounded-lg hover:bg-[#7B2D8B]/10">
            + Add
          </button>
        </div>
        {hForm && (
          <div className="bg-[var(--c-nav)] rounded-2xl border border-[#7B2D8B]/30 p-4 space-y-3 mb-2">
            <div className="grid grid-cols-2 gap-2">
              <FRow label="Date">
                <input type="date" className="finput" value={hForm.date} onChange={e => setHForm(p => ({ ...p, date: e.target.value }))} style={{ colorScheme: 'dark' }} />
              </FRow>
              <FRow label="Holiday name">
                <input className="finput" placeholder="e.g. Diwali" value={hForm.name} onChange={e => setHForm(p => ({ ...p, name: e.target.value }))} />
              </FRow>
            </div>
            <div className="flex gap-2">
              <button onClick={handleAddHoliday} disabled={hSaving || !hForm.date || !hForm.name}
                className="flex-1 py-2.5 text-xs font-bold text-[var(--c-text)] rounded-xl disabled:opacity-40"
                style={{ background: '#7B2D8B' }}>
                {hSaving ? 'Saving…' : 'Add Holiday'}
              </button>
              <button onClick={() => setHForm(null)} className="px-4 py-2.5 bg-[var(--c-ghost)] text-[var(--c-sub)] text-xs rounded-xl">Cancel</button>
            </div>
          </div>
        )}
        {publicHolidays.length === 0
          ? <p className="text-[10px] text-[var(--c-faint)] text-center py-2">No public holidays added</p>
          : publicHolidays.map(h => (
            <div key={h.id} className="flex items-center justify-between py-2 border-b border-[var(--c-border)]">
              <div>
                <p className="text-xs font-semibold text-[var(--c-text)]">{h.name}</p>
                <p className="text-[10px] text-[#7B2D8B]">{h.date}</p>
              </div>
              <button onClick={() => deletePublicHoliday(h.id)} className="text-[var(--c-faint)] hover:text-[#E24B4A]"><Trash2 size={13} /></button>
            </div>
          ))
        }
      </div>

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
  const [form,    setForm]    = useState(null)
  const [saving,  setSaving]  = useState(false)
  const [toast,   setToast]   = useState(null)
  const [confirm, setConfirm] = useState(null)

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

  const handleDelete = (id, name) => {
    setConfirm({
      title: `Delete "${name}"?`,
      message: 'This plot will be permanently deleted. Plots with active or past crop cycles cannot be deleted.',
      confirmLabel: 'Delete',
      onConfirm: async () => {
        setConfirm(null)
        try {
          const res = await deletePlot(id)
          if (res?.blocked) showToast('Cannot delete — plot has active crop cycles', 'warn')
          else showToast('Plot removed')
        } catch (e) { showToast('Delete failed: ' + e.message, 'warn') }
      },
    })
  }

  const PointRow = ({ label, latKey, lngKey }) => (
    <div className="flex items-center gap-2">
      <span className="text-xs font-mono font-semibold text-[#1D9E75] w-6 shrink-0">{label}</span>
      <div className="flex-1">
        <input type="number" step="any" placeholder="Latitude (28.xxx)"
          value={form?.[latKey] || ''}
          onChange={e => f(latKey, e.target.value)}
          className="w-full bg-[var(--c-ghost)] border border-[var(--c-border-md)] rounded-xl px-3 py-2 text-xs text-[var(--c-text)] focus:outline-none focus:border-[#1D9E75]" />
      </div>
      <div className="flex-1">
        <input type="number" step="any" placeholder="Longitude (80.xxx)"
          value={form?.[lngKey] || ''}
          onChange={e => f(lngKey, e.target.value)}
          className="w-full bg-[var(--c-ghost)] border border-[var(--c-border-md)] rounded-xl px-3 py-2 text-xs text-[var(--c-text)] focus:outline-none focus:border-[#1D9E75]" />
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
        <div className="bg-[var(--c-nav)] rounded-2xl border border-[#1D9E75]/30 p-4 space-y-3">
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
              <select className="finput" value={form.soil_type || ''} onChange={e => f('soil_type', e.target.value)} style={{ background: 'var(--c-surface)' }}>
                {SOIL_TYPES.map(s => <option key={s} value={s} style={{ background: 'var(--c-surface)' }}>{s.charAt(0).toUpperCase()+s.slice(1)}</option>)}
              </select>
            </FRow>
            <FRow label="Water source">
              <select className="finput" value={form.water_source || ''} onChange={e => f('water_source', e.target.value)} style={{ background: 'var(--c-surface)' }}>
                {WATER_SRCS.map(w => <option key={w} value={w} style={{ background: 'var(--c-surface)' }}>{w.charAt(0).toUpperCase()+w.slice(1)}</option>)}
              </select>
            </FRow>
          </div>

          <div className="border-t border-[var(--c-border)] pt-3">
            <p className="text-[10px] text-[var(--c-muted)] mb-2">GPS boundary corners — A→B→C→D→A draws the plot on the map</p>
            <div className="grid grid-cols-2 gap-[2px] text-[9px] text-[var(--c-faint)] px-7 mb-1">
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
              className="flex-1 py-2.5 bg-[#1D9E75] text-[var(--c-text)] text-xs font-bold rounded-xl disabled:opacity-40">
              {saving ? 'Saving…' : form.id ? 'Update Plot' : 'Save to Database'}
            </button>
            <button onClick={() => setForm(null)} className="px-4 py-2.5 bg-[var(--c-ghost)] text-[var(--c-sub)] text-xs rounded-xl">Cancel</button>
          </div>
        </div>
      )}

      {plots.map(plot => {
        const hasPoints = plot.point_a_lat && plot.point_a_lng
        const activeCycles = cropCycles.filter(c => c.plotId === plot.id && c.status === 'active').length
        return (
          <div key={plot.id} className="bg-[var(--c-nav)] rounded-2xl border border-[var(--c-border)] p-4">
            <div className="flex items-start justify-between">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-[var(--c-text)]">{plot.name}</p>
                <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-0.5">
                  <span className="text-[10px] text-[var(--c-muted)]">{plot.area_acres} acres</span>
                  {plot.soil_type   && <span className="text-[10px] text-[var(--c-faint)]">{plot.soil_type}</span>}
                  {plot.water_source && <span className="text-[10px] text-[var(--c-faint)]">{plot.water_source}</span>}
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
                <button onClick={() => handleDelete(plot.id, plot.name)} className="text-[var(--c-faint)] hover:text-[#E24B4A]">
                  <Trash2 size={15} />
                </button>
              </div>
            </div>
          </div>
        )
      })}

      {confirm && <ConfirmDialog {...confirm} onCancel={() => setConfirm(null)} />}
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
  const [confirm, setConfirm] = useState(null)

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

  const handleDeactivate = (user) => {
    setConfirm({
      title: `Deactivate "${user.full_name}"?`,
      message: 'This user will lose access to the app immediately. You can reactivate them at any time.',
      confirmLabel: 'Deactivate',
      onConfirm: async () => {
        setConfirm(null)
        try {
          await deactivateUser(user.id)
          showToast('User deactivated')
        } catch (e) { showToast(e.message, 'warn') }
      },
    })
  }

  const handleReactivate = async (user) => {
    try {
      await reactivateUser(user.id)
      showToast('User reactivated')
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
        <div className="bg-[var(--c-nav)] rounded-2xl border border-[#1D9E75]/30 p-4 space-y-3">
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
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl border transition-all text-left ${form.role === r.value ? 'border-[#1D9E75]/60 bg-[#1D9E75]/10' : 'border-[var(--c-border)] bg-[var(--c-card)]'}`}>
                  <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: r.color }} />
                  <div>
                    <p className="text-xs font-semibold text-[var(--c-text)]">{r.label}</p>
                    <p className="text-[10px] text-[var(--c-muted)]">{r.desc}</p>
                  </div>
                  {form.role === r.value && <span className="ml-auto text-[#1D9E75] text-xs">✓</span>}
                </button>
              ))}
            </div>
          </FRow>
          <div className="flex gap-2">
            <button onClick={save} disabled={saving}
              className="flex-1 py-2.5 bg-[#1D9E75] text-[var(--c-text)] text-xs font-bold rounded-xl disabled:opacity-40">
              {saving ? 'Creating…' : 'Create User'}
            </button>
            <button onClick={() => setForm(null)} className="px-4 py-2.5 bg-[var(--c-ghost)] text-[var(--c-sub)] text-xs rounded-xl">Cancel</button>
          </div>
        </div>
      )}

      {users.map(user => {
        const isSelf = user.id === me?.id
        return (
          <div key={user.id} className={`bg-[var(--c-nav)] rounded-2xl border p-4 ${user.is_active ? 'border-[var(--c-border)]' : 'border-white/4 opacity-50'}`}>
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="text-sm font-semibold text-[var(--c-text)]">{user.full_name}</p>
                  <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded border" style={roleStyle(user.role)}>
                    {ROLES.find(r => r.value === user.role)?.label}
                  </span>
                  {!user.is_active && <span className="text-[9px] text-[#E24B4A] bg-[#E24B4A]/10 px-1.5 py-0.5 rounded">Inactive</span>}
                  {isSelf && <span className="text-[9px] text-[var(--c-faint)] bg-[var(--c-card)] px-1.5 py-0.5 rounded">You</span>}
                </div>
                <p className="text-[10px] text-[var(--c-muted)] mt-0.5">{user.email}</p>
                {user.phone && <p className="text-[10px] text-[var(--c-faint)]">{user.phone}</p>}
              </div>
              {!isSelf && (
                <div className="flex items-center gap-2 shrink-0">
                  <select value={user.role}
                    onChange={e => changeRole(user.id, e.target.value)}
                    className="text-[10px] bg-[var(--c-ghost)] border border-[var(--c-border-md)] rounded-lg px-1.5 py-1 text-[var(--c-text)] focus:outline-none"
                    style={{ background: 'var(--c-surface)' }}>
                    {ROLES.map(r => <option key={r.value} value={r.value} style={{ background: 'var(--c-surface)' }}>{r.label}</option>)}
                  </select>
                  {user.is_active ? (
                    <button onClick={() => handleDeactivate(user)}
                      className="text-[10px] px-2 py-1 rounded-lg border border-[#E24B4A]/30 text-[#E24B4A] hover:bg-[#E24B4A]/10 transition-colors">
                      Deactivate
                    </button>
                  ) : (
                    <button onClick={() => handleReactivate(user)}
                      className="text-[10px] px-2 py-1 rounded-lg border border-[#1D9E75]/30 text-[#1D9E75] hover:bg-[#1D9E75]/10 transition-colors">
                      Reactivate
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        )
      })}

      {users.length === 0 && <p className="text-xs text-[var(--c-faint)] text-center py-6">No users yet.</p>}
      {confirm && <ConfirmDialog {...confirm} onCancel={() => setConfirm(null)} />}
      {toast && <Toast msg={toast.m} type={toast.type} />}
      <Style />
    </div>
  )
}

// ── Person Card (Staff + Regular Labour) ─────────────────────────────────────
function PersonCard({ person, accentColor, isLogOpen, onToggleLog, onEdit, onDelete, onDeactivate, onReactivate, subLabel, ratePerDay, monthlySalary }) {
  const isActive = person.isActive !== false
  return (
    <div className="bg-[var(--c-nav)] rounded-2xl border overflow-hidden transition-opacity"
      style={{ borderColor: isActive ? 'var(--c-border)' : '#E24B4A30', opacity: isActive ? 1 : 0.7 }}>
      {/* Main row */}
      <div className="p-4 flex items-start gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-sm font-bold text-[var(--c-text)]">{person.name}</p>
            {!isActive && (
              <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full border"
                style={{ color: '#E24B4A', borderColor: '#E24B4A40', background: '#E24B4A10' }}>
                ⏸ Deactivated
              </span>
            )}
          </div>
          <p className="text-[10px] text-[var(--c-muted)] mt-0.5">{subLabel}</p>
          {person.phone && (
            <a href={`tel:${person.phone}`}
              className="inline-flex items-center gap-1 mt-1 text-[10px] font-semibold rounded-lg px-2 py-0.5 border transition-colors hover:bg-[var(--c-ghost)]"
              style={{ color: accentColor, borderColor: accentColor + '40' }}>
              📞 {person.phone}
            </a>
          )}
          {person.openingBalance !== 0 && (
            <p className="text-[10px] mt-1" style={{ color: person.openingBalance > 0 ? '#1D9E75' : '#E24B4A' }}>
              Opening bal: {person.openingBalance > 0 ? '+' : ''}₹{Number(person.openingBalance).toLocaleString()}
            </p>
          )}
        </div>
        {/* Photo right side */}
        <div className="shrink-0">
          {person.photoUrl
            ? <img src={person.photoUrl} alt={person.name}
                className="w-16 h-16 rounded-xl object-cover border border-[var(--c-border-md)]" />
            : <BlankFace color={accentColor} />
          }
        </div>
      </div>
      {/* Action bar */}
      <div className="flex border-t border-[var(--c-border)] divide-x divide-[var(--c-border)]">
        <button onClick={onToggleLog}
          className={`flex-1 py-2.5 text-[10px] font-semibold flex items-center justify-center gap-1 transition-colors ${isLogOpen ? 'text-[#BA7517] bg-[#BA7517]/8' : 'text-[var(--c-muted)] hover:text-[var(--c-sub)]'}`}>
          📋 Log
        </button>
        <button onClick={onEdit}
          className="flex-1 py-2.5 text-[10px] font-semibold text-[var(--c-muted)] hover:text-[#1D9E75] flex items-center justify-center gap-1 transition-colors">
          ✏️ Edit
        </button>
        {isActive ? (
          <button onClick={onDeactivate}
            className="flex-1 py-2.5 text-[10px] font-semibold text-[var(--c-muted)] hover:text-[#BA7517] flex items-center justify-center gap-1 transition-colors">
            ⏸ Pause
          </button>
        ) : (
          <button onClick={onReactivate}
            className="flex-1 py-2.5 text-[10px] font-semibold flex items-center justify-center gap-1 transition-colors"
            style={{ color: '#1D9E75' }}>
            ▶ Activate
          </button>
        )}
        <button onClick={onDelete}
          className="flex-1 py-2.5 text-[10px] font-semibold text-[var(--c-muted)] hover:text-[#E24B4A] flex items-center justify-center gap-1 transition-colors">
          🗑 Delete
        </button>
      </div>
      {/* Salary log */}
      {isLogOpen && (
        <SalaryLog personId={person.id} ratePerDay={ratePerDay} monthlySalary={monthlySalary} />
      )}
    </div>
  )
}

function BlankFace({ color }) {
  return (
    <div className="w-16 h-16 rounded-xl border border-[var(--c-border-md)] flex items-center justify-center"
      style={{ background: color + '12' }}>
      <svg width="32" height="32" viewBox="0 0 24 24" fill="none"
        stroke={color} strokeWidth="1.2" strokeLinecap="round" opacity="0.4">
        <circle cx="12" cy="8" r="4" />
        <path d="M4 20c0-4 3.6-7 8-7s8 3 8 7" />
      </svg>
    </div>
  )
}

const MONTH_NAMES_SHORT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

function SalaryLog({ personId, ratePerDay, monthlySalary }) {
  const [rows, setRows] = React.useState(null)

  React.useEffect(() => {
    const from = new Date()
    from.setMonth(from.getMonth() - 5)
    from.setDate(1)
    const fromStr = from.toISOString().slice(0, 10)

    Promise.all([
      supabase.from('attendance')
        .select('attendance_date, status')
        .eq('labour_master_id', personId)
        .gte('attendance_date', fromStr),
      supabase.from('salary_advances')
        .select('advance_date, amount')
        .eq('labourer_id', personId)
        .gte('advance_date', fromStr),
    ]).then(([{ data: att }, { data: adv }]) => {
      const months = {}
      ;(att || []).forEach(r => {
        const ym = r.attendance_date.slice(0, 7)
        if (!months[ym]) months[ym] = { present: 0, half: 0, absent: 0 }
        if (r.status === 'present')       months[ym].present++
        else if (r.status === 'half_day') months[ym].half++
        else if (r.status === 'absent')   months[ym].absent++
      })
      const advances = {}
      ;(adv || []).forEach(a => {
        const ym = a.advance_date.slice(0, 7)
        advances[ym] = (advances[ym] || 0) + Number(a.amount)
      })
      setRows({ months, advances })
    })
  }, [personId])

  if (!rows) return <div className="px-4 pb-3 text-[10px] text-[var(--c-faint)]">Loading…</div>

  const monthKeys = Object.keys(rows.months).sort().reverse()

  return (
    <div className="border-t border-[var(--c-border)] px-4 pb-4 pt-3 space-y-2">
      <p className="text-[10px] font-bold text-[var(--c-faint)] uppercase tracking-wide">Salary Log — Last 6 Months</p>
      {monthKeys.length === 0 && (
        <p className="text-[10px] text-[var(--c-faint)] italic">No attendance recorded yet</p>
      )}
      {monthKeys.map(ym => {
        const { present, half, absent } = rows.months[ym]
        const paidDays = present + half * 0.5
        const [y, m]   = ym.split('-')
        const label    = `${MONTH_NAMES_SHORT[Number(m) - 1]} ${y}`
        const earned   = ratePerDay
          ? Math.round(paidDays * ratePerDay)
          : monthlySalary
            ? null   // for staff show days only; prorated needs working-days count
            : null
        const advance  = rows.advances[ym] || 0
        const net      = earned !== null ? earned - advance : null

        return (
          <div key={ym} className="bg-white/[0.04] rounded-xl px-3 py-2.5">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs font-semibold text-[var(--c-text)]">{label}</p>
                <p className="text-[10px] text-[var(--c-muted)] mt-0.5">
                  {present}P · {half}H · {absent}A · {paidDays} paid days
                </p>
                {advance > 0 && (
                  <p className="text-[10px] text-[#BA7517] mt-0.5">Advance taken: ₹{advance.toLocaleString()}</p>
                )}
              </div>
              {earned !== null && (
                <div className="text-right shrink-0 ml-3">
                  <p className="text-sm font-bold text-[#1D9E75]">₹{earned.toLocaleString()}</p>
                  {advance > 0 && (
                    <p className="text-[10px] text-[var(--c-muted)]">Net ₹{net.toLocaleString()}</p>
                  )}
                </div>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ── Shared ────────────────────────────────────────────────────────────────────
const FRow = ({ label, children }) => (
  <div><label className="text-xs font-medium text-[var(--c-sub)] block mb-1.5">{label}</label>{children}</div>
)

function ConfirmDialog({ title, message, confirmLabel = 'Delete', onConfirm, onCancel }) {
  return (
    <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center bg-black/70 px-4 pb-6 sm:pb-0">
      <div className="bg-[var(--c-nav)] rounded-2xl border border-[var(--c-border-md)] p-5 w-full max-w-sm space-y-4 shadow-2xl">
        <div className="flex items-start gap-3">
          <div className="shrink-0 w-10 h-10 rounded-full bg-[#E24B4A]/15 flex items-center justify-center">
            <AlertTriangle size={18} className="text-[#E24B4A]" />
          </div>
          <div className="flex-1 pt-0.5">
            <p className="text-sm font-bold text-[var(--c-text)]">{title}</p>
            <p className="text-xs text-[var(--c-sub)] mt-1 leading-relaxed">{message}</p>
          </div>
        </div>
        <div className="flex gap-2">
          <button onClick={onCancel}
            className="flex-1 py-3 bg-[var(--c-ghost)] text-[var(--c-sub)] text-xs font-semibold rounded-xl hover:bg-white/12 transition-colors">
            Cancel
          </button>
          <button onClick={onConfirm}
            className="flex-1 py-3 bg-[#E24B4A] text-[var(--c-text)] text-xs font-bold rounded-xl hover:bg-[#cc3938] transition-colors">
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}

function Toast({ msg, type = 'success' }) {
  const bg   = type === 'warn' ? '#BA7517' : '#1D9E75'
  const Icon = type === 'warn' ? AlertTriangle : CheckCircle2
  return (
    <div className="fixed bottom-24 left-4 right-4 px-4 py-3 rounded-2xl text-sm font-medium text-[var(--c-text)] shadow-xl z-50 flex items-center gap-2"
      style={{ background: bg }}>
      <Icon size={16} /> {msg}
    </div>
  )
}

const Style = () => (
  <style>{`.finput{width:100%;background:var(--c-input);border:1px solid var(--c-border-md);border-radius:12px;padding:10px 14px;color:var(--c-text);font-size:14px;outline:none;}.finput:focus{border-color:#1D9E75;}.no-scrollbar::-webkit-scrollbar{display:none}.no-scrollbar{-ms-overflow-style:none;scrollbar-width:none}`}</style>
)

// ── Buyers Master ─────────────────────────────────────────────────────────────
const BUYER_CATEGORIES = [
  { key: 'sugarcane',  label: 'Sugarcane',    emoji: '🎋' },
  { key: 'wheat',      label: 'Wheat',         emoji: '🌾' },
  { key: 'paddy',      label: 'Paddy / Rice',  emoji: '🍚' },
  { key: 'maize',      label: 'Maize',         emoji: '🌽' },
  { key: 'bhoosa',     label: 'Bhoosa',        emoji: '🌿' },
  { key: 'dairy',      label: 'Dairy / Milk',  emoji: '🥛' },
  { key: 'mustard',    label: 'Mustard',       emoji: '🌻' },
  { key: 'vegetables', label: 'Vegetables',    emoji: '🥦' },
  { key: 'general',    label: 'General',       emoji: '🏪' },
]

const BUYER_ENTITY_TYPES = [
  { value: 'mill',        label: 'Sugar / Oil Mill' },
  { value: 'trader',      label: 'Trader / Arhatiya' },
  { value: 'cooperative', label: 'Cooperative / Society' },
  { value: 'dairy',       label: 'Dairy / Cooperative' },
  { value: 'mandi',       label: 'Mandi / Market' },
  { value: 'direct',      label: 'Direct / Retailer' },
  { value: 'other',       label: 'Other' },
]

function BuyersMaster() {
  const { buyers, addBuyer, updateBuyer } = useAppStore()
  const [form,      setForm]      = useState(null)
  const [filter,    setFilter]    = useState('all')
  const [saving,    setSaving]    = useState(false)
  const [toast,     setToast]     = useState(null)

  const showToast = (m, type = 'success') => { setToast({ m, type }); setTimeout(() => setToast(null), 3000) }

  const blank = () => ({ name: '', address: '', contact: '', type: 'trader', buys: [] })

  const toggleBuys = key => setForm(p => ({
    ...p,
    buys: p.buys.includes(key) ? p.buys.filter(k => k !== key) : [...p.buys, key]
  }))

  const save = async () => {
    if (!form.name.trim()) return showToast('Buyer name is required', 'warn')
    if (!form.buys.length) return showToast('Select at least one product category', 'warn')
    setSaving(true)
    try {
      if (form.id) {
        await updateBuyer(form.id, form)
        showToast('Buyer updated ✓')
      } else {
        await addBuyer(form)
        showToast('Buyer added ✓')
      }
      setForm(null)
    } catch (e) { showToast(e.message, 'warn') }
    setSaving(false)
  }

  const visible = filter === 'all'
    ? buyers
    : buyers.filter(b => b.buys.includes(filter))

  return (
    <div className="p-4 space-y-3 pb-6">
      <button onClick={() => setForm(blank())}
        className="w-full flex items-center justify-center gap-2 py-3 border-2 border-dashed border-[#1D9E75]/30 rounded-2xl text-xs text-[#1D9E75] hover:border-[#1D9E75]/60">
        <Plus size={14} /> Add Buyer
      </button>

      {/* filter pills */}
      <div className="flex gap-1.5 flex-wrap">
        <button onClick={() => setFilter('all')}
          className={`text-[10px] px-2.5 py-1 rounded-full border transition-colors ${filter === 'all' ? 'bg-[#1D9E75] border-[#1D9E75] text-white' : 'border-[var(--c-border)] text-[var(--c-muted)] hover:border-[#1D9E75]/50'}`}>
          All
        </button>
        {BUYER_CATEGORIES.map(cat => (
          <button key={cat.key} onClick={() => setFilter(cat.key)}
            className={`text-[10px] px-2.5 py-1 rounded-full border transition-colors ${filter === cat.key ? 'bg-[#1D9E75] border-[#1D9E75] text-white' : 'border-[var(--c-border)] text-[var(--c-muted)] hover:border-[#1D9E75]/50'}`}>
            {cat.emoji} {cat.label}
          </button>
        ))}
      </div>

      {form !== null && (
        <div className="bg-[var(--c-nav)] rounded-2xl border border-[#1D9E75]/30 p-4 space-y-3">
          <p className="text-xs font-bold text-[#1D9E75]">{form.id ? 'Edit Buyer' : 'New Buyer'}</p>
          <FRow label="Name">
            <input className="finput" placeholder="Buyer / mill name"
              value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} />
          </FRow>
          <div className="grid grid-cols-2 gap-2">
            <FRow label="Contact">
              <input className="finput" placeholder="Phone"
                value={form.contact} onChange={e => setForm(p => ({ ...p, contact: e.target.value }))} />
            </FRow>
            <FRow label="Entity type">
              <select className="finput" value={form.type} onChange={e => setForm(p => ({ ...p, type: e.target.value }))} style={{ background: 'var(--c-surface)' }}>
                {BUYER_ENTITY_TYPES.map(t => <option key={t.value} value={t.value} style={{ background: 'var(--c-surface)' }}>{t.label}</option>)}
              </select>
            </FRow>
          </div>
          <FRow label="Address">
            <input className="finput" placeholder="Location / village"
              value={form.address} onChange={e => setForm(p => ({ ...p, address: e.target.value }))} />
          </FRow>
          <FRow label="Buys (what they purchase)">
            <div className="flex flex-wrap gap-1.5 mt-0.5">
              {BUYER_CATEGORIES.map(cat => {
                const sel = form.buys.includes(cat.key)
                return (
                  <button key={cat.key} type="button" onClick={() => toggleBuys(cat.key)}
                    className={`text-[10px] px-2.5 py-1 rounded-full border transition-colors ${sel ? 'bg-[#1D9E75]/20 border-[#1D9E75] text-[#1D9E75]' : 'border-[var(--c-border)] text-[var(--c-muted)] hover:border-[#1D9E75]/40'}`}>
                    {cat.emoji} {cat.label}
                  </button>
                )
              })}
            </div>
            {!form.buys.length && <p className="text-[9px] text-[#BA7517] mt-1">Select at least one product category</p>}
          </FRow>
          <div className="flex gap-2">
            <button onClick={save} disabled={saving}
              className="flex-1 py-2.5 bg-[#1D9E75] text-[var(--c-text)] text-xs font-bold rounded-xl disabled:opacity-40">
              {saving ? 'Saving…' : form.id ? 'Update Buyer' : 'Add Buyer'}
            </button>
            <button onClick={() => setForm(null)} className="px-4 py-2.5 bg-[var(--c-ghost)] text-[var(--c-sub)] text-xs rounded-xl">Cancel</button>
          </div>
        </div>
      )}

      {visible.map(b => {
        const cats = BUYER_CATEGORIES.filter(c => b.buys.includes(c.key))
        const entityLabel = BUYER_ENTITY_TYPES.find(t => t.value === b.type)?.label || b.type
        return (
          <div key={b.id} className="bg-[var(--c-nav)] rounded-2xl border border-[var(--c-border)] p-4 flex items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-[var(--c-text)]">{b.name}</p>
              <p className="text-[10px] text-[var(--c-muted)] mt-0.5">{entityLabel}{b.address ? ` · ${b.address}` : ''}</p>
              {b.contact && <p className="text-[10px] text-[var(--c-faint)]">{b.contact}</p>}
              <div className="flex flex-wrap gap-1 mt-1.5">
                {cats.length ? cats.map(c => (
                  <span key={c.key} className="text-[9px] px-1.5 py-0.5 rounded-full border border-[#1D9E75]/30 text-[#1D9E75] bg-[#1D9E75]/08">
                    {c.emoji} {c.label}
                  </span>
                )) : (
                  <span className="text-[9px] text-[var(--c-faint)]">No categories set</span>
                )}
              </div>
            </div>
            <button onClick={() => setForm({ id: b.id, name: b.name, address: b.address, contact: b.contact, type: b.type, buys: b.buys })}
              className="text-xs text-[#1D9E75] px-2 py-1 border border-[#1D9E75]/30 rounded-lg hover:bg-[#1D9E75]/10 shrink-0">
              Edit
            </button>
          </div>
        )
      })}

      {visible.length === 0 && (
        <p className="text-xs text-[var(--c-faint)] text-center py-6">
          {filter === 'all' ? 'No buyers yet.' : `No buyers tagged as "${BUYER_CATEGORIES.find(c => c.key === filter)?.label}".`}
        </p>
      )}
      {toast && <Toast msg={toast.m} type={toast.type} />}
      <Style />
    </div>
  )
}

// ── Partners Master ────────────────────────────────────────────────────────────
function PartnersMaster() {
  const { partners, updatePartner } = useAppStore()
  // editRow: { id, name } when editing, null otherwise
  const [editRow, setEditRow] = useState(null)
  const [saving,  setSaving]  = useState(false)
  const [toast,   setToast]   = useState(null)

  const showToast = (m, type = 'success') => { setToast({ m, type }); setTimeout(() => setToast(null), 3000) }

  const save = async () => {
    if (!editRow.name.trim()) return showToast('Name cannot be empty', 'warn')
    setSaving(true)
    try {
      await updatePartner(editRow.id, { name: editRow.name.trim() })
      showToast('Partner updated ✓')
      setEditRow(null)
    } catch (e) { showToast(e.message, 'warn') }
    setSaving(false)
  }

  return (
    <div className="p-4 space-y-3 pb-6">
      <p className="text-xs text-[var(--c-muted)] bg-[var(--c-card)] rounded-xl px-3 py-2">
        Partners are pre-seeded family members. You can edit names but not add or remove.
      </p>

      {partners.map(p => (
        <div key={p.id} className="bg-[var(--c-nav)] rounded-2xl border border-[var(--c-border)] p-4">
          {editRow?.id === p.id ? (
            <div className="space-y-2">
              <input className="finput" value={editRow.name}
                onChange={e => setEditRow(r => ({ ...r, name: e.target.value }))}
                autoFocus />
              <div className="flex gap-2">
                <button onClick={save} disabled={saving}
                  className="flex-1 py-2 bg-[#1D9E75] text-[var(--c-text)] text-xs font-bold rounded-xl disabled:opacity-40">
                  {saving ? 'Saving…' : 'Save'}
                </button>
                <button onClick={() => setEditRow(null)}
                  className="px-4 py-2 bg-[var(--c-ghost)] text-[var(--c-sub)] text-xs rounded-xl">Cancel</button>
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold text-[var(--c-text)]">{p.name}</p>
              <button onClick={() => setEditRow({ id: p.id, name: p.name })}
                className="text-xs text-[#1D9E75] px-2 py-1 border border-[#1D9E75]/30 rounded-lg hover:bg-[#1D9E75]/10">
                Edit
              </button>
            </div>
          )}
        </div>
      ))}

      {partners.length === 0 && <p className="text-xs text-[var(--c-faint)] text-center py-6">No partners loaded.</p>}
      {toast && <Toast msg={toast.m} type={toast.type} />}
      <Style />
    </div>
  )
}

// ── Cycles Master — start / view crop cycles ───────────────────────────────────
function CyclesMaster() {
  const { cropCycles, cropMaster, plots, addCropCycle, updateCropCycle } = useAppStore()
  const [form,   setForm]   = useState(null)
  const [saving, setSaving] = useState(false)
  const [toast,  setToast]  = useState(null)
  const [toastType, setToastType] = useState('success')
  const [confirm, setConfirm] = useState(null)

  const showToast = (m, type = 'success') => {
    setToast(m); setToastType(type); setTimeout(() => setToast(null), 3000)
  }

  const activePlotIds = new Set(cropCycles.filter(c => c.status === 'active').map(c => c.plotId))

  const save = async () => {
    if (!form.plotId || !form.cropId || !form.sowDate || !form.season) {
      return showToast('Fill all fields', 'warn')
    }
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

  const handleEndCycle = (c) => {
    const crop = cropMaster.find(cr => cr.id === c.cropId)
    setConfirm({
      title: `End cycle for ${c.plotLabel}?`,
      message: `This will mark the ${crop?.name || 'crop'} cycle as harvested. This action cannot be undone.`,
      confirmLabel: 'End Cycle',
      onConfirm: async () => {
        setConfirm(null)
        try {
          await updateCropCycle(c.id, { status: 'harvested' })
          showToast('Cycle marked as harvested')
        } catch (e) { showToast('Failed: ' + e.message, 'warn') }
      },
    })
  }

  const today = new Date().toISOString().slice(0, 10)
  const activeCycles   = cropCycles.filter(c => c.status === 'active')
  const inactiveCycles = cropCycles.filter(c => c.status !== 'active')
  const availablePlots = plots.filter(p => !activePlotIds.has(p.id))

  return (
    <div className="p-4 space-y-3 pb-6">
      <button onClick={() => setForm({ sowDate: today })}
        className="w-full flex items-center justify-center gap-2 py-3 border-2 border-dashed border-[#1D9E75]/30 rounded-2xl text-xs text-[#1D9E75] hover:border-[#1D9E75]/60">
        <Plus size={14} /> Start New Crop Cycle
      </button>

      {form !== null && (
        <div className="bg-[var(--c-nav)] rounded-2xl border border-[#1D9E75]/30 p-4 space-y-3">
          <p className="text-xs font-bold text-[#1D9E75]">New Crop Cycle</p>

          <FRow label="Plot (empty plots only)">
            <select className="finput" value={form.plotId || ''} onChange={e => setForm(p => ({ ...p, plotId: e.target.value }))} style={{ background: 'var(--c-surface)' }}>
              <option value="" style={{ background: 'var(--c-surface)' }}>Select plot…</option>
              {availablePlots.map(p => (
                <option key={p.id} value={p.id} style={{ background: 'var(--c-surface)' }}>{p.name}</option>
              ))}
              {availablePlots.length === 0 && (
                <option disabled style={{ background: 'var(--c-surface)' }}>All plots have active cycles</option>
              )}
            </select>
            {availablePlots.length === 0 && (
              <p className="text-[10px] text-[#BA7517] mt-1">⚠ All plots have active cycles. End a cycle before starting a new one.</p>
            )}
          </FRow>

          <FRow label="Crop">
            <select className="finput" value={form.cropId || ''} onChange={e => setForm(p => ({ ...p, cropId: e.target.value }))} style={{ background: 'var(--c-surface)' }}>
              <option value="" style={{ background: 'var(--c-surface)' }}>Select crop…</option>
              {cropMaster.map(c => (
                <option key={c.id} value={c.id} style={{ background: 'var(--c-surface)' }}>{c.emoji} {c.name} ({c.duration_days} days)</option>
              ))}
            </select>
          </FRow>

          <div className="grid grid-cols-2 gap-2">
            <FRow label="Sow Date">
              <input type="date" className="finput" value={form.sowDate || ''} onChange={e => setForm(p => ({ ...p, sowDate: e.target.value }))} style={{ colorScheme: 'dark' }} />
            </FRow>
            <FRow label="Season">
              <select className="finput" value={form.season || ''} onChange={e => setForm(p => ({ ...p, season: e.target.value }))} style={{ background: 'var(--c-surface)' }}>
                <option value="" style={{ background: 'var(--c-surface)' }}>Select…</option>
                {['kharif_2025','rabi_2025','kharif_2026','rabi_2026','zaid_2026','kharif_2027','rabi_2027'].map(s => (
                  <option key={s} value={s} style={{ background: 'var(--c-surface)' }}>{s}</option>
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
              <div className="bg-[var(--c-card)] rounded-xl px-3 py-2 text-xs text-[var(--c-sub)]">
                Expected harvest: <span className="text-[var(--c-text)] font-semibold">{harv.toISOString().slice(0, 10)}</span>
                {' '}(day {crop.duration_days})
              </div>
            )
          })()}

          <div className="flex gap-2">
            <button onClick={save} disabled={saving || availablePlots.length === 0}
              className="flex-1 py-2.5 bg-[#1D9E75] text-[var(--c-text)] text-xs font-bold rounded-xl disabled:opacity-40">
              {saving ? 'Starting…' : 'Start Cycle'}
            </button>
            <button onClick={() => setForm(null)} className="px-4 py-2.5 bg-[var(--c-ghost)] text-[var(--c-sub)] text-xs rounded-xl">Cancel</button>
          </div>
        </div>
      )}

      {activeCycles.length > 0 && (
        <div>
          <p className="text-[10px] font-bold text-[var(--c-muted)] uppercase tracking-wide mb-2">Active Cycles ({activeCycles.length})</p>
          {activeCycles.map(c => {
            const crop = cropMaster.find(cr => cr.id === c.cropId)
            const now  = new Date(); now.setHours(0,0,0,0)
            const sow  = new Date(c.sowDate)
            const days = Math.floor((now - sow) / 86400000)
            const left = Math.max(0, (crop?.duration_days || 120) - days)
            return (
              <div key={c.id} className="bg-[var(--c-nav)] rounded-2xl border border-[var(--c-border)] p-4 mb-2 flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg shrink-0 flex items-center justify-center text-base"
                  style={{ background: crop?.color || '#1D9E7520' }}>
                  {crop?.emoji || '🌱'}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-[var(--c-text)]">{c.plotLabel} — {crop?.name || 'Unknown'}</p>
                  <p className="text-[10px] text-[var(--c-muted)]">Sown {c.sowDate} · Day {days} · {left}d left</p>
                  <p className="text-[10px] text-[var(--c-faint)]">{c.season}</p>
                </div>
                <button onClick={() => handleEndCycle(c)}
                  className="shrink-0 px-2 py-1.5 text-[10px] font-semibold border border-[#BA7517]/40 text-[#BA7517] rounded-lg hover:bg-[#BA7517]/10 transition-colors">
                  End
                </button>
              </div>
            )
          })}
        </div>
      )}

      {inactiveCycles.length > 0 && (
        <div>
          <p className="text-[10px] font-bold text-[var(--c-muted)] uppercase tracking-wide mb-2">Past Cycles ({inactiveCycles.length})</p>
          {inactiveCycles.map(c => {
            const crop = cropMaster.find(cr => cr.id === c.cropId)
            return (
              <div key={c.id} className="bg-[var(--c-nav)]/60 rounded-2xl border border-[var(--c-border)] p-3 mb-1.5 opacity-60">
                <p className="text-xs font-semibold text-[var(--c-text)]">{c.plotLabel} — {crop?.name || 'Unknown'}</p>
                <p className="text-[10px] text-[var(--c-muted)]">{c.sowDate} · {c.status} · {c.season}</p>
              </div>
            )
          })}
        </div>
      )}

      {confirm && <ConfirmDialog {...confirm} onCancel={() => setConfirm(null)} />}
      {toast && <Toast msg={toast} type={toastType} />}
      <Style />
    </div>
  )
}

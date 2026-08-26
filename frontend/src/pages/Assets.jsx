import React, { useState, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import FilterSelect from '../components/FilterSelect'
import AddButton from '../components/AddButton'
import { useAppStore } from '../store'
import { supabase } from '../lib/supabase'
import ImageViewer from '../components/ImageViewer'
import ImageCropper from '../components/ImageCropper'
import FilePicker from '../components/FilePicker'
import { uploadAttachment, deleteAttachment, resolveUrl } from '../lib/attachments'
import { CAT_EMOJI } from './assets/vocab'
import { fmtINR as fmt, registerSummary, humanise } from './assets/assetFacts'
import AssetCard  from './assets/AssetCard'
import AssetSheet from './assets/AssetSheet'

const TODAY = new Date().toISOString().slice(0, 10)
// Exported: the purchase-bill screen offers the same vocabularies when a bill
// line turns out to be a machine or an asset rather than stock.
export const MACHINE_TYPES = ['tractor','implement','generator','engine','sprayer','water_motor','trailer','grass_cutter','wood_cutter','vehicle','other']
export const ASSET_CATS    = ['equipment','appliance','furniture','other']
const STATUSES_M    = ['in_use','spare','under_repair','disposed','sold']
const STATUSES_A    = ['in_use','spare','under_repair','disposed','sold']
// Status colours, category emoji and the fact wording live in ./assets/ — shared
// with the register card and the detail sheet.

// ── Shared UI ─────────────────────────────────────────────────────────────────
const inp ="w-full px-3 py-2.5 rounded-xl text-sm border outline-none bg-[var(--c-ghost)] border-[var(--c-border)] text-[var(--c-text)]"

// Who it was bought from, and the paper that proves it.
//
// A tractor has nothing to do with the fertiliser shed, so it is bought here
// rather than through the Inventory bill screen. Naming a vendor is what turns
// a register entry into money owed: the purchase gets its own bill, the party
// ledger shows it, and paying that party settles it. Leave it blank for
// something already owned, or bought with cash nobody is tracking.
function PurchaseSource({ f, u, vendors, billFile, setBillFile }) {
  return (
    <div className="rounded-xl p-3 space-y-3" style={{ background: 'var(--c-ghost)' }}>
      <FRow label="Bought from">
        <select className={inp} value={f.vendorId || ''}
          onChange={e => {
            const v = vendors.find(x => x.id === e.target.value)
            u('vendorId', e.target.value); u('vendorName', v?.name || '')
          }}
          style={{ background: 'var(--c-ghost)' }}>
          <option value="">Nobody — already owned / cash purchase</option>
          {(vendors || []).filter(v => v.is_active).map(v => (
            <option key={v.id} value={v.id}>{v.name}</option>
          ))}
        </select>
      </FRow>
      {f.vendorId && (
        <>
          <FRow label="Invoice No. (optional)">
            <input className={inp} placeholder="e.g. 4237" value={f.invoiceNo || ''}
              onChange={e => u('invoiceNo', e.target.value)} />
          </FRow>
          <FRow label="Bill (photo or PDF, optional)">
            <FilePicker accept="image/*,application/pdf" file={billFile} onFile={setBillFile} />
          </FRow>
          <p className="text-[10px] leading-relaxed" style={{ color: 'var(--c-muted)' }}>
            This adds the full amount to that party's ledger. Settle it from
            Ledger → Party Ledger, the same as any other bill.
          </p>
        </>
      )}
    </div>
  )
}

function Modal({ title, onClose, children }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center" style={{ background: 'rgba(0,0,0,0.5)' }}>
      <div className="w-full max-w-lg rounded-t-2xl p-5 pb-8 space-y-4" style={{ background: 'var(--c-nav)', maxHeight: '92vh', overflowY: 'auto' }}>
        <div className="flex items-center justify-between">
          <p className="font-semibold text-sm" style={{ color: 'var(--c-text)' }}>{title}</p>
          <button onClick={onClose} className="text-lg" style={{ color: 'var(--c-muted)' }}>✕</button>
        </div>
        {children}
      </div>
    </div>
  )
}
function FRow({ label, children }) {
  return (
    <div className="space-y-1">
      <p className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: 'var(--c-muted)' }}>{label}</p>
      {children}
    </div>
  )
}
function SegPicker({ value, options, onChange, danger }) {
  return (
    <div className="flex rounded-xl overflow-hidden border border-[var(--c-border)]">
      {options.map(([v, l]) => (
        <button key={v} onClick={() => onChange(v)}
          className="flex-1 py-2 text-xs font-semibold transition-colors"
          style={{ background: value === v ? (danger ? '#E24B4A' : '#8A9A5B') : 'var(--c-ghost)', color: value === v ? '#fff' : 'var(--c-muted)' }}>
          {l}
        </button>
      ))}
    </div>
  )
}
// ── Edit Machinery Modal ──────────────────────────────────────────────────────
function EditMachineryModal({ item, onClose, onSave, saving }) {
  const [f, setF] = useState({
    name: item.name || '', type: item.type || 'tractor', make: item.make || '',
    quantity: item.quantity || 1, requiresDiesel: item.requiresDiesel || false,
    status: item.status || 'in_use', purchaseDate: item.purchaseDate || '',
    purchasePrice: item.purchasePrice || '', notes: item.notes || '',
  })
  const u = (k, v) => setF(p => ({ ...p, [k]: v }))
  return (
    <Modal title={`Edit ${item.name}`} onClose={onClose}>
      <FRow label="Name"><input className={inp} value={f.name} onChange={e => u('name', e.target.value)} /></FRow>
      <div className="grid grid-cols-2 gap-3">
        <FRow label="Type">
          <select className={inp} value={f.type} onChange={e => u('type', e.target.value)} style={{ background: 'var(--c-ghost)' }}>
            {MACHINE_TYPES.map(t => <option key={t} value={t}>{CAT_EMOJI[t]||'🔧'} {t.replace(/_/g,' ')}</option>)}
          </select>
        </FRow>
        <FRow label="Status">
          <select className={inp} value={f.status} onChange={e => u('status', e.target.value)} style={{ background: 'var(--c-ghost)' }}>
            {STATUSES_M.map(s => <option key={s} value={s}>{s.replace(/_/g,' ')}</option>)}
          </select>
        </FRow>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <FRow label="Make / Brand"><input className={inp} placeholder="e.g. John Deere" value={f.make} onChange={e => u('make', e.target.value)} /></FRow>
        <FRow label="Quantity"><input type="number" className={inp} min="1" value={f.quantity} onChange={e => u('quantity', e.target.value)} /></FRow>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <FRow label="Purchase Date"><input type="date" className={inp} value={f.purchaseDate} onChange={e => u('purchaseDate', e.target.value)} /></FRow>
        <FRow label="Purchase Price (₹)"><input type="number" className={inp} placeholder="0" value={f.purchasePrice} onChange={e => u('purchasePrice', e.target.value)} /></FRow>
      </div>
      <label className="flex items-center gap-2 cursor-pointer py-1">
        <input type="checkbox" checked={f.requiresDiesel} onChange={e => u('requiresDiesel', e.target.checked)} className="w-4 h-4 accent-[#8A9A5B]" />
        <span className="text-sm" style={{ color: 'var(--c-text)' }}>⛽ Requires diesel</span>
      </label>
      <FRow label="Notes"><input className={inp} placeholder="Optional" value={f.notes} onChange={e => u('notes', e.target.value)} /></FRow>
      <button onClick={() => onSave(f)} disabled={saving || !f.name}
        className="w-full py-3 rounded-xl text-sm font-semibold text-white disabled:opacity-50" style={{ background: '#8A9A5B' }}>
        {saving ? 'Saving…' : 'Save Changes'}
      </button>
    </Modal>
  )
}

// ── Edit Farm Asset Modal ─────────────────────────────────────────────────────
function EditFarmAssetModal({ item, onClose, onSave, saving }) {
  const [f, setF] = useState({
    name: item.name || '', category: item.category || 'equipment',
    quantity: item.quantity || 1, status: item.status || 'in_use',
    purchaseDate: item.purchaseDate || '', purchasePrice: item.purchasePrice || '', notes: item.notes || '',
  })
  const u = (k, v) => setF(p => ({ ...p, [k]: v }))
  return (
    <Modal title={`Edit ${item.name}`} onClose={onClose}>
      <FRow label="Name"><input className={inp} value={f.name} onChange={e => u('name', e.target.value)} /></FRow>
      <div className="grid grid-cols-2 gap-3">
        <FRow label="Category">
          <select className={inp} value={f.category} onChange={e => u('category', e.target.value)} style={{ background: 'var(--c-ghost)' }}>
            {ASSET_CATS.map(c => <option key={c} value={c}>{CAT_EMOJI[c]||'📦'} {c.charAt(0).toUpperCase()+c.slice(1)}</option>)}
          </select>
        </FRow>
        <FRow label="Status">
          <select className={inp} value={f.status} onChange={e => u('status', e.target.value)} style={{ background: 'var(--c-ghost)' }}>
            {STATUSES_A.map(s => <option key={s} value={s}>{s.replace(/_/g,' ')}</option>)}
          </select>
        </FRow>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <FRow label="Quantity"><input type="number" className={inp} min="1" value={f.quantity} onChange={e => u('quantity', e.target.value)} /></FRow>
        <FRow label="Purchase Price (₹)"><input type="number" className={inp} placeholder="0" value={f.purchasePrice} onChange={e => u('purchasePrice', e.target.value)} /></FRow>
      </div>
      <FRow label="Purchase Date"><input type="date" className={inp} value={f.purchaseDate} onChange={e => u('purchaseDate', e.target.value)} /></FRow>
      <FRow label="Notes"><input className={inp} placeholder="Optional" value={f.notes} onChange={e => u('notes', e.target.value)} /></FRow>
      <button onClick={() => onSave(f)} disabled={saving || !f.name}
        className="w-full py-3 rounded-xl text-sm font-semibold text-white disabled:opacity-50" style={{ background: '#8A9A5B' }}>
        {saving ? 'Saving…' : 'Save Changes'}
      </button>
    </Modal>
  )
}

// ── Dispose Modal ─────────────────────────────────────────────────────────────
function DisposeModal({ item, onClose, onConfirm, saving }) {
  const [form, setForm] = useState({ type: 'scrapped', date: TODAY, amount: '', buyer: '', notes: '' })
  const f = (k, v) => setForm(p => ({ ...p, [k]: v }))
  return (
    <Modal title={`Dispose: ${item.name}`} onClose={onClose}>
      <FRow label="Disposal Type">
        <SegPicker value={form.type} options={[['scrapped','🗑 Scrapped'],['sold','💰 Sold']]} onChange={v => f('type', v)} danger />
      </FRow>
      <FRow label="Date"><input type="date" className={inp} value={form.date} onChange={e => f('date', e.target.value)} /></FRow>
      <FRow label={form.type === 'sold' ? 'Sale Amount (₹)' : 'Scrap Value (₹)'}>
        <input type="number" className={inp} placeholder="0" value={form.amount} onChange={e => f('amount', e.target.value)} />
      </FRow>
      {form.type === 'sold' && (
        <FRow label="Buyer"><input type="text" className={inp} placeholder="Buyer name" value={form.buyer} onChange={e => f('buyer', e.target.value)} /></FRow>
      )}
      <FRow label="Notes"><input type="text" className={inp} placeholder="Remarks" value={form.notes} onChange={e => f('notes', e.target.value)} /></FRow>
      <button onClick={() => onConfirm(form)} disabled={saving}
        className="w-full py-3 rounded-xl text-sm font-semibold text-white disabled:opacity-50" style={{ background: '#E24B4A' }}>
        {saving ? 'Saving…' : 'Confirm Disposal'}
      </button>
    </Modal>
  )
}

// ── Add Machinery Modal ───────────────────────────────────────────────────────
function AddMachineryModal({ onClose, onConfirm, saving, vendors, moneyFields }) {
  const [f, setF] = useState({ name:'', type:'tractor', make:'', quantity:'1', requiresDiesel:false, purchaseDate:TODAY, purchasePrice:'', notes:'' })
  const [billFile, setBillFile] = useState(null)
  const u = (k, v) => setF(p => ({ ...p, [k]: v }))
  return (
    <Modal title="Add Machinery" onClose={onClose}>
      <FRow label="Name *"><input className={inp} placeholder="e.g. New Tractor" value={f.name} onChange={e => u('name', e.target.value)} /></FRow>
      <div className="grid grid-cols-2 gap-3">
        <FRow label="Type">
          <select className={inp} value={f.type} onChange={e => u('type', e.target.value)} style={{ background: 'var(--c-ghost)' }}>
            {MACHINE_TYPES.map(t => <option key={t} value={t}>{CAT_EMOJI[t]||'🔧'} {t.replace(/_/g,' ')}</option>)}
          </select>
        </FRow>
        <FRow label="Quantity"><input type="number" className={inp} min="1" value={f.quantity} onChange={e => u('quantity', e.target.value)} /></FRow>
      </div>
      <FRow label="Make / Brand"><input className={inp} placeholder="e.g. John Deere" value={f.make} onChange={e => u('make', e.target.value)} /></FRow>
      <div className="grid grid-cols-2 gap-3">
        <FRow label="Purchase Date"><input type="date" className={inp} value={f.purchaseDate} onChange={e => u('purchaseDate', e.target.value)} /></FRow>
        <FRow label="Purchase Price (₹)"><input type="number" className={inp} placeholder="0" value={f.purchasePrice} onChange={e => u('purchasePrice', e.target.value)} /></FRow>
      </div>
      <label className="flex items-center gap-2 cursor-pointer py-1">
        <input type="checkbox" checked={f.requiresDiesel} onChange={e => u('requiresDiesel', e.target.checked)} className="w-4 h-4 accent-[#8A9A5B]" />
        <span className="text-sm" style={{ color: 'var(--c-text)' }}>⛽ Requires diesel</span>
      </label>
      {moneyFields && <PurchaseSource f={f} u={u} vendors={vendors} billFile={billFile} setBillFile={setBillFile} />}
      <FRow label="Notes"><input className={inp} placeholder="Optional" value={f.notes} onChange={e => u('notes', e.target.value)} /></FRow>
      <button onClick={() => f.name && onConfirm({ ...f, billFile })} disabled={saving || !f.name}
        className="w-full py-3 rounded-xl text-sm font-semibold text-white disabled:opacity-50" style={{ background: '#8A9A5B' }}>
        {saving ? 'Saving…' : 'Add Machinery'}
      </button>
    </Modal>
  )
}

// ── Add Farm Asset Modal ──────────────────────────────────────────────────────
function AddFarmAssetModal({ onClose, onConfirm, saving, vendors, moneyFields }) {
  const [f, setF] = useState({ name:'', category:'equipment', quantity:'1', purchaseDate:TODAY, purchasePrice:'', notes:'' })
  const [billFile, setBillFile] = useState(null)
  const u = (k, v) => setF(p => ({ ...p, [k]: v }))
  return (
    <Modal title="Add Farm Asset" onClose={onClose}>
      <FRow label="Name *"><input className={inp} placeholder="e.g. Water Tank 500L" value={f.name} onChange={e => u('name', e.target.value)} /></FRow>
      <div className="grid grid-cols-2 gap-3">
        <FRow label="Category">
          <select className={inp} value={f.category} onChange={e => u('category', e.target.value)} style={{ background: 'var(--c-ghost)' }}>
            {ASSET_CATS.map(c => <option key={c} value={c}>{CAT_EMOJI[c]||'📦'} {c.charAt(0).toUpperCase()+c.slice(1)}</option>)}
          </select>
        </FRow>
        <FRow label="Quantity"><input type="number" className={inp} min="1" value={f.quantity} onChange={e => u('quantity', e.target.value)} /></FRow>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <FRow label="Purchase Date"><input type="date" className={inp} value={f.purchaseDate} onChange={e => u('purchaseDate', e.target.value)} /></FRow>
        <FRow label="Purchase Price (₹)"><input type="number" className={inp} placeholder="0" value={f.purchasePrice} onChange={e => u('purchasePrice', e.target.value)} /></FRow>
      </div>
      {moneyFields && <PurchaseSource f={f} u={u} vendors={vendors} billFile={billFile} setBillFile={setBillFile} />}
      <FRow label="Notes"><input className={inp} placeholder="Optional" value={f.notes} onChange={e => u('notes', e.target.value)} /></FRow>
      <button onClick={() => f.name && onConfirm({ ...f, billFile })} disabled={saving || !f.name}
        className="w-full py-3 rounded-xl text-sm font-semibold text-white disabled:opacity-50" style={{ background: '#8A9A5B' }}>
        {saving ? 'Saving…' : 'Add Asset'}
      </button>
    </Modal>
  )
}

// ── Register list (both tabs) ─────────────────────────────────────────────────
// One component for machinery and farm assets: filter chips by kind, Add, and a
// column of glance-cards. Everything else about an item lives in the sheet the
// card opens — the register is for finding a thing, not reading its file.
function RegisterTab({ items, kind, onOpen, onAdd, onIssueDiesel }) {
  const [filter, setFilter] = useState('all')
  const field = kind === 'machinery' ? 'type' : 'category'
  const kinds = [...new Set(items.map(i => i[field]))].filter(Boolean).sort()
  const list  = filter === 'all' ? items : items.filter(i => i[field] === filter)
  const label = k => (CAT_EMOJI[k] || (kind === 'machinery' ? '🔧' : '📦')) + ' ' + humanise(k)
  const noun  = kind === 'machinery' ? 'machinery' : 'assets'
  return (
    <div className="flex-1 flex flex-col min-h-0">
      <div className="flex-1 overflow-y-auto p-4 space-y-2">
        <AddButton onClick={onAdd}>{kind === 'machinery' ? 'Add Machinery' : 'Add Farm Asset'}</AddButton>
        <FilterSelect value={filter} onChange={setFilter}
          options={[['all', `All ${noun}`], ...kinds.map(k => [k, label(k)])]} />
        {list.map(item => (
          <AssetCard key={item.id} item={item} kind={kind} onOpen={onOpen} onIssueDiesel={onIssueDiesel} />
        ))}
        {list.length === 0 && (
          <p className="text-center py-12 text-sm" style={{ color: 'var(--c-faint)' }}>
            {kind === 'machinery' ? 'No machinery' : 'No assets'}
          </p>
        )}
      </div>
    </div>
  )
}

// ── Main Page ─────────────────────────────────────────────────────────────────
// One register at a time, chosen by the PAGE head, not by a second tab bar of its
// own: Resources shows Inventory · Machinery · Assets across the top and hands
// this component the `kind` (owner, 26 Aug — "resources can be page head with
// inventory, assets and machinery on one page"). Everything below the head — the
// value line, the add row, the filter, the cards, the sheet, the add/edit modals
// — is shared by both kinds and always was.
export default function Assets({ kind = 'machinery' }) {
  const isMachinery = kind === 'machinery'
  const {
    machineryMaster, farmAssets,
    disposeMachinery, disposeFarmAsset,
    addMachinery, addFarmAsset,
    updateMachinery, updateFarmAsset,
    updateAssetPhoto,
  } = useAppStore()

  const navigate = useNavigate()
  // The open detail sheet, by reference not by copy: it re-reads the live row
  // from the store, so an Edit or a photo change shows the moment it saves, and
  // a Dispose (which drops the row from the list) closes it.
  const [selected,     setSelected]     = useState(null)   // { kind, id }
  const [editModal,    setEditModal]    = useState(null)
  const [dispose,      setDispose]      = useState(null)
  const [addModal,     setAddModal]     = useState(null)
  const [saving,       setSaving]       = useState(false)
  const [toast,        setToast]        = useState(null)
  const photoInputRef  = useRef()
  const [pendingPhoto, setPendingPhoto] = useState(null)
  const [cropFile,     setCropFile]     = useState(null)
  const [photoView,    setPhotoView]    = useState(null)
  // Migration 0023 adds vendor_id/bill_id to these tables. Until it is applied
  // the money fields are hidden rather than offered and then failing on save —
  // an asset can still be registered, it just cannot owe anybody yet.
  const [moneyFields,  setMoneyFields]  = useState(false)
  const [vendors,      setVendors]      = useState([])

  useEffect(() => {
    let alive = true
    ;(async () => {
      const { error } = await supabase.from('machinery_master').select('vendor_id').limit(1)
      if (!alive || error) return
      setMoneyFields(true)
      const { data } = await supabase.from('vendors').select('id, name, is_active').order('name')
      if (alive) setVendors(data || [])
    })()
    return () => { alive = false }
  }, [])

  const showToast = (msg, type = 'success') => { setToast({ msg, type }); setTimeout(() => setToast(null), 3000) }

  // A photo that exists opens in the viewer (which carries Change and Remove).
  // Only an empty slot jumps straight to the picker.
  const handlePhotoClick = (table, item) => {
    if (item.photoUrl) return setPhotoView({ table, item })
    setPendingPhoto({ table, id: item.id })
    photoInputRef.current?.click()
  }

  // Picked from an empty slot → crop before it ever reaches Storage.
  const handlePhotoChange = (e) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (file && pendingPhoto) setCropFile(file)
  }

  const savePhoto = async (table, id, file, oldUrl) => {
    setSaving(true)
    try {
      const path = await uploadAttachment(file, { folder: `asset_photos/${table}`, entityId: id })
      await updateAssetPhoto(table, id, resolveUrl(path))
      if (oldUrl) await deleteAttachment(oldUrl)   // don't orphan the file we just replaced
      showToast('Photo updated')
    } catch (err) { showToast('Upload failed: ' + err.message, 'error'); throw err }
    finally { setSaving(false); setPendingPhoto(null); setCropFile(null) }
  }

  const removePhoto = async (table, id, oldUrl) => {
    setSaving(true)
    try {
      await updateAssetPhoto(table, id, null)
      if (oldUrl) await deleteAttachment(oldUrl)
      showToast('Photo removed')
    } catch (err) { showToast('Failed: ' + err.message, 'error'); throw err }
    finally { setSaving(false) }
  }

  const confirmEdit = async (data) => {
    if (!editModal) return
    setSaving(true)
    try {
      if (editModal.kind === 'machinery') await updateMachinery(editModal.item.id, data)
      else                                await updateFarmAsset(editModal.item.id, data)
      showToast('Saved'); setEditModal(null)
    } catch (e) { showToast('Failed: ' + e.message, 'error') }
    setSaving(false)
  }

  const confirmDispose = async (form) => {
    if (!dispose) return
    setSaving(true)
    try {
      if (dispose.kind === 'machinery') await disposeMachinery(dispose.item.id, form)
      else await disposeFarmAsset(dispose.item.id, form)
      showToast(`${dispose.item.name} disposed`); setDispose(null); setSelected(null)
    } catch (e) { showToast('Failed: ' + e.message, 'error') }
    setSaving(false)
  }

  const confirmAdd = async (kind, form) => {
    setSaving(true)
    try {
      // The bill goes up before the row is written, so the row can point at it.
      let billFileUrl = null
      if (form.vendorId && form.billFile) {
        const ext  = form.billFile.name.split('.').pop()
        const path = `inventory-docs/bills/${Date.now()}.${ext}`
        const { error } = await supabase.storage.from('farm-photos').upload(path, form.billFile)
        if (!error) billFileUrl = supabase.storage.from('farm-photos').getPublicUrl(path).data.publicUrl
      }
      const payload = { ...form, billFileUrl }
      if (kind === 'machinery') await addMachinery(payload)
      else                      await addFarmAsset(payload)
      showToast(form.vendorId
        ? `${form.name} added — ₹${Number((parseFloat(form.purchasePrice) || 0) * (parseInt(form.quantity) || 1)).toLocaleString('en-IN')} added to ${form.vendorName || 'the vendor'}'s ledger`
        : `${form.name} added`)
      setAddModal(null)
    } catch (e) { showToast('Failed: ' + e.message, 'error') }
    setSaving(false)
  }

  const totalMachinery = machineryMaster.reduce((s, m) => s + (m.purchasePrice || 0), 0)
  const totalAssets    = farmAssets.reduce((s, a) => s + (a.purchasePrice || 0), 0)
  const totalAll       = totalMachinery + totalAssets
  const tabValue = isMachinery ? totalMachinery : totalAssets
  const tabCount = isMachinery ? machineryMaster.length : farmAssets.length

  const selectedTable = selected?.kind === 'machinery' ? 'machinery_master' : 'farm_assets'
  const selectedItem  = selected
    ? (selected.kind === 'machinery' ? machineryMaster : farmAssets).find(i => i.id === selected.id)
    : null
  // Diesel is fuel stock: the register hands over to Inventory's fuel shelf,
  // where each item's "→ Issue to Plot" lives. There is no diesel UI elsewhere.
  const issueDiesel = () => navigate('/resources?tab=inventory&cat=fuel')

  return (
    <div className="h-full flex flex-col" style={{ background: 'var(--c-bg)' }}>
      <input ref={photoInputRef} type="file" accept="image/*" className="hidden" onChange={handlePhotoChange} />

      {/* Crop on the way in, for a photo picked into an empty slot */}
      {cropFile && pendingPhoto && (
        <ImageCropper file={cropFile}
          onDone={f => savePhoto(pendingPhoto.table, pendingPhoto.id, f, null)}
          onCancel={() => { setCropFile(null); setPendingPhoto(null) }} />
      )}

      {/* Tapping an existing photo expands it; Change and Remove live in the viewer */}
      {photoView && (
        <ImageViewer
          value={photoView.item.photoUrl}
          name={photoView.item.name}
          onClose={() => setPhotoView(null)}
          onReplace={f => savePhoto(photoView.table, photoView.item.id, f, photoView.item.photoUrl)}
          onRemove={() => removePhoto(photoView.table, photoView.item.id, photoView.item.photoUrl)} />
      )}

      {/* One quiet line. Book value is a bookkeeping fact, not the reason anyone
          opens this screen — it stays findable here and in each item's sheet,
          but no longer shouts from every card (owner, 25 Aug). */}
      <div className="flex items-center justify-between shrink-0 px-4 py-1.5 border-b text-[11px]"
        style={{ borderColor: 'var(--c-border)', background: 'var(--c-nav)', color: 'var(--c-muted)' }}>
        <span>{registerSummary(tabCount, tabValue)}</span>
        {totalAll > 0 && <span>All assets <b style={{ color: 'var(--c-text)' }}>{fmt(totalAll)}</b></span>}
      </div>

      {/* key on the kind: the tab keeps its own category filter, and a machinery
          type would filter every farm asset away if it survived the switch. */}
      <RegisterTab key={kind} items={isMachinery ? machineryMaster : farmAssets} kind={isMachinery ? 'machinery' : 'asset'}
        onOpen={item => setSelected({ kind: isMachinery ? 'machinery' : 'asset', id: item.id })}
        onAdd={() => setAddModal(isMachinery ? 'machinery' : 'asset')}
        onIssueDiesel={issueDiesel} />

      {selectedItem && (
        <AssetSheet item={selectedItem} kind={selected.kind}
          vendorName={vendors.find(v => v.id === selectedItem.vendorId)?.name}
          onClose={() => setSelected(null)}
          onEdit={item => setEditModal({ kind: selected.kind, item })}
          onPhoto={item => handlePhotoClick(selectedTable, item)}
          onDispose={item => setDispose({ item, kind: selected.kind })}
          onIssueDiesel={issueDiesel} />
      )}
      {editModal?.kind === 'machinery' && <EditMachineryModal item={editModal.item} onClose={() => setEditModal(null)} onSave={confirmEdit} saving={saving} />}
      {editModal?.kind === 'asset'     && <EditFarmAssetModal item={editModal.item} onClose={() => setEditModal(null)} onSave={confirmEdit} saving={saving} />}

      {dispose && <DisposeModal item={dispose.item} onClose={() => setDispose(null)} onConfirm={confirmDispose} saving={saving} />}
      {addModal === 'machinery' && <AddMachineryModal onClose={() => setAddModal(null)} onConfirm={f => confirmAdd('machinery', f)} saving={saving} vendors={vendors} moneyFields={moneyFields} />}
      {addModal === 'asset'     && <AddFarmAssetModal onClose={() => setAddModal(null)} onConfirm={f => confirmAdd('asset', f)}     saving={saving} vendors={vendors} moneyFields={moneyFields} />}

      {toast && (
        <div className="fixed bottom-24 left-1/2 -translate-x-1/2 z-50 px-4 py-2.5 rounded-2xl text-xs font-semibold shadow-lg text-white"
          style={{ background: toast.type === 'error' ? '#E24B4A' : toast.type === 'warn' ? '#BA7517' : '#8A9A5B' }}>
          {toast.msg}
        </div>
      )}
    </div>
  )
}

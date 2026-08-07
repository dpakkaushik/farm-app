import React, { useState, useRef, useEffect } from 'react'
import { Wrench, Boxes, Plus, Camera, Pencil } from 'lucide-react'
import { useAppStore } from '../store'
import { supabase } from '../lib/supabase'
import ImageViewer from '../components/ImageViewer'
import ImageCropper from '../components/ImageCropper'
import Attachment from '../components/Attachment'
import FilePicker from '../components/FilePicker'
import { uploadAttachment, deleteAttachment, resolveUrl, BUCKETS } from '../lib/attachments'

const TODAY = new Date().toISOString().slice(0, 10)
// Exported: the purchase-bill screen offers the same vocabularies when a bill
// line turns out to be a machine or an asset rather than stock.
export const MACHINE_TYPES = ['tractor','implement','generator','engine','sprayer','water_motor','trailer','grass_cutter','wood_cutter','vehicle','other']
export const ASSET_CATS    = ['equipment','appliance','furniture','other']
const STATUSES_M    = ['in_use','spare','under_repair','disposed','sold']
const STATUSES_A    = ['in_use','spare','under_repair','disposed','sold']
const TABS = [
  { key: 'machinery', label: 'Machinery',   Icon: Wrench },
  { key: 'assets',    label: 'Farm Assets', Icon: Boxes  },
]
const STATUS_STYLE = {
  in_use:       { bg: '#1D9E7518', color: '#1D9E75', label: 'In Use'    },
  spare:        { bg: '#4169E118', color: '#4169E1', label: 'Spare'     },
  under_repair: { bg: '#BA751718', color: '#BA7517', label: 'Repair'    },
  disposed:     { bg: '#88888820', color: '#888',    label: 'Disposed'  },
  sold:         { bg: '#88888820', color: '#888',    label: 'Sold'      },
}
const CAT_EMOJI = { equipment:'🛢', appliance:'🔌', furniture:'🪑', tractor:'🚜', implement:'🔩', generator:'⚡', engine:'⚙️', trailer:'🚛', sprayer:'💧', water_motor:'💧', grass_cutter:'🌿', wood_cutter:'🪚', vehicle:'🏍', other:'📦' }
const fmt = n => n ? `₹${Number(n).toLocaleString('en-IN')}` : null

// ── Shared UI ─────────────────────────────────────────────────────────────────
function StatusPill({ status }) {
  const s = STATUS_STYLE[status] || STATUS_STYLE.in_use
  return <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full" style={{ background: s.bg, color: s.color }}>{s.label}</span>
}
const inp = "w-full px-3 py-2.5 rounded-xl text-sm border outline-none bg-[var(--c-ghost)] border-[var(--c-border)] text-[var(--c-text)]"

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

// A machine bought on a vendor bill can show that bill. Nothing renders when it
// was not bought on one — assets entered by hand have no document behind them.
function BillChip({ item }) {
  if (!item.billFileUrl) return null
  return (
    <div className="mt-1">
      <Attachment variant="chip" value={item.billFileUrl} bucket={BUCKETS.photos}
        name={item.billInvoiceNo ? `Bill #${item.billInvoiceNo}` : 'Bill'} />
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
          style={{ background: value === v ? (danger ? '#E24B4A' : '#1D9E75') : 'var(--c-ghost)', color: value === v ? '#fff' : 'var(--c-muted)' }}>
          {l}
        </button>
      ))}
    </div>
  )
}
function ActionBar({ actions }) {
  return (
    <div className="flex border-t border-[var(--c-border)] divide-x divide-[var(--c-border)]">
      {actions.map(({ label, icon, color, onClick }) => (
        <button key={label} onClick={onClick}
          className="flex-1 py-2.5 text-[10px] font-semibold flex items-center justify-center gap-1"
          style={{ color: color || 'var(--c-muted)' }}>
          {icon}{label}
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
    <Modal title={`Edit ${item.displayId} — ${item.name}`} onClose={onClose}>
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
        <input type="checkbox" checked={f.requiresDiesel} onChange={e => u('requiresDiesel', e.target.checked)} className="w-4 h-4 accent-[#1D9E75]" />
        <span className="text-sm" style={{ color: 'var(--c-text)' }}>⛽ Requires diesel</span>
      </label>
      <FRow label="Notes"><input className={inp} placeholder="Optional" value={f.notes} onChange={e => u('notes', e.target.value)} /></FRow>
      <button onClick={() => onSave(f)} disabled={saving || !f.name}
        className="w-full py-3 rounded-xl text-sm font-semibold text-white disabled:opacity-50" style={{ background: '#1D9E75' }}>
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
    <Modal title={`Edit ${item.displayId} — ${item.name}`} onClose={onClose}>
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
        className="w-full py-3 rounded-xl text-sm font-semibold text-white disabled:opacity-50" style={{ background: '#1D9E75' }}>
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
        <input type="checkbox" checked={f.requiresDiesel} onChange={e => u('requiresDiesel', e.target.checked)} className="w-4 h-4 accent-[#1D9E75]" />
        <span className="text-sm" style={{ color: 'var(--c-text)' }}>⛽ Requires diesel</span>
      </label>
      {moneyFields && <PurchaseSource f={f} u={u} vendors={vendors} billFile={billFile} setBillFile={setBillFile} />}
      <FRow label="Notes"><input className={inp} placeholder="Optional" value={f.notes} onChange={e => u('notes', e.target.value)} /></FRow>
      <button onClick={() => f.name && onConfirm({ ...f, billFile })} disabled={saving || !f.name}
        className="w-full py-3 rounded-xl text-sm font-semibold text-white disabled:opacity-50" style={{ background: '#1D9E75' }}>
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
        className="w-full py-3 rounded-xl text-sm font-semibold text-white disabled:opacity-50" style={{ background: '#1D9E75' }}>
        {saving ? 'Saving…' : 'Add Asset'}
      </button>
    </Modal>
  )
}

// ── Machinery Tab ─────────────────────────────────────────────────────────────
function MachineryTab({ machinery, onEdit, onDispose, onPhoto, onAdd }) {
  const [filter, setFilter] = useState('all')
  const types = [...new Set(machinery.map(m => m.type))].sort()
  const list  = filter === 'all' ? machinery : machinery.filter(m => m.type === filter)
  return (
    <div className="flex-1 flex flex-col min-h-0">
      <div className="flex items-center gap-2 px-4 py-2 shrink-0 bg-[var(--c-nav)] border-b border-[var(--c-border)]">
        <div className="flex gap-2 flex-1 overflow-x-auto no-scrollbar">
          {['all', ...types].map(t => (
            <button key={t} onClick={() => setFilter(t)}
              className={`shrink-0 px-3 py-1.5 rounded-full text-[10px] font-semibold border transition-colors ${filter===t ? 'text-white border-transparent' : 'border-[var(--c-border)] text-[var(--c-muted)]'}`}
              style={{ background: filter===t ? '#1D9E75' : 'var(--c-ghost)' }}>
              {t === 'all' ? 'All' : (CAT_EMOJI[t]||'🔧')+' '+t.replace(/_/g,' ')}
            </button>
          ))}
        </div>
        <button onClick={onAdd} className="shrink-0 flex items-center gap-1 px-3 py-1.5 rounded-full text-[10px] font-semibold text-white" style={{ background: '#1D9E75' }}>
          <Plus size={11} /> Add
        </button>
      </div>
      <div className="flex-1 overflow-y-auto p-4 space-y-2">
        {list.map(m => (
          <div key={m.id} className="bg-[var(--c-nav)] rounded-2xl border border-[var(--c-border)] overflow-hidden">
            <div className="p-4 flex gap-3">
              <button onClick={() => onPhoto('machinery_master', m)} className="shrink-0">
                {m.photoUrl
                  ? <img src={m.photoUrl} alt={m.name} className="w-14 h-14 rounded-xl object-cover" />
                  : <div className="w-14 h-14 rounded-xl flex items-center justify-center text-2xl" style={{ background: 'var(--c-ghost)' }}>{CAT_EMOJI[m.type]||'🔧'}</div>
                }
              </button>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-[9px] font-bold px-1.5 py-0.5 rounded" style={{ background: 'var(--c-ghost)', color: 'var(--c-muted)' }}>{m.displayId}</span>
                  <p className="text-sm font-semibold" style={{ color: 'var(--c-text)' }}>{m.name}</p>
                  <StatusPill status={m.status} />
                  {m.requiresDiesel && <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full" style={{ background: '#BA751718', color: '#BA7517' }}>⛽ Diesel</span>}
                </div>
                <p className="text-[10px] mt-1" style={{ color: 'var(--c-muted)' }}>
                  {CAT_EMOJI[m.type]||'🔧'} {m.type.replace(/_/g,' ')}{m.make ? ` · ${m.make}` : ''} · Qty {m.quantity}
                </p>
                <p className="text-[11px] mt-1 font-bold" style={{ color: m.purchasePrice ? '#1D9E75' : 'var(--c-faint)' }}>
                  {fmt(m.purchasePrice) || 'Tap ✏ Edit to set price'}
                </p>
                <BillChip item={m} />
                {m.notes && <p className="text-[10px] mt-0.5 italic" style={{ color: 'var(--c-faint)' }}>{m.notes}</p>}
              </div>
            </div>
            <ActionBar actions={[
              { label: 'Edit',    icon: <Pencil size={11} />, color: '#4169E1', onClick: () => onEdit(m) },
              { label: 'Photo',   icon: <Camera size={11} />,                   onClick: () => onPhoto('machinery_master', m) },
              { label: 'Dispose', icon: '🗑',                  color: '#E24B4A', onClick: () => onDispose(m) },
            ]} />
          </div>
        ))}
        {list.length === 0 && <p className="text-center py-12 text-sm" style={{ color: 'var(--c-faint)' }}>No machinery</p>}
      </div>
    </div>
  )
}

// ── Farm Assets Tab ───────────────────────────────────────────────────────────
function FarmAssetsTab({ assets, onEdit, onDispose, onPhoto, onAdd }) {
  const [filter, setFilter] = useState('all')
  const cats = [...new Set(assets.map(a => a.category))].sort()
  const list = filter === 'all' ? assets : assets.filter(a => a.category === filter)
  return (
    <div className="flex-1 flex flex-col min-h-0">
      <div className="flex items-center gap-2 px-4 py-2 shrink-0 bg-[var(--c-nav)] border-b border-[var(--c-border)]">
        <div className="flex gap-2 flex-1 overflow-x-auto no-scrollbar">
          {['all', ...cats].map(c => (
            <button key={c} onClick={() => setFilter(c)}
              className={`shrink-0 px-3 py-1.5 rounded-full text-[10px] font-semibold border transition-colors ${filter===c ? 'text-white border-transparent' : 'border-[var(--c-border)] text-[var(--c-muted)]'}`}
              style={{ background: filter===c ? '#1D9E75' : 'var(--c-ghost)' }}>
              {c === 'all' ? 'All' : (CAT_EMOJI[c]||'📦')+' '+c.charAt(0).toUpperCase()+c.slice(1)}
            </button>
          ))}
        </div>
        <button onClick={onAdd} className="shrink-0 flex items-center gap-1 px-3 py-1.5 rounded-full text-[10px] font-semibold text-white" style={{ background: '#1D9E75' }}>
          <Plus size={11} /> Add
        </button>
      </div>
      <div className="flex-1 overflow-y-auto p-4 space-y-2">
        {list.map(a => (
          <div key={a.id} className="bg-[var(--c-nav)] rounded-2xl border border-[var(--c-border)] overflow-hidden">
            <div className="p-4 flex gap-3">
              <button onClick={() => onPhoto('farm_assets', a)} className="shrink-0">
                {a.photoUrl
                  ? <img src={a.photoUrl} alt={a.name} className="w-14 h-14 rounded-xl object-cover" />
                  : <div className="w-14 h-14 rounded-xl flex items-center justify-center text-2xl" style={{ background: 'var(--c-ghost)' }}>{CAT_EMOJI[a.category]||'📦'}</div>
                }
              </button>
              <div className="flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-[9px] font-bold px-1.5 py-0.5 rounded" style={{ background: 'var(--c-ghost)', color: 'var(--c-muted)' }}>{a.displayId}</span>
                  <p className="text-sm font-semibold" style={{ color: 'var(--c-text)' }}>{a.name}</p>
                  <StatusPill status={a.status} />
                </div>
                <p className="text-[10px] mt-1" style={{ color: 'var(--c-muted)' }}>{CAT_EMOJI[a.category]||'📦'} {a.category} · Qty {a.quantity}</p>
                <p className="text-[11px] mt-1 font-bold" style={{ color: a.purchasePrice ? '#1D9E75' : 'var(--c-faint)' }}>
                  {fmt(a.purchasePrice) || 'Tap ✏ Edit to set price'}
                </p>
                <BillChip item={a} />
                {a.notes && <p className="text-[10px] mt-0.5 italic" style={{ color: 'var(--c-faint)' }}>{a.notes}</p>}
              </div>
            </div>
            <ActionBar actions={[
              { label: 'Edit',    icon: <Pencil size={11} />, color: '#4169E1', onClick: () => onEdit(a) },
              { label: 'Photo',   icon: <Camera size={11} />,                   onClick: () => onPhoto('farm_assets', a) },
              { label: 'Dispose', icon: '🗑',                  color: '#E24B4A', onClick: () => onDispose(a) },
            ]} />
          </div>
        ))}
        {list.length === 0 && <p className="text-center py-12 text-sm" style={{ color: 'var(--c-faint)' }}>No assets</p>}
      </div>
    </div>
  )
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function Assets() {
  const {
    machineryMaster, farmAssets,
    disposeMachinery, disposeFarmAsset,
    addMachinery, addFarmAsset,
    updateMachinery, updateFarmAsset,
    updateAssetPhoto,
  } = useAppStore()

  const [tab,          setTab]          = useState('machinery')
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
      showToast(`${dispose.item.name} disposed`); setDispose(null)
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
  const tabValue = tab === 'machinery' ? totalMachinery : totalAssets
  const tabCount = tab === 'machinery' ? machineryMaster.length : farmAssets.length

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

      {/* Tab bar */}
      <div className="flex border-b shrink-0" style={{ background: 'var(--c-nav)', borderColor: 'var(--c-border)' }}>
        {TABS.map(({ key, label, Icon }) => (
          <button key={key} onClick={() => setTab(key)}
            className={`flex-1 py-3 flex flex-col items-center gap-0.5 text-[10px] font-semibold transition-colors ${tab===key ? 'text-[#1D9E75] border-b-2 border-[#1D9E75]' : 'text-[var(--c-muted)]'}`}>
            <Icon size={16} />{label}
          </button>
        ))}
      </div>

      {/* Book value strip */}
      <div className="flex shrink-0 border-b" style={{ borderColor: 'var(--c-border)', background: 'var(--c-nav)' }}>
        <div className="flex-1 py-2.5 px-4">
          <p className="text-base font-bold" style={{ color: '#1D9E75' }}>{tabValue > 0 ? fmt(tabValue) : '₹—'}</p>
          <p className="text-[9px]" style={{ color: 'var(--c-faint)' }}>This tab · {tabCount} items</p>
        </div>
        <div className="px-4 py-2.5 text-right border-l" style={{ borderColor: 'var(--c-border)' }}>
          <p className="text-base font-bold" style={{ color: 'var(--c-text)' }}>{totalAll > 0 ? fmt(totalAll) : '₹—'}</p>
          <p className="text-[9px]" style={{ color: 'var(--c-faint)' }}>Total book value</p>
        </div>
      </div>

      {tab === 'machinery' && (
        <MachineryTab machinery={machineryMaster}
          onEdit={item   => setEditModal({ kind: 'machinery', item })}
          onDispose={item => setDispose({ item, kind: 'machinery' })}
          onPhoto={handlePhotoClick}
          onAdd={() => setAddModal('machinery')} />
      )}
      {tab === 'assets' && (
        <FarmAssetsTab assets={farmAssets}
          onEdit={item   => setEditModal({ kind: 'asset', item })}
          onDispose={item => setDispose({ item, kind: 'asset' })}
          onPhoto={handlePhotoClick}
          onAdd={() => setAddModal('asset')} />
      )}
      {editModal?.kind === 'machinery' && <EditMachineryModal item={editModal.item} onClose={() => setEditModal(null)} onSave={confirmEdit} saving={saving} />}
      {editModal?.kind === 'asset'     && <EditFarmAssetModal item={editModal.item} onClose={() => setEditModal(null)} onSave={confirmEdit} saving={saving} />}

      {dispose && <DisposeModal item={dispose.item} onClose={() => setDispose(null)} onConfirm={confirmDispose} saving={saving} />}
      {addModal === 'machinery' && <AddMachineryModal onClose={() => setAddModal(null)} onConfirm={f => confirmAdd('machinery', f)} saving={saving} vendors={vendors} moneyFields={moneyFields} />}
      {addModal === 'asset'     && <AddFarmAssetModal onClose={() => setAddModal(null)} onConfirm={f => confirmAdd('asset', f)}     saving={saving} vendors={vendors} moneyFields={moneyFields} />}

      {toast && (
        <div className="fixed bottom-24 left-1/2 -translate-x-1/2 z-50 px-4 py-2.5 rounded-2xl text-xs font-semibold shadow-lg text-white"
          style={{ background: toast.type === 'error' ? '#E24B4A' : toast.type === 'warn' ? '#BA7517' : '#1D9E75' }}>
          {toast.msg}
        </div>
      )}
    </div>
  )
}

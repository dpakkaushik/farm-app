import React, { useState, useRef } from 'react'
import { Wrench, Boxes, Bird, ChevronDown, ChevronUp, Plus, Minus, Camera } from 'lucide-react'
import { useAppStore } from '../store'
import { supabase } from '../lib/supabase'

const TODAY = new Date().toISOString().slice(0, 10)
const MACHINE_TYPES = ['tractor','implement','generator','engine','sprayer','water_motor','trailer','grass_cutter','wood_cutter','vehicle','other']
const ASSET_CATS    = ['equipment','appliance','furniture','other']
const TABS = [
  { key: 'machinery', label: 'Machinery',   Icon: Wrench },
  { key: 'assets',    label: 'Farm Assets', Icon: Boxes  },
  { key: 'livestock', label: 'Livestock',   Icon: Bird   },
]
const STATUS_STYLE = {
  in_use:       { bg: '#1D9E7518', color: '#1D9E75', label: 'In Use'    },
  spare:        { bg: '#4169E118', color: '#4169E1', label: 'Spare'     },
  under_repair: { bg: '#BA751718', color: '#BA7517', label: 'Repair'    },
  disposed:     { bg: '#88888820', color: '#888',    label: 'Disposed'  },
  sold:         { bg: '#88888820', color: '#888',    label: 'Sold'      },
}
const CAT_EMOJI = { equipment:'🛢', appliance:'🔌', furniture:'🪑', tractor:'🚜', implement:'🔩', generator:'⚡', engine:'⚙️', trailer:'🚛', sprayer:'💧', water_motor:'💧', grass_cutter:'🌿', wood_cutter:'🪚', vehicle:'🏍', other:'📦' }
const CATTLE_SPECIES  = ['buffalo','cow','bull','bullock','ox']
const POULTRY_SPECIES = ['hen','cock','chicken','poultry','bird','rooster']
const isCattle  = l => CATTLE_SPECIES.some(s => (l.species || l.animal_type || '').toLowerCase().includes(s)) || (l.trackingMode === 'individual' && !POULTRY_SPECIES.some(s => (l.species || l.animal_type || '').toLowerCase().includes(s)))
const isPoultry = l => l.trackingMode === 'count' || POULTRY_SPECIES.some(s => (l.species || l.animal_type || '').toLowerCase().includes(s))
const fmt = n => n ? `₹${Number(n).toLocaleString('en-IN')}` : null

function StatusPill({ status }) {
  const s = STATUS_STYLE[status] || STATUS_STYLE.in_use
  return <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full" style={{ background: s.bg, color: s.color }}>{s.label}</span>
}
const inp = "w-full px-3 py-2.5 rounded-xl text-sm border outline-none bg-[var(--c-ghost)] border-[var(--c-border)] text-[var(--c-text)]"

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
      <p className="text-[10px] font-semibold" style={{ color: 'var(--c-muted)' }}>{label}</p>
      {children}
    </div>
  )
}

// ── Dispose Modal ─────────────────────────────────────────────────────────────
function DisposeModal({ item, onClose, onConfirm, saving }) {
  const [form, setForm] = useState({ type: 'scrapped', date: TODAY, amount: '', buyer: '', notes: '' })
  const f = (k, v) => setForm(p => ({ ...p, [k]: v }))
  return (
    <Modal title={`Dispose: ${item.name}`} onClose={onClose}>
      <FRow label="Disposal Type">
        <div className="flex rounded-xl overflow-hidden border border-[var(--c-border)]">
          {['scrapped','sold'].map(t => (
            <button key={t} onClick={() => f('type', t)} className="flex-1 py-2 text-xs font-semibold transition-colors"
              style={{ background: form.type === t ? '#E24B4A' : 'var(--c-ghost)', color: form.type === t ? '#fff' : 'var(--c-muted)' }}>
              {t === 'scrapped' ? '🗑 Scrapped' : '💰 Sold'}
            </button>
          ))}
        </div>
      </FRow>
      <FRow label="Date"><input type="date" className={inp} value={form.date} onChange={e => f('date', e.target.value)} /></FRow>
      <FRow label={form.type === 'sold' ? 'Sale Amount (₹)' : 'Scrap Value (₹)'}>
        <input type="number" className={inp} placeholder="0" value={form.amount} onChange={e => f('amount', e.target.value)} />
      </FRow>
      {form.type === 'sold' && (
        <FRow label="Buyer"><input type="text" className={inp} placeholder="Buyer name" value={form.buyer} onChange={e => f('buyer', e.target.value)} /></FRow>
      )}
      <FRow label="Notes"><input type="text" className={inp} placeholder="Remarks" value={form.notes} onChange={e => f('notes', e.target.value)} /></FRow>
      <button onClick={() => onConfirm(form)} disabled={saving} className="w-full py-3 rounded-xl text-sm font-semibold text-white disabled:opacity-50" style={{ background: '#E24B4A' }}>
        {saving ? 'Saving…' : 'Confirm Disposal'}
      </button>
    </Modal>
  )
}

// ── Count Modal ───────────────────────────────────────────────────────────────
function CountModal({ animal, changeType, onClose, onConfirm, saving }) {
  const [form, setForm] = useState({ date: TODAY, reason: changeType === 'add' ? 'purchased' : 'consumed', quantity: '', notes: '' })
  const f = (k, v) => setForm(p => ({ ...p, [k]: v }))
  const reasons = changeType === 'add' ? ['purchased','born'] : ['consumed','dead','sold']
  const REASON_LABEL = { purchased:'Purchased', born:'Born', consumed:'Consumed (meat)', dead:'Dead', sold:'Sold' }
  return (
    <Modal title={`${changeType === 'add' ? '+ Add' : '- Reduce'} Count: ${animal.name || animal.tagId}`} onClose={onClose}>
      <FRow label="Date"><input type="date" className={inp} value={form.date} onChange={e => f('date', e.target.value)} /></FRow>
      <FRow label="Reason">
        <div className="flex flex-wrap gap-2">
          {reasons.map(r => (
            <button key={r} onClick={() => f('reason', r)} className="px-3 py-1.5 rounded-xl text-xs font-semibold border transition-colors"
              style={{ background: form.reason === r ? (changeType==='add' ? '#1D9E7518' : '#E24B4A18') : 'var(--c-ghost)', borderColor: form.reason === r ? (changeType==='add' ? '#1D9E75' : '#E24B4A') : 'var(--c-border)', color: form.reason === r ? (changeType==='add' ? '#1D9E75' : '#E24B4A') : 'var(--c-muted)' }}>
              {REASON_LABEL[r]}
            </button>
          ))}
        </div>
      </FRow>
      <FRow label="Quantity"><input type="number" className={inp} placeholder="e.g. 3" min="1" value={form.quantity} onChange={e => f('quantity', e.target.value)} /></FRow>
      <FRow label="Notes"><input type="text" className={inp} placeholder="Remarks" value={form.notes} onChange={e => f('notes', e.target.value)} /></FRow>
      <button onClick={() => onConfirm(form)} disabled={saving || !form.quantity} className="w-full py-3 rounded-xl text-sm font-semibold text-white disabled:opacity-50"
        style={{ background: changeType === 'add' ? '#1D9E75' : '#E24B4A' }}>
        {saving ? 'Saving…' : 'Confirm'}
      </button>
    </Modal>
  )
}

// ── Edit Price Modal ──────────────────────────────────────────────────────────
function EditPriceModal({ item, onClose, onConfirm, saving }) {
  const [price, setPrice] = useState(item.purchasePrice || '')
  return (
    <Modal title={`Set Value: ${item.name}`} onClose={onClose}>
      <FRow label="Purchase / Assumed Value (₹)">
        <input type="number" className={inp} placeholder="e.g. 150000" value={price} onChange={e => setPrice(e.target.value)} />
      </FRow>
      <p className="text-[10px]" style={{ color: 'var(--c-faint)' }}>Used to calculate total book value of all assets.</p>
      <button onClick={() => onConfirm(price)} disabled={saving} className="w-full py-3 rounded-xl text-sm font-semibold text-white disabled:opacity-50" style={{ background: '#1D9E75' }}>
        {saving ? 'Saving…' : 'Save Value'}
      </button>
    </Modal>
  )
}

// ── Add Machinery Modal ───────────────────────────────────────────────────────
function AddMachineryModal({ onClose, onConfirm, saving }) {
  const [form, setForm] = useState({ name:'', type:'tractor', make:'', quantity:'1', requiresDiesel:false, purchaseDate:TODAY, purchasePrice:'', notes:'' })
  const f = (k, v) => setForm(p => ({ ...p, [k]: v }))
  return (
    <Modal title="Add Machinery" onClose={onClose}>
      <FRow label="Name *"><input className={inp} placeholder="e.g. New Holland Tractor" value={form.name} onChange={e => f('name', e.target.value)} /></FRow>
      <div className="grid grid-cols-2 gap-3">
        <FRow label="Type">
          <select className={inp} value={form.type} onChange={e => f('type', e.target.value)} style={{ background: 'var(--c-ghost)' }}>
            {MACHINE_TYPES.map(t => <option key={t} value={t}>{CAT_EMOJI[t]||'🔧'} {t.replace('_',' ')}</option>)}
          </select>
        </FRow>
        <FRow label="Quantity"><input type="number" className={inp} min="1" value={form.quantity} onChange={e => f('quantity', e.target.value)} /></FRow>
      </div>
      <FRow label="Make / Brand"><input className={inp} placeholder="e.g. New Holland" value={form.make} onChange={e => f('make', e.target.value)} /></FRow>
      <div className="grid grid-cols-2 gap-3">
        <FRow label="Purchase Date"><input type="date" className={inp} value={form.purchaseDate} onChange={e => f('purchaseDate', e.target.value)} /></FRow>
        <FRow label="Purchase Price (₹)"><input type="number" className={inp} placeholder="0" value={form.purchasePrice} onChange={e => f('purchasePrice', e.target.value)} /></FRow>
      </div>
      <label className="flex items-center gap-2 cursor-pointer py-1">
        <input type="checkbox" checked={form.requiresDiesel} onChange={e => f('requiresDiesel', e.target.checked)} className="w-4 h-4 accent-[#1D9E75]" />
        <span className="text-sm" style={{ color: 'var(--c-text)' }}>⛽ Requires diesel</span>
      </label>
      <FRow label="Notes"><input className={inp} placeholder="Optional" value={form.notes} onChange={e => f('notes', e.target.value)} /></FRow>
      <button onClick={() => form.name && onConfirm(form)} disabled={saving || !form.name} className="w-full py-3 rounded-xl text-sm font-semibold text-white disabled:opacity-50" style={{ background: '#1D9E75' }}>
        {saving ? 'Saving…' : 'Add Machinery'}
      </button>
    </Modal>
  )
}

// ── Add Farm Asset Modal ──────────────────────────────────────────────────────
function AddFarmAssetModal({ onClose, onConfirm, saving }) {
  const [form, setForm] = useState({ name:'', category:'equipment', quantity:'1', purchaseDate:TODAY, purchasePrice:'', notes:'' })
  const f = (k, v) => setForm(p => ({ ...p, [k]: v }))
  return (
    <Modal title="Add Farm Asset" onClose={onClose}>
      <FRow label="Name *"><input className={inp} placeholder="e.g. Water Tank 500L" value={form.name} onChange={e => f('name', e.target.value)} /></FRow>
      <div className="grid grid-cols-2 gap-3">
        <FRow label="Category">
          <select className={inp} value={form.category} onChange={e => f('category', e.target.value)} style={{ background: 'var(--c-ghost)' }}>
            {ASSET_CATS.map(c => <option key={c} value={c}>{CAT_EMOJI[c]||'📦'} {c.charAt(0).toUpperCase()+c.slice(1)}</option>)}
          </select>
        </FRow>
        <FRow label="Quantity"><input type="number" className={inp} min="1" value={form.quantity} onChange={e => f('quantity', e.target.value)} /></FRow>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <FRow label="Purchase Date"><input type="date" className={inp} value={form.purchaseDate} onChange={e => f('purchaseDate', e.target.value)} /></FRow>
        <FRow label="Purchase Price (₹)"><input type="number" className={inp} placeholder="0" value={form.purchasePrice} onChange={e => f('purchasePrice', e.target.value)} /></FRow>
      </div>
      <FRow label="Notes"><input className={inp} placeholder="Optional" value={form.notes} onChange={e => f('notes', e.target.value)} /></FRow>
      <button onClick={() => form.name && onConfirm(form)} disabled={saving || !form.name} className="w-full py-3 rounded-xl text-sm font-semibold text-white disabled:opacity-50" style={{ background: '#1D9E75' }}>
        {saving ? 'Saving…' : 'Add Asset'}
      </button>
    </Modal>
  )
}

// ── Add Livestock Modal ───────────────────────────────────────────────────────
function AddLivestockModal({ onClose, onConfirm, saving }) {
  const [form, setForm] = useState({ name:'', species:'buffalo', gender:'female', breed:'', dob:'', trackingMode:'individual', currentCount:'1', acquisitionType:'purchased', purchaseDate:TODAY, purchasePrice:'', notes:'' })
  const f = (k, v) => setForm(p => ({ ...p, [k]: v }))
  return (
    <Modal title="Add Animal / Flock" onClose={onClose}>
      <FRow label="Type">
        <div className="flex gap-2">
          {[['buffalo','🐃 Buffalo'],['cow','🐄 Cow'],['poultry','🐓 Poultry']].map(([s,l]) => (
            <button key={s} onClick={() => { f('species', s); f('trackingMode', s === 'poultry' ? 'count' : 'individual') }}
              className="flex-1 py-2 text-xs font-semibold rounded-xl border transition-colors"
              style={{ background: form.species===s ? '#1D9E7518' : 'var(--c-ghost)', borderColor: form.species===s ? '#1D9E75' : 'var(--c-border)', color: form.species===s ? '#1D9E75' : 'var(--c-muted)' }}>
              {l}
            </button>
          ))}
        </div>
      </FRow>
      <FRow label="Name *">
        <input className={inp} placeholder={form.trackingMode === 'count' ? 'e.g. Cock / Hen Flock' : 'e.g. Nimmi'} value={form.name} onChange={e => f('name', e.target.value)} />
      </FRow>
      {form.trackingMode === 'individual' ? (
        <>
          <div className="grid grid-cols-2 gap-3">
            <FRow label="Gender">
              <select className={inp} value={form.gender} onChange={e => f('gender', e.target.value)} style={{ background: 'var(--c-ghost)' }}>
                <option value="female">Female</option><option value="male">Male</option>
              </select>
            </FRow>
            <FRow label="Breed"><input className={inp} placeholder="e.g. Murrah" value={form.breed} onChange={e => f('breed', e.target.value)} /></FRow>
          </div>
          <FRow label="Date of Birth"><input type="date" className={inp} value={form.dob} onChange={e => f('dob', e.target.value)} /></FRow>
        </>
      ) : (
        <FRow label="Current Count"><input type="number" className={inp} min="0" value={form.currentCount} onChange={e => f('currentCount', e.target.value)} /></FRow>
      )}
      <FRow label="Acquisition">
        <div className="flex gap-2">
          {[['purchased','💰 Purchased'],['born','🐣 Born / Hatched']].map(([t,l]) => (
            <button key={t} onClick={() => f('acquisitionType', t)}
              className="flex-1 py-2 text-xs font-semibold rounded-xl border transition-colors"
              style={{ background: form.acquisitionType===t ? '#1D9E7518' : 'var(--c-ghost)', borderColor: form.acquisitionType===t ? '#1D9E75' : 'var(--c-border)', color: form.acquisitionType===t ? '#1D9E75' : 'var(--c-muted)' }}>
              {l}
            </button>
          ))}
        </div>
      </FRow>
      {form.acquisitionType === 'purchased' && (
        <div className="grid grid-cols-2 gap-3">
          <FRow label="Purchase Date"><input type="date" className={inp} value={form.purchaseDate} onChange={e => f('purchaseDate', e.target.value)} /></FRow>
          <FRow label="Purchase Price (₹)"><input type="number" className={inp} placeholder="e.g. 45000" value={form.purchasePrice} onChange={e => f('purchasePrice', e.target.value)} /></FRow>
        </div>
      )}
      <FRow label="Notes"><input className={inp} placeholder="Optional" value={form.notes} onChange={e => f('notes', e.target.value)} /></FRow>
      <button onClick={() => form.name && onConfirm(form)} disabled={saving || !form.name} className="w-full py-3 rounded-xl text-sm font-semibold text-white disabled:opacity-50" style={{ background: '#1D9E75' }}>
        {saving ? 'Saving…' : 'Add Animal'}
      </button>
    </Modal>
  )
}

// ── Machinery Tab ─────────────────────────────────────────────────────────────
function MachineryTab({ machinery, onDispose, onPhoto, onEditPrice, onAdd }) {
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
              {t === 'all' ? 'All' : (CAT_EMOJI[t]||'🔧')+' '+t.replace('_',' ')}
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
                  {(CAT_EMOJI[m.type]||'🔧')} {m.type.replace('_',' ')}
                  {m.make ? ` · ${m.make}` : ''}
                  {m.regNo ? ` · ${m.regNo}` : ''}
                  {' · Qty '}{m.quantity}
                </p>
                <p className="text-[10px] mt-0.5 font-semibold" style={{ color: m.purchasePrice ? '#1D9E75' : 'var(--c-faint)' }}>
                  {fmt(m.purchasePrice) || 'Value not set'}
                </p>
                {m.notes && <p className="text-[10px] mt-0.5 italic" style={{ color: 'var(--c-faint)' }}>{m.notes}</p>}
              </div>
            </div>
            <div className="flex border-t border-[var(--c-border)] divide-x divide-[var(--c-border)]">
              <button onClick={() => onPhoto('machinery_master', m)} className="flex-1 py-2.5 text-[10px] font-semibold flex items-center justify-center gap-1" style={{ color: 'var(--c-muted)' }}>
                <Camera size={11} /> Photo
              </button>
              <button onClick={() => onEditPrice(m, 'machinery_master')} className="flex-1 py-2.5 text-[10px] font-semibold" style={{ color: '#1D9E75' }}>
                ₹ Value
              </button>
              <button onClick={() => onDispose(m, 'machinery')} className="flex-1 py-2.5 text-[10px] font-semibold" style={{ color: '#E24B4A' }}>
                🗑 Dispose
              </button>
            </div>
          </div>
        ))}
        {list.length === 0 && <p className="text-center py-12 text-sm" style={{ color: 'var(--c-faint)' }}>No machinery</p>}
      </div>
    </div>
  )
}

// ── Farm Assets Tab ───────────────────────────────────────────────────────────
function FarmAssetsTab({ assets, onDispose, onPhoto, onEditPrice, onAdd }) {
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
                <p className="text-[10px] mt-1" style={{ color: 'var(--c-muted)' }}>{(CAT_EMOJI[a.category]||'📦')} {a.category} · Qty {a.quantity}</p>
                <p className="text-[10px] mt-0.5 font-semibold" style={{ color: a.purchasePrice ? '#1D9E75' : 'var(--c-faint)' }}>
                  {fmt(a.purchasePrice) || 'Value not set'}
                </p>
                {a.notes && <p className="text-[10px] mt-0.5 italic" style={{ color: 'var(--c-faint)' }}>{a.notes}</p>}
              </div>
            </div>
            <div className="flex border-t border-[var(--c-border)] divide-x divide-[var(--c-border)]">
              <button onClick={() => onPhoto('farm_assets', a)} className="flex-1 py-2.5 text-[10px] font-semibold flex items-center justify-center gap-1" style={{ color: 'var(--c-muted)' }}>
                <Camera size={11} /> Photo
              </button>
              <button onClick={() => onEditPrice(a, 'farm_assets')} className="flex-1 py-2.5 text-[10px] font-semibold" style={{ color: '#1D9E75' }}>₹ Value</button>
              <button onClick={() => onDispose(a, 'asset')} className="flex-1 py-2.5 text-[10px] font-semibold" style={{ color: '#E24B4A' }}>🗑 Dispose</button>
            </div>
          </div>
        ))}
        {list.length === 0 && <p className="text-center py-12 text-sm" style={{ color: 'var(--c-faint)' }}>No assets</p>}
      </div>
    </div>
  )
}

// ── Livestock Tab ─────────────────────────────────────────────────────────────
function LivestockTab({ livestock, countLogs, onCount, onPhoto, onEditPrice, onAdd }) {
  const [expanded, setExpanded] = useState(null)
  const HEALTH = { healthy: { color:'#1D9E75', label:'✓ Healthy' }, sick: { color:'#E24B4A', label:'⚠ Sick' }, recovering: { color:'#BA7517', label:'~ Recovering' } }

  const cattleList  = livestock.filter(isCattle)
  const poultryList = livestock.filter(isPoultry)

  const SectionHeader = ({ emoji, title, count }) => (
    <div className="flex items-center gap-2 mt-3 mb-2">
      <p className="text-[10px] font-bold uppercase tracking-widest" style={{ color: 'var(--c-muted)' }}>{emoji} {title}</p>
      <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full" style={{ background: 'var(--c-ghost)', color: 'var(--c-faint)' }}>{count}</span>
      <div className="flex-1 h-px" style={{ background: 'var(--c-border)' }} />
    </div>
  )

  return (
    <div className="flex-1 overflow-y-auto p-4">
      {/* Add button */}
      <button onClick={onAdd} className="w-full mb-2 py-2.5 rounded-xl text-xs font-semibold border-2 border-dashed flex items-center justify-center gap-2"
        style={{ borderColor: '#1D9E7540', color: '#1D9E75', background: '#1D9E7508' }}>
        <Plus size={14} /> Add Animal / Flock
      </button>

      {/* ── Cattle ── */}
      {cattleList.length > 0 && (
        <>
          <SectionHeader emoji="🐃" title="Cattle" count={cattleList.length} />
          {cattleList.map(l => {
            const h = HEALTH[l.healthStatus] || HEALTH.healthy
            return (
              <div key={l.id} className="bg-[var(--c-nav)] rounded-2xl border border-[var(--c-border)] overflow-hidden mb-3">
                <div className="p-4 flex gap-4">
                  {/* Prominent photo */}
                  <button onClick={() => onPhoto('livestock_master', l)} className="shrink-0 flex flex-col items-center">
                    {l.photoUrl
                      ? <img src={l.photoUrl} alt={l.name} className="w-16 h-16 rounded-2xl object-cover border-2" style={{ borderColor: h.color + '50' }} />
                      : <div className="w-16 h-16 rounded-2xl flex items-center justify-center text-3xl border-2 border-dashed" style={{ background: 'var(--c-ghost)', borderColor: 'var(--c-border)' }}>
                          {l.species === 'cow' ? '🐄' : '🐃'}
                        </div>
                    }
                    <p className="text-[8px] mt-1" style={{ color: 'var(--c-faint)' }}>{l.photoUrl ? '📷 Change' : '📷 Add'}</p>
                  </button>
                  {/* Details */}
                  <div className="flex-1">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <p className="text-base font-bold" style={{ color: 'var(--c-text)' }}>{l.name || l.tagId}</p>
                      <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full" style={{ background: h.color+'18', color: h.color }}>{h.label}</span>
                    </div>
                    <p className="text-[11px]" style={{ color: 'var(--c-muted)' }}>
                      {(l.species||'Buffalo').charAt(0).toUpperCase()+(l.species||'Buffalo').slice(1)}
                      {l.breed ? ` · ${l.breed}` : ''}
                      {l.gender ? ` · ${l.gender.charAt(0).toUpperCase()+l.gender.slice(1)}` : ''}
                    </p>
                    {l.dob && <p className="text-[10px] mt-0.5" style={{ color: 'var(--c-faint)' }}>Born: {l.dob}</p>}
                    <p className="text-[10px] mt-1 font-semibold" style={{ color: l.purchasePrice ? '#1D9E75' : 'var(--c-faint)' }}>
                      {l.purchasePrice ? `Purchased: ${fmt(l.purchasePrice)}` : l.acquisitionType === 'born' ? '🐣 Born on farm' : 'Price not set'}
                    </p>
                  </div>
                </div>
                <div className="flex border-t border-[var(--c-border)] divide-x divide-[var(--c-border)]">
                  <button onClick={() => onPhoto('livestock_master', l)} className="flex-1 py-2.5 text-[10px] font-semibold flex items-center justify-center gap-1" style={{ color: 'var(--c-muted)' }}>
                    <Camera size={11} /> Photo
                  </button>
                  <button onClick={() => onEditPrice(l, 'livestock_master')} className="flex-1 py-2.5 text-[10px] font-semibold" style={{ color: '#1D9E75' }}>₹ Value</button>
                </div>
              </div>
            )
          })}
        </>
      )}

      {/* ── Poultry ── */}
      {poultryList.length > 0 && (
        <>
          <SectionHeader emoji="🐓" title="Poultry" count={poultryList.length} />
          {poultryList.map(l => {
            const logs   = countLogs.filter(c => c.livestockId === l.id)
            const isOpen = expanded === l.id
            return (
              <div key={l.id} className="bg-[var(--c-nav)] rounded-2xl border border-[var(--c-border)] overflow-hidden mb-3">
                <div className="p-4 flex items-center gap-3">
                  <button onClick={() => onPhoto('livestock_master', l)} className="shrink-0">
                    {l.photoUrl
                      ? <img src={l.photoUrl} alt={l.name} className="w-14 h-14 rounded-xl object-cover" />
                      : <div className="w-14 h-14 rounded-xl flex items-center justify-center text-2xl" style={{ background: 'var(--c-ghost)' }}>🐓</div>
                    }
                  </button>
                  <div className="flex-1">
                    <p className="text-sm font-bold" style={{ color: 'var(--c-text)' }}>{l.name || 'Flock'}</p>
                    <p className="text-[10px]" style={{ color: 'var(--c-muted)' }}>
                      {(l.species||'Poultry').charAt(0).toUpperCase()+(l.species||'Poultry').slice(1)} · Count-based
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-2xl font-bold" style={{ color: '#4169E1' }}>{l.currentCount ?? 0}</p>
                    <p className="text-[9px]" style={{ color: 'var(--c-faint)' }}>birds</p>
                  </div>
                </div>
                <div className="flex border-t border-[var(--c-border)] divide-x divide-[var(--c-border)]">
                  <button onClick={() => onCount(l, 'add')} className="flex-1 py-2.5 text-[10px] font-semibold flex items-center justify-center gap-1" style={{ color: '#1D9E75' }}>
                    <Plus size={12} /> Add
                  </button>
                  <button onClick={() => onCount(l, 'reduce')} className="flex-1 py-2.5 text-[10px] font-semibold flex items-center justify-center gap-1" style={{ color: '#E24B4A' }}>
                    <Minus size={12} /> Reduce
                  </button>
                  <button onClick={() => onPhoto('livestock_master', l)} className="flex-1 py-2.5 text-[10px] font-semibold flex items-center justify-center gap-1" style={{ color: 'var(--c-muted)' }}>
                    <Camera size={11} /> Photo
                  </button>
                  <button onClick={() => setExpanded(isOpen ? null : l.id)} className="flex-1 py-2.5 text-[10px] font-semibold flex items-center justify-center gap-1" style={{ color: 'var(--c-muted)' }}>
                    {isOpen ? <ChevronUp size={12} /> : <ChevronDown size={12} />} Log
                  </button>
                </div>
                {isOpen && logs.length > 0 && (
                  <div className="border-t border-[var(--c-border)] divide-y divide-[var(--c-border)]">
                    {logs.slice(0, 10).map(log => (
                      <div key={log.id} className="flex items-center justify-between px-4 py-2">
                        <div>
                          <p className="text-[10px] font-medium" style={{ color: 'var(--c-text)' }}>{log.changeType==='add' ? '+' : '-'}{log.quantity} · {log.reason}</p>
                          {log.notes && <p className="text-[9px]" style={{ color: 'var(--c-faint)' }}>{log.notes}</p>}
                        </div>
                        <p className="text-[9px]" style={{ color: 'var(--c-faint)' }}>{log.date}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </>
      )}

      {livestock.length === 0 && <p className="text-center py-12 text-sm" style={{ color: 'var(--c-faint)' }}>No livestock records</p>}
      <style>{`.no-scrollbar::-webkit-scrollbar{display:none}.no-scrollbar{-ms-overflow-style:none;scrollbar-width:none}`}</style>
    </div>
  )
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function Assets() {
  const {
    machineryMaster, farmAssets, livestockMaster, livestockCountLogs,
    disposeMachinery, disposeFarmAsset, addLivestockCountLog,
    addMachinery, addFarmAsset, addLivestock,
    updateAssetPhoto, updateAssetPrice,
  } = useAppStore()

  const [tab,          setTab]          = useState('machinery')
  const [dispose,      setDispose]      = useState(null)
  const [countModal,   setCountModal]   = useState(null)
  const [editPrice,    setEditPrice]    = useState(null)
  const [addModal,     setAddModal]     = useState(null)
  const [saving,       setSaving]       = useState(false)
  const [toast,        setToast]        = useState(null)
  const photoInputRef  = useRef()
  const [pendingPhoto, setPendingPhoto] = useState(null)

  const showToast = (msg, type = 'success') => {
    setToast({ msg, type }); setTimeout(() => setToast(null), 3000)
  }

  const handlePhotoClick = (table, item) => {
    setPendingPhoto({ table, id: item.id })
    photoInputRef.current?.click()
  }

  const handlePhotoChange = async (e) => {
    const file = e.target.files?.[0]
    if (!file || !pendingPhoto) return
    setSaving(true)
    try {
      const ext  = file.name.split('.').pop()
      const path = `asset_photos/${pendingPhoto.table}/${pendingPhoto.id}/${Date.now()}.${ext}`
      const { error: upErr } = await supabase.storage.from('farm-photos').upload(path, file, { upsert: true })
      if (upErr) throw upErr
      const { data: { publicUrl } } = supabase.storage.from('farm-photos').getPublicUrl(path)
      await updateAssetPhoto(pendingPhoto.table, pendingPhoto.id, publicUrl)
      showToast('Photo updated')
    } catch (err) { showToast('Upload failed: ' + err.message, 'error') }
    setSaving(false)
    setPendingPhoto(null)
    e.target.value = ''
  }

  const confirmDispose = async (form) => {
    if (!dispose) return
    setSaving(true)
    try {
      if (dispose.kind === 'machinery') await disposeMachinery(dispose.item.id, form)
      else await disposeFarmAsset(dispose.item.id, form)
      showToast(`${dispose.item.name} marked as ${form.type}`)
      setDispose(null)
    } catch (e) { showToast('Failed: ' + e.message, 'error') }
    setSaving(false)
  }

  const confirmCount = async (form) => {
    if (!countModal || !form.quantity || Number(form.quantity) <= 0) return showToast('Enter valid quantity', 'warn')
    setSaving(true)
    try {
      await addLivestockCountLog({ livestockId: countModal.animal.id, date: form.date, changeType: countModal.changeType, reason: form.reason, quantity: parseInt(form.quantity), notes: form.notes })
      showToast('Count updated')
      setCountModal(null)
    } catch (e) { showToast('Failed: ' + e.message, 'error') }
    setSaving(false)
  }

  const confirmEditPrice = async (price) => {
    if (!editPrice) return
    setSaving(true)
    try {
      await updateAssetPrice(editPrice.table, editPrice.item.id, price)
      showToast('Value saved')
      setEditPrice(null)
    } catch (e) { showToast('Failed: ' + e.message, 'error') }
    setSaving(false)
  }

  const confirmAdd = async (kind, form) => {
    setSaving(true)
    try {
      if (kind === 'machinery')  await addMachinery(form)
      else if (kind === 'asset') await addFarmAsset(form)
      else                       await addLivestock(form)
      showToast(`${form.name} added`)
      setAddModal(null)
    } catch (e) { showToast('Failed: ' + e.message, 'error') }
    setSaving(false)
  }

  const totalMachinery = machineryMaster.reduce((s, m) => s + (m.purchasePrice || 0), 0)
  const totalAssets    = farmAssets.reduce((s, a) => s + (a.purchasePrice || 0), 0)
  const totalLivestock = livestockMaster.reduce((s, l) => s + (l.purchasePrice || 0), 0)
  const totalAll       = totalMachinery + totalAssets + totalLivestock
  const tabValue = tab === 'machinery' ? totalMachinery : tab === 'assets' ? totalAssets : totalLivestock
  const tabCount = tab === 'machinery' ? machineryMaster.length : tab === 'assets' ? farmAssets.length : livestockMaster.length

  return (
    <div className="h-full flex flex-col" style={{ background: 'var(--c-bg)' }}>

      <input ref={photoInputRef} type="file" accept="image/*" className="hidden" onChange={handlePhotoChange} />

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
      <div className="flex gap-0 shrink-0 border-b" style={{ borderColor: 'var(--c-border)', background: 'var(--c-nav)' }}>
        <div className="flex-1 py-2 px-4">
          <p className="text-base font-bold" style={{ color: '#1D9E75' }}>{tabValue > 0 ? fmt(tabValue) : '₹—'}</p>
          <p className="text-[9px]" style={{ color: 'var(--c-faint)' }}>This tab · {tabCount} items</p>
        </div>
        <div className="px-4 py-2 text-right border-l" style={{ borderColor: 'var(--c-border)' }}>
          <p className="text-base font-bold" style={{ color: 'var(--c-text)' }}>{totalAll > 0 ? fmt(totalAll) : '₹—'}</p>
          <p className="text-[9px]" style={{ color: 'var(--c-faint)' }}>Total book value</p>
        </div>
      </div>

      {tab === 'machinery' && (
        <MachineryTab machinery={machineryMaster}
          onDispose={item => setDispose({ item, kind: 'machinery' })}
          onPhoto={handlePhotoClick}
          onEditPrice={(item, table) => setEditPrice({ item, table })}
          onAdd={() => setAddModal('machinery')} />
      )}
      {tab === 'assets' && (
        <FarmAssetsTab assets={farmAssets}
          onDispose={item => setDispose({ item, kind: 'asset' })}
          onPhoto={handlePhotoClick}
          onEditPrice={(item, table) => setEditPrice({ item, table })}
          onAdd={() => setAddModal('asset')} />
      )}
      {tab === 'livestock' && (
        <LivestockTab livestock={livestockMaster} countLogs={livestockCountLogs}
          onCount={(animal, changeType) => setCountModal({ animal, changeType })}
          onPhoto={handlePhotoClick}
          onEditPrice={(item, table) => setEditPrice({ item, table })}
          onAdd={() => setAddModal('livestock')} />
      )}

      {dispose    && <DisposeModal     item={dispose.item}    onClose={() => setDispose(null)}    onConfirm={confirmDispose}  saving={saving} />}
      {countModal && <CountModal       animal={countModal.animal} changeType={countModal.changeType} onClose={() => setCountModal(null)} onConfirm={confirmCount} saving={saving} />}
      {editPrice  && <EditPriceModal   item={editPrice.item}  onClose={() => setEditPrice(null)}  onConfirm={confirmEditPrice} saving={saving} />}
      {addModal === 'machinery' && <AddMachineryModal onClose={() => setAddModal(null)} onConfirm={f => confirmAdd('machinery', f)} saving={saving} />}
      {addModal === 'asset'     && <AddFarmAssetModal onClose={() => setAddModal(null)} onConfirm={f => confirmAdd('asset', f)}     saving={saving} />}
      {addModal === 'livestock' && <AddLivestockModal onClose={() => setAddModal(null)} onConfirm={f => confirmAdd('livestock', f)} saving={saving} />}

      {toast && (
        <div className="fixed bottom-24 left-1/2 -translate-x-1/2 z-50 px-4 py-2.5 rounded-2xl text-xs font-semibold shadow-lg text-white"
          style={{ background: toast.type === 'error' ? '#E24B4A' : toast.type === 'warn' ? '#BA7517' : '#1D9E75' }}>
          {toast.msg}
        </div>
      )}
    </div>
  )
}

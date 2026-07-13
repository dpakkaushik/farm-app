import React, { useEffect, useState } from 'react'
import { TreePine, Plus, Pencil, Trash2, ChevronDown, ChevronRight, MapPin, CalendarOff } from 'lucide-react'
import { useTreeStore } from '../store/trees'
import { useAppStore } from '../store'
import { useAuthStore, isManager } from '../store/auth'

const TODAY = new Date().toISOString().slice(0, 10)
const YEAR  = new Date().getFullYear()
const SIDES = ['north', 'east', 'south', 'west']

const CHANGE_TYPES = [
  ['planted',       '🌱', 'Planted'],
  ['died',          '💀', 'Died'],
  ['felled',        '🪓', 'Felled'],
  ['transplanted',  '🚚', 'Moved out'],
  ['correction',    '✏️', 'Correction'],
]

const PURPOSE = {
  fruit:  { emoji: '🍋', label: 'Fruit',  color: '#1D9E75' },
  timber: { emoji: '🪵', label: 'Timber', color: '#BA7517' },
}

// Fruit is leased on the tree, timber is sold outright, but both are one buyer and
// one lump sum — so they are the same row, and each maps to the kind of tree it can
// possibly cover.
const REVENUE = {
  fruit_lease: { emoji: '🍋', label: 'Fruit lease', color: '#1D9E75', purpose: 'fruit'  },
  timber_sale: { emoji: '🪵', label: 'Timber sale', color: '#BA7517', purpose: 'timber' },
}

const PAY = {
  pending: { label: 'Unpaid',    color: '#E24B4A' },
  partial: { label: 'Part paid', color: '#BA7517' },
  paid:    { label: 'Paid',      color: '#1D9E75' },
}

const money = n => `₹${Math.round(n || 0).toLocaleString('en-IN')}`

const inp = 'w-full px-3 py-2.5 rounded-xl text-sm border outline-none bg-[var(--c-ghost)] border-[var(--c-border)] text-[var(--c-text)]'

function Modal({ title, onClose, children }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center" style={{ background: 'rgba(0,0,0,0.5)' }}>
      <div className="w-full max-w-lg rounded-t-2xl p-5 pb-8 space-y-4"
        style={{ background: 'var(--c-nav)', maxHeight: '92vh', overflowY: 'auto' }}>
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

function Choice({ options, value, onChange }) {
  return (
    <div className="grid gap-1.5" style={{ gridTemplateColumns: `repeat(${Math.min(options.length, 3)}, minmax(0,1fr))` }}>
      {options.map(([v, label]) => (
        <button key={v} onClick={() => onChange(v)}
          className="py-2 rounded-xl text-xs font-medium transition-colors"
          style={{
            background: value === v ? '#1D9E75' : 'var(--c-ghost)',
            color:      value === v ? '#fff'    : 'var(--c-muted)',
            border:    `1px solid ${value === v ? '#1D9E75' : 'var(--c-border)'}`,
          }}>
          {label}
        </button>
      ))}
    </div>
  )
}

// What the owner reads. English is the label; the Devanagari name is kept because
// it is what the register and the manager actually say, and it shows underneath.
// A species with no English name falls back to its local one rather than showing
// a blank — some names (Meetha) have no translation worth inventing.
const displayName = sp => sp.nameEn?.trim() || sp.nameLocal

// ── Species form ──────────────────────────────────────────────────────────────
function SpeciesModal({ species, onClose }) {
  const { addSpecies, updateSpecies } = useTreeStore()
  const [form, setForm] = useState({
    nameLocal: species?.nameLocal || '',
    nameEn:    species?.nameEn    || '',
    purpose:   species?.purpose   || 'fruit',
    notes:     species?.notes     || '',
  })
  const [saving, setSaving] = useState(false)
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  async function save() {
    if (!form.nameEn.trim() && !form.nameLocal.trim()) return alert('Give the tree a name')
    setSaving(true)
    try {
      // name_local is NOT NULL in the database, but the English name is the one
      // that gets typed. If only English is given, it stands for both.
      const payload = { ...form, nameLocal: form.nameLocal.trim() || form.nameEn.trim() }
      if (species) await updateSpecies(species.id, payload)
      else         await addSpecies(payload)
      onClose()
    } catch (e) { alert('Save failed: ' + e.message) }
    finally { setSaving(false) }
  }

  return (
    <Modal title={species ? 'Edit tree' : 'New tree'} onClose={onClose}>
      <FRow label="Name">
        <input className={inp} placeholder="Mango" value={form.nameEn}
          onChange={e => set('nameEn', e.target.value)} />
      </FRow>
      <FRow label="Local name (optional)">
        <input className={inp} placeholder="आम" value={form.nameLocal}
          onChange={e => set('nameLocal', e.target.value)} />
      </FRow>
      <FRow label="Type">
        <Choice
          options={[['fruit', '🍋 Fruiting'], ['timber', '🪵 Timber']]}
          value={form.purpose} onChange={v => set('purpose', v)} />
      </FRow>
      <FRow label="Notes (optional)">
        <textarea className={inp} rows={2} value={form.notes}
          onChange={e => set('notes', e.target.value)} />
      </FRow>
      <button onClick={save} disabled={saving}
        className="w-full py-3 rounded-xl font-semibold text-sm text-white"
        style={{ background: '#1D9E75', opacity: saving ? 0.6 : 1 }}>
        {saving ? 'Saving…' : species ? 'Save changes' : 'Add tree'}
      </button>
    </Modal>
  )
}

// ── Planting form ─────────────────────────────────────────────────────────────
function PlantingModal({ speciesId, speciesName, planting, onClose }) {
  const { addPlanting, updatePlanting } = useTreeStore()
  const plots = useAppStore(s => s.plots)
  const editing = !!planting

  const [form, setForm] = useState({
    quantity:      '',
    plantedOn:     planting?.plantedOn    || '',
    locationType:  planting?.locationType || 'boundary',
    plotId:        planting?.plotId       || '',
    boundarySides: planting?.boundarySides || [],
    notes:         planting?.notes        || '',
  })
  const [saving, setSaving] = useState(false)
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const toggleSide = side => set('boundarySides',
    form.boundarySides.includes(side)
      ? form.boundarySides.filter(s => s !== side)
      : [...form.boundarySides, side])

  async function save() {
    if (!editing && (!form.quantity || parseInt(form.quantity, 10) < 1))
      return alert('How many trees?')
    if (form.locationType === 'plot' && !form.plotId)
      return alert('Which plot?')
    setSaving(true)
    try {
      if (editing) await updatePlanting(planting.id, form)
      else         await addPlanting({ ...form, speciesId })
      onClose()
    } catch (e) { alert('Save failed: ' + e.message) }
    finally { setSaving(false) }
  }

  return (
    <Modal title={editing ? `Edit location — ${speciesName}` : `Add ${speciesName}`} onClose={onClose}>
      {!editing && (
        <FRow label="How many">
          <input type="number" min="1" className={inp} placeholder="e.g. 200"
            value={form.quantity} onChange={e => set('quantity', e.target.value)} />
        </FRow>
      )}
      {editing && (
        <p className="text-[10px] px-1" style={{ color: 'var(--c-muted)' }}>
          Count is {planting.count} — change it from the planting's <b>Update count</b> button, so the
          change carries a reason.
        </p>
      )}

      <FRow label="Planted on (leave blank if unknown)">
        <input type="date" max={TODAY} className={inp} value={form.plantedOn}
          onChange={e => set('plantedOn', e.target.value)} />
      </FRow>

      <FRow label="Where">
        <Choice
          options={[['plot', '🟩 Inside a plot'], ['boundary', '🧱 On a boundary']]}
          value={form.locationType} onChange={v => set('locationType', v)} />
      </FRow>

      <FRow label={form.locationType === 'plot' ? 'Plot' : 'Plot (optional — blank = farm perimeter)'}>
        <select className={inp} value={form.plotId} onChange={e => set('plotId', e.target.value)}>
          <option value="">— none —</option>
          {plots.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      </FRow>

      {form.locationType === 'boundary' && (
        <FRow label="Which sides (leave blank if unknown)">
          <div className="grid grid-cols-4 gap-1.5">
            {SIDES.map(side => {
              const on = form.boundarySides.includes(side)
              return (
                <button key={side} onClick={() => toggleSide(side)}
                  className="py-2 rounded-xl text-xs font-medium capitalize"
                  style={{
                    background: on ? '#1D9E75' : 'var(--c-ghost)',
                    color:      on ? '#fff'    : 'var(--c-muted)',
                    border:    `1px solid ${on ? '#1D9E75' : 'var(--c-border)'}`,
                  }}>
                  {side}
                </button>
              )
            })}
          </div>
        </FRow>
      )}

      <FRow label="Notes (optional)">
        <input className={inp} placeholder="e.g. Nursery" value={form.notes}
          onChange={e => set('notes', e.target.value)} />
      </FRow>

      <button onClick={save} disabled={saving}
        className="w-full py-3 rounded-xl font-semibold text-sm text-white"
        style={{ background: '#1D9E75', opacity: saving ? 0.6 : 1 }}>
        {saving ? 'Saving…' : editing ? 'Save changes' : 'Add planting'}
      </button>
    </Modal>
  )
}

// ── Count-change form ─────────────────────────────────────────────────────────
function CountModal({ planting, speciesName, onClose }) {
  const addCountLog = useTreeStore(s => s.addCountLog)
  const [form, setForm] = useState({
    changeType: 'died', quantity: '', logDate: TODAY, reason: '',
  })
  const [saving, setSaving] = useState(false)
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const n      = parseInt(form.quantity, 10)
  const loses  = ['died', 'felled', 'transplanted'].includes(form.changeType)
  const signed = form.changeType === 'correction' ? (n || 0) : (loses ? -(Math.abs(n) || 0) : (Math.abs(n) || 0))
  const after  = planting.count + signed

  async function save() {
    if (!form.quantity || Number.isNaN(n) || n === 0) return alert('Enter a number')
    if (after < 0) return alert(`That would leave ${after} trees. Check the number.`)
    setSaving(true)
    try {
      await addCountLog({ ...form, plantingId: planting.id })
      onClose()
    } catch (e) { alert('Save failed: ' + e.message) }
    finally { setSaving(false) }
  }

  return (
    <Modal title={`Update count — ${speciesName}`} onClose={onClose}>
      <FRow label="What happened">
        <div className="grid grid-cols-3 gap-1.5">
          {CHANGE_TYPES.map(([v, emoji, label]) => (
            <button key={v} onClick={() => set('changeType', v)}
              className="py-2 rounded-xl text-xs font-medium"
              style={{
                background: form.changeType === v ? '#1D9E75' : 'var(--c-ghost)',
                color:      form.changeType === v ? '#fff'    : 'var(--c-muted)',
                border:    `1px solid ${form.changeType === v ? '#1D9E75' : 'var(--c-border)'}`,
              }}>
              {emoji} {label}
            </button>
          ))}
        </div>
      </FRow>

      <FRow label={form.changeType === 'correction' ? 'Adjust by (may be negative)' : 'How many'}>
        <input type="number" className={inp} placeholder="0"
          value={form.quantity} onChange={e => set('quantity', e.target.value)} />
      </FRow>

      {form.quantity !== '' && !Number.isNaN(n) && (
        <p className="text-xs px-1" style={{ color: after < 0 ? '#E24B4A' : 'var(--c-muted)' }}>
          {planting.count} → <b style={{ color: after < 0 ? '#E24B4A' : 'var(--c-text)' }}>{after}</b> trees
        </p>
      )}

      <FRow label="Date">
        <input type="date" max={TODAY} className={inp} value={form.logDate}
          onChange={e => set('logDate', e.target.value)} />
      </FRow>

      <FRow label="Reason (optional)">
        <input className={inp} placeholder="e.g. storm damage" value={form.reason}
          onChange={e => set('reason', e.target.value)} />
      </FRow>

      <button onClick={save} disabled={saving}
        className="w-full py-3 rounded-xl font-semibold text-sm text-white"
        style={{ background: '#1D9E75', opacity: saving ? 0.6 : 1 }}>
        {saving ? 'Saving…' : 'Record change'}
      </button>
    </Modal>
  )
}

// ── Planting row ──────────────────────────────────────────────────────────────
function PlantingRow({ planting, speciesName, canEdit, onEdit, onCount }) {
  const { countLogs, deletePlanting } = useTreeStore()
  const [open, setOpen] = useState(false)
  const logs = countLogs.filter(l => l.plantingId === planting.id)

  // "On a boundary" IS a location — it is what the owner told us. What is missing
  // is only the exact spot: which plot, which side. Show what we know, and flag
  // the gap separately instead of pretending we know nothing.
  const sides = planting.boundarySides
  const where = planting.locationType === 'plot'
    ? `${planting.plotName || 'Plot'}`
    : ['Boundary', planting.plotName, sides.length ? sides.join('/') : null]
        .filter(Boolean).join(' — ')
  const vague = planting.locationType === 'boundary' && !sides.length

  async function remove() {
    if (!confirm(`Delete this planting of ${planting.count} ${speciesName}? Its count history goes too.`)) return
    try { await deletePlanting(planting.id) } catch (e) { alert(e.message) }
  }

  return (
    <div className="rounded-xl border" style={{ borderColor: 'var(--c-border)', background: 'var(--c-ghost)' }}>
      <div className="flex items-center gap-2 px-3 py-2.5">
        <button onClick={() => setOpen(v => !v)} className="shrink-0" style={{ color: 'var(--c-muted)' }}>
          {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        </button>

        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold" style={{ color: 'var(--c-text)' }}>
            {planting.count}
            {planting.notes && (
              <span className="ml-1.5 text-[9px] font-bold px-1.5 py-0.5 rounded-full"
                style={{ background: '#BA751718', color: '#BA7517' }}>{planting.notes}</span>
            )}
          </p>
          <div className="flex items-center gap-2 text-[10px] mt-0.5 flex-wrap" style={{ color: 'var(--c-muted)' }}>
            <span className="flex items-center gap-0.5"><MapPin size={9} /> {where}</span>
            {vague && <span style={{ color: '#BA7517' }}>exact spot not set</span>}
            {planting.plantedOn
              ? <span>planted {planting.plantedOn}</span>
              : <span className="flex items-center gap-0.5" style={{ color: '#BA7517' }}>
                  <CalendarOff size={9} /> date not set
                </span>}
          </div>
        </div>

        {canEdit && (
          <div className="flex items-center gap-1 shrink-0">
            <button onClick={onCount} className="px-2 py-1 rounded-lg text-[10px] font-semibold"
              style={{ background: '#1D9E7518', color: '#1D9E75' }}>Count</button>
            <button onClick={onEdit} className="p-1" style={{ color: 'var(--c-muted)' }}><Pencil size={13} /></button>
            <button onClick={remove} className="p-1" style={{ color: 'var(--c-muted)' }}><Trash2 size={13} /></button>
          </div>
        )}
      </div>

      {open && (
        <div className="px-3 pb-3 pt-1 space-y-1 border-t" style={{ borderColor: 'var(--c-border)' }}>
          {logs.length === 0
            ? <p className="text-[10px] pt-2" style={{ color: 'var(--c-muted)' }}>No history</p>
            : logs.map(l => {
                const meta = CHANGE_TYPES.find(([v]) => v === l.changeType)
                return (
                  <div key={l.id} className="flex items-center gap-2 text-[10px] pt-1.5">
                    <span>{meta ? meta[1] : '📄'}</span>
                    <span className="font-semibold" style={{ color: l.quantity < 0 ? '#E24B4A' : '#1D9E75' }}>
                      {l.quantity > 0 ? '+' : ''}{l.quantity}
                    </span>
                    <span style={{ color: 'var(--c-muted)' }}>
                      {l.changeType === 'opening_balance' ? 'opening balance' : (meta ? meta[2].toLowerCase() : l.changeType)}
                      {l.reason ? ` · ${l.reason}` : ''}
                    </span>
                    <span className="ml-auto shrink-0" style={{ color: 'var(--c-faint)' }}>{l.logDate}</span>
                  </div>
                )
              })}
        </div>
      )}
    </div>
  )
}

// ── Species card ──────────────────────────────────────────────────────────────
function SpeciesCard({ species, plantings, canEdit }) {
  const deleteSpecies = useTreeStore(s => s.deleteSpecies)
  const [open, setOpen]           = useState(false)
  const [editSpecies, setEdit]    = useState(false)
  const [newPlanting, setNew]     = useState(false)
  const [editPlanting, setEditPl] = useState(null)
  const [countPlanting, setCount] = useState(null)

  const total = plantings.reduce((s, p) => s + p.count, 0)
  const p     = PURPOSE[species.purpose]

  const name = displayName(species)
  // Only worth showing when it says something the English name doesn't.
  const localName = species.nameLocal !== name ? species.nameLocal : null

  async function remove() {
    if (!confirm(`Delete ${name} and all ${total} of its trees?`)) return
    try { await deleteSpecies(species.id) } catch (e) { alert(e.message) }
  }

  return (
    <div className="rounded-2xl border overflow-hidden" style={{ background: 'var(--c-nav)', borderColor: 'var(--c-border)' }}>
      <button onClick={() => setOpen(v => !v)} className="w-full flex items-center gap-3 p-4 text-left">
        <span className="text-xl shrink-0">{p.emoji}</span>
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-sm truncate" style={{ color: 'var(--c-text)' }}>{name}</p>
          <p className="text-[10px]" style={{ color: 'var(--c-muted)' }}>
            {localName ? `${localName} · ` : ''}
            {plantings.length} {plantings.length === 1 ? 'planting' : 'plantings'}
          </p>
        </div>
        <div className="text-right shrink-0">
          <p className="text-base font-bold" style={{ color: p.color }}>{total}</p>
          <p className="text-[9px]" style={{ color: 'var(--c-muted)' }}>{p.label}</p>
        </div>
        {open ? <ChevronDown size={15} style={{ color: 'var(--c-muted)' }} />
              : <ChevronRight size={15} style={{ color: 'var(--c-muted)' }} />}
      </button>

      {open && (
        <div className="px-4 pb-4 space-y-2">
          {plantings.map(pl => (
            <PlantingRow key={pl.id} planting={pl} speciesName={name} canEdit={canEdit}
              onEdit={() => setEditPl(pl)} onCount={() => setCount(pl)} />
          ))}

          {canEdit && (
            <div className="flex gap-2 pt-1">
              <button onClick={() => setNew(true)}
                className="flex-1 py-2 rounded-xl text-xs font-semibold flex items-center justify-center gap-1 border"
                style={{ borderColor: '#1D9E75', color: '#1D9E75' }}>
                <Plus size={13} /> Add planting
              </button>
              <button onClick={() => setEdit(true)} className="px-3 py-2 rounded-xl border"
                style={{ borderColor: 'var(--c-border)', color: 'var(--c-muted)' }}>
                <Pencil size={13} />
              </button>
              <button onClick={remove} className="px-3 py-2 rounded-xl border"
                style={{ borderColor: 'var(--c-border)', color: 'var(--c-muted)' }}>
                <Trash2 size={13} />
              </button>
            </div>
          )}
        </div>
      )}

      {editSpecies   && <SpeciesModal  species={species} onClose={() => setEdit(false)} />}
      {newPlanting   && <PlantingModal speciesId={species.id} speciesName={name}
                                       onClose={() => setNew(false)} />}
      {editPlanting  && <PlantingModal speciesId={species.id} speciesName={name}
                                       planting={editPlanting} onClose={() => setEditPl(null)} />}
      {countPlanting && <CountModal planting={countPlanting} speciesName={name}
                                    onClose={() => setCount(null)} />}
    </div>
  )
}

// ── Sale form ─────────────────────────────────────────────────────────────────
function SaleModal({ onClose }) {
  const { species, plantings, addRevenue } = useTreeStore()
  const buyers = useAppStore(s => s.buyers)

  const [form, setForm] = useState({
    revenueType: 'fruit_lease',
    seasonYear:  String(YEAR),
    buyerId:     '',
    buyerName:   '',
    agreementDate: TODAY,
    startDate:   '',
    endDate:     '',
    amount:      '',
    paymentStatus: 'pending',
    amountReceived: '',
    paymentDate: '',
    plantingIds: [],
    felled:      false,
    notes:       '',
  })
  const [saving, setSaving] = useState(false)
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const meta      = REVENUE[form.revenueType]
  const speciesOf = id => species.find(s => s.id === id)

  // A fruit lease cannot cover a teak tree. Only offer plantings of the right kind.
  const eligible = plantings.filter(p => speciesOf(p.speciesId)?.purpose === meta.purpose)

  // Switching the type invalidates the selection, so drop it rather than silently
  // carry over plantings the new type cannot cover.
  const setType = t => setForm(f => ({ ...f, revenueType: t, plantingIds: [], felled: false }))

  const toggle = id => set('plantingIds',
    form.plantingIds.includes(id)
      ? form.plantingIds.filter(x => x !== id)
      : [...form.plantingIds, id])

  const chosen    = eligible.filter(p => form.plantingIds.includes(p.id))
  const treeCount = chosen.reduce((s, p) => s + p.count, 0)

  async function save() {
    if (!form.amount || Number(form.amount) <= 0) return alert('How much is the deal worth?')
    if (!form.plantingIds.length)                 return alert('Which trees does this cover?')
    if (!form.buyerId && !form.buyerName.trim())  return alert('Who is the buyer?')
    if (form.paymentStatus === 'partial' &&
        (!form.amountReceived || Number(form.amountReceived) <= 0))
      return alert('How much has been received so far?')
    if (Number(form.amountReceived) > Number(form.amount))
      return alert('Received is more than the deal amount. Check the numbers.')

    setSaving(true)
    try {
      // A picked buyer wins; the free-text box is only for a thekedar who is not in
      // the buyer list yet. Either way the row carries a readable name.
      const name = form.buyerId
        ? (buyers.find(b => b.id === form.buyerId)?.name || '')
        : form.buyerName
      await addRevenue({ ...form, buyerName: name, seasonYear: parseInt(form.seasonYear, 10) || null })
      onClose()
    } catch (e) { alert('Save failed: ' + e.message) }
    finally { setSaving(false) }
  }

  return (
    <Modal title="Record a sale" onClose={onClose}>
      <FRow label="What kind">
        <Choice
          options={[['fruit_lease', '🍋 Fruit lease'], ['timber_sale', '🪵 Timber sale']]}
          value={form.revenueType} onChange={setType} />
      </FRow>

      <FRow label="Buyer">
        <select className={inp} value={form.buyerId}
          onChange={e => set('buyerId', e.target.value)}>
          <option value="">— someone else —</option>
          {buyers.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
        </select>
      </FRow>
      {!form.buyerId && (
        <FRow label="Buyer name">
          <input className={inp} placeholder="e.g. Ramesh thekedar" value={form.buyerName}
            onChange={e => set('buyerName', e.target.value)} />
        </FRow>
      )}

      <FRow label={`Which trees (${eligible.length ? `${chosen.length} of ${eligible.length} selected` : 'none available'})`}>
        {eligible.length === 0 ? (
          <p className="text-xs px-1 py-2" style={{ color: 'var(--c-muted)' }}>
            No {meta.purpose} trees on the farm yet.
          </p>
        ) : (
          <div className="space-y-1.5 max-h-52 overflow-y-auto">
            {eligible.map(p => {
              const on = form.plantingIds.includes(p.id)
              const sp = speciesOf(p.speciesId)
              const where = p.locationType === 'plot'
                ? (p.plotName || 'Plot')
                : ['Boundary', p.plotName].filter(Boolean).join(' — ')
              return (
                <button key={p.id} onClick={() => toggle(p.id)}
                  className="w-full flex items-center gap-2 px-3 py-2 rounded-xl text-left"
                  style={{
                    background: on ? '#1D9E7514' : 'var(--c-ghost)',
                    border: `1px solid ${on ? '#1D9E75' : 'var(--c-border)'}`,
                  }}>
                  <span className="text-xs" style={{ color: on ? '#1D9E75' : 'var(--c-faint)' }}>
                    {on ? '☑' : '☐'}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold truncate" style={{ color: 'var(--c-text)' }}>
                      {sp ? displayName(sp) : 'Tree'}
                      {p.notes && <span className="ml-1 font-normal" style={{ color: 'var(--c-muted)' }}>({p.notes})</span>}
                    </p>
                    <p className="text-[10px]" style={{ color: 'var(--c-muted)' }}>{where}</p>
                  </div>
                  <span className="text-xs font-bold shrink-0" style={{ color: meta.color }}>{p.count}</span>
                </button>
              )
            })}
          </div>
        )}
      </FRow>

      {treeCount > 0 && (
        <p className="text-[10px] px-1 -mt-1" style={{ color: 'var(--c-muted)' }}>
          Covers <b style={{ color: 'var(--c-text)' }}>{treeCount.toLocaleString('en-IN')}</b> trees
        </p>
      )}

      <FRow label="Season (year)">
        <input type="number" className={inp} value={form.seasonYear}
          onChange={e => set('seasonYear', e.target.value)} />
      </FRow>

      <FRow label="Amount (₹)">
        <input type="number" min="0" className={inp} placeholder="e.g. 45000" value={form.amount}
          onChange={e => set('amount', e.target.value)} />
      </FRow>

      <FRow label="Agreement date">
        <input type="date" max={TODAY} className={inp} value={form.agreementDate}
          onChange={e => set('agreementDate', e.target.value)} />
      </FRow>

      {form.revenueType === 'fruit_lease' && (
        <div className="grid grid-cols-2 gap-2">
          <FRow label="Season from">
            <input type="date" className={inp} value={form.startDate}
              onChange={e => set('startDate', e.target.value)} />
          </FRow>
          <FRow label="Season to">
            <input type="date" className={inp} value={form.endDate}
              onChange={e => set('endDate', e.target.value)} />
          </FRow>
        </div>
      )}

      <FRow label="Payment">
        <Choice
          options={[['pending', 'Unpaid'], ['partial', 'Part paid'], ['paid', 'Paid']]}
          value={form.paymentStatus}
          onChange={v => setForm(f => ({
            ...f,
            paymentStatus: v,
            paymentDate: v === 'pending' ? '' : (f.paymentDate || TODAY),
          }))} />
      </FRow>

      {form.paymentStatus === 'partial' && (
        <FRow label="Received so far (₹)">
          <input type="number" min="0" className={inp} value={form.amountReceived}
            onChange={e => set('amountReceived', e.target.value)} />
        </FRow>
      )}
      {form.paymentStatus !== 'pending' && (
        <FRow label="Payment date">
          <input type="date" max={TODAY} className={inp} value={form.paymentDate}
            onChange={e => set('paymentDate', e.target.value)} />
        </FRow>
      )}

      {/* Selling standing timber and cutting it are different days. Default off, so
          the count only drops when the manager says the trees actually came down. */}
      {form.revenueType === 'timber_sale' && treeCount > 0 && (
        <button onClick={() => set('felled', !form.felled)}
          className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-left"
          style={{
            background: form.felled ? '#BA751714' : 'var(--c-ghost)',
            border: `1px solid ${form.felled ? '#BA7517' : 'var(--c-border)'}`,
          }}>
          <span className="text-sm" style={{ color: form.felled ? '#BA7517' : 'var(--c-faint)' }}>
            {form.felled ? '☑' : '☐'}
          </span>
          <div className="flex-1">
            <p className="text-xs font-semibold" style={{ color: 'var(--c-text)' }}>
              🪓 Trees have already been cut
            </p>
            <p className="text-[10px]" style={{ color: 'var(--c-muted)' }}>
              {form.felled
                ? `Removes ${treeCount.toLocaleString('en-IN')} trees from the count now`
                : 'Leave off if the timber is sold but still standing'}
            </p>
          </div>
        </button>
      )}

      <FRow label="Notes (optional)">
        <textarea className={inp} rows={2} value={form.notes}
          onChange={e => set('notes', e.target.value)} />
      </FRow>

      <button onClick={save} disabled={saving}
        className="w-full py-3 rounded-xl font-semibold text-sm text-white"
        style={{ background: '#1D9E75', opacity: saving ? 0.6 : 1 }}>
        {saving ? 'Saving…' : 'Record sale'}
      </button>
    </Modal>
  )
}

// ── Payment update ────────────────────────────────────────────────────────────
function PaymentModal({ sale, onClose }) {
  const updatePayment = useTreeStore(s => s.updatePayment)
  const [form, setForm] = useState({
    paymentStatus:  sale.paymentStatus,
    amountReceived: sale.amountReceived || '',
    paymentDate:    sale.paymentDate || TODAY,
  })
  const [saving, setSaving] = useState(false)
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  async function save() {
    if (form.paymentStatus === 'partial') {
      const n = Number(form.amountReceived)
      if (!n || n <= 0)          return alert('How much has been received?')
      if (n > sale.amount)       return alert('Received is more than the deal amount.')
    }
    setSaving(true)
    try {
      await updatePayment(sale.id, { ...form, amount: sale.amount })
      onClose()
    } catch (e) { alert('Save failed: ' + e.message) }
    finally { setSaving(false) }
  }

  return (
    <Modal title="Update payment" onClose={onClose}>
      <p className="text-xs px-1" style={{ color: 'var(--c-muted)' }}>
        Deal is worth <b style={{ color: 'var(--c-text)' }}>{money(sale.amount)}</b>
      </p>

      <FRow label="Status">
        <Choice
          options={[['pending', 'Unpaid'], ['partial', 'Part paid'], ['paid', 'Paid']]}
          value={form.paymentStatus}
          onChange={v => setForm(f => ({
            ...f,
            paymentStatus: v,
            paymentDate: v === 'pending' ? '' : (f.paymentDate || TODAY),
          }))} />
      </FRow>

      {form.paymentStatus === 'partial' && (
        <FRow label="Received so far (₹)">
          <input type="number" min="0" className={inp} value={form.amountReceived}
            onChange={e => set('amountReceived', e.target.value)} />
        </FRow>
      )}
      {form.paymentStatus !== 'pending' && (
        <FRow label="Payment date">
          <input type="date" max={TODAY} className={inp} value={form.paymentDate}
            onChange={e => set('paymentDate', e.target.value)} />
        </FRow>
      )}

      <button onClick={save} disabled={saving}
        className="w-full py-3 rounded-xl font-semibold text-sm text-white"
        style={{ background: '#1D9E75', opacity: saving ? 0.6 : 1 }}>
        {saving ? 'Saving…' : 'Save'}
      </button>
    </Modal>
  )
}

// ── Sale row ──────────────────────────────────────────────────────────────────
function SaleRow({ sale, canEdit }) {
  const { species, plantings, deleteRevenue } = useTreeStore()
  const [open, setOpen] = useState(false)
  const [pay, setPay]   = useState(false)

  const meta   = REVENUE[sale.revenueType] || REVENUE.fruit_lease
  const status = PAY[sale.paymentStatus]   || PAY.pending

  const covered = plantings.filter(p => sale.plantingIds.includes(p.id))
  const names   = [...new Set(covered.map(p => {
    const sp = species.find(s => s.id === p.speciesId)
    return sp ? displayName(sp) : 'Tree'
  }))]
  const outstanding = sale.amount - sale.amountReceived

  async function remove() {
    if (!confirm(`Delete this ${meta.label.toLowerCase()} of ${money(sale.amount)}? Any felled trees stay felled.`)) return
    try { await deleteRevenue(sale.id) } catch (e) { alert(e.message) }
  }

  return (
    <div className="rounded-2xl border overflow-hidden" style={{ background: 'var(--c-nav)', borderColor: 'var(--c-border)' }}>
      <button onClick={() => setOpen(v => !v)} className="w-full flex items-center gap-3 p-4 text-left">
        <span className="text-xl shrink-0">{meta.emoji}</span>
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-sm truncate" style={{ color: 'var(--c-text)' }}>
            {sale.buyerName || 'Buyer not named'}
          </p>
          <p className="text-[10px] truncate" style={{ color: 'var(--c-muted)' }}>
            {meta.label}{sale.seasonYear ? ` · ${sale.seasonYear}` : ''}
            {names.length ? ` · ${names.slice(0, 3).join(', ')}${names.length > 3 ? ` +${names.length - 3}` : ''}` : ''}
          </p>
        </div>
        <div className="text-right shrink-0">
          <p className="text-sm font-bold" style={{ color: 'var(--c-text)' }}>{money(sale.amount)}</p>
          <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded-full"
            style={{ background: `${status.color}18`, color: status.color }}>
            {status.label}
          </span>
        </div>
        {open ? <ChevronDown size={15} style={{ color: 'var(--c-muted)' }} />
              : <ChevronRight size={15} style={{ color: 'var(--c-muted)' }} />}
      </button>

      {open && (
        <div className="px-4 pb-4 space-y-2.5 border-t pt-3" style={{ borderColor: 'var(--c-border)' }}>
          <div className="grid grid-cols-2 gap-2 text-[11px]">
            {sale.agreementDate && (
              <div><span style={{ color: 'var(--c-muted)' }}>Agreed </span>
                <span style={{ color: 'var(--c-text)' }}>{sale.agreementDate}</span></div>
            )}
            {(sale.startDate || sale.endDate) && (
              <div><span style={{ color: 'var(--c-muted)' }}>Season </span>
                <span style={{ color: 'var(--c-text)' }}>{sale.startDate || '?'} → {sale.endDate || '?'}</span></div>
            )}
            {sale.amountReceived > 0 && (
              <div><span style={{ color: 'var(--c-muted)' }}>Received </span>
                <span style={{ color: '#1D9E75' }}>{money(sale.amountReceived)}</span></div>
            )}
            {outstanding > 0 && (
              <div><span style={{ color: 'var(--c-muted)' }}>Outstanding </span>
                <span style={{ color: '#E24B4A' }}>{money(outstanding)}</span></div>
            )}
            {sale.paymentDate && (
              <div><span style={{ color: 'var(--c-muted)' }}>Paid on </span>
                <span style={{ color: 'var(--c-text)' }}>{sale.paymentDate}</span></div>
            )}
          </div>

          {covered.length > 0 && (
            <div className="space-y-1">
              <p className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: 'var(--c-muted)' }}>
                Trees covered
              </p>
              {covered.map(p => {
                const sp = species.find(s => s.id === p.speciesId)
                return (
                  <div key={p.id} className="flex items-center gap-2 text-[11px]">
                    <span style={{ color: 'var(--c-text)' }}>{sp ? displayName(sp) : 'Tree'}</span>
                    {p.notes && <span style={{ color: 'var(--c-muted)' }}>({p.notes})</span>}
                    <span className="ml-auto font-semibold" style={{ color: 'var(--c-muted)' }}>{p.count} standing</span>
                  </div>
                )
              })}
            </div>
          )}

          {sale.notes && (
            <p className="text-[11px]" style={{ color: 'var(--c-muted)' }}>{sale.notes}</p>
          )}

          {canEdit && (
            <div className="flex gap-2 pt-1">
              <button onClick={() => setPay(true)}
                className="flex-1 py-2 rounded-xl text-xs font-semibold border"
                style={{ borderColor: '#1D9E75', color: '#1D9E75' }}>
                Update payment
              </button>
              <button onClick={remove} className="px-3 py-2 rounded-xl border"
                style={{ borderColor: 'var(--c-border)', color: 'var(--c-muted)' }}>
                <Trash2 size={13} />
              </button>
            </div>
          )}
        </div>
      )}

      {pay && <PaymentModal sale={sale} onClose={() => setPay(false)} />}
    </div>
  )
}

// ── Sales tab ─────────────────────────────────────────────────────────────────
function SalesTab({ canEdit }) {
  const revenue = useTreeStore(s => s.revenue)
  const [newSale, setNew] = useState(false)
  const [filter, setFilter] = useState('all')

  const shown = revenue.filter(r => filter === 'all' || r.revenueType === filter)

  const earned    = revenue.reduce((s, r) => s + r.amount, 0)
  const received  = revenue.reduce((s, r) => s + r.amountReceived, 0)
  const owed      = earned - received

  return (
    <>
      {revenue.length > 0 && (
        <div className="grid grid-cols-3 gap-2">
          {[
            ['Agreed',      earned,   'var(--c-text)'],
            ['Received',    received, '#1D9E75'],
            ['Outstanding', owed,     owed > 0 ? '#E24B4A' : 'var(--c-muted)'],
          ].map(([label, val, color]) => (
            <div key={label} className="rounded-xl border p-3"
              style={{ background: 'var(--c-nav)', borderColor: 'var(--c-border)' }}>
              <p className="text-[9px] uppercase tracking-wide" style={{ color: 'var(--c-muted)' }}>{label}</p>
              <p className="text-sm font-bold mt-0.5" style={{ color }}>{money(val)}</p>
            </div>
          ))}
        </div>
      )}

      {revenue.length > 0 && (
        <FilterChips value={filter} onChange={setFilter}
          options={[['all', 'All'], ['fruit_lease', '🍋 Leases'], ['timber_sale', '🪵 Timber']]} />
      )}

      {shown.length === 0 && (
        <p className="text-center text-sm py-8" style={{ color: 'var(--c-muted)' }}>
          {revenue.length === 0 ? 'No sales recorded yet' : 'Nothing of this kind'}
        </p>
      )}

      {shown.map(r => <SaleRow key={r.id} sale={r} canEdit={canEdit} />)}

      {canEdit && (
        <button onClick={() => setNew(true)}
          className="w-full py-2.5 rounded-xl text-sm font-semibold flex items-center justify-center gap-2 border"
          style={{ borderColor: '#1D9E75', color: '#1D9E75' }}>
          <Plus size={15} /> Record a sale
        </button>
      )}

      {newSale && <SaleModal onClose={() => setNew(false)} />}
    </>
  )
}

// ── Filter chips ──────────────────────────────────────────────────────────────
// A filter, not a tab: it narrows one list rather than switching between screens.
// Small and inline, so the tab bar above stays free for Trees / Sales.
function FilterChips({ options, value, onChange }) {
  return (
    <div className="flex gap-1.5 flex-wrap">
      {options.map(([k, label]) => {
        const on = value === k
        return (
          <button key={k} onClick={() => onChange(k)}
            className="px-3 py-1.5 rounded-full text-[11px] font-semibold transition-colors"
            style={{
              background: on ? '#1D9E75' : 'var(--c-ghost)',
              color:      on ? '#fff'    : 'var(--c-muted)',
              border:    `1px solid ${on ? '#1D9E75' : 'var(--c-border)'}`,
            }}>
            {label}
          </button>
        )
      })}
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────
export default function Trees() {
  const { species, plantings, loading, loaded, load } = useTreeStore()
  const { farms, activeFarmId } = useAuthStore()
  const canEdit = isManager(farms.find(f => f.farm_id === activeFarmId)?.role)

  const [tab, setTab]           = useState('trees')   // 'trees' | 'sales'
  const [filter, setFilter]     = useState('all')     // fruit / timber, within the trees tab
  const [newSpecies, setNew]    = useState(false)
  const [error, setError]       = useState(null)

  useEffect(() => {
    load().catch(e => setError(e.message))
  }, [activeFarmId])

  const plantingsOf = id => plantings.filter(p => p.speciesId === id)
  const countOf     = id => plantingsOf(id).reduce((s, p) => s + p.count, 0)

  const fruit  = species.filter(s => s.purpose === 'fruit').reduce((s, sp) => s + countOf(sp.id), 0)
  const timber = species.filter(s => s.purpose === 'timber').reduce((s, sp) => s + countOf(sp.id), 0)

  const shown = species
    .filter(s => filter === 'all' || s.purpose === filter)
    .sort((a, b) => countOf(b.id) - countOf(a.id))

  return (
    <div className="flex flex-col h-full overflow-hidden" style={{ background: 'var(--c-bg)' }}>
      <div className="shrink-0 px-4 pt-4 pb-3 border-b" style={{ borderColor: 'var(--c-border)' }}>
        <div className="flex items-center gap-2 mb-3">
          <TreePine size={20} style={{ color: '#1D9E75' }} />
          <p className="text-base font-bold" style={{ color: 'var(--c-text)' }}>Trees</p>
          <div className="flex gap-1.5 ml-auto text-[10px]">
            <span className="px-2 py-0.5 rounded-full" style={{ background: 'var(--c-ghost)', color: 'var(--c-muted)' }}>
              🍋 {fruit.toLocaleString('en-IN')}
            </span>
            <span className="px-2 py-0.5 rounded-full" style={{ background: 'var(--c-ghost)', color: 'var(--c-muted)' }}>
              🪵 {timber.toLocaleString('en-IN')}
            </span>
          </div>
        </div>

        <div className="flex rounded-xl overflow-hidden border border-[var(--c-border)]">
          {[['trees', 'Trees'], ['sales', 'Sales']].map(([k, label]) => (
            <button key={k} onClick={() => setTab(k)}
              className="flex-1 py-2 text-xs font-semibold transition-colors"
              style={{ background: tab === k ? '#1D9E75' : 'var(--c-ghost)',
                       color:      tab === k ? '#fff'    : 'var(--c-muted)' }}>
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 pt-4 space-y-3 pb-6">
        {error && (
          <p className="text-center text-sm py-8" style={{ color: '#E24B4A' }}>
            Could not load trees: {error}
          </p>
        )}
        {!error && loading && !loaded && (
          <p className="text-center text-sm py-8" style={{ color: 'var(--c-muted)' }}>Loading…</p>
        )}

        {!error && loaded && tab === 'trees' && (
          <>
            {species.length > 0 && (
              <FilterChips value={filter} onChange={setFilter}
                options={[['all', 'All'], ['fruit', '🍋 Fruiting'], ['timber', '🪵 Timber']]} />
            )}

            {shown.length === 0 && (
              <p className="text-center text-sm py-8" style={{ color: 'var(--c-muted)' }}>
                {species.length === 0 ? 'No trees yet' : 'No trees of this kind'}
              </p>
            )}

            {shown.map(s => (
              <SpeciesCard key={s.id} species={s} plantings={plantingsOf(s.id)} canEdit={canEdit} />
            ))}

            {canEdit && (
              <button onClick={() => setNew(true)}
                className="w-full py-2.5 rounded-xl text-sm font-semibold flex items-center justify-center gap-2 border"
                style={{ borderColor: '#1D9E75', color: '#1D9E75' }}>
                <Plus size={15} /> Add a tree
              </button>
            )}
          </>
        )}

        {!error && loaded && tab === 'sales' && <SalesTab canEdit={canEdit} />}
      </div>

      {newSpecies && <SpeciesModal onClose={() => setNew(false)} />}
    </div>
  )
}

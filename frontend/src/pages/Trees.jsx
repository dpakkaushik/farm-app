import React, { useEffect, useState } from 'react'
import { TreePine, Plus, Pencil, Trash2, ChevronDown, ChevronRight, MapPin, CalendarOff } from 'lucide-react'
import { useTreeStore } from '../store/trees'
import { useAppStore } from '../store'
import { useAuthStore, isManager } from '../store/auth'

const TODAY = new Date().toISOString().slice(0, 10)
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
    if (!form.nameLocal.trim()) return alert('Give the tree a name')
    setSaving(true)
    try {
      if (species) await updateSpecies(species.id, form)
      else         await addSpecies(form)
      onClose()
    } catch (e) { alert('Save failed: ' + e.message) }
    finally { setSaving(false) }
  }

  return (
    <Modal title={species ? 'Edit tree' : 'New tree'} onClose={onClose}>
      <FRow label="Name">
        <input className={inp} placeholder="आम / Mango" value={form.nameLocal}
          onChange={e => set('nameLocal', e.target.value)} />
      </FRow>
      <FRow label="English name (optional)">
        <input className={inp} placeholder="Mango" value={form.nameEn}
          onChange={e => set('nameEn', e.target.value)} />
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

  const sides    = planting.boundarySides
  const knownLoc = planting.locationType === 'plot'
    ? planting.plotName
    : sides.length ? `${planting.plotName || 'Farm'} — ${sides.join(', ')}` : null

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
            {knownLoc
              ? <span className="flex items-center gap-0.5"><MapPin size={9} /> {knownLoc}</span>
              : <span className="flex items-center gap-0.5" style={{ color: '#BA7517' }}>
                  <MapPin size={9} /> location not set
                </span>}
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

  async function remove() {
    if (!confirm(`Delete ${species.nameLocal} and all ${total} of its trees?`)) return
    try { await deleteSpecies(species.id) } catch (e) { alert(e.message) }
  }

  return (
    <div className="rounded-2xl border overflow-hidden" style={{ background: 'var(--c-nav)', borderColor: 'var(--c-border)' }}>
      <button onClick={() => setOpen(v => !v)} className="w-full flex items-center gap-3 p-4 text-left">
        <span className="text-xl shrink-0">{p.emoji}</span>
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-sm truncate" style={{ color: 'var(--c-text)' }}>{species.nameLocal}</p>
          <p className="text-[10px]" style={{ color: 'var(--c-muted)' }}>
            {species.nameEn ? `${species.nameEn} · ` : ''}
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
            <PlantingRow key={pl.id} planting={pl} speciesName={species.nameLocal} canEdit={canEdit}
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
      {newPlanting   && <PlantingModal speciesId={species.id} speciesName={species.nameLocal}
                                       onClose={() => setNew(false)} />}
      {editPlanting  && <PlantingModal speciesId={species.id} speciesName={species.nameLocal}
                                       planting={editPlanting} onClose={() => setEditPl(null)} />}
      {countPlanting && <CountModal planting={countPlanting} speciesName={species.nameLocal}
                                    onClose={() => setCount(null)} />}
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────
export default function Trees() {
  const { species, plantings, loading, loaded, load } = useTreeStore()
  const { farms, activeFarmId } = useAuthStore()
  const canEdit = isManager(farms.find(f => f.farm_id === activeFarmId)?.role)

  const [filter, setFilter]     = useState('all')
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
          {[['all', 'All'], ['fruit', '🍋 Fruiting'], ['timber', '🪵 Timber']].map(([k, label]) => (
            <button key={k} onClick={() => setFilter(k)}
              className="flex-1 py-2 text-xs font-semibold transition-colors"
              style={{ background: filter === k ? '#1D9E75' : 'var(--c-ghost)',
                       color:      filter === k ? '#fff'    : 'var(--c-muted)' }}>
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
        {!error && loaded && shown.length === 0 && (
          <p className="text-center text-sm py-8" style={{ color: 'var(--c-muted)' }}>No trees yet</p>
        )}

        {shown.map(s => (
          <SpeciesCard key={s.id} species={s} plantings={plantingsOf(s.id)} canEdit={canEdit} />
        ))}

        {canEdit && !error && (
          <button onClick={() => setNew(true)}
            className="w-full py-2.5 rounded-xl text-sm font-semibold flex items-center justify-center gap-2 border"
            style={{ borderColor: '#1D9E75', color: '#1D9E75' }}>
            <Plus size={15} /> Add a tree
          </button>
        )}
      </div>

      {newSpecies && <SpeciesModal onClose={() => setNew(false)} />}
    </div>
  )
}

// Livestock health: the vet-visit record and the checkup it leaves behind.
//
// The livestock_health_logs table and its next_checkup column already existed and
// already held real visits; nothing in the app read them, so a vaccination that
// fell due simply passed unnoticed. This is the surface for both halves — the
// history, and the warning that the next one is owed.
import React, { useState } from 'react'
import { Plus, Trash2, Stethoscope, AlertTriangle } from 'lucide-react'
import { useAppStore } from '../../store'
import {
  Modal, FRow, HealthPill, inp, TODAY, HEALTH_OPTIONS,
  animalLabel, daysFromToday, isActive,
} from './ui'

// An animal's outstanding checkup is the one on its most recent visit: a later
// visit supersedes whatever the previous one scheduled.
export function pendingCheckups(animals, logs) {
  return animals
    .filter(isActive)
    .map(a => {
      const latest = logs
        .filter(h => h.livestockId === a.id)
        .sort((x, y) => (x.date < y.date ? 1 : -1))[0]
      if (!latest?.nextCheckup) return null
      return { animal: a, date: latest.nextCheckup, days: daysFromToday(latest.nextCheckup) }
    })
    .filter(Boolean)
    .sort((x, y) => (x.date > y.date ? 1 : -1))
}

// Overdue, or falling due inside a fortnight — near enough to act on.
export const DUE_SOON_DAYS = 14
export const isDue = c => c.days <= DUE_SOON_DAYS

export function CheckupBanner({ checkups, onOpen }) {
  const due = checkups.filter(isDue)
  if (due.length === 0) return null
  const overdue = due.filter(c => c.days < 0)
  const worst   = overdue.length > 0 ? overdue[0] : due[0]
  const color   = overdue.length > 0 ? '#E24B4A' : '#BA7517'
  const text    = overdue.length > 0
    ? `${animalLabel(worst.animal)}'s checkup is ${Math.abs(worst.days)} days overdue`
    : `${animalLabel(worst.animal)}'s checkup is due in ${worst.days} day${worst.days === 1 ? '' : 's'}`

  return (
    <button onClick={onOpen}
      className="w-full mt-2 flex items-center gap-2 px-3 py-2 rounded-xl text-left"
      style={{ background: color + '14', border: `1px solid ${color}40` }}>
      <AlertTriangle size={14} style={{ color, flexShrink: 0 }} />
      <p className="text-[11px] font-semibold flex-1" style={{ color }}>
        {text}{due.length > 1 ? ` · +${due.length - 1} more` : ''}
      </p>
      <span className="text-[10px] font-bold" style={{ color }}>View</span>
    </button>
  )
}

// ── Add Visit Modal ───────────────────────────────────────────────────────────
function AddHealthModal({ animals, preselect, onClose, onConfirm, saving }) {
  const [f, setF] = useState({
    livestockId: preselect || '', date: TODAY, healthStatus: 'healthy',
    symptoms: '', treatment: '', vetName: '', nextCheckup: '', notes: '',
  })
  const u = (k, v) => setF(p => ({ ...p, [k]: v }))

  return (
    <Modal title="Log a Vet Visit" onClose={onClose}>
      <FRow label="Animal *">
        <select className={inp} value={f.livestockId} onChange={e => u('livestockId', e.target.value)}
          style={{ background: 'var(--c-ghost)' }}>
          <option value="">— Select animal —</option>
          {animals.filter(isActive).map(a => (
            <option key={a.id} value={a.id}>{animalLabel(a)} ({a.species})</option>
          ))}
        </select>
      </FRow>

      <FRow label="Date">
        <input type="date" className={inp} value={f.date} onChange={e => u('date', e.target.value)} />
      </FRow>

      <FRow label="Condition after this visit">
        <div className="grid grid-cols-2 gap-2">
          {HEALTH_OPTIONS.map(([v, l]) => (
            <button key={v} onClick={() => u('healthStatus', v)}
              className="py-2 rounded-xl text-xs font-semibold border transition-colors"
              style={{
                background:  f.healthStatus === v ? '#1D9E7518' : 'var(--c-ghost)',
                borderColor: f.healthStatus === v ? '#1D9E75'   : 'var(--c-border)',
                color:       f.healthStatus === v ? '#1D9E75'   : 'var(--c-muted)',
              }}>
              {l}
            </button>
          ))}
        </div>
        <p className="text-[10px] mt-1" style={{ color: 'var(--c-muted)' }}>
          This becomes the animal's status on the Animals tab.
        </p>
      </FRow>

      <FRow label="Reason / Symptoms">
        <input className={inp} placeholder="e.g. Annual vaccination, mild fever"
          value={f.symptoms} onChange={e => u('symptoms', e.target.value)} />
      </FRow>

      <FRow label="Treatment given">
        <input className={inp} placeholder="e.g. FMD + HS vaccine"
          value={f.treatment} onChange={e => u('treatment', e.target.value)} />
      </FRow>

      <div className="grid grid-cols-2 gap-3">
        <FRow label="Vet name">
          <input className={inp} placeholder="e.g. Dr. Ramesh"
            value={f.vetName} onChange={e => u('vetName', e.target.value)} />
        </FRow>
        <FRow label="Next checkup">
          <input type="date" className={inp} value={f.nextCheckup}
            onChange={e => u('nextCheckup', e.target.value)} />
        </FRow>
      </div>
      <p className="text-[10px] -mt-2" style={{ color: 'var(--c-muted)' }}>
        Set a next checkup and the app will warn you before it falls due.
      </p>

      <FRow label="Notes">
        <input className={inp} placeholder="Optional"
          value={f.notes} onChange={e => u('notes', e.target.value)} />
      </FRow>

      <button onClick={() => f.livestockId && onConfirm(f)} disabled={saving || !f.livestockId}
        className="w-full py-3 rounded-xl text-sm font-semibold text-white disabled:opacity-50"
        style={{ background: '#1D9E75' }}>
        {saving ? 'Saving…' : 'Save Visit'}
      </button>
    </Modal>
  )
}

// ── Health Tab ────────────────────────────────────────────────────────────────
// Scoped to the group on screen — a dog's vaccination record has no business in
// the buffalo shed's history. But one vet visit really does cover the buffalo and
// the dog on the same trip, so the whole farm is always one tap away.
export default function HealthTab({ animals, allAnimals, face }) {
  const { livestockHealthLogs, addLivestockHealthLog, deleteLivestockHealthLog } = useAppStore(s => ({
    livestockHealthLogs:     s.livestockHealthLogs,
    addLivestockHealthLog:   s.addLivestockHealthLog,
    deleteLivestockHealthLog: s.deleteLivestockHealthLog,
  }))
  const [showAdd, setShowAdd] = useState(false)
  const [saving,  setSaving]  = useState(false)
  const [filter,  setFilter]  = useState('all')
  const [wide,    setWide]    = useState(false)

  const inScope   = wide ? allAnimals : animals
  const scopeIds  = new Set(inScope.map(a => a.id))
  const scopeLogs = livestockHealthLogs.filter(h => scopeIds.has(h.livestockId))

  const checkups = pendingCheckups(inScope, livestockHealthLogs)
  const due      = checkups.filter(isDue)
  const logs     = filter === 'all' ? scopeLogs : scopeLogs.filter(h => h.livestockId === filter)

  // Widening or narrowing invalidates a single-animal filter, so drop it.
  const setScope = v => { setWide(v); setFilter('all') }

  const open  = () => setShowAdd(true)
  const close = () => setShowAdd(false)

  async function confirmAdd(form) {
    setSaving(true)
    try { await addLivestockHealthLog(form); close() }
    catch (e) { alert('Save failed: ' + e.message) }
    finally { setSaving(false) }
  }

  async function confirmDelete(id) {
    if (!confirm('Delete this visit record?')) return
    try { await deleteLivestockHealthLog(id) } catch (e) { alert(e.message) }
  }

  return (
    <div className="space-y-3 pb-4">
      {/* Scope. One tap, because a vet trip that covers the whole farm is real. */}
      <div className="flex rounded-xl overflow-hidden border border-[var(--c-border)]">
        {[[false, face.title], [true, 'All animals']].map(([v, label]) => (
          <button key={label} onClick={() => setScope(v)}
            className="flex-1 py-2 text-[11px] font-semibold transition-colors"
            style={{
              background: wide === v ? '#1D9E7514' : 'var(--c-ghost)',
              color:      wide === v ? '#1D9E75'   : 'var(--c-muted)',
              boxShadow:  wide === v ? 'inset 0 -2px 0 #1D9E75' : 'none',
            }}>
            {label}
          </button>
        ))}
      </div>

      <button onClick={open}
        className="w-full py-2.5 rounded-xl text-xs font-semibold border-2 border-dashed flex items-center justify-center gap-2"
        style={{ borderColor: '#1D9E7540', color: '#1D9E75', background: '#1D9E7508' }}>
        <Plus size={14} /> Log a Vet Visit
      </button>

      {/* Checkups owed — the reason this tab exists */}
      {due.length > 0 && (
        <div className="rounded-2xl border overflow-hidden" style={{ borderColor: '#BA751740', background: 'var(--c-nav)' }}>
          <p className="px-4 py-2 text-[10px] font-bold uppercase tracking-widest"
            style={{ color: '#BA7517', background: '#BA751710' }}>Checkups due</p>
          <div className="divide-y divide-[var(--c-border)]">
            {due.map(c => {
              const overdue = c.days < 0
              return (
                <div key={c.animal.id} className="flex items-center justify-between px-4 py-2.5">
                  <div>
                    <p className="text-sm font-semibold" style={{ color: 'var(--c-text)' }}>{animalLabel(c.animal)}</p>
                    <p className="text-[10px]" style={{ color: 'var(--c-muted)' }}>Due {c.date}</p>
                  </div>
                  <span className="text-[10px] font-bold px-2 py-1 rounded-full"
                    style={{ background: (overdue ? '#E24B4A' : '#BA7517') + '18', color: overdue ? '#E24B4A' : '#BA7517' }}>
                    {overdue ? `${Math.abs(c.days)}d overdue` : `in ${c.days}d`}
                  </span>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Filter to one animal inside the current scope */}
      {scopeLogs.length > 0 && (
        <select className={inp} value={filter} onChange={e => setFilter(e.target.value)}
          style={{ background: 'var(--c-ghost)' }}>
          <option value="all">{wide ? 'All animals' : `All ${face.title.toLowerCase()}`}</option>
          {inScope.map(a => <option key={a.id} value={a.id}>{animalLabel(a)}</option>)}
        </select>
      )}

      {logs.length === 0 ? (
        <div className="text-center py-10">
          <Stethoscope size={28} style={{ color: 'var(--c-faint)' }} className="mx-auto mb-2" />
          <p className="text-sm" style={{ color: 'var(--c-muted)' }}>
            {scopeLogs.length === 0
              ? `No vet visits recorded${wide ? '' : ` for ${face.title.toLowerCase()}`}`
              : 'No visits for this animal'}
          </p>
        </div>
      ) : (
        logs.map(h => {
          const animal = inScope.find(a => a.id === h.livestockId)
          return (
            <div key={h.id} className="p-4 rounded-2xl border"
              style={{ background: 'var(--c-nav)', borderColor: 'var(--c-border)' }}>
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-sm font-semibold" style={{ color: 'var(--c-text)' }}>
                      {animalLabel(animal) || 'Unknown animal'}
                    </p>
                    <HealthPill status={h.healthStatus} />
                  </div>
                  <p className="text-[10px] mt-0.5" style={{ color: 'var(--c-muted)' }}>{h.date}</p>
                </div>
                <button onClick={() => confirmDelete(h.id)} className="p-1 shrink-0" style={{ color: 'var(--c-muted)' }}>
                  <Trash2 size={13} />
                </button>
              </div>

              {h.symptoms  && <p className="text-[11px] mt-2" style={{ color: 'var(--c-text)' }}>🩺 {h.symptoms}</p>}
              {h.treatment && <p className="text-[11px] mt-0.5" style={{ color: 'var(--c-text)' }}>💊 {h.treatment}</p>}
              {h.notes     && <p className="text-[10px] mt-0.5 italic" style={{ color: 'var(--c-faint)' }}>{h.notes}</p>}

              {(h.vetName || h.nextCheckup) && (
                <div className="mt-2 flex items-center gap-2 flex-wrap text-[10px]" style={{ color: 'var(--c-muted)' }}>
                  {h.vetName && (
                    <span className="px-1.5 py-0.5 rounded" style={{ background: 'var(--c-ghost)' }}>{h.vetName}</span>
                  )}
                  {h.nextCheckup && (
                    <span className="px-1.5 py-0.5 rounded" style={{ background: 'var(--c-ghost)' }}>
                      Next: {h.nextCheckup}
                    </span>
                  )}
                </div>
              )}
            </div>
          )
        })
      )}

      {showAdd && (
        <AddHealthModal animals={inScope} onClose={close} onConfirm={confirmAdd} saving={saving} />
      )}
    </div>
  )
}

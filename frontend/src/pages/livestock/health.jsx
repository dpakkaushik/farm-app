// Livestock health: the vet-visit record and the checkup it leaves behind.
//
// The livestock_health_logs table and its next_checkup column already existed and
// already held real visits; nothing in the app read them, so a vaccination that
// fell due simply passed unnoticed. This is the surface for both halves — the
// history, and the warning that the next one is owed.
import React, { useState } from 'react'
import { Plus, Trash2, Stethoscope, AlertTriangle } from 'lucide-react'
import FilterSelect from '../../components/FilterSelect'
import AddButton from '../../components/AddButton'
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
      <p className="text-[13px] font-semibold flex-1" style={{ color }}>
        {text}{due.length > 1 ? ` · +${due.length - 1} more` : ''}
      </p>
      <span className="text-[12px] font-bold" style={{ color }}>View</span>
    </button>
  )
}

// The cross-animal list of what is owed. It cannot sit on a single animal's card —
// a due list is inherently about several at once — so on the faces that have no
// Health tab it goes above the cards on the list tab, the only other surface that
// sees the whole group. Rows are tappable there and inert here, where the animal
// is already on screen.
export function DueList({ checkups, onPick }) {
  const due = checkups.filter(isDue)
  if (due.length === 0) return null

  return (
    <div className="rounded-2xl border overflow-hidden" style={{ borderColor: '#BA751740', background: 'var(--c-nav)' }}>
      <p className="px-4 py-2 text-[12px] font-bold uppercase tracking-widest"
        style={{ color: '#BA7517', background: '#BA751710' }}>Checkups due</p>
      <div className="divide-y divide-[var(--c-border)]">
        {due.map(c => {
          const overdue = c.days < 0
          const Row     = onPick ? 'button' : 'div'
          return (
            <Row key={c.animal.id} onClick={onPick ? () => onPick(c.animal.id) : undefined}
              className="w-full flex items-center justify-between px-4 py-2.5 text-left">
              <div>
                <p className="text-sm font-semibold" style={{ color: 'var(--c-text)' }}>{animalLabel(c.animal)}</p>
                <p className="text-[12px]" style={{ color: 'var(--c-muted)' }}>Due {c.date}</p>
              </div>
              <span className="text-[12px] font-bold px-2 py-1 rounded-full"
                style={{ background: (overdue ? '#E24B4A' : '#BA7517') + '18', color: overdue ? '#E24B4A' : '#BA7517' }}>
                {overdue ? `${Math.abs(c.days)}d overdue` : `in ${c.days}d`}
              </span>
            </Row>
          )
        })}
      </div>
    </div>
  )
}

// One visit, rendered the same way wherever it shows up — the Health tab's history
// and the panel on a card are the same record, and letting them drift apart would
// mean two places to change when the wording changes. `framed` is the difference:
// a standalone card in the list, a divided row inside one.
export function VisitRow({ log: h, animalName, framed = true, onDelete }) {
  const body = (
    <>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            {animalName && (
              <p className="text-sm font-semibold" style={{ color: 'var(--c-text)' }}>{animalName}</p>
            )}
            <HealthPill status={h.healthStatus} />
          </div>
          <p className="text-[12px] mt-0.5" style={{ color: 'var(--c-muted)' }}>{h.date}</p>
        </div>
        {onDelete && (
          <button onClick={onDelete} className="p-1 shrink-0" style={{ color: 'var(--c-muted)' }}>
            <Trash2 size={13} />
          </button>
        )}
      </div>

      {h.symptoms  && <p className="text-[13px] mt-2"    style={{ color: 'var(--c-text)'  }}>🩺 {h.symptoms}</p>}
      {h.treatment && <p className="text-[13px] mt-0.5"  style={{ color: 'var(--c-text)'  }}>💊 {h.treatment}</p>}
      {h.notes     && <p className="text-[12px] mt-0.5 italic" style={{ color: 'var(--c-faint)' }}>{h.notes}</p>}

      {(h.vetName || h.nextCheckup) && (
        <div className="mt-2 flex items-center gap-2 flex-wrap text-[12px]" style={{ color: 'var(--c-muted)' }}>
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
    </>
  )

  return framed
    ? <div className="p-4 rounded-2xl border" style={{ background: 'var(--c-nav)', borderColor: 'var(--c-border)' }}>{body}</div>
    : <div className="px-4 py-3">{body}</div>
}

// Health for one animal, folded into its card on the faces with no Health tab.
//
// The status pill on its own was never enough. Take the tab away and leave only
// the pill, and the visit record becomes unreachable from the Birds and Pets
// pages — so the panel carries the history and the way to add to it, which is
// what makes dropping the tab safe rather than merely tidier.
export function HealthPanel({ animal, animals }) {
  const { livestockHealthLogs, addLivestockHealthLog, deleteLivestockHealthLog } = useAppStore(s => ({
    livestockHealthLogs:      s.livestockHealthLogs,
    addLivestockHealthLog:    s.addLivestockHealthLog,
    deleteLivestockHealthLog: s.deleteLivestockHealthLog,
  }))
  const [showAdd, setShowAdd] = useState(false)
  const [saving,  setSaving]  = useState(false)

  // Newest first, and all of them: on this face there is nowhere else to read the
  // rest, so a "show more" would just be a dead end.
  const logs = livestockHealthLogs
    .filter(h => h.livestockId === animal.id)
    .sort((x, y) => (x.date < y.date ? 1 : -1))
  const next = pendingCheckups([animal], livestockHealthLogs)[0]

  async function confirmAdd(form) {
    setSaving(true)
    try { await addLivestockHealthLog(form); setShowAdd(false) }
    catch (e) { alert('Save failed: ' + e.message) }
    finally { setSaving(false) }
  }

  async function confirmDelete(id) {
    if (!confirm('Delete this visit record?')) return
    try { await deleteLivestockHealthLog(id) } catch (e) { alert(e.message) }
  }

  return (
    <div className="border-t border-[var(--c-border)]">
      {next && (
        <p className="px-4 pt-3 text-[12px] font-semibold"
          style={{ color: !isDue(next) ? 'var(--c-muted)' : next.days < 0 ? '#E24B4A' : '#BA7517' }}>
          {next.days < 0
            ? `Checkup ${Math.abs(next.days)} days overdue`
            : `Next checkup in ${next.days} day${next.days === 1 ? '' : 's'}`} · {next.date}
        </p>
      )}

      <div className="p-3">
        <button onClick={() => setShowAdd(true)}
          className="w-full py-2 rounded-xl text-[13px] font-semibold border-2 border-dashed flex items-center justify-center gap-1.5"
          style={{ borderColor: '#8A9A5B40', color: '#8A9A5B', background: '#8A9A5B08' }}>
          <Plus size={12} /> Log a Vet Visit
        </button>
      </div>

      {logs.length === 0 ? (
        <p className="px-4 pb-3 text-[12px]" style={{ color: 'var(--c-faint)' }}>No vet visits recorded yet</p>
      ) : (
        <div className="border-t border-[var(--c-border)] divide-y divide-[var(--c-border)]">
          {logs.map(h => (
            <VisitRow key={h.id} log={h} framed={false} onDelete={() => confirmDelete(h.id)} />
          ))}
        </div>
      )}

      {showAdd && (
        <AddHealthModal animals={animals} preselect={animal.id}
          onClose={() => setShowAdd(false)} onConfirm={confirmAdd} saving={saving} />
      )}
    </div>
  )
}

// ── Add Visit Modal ───────────────────────────────────────────────────────────
// `preselect` is what a card passes: the visit is about the animal you tapped, so
// the picker opens on it. The picker itself stays, because the wrong card is an
// easy tap and correcting it should not mean closing the modal.
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
                background:  f.healthStatus === v ? '#8A9A5B18' : 'var(--c-ghost)',
                borderColor: f.healthStatus === v ? '#8A9A5B'   : 'var(--c-border)',
                color:       f.healthStatus === v ? '#8A9A5B'   : 'var(--c-muted)',
              }}>
              {l}
            </button>
          ))}
        </div>
        <p className="text-[12px] mt-1" style={{ color: 'var(--c-muted)' }}>
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
      <p className="text-[12px] -mt-2" style={{ color: 'var(--c-muted)' }}>
        Set a next checkup and the app will warn you before it falls due.
      </p>

      <FRow label="Notes">
        <input className={inp} placeholder="Optional"
          value={f.notes} onChange={e => u('notes', e.target.value)} />
      </FRow>

      <button onClick={() => f.livestockId && onConfirm(f)} disabled={saving || !f.livestockId}
        className="w-full py-3 rounded-xl text-sm font-semibold text-white disabled:opacity-50"
        style={{ background: '#8A9A5B' }}>
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
            className="flex-1 py-2 text-[13px] font-semibold transition-colors"
            style={{
              background: wide === v ? '#8A9A5B14' : 'var(--c-ghost)',
              color:      wide === v ? '#8A9A5B'   : 'var(--c-muted)',
              boxShadow:  wide === v ? 'inset 0 -2px 0 #8A9A5B' : 'none',
            }}>
            {label}
          </button>
        ))}
      </div>

      <AddButton onClick={open}>Log a Vet Visit</AddButton>

      {/* Checkups owed — the reason this tab exists */}
      <DueList checkups={checkups} />

      {/* Filter to one animal inside the current scope */}
      {scopeLogs.length > 0 && (
        <FilterSelect value={filter} onChange={setFilter}
          options={[['all', wide ? 'All animals' : `All ${face.title.toLowerCase()}`], ...inScope.map(a => [a.id, animalLabel(a)])]} />
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
        logs.map(h => (
          <VisitRow key={h.id} log={h}
            animalName={animalLabel(inScope.find(a => a.id === h.livestockId)) || 'Unknown animal'}
            onDelete={() => confirmDelete(h.id)} />
        ))
      )}

      {showAdd && (
        <AddHealthModal animals={inScope} onClose={close} onConfirm={confirmAdd} saving={saving} />
      )}
    </div>
  )
}

// The livestock list — one of three faces, decided by the group in the URL.
//
// A flock is a number you add to and take from. An animal is a name with a price
// against it. A pet is a name with only a running cost. Same table, three cards,
// because they answer three different questions.
import React, { useState } from 'react'
import { Plus, Minus, Pencil, ChevronDown, ChevronUp, Archive, Stethoscope } from 'lucide-react'
import { useAppStore } from '../../store'
import { DueList, HealthPanel, pendingCheckups, isDue } from './health'
import {
  HEALTH_STYLE, STATUS_STYLE, speciesEmoji, costToDate,
  fmt, Pill, ActionBar,
} from './ui'

// Two panels can hang off one card now — the bird count and the health record — so
// what is open is a card id plus which panel, not a bare id.
const panelKey = (id, panel) => `${id}:${panel}`

export default function AnimalsTab({ animals, closed, countLogs, face, onEdit, onCount, onPhoto, onAdd, onClose }) {
  const { farmExpenses, livestockHealthLogs } = useAppStore(s => ({
    farmExpenses:        s.farmExpenses,
    livestockHealthLogs: s.livestockHealthLogs,
  }))
  const [open,         setOpen]         = useState(null)
  const [showInactive, setShowInactive] = useState(false)

  const isPets = face.key === 'pets'

  // Health is on every card, herd included. The Herd's Health tab is not a
  // substitute: the tab answers farm-wide questions — one vet trip across species,
  // everything the farm owes — and the card answers "what is Ganga's record".
  const checkups = pendingCheckups(animals, livestockHealthLogs)
  const dueBy    = new Map(checkups.filter(isDue).map(c => [c.animal.id, c]))

  // The cross-animal due list would be a second copy of what that tab already
  // shows, so it appears only on the faces without one.
  const groupDueList = !face.tabs.some(t => t.key === 'health')

  const toggle = (id, panel) => setOpen(o => o === panelKey(id, panel) ? null : panelKey(id, panel))

  // A tap on a due row is a request to see that animal, and the row sits above a
  // list the animal may well be below the fold of.
  const jumpToHealth = (id) => {
    setOpen(panelKey(id, 'health'))
    document.getElementById(`ls-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }

  // Read-only. The way into the record is the Health button on the action bar, and
  // a second door to the same panel is exactly what made the old Photo button
  // redundant with the photo itself.
  const healthChip = (l, h) => {
    const due = dueBy.get(l.id)
    return (
      <>
        <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full"
          style={{ background: h.color + '18', color: h.color }}>{h.label}</span>
        {due && (
          <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full"
            style={{ background: (due.days < 0 ? '#E24B4A' : '#BA7517') + '18', color: due.days < 0 ? '#E24B4A' : '#BA7517' }}>
            {due.days < 0 ? `${Math.abs(due.days)}d overdue` : `checkup in ${due.days}d`}
          </span>
        )}
      </>
    )
  }

  // Master data — name, species, breed, price, which plot it is kept on. Real, but
  // rare, so it is a pencil by the name and not a quarter of the action bar beside
  // the things a manager does daily. Species is the one that matters most: it is
  // free text, and it decides which of the three pages an animal appears on.
  const editPencil = l => (
    <button onClick={() => onEdit(l)} className="p-0.5" title="Edit details"
      style={{ color: 'var(--c-muted)' }}>
      <Pencil size={12} />
    </button>
  )

  // "Close" was accounting language for four different events — sold, rehomed,
  // died, culled. What they share is that the animal is no longer on the farm.
  const offFarm = l => ({ label: 'Off Farm', icon: <Archive size={11} />, color: '#E24B4A', onClick: () => onClose(l) })
  const health  = l => ({ label: 'Health', icon: <Stethoscope size={11} />, color: '#1D9E75', onClick: () => toggle(l.id, 'health') })

  const healthPanel = l => open === panelKey(l.id, 'health')
    ? <HealthPanel animal={l} animals={animals} />
    : null

  // One card for everything individually tracked. Cattle and pets differ in one
  // line only: cattle show what they cost to buy, pets what they cost to keep.
  const individualCard = l => {
    const h    = HEALTH_STYLE[l.healthStatus] || HEALTH_STYLE.healthy
    const cost = isPets ? costToDate(l, farmExpenses) : 0
    return (
      <div key={l.id} id={`ls-${l.id}`} className="bg-[var(--c-nav)] rounded-2xl border border-[var(--c-border)] overflow-hidden mb-3">
        <div className="p-4 flex gap-4">
          <button onClick={() => onPhoto('livestock_master', l)} className="shrink-0 flex flex-col items-center">
            {l.photoUrl
              ? <img src={l.photoUrl} alt={l.name} className="w-16 h-16 rounded-2xl object-cover border-2" style={{ borderColor: h.color+'50' }} />
              : <div className="w-16 h-16 rounded-2xl flex items-center justify-center text-3xl border-2 border-dashed" style={{ background: 'var(--c-ghost)', borderColor: 'var(--c-border)' }}>
                  {speciesEmoji(l)}
                </div>
            }
            <p className="text-[8px] mt-1" style={{ color: 'var(--c-faint)' }}>📷 Photo</p>
          </button>
          <div className="flex-1">
            <div className="flex items-center gap-2 flex-wrap mb-1">
              <p className="text-base font-bold" style={{ color: 'var(--c-text)' }}>{l.name || l.tagId}</p>
              {editPencil(l)}
              {healthChip(l, h)}
            </div>
            <p className="text-[11px]" style={{ color: 'var(--c-muted)' }}>
              {(l.species||'Buffalo').charAt(0).toUpperCase()+(l.species||'Buffalo').slice(1)}
              {l.breed  ? ` · ${l.breed}`  : ''}
              {l.gender ? ` · ${l.gender.charAt(0).toUpperCase()+l.gender.slice(1)}` : ''}
            </p>
            {l.dob && <p className="text-[10px] mt-0.5" style={{ color: 'var(--c-faint)' }}>Born: {l.dob}</p>}
            {isPets ? (
              <>
                <p className="text-[11px] mt-1 font-bold" style={{ color: cost ? '#E24B4A' : 'var(--c-faint)' }}>
                  {cost ? `Cost to date ${fmt(cost)}` : 'No spend logged yet'}
                </p>
                <p className="text-[9px] mt-0.5" style={{ color: 'var(--c-faint)' }}>
                  Purchase + food, vet, medicine & accessories tagged here
                </p>
              </>
            ) : (
              <p className="text-[11px] mt-1 font-bold" style={{ color: l.purchasePrice ? '#1D9E75' : 'var(--c-faint)' }}>
                {l.purchasePrice ? fmt(l.purchasePrice) : l.acquisitionType === 'born' ? '🐣 Born on farm' : 'Tap ✏ Edit to set price'}
              </p>
            )}
          </div>
        </div>
        {/* No Photo button: the photo itself already opens — the viewer if there is
            one, the picker if the slot is empty. Two doors to the same thing. */}
        <ActionBar actions={[health(l), offFarm(l)]} />
        {healthPanel(l)}
      </div>
    )
  }

  // The count is the flock's whole story, so it doubles as the button that opens
  // the log behind it — which keeps the action bar down to four taps wide.
  const poultryCard = l => {
    const logs   = countLogs.filter(c => c.livestockId === l.id)
    const isOpen = open === panelKey(l.id, 'counts')
    const h      = HEALTH_STYLE[l.healthStatus] || HEALTH_STYLE.healthy
    return (
      <div key={l.id} id={`ls-${l.id}`} className="bg-[var(--c-nav)] rounded-2xl border border-[var(--c-border)] overflow-hidden mb-3">
        <div className="p-4 flex items-center gap-3">
          <button onClick={() => onPhoto('livestock_master', l)} className="shrink-0">
            {l.photoUrl
              ? <img src={l.photoUrl} alt={l.name} className="w-14 h-14 rounded-xl object-cover" />
              : <div className="w-14 h-14 rounded-xl flex items-center justify-center text-2xl" style={{ background: 'var(--c-ghost)' }}>🐓</div>
            }
          </button>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1">
              <p className="text-sm font-bold" style={{ color: 'var(--c-text)' }}>{l.name || 'Flock'}</p>
              {editPencil(l)}
            </div>
            <p className="text-[10px]" style={{ color: 'var(--c-muted)' }}>{(l.species||'Poultry').charAt(0).toUpperCase()+(l.species||'Poultry').slice(1)}</p>
            {/* The flock showed no health at all while Health was a tab of its own. */}
            <div className="flex items-center gap-1 flex-wrap mt-1">{healthChip(l, h)}</div>
          </div>
          <button onClick={() => toggle(l.id, 'counts')} className="text-right shrink-0">
            <p className="text-2xl font-bold" style={{ color: '#4169E1' }}>{l.currentCount ?? 0}</p>
            <p className="text-[9px] flex items-center gap-0.5 justify-end" style={{ color: 'var(--c-faint)' }}>
              birds {isOpen ? <ChevronUp size={9} /> : <ChevronDown size={9} />}
            </p>
          </button>
        </div>
        <ActionBar actions={[
          { label: '+ Add',  icon: <Plus  size={11} />, color: '#1D9E75', onClick: () => onCount(l, 'add')    },
          { label: 'Remove', icon: <Minus size={11} />, color: '#BA7517', onClick: () => onCount(l, 'reduce') },
          health(l),
          offFarm(l),
        ]} />
        {isOpen && (
          <div className="border-t border-[var(--c-border)] divide-y divide-[var(--c-border)]">
            {logs.length === 0 ? (
              <p className="px-4 py-3 text-[10px]" style={{ color: 'var(--c-faint)' }}>No count changes logged yet</p>
            ) : logs.slice(0, 10).map(log => (
              <div key={log.id} className="flex items-center justify-between px-4 py-2">
                <p className="text-[10px]" style={{ color: 'var(--c-text)' }}>{log.changeType==='add' ? '+' : '-'}{log.quantity} · {log.reason}</p>
                <p className="text-[9px]" style={{ color: 'var(--c-faint)' }}>{log.date}</p>
              </div>
            ))}
          </div>
        )}
        {healthPanel(l)}
      </div>
    )
  }

  // A closed account is a record, not a working animal — no photo or count actions.
  const closedCard = a => {
    const s = STATUS_STYLE[a.status] || STATUS_STYLE.sold
    return (
      <div key={a.id} className="p-4 rounded-2xl border mb-2" style={{ background: 'var(--c-nav)', borderColor: 'var(--c-border)' }}>
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="text-xl">{speciesEmoji(a)}</span>
            <div>
              <p className="font-semibold text-sm" style={{ color: 'var(--c-text)' }}>{a.name || a.tagId}</p>
              <p className="text-[10px]" style={{ color: 'var(--c-muted)' }}>
                {a.species}{a.breed ? ` · ${a.breed}` : ''}{a.gender ? ` · ${a.gender}` : ''}
              </p>
            </div>
          </div>
          <Pill status={a.status} />
        </div>
        <div className="mt-2 flex gap-3 flex-wrap text-[10px]" style={{ color: 'var(--c-muted)' }}>
          {a.purchasePrice ? <span>Bought {fmt(a.purchasePrice)}</span> : null}
          {a.soldDate     ? <span>{s.dateLabel || 'Closed'} {a.soldDate}</span> : null}
        </div>
      </div>
    )
  }

  return (
    <div className="pb-4">
      <button onClick={onAdd} className="w-full mb-3 py-2.5 rounded-xl text-xs font-semibold border-2 border-dashed flex items-center justify-center gap-2"
        style={{ borderColor: '#1D9E7540', color: '#1D9E75', background: '#1D9E7508' }}>
        <Plus size={14} /> {face.add}
      </button>

      {/* What is owed across the whole group. On the herd this lives on the Health
          tab; here that tab is gone, and a card cannot hold a list about several
          animals, so it sits above them. */}
      {groupDueList && (
        <div className="mb-3"><DueList checkups={checkups} onPick={jumpToHealth} /></div>
      )}

      {animals.map(face.key === 'birds' ? poultryCard : individualCard)}

      {animals.length === 0 && (
        <p className="text-center py-12 text-sm" style={{ color: 'var(--c-faint)' }}>{face.empty}</p>
      )}

      {closed.length > 0 && (
        <>
          <button onClick={() => setShowInactive(v => !v)}
            className="w-full mt-3 mb-2 flex items-center justify-between px-4 py-2 rounded-xl text-xs font-semibold"
            style={{ background: 'var(--c-ghost)', color: 'var(--c-muted)' }}>
            <span>No longer on the farm ({closed.length})</span>
            {showInactive ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </button>
          {showInactive && closed.map(closedCard)}
        </>
      )}
    </div>
  )
}

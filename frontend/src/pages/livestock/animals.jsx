// The livestock list — one of three faces, decided by the group in the URL.
//
// A flock is a number you add to and take from. An animal is a name with a price
// against it. A pet is a name with only a running cost. Same table, three cards,
// because they answer three different questions.
import React, { useState } from 'react'
import { Plus, Minus, Camera, Pencil, ChevronDown, ChevronUp, Archive } from 'lucide-react'
import { useAppStore } from '../../store'
import {
  HEALTH_STYLE, STATUS_STYLE, speciesEmoji, costToDate,
  fmt, Pill, ActionBar,
} from './ui'

export default function AnimalsTab({ animals, closed, countLogs, face, onEdit, onCount, onPhoto, onAdd, onClose }) {
  const farmExpenses = useAppStore(s => s.farmExpenses)
  const [expanded,     setExpanded]     = useState(null)
  const [showInactive, setShowInactive] = useState(false)

  const isPets = face.key === 'pets'

  // One card for everything individually tracked. Cattle and pets differ in one
  // line only: cattle show what they cost to buy, pets what they cost to keep.
  const individualCard = l => {
    const h    = HEALTH_STYLE[l.healthStatus] || HEALTH_STYLE.healthy
    const cost = isPets ? costToDate(l, farmExpenses) : 0
    return (
      <div key={l.id} className="bg-[var(--c-nav)] rounded-2xl border border-[var(--c-border)] overflow-hidden mb-3">
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
              <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full" style={{ background: h.color+'18', color: h.color }}>{h.label}</span>
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
        <ActionBar actions={[
          { label: 'Edit',  icon: <Pencil  size={11} />, color: '#4169E1', onClick: () => onEdit(l) },
          { label: 'Photo', icon: <Camera  size={11} />,                   onClick: () => onPhoto('livestock_master', l) },
          { label: 'Close', icon: <Archive size={11} />, color: '#E24B4A', onClick: () => onClose(l) },
        ]} />
      </div>
    )
  }

  // The count is the flock's whole story, so it doubles as the button that opens
  // the log behind it — which keeps the action bar down to four taps wide.
  const poultryCard = l => {
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
            <p className="text-[10px]" style={{ color: 'var(--c-muted)' }}>{(l.species||'Poultry').charAt(0).toUpperCase()+(l.species||'Poultry').slice(1)}</p>
          </div>
          <button onClick={() => setExpanded(isOpen ? null : l.id)} className="text-right shrink-0">
            <p className="text-2xl font-bold" style={{ color: '#4169E1' }}>{l.currentCount ?? 0}</p>
            <p className="text-[9px] flex items-center gap-0.5 justify-end" style={{ color: 'var(--c-faint)' }}>
              birds {isOpen ? <ChevronUp size={9} /> : <ChevronDown size={9} />}
            </p>
          </button>
        </div>
        <ActionBar actions={[
          { label: 'Edit',     icon: <Pencil  size={11} />, color: '#4169E1', onClick: () => onEdit(l) },
          { label: '+ Add',    icon: <Plus    size={11} />, color: '#1D9E75', onClick: () => onCount(l, 'add')    },
          { label: 'Remove',   icon: <Minus   size={11} />, color: '#BA7517', onClick: () => onCount(l, 'reduce') },
          { label: 'Close',    icon: <Archive size={11} />, color: '#E24B4A', onClick: () => onClose(l) },
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

      {animals.map(face.key === 'birds' ? poultryCard : individualCard)}

      {animals.length === 0 && (
        <p className="text-center py-12 text-sm" style={{ color: 'var(--c-faint)' }}>{face.empty}</p>
      )}

      {closed.length > 0 && (
        <>
          <button onClick={() => setShowInactive(v => !v)}
            className="w-full mt-3 mb-2 flex items-center justify-between px-4 py-2 rounded-xl text-xs font-semibold"
            style={{ background: 'var(--c-ghost)', color: 'var(--c-muted)' }}>
            <span>Closed ({closed.length})</span>
            {showInactive ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </button>
          {showInactive && closed.map(closedCard)}
        </>
      )}
    </div>
  )
}

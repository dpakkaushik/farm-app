import { ChevronRight } from 'lucide-react'
import { CAT_EMOJI, StatusPill } from './vocab'
import { cardSubline, isRetired } from './assetFacts'

// One row of the register. Built for scanning: photo, name, state, one grey line.
// The whole card opens the detail sheet; the only inline action is Issue Diesel,
// because that is the one thing on this screen the owner does week in, week out.
export default function AssetCard({ item, kind, onOpen, onIssueDiesel }) {
  const emoji   = CAT_EMOJI[kind === 'machinery' ? item.type : item.category] || (kind === 'machinery' ? '🔧' : '📦')
  const retired = isRetired(item)
  return (
    <div role="button" tabIndex={0} onClick={() => onOpen(item)}
      onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen(item) } }}
      className="w-full text-left flex items-center gap-3 px-3 py-2.5 rounded-2xl border transition-colors active:bg-[var(--c-ghost)] cursor-pointer"
      style={{ background: 'var(--c-nav)', borderColor: 'var(--c-border)', opacity: retired ? 0.6 : 1 }}>
      {item.photoUrl
        ? <img src={item.photoUrl} alt="" className="w-12 h-12 rounded-xl object-cover shrink-0" />
        : <div className="w-12 h-12 rounded-xl flex items-center justify-center text-xl shrink-0" style={{ background: 'var(--c-ghost)' }}>{emoji}</div>
      }
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 min-w-0">
          <p className="text-sm font-semibold truncate" style={{ color: 'var(--c-text)' }}>{item.name}</p>
          <StatusPill status={item.status} />
        </div>
        <p className="text-[11px] mt-0.5 truncate" style={{ color: 'var(--c-muted)' }}>{cardSubline(item, kind)}</p>
      </div>
      {item.requiresDiesel && !retired && (
        <button onClick={e => { e.stopPropagation(); onIssueDiesel() }}
          className="shrink-0 text-[10px] font-bold px-2 py-1 rounded-full border"
          style={{ background: '#BA751718', color: '#BA7517', borderColor: '#BA751740' }}>
          ⛽ Issue Diesel
        </button>
      )}
      <ChevronRight size={16} className="shrink-0" style={{ color: 'var(--c-faint)' }} />
    </div>
  )
}

import RegisterCard from '../../components/RegisterCard'
import { CAT_EMOJI, STATUS_STYLE } from './vocab'
import { isRetired } from './assetFacts'

// A machine or a farm asset in the shared register-card shape. The figure is the
// quantity; the action is Issue Diesel for a machine that burns it, Details for
// everything else. Tapping the card body opens the detail sheet either way.
export default function AssetCard({ item, kind, onOpen, onIssueDiesel }) {
  const emoji   = CAT_EMOJI[kind === 'machinery' ? item.type : item.category] || (kind === 'machinery' ? '🔧' : '📦')
  const retired = isRetired(item)
  const status  = STATUS_STYLE[item.status] || STATUS_STYLE.in_use
  const thumb   = item.photoUrl
    ? <img src={item.photoUrl} alt="" className="w-11 h-11 rounded-xl object-cover shrink-0" />
    : <div className="w-11 h-11 rounded-xl flex items-center justify-center text-xl shrink-0" style={{ background: 'var(--c-ghost)' }}>{emoji}</div>

  return (
    <RegisterCard
      thumb={thumb}
      title={item.name}
      subline={kind === 'machinery' ? item.make : item.location}
      figure={Number(item.quantity) || 1}
      figureLabel="Qty"
      status={{ text: `● ${status.label}`, color: status.color }}
      borderColor={item.status === 'under_repair' ? '#BA751759' : undefined}
      dimmed={retired}
      onClick={() => onOpen(item)}
      action={item.requiresDiesel && !retired
        ? { label: '⛽ Issue Diesel →', onClick: onIssueDiesel, tone: 'warn' }
        : { label: '→ Details',          onClick: () => onOpen(item) }}
    />
  )
}

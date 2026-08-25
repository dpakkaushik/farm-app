// The one card shape every register in the app uses — Inventory stock today,
// Machinery and Farm Assets alongside it (owner, 25 Aug: "should look same
// across all pages"). One component, so the pages cannot drift apart:
//
//   [thumb] Title                         42   ← the one figure that matters
//           subline                      unit
//                                   ● status
//   [ ──────────── action ──────────── ]
//
// Pages only decide WHAT goes in each slot; the layout is decided here.
export default function RegisterCard({
  thumb,            // optional node on the left of the title (photo / emoji tile)
  title,
  subline,          // optional muted line under the title
  figure,           // the big number on the right
  figureColor,      // colour for that number; defaults to text colour
  figureLabel,      // small line under the figure ("ltr", "Qty")
  status,           // optional { text, color } — one coloured line under the label
  action,           // optional { label, onClick, disabled, tone: 'primary' | 'warn' }
  onClick,          // tapping the card body (buttons inside stop propagation)
  borderColor,      // override for the card border (low / out / repair tints)
  dimmed,           // retired items fade
}) {
  const tone = action?.tone === 'warn'
    ? { background: '#BA751718', borderColor: '#BA751740', color: '#BA7517' }
    : { background: '#8A9A5B18', borderColor: '#8A9A5B40', color: '#8A9A5B' }
  return (
    <div onClick={onClick}
      className={`rounded-2xl border p-4 transition-colors ${onClick ? 'cursor-pointer active:bg-[var(--c-ghost)]' : ''}`}
      style={{ background: 'var(--c-nav)', borderColor: borderColor || 'var(--c-border)', opacity: dimmed ? 0.6 : 1 }}>
      <div className={`flex items-start justify-between gap-3 ${action ? 'mb-3' : ''}`}>
        <div className="flex items-center gap-3 min-w-0">
          {thumb}
          <div className="min-w-0">
            <p className="text-sm font-semibold truncate" style={{ color: 'var(--c-text)' }}>{title}</p>
            {subline && <p className="text-[10px] mt-0.5 truncate" style={{ color: 'var(--c-muted)' }}>{subline}</p>}
          </div>
        </div>
        <div className="text-right shrink-0">
          <p className="text-2xl font-bold leading-none tabular-nums" style={{ color: figureColor || 'var(--c-text)' }}>{figure}</p>
          {figureLabel && <p className="text-[10px] mt-0.5" style={{ color: 'var(--c-faint)' }}>{figureLabel}</p>}
          {status && <p className="text-[10px] font-semibold" style={{ color: status.color }}>{status.text}</p>}
        </div>
      </div>
      {action && (
        <button onClick={e => { e.stopPropagation(); action.onClick() }} disabled={action.disabled}
          className="w-full py-2 text-xs font-semibold rounded-xl border flex items-center justify-center gap-1 disabled:opacity-30"
          style={tone}>
          {action.label}
        </button>
      )}
    </div>
  )
}

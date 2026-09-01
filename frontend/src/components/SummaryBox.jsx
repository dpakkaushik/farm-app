import React from 'react'

// The one summary container for a register or a log: what the list adds up to,
// with the list's own icon actions (filter, download) INSIDE the box rather than
// strung out in a row beside it.
//
// Owner, 26 Aug, pointing at Purchase History: "i need this kind of box, remove
// new bill create a box and Amount Download and filter inside that box" — then
// the same for the Machinery and Assets registers, whose figure was a thin muted
// line ("current value/amount is small").
//
// This is the page-level total, and the only place money is allowed to shout.
// Register CARDS still lead with quantity (his 25-Aug call) — a book value on
// every card read as money coming in. Any new register or log head uses this.
//
//   label   — what the figure is ("Total (6 rows)")
//   value   — the figure itself, already formatted
//   tone    — accent hex; tints the background, border and figure
//   meta    — extra facts under the figure: { label?, value, color? }, falsy skipped
//   side    — the same facts, but as a right-aligned column beside the figure
//             (owner, 27 Aug on Trees: the split reads better beside the total
//             than stacked under it)
//   actions — icon buttons inside the box: { icon, label, onClick, active }
export default function SummaryBox({
  label, value, tone = '#8A9A5B', meta = [], side = [], actions = [], className = '',
}) {
  const facts     = meta.filter(Boolean)
  const sideFacts = side.filter(Boolean)
  const acts      = actions.filter(Boolean)

  return (
    <div className={`rounded-2xl border px-4 py-3 flex items-center gap-3 ${className}`}
      style={{ background: `${tone}1A`, borderColor: `${tone}33` }}>

      <div className="min-w-0 flex-1">
        <p className="text-[12px] font-bold uppercase tracking-wide" style={{ color: 'var(--c-muted)' }}>
          {label}
        </p>
        <p className="text-xl font-bold leading-tight tabular-nums truncate" style={{ color: tone }}>
          {value}
        </p>
        {facts.map((m, i) => (
          // A labelled fact emphasises its figure ("All assets **₹10,17,000**);
          // a bare one is just a count, and stays quiet.
          <p key={i} className="text-[13px] mt-0.5 truncate" style={{ color: m.color || 'var(--c-muted)' }}>
            {m.label
              ? <>{m.label} <b style={{ color: m.color || 'var(--c-text)' }}>{m.value}</b></>
              : m.value}
          </p>
        ))}
      </div>

      {sideFacts.length > 0 && (
        <div className="shrink-0 text-right space-y-1">
          {sideFacts.map((m, i) => (
            <p key={i} className="text-xs" style={{ color: m.color || 'var(--c-muted)' }}>
              {m.label ? `${m.label} ` : ''}
              <b className="text-sm tabular-nums" style={{ color: m.color || 'var(--c-text)' }}>{m.value}</b>
            </p>
          ))}
        </div>
      )}

      {acts.length > 0 && (
        <div className="shrink-0 flex items-center gap-2">
          {acts.map(({ icon: Icon, label: name, onClick, active }) => (
            <button key={name} onClick={onClick} aria-label={name} title={name}
              className="w-9 h-9 rounded-xl border flex items-center justify-center transition-colors"
              style={active
                ? { background: tone, borderColor: tone, color: '#fff' }
                : { background: 'var(--c-nav)', borderColor: 'var(--c-border-md)', color: 'var(--c-muted)' }}>
              <Icon size={16} />
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

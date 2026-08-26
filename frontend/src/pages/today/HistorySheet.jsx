import BottomSheet from '../../components/BottomSheet'

// The date filter on the Today feed. It used to be a collapsed panel at the
// very bottom of the page — below every day card, which is the last place
// anyone looks for "show me last month" — and it is a control beside the bell
// now (owner, 26 Aug: "History button on top as filter").
//
// Quick picks first, because that is the whole job nine times in ten; the two
// date fields are for the tenth. Purely presentational: the page owns the
// range, the fetch and what the feed then shows.
export default function HistorySheet({
  start, end, setStart, setEnd, presets, today,
  onApply, onPreset, onClear, onClose,
  loading, error, warnDays, applied,
}) {
  return (
    <BottomSheet title="History" onClose={onClose}
      footer={<>
        {applied && (
          <button onClick={onClear}
            className="px-4 py-3 rounded-xl text-sm font-semibold"
            style={{ color: 'var(--c-text)', background: 'var(--c-ghost)' }}>
            Clear
          </button>
        )}
        <button onClick={onApply} disabled={loading}
          className="flex-1 py-3 rounded-xl text-sm font-bold text-white disabled:opacity-50"
          style={{ background: '#8A9A5B' }}>
          {loading ? 'Loading…' : warnDays ? 'Show anyway' : 'Show these days'}
        </button>
      </>}>

      <div className="p-4 space-y-4 overflow-y-auto">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-wide mb-2" style={{ color: 'var(--c-faint)' }}>
            Quick pick
          </p>
          <div className="flex flex-wrap gap-2">
            {presets.map(p => (
              <button key={p.label} onClick={() => onPreset(p)}
                className="px-3 h-9 rounded-xl border text-xs font-semibold"
                style={{ background: 'var(--c-ghost)', borderColor: 'var(--c-border)', color: 'var(--c-text)' }}>
                {p.label}
              </button>
            ))}
          </div>
        </div>

        <div>
          <p className="text-[10px] font-bold uppercase tracking-wide mb-2" style={{ color: 'var(--c-faint)' }}>
            Or choose dates
          </p>
          <div className="flex items-center gap-2">
            <input type="date" value={start} max={today} onChange={e => setStart(e.target.value)}
              className="finput" style={{ colorScheme: 'dark' }} />
            <span className="text-xs shrink-0" style={{ color: 'var(--c-faint)' }}>to</span>
            <input type="date" value={end} max={today} onChange={e => setEnd(e.target.value)}
              className="finput" style={{ colorScheme: 'dark' }} />
          </div>
        </div>

        {error && <p className="text-xs text-[#E24B4A]">{error}</p>}
        {warnDays > 0 && (
          <p className="text-xs text-[#BA7517]">
            That's a {warnDays}-day range — it may take a moment to draw. Tap again to continue.
          </p>
        )}
        <p className="text-[11px] leading-snug" style={{ color: 'var(--c-faint)' }}>
          Only days with something recorded appear. The bell's calendar marks those days too.
        </p>
      </div>
    </BottomSheet>
  )
}

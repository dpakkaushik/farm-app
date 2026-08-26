import { useState } from 'react'
import { Filter, Check, X } from 'lucide-react'
import { activeCount, appliedChips, clearedValue, sanitizeDraft, valueLabel } from '../lib/filterSheet'

const SAGE = '#8A9A5B'

// ONE funnel button for a screen that narrows by several things at once — the
// sub-filters live behind it, in a sheet (owner, 26 Aug: "a zomato type of
// combined filter … when clicked sub filter will be seen"). A screen with a
// single filter still uses components/FilterSelect; this is its big brother.
//
//   groups  — the sub-filters (see lib/filterSheet.js). Pass a FUNCTION when a
//             group's options depend on another's value (Media's months live
//             inside the chosen year); it is called with the working draft.
//   value   — { [groupKey]: value }. Only replaced when Apply is pressed, so a
//             half-made choice never reshuffles the list underneath.
//   applyLabel(draft) — what the Apply button says, e.g. "Show 34 items".
export default function FilterSheet({ value, onChange, groups, applyLabel, label = 'Filter', className = '' }) {
  const [open,  setOpen]  = useState(false)
  const [draft, setDraft] = useState(value)
  const [tabKey, setTabKey] = useState(null)

  const resolve = (v) => (typeof groups === 'function' ? groups(v) : groups)

  const liveGroups  = resolve(value)
  const count       = activeCount(value, liveGroups)
  const draftGroups = resolve(draft)
  const active      = draftGroups.find(g => g.key === tabKey) || draftGroups[0]

  const openSheet = () => {
    setDraft(value)
    setTabKey(resolve(value)[0]?.key ?? null)
    setOpen(true)
  }

  // Picking inside one group can invalidate another's value — sanitize against
  // the options the new draft actually offers.
  const pick = (key, v) => setDraft(d => {
    const next = { ...d, [key]: v }
    return sanitizeDraft(next, resolve(next))
  })

  const apply = () => { onChange(draft); setOpen(false) }

  return (
    <>
      <button onClick={openSheet} aria-expanded={open}
        aria-label={count ? `${label} — ${count} applied` : label}
        className={`flex items-center gap-1.5 h-9 px-3 rounded-xl border text-xs font-semibold shrink-0 ${className}`}
        style={{
          background:  count ? `${SAGE}12` : 'var(--c-ghost)',
          borderColor: count ? `${SAGE}80` : 'var(--c-border)',
          color:       count ? SAGE : 'var(--c-text)',
        }}>
        <Filter size={13} style={{ color: count ? SAGE : 'var(--c-muted)' }} />
        {label}
        {count > 0 && (
          <span className="min-w-[16px] h-4 px-1 rounded-full text-[10px] font-bold text-white flex items-center justify-center"
            style={{ background: SAGE }}>{count}</span>
        )}
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-end justify-center" style={{ background: 'rgba(0,0,0,0.5)' }}
          onClick={() => setOpen(false)}>
          <div onClick={e => e.stopPropagation()}
            className="w-full max-w-lg rounded-t-3xl flex flex-col animate-slide-up shadow-2xl overflow-hidden"
            style={{ background: 'var(--c-nav)', height: '72vh', maxHeight: '88vh', paddingBottom: 'max(env(safe-area-inset-bottom, 0px), 12px)' }}>

            <div className="shrink-0 relative pt-2.5 pb-2">
              <div className="mx-auto w-10 h-1 rounded-full" style={{ background: 'var(--c-border)' }} />
              <p className="text-center text-sm font-bold mt-2" style={{ color: 'var(--c-text)' }}>Filters</p>
              <button onClick={() => setOpen(false)} aria-label="Close"
                className="absolute right-3 top-3 p-1.5 rounded-full" style={{ color: 'var(--c-muted)' }}>
                <X size={18} />
              </button>
            </div>

            {/* Left: what you can narrow by, with the current pick under it.
                Right: the options for whichever one is open. */}
            <div className="flex-1 flex min-h-0 border-t" style={{ borderColor: 'var(--c-border)' }}>
              <div className="w-[38%] max-w-[160px] shrink-0 overflow-y-auto no-scrollbar border-r"
                style={{ background: 'var(--c-ghost)', borderColor: 'var(--c-border)' }}>
                {draftGroups.map(g => {
                  const on   = active?.key === g.key
                  const v    = draft[g.key] ?? (g.allValue ?? 'all')
                  const set  = v !== (g.allValue ?? 'all')
                  return (
                    <button key={g.key} onClick={() => setTabKey(g.key)}
                      className="w-full text-left px-3 py-3 border-l-[3px]"
                      style={{
                        background:  on ? 'var(--c-nav)' : 'transparent',
                        borderColor: on ? SAGE : 'transparent',
                      }}>
                      <span className="text-xs font-bold" style={{ color: on ? 'var(--c-text)' : 'var(--c-muted)' }}>
                        {g.label}
                      </span>
                      {set && (
                        <p className="text-[10px] font-semibold mt-0.5 truncate" style={{ color: SAGE }}>
                          {valueLabel(g, v)}
                        </p>
                      )}
                    </button>
                  )
                })}
              </div>

              <div className="flex-1 overflow-y-auto">
                {(active?.options || []).map(([v, optLabel]) => {
                  const on = (draft[active.key] ?? (active.allValue ?? 'all')) === v
                  return (
                    <button key={v} onClick={() => pick(active.key, v)}
                      className="w-full flex items-center justify-between gap-2 px-4 py-3 text-left border-b"
                      style={{ borderColor: 'var(--c-border)', background: on ? `${SAGE}0f` : 'transparent' }}>
                      <span className="text-[13px] font-semibold truncate"
                        style={{ color: on ? SAGE : 'var(--c-text)' }}>{optLabel}</span>
                      {on && <Check size={15} className="shrink-0" style={{ color: SAGE }} />}
                    </button>
                  )
                })}
              </div>
            </div>

            <div className="shrink-0 flex gap-2 px-4 pt-3 border-t" style={{ borderColor: 'var(--c-border)' }}>
              <button onClick={() => setDraft(d => clearedValue(d, resolve(d)))}
                disabled={activeCount(draft, draftGroups) === 0}
                className="px-4 py-3 rounded-xl text-sm font-semibold disabled:opacity-40"
                style={{ color: 'var(--c-text)', background: 'var(--c-ghost)' }}>
                Clear all
              </button>
              <button onClick={apply} className="flex-1 py-3 rounded-xl text-sm font-bold text-white" style={{ background: SAGE }}>
                {applyLabel ? applyLabel(draft) : 'Apply'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

// What the sheet is currently doing to the list, said out loud — one chip per
// applied sub-filter, each tappable to drop it. Renders nothing when the list
// is whole, so an unfiltered screen carries no strip at all.
export function AppliedChips({ value, groups, onChange, className = '' }) {
  const resolved = typeof groups === 'function' ? groups(value) : groups
  const chips = appliedChips(value, resolved)
  if (chips.length === 0) return null
  return (
    <div className={`flex items-center gap-1.5 overflow-x-auto no-scrollbar ${className}`}>
      {chips.map(c => (
        <button key={c.key} onClick={() => onChange(sanitizeDraft({ ...value, [c.key]: c.allValue }, resolved))}
          aria-label={`Remove filter ${c.label}`}
          className="shrink-0 flex items-center gap-1 h-7 pl-2.5 pr-1.5 rounded-full border text-[11px] font-semibold"
          style={{ background: `${SAGE}12`, borderColor: `${SAGE}55`, color: SAGE }}>
          {c.label}<X size={11} />
        </button>
      ))}
      {chips.length > 1 && (
        <button onClick={() => onChange(clearedValue(value, resolved))}
          className="shrink-0 text-[11px] font-semibold px-2" style={{ color: 'var(--c-muted)' }}>
          Clear
        </button>
      )}
    </div>
  )
}

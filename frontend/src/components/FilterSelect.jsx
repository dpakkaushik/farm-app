import { useState } from 'react'
import { Filter, ChevronDown, Check } from 'lucide-react'
import BottomSheet from './BottomSheet'

const SAGE = '#8A9A5B'

// The one way a list narrows itself, everywhere but the Ledger (owner, 25 Aug:
// "filter should be a dropdown instead of tabs across all app screens … make
// sure it has the symbol of a filter"). A funnel, the current pick, a chevron.
// The funnel and border turn sage while a filter other than "all" is applied, so
// a narrowed list never looks like the whole list.
//
// The options open in the app's OWN sheet, not the native select list Android
// draws as a cream system dialog (owner, 2 Sep). Same sheet as SelectField, so
// every picker in the app behaves alike — and BottomSheet already traps the
// back gesture.
//
//   options: [[value, label], …] — include the "all" row yourself, first.
export default function FilterSelect({ value, onChange, options, allValue = 'all', className = '', title = 'Filter' }) {
  const [open, setOpen] = useState(false)
  const active = value !== allValue
  const current = options.find(([v]) => v === value)?.[1] ?? ''

  const pick = (v) => { setOpen(false); onChange(v) }

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} aria-expanded={open} aria-label={title}
        className={`flex items-center gap-2 rounded-xl border px-3 h-9 text-left ${className}`}
        style={{
          background:  active ? '#8A9A5B12' : 'var(--c-ghost)',
          borderColor: active ? '#8A9A5B80' : 'var(--c-border)',
        }}>
        <Filter size={13} className="shrink-0" style={{ color: active ? SAGE : 'var(--c-muted)' }} />
        <span className="flex-1 min-w-0 truncate text-xs font-semibold"
          style={{ color: active ? SAGE : 'var(--c-text)' }}>{current}</span>
        <ChevronDown size={13} className="shrink-0" style={{ color: 'var(--c-faint)' }} />
      </button>

      {open && (
        <BottomSheet title={title} onClose={() => setOpen(false)}>
          <div className="flex-1 overflow-y-auto">
            {options.map(([v, label]) => {
              const on = v === value
              return (
                <button type="button" key={v} onClick={() => pick(v)}
                  className="w-full flex items-center justify-between gap-2 px-4 py-3 text-left border-b"
                  style={{ borderColor: 'var(--c-border)', background: on ? `${SAGE}0f` : 'transparent' }}>
                  <span className="text-[13px] font-semibold truncate"
                    style={{ color: on ? SAGE : 'var(--c-text)' }}>{label}</span>
                  {on && <Check size={15} className="shrink-0" style={{ color: SAGE }} />}
                </button>
              )
            })}
          </div>
        </BottomSheet>
      )}
    </>
  )
}

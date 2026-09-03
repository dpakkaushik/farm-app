import { useState, useMemo } from 'react'
import { ChevronDown, Check } from 'lucide-react'
import BottomSheet from './BottomSheet'
import { optionsFromChildren, labelFor } from '../lib/selectOptions'

const SAGE = '#8A9A5B'

// A DROP-IN for <select>. Android draws a native select's list itself, as a
// system dialog in the phone's own colours — jarring over a dark app, and the
// owner's 2 Sep report. This keeps the same children (<option>/<optgroup>) and
// the same `onChange(e)` shape with `e.target.value`, so converting a screen is
// a one-word tag change and every call site's handler still works.
//
// The back gesture is free: the list opens in BottomSheet, which already traps
// it (see docs/HANDOFF-back-gesture.md).
//
//   <SelectField className="finput" value={v} onChange={e => set(e.target.value)}>
//     <option value="">Select…</option>
//     {rows.map(r => <option key={r.id} value={r.id}>{r.label}</option>)}
//   </SelectField>
//
// `title` names the sheet; without one it borrows the placeholder row's text.
export default function SelectField({
  value, onChange, children, className = '', style, disabled, title, placeholder, 'aria-label': ariaLabel,
}) {
  const [open, setOpen] = useState(false)
  const options = useMemo(() => optionsFromChildren(children), [children])

  const current = labelFor(options, value)
  // An unset value shows the list's own empty row ("Select worker…"); if the
  // list has none, the caller's placeholder, and failing that a bare dash.
  const shown = current || placeholder || options.find(o => o.value === '')?.label || '—'
  const sheetTitle = title || placeholder || options.find(o => o.value === '')?.label || 'Select'

  const pick = (v) => {
    setOpen(false)
    // The same shape a real select delivers, so handlers need no edit.
    onChange?.({ target: { value: v } })
  }

  return (
    <>
      <button type="button" disabled={disabled} aria-label={ariaLabel} aria-expanded={open}
        onClick={() => !disabled && setOpen(true)}
        className={`flex items-center gap-2 text-left ${className}`}
        style={{ ...style, opacity: disabled ? 0.55 : (style?.opacity ?? 1) }}>
        <span className="flex-1 min-w-0 truncate">{shown}</span>
        <ChevronDown size={13} className="shrink-0" style={{ color: 'var(--c-faint)' }} />
      </button>

      {open && (
        <BottomSheet title={sheetTitle} onClose={() => setOpen(false)}>
          <div className="flex-1 overflow-y-auto">
            {options.map((o, i) => {
              const on = o.value === String(value ?? '')
              // A group heading is drawn once, above the first row that carries it.
              const heading = o.group && o.group !== options[i - 1]?.group ? o.group : null
              return (
                <div key={`${o.group ?? ''}-${o.value}-${i}`}>
                  {heading && (
                    <p className="px-4 pt-3 pb-1 text-[12px] font-bold uppercase tracking-wide"
                      style={{ color: 'var(--c-faint)' }}>{heading}</p>
                  )}
                  <button type="button" disabled={o.disabled} onClick={() => pick(o.value)}
                    className="w-full flex items-center justify-between gap-2 px-4 py-3 text-left border-b disabled:opacity-40"
                    style={{ borderColor: 'var(--c-border)', background: on ? `${SAGE}0f` : 'transparent' }}>
                    <span className="text-[13px] font-semibold truncate"
                      style={{ color: on ? SAGE : 'var(--c-text)' }}>{o.label}</span>
                    {on && <Check size={15} className="shrink-0" style={{ color: SAGE }} />}
                  </button>
                </div>
              )
            })}
          </div>
        </BottomSheet>
      )}
    </>
  )
}

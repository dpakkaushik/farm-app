import { Filter, ChevronDown } from 'lucide-react'

// The one way a list narrows itself, everywhere but the Ledger (owner, 25 Aug:
// "filter should be a dropdown instead of tabs across all app screens … make
// sure it has the symbol of a filter"). A funnel, a native <select>, a chevron.
// The funnel and border turn sage while a filter other than "all" is applied, so
// a narrowed list never looks like the whole list.
//
//   options: [[value, label], …] — include the "all" row yourself, first.
export default function FilterSelect({ value, onChange, options, allValue = 'all', className = '' }) {
  const active = value !== allValue
  return (
    <label className={`flex items-center gap-2 rounded-xl border px-3 h-9 ${className}`}
      style={{
        background:  active ? '#8A9A5B12' : 'var(--c-ghost)',
        borderColor: active ? '#8A9A5B80' : 'var(--c-border)',
      }}>
      <Filter size={13} className="shrink-0" style={{ color: active ? '#8A9A5B' : 'var(--c-muted)' }} />
      <select value={value} onChange={e => onChange(e.target.value)}
        className="flex-1 min-w-0 bg-transparent outline-none text-xs font-semibold appearance-none"
        style={{ color: active ? '#8A9A5B' : 'var(--c-text)' }}>
        {options.map(([v, label]) => <option key={v} value={v}>{label}</option>)}
      </select>
      <ChevronDown size={13} className="shrink-0" style={{ color: 'var(--c-faint)' }} />
    </label>
  )
}

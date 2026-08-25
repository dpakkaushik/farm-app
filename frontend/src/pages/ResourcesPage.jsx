import { useState, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Package, Wrench } from 'lucide-react'
import Inventory from './Inventory'
import Assets    from './Assets'

// Expenses was the third tab here. It moved to Today, next to the day the spend
// happened — see the note on Today.jsx's shell. Resources is the two registers of
// things the farm owns; money entry is a daily act, not a register.
const TABS = [
  { key: 'inventory', label: 'Inventory', Icon: Package },
  { key: 'assets',    label: 'Assets',    Icon: Wrench  },
]

export default function ResourcesPage() {
  // ?tab=inventory|assets picks the tab from the URL — the door the Assets
  // page's "Issue Diesel" walks through while already ON /resources, where a
  // plain navigate would never remount this page.
  const [params] = useSearchParams()
  const [tab, setTab] = useState(params.get('tab') === 'assets' ? 'assets' : 'inventory')
  useEffect(() => {
    const t = params.get('tab')
    if (t === 'inventory' || t === 'assets') setTab(t)
  }, [params])

  return (
    <div className="h-full flex flex-col" style={{ background: 'var(--c-bg)' }}>

      {/* Pill-style tab switcher */}
      <div className="shrink-0 flex gap-2 px-3 py-2 border-b"
        style={{ background: 'var(--c-nav)', borderColor: 'var(--c-border)' }}>
        {TABS.map(({ key, label, Icon }) => (
          <button key={key} onClick={() => setTab(key)}
            className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-[12px] font-semibold transition-all"
            style={tab === key
              ? { background: '#8A9A5B', color: '#fff' }
              : { background: 'var(--c-ghost)', color: 'var(--c-muted)' }
            }>
            <Icon size={14} />
            {label}
          </button>
        ))}
      </div>

      <div className="flex-1 min-h-0 overflow-hidden">
        {tab === 'inventory' && <Inventory />}
        {tab === 'assets'    && <Assets />}
      </div>
    </div>
  )
}

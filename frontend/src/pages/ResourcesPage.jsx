import { useState } from 'react'
import { Package, Wrench, Receipt } from 'lucide-react'
import Inventory from './Inventory'
import Assets    from './Assets'
import Expenses  from './Expenses'

const TABS = [
  { key: 'inventory', label: 'Inventory', Icon: Package },
  { key: 'assets',    label: 'Assets',    Icon: Wrench  },
  { key: 'expenses',  label: 'Expenses',  Icon: Receipt },
]

export default function ResourcesPage() {
  const [tab, setTab] = useState('inventory')

  return (
    <div className="h-full flex flex-col" style={{ background: 'var(--c-bg)' }}>

      {/* Pill-style tab switcher */}
      <div className="shrink-0 flex gap-2 px-3 py-2 border-b"
        style={{ background: 'var(--c-nav)', borderColor: 'var(--c-border)' }}>
        {TABS.map(({ key, label, Icon }) => (
          <button key={key} onClick={() => setTab(key)}
            className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-[12px] font-semibold transition-all"
            style={tab === key
              ? { background: '#1D9E75', color: '#fff' }
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
        {tab === 'expenses'  && <Expenses />}
      </div>
    </div>
  )
}

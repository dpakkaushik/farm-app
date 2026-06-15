import { useState } from 'react'
import { Wheat, BarChart3 } from 'lucide-react'
import Harvest   from './Harvest'
import Dashboard from './Dashboard'

const TABS = [
  { key: 'harvest', label: 'Harvest', Icon: Wheat     },
  { key: 'owner',   label: 'Owner',   Icon: BarChart3 },
]

export default function ReportsPage() {
  const [tab, setTab] = useState('harvest')

  return (
    <div className="h-full flex flex-col" style={{ background: 'var(--c-bg)' }}>
      <div className="flex shrink-0 border-b" style={{ background: 'var(--c-nav)', borderColor: 'var(--c-border)' }}>
        {TABS.map(({ key, label, Icon }) => (
          <button key={key} onClick={() => setTab(key)}
            className={`flex-1 py-2.5 flex items-center justify-center gap-1.5 text-[11px] font-semibold transition-colors ${
              tab === key ? 'text-[#1D9E75] border-b-2 border-[#1D9E75]' : 'text-[var(--c-muted)]'
            }`}>
            <Icon size={14} />
            {label}
          </button>
        ))}
      </div>

      <div className="flex-1 min-h-0 overflow-hidden">
        {tab === 'harvest' && <Harvest />}
        {tab === 'owner'   && <Dashboard />}
      </div>
    </div>
  )
}

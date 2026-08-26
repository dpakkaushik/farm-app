import { useState, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Package, Wrench, Boxes } from 'lucide-react'
import Inventory from './Inventory'
import Assets    from './Assets'

// The three registers of things the farm owns, across ONE page head (owner,
// 26 Aug: "resources can be page head with inventory, assets and machinery on
// one page"). It used to be two tabs here and a second tab bar inside each —
// Inventory carried Current Stock / Purchases / Issues, Assets carried
// Machinery / Farm Assets — so every screen opened under two stacked strips of
// tabs. The two histories became buttons on Current Stock (they are reference
// reading, not the daily act) and Assets' two kinds came up here as peers.
//
// Expenses was a tab here once too; it moved to Today, next to the day the
// spend happened. Money entry is a daily act, not a register.
const TABS = [
  { key: 'inventory', label: 'Inventory', Icon: Package },
  { key: 'machinery', label: 'Machinery', Icon: Wrench  },
  { key: 'assets',    label: 'Assets',    Icon: Boxes   },
]

export default function ResourcesPage() {
  // ?tab=inventory|machinery|assets picks the tab from the URL — the door the
  // Assets page's "Issue Diesel" walks through while already ON /resources,
  // where a plain navigate would never remount this page.
  const [params] = useSearchParams()
  const fromUrl  = TABS.some(t => t.key === params.get('tab')) ? params.get('tab') : null
  const [tab, setTab] = useState(fromUrl || 'inventory')
  useEffect(() => {
    const t = params.get('tab')
    if (TABS.some(x => x.key === t)) setTab(t)
  }, [params])

  return (
    <div className="h-full flex flex-col" style={{ background: 'var(--c-bg)' }}>

      {/* Page head — one strip, three registers */}
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
        {tab === 'machinery' && <Assets kind="machinery" />}
        {tab === 'assets'    && <Assets kind="asset" />}
      </div>
    </div>
  )
}

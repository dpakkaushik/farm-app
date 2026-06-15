import { useState } from 'react'
import { Package, Wrench, Camera } from 'lucide-react'
import Inventory from './Inventory'
import Assets    from './Assets'
import Media     from './Media'

const TABS = [
  { key: 'inventory', label: 'Inventory', Icon: Package },
  { key: 'assets',    label: 'Assets',    Icon: Wrench  },
  { key: 'media',     label: 'Media',     Icon: Camera  },
]

export default function ResourcesPage({ mediaUnread = 0, onMediaViewed }) {
  const [tab, setTab] = useState('inventory')

  const handleTabClick = (key) => {
    setTab(key)
    if (key === 'media' && onMediaViewed) onMediaViewed()
  }

  return (
    <div className="h-full flex flex-col" style={{ background: 'var(--c-bg)' }}>
      <div className="flex shrink-0 border-b" style={{ background: 'var(--c-nav)', borderColor: 'var(--c-border)' }}>
        {TABS.map(({ key, label, Icon }) => (
          <button key={key} onClick={() => handleTabClick(key)}
            className={`flex-1 py-2.5 flex items-center justify-center gap-1.5 text-[11px] font-semibold transition-colors relative ${
              tab === key ? 'text-[#1D9E75] border-b-2 border-[#1D9E75]' : 'text-[var(--c-muted)]'
            }`}>
            <Icon size={14} />
            {label}
            {key === 'media' && mediaUnread > 0 && (
              <span className="absolute top-1.5 right-[calc(50%-18px)] min-w-[14px] h-[14px] bg-[#E24B4A] text-white text-[8px] font-bold rounded-full flex items-center justify-center px-0.5">
                {mediaUnread > 9 ? '9+' : mediaUnread}
              </span>
            )}
          </button>
        ))}
      </div>

      <div className="flex-1 min-h-0 overflow-hidden">
        {tab === 'inventory' && <Inventory />}
        {tab === 'assets'    && <Assets />}
        {tab === 'media'     && <Media />}
      </div>
    </div>
  )
}

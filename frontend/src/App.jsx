import React from 'react'
import { Routes, Route, Navigate, NavLink } from 'react-router-dom'
import { Map, ListChecks, Package, Wheat, BarChart3, Camera, Settings } from 'lucide-react'
import Field     from './pages/Field'
import Today     from './pages/Today'
import Inventory from './pages/Inventory'
import Harvest   from './pages/Harvest'
import Dashboard from './pages/Dashboard'
import Admin     from './pages/Admin'
import Media     from './pages/Media'

const NAV = [
  { to: '/field',     label: 'Fields',    Icon: Map        },
  { to: '/today',     label: 'Today',     Icon: ListChecks },
  { to: '/media',     label: 'Media',     Icon: Camera     },
  { to: '/inventory', label: 'Inventory', Icon: Package    },
  { to: '/harvest',   label: 'Harvest',   Icon: Wheat      },
  { to: '/owner',     label: 'Owner',     Icon: BarChart3  },
]

export default function App() {
  return (
    <div className="flex flex-col bg-[#0f1117]" style={{ height: '100dvh' }}>
      <main className="flex-1 overflow-hidden min-h-0">
        <Routes>
          <Route path="/"          element={<Navigate to="/field" replace />} />
          <Route path="/field"     element={<Field />} />
          <Route path="/today"     element={<Today />} />
          <Route path="/media"     element={<Media />} />
          <Route path="/inventory" element={<Inventory />} />
          <Route path="/harvest"   element={<Harvest />} />
          <Route path="/owner"     element={<Dashboard />} />
          <Route path="/admin"     element={<Admin />} />
          <Route path="/dashboard" element={<Navigate to="/owner" replace />} />
          <Route path="/diary"     element={<Navigate to="/today" replace />} />
        </Routes>
      </main>

      <nav className="flex shrink-0 bg-[#161a23] border-t border-white/10"
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
        {NAV.map(({ to, label, Icon }) => (
          <NavLink key={to} to={to} className="flex-1">
            {({ isActive }) => (
              <div className={`flex flex-col items-center gap-1 py-2.5 transition-colors
                ${isActive ? 'text-[#1D9E75]' : 'text-white/35'}`}>
                <Icon size={19} strokeWidth={isActive ? 2.4 : 1.7} />
                <span className="text-[8px] font-medium tracking-wide">{label}</span>
              </div>
            )}
          </NavLink>
        ))}
        <NavLink to="/admin" className="flex-none px-2">
          {({ isActive }) => (
            <div className={`flex flex-col items-center gap-1 py-2.5 ${isActive ? 'text-[#1D9E75]' : 'text-white/20'}`}>
              <Settings size={16} strokeWidth={1.5} />
              <span className="text-[8px] font-medium tracking-wide">Admin</span>
            </div>
          )}
        </NavLink>
      </nav>
    </div>
  )
}

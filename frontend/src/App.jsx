import React, { useEffect } from 'react'
import { Routes, Route, Navigate, NavLink } from 'react-router-dom'
import { useAppStore } from './store'
import { useAuthStore, isAdmin } from './store/auth'
import { Map, ListChecks, Package, Wheat, BarChart3, Users, Camera, Settings, LogOut } from 'lucide-react'
import Field     from './pages/Field'
import Today     from './pages/Today'
import Inventory from './pages/Inventory'
import Harvest   from './pages/Harvest'
import Dashboard from './pages/Dashboard'
import Admin     from './pages/Admin'
import Media     from './pages/Media'
import Labour    from './pages/Labour'
import Login     from './pages/Login'

const NAV = [
  { to: '/field',     label: 'Fields',    Icon: Map        },
  { to: '/today',     label: 'Today',     Icon: ListChecks },
  { to: '/inventory', label: 'Inventory', Icon: Package    },
  { to: '/labour',    label: 'Labour',    Icon: Users      },
  { to: '/harvest',   label: 'Harvest',   Icon: Wheat      },
  { to: '/media',     label: 'Media',     Icon: Camera     },
  { to: '/owner',     label: 'Owner',     Icon: BarChart3  },
]

function LoadingScreen() {
  return (
    <div className="min-h-screen bg-[#0f1117] flex items-center justify-center">
      <div className="text-center">
        <div className="text-4xl mb-3">🌾</div>
        <p className="text-white/30 text-sm">Loading…</p>
      </div>
    </div>
  )
}

export default function App() {
  const { user, profile, loading, init, logout } = useAuthStore()

  useEffect(() => { init() }, [])
  useEffect(() => {
    if (user) useAppStore.getState().loadAll()
  }, [user])

  if (loading) return <LoadingScreen />
  if (!user || !profile) return <Login />

  const admin = isAdmin(profile)

  return (
    <div className="flex flex-col bg-[#0f1117]" style={{ height: '100dvh' }}>
      {/* User badge */}
      <div className="shrink-0 flex items-center justify-between px-4 py-1.5 bg-[#0f1117] border-b border-white/5">
        <span className="text-[10px] text-white/30">
          {profile.full_name}
          <span className={`ml-1.5 px-1.5 py-0.5 rounded text-[9px] font-semibold ${
            admin ? 'bg-[#1D9E75]/20 text-[#1D9E75]' :
            profile.role === 'manager' ? 'bg-[#BA7517]/20 text-[#BA7517]' :
            'bg-white/10 text-white/40'
          }`}>
            {profile.role === 'view_only' ? 'View Only' : profile.role.charAt(0).toUpperCase() + profile.role.slice(1)}
          </span>
        </span>
        <button onClick={logout} className="flex items-center gap-1 text-[10px] text-white/25 hover:text-white/60 transition-colors">
          <LogOut size={11} /> Sign out
        </button>
      </div>

      <main className="flex-1 overflow-hidden min-h-0">
        <Routes>
          <Route path="/"          element={<Navigate to="/field" replace />} />
          <Route path="/field"     element={<Field />} />
          <Route path="/today"     element={<Today />} />
          <Route path="/inventory" element={<Inventory />} />
          <Route path="/labour"    element={<Labour />} />
          <Route path="/harvest"   element={<Harvest />} />
          <Route path="/owner"     element={<Dashboard />} />
          <Route path="/media"     element={<Media />} />
          <Route path="/admin"     element={admin ? <Admin /> : <Navigate to="/field" replace />} />
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
        {admin && (
          <NavLink to="/admin" className="flex-none px-2">
            {({ isActive }) => (
              <div className={`flex flex-col items-center gap-1 py-2.5 ${isActive ? 'text-[#1D9E75]' : 'text-white/20'}`}>
                <Settings size={16} strokeWidth={1.5} />
                <span className="text-[8px] font-medium tracking-wide">Admin</span>
              </div>
            )}
          </NavLink>
        )}
      </nav>
    </div>
  )
}

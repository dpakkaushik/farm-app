import React, { useEffect, useState } from 'react'
import { Routes, Route, Navigate, NavLink, useLocation } from 'react-router-dom'
import { useAppStore } from './store'
import { useAuthStore, isAdmin } from './store/auth'
import { useThemeStore } from './store/theme'
import { Map, ListChecks, Package, BarChart3, Users, Settings, LogOut, Sun, Moon } from 'lucide-react'
import Field         from './pages/Field'
import Today         from './pages/Today'
import Labour        from './pages/Labour'
import Admin         from './pages/Admin'
import Login         from './pages/Login'
import ResourcesPage from './pages/ResourcesPage'
import ReportsPage   from './pages/ReportsPage'

const NAV = [
  { to: '/field',     label: 'Fields',    Icon: Map        },
  { to: '/today',     label: 'Today',     Icon: ListChecks },
  { to: '/resources', label: 'Resources', Icon: Package    },
  { to: '/labour',    label: 'People',    Icon: Users      },
  { to: '/reports',   label: 'Reports',   Icon: BarChart3  },
]

function LoadingScreen() {
  return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--c-bg)' }}>
      <div className="text-center">
        <div className="text-4xl mb-3">🌾</div>
        <p className="text-sm" style={{ color: 'var(--c-faint)' }}>Loading…</p>
      </div>
    </div>
  )
}

export default function App() {
  const { user, profile, loading, init, logout } = useAuthStore()
  const { mediaItems } = useAppStore()
  const { theme, toggle } = useThemeStore()
  const location = useLocation()
  const [mediaUnread, setMediaUnread] = useState(0)

  useEffect(() => { init() }, [])
  useEffect(() => { if (user) useAppStore.getState().loadAll() }, [user])

  useEffect(() => {
    if (!mediaItems.length) return
    const seen = parseInt(localStorage.getItem('mediaSeenCount') || '0')
    setMediaUnread(Math.max(0, mediaItems.length - seen))
  }, [mediaItems])

  const handleMediaViewed = () => {
    localStorage.setItem('mediaSeenCount', String(mediaItems.length))
    setMediaUnread(0)
  }

  useEffect(() => {
    if (location.pathname === '/resources') handleMediaViewed()
  }, [location.pathname])

  if (loading) return <LoadingScreen />
  if (!user || !profile) return <Login />

  const admin = isAdmin(profile)
  const isDark = theme === 'dark'

  return (
    <div className="flex flex-col" style={{ height: '100dvh', background: 'var(--c-bg)' }}>

      {/* User badge + theme toggle */}
      <div className="shrink-0 flex items-center justify-between px-4 py-1.5 border-b"
        style={{ background: 'var(--c-nav)', borderColor: 'var(--c-border)' }}>
        <span className="text-[10px]" style={{ color: 'var(--c-faint)' }}>
          {profile.full_name}
          <span className={`ml-1.5 px-1.5 py-0.5 rounded text-[9px] font-semibold ${
            admin ? 'bg-[#1D9E75]/20 text-[#1D9E75]' :
            profile.role === 'manager' ? 'bg-[#BA7517]/20 text-[#BA7517]' :
            'bg-black/10 text-[--c-muted]'
          }`}>
            {profile.role === 'view_only' ? 'View Only' : profile.role.charAt(0).toUpperCase() + profile.role.slice(1)}
          </span>
        </span>
        <div className="flex items-center gap-3">
          <button onClick={toggle}
            className="flex items-center justify-center w-7 h-7 rounded-full transition-colors"
            style={{ background: 'var(--c-ghost)', color: 'var(--c-muted)' }}>
            {isDark ? <Sun size={13} /> : <Moon size={13} />}
          </button>
          <button onClick={logout}
            className="flex items-center gap-1 text-[10px] transition-colors"
            style={{ color: 'var(--c-faint)' }}>
            <LogOut size={11} /> Sign out
          </button>
        </div>
      </div>

      <main className="flex-1 overflow-hidden min-h-0">
        <Routes>
          <Route path="/"           element={<Navigate to="/field" replace />} />
          <Route path="/field"      element={<Field />} />
          <Route path="/today"      element={<Today />} />
          <Route path="/resources"  element={<ResourcesPage mediaUnread={mediaUnread} onMediaViewed={handleMediaViewed} />} />
          <Route path="/labour"     element={<Labour />} />
          <Route path="/reports"    element={<ReportsPage />} />
          <Route path="/admin"      element={admin ? <Admin /> : <Navigate to="/field" replace />} />
          {/* legacy redirects */}
          <Route path="/inventory"  element={<Navigate to="/resources" replace />} />
          <Route path="/assets"     element={<Navigate to="/resources" replace />} />
          <Route path="/media"      element={<Navigate to="/resources" replace />} />
          <Route path="/harvest"    element={<Navigate to="/reports" replace />} />
          <Route path="/owner"      element={<Navigate to="/reports" replace />} />
          <Route path="/dashboard"  element={<Navigate to="/reports" replace />} />
          <Route path="/diary"      element={<Navigate to="/today" replace />} />
        </Routes>
      </main>

      <nav className="flex shrink-0 border-t"
        style={{ background: 'var(--c-nav)', borderColor: 'var(--c-border)', paddingBottom: 'env(safe-area-inset-bottom)' }}>
        {NAV.map(({ to, label, Icon }) => (
          <NavLink key={to} to={to} className="flex-1">
            {({ isActive }) => (
              <div className={`flex flex-col items-center gap-1 py-2.5 transition-colors`}
                style={{ color: isActive ? '#1D9E75' : 'var(--c-faint)' }}>
                <div className="relative">
                  <Icon size={19} strokeWidth={isActive ? 2.4 : 1.7} />
                  {to === '/resources' && mediaUnread > 0 && (
                    <span className="absolute -top-1.5 -right-1.5 min-w-[14px] h-[14px] bg-[#E24B4A] text-white text-[8px] font-bold rounded-full flex items-center justify-center px-0.5">
                      {mediaUnread > 9 ? '9+' : mediaUnread}
                    </span>
                  )}
                </div>
                <span className="text-[8px] font-medium tracking-wide">{label}</span>
              </div>
            )}
          </NavLink>
        ))}
        {admin && (
          <NavLink to="/admin" className="flex-none px-2">
            {({ isActive }) => (
              <div className="flex flex-col items-center gap-1 py-2.5"
                style={{ color: isActive ? '#1D9E75' : 'var(--c-faint)' }}>
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

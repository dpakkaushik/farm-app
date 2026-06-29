import React, { useEffect, useState } from 'react'
import { Routes, Route, Navigate, NavLink, useLocation } from 'react-router-dom'
import { useAppStore } from './store'
import { useAuthStore, isAdmin, isManager } from './store/auth'
import { useThemeStore } from './store/theme'
import { Map, ListChecks, Package, BarChart3, Users, Camera, Settings, LogOut, Sun, Moon, Bird, BookOpen, Shield } from 'lucide-react'

import Field         from './pages/Field'
import Today         from './pages/Today'
import Labour        from './pages/Labour'
import Admin         from './pages/Admin'
import Media         from './pages/Media'
import Login         from './pages/Login'
import ResourcesPage from './pages/ResourcesPage'
import ReportsPage   from './pages/ReportsPage'
import Livestock     from './pages/Livestock'
import LedgerPage    from './pages/LedgerPage'
import FarmOnboarding from './pages/FarmOnboarding'
import FarmSettings  from './pages/FarmSettings'
import AcceptInvite  from './pages/AcceptInvite'
import SuperAdmin    from './pages/SuperAdmin'
import FarmSwitcher  from './components/FarmSwitcher'

const NAV = [
  { to: '/field',     label: 'Fields',    Icon: Map        },
  { to: '/today',     label: 'Today',     Icon: ListChecks },
  { to: '/resources', label: 'Resources', Icon: Package    },
  { to: '/labour',    label: 'People',    Icon: Users      },
  { to: '/livestock', label: 'Livestock', Icon: Bird       },
  { to: '/ledger',    label: 'Ledger',    Icon: BookOpen   },
  { to: '/reports',   label: 'Reports',   Icon: BarChart3  },
  { to: '/media',     label: 'Media',     Icon: Camera     },
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
  const { user, profile, loading, farms, activeFarmId, activeFarm, init, logout } = useAuthStore()
  // Compute role directly — Zustand getters don't survive set() shallow-merge
  const activeFarmRole = farms.find(f => f.farm_id === activeFarmId)?.role || null
  const { mediaItems } = useAppStore()
  const { theme, toggle } = useThemeStore()
  const location = useLocation()
  const [mediaUnread, setMediaUnread] = useState(0)

  useEffect(() => { init() }, [])

  useEffect(() => {
    if (user && activeFarmId) useAppStore.getState().loadAll()
  }, [user, activeFarmId])

  useEffect(() => {
    if (!mediaItems.length) return
    const seen = parseInt(localStorage.getItem('mediaSeenCount') || '0')
    setMediaUnread(Math.max(0, mediaItems.length - seen))
  }, [mediaItems])

  useEffect(() => {
    if (location.pathname === '/media') {
      localStorage.setItem('mediaSeenCount', String(mediaItems.length))
      setMediaUnread(0)
    }
  }, [location.pathname])

  // Public route — handle before auth check
  if (location.pathname.startsWith('/invite/')) {
    if (!user) return <Login />
    return <AcceptInvite />
  }

  if (loading) return <LoadingScreen />
  if (!user || !profile) return <Login />

  // New user — no farms yet → onboarding
  if (farms.length === 0) return <FarmOnboarding />

  const role    = activeFarmRole            // 'admin' | 'manager' | 'view_only'
  const admin   = isAdmin(role)
  const manager = isManager(role)
  const isDark  = theme === 'dark'

  // Farm name + ID for the top bar
  const farmName  = activeFarm?.farm_name   || 'My Farm'
  const farmAcres = activeFarm?.total_acres || 0

  return (
    <div className="flex flex-col" style={{ height: '100dvh', background: 'var(--c-bg)' }}>

      {/* Top bar — FarmSwitcher left, controls right */}
      <div className="shrink-0 flex items-center justify-between px-3 py-1.5 border-b"
        style={{ background: '#1D9E75', borderColor: 'rgba(255,255,255,0.15)' }}>

        {/* Left: Farm switcher shows farm name + acres */}
        <FarmSwitcher />

        {/* Right: settings, super admin, theme, sign out */}
        <div className="flex items-center gap-2">
          {/* Farm Settings (admin only) */}
          {admin && (
            <NavLink to="/settings" title="Farm Settings">
              {({ isActive }) => (
                <div className="flex items-center justify-center w-7 h-7 rounded-full transition-colors"
                  style={{ background: isActive ? 'rgba(255,255,255,0.25)' : 'rgba(255,255,255,0.12)', color: '#fff' }}>
                  <Settings size={13} />
                </div>
              )}
            </NavLink>
          )}

          {/* Super Admin (platform admin only) */}
          {profile?.is_super_admin && (
            <NavLink to="/super-admin" title="Super Admin">
              {({ isActive }) => (
                <div className="flex items-center justify-center w-7 h-7 rounded-full transition-colors"
                  style={{ background: isActive ? 'rgba(255,255,255,0.25)' : 'rgba(255,255,255,0.12)', color: '#fff' }}>
                  <Shield size={13} />
                </div>
              )}
            </NavLink>
          )}

          <button onClick={toggle}
            className="flex items-center justify-center w-7 h-7 rounded-full transition-colors"
            style={{ background: 'rgba(255,255,255,0.12)', color: '#fff' }}
            title="Toggle theme">
            {isDark ? <Sun size={13} /> : <Moon size={13} />}
          </button>

          <button onClick={logout}
            className="flex items-center justify-center w-7 h-7 rounded-full transition-colors"
            style={{ background: 'rgba(255,255,255,0.12)', color: '#fff' }}
            title="Sign out">
            <LogOut size={13} />
          </button>
        </div>
      </div>

      <main className="flex-1 overflow-hidden min-h-0">
        <Routes>
          <Route path="/"             element={<Navigate to="/field" replace />} />
          <Route path="/field"        element={<Field />} />
          <Route path="/today"        element={<Today />} />
          <Route path="/resources"    element={<ResourcesPage />} />
          <Route path="/labour"       element={<Labour />} />
          <Route path="/reports"      element={<ReportsPage />} />
          <Route path="/livestock"    element={<Livestock />} />
          <Route path="/ledger"       element={<LedgerPage />} />
          <Route path="/media"        element={<Media />} />
          <Route path="/settings"     element={admin ? <FarmSettings /> : <Navigate to="/field" replace />} />
          <Route path="/super-admin"  element={profile?.is_super_admin ? <SuperAdmin /> : <Navigate to="/field" replace />} />
          <Route path="/admin"        element={admin ? <Admin /> : <Navigate to="/field" replace />} />
          {/* Legacy redirects */}
          <Route path="/inventory"    element={<Navigate to="/resources" replace />} />
          <Route path="/assets"       element={<Navigate to="/resources" replace />} />
          <Route path="/harvest"      element={<Navigate to="/reports" replace />} />
          <Route path="/owner"        element={<Navigate to="/reports" replace />} />
          <Route path="/dashboard"    element={<Navigate to="/reports" replace />} />
          <Route path="/diary"        element={<Navigate to="/today" replace />} />
        </Routes>
      </main>

      {/* Bottom nav — manager+ tabs only */}
      {manager && (
        <nav className="flex shrink-0 border-t"
          style={{ background: 'var(--c-nav)', borderColor: 'var(--c-border)', paddingBottom: 'env(safe-area-inset-bottom)' }}>
          {NAV.map(({ to, label, Icon }) => (
            <NavLink key={to} to={to} className="flex-1">
              {({ isActive }) => (
                <div className="flex flex-col items-center gap-1 py-2.5 transition-colors"
                  style={{ color: isActive ? '#1D9E75' : 'var(--c-faint)' }}>
                  <div className="relative">
                    <Icon size={19} strokeWidth={isActive ? 2.4 : 1.7} />
                    {to === '/media' && mediaUnread > 0 && (
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
      )}

      {/* View-only: minimal read-only nav */}
      {!manager && (
        <nav className="flex shrink-0 border-t"
          style={{ background: 'var(--c-nav)', borderColor: 'var(--c-border)', paddingBottom: 'env(safe-area-inset-bottom)' }}>
          {[NAV[0], NAV[6], NAV[7]].map(({ to, label, Icon }) => (
            <NavLink key={to} to={to} className="flex-1">
              {({ isActive }) => (
                <div className="flex flex-col items-center gap-1 py-2.5"
                  style={{ color: isActive ? '#1D9E75' : 'var(--c-faint)' }}>
                  <Icon size={19} strokeWidth={isActive ? 2.4 : 1.7} />
                  <span className="text-[8px] font-medium tracking-wide">{label}</span>
                </div>
              )}
            </NavLink>
          ))}
        </nav>
      )}
    </div>
  )
}

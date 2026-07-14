import React, { useEffect, useState } from 'react'
import { Routes, Route, Navigate, NavLink, useLocation } from 'react-router-dom'
import { useAppStore } from './store'
import { useAuthStore, isAdmin } from './store/auth'
import { Map, ListChecks, Camera, BookOpen } from 'lucide-react'

import Field         from './pages/Field'
import Today         from './pages/Today'
import Labour        from './pages/Labour'
import Admin         from './pages/Admin'
import Media         from './pages/Media'
import Login         from './pages/Login'
import ResourcesPage from './pages/ResourcesPage'
import Harvest       from './pages/Harvest'
import Dashboard     from './pages/Dashboard'
import Livestock     from './pages/Livestock'
import Trees         from './pages/Trees'
import LedgerPage    from './pages/LedgerPage'
import FarmOnboarding from './pages/FarmOnboarding'
import FarmSettings  from './pages/FarmSettings'
import AcceptInvite  from './pages/AcceptInvite'
import Profile       from './pages/Profile'
import ResetPassword from './pages/ResetPassword'
import SuperAdmin    from './pages/SuperAdmin'
import ProfileMenu   from './components/ProfileMenu'

const NAV = [
  { to: '/field', label: 'Fields', Icon: Map        },
  { to: '/today', label: 'Today',  Icon: ListChecks },
  { to: '/ledger',label: 'Ledger', Icon: BookOpen   },
  { to: '/media', label: 'Media',  Icon: Camera     },
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
  const { user, profile, loading, farms, activeFarmId, onboarding, init } = useAuthStore()
  // Compute role directly — Zustand getters don't survive set() shallow-merge
  const activeFarmRole = farms.find(f => f.farm_id === activeFarmId)?.role || null
  const { mediaItems } = useAppStore()
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

  // Invite route — must come before auth & onboarding guards
  // New users who click a magic link arrive here with 0 farms — show AcceptInvite, not FarmOnboarding
  // Must be rendered via <Route> so AcceptInvite's useParams() can read :token
  if (location.pathname.startsWith('/invite/')) {
    return (
      <Routes>
        <Route path="/invite/:token" element={<AcceptInvite />} />
      </Routes>
    )
  }

  // Password reset — must come before the auth & profile guards.
  // The recovery link establishes a session, so without this the user would be
  // let straight into the app (or captured by the profile gate) and never get
  // the chance to actually set a new password.
  if (location.pathname.startsWith('/reset-password')) {
    return <ResetPassword />
  }

  if (loading) return <LoadingScreen />
  if (!user || !profile) return <Login />

  // Invited users arrive with only an email — no name, no mobile. Ask once,
  // before they can enter, so their name (not their email) appears on the
  // activity they log. Catches anyone who slipped in without a profile too.
  if (!profile.full_name || !profile.phone) return <Profile mustComplete />

  // New user — no farms yet → onboarding. `onboarding` keeps the wizard on screen
  // after the farm is created (farms.length becomes 1) so it can go on to plots.
  if (farms.length === 0 || onboarding) return <FarmOnboarding />

  const role  = activeFarmRole            // 'admin' | 'manager' | 'view_only'
  const admin = isAdmin(role)

  return (
    <div className="flex flex-col" style={{ height: '100dvh', background: 'var(--c-bg)' }}>

      {/* Top bar — profile menu only; farm switching, admin, theme, logout all live in its drawer */}
      <div className="shrink-0 flex items-center px-3 py-1.5 border-b"
        style={{ background: '#1D9E75', borderColor: 'rgba(255,255,255,0.15)',
                 paddingTop: 'calc(0.375rem + env(safe-area-inset-top, 0px))' }}>
        <ProfileMenu />
      </div>

      <main className="flex-1 overflow-hidden min-h-0">
        <Routes>
          <Route path="/"             element={<Navigate to="/field" replace />} />
          <Route path="/field"        element={<Field />} />
          <Route path="/today"        element={<Today />} />
          <Route path="/resources"    element={<ResourcesPage />} />
          <Route path="/labour"       element={<Labour />} />
          <Route path="/harvest"      element={<Harvest />} />
          <Route path="/reports"      element={<Dashboard />} />
          <Route path="/livestock"    element={<Livestock />} />
          <Route path="/trees"        element={<Trees />} />
          <Route path="/ledger"       element={<LedgerPage />} />
          <Route path="/media"        element={<Media />} />
          <Route path="/profile"      element={<Profile />} />
          <Route path="/settings"     element={admin ? <FarmSettings /> : <Navigate to="/field" replace />} />
          <Route path="/super-admin"  element={profile?.is_super_admin ? <SuperAdmin /> : <Navigate to="/field" replace />} />
          <Route path="/admin"        element={admin ? <Admin /> : <Navigate to="/field" replace />} />
          {/* Legacy redirects */}
          <Route path="/inventory"    element={<Navigate to="/resources" replace />} />
          <Route path="/assets"       element={<Navigate to="/resources" replace />} />
          <Route path="/owner"        element={<Navigate to="/reports" replace />} />
          <Route path="/dashboard"    element={<Navigate to="/reports" replace />} />
          <Route path="/diary"        element={<Navigate to="/today" replace />} />
        </Routes>
      </main>

      {/* Bottom nav — same 4 tabs for every role; everything else lives in the profile drawer */}
      <nav className="flex shrink-0 border-t"
        style={{ background: 'var(--c-nav)', borderColor: 'var(--c-border)',
                 paddingBottom: 'max(env(safe-area-inset-bottom, 0px), 6px)' }}>
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
      </nav>
    </div>
  )
}

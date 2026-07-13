import { useState, useRef, useEffect } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { X, Database, Settings, Shield, Package, Users, Bird, TreePine, BarChart3, Sun, Moon, LogOut, Pencil, Check, Info, LifeBuoy } from 'lucide-react'
import { useAuthStore, isAdmin, isManager } from '../store/auth'
import { useThemeStore } from '../store/theme'
import ManageFarmsModal from './ManageFarmsModal'
import AboutModal from './AboutModal'

const SUPPORT_EMAIL = 'deepakkaushik@pallitrans.com'

const NAV_ITEMS = [
  { to: '/resources', label: 'Resources', Icon: Package    },
  { to: '/labour',     label: 'People',    Icon: Users      },
  { to: '/livestock',  label: 'Livestock', Icon: Bird       },
  { to: '/trees',      label: 'Trees',     Icon: TreePine   },
  { to: '/reports',    label: 'Reports',   Icon: BarChart3  },
]

function Row({ icon: Icon, label, sub, onClick, active, danger }) {
  return (
    <button onClick={onClick}
      className="w-full flex items-center gap-3 px-5 py-3 text-left transition-colors"
      style={{
        background: active ? 'var(--c-ghost)' : 'transparent',
        borderLeft: active ? '3px solid #1D9E75' : '3px solid transparent',
      }}>
      <Icon size={17} style={{ color: danger ? '#E24B4A' : active ? '#1D9E75' : 'var(--c-muted)' }} />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold truncate" style={{ color: danger ? '#E24B4A' : active ? '#1D9E75' : 'var(--c-text)' }}>{label}</p>
        {sub && <p className="text-[11px] truncate" style={{ color: 'var(--c-faint)' }}>{sub}</p>}
      </div>
    </button>
  )
}

function SectionLabel({ children }) {
  return (
    <p className="px-5 pt-3 pb-1 text-[10px] font-bold uppercase tracking-widest" style={{ color: 'var(--c-faint)' }}>
      {children}
    </p>
  )
}

export default function ProfileMenu() {
  const [open, setOpen] = useState(false)
  const [showManage, setShowManage] = useState(false)
  const [showAbout, setShowAbout] = useState(false)
  const ref = useRef(null)
  const navigate = useNavigate()
  const location = useLocation()

  const { profile, farms, activeFarmId, switchFarm, logout } = useAuthStore()
  const { theme, toggle } = useThemeStore()
  // Compute role directly — Zustand getters don't survive set() shallow-merge
  const activeFarmRole = farms.find(f => f.farm_id === activeFarmId)?.role || null
  const admin   = isAdmin(activeFarmRole)
  const manager = isManager(activeFarmRole)
  const isDark  = theme === 'dark'

  useEffect(() => {
    const onMouseDown = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    const onKeyDown   = (e) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', onMouseDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('mousedown', onMouseDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [])

  const go = (path) => { navigate(path); setOpen(false) }
  const initial = (profile?.full_name || profile?.email || '?')[0].toUpperCase()

  return (
    <div ref={ref}>
      <button onClick={() => setOpen(o => !o)}
        className="w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm shrink-0"
        style={{ background: 'rgba(255,255,255,0.2)', color: '#fff' }}>
        {initial}
      </button>

      {/* Scrim */}
      <div
        className={`fixed inset-0 z-[60] transition-opacity duration-300 ease-out ${open ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'}`}
        style={{ background: 'rgba(0,0,0,0.5)' }}
        onClick={() => setOpen(false)}
      />

      {/* Sliding drawer */}
      <div
        className={`fixed top-0 bottom-0 left-0 z-[61] flex flex-col transition-transform duration-300 ease-out ${open ? 'translate-x-0' : '-translate-x-full'}`}
        style={{ width: '85%', maxWidth: '340px', background: 'var(--c-nav)',
                 paddingTop: 'env(safe-area-inset-top, 0px)' }}>

        {/* Header */}
        <div className="shrink-0 flex items-start justify-between px-5 pt-5 pb-4 border-b" style={{ borderColor: 'var(--c-border-md)' }}>
          <button onClick={() => go('/profile')} className="flex items-center gap-3 min-w-0 text-left">
            <div className="w-11 h-11 rounded-full flex items-center justify-center font-bold text-lg shrink-0 overflow-hidden"
              style={{ background: '#1D9E75', color: '#fff' }}>
              {profile?.avatar_url
                ? <img src={profile.avatar_url} alt="" className="w-full h-full object-cover" />
                : initial}
            </div>
            <div className="min-w-0">
              <p className="text-sm font-bold truncate" style={{ color: 'var(--c-text)' }}>{profile?.full_name || 'You'}</p>
              <p className="text-[11px] truncate" style={{ color: 'var(--c-muted)' }}>{profile?.email}</p>
              <p className="text-[10px] mt-0.5" style={{ color: '#1D9E75' }}>Edit profile →</p>
            </div>
          </button>
          <button onClick={() => setOpen(false)}
            className="w-7 h-7 flex items-center justify-center rounded-full shrink-0"
            style={{ color: 'var(--c-muted)' }}>
            <X size={16} />
          </button>
        </div>

        {/* Scrollable middle content */}
        <div className="flex-1 overflow-y-auto">

          <SectionLabel>Your Farms</SectionLabel>
          {farms.map(f => (
            <button key={f.farm_id} onClick={() => { switchFarm(f.farm_id); setOpen(false) }}
              className="w-full flex items-center gap-3 px-5 py-2.5 text-left">
              <div className="w-8 h-8 rounded-lg flex items-center justify-center text-sm shrink-0" style={{ background: '#1D9E7520' }}>🌾</div>
              <div className="flex-1 min-w-0">
                <p className="text-[13px] font-semibold truncate" style={{ color: 'var(--c-text)' }}>{f.farm_name}</p>
                <p className="text-[11px]" style={{ color: 'var(--c-faint)' }}>
                  {f.total_acres ? `${f.total_acres} acres · ` : ''}{f.role}
                </p>
              </div>
              {f.farm_id === activeFarmId && <Check size={15} style={{ color: '#1D9E75' }} />}
            </button>
          ))}
          <Row icon={Pencil} label="Manage Farms" sub="Edit, add or delete a farm"
            onClick={() => { setShowManage(true); setOpen(false) }} />

          <div className="my-2 border-t" style={{ borderColor: 'var(--c-border-md)' }} />

          <SectionLabel>Navigate</SectionLabel>
          {NAV_ITEMS.filter(item => item.to === '/reports' || manager).map(({ to, label, Icon }) => (
            <Row key={to} icon={Icon} label={label} onClick={() => go(to)} active={location.pathname === to} />
          ))}

          {admin && (
            <>
              <div className="my-2 border-t" style={{ borderColor: 'var(--c-border-md)' }} />
              <SectionLabel>Admin</SectionLabel>
              <Row icon={Database} label="Farm Masters" sub="Crops, inventory, plots…"
                onClick={() => go('/admin')} active={location.pathname === '/admin'} />
              <Row icon={Settings} label="Farm Settings" sub="Members, roles, farm info"
                onClick={() => go('/settings')} active={location.pathname === '/settings'} />
              {profile?.is_super_admin && (
                <Row icon={Shield} label="Super Admin" sub="All farms & users"
                  onClick={() => go('/super-admin')} active={location.pathname === '/super-admin'} />
              )}
            </>
          )}

          <div className="my-2 border-t" style={{ borderColor: 'var(--c-border-md)' }} />

          <SectionLabel>Preferences</SectionLabel>
          <Row icon={isDark ? Sun : Moon} label={isDark ? 'Light Mode' : 'Dark Mode'} onClick={toggle} />

          <div className="my-2 border-t" style={{ borderColor: 'var(--c-border-md)' }} />

          <SectionLabel>Support</SectionLabel>
          <Row icon={Info} label="About" onClick={() => { setShowAbout(true); setOpen(false) }} />
          <Row icon={LifeBuoy} label="Help & Support" sub="Reach out to the app team"
            onClick={() => { window.location.href = `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent('Farm Manager — help request')}` }} />
        </div>

        {/* Logout — pinned to bottom */}
        <div className="shrink-0 border-t" style={{ borderColor: 'var(--c-border-md)', paddingBottom: 'env(safe-area-inset-bottom)' }}>
          <Row icon={LogOut} label="Log out" onClick={() => { logout(); setOpen(false) }} danger />
        </div>
      </div>

      {showManage && <ManageFarmsModal onClose={() => setShowManage(false)} />}
      {showAbout && <AboutModal onClose={() => setShowAbout(false)} />}
    </div>
  )
}

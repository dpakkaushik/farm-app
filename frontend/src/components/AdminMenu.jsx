import { useState, useRef, useEffect } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { Settings, Database, Shield, ChevronDown } from 'lucide-react'
import { useAuthStore } from '../store/auth'

function MenuItem({ icon: Icon, label, sub, onClick, active }) {
  return (
    <button onClick={onClick} style={{
      width: '100%', display: 'flex', alignItems: 'center', gap: '10px',
      padding: '10px 14px', border: 'none', textAlign: 'left', cursor: 'pointer',
      background: active ? '#f0fdf4' : '#fff',
      borderLeft: active ? '3px solid #1D9E75' : '3px solid transparent',
    }}>
      <Icon size={15} color={active ? '#1D9E75' : '#6b7280'} />
      <div>
        <div style={{ fontSize: '13px', fontWeight: 600, color: active ? '#1D9E75' : '#111827' }}>{label}</div>
        <div style={{ fontSize: '11px', color: '#9ca3af', marginTop: '1px' }}>{sub}</div>
      </div>
    </button>
  )
}

export default function AdminMenu() {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  const navigate = useNavigate()
  const location = useLocation()
  const { profile } = useAuthStore()

  const isActive = ['/admin', '/settings', '/super-admin'].includes(location.pathname)

  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const go = (path) => { navigate(path); setOpen(false) }

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          display: 'flex', alignItems: 'center', gap: '4px',
          padding: '5px 10px', borderRadius: '8px', border: 'none',
          background: isActive ? 'rgba(255,255,255,0.25)' : 'rgba(255,255,255,0.12)',
          color: '#fff', fontSize: '12px', fontWeight: 600, cursor: 'pointer',
        }}
      >
        <Settings size={13} />
        Admin
        <ChevronDown size={11} style={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }} />
      </button>

      {open && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 6px)', right: 0,
          background: '#fff', borderRadius: '10px', boxShadow: '0 8px 24px rgba(0,0,0,0.15)',
          border: '1px solid rgba(0,0,0,0.08)', minWidth: '190px', overflow: 'hidden', zIndex: 9999,
        }}>
          <MenuItem
            icon={Database}
            label="Farm Masters"
            sub="Crops, inventory, plots…"
            onClick={() => go('/admin')}
            active={location.pathname === '/admin'}
          />
          <MenuItem
            icon={Settings}
            label="Farm Settings"
            sub="Members, roles, farm info"
            onClick={() => go('/settings')}
            active={location.pathname === '/settings'}
          />
          {profile?.is_super_admin && (
            <MenuItem
              icon={Shield}
              label="Super Admin"
              sub="All farms & users"
              onClick={() => go('/super-admin')}
              active={location.pathname === '/super-admin'}
            />
          )}
        </div>
      )}
    </div>
  )
}

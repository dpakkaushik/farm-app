import { useState, useRef, useEffect } from 'react'
import { useAuthStore } from '../store/auth'
import CreateFarmModal from './CreateFarmModal'

export default function FarmSwitcher() {
  const { farms, activeFarmId, activeFarm, switchFarm } = useAuthStore()
  const [open, setOpen]       = useState(false)
  const [showCreate, setShowCreate] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const farmName = activeFarm?.farm_name || 'Select Farm'
  const totalAcres = activeFarm?.total_acres || 0

  return (
    <>
      <div ref={ref} style={{ position: 'relative' }}>
        <button
          onClick={() => setOpen(o => !o)}
          style={{
            display:        'flex',
            alignItems:     'center',
            gap:            '6px',
            background:     'rgba(255,255,255,0.12)',
            border:         '1px solid rgba(255,255,255,0.2)',
            borderRadius:   '8px',
            padding:        '6px 10px',
            color:          '#fff',
            cursor:         'pointer',
            maxWidth:       '180px',
          }}
        >
          <span style={{ fontSize: '16px' }}>🌾</span>
          <div style={{ textAlign: 'left', overflow: 'hidden' }}>
            <div style={{ fontSize: '13px', fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {farmName}
            </div>
            {totalAcres > 0 && (
              <div style={{ fontSize: '10px', opacity: 0.75 }}>{totalAcres} acres</div>
            )}
          </div>
          <span style={{ fontSize: '10px', opacity: 0.7, marginLeft: 'auto' }}>▼</span>
        </button>

        {open && (
          <div style={{
            position:    'absolute',
            top:         'calc(100% + 6px)',
            left:        0,
            background:  '#fff',
            border:      '1px solid #e5e7eb',
            borderRadius:'10px',
            boxShadow:   '0 8px 24px rgba(0,0,0,0.12)',
            minWidth:    '220px',
            zIndex:      1000,
            overflow:    'hidden',
          }}>
            <div style={{ padding: '8px 12px', fontSize: '11px', color: '#6b7280', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', borderBottom: '1px solid #f3f4f6' }}>
              Your Farms
            </div>

            {farms.map(f => (
              <button
                key={f.farm_id}
                onClick={() => { switchFarm(f.farm_id); setOpen(false) }}
                style={{
                  display:     'flex',
                  alignItems:  'center',
                  gap:         '10px',
                  width:       '100%',
                  padding:     '10px 12px',
                  background:  f.farm_id === activeFarmId ? '#f0fdf4' : 'transparent',
                  border:      'none',
                  cursor:      'pointer',
                  textAlign:   'left',
                  borderBottom:'1px solid #f9fafb',
                }}
              >
                <span style={{
                  width: '32px', height: '32px', borderRadius: '8px',
                  background: '#1D9E75', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: '16px', flexShrink: 0,
                }}>🌾</span>
                <div style={{ overflow: 'hidden' }}>
                  <div style={{ fontSize: '13px', fontWeight: 600, color: '#111827', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {f.farm_name}
                  </div>
                  <div style={{ fontSize: '11px', color: '#6b7280' }}>
                    {f.total_acres ? `${f.total_acres} acres · ` : ''}{f.role}
                  </div>
                </div>
                {f.farm_id === activeFarmId && (
                  <span style={{ marginLeft: 'auto', color: '#1D9E75', fontSize: '14px' }}>✓</span>
                )}
              </button>
            ))}

            <button
              onClick={() => { setShowCreate(true); setOpen(false) }}
              style={{
                display:    'flex',
                alignItems: 'center',
                gap:        '8px',
                width:      '100%',
                padding:    '10px 12px',
                background: 'transparent',
                border:     'none',
                borderTop:  '1px solid #f3f4f6',
                cursor:     'pointer',
                color:      '#1D9E75',
                fontSize:   '13px',
                fontWeight: 600,
              }}
            >
              <span style={{ fontSize: '18px' }}>＋</span> Add New Farm
            </button>
          </div>
        )}
      </div>

      {showCreate && <CreateFarmModal onClose={() => setShowCreate(false)} />}
    </>
  )
}

import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuthStore } from '../store/auth'

export default function SuperAdmin() {
  const { profile } = useAuthStore()
  const [farms, setFarms] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!profile?.is_super_admin) return
    supabase
      .from('farms')
      .select('*, farm_memberships(count)')
      .order('created_at', { ascending: false })
      .then(({ data }) => { setFarms(data || []); setLoading(false) })
  }, [profile?.is_super_admin])

  if (!profile?.is_super_admin) return (
    <div style={{ padding: '40px', textAlign: 'center', color: '#dc2626' }}>
      <div style={{ fontSize: '40px', marginBottom: '12px' }}>🚫</div>
      <div style={{ fontWeight: 700 }}>Super admin access only</div>
    </div>
  )

  const card = { background: '#fff', borderRadius: '12px', border: '0.5px solid #e5e7eb', padding: '16px', marginBottom: '10px' }

  return (
    <div style={{ maxWidth: '720px', margin: '0 auto', padding: '20px 16px 80px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '20px' }}>
        <span style={{ fontSize: '24px' }}>🛡️</span>
        <div>
          <h2 style={{ margin: 0, fontSize: '20px', fontWeight: 800 }}>Super Admin</h2>
          <div style={{ fontSize: '12px', color: '#6b7280' }}>All farms across the platform</div>
        </div>
      </div>

      {loading ? (
        <div style={{ color: '#6b7280', textAlign: 'center', padding: '40px' }}>Loading…</div>
      ) : (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: '12px', marginBottom: '20px' }}>
            {[
              { label: 'Total Farms', value: farms.length },
              { label: 'Total Acres', value: farms.reduce((s, f) => s + (Number(f.total_acres) || 0), 0).toFixed(1) },
              { label: 'Total Members', value: farms.reduce((s, f) => s + (f.farm_memberships?.[0]?.count || 0), 0) },
            ].map(({ label, value }) => (
              <div key={label} style={{ background: '#fff', borderRadius: '12px', border: '0.5px solid #e5e7eb', padding: '16px', textAlign: 'center' }}>
                <div style={{ fontSize: '24px', fontWeight: 800, color: '#1D9E75' }}>{value}</div>
                <div style={{ fontSize: '12px', color: '#6b7280' }}>{label}</div>
              </div>
            ))}
          </div>

          {farms.map(f => (
            <div key={f.id} style={card}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                  <div style={{ fontWeight: 700, fontSize: '15px', color: '#111827' }}>{f.name}</div>
                  <div style={{ fontSize: '12px', color: '#6b7280', marginTop: '2px' }}>
                    {f.location} · {f.total_acres} acres
                  </div>
                  <div style={{ fontSize: '11px', color: '#9ca3af', marginTop: '4px', fontFamily: 'monospace' }}>
                    {f.id}
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: '13px', fontWeight: 600, color: '#374151' }}>
                    {f.farm_memberships?.[0]?.count || 0} member{(f.farm_memberships?.[0]?.count || 0) !== 1 ? 's' : ''}
                  </div>
                  <div style={{ fontSize: '11px', color: '#9ca3af', marginTop: '2px' }}>
                    {new Date(f.created_at).toLocaleDateString('en-IN')}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </>
      )}
    </div>
  )
}

import { useState } from 'react'
import { useAuthStore } from '../store/auth'

export default function FarmOnboarding() {
  const { createFarm, logout, user } = useAuthStore()
  const [form, setForm]       = useState({ name: '', location: '', total_acres: '' })
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState('')

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!form.name.trim()) { setError('Farm name is required'); return }
    setLoading(true)
    setError('')
    try {
      await createFarm(form)
    } catch (err) {
      setError(err.message || 'Failed to create farm. Please try again.')
      setLoading(false)
    }
  }

  return (
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(135deg, #0f4c35 0%, #1D9E75 60%, #2dd4a0 100%)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '24px',
    }}>
      <div style={{
        background: '#fff',
        borderRadius: '20px',
        padding: '40px 36px',
        width: '100%',
        maxWidth: '440px',
        boxShadow: '0 24px 80px rgba(0,0,0,0.25)',
      }}>
        <div style={{ textAlign: 'center', marginBottom: '28px' }}>
          <div style={{ fontSize: '48px', marginBottom: '12px' }}>🌾</div>
          <h1 style={{ margin: '0 0 8px', fontSize: '24px', fontWeight: 800, color: '#111827' }}>
            Welcome to FarmApp
          </h1>
          <p style={{ margin: 0, color: '#6b7280', fontSize: '15px', lineHeight: 1.5 }}>
            Let's set up your first farm. You can manage multiple farms later.
          </p>
        </div>

        {error && (
          <div style={{
            background: '#fef2f2', border: '1px solid #fca5a5', borderRadius: '10px',
            padding: '12px 16px', color: '#dc2626', fontSize: '13px', marginBottom: '20px',
          }}>
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div>
            <label style={{ fontSize: '13px', fontWeight: 700, color: '#374151', display: 'block', marginBottom: '6px' }}>
              Farm Name *
            </label>
            <input
              value={form.name}
              onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              placeholder="e.g. Sharma Farm"
              style={{
                width: '100%', padding: '12px 14px', border: '1.5px solid #d1d5db',
                borderRadius: '10px', fontSize: '15px', boxSizing: 'border-box',
                outline: 'none',
              }}
              autoFocus
            />
          </div>

          <div>
            <label style={{ fontSize: '13px', fontWeight: 700, color: '#374151', display: 'block', marginBottom: '6px' }}>
              Location
            </label>
            <input
              value={form.location}
              onChange={e => setForm(f => ({ ...f, location: e.target.value }))}
              placeholder="e.g. Pilibhit, Uttar Pradesh"
              style={{
                width: '100%', padding: '12px 14px', border: '1.5px solid #d1d5db',
                borderRadius: '10px', fontSize: '15px', boxSizing: 'border-box',
              }}
            />
          </div>

          <div>
            <label style={{ fontSize: '13px', fontWeight: 700, color: '#374151', display: 'block', marginBottom: '6px' }}>
              Total Acres
            </label>
            <input
              type="number"
              min="0"
              step="0.5"
              value={form.total_acres}
              onChange={e => setForm(f => ({ ...f, total_acres: e.target.value }))}
              placeholder="e.g. 75"
              style={{
                width: '100%', padding: '12px 14px', border: '1.5px solid #d1d5db',
                borderRadius: '10px', fontSize: '15px', boxSizing: 'border-box',
              }}
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            style={{
              marginTop: '8px',
              padding: '14px',
              border: 'none',
              borderRadius: '10px',
              background: loading ? '#9ca3af' : '#1D9E75',
              color: '#fff',
              fontSize: '16px',
              fontWeight: 700,
              cursor: loading ? 'not-allowed' : 'pointer',
              transition: 'background 0.2s',
            }}
          >
            {loading ? 'Setting up your farm…' : 'Create My Farm →'}
          </button>
        </form>

        <div style={{ marginTop: '24px', paddingTop: '20px', borderTop: '1px solid #f3f4f6', textAlign: 'center' }}>
          <p style={{ margin: '0 0 4px', fontSize: '12px', color: '#9ca3af' }}>
            Signed in as {user?.email}
          </p>
          <button
            onClick={logout}
            style={{
              background: 'none', border: 'none', color: '#6b7280', fontSize: '12px',
              cursor: 'pointer', textDecoration: 'underline',
            }}
          >
            Sign out
          </button>
        </div>
      </div>
    </div>
  )
}

import { useState } from 'react'
import { useAuthStore } from '../store/auth'

export default function CreateFarmModal({ onClose }) {
  const { createFarm } = useAuthStore()
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
      onClose()
    } catch (err) {
      setError(err.message || 'Failed to create farm')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2000,
    }}>
      <div style={{
        background: '#fff', borderRadius: '16px', padding: '28px', width: '100%',
        maxWidth: '420px', margin: '16px', boxShadow: '0 20px 60px rgba(0,0,0,0.2)',
      }}>
        <h2 style={{ margin: '0 0 4px', fontSize: '20px', fontWeight: 700 }}>Create New Farm</h2>
        <p style={{ margin: '0 0 20px', color: '#6b7280', fontSize: '14px' }}>
          You'll be the admin of this farm and can invite managers.
        </p>

        {error && (
          <div style={{ background: '#fef2f2', border: '1px solid #fca5a5', borderRadius: '8px', padding: '10px 14px', color: '#dc2626', fontSize: '13px', marginBottom: '16px' }}>
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <div>
            <label style={{ fontSize: '13px', fontWeight: 600, color: '#374151', display: 'block', marginBottom: '4px' }}>
              Farm Name *
            </label>
            <input
              value={form.name}
              onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              placeholder="e.g. Sharma Farm, Khetlal Estate"
              style={{ width: '100%', padding: '10px 12px', border: '1px solid #d1d5db', borderRadius: '8px', fontSize: '14px', boxSizing: 'border-box' }}
              autoFocus
            />
          </div>

          <div>
            <label style={{ fontSize: '13px', fontWeight: 600, color: '#374151', display: 'block', marginBottom: '4px' }}>
              Location
            </label>
            <input
              value={form.location}
              onChange={e => setForm(f => ({ ...f, location: e.target.value }))}
              placeholder="e.g. Pilibhit, Uttar Pradesh"
              style={{ width: '100%', padding: '10px 12px', border: '1px solid #d1d5db', borderRadius: '8px', fontSize: '14px', boxSizing: 'border-box' }}
            />
          </div>

          <div>
            <label style={{ fontSize: '13px', fontWeight: 600, color: '#374151', display: 'block', marginBottom: '4px' }}>
              Total Acres
            </label>
            <input
              type="number"
              min="0"
              step="0.5"
              value={form.total_acres}
              onChange={e => setForm(f => ({ ...f, total_acres: e.target.value }))}
              placeholder="e.g. 75"
              style={{ width: '100%', padding: '10px 12px', border: '1px solid #d1d5db', borderRadius: '8px', fontSize: '14px', boxSizing: 'border-box' }}
            />
          </div>

          <div style={{ display: 'flex', gap: '10px', marginTop: '4px' }}>
            <button
              type="button"
              onClick={onClose}
              style={{ flex: 1, padding: '11px', border: '1px solid #d1d5db', borderRadius: '8px', background: '#fff', fontSize: '14px', cursor: 'pointer', fontWeight: 600 }}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              style={{ flex: 1, padding: '11px', border: 'none', borderRadius: '8px', background: loading ? '#9ca3af' : '#1D9E75', color: '#fff', fontSize: '14px', cursor: loading ? 'not-allowed' : 'pointer', fontWeight: 600 }}
            >
              {loading ? 'Creating…' : 'Create Farm'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

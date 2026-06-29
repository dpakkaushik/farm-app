import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '../store/auth'
import { useMapStore } from '../store'

export default function CreateFarmModal({ onClose }) {
  const navigate = useNavigate()
  const { createFarm } = useAuthStore()
  const [form, setForm]     = useState({ name: '', location: '', total_acres: '', lat: '', lng: '' })
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState('')
  const [pickMode, setPickMode] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!form.name.trim()) { setError('Farm name is required'); return }
    setLoading(true)
    setError('')
    try {
      await createFarm(form)
      onClose()
      navigate('/field?newFarm=1')
    } catch (err) {
      setError(err.message || 'Failed to create farm')
    } finally {
      setLoading(false)
    }
  }

  const confirmPickedLocation = () => {
    const [lng, lat] = useMapStore.getState().center
    setForm(f => ({ ...f, lat: lat.toFixed(6), lng: lng.toFixed(6) }))
    setPickMode(false)
  }

  // ── Pick-on-map mode: collapse to a floating bottom bar ──────────────────
  if (pickMode) {
    return (
      <>
        {/* Crosshair fixed in screen center */}
        <div style={{ position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 1900, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ position: 'relative', width: '40px', height: '40px' }}>
            <div style={{ position: 'absolute', top: '50%', left: 0, right: 0, height: '2px', background: '#1D9E75', transform: 'translateY(-50%)' }} />
            <div style={{ position: 'absolute', left: '50%', top: 0, bottom: 0, width: '2px', background: '#1D9E75', transform: 'translateX(-50%)' }} />
            <div style={{ position: 'absolute', top: '50%', left: '50%', width: '8px', height: '8px', borderRadius: '50%', background: '#1D9E75', transform: 'translate(-50%,-50%)', boxShadow: '0 0 0 2px #fff' }} />
          </div>
        </div>

        {/* Floating instruction bar at bottom */}
        <div style={{
          position: 'fixed', bottom: '80px', left: '50%', transform: 'translateX(-50%)',
          zIndex: 1900, background: 'rgba(17,24,39,0.92)', backdropFilter: 'blur(8px)',
          borderRadius: '14px', padding: '14px 20px', color: '#fff',
          boxShadow: '0 8px 32px rgba(0,0,0,0.4)', textAlign: 'center', minWidth: '280px',
        }}>
          <div style={{ fontSize: '13px', marginBottom: '12px', opacity: 0.85 }}>
            📍 Pan the map to your farm, then tap <strong>Confirm</strong>
          </div>
          <div style={{ display: 'flex', gap: '10px' }}>
            <button
              onClick={() => setPickMode(false)}
              style={{ flex: 1, padding: '9px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.2)', background: 'transparent', color: '#fff', fontSize: '13px', cursor: 'pointer' }}
            >
              Cancel
            </button>
            <button
              onClick={confirmPickedLocation}
              style={{ flex: 1, padding: '9px', borderRadius: '8px', border: 'none', background: '#1D9E75', color: '#fff', fontSize: '13px', fontWeight: 700, cursor: 'pointer' }}
            >
              ✓ Confirm Location
            </button>
          </div>
        </div>
      </>
    )
  }

  // ── Normal modal ─────────────────────────────────────────────────────────
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
            <label style={{ fontSize: '13px', fontWeight: 600, color: '#374151', display: 'block', marginBottom: '4px' }}>Farm Name *</label>
            <input
              value={form.name}
              onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              placeholder="e.g. Sharma Farm, Khetlal Estate"
              style={{ width: '100%', padding: '10px 12px', border: '1px solid #d1d5db', borderRadius: '8px', fontSize: '14px', boxSizing: 'border-box' }}
              autoFocus
            />
          </div>

          <div>
            <label style={{ fontSize: '13px', fontWeight: 600, color: '#374151', display: 'block', marginBottom: '4px' }}>Location</label>
            <input
              value={form.location}
              onChange={e => setForm(f => ({ ...f, location: e.target.value }))}
              placeholder="e.g. Pilibhit, Uttar Pradesh"
              style={{ width: '100%', padding: '10px 12px', border: '1px solid #d1d5db', borderRadius: '8px', fontSize: '14px', boxSizing: 'border-box' }}
            />
          </div>

          {/* Coordinates row */}
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
              <label style={{ fontSize: '13px', fontWeight: 600, color: '#374151' }}>Map Location</label>
              <button
                type="button"
                onClick={() => setPickMode(true)}
                style={{ fontSize: '12px', color: '#1D9E75', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '4px' }}
              >
                📍 Pick on Map
              </button>
            </div>
            <div style={{ display: 'flex', gap: '8px' }}>
              <input
                value={form.lat}
                onChange={e => setForm(f => ({ ...f, lat: e.target.value }))}
                placeholder="Latitude (e.g. 28.5073)"
                type="number"
                step="any"
                style={{ flex: 1, padding: '10px 12px', border: '1px solid #d1d5db', borderRadius: '8px', fontSize: '13px', boxSizing: 'border-box' }}
              />
              <input
                value={form.lng}
                onChange={e => setForm(f => ({ ...f, lng: e.target.value }))}
                placeholder="Longitude (e.g. 80.4863)"
                type="number"
                step="any"
                style={{ flex: 1, padding: '10px 12px', border: '1px solid #d1d5db', borderRadius: '8px', fontSize: '13px', boxSizing: 'border-box' }}
              />
            </div>
            {form.lat && form.lng && (
              <div style={{ fontSize: '11px', color: '#6b7280', marginTop: '4px' }}>
                📌 {parseFloat(form.lat).toFixed(4)}°N, {parseFloat(form.lng).toFixed(4)}°E — map will open here
              </div>
            )}
          </div>

          <div>
            <label style={{ fontSize: '13px', fontWeight: 600, color: '#374151', display: 'block', marginBottom: '4px' }}>Total Acres</label>
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

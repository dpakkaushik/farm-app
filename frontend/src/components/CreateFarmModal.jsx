import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '../store/auth'
import MapPicker from './MapPicker'
import useBackClose from '../hooks/useBackClose'

// Create a farm — the same form FarmOnboarding shows the very first time, so it
// uses the same picker.
//
// It used to "pick on map" by collapsing to a crosshair over whatever page was
// behind and reading useMapStore's centre on Confirm. That could not work from
// here: this modal opens inside ManageFarmsModal's own full-screen overlay, which
// swallowed every drag, so the map never moved under the crosshair. It also
// assumed a map was behind at all — open it from any page but Fields and there
// was nothing to pan. MapPicker carries its own satellite map, so neither
// assumption is needed.
export default function CreateFarmModal({ onClose }) {
  const navigate = useNavigate()
  const { createFarm } = useAuthStore()
  const [form, setForm]       = useState({ name: '', location: '', total_acres: '', lat: '', lng: '' })
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState('')

  useBackClose(() => { if (!loading) onClose() })

  const centre = (form.lat !== '' && form.lng !== '')
    ? { lat: parseFloat(form.lat), lng: parseFloat(form.lng) }
    : null

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

  return (
    <div style={overlay}>
      <div style={card}>
        <h2 style={{ margin: '0 0 4px', fontSize: '20px', fontWeight: 700, color: 'var(--c-text)' }}>Create New Farm</h2>
        <p style={{ margin: '0 0 20px', color: 'var(--c-muted)', fontSize: '14px' }}>
          You'll be the admin of this farm and can invite managers.
        </p>

        {error && <div style={errBox}>{error}</div>}

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <div>
            <label style={label}>Farm Name *</label>
            <input
              value={form.name}
              onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              placeholder="e.g. Sharma Farm, Khetlal Estate"
              style={input}
              autoFocus
            />
          </div>

          <div>
            <label style={label}>Location</label>
            <input
              value={form.location}
              onChange={e => setForm(f => ({ ...f, location: e.target.value }))}
              placeholder="e.g. Pilibhit, Uttar Pradesh"
              style={input}
            />
          </div>

          <div>
            <label style={label}>Where is it?</label>
            <p style={hint}>
              Search for the nearest town, then drag the map and tap your farm. This is
              what the Field map opens on — you can move it later.
            </p>
            <MapPicker
              mode="point"
              value={centre}
              onChange={pt => setForm(f => ({
                ...f,
                lat: pt ? pt.lat : '',
                lng: pt ? pt.lng : '',
              }))}
              height={220}
            />
          </div>

          <div>
            <label style={label}>Total Acres</label>
            <input
              type="number"
              min="0"
              step="0.5"
              value={form.total_acres}
              onChange={e => setForm(f => ({ ...f, total_acres: e.target.value }))}
              placeholder="e.g. 75"
              style={input}
            />
          </div>

          <div style={{ display: 'flex', gap: '10px', marginTop: '4px' }}>
            <button type="button" onClick={onClose} style={btnGhost}>Cancel</button>
            <button type="submit" disabled={loading} style={btnPrimary(loading)}>
              {loading ? 'Creating…' : 'Create Farm'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ── Styles ───────────────────────────────────────────────────────────────────
const overlay = {
  position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
  display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2000,
  padding: `calc(16px + env(safe-area-inset-top, 0px)) 16px calc(16px + env(safe-area-inset-bottom, 0px))`,
}
// The map makes this form tall enough to outgrow a phone, so the card scrolls
// rather than pushing its buttons off the screen.
const card = {
  background: 'var(--c-nav)', borderRadius: '16px', padding: '24px', width: '100%',
  maxWidth: '420px', maxHeight: '100%', overflowY: 'auto',
  boxShadow: '0 20px 60px rgba(0,0,0,0.4)',
}
const label = { fontSize: '13px', fontWeight: 600, color: 'var(--c-text)', display: 'block', marginBottom: '4px' }
const hint  = { margin: '0 0 8px', fontSize: '12px', color: 'var(--c-muted)', lineHeight: 1.5 }
const input = {
  width: '100%', padding: '10px 12px', border: '1px solid var(--c-border-md)',
  borderRadius: '8px', fontSize: '14px', boxSizing: 'border-box',
  background: 'var(--c-input)', color: 'var(--c-text)',
}
const errBox = {
  background: 'rgba(226,75,74,0.1)', border: '1px solid rgba(226,75,74,0.3)',
  borderRadius: '8px', padding: '10px 14px', color: '#E24B4A', fontSize: '13px', marginBottom: '16px',
}
const btnBase = { flex: 1, padding: '11px', borderRadius: '8px', fontSize: '14px', fontWeight: 600, cursor: 'pointer' }
const btnGhost = { ...btnBase, border: '1px solid var(--c-border-md)', background: 'transparent', color: 'var(--c-text)' }
const btnPrimary = (loading) => ({
  ...btnBase, border: 'none', background: loading ? 'var(--c-muted)' : '#8A9A5B',
  color: '#fff', cursor: loading ? 'not-allowed' : 'pointer',
})

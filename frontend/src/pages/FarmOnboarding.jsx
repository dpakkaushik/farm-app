import { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '../store/auth'
import { useAppStore } from '../store'
import MapPicker, { polygonAcres } from '../components/MapPicker'

// First-run wizard for a brand-new owner: farm → plots → done.
//
// It stays mounted across all three steps because App.jsx also checks the auth
// store's `onboarding` flag — creating the farm takes farms.length from 0 to 1,
// which would otherwise drop the user straight into the app before they ever
// reached the plots step.
//
// Both steps capture coordinates on a satellite map, because without them the farm
// has no shape and the Field map — the whole point of the product — opens on an
// empty world. Step 1 drops a pin for the farm centre (farms.map_state); step 2 taps
// four corners per plot (plots.point_a..d). Both are optional and can be done later
// from Admin → Plots, but the map makes them cheap enough to do now.

const STEPS = ['farm', 'plots', 'done']
const EMPTY_PLOT_FORM = { name: '', area_acres: '', corners: [] }

export default function FarmOnboarding() {
  const navigate = useNavigate()
  const { createFarm, logout, user, setOnboarding } = useAuthStore()
  const { addPlot } = useAppStore()

  const [step, setStep]         = useState('farm')
  const [form, setForm]         = useState({ name: '', location: '', total_acres: '', lat: '', lng: '' })
  const [draftPlots, setDrafts] = useState([])              // held locally, written on Continue
  const [plotForm, setPlotForm] = useState(EMPTY_PLOT_FORM)
  const [loading, setLoading]   = useState(false)
  const [error, setError]       = useState('')

  // The farm centre, in the two shapes that need it: an object for the picker,
  // a [lng, lat] pair to open step 2's map on. Memoised because the picker rebuilds
  // its marker whenever this identity changes — without it, every keystroke in the
  // name field would tear the pin off the map and put it back.
  const centre = useMemo(
    () => (form.lat !== '' && form.lng !== '' ? { lat: parseFloat(form.lat), lng: parseFloat(form.lng) } : null),
    [form.lat, form.lng],
  )
  const centreLngLat = useMemo(() => (centre ? [centre.lng, centre.lat] : undefined), [centre])

  // Plots already drawn, shown under the one being drawn so the owner can see
  // what he has covered and where the next field butts up against it.
  const drawnPlots = useMemo(
    () => draftPlots.filter(p => p.corners?.length === 4).map(p => ({ name: p.name, points: p.corners })),
    [draftPlots],
  )

  // Hold the wizard open until the user finishes or reloads.
  useEffect(() => { setOnboarding(true) }, [])

  const finish = () => {
    setOnboarding(false)
    navigate('/field?newFarm=1')
  }

  const handleCreateFarm = async (e) => {
    e.preventDefault()
    if (!form.name.trim()) { setError('Farm name is required'); return }
    setLoading(true)
    setError('')
    try {
      await createFarm(form)
      setStep('plots')
    } catch (err) {
      setError(err.message || 'Failed to create farm. Please try again.')
    }
    setLoading(false)
  }

  const addDraft = () => {
    if (!plotForm.name.trim()) { setError('Give the plot a name'); return }
    setError('')

    // A drawn boundary already knows the acreage. Only fall back to it if he
    // didn't type one — a typed number is a deliberate statement and wins.
    const mapped = plotForm.corners.length === 4 ? polygonAcres(plotForm.corners) : 0
    const acres  = plotForm.area_acres !== '' ? plotForm.area_acres
                 : mapped                     ? mapped.toFixed(2)
                 : ''

    setDrafts(ps => [...ps, { name: plotForm.name.trim(), area_acres: acres, corners: plotForm.corners }])
    setPlotForm(EMPTY_PLOT_FORM)
  }

  const removeDraft = (idx) => setDrafts(ps => ps.filter((_, i) => i !== idx))

  // corners [A,B,C,D] -> the eight flat columns plots actually stores.
  const toPlotRow = ({ name, area_acres, corners }) => {
    const row = { name, area_acres }
    if (corners?.length === 4) {
      const [a, b, c, d] = corners
      Object.assign(row, {
        point_a_lat: a.lat, point_a_lng: a.lng,
        point_b_lat: b.lat, point_b_lng: b.lng,
        point_c_lat: c.lat, point_c_lng: c.lng,
        point_d_lat: d.lat, point_d_lng: d.lng,
      })
    }
    return row
  }

  const handleSavePlots = async () => {
    if (draftPlots.length === 0) { setStep('done'); return }
    setLoading(true)
    setError('')
    try {
      for (const p of draftPlots) await addPlot(toPlotRow(p))
      setStep('done')
    } catch (err) {
      setError(err.message || 'Failed to save plots. You can add them later from Admin.')
    }
    setLoading(false)
  }

  const plotAcres = draftPlots.reduce((sum, p) => sum + (parseFloat(p.area_acres) || 0), 0)
  const farmAcres = parseFloat(form.total_acres) || 0
  const stepIdx   = STEPS.indexOf(step)

  return (
    <div style={wrap}>
      <div style={card}>

        {/* Progress */}
        <div style={{ display: 'flex', gap: '6px', marginBottom: '24px' }}>
          {STEPS.map((s, i) => (
            <div key={s} style={{
              flex: 1, height: '4px', borderRadius: '99px',
              background: i <= stepIdx ? '#1D9E75' : '#e5e7eb',
              transition: 'background 0.3s',
            }} />
          ))}
        </div>

        {/* ── Step 1 — the farm ───────────────────────────────────────────── */}
        {step === 'farm' && (
          <>
            <div style={header}>
              <div style={{ fontSize: '48px', marginBottom: '12px' }}>🌾</div>
              <h1 style={title}>Welcome to Farm Manager</h1>
              <p style={sub}>Step 1 of 3 — let's set up your farm. You'll be its admin, and can invite your manager later.</p>
            </div>

            {error && <div style={errBox}>{error}</div>}

            <form onSubmit={handleCreateFarm} style={formCol}>
              <Field label="Farm Name *">
                <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  placeholder="e.g. Sharma Farm" style={input} autoFocus />
              </Field>
              <Field label="Location">
                <input value={form.location} onChange={e => setForm(f => ({ ...f, location: e.target.value }))}
                  placeholder="e.g. Pilibhit, Uttar Pradesh" style={input} />
              </Field>
              <Field label="Total Acres">
                <input type="number" min="0" step="0.5" value={form.total_acres}
                  onChange={e => setForm(f => ({ ...f, total_acres: e.target.value }))}
                  placeholder="e.g. 75" style={input} />
              </Field>

              <Field label="Where is it?">
                <p style={fieldHint}>
                  Search for the nearest town, then tap your farm on the satellite map. This
                  is what the Field map opens on — you can move it later.
                </p>
                <MapPicker
                  mode="point"
                  value={centre}
                  onChange={pt => setForm(f => ({
                    ...f,
                    lat: pt ? pt.lat : '',
                    lng: pt ? pt.lng : '',
                  }))}
                />
              </Field>

              <button type="submit" disabled={loading} style={primaryBtn(loading)}>
                {loading ? 'Creating your farm…'
                  : centre ? 'Continue →'
                  : 'Continue without a location →'}
              </button>
            </form>
          </>
        )}

        {/* ── Step 2 — the plots ──────────────────────────────────────────── */}
        {step === 'plots' && (
          <>
            <div style={header}>
              <div style={{ fontSize: '48px', marginBottom: '12px' }}>🗺️</div>
              <h1 style={title}>Add your plots</h1>
              <p style={sub}>
                Step 2 of 3 — a plot is a field you want to track separately. Every crop, cost and
                harvest is recorded against one. Name it, then trace its four corners on the map so
                it shows up on your Field view.
              </p>
            </div>

            {error && <div style={errBox}>{error}</div>}

            {draftPlots.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '16px' }}>
                {draftPlots.map((p, i) => (
                  <div key={i} style={plotRow}>
                    <span style={{ fontSize: '18px' }}>{p.corners?.length === 4 ? '🗺️' : '🌱'}</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: '14px', fontWeight: 700, color: '#111827' }}>{p.name}</div>
                      <div style={{ fontSize: '12px', color: '#6b7280' }}>
                        {p.area_acres ? `${p.area_acres} acres` : 'Size not set'}
                        {p.corners?.length === 4 ? ' · boundary drawn' : ' · no boundary yet'}
                      </div>
                    </div>
                    <button onClick={() => removeDraft(i)} style={removeBtn} aria-label={`Remove ${p.name}`}>✕</button>
                  </div>
                ))}
                {farmAcres > 0 && (
                  <p style={{ margin: '2px 0 0', fontSize: '12px', color: plotAcres > farmAcres ? '#b45309' : '#6b7280' }}>
                    {plotAcres} of {farmAcres} acres assigned
                    {plotAcres > farmAcres && ' — that\'s more than the farm\'s total, but we\'ll allow it'}
                  </p>
                )}
              </div>
            )}

            <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-end', marginBottom: '8px' }}>
              <div style={{ flex: 2 }}>
                <Field label="Plot Name">
                  <input value={plotForm.name}
                    onChange={e => setPlotForm(f => ({ ...f, name: e.target.value }))}
                    onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addDraft() } }}
                    placeholder="e.g. North Field" style={input} />
                </Field>
              </div>
              <div style={{ flex: 1 }}>
                <Field label="Acres">
                  <input type="number" min="0" step="0.5" value={plotForm.area_acres}
                    onChange={e => setPlotForm(f => ({ ...f, area_acres: e.target.value }))}
                    onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addDraft() } }}
                    placeholder={plotForm.corners.length === 4 ? polygonAcres(plotForm.corners).toFixed(1) : '12'}
                    style={input} />
                </Field>
              </div>
            </div>

            <div style={{ marginBottom: '10px' }}>
              <p style={fieldHint}>
                Tap the four corners of this plot, in order around its edge. Leave the acres box
                empty and we'll take the size from the shape.
              </p>
              <MapPicker
                mode="corners"
                value={plotForm.corners}
                onChange={corners => setPlotForm(f => ({ ...f, corners }))}
                center={centreLngLat}
                existing={drawnPlots}
                height={280}
              />
            </div>

            <button onClick={addDraft} style={secondaryBtn}>+ Add Plot</button>

            <button onClick={handleSavePlots} disabled={loading} style={{ ...primaryBtn(loading), marginTop: '16px' }}>
              {loading ? 'Saving plots…'
                : draftPlots.length > 0 ? `Continue with ${draftPlots.length} plot${draftPlots.length > 1 ? 's' : ''} →`
                : 'Skip for now →'}
            </button>
          </>
        )}

        {/* ── Step 3 — done ───────────────────────────────────────────────── */}
        {step === 'done' && (
          <>
            <div style={header}>
              <div style={{ fontSize: '48px', marginBottom: '12px' }}>🎉</div>
              <h1 style={title}>{form.name} is ready</h1>
              <p style={sub}>Step 3 of 3 — you're the admin of this farm. Here's what's next.</p>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '24px' }}>
              {drawnPlots.length === draftPlots.length && draftPlots.length > 0 ? (
                <NextStep icon="🗺️" title="Your plots are on the map"
                  body="Every plot you added has a boundary, so the Field view will show them straight away. Admin → Plots is where you edit them." />
              ) : (
                <NextStep icon="✏️" title="Draw your plot boundaries"
                  body="Some plots have no shape yet. Admin → Plots lets you trace them on the satellite map — that's what colours the Field view and powers the plot-wise reports." />
              )}
              <NextStep icon="👥" title="Invite your manager"
                body="Settings → Invite Someone. Managers log the daily work; you can also make someone else an admin." />
              <NextStep icon="🌱" title="Start a crop cycle"
                body="Issuing seed from inventory to a plot starts the cycle and schedules its activities automatically." />
            </div>

            <button onClick={finish} style={primaryBtn(false)}>Go to my farm →</button>
          </>
        )}

        <div style={footer}>
          <p style={{ margin: '0 0 4px', fontSize: '12px', color: '#9ca3af' }}>Signed in as {user?.email}</p>
          <button onClick={logout} style={linkBtn}>Sign out</button>
        </div>
      </div>
    </div>
  )
}

// ── Bits ──────────────────────────────────────────────────────────────────────

function Field({ label, children }) {
  return (
    <div>
      <label style={{ fontSize: '13px', fontWeight: 700, color: '#374151', display: 'block', marginBottom: '6px' }}>
        {label}
      </label>
      {children}
    </div>
  )
}

function NextStep({ icon, title, body }) {
  return (
    <div style={{ display: 'flex', gap: '12px', padding: '12px 14px', background: '#f9fafb', borderRadius: '10px', textAlign: 'left' }}>
      <span style={{ fontSize: '20px', lineHeight: 1.2 }}>{icon}</span>
      <div>
        <div style={{ fontSize: '13px', fontWeight: 700, color: '#111827', marginBottom: '2px' }}>{title}</div>
        <div style={{ fontSize: '12px', color: '#6b7280', lineHeight: 1.5 }}>{body}</div>
      </div>
    </div>
  )
}

// ── Styles ────────────────────────────────────────────────────────────────────

const wrap = {
  minHeight: '100vh',
  background: 'linear-gradient(135deg, #0f4c35 0%, #1D9E75 60%, #2dd4a0 100%)',
  display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px',
}
const card = {
  background: '#fff', borderRadius: '20px', padding: '36px',
  width: '100%', maxWidth: '440px', boxShadow: '0 24px 80px rgba(0,0,0,0.25)',
}
const header  = { textAlign: 'center', marginBottom: '24px' }
const title   = { margin: '0 0 8px', fontSize: '24px', fontWeight: 800, color: '#111827' }
const sub     = { margin: 0, color: '#6b7280', fontSize: '14px', lineHeight: 1.55 }
const formCol = { display: 'flex', flexDirection: 'column', gap: '16px' }
const input   = {
  width: '100%', padding: '12px 14px', border: '1.5px solid #d1d5db',
  borderRadius: '10px', fontSize: '15px', boxSizing: 'border-box', outline: 'none',
}
const errBox = {
  background: '#fef2f2', border: '1px solid #fca5a5', borderRadius: '10px',
  padding: '12px 16px', color: '#dc2626', fontSize: '13px', marginBottom: '20px',
}
const fieldHint = { margin: '0 0 8px', fontSize: '12px', color: '#6b7280', lineHeight: 1.5 }
const plotRow = {
  display: 'flex', alignItems: 'center', gap: '10px',
  padding: '10px 12px', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '10px',
}
const removeBtn = {
  background: 'none', border: 'none', color: '#9ca3af',
  fontSize: '14px', cursor: 'pointer', padding: '4px 6px', flexShrink: 0,
}
const primaryBtn = (busy) => ({
  marginTop: '8px', padding: '14px', border: 'none', borderRadius: '10px',
  background: busy ? '#9ca3af' : '#1D9E75', color: '#fff',
  fontSize: '16px', fontWeight: 700, cursor: busy ? 'not-allowed' : 'pointer',
  width: '100%', transition: 'background 0.2s',
})
const secondaryBtn = {
  width: '100%', padding: '11px', borderRadius: '10px',
  border: '1.5px dashed #1D9E75', background: '#f0fdf4', color: '#1D9E75',
  fontSize: '14px', fontWeight: 700, cursor: 'pointer',
}
const footer  = { marginTop: '24px', paddingTop: '20px', borderTop: '1px solid #f3f4f6', textAlign: 'center' }
const linkBtn = { background: 'none', border: 'none', color: '#6b7280', fontSize: '12px', cursor: 'pointer', textDecoration: 'underline' }

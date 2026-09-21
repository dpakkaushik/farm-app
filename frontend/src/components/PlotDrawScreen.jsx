import { useState } from 'react'
import { ChevronLeft, Undo2, Eraser } from 'lucide-react'
import MapPicker, { polygonAcres } from './MapPicker'
import BottomSheet from './BottomSheet'
import useBackClose from '../hooks/useBackClose'
import { cornersFromPlot, plotFromCorners, CORNER_KEYS } from '../lib/plotCorners'
import { areaCheck, resolveAreaAcres, saveBlock, parseArea, CORNER_COUNT } from '../lib/plotDraft'

// Step 2 of Add Plot: the boundary, drawn on a satellite map the size of the
// phone rather than in a 240px box inside a scrolling form.
//
// Props only — no store, no session — so /uikit can draw it at 360px without a
// login. The machinery underneath is the same MapPicker that has done four-point
// tapping since 18 Sep; what is new is the frame around it.
const LABELS = ['A', 'B', 'C', 'D']

export default function PlotDrawScreen({
  draft,                 // the plot form: { name, area_acres, point_a_lat … point_d_lng }
  onPatch,               // (patch) => void — merged into the form by the parent
  farmName = '',
  existing = [],         // the farm's other plots, drawn dimmed for context
  center,                // [lng, lat] — where the map opens
  editing = false,
  saving = false,
  onBack,
  onSave,
}) {
  const [coordsOpen, setCoordsOpen] = useState(false)

  // Back goes to the details step, not out of Admin — the half-typed name is
  // still there, and losing it would be the whole entry gone. The coordinates
  // sheet traps back too and stacks on top of this one, so back closes the
  // sheet first and this screen second. Do not deactivate this while the sheet
  // is open: disposing a trap in the same commit as another opens is the race
  // that made every drawer row close itself on 18 Sep.
  useBackClose(onBack)

  const corners = cornersFromPlot(draft)
  const drawn   = polygonAcres(corners)
  const check   = areaCheck(draft.area_acres, drawn, corners.length)
  const block   = saveBlock({ name: draft.name, area_acres: draft.area_acres, cornerCount: corners.length })
  const done    = corners.length === CORNER_COUNT

  const setCorners = pts => onPatch(plotFromCorners(pts))

  // What will actually be stored, and where it came from. Printing the figure
  // that gets saved — rather than whichever is prettier — is the point: a typed
  // area is never replaced by the shape.
  const saveArea = resolveAreaAcres(draft.area_acres, drawn, corners.length)
  const typed    = parseArea(draft.area_acres)
  const areaFrom = typed !== null ? 'as typed' : done ? 'from the shape' : 'not set yet'

  return (
    <div className="fixed inset-0 z-50 flex flex-col" style={{ background: 'var(--c-bg)' }}>

      <div className="shrink-0 flex items-center gap-2 px-2 pb-2 border-b"
        style={{ paddingTop: 'calc(8px + env(safe-area-inset-top, 0px))', background: 'var(--c-nav)', borderColor: 'var(--c-border)' }}>
        <button type="button" onClick={onBack} aria-label="Back to plot details"
          className="w-9 h-9 flex items-center justify-center rounded-xl shrink-0" style={{ color: 'var(--c-text)' }}>
          <ChevronLeft size={22} />
        </button>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold truncate" style={{ color: 'var(--c-text)' }}>
            {draft.name?.trim() || 'New plot'}
          </p>
          <p className="text-[12px] truncate" style={{ color: 'var(--c-muted)' }}>
            {farmName ? farmName + ' · ' : ''}draw the boundary
          </p>
        </div>
        <button type="button" onClick={() => setCoordsOpen(true)}
          className="shrink-0 px-2.5 h-9 rounded-xl border text-[12px] font-semibold"
          style={{ borderColor: '#8A9A5B66', color: '#8A9A5B', background: '#8A9A5B12' }}>
          Type coordinates
        </button>
      </div>

      <div className="flex-1 min-h-0 relative">
        <MapPicker
          mode="corners"
          value={corners}
          onChange={setCorners}
          center={center}
          existing={existing}
          showSearch={false}
          chrome={false}
          height="fill"
        />

        <div className="absolute left-3 top-3 px-3 py-1.5 rounded-full text-[13px] font-semibold pointer-events-none"
          style={{ background: 'rgba(17,24,39,0.82)', color: '#fff', maxWidth: 'calc(100% - 24px)' }}>
          {done ? 'All four corners set' : 'Tap corner ' + LABELS[corners.length] + ' of ' + CORNER_COUNT}
        </div>

        {/* Bottom-right, not top: maplibre owns the top-right corner (zoom and
            GPS), and this is the end a thumb reaches. */}
        {corners.length > 0 && (
          <div className="absolute right-3 bottom-3 flex flex-col gap-2">
            <MapBtn onClick={() => setCorners(corners.slice(0, -1))} icon={<Undo2 size={15} />} label="Undo" />
            <MapBtn onClick={() => setCorners([])} icon={<Eraser size={15} />} label="Clear" />
          </div>
        )}
      </div>

      <div className="shrink-0 border-t px-3 pt-2.5"
        style={{ paddingBottom: 'max(env(safe-area-inset-bottom, 0px), 10px)', background: 'var(--c-nav)', borderColor: 'var(--c-border)' }}>

        {/* A drawn shape that contradicts a surveyed figure is said out loud,
            never quietly applied over it. */}
        {check?.off && (
          <div className="flex items-center gap-2 mb-2 px-2.5 py-1.5 rounded-xl"
            style={{ background: '#BA751714', border: '1px solid #BA751733' }}>
            <p className="flex-1 min-w-0 text-[12px]" style={{ color: '#BA7517' }}>
              You typed {check.typed.toFixed(2)} acres · this shape is ≈ {check.drawn.toFixed(2)}
            </p>
            <button type="button" onClick={() => onPatch({ area_acres: drawn.toFixed(2) })}
              className="shrink-0 px-2 py-1 rounded-lg text-[12px] font-bold"
              style={{ background: '#BA7517', color: '#fff' }}>
              Use {drawn.toFixed(2)}
            </button>
          </div>
        )}

        <div className="flex items-end gap-3">
          <div className="min-w-0">
            <p className="text-[11px] uppercase tracking-wide" style={{ color: 'var(--c-faint)' }}>Area</p>
            <p className="text-base font-bold leading-tight tabular-nums"
              style={{ color: saveArea ? '#8A9A5B' : 'var(--c-faint)' }}>
              {saveArea ? saveArea + ' ac' : '—'}
            </p>
            <p className="text-[11px] leading-tight" style={{ color: 'var(--c-faint)' }}>{areaFrom}</p>
          </div>
          <div className="shrink-0">
            <p className="text-[11px] uppercase tracking-wide" style={{ color: 'var(--c-faint)' }}>Points</p>
            <p className="text-base font-bold leading-tight tabular-nums"
              style={{ color: done ? '#8A9A5B' : 'var(--c-sub)' }}>
              {corners.length}/{CORNER_COUNT}
            </p>
          </div>
          <button type="button" onClick={onSave} disabled={!!block || saving}
            className="flex-1 py-3 rounded-xl text-sm font-bold disabled:opacity-40"
            style={{ background: '#8A9A5B', color: '#fff' }}>
            {saving ? 'Saving…' : editing ? 'Update Plot' : 'Save Plot'}
          </button>
        </div>

        {block && <p className="text-[12px] mt-1.5" style={{ color: 'var(--c-muted)' }}>{block}</p>}
      </div>

      {coordsOpen && (
        <BottomSheet title="Type coordinates" onClose={() => setCoordsOpen(false)}>
          <div className="px-4 py-3 overflow-y-auto">
            <p className="text-[12px] mb-3" style={{ color: 'var(--c-muted)' }}>
              For a surveyed reading, or to nudge one corner without redrawing the shape.
              A→B→C→D runs round the edge.
            </p>
            <div className="grid grid-cols-2 gap-[2px] text-[11px] pl-7 mb-1" style={{ color: 'var(--c-faint)' }}>
              <span>Latitude</span><span>Longitude</span>
            </div>
            <div className="space-y-2">
              {CORNER_KEYS.map((k, i) => (
                <div key={k} className="flex items-center gap-2">
                  <span className="text-xs font-mono font-semibold w-5 shrink-0" style={{ color: '#8A9A5B' }}>{LABELS[i]}</span>
                  <CoordInput placeholder="28.5073" value={draft['point_' + k + '_lat']}
                    onChange={v => onPatch({ ['point_' + k + '_lat']: v })} />
                  <CoordInput placeholder="80.4863" value={draft['point_' + k + '_lng']}
                    onChange={v => onPatch({ ['point_' + k + '_lng']: v })} />
                </div>
              ))}
            </div>
          </div>
        </BottomSheet>
      )}
    </div>
  )
}

function MapBtn({ onClick, icon, label }) {
  return (
    <button type="button" onClick={onClick} aria-label={label}
      className="flex items-center gap-1.5 px-3 h-9 rounded-xl text-[13px] font-bold shadow-lg"
      style={{ background: 'rgba(17,24,39,0.86)', color: '#fff' }}>
      {icon}{label}
    </button>
  )
}

function CoordInput({ value, onChange, placeholder }) {
  return (
    <input type="number" step="any" inputMode="decimal" placeholder={placeholder}
      value={value ?? ''} onChange={e => onChange(e.target.value)}
      className="flex-1 min-w-0 rounded-xl px-3 py-2 text-xs focus:outline-none"
      style={{ background: 'var(--c-ghost)', border: '1px solid var(--c-border-md)', color: 'var(--c-text)' }} />
  )
}

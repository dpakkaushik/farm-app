import { useEffect, useRef, useState } from 'react'
import maplibregl from 'maplibre-gl'

// Satellite coordinate picker. Two jobs, one component:
//
//   mode="point"    drop a single pin        -> the farm centre
//   mode="corners"  tap four points A-D      -> a plot boundary
//
// Same ESRI World_Imagery raster tiles Field.jsx already draws the farm on. They
// are free and need no Mapbox token, despite what the tech-stack table in
// CLAUDE.md claims — the app has never actually used Mapbox.

const SATELLITE_STYLE = {
  version: 8,
  glyphs: 'https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf',
  sources: {
    'esri-satellite': { type: 'raster', tiles: ['https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'], tileSize: 256, maxzoom: 19 },
    'esri-labels':    { type: 'raster', tiles: ['https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}'], tileSize: 256, maxzoom: 19 },
  },
  layers: [
    { id: 'satellite', type: 'raster', source: 'esri-satellite' },
    { id: 'labels',    type: 'raster', source: 'esri-labels', paint: { 'raster-opacity': 0.85 } },
  ],
}

const INDIA_VIEW    = { center: [78.9629, 22.5937], zoom: 3.6 }
const CORNER_LABELS = ['A', 'B', 'C', 'D']
const SQM_PER_ACRE  = 4046.8564224

// Area of a lat/lng polygon, in acres.
//
// Equirectangular projection to metres, then the shoelace formula. At the scale of
// a farm plot the error from ignoring the earth's curvature is far below the error
// in a human tapping a corner on a satellite tile, so this is plenty.
export function polygonAcres(points) {
  if (!points || points.length < 3) return 0
  const latMean   = points.reduce((sum, p) => sum + p.lat, 0) / points.length
  const mPerDegLat = 110574
  const mPerDegLng = 111320 * Math.cos((latMean * Math.PI) / 180)

  const xy = points.map(p => [p.lng * mPerDegLng, p.lat * mPerDegLat])
  let area = 0
  for (let i = 0; i < xy.length; i++) {
    const [x1, y1] = xy[i]
    const [x2, y2] = xy[(i + 1) % xy.length]
    area += x1 * y2 - x2 * y1
  }
  return Math.abs(area / 2) / SQM_PER_ACRE
}

const ring = pts => [[...pts.map(p => [p.lng, p.lat]), [pts[0].lng, pts[0].lat]]]

const emptyFC = { type: 'FeatureCollection', features: [] }

const polygonFC = (pts, props = {}) => (
  pts.length < 3
    ? emptyFC
    : { type: 'FeatureCollection', features: [{ type: 'Feature', properties: props, geometry: { type: 'Polygon', coordinates: ring(pts) } }] }
)

// OpenStreetMap's Nominatim: free, no API key. Its usage policy forbids a lookup
// per keystroke, so every caller fires this on an explicit action — a submit, or
// a field losing focus — never on change. Returns [lng, lat], or null if the
// place is not found.
export async function geocodePlace(place) {
  const term = (place || '').trim()
  if (!term) return null
  const res = await fetch(
    `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(term)}`,
    { headers: { Accept: 'application/json' } },
  )
  if (!res.ok) throw new Error('search failed')
  const hits = await res.json()
  if (!hits.length) return null
  return [parseFloat(hits[0].lon), parseFloat(hits[0].lat)]
}

export default function MapPicker({
  mode = 'point',
  value,                  // point: {lat,lng}|null   corners: [{lat,lng}, ...]
  onChange,
  center,                 // [lng, lat] — where to open
  existing = [],          // read-only polygons to show for context: [{name, points}]
  height = 260,
}) {
  const container = useRef(null)
  const map       = useRef(null)
  const markers   = useRef([])
  const valueRef  = useRef(value)
  const [ready,    setReady]    = useState(false)
  const [query,    setQuery]    = useState('')
  const [searching, setSearching] = useState(false)
  const [searchMsg, setSearchMsg] = useState('')

  const points = mode === 'corners' ? (value || []) : (value ? [value] : [])
  valueRef.current = value

  // ── Init ───────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (map.current) return

    const opening = center
      ? { center, zoom: 16 }
      : INDIA_VIEW

    map.current = new maplibregl.Map({
      container: container.current,
      style: SATELLITE_STYLE,
      ...opening,
      attributionControl: false,
    })
    map.current.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right')
    map.current.addControl(new maplibregl.AttributionControl({ compact: true }), 'bottom-right')
    map.current.addControl(new maplibregl.GeolocateControl({
      positionOptions: { enableHighAccuracy: true },
      trackUserLocation: false,
    }), 'top-right')

    map.current.on('load', () => {
      map.current.addSource('draft',    { type: 'geojson', data: emptyFC })
      map.current.addSource('existing', { type: 'geojson', data: emptyFC })

      map.current.addLayer({ id: 'existing-fill', type: 'fill', source: 'existing', paint: { 'fill-color': '#ffffff', 'fill-opacity': 0.14 } })
      map.current.addLayer({ id: 'existing-line', type: 'line', source: 'existing', paint: { 'line-color': '#ffffff', 'line-width': 1.5, 'line-opacity': 0.7, 'line-dasharray': [2, 1] } })
      map.current.addLayer({ id: 'draft-fill',    type: 'fill', source: 'draft',    paint: { 'fill-color': '#8A9A5B', 'fill-opacity': 0.35 } })
      map.current.addLayer({ id: 'draft-line',    type: 'line', source: 'draft',    paint: { 'line-color': '#8A9A5B', 'line-width': 2.5 } })

      setReady(true)
    })

    // Registered once. Reads through valueRef so it never closes over a stale value.
    map.current.on('click', (e) => {
      const pt = { lat: +e.lngLat.lat.toFixed(6), lng: +e.lngLat.lng.toFixed(6) }
      if (mode === 'point') { onChange(pt); return }
      const current = valueRef.current || []
      if (current.length >= CORNER_LABELS.length) return   // four corners is the whole shape
      onChange([...current, pt])
    })

    map.current.getCanvas().style.cursor = 'crosshair'

    return () => {
      markers.current.forEach(m => m.remove())
      markers.current = []
      map.current?.remove()
      map.current = null
    }
  }, [])

  // ── Markers + polygon follow `value` ───────────────────────────────────────
  useEffect(() => {
    if (!ready || !map.current) return

    markers.current.forEach(m => m.remove())
    markers.current = points.map((p, i) => {
      const el = document.createElement('div')
      Object.assign(el.style, {
        width: '26px', height: '26px', borderRadius: '50%',
        background: '#8A9A5B', border: '2.5px solid #fff',
        boxShadow: '0 2px 8px rgba(0,0,0,0.45)',
        color: '#fff', fontSize: '12px', fontWeight: '800',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      })
      el.textContent = mode === 'corners' ? CORNER_LABELS[i] : '📍'
      if (mode === 'point') el.style.background = '#E24B4A'
      return new maplibregl.Marker({ element: el, anchor: 'center' })
        .setLngLat([p.lng, p.lat])
        .addTo(map.current)
    })

    map.current.getSource('draft')?.setData(polygonFC(points))
  }, [ready, value])

  // ── Context polygons (plots already drawn in this session) ─────────────────
  useEffect(() => {
    if (!ready || !map.current) return
    map.current.getSource('existing')?.setData({
      type: 'FeatureCollection',
      features: existing
        .filter(e => e.points?.length >= 3)
        .map(e => ({ type: 'Feature', properties: { name: e.name }, geometry: { type: 'Polygon', coordinates: ring(e.points) } })),
    })
  }, [ready, existing])

  // ── Follow the parent's `center` after mount ───────────────────────────────
  //
  // The opening view is set once at init, but the parent can move it later — the
  // farm form geocodes its Location field as you leave it, so typing "Gurgaon"
  // brings the map here rather than leaving you to hunt for it. Compared by
  // VALUE: `center` is usually a fresh array literal each render, so an identity
  // check would re-fly the map on every keystroke elsewhere in the form.
  const flownTo = useRef(center ? `${center[0]},${center[1]}` : '')
  useEffect(() => {
    if (!ready || !map.current || !center) return
    // Once anything is placed, the map stops following. The plot form derives
    // `center` from the corners you tap, so without this the map would re-centre
    // under your finger on every corner.
    if (points.length) return
    const key = `${center[0]},${center[1]}`
    if (flownTo.current === key) return
    flownTo.current = key
    // Never zoom back out: if they have already zoomed past the town, a
    // re-centre should keep their detail.
    map.current.flyTo({ center, zoom: Math.max(map.current.getZoom(), 15), essential: true })
  }, [ready, center?.[0], center?.[1], points.length])

  // ── Place search ───────────────────────────────────────────────────────────
  //
  // OpenStreetMap's Nominatim: free, no API key. Fired only on explicit submit —
  // never per keystroke, which its usage policy forbids.
  const search = async (e) => {
    e.preventDefault()
    const q = query.trim()
    if (!q || searching) return
    setSearching(true)
    setSearchMsg('')
    try {
      const hit = await geocodePlace(q)
      if (!hit) { setSearchMsg(`Couldn't find "${q}" — try a nearby town.`); return }
      flownTo.current = `${hit[0]},${hit[1]}`   // ours, not the parent's — don't re-fly
      map.current?.flyTo({ center: hit, zoom: 15, essential: true })
    } catch {
      setSearchMsg('Search is unavailable right now — pan and zoom to your farm instead.')
    } finally {
      setSearching(false)
    }
  }

  const undo  = () => onChange(mode === 'corners' ? points.slice(0, -1) : null)
  const clear = () => onChange(mode === 'corners' ? [] : null)

  const acres = mode === 'corners' ? polygonAcres(points) : 0
  const done  = mode === 'corners' ? points.length === CORNER_LABELS.length : !!value

  return (
    <div>
      <form onSubmit={search} style={searchRow}>
        <input
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="Search a village, town or district…"
          style={searchInput}
        />
        <button type="submit" disabled={searching} style={searchBtn}>
          {searching ? '…' : 'Find'}
        </button>
      </form>
      {searchMsg && <p style={msg}>{searchMsg}</p>}

      <div style={{ position: 'relative' }}>
        <div ref={container} style={{ height: `${height}px`, borderRadius: '10px', overflow: 'hidden', border: '1.5px solid var(--c-border-md)' }} />

        <div style={hint}>
          {mode === 'point'
            ? (done ? 'Tap again to move the pin' : 'Tap the map to drop a pin on your farm')
            : (done ? 'All four corners set' : `Tap corner ${CORNER_LABELS[points.length]} of ${CORNER_LABELS.length}`)}
        </div>
      </div>

      <div style={footRow}>
        <div style={{ fontSize: '12px', color: 'var(--c-muted)', minWidth: 0 }}>
          {mode === 'corners' && done && (
            <span><strong style={{ color: '#8A9A5B' }}>≈ {acres.toFixed(2)} acres</strong> from the shape you drew</span>
          )}
          {mode === 'point' && value && (
            <span>{value.lat.toFixed(5)}, {value.lng.toFixed(5)}</span>
          )}
        </div>
        {points.length > 0 && (
          <div style={{ display: 'flex', gap: '6px', flexShrink: 0 }}>
            <button type="button" onClick={undo}  style={miniBtn}>Undo</button>
            <button type="button" onClick={clear} style={miniBtn}>Clear</button>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Styles ────────────────────────────────────────────────────────────────────

const searchRow = { display: 'flex', gap: '6px', marginBottom: '8px' }
const searchInput = {
  flex: 1, padding: '9px 12px', border: '1.5px solid var(--c-border-md)',
  background: 'var(--c-input)', color: 'var(--c-text)',
  borderRadius: '8px', fontSize: '13px', boxSizing: 'border-box', outline: 'none', minWidth: 0,
}
const searchBtn = {
  padding: '9px 16px', border: 'none', borderRadius: '8px', background: '#8A9A5B',
  color: '#fff', fontSize: '13px', fontWeight: 700, cursor: 'pointer', flexShrink: 0,
}
const hint = {
  position: 'absolute', left: '10px', bottom: '10px',
  background: 'rgba(17,24,39,0.82)', color: '#fff',
  padding: '5px 10px', borderRadius: '99px', fontSize: '13px', fontWeight: 600,
  pointerEvents: 'none', maxWidth: 'calc(100% - 20px)',
}
const footRow = {
  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
  gap: '8px', marginTop: '8px', minHeight: '24px',
}
const miniBtn = {
  padding: '4px 10px', border: '1px solid var(--c-border-md)', borderRadius: '6px',
  background: 'var(--c-surface)', color: 'var(--c-text)', fontSize: '13px', fontWeight: 700, cursor: 'pointer',
}
const msg = { margin: '0 0 8px', fontSize: '12px', color: '#b45309' }

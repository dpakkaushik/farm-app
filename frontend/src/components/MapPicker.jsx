import { useEffect, useRef, useState } from 'react'
import maplibregl from 'maplibre-gl'
import PlaceSearch from './PlaceSearch'

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

// Where a plot's name is written. The average of its corners, not the polygon's
// true area centroid — on a four-corner field the two are a few metres apart and
// this only has to land inside the shape.
const centre = pts => [
  pts.reduce((sum, p) => sum + p.lng, 0) / pts.length,
  pts.reduce((sum, p) => sum + p.lat, 0) / pts.length,
]

const polygonFC = (pts, props = {}) => (
  pts.length < 3
    ? emptyFC
    : { type: 'FeatureCollection', features: [{ type: 'Feature', properties: props, geometry: { type: 'Polygon', coordinates: ring(pts) } }] }
)

export default function MapPicker({
  mode = 'point',
  value,                  // point: {lat,lng}|null   corners: [{lat,lng}, ...]
  onChange,
  center,                 // [lng, lat] — where to open
  existing = [],          // read-only polygons to show for context: [{name, points}]
  showSearch = true,      // off where the parent has its own place box (the farm form)
  height = 260,           // px, or 'fill' to take the height of whatever contains it
  chrome = true,          // false where the parent draws its own hint, readout and buttons
}) {
  const container = useRef(null)
  const map       = useRef(null)
  const markers   = useRef([])
  const valueRef  = useRef(value)
  const [ready,    setReady]    = useState(false)
  const [query,    setQuery]    = useState('')

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
      // Names live on their OWN point source. Labelling the polygon source
      // directly printed every name twice: maplibre clips a polygon at tile
      // boundaries and places one label per piece, and a field straddling two
      // tiles is the normal case, not the exception.
      map.current.addSource('existing-pts', { type: 'geojson', data: emptyFC })

      map.current.addLayer({ id: 'existing-fill', type: 'fill', source: 'existing', paint: { 'fill-color': '#ffffff', 'fill-opacity': 0.14 } })
      map.current.addLayer({ id: 'existing-line', type: 'line', source: 'existing', paint: { 'line-color': '#ffffff', 'line-width': 1.5, 'line-opacity': 0.7, 'line-dasharray': [2, 1] } })
      // A neighbouring shape without its name is just a dashed box — naming it is
      // how you know which edge you are drawing against. 'Open Sans Semibold' is
      // one of the two fontstacks the demotiles glyph server actually serves
      // (Open Sans Regular 404s), so do not "tidy" it to Regular.
      map.current.addLayer({
        id: 'existing-label', type: 'symbol', source: 'existing-pts',
        layout: { 'text-field': ['get', 'name'], 'text-font': ['Open Sans Semibold'], 'text-size': 11, 'text-allow-overlap': false },
        paint: { 'text-color': '#ffffff', 'text-halo-color': 'rgba(0,0,0,0.65)', 'text-halo-width': 1.2 },
      })
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
    const drawable = existing.filter(e => e.points?.length >= 3)

    map.current.getSource('existing')?.setData({
      type: 'FeatureCollection',
      features: drawable.map(e => ({
        type: 'Feature', properties: { name: e.name },
        geometry: { type: 'Polygon', coordinates: ring(e.points) },
      })),
    })
    map.current.getSource('existing-pts')?.setData({
      type: 'FeatureCollection',
      features: drawable.filter(e => e.name).map(e => ({
        type: 'Feature', properties: { name: e.name },
        geometry: { type: 'Point', coordinates: centre(e.points) },
      })),
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
    // 'corners' derives `center` from the corners you tap, so following it would
    // re-centre the map under your finger on every corner. 'point' never does —
    // its centre comes from a chosen suggestion or the Show-on-map button — so
    // there it follows, which is the whole point.
    if (mode === 'corners') return
    const key = `${center[0]},${center[1]}`
    if (flownTo.current === key) return
    flownTo.current = key
    // Never zoom back out: if they have already zoomed past the town, a
    // re-centre should keep their detail.
    map.current.flyTo({ center, zoom: Math.max(map.current.getZoom(), 15), essential: true })
  }, [ready, mode, center?.[0], center?.[1]])

  // ── Place search ───────────────────────────────────────────────────────────
  //
  // OpenStreetMap's Nominatim: free, no API key. Fired only on explicit submit —
  // never per keystroke, which its usage policy forbids.
  const undo  = () => onChange(mode === 'corners' ? points.slice(0, -1) : null)
  const clear = () => onChange(mode === 'corners' ? [] : null)

  const acres = mode === 'corners' ? polygonAcres(points) : 0
  const done  = mode === 'corners' ? points.length === CORNER_LABELS.length : !!value

  // 'fill' is how the full-screen drawing step gets a map the size of the phone
  // instead of a 240px box inside a scrolling form. Same map, same corner logic
  // — only the frame around it changes.
  const fill = height === 'fill'

  return (
    <div style={fill ? { height: '100%', display: 'flex', flexDirection: 'column', minHeight: 0 } : undefined}>
      {showSearch && (
        <div style={{ marginBottom: '8px' }}>
          <PlaceSearch
            value={query}
            onChange={setQuery}
            onPick={hit => {
              flownTo.current = `${hit.lng},${hit.lat}`   // ours, not the parent's
              map.current?.flyTo({ center: [hit.lng, hit.lat], zoom: 15, essential: true })
            }}
          />
        </div>
      )}

      <div style={fill ? { position: 'relative', flex: 1, minHeight: 0 } : { position: 'relative' }}>
        <div ref={container} style={fill
          ? { position: 'absolute', inset: 0 }
          : { height: `${height}px`, borderRadius: '10px', overflow: 'hidden', border: '1.5px solid var(--c-border-md)' }} />

        {chrome && (
          <div style={hint}>
            {mode === 'point'
              ? (done ? 'Tap again to move the pin' : 'Tap the map to drop a pin on your farm')
              : (done ? 'All four corners set' : `Tap corner ${CORNER_LABELS[points.length]} of ${CORNER_LABELS.length}`)}
          </div>
        )}
      </div>

      {chrome && <div style={footRow}>
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
      </div>}
    </div>
  )
}

// ── Styles ────────────────────────────────────────────────────────────────────

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

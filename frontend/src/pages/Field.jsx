import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import maplibregl from 'maplibre-gl'
import { useMapStore, useAppStore } from '../store'
import { useTreeStore } from '../store/trees'
import { useAuthStore, isManager, getActiveFarmRole } from '../store/auth'
import { farmApi } from '../api/client'
import SetupChecklist from '../components/SetupChecklist'
import { isActive, speciesEmoji, animalLabel } from './livestock/ui'
import {
  X, Layers, Upload, ZoomIn, ZoomOut, Navigation,
  Eye, EyeOff, CheckCircle2, Clock,
  Sprout, ChevronRight, Camera, ChevronDown,
} from 'lucide-react'

// ── Farm infrastructure (boundary outline + internal channel) ─────────────────
const FARM_CENTER  = [80.486362, 28.506379]
const FARM_CORNERS = [
  [80.482547, 28.510693], [80.488867, 28.510693],
  [80.488867, 28.504516], [80.482547, 28.504516],
]
const FARM_BOUNDARY_COORDS = [
  [80.482547, 28.504776], [80.485826, 28.504895], [80.487267, 28.504516],
  [80.487576, 28.505198], [80.487904, 28.505692], [80.488046, 28.506401],
  [80.488300, 28.507260], [80.488683, 28.508280], [80.488867, 28.508690],
  [80.487427, 28.509529], [80.485695, 28.510693], [80.485181, 28.509989],
  [80.484559, 28.509254], [80.484074, 28.508626], [80.483392, 28.507822],
  [80.484410, 28.507288], [80.483943, 28.506615], [80.483410, 28.505902],
  [80.482547, 28.504776],
]

// ── Build GeoJSON polygon — prefers stored geo_polygon, falls back to 4-point cols ─
function buildPolygonFromPoints(p) {
  // Use stored geo_polygon (drawn on map) if available
  if (p.geo_polygon) {
    const g = p.geo_polygon
    if (g.type === 'Feature')  return g
    if (g.type === 'Polygon')  return { type: 'Feature', geometry: g }
    if (g.geometry)            return { type: 'Feature', geometry: g.geometry }
  }
  // Fall back to individual point columns
  const pts = [
    [parseFloat(p.point_a_lng), parseFloat(p.point_a_lat)],
    [parseFloat(p.point_b_lng), parseFloat(p.point_b_lat)],
    [parseFloat(p.point_c_lng), parseFloat(p.point_c_lat)],
    [parseFloat(p.point_d_lng), parseFloat(p.point_d_lat)],
  ]
  if (pts.some(([lng, lat]) => isNaN(lng) || isNaN(lat))) return null
  return {
    type: 'Feature',
    geometry: { type: 'Polygon', coordinates: [[...pts, pts[0]]] },
  }
}

// ── Color helpers (driven by crop.color from DB) ───────────────────────────────
function hexToRgba(hex, alpha) {
  if (!hex) return `rgba(138,154,91,${alpha})`
  if (hex.startsWith('rgba')) return hex.replace(/[\d.]+\)$/, `${alpha})`)
  if (hex.startsWith('rgb(')) return hex.replace('rgb(', 'rgba(').replace(')', `,${alpha})`)
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  return `rgba(${r},${g},${b},${alpha})`
}

const getFillColor    = (p) => (!p.current_crop || p.stage === 'fallow') ? 'rgba(0,0,0,0)' : hexToRgba(p.crop_color, 0.55)
const getOutlineColor = (p) => {
  if (!p.current_crop || p.stage === 'fallow') return 'rgba(200,200,200,0.45)'
  if (p.isMixed)                               return 'rgba(255,255,255,0.95)'
  if (p.health_status === 'concern')           return '#E24B4A'
  if (p.stage === 'harvest_ready')             return '#ffffff'
  return hexToRgba(p.crop_color, 0.9)
}

function createHatchCanvas() {
  const size   = 12
  const canvas = document.createElement('canvas')
  canvas.width = size; canvas.height = size
  const ctx = canvas.getContext('2d')
  ctx.clearRect(0, 0, size, size)
  ctx.strokeStyle = 'rgba(255,255,255,0.65)'
  ctx.lineWidth   = 2
  for (let i = -size; i <= 2 * size; i += 6) {
    ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i + size, size); ctx.stroke()
  }
  // ImageData, not the canvas element. map.addImage() takes ImageData /
  // HTMLImageElement / ImageBitmap and throws on anything else — and a throw here
  // aborts the rest of the layer setup, which is how the tree dots spent two
  // sessions never being added to the map at all.
  return ctx.getImageData(0, 0, size, size)
}

// Fruit vs timber, told by shape as well as colour — a round canopy against a
// conifer. At 11px on a satellite photo, colour alone is not a distinction anyone
// can rely on; the silhouette is what actually reads.
const FRUIT_ICON =
  `<svg width="12" height="14" viewBox="0 0 10 12" style="display:block;flex-shrink:0"><circle cx="5" cy="4" r="3.7" fill="#4ADE80" stroke="rgba(0,0,0,0.55)" stroke-width="0.6"/><rect x="4.2" y="6.6" width="1.6" height="5" rx="0.6" fill="#4ADE80"/></svg>`
const TIMBER_ICON =
  `<svg width="12" height="14" viewBox="0 0 10 12" style="display:block;flex-shrink:0"><path d="M5 0.6 8.8 7.2 1.2 7.2Z" fill="#C08B4A" stroke="rgba(0,0,0,0.55)" stroke-width="0.6" stroke-linejoin="round"/><rect x="4.2" y="7" width="1.6" height="4.6" rx="0.6" fill="#C08B4A"/></svg>`

function getCentroid(feature) {
  const coords = feature?.geometry?.coordinates?.[0]
  if (!coords || coords.length < 2) return null
  const n = coords.length - 1
  let x = 0, y = 0
  for (let i = 0; i < n; i++) { x += coords[i][0]; y += coords[i][1] }
  return [x / n, y / n]
}

const DAYS = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat']

function getWeatherEmoji(code) {
  if (code === 0)  return '☀️'
  if (code <= 2)   return '🌤️'
  if (code <= 3)   return '☁️'
  if (code <= 48)  return '🌫️'
  if (code <= 57)  return '🌦️'
  if (code <= 65)  return '🌧️'
  if (code <= 77)  return '🌨️'
  if (code <= 82)  return '🌦️'
  return '⛈️'
}

function getWeatherCondition(code) {
  if (code === 0)  return 'Clear Sky'
  if (code <= 2)   return 'Partly Cloudy'
  if (code === 3)  return 'Overcast'
  if (code <= 48)  return 'Foggy'
  if (code <= 57)  return 'Drizzle'
  if (code <= 65)  return 'Rainy'
  if (code <= 82)  return 'Showers'
  return 'Thunderstorm'
}

// ── Compute today's date once per render ──────────────────────────────────────
const todayDate = () => { const d = new Date(); d.setHours(0,0,0,0); return d }

export default function Field() {
  const mapContainer = useRef(null)
  const map          = useRef(null)
  const saveTimer    = useRef(null)
  const markersRef   = useRef([])

  const { zoom, center, bearing, pitch, setMapState, overlay, setOverlay } = useMapStore()
  const { cropCycles, cropMaster, activities, issues, labourLogs, plots, livestockMaster } = useAppStore()
  const { activeFarm, activeFarmId } = useAuthStore()
  const location = useLocation()
  const navigate = useNavigate()
  const [showNewFarmBanner, setShowNewFarmBanner] = useState(false)
  useEffect(() => {
    if (new URLSearchParams(location.search).get('newFarm') === '1') setShowNewFarmBanner(true)
  }, [location.search])

  // The selection is a plot *id*, not a plot object.
  //
  // It used to hold the object parsed out of the clicked map feature, which meant
  // the open card was a snapshot: tapping a second plot while it was open left the
  // first plot's name and numbers on screen, and logging an activity didn't change
  // anything the card showed. Keeping the id and looking the plot up in livePlots
  // on every render fixes both — the card is always the live row.
  const [selectedPlotId, setSelectedPlotId]     = useState(null)
  const [showCoordPanel, setShowCoordPanel]     = useState(false)
  const [showOverlayPanel, setShowOverlayPanel] = useState(false)
  const [coordInput, setCoordInput]             = useState({ lat: '', lng: '' })
  const [overlayOpacity, setOverlayOpacity]     = useState(overlay?.opacity ?? 0.7)
  const [overlayVisible, setOverlayVisible]     = useState(true)
  const [uploading, setUploading]               = useState(false)
  const [currentZoom, setCurrentZoom]           = useState(zoom)
  const [weather,         setWeather]         = useState(null)
  const [forecast,        setForecast]        = useState(null)
  const [weatherExpanded, setWeatherExpanded] = useState(false)
  const [cropPanelOpen,   setCropPanelOpen]   = useState(false)

  const todayStr = new Date().toISOString().slice(0, 10)
  const { totalWorkers: todayWorkers, fieldCount: todayFields } = useMemo(() => {
    const todays = activities.filter(a => a.date === todayStr)
    const namedIds = new Set()
    let outside = 0
    const plotIds = new Set()
    todays.forEach(a => {
      ;(a.regularWorkerIds || []).forEach(id => namedIds.add(id))
      outside += a.outsideLabourCount || 0
      if (a.plotId) plotIds.add(a.plotId)
    })
    return { totalWorkers: namedIds.size + outside, fieldCount: plotIds.size }
  }, [activities, todayStr])

  useEffect(() => {
    fetch('https://api.open-meteo.com/v1/forecast?latitude=28.5073&longitude=80.4863&current=temperature_2m,relative_humidity_2m,weather_code,wind_speed_10m&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max&timezone=Asia/Kolkata&forecast_days=7')
      .then(r => r.json()).then(d => { setWeather(d.current); setForecast(d.daily) }).catch(() => {})
  }, [])

  // ── Compute live plot data — only plots with all 4 GPS points set in DB ────────
  const livePlots = useMemo(() => {
    const today    = todayDate()
    const todayStr = new Date().toISOString().slice(0, 10)

    return plots.map(p => {
      const geoPolygon = buildPolygonFromPoints(p)
      if (!geoPolygon) return null

      const activeCycles = cropCycles.filter(c => c.status === 'active' && c.plotId === p.id)
      const todayActs    = activities.filter(a =>
        a.date === todayStr &&
        (a.plotId === p.id || activeCycles.some(c => a.cropCycleId === c.id))
      )
      const todayNote   = todayActs[0]?.notes || null
      const uniqueTypes = [...new Set(todayActs.map(a => a.type).filter(Boolean))]
      const subLabel    = uniqueTypes.length > 0
        ? uniqueTypes.map(t => t.charAt(0).toUpperCase() + t.slice(1)).join(' + ')
        : null

      if (activeCycles.length === 0) {
        return {
          id: p.id, label: p.name || '', sub_label: subLabel || '',
          acres: Number(p.area_acres) || 0, geo_polygon: geoPolygon,
          stage: 'fallow', health_status: 'fallow', current_crop: null, crop_color: null,
          isMixed: false, mixedCycles: [],
          days_since_sow: null, days_to_harvest: null, season_cost: 0, progress_pct: 0,
          today_task: subLabel || null, today_note: todayNote, next_task: null, last_task: null,
        }
      }

      // Per-cycle computed data
      const cycleData = activeCycles.map(cycle => {
        const crop         = cropMaster.find(c => c.id === cycle.cropId)
        const sowDate      = new Date(cycle.sowDate); sowDate.setHours(0, 0, 0, 0)
        const daysSinceSow = Math.floor((today - sowDate) / 86400000)
        const totalDays    = crop?.duration_days || 120
        const windowOpenDay = totalDays - (crop?.harvest_window_days || 14)
        const daysToWindow  = Math.max(0, windowOpenDay - daysSinceSow)
        const isReady       = daysToWindow === 0
        const progressPct   = Math.min(100, Math.round(daysSinceSow / totalDays * 100))
        const acres         = cycle.acres || Number(p.area_acres) || 0
        const inputCost     = issues.filter(i => i.cropCycleId === cycle.id).reduce((s, i) => s + (i.totalCost || 0), 0)
        const lCost         = labourLogs.filter(l => l.cropCycleId === cycle.id).reduce((s, l) => s + (l.totalCost || 0), 0)
        // Pre-go-live spend on a standing crop — counted so this card agrees
        // with the Ledger's P&L for the same cycle.
        const openCost      = cycle.openingCost || 0
        return {
          cycleId:     cycle.id,
          cropId:      cycle.cropId,
          cropName:    crop?.name || 'Unknown',
          cropEmoji:   crop?.emoji || '🌾',
          cropColor:   crop?.color || '#8A9A5B',
          sowDate:     cycle.sowDate,
          daysSinceSow,
          totalDays,
          windowOpenDay,
          daysToWindow,
          isReady,
          progressPct,
          acres,
          seasonCost:  inputCost + lCost + openCost,
          estYield:    crop ? Math.round(acres * (crop.yieldPerAcre || 0)) : 0,
          estRevenue:  crop ? Math.round(acres * (crop.yieldPerAcre || 0) * (crop.pricePerQtl || 0)) : 0,
        }
      })

      const isMixed  = cycleData.length > 1
      // Primary = longest-duration crop (sugarcane takes precedence over mustard)
      const primary  = cycleData.reduce((a, b) => (a.totalDays >= b.totalDays ? a : b))
      const acres    = Number(p.area_acres) || 0

      let stage = 'growing'
      if (primary.isReady)                  stage = 'harvest_ready'
      else if (primary.daysToWindow <= 14)  stage = 'pre_harvest'
      if (isMixed)                          stage = 'mixed'

      const totalCost  = cycleData.reduce((s, c) => s + c.seasonCost, 0)
      const totalYield = cycleData.reduce((s, c) => s + c.estYield, 0)
      const totalRev   = cycleData.reduce((s, c) => s + c.estRevenue, 0)

      const allCycleIds = activeCycles.map(c => c.id)
      const cycleActs   = activities
        .filter(a => allCycleIds.includes(a.cropCycleId))
        .sort((a, b) => (b.date || '').localeCompare(a.date || ''))
      const lastAct  = cycleActs[0]
      const last_task = lastAct ? {
        label:    lastAct.notes || lastAct.type,
        days_ago: Math.max(0, Math.floor((today - new Date(lastAct.date)) / 86400000)),
      } : null

      return {
        id:              p.id,
        cycle_id:        primary.cycleId,
        label:           p.name,
        sub_label:       subLabel || '',
        crop_emoji:      primary.cropEmoji,
        acres,
        geo_polygon:     geoPolygon,
        stage,
        health_status:   'good',
        current_crop:    isMixed ? cycleData.map(c => c.cropName).join(' + ') : primary.cropName,
        crop_color:      primary.cropColor,
        isMixed,
        mixedCycles:     cycleData,
        days_since_sow:  primary.daysSinceSow,
        days_to_harvest: primary.daysToWindow,
        season_cost:     totalCost,
        progress_pct:    primary.progressPct,
        est_yield_qtl:   totalYield,
        est_revenue:     totalRev,
        today_task:      subLabel || null,
        today_note:      todayNote,
        next_task:       null,
        last_task,
      }
    }).filter(Boolean)
  }, [plots, cropCycles, cropMaster, activities, issues, labourLogs])

  // Looked up fresh on every render rather than stored, so the open card follows
  // the data: tap a second plot and it swaps, log an activity and it updates.
  const selectedPlot = selectedPlotId ? livePlots.find(p => p.id === selectedPlotId) : null

  // ── Crop summary strip ─────────────────────────────────────────────────────
  const cropSummary = useMemo(() => {
    const groups = {}
    livePlots.forEach(p => {
      if (!p.current_crop || p.stage === 'fallow') return

      const entries = p.isMixed && p.mixedCycles?.length
        ? p.mixedCycles.map(c => ({ name: c.cropName, yield: c.estYield, rev: c.estRevenue, dtw: c.daysToWindow }))
        : [{ name: p.current_crop, yield: p.est_yield_qtl || 0, rev: p.est_revenue || 0, dtw: p.days_to_harvest }]

      entries.forEach(e => {
        if (!groups[e.name]) groups[e.name] = { crop: e.name, acres: 0, daysToHarvest: null, estYield: 0, estRevenue: 0 }
        groups[e.name].acres      += p.acres
        groups[e.name].estYield   += e.yield
        groups[e.name].estRevenue += e.rev
        if (e.dtw != null) {
          if (groups[e.name].daysToHarvest === null || e.dtw < groups[e.name].daysToHarvest)
            groups[e.name].daysToHarvest = e.dtw
        }
      })
    })
    return Object.values(groups).sort((a, b) => b.acres - a.acres)
  }, [livePlots])

  const stageLegend = useMemo(() => {
    const seen  = new Set()
    const items = []
    let hasMixed = false
    livePlots.forEach(p => {
      if (p.isMixed) { hasMixed = true; return }
      if (p.current_crop && !seen.has(p.current_crop)) {
        seen.add(p.current_crop)
        items.push({ label: p.current_crop, color: hexToRgba(p.crop_color || '#8A9A5B', 0.55), isMixed: false })
      }
    })
    if (hasMixed) items.push({ label: 'Mixed Crop', color: null, isMixed: true })
    items.push({ label: 'Fallow / Empty', color: 'rgba(136,135,128,0.30)', isMixed: false })
    return items
  }, [livePlots])

  // ── Map init ───────────────────────────────────────────────────────────────
  useEffect(() => {
    if (map.current) return
    const STYLE = {
      version: 8,
      glyphs: 'https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf',
      sources: {
        'esri-satellite': { type:'raster', tiles:['https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'], tileSize:256, maxzoom:19 },
        'esri-labels':    { type:'raster', tiles:['https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}'], tileSize:256, maxzoom:19 },
      },
      layers: [
        { id:'satellite', type:'raster', source:'esri-satellite' },
        { id:'labels',    type:'raster', source:'esri-labels', paint:{ 'raster-opacity':0.85 } },
      ],
    }
    // Open on the active farm's saved centre when it has one, so a new farm never
    // even briefly shows the demo farm's location. The store default (a neutral
    // India view) is used only until the owner sets a centre.
    const savedMS    = useAuthStore.getState().activeFarm?.map_state
    const initCenter = savedMS?.center || center
    const initZoom   = savedMS?.zoom   || zoom
    map.current = new maplibregl.Map({ container: mapContainer.current, style: STYLE, center: initCenter, zoom: initZoom, bearing, pitch, attributionControl: false })
    map.current.addControl(new maplibregl.AttributionControl({ compact:true }), 'bottom-right')
    map.current.addControl(new maplibregl.ScaleControl(), 'bottom-left')
    map.current.on('load', () => {
      addPlotLayers()
      if (overlay) addOverlayLayer(overlay)
      // Fly to farm's saved location on first load
      const farmCenter = useAuthStore.getState().activeFarm?.map_state?.center
      if (farmCenter) map.current.flyTo({ center: farmCenter, zoom: useAuthStore.getState().activeFarm.map_state.zoom || 15, essential: true })
    })
    map.current.on('moveend', () => {
      const z = map.current.getZoom(), c = map.current.getCenter()
      setCurrentZoom(Math.round(z * 10) / 10)
      const state = { zoom:z, center:[c.lng,c.lat], bearing:map.current.getBearing(), pitch:map.current.getPitch() }
      setMapState(state)
      clearTimeout(saveTimer.current)
      saveTimer.current = setTimeout(() => useAuthStore.getState().saveActiveFarmMapState(state), 1000)
    })
    return () => { clearTimeout(saveTimer.current); markersRef.current.forEach(m => m.remove()); map.current?.remove(); map.current = null }
  }, [])

  // Fly to farm location when active farm changes
  useEffect(() => {
    if (!map.current || !activeFarm?.map_state?.center) return
    map.current.flyTo({ center: activeFarm.map_state.center, zoom: activeFarm.map_state.zoom || 15, essential: true })
  }, [activeFarmId])

  // Refresh map polygons + labels whenever live data changes
  useEffect(() => {
    if (map.current?.getSource('plots')) {
      refreshPlotLayers(livePlots)
      refreshLabels(livePlots)
    }
  }, [livePlots])

  // ── Trees ───────────────────────────────────────────────────────────────────
  const treeSpecies   = useTreeStore(s => s.species)
  const treePlantings = useTreeStore(s => s.plantings)
  const loadTrees     = useTreeStore(s => s.load)

  useEffect(() => { loadTrees().catch(() => {}) }, [activeFarmId])

  // Trees per plot: one icon and a count, on the plot's label.
  //
  // There was a dot per tree here for a while — a synthesized point for each of the
  // 1,657 eucalyptus in Plot A. It was honest about where trees are and useless to
  // look at: a wash of speckle that buried the map without telling you anything you
  // could act on. The count is the fact worth showing, and the plot is the unit it
  // belongs to.
  const treeByPlot = useMemo(() => {
    const speciesById = Object.fromEntries(treeSpecies.map(s => [s.id, s]))
    const acc = {}
    for (const p of treePlantings) {
      if (!p.plotId || !p.count) continue
      const sp = speciesById[p.speciesId]
      const e = acc[p.plotId] || (acc[p.plotId] = { total: 0, fruit: 0, timber: 0, names: [] })
      e.total += p.count
      if (sp?.purpose === 'timber') e.timber += p.count
      else                          e.fruit  += p.count
      if (sp) e.names.push(`${sp.nameEn || sp.nameLocal} ${p.count}`)
    }
    return acc
  }, [treePlantings, treeSpecies])

  // ── Livestock per plot ──────────────────────────────────────────────────────
  // Who is standing on which field. livestock_master.plot_id arrived in migration
  // 0021; before that an animal record had no link to land at all.
  //
  // Named animals collapse by species — three buffalo are one line reading
  // "Buffalo · Rani, Kali, Nimmi" — while a flock stays its own line, because a
  // flock is a headcount and not a name. Closed accounts (sold, deceased,
  // rehomed) are excluded: a plot shows working stock, not history.
  const livestockByPlot = useMemo(() => {
    const acc = {}
    for (const l of livestockMaster) {
      if (!l.plotId || !isActive(l)) continue
      const e = acc[l.plotId] || (acc[l.plotId] = { head: 0, birds: 0, herd: {}, flocks: [] })
      if (l.trackingMode === 'count') {
        const n = l.currentCount || 0
        e.birds += n
        e.flocks.push({ id: l.id, emoji: speciesEmoji(l), name: animalLabel(l) || 'Flock', count: n })
      } else {
        e.head += 1
        const key = (l.species || 'animal').toLowerCase()
        const g = e.herd[key] || (e.herd[key] = { emoji: speciesEmoji(l), label: key, names: [] })
        g.names.push(animalLabel(l) || '—')
      }
    }
    return acc
  }, [livestockMaster])

  const treeTotals = useMemo(() => {
    const t = Object.values(treeByPlot).reduce(
      (a, e) => ({ fruit: a.fruit + e.fruit, timber: a.timber + e.timber }), { fruit: 0, timber: 0 }
    )
    return { ...t, total: t.fruit + t.timber }
  }, [treeByPlot])

  // Labels are drawn from the map's load handler too, so the same ref trick applies.
  const treeByPlotRef = useRef(treeByPlot)
  useEffect(() => {
    treeByPlotRef.current = treeByPlot
    if (map.current?.getSource('plots')) refreshLabels(livePlots)
  }, [treeByPlot])

  const addPlotLayers = () => {
    map.current.addSource('farm-boundary', { type:'geojson', data:{
      type:'Feature', geometry:{ type:'Polygon', coordinates:[FARM_BOUNDARY_COORDS] }
    }})
    map.current.addLayer({ id:'farm-boundary-line', type:'line', source:'farm-boundary',
      paint:{ 'line-color':'#ffffff', 'line-width':2.5, 'line-opacity':0.55, 'line-dasharray':[4,3] }
    })
    map.current.addSource('plots', { type:'geojson', data:{ type:'FeatureCollection', features:[] } })
    map.current.addLayer({ id:'plot-fill',    type:'fill',   source:'plots', paint:{ 'fill-color':['get','color'], 'fill-opacity':1 } })
    map.current.addLayer({ id:'plot-outline', type:'line',   source:'plots', paint:{ 'line-color':['get','outline'], 'line-width':1.8, 'line-opacity':0.95 } })
    // Trees are drawn as a badge on the plot label, not as a layer — see treeByPlot.
    //
    // Diagonal stripe overlay for mixed-crop plots. Purely decorative, and it lives
    // last and inside a try: nothing else on this map should ever die with it.
    // (It threw for months on a raw <canvas>, and took the layers below it down.)
    try {
      map.current.addImage('mixed-hatch', createHatchCanvas())
      map.current.addLayer({ id:'plot-hatch', type:'fill', source:'plots',
        filter: ['==', ['get', 'is_mixed'], true],
        paint:  { 'fill-pattern': 'mixed-hatch' },
      })
    } catch (_) {}
    // labels rendered as HTML markers — no glyph server dependency
    map.current.on('click', 'plot-fill', (e) => {
      const id = e.features[0]?.properties?.id
      if (id) setSelectedPlotId(id)
    })
    map.current.on('mouseenter', 'plot-fill', () => { map.current.getCanvas().style.cursor = 'pointer' })
    map.current.on('mouseleave', 'plot-fill', () => { map.current.getCanvas().style.cursor = '' })
    refreshPlotLayers(livePlots)
    refreshLabels(livePlots)
  }

  const refreshLabels = (plotData) => {
    markersRef.current.forEach(m => m.remove())
    markersRef.current = []
    if (!map.current) return
    plotData.forEach(p => {
      if (!p.geo_polygon) return
      const center = getCentroid(p.geo_polygon)
      if (!center) return
      const el = document.createElement('div')
      el.style.pointerEvents = 'none'
      el.style.textAlign = 'center'
      const t = treeByPlotRef.current[p.id]
      const seg = (icon, n, color) =>
        `<span style="display:inline-flex;align-items:center;gap:3px">${icon}<span style="color:${color};font-size:11px;font-weight:700;font-family:system-ui,sans-serif;line-height:1.3">${n.toLocaleString('en-IN')}</span></span>`
      const parts = t
        ? [ t.fruit  ? seg(FRUIT_ICON,  t.fruit,  '#86EFAC') : '',
            t.timber ? seg(TIMBER_ICON, t.timber, '#E0B080') : '' ].filter(Boolean)
        : []
      const treeBadge = parts.length
        ? `<div style="margin-top:2px;display:inline-flex;align-items:center;gap:5px;background:rgba(0,0,0,0.72);border:1px solid rgba(255,255,255,0.22);border-radius:999px;padding:1.5px 7px">${parts.join('<span style="width:1px;height:9px;background:rgba(255,255,255,0.2)"></span>')}</div>`
        : ''
      el.innerHTML = `<div style="white-space:nowrap"><div style="background:rgba(0,0,0,0.6);border-radius:6px;padding:2px 6px;border:1px solid rgba(255,255,255,0.18)"><span style="color:#fff;font-size:12px;font-weight:700;font-family:system-ui,sans-serif;display:block;line-height:1.3;text-shadow:0 1px 3px rgba(0,0,0,1)">${p.label}</span>${p.sub_label ? `<span style="color:rgba(255,255,255,0.82);font-size:10px;font-family:system-ui,sans-serif;display:block;line-height:1.2;text-shadow:0 1px 2px rgba(0,0,0,1)">${p.sub_label}</span>` : ''}</div>${treeBadge}</div>`
      const marker = new maplibregl.Marker({ element: el, anchor: 'center' })
        .setLngLat(center)
        .addTo(map.current)
      markersRef.current.push(marker)
    })
  }

  const refreshPlotLayers = (plotData) => {
    if (!map.current?.getSource('plots')) return
    const features = plotData.filter(p => p.geo_polygon).map(p => ({
      ...p.geo_polygon,
      properties: {
        id:         p.id,          // the card looks the rest up live off this
        label:      p.label,
        crop_short: p.sub_label || '',
        emoji:      p.crop_emoji || '',
        color:      getFillColor(p),
        outline:    getOutlineColor(p),
        is_mixed:   p.isMixed || false,
      },
    }))
    map.current.getSource('plots').setData({ type:'FeatureCollection', features })
  }

  // ── Overlay ────────────────────────────────────────────────────────────────
  const addOverlayLayer = (cfg) => {
    if (!map.current) return
    try { if (map.current.getLayer('plot-overlay')) map.current.removeLayer('plot-overlay'); if (map.current.getSource('plot-overlay')) map.current.removeSource('plot-overlay') } catch (_) {}
    map.current.addSource('plot-overlay', { type:'image', url:cfg.storageUrl, coordinates:cfg.coordinates })
    map.current.addLayer({ id:'plot-overlay', type:'raster', source:'plot-overlay', paint:{ 'raster-opacity':cfg.opacity } }, 'plot-fill')
  }
  const updateOverlayOpacity = (val) => { setOverlayOpacity(val); if (map.current?.getLayer('plot-overlay')) map.current.setPaintProperty('plot-overlay','raster-opacity',val) }
  const toggleOverlayVisibility = () => { const next = !overlayVisible; setOverlayVisible(next); if (map.current?.getLayer('plot-overlay')) map.current.setLayoutProperty('plot-overlay','visibility',next?'visible':'none') }
  const loadFarmLayout = () => { const cfg = { storageUrl:'/layout.png', coordinates:FARM_CORNERS, opacity:overlayOpacity }; setOverlay(cfg); addOverlayLayer(cfg) }
  const removeOverlay = () => { setOverlay(null); try { if (map.current?.getLayer('plot-overlay')) map.current.removeLayer('plot-overlay'); if (map.current?.getSource('plot-overlay')) map.current.removeSource('plot-overlay') } catch (_) {} }
  const handleOverlayUpload = async (e) => {
    const file = e.target.files[0]; if (!file) return; setUploading(true)
    try { const cfg = { storageUrl:URL.createObjectURL(file), coordinates:FARM_CORNERS, opacity:overlayOpacity }; setOverlay(cfg); addOverlayLayer(cfg) }
    finally { setUploading(false); e.target.value='' }
  }

  const flyToCoords = (e) => {
    e.preventDefault()
    const lat = parseFloat(coordInput.lat), lng = parseFloat(coordInput.lng)
    if (isNaN(lat) || isNaN(lng)) return
    map.current.flyTo({ center:[lng,lat], zoom:map.current.getZoom(), essential:true })
  }
  const zoomIn  = () => map.current?.zoomIn({ duration:300 })
  const zoomOut = () => map.current?.zoomOut({ duration:300 })

  return (
    <div className="relative w-full h-full">
      <div ref={mapContainer} className="absolute inset-0" />

      {/* New-farm welcome banner + mid-year setup card, stacked */}
      <div className="absolute top-3 left-1/2 -translate-x-1/2 z-30 pointer-events-auto flex flex-col gap-2"
        style={{ width: 'calc(100% - 24px)', maxWidth: '420px' }}>
        {showNewFarmBanner && (
          <div style={{ background: '#8A9A5B', borderRadius: '12px', padding: '12px 14px', boxShadow: '0 4px 20px rgba(0,0,0,0.25)', display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
            <span style={{ fontSize: '22px', lineHeight: 1 }}>🎉</span>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: '13px', fontWeight: 700, color: '#fff', marginBottom: '2px' }}>Farm created! Now add your first plot.</div>
              <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.8)', lineHeight: 1.4 }}>
                Go to <strong>Admin → Fields</strong> to draw plot boundaries on this map.
              </div>
              <button
                onClick={() => { setShowNewFarmBanner(false); navigate('/admin') }}
                style={{ marginTop: '8px', padding: '6px 14px', border: 'none', borderRadius: '7px', background: '#fff', color: '#8A9A5B', fontSize: '12px', fontWeight: 700, cursor: 'pointer' }}
              >
                Add First Plot →
              </button>
            </div>
            <button onClick={() => setShowNewFarmBanner(false)}
              style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.7)', fontSize: '18px', cursor: 'pointer', lineHeight: 1, padding: 0 }}>
              ×
            </button>
          </div>
        )}
        <SetupChecklist />
      </div>

      {/* Greeting + Weather — compact top-left pills */}
      <div className="absolute top-3 left-3 flex flex-col gap-1.5 pointer-events-none" style={{ maxWidth: '175px' }}>
        {/* Greeting pill */}
        <div className="bg-black/70 backdrop-blur-md rounded-xl px-3 py-1.5 border border-white/10 self-start">
          <p className="text-white text-[11px] font-semibold">🌾 Hi {useAuthStore.getState().profile?.full_name?.split(' ')[0] || 'there'} · {activeFarm?.name || 'Farm'}</p>
          {todayWorkers > 0 && (
            <p className="text-white/60 text-[10px] mt-0.5 leading-tight">
              👷 {todayWorkers} working · {todayFields} field{todayFields !== 1 ? 's' : ''}
            </p>
          )}
        </div>

        {/* Weather pill — tap to expand */}
        {weather && (
          <div className="pointer-events-auto">
            <button onClick={() => setWeatherExpanded(v => !v)}
              className="bg-black/70 backdrop-blur-md rounded-xl px-3 py-1.5 border border-white/10 flex items-center gap-2 hover:bg-black/80 transition-colors">
              <span className="text-lg leading-none">{getWeatherEmoji(weather.weather_code)}</span>
              <span className="text-white font-bold text-sm">{Math.round(weather.temperature_2m)}°C</span>
              <span className="text-white/45 text-[10px]">{getWeatherCondition(weather.weather_code)}</span>
              <ChevronDown size={11} className={`text-white/40 shrink-0 transition-transform duration-200 ${weatherExpanded ? 'rotate-180' : ''}`} />
            </button>

            {/* Expanded: details + 7-day */}
            {weatherExpanded && (
              <div className="mt-1.5 bg-black/70 backdrop-blur-md rounded-xl p-3 border border-white/10" style={{ width: '230px' }}>
                <div className="flex gap-3 text-[10px] text-white/45 mb-2.5 pb-2 border-b border-white/8">
                  <span>💧 {weather.relative_humidity_2m}%</span>
                  <span>💨 {Math.round(weather.wind_speed_10m)} km/h</span>
                </div>
                {forecast && (
                  <div className="flex gap-2.5 overflow-x-auto no-scrollbar">
                    {forecast.time?.map((date, i) => (
                      <div key={date} className="flex flex-col items-center gap-0.5 min-w-[30px]">
                        <span className="text-[9px] text-white/40 font-medium">{i === 0 ? 'Now' : DAYS[new Date(date + 'T00:00:00').getDay()]}</span>
                        <span className="text-base leading-snug">{getWeatherEmoji(forecast.weather_code?.[i] ?? 0)}</span>
                        <span className="text-[10px] font-bold text-white">{Math.round(forecast.temperature_2m_max?.[i] ?? 0)}°</span>
                        <span className="text-[9px] text-white/30">{Math.round(forecast.temperature_2m_min?.[i] ?? 0)}°</span>
                        {(forecast.precipitation_probability_max?.[i] ?? 0) > 20 && (
                          <span className="text-[8px] text-blue-400">{forecast.precipitation_probability_max[i]}%</span>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Zoom badge */}
      <div className="absolute top-3 left-1/2 -translate-x-1/2 bg-black/60 backdrop-blur-sm rounded-full px-3 py-1 text-xs text-white/70 pointer-events-none">
        z {currentZoom}
      </div>

      {/* Crop summary drawer — handle on left edge */}
      {cropSummary.length > 0 && (<>
        {/* Tap-outside backdrop */}
        {cropPanelOpen && (
          <div className="absolute inset-0 z-10" onClick={() => setCropPanelOpen(false)} />
        )}

        {/* Sliding panel */}
        <div className={`absolute top-0 bottom-0 left-0 z-20 flex transition-transform duration-300 ease-out ${cropPanelOpen ? 'translate-x-0' : '-translate-x-full'}`}
          style={{ width: cropSummary.length > 4 ? '268px' : '180px' }}>
          <div className="flex-1 bg-black/80 backdrop-blur-md border-r border-white/10 p-3 overflow-y-auto">
            <p className="text-[9px] text-white/35 uppercase tracking-widest mb-2.5 font-semibold">Active Crops</p>
            <div className={`grid gap-2 ${cropSummary.length > 4 ? 'grid-cols-2' : 'grid-cols-1'}`}>
              {cropSummary.map(g => (
                <div key={g.crop} className="bg-white/8 rounded-xl p-2.5 border border-white/10">
                  <p className="text-xs font-bold text-white truncate">{g.crop}</p>
                  <p className="text-[10px] text-white/45 mt-0.5">{g.acres.toFixed(1)} ac</p>
                  <p className="text-[10px] text-[#8A9A5B] font-semibold">~{g.estYield} qtl</p>
                  <p className="text-[10px] text-white/35">₹{(g.estRevenue/1000).toFixed(0)}k est.</p>
                  {g.daysToHarvest !== null && (
                    <p className="text-[10px] text-[#BA7517] font-medium mt-0.5">
                      {g.daysToHarvest <= 0 ? '🎯 Ready' : `${g.daysToHarvest}d left`}
                    </p>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Handle tab — always visible on left edge */}
        <button
          onClick={() => setCropPanelOpen(v => !v)}
          className="absolute z-20 flex items-center justify-center rounded-r-xl pointer-events-auto"
          style={{
            background: '#ffffff',
            boxShadow: '2px 0 8px rgba(0,0,0,0.35)',
            width: '22px', height: '56px',
            left: cropPanelOpen ? (cropSummary.length > 4 ? '268px' : '180px') : '0px',
            top: '50%', transform: 'translateY(-50%)',
            transition: 'left 0.3s ease-out',
          }}>
          <ChevronRight size={13} className={`text-[#8A9A5B] transition-transform duration-300 ${cropPanelOpen ? 'rotate-180' : ''}`} />
        </button>
      </>)}

      {/* Right controls */}
      {/* z-30 keeps these above the plot card's tap-to-close backdrop (z-10);
          without it, zooming while a card is open just closed the card. */}
      <div className="absolute top-3 right-3 z-30 flex flex-col gap-2">
        <button onClick={zoomIn}  className="map-btn"><ZoomIn  size={16}/></button>
        <button onClick={zoomOut} className="map-btn"><ZoomOut size={16}/></button>
        <button onClick={() => { setShowCoordPanel(v=>!v); setShowOverlayPanel(false) }} className="map-btn"><Navigation size={16}/></button>
        <button onClick={() => { setShowOverlayPanel(v=>!v); setShowCoordPanel(false) }} className={`map-btn ${overlay ? 'ring-1 ring-[#8A9A5B]' : ''}`}><Layers size={16}/></button>
      </div>

      {/* Coordinate panel */}
      {showCoordPanel && (
        <div className="absolute top-3 right-14 z-30 bg-[var(--c-nav)]/95 backdrop-blur-sm rounded-xl p-4 w-64 shadow-xl border border-white/10">
          <div className="flex justify-between items-center mb-3">
            <span className="text-xs font-semibold text-white uppercase tracking-wide">Go to Coordinates</span>
            <button onClick={() => setShowCoordPanel(false)} className="text-white/40 hover:text-white"><X size={14}/></button>
          </div>
          <form onSubmit={flyToCoords} className="space-y-2">
            <input type="number" step="any" placeholder="Latitude" value={coordInput.lat} onChange={e=>setCoordInput(v=>({...v,lat:e.target.value}))} className="w-full bg-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-white/30 border border-white/10 focus:outline-none focus:border-[#8A9A5B]"/>
            <input type="number" step="any" placeholder="Longitude" value={coordInput.lng} onChange={e=>setCoordInput(v=>({...v,lng:e.target.value}))} className="w-full bg-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-white/30 border border-white/10 focus:outline-none focus:border-[#8A9A5B]"/>
            <button type="submit" className="w-full bg-[#8A9A5B] text-white text-sm font-medium rounded-lg py-2">Fly There</button>
          </form>
        </div>
      )}

      {/* Overlay panel */}
      {showOverlayPanel && (
        <div className="absolute top-3 right-14 z-30 bg-[var(--c-nav)]/95 backdrop-blur-sm rounded-xl p-4 w-72 shadow-xl border border-white/10">
          <div className="flex justify-between items-center mb-3">
            <span className="text-xs font-semibold text-white uppercase tracking-wide">Plot Layout Overlay</span>
            <button onClick={() => setShowOverlayPanel(false)} className="text-white/40 hover:text-white"><X size={14}/></button>
          </div>
          {!overlay ? (
            <div className="space-y-2">
              <button onClick={loadFarmLayout} className="w-full flex items-center gap-3 bg-[#8A9A5B]/15 border border-[#8A9A5B]/40 hover:border-[#8A9A5B] rounded-xl px-4 py-3 text-left transition-colors">
                <Layers size={18} className="text-[#8A9A5B] shrink-0"/>
                <div><p className="text-xs font-semibold text-[#8A9A5B]">Use Farm Layout</p><p className="text-[10px] text-white/40">Loads layout.png over your farm</p></div>
              </button>
              <label className="flex flex-col items-center gap-2 border-2 border-dashed border-white/20 rounded-xl p-4 cursor-pointer hover:border-white/40 transition-colors">
                <Upload size={18} className="text-white/30"/>
                <span className="text-xs text-white/40">Upload PNG overlay</span>
                <input type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={handleOverlayUpload} disabled={uploading}/>
              </label>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs text-[#8A9A5B] font-medium">✓ Overlay active</span>
                <button onClick={toggleOverlayVisibility} className="flex items-center gap-1 text-xs text-white/50 hover:text-white">
                  {overlayVisible ? <Eye size={13}/> : <EyeOff size={13}/>}{overlayVisible ? 'Visible' : 'Hidden'}
                </button>
              </div>
              <div>
                <div className="flex justify-between mb-1"><label className="text-xs text-white/50">Opacity</label><span className="text-xs text-white/50">{Math.round(overlayOpacity*100)}%</span></div>
                <input type="range" min="0.1" max="1" step="0.05" value={overlayOpacity} onChange={e=>updateOverlayOpacity(parseFloat(e.target.value))} className="w-full accent-[#8A9A5B]"/>
              </div>
              <div className="flex gap-2 pt-1">
                <label className="flex-1 flex items-center justify-center gap-1 text-xs text-white/50 hover:text-white cursor-pointer border border-white/10 rounded-lg py-2 hover:border-white/30 transition-colors">
                  <Upload size={12}/> Replace<input type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={handleOverlayUpload} disabled={uploading}/>
                </label>
                <button onClick={removeOverlay} className="flex-1 text-xs text-[#E24B4A] border border-[#E24B4A]/20 rounded-lg py-2 hover:bg-[#E24B4A]/10 transition-colors">Remove</button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Legend */}
      {/* Legend sits above the floating nav pill, which overlays the map. */}
      <div className="absolute left-3 bg-black/60 backdrop-blur-sm rounded-xl p-3 text-xs space-y-1.5"
        style={{ bottom: 'calc(96px + env(safe-area-inset-bottom, 0px))' }}>
        <p className="text-white/40 text-[10px] uppercase tracking-wide mb-1.5">Crop</p>
        {stageLegend.map(({ label, color, isMixed }) => (
          <div key={label} className="flex items-center gap-2">
            {isMixed ? (
              <span className="w-3 h-3 rounded-sm inline-block border border-white/30 shrink-0"
                style={{ background: 'repeating-linear-gradient(-45deg,rgba(255,255,255,0.35),rgba(255,255,255,0.35) 1.5px,rgba(255,255,255,0.08) 1.5px,rgba(255,255,255,0.08) 5px)' }}/>
            ) : (
              <span className="w-3 h-3 rounded-sm inline-block border border-white/20 shrink-0" style={{ background: color }}/>
            )}
            <span className="text-white/80">{label}</span>
          </div>
        ))}

        {treeTotals.total > 0 && (
          <div className="pt-2 mt-1 border-t border-white/10 space-y-1.5">
            <p className="text-white/40 text-[10px] uppercase tracking-wide">
              Trees · {treeTotals.total.toLocaleString('en-IN')}
            </p>
            <div className="flex items-center gap-2">
              <span className="shrink-0" dangerouslySetInnerHTML={{ __html: FRUIT_ICON }}/>
              <span className="text-white/80">Fruit · {treeTotals.fruit.toLocaleString('en-IN')}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="shrink-0" dangerouslySetInnerHTML={{ __html: TIMBER_ICON }}/>
              <span className="text-white/80">Timber · {treeTotals.timber.toLocaleString('en-IN')}</span>
            </div>
          </div>
        )}
      </div>

      {selectedPlot && (
        <PlotDetailPanel
          plot={selectedPlot}
          trees={treeByPlot[selectedPlot.id]}
          stock={livestockByPlot[selectedPlot.id]}
          onClose={() => setSelectedPlotId(null)} />
      )}

      <style>{`
        .map-btn{display:flex;align-items:center;justify-content:center;width:36px;height:36px;border-radius:10px;background:rgba(26,31,46,0.9);border:1px solid var(--c-border-md);color:#fff;cursor:pointer;backdrop-filter:blur(4px);transition:background 0.15s;}
        .map-btn:hover{background:rgba(138,154,91,0.4);}
        @keyframes slide-up{from{transform:translateY(100%)}to{transform:translateY(0)}}
        .animate-slide-up{animation:slide-up 0.25s ease-out;}
        @keyframes pulse-ring{0%,100%{opacity:1}50%{opacity:0.4}}
        .pulse{animation:pulse-ring 1.8s ease-in-out infinite;}
        .no-scrollbar::-webkit-scrollbar{display:none;}
        .no-scrollbar{-ms-overflow-style:none;scrollbar-width:none;}
      `}</style>
    </div>
  )
}

// ── Plot detail panel ─────────────────────────────────────────────────────────
// One card, made of sections that each decide whether they have anything to say.
//
// This was five sibling components — empty, fallow, active, mixed, harvest-ready
// — each with its own header, its own stat grid and its own button row. The cost
// of that shape was invisible until you looked for it: only the "active crop"
// branch had anywhere to put extra facts, so a fallow plot's card could not tell
// you about the 1,657 eucalyptus standing on it, and no card at all could tell
// you about the buffalo. Now the crop is one section among several, and a
// crop-less plot with trees and animals on it is no longer a blank card.
//
// It is also read-only now. The Edit button up here wrote to component state and
// nothing else: the rename showed on the card, the map label kept saying the old
// name, and it was gone on close. Naming and geometry belong on Admin → Fields,
// where they persist.
const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

const fmtDay = (iso) => {
  if (!iso) return null
  const d = new Date(iso)
  return isNaN(d) ? null : `${d.getDate()} ${MONTHS[d.getMonth()]}`
}

const dayPlus = (iso, n) => {
  if (!iso || n == null) return null
  const d = new Date(iso)
  if (isNaN(d)) return null
  d.setDate(d.getDate() + n)
  return fmtDay(d)
}

// Lakhs, because ₹152,000 of expected wheat reads as noise and ₹1.5L doesn't.
const moneyK = (n) => {
  const v = Number(n || 0)
  if (v >= 100000) return `₹${(v / 100000).toFixed(1)}L`
  if (v >= 1000)   return `₹${Math.round(v / 1000)}k`
  return `₹${v.toLocaleString('en-IN')}`
}

const STAGE = {
  fallow:        { label: 'Fallow',      color: '#888780' },
  growing:       { label: 'Growing',     color: '#8A9A5B' },
  seeded:        { label: 'Seeded',      color: '#8A9A5B' },
  pre_harvest:   { label: 'Pre-harvest', color: '#BA7517' },
  harvest_ready: { label: 'Ready ✓',     color: '#8A9A5B' },
  mixed:         { label: 'Mixed crop',  color: '#4169E1' },
}

function PlotDetailPanel({ plot, trees, stock, onClose }) {
  const navigate = useNavigate()

  const cycles  = plot.mixedCycles || []
  const isReady = cycles.some(c => c.isReady)
  const stage   = STAGE[plot.stage] || STAGE.growing
  const canLog  = isManager(getActiveFarmRole())

  return (
    <>
      {/* Tapping the map outside the card closes it. The card used to be
          dismissable only by the ✕, which on a phone is a small target in a
          corner. z-40/z-50: the sheet must cover the floating nav pill, not
          slide up behind it. */}
      <div className="absolute inset-0 z-40" onClick={onClose} />

      <div className="absolute bottom-0 left-0 right-0 z-50 flex flex-col bg-[var(--c-nav)]/97 backdrop-blur-md rounded-t-2xl shadow-2xl border-t border-white/10 animate-slide-up max-h-[78vh]">
        {/* Header sits outside the scroll area, so ✕ never scrolls away on a
            plot with a lot on it. */}
        <div className="shrink-0 flex items-start gap-2 px-5 pt-4 pb-3 border-b border-white/8">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-bold text-white truncate">{plot.label}</h2>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full border shrink-0"
                style={{ color: stage.color, borderColor: `${stage.color}40`, background: `${stage.color}18` }}>
                {stage.label}
              </span>
            </div>
            <p className="text-xs text-white/45 mt-0.5 truncate">
              {plot.acres} acres{plot.current_crop ? ` · ${plot.current_crop}` : ''}
            </p>
          </div>
          <button onClick={() => navigate(`/media?plot=${plot.id}`)}
            className="shrink-0 flex items-center gap-1 text-[11px] text-white/40 hover:text-[#8A9A5B] px-2 py-1 rounded-lg transition-colors">
            <Camera size={13}/> Photos
          </button>
          <button onClick={onClose} className="shrink-0 text-white/40 hover:text-white p-1"><X size={18}/></button>
        </div>

        <div className="overflow-y-auto px-5 py-4 space-y-3">
          {cycles.length === 0 ? (
            <div className="flex items-center gap-2 rounded-xl border border-white/8 bg-white/4 px-3 py-2.5">
              <Sprout size={14} className="text-white/30 shrink-0"/>
              <p className="text-xs text-white/45">No crop growing here right now.</p>
            </div>
          ) : (
            cycles
              .slice()
              .sort((a, b) => b.totalDays - a.totalDays)
              .map(c => <CropRow key={c.cycleId} c={c} showAcres={cycles.length > 1} />)
          )}

          {cycles.length > 0 && (
            <MoneyStrip cost={plot.season_cost} yieldQtl={plot.est_yield_qtl} revenue={plot.est_revenue} />
          )}

          <TreeBlock trees={trees} />
          <StockBlock stock={stock} />

          {(plot.today_task || plot.last_task) && (
            <div className="space-y-2">
              {plot.today_task && (
                <TimelineRow icon={<Clock size={13} className="text-[#BA7517]"/>}
                  label={plot.today_note ? `${plot.today_task} — "${plot.today_note}"` : plot.today_task}
                  sub="Today" highlight />
              )}
              {plot.last_task && (
                <TimelineRow icon={<CheckCircle2 size={13} className="text-[#8A9A5B]"/>}
                  label={plot.last_task.label}
                  sub={plot.last_task.days_ago === 0 ? 'Today' : `${plot.last_task.days_ago}d ago`} done />
              )}
            </div>
          )}

          {/* These used to open two in-place modals with their own cut-down
              forms — a Log Activity that silently ignored the picked date, and
              an issue form whose labour path bypassed the contract-based Log
              Work entirely. The owner's call: take him to the real screens
              instead. Both modals are deleted. */}
          <div className="flex gap-2 pt-1">
            {canLog && <>
              <button onClick={() => navigate('/labour?go=log-work')}
                className="flex-1 py-2.5 text-xs font-medium rounded-xl bg-white/8 hover:bg-white/15 text-white border border-white/10 transition-colors">
                Log Work
              </button>
              <button onClick={() => navigate('/resources')}
                className="flex-1 py-2.5 text-xs font-medium rounded-xl bg-white/8 hover:bg-white/15 text-white border border-white/10 transition-colors">
                Issue Inputs
              </button>
            </>}
            {isReady && (
              <button onClick={() => navigate('/harvest')}
                className="flex-1 py-2.5 text-xs font-bold rounded-xl text-[#8A9A5B] border border-[#8A9A5B]/30 bg-[#8A9A5B]/12 hover:bg-[#8A9A5B]/20 transition-colors">
                🎯 Harvest
              </button>
            )}
          </div>
        </div>
      </div>
    </>
  )
}

// One row per crop cycle, so a single-crop plot and a mixed plot are the same
// code path — the mixed card used to be a separate component with a 2-up grid.
function CropRow({ c, showAcres }) {
  const harvestOn = dayPlus(c.sowDate, c.windowOpenDay)
  const sownOn    = fmtDay(c.sowDate)
  return (
    <div className="rounded-xl border p-3"
      style={{ borderColor: `${c.cropColor}35`, background: `${c.cropColor}10` }}>
      <div className="flex items-center justify-between gap-2 mb-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-base leading-none">{c.cropEmoji}</span>
          <p className="text-sm font-bold text-white truncate">{c.cropName}</p>
          {showAcres && <span className="text-[10px] text-white/35 shrink-0">{c.acres} ac</span>}
        </div>
        <span className="text-[11px] font-bold shrink-0"
          style={{ color: c.isReady ? '#8A9A5B' : c.cropColor }}>
          {c.isReady ? '🎯 Ready' : `${c.daysToWindow}d to harvest`}
        </span>
      </div>

      <div className="h-1.5 bg-black/25 rounded-full overflow-hidden">
        <div className="h-full rounded-full transition-all"
          style={{ width: `${c.progressPct}%`, background: c.cropColor }}/>
      </div>

      <div className="flex items-center justify-between text-[10px] text-white/40 mt-1.5">
        <span>Day {c.daysSinceSow} of {c.totalDays}</span>
        {sownOn && <span>Sown {sownOn}{harvestOn ? ` → ${harvestOn}` : ''}</span>}
      </div>
    </div>
  )
}

// Cost is real (issues + labour actually logged); yield and value are the crop
// master's estimate. The margin is the one number the owner opens this card for,
// so it gets its own line rather than being left as mental arithmetic.
function MoneyStrip({ cost, yieldQtl, revenue }) {
  const margin = Number(revenue || 0) - Number(cost || 0)
  const good   = margin >= 0
  const tone   = good ? '#8A9A5B' : '#E24B4A'
  return (
    <div>
      <div className="grid grid-cols-3 gap-2">
        <Stat label="Season cost" value={moneyK(cost)} />
        <Stat label="Est. yield"  value={`${yieldQtl || 0} qtl`} />
        <Stat label="Est. value"  value={moneyK(revenue)} />
      </div>
      {Number(revenue || 0) > 0 && (
        <div className="flex items-center justify-between mt-2 px-3 py-2 rounded-xl border"
          style={{ borderColor: `${tone}25`, background: `${tone}10` }}>
          <span className="text-[11px] text-white/55">Expected margin</span>
          <span className="text-xs font-bold" style={{ color: tone }}>
            {good ? '+' : '−'}{moneyK(Math.abs(margin))}
          </span>
        </div>
      )}
    </div>
  )
}

// Trees are attached to a plot in the database (tree_plantings.plot_id) and were
// already counted on the map label. This is the same figure, broken out.
function TreeBlock({ trees }) {
  if (!trees?.total) return null
  return (
    <Section icon="🌳" title="Trees on this plot" right={`${trees.total.toLocaleString('en-IN')} trees`}>
      <div className="flex flex-wrap gap-1.5">
        {trees.fruit  > 0 && <Chip color="#86EFAC">🥭 Fruit {trees.fruit.toLocaleString('en-IN')}</Chip>}
        {trees.timber > 0 && <Chip color="#E0B080">🪵 Timber {trees.timber.toLocaleString('en-IN')}</Chip>}
      </div>
      {trees.names?.length > 0 && (
        <p className="text-[10px] text-white/35 leading-relaxed mt-2">{trees.names.join(' · ')}</p>
      )}
    </Section>
  )
}

// Livestock standing on the plot — livestock_master.plot_id, added in 0021.
// Named animals are grouped by species so "🐃 Buffalo · Rani, Kali" is one line;
// a flock is a number and gets its own line with its count.
function StockBlock({ stock }) {
  const herd   = Object.values(stock?.herd || {})
  const flocks = stock?.flocks || []
  if (!herd.length && !flocks.length) return null

  const counts = [
    stock.head  ? `${stock.head} head`   : null,
    stock.birds ? `${stock.birds} birds` : null,
  ].filter(Boolean).join(' · ')

  return (
    <Section icon="🐄" title="Livestock kept here" right={counts}>
      <div className="space-y-1.5">
        {herd.map(g => (
          <div key={g.label} className="flex items-center gap-2 text-[11px] min-w-0">
            <span className="shrink-0">{g.emoji}</span>
            <span className="text-white/70 capitalize shrink-0">{g.label}</span>
            <span className="text-white/20 shrink-0">·</span>
            <span className="text-white/45 truncate">{g.names.join(', ')}</span>
          </div>
        ))}
        {flocks.map(f => (
          <div key={f.id} className="flex items-center gap-2 text-[11px] min-w-0">
            <span className="shrink-0">{f.emoji}</span>
            <span className="text-white/70 truncate">{f.name}</span>
            <span className="text-white/20 shrink-0">·</span>
            <span className="text-white/45 shrink-0">{f.count} birds</span>
          </div>
        ))}
      </div>
    </Section>
  )
}

function Section({ icon, title, right, children }) {
  return (
    <div className="rounded-xl bg-white/4 border border-white/8 p-3">
      <div className="flex items-center justify-between gap-2 mb-2">
        <p className="text-[11px] font-semibold text-white/70 flex items-center gap-1.5">
          <span>{icon}</span>{title}
        </p>
        {right && <span className="text-[10px] font-bold text-white/50 shrink-0">{right}</span>}
      </div>
      {children}
    </div>
  )
}

function Chip({ color, children }) {
  return (
    <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full"
      style={{ color, background: `${color}18`, border: `1px solid ${color}30` }}>
      {children}
    </span>
  )
}

function TimelineRow({ icon, label, sub, done, highlight }) {
  return (
    <div className={`flex items-center gap-3 px-3 py-2 rounded-lg ${highlight ? 'bg-[#BA7517]/10 border border-[#BA7517]/20' : 'bg-white/4'}`}>
      <span className="shrink-0">{icon}</span>
      <span className={`flex-1 text-xs min-w-0 truncate ${done ? 'text-white/50' : highlight ? 'text-white' : 'text-white/70'}`}>{label}</span>
      <span className={`text-[10px] shrink-0 ${highlight ? 'text-[#BA7517] font-semibold' : 'text-white/30'}`}>{sub}</span>
    </div>
  )
}

function Stat({ label, value, color }) {
  return (
    <div className="bg-white/5 rounded-xl p-3 border border-white/8">
      <p className="text-[10px] text-white/40 mb-1">{label}</p>
      <p className="text-sm font-semibold" style={color ? { color } : { color:'#fff' }}>{value}</p>
    </div>
  )
}


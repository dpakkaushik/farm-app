import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import maplibregl from 'maplibre-gl'
import { useMapStore, useAppStore } from '../store'
import { useAuthStore, isManager } from '../store/auth'
import { farmApi } from '../api/client'
import {
  X, Layers, Upload, ZoomIn, ZoomOut, Navigation,
  Eye, EyeOff, CheckCircle2, Clock, AlertTriangle,
  Wheat, Droplets, Sprout, Package, ChevronRight, Camera, ChevronDown,
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
  if (!hex) return `rgba(29,158,117,${alpha})`
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
  return canvas
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

  const { zoom, center, bearing, pitch, setMapState, overlay, setOverlay } = useMapStore()
  const { cropCycles, cropMaster, activities, issues, labourLogs, plots } = useAppStore()

  const [selectedPlot, setSelectedPlot]         = useState(null)
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
      const todayType = todayActs[0]?.type || null
      const todayNote = todayActs[0]?.notes || null
      const subLabel  = todayType ? todayType.charAt(0).toUpperCase() + todayType.slice(1) : null

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
        return {
          cycleId:     cycle.id,
          cropId:      cycle.cropId,
          cropName:    crop?.name || 'Unknown',
          cropEmoji:   crop?.emoji || '🌾',
          cropColor:   crop?.color || '#1D9E75',
          sowDate:     cycle.sowDate,
          daysSinceSow,
          totalDays,
          windowOpenDay,
          daysToWindow,
          isReady,
          progressPct,
          acres,
          seasonCost:  inputCost + lCost,
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
        sub_label:       isMixed
          ? cycleData.map(c => c.cropEmoji).join('')
          : `${primary.cropEmoji} ${primary.cropName.split(' ')[0]}`,
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
        items.push({ label: p.current_crop, color: hexToRgba(p.crop_color || '#1D9E75', 0.55), isMixed: false })
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
    map.current = new maplibregl.Map({ container: mapContainer.current, style: STYLE, center, zoom, bearing, pitch, attributionControl: false })
    map.current.addControl(new maplibregl.AttributionControl({ compact:true }), 'bottom-right')
    map.current.addControl(new maplibregl.ScaleControl(), 'bottom-left')
    map.current.on('load', () => {
      addPlotLayers()
      if (overlay) addOverlayLayer(overlay)
    })
    map.current.on('moveend', () => {
      const z = map.current.getZoom(), c = map.current.getCenter()
      setCurrentZoom(Math.round(z * 10) / 10)
      const state = { zoom:z, center:[c.lng,c.lat], bearing:map.current.getBearing(), pitch:map.current.getPitch() }
      setMapState(state)
      clearTimeout(saveTimer.current)
      saveTimer.current = setTimeout(() => farmApi.saveMapState?.('demo', state)?.catch?.(()=>{}), 1000)
    })
    return () => { clearTimeout(saveTimer.current); map.current?.remove(); map.current = null }
  }, [])

  // Refresh map polygons whenever live data changes
  useEffect(() => {
    if (map.current?.getSource('plots')) refreshPlotLayers(livePlots)
  }, [livePlots])

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
    // Diagonal stripe overlay for mixed-crop plots
    map.current.addImage('mixed-hatch', createHatchCanvas())
    map.current.addLayer({ id:'plot-hatch', type:'fill', source:'plots',
      filter: ['==', ['get', 'is_mixed'], true],
      paint:  { 'fill-pattern': 'mixed-hatch' },
    })
    map.current.addLayer({ id:'plot-label',   type:'symbol', source:'plots',
      layout:{ 'text-field':['concat',['get','label'],['case',['!=',['get','crop_short'],''],['concat','\n',['get','crop_short']],''],], 'text-size':11, 'text-anchor':'center', 'text-allow-overlap':true, 'text-ignore-placement':true },
      paint:{ 'text-color':'#fff', 'text-halo-color':'#000', 'text-halo-width':1.2 },
    })
    map.current.on('click', 'plot-fill', (e) => {
      const raw = e.features[0]?.properties?.__raw
      if (raw) setSelectedPlot(JSON.parse(raw))
    })
    map.current.on('mouseenter', 'plot-fill', () => { map.current.getCanvas().style.cursor = 'pointer' })
    map.current.on('mouseleave', 'plot-fill', () => { map.current.getCanvas().style.cursor = '' })
    refreshPlotLayers(livePlots)
  }

  const refreshPlotLayers = (plotData) => {
    if (!map.current?.getSource('plots')) return
    const features = plotData.filter(p => p.geo_polygon).map(p => ({
      ...p.geo_polygon,
      properties: {
        label:      p.label,
        crop_short: p.sub_label || '',
        emoji:      p.crop_emoji || '',
        color:      getFillColor(p),
        outline:    getOutlineColor(p),
        is_mixed:   p.isMixed || false,
        __raw:      JSON.stringify(p),
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

      {/* Greeting + Weather — compact top-left pills */}
      <div className="absolute top-3 left-3 flex flex-col gap-1.5 pointer-events-none" style={{ maxWidth: '175px' }}>
        {/* Greeting pill */}
        <div className="bg-black/70 backdrop-blur-md rounded-xl px-3 py-1.5 border border-white/10 self-start">
          <p className="text-white text-[11px] font-semibold">🌾 Hi {useAuthStore.getState().profile?.full_name?.split(' ')[0] || 'there'} · Pallia Farm</p>
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
                  <p className="text-[10px] text-[#1D9E75] font-semibold">~{g.estYield} qtl</p>
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
          <ChevronRight size={13} className={`text-[#1D9E75] transition-transform duration-300 ${cropPanelOpen ? 'rotate-180' : ''}`} />
        </button>
      </>)}

      {/* Right controls */}
      <div className="absolute top-3 right-3 flex flex-col gap-2">
        <button onClick={zoomIn}  className="map-btn"><ZoomIn  size={16}/></button>
        <button onClick={zoomOut} className="map-btn"><ZoomOut size={16}/></button>
        <button onClick={() => { setShowCoordPanel(v=>!v); setShowOverlayPanel(false) }} className="map-btn"><Navigation size={16}/></button>
        <button onClick={() => { setShowOverlayPanel(v=>!v); setShowCoordPanel(false) }} className={`map-btn ${overlay ? 'ring-1 ring-[#1D9E75]' : ''}`}><Layers size={16}/></button>
      </div>

      {/* Coordinate panel */}
      {showCoordPanel && (
        <div className="absolute top-3 right-14 bg-[var(--c-nav)]/95 backdrop-blur-sm rounded-xl p-4 w-64 shadow-xl border border-white/10">
          <div className="flex justify-between items-center mb-3">
            <span className="text-xs font-semibold text-white uppercase tracking-wide">Go to Coordinates</span>
            <button onClick={() => setShowCoordPanel(false)} className="text-white/40 hover:text-white"><X size={14}/></button>
          </div>
          <form onSubmit={flyToCoords} className="space-y-2">
            <input type="number" step="any" placeholder="Latitude" value={coordInput.lat} onChange={e=>setCoordInput(v=>({...v,lat:e.target.value}))} className="w-full bg-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-white/30 border border-white/10 focus:outline-none focus:border-[#1D9E75]"/>
            <input type="number" step="any" placeholder="Longitude" value={coordInput.lng} onChange={e=>setCoordInput(v=>({...v,lng:e.target.value}))} className="w-full bg-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-white/30 border border-white/10 focus:outline-none focus:border-[#1D9E75]"/>
            <button type="submit" className="w-full bg-[#1D9E75] text-white text-sm font-medium rounded-lg py-2">Fly There</button>
          </form>
        </div>
      )}

      {/* Overlay panel */}
      {showOverlayPanel && (
        <div className="absolute top-3 right-14 bg-[var(--c-nav)]/95 backdrop-blur-sm rounded-xl p-4 w-72 shadow-xl border border-white/10">
          <div className="flex justify-between items-center mb-3">
            <span className="text-xs font-semibold text-white uppercase tracking-wide">Plot Layout Overlay</span>
            <button onClick={() => setShowOverlayPanel(false)} className="text-white/40 hover:text-white"><X size={14}/></button>
          </div>
          {!overlay ? (
            <div className="space-y-2">
              <button onClick={loadFarmLayout} className="w-full flex items-center gap-3 bg-[#1D9E75]/15 border border-[#1D9E75]/40 hover:border-[#1D9E75] rounded-xl px-4 py-3 text-left transition-colors">
                <Layers size={18} className="text-[#1D9E75] shrink-0"/>
                <div><p className="text-xs font-semibold text-[#1D9E75]">Use Farm Layout</p><p className="text-[10px] text-white/40">Loads layout.png over your farm</p></div>
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
                <span className="text-xs text-[#1D9E75] font-medium">✓ Overlay active</span>
                <button onClick={toggleOverlayVisibility} className="flex items-center gap-1 text-xs text-white/50 hover:text-white">
                  {overlayVisible ? <Eye size={13}/> : <EyeOff size={13}/>}{overlayVisible ? 'Visible' : 'Hidden'}
                </button>
              </div>
              <div>
                <div className="flex justify-between mb-1"><label className="text-xs text-white/50">Opacity</label><span className="text-xs text-white/50">{Math.round(overlayOpacity*100)}%</span></div>
                <input type="range" min="0.1" max="1" step="0.05" value={overlayOpacity} onChange={e=>updateOverlayOpacity(parseFloat(e.target.value))} className="w-full accent-[#1D9E75]"/>
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
      <div className="absolute bottom-10 left-3 bg-black/60 backdrop-blur-sm rounded-xl p-3 text-xs space-y-1.5">
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
      </div>

      {selectedPlot && <PlotDetailPanel plot={selectedPlot} onClose={() => setSelectedPlot(null)} />}

      <style>{`
        .map-btn{display:flex;align-items:center;justify-content:center;width:36px;height:36px;border-radius:10px;background:rgba(26,31,46,0.9);border:1px solid var(--c-border-md);color:#fff;cursor:pointer;backdrop-filter:blur(4px);transition:background 0.15s;}
        .map-btn:hover{background:rgba(29,158,117,0.4);}
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
function PlotDetailPanel({ plot, onClose }) {
  const [editing,       setEditing]  = useState(false)
  const [showLogActivity, setShowLog]  = useState(false)
  const [showIssueInput,  setShowIssue] = useState(false)
  const [editLabel,     setEditLabel] = useState(plot.label)
  const [editAcres,     setEditAcres] = useState(String(plot.acres))
  const [localPlot,     setLocalPlot] = useState(plot)

  const saveEdit = () => {
    setLocalPlot(p => ({ ...p, label: editLabel.trim() || p.label, acres: parseFloat(editAcres) || p.acres }))
    setEditing(false)
  }

  if (editing) {
    return (
      <div className="absolute bottom-0 left-0 right-0 bg-[var(--c-nav)]/97 backdrop-blur-md rounded-t-2xl p-5 shadow-2xl border-t border-white/10 animate-slide-up">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-white">Edit Plot</h3>
          <button onClick={() => setEditing(false)} className="text-white/40 hover:text-white"><X size={16}/></button>
        </div>
        <div className="space-y-3">
          <div><label className="text-xs text-white/50 mb-1 block">Plot name</label>
            <input value={editLabel} onChange={e => setEditLabel(e.target.value)} className="w-full bg-white/10 border border-white/15 rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:border-[#1D9E75]"/></div>
          <div><label className="text-xs text-white/50 mb-1 block">Size (acres)</label>
            <input type="number" step="0.5" value={editAcres} onChange={e => setEditAcres(e.target.value)} className="w-full bg-white/10 border border-white/15 rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:border-[#1D9E75]"/></div>
          <button onClick={saveEdit} className="w-full py-3 bg-[#1D9E75] text-white font-semibold rounded-xl text-sm">Save Changes</button>
        </div>
      </div>
    )
  }

  if (showLogActivity) return <LogActivityModal plot={localPlot} onClose={() => setShowLog(false)} />
  if (showIssueInput)  return <IssueInputModal  plot={localPlot} onClose={() => setShowIssue(false)} />

  const props = { plot: localPlot, onClose, onEdit: () => setEditing(true),
    onLogActivity: () => setShowLog(true), onIssueInput: () => setShowIssue(true) }

  const { stage, isMixed } = localPlot
  if (stage === 'empty')         return <EmptyPlotPanel    {...props} />
  if (stage === 'fallow')        return <FallowPanel       {...props} />
  if (isMixed)                   return <MixedCropPanel    {...props} />
  if (stage === 'harvest_ready') return <HarvestReadyPanel {...props} />
  return <ActiveCropPanel {...props} />
}

function EmptyPlotPanel({ plot, onClose, onEdit }) {
  return (
    <PanelShell onClose={onClose} onEdit={onEdit} plotId={plot.id}>
      <div className="flex items-start justify-between mb-4">
        <div>
          <h2 className="text-lg font-bold text-white">{plot.label}</h2>
          <p className="text-sm text-white/40">{plot.acres} acres · Available</p>
        </div>
        <span className="text-xs bg-white/10 text-white/50 px-2.5 py-1 rounded-full border border-white/10">Empty</span>
      </div>
      <p className="text-xs text-white/35">No active crop cycle. Go to Today → Log Activity to start one.</p>
    </PanelShell>
  )
}

function FallowPanel({ plot, onClose, onEdit }) {
  return (
    <PanelShell onClose={onClose} onEdit={onEdit} plotId={plot.id}>
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-lg font-bold text-white">{plot.label}</h2>
          <p className="text-sm text-white/40">{plot.acres} acres · {plot.current_crop || 'Fallow'}</p>
        </div>
        <span className="text-xs bg-white/10 text-white/40 px-2.5 py-1 rounded-full border border-white/10">Fallow</span>
      </div>
      <p className="text-xs text-white/35 mt-3">No active crop cycle.</p>
    </PanelShell>
  )
}

function ActiveCropPanel({ plot, onClose, onEdit, onLogActivity, onIssueInput }) {
  const isPreHarvest = plot.stage === 'pre_harvest'
  const isConcern    = plot.health_status === 'concern'
  const stageLabel   = { seeded:'Seeded', growing:'Growing', pre_harvest:'Pre-Harvest' }[plot.stage] || 'Active'
  const stageColor   = isPreHarvest ? '#BA7517' : isConcern ? '#E24B4A' : '#1D9E75'

  return (
    <PanelShell onClose={onClose} onEdit={onEdit} plotId={plot.id}>
      <div className="flex items-start justify-between mb-3">
        <div>
          <h2 className="text-lg font-bold text-white">{plot.label}</h2>
          <p className="text-sm text-white/50">{plot.acres} ac · {plot.current_crop}</p>
        </div>
        <span className="text-xs font-semibold px-2.5 py-1 rounded-full border"
          style={{ color: stageColor, borderColor: `${stageColor}40`, background: `${stageColor}18` }}>
          {stageLabel}
        </span>
      </div>

      {isConcern && plot.concern_note && (
        <div className="flex items-start gap-2 bg-[#E24B4A]/10 border border-[#E24B4A]/25 rounded-xl px-3 py-2.5 mb-3">
          <AlertTriangle size={14} className="text-[#E24B4A] shrink-0 mt-0.5"/>
          <p className="text-xs text-[#E24B4A] leading-relaxed">{plot.concern_note}</p>
        </div>
      )}

      <div className="mb-4">
        <div className="flex justify-between text-xs text-white/45 mb-1.5">
          <span>Day {plot.days_since_sow} of crop cycle</span>
          <span style={{ color: stageColor }}>
            {plot.days_to_harvest != null
              ? isPreHarvest ? `Harvest in ${plot.days_to_harvest}d` : `${plot.days_to_harvest}d to harvest`
              : 'Long-cycle crop'}
          </span>
        </div>
        <div className="h-2 bg-white/10 rounded-full overflow-hidden">
          <div className="h-full rounded-full transition-all" style={{ width:`${plot.progress_pct}%`, background: stageColor }}/>
        </div>
      </div>

      {plot.today_task && (
        <div className="flex items-start gap-2.5 rounded-xl px-3 py-2.5 mb-3 border"
          style={{ background:`${isConcern ? '#E24B4A' : '#BA7517'}15`, borderColor:`${isConcern ? '#E24B4A' : '#BA7517'}30` }}>
          <Clock size={14} className="shrink-0 mt-0.5" style={{ color: isConcern ? '#E24B4A' : '#BA7517' }}/>
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wide mb-0.5" style={{ color: isConcern ? '#E24B4A' : '#BA7517' }}>Today</p>
            <p className="text-xs text-white/80">{plot.today_task}</p>
            {plot.today_note && <p className="text-[10px] text-white/50 mt-1 italic">"{plot.today_note}"</p>}
          </div>
        </div>
      )}

      <div className="space-y-2 mb-4">
        {plot.last_task && (
          <TimelineRow icon={<CheckCircle2 size={13} className="text-[#1D9E75]"/>} label={plot.last_task.label} sub={`${plot.last_task.days_ago}d ago`} done />
        )}
        {plot.next_task && (
          <TimelineRow icon={<Clock size={13} className="text-[#BA7517]"/>} label={plot.next_task.label}
            sub={plot.next_task.in_days === 0 ? 'Today' : plot.next_task.in_days === 1 ? 'Tomorrow' : `In ${plot.next_task.in_days} days`}
            highlight={plot.next_task.in_days <= 1}
          />
        )}
      </div>

      <div className="grid grid-cols-3 gap-2 mb-4">
        <Stat label="Season cost" value={`₹${(plot.season_cost||0).toLocaleString()}`}/>
        <Stat label="Health"      value={isConcern ? 'Concern' : plot.health_status === 'average' ? 'Monitor' : 'Healthy'} color={isConcern ? '#E24B4A' : plot.health_status === 'average' ? '#BA7517' : '#1D9E75'}/>
        <Stat label="Size"        value={`${plot.acres} ac`}/>
      </div>

      <div className="flex gap-2">
        {isManager(useAuthStore.getState().profile) && <>
          <button onClick={onLogActivity} className="flex-1 py-2.5 text-xs font-medium rounded-xl bg-white/8 hover:bg-white/15 text-white transition-colors border border-white/10">Log Activity</button>
          <button onClick={onIssueInput}  className="flex-1 py-2.5 text-xs font-medium rounded-xl bg-white/8 hover:bg-white/15 text-white transition-colors border border-white/10">Issue Inputs</button>
        </>}
        {!isPreHarvest && (
          <button className="flex-1 py-2.5 text-xs font-medium rounded-xl bg-white/8 text-white/40 border border-white/8 opacity-50 cursor-not-allowed" title="Harvest unlocks when crop is ready">
            Harvest 🔒
          </button>
        )}
        {isPreHarvest && (
          <button className="flex-1 py-2.5 text-xs font-semibold rounded-xl text-white border"
            style={{ background:'#BA751720', borderColor:'#BA751740', color:'#BA7517' }}>
            Prepare
          </button>
        )}
      </div>
    </PanelShell>
  )
}

function MixedCropPanel({ plot, onClose, onEdit, onLogActivity, onIssueInput }) {
  const navigate = useNavigate()
  return (
    <PanelShell onClose={onClose} onEdit={onEdit} plotId={plot.id}>
      <div className="flex items-start justify-between mb-4">
        <div>
          <h2 className="text-lg font-bold text-white">{plot.label}</h2>
          <p className="text-sm text-white/50">{plot.acres} ac</p>
        </div>
        <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-white/10 text-white/70 border border-white/20">🔀 Mixed Crop</span>
      </div>

      <div className="grid grid-cols-2 gap-2 mb-4">
        {plot.mixedCycles?.map(c => (
          <div key={c.cycleId} className={`rounded-xl p-3 border ${c.isReady ? 'bg-[#1D9E75]/15 border-[#1D9E75]/35' : 'bg-white/5 border-white/10'}`}>
            <p className="text-base mb-1">{c.cropEmoji}</p>
            <p className="text-xs font-bold text-white leading-tight">{c.cropName}</p>
            <p className="text-[10px] text-white/45 mt-1">Day {c.daysSinceSow}</p>
            <div className="mt-2 h-1 bg-white/10 rounded-full overflow-hidden">
              <div className="h-full rounded-full" style={{ width: `${c.progressPct}%`, background: c.cropColor }}/>
            </div>
            {c.isReady
              ? <p className="text-[10px] text-[#1D9E75] font-semibold mt-1.5">🎯 Ready</p>
              : <p className="text-[10px] text-white/40 mt-1.5">{c.daysToWindow}d to harvest</p>}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-2 mb-4">
        <Stat label="Season cost"  value={`₹${(plot.season_cost || 0).toLocaleString()}`}/>
        <Stat label="Est. yield"   value={`${plot.est_yield_qtl || 0} qtl`}/>
      </div>

      <div className="flex gap-2">
        {isManager(useAuthStore.getState().profile) && <>
          <button onClick={onLogActivity} className="flex-1 py-2.5 text-xs font-medium rounded-xl bg-white/8 hover:bg-white/15 text-white border border-white/10 transition-colors">Log Activity</button>
          <button onClick={onIssueInput}  className="flex-1 py-2.5 text-xs font-medium rounded-xl bg-white/8 hover:bg-white/15 text-white border border-white/10 transition-colors">Issue Inputs</button>
        </>}
        <button onClick={() => navigate('/harvest')} className="flex-1 py-2.5 text-xs font-medium rounded-xl text-[#1D9E75] border border-[#1D9E75]/30 bg-[#1D9E75]/10 hover:bg-[#1D9E75]/20 transition-colors">
          → Harvest
        </button>
      </div>
    </PanelShell>
  )
}

function HarvestReadyPanel({ plot, onClose, onEdit }) {
  return (
    <PanelShell onClose={onClose} onEdit={onEdit} plotId={plot.id}>
      <div className="flex items-start justify-between mb-3">
        <div>
          <h2 className="text-lg font-bold text-white">{plot.label}</h2>
          <p className="text-sm text-white/50">{plot.acres} ac · {plot.current_crop}</p>
        </div>
        <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-[#1D9E75]/20 text-[#1D9E75] border border-[#1D9E75]/30 pulse">Ready ✓</span>
      </div>
      <div className="mb-4">
        <div className="flex justify-between text-xs mb-1.5">
          <span className="text-white/45">Day {plot.days_since_sow} — harvest window open</span>
          <span className="text-[#1D9E75] font-medium">100% ✓</span>
        </div>
        <div className="h-2.5 bg-white/10 rounded-full overflow-hidden">
          <div className="h-full rounded-full bg-[#1D9E75]" style={{ width:'100%' }}/>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3 mb-4">
        <div className="bg-[#1D9E75]/10 border border-[#1D9E75]/20 rounded-xl p-3">
          <p className="text-[10px] text-[#1D9E75]/70 mb-1">Est. Yield</p>
          <p className="text-lg font-bold text-[#1D9E75]">{plot.est_yield_qtl} qtl</p>
        </div>
        <div className="bg-[#1D9E75]/10 border border-[#1D9E75]/20 rounded-xl p-3">
          <p className="text-[10px] text-[#1D9E75]/70 mb-1">Est. Revenue</p>
          <p className="text-lg font-bold text-[#1D9E75]">₹{((plot.est_revenue||0)/1000).toFixed(0)}k</p>
        </div>
      </div>
      {plot.last_task && <TimelineRow icon={<CheckCircle2 size={13} className="text-[#1D9E75]"/>} label={plot.last_task.label} sub={`${plot.last_task.days_ago}d ago`} done />}
      <div className="mt-4">
        <button className="w-full py-3 text-sm font-bold rounded-xl text-white" style={{ background:'#1D9E75' }}>
          Record Harvest
        </button>
      </div>
    </PanelShell>
  )
}

function PanelShell({ children, onClose, onEdit, plotId }) {
  const navigate = useNavigate()
  return (
    <div className="absolute bottom-0 left-0 right-0 bg-[var(--c-nav)]/97 backdrop-blur-md rounded-t-2xl p-5 shadow-2xl border-t border-white/10 animate-slide-up max-h-[75vh] overflow-y-auto">
      <div className="absolute top-3 right-3 flex items-center gap-2">
        {plotId && (
          <button onClick={() => navigate(`/media?plot=${plotId}`)} className="flex items-center gap-1 text-xs text-white/40 hover:text-[#1D9E75] px-2 py-1 rounded-lg transition-colors">
            <Camera size={13}/> Photos
          </button>
        )}
        {onEdit && <button onClick={onEdit} className="text-xs text-[#1D9E75] hover:text-white px-2 py-1 rounded-lg hover:bg-[#1D9E75]/20 transition-colors">Edit</button>}
        <button onClick={onClose} className="text-white/40 hover:text-white p-1"><X size={18}/></button>
      </div>
      {children}
    </div>
  )
}

function TimelineRow({ icon, label, sub, done, highlight }) {
  return (
    <div className={`flex items-center gap-3 px-3 py-2 rounded-lg ${highlight ? 'bg-[#BA7517]/10 border border-[#BA7517]/20' : 'bg-white/4'}`}>
      <span className="shrink-0">{icon}</span>
      <span className={`flex-1 text-xs ${done ? 'text-white/50' : highlight ? 'text-white' : 'text-white/70'}`}>{label}</span>
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

// ── Log Activity Modal ─────────────────────────────────────────────────────────
function LogActivityModal({ plot, onClose }) {
  const { logActivity } = useAppStore()
  const [form, setForm] = useState({
    type: 'irrigation', date: new Date().toISOString().slice(0,10), workers: '', notes: '',
  })
  const [done, setDone] = useState(false)
  const TYPES = ['irrigation','weeding','fertilizer','spray','harvesting','ploughing','other']

  const submit = async () => {
    if (!form.date) return
    await logActivity({
      plotId:      plot.id || null,
      cropCycleId: plot.cycle_id || null,
      type:        form.type,
      date:        new Date().toISOString().slice(0,10),
      notes:       form.notes,
      workers:     Number(form.workers) || 0,
    })
    setDone(true)
    setTimeout(onClose, 1200)
  }

  return (
    <div className="absolute bottom-0 left-0 right-0 bg-[var(--c-nav)]/97 backdrop-blur-md rounded-t-2xl p-5 shadow-2xl border-t border-white/10 animate-slide-up max-h-[80vh] overflow-y-auto">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-bold text-white">Log Activity — {plot.label}</h3>
        <button onClick={onClose} className="text-white/40 hover:text-white"><X size={18}/></button>
      </div>
      {done ? <p className="text-center text-[#1D9E75] font-semibold py-4">✓ Activity logged!</p> : (
        <div className="space-y-3">
          <div><label className="text-xs text-white/50 block mb-1">Activity type</label>
            <select value={form.type} onChange={e=>setForm(p=>({...p,type:e.target.value}))} className="w-full bg-white/8 border border-white/12 rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:border-[#1D9E75]" style={{background:'#1a2030'}}>
              {TYPES.map(t=><option key={t} value={t} style={{background:'#1a2030'}}>{t.charAt(0).toUpperCase()+t.slice(1)}</option>)}
            </select>
          </div>
          <div><label className="text-xs text-white/50 block mb-1">Workers</label>
            <input type="number" placeholder="0" value={form.workers} onChange={e=>setForm(p=>({...p,workers:e.target.value}))} className="w-full bg-white/8 border border-white/12 rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:border-[#1D9E75]"/>
          </div>
          <div><label className="text-xs text-white/50 block mb-1">Notes</label>
            <textarea rows={2} placeholder="What was done…" value={form.notes} onChange={e=>setForm(p=>({...p,notes:e.target.value}))} className="w-full bg-white/8 border border-white/12 rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:border-[#1D9E75] resize-none"/>
          </div>
          <button onClick={submit} className="w-full py-3 bg-[#1D9E75] text-white text-sm font-bold rounded-xl">Save Activity</button>
        </div>
      )}
    </div>
  )
}

// ── Issue Input Modal ─────────────────────────────────────────────────────────
function IssueInputModal({ plot, onClose }) {
  const { inventoryMaster, regularLabourers, contractualLabour, issueItem, logLabour } = useAppStore()
  const [tab,  setTab]  = useState('material')
  const [form, setForm] = useState({ itemId:'', qty:'', purpose:'', date: new Date().toISOString().slice(0,10), labourTypeId:'', workers:'', rate:'' })
  const [done, setDone] = useState(false)

  const selectedItem = inventoryMaster.find(i=>i.id===form.itemId)
  const allLabour    = [...regularLabourers, ...contractualLabour]
  const selectedLT   = allLabour.find(l=>l.id===form.labourTypeId)
  const totalCost    = tab==='material'
    ? (parseFloat(form.qty)||0) * (selectedItem?.costPerUnit||0)
    : (parseFloat(form.workers)||0) * (parseFloat(form.rate)||0)

  const submit = async () => {
    if (tab==='material') {
      if (!form.itemId||!form.qty) return
      await issueItem({
        itemId:      form.itemId,
        cropCycleId: plot.cycle_id || null,
        date:        new Date().toISOString().slice(0,10),
        qty:         parseFloat(form.qty),
        purpose:     form.purpose,
      })
    } else {
      if (!form.labourTypeId||!form.workers) return
      await logLabour({
        labourTypeId: form.labourTypeId,
        labourName:   selectedLT?.name || '',
        plotId:       plot.id || null,
        cropCycleId:  plot.cycle_id || null,
        date:         form.date,
        workers:      parseFloat(form.workers),
        ratePerDay:   parseFloat(form.rate) || 0,
        totalCost,
        purpose:      form.purpose,
      })
    }
    setDone(true)
    setTimeout(onClose, 1200)
  }

  return (
    <div className="absolute bottom-0 left-0 right-0 bg-[var(--c-nav)]/97 backdrop-blur-md rounded-t-2xl p-5 shadow-2xl border-t border-white/10 animate-slide-up max-h-[85vh] overflow-y-auto">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-bold text-white">Issue Input — {plot.label}</h3>
        <button onClick={onClose} className="text-white/40 hover:text-white"><X size={18}/></button>
      </div>
      {done ? <p className="text-center text-[#1D9E75] font-semibold py-4">✓ Input issued!</p> : (<>
        <div className="flex gap-2 mb-4">
          {['material','labour'].map(t=>(
            <button key={t} onClick={()=>setTab(t)} className={`flex-1 py-2 text-xs font-semibold rounded-xl border transition-colors ${tab===t?'bg-[#1D9E75]/20 border-[#1D9E75]/50 text-[#1D9E75]':'bg-white/5 border-white/10 text-white/50'}`}>
              {t==='material'?'📦 Material':'👷 Labour'}
            </button>
          ))}
        </div>
        <div className="space-y-3">
          {tab==='material' ? (<>
            <div><label className="text-xs text-white/50 block mb-1">Select item</label>
              <select value={form.itemId} onChange={e=>setForm(p=>({...p,itemId:e.target.value}))} className="w-full bg-white/8 border border-white/12 rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:border-[#1D9E75]" style={{background:'#1a2030'}}>
                <option value="" style={{background:'#1a2030'}}>Choose item…</option>
                {inventoryMaster.map(i=><option key={i.id} value={i.id} style={{background:'#1a2030'}}>{i.name} ({i.currentStock} {i.unit})</option>)}
              </select>
            </div>
            <div><label className="text-xs text-white/50 block mb-1">Quantity ({selectedItem?.unit||'unit'})</label>
              <input type="number" placeholder="0" value={form.qty} onChange={e=>setForm(p=>({...p,qty:e.target.value}))} className="w-full bg-white/8 border border-white/12 rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:border-[#1D9E75]"/>
            </div>
          </>) : (<>
            <div><label className="text-xs text-white/50 block mb-1">Labour</label>
              <select value={form.labourTypeId} onChange={e=>{
                const l=allLabour.find(x=>x.id===e.target.value)
                setForm(p=>({...p,labourTypeId:e.target.value,rate:l?.ratePerDay||l?.defaultRate||''}))
              }} className="w-full bg-white/8 border border-white/12 rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:border-[#1D9E75]" style={{background:'#1a2030'}}>
                <option value="" style={{background:'#1a2030'}}>Choose…</option>
                {allLabour.map(l=><option key={l.id} value={l.id} style={{background:'#1a2030'}}>{l.name} (₹{l.ratePerDay||l.defaultRate}/day)</option>)}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div><label className="text-xs text-white/50 block mb-1">Workers</label>
                <input type="number" placeholder="1" value={form.workers} onChange={e=>setForm(p=>({...p,workers:e.target.value}))} className="w-full bg-white/8 border border-white/12 rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:border-[#1D9E75]"/>
              </div>
              <div><label className="text-xs text-white/50 block mb-1">Rate/day (₹)</label>
                <input type="number" value={form.rate} onChange={e=>setForm(p=>({...p,rate:e.target.value}))} className="w-full bg-white/8 border border-white/12 rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:border-[#1D9E75]"/>
              </div>
            </div>
          </>)}
          <div><label className="text-xs text-white/50 block mb-1">Purpose</label>
            <input type="text" placeholder="e.g. Top dressing, weeding…" value={form.purpose} onChange={e=>setForm(p=>({...p,purpose:e.target.value}))} className="w-full bg-white/8 border border-white/12 rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:border-[#1D9E75]"/>
          </div>
          {totalCost > 0 && (
            <div className="bg-[#1D9E75]/10 border border-[#1D9E75]/20 rounded-xl px-3 py-2">
              <p className="text-xs text-white/50">Estimated cost</p>
              <p className="text-lg font-bold text-[#1D9E75]">₹{totalCost.toLocaleString()}</p>
            </div>
          )}
          <button onClick={submit} className="w-full py-3 bg-[#1D9E75] text-white text-sm font-bold rounded-xl">Confirm Issue</button>
        </div>
      </>)}
    </div>
  )
}

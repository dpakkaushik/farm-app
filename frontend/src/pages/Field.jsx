import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import maplibregl from 'maplibre-gl'
import { useMapStore, useFarmStore, useAppStore } from '../store'
import { farmApi } from '../api/client'
import {
  X, Layers, Upload, ZoomIn, ZoomOut, Navigation,
  Eye, EyeOff, CheckCircle2, Clock, AlertTriangle,
  Wheat, Droplets, Sprout, Package, ChevronRight, Camera,
} from 'lucide-react'

// ── 31-point GPS survey (2026-05-26) ─────────────────────────────────────────
// P[n] = [longitude, latitude] for each surveyed point 1–31
const P = [null,
  [80.482547, 28.504776],  //  1  SW corner
  [80.485826, 28.504895],  //  2  S bottom
  [80.487267, 28.504516],  //  3  SE bottom
  [80.483410, 28.505902],  //  4  W boundary
  [80.485838, 28.505068],  //  5  channel-left bottom
  [80.486639, 28.504722],  //  6  channel entry "A"
  [80.487576, 28.505198],  //  7  E boundary
  [80.486060, 28.505621],  //  8  channel
  [80.486097, 28.505805],  //  9  channel
  [80.486195, 28.506011],  // 10  channel
  [80.486362, 28.506379],  // 11  channel / farm centre
  [80.486652, 28.507231],  // 12  channel
  [80.486913, 28.507871],  // 13  channel
  [80.486950, 28.508101],  // 14  channel
  [80.487231, 28.508905],  // 15  channel
  [80.487427, 28.509529],  // 16  channel top / NE boundary
  [80.483943, 28.506615],  // 17  W boundary
  [80.484410, 28.507288],  // 18  notch inner
  [80.483392, 28.507822],  // 19  notch outer
  [80.484074, 28.508626],  // 20  W boundary
  [80.484559, 28.509254],  // 21  W boundary
  [80.485181, 28.509989],  // 22  W boundary
  [80.485695, 28.510693],  // 23  N apex
  [80.486984, 28.505344],  // 24  E interior
  [80.487111, 28.505817],  // 25  E interior
  [80.487904, 28.505692],  // 26  E boundary
  [80.486530, 28.506968],  // 27  E interior
  [80.488046, 28.506401],  // 28  E boundary
  [80.488300, 28.507260],  // 29  E boundary
  [80.488683, 28.508280],  // 30  E boundary
  [80.488867, 28.508690],  // 31  NE corner
]

const FARM_CENTER = P[11]   // surveyed centre point
const FARM_CORNERS = [      // bounding box for image overlay
  [80.482547, 28.510693], [80.488867, 28.510693],
  [80.488867, 28.504516], [80.482547, 28.504516],
]

// Outer boundary: clockwise from SW
const FARM_BOUNDARY_COORDS =
  [1,2,3,7,26,28,29,30,31,16,23,22,21,20,19,18,17,4,1].map(i => P[i])

// Irrigation channel / road (S→N through farm centre)
const CHANNEL_COORDS = [6,8,9,10,11,12,13,14,15,16].map(i => P[i])

// Build a GeoJSON polygon from surveyed point indices
const mkPlot = (ids) => ({
  type: 'Feature',
  geometry: { type: 'Polygon', coordinates: [[...ids.map(i => P[i]), P[ids[0]]]] },
})

// ── Plot polygons — direct GPS vertices ───────────────────────────────────────
// Left column (L1–L8): outer left boundary → irrigation channel
const L1 = mkPlot([1,4,9,8,6,2])       // bottom-left
const L2 = mkPlot([4,17,10,9])
const L3 = mkPlot([17,18,11,10])
const L4 = mkPlot([18,19,12,11])        // notch section
const L5 = mkPlot([19,20,13,12])
const L6 = mkPlot([20,21,14,13])
const L7 = mkPlot([21,22,15,14])
const L8 = mkPlot([22,23,16,15])        // top-left

// Right column (R1–R7): irrigation channel → outer right boundary
const R1 = mkPlot([6,8,24,7,3])         // bottom-right
const R2 = mkPlot([8,9,25,26,7,24])
const R3 = mkPlot([9,10,11,27,28,26,25])
const R4 = mkPlot([11,27,28,29,12])
const R5 = mkPlot([12,13,30,29])
const R6 = mkPlot([13,14,15,31,30])
const R7 = mkPlot([15,16,31])           // top-right triangle

// ── Crop-based fill colours (consistent per crop, stage shown via border) ──────
const CROP_COLORS = {
  wheat:     { fill: 'rgba(220,180,40,0.65)',   outline: 'rgba(220,180,40,0.95)'   },
  sugarcane: { fill: 'rgba(29,158,117,0.55)',   outline: 'rgba(29,158,117,0.90)'   },
  mustard:   { fill: 'rgba(186,117,23,0.65)',   outline: 'rgba(186,117,23,0.90)'   },
  paddy:     { fill: 'rgba(100,180,150,0.60)',  outline: 'rgba(100,180,150,0.90)'  },
  grass:     { fill: 'rgba(134,179,53,0.45)',   outline: 'rgba(134,179,53,0.75)'   },
  fallow:    { fill: 'rgba(136,135,128,0.30)',  outline: 'rgba(255,255,255,0.40)'  },
  empty:     { fill: 'rgba(0,0,0,0)',           outline: 'rgba(255,255,255,0.35)'  },
}

const getCropKey = (cropName) => {
  if (!cropName) return 'empty'
  const c = cropName.toLowerCase()
  if (c.includes('wheat'))   return 'wheat'
  if (c.includes('cane'))    return 'sugarcane'
  if (c.includes('mustard')) return 'mustard'
  if (c.includes('paddy') || c.includes('rice')) return 'paddy'
  if (c.includes('grass'))   return 'grass'
  return 'wheat'
}

const getStageFillColor = (plot) => {
  if (plot.stage === 'empty')  return CROP_COLORS.empty.fill
  if (plot.stage === 'fallow') return CROP_COLORS.fallow.fill
  return CROP_COLORS[getCropKey(plot.current_crop)].fill
}

const getStageOutlineColor = (plot) => {
  if (plot.stage === 'empty')              return CROP_COLORS.empty.outline
  if (plot.health_status === 'concern')    return '#E24B4A'
  if (plot.stage === 'harvest_ready')      return '#ffffff'
  return CROP_COLORS[getCropKey(plot.current_crop)].outline
}

const STAGE_LEGEND = [
  { label: 'Wheat',        color: CROP_COLORS.wheat.fill     },
  { label: 'Sugarcane',    color: CROP_COLORS.sugarcane.fill },
  { label: 'Mustard',      color: CROP_COLORS.mustard.fill   },
  { label: 'Paddy / Rice', color: CROP_COLORS.paddy.fill     },
  { label: 'Grass',        color: CROP_COLORS.grass.fill     },
  { label: 'Fallow/Empty', color: CROP_COLORS.fallow.fill    },
]

// ── Demo plots — proper GPS polygons computed from road + farm boundary ────────
const DEMO_PLOTS = [
  // ── LEFT column — L1–L8, outer left boundary → channel ───────────────────
  {
    id:'p', label:'Plot P', acres:1.5, geo_polygon: L1,
    stage:'growing', health_status:'average', current_crop:"Oct'24 Sugarcane",
    days_since_sow:210, days_to_harvest:90, season_cost:4800,
    today_task: null,
    next_task: { label:'Irrigation', in_days:2 },
    last_task: { label:'Weeding', days_ago:12 },
    progress_pct:70,
  },
  {
    id:'a', label:'Plot A', acres:2, geo_polygon: L2,
    stage:'pre_harvest', health_status:'good', current_crop:'Wheat',
    days_since_sow:100, days_to_harvest:5, season_cost:4200,
    today_task: 'Final irrigation before harvest',
    next_task: { label:'Harvest window opens', in_days:5 },
    last_task: { label:'Top dressing Urea', days_ago:10 },
    progress_pct:95,
  },
  {
    id:'n', label:'Plot N', acres:2, geo_polygon: L3,
    stage:'fallow', health_status:'fallow', current_crop:'Animal Grass',
    days_since_sow:null, days_to_harvest:null, season_cost:800,
    today_task: null, next_task: null, last_task: null,
    progress_pct:0,
  },
  {
    id:'m', label:'Plot M', acres:2, geo_polygon: L4,
    stage:'growing', health_status:'good', current_crop:'Wheat',
    days_since_sow:88, days_to_harvest:30, season_cost:2200,
    today_task: null,
    next_task: { label:'Irrigation', in_days:4 },
    last_task: { label:'Top dressing Urea', days_ago:10 },
    progress_pct:75,
  },
  {
    id:'l', label:'Plot L', acres:3.5, geo_polygon: L5,
    stage:'growing', health_status:'average', current_crop:"Oct'24 Sugarcane",
    days_since_sow:210, days_to_harvest:120, season_cost:13500,
    today_task: null,
    next_task: { label:'Fertilizer — Potash', in_days:5 },
    last_task: { label:'Irrigation', days_ago:4 },
    progress_pct:64,
  },
  {
    id:'k', label:'Plot K', acres:4, geo_polygon: L6,
    stage:'growing', health_status:'good', current_crop:'Wheat',
    days_since_sow:88, days_to_harvest:30, season_cost:7800,
    today_task: null,
    next_task: { label:'Final irrigation', in_days:6 },
    last_task: { label:'Top dressing Urea', days_ago:10 },
    progress_pct:75,
  },
  {
    id:'j', label:'Plot J', acres:4, geo_polygon: L7,
    stage:'growing', health_status:'good', current_crop:'Wheat',
    days_since_sow:88, days_to_harvest:30, season_cost:7800,
    today_task: null,
    next_task: { label:'Irrigation', in_days:2 },
    last_task: { label:'Weeding', days_ago:20 },
    progress_pct:75,
  },
  {
    id:'i', label:'Plot I', acres:2.5, geo_polygon: L8,
    stage:'growing', health_status:'concern', current_crop:'Wheat',
    days_since_sow:88, days_to_harvest:30, season_cost:5200,
    today_task: '⚠ Follow up on pest spray — applied 3 days ago, check crop response',
    next_task: { label:'Second pest spray if needed', in_days:2 },
    last_task: { label:'Chlorpyrifos spray (pest)', days_ago:3 },
    progress_pct:75,
    concern_note: 'Yellowing leaves noticed on north corner. Pest spray applied May 22.',
  },
  // ── RIGHT column — R1–R7, channel → outer right boundary ─────────────────
  {
    id:'h', label:'Plot H', acres:1.5, geo_polygon: R1,
    stage:'empty', health_status:'fallow', current_crop: null,
    days_since_sow:null, days_to_harvest:null, season_cost:0,
    today_task: null, next_task: null, last_task: { label:'Paddy harvested', days_ago:180 },
    progress_pct:0,
    available_seeds: [
      { name:'Wheat Seeds (HD-3086)', qty:80, unit:'kg' },
      { name:'Paddy Seeds (PB-1121)', qty:30, unit:'kg' },
      { name:'Mustard Seeds',         qty:10, unit:'kg' },
    ],
  },
  {
    id:'b', label:'Plot B', acres:5.5, geo_polygon: R2,
    stage:'growing', health_status:'good', current_crop:'Mustard',
    days_since_sow:70, days_to_harvest:45, season_cost:11000,
    today_task: 'Irrigation due today',
    next_task: { label:'Pesticide spray', in_days:8 },
    last_task: { label:'Weeding', days_ago:7 },
    progress_pct:61,
  },
  {
    id:'c', label:'Plot C', acres:5, geo_polygon: R3,
    stage:'growing', health_status:'average', current_crop:"Oct'24 Sugarcane",
    days_since_sow:210, days_to_harvest:120, season_cost:18000,
    today_task: null,
    next_task: { label:'Irrigation', in_days:2 },
    last_task: { label:'Irrigation', days_ago:5 },
    progress_pct:64,
  },
  {
    id:'d', label:'Plot D', acres:5, geo_polygon: R4,
    stage:'growing', health_status:'average', current_crop:"Oct'24 Sugarcane",
    days_since_sow:210, days_to_harvest:120, season_cost:18000,
    today_task: null,
    next_task: { label:'Weeding', in_days:4 },
    last_task: { label:'Irrigation', days_ago:3 },
    progress_pct:64,
  },
  {
    id:'e', label:'Plot E', acres:7, geo_polygon: R5,
    stage:'growing', health_status:'good', current_crop:'Cane + Mustard',
    days_since_sow:160, days_to_harvest:60, season_cost:32000,
    today_task: null,
    next_task: { label:'Fertilizer — Urea top dressing', in_days:1 },
    last_task: { label:'Irrigation', days_ago:4 },
    progress_pct:73,
  },
  {
    id:'f', label:'Plot F', acres:5, geo_polygon: R6,
    stage:'harvest_ready', health_status:'good', current_crop:'Wheat',
    days_since_sow:106, days_to_harvest:0, season_cost:9500,
    today_task: '🎯 Harvest window is OPEN',
    next_task: null,
    last_task: { label:'Final irrigation', days_ago:7 },
    progress_pct:100,
    est_yield_qtl: 75,
    est_revenue: 165000,
  },
  {
    id:'g', label:'Plot G', acres:3, geo_polygon: R7,
    stage:'growing', health_status:'good', current_crop:'Wheat',
    days_since_sow:94, days_to_harvest:15, season_cost:9500,
    today_task: null,
    next_task: { label:'Final irrigation', in_days:3 },
    last_task: { label:'Top dressing Urea', days_ago:14 },
    progress_pct:86,
  },
]

function getWeatherEmoji(code) {
  if (code === 0) return '☀️'
  if (code === 1) return '🌤️'
  if (code === 2) return '⛅'
  if (code === 3) return '☁️'
  if (code <= 48) return '🌫️'
  if (code <= 55) return '🌦️'
  if (code <= 65) return '🌧️'
  if (code <= 77) return '🌨️'
  if (code <= 82) return '🌦️'
  return '⛈️'
}

const FARM_ID = import.meta.env.VITE_FARM_ID || 'demo'

export default function Field() {
  const mapContainer = useRef(null)
  const map          = useRef(null)
  const saveTimer    = useRef(null)

  const { zoom, center, bearing, pitch, setMapState, overlay, setOverlay } = useMapStore()
  const { plots, setPlots } = useFarmStore()

  const [selectedPlot, setSelectedPlot]         = useState(null)
  const [showCoordPanel, setShowCoordPanel]     = useState(false)
  const [showOverlayPanel, setShowOverlayPanel] = useState(false)
  const [coordInput, setCoordInput]             = useState({ lat: '', lng: '' })
  const [overlayOpacity, setOverlayOpacity]     = useState(overlay?.opacity ?? 0.7)
  const [overlayVisible, setOverlayVisible]     = useState(true)
  const [uploading, setUploading]               = useState(false)
  const [currentZoom, setCurrentZoom]           = useState(zoom)
  const [weather, setWeather]                   = useState(null)

  useEffect(() => {
    fetch('https://api.open-meteo.com/v1/forecast?latitude=28.5073&longitude=80.4863&current=temperature_2m,relative_humidity_2m,weather_code,wind_speed_10m&timezone=Asia/Kolkata&forecast_days=1')
      .then(r => r.json())
      .then(d => setWeather(d.current))
      .catch(() => {})
  }, [])

  const cropSummary = useMemo(() => {
    const groups = {}
    DEMO_PLOTS.forEach(p => {
      if (!p.current_crop || p.stage === 'empty' || p.stage === 'fallow') return
      const key = p.current_crop
      if (!groups[key]) groups[key] = { crop: key, acres: 0, daysToHarvest: null }
      groups[key].acres += p.acres
      if (p.days_to_harvest != null) {
        if (groups[key].daysToHarvest === null || p.days_to_harvest < groups[key].daysToHarvest)
          groups[key].daysToHarvest = p.days_to_harvest
      }
    })
    return Object.values(groups).map(g => {
      const c = g.crop.toLowerCase()
      const qtlAc  = c.includes('wheat') ? 15 : c.includes('cane') ? 280 : c.includes('mustard') ? 8 : 12
      const priceQ = c.includes('wheat') ? 2200 : c.includes('cane') ? 350 : c.includes('mustard') ? 5000 : 2000
      return { ...g, estYield: Math.round(g.acres * qtlAc), estRevenue: Math.round(g.acres * qtlAc * priceQ) }
    }).sort((a, b) => b.acres - a.acres)
  }, [])

  useEffect(() => {
    if (map.current) return
    const FREE_SATELLITE_STYLE = {
      version: 8,
      glyphs: 'https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf',
      sources: {
        'esri-satellite': { type:'raster', tiles:['https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'], tileSize:256, attribution:'Tiles © Esri', maxzoom:19 },
        'esri-labels':    { type:'raster', tiles:['https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}'], tileSize:256, maxzoom:19 },
      },
      layers: [
        { id:'satellite', type:'raster', source:'esri-satellite' },
        { id:'labels',    type:'raster', source:'esri-labels', paint:{ 'raster-opacity':0.85 } },
      ],
    }
    map.current = new maplibregl.Map({
      container: mapContainer.current,
      style: FREE_SATELLITE_STYLE,
      center, zoom, bearing, pitch,
      attributionControl: false,
    })
    map.current.addControl(new maplibregl.AttributionControl({ compact:true }), 'bottom-right')
    map.current.addControl(new maplibregl.ScaleControl(), 'bottom-left')

    map.current.on('load', () => {
      addPlotLayers()
      loadPlots()
      if (overlay) addOverlayLayer(overlay)
    })
    map.current.on('moveend', () => {
      const z = map.current.getZoom(), c = map.current.getCenter()
      const b = map.current.getBearing(), p = map.current.getPitch()
      setCurrentZoom(Math.round(z * 10) / 10)
      const state = { zoom:z, center:[c.lng,c.lat], bearing:b, pitch:p }
      setMapState(state)
      clearTimeout(saveTimer.current)
      saveTimer.current = setTimeout(() => farmApi.saveMapState(FARM_ID, state).catch(()=>{}), 1000)
    })
    return () => { clearTimeout(saveTimer.current); map.current?.remove(); map.current = null }
  }, [])

  const loadPlots = useCallback(async () => {
    try { const { data } = await farmApi.getPlots(FARM_ID); setPlots(data); refreshPlotLayers(data) }
    catch { setPlots(DEMO_PLOTS); refreshPlotLayers(DEMO_PLOTS) }
  }, [setPlots])

  const addPlotLayers = () => {
    // Farm boundary outline
    map.current.addSource('farm-boundary', { type:'geojson', data:{
      type:'Feature', geometry:{ type:'Polygon', coordinates:[FARM_BOUNDARY_COORDS] }
    }})
    map.current.addLayer({ id:'farm-boundary-line', type:'line', source:'farm-boundary',
      paint:{ 'line-color':'#ffffff', 'line-width':2.5, 'line-opacity':0.55, 'line-dasharray':[4,3] }
    })

    // Irrigation channel — all 10 GPS-surveyed points
    map.current.addSource('road', { type:'geojson', data:{
      type:'Feature', geometry:{ type:'LineString', coordinates: CHANNEL_COORDS }
    }})
    map.current.addLayer({ id:'road-line', type:'line', source:'road',
      paint:{ 'line-color':'#4ade80', 'line-width':2.5, 'line-opacity':0.75 }
    })

    map.current.addSource('plots', { type:'geojson', data:{ type:'FeatureCollection', features:[] } })
    map.current.addLayer({ id:'plot-fill', type:'fill', source:'plots', paint:{ 'fill-color':['get','color'], 'fill-opacity':1 } })
    map.current.addLayer({ id:'plot-outline', type:'line', source:'plots', paint:{ 'line-color':['get','outline'], 'line-width':1.8, 'line-opacity':0.95 } })
    map.current.addLayer({ id:'plot-label', type:'symbol', source:'plots',
      layout:{ 'text-field':['concat',['get','label'],'\n',['get','crop_short']], 'text-size':11, 'text-anchor':'center', 'text-allow-overlap':false },
      paint:{ 'text-color':'#fff', 'text-halo-color':'#000', 'text-halo-width':1.2 },
    })
    map.current.on('click', 'plot-fill', (e) => {
      const raw = e.features[0]?.properties?.__raw
      if (raw) setSelectedPlot(JSON.parse(raw))
    })
    map.current.on('mouseenter', 'plot-fill', () => { map.current.getCanvas().style.cursor = 'pointer' })
    map.current.on('mouseleave', 'plot-fill', () => { map.current.getCanvas().style.cursor = '' })
  }

  const refreshPlotLayers = (plotData) => {
    if (!map.current?.getSource('plots')) return
    const features = plotData.filter(p => p.geo_polygon).map(p => ({
      ...p.geo_polygon,
      properties: {
        label: p.label,
        crop_short: p.current_crop ? p.current_crop.split(' ').slice(0,2).join(' ') : 'Empty',
        color:   getStageFillColor(p),
        outline: getStageOutlineColor(p),
        __raw:   JSON.stringify(p),
      },
    }))
    map.current.getSource('plots').setData({ type:'FeatureCollection', features })
  }

  // ── Overlay ───────────────────────────────────────────────────────────────
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
    try { const form = new FormData(); form.append('file',file); form.append('entity_type','plot_overlay'); form.append('entity_id',FARM_ID); const { data } = await farmApi.uploadFile(form); const cfg = { storageUrl:data.public_url, coordinates:FARM_CORNERS, opacity:overlayOpacity }; setOverlay(cfg); addOverlayLayer(cfg) }
    catch { const cfg = { storageUrl:URL.createObjectURL(file), coordinates:FARM_CORNERS, opacity:overlayOpacity }; setOverlay(cfg); addOverlayLayer(cfg) }
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

      {/* Farm name + weather */}
      <div className="absolute top-3 left-3 flex flex-col gap-1.5 pointer-events-none">
        <div className="bg-black/60 backdrop-blur-sm rounded-xl px-3 py-1.5 text-xs font-semibold text-white">
          My Farm · 28.5073°N 80.4863°E
        </div>
        {weather && (
          <div className="bg-black/60 backdrop-blur-sm rounded-xl px-3 py-1.5 flex items-center gap-1.5 text-xs">
            <span className="text-sm leading-none">{getWeatherEmoji(weather.weather_code)}</span>
            <span className="text-white font-medium">{Math.round(weather.temperature_2m)}°C</span>
            <span className="text-white/25">·</span>
            <Droplets size={10} className="text-blue-400 shrink-0"/>
            <span className="text-white/60">{weather.relative_humidity_2m}%</span>
            {weather.wind_speed_10m >= 5 && (
              <>
                <span className="text-white/25">·</span>
                <span className="text-white/60">💨 {Math.round(weather.wind_speed_10m)} km/h</span>
              </>
            )}
          </div>
        )}
      </div>

      {/* Zoom badge */}
      <div className="absolute top-3 left-1/2 -translate-x-1/2 bg-black/60 backdrop-blur-sm rounded-full px-3 py-1 text-xs text-white/70 pointer-events-none">
        z {currentZoom}
      </div>

      {/* Crop summary strip */}
      {cropSummary.length > 0 && (
        <div className="absolute left-0 right-14 px-3 overflow-x-auto no-scrollbar pointer-events-none"
          style={{ top: weather ? '76px' : '48px' }}>
          <div className="flex gap-2 pb-1">
            {cropSummary.map(g => (
              <div key={g.crop} className="shrink-0 bg-black/65 backdrop-blur-sm rounded-xl px-3 py-2 border border-white/10 min-w-[90px]">
                <p className="text-xs font-semibold text-white leading-tight truncate max-w-[100px]">{g.crop}</p>
                <p className="text-[10px] text-white/50 mt-0.5">{g.acres.toFixed(1)} ac</p>
                <p className="text-[10px] text-[#1D9E75] font-medium">~{g.estYield} qtl</p>
                <p className="text-[10px] text-white/40">₹{(g.estRevenue / 1000).toFixed(0)}k est.</p>
                {g.daysToHarvest !== null && (
                  <p className="text-[10px] text-[#BA7517] mt-0.5">
                    {g.daysToHarvest === 0 ? '🎯 Ready' : `${g.daysToHarvest}d left`}
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Right controls */}
      <div className="absolute top-3 right-3 flex flex-col gap-2">
        <button onClick={zoomIn}  className="map-btn" title="Zoom in"><ZoomIn  size={16}/></button>
        <button onClick={zoomOut} className="map-btn" title="Zoom out"><ZoomOut size={16}/></button>
        <button onClick={() => { setShowCoordPanel(v=>!v); setShowOverlayPanel(false) }} className="map-btn" title="Go to coordinates"><Navigation size={16}/></button>
        <button onClick={() => { setShowOverlayPanel(v=>!v); setShowCoordPanel(false) }} className={`map-btn ${overlay ? 'ring-1 ring-[#1D9E75]' : ''}`} title="Plot layout overlay"><Layers size={16}/></button>
      </div>

      {/* Coordinate panel */}
      {showCoordPanel && (
        <div className="absolute top-3 right-14 bg-[#1a1f2e]/95 backdrop-blur-sm rounded-xl p-4 w-64 shadow-xl border border-white/10">
          <div className="flex justify-between items-center mb-3">
            <span className="text-xs font-semibold text-white uppercase tracking-wide">Go to Coordinates</span>
            <button onClick={() => setShowCoordPanel(false)} className="text-white/40 hover:text-white"><X size={14}/></button>
          </div>
          <form onSubmit={flyToCoords} className="space-y-2">
            <input type="number" step="any" placeholder="Latitude  e.g. 28.50731" value={coordInput.lat} onChange={e=>setCoordInput(v=>({...v,lat:e.target.value}))} className="w-full bg-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-white/30 border border-white/10 focus:outline-none focus:border-[#1D9E75]"/>
            <input type="number" step="any" placeholder="Longitude  e.g. 80.48628" value={coordInput.lng} onChange={e=>setCoordInput(v=>({...v,lng:e.target.value}))} className="w-full bg-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-white/30 border border-white/10 focus:outline-none focus:border-[#1D9E75]"/>
            <button type="submit" className="w-full bg-[#1D9E75] hover:bg-[#17a97e] text-white text-sm font-medium rounded-lg py-2">Fly There</button>
          </form>
          <p className="text-[10px] text-white/30 mt-2">Current zoom ({currentZoom.toFixed(1)}) is preserved.</p>
        </div>
      )}

      {/* Overlay panel */}
      {showOverlayPanel && (
        <div className="absolute top-3 right-14 bg-[#1a1f2e]/95 backdrop-blur-sm rounded-xl p-4 w-72 shadow-xl border border-white/10">
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
                <span className="text-xs text-white/40 text-center">Upload PNG overlay</span>
                <input type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={handleOverlayUpload} disabled={uploading}/>
                {uploading && <span className="text-xs text-[#1D9E75]">Uploading…</span>}
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
        <p className="text-white/40 text-[10px] uppercase tracking-wide mb-1.5">Stage</p>
        {STAGE_LEGEND.map(({ label, color }) => (
          <div key={label} className="flex items-center gap-2">
            <span className="w-3 h-3 rounded-sm inline-block border border-white/20" style={{ background: color }}/>
            <span className="text-white/80">{label}</span>
          </div>
        ))}
      </div>

      {/* ── Plot detail panel — stage-aware ──────────────────────────────── */}
      {selectedPlot && (
        <PlotDetailPanel plot={selectedPlot} onClose={() => setSelectedPlot(null)} />
      )}

      <style>{`
        .map-btn { display:flex; align-items:center; justify-content:center; width:36px; height:36px; border-radius:10px; background:rgba(26,31,46,0.9); border:1px solid rgba(255,255,255,0.12); color:#fff; cursor:pointer; backdrop-filter:blur(4px); transition:background 0.15s; }
        .map-btn:hover { background:rgba(29,158,117,0.4); }
        @keyframes slide-up { from { transform:translateY(100%) } to { transform:translateY(0) } }
        .animate-slide-up { animation: slide-up 0.25s ease-out; }
        @keyframes pulse-ring { 0%,100% { opacity:1 } 50% { opacity:0.4 } }
        .pulse { animation: pulse-ring 1.8s ease-in-out infinite; }
        .no-scrollbar::-webkit-scrollbar { display:none; }
        .no-scrollbar { -ms-overflow-style:none; scrollbar-width:none; }
      `}</style>
    </div>
  )
}

// ── Stage-aware plot detail panel ─────────────────────────────────────────────
function PlotDetailPanel({ plot, onClose }) {
  const [editing, setEditing]         = useState(false)
  const [showLogActivity, setShowLog] = useState(false)
  const [showIssueInput, setShowIssue]= useState(false)
  const [editLabel, setEditLabel]     = useState(plot.label)
  const [editAcres, setEditAcres]     = useState(String(plot.acres))
  const [localPlot, setLocalPlot]     = useState(plot)

  const saveEdit = () => {
    setLocalPlot(p => ({ ...p, label: editLabel.trim() || p.label, acres: parseFloat(editAcres) || p.acres }))
    setEditing(false)
  }

  if (editing) {
    return (
      <div className="absolute bottom-0 left-0 right-0 bg-[#1a1f2e]/97 backdrop-blur-md rounded-t-2xl p-5 shadow-2xl border-t border-white/10 animate-slide-up">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-white">Edit Plot</h3>
          <button onClick={() => setEditing(false)} className="text-white/40 hover:text-white"><X size={16}/></button>
        </div>
        <div className="space-y-3">
          <div>
            <label className="text-xs text-white/50 mb-1 block">Plot name / label</label>
            <input value={editLabel} onChange={e => setEditLabel(e.target.value)}
              className="w-full bg-white/10 border border-white/15 rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:border-[#1D9E75]"/>
          </div>
          <div>
            <label className="text-xs text-white/50 mb-1 block">Size (acres)</label>
            <input type="number" step="0.5" value={editAcres} onChange={e => setEditAcres(e.target.value)}
              className="w-full bg-white/10 border border-white/15 rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:border-[#1D9E75]"/>
          </div>
          <button onClick={saveEdit}
            className="w-full py-3 bg-[#1D9E75] text-white font-semibold rounded-xl text-sm">
            Save Changes
          </button>
        </div>
        <p className="text-[10px] text-white/25 text-center mt-3">Changes apply to this session only (demo mode)</p>
      </div>
    )
  }

  if (showLogActivity) return <LogActivityModal plot={localPlot} onClose={() => setShowLog(false)} />
  if (showIssueInput)  return <IssueInputModal  plot={localPlot} onClose={() => setShowIssue(false)} />

  const props = { plot: localPlot, onClose, onEdit: () => setEditing(true),
    onLogActivity: () => setShowLog(true), onIssueInput: () => setShowIssue(true) }
  const { stage } = localPlot
  if (stage === 'empty')         return <EmptyPlotPanel    {...props} />
  if (stage === 'harvest_ready') return <HarvestReadyPanel {...props} />
  if (stage === 'fallow')        return <FallowPanel       {...props} />
  return <ActiveCropPanel {...props} />
}

// ── Empty plot — invite user to start a new crop ──────────────────────────────
function EmptyPlotPanel({ plot, onClose, onEdit }) {
  return (
    <PanelShell onClose={onClose} onEdit={onEdit} plotId={plot.id}>
      <div className="flex items-start justify-between mb-4">
        <div>
          <h2 className="text-lg font-bold text-white">{plot.label}</h2>
          <p className="text-sm text-white/40">{plot.acres} acres · Available for new crop</p>
        </div>
        <span className="text-xs bg-white/10 text-white/50 px-2.5 py-1 rounded-full border border-white/10">Empty</span>
      </div>

      {plot.last_task && (
        <p className="text-xs text-white/30 mb-4">Last cycle: {plot.last_task.label} ({plot.last_task.days_ago} days ago)</p>
      )}

      <p className="text-xs font-semibold text-white/60 uppercase tracking-wide mb-2">Select seeds from inventory to start</p>
      <div className="space-y-2 mb-4">
        {(plot.available_seeds || []).map(seed => (
          <button key={seed.name}
            className="w-full flex items-center justify-between bg-white/5 hover:bg-[#1D9E75]/15 border border-white/8 hover:border-[#1D9E75]/40 rounded-xl px-4 py-3 transition-colors text-left"
          >
            <div className="flex items-center gap-3">
              <Sprout size={16} className="text-[#1D9E75]"/>
              <div>
                <p className="text-sm text-white font-medium">{seed.name}</p>
                <p className="text-xs text-white/40">{seed.qty} {seed.unit} in stock</p>
              </div>
            </div>
            <ChevronRight size={14} className="text-white/30"/>
          </button>
        ))}
      </div>
      <button className="w-full flex items-center justify-center gap-2 py-2.5 text-xs text-white/40 border border-dashed border-white/15 rounded-xl hover:border-white/30">
        <Package size={13}/> Add seeds to inventory first
      </button>
    </PanelShell>
  )
}

// ── Fallow / permanent grass ──────────────────────────────────────────────────
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
      <p className="text-xs text-white/35 mt-3">This plot is resting or kept as permanent grass. No active crop cycle.</p>
    </PanelShell>
  )
}

// ── Active crop — growing / seeded / pre-harvest ──────────────────────────────
function ActiveCropPanel({ plot, onClose, onEdit, onLogActivity, onIssueInput }) {
  const isPreHarvest = plot.stage === 'pre_harvest'
  const isConcern    = plot.health_status === 'concern'

  const stageLabel = {
    seeded:      'Seeded',
    growing:     'Growing',
    pre_harvest: 'Pre-Harvest',
  }[plot.stage] || 'Active'

  const stageColor = isPreHarvest ? '#BA7517' : isConcern ? '#E24B4A' : '#1D9E75'

  return (
    <PanelShell onClose={onClose} onEdit={onEdit} plotId={plot.id}>
      {/* Header */}
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

      {/* Concern banner */}
      {isConcern && plot.concern_note && (
        <div className="flex items-start gap-2 bg-[#E24B4A]/10 border border-[#E24B4A]/25 rounded-xl px-3 py-2.5 mb-3">
          <AlertTriangle size={14} className="text-[#E24B4A] shrink-0 mt-0.5"/>
          <p className="text-xs text-[#E24B4A] leading-relaxed">{plot.concern_note}</p>
        </div>
      )}

      {/* Progress bar */}
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

      {/* Today's task — highlighted */}
      {plot.today_task && (
        <div className="flex items-start gap-2.5 rounded-xl px-3 py-2.5 mb-3 border"
          style={{ background:`${isConcern ? '#E24B4A' : '#BA7517'}15`, borderColor:`${isConcern ? '#E24B4A' : '#BA7517'}30` }}>
          <Clock size={14} className="shrink-0 mt-0.5" style={{ color: isConcern ? '#E24B4A' : '#BA7517' }}/>
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wide mb-0.5" style={{ color: isConcern ? '#E24B4A' : '#BA7517' }}>Today</p>
            <p className="text-xs text-white/80">{plot.today_task}</p>
          </div>
        </div>
      )}

      {/* Activity timeline */}
      <div className="space-y-2 mb-4">
        {plot.last_task && (
          <TimelineRow icon={<CheckCircle2 size={13} className="text-[#1D9E75]"/>} label={plot.last_task.label} sub={`${plot.last_task.days_ago}d ago`} done />
        )}
        {plot.today_task == null && plot.next_task && (
          <TimelineRow icon={<Clock size={13} className="text-[#BA7517]"/>} label={plot.next_task.label}
            sub={plot.next_task.in_days === 0 ? 'Today' : plot.next_task.in_days === 1 ? 'Tomorrow' : `In ${plot.next_task.in_days} days`}
            highlight={plot.next_task.in_days <= 1}
          />
        )}
        {plot.next_task && plot.today_task && (
          <TimelineRow icon={<Clock size={13} className="text-white/30"/>} label={plot.next_task.label}
            sub={`In ${plot.next_task.in_days} days`}
          />
        )}
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-3 gap-2 mb-4">
        <Stat label="Season cost"  value={`₹${(plot.season_cost||0).toLocaleString()}`}/>
        <Stat label="Health"       value={plot.health_status === 'concern' ? 'Concern' : plot.health_status === 'average' ? 'Monitor' : 'Healthy'} color={isConcern ? '#E24B4A' : plot.health_status === 'average' ? '#BA7517' : '#1D9E75'}/>
        <Stat label="Size"         value={`${plot.acres} ac`}/>
      </div>

      {/* Action buttons — context-aware */}
      <div className="flex gap-2">
        <button onClick={onLogActivity} className="flex-1 py-2.5 text-xs font-medium rounded-xl bg-white/8 hover:bg-white/15 text-white transition-colors border border-white/10">
          Log Activity
        </button>
        <button onClick={onIssueInput} className="flex-1 py-2.5 text-xs font-medium rounded-xl bg-white/8 hover:bg-white/15 text-white transition-colors border border-white/10">
          Issue Inputs
        </button>
        {isPreHarvest && (
          <button className="flex-1 py-2.5 text-xs font-semibold rounded-xl text-white transition-colors border"
            style={{ background:'#BA751720', borderColor:'#BA751740', color:'#BA7517' }}>
            Prepare
          </button>
        )}
        {!isPreHarvest && (
          <button className="flex-1 py-2.5 text-xs font-medium rounded-xl bg-white/8 hover:bg-white/15 text-white/60 transition-colors border border-white/8 opacity-50 cursor-not-allowed" title="Harvest only available when crop is ready">
            Harvest 🔒
          </button>
        )}
      </div>
      {!isPreHarvest && (
        <p className="text-[10px] text-white/25 text-center mt-2">
          Harvest unlocks at {plot.days_to_harvest != null ? `Day ${(plot.days_since_sow||0) + (plot.days_to_harvest||0)}` : 'harvest stage'}
        </p>
      )}
    </PanelShell>
  )
}

// ── Harvest ready — big CTA ───────────────────────────────────────────────────
function HarvestReadyPanel({ plot, onClose, onEdit }) {
  return (
    <PanelShell onClose={onClose} onEdit={onEdit} plotId={plot.id}>
      <div className="flex items-start justify-between mb-3">
        <div>
          <h2 className="text-lg font-bold text-white">{plot.label}</h2>
          <p className="text-sm text-white/50">{plot.acres} ac · {plot.current_crop}</p>
        </div>
        <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-[#1D9E75]/20 text-[#1D9E75] border border-[#1D9E75]/30 pulse">
          Ready ✓
        </span>
      </div>

      {/* Full progress */}
      <div className="mb-4">
        <div className="flex justify-between text-xs mb-1.5">
          <span className="text-white/45">Day {plot.days_since_sow} — harvest window open</span>
          <span className="text-[#1D9E75] font-medium">100% ✓</span>
        </div>
        <div className="h-2.5 bg-white/10 rounded-full overflow-hidden">
          <div className="h-full rounded-full bg-[#1D9E75]" style={{ width:'100%' }}/>
        </div>
      </div>

      {/* Yield estimate */}
      <div className="grid grid-cols-2 gap-3 mb-4">
        <div className="bg-[#1D9E75]/10 border border-[#1D9E75]/20 rounded-xl p-3">
          <p className="text-[10px] text-[#1D9E75]/70 mb-1">Est. Yield</p>
          <p className="text-lg font-bold text-[#1D9E75]">{plot.est_yield_qtl} qtl</p>
          <p className="text-[10px] text-white/30">15 qtl/ac × {plot.acres} ac</p>
        </div>
        <div className="bg-[#1D9E75]/10 border border-[#1D9E75]/20 rounded-xl p-3">
          <p className="text-[10px] text-[#1D9E75]/70 mb-1">Est. Revenue</p>
          <p className="text-lg font-bold text-[#1D9E75]">₹{(plot.est_revenue/1000).toFixed(0)}k</p>
          <p className="text-[10px] text-white/30">@ ₹2,200/qtl</p>
        </div>
      </div>

      {plot.last_task && (
        <TimelineRow icon={<CheckCircle2 size={13} className="text-[#1D9E75]"/>} label={plot.last_task.label} sub={`${plot.last_task.days_ago}d ago`} done />
      )}

      <div className="mt-4 flex gap-2">
        <button className="flex-1 py-3 text-sm font-bold rounded-xl text-white transition-colors"
          style={{ background:'#1D9E75', boxShadow:'0 0 20px rgba(29,158,117,0.35)' }}>
          Record Harvest
        </button>
        <button className="py-3 px-4 text-xs text-white/50 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10">
          Delay
        </button>
      </div>
      <p className="text-[10px] text-white/25 text-center mt-2">After recording harvest, this plot becomes available for the next cycle.</p>
    </PanelShell>
  )
}

// ── Shared panel shell ────────────────────────────────────────────────────────
function PanelShell({ children, onClose, onEdit, plotId }) {
  const navigate = useNavigate()
  return (
    <div className="absolute bottom-0 left-0 right-0 bg-[#1a1f2e]/97 backdrop-blur-md rounded-t-2xl p-5 shadow-2xl border-t border-white/10 animate-slide-up max-h-[75vh] overflow-y-auto">
      <div className="absolute top-3 right-3 flex items-center gap-2">
        {plotId && (
          <button onClick={() => navigate(`/media?plot=${plotId}`)}
            className="flex items-center gap-1 text-xs text-white/40 hover:text-[#1D9E75] px-2 py-1 rounded-lg transition-colors">
            <Camera size={13}/> Photos
          </button>
        )}
        {onEdit && (
          <button onClick={onEdit} className="text-xs text-[#1D9E75] hover:text-white px-2 py-1 rounded-lg hover:bg-[#1D9E75]/20 transition-colors">
            Edit
          </button>
        )}
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

// ── Log Activity Modal ────────────────────────────────────────────────────────
function LogActivityModal({ plot, onClose }) {
  const { logActivity } = useAppStore()
  const [form, setForm] = useState({
    type: 'irrigation', date: new Date().toISOString().slice(0,10), workers: '', hours: '', notes: '',
  })
  const [done, setDone] = useState(false)

  const TYPES = ['irrigation','weeding','fertilizer','pesticide','harvesting','ploughing','other']

  const submit = () => {
    if (!form.date) return
    logActivity({ plotId: plot.id, plotLabel: plot.label, ...form, workers: Number(form.workers)||0 })
    setDone(true)
    setTimeout(onClose, 1200)
  }

  return (
    <div className="absolute bottom-0 left-0 right-0 bg-[#1a1f2e]/97 backdrop-blur-md rounded-t-2xl p-5 shadow-2xl border-t border-white/10 animate-slide-up max-h-[80vh] overflow-y-auto">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-bold text-white">Log Activity — {plot.label}</h3>
        <button onClick={onClose} className="text-white/40 hover:text-white"><X size={18}/></button>
      </div>
      {done ? <p className="text-center text-[#1D9E75] font-semibold py-4">✓ Activity logged!</p> : (
        <div className="space-y-3">
          <div>
            <label className="text-xs text-white/50 block mb-1">Activity type</label>
            <select value={form.type} onChange={e=>setForm(p=>({...p,type:e.target.value}))}
              className="w-full bg-white/8 border border-white/12 rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:border-[#1D9E75]" style={{background:'#1a2030'}}>
              {TYPES.map(t=><option key={t} value={t} style={{background:'#1a2030'}}>{t.charAt(0).toUpperCase()+t.slice(1)}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs text-white/50 block mb-1">Date</label>
            <input type="date" value={form.date} onChange={e=>setForm(p=>({...p,date:e.target.value}))}
              className="w-full bg-white/8 border border-white/12 rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:border-[#1D9E75]" style={{colorScheme:'dark'}}/>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs text-white/50 block mb-1">Workers</label>
              <input type="number" placeholder="0" value={form.workers} onChange={e=>setForm(p=>({...p,workers:e.target.value}))}
                className="w-full bg-white/8 border border-white/12 rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:border-[#1D9E75]"/>
            </div>
            <div>
              <label className="text-xs text-white/50 block mb-1">Hours</label>
              <input type="number" placeholder="0" value={form.hours} onChange={e=>setForm(p=>({...p,hours:e.target.value}))}
                className="w-full bg-white/8 border border-white/12 rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:border-[#1D9E75]"/>
            </div>
          </div>
          <div>
            <label className="text-xs text-white/50 block mb-1">Notes</label>
            <textarea rows={2} placeholder="What was done…" value={form.notes} onChange={e=>setForm(p=>({...p,notes:e.target.value}))}
              className="w-full bg-white/8 border border-white/12 rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:border-[#1D9E75] resize-none"/>
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
  const [tab, setTab]   = useState('material')  // 'material' | 'labour'
  const [form, setForm] = useState({ itemId:'', qty:'', purpose:'', date: new Date().toISOString().slice(0,10),
    labourTypeId:'', workers:'', hours:'', rate:'' })
  const [done, setDone] = useState(false)

  const selectedItem = inventoryMaster.find(i=>i.id===form.itemId)
  const allLabour    = [...regularLabourers, ...contractualLabour]
  const selectedLT   = allLabour.find(l=>l.id===form.labourTypeId)
  const totalCost    = tab==='material'
    ? (parseFloat(form.qty)||0) * (selectedItem?.costPerUnit||0)
    : (parseFloat(form.workers)||0) * (parseFloat(form.rate)||0)

  const submit = () => {
    if (tab==='material') {
      if (!form.itemId||!form.qty) return
      issueItem({ itemId:form.itemId, plotId:plot.id, plotLabel:plot.label,
        date:form.date, qty:parseFloat(form.qty), totalCost, purpose:form.purpose, activityType:'manual' })
    } else {
      if (!form.labourTypeId||!form.workers) return
      logLabour({ labourTypeId:form.labourTypeId, labourName:selectedLT?.name||'',
        plotId:plot.id, plotLabel:plot.label, date:form.date,
        workers:parseFloat(form.workers), hours:parseFloat(form.hours)||0,
        ratePerDay:parseFloat(form.rate)||0, totalCost, purpose:form.purpose })
    }
    setDone(true)
    setTimeout(onClose, 1200)
  }

  return (
    <div className="absolute bottom-0 left-0 right-0 bg-[#1a1f2e]/97 backdrop-blur-md rounded-t-2xl p-5 shadow-2xl border-t border-white/10 animate-slide-up max-h-[85vh] overflow-y-auto">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-bold text-white">Issue Input — {plot.label}</h3>
        <button onClick={onClose} className="text-white/40 hover:text-white"><X size={18}/></button>
      </div>
      {done ? <p className="text-center text-[#1D9E75] font-semibold py-4">✓ Input issued!</p> : (<>
        <div className="flex gap-2 mb-4">
          {['material','labour'].map(t=>(
            <button key={t} onClick={()=>setTab(t)}
              className={`flex-1 py-2 text-xs font-semibold rounded-xl border transition-colors
                ${tab===t?'bg-[#1D9E75]/20 border-[#1D9E75]/50 text-[#1D9E75]':'bg-white/5 border-white/10 text-white/50'}`}>
              {t==='material'?'📦 Material':'👷 Labour'}
            </button>
          ))}
        </div>
        <div className="space-y-3">
          <div>
            <label className="text-xs text-white/50 block mb-1">Date</label>
            <input type="date" value={form.date} onChange={e=>setForm(p=>({...p,date:e.target.value}))}
              className="w-full bg-white/8 border border-white/12 rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:border-[#1D9E75]" style={{colorScheme:'dark'}}/>
          </div>
          {tab==='material' ? (<>
            <div>
              <label className="text-xs text-white/50 block mb-1">Select item</label>
              <select value={form.itemId} onChange={e=>setForm(p=>({...p,itemId:e.target.value}))}
                className="w-full bg-white/8 border border-white/12 rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:border-[#1D9E75]" style={{background:'#1a2030'}}>
                <option value="" style={{background:'#1a2030'}}>Choose item…</option>
                {inventoryMaster.map(i=>(
                  <option key={i.id} value={i.id} style={{background:'#1a2030'}}>{i.name} ({i.currentStock} {i.unit} in stock)</option>
                ))}
              </select>
            </div>
            {selectedItem && <p className="text-[10px] text-white/40">₹{selectedItem.costPerUnit}/{selectedItem.unit}</p>}
            <div>
              <label className="text-xs text-white/50 block mb-1">Quantity ({selectedItem?.unit||'unit'})</label>
              <input type="number" placeholder="0" value={form.qty} onChange={e=>setForm(p=>({...p,qty:e.target.value}))}
                className="w-full bg-white/8 border border-white/12 rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:border-[#1D9E75]"/>
            </div>
          </>) : (<>
            <div className="flex gap-1">
              {['regular','contractual'].map(k=>(
                <button key={k} onClick={()=>setForm(p=>({...p,labourKind:k,labourTypeId:'',rate:''}))}
                  className={`flex-1 py-1.5 text-[11px] font-semibold rounded-xl border transition-colors
                    ${(form.labourKind||'regular')===k?'bg-[#1D9E75]/20 border-[#1D9E75]/50 text-[#1D9E75]':'bg-white/5 border-white/10 text-white/40'}`}>
                  {k==='regular'?'👤 Regular':'🏗️ Contractual'}
                </button>
              ))}
            </div>
            <div>
              <label className="text-xs text-white/50 block mb-1">{(form.labourKind||'regular')==='regular'?'Select person':'Labour category'}</label>
              <select value={form.labourTypeId} onChange={e=>{
                const src=(form.labourKind||'regular')==='regular'?regularLabourers:contractualLabour
                const l=src.find(x=>x.id===e.target.value)
                setForm(p=>({...p,labourTypeId:e.target.value,rate:l?.ratePerDay||l?.defaultRate||'',workers:(form.labourKind||'regular')==='regular'?'1':p.workers}))
              }} className="w-full bg-white/8 border border-white/12 rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:border-[#1D9E75]" style={{background:'#1a2030'}}>
                <option value="" style={{background:'#1a2030'}}>Choose…</option>
                {((form.labourKind||'regular')==='regular'?regularLabourers:contractualLabour).map(l=>(
                  <option key={l.id} value={l.id} style={{background:'#1a2030'}}>
                    {l.name}{l.workType?` — ${l.workType}`:''} (₹{l.ratePerDay||l.defaultRate}/day)
                  </option>
                ))}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-xs text-white/50 block mb-1">Workers</label>
                <input type="number" placeholder="1" value={form.workers} onChange={e=>setForm(p=>({...p,workers:e.target.value}))}
                  className="w-full bg-white/8 border border-white/12 rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:border-[#1D9E75]"/>
              </div>
              <div>
                <label className="text-xs text-white/50 block mb-1">Rate/day (₹)</label>
                <input type="number" value={form.rate} onChange={e=>setForm(p=>({...p,rate:e.target.value}))}
                  className="w-full bg-white/8 border border-white/12 rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:border-[#1D9E75]"/>
              </div>
            </div>
          </>)}
          <div>
            <label className="text-xs text-white/50 block mb-1">Purpose</label>
            <input type="text" placeholder="e.g. Top dressing, weeding…" value={form.purpose} onChange={e=>setForm(p=>({...p,purpose:e.target.value}))}
              className="w-full bg-white/8 border border-white/12 rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:border-[#1D9E75]"/>
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

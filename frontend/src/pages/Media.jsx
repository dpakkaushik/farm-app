import React, { useState, useRef } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Camera, X, Play, ChevronLeft, ChevronRight, Lock, Filter, ImageOff } from 'lucide-react'
import { useAppStore } from '../store'

const ACT_COLOR = {
  irrigation:  { bg:'#1e3a5f', text:'#60a5fa', dot:'#3b82f6' },
  weeding:     { bg:'#3d1f0a', text:'#fb923c', dot:'#f97316' },
  fertilizer:  { bg:'#2d1b5e', text:'#a78bfa', dot:'#8b5cf6' },
  pesticide:   { bg:'#3b0f0f', text:'#f87171', dot:'#ef4444' },
  harvesting:  { bg:'#0f2e1e', text:'#34d399', dot:'#10b981' },
  ploughing:   { bg:'#2e2000', text:'#fbbf24', dot:'#f59e0b' },
  sowing:      { bg:'#0f2820', text:'#6ee7b7', dot:'#34d399' },
  other:       { bg:'#1f2937', text:'#9ca3af', dot:'#6b7280' },
}
const actColor = (a) => ACT_COLOR[a] || ACT_COLOR.other

const ACTIVITIES = ['irrigation','weeding','fertilizer','pesticide','harvesting','ploughing','sowing','other']

export default function Media() {
  const { mediaItems, addMediaItem } = useAppStore()
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()

  // Filters
  const [plotFilter, setPlotFilter] = useState(searchParams.get('plot') || 'all')
  const [actFilter,  setActFilter]  = useState('all')
  const [sort,       setSort]       = useState('newest')

  // Viewer
  const [viewerIdx, setViewerIdx] = useState(null)

  // Capture flow
  const [capturing, setCapturing]   = useState(false)
  const [preview,   setPreview]     = useState(null)   // object URL after camera snap
  const [form,      setForm]        = useState({ plotId:'', plotLabel:'', activity:'irrigation', caption:'' })
  const cameraRef = useRef(null)

  // All unique plots from media
  const allPlots = [...new Map(mediaItems.map(m => [m.plotId, m.plotLabel])).entries()]
    .map(([id, label]) => ({ id, label }))

  // Filtered + sorted list
  const filtered = mediaItems
    .filter(m => plotFilter === 'all' || m.plotId === plotFilter)
    .filter(m => actFilter  === 'all' || m.activity === actFilter)
    .sort((a, b) => sort === 'newest'
      ? new Date(b.date) - new Date(a.date)
      : new Date(a.date) - new Date(b.date))

  // Camera: trigger hidden input
  const openCamera = () => {
    setPreview(null)
    setForm({ plotId:'', plotLabel:'', activity:'irrigation', caption:'' })
    setCapturing(true)
    setTimeout(() => cameraRef.current?.click(), 100)
  }

  const handleCapture = (e) => {
    const file = e.target.files?.[0]
    if (!file) { setCapturing(false); return }
    const url = URL.createObjectURL(file)
    setPreview(url)
    e.target.value = ''
  }

  const submitPhoto = () => {
    if (!preview || !form.plotId || !form.activity) return
    addMediaItem({
      type: 'photo',
      plotId:    form.plotId,
      plotLabel: form.plotLabel || form.plotId,
      activity:  form.activity,
      date:      new Date().toISOString().slice(0,10),
      caption:   form.caption,
      url:       preview,
      uploadedBy:'Manager',
    })
    setCapturing(false)
    setPreview(null)
  }

  // Viewer nav
  const prevItem = () => setViewerIdx(i => (i - 1 + filtered.length) % filtered.length)
  const nextItem = () => setViewerIdx(i => (i + 1) % filtered.length)

  const photoCount = mediaItems.filter(m=>m.type==='photo').length
  const videoCount = mediaItems.filter(m=>m.type==='video').length

  return (
    <div className="h-full flex flex-col bg-[#0a0c10]">

      {/* ── Header ── */}
      <div className="shrink-0 px-4 pt-4 pb-3">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold text-white tracking-tight">Farm Media</h2>
            <p className="text-xs text-white/35 mt-0.5">{photoCount} photos · {videoCount} videos</p>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => setSort(s => s==='newest'?'oldest':'newest')}
              className="flex items-center gap-1.5 px-3 py-2 bg-white/5 border border-white/10 rounded-xl text-[10px] text-white/50 hover:text-white transition-colors">
              <Filter size={12}/>{sort==='newest'?'Newest':'Oldest'}
            </button>
          </div>
        </div>
      </div>

      {/* ── Plot filter ── */}
      <div className="shrink-0 px-4 pb-2 overflow-x-auto no-scrollbar">
        <div className="flex gap-2 w-max">
          <Chip active={plotFilter==='all'} onClick={()=>setPlotFilter('all')}>All Plots</Chip>
          {allPlots.map(p=>(
            <Chip key={p.id} active={plotFilter===p.id} onClick={()=>setPlotFilter(p.id)}>{p.label}</Chip>
          ))}
        </div>
      </div>

      {/* ── Activity filter ── */}
      <div className="shrink-0 px-4 pb-3 overflow-x-auto no-scrollbar">
        <div className="flex gap-2 w-max">
          <Chip active={actFilter==='all'} onClick={()=>setActFilter('all')} color="#1D9E75">All Activities</Chip>
          {ACTIVITIES.map(a=>{
            const c = actColor(a)
            return <Chip key={a} active={actFilter===a} onClick={()=>setActFilter(a)} color={c.dot}>{a.charAt(0).toUpperCase()+a.slice(1)}</Chip>
          })}
        </div>
      </div>

      {/* ── Grid ── */}
      <div className="flex-1 overflow-y-auto px-3 pb-24">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-white/20">
            <ImageOff size={40} strokeWidth={1}/>
            <p className="text-sm mt-3">No media for this filter</p>
          </div>
        ) : (
          <div style={{ columns:'2', columnGap:'8px' }}>
            {filtered.map((item, idx) => (
              <div key={item.id} className="mb-2 break-inside-avoid cursor-pointer group relative rounded-2xl overflow-hidden bg-[#161a23]"
                onClick={()=>setViewerIdx(idx)} style={{breakInside:'avoid'}}>

                {/* Thumbnail */}
                <div className="relative">
                  <img
                    src={item.type==='video' ? item.thumbnail : item.url}
                    alt={item.caption}
                    className="w-full object-cover"
                    style={{ aspectRatio:'4/3' }}
                    loading="lazy"
                    onError={e=>{ e.target.style.display='none' }}
                  />
                  {/* Video play badge */}
                  {item.type==='video' && (
                    <div className="absolute inset-0 flex items-center justify-center">
                      <div className="w-10 h-10 rounded-full bg-black/60 backdrop-blur-sm flex items-center justify-center border border-white/20">
                        <Play size={16} fill="white" className="text-white ml-0.5"/>
                      </div>
                      <span className="absolute top-2 right-2 text-[10px] bg-black/70 text-white px-1.5 py-0.5 rounded-md font-mono">{item.duration}</span>
                    </div>
                  )}
                  {/* Gradient overlay */}
                  <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent"/>
                  {/* Tags bottom */}
                  <div className="absolute bottom-0 left-0 right-0 p-2 space-y-1">
                    <div className="flex flex-wrap gap-1">
                      <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded-md text-white/80 bg-white/15 backdrop-blur-sm">
                        {item.plotLabel}
                      </span>
                      <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded-md backdrop-blur-sm"
                        style={{ background: actColor(item.activity).bg + 'cc', color: actColor(item.activity).text }}>
                        {item.activity}
                      </span>
                    </div>
                    <p className="text-[9px] text-white/50">{item.date}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Camera FAB ── */}
      <button onClick={openCamera}
        className="fixed bottom-20 right-5 w-14 h-14 rounded-full flex items-center justify-center shadow-2xl z-30 transition-transform active:scale-95"
        style={{ background:'linear-gradient(135deg,#1D9E75,#15805e)', boxShadow:'0 4px 24px rgba(29,158,117,0.5)' }}>
        <Camera size={22} className="text-white"/>
      </button>

      {/* Hidden camera input */}
      <input ref={cameraRef} type="file" accept="image/*" capture="environment"
        className="hidden" onChange={handleCapture}/>

      {/* ── Capture Form (after photo taken) ── */}
      {capturing && preview && (
        <div className="fixed inset-0 z-50 flex flex-col bg-[#0a0c10]">
          {/* Preview */}
          <div className="flex-1 relative min-h-0">
            <img src={preview} alt="capture" className="w-full h-full object-contain"/>
            <button onClick={()=>{ setCapturing(false); setPreview(null) }}
              className="absolute top-4 right-4 w-9 h-9 rounded-full bg-black/60 flex items-center justify-center">
              <X size={18} className="text-white"/>
            </button>
          </div>

          {/* Tag form */}
          <div className="shrink-0 bg-[#161a23] rounded-t-3xl p-5 space-y-4 border-t border-white/10">
            <p className="text-sm font-bold text-white">Tag this photo</p>

            {/* Plot */}
            <div>
              <label className="text-xs text-white/50 block mb-1.5">Plot / Field</label>
              <select value={form.plotId}
                onChange={e=>{
                  const opt = e.target.options[e.target.selectedIndex]
                  setForm(p=>({...p, plotId:e.target.value, plotLabel:opt.text}))
                }}
                className="w-full bg-white/8 border border-white/12 rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:border-[#1D9E75]"
                style={{background:'#1a2030'}}>
                <option value="" style={{background:'#1a2030'}}>Select plot…</option>
                {allPlots.map(p=><option key={p.id} value={p.id} style={{background:'#1a2030'}}>{p.label}</option>)}
              </select>
            </div>

            {/* Activity */}
            <div>
              <label className="text-xs text-white/50 block mb-1.5">Activity</label>
              <div className="flex flex-wrap gap-2">
                {ACTIVITIES.map(a=>{
                  const c = actColor(a)
                  const active = form.activity === a
                  return (
                    <button key={a} onClick={()=>setForm(p=>({...p,activity:a}))}
                      className="px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all"
                      style={active
                        ? { background:c.bg, color:c.text, borderColor:c.dot+'80' }
                        : { background:'transparent', color:'rgba(255,255,255,0.4)', borderColor:'rgba(255,255,255,0.1)' }}>
                      {a.charAt(0).toUpperCase()+a.slice(1)}
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Caption */}
            <div>
              <label className="text-xs text-white/50 block mb-1.5">Caption (optional)</label>
              <input placeholder="What's happening here…" value={form.caption}
                onChange={e=>setForm(p=>({...p,caption:e.target.value}))}
                className="w-full bg-white/8 border border-white/12 rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:border-[#1D9E75]"/>
            </div>

            <button onClick={submitPhoto} disabled={!form.plotId}
              className="w-full py-3 rounded-xl text-sm font-bold text-white disabled:opacity-40 transition-opacity"
              style={{background:'#1D9E75'}}>
              Save Photo
            </button>
          </div>
        </div>
      )}

      {/* Video coming-soon nudge when FAB long-pressed (we show it as info inline) */}

      {/* ── Full-screen Viewer ── */}
      {viewerIdx !== null && filtered[viewerIdx] && (
        <div className="fixed inset-0 z-50 bg-black flex flex-col" onClick={()=>setViewerIdx(null)}>
          {/* Nav bar */}
          <div className="shrink-0 flex items-center justify-between px-4 pt-12 pb-3 bg-gradient-to-b from-black/80 to-transparent absolute top-0 left-0 right-0 z-10"
            onClick={e=>e.stopPropagation()}>
            <button onClick={()=>setViewerIdx(null)} className="w-9 h-9 rounded-full bg-white/10 flex items-center justify-center">
              <X size={18} className="text-white"/>
            </button>
            <span className="text-xs text-white/50">{viewerIdx+1} / {filtered.length}</span>
            <div className="w-9"/>
          </div>

          {/* Image / Video */}
          <div className="flex-1 flex items-center justify-center relative" onClick={e=>e.stopPropagation()}>
            {filtered[viewerIdx].type==='video' ? (
              <div className="flex flex-col items-center gap-4 text-white/40">
                <div className="w-20 h-20 rounded-full bg-white/5 border border-white/10 flex items-center justify-center">
                  <Play size={32} className="text-white/30 ml-1"/>
                </div>
                <p className="text-sm">Video playback needs backend</p>
                <img src={filtered[viewerIdx].thumbnail} alt="" className="w-64 rounded-2xl opacity-40 object-cover" style={{aspectRatio:'16/9'}}/>
              </div>
            ) : (
              <img src={filtered[viewerIdx].url} alt={filtered[viewerIdx].caption}
                className="max-w-full max-h-full object-contain"/>
            )}

            {/* Prev / Next */}
            {filtered.length > 1 && (<>
              <button onClick={e=>{e.stopPropagation();prevItem()}}
                className="absolute left-3 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-black/50 flex items-center justify-center">
                <ChevronLeft size={20} className="text-white"/>
              </button>
              <button onClick={e=>{e.stopPropagation();nextItem()}}
                className="absolute right-3 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-black/50 flex items-center justify-center">
                <ChevronRight size={20} className="text-white"/>
              </button>
            </>)}
          </div>

          {/* Info panel */}
          <div className="shrink-0 px-5 pt-4 pb-8 bg-gradient-to-t from-black to-transparent" onClick={e=>e.stopPropagation()}>
            <div className="flex items-center gap-2 mb-2">
              <span className="text-xs font-semibold px-2.5 py-1 rounded-lg bg-white/10 text-white/80">
                {filtered[viewerIdx].plotLabel}
              </span>
              <span className="text-xs font-semibold px-2.5 py-1 rounded-lg"
                style={{ background: actColor(filtered[viewerIdx].activity).bg, color: actColor(filtered[viewerIdx].activity).text }}>
                {filtered[viewerIdx].activity}
              </span>
              <span className="text-xs text-white/30 ml-auto">{filtered[viewerIdx].date}</span>
            </div>
            {filtered[viewerIdx].caption && (
              <p className="text-sm text-white/70 leading-relaxed">{filtered[viewerIdx].caption}</p>
            )}
            <p className="text-[10px] text-white/25 mt-1">By {filtered[viewerIdx].uploadedBy}</p>
          </div>
        </div>
      )}

      <style>{`.no-scrollbar::-webkit-scrollbar{display:none;}.no-scrollbar{-ms-overflow-style:none;scrollbar-width:none;}`}</style>
    </div>
  )
}

function Chip({ active, onClick, children, color }) {
  return (
    <button onClick={onClick}
      className="shrink-0 px-3 py-1.5 rounded-full text-[11px] font-semibold border transition-all"
      style={active
        ? { background:(color||'#1D9E75')+'22', borderColor:(color||'#1D9E75')+'60', color: color||'#1D9E75' }
        : { background:'transparent', borderColor:'rgba(255,255,255,0.1)', color:'rgba(255,255,255,0.4)' }}>
      {children}
    </button>
  )
}

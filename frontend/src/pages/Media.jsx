import React, { useState, useRef } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Camera, Video, X, Play, ChevronLeft, ChevronRight, Filter, ImageOff, Trash2 } from 'lucide-react'
import imageCompression from 'browser-image-compression'
import { useAppStore } from '../store'
import { supabase } from '../lib/supabase'
import { useAuthStore, isAdmin } from '../store/auth'

// ── Compression profiles ────────────────────────────────────────────────────
const FULL_OPTIONS = {
  maxSizeMB: 0.8, maxWidthOrHeight: 1920,
  useWebWorker: true, fileType: 'image/jpeg', initialQuality: 0.82,
}
const THUMB_OPTIONS = {
  maxSizeMB: 0.05, maxWidthOrHeight: 480,
  useWebWorker: true, fileType: 'image/jpeg', initialQuality: 0.70,
}

const MAX_VIDEO_BYTES = 100 * 1024 * 1024  // 100 MB
const MAX_VIDEO_SECS  = 90

// ── Activity color map ──────────────────────────────────────────────────────
const ACT_COLOR = {
  irrigation: { bg:'#1e3a5f', text:'#60a5fa', dot:'#3b82f6' },
  weeding:    { bg:'#3d1f0a', text:'#fb923c', dot:'#f97316' },
  fertilizer: { bg:'#2d1b5e', text:'#a78bfa', dot:'#8b5cf6' },
  pesticide:  { bg:'var(--c-card-danger)', text:'#f87171', dot:'#ef4444' },
  harvesting: { bg:'#0f2e1e', text:'#34d399', dot:'#10b981' },
  ploughing:  { bg:'#2e2000', text:'#fbbf24', dot:'#f59e0b' },
  sowing:     { bg:'#0f2820', text:'#6ee7b7', dot:'#34d399' },
  events:     { bg:'#3b0f2e', text:'#f472b6', dot:'#ec4899' },
  other:      { bg:'#1f2937', text:'#9ca3af', dot:'#6b7280' },
}
const actColor = (a) => ACT_COLOR[a] || ACT_COLOR.other
const ACTIVITIES = ['irrigation','weeding','fertilizer','pesticide','harvesting','ploughing','sowing','events','other']

// ── Capture a thumbnail frame from a video file using the Canvas API ────────
// No library needed — this is built into every browser.
const captureVideoThumbnail = (file) =>
  new Promise((resolve, reject) => {
    const video  = document.createElement('video')
    const blobUrl = URL.createObjectURL(file)
    video.preload   = 'metadata'
    video.muted     = true
    video.playsInline = true

    video.onloadedmetadata = () => {
      if (video.duration > MAX_VIDEO_SECS) {
        URL.revokeObjectURL(blobUrl)
        return reject(new Error(`Video too long. Max ${MAX_VIDEO_SECS} seconds.`))
      }
      // Seek to 10% in (or 1s if video is very short) for a representative frame
      video.currentTime = Math.min(1, video.duration * 0.1)
    }

    video.onseeked = () => {
      const W = 480
      const H = Math.round(W * (video.videoHeight / video.videoWidth)) || 270
      const canvas = document.createElement('canvas')
      canvas.width = W; canvas.height = H
      canvas.getContext('2d').drawImage(video, 0, 0, W, H)
      canvas.toBlob((blob) => {
        URL.revokeObjectURL(blobUrl)
        resolve({ thumbnailBlob: blob, duration: Math.round(video.duration) })
      }, 'image/jpeg', 0.75)
    }

    video.onerror = () => {
      URL.revokeObjectURL(blobUrl)
      reject(new Error('Could not read video file'))
    }

    video.src = blobUrl
  })

// ── Helpers ─────────────────────────────────────────────────────────────────
const fmtDuration = (secs) => {
  const m = Math.floor(secs / 60)
  const s = secs % 60
  return m > 0 ? `${m}m ${s}s` : `${s}s`
}

// ── Component ────────────────────────────────────────────────────────────────
export default function Media() {
  const { mediaItems, addMediaItem, plots } = useAppStore()
  const { profile } = useAuthStore()
  const adminUser = isAdmin(profile)

  const deleteMedia = async (item, e) => {
    e.stopPropagation()
    if (!window.confirm('Delete this media permanently?')) return
    const bucket = item.type === 'video' ? 'farm-videos' : 'farm-photos'
    if (item.storagePath)  await supabase.storage.from(bucket).remove([item.storagePath])
    if (item.thumbnailPath) await supabase.storage.from(bucket).remove([item.thumbnailPath])
    await supabase.from('media_files').delete().eq('id', item.id)
    useAppStore.setState(s => ({ mediaItems: s.mediaItems.filter(m => m.id !== item.id) }))
  }
  const [searchParams] = useSearchParams()

  const [plotFilter, setPlotFilter] = useState(searchParams.get('plot') || 'all')
  const [actFilter,   setActFilter]   = useState('all')
  const [yearFilter,  setYearFilter]  = useState('all')
  const [monthFilter, setMonthFilter] = useState('all')
  const [sort,        setSort]        = useState('newest')
  const [viewerIdx,   setViewerIdx]   = useState(null)

  // Capture state
  const [capturing,      setCapturing]      = useState(false)
  const [captureType,    setCaptureType]    = useState('photo')
  const [preview,        setPreview]        = useState(null)   // blob URL — display only
  const [capturedFile,   setCapturedFile]   = useState(null)   // real File object
  const [uploadPhase,    setUploadPhase]    = useState('idle') // 'idle'|'compressing'|'uploading'
  const [uploadProgress, setUploadProgress] = useState(0)     // 0–100
  const [form, setForm] = useState({ plotId:'', plotLabel:'', activity:'irrigation', caption:'' })

  const photoInputRef = useRef(null)
  const videoInputRef = useRef(null)

  const allPlots = plots.map(p => ({ id: p.id, label: p.name }))

  // Derive years and months from actual data so empty options never appear
  const availableYears = [...new Set(
    mediaItems.map(m => m.date?.slice(0, 4)).filter(Boolean)
  )].sort().reverse()

  const availableMonths = [...new Set(
    mediaItems
      .filter(m => yearFilter === 'all' || m.date?.startsWith(yearFilter))
      .map(m => m.date?.slice(5, 7))
      .filter(Boolean)
  )].sort()

  const MONTH_LABEL = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

  const filtered = mediaItems
    .filter(m => plotFilter  === 'all' || m.plotId === plotFilter)
    .filter(m => actFilter   === 'all' || m.activity === actFilter)
    .filter(m => yearFilter  === 'all' || m.date?.startsWith(yearFilter))
    .filter(m => monthFilter === 'all' || m.date?.slice(5, 7) === monthFilter)
    .sort((a, b) => sort === 'newest'
      ? new Date(b.date) - new Date(a.date)
      : new Date(a.date) - new Date(b.date))

  // ── Capture handlers ──────────────────────────────────────────────────────

  const resetCapture = () => {
    if (preview) URL.revokeObjectURL(preview)  // free blob URL memory
    setCapturing(false); setPreview(null); setCapturedFile(null)
    setUploadPhase('idle'); setUploadProgress(0)
  }

  const openCapture = (type) => {
    setCaptureType(type)
    setForm({ plotId:'', plotLabel:'', activity:'irrigation', caption:'' })
    setCapturing(true)
    const ref = type === 'photo' ? photoInputRef : videoInputRef
    setTimeout(() => ref.current?.click(), 100)
  }

  const handleFileSelect = (e) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) { setCapturing(false); return }

    const isImage = file.type.startsWith('image/')
    const isVideo = file.type.startsWith('video/')
    if (!isImage && !isVideo) { alert('Unsupported file type'); setCapturing(false); return }
    if (isVideo && file.size > MAX_VIDEO_BYTES) {
      alert('Video too large. Max 100 MB.'); setCapturing(false); return
    }

    setCapturedFile(file)
    setPreview(URL.createObjectURL(file))
  }

  const submitMedia = async () => {
    const isEvent   = form.activity === 'events'
    if (!preview || (!isEvent && !form.plotId) || !form.activity || !capturedFile) return
    const today     = new Date().toISOString().slice(0, 10)
    const ts        = Date.now()
    const plotId    = isEvent ? null    : form.plotId
    const plotLabel = isEvent ? 'Event' : (form.plotLabel || form.plotId)
    const folder    = isEvent ? 'events' : form.plotId

    try {
      if (capturedFile.type.startsWith('image/')) {
        setUploadPhase('compressing'); setUploadProgress(5)

        const full = await imageCompression(capturedFile, {
          ...FULL_OPTIONS,
          onProgress: (p) => setUploadProgress(5 + Math.round(p * 0.35)),
        })
        const thumb = await imageCompression(full, {
          ...THUMB_OPTIONS,
          onProgress: (p) => setUploadProgress(40 + Math.round(p * 0.15)),
        })

        setUploadPhase('uploading'); setUploadProgress(60)

        const fullPath  = `farm_photo/${folder}/${ts}.jpg`
        const thumbPath = `farm_photo/${folder}/${ts}_thumb.jpg`

        const [{ error: e1 }, { error: e2 }] = await Promise.all([
          supabase.storage.from('farm-photos').upload(fullPath,  full,  { contentType: 'image/jpeg' }),
          supabase.storage.from('farm-photos').upload(thumbPath, thumb, { contentType: 'image/jpeg' }),
        ])
        if (e1) throw e1
        if (e2) throw e2
        setUploadProgress(88)

        const { data: { publicUrl } }               = supabase.storage.from('farm-photos').getPublicUrl(fullPath)
        const { data: { publicUrl: thumbUrl } }     = supabase.storage.from('farm-photos').getPublicUrl(thumbPath)

        await addMediaItem({
          type: 'photo', plotId, plotLabel, activity: form.activity,
          date: today, caption: form.caption, url: publicUrl, thumbnailUrl: thumbUrl,
          storagePath: fullPath, thumbnailPath: thumbPath, uploadedBy: 'Manager',
        })

      } else {
        setUploadPhase('compressing'); setUploadProgress(5)

        const { thumbnailBlob, duration } = await captureVideoThumbnail(capturedFile)
        setUploadProgress(30)

        setUploadPhase('uploading'); setUploadProgress(40)

        const ext       = capturedFile.name.split('.').pop() || 'mp4'
        const vidPath   = `farm_video/${folder}/${ts}.${ext}`
        const thumbPath = `farm_video/${folder}/${ts}_thumb.jpg`

        const [{ error: e1 }, { error: e2 }] = await Promise.all([
          supabase.storage.from('farm-videos').upload(vidPath,   capturedFile,  { contentType: capturedFile.type }),
          supabase.storage.from('farm-videos').upload(thumbPath, thumbnailBlob, { contentType: 'image/jpeg' }),
        ])
        if (e1) throw e1
        if (e2) throw e2
        setUploadProgress(90)

        const { data: { publicUrl: videoUrl } } = supabase.storage.from('farm-videos').getPublicUrl(vidPath)
        const { data: { publicUrl: thumbUrl } } = supabase.storage.from('farm-videos').getPublicUrl(thumbPath)

        await addMediaItem({
          type: 'video', plotId, plotLabel, activity: form.activity,
          date: today, caption: form.caption, url: videoUrl, thumbnailUrl: thumbUrl,
          duration: fmtDuration(duration), storagePath: vidPath, thumbnailPath: thumbPath,
          uploadedBy: 'Manager',
        })
      }

      setUploadProgress(100)
      URL.revokeObjectURL(preview)
      resetCapture()

    } catch (err) {
      alert(err.message || 'Upload failed')
      setUploadPhase('idle'); setUploadProgress(0)
    }
  }

  // ── Viewer nav ────────────────────────────────────────────────────────────
  const prevItem = () => setViewerIdx(i => (i - 1 + filtered.length) % filtered.length)
  const nextItem = () => setViewerIdx(i => (i + 1) % filtered.length)

  const photoCount = mediaItems.filter(m => m.type === 'photo').length
  const videoCount = mediaItems.filter(m => m.type === 'video').length
  const isBusy     = uploadPhase !== 'idle'

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="h-full flex flex-col bg-[var(--c-bg)]">

      {/* ── Header ── */}
      <div className="shrink-0 px-4 pt-4 pb-3">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold text-[var(--c-text)] tracking-tight">Farm Media</h2>
            <p className="text-xs text-[var(--c-muted)] mt-0.5">{photoCount} photos · {videoCount} videos</p>
          </div>
          <button onClick={() => setSort(s => s === 'newest' ? 'oldest' : 'newest')}
            className="flex items-center gap-1.5 px-3 py-2 bg-[var(--c-card)] border border-[var(--c-border-md)] rounded-xl text-[10px] text-[var(--c-sub)] hover:text-[var(--c-text)] transition-colors">
            <Filter size={12}/>{sort === 'newest' ? 'Newest' : 'Oldest'}
          </button>
        </div>
      </div>

      {/* ── Plot filter ── */}
      <div className="shrink-0 px-4 pb-2 overflow-x-auto no-scrollbar">
        <div className="flex gap-2 w-max">
          <Chip active={plotFilter === 'all'} onClick={() => setPlotFilter('all')}>All Plots</Chip>
          {allPlots.map(p => (
            <Chip key={p.id} active={plotFilter === p.id} onClick={() => setPlotFilter(p.id)}>{p.label}</Chip>
          ))}
        </div>
      </div>

      {/* ── Activity filter ── */}
      <div className="shrink-0 px-4 pb-3 overflow-x-auto no-scrollbar">
        <div className="flex gap-2 w-max">
          <Chip active={actFilter === 'all'} onClick={() => setActFilter('all')} color="#1D9E75">All</Chip>
          {ACTIVITIES.map(a => {
            const c = actColor(a)
            return (
              <Chip key={a} active={actFilter === a} onClick={() => setActFilter(a)} color={c.dot}>
                {a.charAt(0).toUpperCase() + a.slice(1)}
              </Chip>
            )
          })}
        </div>
      </div>

      {/* ── Year filter ── */}
      {availableYears.length > 0 && (
        <div className="shrink-0 px-4 pb-2 overflow-x-auto no-scrollbar">
          <div className="flex gap-2 w-max">
            <Chip active={yearFilter === 'all'} onClick={() => { setYearFilter('all'); setMonthFilter('all') }}>All Years</Chip>
            {availableYears.map(y => (
              <Chip key={y} active={yearFilter === y} onClick={() => { setYearFilter(y); setMonthFilter('all') }}>{y}</Chip>
            ))}
          </div>
        </div>
      )}

      {/* ── Month filter ── */}
      {availableMonths.length > 0 && (
        <div className="shrink-0 px-4 pb-3 overflow-x-auto no-scrollbar">
          <div className="flex gap-2 w-max">
            <Chip active={monthFilter === 'all'} onClick={() => setMonthFilter('all')}>All Months</Chip>
            {availableMonths.map(mm => (
              <Chip key={mm} active={monthFilter === mm} onClick={() => setMonthFilter(mm)}>
                {MONTH_LABEL[parseInt(mm, 10) - 1]}
              </Chip>
            ))}
          </div>
        </div>
      )}

      {/* ── Media grid ── */}
      <div className="flex-1 overflow-y-auto px-3 pb-28">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-[var(--c-faint)]">
            <ImageOff size={40} strokeWidth={1}/>
            <p className="text-sm mt-3">No media for this filter</p>
          </div>
        ) : (
          <div style={{ columns: '2', columnGap: '8px' }}>
            {filtered.map((item, idx) => (
              <div key={item.id}
                className="mb-2 break-inside-avoid cursor-pointer rounded-2xl overflow-hidden bg-[var(--c-nav)] group"
                style={{ breakInside: 'avoid' }}
                onClick={() => setViewerIdx(idx)}>

                <div className="relative">
                  {/* Thumbnail — small file, fast grid loading */}
                  <img
                    src={item.thumbnailUrl || item.url}
                    alt={item.caption || ''}
                    className="w-full object-cover"
                    style={{ aspectRatio: '4/3', opacity: 0, transition: 'opacity 0.25s ease' }}
                    loading="lazy"
                    decoding="async"
                    onLoad={e  => { e.currentTarget.style.opacity = '1' }}
                    onError={e => { e.currentTarget.style.display  = 'none' }}
                  />

                  {/* Video play badge */}
                  {item.type === 'video' && (
                    <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                      <div className="w-10 h-10 rounded-full bg-black/60 backdrop-blur-sm flex items-center justify-center border border-white/20">
                        <Play size={16} fill="white" className="text-[var(--c-text)] ml-0.5"/>
                      </div>
                      {item.duration && (
                        <span className="absolute top-2 right-2 text-[10px] bg-black/70 text-[var(--c-text)] px-1.5 py-0.5 rounded-md font-mono">
                          {item.duration}
                        </span>
                      )}
                    </div>
                  )}

                  {/* Gradient + tags */}
                  <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent pointer-events-none"/>
                  <div className="absolute bottom-0 left-0 right-0 p-2 space-y-1 pointer-events-none">
                    <div className="flex flex-wrap gap-1">
                      <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded-md text-[var(--c-text-80)] bg-white/15 backdrop-blur-sm">
                        {item.plotLabel}
                      </span>
                      <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded-md backdrop-blur-sm"
                        style={{ background: actColor(item.activity).bg + 'cc', color: actColor(item.activity).text }}>
                        {item.activity}
                      </span>
                    </div>
                    <p className="text-[9px] text-[var(--c-sub)]">{item.date}</p>
                  </div>
                  {adminUser && (
                    <button
                      onClick={e => deleteMedia(item, e)}
                      className="absolute top-2 right-2 w-7 h-7 rounded-full bg-black/60 backdrop-blur-sm flex items-center justify-center opacity-0 group-hover:opacity-100 hover:bg-[#E24B4A]/80 transition-all border border-white/20">
                      <Trash2 size={12} className="text-[var(--c-text)]"/>
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── FABs: Photo + Video ── */}
      <div className="fixed bottom-20 right-5 flex flex-col gap-3 z-30">
        <button onClick={() => openCapture('video')}
          className="w-12 h-12 rounded-full flex items-center justify-center shadow-xl transition-transform active:scale-95"
          style={{ background: 'linear-gradient(135deg,#1a56db,#1141a3)', boxShadow: '0 4px 20px rgba(26,86,219,0.5)' }}>
          <Video size={18} className="text-[var(--c-text)]"/>
        </button>
        <button onClick={() => openCapture('photo')}
          className="w-14 h-14 rounded-full flex items-center justify-center shadow-2xl transition-transform active:scale-95"
          style={{ background: 'linear-gradient(135deg,#1D9E75,#15805e)', boxShadow: '0 4px 24px rgba(29,158,117,0.5)' }}>
          <Camera size={22} className="text-[var(--c-text)]"/>
        </button>
      </div>

      {/* ── Hidden file inputs ── */}
      <input ref={photoInputRef} type="file" accept="image/*" capture="environment"
        className="hidden" onChange={handleFileSelect}/>
      <input ref={videoInputRef} type="file" accept="video/*"
        className="hidden" onChange={handleFileSelect}/>

      {/* ── Capture / Tag form ── */}
      {capturing && preview && (
        <div className="fixed inset-0 z-50 flex flex-col bg-[var(--c-bg)]">

          {/* Preview */}
          <div className="flex-1 relative min-h-0 bg-black">
            {capturedFile?.type.startsWith('video/') ? (
              <video src={preview} className="w-full h-full object-contain" controls playsInline muted/>
            ) : (
              <img src={preview} alt="capture" className="w-full h-full object-contain"/>
            )}
            <button onClick={resetCapture} disabled={isBusy}
              className="absolute top-4 right-4 w-9 h-9 rounded-full bg-black/60 flex items-center justify-center disabled:opacity-40">
              <X size={18} className="text-[var(--c-text)]"/>
            </button>
          </div>

          {/* Tag form */}
          <div className="shrink-0 bg-[var(--c-nav)] rounded-t-3xl p-5 space-y-4 border-t border-[var(--c-border-md)]">
            <p className="text-sm font-bold text-[var(--c-text)]">
              Tag this {captureType === 'video' ? 'video' : 'photo'}
            </p>

            <div>
              <label className="text-xs text-[var(--c-sub)] block mb-1.5">Activity</label>
              <div className="flex flex-wrap gap-2">
                {ACTIVITIES.map(a => {
                  const c = actColor(a)
                  const active = form.activity === a
                  return (
                    <button key={a}
                      onClick={() => setForm(p => ({ ...p, activity: a, plotId: a === 'events' ? '' : p.plotId }))}
                      className="px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all"
                      style={active
                        ? { background: c.bg, color: c.text, borderColor: c.dot + '80' }
                        : { background: 'transparent', color: 'var(--c-muted)', borderColor: 'var(--c-border-md)' }}>
                      {a.charAt(0).toUpperCase() + a.slice(1)}
                    </button>
                  )
                })}
              </div>
            </div>

            {form.activity !== 'events' && (
              <div>
                <label className="text-xs text-[var(--c-sub)] block mb-1.5">Plot / Field</label>
                <select value={form.plotId}
                  onChange={e => {
                    const opt = e.target.options[e.target.selectedIndex]
                    setForm(p => ({ ...p, plotId: e.target.value, plotLabel: opt.text }))
                  }}
                  className="w-full border border-[var(--c-border-md)] rounded-xl px-3 py-2.5 text-sm text-[var(--c-text)] focus:outline-none focus:border-[#1D9E75]"
                  style={{ background: 'var(--c-surface)' }}>
                  <option value="" style={{ background: 'var(--c-surface)' }}>Select plot…</option>
                  {allPlots.map(p => <option key={p.id} value={p.id} style={{ background: 'var(--c-surface)' }}>{p.label}</option>)}
                </select>
              </div>
            )}

            <div>
              <label className="text-xs text-[var(--c-sub)] block mb-1.5">Caption (optional)</label>
              <input placeholder="What's happening here…" value={form.caption}
                onChange={e => setForm(p => ({ ...p, caption: e.target.value }))}
                className="w-full border border-[var(--c-border-md)] rounded-xl px-3 py-2.5 text-sm text-[var(--c-text)] focus:outline-none focus:border-[#1D9E75]"
                style={{ background: 'var(--c-surface)' }}/>
            </div>

            {isBusy && (
              <div className="w-full h-1.5 bg-[var(--c-ghost)] rounded-full overflow-hidden">
                <div className="h-full rounded-full transition-all duration-300"
                  style={{ width: `${uploadProgress}%`, background: '#1D9E75' }}/>
              </div>
            )}

            <button onClick={submitMedia} disabled={(form.activity !== 'events' && !form.plotId) || isBusy}
              className="w-full py-3 rounded-xl text-sm font-bold text-[var(--c-text)] disabled:opacity-50 transition-opacity"
              style={{ background: '#1D9E75' }}>
              {uploadPhase === 'compressing'
                ? (captureType === 'video' ? 'Generating thumbnail…' : `Compressing… ${uploadProgress}%`)
                : uploadPhase === 'uploading' ? 'Uploading…'
                : `Save ${captureType === 'video' ? 'Video' : 'Photo'}`}
            </button>
          </div>
        </div>
      )}

      {/* ── Full-screen viewer ── */}
      {viewerIdx !== null && filtered[viewerIdx] && (
        <div className="fixed inset-0 z-50 bg-black flex flex-col" onClick={() => setViewerIdx(null)}>

          {/* Nav bar */}
          <div className="shrink-0 flex items-center justify-between px-4 pt-12 pb-3 absolute top-0 left-0 right-0 z-10
                          bg-gradient-to-b from-black/80 to-transparent"
            onClick={e => e.stopPropagation()}>
            <button onClick={() => setViewerIdx(null)}
              className="w-9 h-9 rounded-full bg-[var(--c-ghost)] flex items-center justify-center">
              <X size={18} className="text-[var(--c-text)]"/>
            </button>
            <span className="text-xs text-[var(--c-sub)]">{viewerIdx + 1} / {filtered.length}</span>
            <div className="w-9"/>
          </div>

          {/* Media — full quality for viewer */}
          <div className="flex-1 flex items-center justify-center relative" onClick={e => e.stopPropagation()}>
            {filtered[viewerIdx].type === 'video' ? (
              <video
                src={filtered[viewerIdx].url}
                controls
                playsInline
                preload="metadata"
                className="max-w-full max-h-full"
                style={{ maxHeight: 'calc(100vh - 180px)' }}
              />
            ) : (
              <img
                src={filtered[viewerIdx].url}
                alt={filtered[viewerIdx].caption || ''}
                className="max-w-full max-h-full object-contain"
                decoding="async"
              />
            )}

            {filtered.length > 1 && (
              <>
                <button onClick={e => { e.stopPropagation(); prevItem() }}
                  className="absolute left-3 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-black/50 flex items-center justify-center">
                  <ChevronLeft size={20} className="text-[var(--c-text)]"/>
                </button>
                <button onClick={e => { e.stopPropagation(); nextItem() }}
                  className="absolute right-3 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-black/50 flex items-center justify-center">
                  <ChevronRight size={20} className="text-[var(--c-text)]"/>
                </button>
              </>
            )}
          </div>

          {/* Info panel */}
          <div className="shrink-0 px-5 pt-4 pb-8 bg-gradient-to-t from-black to-transparent"
            onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-2 mb-2 flex-wrap">
              <span className="text-xs font-semibold px-2.5 py-1 rounded-lg bg-[var(--c-ghost)] text-[var(--c-text-80)]">
                {filtered[viewerIdx].plotLabel}
              </span>
              <span className="text-xs font-semibold px-2.5 py-1 rounded-lg"
                style={{ background: actColor(filtered[viewerIdx].activity).bg, color: actColor(filtered[viewerIdx].activity).text }}>
                {filtered[viewerIdx].activity}
              </span>
              {filtered[viewerIdx].duration && (
                <span className="text-xs font-mono px-2.5 py-1 rounded-lg bg-[var(--c-ghost)] text-[var(--c-sub)]">
                  {filtered[viewerIdx].duration}
                </span>
              )}
              <span className="text-xs text-[var(--c-faint)] ml-auto">{filtered[viewerIdx].date}</span>
            </div>
            {filtered[viewerIdx].caption && (
              <p className="text-sm text-[var(--c-sub)] leading-relaxed">{filtered[viewerIdx].caption}</p>
            )}
            <p className="text-[10px] text-[var(--c-faint)] mt-1">By {filtered[viewerIdx].uploadedBy}</p>
          </div>
        </div>
      )}

      <style>{`.no-scrollbar::-webkit-scrollbar{display:none}.no-scrollbar{-ms-overflow-style:none;scrollbar-width:none}`}</style>
    </div>
  )
}

function Chip({ active, onClick, children, color }) {
  return (
    <button onClick={onClick}
      className="shrink-0 px-3 py-1.5 rounded-full text-[11px] font-semibold border transition-all"
      style={active
        ? { background: (color || '#1D9E75') + '22', borderColor: (color || '#1D9E75') + '60', color: color || '#1D9E75' }
        : { background: 'transparent', borderColor: 'var(--c-border-md)', color: 'var(--c-muted)' }}>
      {children}
    </button>
  )
}

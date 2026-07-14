import React, { useState, useRef, useEffect } from 'react'
import { X, Download, ExternalLink, Pencil, Trash2 } from 'lucide-react'
import ImageCropper from './ImageCropper'
import { resolveUrl, isPdf, BUCKETS } from '../lib/attachments'

/**
 * Full-screen attachment viewer.
 * Cropping happens on the way *in* (onReplace re-enters the crop flow), never on the
 * image already on screen — expanding a saved bill must never risk editing it.
 *   onReplace(file) — optional; shows a pencil
 *   onRemove()      — optional; shows a bin
 */
export default function ImageViewer({
  value, bucket = BUCKETS.photos, name, onClose, onReplace, onRemove,
}) {
  const url = resolveUrl(value, bucket)
  const [scale, setScale] = useState(1)
  const [pan,   setPan]   = useState({ x: 0, y: 0 })
  const [cropping, setCropping] = useState(null)
  const [busy, setBusy] = useState(false)
  const drag     = useRef(null)
  const inputRef = useRef()

  const pick = (e) => {
    const f = e.target.files?.[0]
    e.target.value = ''
    if (!f) return
    if (f.type.startsWith('image/')) setCropping(f)
    else commit(f)
  }

  const commit = async (f) => {
    setBusy(true)
    try { await onReplace(f); setCropping(null); onClose() }
    catch { setBusy(false) }
  }

  const remove = async () => {
    setBusy(true)
    try { await onRemove(); onClose() }
    catch { setBusy(false) }
  }

  useEffect(() => {
    const esc = e => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', esc)
    return () => window.removeEventListener('keydown', esc)
  }, [onClose])

  if (!url) return null

  const pdf = isPdf(value) || isPdf(url)

  const toggleZoom = () => {
    if (scale > 1) { setScale(1); setPan({ x: 0, y: 0 }) } else setScale(2.5)
  }

  const onDown = e => {
    if (scale === 1) return
    const p = e.touches?.[0] || e
    drag.current = { x: p.clientX - pan.x, y: p.clientY - pan.y }
  }
  const onMove = e => {
    if (!drag.current || scale === 1) return
    const p = e.touches?.[0] || e
    setPan({ x: p.clientX - drag.current.x, y: p.clientY - drag.current.y })
  }
  const onUp = () => { drag.current = null }

  return (
    <div className="fixed inset-0 z-[60] bg-black flex flex-col" onClick={onClose}>
      <div className="flex items-center justify-between px-3 py-2.5 shrink-0" onClick={e => e.stopPropagation()}>
        <button onClick={onClose} className="w-9 h-9 rounded-full bg-white/10 text-white flex items-center justify-center">
          <X size={16} />
        </button>
        <span className="text-xs text-white/70 truncate max-w-[40%]">{name || 'Attachment'}</span>

        <div className="flex items-center gap-1.5">
          {onReplace && (
            <button onClick={() => inputRef.current?.click()} disabled={busy} title="Change"
              className="w-9 h-9 rounded-full bg-white/10 text-white flex items-center justify-center hover:bg-[#1D9E75] disabled:opacity-40">
              <Pencil size={15} />
            </button>
          )}
          {onRemove && (
            <button onClick={remove} disabled={busy} title="Remove"
              className="w-9 h-9 rounded-full bg-white/10 text-white flex items-center justify-center hover:bg-[#E24B4A] disabled:opacity-40">
              <Trash2 size={15} />
            </button>
          )}
          <a href={url} target="_blank" rel="noreferrer" download
            className="w-9 h-9 rounded-full bg-white/10 text-white flex items-center justify-center">
            {pdf ? <ExternalLink size={15} /> : <Download size={15} />}
          </a>
        </div>

        <input ref={inputRef} type="file" accept="image/*,application/pdf" className="hidden" onChange={pick} />
      </div>

      {cropping && (
        // The backdrop closes the viewer on click; the cropper sits inside it, so its clicks
        // must not bubble up or adjusting a photo would dismiss the viewer underneath.
        <div onClick={e => e.stopPropagation()}>
          <ImageCropper file={cropping} onDone={commit} onCancel={() => setCropping(null)} />
        </div>
      )}

      <div className="flex-1 overflow-hidden flex items-center justify-center" onClick={e => e.stopPropagation()}>
        {pdf ? (
          <div className="text-center px-6">
            <div className="text-5xl mb-3">📄</div>
            <p className="text-xs text-white/60 mb-4">PDFs open in a new tab.</p>
            <a href={url} target="_blank" rel="noreferrer"
              className="inline-block px-5 py-2.5 rounded-xl bg-[#1D9E75] text-white text-xs font-bold">
              Open document
            </a>
          </div>
        ) : (
          <img
            src={url} alt={name || 'attachment'}
            onDoubleClick={toggleZoom}
            onMouseDown={onDown} onMouseMove={onMove} onMouseUp={onUp} onMouseLeave={onUp}
            onTouchStart={onDown} onTouchMove={onMove} onTouchEnd={onUp}
            draggable={false}
            className="max-w-full max-h-full object-contain select-none"
            style={{
              transform: `translate(${pan.x}px, ${pan.y}px) scale(${scale})`,
              cursor: scale > 1 ? 'grab' : 'zoom-in',
              transition: drag.current ? 'none' : 'transform 0.2s',
            }}
          />
        )}
      </div>

      {!pdf && (
        <p className="text-center text-[10px] text-white/40 pb-3 shrink-0">Double-tap to zoom</p>
      )}
    </div>
  )
}

import React, { useState, useCallback } from 'react'
import Cropper from 'react-easy-crop'
import { RotateCw, Check, X } from 'lucide-react'
import imageCompression from 'browser-image-compression'

const ASPECTS = [
  { key: 'free',   label: 'Free',   value: undefined },
  { key: 'square', label: 'Square', value: 1 },
  { key: '4:3',    label: '4:3',    value: 4 / 3 },
]

// Draw the selected crop to a canvas at natural resolution, then compress.
async function exportCrop(file, area, rotation) {
  const src = URL.createObjectURL(file)
  const img = await new Promise((res, rej) => {
    const i = new Image()
    i.onload = () => res(i); i.onerror = rej; i.src = src
  })

  const canvas = document.createElement('canvas')
  const ctx    = canvas.getContext('2d')
  const rad    = (rotation * Math.PI) / 180

  // Rotate on an oversized scratch canvas so no corner is clipped, then cut the crop out of it.
  const scratch = document.createElement('canvas')
  const sctx    = scratch.getContext('2d')
  const box     = Math.max(img.width, img.height) * 2
  scratch.width = scratch.height = box
  sctx.translate(box / 2, box / 2)
  sctx.rotate(rad)
  sctx.drawImage(img, -img.width / 2, -img.height / 2)

  const cx = box / 2 - img.width / 2
  const cy = box / 2 - img.height / 2

  canvas.width  = area.width
  canvas.height = area.height
  ctx.drawImage(scratch, cx + area.x, cy + area.y, area.width, area.height, 0, 0, area.width, area.height)

  URL.revokeObjectURL(src)

  const blob = await new Promise(res => canvas.toBlob(res, 'image/jpeg', 0.92))
  const name = (file.name || 'photo').replace(/\.\w+$/, '') + '.jpg'
  const out  = new File([blob], name, { type: 'image/jpeg' })
  return imageCompression(out, { maxSizeMB: 1.2, maxWidthOrHeight: 2000, useWebWorker: true })
}

export default function ImageCropper({ file, onDone, onCancel }) {
  const [crop,     setCrop]     = useState({ x: 0, y: 0 })
  const [zoom,     setZoom]     = useState(1)
  const [rotation, setRotation] = useState(0)
  const [aspect,   setAspect]   = useState('free')
  const [area,     setArea]     = useState(null)
  const [busy,     setBusy]     = useState(false)

  const [src] = useState(() => URL.createObjectURL(file))
  const onCropComplete = useCallback((_, px) => setArea(px), [])

  const done = async () => {
    if (!area) return onDone(file)
    setBusy(true)
    try { onDone(await exportCrop(file, area, rotation)) }
    catch { onDone(file) }   // a crop that fails to render should never lose the user's photo
    setBusy(false)
  }

  return (
    <div className="fixed inset-0 z-[70] bg-black flex flex-col">
      <div className="flex items-center justify-between px-3 py-2.5 shrink-0">
        <button onClick={onCancel} className="w-9 h-9 rounded-full bg-white/10 text-white flex items-center justify-center">
          <X size={16} />
        </button>
        <span className="text-xs font-semibold text-white">Adjust photo</span>
        <button onClick={() => onDone(file)} className="text-xs text-white/70 px-2 py-1">Skip</button>
      </div>

      <div className="relative flex-1">
        <Cropper
          image={src} crop={crop} zoom={zoom} rotation={rotation}
          aspect={ASPECTS.find(a => a.key === aspect)?.value}
          onCropChange={setCrop} onZoomChange={setZoom} onCropComplete={onCropComplete}
          showGrid restrictPosition={false}
        />
      </div>

      {/* Dark chrome, both themes. The controls are white-on-translucent, so a themed
          surface (white in light mode) would render them invisible. */}
      <div className="shrink-0 px-4 py-3 space-y-3" style={{ background: '#141414' }}>
        <div className="flex items-center gap-3">
          <button onClick={() => setRotation(r => (r + 90) % 360)} title="Rotate"
            className="w-9 h-9 rounded-full bg-white/15 text-white flex items-center justify-center shrink-0 active:bg-white/25">
            <RotateCw size={15} />
          </button>
          <input type="range" min={1} max={3} step={0.01} value={zoom}
            onChange={e => setZoom(Number(e.target.value))} className="flex-1 accent-[#1D9E75]" />
        </div>

        <div className="flex gap-2">
          {ASPECTS.map(a => (
            <button key={a.key} onClick={() => setAspect(a.key)}
              className={`flex-1 py-2 rounded-lg text-[11px] font-semibold transition-colors ${
                aspect === a.key
                  ? 'bg-[#1D9E75] text-white'
                  : 'bg-white/15 text-white/80 active:bg-white/25'}`}>
              {a.label}
            </button>
          ))}
        </div>

        <button onClick={done} disabled={busy}
          className="w-full py-3 rounded-xl bg-[#1D9E75] text-white text-sm font-bold flex items-center justify-center gap-2 disabled:opacity-50">
          <Check size={16} /> {busy ? 'Saving…' : 'Done'}
        </button>
      </div>
    </div>
  )
}

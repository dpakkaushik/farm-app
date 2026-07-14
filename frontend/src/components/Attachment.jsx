import React, { useState, useRef } from 'react'
import { Pencil, Trash2 } from 'lucide-react'
import ImageViewer from './ImageViewer'
import ImageCropper from './ImageCropper'
import { resolveUrl, isPdf, BUCKETS } from '../lib/attachments'

/**
 * An attachment on an already-saved record.
 *  - click        → expand in the viewer
 *  - onReplace(f) → shows a pencil; re-enters the upload flow (crop included)
 *  - onRemove()   → shows a bin
 * Pass `variant="chip"` for a compact row (bills in a list), "thumb" for a square tile.
 */
export default function Attachment({
  value, bucket = BUCKETS.photos, name, variant = 'thumb', icon,
  onReplace, onRemove, className = '', size = 'w-14 h-14',
}) {
  const [viewing, setViewing] = useState(false)
  const [cropping, setCropping] = useState(null)
  const [busy, setBusy] = useState(false)
  const inputRef = useRef()

  const url = resolveUrl(value, bucket)
  const pdf = isPdf(value) || isPdf(url)

  const pick = (e) => {
    const f = e.target.files?.[0]
    e.target.value = ''
    if (!f) return
    if (f.type.startsWith('image/')) setCropping(f)   // images get the crop screen
    else commit(f)                                    // PDFs have nothing to crop
  }

  const commit = async (f) => {
    setBusy(true)
    try { await onReplace(f) } finally { setBusy(false); setCropping(null) }
  }

  if (!value) return null

  return (
    <>
      <div className={`relative inline-flex items-center gap-2 group ${className}`}>
        <button type="button" onClick={() => setViewing(true)}
          className={variant === 'chip'
            ? 'flex items-center gap-1.5 text-[10px] text-[#1D9E75] underline underline-offset-2'
            : `${size} rounded-lg overflow-hidden border shrink-0`}
          style={variant === 'chip' ? undefined : { borderColor: 'var(--c-border-md)' }}>
          {variant === 'chip' ? (
            <>{icon || (pdf ? '📄' : '🖼️')}{name ? ` ${name}` : ''}</>
          ) : pdf ? (
            <span className="w-full h-full flex items-center justify-center text-lg"
              style={{ background: 'var(--c-ghost)' }}>📄</span>
          ) : (
            <img src={url} alt={name || 'attachment'} className="w-full h-full object-cover" />
          )}
        </button>

        {(onReplace || onRemove) && (
          <span className="flex items-center gap-1">
            {onReplace && (
              <button type="button" onClick={() => inputRef.current?.click()} disabled={busy}
                title="Change"
                className="w-6 h-6 rounded-full flex items-center justify-center text-[var(--c-muted)] hover:text-[#1D9E75] disabled:opacity-40"
                style={{ background: 'var(--c-ghost)' }}>
                <Pencil size={11} />
              </button>
            )}
            {onRemove && (
              <button type="button" onClick={onRemove} disabled={busy} title="Remove"
                className="w-6 h-6 rounded-full flex items-center justify-center text-[var(--c-muted)] hover:text-[#E24B4A] disabled:opacity-40"
                style={{ background: 'var(--c-ghost)' }}>
                <Trash2 size={11} />
              </button>
            )}
          </span>
        )}

        <input ref={inputRef} type="file" accept="image/*,application/pdf" className="hidden" onChange={pick} />
      </div>

      {viewing  && <ImageViewer value={value} bucket={bucket} name={name} onClose={() => setViewing(false)} />}
      {cropping && <ImageCropper file={cropping} onDone={commit} onCancel={() => setCropping(null)} />}
    </>
  )
}

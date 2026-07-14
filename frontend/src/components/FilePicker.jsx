import React, { useRef, useState, useEffect } from 'react'
import { Pencil, Trash2, Camera, FolderOpen } from 'lucide-react'
import ImageCropper from './ImageCropper'
import ImageViewer from './ImageViewer'
import { resolveUrl, isPdf, BUCKETS } from '../lib/attachments'

/**
 * Pick → crop → preview. Same props as before (onFile / accept / preview / label / file),
 * so existing call sites keep working.
 *   file    — the freshly picked File, not yet uploaded
 *   preview — an already-saved path or URL
 */
export default function FilePicker({
  onFile, accept = 'image/*', preview = null, label = null, file = null,
  bucket = BUCKETS.photos,
}) {
  const cameraRef = useRef()
  const browseRef = useRef()
  const [cropping, setCropping] = useState(null)
  const [viewing,  setViewing]  = useState(false)
  const [localUrl, setLocalUrl] = useState(null)

  // Revoke on swap — the old FilePicker leaked an object URL on every render.
  useEffect(() => {
    if (!file || !file.type?.startsWith('image/')) { setLocalUrl(null); return }
    const u = URL.createObjectURL(file)
    setLocalUrl(u)
    return () => URL.revokeObjectURL(u)
  }, [file])

  const savedUrl = preview ? resolveUrl(preview, bucket) : null
  const shownUrl = localUrl || savedUrl
  const pdf      = (file && file.type === 'application/pdf') || (!file && preview && isPdf(preview))
  const has      = Boolean(shownUrl || pdf)

  const pick = (e) => {
    const f = e.target.files?.[0]
    e.target.value = ''
    if (!f) return
    if (f.type.startsWith('image/')) setCropping(f)   // crop belongs to the upload flow
    else onFile(f)                                    // nothing to crop in a PDF
  }

  const PickBtn = ({ inputRef, Icon, text }) => (
    <button type="button" onClick={() => inputRef.current?.click()}
      className="flex-1 py-2.5 rounded-xl border border-dashed text-xs transition-colors flex items-center justify-center gap-1.5 hover:border-[#1D9E75]/50 hover:text-[#1D9E75]"
      style={{ borderColor: 'var(--c-border-md)', color: 'var(--c-muted)' }}>
      <Icon size={13} /> {text}
    </button>
  )

  return (
    <div className="space-y-2">
      {has && (
        <div className="relative">
          {pdf && !localUrl ? (
            <button type="button" onClick={() => savedUrl && setViewing(true)}
              className="w-full h-12 rounded-xl border flex items-center gap-2 px-3 text-left"
              style={{ borderColor: 'var(--c-border-md)', background: 'var(--c-ghost)' }}>
              <span className="text-base">📄</span>
              <span className="text-xs truncate" style={{ color: 'var(--c-muted)' }}>
                {file?.name || 'Document attached'}
              </span>
            </button>
          ) : (
            <button type="button" onClick={() => setViewing(true)} className="block w-full">
              <img src={shownUrl} alt="preview"
                className="w-full h-28 object-cover rounded-xl border"
                style={{ borderColor: 'var(--c-border-md)' }} />
            </button>
          )}

          <div className="absolute top-1.5 right-1.5 flex gap-1">
            <button type="button" onClick={() => browseRef.current?.click()} title="Change"
              className="w-7 h-7 rounded-full bg-black/60 text-white flex items-center justify-center hover:bg-[#1D9E75]">
              <Pencil size={12} />
            </button>
            <button type="button" onClick={() => onFile(null)} title="Remove"
              className="w-7 h-7 rounded-full bg-black/60 text-white flex items-center justify-center hover:bg-[#E24B4A]">
              <Trash2 size={12} />
            </button>
          </div>

          {!pdf && (
            <p className="text-[10px] mt-1 text-center" style={{ color: 'var(--c-faint)' }}>
              Tap image to expand
            </p>
          )}
        </div>
      )}

      {label && <p className="text-xs font-medium" style={{ color: 'var(--c-muted)' }}>{label}</p>}

      <input ref={cameraRef} type="file" accept={accept} capture="environment" className="hidden" onChange={pick} />
      <input ref={browseRef} type="file" accept={accept} className="hidden" onChange={pick} />

      {!has && (
        <div className="flex gap-2">
          <PickBtn inputRef={cameraRef} Icon={Camera}     text="Camera" />
          <PickBtn inputRef={browseRef} Icon={FolderOpen} text="Browse" />
        </div>
      )}

      {cropping && (
        <ImageCropper file={cropping}
          onDone={f => { onFile(f); setCropping(null) }}
          onCancel={() => setCropping(null)} />
      )}
      {viewing && shownUrl && (
        <ImageViewer value={localUrl || preview} bucket={bucket}
          name={file?.name} onClose={() => setViewing(false)} />
      )}
    </div>
  )
}

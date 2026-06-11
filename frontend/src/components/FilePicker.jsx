import React, { useRef } from 'react'

export default function FilePicker({ onFile, accept = 'image/*', preview = null, label = null, file = null }) {
  const cameraRef = useRef()
  const browseRef = useRef()
  const displaySrc = file ? URL.createObjectURL(file) : preview

  return (
    <div className="space-y-2">
      {displaySrc && (
        <div className="relative">
          <img src={displaySrc} alt="preview"
            className="w-full h-28 object-cover rounded-xl border" style={{ borderColor: 'var(--c-border-md)' }} />
          <button type="button" onClick={() => onFile(null)}
            className="absolute top-1.5 right-1.5 w-6 h-6 rounded-full bg-black/60 text-white text-xs flex items-center justify-center hover:bg-[#E24B4A]">
            ✕
          </button>
        </div>
      )}
      {!displaySrc && file?.type === 'application/pdf' && (
        <div className="w-full h-12 rounded-xl border flex items-center gap-2 px-3"
          style={{ borderColor: 'var(--c-border-md)', background: 'var(--c-ghost)' }}>
          <span className="text-base">📄</span>
          <span className="text-xs truncate" style={{ color: 'var(--c-muted)' }}>{file.name}</span>
        </div>
      )}
      {label && <p className="text-xs font-medium" style={{ color: 'var(--c-muted)' }}>{label}</p>}
      <div className="flex gap-2">
        <input ref={cameraRef} type="file" accept={accept} capture="environment" className="hidden"
          onChange={e => { if (e.target.files[0]) onFile(e.target.files[0]); e.target.value = '' }} />
        <input ref={browseRef} type="file" accept={accept} className="hidden"
          onChange={e => { if (e.target.files[0]) onFile(e.target.files[0]); e.target.value = '' }} />
        <button type="button" onClick={() => cameraRef.current.click()}
          className="flex-1 py-2.5 rounded-xl border border-dashed text-xs transition-colors flex items-center justify-center gap-1.5 hover:border-[#1D9E75]/50 hover:text-[#1D9E75]"
          style={{ borderColor: 'var(--c-border-md)', color: 'var(--c-muted)' }}>
          📷 Camera
        </button>
        <button type="button" onClick={() => browseRef.current.click()}
          className="flex-1 py-2.5 rounded-xl border border-dashed text-xs transition-colors flex items-center justify-center gap-1.5 hover:border-[#1D9E75]/50 hover:text-[#1D9E75]"
          style={{ borderColor: 'var(--c-border-md)', color: 'var(--c-muted)' }}>
          📁 Browse
        </button>
      </div>
    </div>
  )
}

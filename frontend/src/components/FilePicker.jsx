import React, { useRef } from 'react'

/**
 * FilePicker — shows Camera and Browse buttons side by side.
 * onFile(File) is called when user picks something.
 * preview: URL string of current/selected image to show as thumbnail.
 * accept: mime types string (default image/*, use 'image/*,application/pdf' for docs)
 * label: optional label shown on the buttons area
 */
export default function FilePicker({ onFile, accept = 'image/*', preview = null, label = null, file = null }) {
  const cameraRef = useRef()
  const browseRef = useRef()

  const displaySrc = file ? URL.createObjectURL(file) : preview

  return (
    <div className="space-y-2">
      {displaySrc && (
        <div className="relative">
          <img src={displaySrc} alt="preview"
            className="w-full h-28 object-cover rounded-xl border border-white/10" />
          <button type="button" onClick={() => onFile(null)}
            className="absolute top-1.5 right-1.5 w-6 h-6 rounded-full bg-black/60 text-white text-xs flex items-center justify-center hover:bg-[#E24B4A]">
            ✕
          </button>
        </div>
      )}
      {!displaySrc && file?.type === 'application/pdf' && (
        <div className="w-full h-12 rounded-xl border border-white/10 bg-white/5 flex items-center gap-2 px-3">
          <span className="text-base">📄</span>
          <span className="text-xs text-white/50 truncate">{file.name}</span>
        </div>
      )}

      {label && <p className="text-xs font-medium text-white/50">{label}</p>}

      <div className="flex gap-2">
        {/* Hidden camera input */}
        <input ref={cameraRef} type="file" accept={accept} capture="environment" className="hidden"
          onChange={e => { if (e.target.files[0]) onFile(e.target.files[0]); e.target.value = '' }} />
        {/* Hidden browse input */}
        <input ref={browseRef} type="file" accept={accept} className="hidden"
          onChange={e => { if (e.target.files[0]) onFile(e.target.files[0]); e.target.value = '' }} />

        <button type="button" onClick={() => cameraRef.current.click()}
          className="flex-1 py-2.5 rounded-xl border border-dashed border-white/15 text-xs text-white/40 hover:border-[#1D9E75]/50 hover:text-[#1D9E75] transition-colors flex items-center justify-center gap-1.5">
          📷 Camera
        </button>
        <button type="button" onClick={() => browseRef.current.click()}
          className="flex-1 py-2.5 rounded-xl border border-dashed border-white/15 text-xs text-white/40 hover:border-[#1D9E75]/50 hover:text-[#1D9E75] transition-colors flex items-center justify-center gap-1.5">
          📁 Browse
        </button>
      </div>
    </div>
  )
}

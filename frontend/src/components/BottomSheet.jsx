import { X } from 'lucide-react'
import useBackClose from '../hooks/useBackClose'

// The one bottom-sheet shell: dim backdrop, handle, centred title, ✕, a
// scrolling body and an optional pinned footer. z-50 so it covers the floating
// nav; anything that must open ABOVE a sheet (photo viewer, cropper) goes higher.
// Padded past the phone's gesture bar with env(safe-area-inset-bottom).
//
// `height` fixes the sheet (the filter sheet wants a stable frame while its
// option list changes); leave it out and the sheet takes the height of what is
// inside it, up to maxHeight.
export default function BottomSheet({ title, onClose, children, footer, height, maxHeight = '88vh' }) {
  useBackClose(onClose)   // the phone's back gesture dismisses the sheet, not the screen

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center" style={{ background: 'rgba(0,0,0,0.5)' }}
      onClick={onClose}>
      <div onClick={e => e.stopPropagation()}
        className="w-full max-w-lg rounded-t-3xl flex flex-col animate-slide-up shadow-2xl overflow-hidden"
        style={{ background: 'var(--c-nav)', height, maxHeight, paddingBottom: 'max(env(safe-area-inset-bottom, 0px), 12px)' }}>

        <div className="shrink-0 relative pt-2.5 pb-2">
          <div className="mx-auto w-10 h-1 rounded-full" style={{ background: 'var(--c-border)' }} />
          {title && <p className="text-center text-sm font-bold mt-2" style={{ color: 'var(--c-text)' }}>{title}</p>}
          <button onClick={onClose} aria-label="Close"
            className="absolute right-3 top-3 p-1.5 rounded-full" style={{ color: 'var(--c-muted)' }}>
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 min-h-0 flex flex-col border-t" style={{ borderColor: 'var(--c-border)' }}>
          {children}
        </div>

        {footer && (
          <div className="shrink-0 flex gap-2 px-4 pt-3 border-t" style={{ borderColor: 'var(--c-border)' }}>
            {footer}
          </div>
        )}
      </div>
    </div>
  )
}

import { X, Mail } from 'lucide-react'

const SUPPORT_EMAIL = 'deepakkaushik@pallitrans.com'
const APP_VERSION   = '0.1.0'

// About — app identity, version, and a direct line to the team. Kept intentionally
// small; the contact button opens the user's mail client pre-addressed.
export default function AboutModal({ onClose }) {
  const mailto = `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent('Farm Manager — support request')}`

  return (
    <div style={overlay} onClick={onClose}>
      <div style={sheet} onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b" style={{ borderColor: 'var(--c-border-md)' }}>
          <h2 className="text-base font-bold" style={{ color: 'var(--c-text)' }}>About</h2>
          <button onClick={onClose} style={iconBtn} aria-label="Close"><X size={18} /></button>
        </div>

        <div className="px-5 py-5 flex flex-col items-center text-center gap-1">
          <div className="text-4xl mb-1">🌾</div>
          <p className="text-lg font-bold" style={{ color: 'var(--c-text)' }}>Farm Manager</p>
          <p className="text-[12px]" style={{ color: 'var(--c-faint)' }}>Version {APP_VERSION}</p>
          <p className="text-[13px] mt-2 leading-relaxed" style={{ color: 'var(--c-muted)' }}>
            Real-time visibility into every farm operation — plots, crops, inventory,
            labour, livestock and the full financial ledger, from anywhere.
          </p>
        </div>

        <div className="px-5 pb-5">
          <a href={mailto}
            className="w-full flex items-center justify-center gap-2 py-3 rounded-lg text-sm font-semibold"
            style={{ background: '#1D9E75', color: '#fff', textDecoration: 'none' }}>
            <Mail size={16} /> Contact the team
          </a>
          <p className="text-[11px] text-center mt-2" style={{ color: 'var(--c-faint)' }}>{SUPPORT_EMAIL}</p>
        </div>
      </div>
    </div>
  )
}

const overlay = { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2000, padding: '16px' }
const sheet   = { background: 'var(--c-nav)', borderRadius: '16px', width: '100%', maxWidth: '380px', boxShadow: '0 20px 60px rgba(0,0,0,0.4)', overflow: 'hidden' }
const iconBtn = { width: '30px', height: '30px', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '8px', background: 'transparent', border: 'none', color: 'var(--c-muted)', cursor: 'pointer' }

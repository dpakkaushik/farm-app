import { Pencil, Camera, Trash2, X } from 'lucide-react'
import Attachment from '../../components/Attachment'
import { BUCKETS } from '../../lib/attachments'
import { CAT_EMOJI, StatusPill } from './vocab'
import { sheetSubline, assetFacts, disposalFacts, isRetired } from './assetFacts'
import useBackClose from '../../hooks/useBackClose'

// The record behind a register card. Opens as a bottom sheet over the list and
// carries everything the card deliberately does not: price, dates, the bill, the
// vendor, notes, and the actions that change the record (Edit / Photo / Dispose).
// z-50 so it covers the floating nav; the photo viewer (z-60) and cropper (z-70)
// still open above it.
export default function AssetSheet({ item, kind, vendorName, onClose, onEdit, onPhoto, onDispose, onIssueDiesel }) {
  const emoji   = CAT_EMOJI[kind === 'machinery' ? item.type : item.category] || (kind === 'machinery' ? '🔧' : '📦')
  const facts   = assetFacts(item, kind, vendorName)
  const gone    = disposalFacts(item)
  const retired = isRetired(item)

  useBackClose(onClose)   // back gesture = ✕

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center" style={{ background: 'rgba(0,0,0,0.5)' }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()}
        className="w-full max-w-lg rounded-t-3xl flex flex-col animate-slide-up shadow-2xl"
        style={{ background: 'var(--c-nav)', maxHeight: '92vh', paddingBottom: 'max(env(safe-area-inset-bottom, 0px), 16px)' }}>

        {/* Handle + close, outside the scroll area so ✕ never scrolls away */}
        <div className="shrink-0 relative pt-2.5 pb-1">
          <div className="mx-auto w-10 h-1 rounded-full" style={{ background: 'var(--c-border)' }} />
          <button onClick={onClose} aria-label="Close" className="absolute right-3 top-2 p-1.5 rounded-full" style={{ color: 'var(--c-muted)' }}>
            <X size={18} />
          </button>
        </div>

        <div className="overflow-y-auto px-5 pb-2 space-y-4">
          {/* Hero: the photo is the record's face. Tap to view / change / add. */}
          <button onClick={() => onPhoto(item)} className="block w-full">
            {item.photoUrl
              ? <img src={item.photoUrl} alt={item.name} className="w-full h-44 rounded-2xl object-cover" />
              : (
                <div className="w-full h-28 rounded-2xl flex flex-col items-center justify-center gap-1 border border-dashed"
                  style={{ background: 'var(--c-ghost)', borderColor: 'var(--c-border)' }}>
                  <span className="text-3xl">{emoji}</span>
                  <span className="text-[13px] font-semibold" style={{ color: 'var(--c-muted)' }}>Add a photo</span>
                </div>
              )}
          </button>

          {/* Identity */}
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-lg font-bold leading-tight" style={{ color: 'var(--c-text)' }}>{item.name}</h2>
              <StatusPill status={item.status} />
            </div>
            <p className="text-xs mt-0.5" style={{ color: 'var(--c-muted)' }}>{sheetSubline(item, kind)}</p>
          </div>

          {item.requiresDiesel && !retired && (
            <button onClick={onIssueDiesel}
              className="w-full py-2.5 rounded-xl text-xs font-bold border flex items-center justify-center gap-1.5"
              style={{ background: '#BA751712', color: '#BA7517', borderColor: '#BA751740' }}>
              ⛽ Issue Diesel <span aria-hidden>→</span>
            </button>
          )}

          {/* Facts — the record-keeping the card keeps out of sight */}
          <div className="grid grid-cols-2 gap-x-4 gap-y-3 rounded-2xl p-4" style={{ background: 'var(--c-ghost)' }}>
            {facts.map(f => (
              <div key={f.label} className="min-w-0">
                <p className="text-[12px] font-semibold uppercase tracking-wide" style={{ color: 'var(--c-muted)' }}>{f.label}</p>
                {f.missing
                  ? <button onClick={() => onEdit(item)} className="text-[13px] font-semibold underline decoration-dotted" style={{ color: 'var(--c-faint)' }}>{f.value}</button>
                  : <p className="text-[13px] font-semibold truncate" style={{ color: 'var(--c-text)' }}>{f.value}</p>}
              </div>
            ))}
            {item.billFileUrl && (
              <div className="col-span-2">
                <p className="text-[12px] font-semibold uppercase tracking-wide mb-1" style={{ color: 'var(--c-muted)' }}>Bill</p>
                <Attachment variant="chip" value={item.billFileUrl} bucket={BUCKETS.photos}
                  name={item.billInvoiceNo ? `Bill #${item.billInvoiceNo}` : 'Bill'} />
              </div>
            )}
            {item.notes && (
              <div className="col-span-2">
                <p className="text-[12px] font-semibold uppercase tracking-wide" style={{ color: 'var(--c-muted)' }}>Notes</p>
                <p className="text-[13px] leading-snug" style={{ color: 'var(--c-text)' }}>{item.notes}</p>
              </div>
            )}
          </div>

          {gone && (
            <div className="grid grid-cols-2 gap-x-4 gap-y-3 rounded-2xl p-4 border" style={{ borderColor: 'var(--c-border)' }}>
              <p className="col-span-2 text-[12px] font-bold uppercase tracking-wide" style={{ color: '#888' }}>
                {item.disposalType === 'sold' ? 'Sold' : 'Scrapped'}
              </p>
              {gone.map(f => (
                <div key={f.label} className="min-w-0">
                  <p className="text-[12px] font-semibold uppercase tracking-wide" style={{ color: 'var(--c-muted)' }}>{f.label}</p>
                  <p className="text-[13px] font-semibold truncate" style={{ color: 'var(--c-text)' }}>{f.value}</p>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Actions: the two you reach for, then the one you rarely should */}
        <div className="shrink-0 px-5 pt-3 space-y-2 border-t" style={{ borderColor: 'var(--c-border)' }}>
          <div className="flex gap-2">
            <button onClick={() => onEdit(item)}
              className="flex-1 py-3 rounded-xl text-sm font-semibold text-white flex items-center justify-center gap-1.5" style={{ background: '#8A9A5B' }}>
              <Pencil size={14} /> Edit
            </button>
            <button onClick={() => onPhoto(item)}
              className="flex-1 py-3 rounded-xl text-sm font-semibold flex items-center justify-center gap-1.5 border"
              style={{ color: 'var(--c-text)', borderColor: 'var(--c-border)', background: 'var(--c-ghost)' }}>
              <Camera size={14} /> {item.photoUrl ? 'Photo' : 'Add photo'}
            </button>
          </div>
          {!retired && (
            <button onClick={() => onDispose(item)}
              className="w-full py-2 text-xs font-semibold flex items-center justify-center gap-1" style={{ color: '#E24B4A' }}>
              <Trash2 size={12} /> Dispose or sell
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

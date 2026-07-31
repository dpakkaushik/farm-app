import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import { X, ChevronLeft, Package, Sprout, Check } from 'lucide-react'
import { useAppStore } from '../store'
import { useAuthStore } from '../store/auth'

// Mid-year onboarding (docs/PLAN-mid-year-onboarding.md). A farm that signs up
// mid-season already has stock in the store and crops in the ground — some near
// harvest, with all their money spent before signup. This component renders:
//
//   • a "Finish setting up" card while the farm still looks un-set-up
//     (no crop cycles, or every stock level at zero) and not dismissed;
//   • the checklist itself:
//       Opening stock → backdated OPENING-STOCK purchases, dated the day
//                before the current FY starts, so stock and weighted-average
//                cost come out right without touching this season's expenses;
//       Standing crops → a pointer to Admin → Cycles. The cycle master is the
//                single place that starts pre-app cycles and edits their
//                "spent before the app" (crop_cycles.opening_cost) — the owner
//                explicitly rejected a duplicate form here (2026-07-31).
//
// ProfileMenu can force the checklist open via the store's setupChecklistOpen
// flag — needed on farms like Pallia where cycles and stock already exist, so
// the card's auto-visibility rule never fires.

const dismissKey = (farmId) => `setupCardDismissed:${farmId}`

export default function SetupChecklist() {
  const navigate = useNavigate()
  const { activeFarm, activeFarmId } = useAuthStore()
  const {
    inventoryMaster, cropCycles, purchases,
    recordOpeningStock,
    setupChecklistOpen, closeSetupChecklist,
  } = useAppStore()

  const [view, setView]           = useState(null)   // null | 'menu' | 'stock'
  const [dismissed, setDismissed] = useState(() => !!localStorage.getItem(dismissKey(activeFarmId)))

  useEffect(() => { setDismissed(!!localStorage.getItem(dismissKey(activeFarmId))) }, [activeFarmId])

  // ProfileMenu's "Opening balances" item sets setupChecklistOpen; the flag IS
  // the open state, cleared only by an explicit close. It must not be consumed
  // in a mount effect: ProfileMenu also navigates to /field, and router
  // navigation is a low-priority transition — the page being left could see the
  // flag first, open, clear it, then unmount, and the Field instance would
  // mount to a flag already false. Deriving the view keeps the sheet open no
  // matter which instance ends up on screen.
  const effectiveView = view || (setupChecklistOpen ? 'menu' : null)
  const close = () => { setView(null); closeSetupChecklist() }

  const looksUnSetUp = cropCycles.length === 0 || inventoryMaster.every(i => !i.currentStock)
  const stockDone    = purchases.some(p => p.invoiceNo === 'OPENING-STOCK') || inventoryMaster.some(i => i.currentStock > 0)
  const cropsDone    = cropCycles.length > 0

  const dismiss = () => { localStorage.setItem(dismissKey(activeFarmId), '1'); setDismissed(true) }

  // Standing crops live in ONE place — the Cycles master (create with pre-app
  // spend, or edit it on existing cycles). This just takes the owner there.
  const goCycles = () => { close(); navigate('/admin?tab=Cycles') }

  return (
    <>
      {looksUnSetUp && !dismissed && (
        <div className="rounded-xl border p-3.5"
          style={{ background: 'var(--c-nav)', borderColor: 'var(--c-border)', boxShadow: '0 4px 20px rgba(0,0,0,0.12)' }}>
          <div className="flex items-start gap-2.5">
            <span style={{ fontSize: '20px', lineHeight: 1.2 }}>📋</span>
            <div className="flex-1 min-w-0">
              <p className="text-[13px] font-bold" style={{ color: 'var(--c-text)' }}>
                Finish setting up {activeFarm?.name || 'your farm'}
              </p>
              <p className="text-[11px] mt-0.5 leading-snug" style={{ color: 'var(--c-muted)' }}>
                Already farming? Record what's in your store and in the ground, so
                costs and profit are honest from day one.
              </p>
            </div>
            <button onClick={dismiss} aria-label="Dismiss setup card"
              className="shrink-0 p-1" style={{ color: 'var(--c-faint)' }}>
              <X size={15} />
            </button>
          </div>
          <div className="flex gap-2 mt-2.5">
            <CardButton done={stockDone} label="Opening stock" onClick={() => setView('stock')} />
            <CardButton done={cropsDone} label="Standing crops" onClick={goCycles} />
          </div>
        </div>
      )}

      {effectiveView && (
        <Sheet onClose={close}>
          {effectiveView === 'menu'  && <MenuView stockDone={stockDone} cropsDone={cropsDone}
            onPick={setView} onCycles={goCycles} onClose={close} />}
          {effectiveView === 'stock' && <StockForm items={inventoryMaster} purchases={purchases}
            onBack={() => setView('menu')} onSave={recordOpeningStock} onDone={close} />}
        </Sheet>
      )}
    </>
  )
}

function CardButton({ done, label, onClick }) {
  return (
    <button onClick={onClick}
      className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-[12px] font-bold"
      style={done
        ? { background: '#1D9E7518', color: '#1D9E75', border: '1px solid #1D9E7540' }
        : { background: '#1D9E75', color: '#fff', border: '1px solid #1D9E75' }}>
      {done && <Check size={13} />}{label}
    </button>
  )
}

// ── Bottom sheet shared by all three views ────────────────────────────────────
// Portalled to <body>: on Field this component mounts inside an absolutely
// positioned wrapper that uses a translate transform, and a transformed
// ancestor becomes the containing block for position:fixed descendants — the
// sheet would lay itself out inside that zero-height box and never be seen.

function Sheet({ onClose, children }) {
  return createPortal(
    <div className="fixed inset-0 z-[70] flex items-end justify-center">
      <div className="absolute inset-0" style={{ background: 'rgba(0,0,0,0.5)' }} onClick={onClose} />
      <div className="relative w-full overflow-y-auto rounded-t-2xl"
        style={{ maxWidth: '480px', maxHeight: '90dvh', background: 'var(--c-nav)',
                 paddingBottom: 'max(env(safe-area-inset-bottom, 0px), 16px)' }}>
        {children}
      </div>
    </div>,
    document.body
  )
}

function SheetHeader({ title, sub, onBack, onClose }) {
  return (
    <div className="sticky top-0 z-10 flex items-start gap-2 px-4 pt-4 pb-3 border-b"
      style={{ background: 'var(--c-nav)', borderColor: 'var(--c-border)' }}>
      {onBack && (
        <button onClick={onBack} className="p-1 -ml-1 shrink-0" style={{ color: 'var(--c-muted)' }} aria-label="Back">
          <ChevronLeft size={18} />
        </button>
      )}
      <div className="flex-1 min-w-0">
        <p className="text-[15px] font-bold" style={{ color: 'var(--c-text)' }}>{title}</p>
        {sub && <p className="text-[11px] mt-0.5 leading-snug" style={{ color: 'var(--c-muted)' }}>{sub}</p>}
      </div>
      <button onClick={onClose} className="p-1 shrink-0" style={{ color: 'var(--c-faint)' }} aria-label="Close">
        <X size={16} />
      </button>
    </div>
  )
}

// The rule that keeps the numbers honest — required copy on both forms.
function DontDoubleCount() {
  return (
    <div className="mx-4 mt-3 rounded-lg px-3 py-2.5 text-[11px] leading-snug"
      style={{ background: '#BA751715', color: '#BA7517', border: '1px solid #BA751730' }}>
      <strong>Don't count the same rupee twice.</strong> Opening stock = what is
      <em> still in the store</em>. Spent-so-far = what a crop <em>already used or
      paid for</em>. Enter each rupee in one place only.
    </div>
  )
}

function SaveBar({ onSave, saving, disabled, label = 'Save' }) {
  return (
    <div className="px-4 pt-4">
      <button onClick={onSave} disabled={saving || disabled}
        className="w-full py-3 rounded-xl text-[14px] font-bold"
        style={{ background: saving || disabled ? 'var(--c-ghost)' : '#1D9E75',
                 color: saving || disabled ? 'var(--c-faint)' : '#fff' }}>
        {saving ? 'Saving…' : label}
      </button>
    </div>
  )
}

function ErrorBox({ children }) {
  return (
    <div className="mx-4 mt-3 rounded-lg px-3 py-2 text-[12px]"
      style={{ background: '#E24B4A15', color: '#E24B4A', border: '1px solid #E24B4A40' }}>
      {children}
    </div>
  )
}

const inputStyle = {
  width: '100%', padding: '8px 10px', borderRadius: '8px', fontSize: '13px',
  border: '1px solid var(--c-border-md)', background: 'var(--c-bg)',
  color: 'var(--c-text)', outline: 'none', boxSizing: 'border-box',
}

// ── Menu (opened from ProfileMenu) ────────────────────────────────────────────

function MenuView({ stockDone, cropsDone, onPick, onCycles, onClose }) {
  const rows = [
    { key: 'stock', Icon: Package, done: stockDone, title: 'Opening stock',
      body: "What's in your store today — quantity and the rate you paid.",
      go: () => onPick('stock') },
    { key: 'crops', Icon: Sprout, done: cropsDone, title: 'Standing crops',
      body: 'Entered in the Cycles master — start a pre-app cycle or edit "spent before the app" there. Opens it →',
      go: onCycles },
  ]
  return (
    <>
      <SheetHeader title="Opening balances"
        sub="For a farm that was already running before it joined the app."
        onClose={onClose} />
      <div className="p-4 flex flex-col gap-2.5">
        {rows.map(({ key, Icon, done, title, body, go }) => (
          <button key={key} onClick={go}
            className="flex items-start gap-3 rounded-xl border p-3.5 text-left"
            style={{ borderColor: 'var(--c-border)', background: 'var(--c-bg)' }}>
            <Icon size={18} style={{ color: '#1D9E75', marginTop: '1px' }} />
            <div className="flex-1 min-w-0">
              <p className="text-[13px] font-bold flex items-center gap-1.5" style={{ color: 'var(--c-text)' }}>
                {title}
                {done && <Check size={13} style={{ color: '#1D9E75' }} />}
              </p>
              <p className="text-[11px] mt-0.5 leading-snug" style={{ color: 'var(--c-muted)' }}>{body}</p>
            </div>
          </button>
        ))}
      </div>
    </>
  )
}

// ── Form 1 — opening stock ────────────────────────────────────────────────────

function StockForm({ items, purchases, onBack, onSave, onDone }) {
  const [rows, setRows]     = useState({})   // { itemId: { qty, rate } }
  const [saving, setSaving] = useState(false)
  const [error, setError]   = useState('')

  // One opening entry per item, ever — an item that already has one shows as
  // done instead of accepting inputs, so a revisit can't double its stock.
  const alreadyEntered = new Set(purchases.filter(p => p.invoiceNo === 'OPENING-STOCK').map(p => p.itemId))

  const setRow = (id, patch) => setRows(r => ({ ...r, [id]: { ...(r[id] || { qty: '', rate: '' }), ...patch } }))

  const filled = Object.entries(rows)
    .filter(([itemId]) => !alreadyEntered.has(itemId))
    .map(([itemId, r]) => ({ itemId, qty: parseFloat(r.qty), unitPrice: parseFloat(r.rate) }))
    .filter(r => r.qty > 0)

  const save = async () => {
    if (filled.some(r => isNaN(r.unitPrice) || r.unitPrice < 0)) {
      setError('Every item with a quantity also needs the rate you paid — that is what prices future usage correctly.')
      return
    }
    setSaving(true)
    setError('')
    try {
      await onSave(filled)
      onDone()
    } catch (err) {
      setError(err.message || 'Could not save opening stock. Please try again.')
    }
    setSaving(false)
  }

  return (
    <>
      <SheetHeader title="Opening stock" onBack={onBack} onClose={onDone}
        sub="Counted stock on the shelf today. Saved as an opening balance dated 31 March — it will not appear in this season's spend." />
      <DontDoubleCount />
      {error && <ErrorBox>{error}</ErrorBox>}
      {items.length === 0 ? (
        <p className="px-4 py-6 text-[12px]" style={{ color: 'var(--c-muted)' }}>
          No inventory items yet — add them in Admin → Farm Masters first.
        </p>
      ) : (
        <div className="px-4 pt-3 flex flex-col gap-2">
          {items.map(item => (
            <div key={item.id} className="flex items-center gap-2 rounded-lg border px-3 py-2"
              style={{ borderColor: 'var(--c-border)', background: 'var(--c-bg)' }}>
              <div className="flex-1 min-w-0">
                <p className="text-[12px] font-semibold truncate" style={{ color: 'var(--c-text)' }}>{item.name}</p>
                <p className="text-[10px]" style={{ color: 'var(--c-faint)' }}>
                  {item.currentStock > 0 ? `in app: ${item.currentStock} ${item.unit}` : item.unit}
                </p>
              </div>
              {alreadyEntered.has(item.id) ? (
                <p className="flex items-center gap-1 text-[11px] font-semibold shrink-0" style={{ color: '#1D9E75' }}>
                  <Check size={12} /> Opening entered
                </p>
              ) : (
                <>
                  <input type="number" min="0" inputMode="decimal" placeholder="Qty" style={{ ...inputStyle, width: '76px' }}
                    value={rows[item.id]?.qty ?? ''} onChange={e => setRow(item.id, { qty: e.target.value })} />
                  <input type="number" min="0" inputMode="decimal" placeholder={`₹/${item.unit}`} style={{ ...inputStyle, width: '86px' }}
                    value={rows[item.id]?.rate ?? ''} onChange={e => setRow(item.id, { rate: e.target.value })} />
                </>
              )}
            </div>
          ))}
        </div>
      )}
      <SaveBar onSave={save} saving={saving} disabled={filled.length === 0}
        label={filled.length > 0 ? `Save ${filled.length} item${filled.length > 1 ? 's' : ''}` : 'Save'} />
    </>
  )
}


import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import { X, ChevronLeft, Package, Sprout, Check, Wallet, Store, Truck, Users } from 'lucide-react'
import { useAppStore } from '../store'
import { useAuthStore, isAdmin, getActiveFarmRole } from '../store/auth'

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
// A farm arrives owing money and owed money, not just holding stock, so the
// list covers all six positions: cash, stock, parties, buyers, labour, crops.
// Where a screen already edits the figure it links there rather than growing a
// second form — parties to the Ledger's khata, labour to Labour, crops to
// Cycles. Cash and buyers get forms here because nothing else edits them.
//
// One date governs the lot: go-live. Everything before it is a stated position,
// everything after is a transaction. It is set with the cash figure, since that
// is the one every farm has.
//
// ProfileMenu can force the checklist open via the store's setupChecklistOpen
// flag — needed on farms like Pallia where cycles and stock already exist, so
// the card's auto-visibility rule never fires.

const dismissKey = (farmId) => `setupCardDismissed:${farmId}`

export default function SetupChecklist() {
  const navigate = useNavigate()
  const { activeFarm, activeFarmId } = useAuthStore()
  const {
    inventoryMaster, cropCycles, purchases, vendors, buyers, regularLabourers, permanentStaff,
    recordOpeningStock, farmOpening, loadFarmOpening, setFarmOpening,
    setBuyerOpeningBalance, accounts, setAccountOpening,
    setupChecklistOpen, closeSetupChecklist,
  } = useAppStore()

  const [view, setView]           = useState(null)   // null | 'menu' | 'stock' | 'cash' | 'buyers'
  const [dismissed, setDismissed] = useState(() => !!localStorage.getItem(dismissKey(activeFarmId)))

  useEffect(() => { setDismissed(!!localStorage.getItem(dismissKey(activeFarmId))) }, [activeFarmId])
  useEffect(() => { loadFarmOpening?.() }, [activeFarmId, loadFarmOpening])

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
  // A tick means "you have told us about this", not "this is non-zero" — a farm
  // may honestly owe nobody. Go-live being set is what marks cash as answered,
  // since that is the date the whole model hangs off.
  const stockDone    = purchases.some(p => p.invoiceNo === 'OPENING-STOCK') || inventoryMaster.some(i => i.currentStock > 0)
  const cropsDone    = cropCycles.length > 0
  const cashDone     = !!farmOpening?.goLiveDate
  const partiesDone  = (vendors || []).some(v => Number(v.opening_balance || 0) !== 0)
  const buyersDone   = (buyers  || []).some(b => Number(b.openingBalance  || 0) !== 0)
  // Openings live on regulars AND permanent staff — checking one group meant a
  // farm whose only balances were on staff never ticked this row.
  const labourDone   = [...(regularLabourers || []), ...(permanentStaff || [])]
    .some(l => Number(l.openingBalance || 0) !== 0)

  const dismiss = () => { localStorage.setItem(dismissKey(activeFarmId), '1'); setDismissed(true) }

  // Opening figures are the owner's statements — the database already rejects a
  // non-admin writing the column figures (0026/0031), and opening stock rows
  // deserve the same door. Managers simply don't see the card or the sheet.
  if (!isAdmin(getActiveFarmRole())) return null

  // Standing crops live in ONE place — the Cycles master (create with pre-app
  // spend, or edit it on existing cycles). This just takes the owner there.
  const goCycles  = () => { close(); navigate('/admin?tab=Cycles') }
  const goLedger  = () => { close(); navigate('/ledger') }
  // The opening-balance editor lives in the Manpower master, not the Labour
  // screen — Labour only displays the figure.
  const goLabour  = () => { close(); navigate('/admin?tab=Manpower') }

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
          {/* One way in, now that there are six positions to state rather than
              two — the list itself explains what each one is. */}
          <div className="flex gap-2 mt-2.5">
            <CardButton done={cashDone && stockDone && cropsDone}
              label="Opening balances" onClick={() => setView('menu')} />
          </div>
        </div>
      )}

      {effectiveView && (
        <Sheet onClose={close}>
          {effectiveView === 'menu'   && <MenuView
            done={{ cash: cashDone, stock: stockDone, parties: partiesDone,
                    buyers: buyersDone, labour: labourDone, crops: cropsDone }}
            goLiveDate={farmOpening?.goLiveDate}
            onPick={setView} onCycles={goCycles} onLedger={goLedger} onLabour={goLabour}
            onClose={close} />}
          {effectiveView === 'stock'  && <StockForm items={inventoryMaster} purchases={purchases}
            onBack={() => setView('menu')} onSave={recordOpeningStock} onDone={close} />}
          {effectiveView === 'cash'   && <CashForm opening={farmOpening} accounts={accounts}
            onBack={() => setView('menu')} onSave={setFarmOpening}
            onSaveAccount={setAccountOpening} onDone={close} />}
          {effectiveView === 'buyers' && <BuyersForm buyers={buyers}
            goLiveDate={farmOpening?.goLiveDate}
            onBack={() => setView('menu')} onSave={setBuyerOpeningBalance} onDone={close} />}
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
        ? { background: '#8A9A5B18', color: '#8A9A5B', border: '1px solid #8A9A5B40' }
        : { background: '#8A9A5B', color: '#fff', border: '1px solid #8A9A5B' }}>
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
        style={{ background: saving || disabled ? 'var(--c-ghost)' : '#8A9A5B',
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

function MenuView({ done, goLiveDate, onPick, onCycles, onLedger, onLabour, onClose }) {
  const rows = [
    { key: 'cash', Icon: Wallet, done: done.cash, title: 'Cash in hand',
      body: 'How much cash you hold, and the date everything below is counted from.',
      go: () => onPick('cash') },
    { key: 'stock', Icon: Package, done: done.stock, title: 'Opening stock',
      body: "What's in your store today — quantity and the rate you paid.",
      go: () => onPick('stock') },
    { key: 'parties', Icon: Store, done: done.parties, title: 'Party balances',
      body: 'What you already owe each shop. Set on the shop in Ledger → Party Ledger. Opens it →',
      go: onLedger },
    { key: 'buyers', Icon: Truck, done: done.buyers, title: 'Buyer balances',
      body: 'What buyers already owe you for crop taken before you started.',
      go: () => onPick('buyers') },
    { key: 'labour', Icon: Users, done: done.labour, title: 'Labour balances',
      body: 'Advances given and wages still due. Set on each worker in Labour. Opens it →',
      go: onLabour },
    { key: 'crops', Icon: Sprout, done: done.crops, title: 'Standing crops',
      body: 'Entered in the Cycles master — start a pre-app cycle or edit "spent before the app" there. Opens it →',
      go: onCycles },
  ]
  return (
    <>
      <SheetHeader title="Opening balances"
        sub={goLiveDate
          ? `Where the farm stood on ${goLiveDate}. Everything after that date is entered as it happens.`
          : 'For a farm that was already running before it joined the app. Start with cash — it sets the date the rest is counted from.'}
        onClose={onClose} />
      <div className="p-4 flex flex-col gap-2.5">
        {rows.map(({ key, Icon, done, title, body, go }) => (
          <button key={key} onClick={go}
            className="flex items-start gap-3 rounded-xl border p-3.5 text-left"
            style={{ borderColor: 'var(--c-border)', background: 'var(--c-bg)' }}>
            <Icon size={18} style={{ color: '#8A9A5B', marginTop: '1px' }} />
            <div className="flex-1 min-w-0">
              <p className="text-[13px] font-bold flex items-center gap-1.5" style={{ color: 'var(--c-text)' }}>
                {title}
                {done && <Check size={13} style={{ color: '#8A9A5B' }} />}
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

  // An item's opening is one figure — typing over an existing one RESTATES it
  // (the store replaces the earlier OPENING-STOCK rows), it never adds to it.
  // Shown as the current figure so the owner can see what he is correcting.
  const existingOpening = {}
  purchases.filter(p => p.invoiceNo === 'OPENING-STOCK').forEach(p => {
    const e = existingOpening[p.itemId] || { qty: 0, rate: p.unitPrice }
    existingOpening[p.itemId] = { qty: e.qty + Number(p.qty || 0), rate: p.unitPrice }
  })

  const setRow = (id, patch) => setRows(r => ({ ...r, [id]: { ...(r[id] || { qty: '', rate: '' }), ...patch } }))

  const filled = Object.entries(rows)
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
        sub="Stock on hand on your go-live date — not today's count. Saved as an opening balance dated 31 March — it will not appear in this season's spend." />
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
                  {existingOpening[item.id]
                    ? `opening: ${existingOpening[item.id].qty} ${item.unit} @ ₹${existingOpening[item.id].rate} — type to restate`
                    : item.currentStock > 0 ? `in app: ${item.currentStock} ${item.unit}` : item.unit}
                </p>
              </div>
              <input type="number" min="0" inputMode="decimal"
                placeholder={existingOpening[item.id] ? String(existingOpening[item.id].qty) : 'Qty'}
                style={{ ...inputStyle, width: '76px' }}
                value={rows[item.id]?.qty ?? ''} onChange={e => setRow(item.id, { qty: e.target.value })} />
              <input type="number" min="0" inputMode="decimal"
                placeholder={existingOpening[item.id] ? `₹${existingOpening[item.id].rate}` : `₹/${item.unit}`}
                style={{ ...inputStyle, width: '86px' }}
                value={rows[item.id]?.rate ?? ''} onChange={e => setRow(item.id, { rate: e.target.value })} />
            </div>
          ))}
        </div>
      )}
      <SaveBar onSave={save} saving={saving} disabled={filled.length === 0}
        label={filled.length > 0 ? `Save ${filled.length} item${filled.length > 1 ? 's' : ''}` : 'Save'} />
    </>
  )
}

// ── Form 2 — cash in hand, and the go-live date ───────────────────────────────
//
// The date is asked once, here, and becomes the farm's go-live date: the line
// every other opening figure is stated as of. Cash is the one position every
// farm has, so it is the natural place to ask.
//
// Stored on `farms`, not as a cash entry, so it can never be mistaken for a
// receipt — v_cash_book projects it as the opening line of the book.

function CashForm({ opening, accounts = [], onBack, onSave, onSaveAccount, onDone }) {
  // One amount per account: cash actually in the box, money actually in the
  // bank. The single farm-level figure (0027) is superseded — money lives in
  // named accounts now — but the go-live date still belongs to the farm.
  const [amounts, setAmounts] = useState(() =>
    Object.fromEntries(accounts.map(a => [a.id, a.opening_balance ? String(a.opening_balance) : ''])))
  const [date,   setDate]   = useState(opening?.goLiveDate || opening?.openingCashDate || '')
  const [saving, setSaving] = useState(false)
  const [error,  setError]  = useState('')

  const save = async () => {
    if (!date) { setError('Pick the date you are counting from — every other opening figure is stated as of this day.'); return }
    setSaving(true); setError('')
    try {
      // The farm keeps the go-live date; opening cash lives on the accounts.
      await onSave({ openingCash: 0, openingCashDate: null, goLiveDate: date })
      for (const a of accounts) {
        const amt = parseFloat(amounts[a.id])
        if (!isNaN(amt) && amt !== Number(a.opening_balance || 0)) {
          await onSaveAccount(a.id, amt, date)
        }
      }
      onDone()
    } catch (err) {
      setError(err.message || 'Could not save. Please try again.')
    }
    setSaving(false)
  }

  return (
    <>
      <SheetHeader title="Cash & bank" onBack={onBack} onClose={onDone}
        sub="What each account held on the day you start. Opens the Cash Book, so its balances are real rather than counted from zero." />
      {error && <ErrorBox>{error}</ErrorBox>}
      <div className="px-4 pt-3 flex flex-col gap-3">
        <div>
          <label className="text-[11px] font-semibold" style={{ color: 'var(--c-text)' }}>Counting from</label>
          <p className="text-[10px] mb-1.5 leading-snug" style={{ color: 'var(--c-faint)' }}>
            Your go-live date. Before it, you state balances; after it, everything is entered as it happens.
          </p>
          <input type="date" style={inputStyle} value={date} onChange={e => setDate(e.target.value)} />
        </div>
        {accounts.map(a => (
          <div key={a.id}>
            <label className="text-[11px] font-semibold" style={{ color: 'var(--c-text)' }}>
              {a.type === 'bank' ? '🏦' : '💵'} {a.name} (₹)
            </label>
            <p className="text-[10px] mb-1.5 leading-snug" style={{ color: 'var(--c-faint)' }}>
              {a.type === 'bank' ? 'Balance in this account on that day.' : 'Notes actually in the box on that day.'} Leave blank if nothing.
            </p>
            <input type="number" inputMode="decimal" placeholder="e.g. 50000" style={inputStyle}
              value={amounts[a.id] ?? ''}
              onChange={e => setAmounts(m => ({ ...m, [a.id]: e.target.value }))} />
          </div>
        ))}
        {accounts.length === 0 && (
          <p className="text-[11px]" style={{ color: 'var(--c-muted)' }}>
            No accounts found — the accounts migration has not been applied yet.
          </p>
        )}
      </div>
      <SaveBar onSave={save} saving={saving} disabled={!date} label="Save" />
    </>
  )
}

// ── Form 3 — what buyers already owe ──────────────────────────────────────────
//
// The mirror of a party's opening balance: crop taken before go-live that has
// not been paid for. Buyers have no edit screen of their own, so the figure is
// captured here rather than inventing one.

function BuyersForm({ buyers, goLiveDate, onBack, onSave, onDone }) {
  const [rows, setRows]     = useState({})   // { buyerId: amount }
  const [saving, setSaving] = useState(false)
  const [error,  setError]  = useState('')

  const active = (buyers || []).filter(b => b.isActive !== false)
  const filled = Object.entries(rows)
    .map(([id, v]) => ({ id, amount: parseFloat(v) }))
    .filter(r => !isNaN(r.amount))

  const save = async () => {
    setSaving(true); setError('')
    try {
      for (const r of filled) await onSave(r.id, r.amount, goLiveDate || null)
      onDone()
    } catch (err) {
      setError(err.message || 'Could not save. Please try again.')
    }
    setSaving(false)
  }

  return (
    <>
      <SheetHeader title="Buyer balances" onBack={onBack} onClose={onDone}
        sub="What each buyer still owes you for crop taken before you started. Leave blank if they owe nothing." />
      <DontDoubleCount />
      {error && <ErrorBox>{error}</ErrorBox>}
      {active.length === 0 ? (
        <p className="px-4 py-6 text-[12px]" style={{ color: 'var(--c-muted)' }}>
          No buyers yet — add them in Admin → Farm Masters first.
        </p>
      ) : (
        <div className="px-4 pt-3 flex flex-col gap-2">
          {active.map(b => (
            <div key={b.id} className="flex items-center gap-2 rounded-lg border px-3 py-2"
              style={{ borderColor: 'var(--c-border)', background: 'var(--c-bg)' }}>
              <div className="flex-1 min-w-0">
                <p className="text-[12px] font-semibold truncate" style={{ color: 'var(--c-text)' }}>{b.name}</p>
                {Number(b.openingBalance || 0) !== 0 && (
                  <p className="text-[10px]" style={{ color: '#8A9A5B' }}>
                    already set: ₹{Number(b.openingBalance).toLocaleString('en-IN')}
                  </p>
                )}
              </div>
              <input type="number" inputMode="decimal" placeholder="₹ owed" style={{ ...inputStyle, width: '104px' }}
                value={rows[b.id] ?? ''} onChange={e => setRows(r => ({ ...r, [b.id]: e.target.value }))} />
            </div>
          ))}
        </div>
      )}
      <SaveBar onSave={save} saving={saving} disabled={filled.length === 0}
        label={filled.length > 0 ? `Save ${filled.length} buyer${filled.length > 1 ? 's' : ''}` : 'Save'} />
    </>
  )
}


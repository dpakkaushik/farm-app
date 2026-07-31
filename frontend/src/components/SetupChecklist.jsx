import { useState, useEffect } from 'react'
import { X, ChevronLeft, Package, Sprout, Check } from 'lucide-react'
import { useAppStore } from '../store'
import { useAuthStore } from '../store/auth'

// Mid-year onboarding (docs/PLAN-mid-year-onboarding.md). A farm that signs up
// mid-season already has stock in the store and crops in the ground — some near
// harvest, with all their money spent before signup. This component renders:
//
//   • a "Finish setting up" card while the farm still looks un-set-up
//     (no crop cycles, or every stock level at zero) and not dismissed;
//   • the checklist itself — two forms:
//       Form 1 — opening stock  → backdated OPENING-STOCK purchases, dated the
//                day before the current FY starts, so stock and weighted-average
//                cost come out right without touching this season's expenses;
//       Form 2 — standing crops → start a cycle with a past sow date + a single
//                "spent so far ₹" (crop_cycles.opening_cost), or enter/edit that
//                figure on cycles that already exist.
//
// ProfileMenu can force the checklist open via the store's setupChecklistOpen
// flag — needed on farms like Pallia where cycles and stock already exist, so
// the card's auto-visibility rule never fires.

const seasonFor = (sowDateStr) => {
  const d     = new Date(sowDateStr)
  const month = d.getMonth() + 1
  const year  = d.getFullYear()
  if (month >= 10) return `rabi_${year}`
  if (month >= 4)  return `kharif_${year}`
  return `rabi_${year - 1}`
}

const dismissKey = (farmId) => `setupCardDismissed:${farmId}`

export default function SetupChecklist() {
  const { activeFarm, activeFarmId } = useAuthStore()
  const {
    inventoryMaster, cropMaster, plots, cropCycles, purchases,
    recordOpeningStock, addCropCycle, setCycleOpeningCost,
    setupChecklistOpen, closeSetupChecklist,
  } = useAppStore()

  const [view, setView]           = useState(null)   // null | 'menu' | 'stock' | 'crops'
  const [dismissed, setDismissed] = useState(() => !!localStorage.getItem(dismissKey(activeFarmId)))

  useEffect(() => { setDismissed(!!localStorage.getItem(dismissKey(activeFarmId))) }, [activeFarmId])

  // ProfileMenu's "Opening balances" item — open even on a fully set-up farm.
  useEffect(() => {
    if (setupChecklistOpen) { setView('menu'); closeSetupChecklist() }
  }, [setupChecklistOpen])

  const looksUnSetUp = cropCycles.length === 0 || inventoryMaster.every(i => !i.currentStock)
  const stockDone    = purchases.some(p => p.invoiceNo === 'OPENING-STOCK') || inventoryMaster.some(i => i.currentStock > 0)
  const cropsDone    = cropCycles.length > 0

  const dismiss = () => { localStorage.setItem(dismissKey(activeFarmId), '1'); setDismissed(true) }

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
            <CardButton done={cropsDone} label="Standing crops" onClick={() => setView('crops')} />
          </div>
        </div>
      )}

      {view && (
        <Sheet onClose={() => setView(null)}>
          {view === 'menu'  && <MenuView stockDone={stockDone} cropsDone={cropsDone} onPick={setView} />}
          {view === 'stock' && <StockForm items={inventoryMaster} purchases={purchases}
            onBack={() => setView('menu')} onSave={recordOpeningStock} onDone={() => setView(null)} />}
          {view === 'crops' && <CropsForm plots={plots} cropCycles={cropCycles} cropMaster={cropMaster}
            onBack={() => setView('menu')} onDone={() => setView(null)}
            addCropCycle={addCropCycle} setCycleOpeningCost={setCycleOpeningCost} />}
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

function Sheet({ onClose, children }) {
  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center">
      <div className="absolute inset-0" style={{ background: 'rgba(0,0,0,0.5)' }} onClick={onClose} />
      <div className="relative w-full overflow-y-auto rounded-t-2xl"
        style={{ maxWidth: '480px', maxHeight: '90dvh', background: 'var(--c-nav)',
                 paddingBottom: 'max(env(safe-area-inset-bottom, 0px), 16px)' }}>
        {children}
      </div>
    </div>
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

function MenuView({ stockDone, cropsDone, onPick }) {
  const rows = [
    { key: 'stock', Icon: Package, done: stockDone, title: 'Opening stock',
      body: "What's in your store today — quantity and the rate you paid." },
    { key: 'crops', Icon: Sprout, done: cropsDone, title: 'Standing crops',
      body: "Crops already in the ground, and what each has cost so far." },
  ]
  return (
    <>
      <SheetHeader title="Opening balances"
        sub="For a farm that was already running before it joined the app."
        onClose={() => onPick(null)} />
      <div className="p-4 flex flex-col gap-2.5">
        {rows.map(({ key, Icon, done, title, body }) => (
          <button key={key} onClick={() => onPick(key)}
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

// ── Form 2 — standing crops + spent-so-far ────────────────────────────────────

function CropsForm({ plots, cropCycles, cropMaster, onBack, onDone, addCropCycle, setCycleOpeningCost }) {
  // Existing active cycles: edit opening_cost in place (update, not create).
  // Plots without one: pick crop + rough sow date + spent-so-far → new cycle.
  const [cycleCosts, setCycleCosts] = useState(() => {
    const init = {}
    cropCycles.filter(c => c.status === 'active').forEach(c => { init[c.id] = c.openingCost ?? '' })
    return init
  })
  const [newRows, setNewRows] = useState({})   // { plotId: { cropId, sowDate, cost } }
  const [saving, setSaving]   = useState(false)
  const [error, setError]     = useState('')

  const setNewRow = (plotId, patch) =>
    setNewRows(r => ({ ...r, [plotId]: { ...(r[plotId] || { cropId: '', sowDate: '', cost: '' }), ...patch } }))

  const changedCycles = Object.entries(cycleCosts).filter(([id, val]) => {
    const orig = cropCycles.find(c => c.id === id)?.openingCost
    const parsed = val === '' ? null : parseFloat(val)
    return parsed !== (orig ?? null)
  })
  // The active-cycle guard makes a retry after a mid-batch failure safe: each
  // successful addCropCycle lands in cropCycles, so its row is skipped, never
  // created twice.
  const startedRows = Object.entries(newRows).filter(([plotId, r]) =>
    r.cropId && r.sowDate && !cropCycles.some(c => c.plotId === plotId && c.status === 'active'))
  const nothingToSave = changedCycles.length === 0 && startedRows.length === 0

  const save = async () => {
    const halfDonePlots = plots.filter(p => {
      const r = newRows[p.id]
      return r && (r.cropId || r.sowDate || r.cost) && !(r.cropId && r.sowDate)
    })
    if (halfDonePlots.length > 0) {
      setError(`${halfDonePlots.map(p => p.name).join(', ')}: pick the crop and roughly when it was sown — or clear the row — then save.`)
      return
    }
    setSaving(true)
    setError('')
    try {
      for (const [cycleId, val] of changedCycles) {
        await setCycleOpeningCost(cycleId, val === '' ? null : parseFloat(val))
      }
      for (const [plotId, r] of startedRows) {
        const crop    = cropMaster.find(c => c.id === r.cropId)
        const harvest = new Date(r.sowDate)
        harvest.setDate(harvest.getDate() + (crop?.duration_days || 120))
        await addCropCycle({
          plotId, cropId: r.cropId,
          season:      seasonFor(r.sowDate),
          sowDate:     r.sowDate,
          harvestDate: harvest.toISOString().slice(0, 10),
          openingCost: parseFloat(r.cost) || null,
        })
      }
      onDone()
    } catch (err) {
      setError(err.message || 'Could not save standing crops. Please try again.')
    }
    setSaving(false)
  }

  return (
    <>
      <SheetHeader title="Standing crops" onBack={onBack} onClose={onDone}
        sub="What's in the ground, and what each crop has already cost — inputs, labour, everything spent before the app. One number is enough." />
      <DontDoubleCount />
      {error && <ErrorBox>{error}</ErrorBox>}
      {plots.length === 0 ? (
        <p className="px-4 py-6 text-[12px]" style={{ color: 'var(--c-muted)' }}>
          No plots yet — add them in Admin → Fields first.
        </p>
      ) : (
        <div className="px-4 pt-3 flex flex-col gap-2.5">
          {plots.map(plot => {
            const active = cropCycles.filter(c => c.plotId === plot.id && c.status === 'active')
            return (
              <div key={plot.id} className="rounded-lg border px-3 py-2.5"
                style={{ borderColor: 'var(--c-border)', background: 'var(--c-bg)' }}>
                <p className="text-[12px] font-bold" style={{ color: 'var(--c-text)' }}>
                  {plot.name}
                  <span className="font-normal" style={{ color: 'var(--c-faint)' }}>
                    {plot.area_acres ? ` · ${plot.area_acres} ac` : ''}
                  </span>
                </p>
                {active.length > 0 ? active.map(cycle => {
                  const crop = cropMaster.find(c => c.id === cycle.cropId)
                  return (
                    <div key={cycle.id} className="flex items-center gap-2 mt-2">
                      <p className="flex-1 text-[12px] truncate" style={{ color: 'var(--c-muted)' }}>
                        {crop?.emoji || '🌾'} {crop?.name || 'Crop'} · sown {cycle.sowDate}
                      </p>
                      <input type="number" min="0" inputMode="decimal" placeholder="Spent before app ₹"
                        style={{ ...inputStyle, width: '150px' }}
                        value={cycleCosts[cycle.id] ?? ''}
                        onChange={e => setCycleCosts(cc => ({ ...cc, [cycle.id]: e.target.value }))} />
                    </div>
                  )
                }) : (
                  <div className="flex flex-col gap-2 mt-2">
                    <div className="flex gap-2">
                      <select style={{ ...inputStyle, flex: 1 }}
                        value={newRows[plot.id]?.cropId ?? ''}
                        onChange={e => setNewRow(plot.id, { cropId: e.target.value })}>
                        <option value="">No crop growing</option>
                        {cropMaster.map(c => <option key={c.id} value={c.id}>{c.emoji ? `${c.emoji} ` : ''}{c.name}</option>)}
                      </select>
                      <input type="date" style={{ ...inputStyle, width: '138px' }}
                        aria-label={`Sow date for ${plot.name}`}
                        value={newRows[plot.id]?.sowDate ?? ''}
                        onChange={e => setNewRow(plot.id, { sowDate: e.target.value })} />
                    </div>
                    {newRows[plot.id]?.cropId && (
                      <input type="number" min="0" inputMode="decimal" placeholder="Spent so far ₹ (optional)"
                        style={inputStyle}
                        value={newRows[plot.id]?.cost ?? ''}
                        onChange={e => setNewRow(plot.id, { cost: e.target.value })} />
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
      <SaveBar onSave={save} saving={saving} disabled={nothingToSave} />
    </>
  )
}

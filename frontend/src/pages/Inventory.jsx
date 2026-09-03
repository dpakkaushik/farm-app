import React, { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Plus, X, CheckCircle2, AlertTriangle, Receipt, FileText, ChevronLeft,
         Download, Filter, Trash2 } from 'lucide-react'
import FilePicker from '../components/FilePicker'
import Attachment from '../components/Attachment'
import RegisterCard from '../components/RegisterCard'
import FilterSelect from '../components/FilterSelect'
import AddButton from '../components/AddButton'
import { useAppStore } from '../store'
import { supabase } from '../lib/supabase'
import { billRef, entryDiffers, fmtBillDate, localToday } from '../lib/billdates'
import { itemsLabel, fmtINR as fmt } from './assets/assetFacts'
import SummaryBox from '../components/SummaryBox'
import { MACHINE_TYPES, ASSET_CATS } from './Assets'
import useBackClose from '../hooks/useBackClose'
import SelectField from '../components/SelectField'

const TODAY_STR = localToday()
// A bill line lands in one of three registers. Stock is consumed; machinery and
// assets are owned, so they leave inventory alone and go to their own master —
// still carrying this bill, so the vendor is owed the whole document.
const LINE_KINDS = {
  stock:     { label: 'Stock',     emoji: '📦' },
  machinery: { label: 'Machinery', emoji: '🔧' },
  asset:     { label: 'Asset',     emoji: '🛠' },
}
const SUB_TYPES = { machinery: MACHINE_TYPES, asset: ASSET_CATS }
const BLANK_LINE = { kind: 'stock', itemId: '', name: '', subType: '', qty: '', unitPrice: '' }
const CATS      = ['seed', 'fertilizer', 'chemical', 'fuel', 'other']
const CAT_LABEL = { seed: 'Seeds', fertilizer: 'Fertilizers', chemical: 'Chemicals', fuel: 'Fuel', other: 'Other' }
const CAT_EMOJI = { seed: '🌾', fertilizer: '🧪', chemical: '🧴', fuel: '⛽', other: '📦' }

// Current Stock IS this page now. Purchases and Issues are the two histories
// behind it — reference reading, opened from a button and closed again, not a
// tab you can get lost in (owner, 26 Aug). Resources' page head carries
// Inventory · Machinery · Assets instead of a second strip of tabs here.
const LOGS = {
  purchase: { title: 'Purchase History', Icon: Receipt,  label: 'Purchases' },
  issue:    { title: 'Issue History',    Icon: FileText, label: 'Issues'    },
}

export default function Inventory() {
  const {
    inventoryMaster, purchases, issues, plots, cropCycles, cropMaster,
    machineryMaster, vendors, recordBillPurchase, issueItem, addVendor,
  } = useAppStore()

  // ?cat=fuel lands on the diesel shelf directly (Assets → "Issue Diesel").
  const [params]                  = useSearchParams()
  const [logView,   setLogView]   = useState(null)   // 'purchase' | 'issue' — the history overlay
  const [catFilter, setCat]       = useState(CATS.includes(params.get('cat')) ? params.get('cat') : 'all')
  const [modal,     setModal]     = useState(null)   // 'bill' | 'issue'
  const [selected,  setSelected]  = useState(null)   // for issue only
  const [form,      setForm]      = useState({})
  const [toast,     setToast]     = useState(null)
  const [toastType, setToastType] = useState('success')
  const [saving,    setSaving]    = useState(false)

  // The history overlay is a drill-down, so the back gesture backs out of it —
  // the page's modals get theirs from the Modal shell below.
  useBackClose(() => setLogView(null), !!logView)

  // Bill purchase state. `date` is the bill's own date and starts EMPTY on
  // purpose — see lib/billdates.js for the ₹1.12 lakh of July data that a
  // date picker sitting on today filed into August.
  const [billMeta, setBillMeta] = useState({ date: '', vendorId: '', vendor: '', invoiceNo: '', notes: '' })
  const [billLines, setBillLines] = useState([{ ...BLANK_LINE }])
  const [billFile,  setBillFile]  = useState(null)

  const showToast = (msg, type = 'success') => {
    setToast(msg); setToastType(type); setTimeout(() => setToast(null), 3500)
  }
  const f = (k, v) => setForm(p => ({ ...p, [k]: v }))

  // ── Bill purchase handlers ─────────────────────────────────────────────────
  const bm = (k, v) => setBillMeta(p => ({ ...p, [k]: v }))
  const updateLine  = (i, k, v) => setBillLines(ls => ls.map((l, idx) => idx === i ? { ...l, [k]: v } : l))
  const addLine     = () => setBillLines(ls => [...ls, { ...BLANK_LINE }])
  const removeLine  = (i) => setBillLines(ls => ls.filter((_, idx) => idx !== i))

  // Picking one of the two trailing options in the item dropdown turns that row
  // into a machine or an asset — a name to type instead of stock to choose. No
  // extra column, and nothing changes for the ordinary all-stock bill.
  const setLineKind = (i, kind) => setBillLines(ls => ls.map((l, idx) => idx === i
    ? { ...l, kind, itemId: '', name: '', subType: kind === 'stock' ? '' : SUB_TYPES[kind][0] }
    : l))

  const lineAmount   = (l) => (parseFloat(l.qty) || 0) * (parseFloat(l.unitPrice) || 0)
  const lineFilled   = (l) => (l.kind === 'stock' ? !!l.itemId : !!l.name.trim())
                              && parseFloat(l.qty) > 0 && parseFloat(l.unitPrice) > 0
  const billTotal    = billLines.reduce((s, l) => s + lineAmount(l), 0)
  const capitalTotal = billLines.filter(l => l.kind !== 'stock').reduce((s, l) => s + lineAmount(l), 0)

  const openBillModal = () => {
    setBillMeta({ date: '', vendorId: '', vendor: '', invoiceNo: '', notes: '' })
    setBillLines([{ ...BLANK_LINE }])
    setBillFile(null)
    setModal('bill')
  }

  const confirmBill = async () => {
    // Asked for first because it is the one field the app cannot guess and the
    // one that decides which financial year every line of this bill lands in.
    if (!billMeta.date) return showToast('Pick the bill date — the date printed on the bill', 'warn')
    if (billMeta.date > localToday()) return showToast('A bill cannot be dated in the future', 'warn')
    if (!billMeta.vendor.trim()) return showToast('Enter vendor name', 'warn')
    const valid = billLines.filter(lineFilled)
    if (valid.length === 0) return showToast('Add at least one item with qty and rate', 'warn')
    setSaving(true)
    try {
      let billFileUrl = null
      if (billFile) {
        const ext  = billFile.name.split('.').pop()
        const path = `inventory-docs/bills/${Date.now()}.${ext}`
        const { error: upErr } = await supabase.storage.from('farm-photos').upload(path, billFile)
        if (!upErr) billFileUrl = supabase.storage.from('farm-photos').getPublicUrl(path).data.publicUrl
      }
      // A typed vendor name used to save as text and create no party, so the
      // money owed existed nowhere — that is how ₹1.26 lakh across five shops
      // became invisible, and how bill 4237's ₹5,000 sprayer went unowed. If a
      // shop is named, it is a shop: create it, and let the bill be a real debt.
      // An existing party of the same name is reused rather than duplicated.
      let vendorId = (billMeta.vendorId && billMeta.vendorId !== '__other__')
        ? billMeta.vendorId : null
      const typedName = billMeta.vendor.trim()
      if (!vendorId && typedName) {
        const existing = (vendors || []).find(
          v => v.name.trim().toLowerCase() === typedName.toLowerCase())
        vendorId = existing ? existing.id : (await addVendor({ name: typedName })).id
      }

      await recordBillPurchase({
        billDate: billMeta.date,
        vendorId,
        vendor: typedName,
        invoiceNo: billMeta.invoiceNo.trim(), notes: billMeta.notes.trim(),
        billFileUrl,
        lineItems: valid.map(l => ({
          kind: l.kind, itemId: l.itemId, name: l.name.trim(), subType: l.subType,
          qty: parseFloat(l.qty), unitPrice: parseFloat(l.unitPrice),
        })),
      })
      showToast(`Bill saved — ${valid.length} item${valid.length > 1 ? 's' : ''} purchased`)
      setModal(null)
    } catch (e) { showToast('Save failed: ' + e.message, 'warn') }
    setSaving(false)
  }

  // ── Issue handlers ─────────────────────────────────────────────────────────
  const openIssue = async (item) => {
    setForm({ qty: '', purpose: '', plotIds: [], date: TODAY_STR, machineryId: '' })
    setModal('issue')
    const { data } = await supabase.from('inventory_items')
      .select('current_stock, cost_per_unit').eq('id', item.id).single()
    setSelected(data
      ? { ...item, currentStock: Number(data.current_stock), costPerUnit: Number(data.cost_per_unit) }
      : item
    )
  }

  const issueQty         = parseFloat(form.qty) || 0
  const stockAfter       = (selected?.currentStock || 0) - issueQty
  const qtyOverStock     = issueQty > (selected?.currentStock || 0)
  const selectedPlotObjs = plots.filter(p => (form.plotIds || []).includes(p.id))
  const totalArea        = selectedPlotObjs.reduce((s, p) => s + (Number(p.area_acres) || 1), 0)
  const plotSplit        = selectedPlotObjs.map(p => {
    const area     = Number(p.area_acres) || 1
    const splitQty = totalArea > 0 ? Math.round(issueQty * (area / totalArea) * 100) / 100 : issueQty
    const cycle    = cropCycles.find(c => c.plotId === p.id && c.status === 'active')
    return { plot: p, area, splitQty, cycle, stage: cycle ? 'active' : 'preparation' }
  })

  const confirmIssue = async () => {
    if (!issueQty || issueQty <= 0) return showToast('Enter a valid quantity', 'warn')
    if (qtyOverStock) return showToast(`Only ${selected.currentStock} ${selected.unit} in stock`, 'warn')
    setSaving(true)
    try {
      if (selectedPlotObjs.length === 0) {
        await issueItem({ itemId: selected.id, plotId: null, date: form.date, qty: issueQty, purpose: form.purpose || '', machineryId: form.machineryId || null })
      } else {
        for (const { plot, splitQty } of plotSplit) {
          await issueItem({ itemId: selected.id, plotId: plot.id, date: form.date, qty: splitQty, purpose: form.purpose || '', machineryId: form.machineryId || null })
        }
      }
      showToast(`Issued ${issueQty} ${selected.unit} of ${selected.name}`)
      setModal(null)
    } catch (e) { showToast('Save failed: ' + e.message, 'warn') }
    setSaving(false)
  }

  // What is on the shelf comes first; an empty shelf sinks to the bottom
  // (owner, 26 Aug). Twelve of the items read zero after the July cleanup, and
  // alphabetical order scattered them through the list, so the shelf you
  // actually have was buried among things you don't. The sort is STABLE, so
  // within each group the store's own order — alphabetical — is untouched, and
  // it copies first: `inventoryMaster` is store state, never sorted in place.
  const items = (catFilter === 'all' ? inventoryMaster : inventoryMaster.filter(i => i.category === catFilter))
    .slice()
    .sort((a, b) => (Number(a.currentStock) > 0 ? 0 : 1) - (Number(b.currentStock) > 0 ? 0 : 1))

  const stockValue = inventoryMaster.reduce((s, i) => s + (i.currentStock || 0) * (i.costPerUnit || 0), 0)
  const lowCount   = inventoryMaster.filter(i =>
    i.currentStock === 0 || (i.minThreshold > 0 && i.currentStock < i.minThreshold)).length

  return (
    <div className="h-full flex flex-col bg-[var(--c-bg)]">

      {/* The same box the two histories carry, then the histories, then the add
          row and the filter. It was a thin muted line until 26 Aug — the owner
          asked for the figure to read like Purchase History's. */}
      <div className="shrink-0 px-4 pt-3">
        <SummaryBox label="Stock value" value={fmt(stockValue)}
          meta={[
            { value: itemsLabel(inventoryMaster.length) },
            lowCount > 0 && { value: `${lowCount} low or out`, color: '#BA7517' },
          ]} />
      </div>

      <div className="flex-1 flex flex-col min-h-0">
        <div className="px-4 pt-3 pb-2 shrink-0 space-y-2">
          {/* The two histories: what came in, what went out. Reference reading,
              so they open over the page and close again. */}
          <div className="flex gap-2">
            {Object.entries(LOGS).map(([key, { Icon, label }]) => (
              <button key={key} onClick={() => setLogView(key)}
                className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl border text-xs font-semibold"
                style={{ background: 'var(--c-ghost)', borderColor: 'var(--c-border)', color: 'var(--c-sub)' }}>
                <Icon size={13} /> {label} <span style={{ color: 'var(--c-faint)' }}>→</span>
              </button>
            ))}
          </div>
          {/* Stock only ever arrives on a bill, so "add" here is a purchase —
              the same dashed row every other register opens with. */}
          <AddButton onClick={openBillModal}>New Purchase</AddButton>
          <FilterSelect value={catFilter} onChange={setCat} title="Category"
            options={[['all', 'All categories'], ...CATS.map(c => [c, `${CAT_EMOJI[c]} ${CAT_LABEL[c]}`])]} />
        </div>
        <div className="flex-1 overflow-y-auto p-4 space-y-2 pb-4">
          {items.map(item => {
            const isOut = item.currentStock === 0
            const isLow = item.minThreshold > 0 && item.currentStock > 0 && item.currentStock < item.minThreshold
            // Same card as Machinery / Farm Assets — see components/RegisterCard.
            return (
              <RegisterCard key={item.id}
                title={item.name}
                subline={`${CAT_LABEL[item.category]} · WAC ₹${item.costPerUnit}/${item.unit}`}
                figure={item.currentStock}
                figureColor={isOut ? '#E24B4A' : isLow ? '#BA7517' : undefined}
                figureLabel={item.unit}
                status={isOut ? { text: '✗ Out of stock', color: '#E24B4A' }
                      : isLow ? { text: `⚠ Low (min ${item.minThreshold})`, color: '#BA7517' }
                      : null}
                borderColor={isOut ? '#E24B4A66' : isLow ? '#BA751759' : undefined}
                action={{ label: '→ Issue to Plot', onClick: () => openIssue(item), disabled: isOut }}
              />
            )
          })}
          {items.length === 0 && (
            <p className="text-center py-12 text-sm" style={{ color: 'var(--c-faint)' }}>Nothing in this category</p>
          )}
        </div>
      </div>

      {/* ── The histories, over the page ── */}
      {logView && (
        <div className="fixed inset-0 z-50 flex flex-col" style={{ background: 'var(--c-bg)' }}>
          <div className="shrink-0 flex items-center gap-2 px-4 pb-3 border-b"
            style={{ background: 'var(--c-nav)', borderColor: 'var(--c-border)', paddingTop: 'calc(0.75rem + env(safe-area-inset-top, 0px))' }}>
            {/* A back arrow, not a ✕: this is a drill-down into the register,
                not a modal you dismiss. */}
            <button onClick={() => setLogView(null)} aria-label="Back"
              className="w-8 h-8 flex items-center justify-center rounded-full" style={{ color: 'var(--c-muted)' }}>
              <ChevronLeft size={20} />
            </button>
            <p className="text-sm font-bold" style={{ color: 'var(--c-text)' }}>{LOGS[logView].title}</p>
          </div>
          {logView === 'purchase'
            ? <PurchaseLogs purchases={purchases} inventoryMaster={inventoryMaster} />
            : <IssueLogs issues={issues} inventoryMaster={inventoryMaster} plots={plots} />}
        </div>
      )}

      {/* ── BILL PURCHASE MODAL ── */}
      {modal === 'bill' && (
        <Modal title="New Purchase Bill" onClose={() => setModal(null)}>
          <div className="space-y-3">
            {/* Bill header — two dates, and they are not the same thing. The entry
                date is stamped by the database and shown read-only so it is clear
                the app already knows when this was typed; the bill date is the one
                being asked for, and it starts empty so it cannot be left on today
                by accident the way six bills' worth of July purchases were. */}
            <div className="grid grid-cols-2 gap-2">
              <FRow label="Entry Date">
                <input className="finput" value={fmtBillDate(TODAY_STR)} readOnly tabIndex={-1}
                  style={{ opacity: 0.55, cursor: 'default' }} />
                <p className="text-[11px] mt-1 leading-snug" style={{ color: 'var(--c-faint)' }}>
                  Today — recorded for you.
                </p>
              </FRow>
              <FRow label="Bill Date *">
                <input type="date" className="finput" value={billMeta.date} max={TODAY_STR}
                  onChange={e => bm('date', e.target.value)} style={{ colorScheme: 'dark' }} />
                {billMeta.date ? (
                  <p className="text-[11px] mt-1 leading-snug" style={{ color: 'var(--c-faint)' }}>
                    The date printed on the bill.
                  </p>
                ) : (
                  <p className="text-[11px] mt-1 leading-snug" style={{ color: '#BA7517' }}>
                    Read it off the bill.{' '}
                    <button type="button" onClick={() => bm('date', TODAY_STR)}
                      className="underline font-semibold">Bill is from today</button>
                  </p>
                )}
              </FRow>
            </div>
            <div className="grid grid-cols-1 gap-2">
              <FRow label="Vendor *">
                <SelectField className="finput" value={billMeta.vendorId}
                  onChange={e => {
                    const v = vendors.find(x => x.id === e.target.value)
                    setBillMeta(p => ({ ...p, vendorId: e.target.value, vendor: v ? v.name : '' }))
                  }}
                  style={{ background: 'var(--c-surface)' }}>
                  <option value="" style={{ background: 'var(--c-surface)' }}>Select vendor…</option>
                  {(vendors || []).filter(v => v.is_active).map(v => (
                    <option key={v.id} value={v.id} style={{ background: 'var(--c-surface)' }}>{v.name}</option>
                  ))}
                  <option value="__other__" style={{ background: 'var(--c-surface)' }}>Other — new shop…</option>
                </SelectField>
                {billMeta.vendorId === '__other__' && (
                  <>
                    <input className="finput mt-1.5" placeholder="Shop name"
                      value={billMeta.vendor} onChange={e => bm('vendor', e.target.value)} />
                    <p className="text-[11px] mt-1 leading-snug" style={{ color: 'var(--c-faint)' }}>
                      Added to your parties, so this bill shows as money owed to them.
                    </p>
                  </>
                )}
              </FRow>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <FRow label="Invoice No.">
                <input className="finput" placeholder="optional"
                  value={billMeta.invoiceNo} onChange={e => bm('invoiceNo', e.target.value)} />
              </FRow>
              <FRow label="Notes">
                <input className="finput" placeholder="optional"
                  value={billMeta.notes} onChange={e => bm('notes', e.target.value)} />
              </FRow>
            </div>

            {/* Line items */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-semibold text-[var(--c-sub)]">Items Purchased</p>
                <p className="text-[12px] text-[var(--c-faint)]">{billLines.length} row{billLines.length > 1 ? 's' : ''}</p>
              </div>

              {/* Column headers */}
              <div className="grid grid-cols-[1fr_64px_80px_56px_28px] gap-1 mb-1.5 px-1">
                <p className="text-[11px] font-semibold text-[var(--c-faint)] uppercase tracking-wide">Item</p>
                <p className="text-[11px] font-semibold text-[var(--c-faint)] uppercase tracking-wide">Qty</p>
                <p className="text-[11px] font-semibold text-[var(--c-faint)] uppercase tracking-wide">Rate</p>
                <p className="text-[11px] font-semibold text-[var(--c-faint)] uppercase tracking-wide">Amt</p>
                <span />
              </div>

              <div className="space-y-1.5">
                {billLines.map((line, i) => {
                  const amt = lineAmount(line)
                  return (
                    <div key={i} className="grid grid-cols-[1fr_64px_80px_56px_28px] gap-1 items-center">
                      {line.kind === 'stock' ? (
                        <SelectField className="finput text-xs py-2 px-2" value={line.itemId}
                          onChange={e => {
                            const v = e.target.value
                            if (v === '__machinery__' || v === '__asset__') {
                              return setLineKind(i, v === '__machinery__' ? 'machinery' : 'asset')
                            }
                            const item = inventoryMaster.find(x => x.id === v)
                            updateLine(i, 'itemId', v)
                            if (item) updateLine(i, 'unitPrice', String(item.costPerUnit || ''))
                          }}
                          style={{ background: 'var(--c-surface)' }}>
                          <option value="" style={{ background: 'var(--c-surface)' }}>Select…</option>
                          {inventoryMaster.map(it => (
                            <option key={it.id} value={it.id} style={{ background: 'var(--c-surface)' }}>
                              {it.name} ({it.unit})
                            </option>
                          ))}
                          <option value="__machinery__" style={{ background: 'var(--c-surface)' }}>
                            {LINE_KINDS.machinery.emoji} Not stock — machinery…
                          </option>
                          <option value="__asset__" style={{ background: 'var(--c-surface)' }}>
                            {LINE_KINDS.asset.emoji} Not stock — farm asset…
                          </option>
                        </SelectField>
                      ) : (
                        <div className="space-y-1">
                          <input className="finput text-xs py-2 px-2" autoFocus
                            placeholder={line.kind === 'machinery' ? 'Machine name' : 'Asset name'}
                            value={line.name} onChange={e => updateLine(i, 'name', e.target.value)} />
                          <div className="flex items-center gap-1">
                            <SelectField className="finput text-[12px] py-1 px-1.5 flex-1 min-w-0" value={line.subType}
                              onChange={e => updateLine(i, 'subType', e.target.value)}
                              style={{ background: 'var(--c-surface)' }}>
                              {SUB_TYPES[line.kind].map(t => (
                                <option key={t} value={t} style={{ background: 'var(--c-surface)' }}>
                                  {t.replace(/_/g, ' ')}
                                </option>
                              ))}
                            </SelectField>
                            <button onClick={() => setLineKind(i, 'stock')}
                              className="shrink-0 text-[11px] px-1.5 py-1 rounded-md"
                              style={{ background: 'var(--c-ghost)', color: 'var(--c-muted)' }}>
                              ↩ stock
                            </button>
                          </div>
                        </div>
                      )}
                      <input type="number" className="finput text-xs py-2 px-2" placeholder="0"
                        value={line.qty} onChange={e => updateLine(i, 'qty', e.target.value)} />
                      <input type="number" className="finput text-xs py-2 px-2" placeholder="₹"
                        value={line.unitPrice} onChange={e => updateLine(i, 'unitPrice', e.target.value)} />
                      <p className="text-xs font-semibold text-[var(--c-text)] text-right">
                        {amt > 0 ? `₹${amt >= 1000 ? (amt/1000).toFixed(1)+'K' : amt}` : '—'}
                      </p>
                      {billLines.length > 1
                        ? <button onClick={() => removeLine(i)} className="text-[#E24B4A]/70 hover:text-[#E24B4A] flex items-center justify-center">
                            <X size={14} />
                          </button>
                        : <span />
                      }
                    </div>
                  )
                })}
              </div>

              <button onClick={addLine}
                className="mt-2 w-full py-2 border border-dashed border-[#8A9A5B]/30 rounded-xl text-xs text-[#8A9A5B] hover:border-[#8A9A5B]/60 flex items-center justify-center gap-1">
                <Plus size={12} /> Add Item
              </button>
            </div>

            {/* Total — the whole document, whichever register each line lands in.
                The split is spelled out when it is not all stock, so the number
                here can be checked against the bill in hand. */}
            {billTotal > 0 && (
              <div className="bg-[#8A9A5B]/10 border border-[#8A9A5B]/20 rounded-xl px-4 py-2.5">
                <div className="flex items-center justify-between">
                  <p className="text-xs text-[var(--c-sub)]">Bill Total ({billLines.filter(lineFilled).length} items)</p>
                  <p className="text-xl font-bold text-[#8A9A5B]">₹{billTotal.toLocaleString()}</p>
                </div>
                {capitalTotal > 0 && (
                  <p className="text-[12px] mt-1" style={{ color: 'var(--c-muted)' }}>
                    Stock ₹{(billTotal - capitalTotal).toLocaleString()} · Machinery &amp; assets ₹{capitalTotal.toLocaleString()}
                    <span className="block">Whole bill is owed to {billMeta.vendor.trim() || 'the vendor'}.</span>
                  </p>
                )}
              </div>
            )}

            {/* Bill attachment */}
            <FRow label="Attach Bill (photo or PDF)">
              <FilePicker accept="image/*,application/pdf" file={billFile} onFile={setBillFile} />
            </FRow>

            <button onClick={confirmBill} disabled={saving}
              className="w-full py-3 bg-[#8A9A5B] text-white text-sm font-bold rounded-xl disabled:opacity-40">
              {saving ? 'Saving…' : 'Confirm Purchase Bill'}
            </button>
          </div>
        </Modal>
      )}

      {/* ── ISSUE MODAL ── */}
      {modal === 'issue' && selected && (
        <Modal title={`Issue — ${selected.name}`} onClose={() => setModal(null)}>
          <div className="space-y-3">
            <div className={`rounded-xl px-3 py-2 border text-xs ${
              selected.currentStock === 0 ? 'bg-[#E24B4A]/10 border-[#E24B4A]/30 text-[#E24B4A]'
              : selected.currentStock < (selected.minThreshold || 0) ? 'bg-[#BA7517]/10 border-[#BA7517]/30 text-[#BA7517]'
              : 'bg-[var(--c-card)] border-[var(--c-border-md)] text-[var(--c-sub)]'}`}>
              Stock: <span className="font-bold text-[var(--c-text)]">{selected.currentStock} {selected.unit}</span>
              {' '}· WAC: <span className="font-bold text-[var(--c-text)]">₹{selected.costPerUnit}/{selected.unit}</span>
            </div>

            <FRow label="Issue To (tap to select plots)">
              <div className="flex flex-wrap gap-2">
                {plots.map(p => {
                  const sel = (form.plotIds || []).includes(p.id)
                  return (
                    <button key={p.id} type="button"
                      onClick={() => {
                        const curr = form.plotIds || []
                        f('plotIds', sel ? curr.filter(id => id !== p.id) : [...curr, p.id])
                      }}
                      className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                        sel ? 'bg-[#8A9A5B]/20 border-[#8A9A5B]/50 text-[#8A9A5B]' : 'border-[var(--c-border-md)] text-[var(--c-muted)]'
                      }`}>
                      {p.name}{p.area_acres ? ` · ${p.area_acres}ac` : ''}
                    </button>
                  )
                })}
              </div>
              {(form.plotIds || []).length === 0 && (
                <p className="text-[12px] text-[var(--c-faint)] mt-1.5">No plots selected — will be recorded as General Use</p>
              )}
            </FRow>

            {selected.category === 'fuel' && (
              <FRow label="Machine (for diesel tracking)">
                <SelectField className="finput" value={form.machineryId || ''} onChange={e => f('machineryId', e.target.value)} style={{ background: 'var(--c-surface)' }}>
                  <option value="" style={{ background: 'var(--c-surface)' }}>No machine / general</option>
                  {(machineryMaster || []).filter(m => m.requiresDiesel).map(m => (
                    <option key={m.id} value={m.id} style={{ background: 'var(--c-surface)' }}>
                      {m.displayId} · {m.name}{m.regNo ? ` (${m.regNo})` : ''}
                    </option>
                  ))}
                </SelectField>
              </FRow>
            )}

            {selectedPlotObjs.length > 0 && (
              <div className="space-y-1.5">
                {plotSplit.map(({ plot, area, cycle, stage }) => (
                  <div key={plot.id} className={`rounded-xl px-3 py-2 text-xs border ${stage === 'active' ? 'bg-[#8A9A5B]/10 border-[#8A9A5B]/30' : 'bg-[#BA7517]/10 border-[#BA7517]/30'}`}>
                    <div className="flex items-center justify-between">
                      <p className="font-semibold" style={{ color: stage === 'active' ? '#8A9A5B' : '#BA7517' }}>
                        {plot.name} · {area}ac
                      </p>
                      <span className="text-[11px] font-bold px-1.5 py-0.5 rounded"
                        style={{ background: (stage === 'active' ? '#8A9A5B' : '#BA7517') + '25', color: stage === 'active' ? '#8A9A5B' : '#BA7517' }}>
                        {stage === 'active' ? 'Active cycle' : 'Preparation'}
                      </span>
                    </div>
                    {cycle && (
                      <p className="text-[var(--c-sub)] mt-0.5 text-[12px]">
                        {cropMaster.find(c => c.id === cycle.cropId)?.name || '—'} · Sown {cycle.sowDate}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            )}

            <div className="grid grid-cols-2 gap-2">
              <FRow label={`Qty (${selected.unit})`}>
                <input type="number" className={`finput ${qtyOverStock ? 'border-[#E24B4A]' : ''}`}
                  placeholder="0" value={form.qty || ''} onChange={e => f('qty', e.target.value)} />
                {qtyOverStock && <p className="text-xs text-[#E24B4A] mt-1">✗ Max {selected.currentStock} {selected.unit}</p>}
                {!qtyOverStock && issueQty > 0 && <p className="text-xs text-[var(--c-faint)] mt-1">After: {stockAfter} {selected.unit}</p>}
              </FRow>
              <FRow label="Date">
                <input type="date" className="finput" value={form.date || ''} onChange={e => f('date', e.target.value)} style={{ colorScheme: 'dark' }} />
              </FRow>
            </div>

            <FRow label="Purpose">
              <input className="finput" placeholder="e.g. Top dressing, basal dose" value={form.purpose || ''} onChange={e => f('purpose', e.target.value)} />
            </FRow>

            {issueQty > 0 && !qtyOverStock && (
              <div className="bg-[#8A9A5B]/10 border border-[#8A9A5B]/20 rounded-xl px-3 py-2 space-y-1">
                <div className="flex items-center justify-between">
                  <p className="text-xs text-[var(--c-sub)]">Total cost ({issueQty} × ₹{selected.costPerUnit})</p>
                  <p className="text-base font-bold text-[#8A9A5B]">₹{(issueQty * selected.costPerUnit).toLocaleString()}</p>
                </div>
                {selectedPlotObjs.length > 1 && plotSplit.map(({ plot, splitQty }) => (
                  <div key={plot.id} className="flex items-center justify-between">
                    <p className="text-[12px] text-[var(--c-muted)]">{plot.name} ({plot.area_acres}ac)</p>
                    <p className="text-[12px] font-semibold text-[var(--c-text)]">{splitQty} {selected.unit} · ₹{Math.round(splitQty * selected.costPerUnit).toLocaleString()}</p>
                  </div>
                ))}
              </div>
            )}

            <button onClick={confirmIssue}
              disabled={saving || qtyOverStock || !issueQty || selected.currentStock === 0}
              className="w-full py-3 bg-[#8A9A5B] text-[var(--c-text)] text-sm font-bold rounded-xl disabled:opacity-40">
              {saving ? 'Saving…' : 'Confirm Issue'}
            </button>
          </div>
        </Modal>
      )}

      {toast && (
        <div className={`fixed bottom-24 left-4 right-4 px-4 py-3 rounded-2xl text-sm font-medium text-white shadow-xl z-50 flex items-center gap-2 ${toastType === 'warn' ? 'bg-[#BA7517]' : 'bg-[#8A9A5B]'}`}>
          {toastType === 'warn' ? <AlertTriangle size={16} /> : <CheckCircle2 size={16} />} {toast}
        </div>
      )}

      <style>{`.finput{width:100%;background:var(--c-input);border:1px solid var(--c-border-md);border-radius:12px;padding:10px 14px;color:var(--c-text);font-size:14px;outline:none;}.finput:focus{border-color:#8A9A5B;}.no-scrollbar::-webkit-scrollbar{display:none;}.no-scrollbar{-ms-overflow-style:none;scrollbar-width:none;}`}</style>
    </div>
  )
}

// ── Purchase Logs ─────────────────────────────────────────────────────────────
function PurchaseLogs({ purchases, inventoryMaster }) {
  const [vendorFilter, setVendorFilter] = useState('')
  const [from,         setFrom]         = useState('')
  const [to,           setTo]           = useState('')
  const [showFilter,   setShowFilter]   = useState(false)

  const filtered = purchases.filter(p => {
    if (vendorFilter && !p.vendor.toLowerCase().includes(vendorFilter.toLowerCase())) return false
    if (from && p.date < from) return false
    if (to   && p.date > to)   return false
    return true
  })
  const total = filtered.reduce((s, p) => s + p.totalCost, 0)

  // Group by billId; standalone entries (no billId) shown individually
  const groups = []
  const seenBills = new Set()
  for (const p of filtered) {
    if (!p.billId) {
      groups.push({ type: 'single', sortDate: p.date, purchase: p })
    } else if (!seenBills.has(p.billId)) {
      seenBills.add(p.billId)
      const billItems = filtered.filter(x => x.billId === p.billId)
      groups.push({
        type: 'bill', sortDate: p.date,
        billId: p.billId, date: p.date, vendor: p.vendor,
        // Every line of a bill is written in the same insert, so any one of them
        // carries the moment the bill was typed in.
        entryDate: p.entryDate,
        invoiceNo: p.invoiceNo, billFileUrl: p.billFileUrl,
        items: billItems,
        billTotal: billItems.reduce((s, x) => s + x.totalCost, 0),
      })
    }
  }
  groups.sort((a, b) => b.sortDate.localeCompare(a.sortDate))

  const downloadCSV = () => {
    const rows = [
      // Bill Date and Entered are separate columns so the owner can sort on the
      // gap in Excel — that is how the July-filed-as-August batch was found.
      ['Bill Date','Entered','Item','Category','Qty','Unit','Rate','Total','Vendor','Invoice No'],
      ...filtered.map(p => {
        const item = inventoryMaster.find(i => i.id === p.itemId)
        return [p.date, (p.entryDate || '').slice(0, 10),
                item?.name || '', item ? CAT_LABEL[item.category] || '' : '',
                p.qty, item?.unit || '', p.unitPrice, p.totalCost, p.vendor, p.invoiceNo || '']
      }),
    ]
    const csv = rows.map(r => r.map(v => `"${String(v).replace(/"/g,'""')}"`).join(',')).join('\n')
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }))
    a.download = `purchases_${new Date().toISOString().slice(0,10)}.csv`
    a.click()
  }

  return (
    <div className="flex-1 flex flex-col min-h-0">
      <div className="px-4 pt-3 pb-2 shrink-0 space-y-2">
        {/* One box: the total, with the filter and the download inside it. New
            Bill is gone from here — stock only arrives on a bill, so the add
            door is the "New Purchase" button on Current Stock. */}
        <SummaryBox
          label={`Total (${filtered.length} ${filtered.length === 1 ? 'row' : 'rows'})`}
          value={`₹${total.toLocaleString()}`}
          actions={[
            { icon: Filter,   label: 'Filter',        onClick: () => setShowFilter(f => !f),
              active: showFilter || !!(vendorFilter || from || to) },
            { icon: Download, label: 'Download CSV',  onClick: downloadCSV },
          ]} />
        {showFilter && (
          <div className="bg-[var(--c-nav)] rounded-2xl border border-[var(--c-border)] p-3 space-y-2">
            <FRow label="Vendor">
              <input className="finput text-xs" placeholder="Search vendor" value={vendorFilter}
                onChange={e => setVendorFilter(e.target.value)} style={{ padding: '8px 10px' }} />
            </FRow>
            <div className="grid grid-cols-2 gap-2">
              <FRow label="From"><input type="date" className="finput text-xs" value={from} onChange={e => setFrom(e.target.value)} style={{ colorScheme: 'dark', padding: '8px 10px' }} /></FRow>
              <FRow label="To">  <input type="date" className="finput text-xs" value={to}   onChange={e => setTo(e.target.value)}   style={{ colorScheme: 'dark', padding: '8px 10px' }} /></FRow>
            </div>
            {(vendorFilter || from || to) && (
              <button onClick={() => { setVendorFilter(''); setFrom(''); setTo('') }}
                className="text-[12px] text-[#E24B4A] hover:underline">Clear filters</button>
            )}
          </div>
        )}
      </div>

      <div className="flex-1 overflow-y-auto px-4 space-y-3 pb-4">
        {groups.length === 0 && <p className="text-center text-[var(--c-faint)] text-sm py-8">No purchases found.</p>}
        {groups.map((g, gi) => {
          if (g.type === 'bill') {
            return (
              <div key={g.billId} className="bg-[var(--c-nav)] rounded-2xl border border-[var(--c-border)] overflow-hidden">
                {/* Bill header */}
                <div className="px-4 py-3 border-b border-[var(--c-border)] flex items-start justify-between"
                  style={{ background: '#8A9A5B08' }}>
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-bold text-[var(--c-text)]">{g.vendor}</p>
                      <span className="text-[11px] font-bold px-1.5 py-0.5 rounded bg-[#8A9A5B]/15 text-[#8A9A5B]">
                        BILL · {g.items.length} items
                      </span>
                    </div>
                    <div className="flex gap-3 mt-0.5 flex-wrap">
                      <p className="text-[12px] text-[var(--c-faint)]">{billRef(g.invoiceNo, g.date)}</p>
                      {entryDiffers(g.date, g.entryDate) && (
                        <p className="text-[12px]" style={{ color: '#BA7517' }}
                          title="The bill carries a different date from the day it was entered">
                          entered {fmtBillDate(g.entryDate)}
                        </p>
                      )}
                      {g.billFileUrl && (
                        <Attachment variant="chip" value={g.billFileUrl} icon="📎" name="View bill" />
                      )}
                    </div>
                  </div>
                  <p className="text-base font-bold text-[var(--c-text)]">₹{g.billTotal.toLocaleString()}</p>
                </div>
                {/* Line items */}
                <div className="divide-y divide-[var(--c-border)]">
                  {g.items.map(p => {
                    const item = inventoryMaster.find(i => i.id === p.itemId)
                    return (
                      <div key={p.id} className="px-4 py-2.5 flex items-center justify-between">
                        <div>
                          <p className="text-xs font-medium text-[var(--c-text)]">{item?.name || '—'}</p>
                          <p className="text-[12px] text-[var(--c-muted)]">{p.qty} {item?.unit} @ ₹{p.unitPrice}</p>
                        </div>
                        <p className="text-sm font-semibold text-[var(--c-text)]">₹{p.totalCost.toLocaleString()}</p>
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          }
          // standalone (no bill_id)
          const p    = g.purchase
          const item = inventoryMaster.find(i => i.id === p.itemId)
          return (
            <div key={p.id} className="bg-[var(--c-nav)] rounded-2xl border border-[var(--c-border)] p-4">
              <div className="flex items-start justify-between">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-[var(--c-text)]">{item?.name || '—'}</p>
                  <p className="text-xs text-[var(--c-muted)] mt-0.5">{p.vendor}</p>
                  <div className="flex flex-wrap gap-x-3 mt-0.5">
                    <p className="text-[12px] text-[var(--c-faint)]">{billRef(p.invoiceNo, p.invoiceDate || p.date)}</p>
                    {entryDiffers(p.invoiceDate || p.date, p.entryDate) && (
                      <p className="text-[12px]" style={{ color: '#BA7517' }}
                        title="The bill carries a different date from the day it was entered">
                        entered {fmtBillDate(p.entryDate)}
                      </p>
                    )}
                  </div>
                  {p.billImagePath && (
                    <div className="mt-0.5">
                      <Attachment variant="chip" value={p.billImagePath} icon="📎" name="View bill" />
                    </div>
                  )}
                </div>
                <div className="text-right shrink-0 ml-3">
                  <p className="text-base font-bold text-[var(--c-text)]">₹{p.totalCost.toLocaleString()}</p>
                  <p className="text-[12px] text-[var(--c-muted)]">{p.qty} {item?.unit} @ ₹{p.unitPrice}</p>
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── Issue Logs ────────────────────────────────────────────────────────────────
function IssueLogs({ issues, inventoryMaster, plots }) {
  const [itemFilter,  setItemFilter]  = useState('')
  const [plotFilter,  setPlotFilter]  = useState('')
  const [stageFilter, setStageFilter] = useState('')
  const [from,        setFrom]        = useState('')
  const [to,          setTo]          = useState('')
  const [showFilter,  setShowFilter]  = useState(false)

  const filtered = issues.filter(i => {
    if (itemFilter  && i.itemId  !== itemFilter)  return false
    if (plotFilter  && i.plotId  !== plotFilter)  return false
    if (stageFilter && i.stage   !== stageFilter) return false
    if (from && i.date < from) return false
    if (to   && i.date > to)   return false
    return true
  })
  const total = filtered.reduce((s, i) => s + i.totalCost, 0)

  const STAGE_LABEL = { active: 'Active Cycle', preparation: 'Preparation', farm_wide: 'Farm-wide' }
  const STAGE_COLOR = { active: '#8A9A5B', preparation: '#BA7517', farm_wide: '#4169E1' }

  const downloadCSV = () => {
    const rows = [
      ['Date','Item','Category','Qty','Unit','WAC at Issue','Total Cost','Plot','Stage','Purpose'],
      ...filtered.map(i => {
        const item = inventoryMaster.find(x => x.id === i.itemId)
        const plot = plots.find(p => p.id === i.plotId)
        return [i.date, item?.name || '', item ? CAT_LABEL[item.category] || '' : '',
                i.qty, item?.unit || '', i.unitCost, i.totalCost,
                plot?.name || i.plotLabel || '', STAGE_LABEL[i.stage] || i.stage, i.purpose || '']
      }),
    ]
    const csv = rows.map(r => r.map(v => `"${String(v).replace(/"/g,'""')}"`).join(',')).join('\n')
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }))
    a.download = `issues_${new Date().toISOString().slice(0,10)}.csv`
    a.click()
  }

  return (
    <div className="flex-1 flex flex-col min-h-0">
      <div className="px-4 pt-3 pb-2 shrink-0 space-y-2">
        {/* Same box as Purchase History, in the issues' blue */}
        <SummaryBox tone="#4169E1"
          label={`Total issued (${filtered.length} ${filtered.length === 1 ? 'record' : 'records'})`}
          value={`₹${total.toLocaleString()}`}
          actions={[
            { icon: Filter,   label: 'Filter',       onClick: () => setShowFilter(f => !f),
              active: showFilter || !!(itemFilter || plotFilter || stageFilter || from || to) },
            { icon: Download, label: 'Download CSV', onClick: downloadCSV },
          ]} />
        {showFilter && (
          <div className="bg-[var(--c-nav)] rounded-2xl border border-[var(--c-border)] p-3 space-y-2">
            <div className="grid grid-cols-2 gap-2">
              <FRow label="Item">
                <SelectField className="finput text-xs" value={itemFilter} onChange={e => setItemFilter(e.target.value)} style={{ background: 'var(--c-surface)', padding: '8px 10px' }}>
                  <option value="" style={{ background: 'var(--c-surface)' }}>All items</option>
                  {inventoryMaster.map(i => <option key={i.id} value={i.id} style={{ background: 'var(--c-surface)' }}>{i.name}</option>)}
                </SelectField>
              </FRow>
              <FRow label="Plot">
                <SelectField className="finput text-xs" value={plotFilter} onChange={e => setPlotFilter(e.target.value)} style={{ background: 'var(--c-surface)', padding: '8px 10px' }}>
                  <option value="" style={{ background: 'var(--c-surface)' }}>All plots</option>
                  {plots.map(p => <option key={p.id} value={p.id} style={{ background: 'var(--c-surface)' }}>{p.name}</option>)}
                </SelectField>
              </FRow>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <FRow label="Stage">
                <SelectField className="finput text-xs" value={stageFilter} onChange={e => setStageFilter(e.target.value)} style={{ background: 'var(--c-surface)', padding: '8px 10px' }}>
                  <option value="" style={{ background: 'var(--c-surface)' }}>All stages</option>
                  <option value="active"      style={{ background: 'var(--c-surface)' }}>Active Cycle</option>
                  <option value="preparation" style={{ background: 'var(--c-surface)' }}>Preparation</option>
                  <option value="farm_wide"   style={{ background: 'var(--c-surface)' }}>Farm-wide</option>
                </SelectField>
              </FRow>
              <FRow label="From"><input type="date" className="finput text-xs" value={from} onChange={e => setFrom(e.target.value)} style={{ colorScheme: 'dark', padding: '8px 10px' }} /></FRow>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <FRow label="To"><input type="date" className="finput text-xs" value={to} onChange={e => setTo(e.target.value)} style={{ colorScheme: 'dark', padding: '8px 10px' }} /></FRow>
              <div />
            </div>
            {(itemFilter || plotFilter || stageFilter || from || to) && (
              <button onClick={() => { setItemFilter(''); setPlotFilter(''); setStageFilter(''); setFrom(''); setTo('') }}
                className="text-[12px] text-[#E24B4A] hover:underline">Clear filters</button>
            )}
          </div>
        )}
      </div>

      <div className="flex-1 overflow-y-auto px-4 space-y-2 pb-4">
        {filtered.length === 0 && <p className="text-center text-[var(--c-faint)] text-sm py-8">No issue records found.</p>}
        {filtered.map(i => {
          const item  = inventoryMaster.find(x => x.id === i.itemId)
          const color = STAGE_COLOR[i.stage] || '#888'
          return (
            <div key={i.id} className="bg-[var(--c-nav)] rounded-2xl border border-[var(--c-border)] p-4">
              <div className="flex items-start justify-between">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-sm font-semibold text-[var(--c-text)]">{item?.name || '—'}</p>
                    <span className="text-[11px] font-bold px-1.5 py-0.5 rounded"
                      style={{ background: color + '20', color }}>
                      {STAGE_LABEL[i.stage] || i.stage}
                    </span>
                  </div>
                  <p className="text-xs text-[var(--c-muted)] mt-0.5">{i.plotLabel || '—'}</p>
                  <p className="text-[12px] text-[var(--c-faint)] mt-0.5">{i.date}</p>
                  {i.purpose && <p className="text-[12px] text-[var(--c-muted)] mt-0.5 italic">{i.purpose}</p>}
                </div>
                <div className="text-right shrink-0 ml-3">
                  <p className="text-base font-bold text-[var(--c-text)]">₹{i.totalCost.toLocaleString()}</p>
                  <p className="text-[12px] text-[var(--c-muted)]">{i.qty} {item?.unit}</p>
                  <p className="text-[12px] text-[var(--c-faint)]">@ ₹{i.unitCost}/{item?.unit}</p>
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── Shared ────────────────────────────────────────────────────────────────────
function Modal({ title, onClose, children }) {
  useBackClose(onClose)   // one hook here covers every modal on this page

  return (
    <div className="fixed inset-0 z-50 flex items-end" style={{ background: 'rgba(0,0,0,0.7)' }} onClick={onClose}>
      <div className="w-full bg-[var(--c-nav)] rounded-t-3xl p-5 max-h-[92vh] overflow-y-auto border-t border-[var(--c-border-md)]"
        onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-bold text-[var(--c-text)]">{title}</h3>
          <button onClick={onClose} className="text-[var(--c-muted)] hover:text-[var(--c-text)]"><X size={18} /></button>
        </div>
        {children}
      </div>
    </div>
  )
}

function FRow({ label, children }) {
  return <div><label className="text-xs font-medium text-[var(--c-sub)] block mb-1.5">{label}</label>{children}</div>
}

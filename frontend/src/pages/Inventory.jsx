import React, { useState, useRef } from 'react'
import { format } from 'date-fns'
import { Plus, X, CheckCircle2, AlertTriangle, Package, Trash2, Receipt, FileText, Download, Filter } from 'lucide-react'
import FilePicker from '../components/FilePicker'
import { useAppStore } from '../store'
import { supabase } from '../lib/supabase'

const TODAY_STR = new Date().toISOString().slice(0, 10)
const CATS      = ['seed', 'fertilizer', 'chemical', 'fuel', 'other']
const CAT_LABEL = { seed: 'Seeds', fertilizer: 'Fertilizers', chemical: 'Chemicals', fuel: 'Fuel', other: 'Other' }
const CAT_EMOJI = { seed: '🌾', fertilizer: '🧪', chemical: '🧴', fuel: '⛽', other: '📦' }

const TABS = [
  { key: 'items',    label: 'Current Stock', Icon: Package  },
  { key: 'purchase', label: 'Purchases',     Icon: Receipt  },
  { key: 'issue',    label: 'Issues',        Icon: FileText },
]

export default function Inventory() {
  const {
    inventoryMaster, purchases, issues, plots, cropCycles, cropMaster,
    machineryMaster,
    recordPurchase, issueItem,
  } = useAppStore()

  const [tab,       setTab]       = useState('items')
  const [catFilter, setCat]       = useState('all')
  const [modal,     setModal]     = useState(null)   // 'purchase' | 'issue'
  const [selected,  setSelected]  = useState(null)   // inventory item
  const [form,      setForm]      = useState({})
  const [toast,     setToast]     = useState(null)
  const [toastType, setToastType] = useState('success')
  const [saving,    setSaving]    = useState(false)
  const [billFile, setBillFile] = useState(null)

  const showToast = (msg, type = 'success') => {
    setToast(msg); setToastType(type); setTimeout(() => setToast(null), 3500)
  }
  const f = (k, v) => setForm(p => ({ ...p, [k]: v }))

  const openPurchase = async (item) => {
    setBillFile(null)
    setForm({ qty: '', unitPrice: item.costPerUnit || '', vendor: '', invoiceNo: '', invoiceDate: TODAY_STR })
    setModal('purchase')
    // Fetch live stock + WAC from DB so preview is always accurate
    const { data } = await supabase.from('inventory_items')
      .select('current_stock, cost_per_unit').eq('id', item.id).single()
    if (data) {
      setSelected({ ...item, currentStock: Number(data.current_stock), costPerUnit: Number(data.cost_per_unit) })
      setForm(p => ({ ...p, unitPrice: Number(data.cost_per_unit) || '' }))
    } else {
      setSelected(item)
    }
  }
  const openIssue = async (item) => {
    setForm({ qty: '', purpose: '', plotIds: [], date: TODAY_STR, machineryId: '' })
    setModal('issue')
    // Fetch live stock from DB
    const { data } = await supabase.from('inventory_items')
      .select('current_stock, cost_per_unit').eq('id', item.id).single()
    setSelected(data
      ? { ...item, currentStock: Number(data.current_stock), costPerUnit: Number(data.cost_per_unit) }
      : item
    )
  }

  // ── Issue: multi-plot split by area ────────────────────────────────────────
  const issueQty         = parseFloat(form.qty) || 0
  const stockAfter       = (selected?.currentStock || 0) - issueQty
  const qtyOverStock     = issueQty > (selected?.currentStock || 0)
  const selectedPlotObjs = plots.filter(p => (form.plotIds || []).includes(p.id))
  const totalArea        = selectedPlotObjs.reduce((s, p) => s + (Number(p.area_acres) || 1), 0)
  const plotSplit        = selectedPlotObjs.map(p => {
    const area    = Number(p.area_acres) || 1
    const splitQty = totalArea > 0 ? Math.round(issueQty * (area / totalArea) * 100) / 100 : issueQty
    const cycle   = cropCycles.find(c => c.plotId === p.id && c.status === 'active')
    return { plot: p, area, splitQty, cycle, stage: cycle ? 'active' : 'preparation' }
  })
  const newWACPreview = (() => {
    if (!form.qty || !form.unitPrice || !selected) return null
    const qty = parseFloat(form.qty), price = parseFloat(form.unitPrice)
    const old  = selected.currentStock * selected.costPerUnit
    const total = old + qty * price
    return Math.round(total / (selected.currentStock + qty) * 100) / 100
  })()

  const confirmPurchase = async () => {
    const qty = parseFloat(form.qty), unitPrice = parseFloat(form.unitPrice)
    if (!qty || !unitPrice || !form.vendor) return showToast('Fill qty, price and vendor', 'warn')
    setSaving(true)
    try {
      let billImagePath = null
      if (billFile) {
        const ext  = billFile.name.split('.').pop()
        const path = `inventory-docs/${selected.id}/${Date.now()}.${ext}`
        const { error: upErr } = await supabase.storage.from('farm-photos').upload(path, billFile)
        if (!upErr) billImagePath = path
      }
      await recordPurchase({
        itemId: selected.id, date: form.invoiceDate || TODAY_STR,
        invoiceDate: form.invoiceDate || null,
        qty, unitPrice, vendor: form.vendor,
        invoiceNo: form.invoiceNo || '', billImagePath,
      })
      showToast(`Purchased ${qty} ${selected.unit} of ${selected.name}`)
      setModal(null)
    } catch (e) { showToast('Save failed: ' + e.message, 'warn') }
    setSaving(false)
  }

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

  const items = catFilter === 'all' ? inventoryMaster : inventoryMaster.filter(i => i.category === catFilter)

  return (
    <div className="h-full flex flex-col bg-[var(--c-bg)]">

      {/* Tab bar */}
      <div className="flex border-b border-[var(--c-border)] bg-[var(--c-nav)] shrink-0">
        {TABS.map(({ key, label, Icon }) => (
          <button key={key} onClick={() => setTab(key)}
            className={`flex-1 py-3 flex flex-col items-center gap-0.5 text-[10px] font-semibold transition-colors
              ${tab === key ? 'text-[#1D9E75] border-b-2 border-[#1D9E75]' : 'text-[var(--c-muted)]'}`}>
            <Icon size={16} />{label}
          </button>
        ))}
      </div>

      {/* ── ITEMS ── */}
      {tab === 'items' && (
        <div className="flex-1 flex flex-col min-h-0">
          <div className="px-4 pt-3 pb-1 shrink-0">
            <div className="bg-[#1D9E75]/10 border border-[#1D9E75]/20 rounded-xl px-4 py-2.5 flex items-center justify-between">
              <p className="text-xs text-[var(--c-sub)]">Total stock value ({inventoryMaster.length} items)</p>
              <p className="text-lg font-bold text-[#1D9E75]">
                ₹{(inventoryMaster.reduce((s, i) => s + (i.currentStock || 0) * (i.costPerUnit || 0), 0) / 1000).toFixed(1)}K
              </p>
            </div>
          </div>
          <div className="flex gap-2 px-4 py-2 overflow-x-auto no-scrollbar shrink-0 bg-[var(--c-nav)]">
            <Chip active={catFilter === 'all'} onClick={() => setCat('all')}>All</Chip>
            {CATS.map(c => (
              <Chip key={c} active={catFilter === c} onClick={() => setCat(c)}>
                {CAT_EMOJI[c]} {CAT_LABEL[c]}
              </Chip>
            ))}
          </div>
          <div className="flex-1 overflow-y-auto p-4 space-y-2 pb-4">
            {items.map(item => {
              const isOut = item.currentStock === 0
              const isLow = item.minThreshold > 0 && item.currentStock > 0 && item.currentStock < item.minThreshold
              return (
                <div key={item.id}
                  className={`bg-[var(--c-nav)] rounded-2xl border p-4 ${isOut ? 'border-[#E24B4A]/40' : isLow ? 'border-[#BA7517]/35' : 'border-[var(--c-border)]'}`}>
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <p className="text-sm font-semibold text-[var(--c-text)]">{item.name}</p>
                      <p className="text-[10px] text-[var(--c-muted)] mt-0.5">
                        {CAT_LABEL[item.category]} · WAC ₹{item.costPerUnit}/{item.unit}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className={`text-2xl font-bold ${isOut ? 'text-[#E24B4A]' : isLow ? 'text-[#BA7517]' : 'text-[var(--c-text)]'}`}>
                        {item.currentStock}
                      </p>
                      <p className="text-[10px] text-[var(--c-faint)]">{item.unit}</p>
                      {isLow && <p className="text-[10px] text-[#BA7517]">⚠ Low (min {item.minThreshold})</p>}
                      {isOut && <p className="text-[10px] text-[#E24B4A] font-semibold">✗ Out of stock</p>}
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => openPurchase(item)}
                      className="flex-1 py-2 text-xs font-medium rounded-xl bg-[var(--c-ghost)] hover:bg-white/15 text-[var(--c-text)] border border-[var(--c-border-md)] flex items-center justify-center gap-1">
                      <Plus size={11} /> Purchase
                    </button>
                    <button onClick={() => openIssue(item)} disabled={isOut}
                      className="flex-1 py-2 text-xs font-semibold rounded-xl border flex items-center justify-center gap-1 disabled:opacity-30"
                      style={{ background: '#1D9E7518', borderColor: '#1D9E7540', color: '#1D9E75' }}>
                      → Issue to Plot
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* ── PURCHASE LOGS ── */}
      {tab === 'purchase' && (
        <PurchaseLogs purchases={purchases} inventoryMaster={inventoryMaster} />
      )}

      {/* ── ISSUE LOGS ── */}
      {tab === 'issue' && (
        <IssueLogs issues={issues} inventoryMaster={inventoryMaster} plots={plots} />
      )}

      {/* ── PURCHASE MODAL ── */}
      {modal === 'purchase' && selected && (
        <Modal title={`Purchase — ${selected.name}`} onClose={() => setModal(null)}>
          <div className="space-y-3">
            <div className="bg-[var(--c-card)] rounded-xl px-3 py-2 text-xs text-[var(--c-sub)]">
              Current stock: <span className="text-[var(--c-text)] font-semibold">{selected.currentStock} {selected.unit}</span>
              {' '}· WAC: <span className="text-[var(--c-text)] font-semibold">₹{selected.costPerUnit}/{selected.unit}</span>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <FRow label="Invoice Date">
                <input type="date" className="finput" value={form.invoiceDate || ''} onChange={e => f('invoiceDate', e.target.value)} style={{ colorScheme: 'dark' }} />
              </FRow>
              <FRow label="Invoice No.">
                <input className="finput" placeholder="optional" value={form.invoiceNo || ''} onChange={e => f('invoiceNo', e.target.value)} />
              </FRow>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <FRow label={`Qty (${selected.unit})`}>
                <input type="number" className="finput" placeholder="0" value={form.qty || ''} onChange={e => f('qty', e.target.value)} />
              </FRow>
              <FRow label="Rate/unit (₹)">
                <input type="number" className="finput" value={form.unitPrice || ''} onChange={e => f('unitPrice', e.target.value)} />
              </FRow>
            </div>

            {form.qty && form.unitPrice && (
              <div className="bg-[#1D9E75]/10 border border-[#1D9E75]/20 rounded-xl px-3 py-2 space-y-0.5">
                <div className="flex items-center justify-between">
                  <p className="text-xs text-[var(--c-sub)]">Total cost</p>
                  <p className="text-base font-bold text-[#1D9E75]">₹{(parseFloat(form.qty) * parseFloat(form.unitPrice)).toLocaleString()}</p>
                </div>
                {newWACPreview && (
                  <div className="flex items-center justify-between">
                    <p className="text-[10px] text-[var(--c-muted)]">New WAC after purchase</p>
                    <p className="text-[10px] font-semibold text-[#1D9E75]">₹{newWACPreview}/{selected.unit}</p>
                  </div>
                )}
              </div>
            )}

            <FRow label="Vendor Name">
              <input className="finput" placeholder="e.g. Ram Fertilizers" value={form.vendor || ''} onChange={e => f('vendor', e.target.value)} />
            </FRow>

            <FRow label="Bill / Invoice (photo or PDF)">
              <FilePicker accept="image/*,application/pdf" file={billFile} onFile={setBillFile} />
            </FRow>

            <p className="text-[10px] text-[var(--c-faint)]">Entry date recorded automatically on save.</p>

            <button onClick={confirmPurchase} disabled={saving}
              className="w-full py-3 bg-[#1D9E75] text-[var(--c-text)] text-sm font-bold rounded-xl disabled:opacity-40">
              {saving ? 'Saving…' : 'Confirm Purchase'}
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

            {/* Multi-plot chip picker */}
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
                        sel ? 'bg-[#1D9E75]/20 border-[#1D9E75]/50 text-[#1D9E75]' : 'border-[var(--c-border-md)] text-[var(--c-muted)]'
                      }`}>
                      {p.name}{p.area_acres ? ` · ${p.area_acres}ac` : ''}
                    </button>
                  )
                })}
              </div>
              {(form.plotIds || []).length === 0 && (
                <p className="text-[10px] text-[var(--c-faint)] mt-1.5">No plots selected — will be recorded as General Use</p>
              )}
            </FRow>

            {/* Machine picker — shown only for fuel items */}
            {selected.category === 'fuel' && (
              <FRow label="Machine (for diesel tracking)">
                <select className="finput" value={form.machineryId || ''} onChange={e => f('machineryId', e.target.value)} style={{ background: 'var(--c-surface)' }}>
                  <option value="" style={{ background: 'var(--c-surface)' }}>No machine / general</option>
                  {(machineryMaster || []).filter(m => m.requiresDiesel).map(m => (
                    <option key={m.id} value={m.id} style={{ background: 'var(--c-surface)' }}>
                      {m.displayId} · {m.name}{m.regNo ? ` (${m.regNo})` : ''}
                    </option>
                  ))}
                </select>
              </FRow>
            )}

            {/* Per-plot cycle status */}
            {selectedPlotObjs.length > 0 && (
              <div className="space-y-1.5">
                {plotSplit.map(({ plot, area, cycle, stage }) => (
                  <div key={plot.id} className={`rounded-xl px-3 py-2 text-xs border ${stage === 'active' ? 'bg-[#1D9E75]/10 border-[#1D9E75]/30' : 'bg-[#BA7517]/10 border-[#BA7517]/30'}`}>
                    <div className="flex items-center justify-between">
                      <p className="font-semibold" style={{ color: stage === 'active' ? '#1D9E75' : '#BA7517' }}>
                        {plot.name} · {area}ac
                      </p>
                      <span className="text-[9px] font-bold px-1.5 py-0.5 rounded" style={{ background: (stage === 'active' ? '#1D9E75' : '#BA7517') + '25', color: stage === 'active' ? '#1D9E75' : '#BA7517' }}>
                        {stage === 'active' ? 'Active cycle' : 'Preparation'}
                      </span>
                    </div>
                    {cycle && (
                      <p className="text-[var(--c-sub)] mt-0.5 text-[10px]">
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
              <div className="bg-[#1D9E75]/10 border border-[#1D9E75]/20 rounded-xl px-3 py-2 space-y-1">
                <div className="flex items-center justify-between">
                  <p className="text-xs text-[var(--c-sub)]">Total cost ({issueQty} × ₹{selected.costPerUnit})</p>
                  <p className="text-base font-bold text-[#1D9E75]">₹{(issueQty * selected.costPerUnit).toLocaleString()}</p>
                </div>
                {selectedPlotObjs.length > 1 && plotSplit.map(({ plot, splitQty }) => (
                  <div key={plot.id} className="flex items-center justify-between">
                    <p className="text-[10px] text-[var(--c-muted)]">{plot.name} ({plot.area_acres}ac)</p>
                    <p className="text-[10px] font-semibold text-[var(--c-text)]">{splitQty} {selected.unit} · ₹{Math.round(splitQty * selected.costPerUnit).toLocaleString()}</p>
                  </div>
                ))}
              </div>
            )}

            <p className="text-[10px] text-[var(--c-faint)]">Entry date recorded automatically on save.</p>

            <button onClick={confirmIssue}
              disabled={saving || qtyOverStock || !issueQty || selected.currentStock === 0}
              className="w-full py-3 bg-[#1D9E75] text-[var(--c-text)] text-sm font-bold rounded-xl disabled:opacity-40">
              {saving ? 'Saving…' : 'Confirm Issue'}
            </button>
          </div>
        </Modal>
      )}

      {toast && (
        <div className={`fixed bottom-24 left-4 right-4 px-4 py-3 rounded-2xl text-sm font-medium text-[var(--c-text)] shadow-xl z-50 flex items-center gap-2 ${toastType === 'warn' ? 'bg-[#BA7517]' : 'bg-[#1D9E75]'}`}>
          {toastType === 'warn' ? <AlertTriangle size={16} /> : <CheckCircle2 size={16} />} {toast}
        </div>
      )}

      <style>{`.finput{width:100%;background:var(--c-input);border:1px solid var(--c-border-md);border-radius:12px;padding:10px 14px;color:var(--c-text);font-size:14px;outline:none;}.finput:focus{border-color:#1D9E75;}.no-scrollbar::-webkit-scrollbar{display:none;}.no-scrollbar{-ms-overflow-style:none;scrollbar-width:none;}`}</style>
    </div>
  )
}

// ── Purchase Logs ─────────────────────────────────────────────────────────────
function PurchaseLogs({ purchases, inventoryMaster }) {
  const [itemFilter,  setItemFilter]  = useState('')
  const [vendorFilter,setVendorFilter]= useState('')
  const [from,        setFrom]        = useState('')
  const [to,          setTo]          = useState('')
  const [showFilter,  setShowFilter]  = useState(false)

  const filtered = purchases.filter(p => {
    if (itemFilter && p.itemId !== itemFilter) return false
    if (vendorFilter && !p.vendor.toLowerCase().includes(vendorFilter.toLowerCase())) return false
    if (from && p.date < from) return false
    if (to   && p.date > to)   return false
    return true
  })
  const total = filtered.reduce((s, p) => s + p.totalCost, 0)

  const downloadCSV = () => {
    const rows = [
      ['Date','Invoice Date','Item','Category','Qty','Unit','Rate','Total','Vendor','Invoice No','Entry Date'],
      ...filtered.map(p => {
        const item = inventoryMaster.find(i => i.id === p.itemId)
        return [
          p.date, p.invoiceDate || '', item?.name || '', item ? CAT_LABEL[item.category] || '' : '',
          p.qty, item?.unit || '', p.unitPrice, p.totalCost,
          p.vendor, p.invoiceNo || '', p.entryDate ? p.entryDate.slice(0,10) : '',
        ]
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
      {/* Summary + actions */}
      <div className="px-4 pt-3 pb-2 shrink-0 space-y-2">
        <div className="flex items-center gap-2">
          <div className="flex-1 bg-[#1D9E75]/10 border border-[#1D9E75]/20 rounded-xl px-3 py-2">
            <p className="text-[10px] text-[var(--c-muted)]">Total ({filtered.length} records)</p>
            <p className="text-lg font-bold text-[#1D9E75]">₹{total.toLocaleString()}</p>
          </div>
          <button onClick={() => setShowFilter(f => !f)}
            className="p-3 rounded-xl border border-[var(--c-border-md)] text-[var(--c-muted)] hover:text-[var(--c-text)] hover:border-white/30 transition-colors">
            <Filter size={16} />
          </button>
          <button onClick={downloadCSV}
            className="p-3 rounded-xl border border-[var(--c-border-md)] text-[var(--c-muted)] hover:text-[#1D9E75] hover:border-[#1D9E75]/40 transition-colors">
            <Download size={16} />
          </button>
        </div>
        {showFilter && (
          <div className="bg-[var(--c-nav)] rounded-2xl border border-[var(--c-border)] p-3 space-y-2">
            <div className="grid grid-cols-2 gap-2">
              <FRow label="Item">
                <select className="finput text-xs" value={itemFilter} onChange={e => setItemFilter(e.target.value)} style={{ background: 'var(--c-surface)', padding: '8px 10px' }}>
                  <option value="" style={{ background: 'var(--c-surface)' }}>All items</option>
                  {inventoryMaster.map(i => <option key={i.id} value={i.id} style={{ background: 'var(--c-surface)' }}>{i.name}</option>)}
                </select>
              </FRow>
              <FRow label="Vendor">
                <input className="finput text-xs" placeholder="Search vendor" value={vendorFilter} onChange={e => setVendorFilter(e.target.value)} style={{ padding: '8px 10px' }} />
              </FRow>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <FRow label="From"><input type="date" className="finput text-xs" value={from} onChange={e => setFrom(e.target.value)} style={{ colorScheme: 'dark', padding: '8px 10px' }} /></FRow>
              <FRow label="To">  <input type="date" className="finput text-xs" value={to}   onChange={e => setTo(e.target.value)}   style={{ colorScheme: 'dark', padding: '8px 10px' }} /></FRow>
            </div>
            {(itemFilter || vendorFilter || from || to) && (
              <button onClick={() => { setItemFilter(''); setVendorFilter(''); setFrom(''); setTo('') }}
                className="text-[10px] text-[#E24B4A] hover:underline">Clear filters</button>
            )}
          </div>
        )}
      </div>

      <div className="flex-1 overflow-y-auto px-4 space-y-2 pb-4">
        {filtered.length === 0 && <p className="text-center text-[var(--c-faint)] text-sm py-8">No purchases found.</p>}
        {filtered.map(p => {
          const item = inventoryMaster.find(i => i.id === p.itemId)
          return (
            <div key={p.id} className="bg-[var(--c-nav)] rounded-2xl border border-[var(--c-border)] p-4">
              <div className="flex items-start justify-between">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-[var(--c-text)]">{item?.name || '—'}</p>
                  <p className="text-xs text-[var(--c-muted)] mt-0.5">{p.vendor}</p>
                  <div className="flex flex-wrap gap-x-3 mt-0.5">
                    <p className="text-[10px] text-[var(--c-faint)]">Invoice: {p.invoiceDate || p.date}</p>
                    {p.invoiceNo && <p className="text-[10px] text-[var(--c-faint)]">#{p.invoiceNo}</p>}
                  </div>
                  {p.billImagePath && (
                    <p className="text-[10px] text-[#1D9E75] mt-0.5">📎 Bill attached</p>
                  )}
                </div>
                <div className="text-right shrink-0 ml-3">
                  <p className="text-base font-bold text-[var(--c-text)]">₹{p.totalCost.toLocaleString()}</p>
                  <p className="text-[10px] text-[var(--c-muted)]">{p.qty} {item?.unit} @ ₹{p.unitPrice}</p>
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
  const [itemFilter, setItemFilter] = useState('')
  const [plotFilter, setPlotFilter] = useState('')
  const [stageFilter,setStageFilter]= useState('')
  const [from,       setFrom]       = useState('')
  const [to,         setTo]         = useState('')
  const [showFilter, setShowFilter] = useState(false)

  const filtered = issues.filter(i => {
    if (itemFilter  && i.itemId   !== itemFilter)  return false
    if (plotFilter  && i.plotId   !== plotFilter)  return false
    if (stageFilter && i.stage    !== stageFilter) return false
    if (from && i.date < from) return false
    if (to   && i.date > to)   return false
    return true
  })
  const total = filtered.reduce((s, i) => s + i.totalCost, 0)

  const STAGE_LABEL = { active: 'Active Cycle', preparation: 'Preparation', farm_wide: 'Farm-wide' }
  const STAGE_COLOR = { active: '#1D9E75', preparation: '#BA7517', farm_wide: '#4169E1' }

  const downloadCSV = () => {
    const rows = [
      ['Date','Item','Category','Qty','Unit','WAC at Issue','Total Cost','Plot','Stage','Purpose','Entry Date'],
      ...filtered.map(i => {
        const item = inventoryMaster.find(x => x.id === i.itemId)
        const plot = plots.find(p => p.id === i.plotId)
        return [
          i.date, item?.name || '', item ? CAT_LABEL[item.category] || '' : '',
          i.qty, item?.unit || '', i.unitCost, i.totalCost,
          plot?.name || i.plotLabel || '', STAGE_LABEL[i.stage] || i.stage, i.purpose || '',
          i.entryDate ? String(i.entryDate).slice(0,10) : '',
        ]
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
        <div className="flex items-center gap-2">
          <div className="flex-1 bg-[#4169E1]/10 border border-[#4169E1]/20 rounded-xl px-3 py-2">
            <p className="text-[10px] text-[var(--c-muted)]">Total issued ({filtered.length} records)</p>
            <p className="text-lg font-bold text-[#4169E1]">₹{total.toLocaleString()}</p>
          </div>
          <button onClick={() => setShowFilter(f => !f)}
            className="p-3 rounded-xl border border-[var(--c-border-md)] text-[var(--c-muted)] hover:text-[var(--c-text)] transition-colors">
            <Filter size={16} />
          </button>
          <button onClick={downloadCSV}
            className="p-3 rounded-xl border border-[var(--c-border-md)] text-[var(--c-muted)] hover:text-[#4169E1] hover:border-[#4169E1]/40 transition-colors">
            <Download size={16} />
          </button>
        </div>
        {showFilter && (
          <div className="bg-[var(--c-nav)] rounded-2xl border border-[var(--c-border)] p-3 space-y-2">
            <div className="grid grid-cols-2 gap-2">
              <FRow label="Item">
                <select className="finput text-xs" value={itemFilter} onChange={e => setItemFilter(e.target.value)} style={{ background: 'var(--c-surface)', padding: '8px 10px' }}>
                  <option value="" style={{ background: 'var(--c-surface)' }}>All items</option>
                  {inventoryMaster.map(i => <option key={i.id} value={i.id} style={{ background: 'var(--c-surface)' }}>{i.name}</option>)}
                </select>
              </FRow>
              <FRow label="Plot">
                <select className="finput text-xs" value={plotFilter} onChange={e => setPlotFilter(e.target.value)} style={{ background: 'var(--c-surface)', padding: '8px 10px' }}>
                  <option value="" style={{ background: 'var(--c-surface)' }}>All plots</option>
                  {plots.map(p => <option key={p.id} value={p.id} style={{ background: 'var(--c-surface)' }}>{p.name}</option>)}
                </select>
              </FRow>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <FRow label="Stage">
                <select className="finput text-xs" value={stageFilter} onChange={e => setStageFilter(e.target.value)} style={{ background: 'var(--c-surface)', padding: '8px 10px' }}>
                  <option value="" style={{ background: 'var(--c-surface)' }}>All stages</option>
                  <option value="active"      style={{ background: 'var(--c-surface)' }}>Active Cycle</option>
                  <option value="preparation" style={{ background: 'var(--c-surface)' }}>Preparation</option>
                  <option value="farm_wide"   style={{ background: 'var(--c-surface)' }}>Farm-wide</option>
                </select>
              </FRow>
              <FRow label="From"><input type="date" className="finput text-xs" value={from} onChange={e => setFrom(e.target.value)} style={{ colorScheme: 'dark', padding: '8px 10px' }} /></FRow>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <FRow label="To"><input type="date" className="finput text-xs" value={to} onChange={e => setTo(e.target.value)} style={{ colorScheme: 'dark', padding: '8px 10px' }} /></FRow>
              <div />
            </div>
            {(itemFilter || plotFilter || stageFilter || from || to) && (
              <button onClick={() => { setItemFilter(''); setPlotFilter(''); setStageFilter(''); setFrom(''); setTo('') }}
                className="text-[10px] text-[#E24B4A] hover:underline">Clear filters</button>
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
                    <span className="text-[9px] font-bold px-1.5 py-0.5 rounded"
                      style={{ background: color + '20', color }}>
                      {STAGE_LABEL[i.stage] || i.stage}
                    </span>
                  </div>
                  <p className="text-xs text-[var(--c-muted)] mt-0.5">{i.plotLabel || '—'}</p>
                  <p className="text-[10px] text-[var(--c-faint)] mt-0.5">{i.date}</p>
                  {i.purpose && <p className="text-[10px] text-[var(--c-muted)] mt-0.5 italic">{i.purpose}</p>}
                </div>
                <div className="text-right shrink-0 ml-3">
                  <p className="text-base font-bold text-[var(--c-text)]">₹{i.totalCost.toLocaleString()}</p>
                  <p className="text-[10px] text-[var(--c-muted)]">{i.qty} {item?.unit}</p>
                  <p className="text-[10px] text-[var(--c-faint)]">@ ₹{i.unitCost}/{item?.unit}</p>
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
function Chip({ active, onClick, children }) {
  return (
    <button onClick={onClick}
      className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-medium border transition-colors
        ${active ? 'bg-[#1D9E75]/20 border-[#1D9E75]/50 text-[#1D9E75]' : 'border-[var(--c-border-md)] text-[var(--c-muted)]'}`}>
      {children}
    </button>
  )
}

function Modal({ title, onClose, children }) {
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

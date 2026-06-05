import React, { useState, useEffect, useMemo } from 'react'
import { Plus, X, CheckCircle2, AlertTriangle, Package, Users, Trash2, Receipt, Clock, TrendingUp } from 'lucide-react'
import { format } from 'date-fns'
import { useAppStore } from '../store'
import { supabase } from '../lib/supabase'

const TODAY_STR = new Date().toISOString().slice(0, 10)
const TODAY_LABEL = format(new Date(), 'EEEE, d MMMM yyyy')

const CATEGORIES = ['seed', 'fertilizer', 'chemical', 'fuel', 'other']
const CAT_LABEL  = { seed: 'Seeds', fertilizer: 'Fertilizers', chemical: 'Chemicals', fuel: 'Fuel', other: 'Other' }
const CAT_EMOJI  = { seed: '🌾', fertilizer: '🧪', chemical: '🧴', fuel: '⛽', other: '📦' }

const TABS = [
  { key: 'items',     label: 'Items',    Icon: Package },
  { key: 'purchases', label: 'Purchases', Icon: Receipt },
  { key: 'labour',    label: 'Labour',   Icon: Users   },
  { key: 'scrap',     label: 'Scrap',    Icon: Trash2  },
]

export default function Inventory() {
  const {
    inventoryMaster, purchases, issues, labourLogs, scrapSales,
    cropCycles, cropMaster, regularLabourers, contractualLabour,
    addInventoryItem, recordPurchase, issueItem, addScrapSale, logLabour,
  } = useAppStore()

  const [tab,        setTab]       = useState('items')
  const [catFilter,  setCat]       = useState('all')
  const [modal,      setModal]     = useState(null)
  const [selected,   setSelected]  = useState(null)
  const [form,       setForm]      = useState({})
  const [toast,      setToast]     = useState(null)
  const [toastType,  setToastType] = useState('success')
  const [saving,     setSaving]    = useState(false)

  const showToast = (msg, type = 'success') => {
    setToast(msg); setToastType(type)
    setTimeout(() => setToast(null), 3500)
  }
  const f = (k, v) => setForm(p => ({ ...p, [k]: v }))

  const openPurchase = (item) => {
    setSelected(item)
    setForm({ qty: '', unitPrice: item.costPerUnit || '', vendor: '', invoiceNo: '', notes: '', date: TODAY_STR })
    setModal('purchase')
  }
  const openIssue = (item) => {
    setSelected(item)
    setForm({ qty: '', purpose: '', cropCycleId: '', date: TODAY_STR })
    setModal('issue')
  }

  // ── Issue: real-time validation ───────────────────────────────────────────
  const issueQty      = parseFloat(form.qty) || 0
  const stockAfter    = (selected?.currentStock || 0) - issueQty
  const qtyOverStock  = issueQty > 0 && issueQty > (selected?.currentStock || 0)
  const stockWillLow  = !qtyOverStock && issueQty > 0 && stockAfter < (selected?.minThreshold || 0) && stockAfter >= 0

  // Detect if selected cycle's plot already has a DIFFERENT crop (for seed category warning)
  const selectedCycle = cropCycles.find(c => c.id === form.cropCycleId)
  const seedToActivePlot = selected?.category === 'seed' && selectedCycle
    ? `Note: ${selectedCycle.plotLabel} already has an active ${cropMaster.find(c => c.id === selectedCycle.cropId)?.name || ''} cycle. Seeds will be attributed to it.`
    : null

  const confirmNewItem = async () => {
    if (!form.name || !form.category || !form.unit) return showToast('Fill name, category and unit', 'warn')
    setSaving(true)
    try {
      await addInventoryItem({ name: form.name, category: form.category, unit: form.unit, minThreshold: parseFloat(form.minThreshold) || 0, costPerUnit: parseFloat(form.costPerUnit) || 0 })
      showToast('Item added'); setModal(null)
    } catch (e) { showToast('Save failed: ' + e.message, 'warn') }
    setSaving(false)
  }

  const confirmPurchase = async () => {
    const qty = parseFloat(form.qty), unitPrice = parseFloat(form.unitPrice)
    if (!qty || !unitPrice || !form.vendor || !selected) return showToast('Fill qty, price and vendor', 'warn')
    setSaving(true)
    try {
      await recordPurchase({ itemId: selected.id, date: form.date, qty, unitPrice, vendor: form.vendor, invoiceNo: form.invoiceNo || '', notes: form.notes || '' })
      showToast(`Purchased ${qty} ${selected.unit} of ${selected.name}`); setModal(null)
    } catch (e) { showToast('Save failed: ' + e.message, 'warn') }
    setSaving(false)
  }

  const confirmIssue = async () => {
    const qty = parseFloat(form.qty)
    if (!qty || qty <= 0)             return showToast('Enter a valid quantity', 'warn')
    if (!selected)                    return
    if (qty > selected.currentStock)  return showToast(`Only ${selected.currentStock} ${selected.unit} in stock — cannot over-issue`, 'warn')

    const cycleId = (form.cropCycleId && form.cropCycleId !== '__farm__') ? form.cropCycleId : null
    setSaving(true)
    try {
      await issueItem({ itemId: selected.id, date: form.date, qty, cropCycleId: cycleId, purpose: form.purpose || '' })
      showToast(`Issued ${qty} ${selected.unit} of ${selected.name}`); setModal(null)
    } catch (e) { showToast('Save failed: ' + e.message, 'warn') }
    setSaving(false)
  }

  const confirmScrap = async () => {
    if (!form.description || !form.qty || !form.rate) return showToast('Fill description, qty and rate', 'warn')
    addScrapSale({ description: form.description, date: form.date || TODAY_STR, qty: parseFloat(form.qty), unit: form.unit || 'units', rate: parseFloat(form.rate), total: parseFloat(form.qty) * parseFloat(form.rate), buyer: form.buyer || '' })
    showToast('Scrap sale recorded'); setModal(null)
  }

  const items = catFilter === 'all' ? inventoryMaster : inventoryMaster.filter(i => i.category === catFilter)
  const totalSpend    = purchases.reduce((s, p) => s + p.totalCost, 0)
  const totalLabour   = labourLogs.reduce((s, l) => s + l.totalCost, 0)
  const totalScrap    = scrapSales.reduce((s, sc) => s + sc.total, 0)

  return (
    <div className="h-full flex flex-col bg-[#0f1117]">

      {/* Tab bar */}
      <div className="flex border-b border-white/8 bg-[#161a23] shrink-0">
        {TABS.map(({ key, label, Icon }) => (
          <button key={key} onClick={() => setTab(key)}
            className={`flex-1 py-3 flex flex-col items-center gap-0.5 text-[10px] font-semibold transition-colors
              ${tab === key ? 'text-[#1D9E75] border-b-2 border-[#1D9E75]' : 'text-white/40'}`}>
            <Icon size={16} />{label}
          </button>
        ))}
      </div>

      {/* ── ITEMS TAB ── */}
      {tab === 'items' && (
        <div className="flex-1 flex flex-col min-h-0">
          <div className="flex gap-2 px-4 py-2 overflow-x-auto no-scrollbar shrink-0 bg-[#161a23]">
            <button onClick={() => setCat('all')} className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${catFilter === 'all' ? 'bg-[#1D9E75]/20 border-[#1D9E75]/50 text-[#1D9E75]' : 'border-white/10 text-white/40'}`}>All</button>
            {CATEGORIES.map(c => (
              <button key={c} onClick={() => setCat(c)} className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${catFilter === c ? 'bg-[#1D9E75]/20 border-[#1D9E75]/50 text-[#1D9E75]' : 'border-white/10 text-white/40'}`}>
                {CAT_EMOJI[c]} {CAT_LABEL[c]}
              </button>
            ))}
          </div>
          <div className="flex-1 overflow-y-auto p-4 space-y-2 pb-4">
            {items.map(item => {
              const isOut  = item.currentStock === 0
              const isLow  = item.minThreshold > 0 && item.currentStock > 0 && item.currentStock < item.minThreshold
              const border = isOut ? 'border-[#E24B4A]/40' : isLow ? 'border-[#BA7517]/35' : 'border-white/8'
              return (
                <div key={item.id} className={`bg-[#161a23] rounded-2xl border p-4 ${border}`}>
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <p className="text-sm font-semibold text-white">{item.name}</p>
                      <p className="text-[10px] text-white/35 mt-0.5">{CAT_LABEL[item.category]} · ₹{item.costPerUnit}/{item.unit}</p>
                    </div>
                    <div className="text-right">
                      <p className={`text-2xl font-bold ${isOut ? 'text-[#E24B4A]' : isLow ? 'text-[#BA7517]' : 'text-white'}`}>
                        {item.currentStock}
                      </p>
                      <p className="text-[10px] text-white/30">{item.unit}</p>
                      {isLow && <p className="text-[10px] text-[#BA7517]">⚠ Low (min {item.minThreshold})</p>}
                      {isOut && <p className="text-[10px] text-[#E24B4A] font-semibold">✗ Out of stock</p>}
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => openPurchase(item)} className="flex-1 py-2 text-xs font-medium rounded-xl bg-white/8 hover:bg-white/15 text-white border border-white/10 flex items-center justify-center gap-1">
                      <Plus size={11} /> Purchase
                    </button>
                    <button onClick={() => openIssue(item)}
                      disabled={isOut}
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

      {/* ── PURCHASES TAB ── */}
      {tab === 'purchases' && (
        <div className="flex-1 overflow-y-auto p-4 space-y-3 pb-4">
          <div className="bg-[#1D9E75]/10 border border-[#1D9E75]/20 rounded-2xl px-4 py-3">
            <p className="text-xs text-white/50">Total Purchased (all time)</p>
            <p className="text-2xl font-bold text-[#1D9E75]">₹{totalSpend.toLocaleString()}</p>
          </div>
          {purchases.map(p => {
            const item = inventoryMaster.find(i => i.id === p.itemId)
            return (
              <div key={p.id} className="bg-[#161a23] rounded-2xl border border-white/8 p-4">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-sm font-semibold text-white">{item?.name || 'Unknown item'}</p>
                    <p className="text-xs text-white/40 mt-0.5">{p.vendor}</p>
                    <p className="text-[10px] text-white/30 mt-0.5">{p.date} · {p.invoiceNo || 'No invoice'}</p>
                    {p.notes && <p className="text-[10px] text-white/25 mt-0.5 italic">{p.notes}</p>}
                  </div>
                  <div className="text-right">
                    <p className="text-base font-bold text-white">₹{p.totalCost.toLocaleString()}</p>
                    <p className="text-[10px] text-white/40">{p.qty} {item?.unit}</p>
                    <p className="text-[10px] text-white/30">@₹{p.unitPrice}/{item?.unit}</p>
                  </div>
                </div>
              </div>
            )
          })}
          {purchases.length === 0 && <p className="text-center text-white/30 text-sm py-8">No purchases recorded yet.</p>}
        </div>
      )}

      {/* ── LABOUR TAB ── */}
      {tab === 'labour' && (
        <LabourTab
          regularLabourers={regularLabourers}
          contractualLabour={contractualLabour}
          labourLogs={labourLogs}
          cropCycles={cropCycles}
          cropMaster={cropMaster}
          logLabour={logLabour}
          totalLabour={totalLabour}
          showToast={showToast}
        />
      )}

      {/* ── SCRAP TAB ── */}
      {tab === 'scrap' && (
        <div className="flex-1 overflow-y-auto p-4 space-y-3 pb-4">
          <div className="flex items-center justify-between">
            <div className="bg-[#1D9E75]/10 border border-[#1D9E75]/20 rounded-2xl px-4 py-3 flex-1 mr-3">
              <p className="text-xs text-white/50">Total Scrap Revenue</p>
              <p className="text-2xl font-bold text-[#1D9E75]">₹{totalScrap.toLocaleString()}</p>
            </div>
            <button onClick={() => { setForm({ date: TODAY_STR }); setModal('scrap') }}
              className="h-full px-4 py-3 bg-[#1D9E75]/20 border border-[#1D9E75]/40 rounded-2xl text-[#1D9E75] text-xs font-semibold flex items-center gap-1">
              <Plus size={14} /> Add
            </button>
          </div>
          {scrapSales.map(sc => (
            <div key={sc.id} className="bg-[#161a23] rounded-2xl border border-white/8 p-4">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-sm font-semibold text-white">{sc.description}</p>
                  <p className="text-xs text-white/40 mt-0.5">{sc.buyer}</p>
                  <p className="text-[10px] text-white/30 mt-0.5">{sc.date}</p>
                </div>
                <div className="text-right">
                  <p className="text-base font-bold text-[#1D9E75]">₹{sc.total.toLocaleString()}</p>
                  <p className="text-[10px] text-white/40">{sc.qty} {sc.unit} @ ₹{sc.rate}</p>
                </div>
              </div>
            </div>
          ))}
          {scrapSales.length === 0 && <p className="text-center text-white/30 text-sm py-8">No scrap sales yet.</p>}
        </div>
      )}

      {/* ── MODALS ── */}

      {modal === 'newItem' && (
        <Modal title="Add Item to Master" onClose={() => setModal(null)}>
          <div className="space-y-3">
            <FRow label="Item name"><input className="finput" placeholder="e.g. DAP" value={form.name || ''} onChange={e => f('name', e.target.value)} /></FRow>
            <FRow label="Category">
              <select className="finput" value={form.category || ''} onChange={e => f('category', e.target.value)} style={{ background: '#1a2030' }}>
                <option value="" style={{ background: '#1a2030' }}>Select…</option>
                {CATEGORIES.map(c => <option key={c} value={c} style={{ background: '#1a2030' }}>{CAT_LABEL[c]}</option>)}
              </select>
            </FRow>
            <FRow label="Unit"><input className="finput" placeholder="kg / litre / bag" value={form.unit || ''} onChange={e => f('unit', e.target.value)} /></FRow>
            <div className="grid grid-cols-2 gap-2">
              <FRow label="Cost/unit (₹)"><input type="number" className="finput" value={form.costPerUnit || ''} onChange={e => f('costPerUnit', e.target.value)} /></FRow>
              <FRow label="Min stock"><input type="number" className="finput" value={form.minThreshold || ''} onChange={e => f('minThreshold', e.target.value)} /></FRow>
            </div>
            <button onClick={confirmNewItem} disabled={saving} className="w-full py-3 bg-[#1D9E75] text-white text-sm font-bold rounded-xl disabled:opacity-40">
              {saving ? 'Saving…' : 'Add Item'}
            </button>
          </div>
        </Modal>
      )}

      {modal === 'purchase' && selected && (
        <Modal title={`Purchase — ${selected.name}`} onClose={() => setModal(null)}>
          <div className="space-y-3">
            <p className="text-xs text-white/40">Current stock: <span className="text-white font-semibold">{selected.currentStock} {selected.unit}</span></p>
            <FRow label="Date"><input type="date" className="finput" value={form.date || ''} onChange={e => f('date', e.target.value)} style={{ colorScheme: 'dark' }} /></FRow>
            <div className="grid grid-cols-2 gap-2">
              <FRow label={`Qty (${selected.unit})`}><input type="number" className="finput" placeholder="0" value={form.qty || ''} onChange={e => f('qty', e.target.value)} /></FRow>
              <FRow label="Price/unit (₹)"><input type="number" className="finput" value={form.unitPrice || ''} onChange={e => f('unitPrice', e.target.value)} /></FRow>
            </div>
            {form.qty && form.unitPrice && (
              <div className="bg-[#1D9E75]/10 border border-[#1D9E75]/20 rounded-xl px-3 py-2">
                <p className="text-xs text-white/50">Total cost</p>
                <p className="text-lg font-bold text-[#1D9E75]">₹{(parseFloat(form.qty) * parseFloat(form.unitPrice)).toLocaleString()}</p>
              </div>
            )}
            <FRow label="Vendor name"><input className="finput" placeholder="e.g. Ram Fertilizers" value={form.vendor || ''} onChange={e => f('vendor', e.target.value)} /></FRow>
            <FRow label="Invoice / Bill no."><input className="finput" placeholder="optional" value={form.invoiceNo || ''} onChange={e => f('invoiceNo', e.target.value)} /></FRow>
            <FRow label="Notes"><input className="finput" placeholder="optional" value={form.notes || ''} onChange={e => f('notes', e.target.value)} /></FRow>
            <button onClick={confirmPurchase} disabled={saving} className="w-full py-3 bg-[#1D9E75] text-white text-sm font-bold rounded-xl disabled:opacity-40">
              {saving ? 'Saving…' : 'Confirm Purchase'}
            </button>
          </div>
        </Modal>
      )}

      {modal === 'issue' && selected && (
        <Modal title={`Issue — ${selected.name}`} onClose={() => setModal(null)}>
          <div className="space-y-3">
            {/* Stock info */}
            <div className={`rounded-xl px-3 py-2 border ${selected.currentStock === 0 ? 'bg-[#E24B4A]/10 border-[#E24B4A]/30' : selected.currentStock < (selected.minThreshold || 0) ? 'bg-[#BA7517]/10 border-[#BA7517]/30' : 'bg-white/5 border-white/10'}`}>
              <p className="text-xs text-white/50">Available stock</p>
              <p className={`text-lg font-bold ${selected.currentStock === 0 ? 'text-[#E24B4A]' : selected.currentStock < (selected.minThreshold || 0) ? 'text-[#BA7517]' : 'text-white'}`}>
                {selected.currentStock} {selected.unit}
              </p>
              {selected.currentStock === 0 && <p className="text-xs text-[#E24B4A] mt-0.5">✗ No stock — cannot issue</p>}
              {selected.currentStock > 0 && selected.currentStock < (selected.minThreshold || 0) && (
                <p className="text-xs text-[#BA7517] mt-0.5">⚠ Stock already below minimum ({selected.minThreshold} {selected.unit})</p>
              )}
            </div>

            <FRow label="Date"><input type="date" className="finput" value={form.date || ''} onChange={e => f('date', e.target.value)} style={{ colorScheme: 'dark' }} /></FRow>

            {/* Qty with real-time validation */}
            <FRow label={`Qty (${selected.unit})`}>
              <input type="number" className={`finput ${qtyOverStock ? 'border-[#E24B4A]' : stockWillLow ? 'border-[#BA7517]' : ''}`}
                placeholder="0" value={form.qty || ''} onChange={e => f('qty', e.target.value)}
                max={selected.currentStock} />
              {qtyOverStock && <p className="text-xs text-[#E24B4A] mt-1">✗ Exceeds stock — max {selected.currentStock} {selected.unit}</p>}
              {stockWillLow && <p className="text-xs text-[#BA7517] mt-1">⚠ Stock will drop to {stockAfter} {selected.unit} (below minimum {selected.minThreshold})</p>}
              {!qtyOverStock && issueQty > 0 && <p className="text-xs text-white/35 mt-1">Stock after: {stockAfter} {selected.unit}</p>}
            </FRow>

            {/* Crop Cycle dropdown */}
            <FRow label="Issue to Crop Cycle">
              <select className="finput" value={form.cropCycleId || ''} onChange={e => {
                const id = e.target.value
                f('cropCycleId', id)
              }} style={{ background: '#1a2030' }}>
                <option value="" style={{ background: '#1a2030' }}>Select cycle… (required)</option>
                {cropCycles.filter(c => c.status === 'active').map(c => {
                  const crop = cropMaster.find(cr => cr.id === c.cropId)
                  return <option key={c.id} value={c.id} style={{ background: '#1a2030' }}>{c.plotLabel} — {crop?.name || c.cropId}</option>
                })}
                <option value="__farm__" style={{ background: '#1a2030' }}>Farm-wide (diesel / shared cost)</option>
              </select>
              {seedToActivePlot && (
                <p className="text-[10px] text-[#BA7517] mt-1">⚠ {seedToActivePlot}</p>
              )}
              {!form.cropCycleId && selected.category === 'seed' && (
                <p className="text-[10px] text-white/35 mt-1">For seeds: select the cycle this planting belongs to.</p>
              )}
            </FRow>

            <FRow label="Purpose"><input className="finput" placeholder="e.g. Top dressing, basal dose" value={form.purpose || ''} onChange={e => f('purpose', e.target.value)} /></FRow>

            {/* Cost preview */}
            {issueQty > 0 && !qtyOverStock && (
              <div className="bg-[#1D9E75]/10 border border-[#1D9E75]/20 rounded-xl px-3 py-2">
                <p className="text-xs text-white/50">Cost</p>
                <p className="text-base font-bold text-[#1D9E75]">₹{(issueQty * (selected.costPerUnit || 0)).toLocaleString()}</p>
              </div>
            )}

            <button onClick={confirmIssue}
              disabled={saving || qtyOverStock || selected.currentStock === 0 || !form.qty}
              className="w-full py-3 bg-[#1D9E75] text-white text-sm font-bold rounded-xl disabled:opacity-40">
              {saving ? 'Saving…' : 'Confirm Issue'}
            </button>
          </div>
        </Modal>
      )}

      {modal === 'scrap' && (
        <Modal title="Record Scrap Sale" onClose={() => setModal(null)}>
          <div className="space-y-3">
            <FRow label="Date"><input type="date" className="finput" value={form.date || ''} onChange={e => f('date', e.target.value)} style={{ colorScheme: 'dark' }} /></FRow>
            <FRow label="Description"><input className="finput" placeholder="e.g. Empty fertilizer bags" value={form.description || ''} onChange={e => f('description', e.target.value)} /></FRow>
            <div className="grid grid-cols-2 gap-2">
              <FRow label="Qty"><input type="number" className="finput" value={form.qty || ''} onChange={e => f('qty', e.target.value)} /></FRow>
              <FRow label="Unit"><input className="finput" placeholder="bags/kg/lot" value={form.unit || ''} onChange={e => f('unit', e.target.value)} /></FRow>
            </div>
            <FRow label="Rate (₹)"><input type="number" className="finput" value={form.rate || ''} onChange={e => f('rate', e.target.value)} /></FRow>
            {form.qty && form.rate && (
              <div className="bg-[#1D9E75]/10 border border-[#1D9E75]/20 rounded-xl px-3 py-2">
                <p className="text-xs text-white/50">Total</p>
                <p className="text-lg font-bold text-[#1D9E75]">₹{(parseFloat(form.qty) * parseFloat(form.rate)).toLocaleString()}</p>
              </div>
            )}
            <FRow label="Buyer"><input className="finput" placeholder="optional" value={form.buyer || ''} onChange={e => f('buyer', e.target.value)} /></FRow>
            <button onClick={confirmScrap} className="w-full py-3 bg-[#1D9E75] text-white text-sm font-bold rounded-xl">Record Sale</button>
          </div>
        </Modal>
      )}

      {toast && (
        <div className={`fixed bottom-24 left-4 right-4 px-4 py-3 rounded-2xl text-sm font-medium text-white shadow-xl z-50 flex items-center gap-2 ${toastType === 'warn' ? 'bg-[#BA7517]' : 'bg-[#1D9E75]'}`}>
          {toastType === 'warn' ? <AlertTriangle size={16} /> : <CheckCircle2 size={16} />} {toast}
        </div>
      )}

      <style>{`.finput{width:100%;background:rgba(255,255,255,0.08);border:1px solid rgba(255,255,255,0.12);border-radius:12px;padding:10px 14px;color:white;font-size:14px;outline:none;}.finput:focus{border-color:#1D9E75;}.no-scrollbar::-webkit-scrollbar{display:none;}.no-scrollbar{-ms-overflow-style:none;scrollbar-width:none;}`}</style>
    </div>
  )
}

// ── Labour Tab ────────────────────────────────────────────────────────────────
function LabourTab({ regularLabourers, contractualLabour, labourLogs, cropCycles, cropMaster, logLabour, totalLabour, showToast }) {
  const [subTab, setSubTab] = useState('today')

  return (
    <div className="flex-1 flex flex-col min-h-0">
      {/* Sub-tabs */}
      <div className="flex gap-1 p-3 shrink-0 bg-[#161a23] border-b border-white/8">
        {[['today', '📋 Today'], ['logs', '🗒 Logs'], ['summary', '📊 Summary']].map(([k, lbl]) => (
          <button key={k} onClick={() => setSubTab(k)}
            className={`flex-1 py-2 text-xs font-semibold rounded-xl transition-colors ${subTab === k ? 'bg-[#1D9E75] text-white' : 'text-white/40 bg-white/5'}`}>
            {lbl}
          </button>
        ))}
      </div>
      <div className="flex-1 overflow-y-auto">
        {subTab === 'today'   && <LabourToday regularLabourers={regularLabourers} contractualLabour={contractualLabour} labourLogs={labourLogs} cropCycles={cropCycles} cropMaster={cropMaster} logLabour={logLabour} showToast={showToast} />}
        {subTab === 'logs'    && <LabourLogs labourLogs={labourLogs} totalLabour={totalLabour} />}
        {subTab === 'summary' && <LabourSummary regularLabourers={regularLabourers} labourLogs={labourLogs} />}
      </div>
    </div>
  )
}

// ── Labour Today: attendance + quick log ──────────────────────────────────────
function LabourToday({ regularLabourers, contractualLabour, labourLogs, cropCycles, cropMaster, logLabour, showToast }) {
  const [attendance,   setAttendance]  = useState({})   // { [labourId]: { status, id } }
  const [loadingAtt,   setLoadingAtt]  = useState(true)
  const [savingAtt,    setSavingAtt]   = useState({})    // { [labourId]: true }
  const [showLogModal, setShowLogModal] = useState(null) // labourId to log work for
  const [ctForm, setCtForm]            = useState({ categoryId: '', workers: '', rate: '', plotId: '', purpose: '', date: TODAY_STR })
  const [saving, setSaving]            = useState(false)

  // Load today's attendance
  useEffect(() => {
    supabase.from('attendance').select('*').eq('attendance_date', TODAY_STR)
      .then(({ data }) => {
        const map = {}
        ;(data || []).forEach(r => { map[r.labour_master_id] = { status: r.status, id: r.id } })
        setAttendance(map)
        setLoadingAtt(false)
      })
  }, [])

  const markAttendance = async (labourId, status) => {
    // Prevent double-marking with same status
    if (attendance[labourId]?.status === status) return

    setSavingAtt(s => ({ ...s, [labourId]: true }))
    const { data, error } = await supabase.from('attendance').upsert({
      labour_master_id: labourId,
      attendance_date:  TODAY_STR,
      status,
    }, { onConflict: 'labour_master_id,attendance_date' }).select().single()

    if (!error) {
      setAttendance(prev => ({ ...prev, [labourId]: { status, id: data?.id } }))
    }
    setSavingAtt(s => ({ ...s, [labourId]: false }))
  }

  const todayLogs = labourLogs.filter(l => l.date === TODAY_STR)
  const presentCount  = Object.values(attendance).filter(a => a.status === 'present').length
  const halfDayCount  = Object.values(attendance).filter(a => a.status === 'half_day').length
  const absentCount   = Object.values(attendance).filter(a => a.status === 'absent').length
  const todayWages    = regularLabourers.reduce((sum, l) => {
    const att = attendance[l.id]
    if (!att) return sum
    if (att.status === 'present')  return sum + l.ratePerDay
    if (att.status === 'half_day') return sum + l.ratePerDay / 2
    return sum
  }, 0)
  const todayContractual = todayLogs.reduce((s, l) => s + (l.totalCost || 0), 0)

  const addContractual = async () => {
    const workers = parseFloat(ctForm.workers)
    const rate    = parseFloat(ctForm.rate)
    if (!ctForm.categoryId || !workers || !rate) return showToast('Select category, workers and rate', 'warn')
    const cat     = contractualLabour.find(c => c.id === ctForm.categoryId)
    const cycle   = cropCycles.find(c => c.id === ctForm.plotId)
    setSaving(true)
    try {
      await logLabour({
        labourType:   'contractual',
        labourName:   cat?.name || 'Contractual Labour',
        plotId:       cycle?.plotId || null,
        cropCycleId:  ctForm.plotId || null,
        date:         ctForm.date,
        workers,
        ratePerDay:   rate,
        totalCost:    workers * rate,
        purpose:      ctForm.purpose || cat?.name || 'Contractual work',
      })
      showToast('Labour logged')
      setCtForm({ categoryId: '', workers: '', rate: '', plotId: '', purpose: '', date: TODAY_STR })
    } catch (e) { showToast('Failed: ' + e.message, 'warn') }
    setSaving(false)
  }

  return (
    <div className="p-4 space-y-4 pb-20">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold text-white/50">Today · {TODAY_LABEL}</p>
      </div>

      {/* Summary pills */}
      <div className="grid grid-cols-2 gap-2">
        <div className="bg-[#1D9E75]/10 border border-[#1D9E75]/20 rounded-xl px-3 py-2.5">
          <p className="text-[10px] text-white/40">Regular wages today</p>
          <p className="text-lg font-bold text-[#1D9E75]">₹{todayWages.toLocaleString()}</p>
          <p className="text-[10px] text-white/35">{presentCount} present · {halfDayCount} half · {absentCount} absent</p>
        </div>
        <div className="bg-[#BA7517]/10 border border-[#BA7517]/20 rounded-xl px-3 py-2.5">
          <p className="text-[10px] text-white/40">Contractual today</p>
          <p className="text-lg font-bold text-[#BA7517]">₹{todayContractual.toLocaleString()}</p>
          <p className="text-[10px] text-white/35">{todayLogs.length} log{todayLogs.length !== 1 ? 's' : ''}</p>
        </div>
      </div>

      {/* Regular labourers — attendance */}
      <div>
        <p className="text-[10px] font-bold text-white/40 uppercase tracking-wide mb-2">Regular Labourers — Mark Attendance</p>
        {regularLabourers.length === 0 && (
          <p className="text-xs text-white/25 italic">No regular labourers added. Go to Admin → Labour.</p>
        )}
        {regularLabourers.map(l => {
          const att    = attendance[l.id]
          const status = att?.status
          const isBusy = savingAtt[l.id] || loadingAtt

          return (
            <div key={l.id} className="bg-[#161a23] rounded-2xl border border-white/8 p-3 mb-2">
              <div className="flex items-center gap-3 mb-2.5">
                <div className="w-8 h-8 rounded-full bg-[#1D9E75]/15 flex items-center justify-center text-xs font-bold text-[#1D9E75] shrink-0">
                  {l.name.charAt(0)}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-white">{l.name}</p>
                  <p className="text-[10px] text-white/40">{l.workType} · ₹{l.ratePerDay}/day</p>
                </div>
                {status && (
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${status === 'present' ? 'bg-[#1D9E75]/20 text-[#1D9E75]' : status === 'half_day' ? 'bg-[#BA7517]/20 text-[#BA7517]' : 'bg-[#E24B4A]/20 text-[#E24B4A]'}`}>
                    {status === 'present' ? '✓ Present' : status === 'half_day' ? '½ Half' : '✗ Absent'}
                  </span>
                )}
              </div>
              <div className="flex gap-1.5">
                {[['present', '✓ Present', '#1D9E75'], ['half_day', '½ Half Day', '#BA7517'], ['absent', '✗ Absent', '#E24B4A']].map(([s, label, color]) => (
                  <button key={s}
                    onClick={() => markAttendance(l.id, s)}
                    disabled={isBusy || status === s}
                    className="flex-1 py-1.5 text-[10px] font-semibold rounded-xl border transition-all disabled:opacity-40"
                    style={{
                      background:  status === s ? color + '25' : 'rgba(255,255,255,0.05)',
                      borderColor: status === s ? color + '60' : 'rgba(255,255,255,0.1)',
                      color:       status === s ? color         : 'rgba(255,255,255,0.4)',
                    }}>
                    {label}
                  </button>
                ))}
              </div>
              {(status === 'present' || status === 'half_day') && (
                <button onClick={() => setShowLogModal(l.id)}
                  className="mt-2 w-full py-1.5 text-[10px] font-semibold text-white/50 border border-white/10 rounded-xl hover:border-[#1D9E75]/40 hover:text-[#1D9E75] transition-colors">
                  📋 Assign / Log Task
                </button>
              )}
            </div>
          )
        })}
      </div>

      {/* Contractual workers log */}
      <div>
        <p className="text-[10px] font-bold text-white/40 uppercase tracking-wide mb-2">Log Contractual Workers</p>
        <div className="bg-[#161a23] rounded-2xl border border-white/8 p-3 space-y-2.5">
          <div className="grid grid-cols-2 gap-2">
            <FRow label="Category">
              <select className="finput" value={ctForm.categoryId} onChange={e => {
                const cat = contractualLabour.find(c => c.id === e.target.value)
                setCtForm(p => ({ ...p, categoryId: e.target.value, rate: cat?.defaultRate || '' }))
              }} style={{ background: '#1a2030' }}>
                <option value="" style={{ background: '#1a2030' }}>Select…</option>
                {contractualLabour.map(c => <option key={c.id} value={c.id} style={{ background: '#1a2030' }}>{c.name} (₹{c.defaultRate})</option>)}
              </select>
            </FRow>
            <FRow label="Plot / Cycle">
              <select className="finput" value={ctForm.plotId} onChange={e => setCtForm(p => ({ ...p, plotId: e.target.value }))} style={{ background: '#1a2030' }}>
                <option value="" style={{ background: '#1a2030' }}>Farm-wide</option>
                {cropCycles.filter(c => c.status === 'active').map(c => {
                  const crop = cropMaster.find(cr => cr.id === c.cropId)
                  return <option key={c.id} value={c.id} style={{ background: '#1a2030' }}>{c.plotLabel} — {crop?.name || ''}</option>
                })}
              </select>
            </FRow>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <FRow label="# Workers"><input type="number" className="finput" placeholder="0" value={ctForm.workers} onChange={e => setCtForm(p => ({ ...p, workers: e.target.value }))} /></FRow>
            <FRow label="Rate/day (₹)"><input type="number" className="finput" value={ctForm.rate} onChange={e => setCtForm(p => ({ ...p, rate: e.target.value }))} /></FRow>
          </div>
          <FRow label="Purpose (optional)"><input className="finput" placeholder="e.g. Harvesting, weeding" value={ctForm.purpose} onChange={e => setCtForm(p => ({ ...p, purpose: e.target.value }))} /></FRow>
          <FRow label="Date"><input type="date" className="finput" value={ctForm.date} onChange={e => setCtForm(p => ({ ...p, date: e.target.value }))} style={{ colorScheme: 'dark' }} /></FRow>
          {ctForm.workers && ctForm.rate && (
            <div className="bg-[#BA7517]/10 border border-[#BA7517]/20 rounded-xl px-3 py-1.5">
              <p className="text-xs font-bold text-[#BA7517]">₹{(parseFloat(ctForm.workers) * parseFloat(ctForm.rate)).toLocaleString()} total</p>
            </div>
          )}
          <button onClick={addContractual} disabled={saving} className="w-full py-2.5 bg-[#1D9E75] text-white text-xs font-bold rounded-xl disabled:opacity-40">
            {saving ? 'Logging…' : '+ Log Contractual Work'}
          </button>
        </div>
      </div>

      {/* Today's logs */}
      {todayLogs.length > 0 && (
        <div>
          <p className="text-[10px] font-bold text-white/40 uppercase tracking-wide mb-2">Today's Labour Logs</p>
          {todayLogs.map(l => (
            <div key={l.id} className="bg-[#161a23] rounded-xl border border-white/8 p-3 mb-1.5 flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold text-white">{l.labourName}</p>
                <p className="text-[10px] text-white/40">{l.plotLabel || 'Farm-wide'} · {l.workers || 0} workers</p>
                {l.purpose && <p className="text-[10px] text-white/30 italic">{l.purpose}</p>}
              </div>
              <p className="text-sm font-bold text-[#BA7517]">₹{(l.totalCost || 0).toLocaleString()}</p>
            </div>
          ))}
        </div>
      )}

      {/* Log task modal */}
      {showLogModal && (
        <LogTaskModal
          labourer={regularLabourers.find(l => l.id === showLogModal)}
          cropCycles={cropCycles}
          cropMaster={cropMaster}
          logLabour={logLabour}
          showToast={showToast}
          onClose={() => setShowLogModal(null)}
        />
      )}
    </div>
  )
}

// ── Log Task Modal for a specific regular labourer ────────────────────────────
function LogTaskModal({ labourer, cropCycles, cropMaster, logLabour, showToast, onClose }) {
  const [form, setForm] = useState({ cycleId: '', purpose: '', date: TODAY_STR })
  const [saving, setSaving] = useState(false)

  const submit = async () => {
    if (!labourer) return
    const cycle = cropCycles.find(c => c.id === form.cycleId)
    setSaving(true)
    try {
      await logLabour({
        labourType:      'regular',
        labourMasterId:  labourer.id,
        labourName:      labourer.name,
        plotId:          cycle?.plotId || null,
        cropCycleId:     form.cycleId || null,
        date:            form.date,
        workers:         1,
        ratePerDay:      labourer.ratePerDay,
        totalCost:       labourer.ratePerDay,
        purpose:         form.purpose || 'Daily work',
      })
      showToast(`Work logged for ${labourer.name}`)
      onClose()
    } catch (e) { showToast('Failed: ' + e.message, 'warn') }
    setSaving(false)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end" style={{ background: 'rgba(0,0,0,0.7)' }} onClick={onClose}>
      <div className="w-full bg-[#161a23] rounded-t-3xl p-5 border-t border-white/10" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-bold text-white">Log Task — {labourer?.name}</h3>
          <button onClick={onClose} className="text-white/40 hover:text-white"><X size={18} /></button>
        </div>
        <div className="space-y-3">
          <FRow label="Plot / Cycle">
            <select className="finput" value={form.cycleId} onChange={e => setForm(p => ({ ...p, cycleId: e.target.value }))} style={{ background: '#1a2030' }}>
              <option value="" style={{ background: '#1a2030' }}>Farm-wide / General</option>
              {cropCycles.filter(c => c.status === 'active').map(c => {
                const crop = cropMaster.find(cr => cr.id === c.cropId)
                return <option key={c.id} value={c.id} style={{ background: '#1a2030' }}>{c.plotLabel} — {crop?.name || ''}</option>
              })}
            </select>
          </FRow>
          <FRow label="Task / Purpose">
            <input className="finput" placeholder="e.g. Irrigation, weeding, spraying" value={form.purpose} onChange={e => setForm(p => ({ ...p, purpose: e.target.value }))} />
          </FRow>
          <FRow label="Date">
            <input type="date" className="finput" value={form.date} onChange={e => setForm(p => ({ ...p, date: e.target.value }))} style={{ colorScheme: 'dark' }} />
          </FRow>
          <div className="bg-white/5 rounded-xl px-3 py-2 text-xs text-white/50">
            Rate: ₹{labourer?.ratePerDay}/day · will be logged as 1 day
          </div>
          <button onClick={submit} disabled={saving} className="w-full py-3 bg-[#1D9E75] text-white text-sm font-bold rounded-xl disabled:opacity-40">
            {saving ? 'Saving…' : 'Log Task'}
          </button>
        </div>
        <style>{`.finput{width:100%;background:rgba(255,255,255,0.08);border:1px solid rgba(255,255,255,0.12);border-radius:12px;padding:10px 14px;color:white;font-size:14px;outline:none;}.finput:focus{border-color:#1D9E75;}`}</style>
      </div>
    </div>
  )
}

// ── Labour Logs view ──────────────────────────────────────────────────────────
function LabourLogs({ labourLogs, totalLabour }) {
  return (
    <div className="p-4 space-y-3 pb-4">
      <div className="bg-[#BA7517]/10 border border-[#BA7517]/20 rounded-2xl px-4 py-3">
        <p className="text-xs text-white/50">Total Labour Cost (all time)</p>
        <p className="text-2xl font-bold text-[#BA7517]">₹{totalLabour.toLocaleString()}</p>
      </div>
      {labourLogs.map(l => (
        <div key={l.id} className="bg-[#161a23] rounded-2xl border border-white/8 p-4">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-sm font-semibold text-white">{l.labourName}</p>
              <p className="text-xs text-white/40 mt-0.5">{l.plotLabel || 'Farm-wide'}</p>
              <p className="text-[10px] text-white/30 mt-0.5">{l.date}</p>
              {l.purpose && <p className="text-xs text-white/50 mt-1 italic">{l.purpose}</p>}
            </div>
            <div className="text-right">
              <p className="text-base font-bold text-white">₹{(l.totalCost || 0).toLocaleString()}</p>
              <p className="text-[10px] text-white/40">{l.workers > 0 ? `${l.workers} workers` : '1 worker'}</p>
              <p className="text-[10px] text-white/30">₹{l.ratePerDay}/day</p>
            </div>
          </div>
        </div>
      ))}
      {labourLogs.length === 0 && <p className="text-center text-white/30 text-sm py-8">No labour logs yet.</p>}
    </div>
  )
}

// ── Labour Summary: monthly earnings & balance ────────────────────────────────
function LabourSummary({ regularLabourers, labourLogs }) {
  const [month, setMonth] = useState(new Date().toISOString().slice(0, 7)) // YYYY-MM
  const [attendance, setAttendance] = useState({}) // { [labourId]: count }

  useEffect(() => {
    const from = month + '-01'
    const to   = month + '-31'
    supabase.from('attendance')
      .select('labour_master_id, status')
      .gte('attendance_date', from)
      .lte('attendance_date', to)
      .in('status', ['present', 'half_day'])
      .then(({ data }) => {
        const counts = {}
        ;(data || []).forEach(r => {
          if (!counts[r.labour_master_id]) counts[r.labour_master_id] = 0
          counts[r.labour_master_id] += r.status === 'present' ? 1 : 0.5
        })
        setAttendance(counts)
      })
  }, [month])

  const monthLogs       = labourLogs.filter(l => l.date?.startsWith(month))
  const regularLogs     = monthLogs.filter(l => regularLabourers.some(r => r.name === l.labourName))
  const contractualLogs = monthLogs.filter(l => !regularLabourers.some(r => r.name === l.labourName))

  const totalRegularEarned     = regularLabourers.reduce((sum, l) => sum + (attendance[l.id] || 0) * l.ratePerDay, 0)
  const totalContractualLogged = contractualLogs.reduce((s, l) => s + (l.totalCost || 0), 0)
  const totalLogged            = regularLogs.reduce((s, l) => s + (l.totalCost || 0), 0)
  const grandTotal             = totalRegularEarned + totalContractualLogged

  return (
    <div className="p-4 space-y-4 pb-6">
      {/* Month selector */}
      <div className="flex items-center gap-3">
        <p className="text-xs font-semibold text-white/50 flex-1">Monthly Summary</p>
        <input type="month" value={month} onChange={e => setMonth(e.target.value)}
          className="bg-white/8 border border-white/12 rounded-xl px-3 py-2 text-sm text-white outline-none"
          style={{ colorScheme: 'dark' }} />
      </div>

      {/* Grand total cards */}
      <div className="grid grid-cols-2 gap-2">
        <div className="bg-[#1D9E75]/10 border border-[#1D9E75]/20 rounded-xl p-3">
          <p className="text-[10px] text-white/40">Regular Wages</p>
          <p className="text-lg font-bold text-[#1D9E75]">₹{totalRegularEarned.toLocaleString()}</p>
          <p className="text-[10px] text-white/30">from attendance records</p>
        </div>
        <div className="bg-[#BA7517]/10 border border-[#BA7517]/20 rounded-xl p-3">
          <p className="text-[10px] text-white/40">Contractual</p>
          <p className="text-lg font-bold text-[#BA7517]">₹{totalContractualLogged.toLocaleString()}</p>
          <p className="text-[10px] text-white/30">{contractualLogs.length} logs</p>
        </div>
      </div>

      <div className="bg-white/5 border border-white/10 rounded-xl px-4 py-3 flex items-center justify-between">
        <p className="text-sm font-semibold text-white">Total Labour Cost</p>
        <p className="text-xl font-bold text-white">₹{grandTotal.toLocaleString()}</p>
      </div>

      {/* Per labourer breakdown */}
      {regularLabourers.length > 0 && (
        <div>
          <p className="text-[10px] font-bold text-white/40 uppercase tracking-wide mb-2">Regular Labourers — Breakdown</p>
          {regularLabourers.map(l => {
            const days   = attendance[l.id] || 0
            const earned = days * l.ratePerDay
            const paid   = regularLogs.filter(log => log.labourName === l.name).reduce((s, log) => s + (log.totalCost || 0), 0)
            const balance = earned - paid
            return (
              <div key={l.id} className="bg-[#161a23] rounded-2xl border border-white/8 p-4 mb-2">
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-7 h-7 rounded-full bg-[#1D9E75]/15 flex items-center justify-center text-xs font-bold text-[#1D9E75]">{l.name.charAt(0)}</div>
                  <div>
                    <p className="text-sm font-semibold text-white">{l.name}</p>
                    <p className="text-[10px] text-white/40">{l.workType} · ₹{l.ratePerDay}/day</p>
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div className="bg-white/5 rounded-lg py-2">
                    <p className="text-[10px] text-white/40">Days</p>
                    <p className="text-sm font-bold text-white">{days}</p>
                  </div>
                  <div className="bg-[#1D9E75]/10 rounded-lg py-2">
                    <p className="text-[10px] text-white/40">Earned</p>
                    <p className="text-sm font-bold text-[#1D9E75]">₹{earned.toLocaleString()}</p>
                  </div>
                  <div className={`rounded-lg py-2 ${balance > 0 ? 'bg-[#E24B4A]/10' : 'bg-white/5'}`}>
                    <p className="text-[10px] text-white/40">Balance</p>
                    <p className={`text-sm font-bold ${balance > 0 ? 'text-[#E24B4A]' : 'text-white/50'}`}>₹{balance.toLocaleString()}</p>
                  </div>
                </div>
                {days === 0 && <p className="text-[10px] text-white/25 text-center mt-2 italic">No attendance recorded this month</p>}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ── Shared ────────────────────────────────────────────────────────────────────
function Modal({ title, onClose, children }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end" style={{ background: 'rgba(0,0,0,0.7)' }} onClick={onClose}>
      <div className="w-full bg-[#161a23] rounded-t-3xl p-5 max-h-[90vh] overflow-y-auto border-t border-white/10" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-bold text-white">{title}</h3>
          <button onClick={onClose} className="text-white/40 hover:text-white"><X size={18} /></button>
        </div>
        {children}
      </div>
    </div>
  )
}

function FRow({ label, children }) {
  return <div><label className="text-xs font-medium text-white/50 block mb-1.5">{label}</label>{children}</div>
}

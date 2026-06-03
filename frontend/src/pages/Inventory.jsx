import React, { useState } from 'react'
import { Plus, X, CheckCircle2, AlertTriangle, Package, Users, Trash2, Receipt } from 'lucide-react'
import { useAppStore } from '../store'

const CATEGORIES = ['seed','fertilizer','chemical','fuel','other']
const CAT_LABEL  = { seed:'Seeds', fertilizer:'Fertilizers', chemical:'Chemicals', fuel:'Fuel', other:'Other' }
const CAT_EMOJI  = { seed:'🌾', fertilizer:'🧪', chemical:'🧴', fuel:'⛽', other:'📦' }

const TABS = [
  { key:'items',     label:'Items',    Icon: Package  },
  { key:'purchases', label:'Purchases',Icon: Receipt  },
  { key:'labour',    label:'Labour',   Icon: Users    },
  { key:'scrap',     label:'Scrap',    Icon: Trash2   },
]

export default function Inventory() {
  const {
    inventoryMaster, purchases, issues, labourLogs, scrapSales,
    cropCycles, cropMaster,
    addInventoryItem, recordPurchase, issueItem, addScrapSale,
  } = useAppStore()

  const [tab, setTab]         = useState('items')
  const [catFilter, setCat]   = useState('all')
  const [modal, setModal]     = useState(null)  // 'newItem'|'purchase'|'issue'|'scrap'
  const [selected, setSelected] = useState(null)
  const [form, setForm]       = useState({})
  const [toast, setToast]     = useState(null)

  const showToast = (msg) => { setToast(msg); setTimeout(()=>setToast(null), 3000) }

  const f = (k,v) => setForm(p=>({...p,[k]:v}))

  const openPurchase = (item) => { setSelected(item); setForm({ qty:'', unitPrice: item.costPerUnit||'', vendor:'', invoiceNo:'', notes:'', date: new Date().toISOString().slice(0,10) }); setModal('purchase') }
  const openIssue    = (item) => { setSelected(item); setForm({ qty:'', purpose:'', cropCycleId:'', plotId:'', plotLabel:'', date: new Date().toISOString().slice(0,10) }); setModal('issue') }

  const confirmNewItem = () => {
    if (!form.name||!form.category||!form.unit) return
    addInventoryItem({ name:form.name, category:form.category, unit:form.unit, minThreshold:parseFloat(form.minThreshold)||0, costPerUnit:parseFloat(form.costPerUnit)||0 })
    showToast('Item added to master'); setModal(null)
  }

  const confirmPurchase = () => {
    const qty = parseFloat(form.qty); const unitPrice = parseFloat(form.unitPrice)
    if (!qty||!unitPrice||!form.vendor||!selected) return
    recordPurchase({ itemId:selected.id, date:form.date, qty, unitPrice, totalCost:qty*unitPrice, vendor:form.vendor, invoiceNo:form.invoiceNo||'', notes:form.notes||'' })
    showToast(`Purchased ${qty} ${selected.unit} of ${selected.name}`); setModal(null)
  }

  const confirmIssue = () => {
    const qty = parseFloat(form.qty)
    if (!qty||!selected) return
    const cropCycleId = form.cropCycleId === '__farm__' ? null : (form.cropCycleId || null)
    issueItem({
      itemId: selected.id, date: form.date, qty,
      totalCost: qty * (selected.costPerUnit || 0),
      cropCycleId,
      plotId: form.plotId || '',
      plotLabel: form.plotLabel || '—',
      purpose: form.purpose || '',
      activityType: 'manual',
    })
    showToast(`Issued ${qty} ${selected.unit} of ${selected.name}`); setModal(null)
  }

  const confirmScrap = () => {
    if (!form.description||!form.qty||!form.rate) return
    addScrapSale({ description:form.description, date:form.date||new Date().toISOString().slice(0,10), qty:parseFloat(form.qty), unit:form.unit||'units', rate:parseFloat(form.rate), total:parseFloat(form.qty)*parseFloat(form.rate), buyer:form.buyer||'' })
    showToast('Scrap sale recorded'); setModal(null)
  }

  const items = catFilter==='all' ? inventoryMaster : inventoryMaster.filter(i=>i.category===catFilter)

  // Total spend from purchases
  const totalSpend = purchases.reduce((s,p)=>s+p.totalCost,0)
  const totalLabourCost = labourLogs.reduce((s,l)=>s+l.totalCost,0)
  const totalScrap = scrapSales.reduce((s,sc)=>s+sc.total,0)

  return (
    <div className="h-full flex flex-col bg-[#0f1117]">
      {/* Tab bar */}
      <div className="flex border-b border-white/8 bg-[#161a23] shrink-0">
        {TABS.map(({key,label,Icon})=>(
          <button key={key} onClick={()=>setTab(key)}
            className={`flex-1 py-3 flex flex-col items-center gap-0.5 text-[10px] font-semibold transition-colors
              ${tab===key?'text-[#1D9E75] border-b-2 border-[#1D9E75]':'text-white/40'}`}>
            <Icon size={16}/>{label}
          </button>
        ))}
      </div>

      {/* ── ITEMS TAB ── */}
      {tab==='items' && (
        <div className="flex-1 flex flex-col min-h-0">
          {/* Category filter */}
          <div className="flex gap-2 px-4 py-2 overflow-x-auto no-scrollbar shrink-0 bg-[#161a23]">
            <button onClick={()=>setCat('all')} className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${catFilter==='all'?'bg-[#1D9E75]/20 border-[#1D9E75]/50 text-[#1D9E75]':'border-white/10 text-white/40'}`}>All</button>
            {CATEGORIES.map(c=>(
              <button key={c} onClick={()=>setCat(c)} className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${catFilter===c?'bg-[#1D9E75]/20 border-[#1D9E75]/50 text-[#1D9E75]':'border-white/10 text-white/40'}`}>
                {CAT_EMOJI[c]} {CAT_LABEL[c]}
              </button>
            ))}
          </div>
          <div className="flex-1 overflow-y-auto p-4 space-y-2 pb-4">
            {/* New items are added via Admin → Inventory */}
            {items.map(item=>{
              const isLow = item.minThreshold && item.currentStock < item.minThreshold
              const isOut = item.currentStock===0
              return (
                <div key={item.id} className={`bg-[#161a23] rounded-2xl border p-4 ${isOut?'border-[#E24B4A]/30':isLow?'border-[#BA7517]/30':'border-white/8'}`}>
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <p className="text-sm font-semibold text-white">{item.name}</p>
                      <p className="text-[10px] text-white/35 mt-0.5">{CAT_LABEL[item.category]} · ₹{item.costPerUnit}/{item.unit}</p>
                    </div>
                    <div className="text-right">
                      <p className={`text-2xl font-bold ${isOut?'text-[#E24B4A]':isLow?'text-[#BA7517]':'text-white'}`}>{item.currentStock}</p>
                      <p className="text-[10px] text-white/30">{item.unit}</p>
                      {isLow&&!isOut&&<p className="text-[10px] text-[#BA7517]">Low (min {item.minThreshold})</p>}
                      {isOut&&<p className="text-[10px] text-[#E24B4A]">Out of stock</p>}
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button onClick={()=>openPurchase(item)} className="flex-1 py-2 text-xs font-medium rounded-xl bg-white/8 hover:bg-white/15 text-white border border-white/10 flex items-center justify-center gap-1">
                      <Plus size={11}/> Purchase
                    </button>
                    <button onClick={()=>openIssue(item)} className="flex-1 py-2 text-xs font-semibold rounded-xl border flex items-center justify-center gap-1"
                      style={{background:'#1D9E7518',borderColor:'#1D9E7540',color:'#1D9E75'}}>
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
      {tab==='purchases' && (
        <div className="flex-1 overflow-y-auto p-4 space-y-3 pb-4">
          <div className="bg-[#1D9E75]/10 border border-[#1D9E75]/20 rounded-2xl px-4 py-3">
            <p className="text-xs text-white/50">Total Purchased (all time)</p>
            <p className="text-2xl font-bold text-[#1D9E75]">₹{totalSpend.toLocaleString()}</p>
          </div>
          {purchases.map(p=>{
            const item = inventoryMaster.find(i=>i.id===p.itemId)
            return (
              <div key={p.id} className="bg-[#161a23] rounded-2xl border border-white/8 p-4">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-sm font-semibold text-white">{item?.name||'Unknown item'}</p>
                    <p className="text-xs text-white/40 mt-0.5">{p.vendor}</p>
                    <p className="text-[10px] text-white/30 mt-0.5">{p.date} · {p.invoiceNo||'No invoice'}</p>
                    {p.notes&&<p className="text-[10px] text-white/25 mt-0.5 italic">{p.notes}</p>}
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
          {purchases.length===0&&<p className="text-center text-white/30 text-sm py-8">No purchases recorded yet.</p>}
        </div>
      )}

      {/* ── LABOUR TAB ── */}
      {tab==='labour' && (
        <div className="flex-1 overflow-y-auto p-4 space-y-3 pb-4">
          <div className="bg-[#BA7517]/10 border border-[#BA7517]/20 rounded-2xl px-4 py-3">
            <p className="text-xs text-white/50">Total Labour Cost</p>
            <p className="text-2xl font-bold text-[#BA7517]">₹{totalLabourCost.toLocaleString()}</p>
          </div>
          {labourLogs.map(l=>(
            <div key={l.id} className="bg-[#161a23] rounded-2xl border border-white/8 p-4">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-sm font-semibold text-white">{l.labourName}</p>
                  <p className="text-xs text-white/40 mt-0.5">{l.plotLabel}</p>
                  <p className="text-[10px] text-white/30 mt-0.5">{l.date}</p>
                  {l.purpose&&<p className="text-xs text-white/50 mt-1 italic">{l.purpose}</p>}
                </div>
                <div className="text-right">
                  <p className="text-base font-bold text-white">₹{l.totalCost.toLocaleString()}</p>
                  <p className="text-[10px] text-white/40">{l.workers} workers · {l.hours}h</p>
                  <p className="text-[10px] text-white/30">₹{l.ratePerDay}/day</p>
                </div>
              </div>
            </div>
          ))}
          {labourLogs.length===0&&<p className="text-center text-white/30 text-sm py-8">No labour logs yet. Use Issue Input from a plot.</p>}
        </div>
      )}

      {/* ── SCRAP TAB ── */}
      {tab==='scrap' && (
        <div className="flex-1 overflow-y-auto p-4 space-y-3 pb-4">
          <div className="flex items-center justify-between">
            <div className="bg-[#1D9E75]/10 border border-[#1D9E75]/20 rounded-2xl px-4 py-3 flex-1 mr-3">
              <p className="text-xs text-white/50">Total Scrap Revenue</p>
              <p className="text-2xl font-bold text-[#1D9E75]">₹{totalScrap.toLocaleString()}</p>
            </div>
            <button onClick={()=>{ setForm({ date:new Date().toISOString().slice(0,10) }); setModal('scrap') }}
              className="h-full px-4 py-3 bg-[#1D9E75]/20 border border-[#1D9E75]/40 rounded-2xl text-[#1D9E75] text-xs font-semibold flex items-center gap-1">
              <Plus size={14}/> Add
            </button>
          </div>
          {scrapSales.map(sc=>(
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
          {scrapSales.length===0&&<p className="text-center text-white/30 text-sm py-8">No scrap sales yet.</p>}
        </div>
      )}

      {/* ── MODALS ── */}

      {modal==='newItem'&&(
        <Modal title="Add Item to Master" onClose={()=>setModal(null)}>
          <div className="space-y-3">
            <FRow label="Item name"><input className="finput" placeholder="e.g. DAP" value={form.name||''} onChange={e=>f('name',e.target.value)}/></FRow>
            <FRow label="Category">
              <select className="finput" value={form.category||''} onChange={e=>f('category',e.target.value)} style={{background:'#1a2030'}}>
                {CATEGORIES.map(c=><option key={c} value={c} style={{background:'#1a2030'}}>{CAT_LABEL[c]}</option>)}
              </select>
            </FRow>
            <FRow label="Unit"><input className="finput" placeholder="kg / litre / bag" value={form.unit||''} onChange={e=>f('unit',e.target.value)}/></FRow>
            <div className="grid grid-cols-2 gap-2">
              <FRow label="Cost/unit (₹)"><input type="number" className="finput" value={form.costPerUnit||''} onChange={e=>f('costPerUnit',e.target.value)}/></FRow>
              <FRow label="Min stock"><input type="number" className="finput" value={form.minThreshold||''} onChange={e=>f('minThreshold',e.target.value)}/></FRow>
            </div>
            <button onClick={confirmNewItem} className="w-full py-3 bg-[#1D9E75] text-white text-sm font-bold rounded-xl">Add Item</button>
          </div>
        </Modal>
      )}

      {modal==='purchase'&&selected&&(
        <Modal title={`Purchase — ${selected.name}`} onClose={()=>setModal(null)}>
          <div className="space-y-3">
            <p className="text-xs text-white/40">Current stock: <span className="text-white">{selected.currentStock} {selected.unit}</span></p>
            <FRow label="Date"><input type="date" className="finput" value={form.date||''} onChange={e=>f('date',e.target.value)} style={{colorScheme:'dark'}}/></FRow>
            <div className="grid grid-cols-2 gap-2">
              <FRow label={`Qty (${selected.unit})`}><input type="number" className="finput" placeholder="0" value={form.qty||''} onChange={e=>f('qty',e.target.value)}/></FRow>
              <FRow label="Price/unit (₹)"><input type="number" className="finput" value={form.unitPrice||''} onChange={e=>f('unitPrice',e.target.value)}/></FRow>
            </div>
            {form.qty&&form.unitPrice&&(
              <div className="bg-[#1D9E75]/10 border border-[#1D9E75]/20 rounded-xl px-3 py-2">
                <p className="text-xs text-white/50">Total cost</p>
                <p className="text-lg font-bold text-[#1D9E75]">₹{(parseFloat(form.qty)*parseFloat(form.unitPrice)).toLocaleString()}</p>
              </div>
            )}
            <FRow label="Vendor name"><input className="finput" placeholder="e.g. Ram Fertilizers" value={form.vendor||''} onChange={e=>f('vendor',e.target.value)}/></FRow>
            <FRow label="Invoice / Bill no."><input className="finput" placeholder="optional" value={form.invoiceNo||''} onChange={e=>f('invoiceNo',e.target.value)}/></FRow>
            <FRow label="Notes"><input className="finput" placeholder="optional" value={form.notes||''} onChange={e=>f('notes',e.target.value)}/></FRow>
            <button onClick={confirmPurchase} className="w-full py-3 bg-[#1D9E75] text-white text-sm font-bold rounded-xl">Confirm Purchase</button>
          </div>
        </Modal>
      )}

      {modal==='issue'&&selected&&(
        <Modal title={`Issue — ${selected.name}`} onClose={()=>setModal(null)}>
          <div className="space-y-3">
            <p className="text-xs text-white/40">Stock: <span className="text-white">{selected.currentStock} {selected.unit}</span></p>
            <FRow label="Date"><input type="date" className="finput" value={form.date||''} onChange={e=>f('date',e.target.value)} style={{colorScheme:'dark'}}/></FRow>
            <FRow label={`Qty (${selected.unit})`}><input type="number" className="finput" placeholder="0" value={form.qty||''} onChange={e=>f('qty',e.target.value)}/></FRow>
            <FRow label="Crop Cycle / Plot">
              <select className="finput" value={form.cropCycleId||''} onChange={e=>{
                const id = e.target.value
                if (id==='__farm__') { f('cropCycleId','__farm__'); f('plotId','all'); f('plotLabel','Farm-wide') }
                else {
                  const cycle = cropCycles.find(c=>c.id===id)
                  const crop  = cropMaster.find(c=>c.id===cycle?.cropId)
                  f('cropCycleId', id)
                  f('plotId', cycle?.plotId||'')
                  f('plotLabel', cycle ? `${cycle.plotLabel} — ${crop?.name||''}` : '')
                }
              }} style={{background:'#1a2030'}}>
                <option value="" style={{background:'#1a2030'}}>Select cycle…</option>
                {cropCycles.filter(c=>c.status==='active').map(c=>{
                  const crop = cropMaster.find(cr=>cr.id===c.cropId)
                  return <option key={c.id} value={c.id} style={{background:'#1a2030'}}>{c.plotLabel} — {crop?.name||c.cropId}</option>
                })}
                <option value="__farm__" style={{background:'#1a2030'}}>Farm-wide (diesel / shared)</option>
              </select>
            </FRow>
            <FRow label="Purpose"><input className="finput" placeholder="e.g. Top dressing" value={form.purpose||''} onChange={e=>f('purpose',e.target.value)}/></FRow>
            <button onClick={confirmIssue} className="w-full py-3 bg-[#1D9E75] text-white text-sm font-bold rounded-xl">Confirm Issue</button>
          </div>
        </Modal>
      )}

      {modal==='scrap'&&(
        <Modal title="Record Scrap Sale" onClose={()=>setModal(null)}>
          <div className="space-y-3">
            <FRow label="Date"><input type="date" className="finput" value={form.date||''} onChange={e=>f('date',e.target.value)} style={{colorScheme:'dark'}}/></FRow>
            <FRow label="Description"><input className="finput" placeholder="e.g. Empty fertilizer bags" value={form.description||''} onChange={e=>f('description',e.target.value)}/></FRow>
            <div className="grid grid-cols-2 gap-2">
              <FRow label="Qty"><input type="number" className="finput" value={form.qty||''} onChange={e=>f('qty',e.target.value)}/></FRow>
              <FRow label="Unit"><input className="finput" placeholder="bags/kg/lot" value={form.unit||''} onChange={e=>f('unit',e.target.value)}/></FRow>
            </div>
            <FRow label="Rate (₹)"><input type="number" className="finput" value={form.rate||''} onChange={e=>f('rate',e.target.value)}/></FRow>
            {form.qty&&form.rate&&<div className="bg-[#1D9E75]/10 border border-[#1D9E75]/20 rounded-xl px-3 py-2"><p className="text-xs text-white/50">Total</p><p className="text-lg font-bold text-[#1D9E75]">₹{(parseFloat(form.qty)*parseFloat(form.rate)).toLocaleString()}</p></div>}
            <FRow label="Buyer"><input className="finput" placeholder="optional" value={form.buyer||''} onChange={e=>f('buyer',e.target.value)}/></FRow>
            <button onClick={confirmScrap} className="w-full py-3 bg-[#1D9E75] text-white text-sm font-bold rounded-xl">Record Sale</button>
          </div>
        </Modal>
      )}

      {toast&&(
        <div className="fixed bottom-24 left-4 right-4 px-4 py-3 rounded-2xl text-sm font-medium text-white shadow-xl z-50 flex items-center gap-2 bg-[#1D9E75]">
          <CheckCircle2 size={16}/> {toast}
        </div>
      )}
      <style>{`.finput{width:100%;background:rgba(255,255,255,0.08);border:1px solid rgba(255,255,255,0.12);border-radius:12px;padding:10px 14px;color:white;font-size:14px;outline:none;}.finput:focus{border-color:#1D9E75;}.no-scrollbar::-webkit-scrollbar{display:none;}.no-scrollbar{-ms-overflow-style:none;scrollbar-width:none;}`}</style>
    </div>
  )
}

function Modal({ title, onClose, children }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end" style={{background:'rgba(0,0,0,0.7)'}} onClick={onClose}>
      <div className="w-full bg-[#161a23] rounded-t-3xl p-5 max-h-[90vh] overflow-y-auto border-t border-white/10" onClick={e=>e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-bold text-white">{title}</h3>
          <button onClick={onClose} className="text-white/40 hover:text-white"><X size={18}/></button>
        </div>
        {children}
      </div>
    </div>
  )
}

function FRow({ label, children }) {
  return <div><label className="text-xs font-medium text-white/50 block mb-1.5">{label}</label>{children}</div>
}

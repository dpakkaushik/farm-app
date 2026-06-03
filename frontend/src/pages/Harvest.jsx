import React, { useState } from 'react'
import { Wheat, ChevronRight, CheckCircle2, X, Plus } from 'lucide-react'
import { useAppStore } from '../store'

const TODAY = new Date('2026-06-02')
const daysUntil = (dateStr) => Math.ceil((new Date(dateStr) - TODAY) / 86400000)
const daysAgo   = (dateStr) => Math.ceil((TODAY - new Date(dateStr)) / 86400000)

export default function Harvest() {
  const { cropCycles, cropMaster, updateCropCycle, addCropCycle } = useAppStore()
  const [modal, setModal] = useState(null)  // 'record' | 'newCycle'
  const [selected, setSelected] = useState(null)
  const [form, setForm]   = useState({})
  const [toast, setToast] = useState(null)

  const f = (k,v) => setForm(p=>({...p,[k]:v}))
  const showToast = (msg) => { setToast(msg); setTimeout(()=>setToast(null), 3000) }

  const active   = cropCycles.filter(c=>c.status==='active')
  const harvested = cropCycles.filter(c=>c.status==='harvested').slice(0,10)

  const openRecord = (cycle) => {
    setSelected(cycle)
    setForm({ date: new Date().toISOString().slice(0,10), qtyPerAcre:'', quality:'A', buyer:'', rate:'', notes:'' })
    setModal('record')
  }

  const confirmRecord = () => {
    if (!form.qtyPerAcre||!selected) return
    const totalQtl = (parseFloat(form.qtyPerAcre)*selected.acres).toFixed(1)
    const revenue  = form.rate ? (parseFloat(totalQtl)*parseFloat(form.rate)).toFixed(0) : 0
    updateCropCycle(selected.id, { status:'harvested', actualHarvestDate:form.date,
      harvestQtl:totalQtl, revenue:parseFloat(revenue), quality:form.quality, buyer:form.buyer })
    showToast(`Harvest recorded — ${totalQtl} qtl`)
    setModal(null)
  }

  const openNewCycle = () => {
    setForm({ plotLabel:'', cropId:'', sowDate: new Date().toISOString().slice(0,10), acres:'' })
    setModal('newCycle')
  }

  const confirmNewCycle = () => {
    if (!form.plotLabel||!form.cropId||!form.sowDate) return
    const crop = cropMaster.find(c=>c.id===form.cropId)
    const harvestDate = new Date(form.sowDate)
    harvestDate.setDate(harvestDate.getDate()+(crop?.duration_days||120))
    addCropCycle({
      plotId: form.plotLabel.toLowerCase().replace(/\s/g,''),
      plotLabel: form.plotLabel, cropId: form.cropId,
      sowDate: form.sowDate,
      harvestDate: harvestDate.toISOString().slice(0,10),
      status:'active', acres: parseFloat(form.acres)||1,
    })
    showToast('Crop cycle started!'); setModal(null)
  }

  return (
    <div className="h-full flex flex-col bg-[#0f1117]">
      <div className="shrink-0 px-4 pt-4 pb-2 flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-white">Harvest</h2>
          <p className="text-xs text-white/40">{active.length} active crop cycles</p>
        </div>
        <button onClick={openNewCycle} className="flex items-center gap-1.5 px-3 py-2 bg-[#1D9E75]/20 border border-[#1D9E75]/40 rounded-xl text-xs text-[#1D9E75] font-semibold">
          <Plus size={13}/> New Cycle
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-4 pb-6 space-y-3">
        {/* Active cycles */}
        {active.length===0&&<p className="text-center text-white/30 text-sm py-8">No active crop cycles.</p>}
        {active.map(cycle=>{
          const remaining = daysUntil(cycle.harvestDate)
          const daysSown  = daysAgo(cycle.sowDate)
          const crop      = cropMaster.find(c=>c.id===cycle.cropId)
          const pct       = crop?.duration_days ? Math.min(100,Math.round(daysSown/crop.duration_days*100)) : 0
          const isReady   = remaining <= 0
          const isNear    = remaining > 0 && remaining <= 14
          return (
            <div key={cycle.id} className={`bg-[#161a23] rounded-2xl border p-4 ${isReady?'border-[#1D9E75]/50':isNear?'border-[#BA7517]/40':'border-white/8'}`}>
              <div className="flex items-start justify-between mb-3">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-base">{crop?.emoji||'🌾'}</span>
                    <p className="text-sm font-bold text-white">{crop?.name||cycle.cropId}</p>
                    {isReady && <span className="text-[10px] px-2 py-0.5 rounded-full bg-[#1D9E75]/20 text-[#1D9E75] font-semibold pulse">READY</span>}
                    {isNear  && <span className="text-[10px] px-2 py-0.5 rounded-full bg-[#BA7517]/20 text-[#BA7517] font-semibold">Soon</span>}
                  </div>
                  <p className="text-xs text-white/40 mt-0.5">{cycle.plotLabel} · {cycle.acres} acres</p>
                  <p className="text-[10px] text-white/30 mt-0.5">Sown {cycle.sowDate}</p>
                </div>
                <div className="text-right">
                  {isReady ? (
                    <p className="text-lg font-bold text-[#1D9E75]">Harvest!</p>
                  ) : (
                    <>
                      <p className="text-2xl font-bold text-white">{remaining}</p>
                      <p className="text-[10px] text-white/40">days left</p>
                    </>
                  )}
                  <p className="text-[10px] text-white/30 mt-1">Day {daysSown}</p>
                </div>
              </div>
              <div className="mb-3">
                <div className="flex justify-between text-[10px] text-white/30 mb-1">
                  <span>Progress</span><span>{pct}%</span>
                </div>
                <div className="h-1.5 bg-white/10 rounded-full overflow-hidden">
                  <div className="h-full rounded-full transition-all" style={{width:`${pct}%`,background:isReady?'#1D9E75':isNear?'#BA7517':'rgba(220,180,40,0.8)'}}/>
                </div>
              </div>
              {crop?.yieldPerAcre&&(
                <p className="text-[10px] text-white/30 mb-3">
                  Est. yield: ~{Math.round(crop.yieldPerAcre*cycle.acres)} qtl · ₹{Math.round(crop.yieldPerAcre*cycle.acres*(crop.pricePerQtl||0)/1000)}k est. revenue
                </p>
              )}
              <button onClick={()=>openRecord(cycle)}
                className={`w-full py-2.5 text-xs font-bold rounded-xl border transition-colors ${isReady?'bg-[#1D9E75] text-white border-transparent':'bg-white/5 text-white/60 border-white/10 hover:bg-white/10'}`}>
                {isReady ? '🎯 Record Harvest' : 'Record Harvest'}
              </button>
            </div>
          )
        })}

        {/* Past harvests */}
        {harvested.length>0&&(
          <>
            <div className="pt-2 pb-1"><p className="text-xs font-semibold text-white/40 uppercase tracking-wide">Past Harvests</p></div>
            {harvested.map(h=>(
              <div key={h.id} className="bg-[#161a23] rounded-2xl border border-white/5 p-4 opacity-70">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-semibold text-white">{cropMaster.find(c=>c.id===h.cropId)?.name||h.cropId} — {h.plotLabel}</p>
                    <p className="text-xs text-white/40">{h.actualHarvestDate} · {h.acres} acres</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-bold text-[#1D9E75]">{h.harvestQtl} qtl</p>
                    {h.revenue>0&&<p className="text-[10px] text-white/40">₹{parseFloat(h.revenue).toLocaleString()}</p>}
                  </div>
                </div>
              </div>
            ))}
          </>
        )}
      </div>

      {/* Record Harvest Modal */}
      {modal==='record'&&selected&&(
        <div className="fixed inset-0 z-50 flex items-end" style={{background:'rgba(0,0,0,0.7)'}} onClick={()=>setModal(null)}>
          <div className="w-full bg-[#161a23] rounded-t-3xl p-5 max-h-[85vh] overflow-y-auto border-t border-white/10" onClick={e=>e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-bold text-white">Record Harvest — {selected.plotLabel}</h3>
              <button onClick={()=>setModal(null)} className="text-white/40"><X size={18}/></button>
            </div>
            <div className="space-y-3">
              <div><label className="text-xs text-white/50 block mb-1">Harvest date</label>
                <input type="date" value={form.date} onChange={e=>f('date',e.target.value)} className="finput" style={{colorScheme:'dark'}}/></div>
              <div><label className="text-xs text-white/50 block mb-1">Yield per acre (qtl)</label>
                <input type="number" placeholder="e.g. 15" value={form.qtyPerAcre} onChange={e=>f('qtyPerAcre',e.target.value)} className="finput"/></div>
              {form.qtyPerAcre&&(
                <div className="bg-[#1D9E75]/10 border border-[#1D9E75]/20 rounded-xl px-3 py-2">
                  <p className="text-xs text-white/50">Total yield ({selected.acres} acres)</p>
                  <p className="text-xl font-bold text-[#1D9E75]">{(parseFloat(form.qtyPerAcre)*selected.acres).toFixed(1)} qtl</p>
                </div>
              )}
              <div><label className="text-xs text-white/50 block mb-1">Quality grade</label>
                <select value={form.quality} onChange={e=>f('quality',e.target.value)} className="finput" style={{background:'#1a2030'}}>
                  {['A','B','C'].map(g=><option key={g} value={g} style={{background:'#1a2030'}}>Grade {g}</option>)}
                </select></div>
              <div><label className="text-xs text-white/50 block mb-1">Buyer (optional)</label>
                <input placeholder="Buyer name" value={form.buyer} onChange={e=>f('buyer',e.target.value)} className="finput"/></div>
              <div><label className="text-xs text-white/50 block mb-1">Sale rate ₹/qtl (optional)</label>
                <input type="number" placeholder="e.g. 2200" value={form.rate} onChange={e=>f('rate',e.target.value)} className="finput"/></div>
              <button onClick={confirmRecord} className="w-full py-3 bg-[#1D9E75] text-white text-sm font-bold rounded-xl">Confirm Harvest</button>
            </div>
          </div>
        </div>
      )}

      {/* New Cycle Modal */}
      {modal==='newCycle'&&(
        <div className="fixed inset-0 z-50 flex items-end" style={{background:'rgba(0,0,0,0.7)'}} onClick={()=>setModal(null)}>
          <div className="w-full bg-[#161a23] rounded-t-3xl p-5 max-h-[85vh] overflow-y-auto border-t border-white/10" onClick={e=>e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-bold text-white">Start New Crop Cycle</h3>
              <button onClick={()=>setModal(null)} className="text-white/40"><X size={18}/></button>
            </div>
            <div className="space-y-3">
              <div><label className="text-xs text-white/50 block mb-1">Plot / Field name</label>
                <input placeholder="e.g. Plot H" value={form.plotLabel||''} onChange={e=>f('plotLabel',e.target.value)} className="finput"/></div>
              <div><label className="text-xs text-white/50 block mb-1">Crop</label>
                <select value={form.cropId||''} onChange={e=>f('cropId',e.target.value)} className="finput" style={{background:'#1a2030'}}>
                  <option value="" style={{background:'#1a2030'}}>Select crop…</option>
                  {useAppStore.getState().cropMaster.map(c=><option key={c.id} value={c.id} style={{background:'#1a2030'}}>{c.emoji} {c.name} ({c.duration_days} days)</option>)}
                </select></div>
              <div><label className="text-xs text-white/50 block mb-1">Acres</label>
                <input type="number" placeholder="e.g. 2.5" value={form.acres||''} onChange={e=>f('acres',e.target.value)} className="finput"/></div>
              <div><label className="text-xs text-white/50 block mb-1">Sowing date</label>
                <input type="date" value={form.sowDate||''} onChange={e=>f('sowDate',e.target.value)} className="finput" style={{colorScheme:'dark'}}/></div>
              <button onClick={confirmNewCycle} className="w-full py-3 bg-[#1D9E75] text-white text-sm font-bold rounded-xl">Start Cycle</button>
            </div>
          </div>
        </div>
      )}

      {toast&&<div className="fixed bottom-24 left-4 right-4 px-4 py-3 rounded-2xl text-sm font-medium text-white shadow-xl z-50 flex items-center gap-2 bg-[#1D9E75]"><CheckCircle2 size={16}/>{toast}</div>}
      <style>{`.finput{width:100%;background:rgba(255,255,255,0.08);border:1px solid rgba(255,255,255,0.12);border-radius:12px;padding:10px 14px;color:white;font-size:14px;outline:none;}.finput:focus{border-color:#1D9E75;}.pulse{animation:pulse-ring 1.8s ease-in-out infinite;}@keyframes pulse-ring{0%,100%{opacity:1}50%{opacity:0.4}}`}</style>
    </div>
  )
}

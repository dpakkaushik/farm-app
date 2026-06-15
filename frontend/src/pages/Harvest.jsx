import React, { useState } from 'react'
import { CheckCircle2, X, Plus, AlertTriangle } from 'lucide-react'
import { useAppStore } from '../store'

const daysAgo   = (dateStr) => Math.floor((new Date() - new Date(dateStr)) / 86400000)

function computeSeason(sowDateStr) {
  const d = new Date(sowDateStr)
  const month = d.getMonth() + 1
  const year  = d.getFullYear()
  if (month >= 10) return `rabi_${year}`
  if (month >= 4)  return `kharif_${year}`
  return `rabi_${year - 1}`
}

export default function Harvest() {
  const { cropCycles, cropMaster, plots, updateCropCycle, addCropCycle } = useAppStore()
  const [modal,    setModal]    = useState(null)   // 'record' | 'newCycle'
  const [selected, setSelected] = useState(null)
  const [form,     setForm]     = useState({})
  const [toast,    setToast]    = useState(null)
  const [saving,   setSaving]   = useState(false)

  const f = (k, v) => setForm(p => ({ ...p, [k]: v }))
  const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(null), 3500) }

  const active    = cropCycles.filter(c => c.status === 'active')
  const harvested = cropCycles.filter(c => c.status === 'harvested').slice(0, 10)

  const openRecord = (cycle) => {
    setSelected(cycle)
    setForm({ date: new Date().toISOString().slice(0, 10), qtyPerAcre: '', quality: 'A', buyer: '', rate: '', notes: '' })
    setModal('record')
  }

  const confirmRecord = async () => {
    if (!form.qtyPerAcre || !selected || saving) return
    setSaving(true)
    try {
      const crop     = cropMaster.find(c => c.id === selected.cropId)
      const totalQtl = (parseFloat(form.qtyPerAcre) * selected.acres).toFixed(1)
      const revenue  = form.rate ? (parseFloat(totalQtl) * parseFloat(form.rate)).toFixed(0) : 0

      if (crop?.ratoonCropId) {
        // Create ratoon cycle FIRST so plot never shows as empty between harvests
        const ratoonCrop = cropMaster.find(c => c.id === crop.ratoonCropId)
        const ratoonHarvestDate = new Date(form.date)
        ratoonHarvestDate.setDate(ratoonHarvestDate.getDate() + (ratoonCrop?.duration_days || 300))
        await addCropCycle({
          plotId:        selected.plotId,
          cropId:        crop.ratoonCropId,
          sowDate:       form.date,
          harvestDate:   ratoonHarvestDate.toISOString().slice(0, 10),
          season:        computeSeason(form.date),
          parentCycleId: selected.id,
        })
      }

      await updateCropCycle(selected.id, {
        status:            'harvested',
        actualHarvestDate: form.date,
        harvestQtl:        totalQtl,
        revenue:           parseFloat(revenue),
        quality:           form.quality,
        buyer:             form.buyer,
      })

      const suffix = crop?.ratoonCropId ? ' · Ratoon started 🌱' : ''
      showToast(`Harvest recorded — ${totalQtl} qtl${suffix}`)
      setModal(null)
    } finally {
      setSaving(false)
    }
  }

  const openNewCycle = () => {
    setForm({ plotId: '', cropId: '', sowDate: new Date().toISOString().slice(0, 10) })
    setModal('newCycle')
  }

  const confirmNewCycle = async () => {
    if (!form.plotId || !form.cropId || !form.sowDate || saving) return
    const plot = plots.find(p => p.id === form.plotId)
    const crop = cropMaster.find(c => c.id === form.cropId)
    if (!plot || !crop) return
    setSaving(true)
    try {
      const harvestDate = new Date(form.sowDate)
      harvestDate.setDate(harvestDate.getDate() + crop.duration_days)
      await addCropCycle({
        plotId:    plot.id,
        cropId:    form.cropId,
        sowDate:   form.sowDate,
        harvestDate: harvestDate.toISOString().slice(0, 10),
        season:    computeSeason(form.sowDate),
      })
      showToast('Crop cycle started!')
      setModal(null)
    } finally {
      setSaving(false)
    }
  }

  const selectedPlotForNew = plots.find(p => p.id === form.plotId)
  const newPlotHasActive   = form.plotId
    ? cropCycles.some(c => c.plotId === form.plotId && c.status === 'active')
    : false

  return (
    <div className="h-full flex flex-col bg-[var(--c-bg)]">
      <div className="shrink-0 px-4 pt-4 pb-2 flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-[var(--c-text)]">Harvest</h2>
          <p className="text-xs text-[var(--c-muted)]">{active.length} active crop cycle{active.length !== 1 ? 's' : ''}</p>
        </div>
        <button onClick={openNewCycle} className="flex items-center gap-1.5 px-3 py-2 bg-[#1D9E75]/20 border border-[#1D9E75]/40 rounded-xl text-xs text-[#1D9E75] font-semibold">
          <Plus size={13}/> New Cycle
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-4 pb-6 space-y-3">
        {active.length === 0 && <p className="text-center text-[var(--c-faint)] text-sm py-8">No active crop cycles.</p>}

        {active.map(cycle => {
          const crop         = cropMaster.find(c => c.id === cycle.cropId)
          const daysSown     = daysAgo(cycle.sowDate)
          const totalDays    = crop?.duration_days || 120
          const windowOpenDay = totalDays - (crop?.harvest_window_days || 14)
          const daysToWindow  = windowOpenDay - daysSown
          const isReady       = daysToWindow <= 0
          const isNear        = !isReady && daysToWindow <= 14
          const pct           = Math.min(100, Math.round(daysSown / totalDays * 100))

          return (
            <div key={cycle.id} className={`bg-[var(--c-nav)] rounded-2xl border p-4 ${isReady ? 'border-[#1D9E75]/50' : isNear ? 'border-[#BA7517]/40' : 'border-[var(--c-border)]'}`}>
              <div className="flex items-start justify-between mb-3">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-base">{crop?.emoji || '🌾'}</span>
                    <p className="text-sm font-bold text-[var(--c-text)]">{crop?.name || cycle.cropId}</p>
                    {isReady && <span className="text-[10px] px-2 py-0.5 rounded-full bg-[#1D9E75]/20 text-[#1D9E75] font-semibold pulse">READY</span>}
                    {isNear  && <span className="text-[10px] px-2 py-0.5 rounded-full bg-[#BA7517]/20 text-[#BA7517] font-semibold">Soon</span>}
                    {cycle.parentCycleId && <span className="text-[10px] px-2 py-0.5 rounded-full bg-white/10 text-white/50 font-medium">Ratoon</span>}
                  </div>
                  <p className="text-xs text-[var(--c-muted)] mt-0.5">{cycle.plotLabel} · {cycle.acres} acres</p>
                  <p className="text-[10px] text-[var(--c-faint)] mt-0.5">Sown {cycle.sowDate}</p>
                </div>
                <div className="text-right">
                  {isReady ? (
                    <p className="text-lg font-bold text-[#1D9E75]">Harvest!</p>
                  ) : (
                    <>
                      <p className="text-2xl font-bold text-[var(--c-text)]">{daysToWindow}</p>
                      <p className="text-[10px] text-[var(--c-muted)]">days to harvest</p>
                    </>
                  )}
                  <p className="text-[10px] text-[var(--c-faint)] mt-1">Day {daysSown}</p>
                </div>
              </div>

              <div className="mb-3">
                <div className="flex justify-between text-[10px] text-[var(--c-faint)] mb-1">
                  <span>Progress</span><span>{pct}%</span>
                </div>
                <div className="h-1.5 bg-[var(--c-ghost)] rounded-full overflow-hidden">
                  <div className="h-full rounded-full transition-all"
                    style={{ width: `${pct}%`, background: isReady ? '#1D9E75' : isNear ? '#BA7517' : 'rgba(220,180,40,0.8)' }}/>
                </div>
              </div>

              {crop?.yieldPerAcre > 0 && (
                <p className="text-[10px] text-[var(--c-faint)] mb-3">
                  Est. yield: ~{Math.round(crop.yieldPerAcre * cycle.acres)} qtl
                  {crop.pricePerQtl > 0 && ` · ₹${Math.round(crop.yieldPerAcre * cycle.acres * crop.pricePerQtl / 1000)}k est. revenue`}
                </p>
              )}

              <button
                onClick={() => isReady && openRecord(cycle)}
                disabled={!isReady}
                className={`w-full py-2.5 text-xs font-bold rounded-xl border transition-colors ${
                  isReady
                    ? 'bg-[#1D9E75] text-white border-transparent cursor-pointer'
                    : 'bg-[var(--c-card)] text-[var(--c-sub)] border-[var(--c-border-md)] opacity-60 cursor-not-allowed'
                }`}>
                {isReady
                  ? `🎯 Record Harvest${crop?.ratoonCropId ? ' · Ratoon auto-starts' : ''}`
                  : `Harvest window opens in ${daysToWindow} day${daysToWindow !== 1 ? 's' : ''}`}
              </button>
            </div>
          )
        })}

        {harvested.length > 0 && (
          <>
            <div className="pt-2 pb-1"><p className="text-xs font-semibold text-[var(--c-muted)] uppercase tracking-wide">Past Harvests</p></div>
            {harvested.map(h => (
              <div key={h.id} className="bg-[var(--c-nav)] rounded-2xl border border-[var(--c-border)] p-4 opacity-70">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-semibold text-[var(--c-text)]">
                      {cropMaster.find(c => c.id === h.cropId)?.name || h.cropId} — {h.plotLabel}
                    </p>
                    <p className="text-xs text-[var(--c-muted)]">{h.actualHarvestDate} · {h.acres} acres</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-bold text-[#1D9E75]">{h.harvestQtl} qtl</p>
                    {h.revenue > 0 && <p className="text-[10px] text-[var(--c-muted)]">₹{parseFloat(h.revenue).toLocaleString()}</p>}
                  </div>
                </div>
              </div>
            ))}
          </>
        )}
      </div>

      {/* Record Harvest Modal */}
      {modal === 'record' && selected && (
        <div className="fixed inset-0 z-50 flex items-end" style={{ background: 'rgba(0,0,0,0.7)' }} onClick={() => !saving && setModal(null)}>
          <div className="w-full bg-[var(--c-nav)] rounded-t-3xl p-5 max-h-[85vh] overflow-y-auto border-t border-[var(--c-border-md)]" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-bold text-[var(--c-text)]">Record Harvest — {selected.plotLabel}</h3>
              <button onClick={() => !saving && setModal(null)} className="text-[var(--c-muted)]"><X size={18}/></button>
            </div>

            {(() => {
              const crop = cropMaster.find(c => c.id === selected.cropId)
              return crop?.ratoonCropId ? (
                <div className="bg-[#1D9E75]/10 border border-[#1D9E75]/20 rounded-xl px-3 py-2.5 mb-4 flex items-start gap-2">
                  <span className="text-sm">🌱</span>
                  <p className="text-xs text-[#1D9E75] leading-relaxed">
                    After recording this harvest, <strong>{cropMaster.find(c => c.id === crop.ratoonCropId)?.name}</strong> will automatically start on this plot.
                  </p>
                </div>
              ) : null
            })()}

            <div className="space-y-3">
              <div><label className="text-xs text-[var(--c-sub)] block mb-1">Harvest date</label>
                <input type="date" value={form.date} onChange={e => f('date', e.target.value)} className="finput" style={{ colorScheme: 'dark' }}/></div>
              <div><label className="text-xs text-[var(--c-sub)] block mb-1">Yield per acre (qtl)</label>
                <input type="number" placeholder="e.g. 15" value={form.qtyPerAcre} onChange={e => f('qtyPerAcre', e.target.value)} className="finput"/></div>
              {form.qtyPerAcre && (
                <div className="bg-[#1D9E75]/10 border border-[#1D9E75]/20 rounded-xl px-3 py-2">
                  <p className="text-xs text-[var(--c-sub)]">Total yield ({selected.acres} acres)</p>
                  <p className="text-xl font-bold text-[#1D9E75]">{(parseFloat(form.qtyPerAcre) * selected.acres).toFixed(1)} qtl</p>
                </div>
              )}
              <div><label className="text-xs text-[var(--c-sub)] block mb-1">Quality grade</label>
                <select value={form.quality} onChange={e => f('quality', e.target.value)} className="finput" style={{ background: '#1a2030' }}>
                  {['A', 'B', 'C'].map(g => <option key={g} value={g} style={{ background: '#1a2030' }}>Grade {g}</option>)}
                </select></div>
              <div><label className="text-xs text-[var(--c-sub)] block mb-1">Buyer (optional)</label>
                <input placeholder="Buyer name" value={form.buyer} onChange={e => f('buyer', e.target.value)} className="finput"/></div>
              <div><label className="text-xs text-[var(--c-sub)] block mb-1">Sale rate ₹/qtl (optional)</label>
                <input type="number" placeholder="e.g. 2200" value={form.rate} onChange={e => f('rate', e.target.value)} className="finput"/></div>
              <button onClick={confirmRecord} disabled={saving || !form.qtyPerAcre}
                className="w-full py-3 bg-[#1D9E75] text-white text-sm font-bold rounded-xl disabled:opacity-50">
                {saving ? 'Saving…' : 'Confirm Harvest'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* New Cycle Modal */}
      {modal === 'newCycle' && (
        <div className="fixed inset-0 z-50 flex items-end" style={{ background: 'rgba(0,0,0,0.7)' }} onClick={() => !saving && setModal(null)}>
          <div className="w-full bg-[var(--c-nav)] rounded-t-3xl p-5 max-h-[85vh] overflow-y-auto border-t border-[var(--c-border-md)]" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-bold text-[var(--c-text)]">Start New Crop Cycle</h3>
              <button onClick={() => !saving && setModal(null)} className="text-[var(--c-muted)]"><X size={18}/></button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="text-xs text-[var(--c-sub)] block mb-1">Plot</label>
                <select value={form.plotId || ''} onChange={e => f('plotId', e.target.value)} className="finput" style={{ background: '#1a2030' }}>
                  <option value="" style={{ background: '#1a2030' }}>Select plot…</option>
                  {plots.map(p => {
                    const hasActive = cropCycles.some(c => c.plotId === p.id && c.status === 'active')
                    return (
                      <option key={p.id} value={p.id} style={{ background: '#1a2030' }}>
                        {p.name} ({Number(p.area_acres).toFixed(1)} ac){hasActive ? ' · +Mixed' : ''}
                      </option>
                    )
                  })}
                </select>
              </div>

              {newPlotHasActive && (
                <div className="bg-[#BA7517]/10 border border-[#BA7517]/30 rounded-xl px-3 py-2.5 flex items-start gap-2">
                  <AlertTriangle size={14} className="text-[#BA7517] shrink-0 mt-0.5"/>
                  <p className="text-xs text-[#BA7517] leading-relaxed">
                    {selectedPlotForNew?.name} already has an active crop. Adding another creates a <strong>mixed crop cycle</strong>.
                  </p>
                </div>
              )}

              <div>
                <label className="text-xs text-[var(--c-sub)] block mb-1">Crop</label>
                <select value={form.cropId || ''} onChange={e => f('cropId', e.target.value)} className="finput" style={{ background: '#1a2030' }}>
                  <option value="" style={{ background: '#1a2030' }}>Select crop…</option>
                  {cropMaster.map(c => (
                    <option key={c.id} value={c.id} style={{ background: '#1a2030' }}>
                      {c.emoji} {c.name} ({c.duration_days}d · window ±{c.harvest_window_days}d)
                    </option>
                  ))}
                </select>
              </div>

              {form.plotId && selectedPlotForNew && (
                <div className="bg-[var(--c-ghost)] rounded-xl px-3 py-2">
                  <p className="text-[10px] text-[var(--c-faint)]">Plot size</p>
                  <p className="text-sm font-semibold text-[var(--c-text)]">{Number(selectedPlotForNew.area_acres).toFixed(1)} acres</p>
                </div>
              )}

              <div>
                <label className="text-xs text-[var(--c-sub)] block mb-1">Sowing date</label>
                <input type="date" value={form.sowDate || ''} onChange={e => f('sowDate', e.target.value)} className="finput" style={{ colorScheme: 'dark' }}/>
              </div>

              {form.cropId && form.sowDate && (() => {
                const crop = cropMaster.find(c => c.id === form.cropId)
                if (!crop) return null
                const windowOpen = new Date(form.sowDate)
                windowOpen.setDate(windowOpen.getDate() + crop.duration_days - crop.harvest_window_days)
                return (
                  <div className="bg-[#1D9E75]/8 border border-[#1D9E75]/15 rounded-xl px-3 py-2">
                    <p className="text-[10px] text-[var(--c-faint)]">Harvest window opens</p>
                    <p className="text-sm font-semibold text-[#1D9E75]">{windowOpen.toLocaleDateString('en-IN', { day:'numeric', month:'short', year:'numeric' })}</p>
                    <p className="text-[10px] text-[var(--c-faint)]">±{crop.harvest_window_days} days from {crop.duration_days}d growing period</p>
                  </div>
                )
              })()}

              <button onClick={confirmNewCycle} disabled={saving || !form.plotId || !form.cropId || !form.sowDate}
                className="w-full py-3 bg-[#1D9E75] text-white text-sm font-bold rounded-xl disabled:opacity-50">
                {saving ? 'Starting…' : newPlotHasActive ? 'Start Mixed Cycle' : 'Start Cycle'}
              </button>
            </div>
          </div>
        </div>
      )}

      {toast && (
        <div className="fixed bottom-24 left-4 right-4 px-4 py-3 rounded-2xl text-sm font-medium text-white shadow-xl z-50 flex items-center gap-2 bg-[#1D9E75]">
          <CheckCircle2 size={16}/>{toast}
        </div>
      )}

      <style>{`
        .finput{width:100%;background:var(--c-input);border:1px solid var(--c-border-md);border-radius:12px;padding:10px 14px;color:var(--c-text);font-size:14px;outline:none;}
        .finput:focus{border-color:#1D9E75;}
        .pulse{animation:pulse-ring 1.8s ease-in-out infinite;}
        @keyframes pulse-ring{0%,100%{opacity:1}50%{opacity:0.4}}
      `}</style>
    </div>
  )
}

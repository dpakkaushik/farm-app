import React, { useState } from 'react'
import { CheckCircle2, X, Plus, AlertTriangle, Pencil, Building2 } from 'lucide-react'
import { useAppStore } from '../store'

const daysAgo = (dateStr) => Math.floor((new Date() - new Date(dateStr)) / 86400000)

function computeSeason(sowDateStr) {
  const d     = new Date(sowDateStr)
  const month = d.getMonth() + 1
  const year  = d.getFullYear()
  if (month >= 10) return `rabi_${year}`
  if (month >= 4)  return `kharif_${year}`
  return `rabi_${year - 1}`
}

export default function Harvest() {
  const {
    cropCycles, cropMaster, plots,
    updateCropCycle, addCropCycle,
    harvestSessions, sales,
    addCaneSupply, markCanePayment, updateCaneMillInfo,
  } = useAppStore()

  const [modal,       setModal]       = useState(null)
  const [selected,    setSelected]    = useState(null)
  const [form,        setForm]        = useState({})
  const [toast,       setToast]       = useState(null)
  const [saving,      setSaving]      = useState(false)
  const [supplyModal, setSupplyModal] = useState(null)
  const [payModal,    setPayModal]    = useState(null)
  const [millModal,   setMillModal]   = useState(null)
  const [millForm,    setMillForm]    = useState({})

  const f = (k, v) => setForm(p => ({ ...p, [k]: v }))
  const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(null), 3500) }

  const active    = cropCycles.filter(c => c.status === 'active')
  const harvested = cropCycles.filter(c => c.status === 'harvested').slice(0, 10)

  const isCane = (cycle) => {
    const name = (cropMaster.find(c => c.id === cycle.cropId)?.name || '').toLowerCase()
    return name.includes('sugarcane') || name.includes('ganna') || name.includes('cane')
  }

  const cycleSupplies = (cycleId) =>
    [...harvestSessions].filter(s => s.cycleId === cycleId).sort((a, b) => a.date.localeCompare(b.date))

  const sessionSale = (sessionId) => sales.find(s => s.sessionId === sessionId)

  const supplyOverdueDays = (sale) => {
    if (!sale || sale.paymentStatus === 'paid') return 0
    return Math.max(0, Math.floor((new Date() - new Date(sale.date)) / 86400000) - 14)
  }

  // ── Non-cane harvest handlers ────────────────────────────────────────────────
  const openRecord = (cycle) => {
    setSelected(cycle)
    setForm({ date: new Date().toISOString().slice(0, 10), qtyPerAcre: '', quality: 'A', buyer: '', rate: '' })
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
        const ratoonCrop = cropMaster.find(c => c.id === crop.ratoonCropId)
        const ratoonDate = new Date(form.date)
        ratoonDate.setDate(ratoonDate.getDate() + (ratoonCrop?.duration_days || 300))
        await addCropCycle({
          plotId: selected.plotId, cropId: crop.ratoonCropId,
          sowDate: form.date, harvestDate: ratoonDate.toISOString().slice(0, 10),
          season: computeSeason(form.date), parentCycleId: selected.id,
        })
      }

      await updateCropCycle(selected.id, {
        status: 'harvested', actualHarvestDate: form.date,
        harvestQtl: totalQtl, revenue: parseFloat(revenue),
        quality: form.quality, buyer: form.buyer,
      })

      showToast(`Harvest recorded — ${totalQtl} qtl${crop?.ratoonCropId ? ' · Ratoon started' : ''}`)
      setModal(null)
    } finally { setSaving(false) }
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
        plotId: plot.id, cropId: form.cropId,
        sowDate: form.sowDate, harvestDate: harvestDate.toISOString().slice(0, 10),
        season: computeSeason(form.sowDate),
      })
      showToast('Crop cycle started!')
      setModal(null)
    } finally { setSaving(false) }
  }

  // ── Cane supply handlers ─────────────────────────────────────────────────────
  const openSupplyModal = (cycle) => {
    const crop = cropMaster.find(c => c.id === cycle.cropId)
    setSupplyModal(cycle)
    setForm({ date: new Date().toISOString().slice(0, 10), parchiNumber: '', qtyQtl: '', sap: String(crop?.pricePerQtl || ''), notes: '' })
  }

  const confirmAddSupply = async () => {
    if (!form.qtyQtl || !supplyModal || saving) return
    setSaving(true)
    try {
      await addCaneSupply(supplyModal.id, {
        date: form.date, qtyQtl: parseFloat(form.qtyQtl),
        parchiNumber: form.parchiNumber || null, notes: form.notes || null,
        sap: parseFloat(form.sap) || 0, millName: supplyModal.millName || null,
      })
      showToast(`Supply logged — ${form.qtyQtl} qtl`)
      setSupplyModal(null)
    } finally { setSaving(false) }
  }

  const openPayModal = (supply, sale) =>
    setPayModal({ supply, sale, ded: '', dedNote: '', date: new Date().toISOString().slice(0, 10) })

  const confirmPayment = async () => {
    if (!payModal?.sale || saving) return
    setSaving(true)
    try {
      await markCanePayment(payModal.sale.id, {
        paymentDate: payModal.date,
        deductions: parseFloat(payModal.ded) || 0,
        deductionsNote: payModal.dedNote || null,
      })
      showToast('Payment recorded')
      setPayModal(null)
    } finally { setSaving(false) }
  }

  const openMillModal = (cycle) => {
    setMillModal(cycle)
    setMillForm({ millName: cycle.millName || '', growerCode: cycle.growerCode || '' })
  }

  const confirmMillInfo = async () => {
    if (!millModal || saving) return
    setSaving(true)
    try {
      await updateCaneMillInfo(millModal.id, { millName: millForm.millName, growerCode: millForm.growerCode })
      showToast('Mill info saved')
      setMillModal(null)
    } finally { setSaving(false) }
  }

  const selectedPlotForNew = plots.find(p => p.id === form.plotId)
  const newPlotHasActive   = form.plotId ? cropCycles.some(c => c.plotId === form.plotId && c.status === 'active') : false

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
          if (isCane(cycle)) {
            const crop     = cropMaster.find(c => c.id === cycle.cropId)
            const supplies = cycleSupplies(cycle.id)
            const supSales = supplies.map(s => sessionSale(s.id)).filter(Boolean)

            const totalQtl   = supplies.reduce((n, s) => n + s.qtyQtl, 0)
            const totalGross = supSales.reduce((n, s) => n + s.grossAmount, 0)
            const totalPaid  = supSales.filter(s => s.paymentStatus === 'paid').reduce((n, s) => n + s.netAmount, 0)
            const arrears    = supSales.filter(s => s.paymentStatus !== 'paid').reduce((n, s) => n + s.grossAmount, 0)

            const varietyLabel = crop?.varietyCategory === 'early' ? 'Early Maturing'
              : crop?.varietyCategory === 'common' ? 'Common Variety'
              : crop?.varietyCategory === 'late'   ? 'Late Maturing' : null

            return (
              <div key={cycle.id} className="bg-[var(--c-nav)] rounded-2xl border border-[#1D9E75]/30 p-4">
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-base">{crop?.emoji || '🌿'}</span>
                      <p className="text-sm font-bold text-[var(--c-text)]">{crop?.name || 'Sugarcane'}</p>
                      {cycle.parentCycleId && <span className="text-[10px] px-2 py-0.5 rounded-full bg-white/10 text-white/50 font-medium">Ratoon</span>}
                    </div>
                    <p className="text-xs text-[var(--c-muted)] mt-0.5">{cycle.plotLabel} · {cycle.acres} ac · Sown {cycle.sowDate}</p>
                  </div>
                  <button onClick={() => openMillModal(cycle)} className="text-[var(--c-faint)] hover:text-[var(--c-muted)] p-1">
                    <Pencil size={13}/>
                  </button>
                </div>

                <div className="flex items-center gap-2 mb-3 text-xs text-[var(--c-faint)]">
                  <Building2 size={12} className="shrink-0"/>
                  {cycle.millName
                    ? <span>{cycle.millName}{cycle.growerCode ? ` · Code: ${cycle.growerCode}` : ''}</span>
                    : <span className="italic">Mill not set — tap pencil to add</span>
                  }
                  {crop?.pricePerQtl > 0 && (
                    <span className="ml-auto text-[#1D9E75] font-semibold whitespace-nowrap">
                      SAP ₹{crop.pricePerQtl}/qtl{varietyLabel ? ` (${varietyLabel})` : ''}
                    </span>
                  )}
                </div>

                {supplies.length > 0 ? (
                  <div className="mb-3 rounded-xl overflow-hidden border border-[var(--c-border)]">
                    <div className="grid grid-cols-4 px-2 py-1 bg-[var(--c-ghost)] text-[10px] text-[var(--c-faint)] font-semibold uppercase tracking-wide">
                      <span>Parchi</span><span>Date</span><span>Qtl</span><span>Status</span>
                    </div>
                    {supplies.map(supply => {
                      const sale   = sessionSale(supply.id)
                      const overdue = supplyOverdueDays(sale)
                      const isPaid  = sale?.paymentStatus === 'paid'
                      return (
                        <button key={supply.id} onClick={() => openPayModal(supply, sale)}
                          className="w-full grid grid-cols-4 px-2 py-2.5 border-t border-[var(--c-border)] text-left hover:bg-[var(--c-ghost)] transition-colors">
                          <span className="text-xs text-[var(--c-text)] font-medium">{supply.parchiNumber || '—'}</span>
                          <span className="text-xs text-[var(--c-muted)]">{supply.date?.slice(5).replace('-', ' ')}</span>
                          <span className="text-xs text-[var(--c-text)]">{supply.qtyQtl.toFixed(1)}</span>
                          <span className={`text-[10px] font-semibold ${isPaid ? 'text-[#1D9E75]' : overdue > 0 ? 'text-[#E24B4A]' : 'text-[#BA7517]'}`}>
                            {isPaid ? 'Paid' : overdue > 0 ? `${overdue}d due` : 'Pending'}
                          </span>
                        </button>
                      )
                    })}
                  </div>
                ) : (
                  <p className="text-xs text-[var(--c-faint)] italic mb-3">No supplies logged yet.</p>
                )}

                {supplies.length > 0 && (
                  <div className="grid grid-cols-2 gap-2 mb-3">
                    <div className="bg-[var(--c-ghost)] rounded-xl px-3 py-2">
                      <p className="text-[10px] text-[var(--c-faint)]">Total Supplied</p>
                      <p className="text-sm font-bold text-[var(--c-text)]">{totalQtl.toFixed(1)} qtl</p>
                      <p className="text-[10px] text-[var(--c-faint)]">Gross ₹{totalGross.toLocaleString('en-IN')}</p>
                    </div>
                    <div className="bg-[var(--c-ghost)] rounded-xl px-3 py-2">
                      <p className="text-[10px] text-[var(--c-faint)]">Received</p>
                      <p className="text-sm font-bold text-[#1D9E75]">₹{totalPaid.toLocaleString('en-IN')}</p>
                      {arrears > 0 && <p className="text-[10px] text-[#E24B4A]">₹{arrears.toLocaleString('en-IN')} arrears</p>}
                    </div>
                  </div>
                )}

                <button onClick={() => openSupplyModal(cycle)}
                  className="w-full py-2.5 text-xs font-bold rounded-xl border bg-[#1D9E75]/15 text-[#1D9E75] border-[#1D9E75]/40">
                  <Plus size={11} className="inline mr-1"/>Log Supply (Parchi)
                </button>
              </div>
            )
          }

          // ── Non-cane: harvest countdown ──────────────────────────────────────
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

              <button onClick={() => isReady && openRecord(cycle)} disabled={!isReady}
                className={`w-full py-2.5 text-xs font-bold rounded-xl border transition-colors ${
                  isReady
                    ? 'bg-[#1D9E75] text-white border-transparent cursor-pointer'
                    : 'bg-[var(--c-card)] text-[var(--c-sub)] border-[var(--c-border-md)] opacity-60 cursor-not-allowed'
                }`}>
                {isReady
                  ? `Record Harvest${crop?.ratoonCropId ? ' · Ratoon auto-starts' : ''}`
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

      {/* Record Harvest Modal (non-cane) */}
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
                    After recording, <strong>{cropMaster.find(c => c.id === crop.ratoonCropId)?.name}</strong> will auto-start on this plot.
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
              <div><label className="text-xs text-[var(--c-sub)] block mb-1">Plot</label>
                <select value={form.plotId || ''} onChange={e => f('plotId', e.target.value)} className="finput" style={{ background: '#1a2030' }}>
                  <option value="" style={{ background: '#1a2030' }}>Select plot…</option>
                  {plots.map(p => {
                    const hasActive = cropCycles.some(c => c.plotId === p.id && c.status === 'active')
                    return <option key={p.id} value={p.id} style={{ background: '#1a2030' }}>{p.name} ({Number(p.area_acres).toFixed(1)} ac){hasActive ? ' · +Mixed' : ''}</option>
                  })}
                </select>
              </div>
              {newPlotHasActive && (
                <div className="bg-[#BA7517]/10 border border-[#BA7517]/30 rounded-xl px-3 py-2.5 flex items-start gap-2">
                  <AlertTriangle size={14} className="text-[#BA7517] shrink-0 mt-0.5"/>
                  <p className="text-xs text-[#BA7517] leading-relaxed">{selectedPlotForNew?.name} already has an active crop. Adding another creates a <strong>mixed crop cycle</strong>.</p>
                </div>
              )}
              <div><label className="text-xs text-[var(--c-sub)] block mb-1">Crop</label>
                <select value={form.cropId || ''} onChange={e => f('cropId', e.target.value)} className="finput" style={{ background: '#1a2030' }}>
                  <option value="" style={{ background: '#1a2030' }}>Select crop…</option>
                  {cropMaster.map(c => (
                    <option key={c.id} value={c.id} style={{ background: '#1a2030' }}>{c.emoji} {c.name} ({c.duration_days}d · window ±{c.harvest_window_days}d)</option>
                  ))}
                </select>
              </div>
              {form.plotId && selectedPlotForNew && (
                <div className="bg-[var(--c-ghost)] rounded-xl px-3 py-2">
                  <p className="text-[10px] text-[var(--c-faint)]">Plot size</p>
                  <p className="text-sm font-semibold text-[var(--c-text)]">{Number(selectedPlotForNew.area_acres).toFixed(1)} acres</p>
                </div>
              )}
              <div><label className="text-xs text-[var(--c-sub)] block mb-1">Sowing date</label>
                <input type="date" value={form.sowDate || ''} onChange={e => f('sowDate', e.target.value)} className="finput" style={{ colorScheme: 'dark' }}/></div>
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

      {/* Add Supply Modal */}
      {supplyModal && (
        <div className="fixed inset-0 z-50 flex items-end" style={{ background: 'rgba(0,0,0,0.7)' }} onClick={() => !saving && setSupplyModal(null)}>
          <div className="w-full bg-[var(--c-nav)] rounded-t-3xl p-5 max-h-[85vh] overflow-y-auto border-t border-[var(--c-border-md)]" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-bold text-[var(--c-text)]">Log Supply — {supplyModal.plotLabel}</h3>
              <button onClick={() => !saving && setSupplyModal(null)} className="text-[var(--c-muted)]"><X size={18}/></button>
            </div>
            <div className="space-y-3">
              <div><label className="text-xs text-[var(--c-sub)] block mb-1">Supply date</label>
                <input type="date" value={form.date} onChange={e => f('date', e.target.value)} className="finput" style={{ colorScheme: 'dark' }}/></div>
              <div><label className="text-xs text-[var(--c-sub)] block mb-1">Parchi No. (optional)</label>
                <input placeholder="e.g. P-001" value={form.parchiNumber} onChange={e => f('parchiNumber', e.target.value)} className="finput"/></div>
              <div><label className="text-xs text-[var(--c-sub)] block mb-1">Quantity (quintals)</label>
                <input type="number" placeholder="e.g. 120" value={form.qtyQtl} onChange={e => f('qtyQtl', e.target.value)} className="finput"/></div>
              <div><label className="text-xs text-[var(--c-sub)] block mb-1">SAP rate ₹/qtl</label>
                <input type="number" placeholder="e.g. 400" value={form.sap} onChange={e => f('sap', e.target.value)} className="finput"/></div>
              {form.qtyQtl && form.sap && (
                <div className="bg-[#1D9E75]/10 border border-[#1D9E75]/20 rounded-xl px-3 py-2">
                  <p className="text-xs text-[var(--c-sub)]">Gross amount at SAP</p>
                  <p className="text-xl font-bold text-[#1D9E75]">₹{Math.round(parseFloat(form.qtyQtl) * parseFloat(form.sap)).toLocaleString('en-IN')}</p>
                </div>
              )}
              <div><label className="text-xs text-[var(--c-sub)] block mb-1">Notes (optional)</label>
                <input placeholder="Any notes…" value={form.notes} onChange={e => f('notes', e.target.value)} className="finput"/></div>
              <button onClick={confirmAddSupply} disabled={saving || !form.qtyQtl}
                className="w-full py-3 bg-[#1D9E75] text-white text-sm font-bold rounded-xl disabled:opacity-50">
                {saving ? 'Saving…' : 'Log Supply'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Payment Modal */}
      {payModal && (
        <div className="fixed inset-0 z-50 flex items-end" style={{ background: 'rgba(0,0,0,0.7)' }} onClick={() => !saving && setPayModal(null)}>
          <div className="w-full bg-[var(--c-nav)] rounded-t-3xl p-5 max-h-[85vh] overflow-y-auto border-t border-[var(--c-border-md)]" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-bold text-[var(--c-text)]">Supply Payment</h3>
              <button onClick={() => !saving && setPayModal(null)} className="text-[var(--c-muted)]"><X size={18}/></button>
            </div>
            <div className="space-y-3">
              <div className="bg-[var(--c-ghost)] rounded-xl px-3 py-2.5 space-y-1">
                {[
                  ['Parchi No.', payModal.supply.parchiNumber || '—'],
                  ['Supply Date', payModal.supply.date],
                  ['Quantity', `${payModal.supply.qtyQtl.toFixed(1)} qtl`],
                  ['Gross (at SAP)', `₹${payModal.sale?.grossAmount?.toLocaleString('en-IN') || '—'}`],
                ].map(([label, val]) => (
                  <div key={label} className="flex justify-between text-xs">
                    <span className="text-[var(--c-faint)]">{label}</span>
                    <span className="text-[var(--c-text)] font-medium">{val}</span>
                  </div>
                ))}
              </div>

              {payModal.sale?.paymentStatus === 'paid' ? (
                <div className="bg-[#1D9E75]/10 border border-[#1D9E75]/20 rounded-xl px-3 py-2.5">
                  <p className="text-sm font-semibold text-[#1D9E75]">Payment Received</p>
                  <p className="text-xs text-[var(--c-muted)] mt-0.5">Date: {payModal.sale.paymentDate}</p>
                  {payModal.sale.deductions > 0 && (
                    <p className="text-xs text-[var(--c-muted)] mt-0.5">
                      Deductions: ₹{payModal.sale.deductions.toLocaleString('en-IN')}
                      {payModal.sale.deductionsNote && ` (${payModal.sale.deductionsNote})`}
                    </p>
                  )}
                  <p className="text-sm font-bold text-[#1D9E75] mt-1">Net: ₹{payModal.sale.netAmount?.toLocaleString('en-IN')}</p>
                </div>
              ) : (
                <>
                  <div><label className="text-xs text-[var(--c-sub)] block mb-1">Payment date</label>
                    <input type="date" value={payModal.date} onChange={e => setPayModal(p => ({ ...p, date: e.target.value }))} className="finput" style={{ colorScheme: 'dark' }}/></div>
                  <div><label className="text-xs text-[var(--c-sub)] block mb-1">Deductions ₹ (society commission, advance etc.)</label>
                    <input type="number" placeholder="0" value={payModal.ded} onChange={e => setPayModal(p => ({ ...p, ded: e.target.value }))} className="finput"/></div>
                  <div><label className="text-xs text-[var(--c-sub)] block mb-1">Deduction note (optional)</label>
                    <input placeholder="e.g. Society commission 1%" value={payModal.dedNote} onChange={e => setPayModal(p => ({ ...p, dedNote: e.target.value }))} className="finput"/></div>
                  {payModal.sale && (
                    <div className="bg-[var(--c-ghost)] rounded-xl px-3 py-2">
                      <p className="text-xs text-[var(--c-faint)]">Net amount to receive</p>
                      <p className="text-lg font-bold text-[#1D9E75]">
                        ₹{Math.max(0, (payModal.sale.grossAmount || 0) - (parseFloat(payModal.ded) || 0)).toLocaleString('en-IN')}
                      </p>
                    </div>
                  )}
                  <button onClick={confirmPayment} disabled={saving}
                    className="w-full py-3 bg-[#1D9E75] text-white text-sm font-bold rounded-xl disabled:opacity-50">
                    {saving ? 'Saving…' : 'Mark as Paid'}
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Mill Info Modal */}
      {millModal && (
        <div className="fixed inset-0 z-50 flex items-end" style={{ background: 'rgba(0,0,0,0.7)' }} onClick={() => !saving && setMillModal(null)}>
          <div className="w-full bg-[var(--c-nav)] rounded-t-3xl p-5 border-t border-[var(--c-border-md)]" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-bold text-[var(--c-text)]">Mill Info — {millModal.plotLabel}</h3>
              <button onClick={() => !saving && setMillModal(null)} className="text-[var(--c-muted)]"><X size={18}/></button>
            </div>
            <div className="space-y-3">
              <div><label className="text-xs text-[var(--c-sub)] block mb-1">Mill name</label>
                <input placeholder="e.g. Kisan Sahkari Chini Mill" value={millForm.millName} onChange={e => setMillForm(p => ({ ...p, millName: e.target.value }))} className="finput"/></div>
              <div><label className="text-xs text-[var(--c-sub)] block mb-1">Grower code</label>
                <input placeholder="e.g. UP-1234" value={millForm.growerCode} onChange={e => setMillForm(p => ({ ...p, growerCode: e.target.value }))} className="finput"/></div>
              <button onClick={confirmMillInfo} disabled={saving}
                className="w-full py-3 bg-[#1D9E75] text-white text-sm font-bold rounded-xl disabled:opacity-50">
                {saving ? 'Saving…' : 'Save Mill Info'}
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

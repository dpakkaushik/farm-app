import React, { useState } from 'react'
import { CheckCircle2, X, Plus, AlertTriangle, Pencil, Building2 } from 'lucide-react'
import { useAppStore } from '../store'
import { supabase } from '../lib/supabase'
import { isManager, getActiveFarmRole } from '../store/auth'
import FilePicker from '../components/FilePicker'
import Attachment from '../components/Attachment'

const daysAgo = (dateStr) => Math.floor((new Date() - new Date(dateStr)) / 86400000)

function computeSeason(sowDateStr) {
  const d     = new Date(sowDateStr)
  const month = d.getMonth() + 1
  const year  = d.getFullYear()
  if (month >= 10) return `rabi_${year}`
  if (month >= 4)  return `kharif_${year}`
  return `rabi_${year - 1}`
}

const uploadFile = async (file, folder, entityId) => {
  const ext  = file.name.split('.').pop().toLowerCase()
  const path = `${folder}/${entityId}/${Date.now()}.${ext}`
  const { error } = await supabase.storage.from('farm-photos').upload(path, file)
  if (error) throw error
  return path
}

const attachmentUrl = (path) =>
  path ? supabase.storage.from('farm-photos').getPublicUrl(path).data.publicUrl : null

export default function Harvest() {
  const {
    cropCycles, cropMaster, plots,
    updateCropCycle, addCropCycle,
    harvestSessions, sales, buyers, partners,
    addCaneSupply, markCanePayment, updateCaneMillInfo, closeCaneHarvest,
    addHarvestSession, addCropSale, markCropSalePayment,
    cropResiduals, recordResidualSale,
  } = useAppStore()

  const canMarkPayment = isManager(getActiveFarmRole())

  // ── Shared state ─────────────────────────────────────────────────────────────
  const [modal,           setModal]           = useState(null)
  const [selected,        setSelected]        = useState(null)
  const [form,            setForm]            = useState({})
  const [toast,           setToast]           = useState(null)
  const [saving,          setSaving]          = useState(false)
  const [weighingSlip,    setWeighingSlip]    = useState(null)
  const [recordError,     setRecordError]     = useState('')

  // ── Cane-specific modals ──────────────────────────────────────────────────────
  const [supplyModal,  setSupplyModal]  = useState(null)
  const [payModal,     setPayModal]     = useState(null)
  const [millModal,    setMillModal]    = useState(null)
  const [millForm,     setMillForm]     = useState({})
  const [parchiFile,   setParchiFile]   = useState(null)
  const [payFile,      setPayFile]      = useState(null)
  const [closeModal,   setCloseModal]   = useState(null)
  const [closeInput,   setCloseInput]   = useState('')
  const [closeError,   setCloseError]   = useState(null)

  // ── Non-cane open-sale modals ─────────────────────────────────────────────────
  const [saleModal,    setSaleModal]    = useState(null)   // { cycle, session }
  const [cropPayModal, setCropPayModal] = useState(null)   // { cycle, session, sale, date, ded, dedNote }
  const [cropPayFile,  setCropPayFile]  = useState(null)
  const [residualModal,setResidualModal]= useState(null)   // residual object

  const f = (k, v) => setForm(p => ({ ...p, [k]: v }))
  const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(null), 3500) }

  // ── Derived data ──────────────────────────────────────────────────────────────
  const isCane = (cycle) => {
    const name = (cropMaster.find(c => c.id === cycle.cropId)?.name || '').toLowerCase()
    return name.includes('sugarcane') || name.includes('ganna') || name.includes('cane')
  }

  const getSession     = (cycleId)   => harvestSessions.find(s => s.cycleId === cycleId)
  const getSale        = (sessionId) => sessionId ? sales.find(s => s.sessionId === sessionId) : null
  const getCycleResids = (cycleId)   => cropResiduals.filter(r => r.cropCycleId === cycleId)

  const active          = cropCycles.filter(c => c.status === 'active')
  const harvestedNonCane = cropCycles.filter(c => c.status === 'harvested' && !isCane(c))

  // Open = harvested but crop sale not yet paid
  const openSales = harvestedNonCane.filter(c => {
    const sess = getSession(c.id)
    const sale = getSale(sess?.id)
    return !sale || sale.paymentStatus !== 'paid'
  })

  // Past = crop sale paid
  const pastHarvests = harvestedNonCane.filter(c => {
    const sess = getSession(c.id)
    const sale = getSale(sess?.id)
    return sale?.paymentStatus === 'paid'
  }).slice(0, 20)

  // Cane helpers
  const cycleSupplies     = (cycleId)   => [...harvestSessions].filter(s => s.cycleId === cycleId).sort((a, b) => a.date.localeCompare(b.date))
  const sessionSale       = (sessionId) => sales.find(s => s.sessionId === sessionId)
  const supplyOverdueDays = (sale)      => {
    if (!sale || sale.paymentStatus === 'paid') return 0
    return Math.max(0, Math.floor((new Date() - new Date(sale.date)) / 86400000) - 14)
  }
  const partnerName = (id) => partners.find(p => p.id === id)?.name || null
  const buyerName   = (id) => buyers.find(b => b.id === id)?.name   || null

  // ── Non-cane harvest record ───────────────────────────────────────────────────
  const openRecord = (cycle) => {
    setSelected(cycle)
    setForm({ date: new Date().toISOString().slice(0, 10), qtyQtl: '', quality: 'A', storageLocation: 'own_godown', moisturePct: '', notes: '' })
    setWeighingSlip(null)
    setRecordError('')
    setModal('record')
  }

  const confirmRecord = async () => {
    if (!form.qtyQtl || !selected || saving) return
    const today = new Date().toISOString().slice(0, 10)
    if (form.date > today) { setRecordError('Harvest date cannot be in the future.'); return }
    if (!weighingSlip)     { setRecordError('Please attach the weighing slip — it is required.'); return }
    setRecordError('')
    setSaving(true)
    try {
      const weighingSlipPath = await uploadFile(weighingSlip, 'weighing', selected.id)
      const crop   = cropMaster.find(c => c.id === selected.cropId)
      const qtyQtl = parseFloat(parseFloat(form.qtyQtl).toFixed(1))

      await addHarvestSession(selected.id, {
        date:            form.date,
        qtyQtl,
        quality:         form.quality,
        notes:           form.notes || null,
        weighingSlipPath,
        storageLocation: form.storageLocation || null,
        moisturePct:     form.moisturePct ? parseFloat(form.moisturePct) : null,
      })

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

      await updateCropCycle(selected.id, { status: 'harvested', actualHarvestDate: form.date })

      const residualCount = (crop?.residuals || []).length
      showToast(`Harvest recorded — ${qtyQtl} qtl${residualCount > 0 ? ` · ${residualCount} residual${residualCount !== 1 ? 's' : ''} created` : ''}${crop?.ratoonCropId ? ' · Ratoon started' : ''}`)
      setModal(null)
    } finally { setSaving(false) }
  }

  // ── New cycle ─────────────────────────────────────────────────────────────────
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

  // ── Record sale (non-cane) ────────────────────────────────────────────────────
  const openSaleModal = (cycle, session) => {
    setSaleModal({ cycle, session })
    setForm({
      date:             new Date().toISOString().slice(0, 10),
      buyer:            '',
      buyerId:          '',
      localMarketMode:  false,
      rate:             '',
      qtyQtl:           String(session.qtyQtl.toFixed(2)),
      commissionPerQtl: '',
      freightCharges:   '',
    })
  }

  const confirmSale = async () => {
    if (!saleModal || !form.buyer || !form.rate || saving) return
    setSaving(true)
    try {
      await addCropSale(saleModal.session.id, {
        cycleId:          saleModal.cycle.id,
        date:             form.date,
        buyerName:        form.buyer,
        buyerId:          form.buyerId || null,
        qtyQtl:           parseFloat(form.qtyQtl) || saleModal.session.qtyQtl,
        ratePerQtl:       parseFloat(form.rate),
        commissionPerQtl: form.commissionPerQtl ? parseFloat(form.commissionPerQtl) : null,
        freightCharges:   parseFloat(form.freightCharges) || 0,
      })
      showToast('Sale recorded — awaiting payment')
      setSaleModal(null)
    } catch (err) {
      showToast(err.message || 'Failed to record sale')
    } finally { setSaving(false) }
  }

  // ── Mark payment (non-cane) ───────────────────────────────────────────────────
  const openCropPayModal = (cycle, session, sale) => {
    setCropPayFile(null)
    setCropPayModal({ cycle, session, sale, date: new Date().toISOString().slice(0, 10), ded: '', dedNote: '' })
  }

  const confirmCropPayment = async () => {
    if (!cropPayModal?.sale || !cropPayFile || saving) return
    setSaving(true)
    try {
      const attachmentPath = await uploadFile(cropPayFile, 'payment', cropPayModal.sale.id)
      await markCropSalePayment(cropPayModal.sale.id, {
        paymentDate:           cropPayModal.date,
        deductions:            parseFloat(cropPayModal.ded) || 0,
        deductionsNote:        cropPayModal.dedNote || null,
        paymentAttachmentPath: attachmentPath,
      })
      showToast('Payment confirmed — harvest complete ✓')
      setCropPayModal(null)
    } catch (err) {
      showToast(err.message || 'Failed to confirm payment')
    } finally { setSaving(false) }
  }

  // ── Residual sale ─────────────────────────────────────────────────────────────
  const openResidualModal = (residual) => {
    setResidualModal(residual)
    setForm({
      date:          new Date().toISOString().slice(0, 10),
      buyerName:     '',
      actualRate:    residual.expectedRate ? String(residual.expectedRate) : '',
      paymentStatus: 'pending',
    })
  }

  const confirmResidualSale = async () => {
    if (!residualModal || !form.actualRate || saving) return
    setSaving(true)
    try {
      await recordResidualSale(residualModal.id, {
        actualRate:    parseFloat(form.actualRate),
        buyerName:     form.buyerName || null,
        saleDate:      form.date,
        paymentStatus: form.paymentStatus,
        notes:         null,
      })
      showToast('Residual sale recorded')
      setResidualModal(null)
    } finally { setSaving(false) }
  }

  // ── Cane supply handlers (unchanged) ─────────────────────────────────────────
  const openSupplyModal = (cycle) => {
    const crop = cropMaster.find(c => c.id === cycle.cropId)
    setSupplyModal(cycle)
    setParchiFile(null)
    setForm({ date: new Date().toISOString().slice(0, 10), parchiNumber: '', qtyQtl: '', sap: String(crop?.pricePerQtl || ''), notes: '', partnerId: '', buyerId: '' })
  }

  const confirmAddSupply = async () => {
    if (!form.qtyQtl || !form.partnerId || !form.buyerId || !supplyModal || saving) return
    setSaving(true)
    try {
      let parchiAttachmentPath = null
      if (parchiFile) parchiAttachmentPath = await uploadFile(parchiFile, 'parchi', supplyModal.id)
      await addCaneSupply(supplyModal.id, {
        date: form.date, qtyQtl: parseFloat(form.qtyQtl),
        parchiNumber: form.parchiNumber || null, notes: form.notes || null,
        sap: parseFloat(form.sap) || 0,
        partnerId: form.partnerId, buyerId: form.buyerId, parchiAttachmentPath,
      })
      showToast(`Supply logged — ${form.qtyQtl} qtl`)
      setSupplyModal(null)
    } catch (err) {
      showToast(err.message || 'Failed to log supply')
    } finally { setSaving(false) }
  }

  const openPayModal = (supply, sale) => {
    setPayFile(null)
    setPayModal({ supply, sale, ded: '', dedNote: '', date: new Date().toISOString().slice(0, 10) })
  }

  const confirmPayment = async () => {
    if (!payModal?.sale || saving) return
    setSaving(true)
    try {
      let paymentAttachmentPath = null
      if (payFile) paymentAttachmentPath = await uploadFile(payFile, 'payment', payModal.sale.id)
      await markCanePayment(payModal.sale.id, { paymentDate: payModal.date, deductions: parseFloat(payModal.ded) || 0, deductionsNote: payModal.dedNote || null, paymentAttachmentPath })
      showToast('Payment recorded')
      setPayModal(null)
    } finally { setSaving(false) }
  }

  const openMillModal    = (cycle) => { setMillModal(cycle); setMillForm({ millName: cycle.millName || '', growerCode: cycle.growerCode || '' }) }
  const confirmMillInfo  = async () => {
    if (!millModal || saving) return
    setSaving(true)
    try { await updateCaneMillInfo(millModal.id, { millName: millForm.millName, growerCode: millForm.growerCode }); showToast('Mill info saved'); setMillModal(null) }
    finally { setSaving(false) }
  }

  const openCloseModal = (cycle) => { setCloseModal(cycle); setCloseInput(''); setCloseError(null) }
  const confirmClose   = async () => {
    if (!closeModal || saving) return
    const nos = closeInput.split(',').map(n => n.trim()).filter(Boolean)
    if (!nos.length) { setCloseError('Enter at least one parchi number'); return }
    setSaving(true); setCloseError(null)
    try {
      const result = await closeCaneHarvest(closeModal.id, nos)
      if (!result.ok) {
        const parts = []
        if (result.missing?.length) parts.push(`Logged but not entered: ${result.missing.join(', ')}`)
        if (result.extra?.length)   parts.push(`Entered but not logged: ${result.extra.join(', ')}`)
        setCloseError(parts.join(' | '))
      } else { showToast('Harvest closed — plot is now empty'); setCloseModal(null) }
    } finally { setSaving(false) }
  }

  const selectedPlotForNew = plots.find(p => p.id === form.plotId)
  const newPlotHasActive   = form.plotId ? cropCycles.some(c => c.plotId === form.plotId && c.status === 'active') : false

  // ── Render helpers ────────────────────────────────────────────────────────────
  const ResidualRow = ({ r }) => (
    <div key={r.id} className="flex items-center justify-between py-2 px-3 bg-[var(--c-ghost)] rounded-xl">
      <div>
        <p className="text-xs font-medium text-[var(--c-text)]">{r.productName}</p>
        <p className="text-[10px] text-[var(--c-faint)]">
          {r.quantity.toFixed(1)} {r.unit}
          {r.expectedRate > 0 && ` · Est. ₹${r.expectedRate}/${r.unit}`}
        </p>
      </div>
      {r.status === 'open' ? (
        <button onClick={() => openResidualModal(r)}
          className="text-[10px] px-2.5 py-1 rounded-lg bg-[#1D9E75]/15 text-[#1D9E75] font-semibold border border-[#1D9E75]/30">
          Sell
        </button>
      ) : (
        <div className="text-right">
          <p className="text-[10px] font-semibold text-[#1D9E75]">₹{r.actualRevenue?.toLocaleString('en-IN')}</p>
          <p className="text-[9px] text-[var(--c-faint)]">{r.paymentStatus === 'paid' ? '✓ Paid' : 'Pending'}</p>
        </div>
      )}
    </div>
  )

  return (
    <div className="h-full flex flex-col bg-[var(--c-bg)]">

      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <div className="shrink-0 px-4 pt-4 pb-2 flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-[var(--c-text)]">Harvest</h2>
          <p className="text-xs text-[var(--c-muted)]">
            {active.length} active{openSales.length > 0 ? ` · ${openSales.length} open sale${openSales.length !== 1 ? 's' : ''}` : ''}
          </p>
        </div>
        <button onClick={openNewCycle} className="flex items-center gap-1.5 px-3 py-2 bg-[#1D9E75]/20 border border-[#1D9E75]/40 rounded-xl text-xs text-[#1D9E75] font-semibold">
          <Plus size={13}/> New Cycle
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-4 pb-6 space-y-3">
        {active.length === 0 && openSales.length === 0 && pastHarvests.length === 0 && (
          <p className="text-center text-[var(--c-faint)] text-sm py-8">No crop cycles yet.</p>
        )}

        {/* ── Active crop cycles ─────────────────────────────────────────────── */}
        {active.map(cycle => {
          if (isCane(cycle)) {
            const crop     = cropMaster.find(c => c.id === cycle.cropId)
            const supplies = cycleSupplies(cycle.id)
            const supSales = supplies.map(s => sessionSale(s.id)).filter(Boolean)
            const totalQtl   = supplies.reduce((n, s) => n + s.qtyQtl, 0)
            const totalGross = supSales.reduce((n, s) => n + s.grossAmount, 0)
            const totalPaid  = supSales.filter(s => s.paymentStatus === 'paid').reduce((n, s) => n + s.netAmount, 0)
            const arrears    = supSales.filter(s => s.paymentStatus !== 'paid').reduce((n, s) => n + s.grossAmount, 0)
            const varietyLabel = crop?.varietyCategory === 'early' ? 'Early Maturing' : crop?.varietyCategory === 'common' ? 'Common Variety' : crop?.varietyCategory === 'late' ? 'Late Maturing' : null

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
                  <button onClick={() => openMillModal(cycle)} className="text-[var(--c-faint)] hover:text-[var(--c-muted)] p-1"><Pencil size={13}/></button>
                </div>
                <div className="flex items-center gap-2 mb-3 text-xs text-[var(--c-faint)]">
                  <Building2 size={12} className="shrink-0"/>
                  {cycle.millName ? <span>{cycle.millName}{cycle.growerCode ? ` · Code: ${cycle.growerCode}` : ''}</span> : <span className="italic">Mill not set — tap pencil to add</span>}
                  {crop?.pricePerQtl > 0 && <span className="ml-auto text-[#1D9E75] font-semibold whitespace-nowrap">SAP ₹{crop.pricePerQtl}/qtl{varietyLabel ? ` (${varietyLabel})` : ''}</span>}
                </div>
                {supplies.length > 0 ? (
                  <div className="mb-3 rounded-xl overflow-hidden border border-[var(--c-border)]">
                    <div className="grid grid-cols-4 px-2 py-1 bg-[var(--c-ghost)] text-[10px] text-[var(--c-faint)] font-semibold uppercase tracking-wide">
                      <span>Parchi</span><span>Date</span><span>Qtl</span><span>Status</span>
                    </div>
                    {supplies.map(supply => {
                      const sale    = sessionSale(supply.id)
                      const overdue = supplyOverdueDays(sale)
                      const isPaid  = sale?.paymentStatus === 'paid'
                      const pName   = partnerName(supply.partnerId)
                      return (
                        <button key={supply.id} onClick={() => openPayModal(supply, sale)}
                          className="w-full grid grid-cols-4 px-2 py-2.5 border-t border-[var(--c-border)] text-left hover:bg-[var(--c-ghost)] transition-colors">
                          <span className="text-xs text-[var(--c-text)] font-medium leading-tight">
                            {supply.parchiNumber || '—'}
                            {pName && <span className="block text-[9px] text-[var(--c-faint)] font-normal">{pName}</span>}
                          </span>
                          <span className="text-xs text-[var(--c-muted)]">{supply.date?.slice(5).replace('-', ' ')}</span>
                          <span className="text-xs text-[var(--c-text)]">{supply.qtyQtl.toFixed(1)}</span>
                          <span className={`text-[10px] font-semibold ${isPaid ? 'text-[#1D9E75]' : overdue > 0 ? 'text-[#E24B4A]' : 'text-[#BA7517]'}`}>
                            {isPaid ? 'Paid' : overdue > 0 ? `${overdue}d due` : 'Pending'}
                          </span>
                        </button>
                      )
                    })}
                  </div>
                ) : <p className="text-xs text-[var(--c-faint)] italic mb-3">No supplies logged yet.</p>}
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
                <div className="space-y-2">
                  <button onClick={() => openSupplyModal(cycle)} className="w-full py-2.5 text-xs font-bold rounded-xl border bg-[#1D9E75]/15 text-[#1D9E75] border-[#1D9E75]/40">
                    <Plus size={11} className="inline mr-1"/>Log Supply (Parchi)
                  </button>
                  {supplies.length > 0 && (
                    <button onClick={() => openCloseModal(cycle)} className="w-full py-2.5 text-xs font-bold rounded-xl border border-[#BA7517]/40 text-[#BA7517]">
                      Close Harvest — Verify &amp; Lock
                    </button>
                  )}
                </div>
              </div>
            )
          }

          // ── Non-cane: harvest countdown ────────────────────────────────────
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
                  {isReady ? <p className="text-lg font-bold text-[#1D9E75]">Harvest!</p> : (
                    <><p className="text-2xl font-bold text-[var(--c-text)]">{daysToWindow}</p><p className="text-[10px] text-[var(--c-muted)]">days to harvest</p></>
                  )}
                  <p className="text-[10px] text-[var(--c-faint)] mt-1">Day {daysSown}</p>
                </div>
              </div>
              <div className="mb-3">
                <div className="flex justify-between text-[10px] text-[var(--c-faint)] mb-1"><span>Progress</span><span>{pct}%</span></div>
                <div className="h-1.5 bg-[var(--c-ghost)] rounded-full overflow-hidden">
                  <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: isReady ? '#1D9E75' : isNear ? '#BA7517' : 'rgba(220,180,40,0.8)' }}/>
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
                  isReady ? 'bg-[#1D9E75] text-white border-transparent cursor-pointer' : 'bg-[var(--c-card)] text-[var(--c-sub)] border-[var(--c-border-md)] opacity-60 cursor-not-allowed'
                }`}>
                {isReady ? `Record Harvest${crop?.ratoonCropId ? ' · Ratoon auto-starts' : ''}` : `Harvest window opens in ${daysToWindow} day${daysToWindow !== 1 ? 's' : ''}`}
              </button>
            </div>
          )
        })}

        {/* ── Open Sales (harvested, payment not received) ───────────────────── */}
        {openSales.length > 0 && (
          <>
            <div className="pt-3 pb-1 flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-[#BA7517]"/>
              <p className="text-xs font-semibold text-[#BA7517] uppercase tracking-wide">
                Open Sales — {openSales.length} pending
              </p>
            </div>

            {openSales.map(cycle => {
              const crop      = cropMaster.find(c => c.id === cycle.cropId)
              const session   = getSession(cycle.id)
              const sale      = getSale(session?.id)
              const residuals = getCycleResids(cycle.id)

              return (
                <div key={cycle.id} className="bg-[var(--c-nav)] rounded-2xl border border-[#BA7517]/35 p-4">

                  {/* Header */}
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-base">{crop?.emoji || '🌾'}</span>
                        <p className="text-sm font-bold text-[var(--c-text)]">{crop?.name || cycle.cropId}</p>
                        {cycle.parentCycleId && <span className="text-[10px] px-2 py-0.5 rounded-full bg-white/10 text-white/50">Ratoon</span>}
                      </div>
                      <p className="text-xs text-[var(--c-muted)] mt-0.5">{cycle.plotLabel} · {cycle.acres} acres</p>
                    </div>
                    {!sale ? (
                      <span className="text-[10px] px-2 py-1 rounded-full bg-[#BA7517]/20 text-[#BA7517] font-semibold">Sale Pending</span>
                    ) : (
                      <span className="text-[10px] px-2 py-1 rounded-full bg-[#E24B4A]/15 text-[#E24B4A] font-semibold">Unpaid</span>
                    )}
                  </div>

                  {/* Harvest summary */}
                  {session ? (
                    <div className="bg-[var(--c-ghost)] rounded-xl px-3 py-2.5 mb-3">
                      <div className="flex items-center justify-between mb-1">
                        <div>
                          <p className="text-[10px] text-[var(--c-faint)]">Harvested {session.date}</p>
                          <p className="text-base font-bold text-[var(--c-text)]">{session.qtyQtl.toFixed(1)} qtl</p>
                        </div>
                        {session.quality && (
                          <span className="text-xs px-2.5 py-1 rounded-full bg-[#1D9E75]/15 text-[#1D9E75] font-semibold">Grade {session.quality}</span>
                        )}
                      </div>
                      <div className="flex items-center gap-3 flex-wrap">
                        {session.storageLocation && (
                          <span className="text-[10px] text-[var(--c-faint)]">
                            📦 {session.storageLocation === 'own_godown' ? 'Own Godown' : session.storageLocation === 'mandi' ? 'Mandi' : "Buyer's Store"}
                          </span>
                        )}
                        {session.moisturePct != null && (
                          <span className={`text-[10px] font-medium ${session.moisturePct > 14 ? 'text-[#BA7517]' : 'text-[var(--c-faint)]'}`}>
                            💧 {session.moisturePct}% moisture{session.moisturePct > 14 ? ' ⚠' : ''}
                          </span>
                        )}
                        {session.parchiAttachmentPath && (
                          <Attachment variant="chip" value={session.parchiAttachmentPath} name="Weighing Slip" />
                        )}
                      </div>
                    </div>
                  ) : (
                    <p className="text-xs text-[var(--c-faint)] italic mb-3">Harvest session not found.</p>
                  )}

                  {/* Sale action */}
                  {session && !sale && (
                    <button onClick={() => openSaleModal(cycle, session)}
                      className="w-full py-2.5 text-xs font-bold rounded-xl border bg-[#1D9E75]/15 text-[#1D9E75] border-[#1D9E75]/40 mb-3">
                      <Plus size={11} className="inline mr-1"/>Record Sale
                    </button>
                  )}

                  {sale && (
                    <div className="bg-[var(--c-ghost)] rounded-xl px-3 py-2.5 mb-3">
                      <div className="flex items-start justify-between mb-2">
                        <div>
                          <p className="text-xs font-semibold text-[var(--c-text)]">{sale.buyerName || 'Buyer'}</p>
                          <p className="text-[10px] text-[var(--c-faint)]">₹{sale.ratePerQtl}/qtl · {sale.date}</p>
                        </div>
                        <p className="text-sm font-bold text-[var(--c-text)]">₹{sale.grossAmount?.toLocaleString('en-IN')}</p>
                      </div>
                      <button onClick={() => openCropPayModal(cycle, session, sale)}
                        className="w-full py-2 text-xs font-bold rounded-lg bg-[#E24B4A]/10 border border-[#E24B4A]/35 text-[#E24B4A]">
                        Mark Payment & Upload Receipt →
                      </button>
                    </div>
                  )}

                  {/* Residuals */}
                  {residuals.length > 0 && (
                    <div className="space-y-1.5">
                      <p className="text-[10px] font-semibold text-[var(--c-faint)] uppercase tracking-wide mb-1">Residuals</p>
                      {residuals.map(r => <ResidualRow key={r.id} r={r}/>)}
                    </div>
                  )}
                </div>
              )
            })}
          </>
        )}

        {/* ── Past Harvests (crop sale paid) ─────────────────────────────────── */}
        {pastHarvests.length > 0 && (
          <>
            <div className="pt-2 pb-1">
              <p className="text-xs font-semibold text-[var(--c-muted)] uppercase tracking-wide">Past Harvests</p>
            </div>
            {pastHarvests.map(h => {
              const crop      = cropMaster.find(c => c.id === h.cropId)
              const session   = getSession(h.id)
              const sale      = getSale(session?.id)
              const residuals = getCycleResids(h.id)
              const openRes   = residuals.filter(r => r.status === 'open')

              return (
                <div key={h.id} className="bg-[var(--c-nav)] rounded-2xl border border-[var(--c-border)] p-4">
                  <div className="flex items-start justify-between mb-1">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm">{crop?.emoji || '🌾'}</span>
                        <p className="text-sm font-semibold text-[var(--c-text)]">{crop?.name || h.cropId} — {h.plotLabel}</p>
                      </div>
                      <p className="text-xs text-[var(--c-muted)]">{session?.date || h.actualHarvestDate} · {h.acres} acres</p>
                    </div>
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-[#1D9E75]/20 text-[#1D9E75] font-semibold">✓ Paid</span>
                  </div>

                  <div className="flex items-center justify-between text-xs mt-2">
                    <span className="text-[var(--c-muted)]">
                      {session?.qtyQtl?.toFixed(1)} qtl{session?.quality ? ` · Grade ${session.quality}` : ''}
                    </span>
                    <span className="font-bold text-[#1D9E75]">₹{sale?.netAmount?.toLocaleString('en-IN')}</span>
                  </div>
                  {sale?.buyerName && (
                    <p className="text-[10px] text-[var(--c-faint)] mt-0.5">
                      {sale.buyerName} · ₹{sale.ratePerQtl}/qtl · Paid {sale.paymentDate}
                      {sale.deductions > 0 && ` (–₹${sale.deductions.toLocaleString('en-IN')} deductions)`}
                    </p>
                  )}
                  {sale?.paymentAttachmentPath && (
                    <div className="mt-0.5">
                      <Attachment variant="chip" value={sale.paymentAttachmentPath} name="View Receipt" />
                    </div>
                  )}

                  {/* Residuals (still actionable if open) */}
                  {residuals.length > 0 && (
                    <div className="mt-3 pt-2 border-t border-[var(--c-border)] space-y-1.5">
                      <p className="text-[10px] font-semibold text-[var(--c-faint)] uppercase tracking-wide">
                        Residuals{openRes.length > 0 && <span className="ml-1 text-[#BA7517]">· {openRes.length} unsold</span>}
                      </p>
                      {residuals.map(r => <ResidualRow key={r.id} r={r}/>)}
                    </div>
                  )}
                </div>
              )
            })}
          </>
        )}
      </div>

      {/* ════════════ MODALS ════════════ */}

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
                  <p className="text-xs text-[#1D9E75] leading-relaxed">After recording, <strong>{cropMaster.find(c => c.id === crop.ratoonCropId)?.name}</strong> will auto-start on this plot.</p>
                </div>
              ) : null
            })()}
            {(() => {
              const crop = cropMaster.find(c => c.id === selected.cropId)
              const residualDefs = crop?.residuals || []
              return residualDefs.length > 0 ? (
                <div className="bg-[var(--c-ghost)] border border-[var(--c-border)] rounded-xl px-3 py-2 mb-4">
                  <p className="text-[10px] text-[var(--c-faint)] font-semibold uppercase tracking-wide mb-1">Auto-creates residuals</p>
                  {residualDefs.map((r, i) => (
                    <p key={i} className="text-xs text-[var(--c-muted)]">· {r.name} — {(parseFloat(r.qty_per_acre) * selected.acres).toFixed(1)} {r.unit || 'qtl'}</p>
                  ))}
                </div>
              ) : null
            })()}
            <div className="space-y-3">

              {/* Harvest date */}
              <div>
                <label className="text-xs text-[var(--c-sub)] block mb-1">Harvest date <span className="text-[#E24B4A]">*</span></label>
                <input type="date" value={form.date}
                  max={new Date().toISOString().slice(0, 10)}
                  onChange={e => { f('date', e.target.value); setRecordError('') }}
                  className="finput" style={{ colorScheme: 'dark' }}/>
              </div>

              {/* Total quantity — read from weighing slip */}
              <div>
                <label className="text-xs text-[var(--c-sub)] block mb-1">Total quantity (qtl) <span className="text-[#E24B4A]">*</span></label>
                <input type="number" step="0.1" placeholder="e.g. 47.5 — as shown on weighing slip"
                  value={form.qtyQtl} onChange={e => f('qtyQtl', e.target.value)} className="finput"/>
              </div>

              {/* Auto-calculated yield per acre */}
              {form.qtyQtl && parseFloat(form.qtyQtl) > 0 && (
                <div className="bg-[#1D9E75]/10 border border-[#1D9E75]/20 rounded-xl px-3 py-2.5 flex items-center justify-between">
                  <div>
                    <p className="text-[10px] text-[var(--c-faint)]">Yield per acre</p>
                    <p className="text-xl font-bold text-[#1D9E75]">
                      {(parseFloat(form.qtyQtl) / selected.acres).toFixed(1)} qtl/acre
                    </p>
                  </div>
                  <p className="text-[10px] text-[var(--c-faint)] text-right">
                    {parseFloat(form.qtyQtl).toFixed(1)} qtl<br/>÷ {selected.acres} acres
                  </p>
                </div>
              )}

              {/* Quality grade */}
              <div>
                <label className="text-xs text-[var(--c-sub)] block mb-1">Quality grade</label>
                <div className="flex gap-2">
                  {['A', 'B', 'C'].map(g => (
                    <button key={g} type="button" onClick={() => f('quality', g)}
                      className={`flex-1 py-2.5 text-sm font-bold rounded-xl border transition-colors ${
                        form.quality === g
                          ? 'bg-[#1D9E75] text-white border-transparent'
                          : 'bg-transparent text-[var(--c-muted)] border-[var(--c-border)]'
                      }`}>
                      Grade {g}
                    </button>
                  ))}
                </div>
              </div>

              {/* Storage location */}
              <div>
                <label className="text-xs text-[var(--c-sub)] block mb-1">Storage location</label>
                <select value={form.storageLocation} onChange={e => f('storageLocation', e.target.value)}
                  className="finput" style={{ background: 'var(--c-input)' }}>
                  <option value="own_godown">Own Godown</option>
                  <option value="mandi">Mandi</option>
                  <option value="buyer_store">Buyer's Store</option>
                </select>
              </div>

              {/* Moisture % */}
              <div>
                <label className="text-xs text-[var(--c-sub)] block mb-1">Moisture % <span className="text-[var(--c-faint)]">(optional)</span></label>
                <input type="number" step="0.1" min="0" max="30" placeholder="e.g. 12.5"
                  value={form.moisturePct} onChange={e => f('moisturePct', e.target.value)} className="finput"/>
                {form.moisturePct && parseFloat(form.moisturePct) > 14 && (
                  <p className="text-[10px] text-[#BA7517] mt-1">⚠ Above 14% — expect drying deductions at mandi</p>
                )}
              </div>

              {/* Weighing slip */}
              <div>
                <label className="text-xs text-[var(--c-sub)] block mb-1">Weighing slip <span className="text-[#E24B4A]">*</span></label>
                <FilePicker accept="image/*,application/pdf" file={weighingSlip}
                  onFile={f => { setWeighingSlip(f); setRecordError('') }} />
                {!weighingSlip && <p className="text-[10px] text-[#BA7517] mt-1">Required — photo or PDF of weighing slip</p>}
              </div>

              {/* Notes */}
              <div>
                <label className="text-xs text-[var(--c-sub)] block mb-1">Notes <span className="text-[var(--c-faint)]">(optional)</span></label>
                <input placeholder="Any notes…" value={form.notes} onChange={e => f('notes', e.target.value)} className="finput"/>
              </div>

              {recordError && (
                <div className="bg-[#E24B4A]/10 border border-[#E24B4A]/30 rounded-xl px-3 py-2.5">
                  <p className="text-xs text-[#E24B4A]">{recordError}</p>
                </div>
              )}

              <div className="bg-[var(--c-ghost)] rounded-xl px-3 py-2 text-[10px] text-[var(--c-faint)] space-y-0.5">
                <p>• Plot will be marked <strong className="text-[var(--c-muted)]">empty</strong> on the field map</p>
                <p>• Sale shows <strong className="text-[#BA7517]">pending</strong> until buyer + rate are entered</p>
                <p>• Payment receipt required to close the sale</p>
              </div>

              <button onClick={confirmRecord} disabled={saving || !form.qtyQtl || !weighingSlip}
                className="w-full py-3 bg-[#1D9E75] text-white text-sm font-bold rounded-xl disabled:opacity-50">
                {saving ? 'Uploading & saving…' : 'Confirm Harvest'}
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
                </select></div>
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
                </select></div>
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
                    <p className="text-sm font-semibold text-[#1D9E75]">{windowOpen.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</p>
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

      {/* Record Sale Modal */}
      {saleModal && (() => {
        const qty   = parseFloat(form.qtyQtl)  || 0
        const rate  = parseFloat(form.rate)     || 0
        const gross = Math.round(qty * rate)
        const commPerQtl = parseFloat(form.commissionPerQtl) || 0
        const commAmt = commPerQtl > 0 ? Math.round(commPerQtl * qty) : 0
        const freight = parseFloat(form.freightCharges) || 0
        const net   = Math.max(0, gross - commAmt - freight)
        const hasBreakdown = gross > 0 && (commAmt > 0 || freight > 0)
        return (
          <div className="fixed inset-0 z-50 flex items-end" style={{ background: 'rgba(0,0,0,0.7)' }} onClick={() => !saving && setSaleModal(null)}>
            <div className="w-full bg-[var(--c-nav)] rounded-t-3xl p-5 max-h-[85vh] overflow-y-auto border-t border-[var(--c-border-md)]" onClick={e => e.stopPropagation()}>
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-bold text-[var(--c-text)]">Record Sale — {saleModal.cycle.plotLabel}</h3>
                <button onClick={() => !saving && setSaleModal(null)} className="text-[var(--c-muted)]"><X size={18}/></button>
              </div>

              {/* Crop info bar */}
              <div className="bg-[var(--c-ghost)] rounded-xl px-3 py-2.5 mb-4 flex items-center justify-between">
                <div>
                  <p className="text-[10px] text-[var(--c-faint)]">Harvest recorded</p>
                  <p className="text-base font-bold text-[var(--c-text)]">{saleModal.session.qtyQtl.toFixed(2)} qtl</p>
                </div>
                {saleModal.session.quality && (
                  <span className="text-xs px-2.5 py-1 rounded-full bg-[#1D9E75]/15 text-[#1D9E75] font-semibold">Grade {saleModal.session.quality}</span>
                )}
              </div>

              <div className="space-y-3">
                {/* Sale date */}
                <div><label className="text-xs text-[var(--c-sub)] block mb-1">Sale date</label>
                  <input type="date" value={form.date} onChange={e => f('date', e.target.value)} className="finput" style={{ colorScheme: 'dark' }}/></div>

                {/* Buyer — pills + Local Market manual entry */}
                <div>
                  <label className="text-xs text-[var(--c-sub)] block mb-1.5">Buyer <span className="text-[#E24B4A]">*</span></label>
                  <div className="flex flex-wrap gap-2 mb-2">
                    <button type="button"
                      onClick={() => { f('buyer', ''); f('buyerId', ''); f('localMarketMode', true) }}
                      className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors ${
                        form.localMarketMode
                          ? 'bg-[#BA7517]/20 border-[#BA7517] text-[#BA7517]'
                          : 'bg-[var(--c-ghost)] border-[var(--c-border-md)] text-[var(--c-sub)]'
                      }`}>
                      🏪 Local Market
                    </button>
                    {buyers.filter(b => b.isActive !== false).slice(0, 4).map(b => (
                      <button key={b.id} type="button"
                        onClick={() => { f('buyer', b.name); f('buyerId', b.id); f('localMarketMode', false) }}
                        className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors ${
                          form.buyerId === b.id
                            ? 'bg-[#1D9E75]/20 border-[#1D9E75] text-[#1D9E75]'
                            : 'bg-[var(--c-ghost)] border-[var(--c-border-md)] text-[var(--c-sub)]'
                        }`}>
                        {b.name}
                      </button>
                    ))}
                  </div>
                  {form.localMarketMode ? (
                    <input autoFocus placeholder="Enter buyer's name…" value={form.buyer}
                      onChange={e => { f('buyer', e.target.value); f('buyerId', '') }} className="finput"/>
                  ) : (
                    <input placeholder="Or type buyer name…" value={form.buyer}
                      onChange={e => { f('buyer', e.target.value); f('buyerId', ''); f('localMarketMode', false) }} className="finput"/>
                  )}
                </div>

                {/* Editable qty */}
                <div><label className="text-xs text-[var(--c-sub)] block mb-1">Qty sold (qtl)</label>
                  <input type="number" step="0.01" value={form.qtyQtl} onChange={e => f('qtyQtl', e.target.value)} className="finput"/></div>

                {/* Rate */}
                <div><label className="text-xs text-[var(--c-sub)] block mb-1">Rate ₹/qtl <span className="text-[#E24B4A]">*</span></label>
                  <input type="number" placeholder="e.g. 2200" value={form.rate} onChange={e => f('rate', e.target.value)} className="finput"/></div>

                {/* Commission + Freight on same row */}
                <div className="grid grid-cols-2 gap-2">
                  <div><label className="text-xs text-[var(--c-sub)] block mb-1">Commission ₹/qtl</label>
                    <input type="number" step="0.1" placeholder="e.g. 20" value={form.commissionPerQtl} onChange={e => f('commissionPerQtl', e.target.value)} className="finput"/></div>
                  <div><label className="text-xs text-[var(--c-sub)] block mb-1">Freight ₹</label>
                    <input type="number" placeholder="0" value={form.freightCharges} onChange={e => f('freightCharges', e.target.value)} className="finput"/></div>
                </div>

                {/* Live breakdown card */}
                {gross > 0 && (
                  <div className={`rounded-xl px-3 py-2.5 border ${hasBreakdown ? 'bg-[var(--c-ghost)] border-[var(--c-border-md)]' : 'bg-[#1D9E75]/10 border-[#1D9E75]/20'}`}>
                    {hasBreakdown ? (
                      <div className="space-y-1.5">
                        <div className="flex justify-between text-xs">
                          <span className="text-[var(--c-faint)]">Gross ({qty.toFixed(2)} × ₹{rate})</span>
                          <span className="text-[var(--c-text)] font-medium">₹{gross.toLocaleString('en-IN')}</span>
                        </div>
                        {commAmt > 0 && (
                          <div className="flex justify-between text-xs">
                            <span className="text-[var(--c-faint)]">Commission (₹{commPerQtl}/qtl)</span>
                            <span className="text-[#E24B4A]">− ₹{commAmt.toLocaleString('en-IN')}</span>
                          </div>
                        )}
                        {freight > 0 && (
                          <div className="flex justify-between text-xs">
                            <span className="text-[var(--c-faint)]">Freight</span>
                            <span className="text-[#E24B4A]">− ₹{freight.toLocaleString('en-IN')}</span>
                          </div>
                        )}
                        <div className="border-t border-[var(--c-border-md)] pt-1.5 flex justify-between">
                          <span className="text-xs font-semibold text-[var(--c-text)]">Net receivable</span>
                          <span className="text-base font-bold text-[#1D9E75]">₹{net.toLocaleString('en-IN')}</span>
                        </div>
                      </div>
                    ) : (
                      <>
                        <p className="text-xs text-[var(--c-sub)]">Gross amount</p>
                        <p className="text-xl font-bold text-[#1D9E75]">₹{gross.toLocaleString('en-IN')}</p>
                      </>
                    )}
                  </div>
                )}

                <p className="text-[10px] text-[var(--c-faint)] text-center">Payment receipt uploaded in next step →</p>
                <button onClick={confirmSale} disabled={saving || !form.buyer || !form.rate}
                  className="w-full py-3 bg-[#1D9E75] text-white text-sm font-bold rounded-xl disabled:opacity-50">
                  {saving ? 'Saving…' : 'Record Sale'}
                </button>
              </div>
            </div>
          </div>
        )
      })()}

      {/* Mark Payment Modal (crop) */}
      {cropPayModal && (() => {
        const sale       = cropPayModal.sale
        const gross      = sale.grossAmount      || 0
        const commAmt    = sale.commissionAmt    || 0
        const freight    = sale.freightCharges   || 0
        const extraDed   = parseFloat(cropPayModal.ded) || 0
        const net        = Math.max(0, gross - commAmt - freight - extraDed)
        const hasSaleDeds = commAmt > 0 || freight > 0
        return (
          <div className="fixed inset-0 z-50 flex items-end" style={{ background: 'rgba(0,0,0,0.7)' }} onClick={() => !saving && setCropPayModal(null)}>
            <div className="w-full bg-[var(--c-nav)] rounded-t-3xl p-5 max-h-[85vh] overflow-y-auto border-t border-[var(--c-border-md)]" onClick={e => e.stopPropagation()}>
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-bold text-[var(--c-text)]">Mark Payment — {cropPayModal.cycle.plotLabel}</h3>
                <button onClick={() => !saving && setCropPayModal(null)} className="text-[var(--c-muted)]"><X size={18}/></button>
              </div>

              {/* Sale summary */}
              <div className="bg-[var(--c-ghost)] rounded-xl px-3 py-2.5 space-y-1.5 mb-4">
                {[
                  ['Buyer',    sale.buyerName || '—'],
                  ['Quantity', `${cropPayModal.session.qtyQtl.toFixed(2)} qtl`],
                  ['Rate',     `₹${sale.ratePerQtl}/qtl`],
                  ['Gross',    `₹${gross.toLocaleString('en-IN')}`],
                ].map(([label, val]) => (
                  <div key={label} className="flex justify-between text-xs">
                    <span className="text-[var(--c-faint)]">{label}</span>
                    <span className="text-[var(--c-text)] font-medium">{val}</span>
                  </div>
                ))}

                {/* Sale-time deductions (read-only) */}
                {hasSaleDeds && (
                  <>
                    <div className="border-t border-[var(--c-border-md)] pt-1.5">
                      <p className="text-[10px] text-[var(--c-faint)] mb-1">Recorded at sale time</p>
                      {commAmt > 0 && (
                        <div className="flex justify-between text-xs">
                          <span className="text-[var(--c-faint)]">Commission (₹{sale.commissionPerQtl}/qtl)</span>
                          <span className="text-[#E24B4A]">− ₹{commAmt.toLocaleString('en-IN')}</span>
                        </div>
                      )}
                      {freight > 0 && (
                        <div className="flex justify-between text-xs">
                          <span className="text-[var(--c-faint)]">Freight</span>
                          <span className="text-[#E24B4A]">− ₹{freight.toLocaleString('en-IN')}</span>
                        </div>
                      )}
                    </div>
                  </>
                )}
              </div>

              <div className="space-y-3">
                <div><label className="text-xs text-[var(--c-sub)] block mb-1">Payment date</label>
                  <input type="date" value={cropPayModal.date} onChange={e => setCropPayModal(p => ({ ...p, date: e.target.value }))} className="finput" style={{ colorScheme: 'dark' }}/></div>

                <div><label className="text-xs text-[var(--c-sub)] block mb-1">Additional deductions ₹ <span className="text-[10px] text-[var(--c-faint)]">(if any at payment time)</span></label>
                  <input type="number" placeholder="0" value={cropPayModal.ded} onChange={e => setCropPayModal(p => ({ ...p, ded: e.target.value }))} className="finput"/></div>

                {parseFloat(cropPayModal.ded) > 0 && (
                  <div><label className="text-xs text-[var(--c-sub)] block mb-1">Deduction note</label>
                    <input placeholder="e.g. Weight shortage" value={cropPayModal.dedNote} onChange={e => setCropPayModal(p => ({ ...p, dedNote: e.target.value }))} className="finput"/></div>
                )}

                {/* Net amount card */}
                <div className="bg-[#1D9E75]/10 border border-[#1D9E75]/20 rounded-xl px-3 py-2.5">
                  {(hasSaleDeds || extraDed > 0) ? (
                    <div className="space-y-1">
                      <div className="flex justify-between text-xs">
                        <span className="text-[var(--c-faint)]">Gross</span>
                        <span className="text-[var(--c-text)]">₹{gross.toLocaleString('en-IN')}</span>
                      </div>
                      {commAmt > 0 && <div className="flex justify-between text-xs"><span className="text-[var(--c-faint)]">Commission</span><span className="text-[#E24B4A]">− ₹{commAmt.toLocaleString('en-IN')}</span></div>}
                      {freight > 0 && <div className="flex justify-between text-xs"><span className="text-[var(--c-faint)]">Freight</span><span className="text-[#E24B4A]">− ₹{freight.toLocaleString('en-IN')}</span></div>}
                      {extraDed > 0 && <div className="flex justify-between text-xs"><span className="text-[var(--c-faint)]">Extra deductions</span><span className="text-[#E24B4A]">− ₹{extraDed.toLocaleString('en-IN')}</span></div>}
                      <div className="border-t border-[#1D9E75]/30 pt-1 flex justify-between">
                        <span className="text-xs font-semibold text-[var(--c-text)]">Net receivable</span>
                        <span className="text-base font-bold text-[#1D9E75]">₹{net.toLocaleString('en-IN')}</span>
                      </div>
                    </div>
                  ) : (
                    <>
                      <p className="text-xs text-[var(--c-faint)]">Net receivable</p>
                      <p className="text-lg font-bold text-[#1D9E75]">₹{net.toLocaleString('en-IN')}</p>
                    </>
                  )}
                </div>

                <div>
                  <label className="text-xs text-[var(--c-sub)] block mb-1">Payment receipt <span className="text-[#E24B4A]">*</span></label>
                  <FilePicker accept="image/*,application/pdf" file={cropPayFile} onFile={setCropPayFile} />
                  {!cropPayFile && <p className="text-[10px] text-[#BA7517] mt-1">Receipt required to confirm payment</p>}
                </div>
                {canMarkPayment ? (
                  <button onClick={confirmCropPayment} disabled={saving || !cropPayFile}
                    className="w-full py-3 bg-[#1D9E75] text-white text-sm font-bold rounded-xl disabled:opacity-50">
                    {saving ? 'Confirming…' : 'Confirm Payment — Move to Past Harvests'}
                  </button>
                ) : (
                  <p className="text-[10px] text-[#BA7517] text-center bg-[#BA7517]/10 rounded-xl py-2.5 px-2">
                    Only a manager or accounts admin can confirm payment
                  </p>
                )}
              </div>
            </div>
          </div>
        )
      })()}

      {/* Residual Sale Modal */}
      {residualModal && (
        <div className="fixed inset-0 z-50 flex items-end" style={{ background: 'rgba(0,0,0,0.7)' }} onClick={() => !saving && setResidualModal(null)}>
          <div className="w-full bg-[var(--c-nav)] rounded-t-3xl p-5 max-h-[85vh] overflow-y-auto border-t border-[var(--c-border-md)]" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-bold text-[var(--c-text)]">Sell — {residualModal.productName}</h3>
              <button onClick={() => !saving && setResidualModal(null)} className="text-[var(--c-muted)]"><X size={18}/></button>
            </div>
            <div className="bg-[var(--c-ghost)] rounded-xl px-3 py-2 mb-4 flex items-center justify-between">
              <p className="text-sm font-bold text-[var(--c-text)]">{residualModal.quantity.toFixed(1)} {residualModal.unit}</p>
              {residualModal.expectedRate > 0 && <p className="text-[10px] text-[var(--c-faint)]">Est. ₹{residualModal.expectedRate}/{residualModal.unit}</p>}
            </div>
            <div className="space-y-3">
              <div><label className="text-xs text-[var(--c-sub)] block mb-1">Sale date</label>
                <input type="date" value={form.date} onChange={e => f('date', e.target.value)} className="finput" style={{ colorScheme: 'dark' }}/></div>
              <div><label className="text-xs text-[var(--c-sub)] block mb-1">Buyer name (optional)</label>
                <input placeholder="e.g. Ramesh" value={form.buyerName} onChange={e => f('buyerName', e.target.value)} className="finput"/></div>
              <div><label className="text-xs text-[var(--c-sub)] block mb-1">Rate ₹/{residualModal.unit} <span className="text-[#E24B4A]">*</span></label>
                <input type="number" placeholder={String(residualModal.expectedRate || '')} value={form.actualRate} onChange={e => f('actualRate', e.target.value)} className="finput"/></div>
              {form.actualRate && (
                <div className="bg-[#1D9E75]/10 border border-[#1D9E75]/20 rounded-xl px-3 py-2">
                  <p className="text-xs text-[var(--c-sub)]">Total</p>
                  <p className="text-xl font-bold text-[#1D9E75]">₹{Math.round(residualModal.quantity * parseFloat(form.actualRate)).toLocaleString('en-IN')}</p>
                </div>
              )}
              <div>
                <label className="text-xs text-[var(--c-sub)] block mb-1">Payment status</label>
                <div className="flex gap-2">
                  {['pending', 'paid'].map(s => (
                    <button key={s} onClick={() => f('paymentStatus', s)}
                      className={`flex-1 py-2 text-xs font-semibold rounded-xl border transition-colors ${
                        form.paymentStatus === s
                          ? s === 'paid' ? 'bg-[#1D9E75] text-white border-transparent' : 'bg-[#BA7517]/20 text-[#BA7517] border-[#BA7517]/40'
                          : 'bg-transparent text-[var(--c-muted)] border-[var(--c-border)]'
                      }`}>
                      {s === 'paid' ? '✓ Received' : 'Pending'}
                    </button>
                  ))}
                </div>
              </div>
              <button onClick={confirmResidualSale} disabled={saving || !form.actualRate}
                className="w-full py-3 bg-[#1D9E75] text-white text-sm font-bold rounded-xl disabled:opacity-50">
                {saving ? 'Saving…' : 'Record Residual Sale'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Cane: Add Supply Modal */}
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
              <div><label className="text-xs text-[var(--c-sub)] block mb-1">Parchi No.</label>
                <input placeholder="e.g. P-001" value={form.parchiNumber} onChange={e => f('parchiNumber', e.target.value)} className="finput"/></div>
              <div>
                <label className="text-xs text-[var(--c-sub)] block mb-1">Partner <span className="text-[#E24B4A]">*</span></label>
                <select className="finput" value={form.partnerId} onChange={e => f('partnerId', e.target.value)} style={{ background: 'var(--c-surface)' }}>
                  <option value="" style={{ background: 'var(--c-surface)' }}>Select partner…</option>
                  {partners.map(p => <option key={p.id} value={p.id} style={{ background: 'var(--c-surface)' }}>{p.name}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs text-[var(--c-sub)] block mb-1">Mill / Buyer <span className="text-[#E24B4A]">*</span></label>
                <select className="finput" value={form.buyerId} onChange={e => f('buyerId', e.target.value)} style={{ background: 'var(--c-surface)' }}>
                  <option value="" style={{ background: 'var(--c-surface)' }}>Select mill…</option>
                  {buyers.map(b => <option key={b.id} value={b.id} style={{ background: 'var(--c-surface)' }}>{b.name}</option>)}
                </select>
              </div>
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
              <div>
                <label className="text-xs text-[var(--c-sub)] block mb-1">Parchi attachment (optional)</label>
                <FilePicker accept="image/*,application/pdf" file={parchiFile} onFile={setParchiFile} />
              </div>
              <div><label className="text-xs text-[var(--c-sub)] block mb-1">Notes (optional)</label>
                <input placeholder="Any notes…" value={form.notes} onChange={e => f('notes', e.target.value)} className="finput"/></div>
              <button onClick={confirmAddSupply} disabled={saving || !form.qtyQtl || !form.partnerId || !form.buyerId}
                className="w-full py-3 bg-[#1D9E75] text-white text-sm font-bold rounded-xl disabled:opacity-50">
                {saving ? 'Saving…' : 'Log Supply'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Cane: Payment Modal */}
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
                  ['Partner', partnerName(payModal.supply.partnerId) || '—'],
                  ['Mill', payModal.sale?.buyerId ? (buyerName(payModal.sale.buyerId) || payModal.sale.buyerName) : (payModal.sale?.buyerName || '—')],
                  ['Supply Date', payModal.supply.date],
                  ['Quantity', `${payModal.supply.qtyQtl.toFixed(1)} qtl`],
                  ['Gross (at SAP)', `₹${payModal.sale?.grossAmount?.toLocaleString('en-IN') || '—'}`],
                ].map(([label, val]) => (
                  <div key={label} className="flex justify-between text-xs">
                    <span className="text-[var(--c-faint)]">{label}</span>
                    <span className="text-[var(--c-text)] font-medium">{val}</span>
                  </div>
                ))}
                {payModal.supply.parchiAttachmentPath && (
                  <Attachment variant="chip" value={payModal.supply.parchiAttachmentPath} name="View Parchi" />
                )}
              </div>
              {payModal.sale?.paymentStatus === 'paid' ? (
                <div className="bg-[#1D9E75]/10 border border-[#1D9E75]/20 rounded-xl px-3 py-2.5">
                  <p className="text-sm font-semibold text-[#1D9E75]">Payment Received</p>
                  <p className="text-xs text-[var(--c-muted)] mt-0.5">Date: {payModal.sale.paymentDate}</p>
                  {payModal.sale.deductions > 0 && <p className="text-xs text-[var(--c-muted)] mt-0.5">Deductions: ₹{payModal.sale.deductions.toLocaleString('en-IN')}{payModal.sale.deductionsNote && ` (${payModal.sale.deductionsNote})`}</p>}
                  <p className="text-sm font-bold text-[#1D9E75] mt-1">Net: ₹{payModal.sale.netAmount?.toLocaleString('en-IN')}</p>
                  {payModal.sale.paymentAttachmentPath && (
                    <div className="mt-1">
                      <Attachment variant="chip" value={payModal.sale.paymentAttachmentPath} name="View Receipt" />
                    </div>
                  )}
                </div>
              ) : (
                <>
                  <div><label className="text-xs text-[var(--c-sub)] block mb-1">Payment date</label>
                    <input type="date" value={payModal.date} onChange={e => setPayModal(p => ({ ...p, date: e.target.value }))} className="finput" style={{ colorScheme: 'dark' }}/></div>
                  <div><label className="text-xs text-[var(--c-sub)] block mb-1">Deductions ₹</label>
                    <input type="number" placeholder="0" value={payModal.ded} onChange={e => setPayModal(p => ({ ...p, ded: e.target.value }))} className="finput"/></div>
                  <div><label className="text-xs text-[var(--c-sub)] block mb-1">Deduction note (optional)</label>
                    <input placeholder="e.g. Society commission 1%" value={payModal.dedNote} onChange={e => setPayModal(p => ({ ...p, dedNote: e.target.value }))} className="finput"/></div>
                  {payModal.sale && (
                    <div className="bg-[var(--c-ghost)] rounded-xl px-3 py-2">
                      <p className="text-xs text-[var(--c-faint)]">Net amount to receive</p>
                      <p className="text-lg font-bold text-[#1D9E75]">₹{Math.max(0, (payModal.sale.grossAmount || 0) - (parseFloat(payModal.ded) || 0)).toLocaleString('en-IN')}</p>
                    </div>
                  )}
                  <div>
                    <label className="text-xs text-[var(--c-sub)] block mb-1">Payment receipt (optional)</label>
                    <FilePicker accept="image/*,application/pdf" file={payFile} onFile={setPayFile} />
                  </div>
                  {canMarkPayment ? (
                    <button onClick={confirmPayment} disabled={saving}
                      className="w-full py-3 bg-[#1D9E75] text-white text-sm font-bold rounded-xl disabled:opacity-50">
                      {saving ? 'Saving…' : 'Mark as Paid'}
                    </button>
                  ) : (
                    <p className="text-[10px] text-[#BA7517] text-center bg-[#BA7517]/10 rounded-xl py-2.5 px-2">
                      Only a manager or accounts admin can confirm payment
                    </p>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Cane: Mill Info Modal */}
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

      {/* Cane: Close Harvest Modal */}
      {closeModal && (
        <div className="fixed inset-0 z-50 flex items-end" style={{ background: 'rgba(0,0,0,0.7)' }} onClick={() => !saving && setCloseModal(null)}>
          <div className="w-full bg-[var(--c-nav)] rounded-t-3xl p-5 max-h-[85vh] overflow-y-auto border-t border-[var(--c-border-md)]" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-bold text-[var(--c-text)]">Close Harvest — {closeModal.plotLabel}</h3>
              <button onClick={() => !saving && setCloseModal(null)} className="text-[var(--c-muted)]"><X size={18}/></button>
            </div>
            <div className="space-y-3">
              <div className="bg-[#BA7517]/10 border border-[#BA7517]/30 rounded-xl px-3 py-2.5">
                <p className="text-xs text-[#BA7517] font-semibold mb-1">Parchi numbers logged:</p>
                <p className="text-xs text-[var(--c-text)]">{cycleSupplies(closeModal.id).map(s => s.parchiNumber).filter(Boolean).join(', ') || '(none with parchi numbers)'}</p>
              </div>
              <div>
                <label className="text-xs text-[var(--c-sub)] block mb-1">Enter all parchi numbers (comma separated)</label>
                <textarea className="finput" rows={3} placeholder="P-001, P-002, P-003"
                  value={closeInput} onChange={e => setCloseInput(e.target.value)} style={{ resize: 'vertical' }}/>
              </div>
              {closeError && (
                <div className="bg-[#E24B4A]/10 border border-[#E24B4A]/30 rounded-xl px-3 py-2.5 flex items-start gap-2">
                  <AlertTriangle size={14} className="text-[#E24B4A] shrink-0 mt-0.5"/>
                  <p className="text-xs text-[#E24B4A]">{closeError}</p>
                </div>
              )}
              <button onClick={confirmClose} disabled={saving || !closeInput.trim()}
                className="w-full py-3 bg-[#BA7517] text-white text-sm font-bold rounded-xl disabled:opacity-50">
                {saving ? 'Verifying…' : 'Verify & Close Harvest'}
              </button>
              <p className="text-[10px] text-[var(--c-faint)] text-center">After closing, no more supplies can be logged for this plot.</p>
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

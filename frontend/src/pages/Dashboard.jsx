import React, { useState } from 'react'
import { AppLauncher } from '@capacitor/app-launcher'
import { format, differenceInDays } from 'date-fns'
import { useAuthStore } from '../store/auth'
import { useAppStore } from '../store'
import { supabase } from '../lib/supabase'
import Attachment from '../components/Attachment'

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmt(n) {
  if (!n) return '₹0'
  if (n >= 10000000) return `₹${(n / 10000000).toFixed(2)}Cr`
  if (n >= 100000)   return `₹${(n / 100000).toFixed(2)}L`
  if (n >= 1000)     return `₹${(n / 1000).toFixed(1)}k`
  return `₹${Math.round(n)}`
}

function fmtK(n) {
  if (!n) return '₹0'
  if (n >= 100000) return `${(n / 100000).toFixed(1)}L`
  if (n >= 1000)   return `${(n / 1000).toFixed(1)}k`
  return `${Math.round(n)}`
}

function fmtQtl(n) {
  if (!n || n === 0) return '0 qtl'
  return `${n % 1 === 0 ? n : n.toFixed(1)} qtl`
}

function getStorageUrl(path) {
  if (!path) return null
  return supabase.storage.from('farm-photos').getPublicUrl(path).data.publicUrl
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function Card({ title, subtitle, children, noPad }) {
  return (
    <div className="bg-[var(--c-nav)] rounded-card border border-[var(--c-border)] overflow-hidden">
      <div className="flex items-baseline justify-between px-4 pt-4 pb-3 border-b border-[var(--c-border)]">
        <h3 className="text-xs font-bold uppercase tracking-widest text-[var(--c-sub)]">{title}</h3>
        {subtitle && <span className="text-[10px] text-[var(--c-faint)]">{subtitle}</span>}
      </div>
      <div className={noPad ? '' : 'p-4'}>{children}</div>
    </div>
  )
}

function KpiCard({ label, value, sub, color }) {
  return (
    <div className="bg-[var(--c-nav)] rounded-card border border-[var(--c-border)] p-3 flex flex-col gap-0.5">
      <p className="text-[9px] font-bold uppercase tracking-widest text-[var(--c-muted)]">{label}</p>
      <p className="text-[18px] font-black leading-none mt-0.5" style={{ color }}>{value}</p>
      {sub && <p className="text-[9px] text-[var(--c-faint)] leading-tight">{sub}</p>}
    </div>
  )
}

function ProgressBar({ pct, color }) {
  return (
    <div className="h-1.5 rounded-full bg-[var(--c-ghost)] overflow-hidden">
      <div className="h-full rounded-full transition-all" style={{ width: `${Math.min(pct, 100)}%`, background: color }} />
    </div>
  )
}

function StatusBadge({ status }) {
  const map = {
    paid:    { label: 'Paid',    cls: 'bg-[#1D9E75]/20 text-[#1D9E75]' },
    pending: { label: 'Pending', cls: 'bg-[#BA7517]/20 text-[#BA7517]' },
    partial: { label: 'Partial', cls: 'bg-[#1D9E75]/15 text-[#1D9E75]' },
  }
  const m = map[status] || map.pending
  return <span className={`text-[8px] font-bold px-1.5 py-0.5 rounded-full ${m.cls}`}>{m.label}</span>
}

// ── Mill Ledger ────────────────────────────────────────────────────────────────

function CaneMillLedger({ harvestSessions, sales, buyers }) {
  const activeBuyers = buyers.filter(b => sales.some(s => s.buyerId === b.id))
  const [activeTab, setActiveTab] = useState(activeBuyers[0]?.id || null)
  if (!activeBuyers.length) return null

  const currentBuyer = activeBuyers.find(b => b.id === activeTab) || activeBuyers[0]
  const bSales     = sales.filter(s => s.buyerId === currentBuyer.id)
  const sessionIds = new Set(bSales.map(s => s.sessionId))
  const bSessions  = harvestSessions.filter(s => sessionIds.has(s.id))

  const rows = []
  bSessions.forEach(sess => {
    const sale = bSales.find(s => s.sessionId === sess.id)
    rows.push({
      date: sess.date, type: 'supply',
      label: `Parchi ${sess.parchiNumber || '—'}`,
      sub: sale?.buyerName || currentBuyer.name,
      qtl: sess.qtyQtl,
      dr: sale?.grossAmount || 0, cr: 0,
      docPath: sess.parchiAttachmentPath,
    })
    if (sale?.paymentStatus === 'paid' && sale.netAmount > 0) {
      rows.push({
        date: sale.paymentDate || sale.date, type: 'payment',
        label: 'Payment received',
        sub: sale.deductions > 0 ? `Deductions: ₹${Math.round(sale.deductions).toLocaleString('en-IN')}` : 'Full payment',
        qtl: null, dr: 0, cr: sale.netAmount,
        docPath: sale.paymentAttachmentPath,
      })
    }
  })
  rows.sort((a, b) => (a.date || '').localeCompare(b.date || ''))

  let balance = 0
  const ledger = rows.map(r => { balance += r.dr - r.cr; return { ...r, balance } })
  const totalDr  = ledger.filter(r => r.dr > 0).reduce((n, r) => n + r.dr, 0)
  const totalCr  = ledger.filter(r => r.cr > 0).reduce((n, r) => n + r.cr, 0)
  const totalQtl = bSessions.reduce((n, s) => n + (s.qtyQtl || 0), 0)

  return (
    <Card title="Mill Ledger (Cane)" subtitle="Dr / Cr accounting">
      <div className="flex gap-2 mb-4 -mt-1">
        {activeBuyers.map(b => (
          <button key={b.id} onClick={() => setActiveTab(b.id)}
            className={`text-[10px] font-bold px-3 py-1.5 rounded-full border transition-colors ${
              activeTab === b.id
                ? 'bg-[#1D9E75] border-[#1D9E75] text-white'
                : 'border-[var(--c-border)] text-[var(--c-muted)] bg-[var(--c-ghost)]'
            }`}>{b.name.split(' ')[0]}</button>
        ))}
      </div>

      <div className="grid grid-cols-3 gap-2 mb-4">
        <div className="bg-[var(--c-ghost)] rounded-xl p-2.5 text-center border border-[var(--c-border)]">
          <p className="text-[8px] text-[var(--c-muted)] uppercase tracking-wider">Supplied</p>
          <p className="text-sm font-black text-[var(--c-text)] mt-0.5">{fmtQtl(totalQtl)}</p>
        </div>
        <div className="bg-[#E24B4A]/10 rounded-xl p-2.5 text-center border border-[#E24B4A]/20">
          <p className="text-[8px] text-[#E24B4A] uppercase tracking-wider">Total Dr</p>
          <p className="text-sm font-black text-[#E24B4A] mt-0.5">{fmtK(totalDr)}</p>
        </div>
        <div className="bg-[#1D9E75]/10 rounded-xl p-2.5 text-center border border-[#1D9E75]/20">
          <p className="text-[8px] text-[#1D9E75] uppercase tracking-wider">Total Cr</p>
          <p className="text-sm font-black text-[#1D9E75] mt-0.5">{fmtK(totalCr)}</p>
        </div>
      </div>

      <div className="rounded-xl border border-[var(--c-border)] overflow-hidden">
        <div className="grid bg-[var(--c-ghost)] px-3 py-2 text-[8px] font-bold uppercase tracking-wider text-[var(--c-muted)]"
          style={{ gridTemplateColumns: '48px 1fr 48px 48px 54px 18px' }}>
          <span>Date</span><span>Particulars</span>
          <span className="text-right">Dr</span><span className="text-right">Cr</span>
          <span className="text-right">Balance</span><span/>
        </div>

        {ledger.length === 0 && (
          <p className="text-xs text-[var(--c-faint)] px-3 py-4 text-center">No entries</p>
        )}

        {ledger.map((row, i) => {
          const docUrl   = getStorageUrl(row.docPath)
          const isPay    = row.type === 'payment'
          return (
            <div key={i}
              className="grid items-center px-3 py-2.5 border-t border-[var(--c-border)]"
              style={{ gridTemplateColumns: '48px 1fr 48px 48px 54px 18px', background: isPay ? 'rgba(29,158,117,0.04)' : undefined }}>
              <span className="text-[9px] text-[var(--c-faint)]">
                {row.date ? row.date.slice(5).replace('-', '/') : '—'}
              </span>
              <div className="min-w-0">
                <p className={`text-[10px] font-semibold truncate ${isPay ? 'text-[#1D9E75]' : 'text-[var(--c-text)]'}`}>{row.label}</p>
                <p className="text-[8px] text-[var(--c-faint)] truncate">{row.sub}</p>
              </div>
              <span className="text-[10px] text-right text-[#E24B4A] font-mono">{row.dr > 0 ? fmtK(row.dr) : ''}</span>
              <span className="text-[10px] text-right text-[#1D9E75] font-mono">{row.cr > 0 ? fmtK(row.cr) : ''}</span>
              <span className={`text-[10px] text-right font-mono font-bold ${row.balance > 0 ? 'text-[#BA7517]' : 'text-[#1D9E75]'}`}>
                {fmtK(Math.abs(row.balance))}{row.balance > 0 ? ' Dr' : row.balance < 0 ? ' Cr' : ''}
              </span>
              <span className="text-center text-[11px]">
                {docUrl && <Attachment variant="chip" value={docUrl} icon={isPay ? '🧾' : '📄'} name="" />}
              </span>
            </div>
          )
        })}

        {ledger.length > 0 && (
          <div className="grid items-center px-3 py-2.5 border-t-2 border-[var(--c-border)] bg-[var(--c-ghost)]"
            style={{ gridTemplateColumns: '48px 1fr 48px 48px 54px 18px' }}>
            <span/><span className="text-[9px] font-bold text-[var(--c-sub)] uppercase">Totals</span>
            <span className="text-[10px] text-right text-[#E24B4A] font-mono font-bold">{fmtK(totalDr)}</span>
            <span className="text-[10px] text-right text-[#1D9E75] font-mono font-bold">{fmtK(totalCr)}</span>
            <span className={`text-[10px] text-right font-mono font-black ${balance > 0 ? 'text-[#BA7517]' : 'text-[#1D9E75]'}`}>
              {fmtK(Math.abs(balance))}{balance > 0 ? ' Dr' : balance < 0 ? ' Cr' : ''}
            </span>
            <span/>
          </div>
        )}
      </div>
    </Card>
  )
}

// ── Main Dashboard ─────────────────────────────────────────────────────────────

export default function Dashboard() {
  const now = new Date()
  const { profile } = useAuthStore()
  const {
    plots, cropMaster, cropCycles,
    harvestSessions, sales, buyers, partners,
    issues, labourLogs, inventoryMaster,
    livestockMaster, todayAttendance,
  } = useAppStore()

  const [expandedPartnerId, setExpandedPartnerId] = useState(null)
  const [expandedCycleId,   setExpandedCycleId]   = useState(null)

  // ── Header meta ──
  const hour      = now.getHours()
  const greeting  = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening'
  const firstName = profile?.full_name?.split(' ')[0] || 'Vipul'
  const totalAcres    = plots.reduce((n, p) => n + (Number(p.area_acres) || 0), 0)
  const activeCycles  = cropCycles.filter(c => c.status === 'active')
  const presentToday  = Object.values(todayAttendance).filter(a => a.status === 'present').length

  // ── Cane identification ──
  const caneSessionCycleIds = new Set(harvestSessions.map(s => s.cycleId))

  // ── Revenue financials (cane only has real sales data) ──
  const caneGrossTotal = sales.reduce((n, s) => n + s.grossAmount, 0)
  const caneRevPaid    = sales.filter(s => s.paymentStatus === 'paid').reduce((n, s) => n + s.netAmount, 0)
  const caneRevPending = sales.filter(s => s.paymentStatus !== 'paid').reduce((n, s) => n + s.grossAmount, 0)

  // Estimated revenue for non-cane active cycles — grain plus residuals
  // (bhoosa, parali): both are real revenue the standing crop will bring.
  const otherEstRev = activeCycles
    .filter(c => !caneSessionCycleIds.has(c.id))
    .reduce((n, c) => {
      const crop = cropMaster.find(cr => cr.id === c.cropId)
      if (!crop) return n
      const residualPerAcre = (crop.residuals || []).reduce(
        (r, d) => r + (Number(d.qty_per_acre) || 0) * (Number(d.expected_rate) || 0), 0)
      return n + (c.acres || 0) * ((crop.yieldPerAcre || 0) * (crop.pricePerQtl || 0) + residualPerAcre)
    }, 0)

  const totalExpectedRevenue = caneGrossTotal + otherEstRev

  // ── Expense totals ──
  // Stock corrections rebalance inventory after data mishaps; they are not
  // spend, so they must not inflate the owner's season-cost number.
  const totalInputCost  = issues
    .filter(i => i.purpose !== 'stock_correction' && i.purpose !== 'historical_correction')
    .reduce((n, i) => n + (i.totalCost || 0), 0)
  const totalLabourCost = labourLogs.reduce((n, l) => n + (l.totalCost || 0), 0)
  const totalExpense    = totalInputCost + totalLabourCost
  const netPosition     = caneRevPaid - totalExpense

  // ── Diesel item IDs (category = 'fuel') ──
  const dieselItemIds = new Set(
    inventoryMaster.filter(i => i.category === 'fuel').map(i => i.id)
  )

  // Per-cycle expense breakdown
  const getCycleExp = (cycleId) => {
    const ci = issues.filter(i => i.cropCycleId === cycleId)
    const cl = labourLogs.filter(l => l.cropCycleId === cycleId)
    const diesel    = ci.filter(i => dieselItemIds.has(i.itemId)).reduce((n, i) => n + i.totalCost, 0)
    const inventory = ci.filter(i => !dieselItemIds.has(i.itemId)).reduce((n, i) => n + i.totalCost, 0)
    const labour    = cl.reduce((n, l) => n + l.totalCost, 0)
    return { diesel, inventory, labour, total: diesel + inventory + labour }
  }

  // ── Partners sorted: Vipul first, then alphabetical ──
  const sortedPartners = [...partners].sort((a, b) => {
    if (a.name.toLowerCase().includes('vipul')) return -1
    if (b.name.toLowerCase().includes('vipul')) return 1
    return a.name.localeCompare(b.name)
  })

  // ── Livestock grouping ──
  const isCattle  = l => ['cattle', 'cow', 'buffalo', 'bull', 'ox', 'calf'].some(s => l.species?.toLowerCase().includes(s))
  const isPoultry = l => ['poultry', 'chicken', 'hen', 'duck', 'bird'].some(s => l.species?.toLowerCase().includes(s))
  const getCount  = animals => animals.reduce((n, l) =>
    n + (l.trackingMode === 'count' ? (l.currentCount || 0) : 1), 0)
  const active        = livestockMaster.filter(l => l.isActive)
  const cattleCount   = getCount(active.filter(isCattle))
  const poultryCount  = getCount(active.filter(isPoultry))

  // ── Upcoming harvests ──
  const upcoming = activeCycles
    .filter(c => c.harvestDate)
    .map(c => ({ cycle: c, crop: cropMaster.find(cr => cr.id === c.cropId), days: differenceInDays(new Date(c.harvestDate), now) }))
    .filter(({ days }) => days >= -5 && days <= 180)
    .sort((a, b) => a.days - b.days)
    .slice(0, 6)

  return (
    <div className="h-full overflow-y-auto pb-10" style={{ background: 'var(--c-bg)' }}>

      {/* ── Sticky header ── */}
      <div className="sticky top-0 z-10 px-4 pt-4 pb-3 flex items-start justify-between"
        style={{ background: 'var(--c-bg)', borderBottom: '1px solid var(--c-border)' }}>
        <div>
          <h1 className="text-xl font-black text-[var(--c-text)] leading-tight">
            {greeting}, {firstName} 👋
          </h1>
          <p className="text-[11px] text-[var(--c-faint)] mt-0.5">
            {format(now, 'EEE d MMM yyyy')} · {totalAcres.toFixed(1)} ac · {activeCycles.length} running
            {presentToday > 0 ? ` · ${presentToday} present` : ''}
          </p>
        </div>
        <button
          onClick={async () => {
            try { await AppLauncher.openUrl({ url: 'package:com.mm.android.direct.g_CMOB_XU' }) }
            catch { window.open('https://play.google.com/store/apps/details?id=com.mm.android.direct.g_CMOB_XU', '_blank') }
          }}
          className="flex items-center gap-1.5 bg-[#E24B4A]/15 border border-[#E24B4A]/30 rounded-xl px-3 py-2 active:scale-95 transition-transform shrink-0"
        >
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#E24B4A] opacity-75" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-[#E24B4A]" />
          </span>
          <span className="text-[11px] font-bold text-[#E24B4A] tracking-widest">LIVE</span>
          <span className="text-sm">📹</span>
        </button>
      </div>

      <div className="px-4 pt-4 space-y-4">

        {/* ── Row 1: 3 revenue KPIs ── */}
        <div className="grid grid-cols-3 gap-2">
          <KpiCard
            label="Expected"
            value={fmt(totalExpectedRevenue)}
            sub="All crops"
            color="var(--c-text)"
          />
          <KpiCard
            label="Received"
            value={fmt(caneRevPaid)}
            sub="Mills paid"
            color="#1D9E75"
          />
          <KpiCard
            label="Pending"
            value={fmt(caneRevPending)}
            sub={`${sales.filter(s => s.paymentStatus !== 'paid').length} invoices`}
            color={caneRevPending > 0 ? '#BA7517' : '#1D9E75'}
          />
        </div>

        {/* ── Row 2: Expense + Net ── */}
        <div className="grid grid-cols-2 gap-2">
          <KpiCard
            label="Total Expense"
            value={fmt(totalExpense)}
            sub="Labour + inputs"
            color="#E24B4A"
          />
          <KpiCard
            label="Net Position"
            value={fmt(Math.abs(netPosition))}
            sub={netPosition >= 0 ? 'Surplus after costs' : 'Costs exceed receipts'}
            color={netPosition >= 0 ? '#1D9E75' : '#E24B4A'}
          />
        </div>

        {/* ── Sugarcane — Partner Payment Status ── */}
        <Card title="Sugarcane — Partner Payments"
          subtitle={`${harvestSessions.length} parcels · tap row to expand`}
          noPad>
          {/* Column headers */}
          <div className="grid px-3 py-2 text-[8px] font-bold uppercase tracking-wider text-[var(--c-muted)] bg-[var(--c-ghost)] border-b border-[var(--c-border)]"
            style={{ gridTemplateColumns: '1fr 58px 58px 58px 18px' }}>
            <span>Partner</span>
            <span className="text-right">Expected</span>
            <span className="text-right text-[#1D9E75]">Recd</span>
            <span className="text-right text-[#BA7517]">Due</span>
            <span/>
          </div>

          {sortedPartners.length === 0 && (
            <p className="text-xs text-[var(--c-faint)] text-center py-5">No partners configured</p>
          )}

          {sortedPartners.map((partner, idx) => {
            const pSessions = harvestSessions.filter(s => s.partnerId === partner.id)
            const pSales    = pSessions.flatMap(s => sales.filter(sl => sl.sessionId === s.id))
            const expected  = pSales.reduce((n, s) => n + s.grossAmount, 0)
            const received  = pSales.filter(s => s.paymentStatus === 'paid').reduce((n, s) => n + s.netAmount, 0)
            const pending   = pSales.filter(s => s.paymentStatus !== 'paid').reduce((n, s) => n + s.grossAmount, 0)
            const isExpanded = expandedPartnerId === partner.id
            const hasParcels = pSessions.length > 0

            return (
              <React.Fragment key={partner.id}>
                {/* Summary row */}
                <div
                  onClick={() => hasParcels && setExpandedPartnerId(isExpanded ? null : partner.id)}
                  className={`grid items-center px-3 py-2.5 border-b border-[var(--c-border)] ${hasParcels ? 'cursor-pointer active:bg-[var(--c-ghost)]' : ''} ${isExpanded ? 'bg-[var(--c-ghost)]/50' : ''}`}
                  style={{ gridTemplateColumns: '1fr 58px 58px 58px 18px' }}
                >
                  <div>
                    <p className="text-[11px] font-bold text-[var(--c-text)]">{partner.name.split(' ')[0]}</p>
                    <p className="text-[8px] text-[var(--c-faint)]">
                      {pSessions.length > 0 ? `${pSessions.length} parchi` : 'No entries yet'}
                    </p>
                  </div>
                  <span className="text-[11px] text-right font-mono font-semibold text-[var(--c-text)]">
                    {expected > 0 ? fmtK(expected) : '—'}
                  </span>
                  <span className="text-[11px] text-right font-mono font-semibold text-[#1D9E75]">
                    {received > 0 ? fmtK(received) : '—'}
                  </span>
                  <span className="text-[11px] text-right font-mono font-semibold text-[#BA7517]">
                    {pending > 0 ? fmtK(pending) : '—'}
                  </span>
                  <span className="text-[10px] text-center text-[var(--c-faint)]">
                    {hasParcels ? (isExpanded ? '▲' : '▼') : ''}
                  </span>
                </div>

                {/* Expanded parchi detail */}
                {isExpanded && (
                  <div className="border-b border-[var(--c-border)] bg-[var(--c-ghost)]/40 px-3 pt-1 pb-2">
                    <div className="grid py-1.5 text-[7px] font-bold uppercase tracking-wider text-[var(--c-faint)]"
                      style={{ gridTemplateColumns: '36px 1fr 44px 52px 20px' }}>
                      <span>Date</span><span>Parchi / Mill</span>
                      <span className="text-right">Qtl</span><span className="text-right">Amount</span><span/>
                    </div>

                    {pSessions
                      .slice().sort((a, b) => (a.date || '').localeCompare(b.date || ''))
                      .map(sess => {
                        const sale       = sales.find(s => s.sessionId === sess.id)
                        const buyer      = buyers.find(b => b.id === sale?.buyerId)
                        const isPaid     = sale?.paymentStatus === 'paid'
                        const amount     = isPaid ? sale?.netAmount : sale?.grossAmount
                        const parchiUrl  = getStorageUrl(sess.parchiAttachmentPath)
                        const receiptUrl = getStorageUrl(sale?.paymentAttachmentPath)
                        return (
                          <div key={sess.id}
                            className="grid items-center py-2 border-t border-[var(--c-border)]/60"
                            style={{ gridTemplateColumns: '36px 1fr 44px 52px 20px' }}>
                            <span className="text-[9px] text-[var(--c-faint)]">
                              {sess.date ? sess.date.slice(5).replace('-', '/') : '—'}
                            </span>
                            <div className="min-w-0">
                              <p className="text-[10px] font-semibold text-[var(--c-text)] truncate">
                                {sess.parchiNumber || '—'}
                              </p>
                              <p className="text-[8px] text-[var(--c-faint)] truncate">
                                {buyer?.name?.split(' ').slice(0, 3).join(' ') || sale?.buyerName || '—'}
                              </p>
                            </div>
                            <span className="text-[10px] text-right font-mono text-[var(--c-sub)]">
                              {sess.qtyQtl ? sess.qtyQtl.toFixed(1) : '—'}
                            </span>
                            <div className="text-right">
                              <p className={`text-[10px] font-bold font-mono ${isPaid ? 'text-[#1D9E75]' : 'text-[#BA7517]'}`}>
                                {amount ? fmtK(amount) : '—'}
                              </p>
                              <StatusBadge status={sale?.paymentStatus || 'pending'} />
                            </div>
                            <div className="flex flex-col items-center gap-0.5">
                              {parchiUrl  && <Attachment variant="chip" value={parchiUrl}  icon="📄" name="" />}
                              {receiptUrl && <Attachment variant="chip" value={receiptUrl} icon="🧾" name="" />}
                            </div>
                          </div>
                        )
                      })}
                  </div>
                )}
              </React.Fragment>
            )
          })}

          {/* Totals footer */}
          {sortedPartners.length > 0 && (
            <div className="grid px-3 py-2.5 bg-[var(--c-ghost)] text-[9px] font-bold"
              style={{ gridTemplateColumns: '1fr 58px 58px 58px 18px' }}>
              <span className="text-[var(--c-sub)] uppercase tracking-wider">Total</span>
              <span className="text-right font-mono text-[var(--c-text)]">{fmtK(sales.reduce((n, s) => n + s.grossAmount, 0))}</span>
              <span className="text-right font-mono text-[#1D9E75]">{fmtK(caneRevPaid)}</span>
              <span className="text-right font-mono text-[#BA7517]">{fmtK(caneRevPending)}</span>
              <span/>
            </div>
          )}
        </Card>

        {/* ── Running Crops by Plot ── */}
        {activeCycles.length > 0 && (
          <Card title="Running Crops" subtitle={`${activeCycles.length} active · tap to see costs`}>
            <div className="space-y-3">
              {activeCycles
                .sort((a, b) => (a.plotLabel || '').localeCompare(b.plotLabel || ''))
                .map(cycle => {
                  const crop       = cropMaster.find(cr => cr.id === cycle.cropId)
                  const exp        = getCycleExp(cycle.id)
                  const daysLeft   = cycle.harvestDate ? differenceInDays(new Date(cycle.harvestDate), now) : null
                  const isExpanded = expandedCycleId === cycle.id
                  const isCaneCycle = caneSessionCycleIds.has(cycle.id)

                  // Estimated / billed revenue for this cycle
                  let cycleRev = 0
                  if (isCaneCycle) {
                    const cSessions = harvestSessions.filter(s => s.cycleId === cycle.id)
                    cycleRev = cSessions
                      .flatMap(s => sales.filter(sl => sl.sessionId === s.id))
                      .reduce((n, s) => n + s.grossAmount, 0)
                  } else {
                    cycleRev = crop ? (cycle.acres || 0) * (crop.yieldPerAcre || 0) * (crop.pricePerQtl || 0) : 0
                  }

                  const netPL = cycleRev - exp.total

                  return (
                    <div key={cycle.id}
                      className="bg-[var(--c-ghost)] rounded-xl border border-[var(--c-border)] overflow-hidden">

                      {/* Plot header + metrics */}
                      <div className="px-3 pt-3 pb-2.5 cursor-pointer active:opacity-80"
                        onClick={() => setExpandedCycleId(isExpanded ? null : cycle.id)}>

                        <div className="flex items-start justify-between mb-2.5">
                          <div className="flex items-center gap-2">
                            <span className="text-xl">{crop?.emoji || '🌱'}</span>
                            <div>
                              <p className="text-sm font-black text-[var(--c-text)] leading-tight">
                                {cycle.plotLabel || '—'}
                              </p>
                              <p className="text-[9px] text-[var(--c-faint)]">
                                {crop?.name || '—'} · {(cycle.acres || 0).toFixed(1)} ac
                                {cycle.sowDate ? ` · ${cycle.sowDate.slice(5).replace('-', '/')}` : ''}
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center gap-1.5">
                            {daysLeft != null && (
                              <span className={`text-[8px] font-bold px-1.5 py-0.5 rounded-full ${
                                daysLeft <= 30 ? 'bg-[#1D9E75]/20 text-[#1D9E75]' :
                                daysLeft <= 60 ? 'bg-[#BA7517]/20 text-[#BA7517]' :
                                'bg-[var(--c-border)] text-[var(--c-muted)]'
                              }`}>{daysLeft <= 0 ? 'Harvest now' : `${daysLeft}d`}</span>
                            )}
                            <span className="text-[10px] text-[var(--c-faint)]">{isExpanded ? '▲' : '▼'}</span>
                          </div>
                        </div>

                        {/* 3-column: Expected Rev | Total Expense | P&L */}
                        <div className="grid grid-cols-3 gap-1.5">
                          <div className="bg-[var(--c-nav)] rounded-lg p-2 text-center border border-[var(--c-border)]">
                            <p className="text-[7px] text-[var(--c-muted)] uppercase tracking-wider">
                              {isCaneCycle ? 'Billed' : 'Est Rev'}
                            </p>
                            <p className="text-xs font-black text-[var(--c-text)] mt-0.5">
                              {cycleRev > 0 ? fmtK(cycleRev) : '₹0'}
                            </p>
                          </div>
                          <div className="bg-[#E24B4A]/10 rounded-lg p-2 text-center border border-[#E24B4A]/20">
                            <p className="text-[7px] text-[#E24B4A] uppercase tracking-wider">Expense</p>
                            <p className="text-xs font-black text-[#E24B4A] mt-0.5">
                              {exp.total > 0 ? fmtK(exp.total) : '₹0'}
                            </p>
                          </div>
                          <div className={`rounded-lg p-2 text-center border ${netPL >= 0 ? 'bg-[#1D9E75]/10 border-[#1D9E75]/20' : 'bg-[#BA7517]/10 border-[#BA7517]/20'}`}>
                            <p className={`text-[7px] uppercase tracking-wider ${netPL >= 0 ? 'text-[#1D9E75]' : 'text-[#BA7517]'}`}>P&L</p>
                            <p className={`text-xs font-black mt-0.5 ${netPL >= 0 ? 'text-[#1D9E75]' : 'text-[#BA7517]'}`}>
                              {netPL >= 0 ? '+' : '-'}{fmtK(Math.abs(netPL))}
                            </p>
                          </div>
                        </div>
                      </div>

                      {/* Expense breakdown (expanded) */}
                      {isExpanded && (
                        <div className="border-t border-[var(--c-border)] grid grid-cols-3 divide-x divide-[var(--c-border)]">
                          {[
                            { label: 'Labour',    value: exp.labour,    color: '#BA7517' },
                            { label: 'Inventory', value: exp.inventory, color: '#E24B4A' },
                            { label: 'Diesel',    value: exp.diesel,    color: '#6B5B3E' },
                          ].map(({ label, value, color }) => (
                            <div key={label} className="px-3 py-2.5 text-center">
                              <p className="text-[8px] text-[var(--c-faint)] uppercase tracking-wider">{label}</p>
                              <p className="text-xs font-bold mt-0.5" style={{ color: value > 0 ? color : 'var(--c-muted)' }}>
                                {value > 0 ? fmtK(value) : '₹0'}
                              </p>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )
                })}
            </div>
          </Card>
        )}

        {/* ── Livestock Overview ── */}
        <Card title="Livestock" subtitle="Revenue & expense — coming soon" noPad>
          <div className="divide-y divide-[var(--c-border)]">
            {[
              { label: 'Cattle',  emoji: '🐄', count: cattleCount  },
              { label: 'Poultry', emoji: '🐔', count: poultryCount },
            ].map(({ label, emoji, count }) => (
              <div key={label}
                className="grid items-center px-4 py-3"
                style={{ gridTemplateColumns: '28px 1fr 64px 64px' }}>
                <span className="text-lg">{emoji}</span>
                <div>
                  <p className="text-sm font-bold text-[var(--c-text)]">{label}</p>
                  <p className="text-[9px] text-[var(--c-faint)]">
                    {count > 0 ? `${count} head` : 'None registered'}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-[8px] text-[var(--c-faint)] uppercase tracking-wider">Revenue</p>
                  <p className="text-xs font-bold text-[#1D9E75]">₹0</p>
                </div>
                <div className="text-right">
                  <p className="text-[8px] text-[var(--c-faint)] uppercase tracking-wider">Expense</p>
                  <p className="text-xs font-bold text-[#E24B4A]">₹0</p>
                </div>
              </div>
            ))}
          </div>
        </Card>

        {/* ── Upcoming Harvests ── */}
        {upcoming.length > 0 && (
          <Card title="Upcoming Harvests" subtitle={`next ${upcoming.length}`}>
            <div className="space-y-0">
              {upcoming.map(({ cycle, crop, days }) => (
                <div key={cycle.id}
                  className="flex items-center justify-between py-2.5 border-b border-[var(--c-border)] last:border-0">
                  <div className="flex items-center gap-2.5">
                    <span className="text-base">{crop?.emoji || '🌱'}</span>
                    <div>
                      <p className="text-xs font-semibold text-[var(--c-text)]">{crop?.name || '?'}</p>
                      <p className="text-[9px] text-[var(--c-faint)]">
                        {cycle.plotLabel}
                        {cycle.harvestDate ? ` · ${cycle.harvestDate.slice(0, 7)}` : ''}
                      </p>
                    </div>
                  </div>
                  <span className={`text-xs font-black px-2.5 py-1 rounded-xl ${
                    days <= 0  ? 'bg-[#1D9E75]/20 text-[#1D9E75]' :
                    days <= 30 ? 'bg-[#BA7517]/20 text-[#BA7517]' :
                    'bg-[var(--c-ghost)] text-[var(--c-text)]'
                  }`}>{days <= 0 ? 'Now' : `${days}d`}</span>
                </div>
              ))}
            </div>
          </Card>
        )}

        {/* ── Mill Accounting Ledger ── */}
        <CaneMillLedger harvestSessions={harvestSessions} sales={sales} buyers={buyers} />

      </div>
    </div>
  )
}

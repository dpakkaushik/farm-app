import React, { useState } from 'react'
import { AppLauncher } from '@capacitor/app-launcher'
import { format, differenceInDays } from 'date-fns'
import { useAuthStore } from '../store/auth'
import { useAppStore } from '../store'
import { supabase } from '../lib/supabase'

// ── Helpers ──────────────────────────────────────────────────────────────────

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

// ── Sub-components ────────────────────────────────────────────────────────────

function Card({ title, subtitle, children, accent }) {
  return (
    <div className="bg-[var(--c-nav)] rounded-card border border-[var(--c-border)] overflow-hidden">
      <div className="flex items-baseline justify-between px-4 pt-4 pb-3 border-b border-[var(--c-border)]">
        <h3 className="text-xs font-bold uppercase tracking-widest text-[var(--c-sub)]">{title}</h3>
        {subtitle && <span className="text-[10px] text-[var(--c-faint)]">{subtitle}</span>}
      </div>
      <div className="p-4">{children}</div>
    </div>
  )
}

function KpiCard({ label, value, sub, color, delta }) {
  return (
    <div className="bg-[var(--c-nav)] rounded-card border border-[var(--c-border)] p-4 flex flex-col gap-1">
      <p className="text-[9px] font-bold uppercase tracking-widest text-[var(--c-muted)]">{label}</p>
      <p className="text-[22px] font-black leading-none" style={{ color }}>{value}</p>
      {sub   && <p className="text-[10px] text-[var(--c-faint)] leading-tight">{sub}</p>}
      {delta != null && (
        <span className={`text-[9px] font-bold ${delta >= 0 ? 'text-[#1D9E75]' : 'text-[#E24B4A]'}`}>
          {delta >= 0 ? '▲' : '▼'} {Math.abs(delta)}% vs last season
        </span>
      )}
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
  return (
    <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full ${m.cls}`}>{m.label}</span>
  )
}

// ── Accounting ledger: Dr/Cr/Balance per mill ─────────────────────────────────

function CaneMillLedger({ harvestSessions, sales, buyers }) {
  const activeBuyers = buyers.filter(b => {
    const bSales = sales.filter(s => s.buyerId === b.id)
    return bSales.length > 0
  })

  const [activeTab, setActiveTab] = useState(activeBuyers[0]?.id || null)

  if (!activeBuyers.length) return null

  const currentBuyer = activeBuyers.find(b => b.id === activeTab) || activeBuyers[0]

  // Build Dr/Cr rows for this buyer
  const bSales    = sales.filter(s => s.buyerId === currentBuyer.id)
  const sessionIds = new Set(bSales.map(s => s.sessionId))
  const bSessions  = harvestSessions.filter(s => sessionIds.has(s.id))

  // Combined rows: each session = Dr entry; each sale payment = Cr entry
  const rows = []
  bSessions.forEach(sess => {
    const sale = bSales.find(s => s.sessionId === sess.id)
    rows.push({
      date: sess.date,
      type: 'supply',
      label: `Parchi ${sess.parchiNumber || '—'}`,
      sub: sale?.buyerName || currentBuyer.name,
      qtl: sess.qtyQtl,
      dr: sale?.grossAmount || 0,
      cr: 0,
      docPath: sess.parchiAttachmentPath,
    })
    if (sale?.paymentStatus === 'paid' && sale.netAmount > 0) {
      const deductLabel = sale.deductions > 0
        ? `Deductions: ₹${Math.round(sale.deductions).toLocaleString('en-IN')}`
        : 'Full payment'
      rows.push({
        date: sale.paymentDate || sale.date,
        type: 'payment',
        label: 'Payment received',
        sub: deductLabel,
        qtl: null,
        dr: 0,
        cr: sale.netAmount,
        docPath: sale.paymentAttachmentPath,
      })
    }
  })

  rows.sort((a, b) => (a.date || '').localeCompare(b.date || ''))

  // Running balance (Dr = mill owes us, Cr = mill paid)
  let balance = 0
  const ledger = rows.map(r => {
    balance += r.dr - r.cr
    return { ...r, balance }
  })

  const totalDr  = ledger.filter(r => r.dr > 0).reduce((n, r) => n + r.dr, 0)
  const totalCr  = ledger.filter(r => r.cr > 0).reduce((n, r) => n + r.cr, 0)
  const totalQtl = bSessions.reduce((n, s) => n + (s.qtyQtl || 0), 0)

  return (
    <Card title="Mill Ledger (Cane)" subtitle="Accounting standard Dr/Cr">
      {/* Tabs */}
      <div className="flex gap-2 mb-4 -mt-1">
        {activeBuyers.map(b => (
          <button
            key={b.id}
            onClick={() => setActiveTab(b.id)}
            className={`text-[10px] font-bold px-3 py-1.5 rounded-full border transition-colors ${
              activeTab === b.id
                ? 'bg-[#1D9E75] border-[#1D9E75] text-white'
                : 'border-[var(--c-border)] text-[var(--c-muted)] bg-[var(--c-ghost)]'
            }`}
          >
            {b.name.split(' ')[0]}
          </button>
        ))}
      </div>

      {/* Summary row */}
      <div className="grid grid-cols-3 gap-2 mb-4">
        <div className="bg-[var(--c-ghost)] rounded-xl p-2.5 text-center border border-[var(--c-border)]">
          <p className="text-[9px] text-[var(--c-muted)] uppercase tracking-wider">Supplied</p>
          <p className="text-sm font-black text-[var(--c-text)] mt-0.5">{fmtQtl(totalQtl)}</p>
        </div>
        <div className="bg-[#E24B4A]/10 rounded-xl p-2.5 text-center border border-[#E24B4A]/20">
          <p className="text-[9px] text-[#E24B4A] uppercase tracking-wider">Total Dr</p>
          <p className="text-sm font-black text-[#E24B4A] mt-0.5">{fmtK(totalDr)}</p>
        </div>
        <div className="bg-[#1D9E75]/10 rounded-xl p-2.5 text-center border border-[#1D9E75]/20">
          <p className="text-[9px] text-[#1D9E75] uppercase tracking-wider">Total Cr</p>
          <p className="text-sm font-black text-[#1D9E75] mt-0.5">{fmtK(totalCr)}</p>
        </div>
      </div>

      {/* Ledger table */}
      <div className="rounded-xl border border-[var(--c-border)] overflow-hidden">
        {/* Header */}
        <div className="grid bg-[var(--c-ghost)] px-3 py-2 text-[9px] font-bold uppercase tracking-wider text-[var(--c-muted)]"
          style={{ gridTemplateColumns: '52px 1fr 50px 50px 58px 20px' }}>
          <span>Date</span>
          <span>Particulars</span>
          <span className="text-right">Dr (₹)</span>
          <span className="text-right">Cr (₹)</span>
          <span className="text-right">Balance</span>
          <span/>
        </div>

        {ledger.length === 0 && (
          <p className="text-xs text-[var(--c-faint)] px-3 py-4 text-center">No entries</p>
        )}

        {ledger.map((row, i) => {
          const docUrl = getStorageUrl(row.docPath)
          const isSupply  = row.type === 'supply'
          const isPayment = row.type === 'payment'
          return (
            <div
              key={i}
              className="grid items-center px-3 py-2.5 border-t border-[var(--c-border)]"
              style={{ gridTemplateColumns: '52px 1fr 50px 50px 58px 20px', background: isPayment ? 'rgba(29,158,117,0.04)' : undefined }}
            >
              <span className="text-[10px] text-[var(--c-faint)]">
                {row.date ? row.date.slice(5).replace('-', '/') : '—'}
              </span>
              <div className="min-w-0">
                <p className={`text-[11px] font-semibold truncate ${isPayment ? 'text-[#1D9E75]' : 'text-[var(--c-text)]'}`}>
                  {row.label}
                </p>
                <p className="text-[9px] text-[var(--c-faint)] truncate">{row.sub}</p>
              </div>
              <span className="text-[11px] text-right text-[#E24B4A] font-mono">
                {row.dr > 0 ? fmtK(row.dr) : ''}
              </span>
              <span className="text-[11px] text-right text-[#1D9E75] font-mono">
                {row.cr > 0 ? fmtK(row.cr) : ''}
              </span>
              <span className={`text-[11px] text-right font-mono font-bold ${row.balance > 0 ? 'text-[#BA7517]' : 'text-[#1D9E75]'}`}>
                {fmtK(Math.abs(row.balance))}{row.balance > 0 ? ' Dr' : row.balance < 0 ? ' Cr' : ''}
              </span>
              <span className="text-center">
                {docUrl && (
                  <a href={docUrl} target="_blank" rel="noreferrer" className="text-[12px]">
                    {isPayment ? '🧾' : '📄'}
                  </a>
                )}
              </span>
            </div>
          )
        })}

        {/* Totals */}
        {ledger.length > 0 && (
          <div
            className="grid items-center px-3 py-2.5 border-t-2 border-[var(--c-border)] bg-[var(--c-ghost)]"
            style={{ gridTemplateColumns: '52px 1fr 50px 50px 58px 20px' }}
          >
            <span />
            <span className="text-[10px] font-bold text-[var(--c-sub)] uppercase">Totals</span>
            <span className="text-[11px] text-right text-[#E24B4A] font-mono font-bold">{fmtK(totalDr)}</span>
            <span className="text-[11px] text-right text-[#1D9E75] font-mono font-bold">{fmtK(totalCr)}</span>
            <span className={`text-[11px] text-right font-mono font-black ${balance > 0 ? 'text-[#BA7517]' : 'text-[#1D9E75]'}`}>
              {fmtK(Math.abs(balance))}{balance > 0 ? ' Dr' : balance < 0 ? ' Cr' : ''}
            </span>
            <span />
          </div>
        )}
      </div>
    </Card>
  )
}

// ── Partner ledger: per family member ────────────────────────────────────────

function CanePartnerLedger({ harvestSessions, sales, partners }) {
  const activePartners = partners.filter(p =>
    harvestSessions.some(s => s.partnerId === p.id)
  )

  const [activeTab, setActiveTab] = useState(activePartners[0]?.id || null)

  if (!activePartners.length) return null

  const currentPartner = activePartners.find(p => p.id === activeTab) || activePartners[0]
  const pSessions = harvestSessions.filter(s => s.partnerId === currentPartner.id)
  const pSales    = pSessions.flatMap(s => sales.filter(sl => sl.sessionId === s.id))

  const totalQtl     = pSessions.reduce((n, s) => n + (s.qtyQtl || 0), 0)
  const totalGross   = pSales.reduce((n, s) => n + s.grossAmount, 0)
  const totalPaid    = pSales.filter(s => s.paymentStatus === 'paid').reduce((n, s) => n + s.netAmount, 0)
  const totalPending = pSales.filter(s => s.paymentStatus !== 'paid').reduce((n, s) => n + s.grossAmount, 0)
  const paidPct      = totalGross > 0 ? (totalPaid / totalGross) * 100 : 0

  return (
    <Card title="Partner Accounts" subtitle="Per family member">
      {/* Tabs — first names only */}
      <div className="flex flex-wrap gap-2 mb-4 -mt-1">
        {activePartners.map(p => {
          const firstName = p.name.split(' ')[0]
          return (
            <button
              key={p.id}
              onClick={() => setActiveTab(p.id)}
              className={`text-[10px] font-bold px-3 py-1.5 rounded-full border transition-colors ${
                activeTab === p.id
                  ? 'bg-[#1D9E75] border-[#1D9E75] text-white'
                  : 'border-[var(--c-border)] text-[var(--c-muted)] bg-[var(--c-ghost)]'
              }`}
            >
              {firstName}
            </button>
          )
        })}
      </div>

      {/* Partner summary */}
      <div className="grid grid-cols-3 gap-2 mb-4">
        <div className="bg-[var(--c-ghost)] rounded-xl p-2.5 text-center border border-[var(--c-border)]">
          <p className="text-[9px] text-[var(--c-muted)] uppercase tracking-wider">Supplied</p>
          <p className="text-sm font-black text-[var(--c-text)] mt-0.5">{fmtQtl(totalQtl)}</p>
        </div>
        <div className="bg-[#1D9E75]/10 rounded-xl p-2.5 text-center border border-[#1D9E75]/20">
          <p className="text-[9px] text-[#1D9E75] uppercase tracking-wider">Received</p>
          <p className="text-sm font-black text-[#1D9E75] mt-0.5">{fmtK(totalPaid)}</p>
        </div>
        <div className="bg-[#BA7517]/10 rounded-xl p-2.5 text-center border border-[#BA7517]/20">
          <p className="text-[9px] text-[#BA7517] uppercase tracking-wider">Pending</p>
          <p className="text-sm font-black text-[#BA7517] mt-0.5">{fmtK(totalPending)}</p>
        </div>
      </div>

      {/* Progress bar */}
      {totalGross > 0 && (
        <div className="mb-4">
          <div className="flex justify-between text-[9px] text-[var(--c-faint)] mb-1">
            <span>{Math.round(paidPct)}% collected</span>
            <span>{fmtK(totalGross)} total</span>
          </div>
          <ProgressBar pct={paidPct} color="#1D9E75" />
        </div>
      )}

      {/* Table */}
      <div className="rounded-xl border border-[var(--c-border)] overflow-hidden">
        <div className="grid bg-[var(--c-ghost)] px-3 py-2 text-[9px] font-bold uppercase tracking-wider text-[var(--c-muted)]"
          style={{ gridTemplateColumns: '48px 1fr 52px 56px 22px' }}>
          <span>Date</span>
          <span>Parchi / Mill</span>
          <span className="text-right">Qtl</span>
          <span className="text-right">Amount</span>
          <span/>
        </div>

        {pSessions.length === 0 && (
          <p className="text-xs text-[var(--c-faint)] px-3 py-4 text-center">No entries</p>
        )}

        {pSessions
          .slice()
          .sort((a, b) => (a.date || '').localeCompare(b.date || ''))
          .map((sess) => {
            const sale = sales.find(s => s.sessionId === sess.id)
            const isPaid   = sale?.paymentStatus === 'paid'
            const parchiUrl  = getStorageUrl(sess.parchiAttachmentPath)
            const receiptUrl = getStorageUrl(sale?.paymentAttachmentPath)
            const amount = isPaid ? sale.netAmount : sale?.grossAmount
            return (
              <div key={sess.id}
                className="grid items-center px-3 py-2.5 border-t border-[var(--c-border)]"
                style={{ gridTemplateColumns: '48px 1fr 52px 56px 22px' }}
              >
                <span className="text-[10px] text-[var(--c-faint)]">
                  {sess.date ? sess.date.slice(5).replace('-', '/') : '—'}
                </span>
                <div className="min-w-0">
                  <p className="text-[11px] font-semibold text-[var(--c-text)] truncate">
                    {sess.parchiNumber || '—'}
                  </p>
                  <p className="text-[9px] text-[var(--c-faint)] truncate">
                    {sale?.buyerName || '—'}
                  </p>
                </div>
                <span className="text-[11px] text-right text-[var(--c-sub)] font-mono">
                  {sess.qtyQtl ? sess.qtyQtl.toFixed(1) : '—'}
                </span>
                <div className="text-right">
                  <p className={`text-[11px] font-bold font-mono ${isPaid ? 'text-[#1D9E75]' : 'text-[#BA7517]'}`}>
                    {amount ? fmtK(amount) : '—'}
                  </p>
                  <StatusBadge status={sale?.paymentStatus || 'pending'} />
                </div>
                <div className="flex flex-col gap-0.5 items-center">
                  {parchiUrl  && <a href={parchiUrl}  target="_blank" rel="noreferrer" className="text-[11px]">📄</a>}
                  {receiptUrl && <a href={receiptUrl} target="_blank" rel="noreferrer" className="text-[11px]">🧾</a>}
                </div>
              </div>
            )
          })}
      </div>
    </Card>
  )
}

// ── Main Dashboard ────────────────────────────────────────────────────────────

export default function Dashboard() {
  const now = new Date()
  const { profile } = useAuthStore()
  const { plots, cropMaster, cropCycles, harvestSessions, sales, buyers, partners, issues } = useAppStore()

  const hour     = now.getHours()
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening'
  const firstName = profile?.full_name?.split(' ')[0] || 'Vipul'

  // ── Farm totals ──
  const totalAcres   = plots.reduce((n, p) => n + (Number(p.area_acres) || 0), 0)
  const activeCycles = cropCycles.filter(c => c.status === 'active')

  // ── Cane identification ──
  const caneSessionCycleIds = new Set(harvestSessions.map(s => s.cycleId))
  const canePlotCount = new Set(
    cropCycles.filter(c => caneSessionCycleIds.has(c.id)).map(c => c.plotId)
  ).size

  // ── Cane financials ──
  const totalQtl          = harvestSessions.reduce((n, s) => n + (s.qtyQtl || 0), 0)
  const totalSessions     = harvestSessions.length
  const caneRevPaid       = sales.filter(s => s.paymentStatus === 'paid').reduce((n, s) => n + s.netAmount, 0)
  const caneRevPending    = sales.filter(s => s.paymentStatus !== 'paid').reduce((n, s) => n + s.grossAmount, 0)
  const caneTotal         = caneRevPaid + caneRevPending
  const paidPct           = caneTotal > 0 ? (caneRevPaid / caneTotal) * 100 : 0

  // ── Input / labour costs ──
  const totalInputCost = issues.reduce((n, i) => n + (i.totalCost || 0), 0)

  // ── Net position ──
  const netPosition = caneRevPaid - totalInputCost
  const isNetPositive = netPosition >= 0

  // ── By buyer ──
  const byBuyer = buyers.map(buyer => {
    const bSales   = sales.filter(s => s.buyerId === buyer.id)
    if (!bSales.length) return null
    const bSessionIds = new Set(bSales.map(s => s.sessionId))
    const qtl   = harvestSessions.filter(s => bSessionIds.has(s.id)).reduce((n, s) => n + (s.qtyQtl || 0), 0)
    const paid    = bSales.filter(s => s.paymentStatus === 'paid').reduce((n, s) => n + s.netAmount, 0)
    const pending = bSales.filter(s => s.paymentStatus !== 'paid').reduce((n, s) => n + s.grossAmount, 0)
    return { buyer, qtl, paid, pending, parcels: bSales.length }
  }).filter(Boolean)

  // ── By partner ──
  const byPartner = partners.map(partner => {
    const pSessions = harvestSessions.filter(s => s.partnerId === partner.id)
    if (!pSessions.length) return null
    const pSales    = pSessions.flatMap(s => sales.filter(sl => sl.sessionId === s.id))
    const qtl       = pSessions.reduce((n, s) => n + (s.qtyQtl || 0), 0)
    const paid      = pSales.filter(s => s.paymentStatus === 'paid').reduce((n, s) => n + s.netAmount, 0)
    const pending   = pSales.filter(s => s.paymentStatus !== 'paid').reduce((n, s) => n + s.grossAmount, 0)
    return { partner, qtl, paid, pending }
  }).filter(Boolean)

  // ── Other (non-cane) active cycles ──
  const otherCycles = activeCycles
    .filter(c => !caneSessionCycleIds.has(c.id))
    .map(cycle => {
      const crop    = cropMaster.find(cr => cr.id === cycle.cropId)
      const cost    = issues.filter(i => i.cropCycleId === cycle.id).reduce((n, i) => n + (i.totalCost || 0), 0)
      const estRev  = crop ? (cycle.acres || 0) * (crop.yieldPerAcre || 0) * (crop.pricePerQtl || 0) / 100 : 0
      const daysLeft = cycle.harvestDate ? differenceInDays(new Date(cycle.harvestDate), now) : null
      return { cycle, crop, cost, estRev, daysLeft }
    })
    .sort((a, b) => (a.daysLeft ?? 999) - (b.daysLeft ?? 999))

  // ── Upcoming harvests (all cycles, within 180 days) ──
  const upcoming = activeCycles
    .filter(c => c.harvestDate)
    .map(c => ({
      cycle: c,
      crop:  cropMaster.find(cr => cr.id === c.cropId),
      days:  differenceInDays(new Date(c.harvestDate), now),
    }))
    .filter(({ days }) => days >= -5 && days <= 180)
    .sort((a, b) => a.days - b.days)
    .slice(0, 10)

  return (
    <div className="h-full overflow-y-auto pb-10" style={{ background: 'var(--c-bg)' }}>

      {/* ── Header ── */}
      <div className="sticky top-0 z-10 px-4 pt-4 pb-3 flex items-start justify-between"
        style={{ background: 'var(--c-bg)', borderBottom: '1px solid var(--c-border)' }}>
        <div>
          <h1 className="text-xl font-black text-[var(--c-text)] leading-tight">
            {greeting}, {firstName} 👋
          </h1>
          <p className="text-[11px] text-[var(--c-faint)] mt-0.5">
            {format(now, 'EEE d MMM yyyy')} · {totalAcres.toFixed(1)} ac · {activeCycles.length} active cycles
          </p>
        </div>
        <button
          onClick={async () => {
            try {
              await AppLauncher.openUrl({ url: 'package:com.mm.android.direct.g_CMOB_XU' })
            } catch {
              window.open('https://play.google.com/store/apps/details?id=com.mm.android.direct.g_CMOB_XU', '_blank')
            }
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

        {/* ── 4 KPI cards ── */}
        <div className="grid grid-cols-2 gap-3">
          <KpiCard
            label="Revenue Received"
            value={fmt(caneRevPaid)}
            sub={`${Math.round(paidPct)}% of ₹${(caneTotal / 100000).toFixed(2)}L total`}
            color="#1D9E75"
          />
          <KpiCard
            label="Pending from Mills"
            value={fmt(caneRevPending)}
            sub={caneRevPending > 0 ? `${sales.filter(s => s.paymentStatus !== 'paid').length} invoices outstanding` : 'All cleared'}
            color={caneRevPending > 0 ? '#BA7517' : '#1D9E75'}
          />
          <KpiCard
            label="Input Costs"
            value={fmt(totalInputCost)}
            sub={`${issues.length} issue entries`}
            color="#E24B4A"
          />
          <KpiCard
            label="Net Position"
            value={fmt(Math.abs(netPosition))}
            sub={isNetPositive ? 'Surplus after inputs' : 'Costs exceed receipts'}
            color={isNetPositive ? '#1D9E75' : '#E24B4A'}
          />
        </div>

        {/* ── Sugarcane Season ── */}
        <Card title="Sugarcane Season" subtitle={`${canePlotCount} plots · ${totalSessions} parcels`}>
          {/* Season summary bar */}
          <div className="flex items-center justify-between mb-2">
            <div>
              <p className="text-2xl font-black text-[var(--c-text)]">{fmtQtl(totalQtl)}</p>
              <p className="text-[10px] text-[var(--c-faint)]">Total supplied to mills</p>
            </div>
            <div className="text-right">
              <p className="text-base font-black text-[#1D9E75]">{fmt(caneRevPaid)}</p>
              <p className="text-[10px] text-[var(--c-faint)]">received</p>
            </div>
          </div>

          <div className="mb-1">
            <div className="flex justify-between text-[9px] text-[var(--c-faint)] mb-1">
              <span>{Math.round(paidPct)}% received</span>
              <span>{fmt(caneRevPending)} pending</span>
            </div>
            <ProgressBar pct={paidPct} color="#1D9E75" />
          </div>

          {/* Per-mill breakdown */}
          {byBuyer.length > 0 && (
            <div className="mt-4 space-y-2">
              {byBuyer.map(({ buyer, qtl, paid, pending, parcels }) => {
                const buyerPct = (paid + pending) > 0 ? (paid / (paid + pending)) * 100 : 0
                return (
                  <div key={buyer.id} className="bg-[var(--c-ghost)] rounded-xl p-3 border border-[var(--c-border)]">
                    <div className="flex items-center justify-between mb-2">
                      <div>
                        <p className="text-xs font-bold text-[var(--c-text)]">
                          {buyer.name.split(' ').slice(0, 3).join(' ')}
                        </p>
                        <p className="text-[9px] text-[var(--c-faint)]">{parcels} parcels · {fmtQtl(qtl)}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-black text-[var(--c-text)]">{fmt(paid + pending)}</p>
                        <p className="text-[9px] text-[var(--c-faint)]">gross</p>
                      </div>
                    </div>
                    <ProgressBar pct={buyerPct} color="#1D9E75" />
                    <div className="flex justify-between mt-1 text-[9px]">
                      <span className="text-[#1D9E75] font-semibold">{fmt(paid)} paid</span>
                      {pending > 0 && <span className="text-[#BA7517] font-semibold">{fmt(pending)} due</span>}
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          {totalSessions === 0 && (
            <p className="text-xs text-[var(--c-faint)] text-center py-4">No cane supply entries yet</p>
          )}
        </Card>

        {/* ── Partner Accounts (family grid) ── */}
        {byPartner.length > 0 && (
          <Card title="Partner Accounts" subtitle="Nanda family">
            <div className="grid grid-cols-2 gap-2">
              {byPartner.map(({ partner, qtl, paid, pending }) => {
                const gross   = paid + pending
                const partPct = gross > 0 ? (paid / gross) * 100 : 0
                const firstName = partner.name.split(' ')[0]
                return (
                  <div key={partner.id}
                    className="bg-[var(--c-ghost)] rounded-xl p-3 border border-[var(--c-border)]">
                    <p className="text-xs font-black text-[var(--c-text)] mb-0.5">{firstName}</p>
                    <p className="text-[9px] text-[var(--c-faint)] mb-2">{fmtQtl(qtl)}</p>
                    <ProgressBar pct={partPct} color="#1D9E75" />
                    <div className="flex justify-between mt-1.5 text-[9px]">
                      <span className="text-[#1D9E75] font-semibold">{fmtK(paid)}</span>
                      {pending > 0 && <span className="text-[#BA7517] font-semibold">{fmtK(pending)} due</span>}
                    </div>
                  </div>
                )
              })}
            </div>
          </Card>
        )}

        {/* ── Other Active Crops ── */}
        {otherCycles.length > 0 && (
          <Card title="Other Active Crops" subtitle={`${otherCycles.length} cycles`}>
            <div className="space-y-2">
              {otherCycles.map(({ cycle, crop, cost, estRev, daysLeft }) => (
                <div key={cycle.id}
                  className="flex items-center gap-3 py-2.5 border-b border-[var(--c-border)] last:border-0">
                  <span className="text-2xl shrink-0">{crop?.emoji || '🌱'}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <p className="text-sm font-bold text-[var(--c-text)] truncate">
                        {crop?.name || 'Unknown'}
                      </p>
                      {daysLeft != null && (
                        <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full shrink-0 ${
                          daysLeft <= 30 ? 'bg-[#1D9E75]/20 text-[#1D9E75]' :
                          daysLeft <= 60 ? 'bg-[#BA7517]/20 text-[#BA7517]' :
                          'bg-[var(--c-ghost)] text-[var(--c-muted)]'
                        }`}>
                          {daysLeft}d
                        </span>
                      )}
                    </div>
                    <p className="text-[10px] text-[var(--c-faint)]">
                      {cycle.plotLabel || '—'} · {cycle.acres?.toFixed(1) || '—'} ac
                      {cycle.sowDate ? ` · Sown ${cycle.sowDate.slice(5).replace('-', '/')}` : ''}
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    {cost > 0 && <p className="text-[10px] text-[#E24B4A] font-semibold">{fmtK(cost)}</p>}
                    {estRev > 0 && <p className="text-[10px] text-[#1D9E75]">~{fmtK(estRev)}</p>}
                    {!cost && !estRev && <p className="text-[10px] text-[var(--c-faint)]">—</p>}
                  </div>
                </div>
              ))}
            </div>
          </Card>
        )}

        {/* ── Upcoming Harvests ── */}
        {upcoming.length > 0 && (
          <Card title="Upcoming Harvests" subtitle={`next ${upcoming.length}`}>
            <div className="space-y-0">
              {upcoming.map(({ cycle, crop, days }) => (
                <div key={cycle.id}
                  className="flex items-center justify-between py-2.5 border-b border-[var(--c-border)] last:border-0">
                  <div className="flex items-center gap-2.5">
                    <span className="text-lg">{crop?.emoji || '🌱'}</span>
                    <div>
                      <p className="text-sm font-semibold text-[var(--c-text)]">
                        {crop?.name || 'Unknown'}
                      </p>
                      <p className="text-[10px] text-[var(--c-faint)]">
                        {cycle.plotLabel || '—'}
                        {cycle.harvestDate ? ` · ${cycle.harvestDate.slice(0, 7)}` : ''}
                      </p>
                    </div>
                  </div>
                  <div className={`text-right shrink-0 px-2.5 py-1 rounded-xl ${
                    days <= 0   ? 'bg-[#1D9E75]/20' :
                    days <= 30  ? 'bg-[#BA7517]/20' :
                    'bg-[var(--c-ghost)]'
                  }`}>
                    <p className={`text-sm font-black ${
                      days <= 0  ? 'text-[#1D9E75]' :
                      days <= 30 ? 'text-[#BA7517]' :
                      'text-[var(--c-text)]'
                    }`}>
                      {days <= 0 ? 'Now' : `${days}d`}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        )}

        {/* ── Accounting Ledgers ── */}
        <CaneMillLedger harvestSessions={harvestSessions} sales={sales} buyers={buyers} />
        <CanePartnerLedger harvestSessions={harvestSessions} sales={sales} partners={partners} />

      </div>
    </div>
  )
}

import React, { useEffect, useState } from 'react'
import { AppLauncher } from '@capacitor/app-launcher'
import { AlertTriangle, TrendingUp, Package, CalendarDays, Leaf, ChevronDown, ChevronUp } from 'lucide-react'
import { farmApi } from '../api/client'
import { format } from 'date-fns'
import { useAuthStore } from '../store/auth'
import { useAppStore } from '../store'
import { supabase } from '../lib/supabase'

const FARM_ID = import.meta.env.VITE_FARM_ID || 'demo'

// All 16 plots matching Field.jsx layout
const ALL_PLOTS = [
  { id:'top', label:'Top Block', acres:4.55,  health_status:'good',    current_crop:'UK Lip Tish Plant',  days_to_harvest:null, season_cost:9000  },
  { id:'a',   label:'Plot A',   acres:1,      health_status:'good',    current_crop:'Wheat',              days_to_harvest:30,   season_cost:4200  },
  { id:'b',   label:'Plot B',   acres:5.5,    health_status:'good',    current_crop:'Mustard',            days_to_harvest:45,   season_cost:11000 },
  { id:'c',   label:'Plot C',   acres:5,      health_status:'average', current_crop:"Oct'24 Sugarcane",   days_to_harvest:120,  season_cost:18000 },
  { id:'d',   label:'Plot D',   acres:5,      health_status:'average', current_crop:"Oct'24 Sugarcane",   days_to_harvest:120,  season_cost:18000 },
  { id:'e',   label:'Plot E',   acres:10.5,   health_status:'good',    current_crop:'Cane + Mustard',     days_to_harvest:60,   season_cost:32000 },
  { id:'f',   label:'Plot F',   acres:5,      health_status:'good',    current_crop:'Wheat',              days_to_harvest:30,   season_cost:9500  },
  { id:'g',   label:'Plot G',   acres:5,      health_status:'good',    current_crop:'Wheat',              days_to_harvest:30,   season_cost:9500  },
  { id:'h',   label:'Plot H',   acres:4,      health_status:'fallow',  current_crop:'Fallow',             days_to_harvest:null, season_cost:0     },
  { id:'p',   label:'Plot P',   acres:1.5,    health_status:'average', current_crop:"Oct'24 Sugarcane",   days_to_harvest:90,   season_cost:4800  },
  { id:'n',   label:'Plot N',   acres:1,      health_status:'fallow',  current_crop:'Animal Grass',       days_to_harvest:null, season_cost:800   },
  { id:'m',   label:'Plot M',   acres:1,      health_status:'good',    current_crop:'Wheat',              days_to_harvest:30,   season_cost:2200  },
  { id:'l',   label:'Plot L',   acres:3.5,    health_status:'average', current_crop:"Oct'24 Sugarcane",   days_to_harvest:120,  season_cost:13500 },
  { id:'k',   label:'Plot K',   acres:4,      health_status:'good',    current_crop:'Wheat',              days_to_harvest:30,   season_cost:7800  },
  { id:'j',   label:'Plot J',   acres:4,      health_status:'good',    current_crop:'Wheat',              days_to_harvest:30,   season_cost:7800  },
  { id:'i',   label:'Plot I',   acres:2.5,    health_status:'concern', current_crop:'Wheat',              days_to_harvest:30,   season_cost:5200  },
]

// Aggregated by crop type — combined area + economics
const CROP_SUMMARY = [
  {
    crop: 'Wheat', emoji: '🌾', color: '#DDB428',
    plots: 'A, F, G, M, K, J, I',
    total_acres: 22.5,
    season_cost: 46200,
    est_revenue: 247500,   // ~15 qtl/ac × ₹733/qtl
    yield_per_acre: 15,    // qtl
    last_yield_per_acre: 14,
    yoy_change: +7.1,
  },
  {
    crop: "Oct'24 Sugarcane", emoji: '🎋', color: '#1D9E75',
    plots: 'C, D, L, P',
    total_acres: 15,
    season_cost: 54300,
    est_revenue: 367500,   // ~700 qtl/ac × ₹35/qtl
    yield_per_acre: 700,   // qtl
    last_yield_per_acre: 680,
    yoy_change: +2.9,
  },
  {
    crop: 'Cane + Mustard', emoji: '🌱', color: '#2A9E6C',
    plots: 'E',
    total_acres: 10.5,
    season_cost: 32000,
    est_revenue: 189000,
    yield_per_acre: null,
    last_yield_per_acre: null,
    yoy_change: null,
  },
  {
    crop: 'Mustard', emoji: '🌻', color: '#BA7517',
    plots: 'B',
    total_acres: 5.5,
    season_cost: 11000,
    est_revenue: 55000,    // ~8 qtl/ac × ₹1250/qtl
    yield_per_acre: 8,
    last_yield_per_acre: 8,
    yoy_change: 0,
  },
  {
    crop: 'UK Lip Tish Plant', emoji: '🌿', color: '#7C88C8',
    plots: 'Top Block',
    total_acres: 4.55,
    season_cost: 9000,
    est_revenue: 50050,
    yield_per_acre: null,
    last_yield_per_acre: null,
    yoy_change: null,
  },
  {
    crop: 'Fallow / Grass', emoji: '⬜', color: '#666',
    plots: 'H, N',
    total_acres: 5,
    season_cost: 800,
    est_revenue: 0,
    yield_per_acre: null,
    last_yield_per_acre: null,
    yoy_change: null,
  },
]

// Past harvest seasons — last 4 completed cycles
const HARVEST_HISTORY = [
  {
    season: 'Rabi 2024–25', crop: 'Wheat', plots: 'A, F, G, M, K, J',
    acres: 21, harvest_date: 'Apr 2025',
    yield_per_acre: 15, total_yield_qtl: 315, price_per_qtl: 2200,
    revenue: 693000, cost: 189000, profit: 504000,
  },
  {
    season: 'Kharif 2024', crop: 'Paddy', plots: 'H, I, B',
    acres: 16.5, harvest_date: 'Nov 2024',
    yield_per_acre: 15, total_yield_qtl: 247, price_per_qtl: 1500,
    revenue: 370500, cost: 148000, profit: 222500,
  },
  {
    season: 'Rabi 2023–24', crop: 'Wheat', plots: 'A, F, G, M, K, J, I',
    acres: 23.5, harvest_date: 'Apr 2024',
    yield_per_acre: 14, total_yield_qtl: 329, price_per_qtl: 2000,
    revenue: 658000, cost: 211500, profit: 446500,
  },
  {
    season: 'Kharif 2023', crop: 'Sugarcane', plots: 'C, D, L',
    acres: 13.5, harvest_date: 'Oct 2023',
    yield_per_acre: 680, total_yield_qtl: 9180, price_per_qtl: 35,
    revenue: 321300, cost: 243000, profit: 78300,
  },
]

const DEMO = {
  owner_name: 'Farm Owner',
  total_acres: 62.55,
  active_plots: 14,
  total_plots: 16,
  season_spend: 153300,
  expected_revenue: 959050,
  manager_last_logged: '2026-05-24T19:30:00Z',
  plots: ALL_PLOTS,
  crop_summary: CROP_SUMMARY,
  harvest_history: HARVEST_HISTORY,
  alerts: [
    { id:'1', severity:'critical', message:'Plot I: pest concern logged — no follow-up activity in 3 days.',  alert_type:'health_concern' },
    { id:'2', severity:'warning',  message:'Urea stock below threshold (12 kg remaining, min: 20 kg).',        alert_type:'low_stock' },
    { id:'3', severity:'info',     message:'Plot A wheat harvest window opens in ~30 days.',                   alert_type:'harvest_due' },
    { id:'4', severity:'info',     message:'Plot B mustard harvest window opens in ~45 days.',                 alert_type:'harvest_due' },
  ],
  latest_diary: {
    diary_date: '2026-05-24',
    summary: 'Irrigation done on Plots A, F, G, K, J. Yellowing noticed on Plot I — applied Chlorpyrifos. Sugarcane in C & D looking strong.',
    tomorrows_plan: 'Weeding on Plots E and L. Follow up on Plot I pest control. Check water level in Plot C.',
    plot_activities: {
      'Plot A': 'Irrigation', 'Plot F': 'Irrigation', 'Plot G': 'Irrigation',
      'Plot K': 'Irrigation', 'Plot J': 'Irrigation', 'Plot I': 'Spraying',
    },
  },
  low_stock_items: [
    { id:'1', name:'Urea',         unit:'kg',     current_stock:12, min_threshold:20 },
    { id:'2', name:'Chlorpyrifos', unit:'bottle', current_stock:1,  min_threshold:2  },
    { id:'3', name:'DAP',          unit:'bag',    current_stock:3,  min_threshold:5  },
  ],
  upcoming_harvests: [
    { plot:'Plot A', crop:'Wheat',   days:30, date:'2026-06-24' },
    { plot:'Plot F', crop:'Wheat',   days:30, date:'2026-06-24' },
    { plot:'Plot G', crop:'Wheat',   days:30, date:'2026-06-24' },
    { plot:'Plot B', crop:'Mustard', days:45, date:'2026-07-09' },
    { plot:'Plot E', crop:'Cane+Mustard', days:60, date:'2026-07-24' },
  ],
}

const HEALTH_COLOR = { good:'#1D9E75', average:'#BA7517', concern:'#E24B4A', fallow:'#888' }
const SEV_COLOR    = { critical:'#E24B4A', warning:'#BA7517', info:'#1D9E75' }
const SEV_ICON     = { critical:'🔴', warning:'🟡', info:'🟢' }

export default function Dashboard() {
  const [data, setData]               = useState(null)
  const [showAllPlots, setShowAllPlots] = useState(false)
  const [expandedHistory, setExpandedHistory] = useState(null)
  const now = new Date()

  useEffect(() => {
    farmApi.getDashboard(FARM_ID)
      .then(r => setData(r.data))
      .catch(() => setData(DEMO))
  }, [])

  const { profile } = useAuthStore()
  const { harvestSessions, sales, partners } = useAppStore()
  const d = data || DEMO
  const hour = now.getHours()
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening'
  const visiblePlots = showAllPlots ? d.plots : d.plots.slice(0, 8)

  return (
    <div className="h-full overflow-y-auto p-4 space-y-4 pb-8" style={{ background: 'var(--c-bg)' }}>

      {/* Greeting + Live View */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-bold" style={{ color: 'var(--c-text)' }}>{greeting}, {profile?.full_name?.split(' ')[0] || d.owner_name} 👋</h1>
          <p className="text-sm" style={{ color: 'var(--c-muted)' }}>{format(now, 'EEEE, d MMMM yyyy')} · {d.total_acres} acres total</p>
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

      {/* Alert banner */}
      {d.alerts.some(a => a.severity === 'critical') && (
        <div className="flex items-center gap-3 bg-[#E24B4A]/15 border border-[#E24B4A]/30 rounded-xl px-4 py-3">
          <AlertTriangle size={18} className="text-[#E24B4A] shrink-0" />
          <p className="text-sm text-[#E24B4A]">{d.alerts.find(a => a.severity === 'critical').message}</p>
        </div>
      )}

      {/* 4 metric cards */}
      <div className="grid grid-cols-2 gap-3">
        <MetricCard label="Active Plots"     value={`${d.active_plots} / ${d.total_plots}`} icon={<Leaf size={16}/>} color="#1D9E75" />
        <MetricCard label="Season Spend"     value={`₹${(d.season_spend/1000).toFixed(0)}k`} icon={<TrendingUp size={16}/>} color="#BA7517" />
        <MetricCard label="Expected Revenue" value={`₹${(d.expected_revenue/100000).toFixed(1)}L`} icon={<TrendingUp size={16}/>} color="#1D9E75" />
        <MetricCard
          label="Manager logged"
          value={d.manager_last_logged ? format(new Date(d.manager_last_logged), 'MMM d, h:mm a') : 'Not today'}
          icon={<CalendarDays size={16}/>}
          color={d.manager_last_logged ? '#1D9E75' : '#E24B4A'}
        />
      </div>

      {/* ── Crop Overview ── (aggregated by crop type) */}
      <Card title="Crop Overview">
        <div className="space-y-3">
          {d.crop_summary.map((cs) => (
            <div key={cs.crop} className="rounded-xl p-3 border border-[var(--c-border)]" style={{ background: `${cs.color}18` }}>
              <div className="flex items-center justify-between mb-1.5">
                <div className="flex items-center gap-2">
                  <span className="text-base">{cs.emoji}</span>
                  <span className="text-sm font-semibold text-[var(--c-text)]">{cs.crop}</span>
                  {cs.yoy_change !== null && cs.yoy_change !== 0 && (
                    <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full ${cs.yoy_change > 0 ? 'bg-[#1D9E75]/20 text-[#1D9E75]' : 'bg-[#E24B4A]/20 text-[#E24B4A]'}`}>
                      {cs.yoy_change > 0 ? '↑' : '↓'}{Math.abs(cs.yoy_change)}% vs last yr
                    </span>
                  )}
                </div>
                <span className="text-sm font-bold" style={{ color: cs.color }}>{cs.total_acres} ac</span>
              </div>
              <div className="flex items-center justify-between text-[11px] text-[var(--c-muted)]">
                <span>Plots: {cs.plots}</span>
                {cs.est_revenue > 0
                  ? <span>₹{(cs.season_cost/1000).toFixed(0)}k cost → ₹{(cs.est_revenue/1000).toFixed(0)}k est.</span>
                  : <span>₹{(cs.season_cost/1000).toFixed(1)}k cost</span>
                }
              </div>
              {cs.yield_per_acre && cs.last_yield_per_acre && (
                <div className="mt-1.5 flex items-center gap-3 text-[10px] text-[var(--c-muted)]">
                  <span>Last yr: {cs.last_yield_per_acre} qtl/ac</span>
                  <span>·</span>
                  <span>This yr target: {cs.yield_per_acre} qtl/ac</span>
                </div>
              )}
            </div>
          ))}
        </div>
      </Card>

      {/* Plot overview — all 16 */}
      <Card title={`All Plots (${d.plots.length})`}>
        <div className="space-y-0">
          {visiblePlots.map(p => (
            <div key={p.id} className="flex items-center justify-between py-2 border-b border-[var(--c-border)] last:border-0">
              <div className="min-w-0 flex-1">
                <span className="text-sm font-medium text-[var(--c-text)]">{p.label}</span>
                <span className="text-xs text-[var(--c-muted)] ml-2">{p.acres}ac</span>
                <span className="text-xs text-[var(--c-sub)] ml-2 truncate">{p.current_crop || 'Fallow'}</span>
              </div>
              <div className="flex items-center gap-2 ml-2 shrink-0">
                {p.days_to_harvest && <span className="text-[10px] text-[var(--c-faint)]">{p.days_to_harvest}d</span>}
                <Pill status={p.health_status} />
              </div>
            </div>
          ))}
        </div>
        {d.plots.length > 8 && (
          <button
            onClick={() => setShowAllPlots(v => !v)}
            className="mt-2 w-full text-xs text-[var(--c-muted)] hover:text-[var(--c-text)] flex items-center justify-center gap-1 py-1"
          >
            {showAllPlots ? <><ChevronUp size={12}/> Show less</> : <><ChevronDown size={12}/> Show {d.plots.length - 8} more</>}
          </button>
        )}
      </Card>

      {/* Alerts */}
      <Card title="Alerts">
        <div className="space-y-2">
          {d.alerts.map(a => (
            <div key={a.id} className="flex items-start gap-3 p-3 rounded-xl" style={{ background: `${SEV_COLOR[a.severity]}15` }}>
              <span className="text-base mt-0.5">{SEV_ICON[a.severity]}</span>
              <p className="text-xs text-[var(--c-text-80)] leading-relaxed">{a.message}</p>
            </div>
          ))}
        </div>
      </Card>

      {/* Yesterday's diary */}
      {d.latest_diary && (
        <Card title="Yesterday's Farm Diary">
          <p className="text-sm text-[var(--c-sub)] leading-relaxed mb-3">{d.latest_diary.summary}</p>
          <div className="flex flex-wrap gap-2 mb-3">
            {Object.entries(d.latest_diary.plot_activities).map(([plot, act]) => (
              <span key={plot} className="text-xs bg-[var(--c-ghost)] border border-[var(--c-border-md)] rounded-full px-3 py-1 text-[var(--c-sub)]">
                {plot}: {act}
              </span>
            ))}
          </div>
          {d.latest_diary.tomorrows_plan && (
            <div className="bg-[#1D9E75]/10 border border-[#1D9E75]/20 rounded-xl p-3">
              <p className="text-[10px] text-[#1D9E75] font-semibold uppercase mb-1">Tomorrow's Plan</p>
              <p className="text-xs text-[var(--c-sub)]">{d.latest_diary.tomorrows_plan}</p>
            </div>
          )}
        </Card>
      )}

      {/* ── Past harvest seasons ── */}
      <Card title="Past Harvest Seasons">
        <div className="space-y-2">
          {d.harvest_history.map((h, i) => (
            <div key={i}>
              <button
                onClick={() => setExpandedHistory(expandedHistory === i ? null : i)}
                className="w-full flex items-center justify-between py-2.5 border-b border-[var(--c-border)] text-left"
              >
                <div>
                  <span className="text-sm font-medium text-[var(--c-text)]">{h.season}</span>
                  <span className="text-xs text-[var(--c-muted)] ml-2">{h.crop} · {h.acres} ac</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`text-xs font-semibold ${h.profit >= 0 ? 'text-[#1D9E75]' : 'text-[#E24B4A]'}`}>
                    {h.profit >= 0 ? '+' : ''}₹{(h.profit/1000).toFixed(0)}k
                  </span>
                  {expandedHistory === i ? <ChevronUp size={13} className="text-[var(--c-faint)]"/> : <ChevronDown size={13} className="text-[var(--c-faint)]"/>}
                </div>
              </button>
              {expandedHistory === i && (
                <div className="grid grid-cols-3 gap-2 py-3 px-1">
                  <MiniStat label="Plots"     value={h.plots} small />
                  <MiniStat label="Harvest"   value={h.harvest_date} />
                  <MiniStat label="Yield/ac"  value={`${h.yield_per_acre} qtl`} />
                  <MiniStat label="Total qty" value={`${h.total_yield_qtl} qtl`} />
                  <MiniStat label="Rate"      value={`₹${h.price_per_qtl}/qtl`} />
                  <MiniStat label="Revenue"   value={`₹${(h.revenue/1000).toFixed(0)}k`} color="#1D9E75" />
                  <MiniStat label="Cost"      value={`₹${(h.cost/1000).toFixed(0)}k`} color="#BA7517" />
                  <MiniStat label="Profit"    value={`₹${(h.profit/1000).toFixed(0)}k`} color={h.profit >= 0 ? '#1D9E75' : '#E24B4A'} />
                  <MiniStat label="Margin"    value={`${Math.round(h.profit/h.revenue*100)}%`} color={h.profit >= 0 ? '#1D9E75' : '#E24B4A'} />
                </div>
              )}
            </div>
          ))}
        </div>
      </Card>

      {/* Low stock */}
      <Card title="Low Stock Alerts">
        <div className="space-y-2">
          {d.low_stock_items.map(item => (
            <div key={item.id} className="flex justify-between items-center py-2 border-b border-[var(--c-border)] last:border-0">
              <div className="flex items-center gap-2">
                <Package size={14} className="text-[#E24B4A]" />
                <span className="text-sm text-[var(--c-text)]">{item.name}</span>
              </div>
              <span className="text-xs font-medium text-[#E24B4A]">{item.current_stock} {item.unit} left</span>
            </div>
          ))}
          {d.low_stock_items.length === 0 && <p className="text-xs text-[var(--c-muted)]">All stock levels OK</p>}
        </div>
      </Card>

      {/* Upcoming harvests */}
      <Card title="Upcoming Harvests">
        <div className="space-y-2">
          {d.upcoming_harvests.map((h, i) => (
            <div key={i} className="flex items-center justify-between py-2 border-b border-[var(--c-border)] last:border-0">
              <div>
                <span className="text-sm text-[var(--c-text)]">{h.plot}</span>
                <span className="text-xs text-[var(--c-muted)] ml-2">{h.crop}</span>
              </div>
              <div className="text-right">
                <p className="text-xs font-medium" style={{ color: h.days <= 35 ? '#1D9E75' : '#fff' }}>{h.days}d</p>
                <p className="text-[10px] text-[var(--c-faint)]">{h.date}</p>
              </div>
            </div>
          ))}
        </div>
      </Card>

      {/* Mill Payments (Cane) — live data */}
      <MillPaymentsCard harvestSessions={harvestSessions} sales={sales} partners={partners} />
    </div>
  )
}

function MillPaymentsCard({ harvestSessions, sales, partners }) {
  const getUrl = (path) =>
    path ? supabase.storage.from('farm-photos').getPublicUrl(path).data.publicUrl : null

  const partnerRows = partners
    .map(partner => {
      const sessions = harvestSessions.filter(s => s.partnerId === partner.id)
      if (!sessions.length) return null
      const rows = sessions.map(s => ({ session: s, sale: sales.find(sl => sl.sessionId === s.id) }))
      const totalPending = rows
        .filter(r => r.sale?.paymentStatus !== 'paid')
        .reduce((n, r) => n + (r.sale?.grossAmount || 0), 0)
      return { partner, rows, totalPending }
    })
    .filter(Boolean)

  if (!partnerRows.length) return (
    <div className="bg-[var(--c-nav)] rounded-card border border-[var(--c-border)] p-4">
      <h3 className="text-xs font-semibold text-[var(--c-sub)] uppercase tracking-wider mb-2">Mill Payments (Cane)</h3>
      <p className="text-xs text-[var(--c-faint)]">No cane supply entries yet.</p>
    </div>
  )

  return (
    <div className="bg-[var(--c-nav)] rounded-card border border-[var(--c-border)] p-4">
      <h3 className="text-xs font-semibold text-[var(--c-sub)] uppercase tracking-wider mb-3">Mill Payments (Cane)</h3>
      <div className="space-y-4">
        {partnerRows.map(({ partner, rows, totalPending }) => (
          <div key={partner.id} className="rounded-xl border border-[var(--c-border)] overflow-hidden">
            <div className="flex items-center justify-between px-3 py-2 bg-[var(--c-ghost)]">
              <p className="text-xs font-semibold text-[var(--c-text)]">{partner.name}</p>
              {totalPending > 0 && (
                <span className="text-[10px] font-bold text-[#BA7517]">₹{totalPending.toLocaleString('en-IN')} due</span>
              )}
            </div>
            {rows.map(({ session, sale }) => {
              const isPaid = sale?.paymentStatus === 'paid'
              const parchiUrl = getUrl(session.parchiAttachmentPath)
              const receiptUrl = getUrl(sale?.paymentAttachmentPath)
              return (
                <div key={session.id} className="flex items-center gap-2 px-3 py-2.5 border-t border-[var(--c-border)] text-xs">
                  <div className="flex-1 min-w-0">
                    <p className="text-[var(--c-text)] font-medium">{session.parchiNumber || '—'}</p>
                    <p className="text-[10px] text-[var(--c-faint)]">{session.date?.slice(5).replace('-', ' ')} · {session.qtyQtl?.toFixed(1)} qtl</p>
                  </div>
                  <p className="text-[var(--c-muted)] font-medium shrink-0">₹{sale?.grossAmount?.toLocaleString('en-IN') || '—'}</p>
                  <span className={`text-[10px] font-bold shrink-0 ${isPaid ? 'text-[#1D9E75]' : 'text-[#BA7517]'}`}>
                    {isPaid ? 'Paid' : 'Pending'}
                  </span>
                  <div className="flex gap-1.5 shrink-0">
                    {parchiUrl && <a href={parchiUrl} target="_blank" rel="noreferrer" className="text-[11px]">📄</a>}
                    {receiptUrl && <a href={receiptUrl} target="_blank" rel="noreferrer" className="text-[11px]">🧾</a>}
                  </div>
                </div>
              )
            })}
          </div>
        ))}
      </div>
    </div>
  )
}

function Card({ title, children }) {
  return (
    <div className="bg-[var(--c-nav)] rounded-card border border-[var(--c-border)] p-4">
      <h3 className="text-xs font-semibold text-[var(--c-sub)] uppercase tracking-wider mb-3">{title}</h3>
      {children}
    </div>
  )
}

function MetricCard({ label, value, icon, color }) {
  return (
    <div className="bg-[var(--c-nav)] rounded-card border border-[var(--c-border)] p-4">
      <div className="flex items-center gap-2 mb-2" style={{ color }}>
        {icon}
        <span className="text-[10px] font-semibold uppercase tracking-wider text-[var(--c-muted)]">{label}</span>
      </div>
      <p className="text-xl font-bold text-[var(--c-text)]">{value}</p>
    </div>
  )
}

function Pill({ status }) {
  const colors = { good:'bg-[#1D9E75]/20 text-[#1D9E75]', average:'bg-[#BA7517]/20 text-[#BA7517]', concern:'bg-[#E24B4A]/20 text-[#E24B4A]', fallow:'bg-[var(--c-ghost)] text-[var(--c-muted)]' }
  const labels = { good:'Healthy', average:'Monitor', concern:'Concern', fallow:'Fallow' }
  return <span className={`text-[10px] font-semibold px-2.5 py-1 rounded-full ${colors[status] || colors.fallow}`}>{labels[status] || 'Fallow'}</span>
}

function MiniStat({ label, value, color, small }) {
  return (
    <div className="bg-[var(--c-card)] rounded-lg p-2 border border-[var(--c-border)]">
      <p className="text-[9px] text-[var(--c-muted)] mb-0.5">{label}</p>
      <p className={`${small ? 'text-[10px]' : 'text-xs'} font-semibold`} style={color ? { color } : { color: '#fff' }}>{value}</p>
    </div>
  )
}

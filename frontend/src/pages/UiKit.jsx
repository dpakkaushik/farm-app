import React, { useState, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Plus, Receipt, Bell, Filter, Users, HardHat } from 'lucide-react'
import FilterSheet, { AppliedChips } from '../components/FilterSheet'
import AddButton from '../components/AddButton'
import FilterSelect from '../components/FilterSelect'
import RegisterCard from '../components/RegisterCard'
import TaskCalendar from './today/TaskCalendar'
import { useAppStore } from '../store'
import { useAuthStore } from '../store/auth'
import Today from './Today'
import Harvest from './Harvest'
import ResourcesPage from './ResourcesPage'
import Media from './Media'
import { PnlTab, ExpensesTab } from './LedgerPage'

// ── DEV-ONLY visual harness (/uikit) ────────────────────────────────────────
// Not reachable in a production build (App.jsx gates it on import.meta.env.DEV).
//
// It exists so a UI change can be LOOKED at without a login and without
// touching live data: the real page components are rendered over a store seeded
// with the made-up rows below. Nothing here talks to Supabase — network calls
// the pages make on mount simply fail, which is what the empty states are for.
//
//   /uikit            component gallery
//   /uikit?screen=today | harvest | resources | media
const TODAY = new Date()
const d = (n) => {
  const x = new Date(TODAY); x.setDate(x.getDate() + n)
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`
}
const TODAY_STR = d(0)

const PLOTS = [
  { id: 'p1', name: 'Plot E1', area_acres: 4.5 },
  { id: 'p2', name: 'Plot F',  area_acres: 6 },
  { id: 'p3', name: 'Back field', area_acres: 3.2 },
]

const CROPS = [
  { id: 'c1', name: 'Sugarcane', emoji: '🎋', duration_days: 330, harvest_window_days: 30,
    yield_per_acre: 350, pricePerQtl: 370, varietyCategory: 'early',
    activities: [{ day: 45, type: 'weeding', label: 'First weeding' }, { day: 90, type: 'fertilizer', label: 'Fertilizer' }] },
  { id: 'c2', name: 'Paddy', emoji: '🌾', duration_days: 120, harvest_window_days: 14,
    yield_per_acre: 25, pricePerQtl: 2300, activities: [{ day: 20, type: 'irrigation', label: 'Irrigation' }] },
  { id: 'c3', name: 'Wheat', emoji: '🌾', duration_days: 140, harvest_window_days: 14,
    yield_per_acre: 20, pricePerQtl: 2400, activities: [{ day: 30, type: 'fertilizer', label: 'Top dressing' }] },
]

const CYCLES = [
  { id: 'y1', plotId: 'p1', plotLabel: 'Plot E1', cropId: 'c1', acres: 4.5, sowDate: d(-300), status: 'active',
    millName: 'Palia Mill', growerCode: 'G-4417', openingCost: 125000 },
  { id: 'y2', plotId: 'p2', plotLabel: 'Plot F', cropId: 'c2', acres: 6, sowDate: d(-100), status: 'active' },
  { id: 'y3', plotId: 'p3', plotLabel: 'Back field', cropId: 'c3', acres: 3.2, sowDate: d(-135), status: 'active' },
  { id: 'y4', plotId: 'p2', plotLabel: 'Plot F', cropId: 'c2', acres: 6, sowDate: d(-260), status: 'harvested' },
]

const SESSIONS = [
  { id: 's1', cycleId: 'y4', date: d(-140), qtyQtl: 148, quality: 'A', parchiNumber: '4417', partnerId: null },
]
const SALES = [
  { id: 'sa1', sessionId: 's1', date: d(-138), buyerName: 'Ankur Traders', grossAmount: 340400,
    netAmount: 336000, paymentStatus: 'pending', qtyQtl: 148, ratePerQtl: 2300 },
]

const ITEMS = [
  { id: 'i1', name: 'Urea',  category: 'fertilizer', unit: 'bag', currentStock: 12, costPerUnit: 266, minThreshold: 20 },
  { id: 'i2', name: 'DAP',   category: 'fertilizer', unit: 'bag', currentStock: 40, costPerUnit: 1350, minThreshold: 10 },
  { id: 'i3', name: 'Diesel', category: 'fuel',      unit: 'ltr', currentStock: 0,  costPerUnit: 94,  minThreshold: 100 },
  { id: 'i4', name: 'Paddy seed', category: 'seed',  unit: 'kg',  currentStock: 220, costPerUnit: 42, minThreshold: 0 },
]
const PURCHASES = [
  { id: 'pu1', itemId: 'i1', qty: 40, vendor: 'Ankur Traders', totalCost: 10640, date: d(-9), entryDate: d(-9),
    billId: 'b1', invoiceNo: '4348', billFileUrl: null, unitPrice: 266 },
  { id: 'pu2', itemId: 'i2', qty: 20, vendor: 'Ankur Traders', totalCost: 27000, date: d(-9), entryDate: d(-9),
    billId: 'b1', invoiceNo: '4348', billFileUrl: null, unitPrice: 1350 },
]
const ISSUES = [
  { id: 'is1', itemId: 'i1', qty: 8, unitCost: 266, totalCost: 2128, date: d(-2), plotId: 'p1',
    plotLabel: 'Plot E1', stage: 'active', purpose: 'Top dressing' },
  { id: 'is2', itemId: 'i4', qty: 30, unitCost: 42, totalCost: 1260, date: d(-6), plotId: 'p2',
    plotLabel: 'Plot F', stage: 'preparation', purpose: 'Sowing' },
]

const MACHINERY = [
  { id: 'm1', name: 'Mahindra 575', type: 'tractor', make: 'Mahindra', model: '575 DI', regNo: 'UP32 AB 1234',
    quantity: 1, requiresDiesel: true, status: 'in_use', purchaseDate: d(-900), purchasePrice: 780000, isActive: true },
  { id: 'm2', name: 'Rotavator', type: 'implement', make: 'Shaktiman', quantity: 1, requiresDiesel: false,
    status: 'under_repair', purchaseDate: d(-500), purchasePrice: 145000, isActive: true },
]
const ASSETS = [
  { id: 'a1', name: 'Trolly', category: 'equipment', quantity: 2, status: 'in_use', location: 'Main shed',
    purchaseDate: d(-700), purchasePrice: 92000, isActive: true },
  { id: 'a2', name: 'Water pump', category: 'appliance', quantity: 1, status: 'spare', location: 'Store',
    purchasePrice: null, purchaseDate: null, isActive: true },
]

const ACTIVITY_TYPES = [
  { id: 'at1', name: 'irrigation', label: 'Irrigation',  emoji: '💧' },
  { id: 'at2', name: 'weeding',    label: 'Weeding',     emoji: '🌿' },
  { id: 'at3', name: 'fertilizer', label: 'Fertilizer',  emoji: '🧪' },
  { id: 'at4', name: 'ploughing',  label: 'Ploughing',   emoji: '🚜' },
  { id: 'at5', name: 'events',     label: 'Events',      emoji: '📅' },
]
const ACTIVITIES = [
  { id: 'ac1', plotId: 'p1', plotLabel: 'Plot E1', type: 'irrigation', date: TODAY_STR, notes: '',
    regularWorkerIds: ['w1', 'w2'], outsideLabourCount: 3, workers: 5 },
  { id: 'ac2', plotId: 'p2', plotLabel: 'Plot F', type: 'irrigation', date: TODAY_STR, notes: '',
    regularWorkerIds: ['w1'], outsideLabourCount: 0, workers: 1 },
  { id: 'ac3', plotId: 'p3', plotLabel: 'Back field', type: 'weeding', date: d(-1), notes: 'Second weeding',
    regularWorkerIds: ['w2'], outsideLabourCount: 2, workers: 3 },
  { id: 'ac4', plotId: 'p1', plotLabel: 'Plot E1', type: 'ploughing', date: d(-3), notes: '',
    regularWorkerIds: [], outsideLabourCount: 0, workers: 0 },
]

// 1×1 transparent gif — the grid's <img> needs a src that resolves, not a photo.
const PX = 'data:image/gif;base64,R0lGODlhAQABAIAAAP///wAAACH5BAEAAAAALAAAAAABAAEAAAICRAEAOw=='
const MEDIA = [
  { id: 'md1', type: 'photo', plotId: 'p1', plotLabel: 'Plot E1', activity: 'irrigation', date: TODAY_STR,
    caption: 'Channel running full', url: PX, thumbnailUrl: PX, uploadedBy: 'Manager' },
  { id: 'md2', type: 'video', plotId: 'p2', plotLabel: 'Plot F', activity: 'weeding', date: d(-1),
    caption: '', url: PX, thumbnailUrl: PX, duration: '18s', uploadedBy: 'Manager' },
  { id: 'md3', type: 'photo', plotId: 'p3', plotLabel: 'Back field', activity: 'pesticide', date: d(-4),
    caption: 'Spray done', url: PX, thumbnailUrl: PX, uploadedBy: 'Manager' },
]

const WORKERS = [
  { id: 'w1', name: 'Deepak Kumar', isActive: true, subType: 'regular', dailyBaseRate: 400, monthlySalary: 0 },
  { id: 'w2', name: 'Ram Bachan',   isActive: true, subType: 'regular', dailyBaseRate: 400, monthlySalary: 11000 },
]

const FIXTURE = {
  plots: PLOTS, cropMaster: CROPS, cropCycles: CYCLES,
  inventoryMaster: ITEMS, purchases: PURCHASES, issues: ISSUES,
  activities: ACTIVITIES, activityTypes: ACTIVITY_TYPES,
  machineryMaster: MACHINERY, farmAssets: ASSETS,
  harvestSessions: SESSIONS, sales: SALES,
  mediaItems: MEDIA, regularLabourers: WORKERS, permanentStaff: [],
  buyers: [{ id: 'b1', name: 'Ankur Traders', isActive: true }],
  partners: [], vendors: [{ id: 'v1', name: 'Ankur Traders', is_active: true }],
  cropResiduals: [], labourLogs: [], advances: [], salaryPayments: [],
  livestockMaster: [], livestockCountLogs: [], livestockRevenue: [], farmExpenses: [],
}

const AUTH = {
  loading: false,
  user:    { id: 'u1', email: 'owner@example.com' },
  profile: { id: 'u1', full_name: 'Vipul Nanda', avatar_url: null },
  farms:   [{ farm_id: 'f1', role: 'admin', farm_name: 'Pallia Farm', name: 'Pallia Farm' }],
  activeFarmId: 'f1',
  activeFarm:   { farm_id: 'f1', role: 'admin', name: 'Pallia Farm' },
}

// The Ledger's P&L tab is pure props, so it draws here with no session at all —
// figures are the owner's real ones (3 Sep), which is what makes the layout
// worth looking at: ₹25L revenue strings are the widest this screen ever shows.
const PnlDemo = () => (
  <div className="h-full overflow-y-auto px-4 pb-8">
    <PnlTab
      totalIncome={0} totalExpenses={1627352} openingCost={1353366}
      cropPnl={[
        { plot_name: 'Plot O',  crop_name: 'Paddy',     season: 'kharif_2026', total_cost: 18539,  revenue: 0, expected_revenue: 50200,  margin_pct: 0, expected_margin_pct: 63.1 },
        { plot_name: 'Plot E1', crop_name: 'Sugarcane', season: 'kharif_2025', total_cost: 159109, revenue: 0, expected_revenue: 2516150, margin_pct: 0, expected_margin_pct: 79.9 },
        { plot_name: 'Plot H',  crop_name: 'Paddy',     season: 'kharif_2026', total_cost: 525868, revenue: 1332950, expected_revenue: 1332950, margin_pct: 60.5, expected_margin_pct: 59.2 },
      ]}
      livestockPnl={[
        { animal_name: 'Ganga', species: 'cow', total_cost: 0, total_revenue: 0, profit_loss: 0 },
        { animal_name: 'Broiler — Batch 1', species: 'poultry', total_cost: 5116, total_revenue: 0, profit_loss: -5116 },
      ]} />
  </div>
)

// Money Out, with the shapes that actually caused trouble: a vendor bill whose
// description arrives as "Purchase from …", and a group settled elsewhere.
const MoneyOutDemo = () => (
  <div className="h-full overflow-y-auto px-4 pb-8">
    <ExpensesTab
      openingCost={1353366}
      canPay
      onGoVendors={() => {}} onGoSalary={() => {}} onPayRow={() => {}}
      vendorPayments={[]}
      purchases={[
        { id: 'p1', billNo: '4703', invoiceNo: '4703', billDate: '2026-08-08', itemId: 'i1', qty: 2, rate: 900, amount: 1800 },
        { id: 'p2', billNo: '4703', invoiceNo: '4703', billDate: '2026-08-08', itemId: 'i2', qty: 1, rate: 700, amount: 700 },
      ]}
      inventoryMaster={[{ id: 'i1', name: 'Urea', unit: 'bag' }, { id: 'i2', name: 'DAP', unit: 'bag' }]}
      labourLogs={[]}
      salaryRows={[{ month: '2026-08', label: 'Aug 2026', workers: 9, earned: 78400, paid: 75750, pending: 2650 }]}
      expenseLedger={[
        { id: 'p1', entry_date: '2026-08-08', description: 'Purchase from New Ankur', amount: 1800, expense_type: 'vendor_purchase', is_paid: false },
        { id: 'p2', entry_date: '2026-08-08', description: 'Purchase from New Ankur', amount: 700,  expense_type: 'vendor_purchase', is_paid: false },
        { id: 'e1', entry_date: '2026-08-20', description: 'Diesel for tractor',      amount: 2400, expense_type: 'farm_expense', category: 'farm_expense', is_paid: true, paid_date: '2026-08-20', payment_mode: 'cash' },
        { id: 'e2', entry_date: '2026-08-24', description: 'Medicine',                amount: 900,  expense_type: 'farm_expense', category: 'farm_expense', is_paid: false },
      ]} />
  </div>
)

const SCREENS = {
  today:     { label: 'Today',     Component: Today },
  harvest:   { label: 'Harvest',   Component: Harvest },
  resources: { label: 'Resources', Component: ResourcesPage },
  media:     { label: 'Media',     Component: Media },
  pnl:       { label: 'P&L',       Component: PnlDemo },
  moneyout:  { label: 'Money Out', Component: MoneyOutDemo },
}

export default function UiKit() {
  const [params, setParams] = useSearchParams()
  const screen = params.get('screen') || ''
  const [seeded, setSeeded] = useState(false)

  // The app's own loadAll() runs for the seeded farm, fails (there is no
  // session), and empties every slice — so the fixture has to win any race:
  // re-apply it whenever something clears it.
  useEffect(() => {
    const apply = () => useAppStore.setState(FIXTURE)
    useAuthStore.setState(AUTH)
    apply()
    setSeeded(true)
    return useAppStore.subscribe(s => { if (s.cropCycles !== CYCLES) apply() })
  }, [])

  const Chosen = SCREENS[screen]?.Component

  return (
    <div className="h-screen flex flex-col" style={{ background: 'var(--c-bg)', color: 'var(--c-text)' }}>
      <div className="shrink-0 flex gap-1.5 px-3 py-2 overflow-x-auto no-scrollbar border-b"
        style={{ background: 'var(--c-nav)', borderColor: 'var(--c-border)' }}>
        {[['', 'Components'], ...Object.entries(SCREENS).map(([k, v]) => [k, v.label])].map(([k, label]) => (
          <button key={k || 'kit'} onClick={() => setParams(k ? { screen: k } : {})}
            className="shrink-0 px-3 h-8 rounded-lg text-[13px] font-bold"
            style={screen === k
              ? { background: '#8A9A5B', color: '#fff' }
              : { background: 'var(--c-ghost)', color: 'var(--c-muted)' }}>
            {label}
          </button>
        ))}
      </div>

      <div className="flex-1 min-h-0 overflow-hidden">
        {!seeded ? null : Chosen ? <Chosen /> : <Gallery />}
      </div>
    </div>
  )
}

// ── The component gallery ────────────────────────────────────────────────────
const TASKS = [
  { id: 't1', plotLabel: 'Plot F', cropName: 'Sugarcane', label: 'First weeding', type: 'weeding', day: 45, dateStr: d(-3), daysOverdue: 3 },
  { id: 't2', plotLabel: 'Plot G', cropName: 'Paddy',     label: 'Irrigation',    type: 'irrigation', day: 20, dateStr: d(0), daysUntil: 0 },
  { id: 't3', plotLabel: 'Plot H', cropName: 'Wheat',     label: 'Fertilizer',    type: 'fertilizer', day: 30, dateStr: d(4), daysUntil: 4 },
]
const HISTORY = new Set([d(-1), d(-2), d(-3), d(-6), d(-9), d(-12)])
const GROUPS = (v) => [
  { key: 'plot',     label: 'Plot',     options: [['all', 'All plots'], ['p1', 'Plot E1'], ['p2', 'Plot F'], ['p3', 'Back field']] },
  { key: 'activity', label: 'Activity', options: [['all', 'All activity'], ['weeding', 'Weeding'], ['sowing', 'Sowing'], ['events', 'Events']] },
  { key: 'year',     label: 'Year',     options: [['all', 'All years'], ['2026', '2026'], ['2025', '2025']] },
  { key: 'month',    label: 'Month',    options: v.year === '2025' ? [['all', 'All months'], ['12', 'Dec']] : [['all', 'All months'], ['07', 'Jul'], ['08', 'Aug']] },
  { key: 'sort',     label: 'Sort', allValue: 'newest', options: [['newest', 'Newest first'], ['oldest', 'Oldest first']] },
]
const btn = { background: '#8A9A5B18', borderColor: '#8A9A5B40', color: '#8A9A5B' }

function Gallery() {
  const [filters, setFilters] = useState({ plot: 'p2', activity: 'weeding', year: 'all', month: 'all', sort: 'newest' })
  const [cat, setCat] = useState('all')
  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-[420px] mx-auto pb-10">

        <Label>Today — header</Label>
        <div className="px-4 pt-4 pb-2 flex items-start justify-between gap-2">
          <div className="min-w-0">
            <h1 className="text-xl font-bold truncate">Good morning, Vipul</h1>
            <p className="text-sm text-[var(--c-muted)] min-h-[20px] truncate">☀️ 34° · Clear Sky</p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button className="flex items-center gap-1.5 h-10 px-3 rounded-xl border text-xs font-semibold"
              style={{ background: '#8A9A5B12', borderColor: '#8A9A5B80', color: '#8A9A5B' }}>
              <Filter size={13} style={{ color: '#8A9A5B' }} /> History
            </button>
            <button className="relative w-10 h-10 flex items-center justify-center rounded-xl border"
              style={{ background: 'var(--c-card)', borderColor: 'var(--c-border-md)' }}>
              <Bell size={17} className="text-[var(--c-sub)]" />
              <span className="absolute -top-1.5 -right-1.5 min-w-[18px] h-[18px] px-1 flex items-center justify-center rounded-full text-[12px] font-bold"
                style={{ background: '#E24B4A', color: '#fff' }}>4</span>
            </button>
          </div>
        </div>

        <Label>Bell popover — task calendar with history</Label>
        <div className="px-4">
          <div className="rounded-2xl border p-3.5 shadow-2xl" style={{ background: 'var(--c-nav)', borderColor: 'var(--c-border-md)' }}>
            <p className="text-[12px] font-bold uppercase tracking-wide text-[var(--c-faint)] mb-3">Task Calendar</p>
            <TaskCalendar tasks={TASKS} todayStr={TODAY_STR} historyDates={HISTORY}
              onOpenDay={() => {}} onMarkDone={() => {}} />
          </div>
        </div>

        <Label>Combined filter (tap it) + applied chips</Label>
        <div className="px-4 flex items-center gap-2">
          <FilterSheet value={filters} onChange={setFilters} groups={GROUPS} applyLabel={() => 'Show 34 items'} />
          <span className="text-[13px] text-[var(--c-faint)]">← tap</span>
        </div>
        <AppliedChips value={filters} groups={GROUPS} onChange={setFilters} className="px-4 pt-2" />

        <Label>Register card + add + filter</Label>
        <div className="px-4 space-y-2">
          <AddButton onClick={() => {}}>New Purchase</AddButton>
          <FilterSelect value={cat} onChange={setCat}
            options={[['all', 'All categories'], ['seed', '🌾 Seeds'], ['fuel', '⛽ Fuel']]} />
          <RegisterCard title="Urea" subline="Fertilizers · WAC ₹266/bag" figure={12} figureLabel="bag"
            status={{ text: '⚠ Low (min 20)', color: '#BA7517' }} borderColor="#BA751759"
            action={{ label: '→ Issue to Plot', onClick: () => {} }} />
          <div className="flex gap-2 pt-1">
            <button className="flex-1 py-2 rounded-xl border text-xs font-semibold flex items-center justify-center gap-1.5" style={btn}>
              <Plus size={13} strokeWidth={2.5} /> Log Activity
            </button>
            <button className="flex-1 py-2 rounded-xl border text-xs font-semibold flex items-center justify-center gap-1.5" style={btn}>
              <Receipt size={13} strokeWidth={2.5} /> Log Expense
            </button>
          </div>
        </div>

        <Label>Count chips</Label>
        <div className="px-4 flex flex-wrap gap-2">
          <Pill count={2} label="Overdue" color="#E24B4A" />
          <Pill count={1} label="Scheduled" color="#8A9A5B" />
          <Pill count={3} label="Logged" color="#3b82f6" />
          <Pill count={7} label="Named Workers" color="#6366f1" icon={<Users size={11} />} />
          <Pill count={3} label="Outside Labour" color="#f59e0b" icon={<HardHat size={11} />} />
        </div>
      </div>
    </div>
  )
}

const Label = ({ children }) => (
  <p className="px-4 pt-6 pb-1 text-[12px] font-bold uppercase tracking-widest" style={{ color: '#8A9A5B' }}>{children}</p>
)
function Pill({ count, label, color, dim, icon }) {
  return (
    <div className={`shrink-0 flex items-center gap-1.5 h-7 px-2.5 rounded-full border ${dim ? 'opacity-40' : ''}`}
      style={{ background: color + '12', borderColor: color + '55' }}>
      {icon && <span style={{ color }}>{icon}</span>}
      <span className="text-[13px] font-bold tabular-nums" style={{ color }}>{count}</span>
      <span className="text-[13px] font-semibold" style={{ color }}>{label}</span>
    </div>
  )
}

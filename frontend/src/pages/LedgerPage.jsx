import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAppStore } from '../store'
import { isManager, getActiveFarmRole } from '../store/auth'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend,
} from 'recharts'
import {
  BookOpen, Plus, Wallet, AlertCircle, TrendingUp, TrendingDown,
  ChevronDown, X, CheckCircle,
} from 'lucide-react'

// ── Helpers ───────────────────────────────────────────────────────────────────
const fmt = (n) =>
  '₹' + Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })

const fmtDate = (d) => {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: '2-digit' })
}

const MonthLabel = (d) => {
  if (!d) return ''
  return new Date(d).toLocaleDateString('en-IN', { month: 'short', year: '2-digit' })
}

// ── Financial Year helpers (Indian FY: 1 Apr – 31 Mar) ─────────────────────────
// 'all' means no period filter (all-time). Any other value is the FY start
// year as a string, e.g. "2025" for FY 2025-26.
const fyLabel = (startYear) => `${startYear}-${String((Number(startYear) + 1) % 100).padStart(2, '0')}`

const fyStartYearForDate = (dateStr) => {
  const d = new Date(dateStr)
  return d.getMonth() >= 3 ? d.getFullYear() : d.getFullYear() - 1 // April (month 3) starts the FY
}

const currentFY = () => String(fyStartYearForDate(new Date().toISOString().slice(0, 10)))

const fyRange = (fy) => {
  if (fy === 'all') return null
  const y = Number(fy)
  return { start: `${y}-04-01`, end: `${y + 1}-03-31` }
}

const inFY = (dateStr, fy) => {
  if (fy === 'all' || !dateStr) return true
  const r = fyRange(fy)
  return dateStr >= r.start && dateStr <= r.end
}

const fyOptions = (count = 5) => {
  const curStart = Number(currentFY())
  const opts = []
  for (let i = 0; i < count; i++) opts.push(String(curStart - i))
  opts.push('all')
  return opts
}

const CATEGORY_LABELS = {
  feed:              'Feed & Fodder',
  veterinary:        'Veterinary',
  labour:            'Daily Labour',
  salary:            'Staff Salary',
  inventory_purchase:'Inventory Purchase',
  farm_expense:      'General Expenses',
  machinery:         'Machinery / Hired Equipment',
  maintenance:       'Maintenance',
  construction:      'Construction',
  fuel:              'Fuel',
  utilities:         'Utilities',
  administrative:    'Administrative',
  other:             'Other',
}

const TABS = [
  { id: 'summary',  label: 'Summary'       },
  { id: 'cashbook', label: 'Cash Book'     },
  { id: 'income',   label: 'Income'        },
  { id: 'vendors',  label: 'Party Ledger'  },
  { id: 'buyers',   label: 'Buyer Khata'   },
  { id: 'expenses', label: 'Expenses'      },
  { id: 'pnl',      label: 'P & L'         },
]

// ── Card wrapper ──────────────────────────────────────────────────────────────
function Card({ children, className = '' }) {
  return (
    <div className={`rounded-2xl p-4 ${className}`}
      style={{ background: 'var(--c-card)', border: '0.5px solid var(--c-border)' }}>
      {children}
    </div>
  )
}

// ── Metric card ───────────────────────────────────────────────────────────────
function MetricCard({ label, value, color, sub }) {
  return (
    <Card className="flex flex-col gap-1">
      <span className="text-[10px] uppercase tracking-wider" style={{ color: 'var(--c-faint)' }}>{label}</span>
      <span className="text-xl font-bold" style={{ color: color || 'var(--c-text)' }}>{value}</span>
      {sub && <span className="text-[10px]" style={{ color: 'var(--c-faint)' }}>{sub}</span>}
    </Card>
  )
}

// ── Modal wrapper ─────────────────────────────────────────────────────────────
function Modal({ title, onClose, children }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center"
      style={{ background: 'rgba(0,0,0,0.5)' }} onClick={onClose}>
      <div className="w-full max-w-lg rounded-t-2xl p-5 pb-8"
        style={{ background: 'var(--c-card)' }} onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold text-sm" style={{ color: 'var(--c-text)' }}>{title}</h3>
          <button onClick={onClose}><X size={16} style={{ color: 'var(--c-muted)' }} /></button>
        </div>
        {children}
      </div>
    </div>
  )
}

function Field({ label, children }) {
  return (
    <div className="flex flex-col gap-1 mb-3">
      <label className="text-[11px]" style={{ color: 'var(--c-faint)' }}>{label}</label>
      {children}
    </div>
  )
}

const inputCls = 'w-full px-3 py-2 rounded-xl text-sm outline-none'
const inputStyle = { background: 'var(--c-ghost)', color: 'var(--c-text)', border: '0.5px solid var(--c-border)' }

// ── Add Cash Entry Modal ──────────────────────────────────────────────────────
function AddCashModal({ onClose, onSave }) {
  const today = new Date().toISOString().slice(0, 10)
  const [form, setForm] = useState({
    entry_date: today, amount: '', direction: 'in',
    entry_type: 'owner_capital', notes: '',
  })
  const [saving, setSaving] = useState(false)

  const save = async () => {
    if (!form.amount || parseFloat(form.amount) <= 0) return
    setSaving(true)
    try { await onSave(form); onClose() } finally { setSaving(false) }
  }

  return (
    <Modal title="Add Cash Entry" onClose={onClose}>
      <Field label="Date">
        <input type="date" className={inputCls} style={inputStyle} value={form.entry_date}
          onChange={e => setForm(f => ({ ...f, entry_date: e.target.value }))} />
      </Field>
      <Field label="Type">
        <select className={inputCls} style={inputStyle} value={form.direction + ':' + form.entry_type}
          onChange={e => {
            const [dir, typ] = e.target.value.split(':')
            setForm(f => ({ ...f, direction: dir, entry_type: typ }))
          }}>
          <option value="in:owner_capital">Owner adds cash (Capital Injection)</option>
          <option value="in:revenue_receipt">Revenue received in cash</option>
          <option value="out:other_payment">Other cash payment</option>
        </select>
      </Field>
      <Field label="Amount (₹)">
        <input type="number" placeholder="0" className={inputCls} style={inputStyle}
          value={form.amount} onChange={e => setForm(f => ({ ...f, amount: e.target.value }))} />
      </Field>
      <Field label="Notes (optional)">
        <input type="text" placeholder="e.g. Monthly farm funds" className={inputCls} style={inputStyle}
          value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
      </Field>
      <button disabled={saving || !form.amount}
        onClick={save}
        className="w-full py-2.5 rounded-xl text-sm font-semibold text-white mt-1 disabled:opacity-50"
        style={{ background: '#1D9E75' }}>
        {saving ? 'Saving…' : 'Save Entry'}
      </button>
    </Modal>
  )
}

// ── Pay Vendor Modal ──────────────────────────────────────────────────────────
function PayVendorModal({ vendors, selectedVendor, onClose, onSave }) {
  const today = new Date().toISOString().slice(0, 10)
  const [form, setForm] = useState({
    vendor_id: selectedVendor?.vendor_id || vendors[0]?.id || '',
    payment_date: today, amount: '', payment_mode: 'cash', notes: '',
  })
  const [saving, setSaving] = useState(false)

  const vendorName = vendors.find(v => v.id === form.vendor_id)?.name || ''

  const save = async () => {
    if (!form.amount || !form.vendor_id) return
    setSaving(true)
    try { await onSave({ ...form, vendorName }); onClose() } finally { setSaving(false) }
  }

  return (
    <Modal title="Pay Vendor" onClose={onClose}>
      <Field label="Vendor">
        <select className={inputCls} style={inputStyle} value={form.vendor_id}
          onChange={e => setForm(f => ({ ...f, vendor_id: e.target.value }))}>
          {vendors.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
        </select>
      </Field>
      <Field label="Date">
        <input type="date" className={inputCls} style={inputStyle} value={form.payment_date}
          onChange={e => setForm(f => ({ ...f, payment_date: e.target.value }))} />
      </Field>
      <Field label="Amount (₹)">
        <input type="number" placeholder="0" className={inputCls} style={inputStyle}
          value={form.amount} onChange={e => setForm(f => ({ ...f, amount: e.target.value }))} />
      </Field>
      <Field label="Payment Mode">
        <select className={inputCls} style={inputStyle} value={form.payment_mode}
          onChange={e => setForm(f => ({ ...f, payment_mode: e.target.value }))}>
          <option value="cash">Cash</option>
          <option value="bank_transfer">Bank Transfer</option>
          <option value="cheque">Cheque</option>
          <option value="upi">UPI</option>
        </select>
      </Field>
      <Field label="Notes (optional)">
        <input type="text" className={inputCls} style={inputStyle}
          value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
      </Field>
      <button disabled={saving || !form.amount}
        onClick={save}
        className="w-full py-2.5 rounded-xl text-sm font-semibold text-white mt-1 disabled:opacity-50"
        style={{ background: '#1D9E75' }}>
        {saving ? 'Saving…' : 'Record Payment'}
      </button>
    </Modal>
  )
}

// ── Add Vendor Modal ──────────────────────────────────────────────────────────
function AddVendorModal({ onClose, onSave }) {
  const [form, setForm] = useState({ name: '', category: 'other', phone: '', credit_days: 0 })
  const [saving, setSaving] = useState(false)
  const save = async () => {
    if (!form.name.trim()) return
    setSaving(true)
    try { await onSave(form); onClose() } finally { setSaving(false) }
  }
  return (
    <Modal title="Add Vendor / Party" onClose={onClose}>
      <Field label="Vendor Name">
        <input type="text" placeholder="e.g. SHARMA SEEDS STORE" className={inputCls} style={inputStyle}
          value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
      </Field>
      <Field label="Category">
        <select className={inputCls} style={inputStyle} value={form.category}
          onChange={e => setForm(f => ({ ...f, category: e.target.value }))}>
          <option value="seed_fertilizer">Seeds / Fertilizer</option>
          <option value="fuel">Fuel / Petroleum</option>
          <option value="local_market">Local Market</option>
          <option value="other">Other</option>
        </select>
      </Field>
      <Field label="Phone (optional)">
        <input type="tel" className={inputCls} style={inputStyle}
          value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} />
      </Field>
      <button disabled={saving || !form.name.trim()} onClick={save}
        className="w-full py-2.5 rounded-xl text-sm font-semibold text-white disabled:opacity-50"
        style={{ background: '#1D9E75' }}>
        {saving ? 'Saving…' : 'Add Vendor'}
      </button>
    </Modal>
  )
}

// ── Tab: Summary ──────────────────────────────────────────────────────────────
function SummaryTab({ cashBalance, totalIncome, totalExpenses, totalVendorDues, totalReceivables, monthlySummary }) {
  const netProfit = totalIncome - totalExpenses
  const chartData = monthlySummary.slice(0, 12).reverse().map(m => ({
    month: MonthLabel(m.month),
    Income:   Math.round(m.total_income || 0),
    Expenses: Math.round(m.total_expenses || 0),
  }))

  return (
    <div className="flex flex-col gap-3 pt-3">
      {/* Cash balance — hero card */}
      <Card>
        <div className="flex items-center gap-2 mb-1">
          <Wallet size={14} color="#1D9E75" />
          <span className="text-[11px] uppercase tracking-wider" style={{ color: 'var(--c-faint)' }}>
            Current Cash Balance
          </span>
        </div>
        <div className="text-3xl font-bold" style={{ color: cashBalance >= 0 ? '#1D9E75' : '#E24B4A' }}>
          {fmt(cashBalance)}
        </div>
        <div className="text-[10px] mt-1" style={{ color: 'var(--c-faint)' }}>
          Total cash in hand after all payments recorded
        </div>
      </Card>

      {/* Receivables alert — money owed TO the farm by buyers */}
      {totalReceivables > 0 && (
        <div className="flex items-start gap-2 rounded-xl px-3 py-2.5"
          style={{ background: 'rgba(29,158,117,0.1)', border: '0.5px solid rgba(29,158,117,0.3)' }}>
          <AlertCircle size={14} color="#1D9E75" className="mt-0.5 shrink-0" />
          <div>
            <div className="text-xs font-medium" style={{ color: '#1D9E75' }}>
              Receivables outstanding: {fmt(totalReceivables)}
            </div>
            <div className="text-[10px]" style={{ color: 'var(--c-faint)' }}>
              Sold but not yet collected from buyers — see Buyer Khata
            </div>
          </div>
        </div>
      )}

      {/* Vendor dues alert */}
      {totalVendorDues > 0 && (
        <div className="flex items-start gap-2 rounded-xl px-3 py-2.5"
          style={{ background: '#BA7517/10', border: '0.5px solid #BA7517/30' }}>
          <AlertCircle size={14} color="#BA7517" className="mt-0.5 shrink-0" />
          <div>
            <div className="text-xs font-medium" style={{ color: '#BA7517' }}>
              Vendor dues outstanding: {fmt(totalVendorDues)}
            </div>
            <div className="text-[10px]" style={{ color: 'var(--c-faint)' }}>
              Pending payments to vendors not yet cleared
            </div>
          </div>
        </div>
      )}

      {/* Metric grid */}
      <div className="grid grid-cols-2 gap-3">
        <MetricCard label="Total Income" value={fmt(totalIncome)} color="#1D9E75" />
        <MetricCard label="Total Expenses" value={fmt(totalExpenses)} color="#E24B4A" />
        <MetricCard label="Net Profit / Loss" value={fmt(netProfit)}
          color={netProfit >= 0 ? '#1D9E75' : '#E24B4A'} />
        <MetricCard label="Vendor Dues" value={fmt(totalVendorDues)} color="#BA7517" />
        <MetricCard label="Receivables Due" value={fmt(totalReceivables)} color="#1D9E75" />
      </div>
      <div className="text-[10px] text-center" style={{ color: 'var(--c-faint)' }}>
        Income/Expenses reflect the period selected above. Cash Balance, Vendor Dues, and Receivables are always as of today, regardless of period.
      </div>

      {/* Monthly chart */}
      {chartData.length > 0 && (
        <Card>
          <div className="text-xs font-medium mb-3" style={{ color: 'var(--c-text)' }}>
            Monthly Income vs Expenses
          </div>
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={chartData} barSize={12}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--c-border)" />
              <XAxis dataKey="month" tick={{ fontSize: 9, fill: 'var(--c-faint)' }} />
              <YAxis tick={{ fontSize: 9, fill: 'var(--c-faint)' }}
                tickFormatter={v => v >= 1000 ? `${(v/1000).toFixed(0)}k` : v} />
              <Tooltip formatter={v => fmt(v)} contentStyle={{ fontSize: 11, borderRadius: 8 }} />
              <Legend wrapperStyle={{ fontSize: 10 }} />
              <Bar dataKey="Income"   fill="#1D9E75" radius={[3,3,0,0]} />
              <Bar dataKey="Expenses" fill="#E24B4A" radius={[3,3,0,0]} />
            </BarChart>
          </ResponsiveContainer>
        </Card>
      )}
    </div>
  )
}

// ── Tab: Cash Book ────────────────────────────────────────────────────────────
function CashBookTab({ cashBook, openingBalance = 0, showOpening = false, onAdd }) {
  const rows = [...cashBook].reverse() // newest first for display

  return (
    <div className="flex flex-col gap-3 pt-3">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-xs font-semibold" style={{ color: 'var(--c-text)' }}>Cash Book</div>
          <div className="text-[10px]" style={{ color: 'var(--c-faint)' }}>
            All cash receipts and payments with running balance
          </div>
        </div>
        <button onClick={onAdd}
          className="flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-medium text-white"
          style={{ background: '#1D9E75' }}>
          <Plus size={12} /> Add Entry
        </button>
      </div>

      {showOpening && (
        <div className="flex items-center justify-between px-3 py-2 rounded-xl" style={{ background: 'var(--c-ghost)' }}>
          <span className="text-[10px] font-medium" style={{ color: 'var(--c-faint)' }}>Opening Balance (carried from before this period)</span>
          <span className="text-xs font-bold" style={{ color: openingBalance >= 0 ? '#1D9E75' : '#E24B4A' }}>{fmt(openingBalance)}</span>
        </div>
      )}

      {rows.length === 0 ? (
        <Card>
          <div className="text-center text-xs py-6" style={{ color: 'var(--c-faint)' }}>
            {showOpening ? 'No cash entries in this period.' : "No cash entries yet. Add the owner's first cash injection to start."}
          </div>
        </Card>
      ) : (
        <Card className="overflow-x-auto p-0">
          <table className="w-full text-xs">
            <thead>
              <tr style={{ borderBottom: '0.5px solid var(--c-border)' }}>
                {['Date','Particulars','Receipt (IN)','Payment (OUT)','Balance'].map(h => (
                  <th key={h} className="px-3 py-2.5 text-left font-medium"
                    style={{ color: 'var(--c-faint)' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => (
                <tr key={row.id || i} style={{ borderBottom: '0.5px solid var(--c-border)' }}>
                  <td className="px-3 py-2 whitespace-nowrap" style={{ color: 'var(--c-faint)' }}>
                    {fmtDate(row.entry_date)}
                  </td>
                  <td className="px-3 py-2" style={{ color: 'var(--c-text)' }}>
                    {row.particulars}
                  </td>
                  <td className="px-3 py-2 text-right font-medium" style={{ color: '#1D9E75' }}>
                    {Number(row.receipt_amount) > 0 ? fmt(row.receipt_amount) : '—'}
                  </td>
                  <td className="px-3 py-2 text-right font-medium" style={{ color: '#E24B4A' }}>
                    {Number(row.payment_amount) > 0 ? fmt(row.payment_amount) : '—'}
                  </td>
                  <td className="px-3 py-2 text-right font-bold"
                    style={{ color: Number(row.running_balance) >= 0 ? '#1D9E75' : '#E24B4A' }}>
                    {fmt(row.running_balance)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  )
}

// ── Tab: Income Ledger ────────────────────────────────────────────────────────
function IncomeTab({ incomeLedger, cropResiduals = [], onRecordSale }) {
  const [saleForm, setSaleForm] = useState(null) // { id, productName, quantity, unit, expectedRate }
  const [saving, setSaving]     = useState(false)
  const [saleData, setSaleData] = useState({ actualRate: '', buyerName: '', saleDate: new Date().toISOString().slice(0, 10), paymentStatus: 'pending', notes: '' })

  const totalIncome    = incomeLedger.reduce((s, r) => s + Number(r.amount || 0), 0)
  const livestockTotal = incomeLedger.filter(r => r.source_type === 'livestock').reduce((s, r) => s + Number(r.amount || 0), 0)
  const cropTotal      = incomeLedger.filter(r => r.source_type === 'crop').reduce((s, r) => s + Number(r.amount || 0), 0)
  const residualTotal  = incomeLedger.filter(r => r.source_type === 'crop_residual').reduce((s, r) => s + Number(r.amount || 0), 0)
  const treeTotal      = incomeLedger.filter(r => r.source_type === 'tree').reduce((s, r) => s + Number(r.amount || 0), 0)
  const isCollected    = (r) => (r.payment_status || 'paid') === 'paid'
  const collectedTotal = incomeLedger.filter(isCollected).reduce((s, r) => s + Number(r.amount || 0), 0)
  const pendingTotal   = totalIncome - collectedTotal
  const openResiduals  = cropResiduals.filter(r => r.status === 'open')
  const sorted = [...incomeLedger].sort((a, b) => new Date(b.entry_date) - new Date(a.entry_date))

  const openForm = (r) => {
    setSaleForm(r)
    setSaleData({ actualRate: r.expectedRate || '', buyerName: '', saleDate: new Date().toISOString().slice(0, 10), paymentStatus: 'pending', notes: '' })
  }

  const submitSale = async () => {
    if (!saleData.actualRate || !saleData.saleDate) return
    setSaving(true)
    try {
      await onRecordSale(saleForm.id, saleData)
      setSaleForm(null)
    } finally {
      setSaving(false)
    }
  }

  // Anything unrecognised falls through to Crop, so a new source_type must be named
  // here or it gets silently counted as a crop sale.
  const sourceBadge = (type) => {
    if (type === 'livestock')     return { bg: 'rgba(29,158,117,0.12)',  color: '#1D9E75',  label: 'Livestock' }
    if (type === 'crop_residual') return { bg: 'rgba(139,92,246,0.12)',  color: '#7c3aed',  label: 'Residual'  }
    if (type === 'tree')          return { bg: 'rgba(101,163,13,0.12)',  color: '#65a30d',  label: 'Trees'     }
    return                               { bg: 'rgba(186,117,23,0.12)',  color: '#BA7517',  label: 'Crop'      }
  }

  return (
    <div className="flex flex-col gap-3 pt-3">
      <div className="grid grid-cols-2 gap-2">
        <MetricCard label="Total Revenue"   value={fmt(totalIncome)}    color="#1D9E75" />
        <MetricCard label="Collected"       value={fmt(collectedTotal)} color="#1D9E75" />
        <MetricCard label="Pending Collection" value={fmt(pendingTotal)} color="#BA7517" />
        <MetricCard label="Crop Sales"      value={fmt(cropTotal)}      color="#BA7517" />
        <MetricCard label="Livestock"       value={fmt(livestockTotal)} color="#1D9E75" />
        <MetricCard label="Residuals Sold"  value={fmt(residualTotal)}  color="#7c3aed" />
        <MetricCard label="Tree Sales"      value={fmt(treeTotal)}      color="#65a30d" />
      </div>

      {/* Open residuals alert */}
      {openResiduals.length > 0 && (
        <Card>
          <div className="flex items-center gap-2 mb-3">
            <AlertCircle size={14} color="#BA7517" />
            <p className="text-xs font-semibold" style={{ color: 'var(--c-text)' }}>
              Open Residuals — Pending Sale ({openResiduals.length})
            </p>
          </div>
          <div className="space-y-2">
            {openResiduals.map(r => (
              <div key={r.id} className="rounded-xl p-3 flex items-center justify-between gap-2"
                style={{ background: 'var(--c-ghost)', border: '0.5px solid var(--c-border)' }}>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold" style={{ color: 'var(--c-text)' }}>{r.productName}</p>
                  <p className="text-[10px]" style={{ color: 'var(--c-faint)' }}>
                    {r.quantity} {r.unit}
                    {r.expectedRevenue > 0 && ` · Est. ${fmt(r.expectedRevenue)}`}
                  </p>
                </div>
                <button onClick={() => openForm(r)}
                  className="shrink-0 text-[10px] font-semibold px-3 py-1.5 rounded-lg"
                  style={{ background: '#1D9E75', color: '#fff' }}>
                  Record Sale
                </button>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Record sale modal */}
      {saleForm && (
        <div className="fixed inset-0 z-50 flex items-end" style={{ background: 'rgba(0,0,0,0.5)' }}>
          <div className="w-full rounded-t-3xl p-5 space-y-3" style={{ background: 'var(--c-card)', border: '0.5px solid var(--c-border)' }}>
            <div className="flex items-center justify-between">
              <p className="text-sm font-bold" style={{ color: 'var(--c-text)' }}>Record Sale — {saleForm.productName}</p>
              <button onClick={() => setSaleForm(null)} style={{ color: 'var(--c-faint)' }}><X size={18} /></button>
            </div>
            <p className="text-xs" style={{ color: 'var(--c-faint)' }}>
              Qty: {saleForm.quantity} {saleForm.unit}
              {saleForm.expectedRate > 0 && ` · Expected rate: ₹${saleForm.expectedRate}/${saleForm.unit}`}
            </p>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <p className="text-[10px] mb-1" style={{ color: 'var(--c-faint)' }}>Actual Rate (₹/{saleForm.unit})*</p>
                <input type="number" className="finput w-full" placeholder="e.g. 48"
                  value={saleData.actualRate} onChange={e => setSaleData(p => ({ ...p, actualRate: e.target.value }))} />
              </div>
              <div>
                <p className="text-[10px] mb-1" style={{ color: 'var(--c-faint)' }}>Sale Date*</p>
                <input type="date" className="finput w-full"
                  value={saleData.saleDate} onChange={e => setSaleData(p => ({ ...p, saleDate: e.target.value }))} />
              </div>
            </div>
            {saleData.actualRate > 0 && (
              <p className="text-xs font-bold" style={{ color: '#1D9E75' }}>
                Total: {fmt(parseFloat(saleData.actualRate) * saleForm.quantity)}
              </p>
            )}
            <div>
              <p className="text-[10px] mb-1" style={{ color: 'var(--c-faint)' }}>Buyer Name</p>
              <input className="finput w-full" placeholder="e.g. Ramu Kaka"
                value={saleData.buyerName} onChange={e => setSaleData(p => ({ ...p, buyerName: e.target.value }))} />
            </div>
            <div>
              <p className="text-[10px] mb-1" style={{ color: 'var(--c-faint)' }}>Payment Status</p>
              <div className="flex gap-2">
                {['pending','received'].map(s => (
                  <button key={s} onClick={() => setSaleData(p => ({ ...p, paymentStatus: s }))}
                    className="flex-1 py-2 rounded-lg text-xs font-medium transition-colors"
                    style={{
                      background: saleData.paymentStatus === s ? '#1D9E75' : 'var(--c-ghost)',
                      color:      saleData.paymentStatus === s ? '#fff'    : 'var(--c-muted)',
                    }}>
                    {s === 'pending' ? 'Cash Pending' : 'Cash Received'}
                  </button>
                ))}
              </div>
            </div>
            <button onClick={submitSale} disabled={saving || !saleData.actualRate || !saleData.saleDate}
              className="w-full py-3 rounded-xl text-xs font-bold disabled:opacity-40"
              style={{ background: '#1D9E75', color: '#fff' }}>
              {saving ? 'Saving…' : 'Record Sale'}
            </button>
          </div>
        </div>
      )}

      {sorted.length === 0 ? (
        <Card>
          <div className="text-center text-xs py-6" style={{ color: 'var(--c-faint)' }}>
            No income entries yet. Revenue from crop sales, livestock, residuals, and tree sales will appear here.
          </div>
        </Card>
      ) : (
        <Card className="overflow-x-auto p-0">
          <div className="px-4 pt-3 pb-2 text-xs font-semibold" style={{ color: 'var(--c-text)' }}>
            All Income Entries
          </div>
          <table className="w-full text-xs">
            <thead>
              <tr style={{ borderBottom: '0.5px solid var(--c-border)' }}>
                {['Date','Source','Description','Amount','Status'].map(h => (
                  <th key={h} className="px-3 py-2 text-left font-medium" style={{ color: 'var(--c-faint)' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sorted.map((row, i) => {
                const badge = sourceBadge(row.source_type)
                const paid  = isCollected(row)
                return (
                  <tr key={i} style={{ borderBottom: '0.5px solid var(--c-border)' }}>
                    <td className="px-3 py-2 whitespace-nowrap" style={{ color: 'var(--c-faint)' }}>
                      {fmtDate(row.entry_date)}
                    </td>
                    <td className="px-3 py-2">
                      <span className="px-1.5 py-0.5 rounded text-[9px] font-semibold"
                        style={{ background: badge.bg, color: badge.color }}>
                        {badge.label}
                      </span>
                    </td>
                    <td className="px-3 py-2" style={{ color: 'var(--c-text)' }}>
                      <div>{row.description}</div>
                      {row.buyer_name && (
                        <div className="text-[9px]" style={{ color: 'var(--c-faint)' }}>{row.buyer_name}</div>
                      )}
                    </td>
                    <td className="px-3 py-2 font-bold" style={{ color: '#1D9E75' }}>{fmt(row.amount)}</td>
                    <td className="px-3 py-2">
                      <span className="px-2 py-0.5 rounded-full text-[9px] font-semibold"
                        style={{
                          background: paid ? 'rgba(29,158,117,0.15)' : 'rgba(186,117,23,0.15)',
                          color:      paid ? '#1D9E75'               : '#BA7517',
                        }}>
                        {paid ? 'Collected' : 'Pending'}
                      </span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  )
}

// ── Tab: Party Ledger (Vendor Khatas) ─────────────────────────────────────────
function VendorTab({ vendors, selectedVendor, setSelectedVendor, onPay, onAddVendor, canPay, fy }) {
  const [activeId, setActiveId] = useState(null) // null = overview list
  const [monthView, setMonthView] = useState(false)
  const { vendorPayments, purchases } = useAppStore()

  const purchasesFor = (v) => purchases.filter(p => {
    if (p.vendor_id && p.vendor_id === v.id) return true
    return p.vendor && v.name && p.vendor.toLowerCase() === v.name.toLowerCase()
  })
  const paymentsFor = (v) => vendorPayments.filter(p => p.vendor_id === v.id)

  // Overview: every vendor, all-time Balance Due (a point-in-time fact) plus
  // Purchased/Paid scoped to the selected financial year (period activity).
  const overview = vendors.map(v => {
    const vPurchases = purchasesFor(v)
    const vPayments  = paymentsFor(v)
    const purchasedAllTime = vPurchases.reduce((s, p) => s + Number(p.totalCost || 0), 0)
    const paidAllTime      = vPayments.reduce((s, p) => s + Number(p.amount || 0), 0)
    return {
      vendor: v,
      balanceDue:  purchasedAllTime - paidAllTime,
      purchasedFY: vPurchases.filter(p => inFY(p.date, fy)).reduce((s, p) => s + Number(p.totalCost || 0), 0),
      paidFY:      vPayments.filter(p => inFY(p.payment_date, fy)).reduce((s, p) => s + Number(p.amount || 0), 0),
    }
  }).sort((a, b) => b.balanceDue - a.balanceDue)

  const activeVendor = vendors.find(v => v.id === activeId)

  const ledgerRowsAll = activeVendor ? [
    ...purchasesFor(activeVendor).map(p => ({
      date: p.date, type: 'purchase',
      particulars: `Purchase — ${p.vendor || activeVendor.name}`,
      debit: Number(p.totalCost || 0), credit: 0,
    })),
    ...paymentsFor(activeVendor).map(p => ({
      date: p.payment_date, type: 'payment',
      particulars: p.notes || 'Cash Payment',
      debit: 0, credit: Number(p.amount || 0),
    })),
  ].sort((a, b) => new Date(a.date) - new Date(b.date)) : []

  const range = fyRange(fy)
  const openingBal = range
    ? ledgerRowsAll.filter(r => r.date < range.start).reduce((s, r) => s + r.debit - r.credit, 0)
    : 0
  const ledgerRowsFY = range ? ledgerRowsAll.filter(r => r.date >= range.start && r.date <= range.end) : ledgerRowsAll

  let running = openingBal
  const ledgerWithBal = ledgerRowsFY.map(r => {
    running += r.debit - r.credit
    return { ...r, balance: running }
  })

  const purchasedFY = ledgerWithBal.reduce((s, r) => s + r.debit, 0)
  const paidFY      = ledgerWithBal.reduce((s, r) => s + r.credit, 0)
  const balanceDueAllTime = ledgerRowsAll.reduce((s, r) => s + r.debit - r.credit, 0)

  // Month-wise grouping with opening / closing balance (within the FY-scoped rows)
  const byMonth = {}
  ledgerWithBal.forEach(row => {
    const mo = row.date ? row.date.slice(0, 7) : '0000-00'
    if (!byMonth[mo]) byMonth[mo] = { rows: [] }
    byMonth[mo].rows.push(row)
  })
  const months = Object.keys(byMonth).sort()
  let prevClosing = openingBal
  months.forEach(mo => {
    byMonth[mo].openingBal = prevClosing
    const last = byMonth[mo].rows[byMonth[mo].rows.length - 1]
    prevClosing = last ? last.balance : prevClosing
    byMonth[mo].closingBal = prevClosing
  })

  const header = (
    <div className="flex items-center justify-between">
      <div className="text-xs font-semibold" style={{ color: 'var(--c-text)' }}>
        Sundry Creditors (Vendor Khatas)
      </div>
      <button onClick={onAddVendor}
        className="flex items-center gap-1 px-2.5 py-1.5 rounded-full text-xs font-medium"
        style={{ background: 'var(--c-ghost)', color: 'var(--c-muted)' }}>
        <Plus size={11} /> Add Vendor
      </button>
    </div>
  )

  // ── Overview: every vendor, row-wise, worst balance first ──────────────────
  if (!activeVendor) {
    return (
      <div className="flex flex-col gap-3 pt-3">
        {header}
        {vendors.length === 0 ? (
          <Card>
            <div className="text-center text-xs py-6" style={{ color: 'var(--c-faint)' }}>
              No vendors set up. Add a vendor to start tracking.
            </div>
          </Card>
        ) : (
          <Card className="overflow-x-auto p-0">
            <table className="w-full text-xs">
              <thead>
                <tr style={{ borderBottom: '0.5px solid var(--c-border)' }}>
                  {['Vendor','Purchased','Paid','Balance Due'].map(h => (
                    <th key={h} className="px-3 py-2 text-left font-medium" style={{ color: 'var(--c-faint)' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {overview.map(({ vendor, purchasedFY: pFY, paidFY: yFY, balanceDue }) => (
                  <tr key={vendor.id} onClick={() => setActiveId(vendor.id)}
                    className="cursor-pointer hover:bg-[var(--c-ghost)] transition-colors"
                    style={{ borderBottom: '0.5px solid var(--c-border)' }}>
                    <td className="px-3 py-2.5 font-medium" style={{ color: 'var(--c-text)' }}>{vendor.name}</td>
                    <td className="px-3 py-2.5" style={{ color: 'var(--c-text)' }}>{fmt(pFY)}</td>
                    <td className="px-3 py-2.5" style={{ color: '#1D9E75' }}>{fmt(yFY)}</td>
                    <td className="px-3 py-2.5 font-bold" style={{ color: balanceDue > 0 ? '#E24B4A' : '#1D9E75' }}>{fmt(balanceDue)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        )}
        <p className="text-[10px] text-center" style={{ color: 'var(--c-faint)' }}>
          Purchased/Paid reflect the selected period · Balance Due is always as of today · Tap a vendor for details
        </p>
      </div>
    )
  }

  // ── Detail: one vendor's ledger for the selected period ────────────────────
  return (
    <div className="flex flex-col gap-3 pt-3">
      <div className="flex items-center gap-2">
        <button onClick={() => setActiveId(null)} className="text-xs px-2 py-1 rounded-lg"
          style={{ background: 'var(--c-ghost)', color: 'var(--c-muted)' }}>
          ← All Vendors
        </button>
        <div className="text-xs font-semibold" style={{ color: 'var(--c-text)' }}>{activeVendor.name}</div>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <Card className="p-3">
          <div className="text-[9px] uppercase tracking-wider mb-1" style={{ color: 'var(--c-faint)' }}>Purchased</div>
          <div className="text-sm font-bold" style={{ color: 'var(--c-text)' }}>{fmt(purchasedFY)}</div>
        </Card>
        <Card className="p-3">
          <div className="text-[9px] uppercase tracking-wider mb-1" style={{ color: 'var(--c-faint)' }}>Paid</div>
          <div className="text-sm font-bold" style={{ color: '#1D9E75' }}>{fmt(paidFY)}</div>
        </Card>
        <Card className="p-3">
          <div className="text-[9px] uppercase tracking-wider mb-1" style={{ color: 'var(--c-faint)' }}>Balance Due</div>
          <div className="text-sm font-bold" style={{ color: balanceDueAllTime > 0 ? '#E24B4A' : '#1D9E75' }}>{fmt(balanceDueAllTime)}</div>
        </Card>
      </div>

      {balanceDueAllTime > 0 && (
        canPay ? (
          <button
            onClick={() => {
              setSelectedVendor({ vendor_id: activeVendor.id, vendor_name: activeVendor.name, balance_due: balanceDueAllTime })
              onPay()
            }}
            className="flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold text-white"
            style={{ background: '#1D9E75' }}>
            <CheckCircle size={14} /> Record Payment to {activeVendor.name}
          </button>
        ) : (
          <p className="text-[10px] text-center py-2.5 rounded-xl" style={{ color: '#BA7517', background: 'rgba(186,117,23,0.1)' }}>
            Only a manager or accounts admin can record vendor payments
          </p>
        )
      )}

      {ledgerWithBal.length > 0 ? (
        <>
          <div className="flex justify-end">
            <button
              onClick={() => setMonthView(v => !v)}
              className="text-[10px] px-2.5 py-1 rounded-full"
              style={{ background: 'var(--c-ghost)', color: 'var(--c-muted)' }}>
              {monthView ? 'Flat View' : 'Month-wise View'}
            </button>
          </div>

          {monthView ? (
            <div className="flex flex-col gap-2">
              {months.map(mo => {
                const { rows: mRows, openingBal: moOpen, closingBal } = byMonth[mo]
                const moLabel = new Date(mo + '-02').toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })
                return (
                  <Card key={mo} className="p-0 overflow-hidden">
                    <div className="flex items-center justify-between px-3 py-2"
                      style={{ background: 'var(--c-ghost)', borderBottom: '0.5px solid var(--c-border)' }}>
                      <span className="text-[11px] font-semibold" style={{ color: 'var(--c-text)' }}>{moLabel}</span>
                      <span className="text-[10px]" style={{ color: 'var(--c-faint)' }}>
                        Opening: {fmt(moOpen)}
                      </span>
                    </div>
                    <table className="w-full text-xs">
                      <tbody>
                        {mRows.map((row, i) => (
                          <tr key={i} style={{ borderBottom: '0.5px solid var(--c-border)' }}>
                            <td className="px-3 py-2 whitespace-nowrap w-[72px]" style={{ color: 'var(--c-faint)' }}>
                              {fmtDate(row.date)}
                            </td>
                            <td className="px-3 py-2" style={{ color: 'var(--c-text)' }}>{row.particulars}</td>
                            <td className="px-3 py-2 text-right w-20 font-medium"
                              style={{ color: row.debit > 0 ? '#E24B4A' : 'var(--c-faint)' }}>
                              {row.debit > 0 ? fmt(row.debit) : '—'}
                            </td>
                            <td className="px-3 py-2 text-right w-20 font-medium"
                              style={{ color: row.credit > 0 ? '#1D9E75' : 'var(--c-faint)' }}>
                              {row.credit > 0 ? fmt(row.credit) : '—'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    <div className="flex items-center justify-between px-3 py-2"
                      style={{ background: 'var(--c-ghost)', borderTop: '0.5px solid var(--c-border)' }}>
                      <span className="text-[10px] font-semibold" style={{ color: 'var(--c-text)' }}>Closing Balance</span>
                      <span className="text-[12px] font-bold"
                        style={{ color: closingBal > 0 ? '#E24B4A' : '#1D9E75' }}>
                        {fmt(closingBal)}
                      </span>
                    </div>
                  </Card>
                )
              })}
            </div>
          ) : (
            <Card className="overflow-x-auto p-0">
              <table className="w-full text-xs">
                <thead>
                  <tr style={{ borderBottom: '0.5px solid var(--c-border)' }}>
                    {['Date','Particulars','Purchase (Dr)','Payment (Cr)','Balance'].map(h => (
                      <th key={h} className="px-3 py-2 text-left font-medium" style={{ color: 'var(--c-faint)' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {range && (
                    <tr style={{ borderBottom: '0.5px solid var(--c-border)' }}>
                      <td colSpan={4} className="px-3 py-2 italic" style={{ color: 'var(--c-faint)' }}>Opening Balance</td>
                      <td className="px-3 py-2 text-right font-bold" style={{ color: openingBal > 0 ? '#E24B4A' : '#1D9E75' }}>{fmt(openingBal)}</td>
                    </tr>
                  )}
                  {ledgerWithBal.map((row, i) => (
                    <tr key={i} style={{ borderBottom: '0.5px solid var(--c-border)' }}>
                      <td className="px-3 py-2 whitespace-nowrap" style={{ color: 'var(--c-faint)' }}>{fmtDate(row.date)}</td>
                      <td className="px-3 py-2" style={{ color: 'var(--c-text)' }}>{row.particulars}</td>
                      <td className="px-3 py-2 text-right" style={{ color: '#E24B4A' }}>
                        {row.debit > 0 ? fmt(row.debit) : '—'}
                      </td>
                      <td className="px-3 py-2 text-right" style={{ color: '#1D9E75' }}>
                        {row.credit > 0 ? fmt(row.credit) : '—'}
                      </td>
                      <td className="px-3 py-2 text-right font-bold"
                        style={{ color: row.balance > 0 ? '#E24B4A' : '#1D9E75' }}>
                        {fmt(row.balance)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          )}
        </>
      ) : (
        <Card>
          <div className="text-center text-xs py-4" style={{ color: 'var(--c-faint)' }}>
            No purchases recorded for this vendor in this period.
          </div>
        </Card>
      )}
    </div>
  )
}

// ── Tab: Buyer Khata (Sundry Debtors — accounts receivable) ────────────────────
function BuyersTab({ sales, buyers, harvestSessions, cropCycles, cropMaster, fy }) {
  const navigate = useNavigate()
  const [activeKey, setActiveKey] = useState(null) // null = overview list
  const cropSales = sales.filter(s => s.buyerName)

  const sessionById = Object.fromEntries(harvestSessions.map(h => [h.id, h]))
  const cycleById    = Object.fromEntries(cropCycles.map(c => [c.id, c]))
  const cropById     = Object.fromEntries(cropMaster.map(c => [c.id, c]))
  const cropPlotLabel = (sale) => {
    const session = sessionById[sale.sessionId]
    const cycle   = session && cycleById[session.cycleId]
    if (!cycle) return null
    const crop = cropById[cycle.cropId]
    return [cycle.plotLabel, crop?.name].filter(Boolean).join(' — ') || null
  }

  // Every registered buyer appears even with zero sales (mirrors Party
  // Ledger, which lists every vendor regardless of purchase history).
  // Free-text buyers (e.g. "Local Market") only appear once they have a
  // sale, grouped by the typed name since they have no master record.
  const groups = {}
  buyers.filter(b => b.isActive !== false).forEach(b => {
    groups[b.id] = { key: b.id, name: b.name, rows: [] }
  })
  cropSales.forEach(s => {
    const key = s.buyerId || `name:${s.buyerName.trim().toLowerCase()}`
    if (!groups[key]) groups[key] = { key, name: s.buyerName, rows: [] }
    groups[key].rows.push(s)
  })
  const parties = Object.values(groups)

  // Overview: Balance Due is all-time (a point-in-time fact — what they owe
  // right now); Sold/Received are scoped to the selected financial year.
  const overview = parties.map(p => {
    const soldAllTime     = p.rows.reduce((s, r) => s + Number(r.netAmount || 0), 0)
    const receivedAllTime = p.rows.filter(r => r.paymentStatus === 'paid').reduce((s, r) => s + Number(r.netAmount || 0), 0)
    return {
      party: p,
      balanceDue: soldAllTime - receivedAllTime,
      soldFY:     p.rows.filter(r => inFY(r.date, fy)).reduce((s, r) => s + Number(r.netAmount || 0), 0),
      receivedFY: p.rows.filter(r => r.paymentStatus === 'paid' && inFY(r.paymentDate || r.date, fy)).reduce((s, r) => s + Number(r.netAmount || 0), 0),
    }
  }).sort((a, b) => b.balanceDue - a.balanceDue)

  const active = parties.find(p => p.key === activeKey)
  const rowsAll = active ? [...active.rows].sort((a, b) => new Date(b.date) - new Date(a.date)) : []
  const rows    = active ? rowsAll.filter(r => inFY(r.date, fy)) : []
  const soldFY      = rows.reduce((s, r) => s + Number(r.netAmount || 0), 0)
  const receivedFY  = rows.filter(r => r.paymentStatus === 'paid' && inFY(r.paymentDate || r.date, fy)).reduce((s, r) => s + Number(r.netAmount || 0), 0)
  const balanceDueAllTime = active
    ? rowsAll.reduce((s, r) => s + Number(r.netAmount || 0), 0) - rowsAll.filter(r => r.paymentStatus === 'paid').reduce((s, r) => s + Number(r.netAmount || 0), 0)
    : 0

  const header = (
    <div className="flex items-center justify-between">
      <div>
        <div className="text-xs font-semibold" style={{ color: 'var(--c-text)' }}>Sundry Debtors (Buyer Khata)</div>
        <div className="text-[10px]" style={{ color: 'var(--c-faint)' }}>
          What each buyer owes you — amounts are net of commission/freight
        </div>
      </div>
      <button onClick={() => navigate('/admin')}
        className="flex items-center gap-1 px-2.5 py-1.5 rounded-full text-xs font-medium shrink-0"
        style={{ background: 'var(--c-ghost)', color: 'var(--c-muted)' }}>
        <Plus size={11} /> Add Buyer
      </button>
    </div>
  )

  // ── Overview: every buyer, row-wise, worst balance first ───────────────────
  if (!active) {
    return (
      <div className="flex flex-col gap-3 pt-3">
        {header}
        {parties.length === 0 ? (
          <Card>
            <div className="text-center text-xs py-6" style={{ color: 'var(--c-faint)' }}>
              No buyers or sales recorded yet. Add a buyer, or one appears here as soon as you record a sale on the Harvest page.
            </div>
          </Card>
        ) : (
          <Card className="overflow-x-auto p-0">
            <table className="w-full text-xs">
              <thead>
                <tr style={{ borderBottom: '0.5px solid var(--c-border)' }}>
                  {['Buyer','Sold','Received','Balance Due'].map(h => (
                    <th key={h} className="px-3 py-2 text-left font-medium" style={{ color: 'var(--c-faint)' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {overview.map(({ party, soldFY: sFY, receivedFY: rFY, balanceDue }) => (
                  <tr key={party.key} onClick={() => setActiveKey(party.key)}
                    className="cursor-pointer hover:bg-[var(--c-ghost)] transition-colors"
                    style={{ borderBottom: '0.5px solid var(--c-border)' }}>
                    <td className="px-3 py-2.5 font-medium" style={{ color: 'var(--c-text)' }}>{party.name}</td>
                    <td className="px-3 py-2.5" style={{ color: 'var(--c-text)' }}>{fmt(sFY)}</td>
                    <td className="px-3 py-2.5" style={{ color: '#1D9E75' }}>{fmt(rFY)}</td>
                    <td className="px-3 py-2.5 font-bold" style={{ color: balanceDue > 0 ? '#BA7517' : '#1D9E75' }}>{fmt(balanceDue)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        )}
        <p className="text-[10px] text-center" style={{ color: 'var(--c-faint)' }}>
          Sold/Received reflect the selected period · Balance Due is always as of today · Tap a buyer for details
        </p>
      </div>
    )
  }

  // ── Detail: one buyer's sales for the selected period ──────────────────────
  return (
    <div className="flex flex-col gap-3 pt-3">
      <div className="flex items-center gap-2">
        <button onClick={() => setActiveKey(null)} className="text-xs px-2 py-1 rounded-lg"
          style={{ background: 'var(--c-ghost)', color: 'var(--c-muted)' }}>
          ← All Buyers
        </button>
        <div className="text-xs font-semibold" style={{ color: 'var(--c-text)' }}>{active.name}</div>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <Card className="p-3">
          <div className="text-[9px] uppercase tracking-wider mb-1" style={{ color: 'var(--c-faint)' }}>Sold</div>
          <div className="text-sm font-bold" style={{ color: 'var(--c-text)' }}>{fmt(soldFY)}</div>
        </Card>
        <Card className="p-3">
          <div className="text-[9px] uppercase tracking-wider mb-1" style={{ color: 'var(--c-faint)' }}>Received</div>
          <div className="text-sm font-bold" style={{ color: '#1D9E75' }}>{fmt(receivedFY)}</div>
        </Card>
        <Card className="p-3">
          <div className="text-[9px] uppercase tracking-wider mb-1" style={{ color: 'var(--c-faint)' }}>Balance Due</div>
          <div className="text-sm font-bold" style={{ color: balanceDueAllTime > 0 ? '#BA7517' : '#1D9E75' }}>{fmt(balanceDueAllTime)}</div>
        </Card>
      </div>

      {balanceDueAllTime > 0 && (
        <p className="text-[10px] text-center py-2 rounded-xl" style={{ color: '#BA7517', background: 'rgba(186,117,23,0.1)' }}>
          Mark payment from the Harvest page against the specific sale to clear this balance
        </p>
      )}

      <Card className="overflow-x-auto p-0">
        <table className="w-full text-xs">
          <thead>
            <tr style={{ borderBottom: '0.5px solid var(--c-border)' }}>
              {['Date','Plot / Crop','Qty (qtl)','Rate','Net Amount','Status'].map(h => (
                <th key={h} className="px-3 py-2 text-left font-medium" style={{ color: 'var(--c-faint)' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr><td colSpan={6} className="px-3 py-4 text-center" style={{ color: 'var(--c-faint)' }}>
                No sales recorded for this buyer in this period.
              </td></tr>
            )}
            {rows.map(r => {
              const paid = r.paymentStatus === 'paid'
              return (
                <tr key={r.id} style={{ borderBottom: '0.5px solid var(--c-border)' }}>
                  <td className="px-3 py-2 whitespace-nowrap" style={{ color: 'var(--c-faint)' }}>{fmtDate(r.date)}</td>
                  <td className="px-3 py-2" style={{ color: 'var(--c-text)' }}>{cropPlotLabel(r) || '—'}</td>
                  <td className="px-3 py-2" style={{ color: 'var(--c-text)' }}>{Number(r.qtyQtl || 0).toFixed(2)}</td>
                  <td className="px-3 py-2" style={{ color: 'var(--c-text)' }}>₹{r.ratePerQtl}</td>
                  <td className="px-3 py-2 font-bold" style={{ color: 'var(--c-text)' }}>{fmt(r.netAmount)}</td>
                  <td className="px-3 py-2">
                    <span className="px-2 py-0.5 rounded-full text-[9px] font-semibold"
                      style={{
                        background: paid ? 'rgba(29,158,117,0.15)' : 'rgba(186,117,23,0.15)',
                        color:      paid ? '#1D9E75'               : '#BA7517',
                      }}>
                      {paid ? 'Received' : 'Pending'}
                    </span>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </Card>
    </div>
  )
}

// ── Tab: Expense Accounts ─────────────────────────────────────────────────────
function ExpensesTab({ expenseLedger, vendorPayments = [] }) {
  // Group by expense_type / category.
  // NOTE: vendor_purchase rows never carry a real is_paid flag — vendor
  // payments are lump-sum against a vendor's running balance, not matched to
  // one specific purchase invoice. So for that category we use the actual
  // total paid to vendors (real cash, from vendor_payments) instead of the
  // per-row flag — otherwise "Paid" would always show ₹0 even after a vendor
  // is fully settled.
  const totalVendorPaid = vendorPayments.reduce((s, p) => s + Number(p.amount || 0), 0)
  const grouped = {}
  expenseLedger.forEach(row => {
    const key = row.expense_type || row.category || 'other'
    if (!grouped[key]) grouped[key] = { total: 0, paid: 0, rows: [] }
    grouped[key].total += Number(row.amount || 0)
    if (row.is_paid) grouped[key].paid += Number(row.amount || 0)
    grouped[key].rows.push(row)
  })
  if (grouped.vendor_purchase) {
    grouped.vendor_purchase.paid = Math.min(grouped.vendor_purchase.total, totalVendorPaid)
  }

  const [expanded, setExpanded] = useState(null)

  return (
    <div className="flex flex-col gap-3 pt-3">
      <div>
        <div className="text-xs font-semibold" style={{ color: 'var(--c-text)' }}>Expense Accounts</div>
        <div className="text-[10px]" style={{ color: 'var(--c-faint)' }}>
          Total incurred vs paid, by category
        </div>
      </div>

      {Object.entries(grouped).map(([key, data]) => {
        const pending = data.total - data.paid
        const isOpen = expanded === key
        return (
          <Card key={key} className="p-0">
            <button className="w-full flex items-center justify-between px-4 py-3"
              onClick={() => setExpanded(isOpen ? null : key)}>
              <div className="flex flex-col items-start gap-0.5">
                <span className="text-xs font-medium" style={{ color: 'var(--c-text)' }}>
                  {CATEGORY_LABELS[key] || key}
                </span>
                <span className="text-[10px]" style={{ color: 'var(--c-faint)' }}>
                  {data.rows.length} entries · Pending: {fmt(pending)}
                </span>
              </div>
              <div className="flex items-center gap-3">
                <div className="text-right">
                  <div className="text-xs font-bold" style={{ color: '#E24B4A' }}>{fmt(data.total)}</div>
                  <div className="text-[9px]" style={{ color: '#1D9E75' }}>Paid: {fmt(data.paid)}</div>
                </div>
                <ChevronDown size={14} style={{
                  color: 'var(--c-faint)',
                  transform: isOpen ? 'rotate(180deg)' : 'none',
                  transition: 'transform 0.2s',
                }} />
              </div>
            </button>

            {isOpen && (
              <div style={{ borderTop: '0.5px solid var(--c-border)' }}>
                <table className="w-full text-xs">
                  <thead>
                    <tr style={{ borderBottom: '0.5px solid var(--c-border)' }}>
                      {['Date','Description','Amount','Status'].map(h => (
                        <th key={h} className="px-3 py-2 text-left font-medium" style={{ color: 'var(--c-faint)' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {data.rows.slice(0, 20).map((row, i) => (
                      <tr key={i} style={{ borderBottom: '0.5px solid var(--c-border)' }}>
                        <td className="px-3 py-2 whitespace-nowrap" style={{ color: 'var(--c-faint)' }}>{fmtDate(row.entry_date)}</td>
                        <td className="px-3 py-2" style={{ color: 'var(--c-text)' }}>{row.description}</td>
                        <td className="px-3 py-2 font-medium" style={{ color: 'var(--c-text)' }}>{fmt(row.amount)}</td>
                        <td className="px-3 py-2">
                          {key === 'vendor_purchase' ? (
                            <span className="text-[9px]" style={{ color: 'var(--c-faint)' }}>See Party Ledger</span>
                          ) : (
                            <span className={`px-2 py-0.5 rounded-full text-[9px] font-semibold`}
                              style={{
                                background: row.is_paid ? '#1D9E75/15' : '#BA7517/15',
                                color:      row.is_paid ? '#1D9E75'    : '#BA7517',
                              }}>
                              {row.is_paid ? 'Paid' : 'Pending'}
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        )
      })}

      {Object.keys(grouped).length === 0 && (
        <Card>
          <div className="text-center text-xs py-6" style={{ color: 'var(--c-faint)' }}>
            No expense records found.
          </div>
        </Card>
      )}
    </div>
  )
}

// ── Tab: P&L ──────────────────────────────────────────────────────────────────
function PnlTab({ totalIncome, totalExpenses, livestockPnl, cropPnl }) {
  const net = totalIncome - totalExpenses
  return (
    <div className="flex flex-col gap-3 pt-3">
      {/* Overall */}
      <Card>
        <div className="text-xs font-semibold mb-3" style={{ color: 'var(--c-text)' }}>Overall P&L</div>
        <div className="flex justify-between items-center py-2" style={{ borderBottom: '0.5px solid var(--c-border)' }}>
          <div className="flex items-center gap-2">
            <TrendingUp size={14} color="#1D9E75" />
            <span className="text-xs" style={{ color: 'var(--c-text)' }}>Total Income</span>
          </div>
          <span className="text-xs font-bold" style={{ color: '#1D9E75' }}>{fmt(totalIncome)}</span>
        </div>
        <div className="flex justify-between items-center py-2" style={{ borderBottom: '0.5px solid var(--c-border)' }}>
          <div className="flex items-center gap-2">
            <TrendingDown size={14} color="#E24B4A" />
            <span className="text-xs" style={{ color: 'var(--c-text)' }}>Total Expenses</span>
          </div>
          <span className="text-xs font-bold" style={{ color: '#E24B4A' }}>{fmt(totalExpenses)}</span>
        </div>
        <div className="flex justify-between items-center pt-2">
          <span className="text-xs font-semibold" style={{ color: 'var(--c-text)' }}>
            Net {net >= 0 ? 'Profit' : 'Loss'}
          </span>
          <span className="text-sm font-bold" style={{ color: net >= 0 ? '#1D9E75' : '#E24B4A' }}>
            {fmt(Math.abs(net))} {net < 0 ? '(Loss)' : ''}
          </span>
        </div>
      </Card>

      {/* Livestock P&L */}
      {livestockPnl.length > 0 && (
        <Card className="p-0">
          <div className="px-4 pt-3 pb-2 text-xs font-semibold" style={{ color: 'var(--c-text)' }}>
            Livestock — Individual P&L
          </div>
          <table className="w-full text-xs">
            <thead>
              <tr style={{ borderBottom: '0.5px solid var(--c-border)' }}>
                {['Animal','Cost','Revenue','Profit/Loss'].map(h => (
                  <th key={h} className="px-3 py-2 text-left font-medium" style={{ color: 'var(--c-faint)' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {livestockPnl.map((row, i) => (
                <tr key={i} style={{ borderBottom: '0.5px solid var(--c-border)' }}>
                  <td className="px-3 py-2">
                    <div className="font-medium" style={{ color: 'var(--c-text)' }}>{row.animal_name || '—'}</div>
                    <div className="text-[9px]" style={{ color: 'var(--c-faint)' }}>{row.species}</div>
                  </td>
                  <td className="px-3 py-2" style={{ color: '#E24B4A' }}>{fmt(row.total_cost)}</td>
                  <td className="px-3 py-2" style={{ color: '#1D9E75' }}>{fmt(row.total_revenue)}</td>
                  <td className="px-3 py-2 font-bold"
                    style={{ color: Number(row.profit_loss) >= 0 ? '#1D9E75' : '#E24B4A' }}>
                    {fmt(Math.abs(row.profit_loss))}
                    {Number(row.profit_loss) < 0 ? ' ▼' : ' ▲'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      {/* Crop P&L */}
      {cropPnl.length > 0 && (
        <Card className="p-0">
          <div className="px-4 pt-3 pb-2 text-xs font-semibold" style={{ color: 'var(--c-text)' }}>
            Crop Cycles — P&L
          </div>
          <table className="w-full text-xs">
            <thead>
              <tr style={{ borderBottom: '0.5px solid var(--c-border)' }}>
                {['Plot / Crop','Cost','Revenue','Margin'].map(h => (
                  <th key={h} className="px-3 py-2 text-left font-medium" style={{ color: 'var(--c-faint)' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {cropPnl.map((row, i) => (
                <tr key={i} style={{ borderBottom: '0.5px solid var(--c-border)' }}>
                  <td className="px-3 py-2">
                    <div className="font-medium" style={{ color: 'var(--c-text)' }}>{row.plot_name}</div>
                    <div className="text-[9px]" style={{ color: 'var(--c-faint)' }}>
                      {row.crop_name} · {row.season}
                    </div>
                  </td>
                  <td className="px-3 py-2" style={{ color: '#E24B4A' }}>{fmt(row.total_cost)}</td>
                  <td className="px-3 py-2" style={{ color: '#1D9E75' }}>{fmt(row.revenue)}</td>
                  <td className="px-3 py-2">
                    <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold`}
                      style={{
                        background: Number(row.margin_pct) >= 0 ? '#1D9E75/15' : '#E24B4A/15',
                        color:      Number(row.margin_pct) >= 0 ? '#1D9E75'    : '#E24B4A',
                      }}>
                      {row.margin_pct}%
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      {livestockPnl.length === 0 && cropPnl.length === 0 && (
        <Card>
          <div className="text-center text-xs py-4" style={{ color: 'var(--c-faint)' }}>
            No livestock or crop cycle data available for P&L.
          </div>
        </Card>
      )}
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function LedgerPage() {
  const {
    vendors, vendorBalances, vendorPayments, cashBook, sales, buyers,
    harvestSessions, cropCycles, cropMaster,
    incomeLedger, expenseLedger, monthlySummary: monthlySummaryAll, livestockPnl, cropPnl,
    cropResiduals, recordResidualSale,
    loadLedgerData, addOwnerCashEntry, addVendorPayment, addVendor,
  } = useAppStore()

  const canManage = isManager(getActiveFarmRole())

  const [tab, setTab] = useState('summary')
  const [fy, setFy] = useState(currentFY())
  const [loading, setLoading] = useState(true)
  const [selectedVendor, setSelectedVendor] = useState(null)
  const [showAddCash, setShowAddCash] = useState(false)
  const [showPayVendor, setShowPayVendor] = useState(false)
  const [showAddVendor, setShowAddVendor] = useState(false)

  useEffect(() => {
    loadLedgerData().finally(() => setLoading(false))
  }, [])

  // Balance-sheet facts (cash in hand, what's owed either way) are always
  // as-of-today — they must NOT be scoped to the selected financial year,
  // or "Current Cash Balance" / "Balance Due" would misstate reality.
  const cashBalance = cashBook.length > 0
    ? Number(cashBook[cashBook.length - 1].running_balance)
    : 0
  const totalVendorDues = vendorBalances.reduce((s, v) => s + Math.max(0, Number(v.balance_due || 0)), 0)
  const totalReceivables = sales
    .filter(s => s.paymentStatus !== 'paid')
    .reduce((s, r) => s + Number(r.netAmount || 0), 0)

  // P&L facts (income, expenses, profit) are period-based — scoped to the
  // selected financial year.
  const incomeLedgerFY   = incomeLedger.filter(r => inFY(r.entry_date, fy))
  const expenseLedgerFY  = expenseLedger.filter(r => inFY(r.entry_date, fy))
  const vendorPaymentsFY = vendorPayments.filter(p => inFY(p.payment_date, fy))
  const cropPnlFY        = cropPnl.filter(r => inFY(r.sow_date, fy))
  const monthlySummary   = monthlySummaryAll.filter(m => inFY(m.month, fy))
  const totalIncome    = incomeLedgerFY.reduce((s, r) => s + Number(r.amount || 0), 0)
  const totalExpenses  = expenseLedgerFY.reduce((s, r) => s + Number(r.amount || 0), 0)

  // Cash Book: list only the period's transactions, but carry forward an
  // opening balance from everything before the period started so the
  // running balance shown is still correct, not reset to zero.
  const range = fyRange(fy)
  const cashBookOpening = range
    ? cashBook.filter(r => r.entry_date < range.start).reduce((s, r) => s + (r.direction === 'in' ? Number(r.amount) : -Number(r.amount)), 0)
    : 0
  const cashBookPeriodRows = range ? cashBook.filter(r => r.entry_date >= range.start && r.entry_date <= range.end) : cashBook
  let _cashRunning = cashBookOpening
  const cashBookFY = cashBookPeriodRows.map(r => {
    _cashRunning += r.direction === 'in' ? Number(r.amount) : -Number(r.amount)
    return { ...r, running_balance: _cashRunning }
  })

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full" style={{ background: 'var(--c-bg)' }}>
        <div className="text-center">
          <div className="text-2xl mb-2">📒</div>
          <div className="text-xs" style={{ color: 'var(--c-faint)' }}>Loading ledger…</div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full overflow-hidden" style={{ background: 'var(--c-bg)' }}>
      {/* Header */}
      <div className="shrink-0 flex items-center gap-2 px-4 pt-4 pb-2">
        <BookOpen size={17} color="#1D9E75" />
        <h1 className="font-semibold text-sm" style={{ color: 'var(--c-text)' }}>Accounts Ledger</h1>
      </div>

      {/* Tabs */}
      <div className="shrink-0 flex gap-1.5 px-4 pb-2 overflow-x-auto"
        style={{ msOverflowStyle: 'none', scrollbarWidth: 'none' }}>
        {TABS.map(t => (
          <button key={t.id}
            onClick={() => setTab(t.id)}
            className="shrink-0 px-3 py-1.5 rounded-full text-xs font-medium transition-colors"
            style={{
              background: tab === t.id ? '#1D9E75' : 'var(--c-ghost)',
              color:      tab === t.id ? '#fff'    : 'var(--c-muted)',
            }}>
            {t.label}
          </button>
        ))}
      </div>

      {/* Financial year selector — applies to every tab */}
      <div className="shrink-0 flex items-center gap-2 px-4 pb-3">
        <span className="text-[10px] shrink-0" style={{ color: 'var(--c-faint)' }}>Financial Year:</span>
        <select
          value={fy}
          onChange={e => setFy(e.target.value)}
          className="px-2.5 py-1.5 rounded-xl text-xs font-medium outline-none"
          style={{ background: 'var(--c-ghost)', color: 'var(--c-text)', border: '0.5px solid var(--c-border)' }}>
          {fyOptions().map(opt => (
            <option key={opt} value={opt}>{opt === 'all' ? 'All Time' : `FY ${fyLabel(opt)}`}</option>
          ))}
        </select>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-4 pb-20">
        {tab === 'summary'  && (
          <SummaryTab
            cashBalance={cashBalance}
            totalIncome={totalIncome}
            totalExpenses={totalExpenses}
            totalVendorDues={totalVendorDues}
            totalReceivables={totalReceivables}
            monthlySummary={monthlySummary}
          />
        )}
        {tab === 'cashbook' && (
          <CashBookTab
            cashBook={cashBookFY}
            openingBalance={cashBookOpening}
            showOpening={fy !== 'all'}
            onAdd={() => setShowAddCash(true)}
          />
        )}
        {tab === 'income'   && <IncomeTab incomeLedger={incomeLedgerFY} cropResiduals={cropResiduals} onRecordSale={recordResidualSale} />}
        {tab === 'vendors'  && (
          <VendorTab
            vendors={vendors}
            selectedVendor={selectedVendor}
            setSelectedVendor={setSelectedVendor}
            onPay={() => setShowPayVendor(true)}
            onAddVendor={() => setShowAddVendor(true)}
            canPay={canManage}
            fy={fy}
          />
        )}
        {tab === 'buyers'   && (
          <BuyersTab
            sales={sales} buyers={buyers}
            harvestSessions={harvestSessions} cropCycles={cropCycles} cropMaster={cropMaster}
            fy={fy}
          />
        )}
        {tab === 'expenses' && (
          <ExpensesTab expenseLedger={expenseLedgerFY} vendorPayments={vendorPaymentsFY} />
        )}
        {tab === 'pnl'      && (
          <PnlTab
            totalIncome={totalIncome}
            totalExpenses={totalExpenses}
            livestockPnl={livestockPnl}
            cropPnl={cropPnlFY}
          />
        )}
      </div>

      {/* Modals */}
      {showAddCash    && <AddCashModal   onClose={() => setShowAddCash(false)}    onSave={addOwnerCashEntry} />}
      {showPayVendor  && <PayVendorModal vendors={vendors} selectedVendor={selectedVendor} onClose={() => setShowPayVendor(false)} onSave={addVendorPayment} />}
      {showAddVendor  && <AddVendorModal onClose={() => setShowAddVendor(false)}  onSave={addVendor} />}
    </div>
  )
}

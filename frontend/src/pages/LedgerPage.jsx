import React, { useEffect, useState } from 'react'
import { useAppStore } from '../store'
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

const CATEGORY_LABELS = {
  feed:              'Feed & Fodder',
  veterinary:        'Veterinary',
  labour:            'Daily Labour',
  salary:            'Staff Salary',
  inventory_purchase:'Inventory Purchase',
  farm_expense:      'General Expenses',
  maintenance:       'Maintenance',
  fuel:              'Fuel',
  administrative:    'Administrative',
  other:             'Other',
}

const TABS = [
  { id: 'summary',  label: 'Summary'      },
  { id: 'cashbook', label: 'Cash Book'    },
  { id: 'vendors',  label: 'Party Ledger' },
  { id: 'expenses', label: 'Expenses'     },
  { id: 'pnl',      label: 'P & L'        },
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
function SummaryTab({ cashBalance, totalIncome, totalExpenses, totalVendorDues, monthlySummary }) {
  const netProfit = totalIncome - totalExpenses
  const chartData = monthlySummary.slice(0, 6).reverse().map(m => ({
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
function CashBookTab({ cashBook, onAdd }) {
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

      {rows.length === 0 ? (
        <Card>
          <div className="text-center text-xs py-6" style={{ color: 'var(--c-faint)' }}>
            No cash entries yet. Add the owner's first cash injection to start.
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

// ── Tab: Party Ledger (Vendor Khatas) ─────────────────────────────────────────
function VendorTab({ vendors, vendorBalances, selectedVendor, setSelectedVendor, onPay, onAddVendor }) {
  const [activeId, setActiveId] = useState(vendorBalances[0]?.vendor_id || null)
  const { vendorPayments, purchases } = useAppStore()

  const activeBalance = vendorBalances.find(v => v.vendor_id === activeId)

  // Build ledger for the active vendor from purchases + payments
  const vendorPurchases = purchases
    .filter(p => {
      const v = vendors.find(x => x.id === activeId)
      if (!v) return false
      return p.vendor?.toLowerCase() === v.name.toLowerCase() ||
             /* vendor_id match if present */ false
    })

  const vendorPmts = vendorPayments.filter(p => p.vendor_id === activeId)

  // Combined ledger entries for this vendor
  const ledgerRows = [
    ...vendorPurchases.map(p => ({
      date: p.date, type: 'purchase',
      particulars: `Purchase — ${p.vendor || 'Vendor'}`,
      debit: p.totalCost, credit: 0,
    })),
    ...vendorPmts.map(p => ({
      date: p.payment_date, type: 'payment',
      particulars: p.notes || 'Cash Payment',
      debit: 0, credit: p.amount,
    })),
  ].sort((a, b) => new Date(a.date) - new Date(b.date))

  // Running balance
  let running = 0
  const ledgerWithBal = ledgerRows.map(r => {
    running += Number(r.debit) - Number(r.credit)
    return { ...r, balance: running }
  })

  return (
    <div className="flex flex-col gap-3 pt-3">
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

      {/* Vendor selector pills */}
      <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none">
        {vendorBalances.map(v => (
          <button key={v.vendor_id}
            onClick={() => setActiveId(v.vendor_id)}
            className="shrink-0 px-3 py-1.5 rounded-full text-xs font-medium transition-colors"
            style={{
              background: activeId === v.vendor_id ? '#1D9E75' : 'var(--c-ghost)',
              color:      activeId === v.vendor_id ? '#fff'    : 'var(--c-muted)',
            }}>
            {v.vendor_name}
          </button>
        ))}
        {vendors.filter(v => !vendorBalances.find(b => b.vendor_id === v.id)).map(v => (
          <button key={v.id}
            onClick={() => setActiveId(v.id)}
            className="shrink-0 px-3 py-1.5 rounded-full text-xs font-medium transition-colors"
            style={{
              background: activeId === v.id ? '#1D9E75' : 'var(--c-ghost)',
              color:      activeId === v.id ? '#fff'    : 'var(--c-muted)',
            }}>
            {v.name}
          </button>
        ))}
      </div>

      {activeBalance ? (
        <>
          {/* Summary cards for this vendor */}
          <div className="grid grid-cols-3 gap-2">
            <Card className="p-3">
              <div className="text-[9px] uppercase tracking-wider mb-1" style={{ color: 'var(--c-faint)' }}>Purchased</div>
              <div className="text-sm font-bold" style={{ color: 'var(--c-text)' }}>{fmt(activeBalance.total_purchased)}</div>
            </Card>
            <Card className="p-3">
              <div className="text-[9px] uppercase tracking-wider mb-1" style={{ color: 'var(--c-faint)' }}>Paid</div>
              <div className="text-sm font-bold" style={{ color: '#1D9E75' }}>{fmt(activeBalance.total_paid)}</div>
            </Card>
            <Card className="p-3">
              <div className="text-[9px] uppercase tracking-wider mb-1" style={{ color: 'var(--c-faint)' }}>Balance Due</div>
              <div className="text-sm font-bold"
                style={{ color: Number(activeBalance.balance_due) > 0 ? '#E24B4A' : '#1D9E75' }}>
                {fmt(activeBalance.balance_due)}
              </div>
            </Card>
          </div>

          {Number(activeBalance.balance_due) > 0 && (
            <button onClick={() => { setSelectedVendor(activeBalance); onPay() }}
              className="flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold text-white"
              style={{ background: '#1D9E75' }}>
              <CheckCircle size={14} /> Record Payment to {activeBalance.vendor_name}
            </button>
          )}

          {ledgerWithBal.length > 0 ? (
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
          ) : (
            <Card>
              <div className="text-center text-xs py-4" style={{ color: 'var(--c-faint)' }}>
                No purchases recorded for this vendor yet. Assign vendor when recording purchases.
              </div>
            </Card>
          )}
        </>
      ) : (
        <Card>
          <div className="text-center text-xs py-6" style={{ color: 'var(--c-faint)' }}>
            {vendors.length === 0
              ? 'No vendors set up. Add a vendor to start tracking.'
              : 'Select a vendor above to view their ledger.'}
          </div>
        </Card>
      )}
    </div>
  )
}

// ── Tab: Expense Accounts ─────────────────────────────────────────────────────
function ExpensesTab({ expenseLedger }) {
  // Group by expense_type / category
  const grouped = {}
  expenseLedger.forEach(row => {
    const key = row.expense_type || row.category || 'other'
    if (!grouped[key]) grouped[key] = { total: 0, paid: 0, rows: [] }
    grouped[key].total += Number(row.amount || 0)
    if (row.is_paid) grouped[key].paid += Number(row.amount || 0)
    grouped[key].rows.push(row)
  })

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
                          <span className={`px-2 py-0.5 rounded-full text-[9px] font-semibold`}
                            style={{
                              background: row.is_paid ? '#1D9E75/15' : '#BA7517/15',
                              color:      row.is_paid ? '#1D9E75'    : '#BA7517',
                            }}>
                            {row.is_paid ? 'Paid' : 'Pending'}
                          </span>
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
    vendors, vendorBalances, cashBook,
    incomeLedger, expenseLedger, monthlySummary, livestockPnl, cropPnl,
    loadLedgerData, addOwnerCashEntry, addVendorPayment, addVendor,
  } = useAppStore()

  const [tab, setTab] = useState('summary')
  const [loading, setLoading] = useState(true)
  const [selectedVendor, setSelectedVendor] = useState(null)
  const [showAddCash, setShowAddCash] = useState(false)
  const [showPayVendor, setShowPayVendor] = useState(false)
  const [showAddVendor, setShowAddVendor] = useState(false)

  useEffect(() => {
    loadLedgerData().finally(() => setLoading(false))
  }, [])

  const cashBalance = cashBook.length > 0
    ? Number(cashBook[cashBook.length - 1].running_balance)
    : 0
  const totalIncome    = incomeLedger.reduce((s, r) => s + Number(r.amount || 0), 0)
  const totalExpenses  = expenseLedger.reduce((s, r) => s + Number(r.amount || 0), 0)
  const totalVendorDues = vendorBalances.reduce((s, v) => s + Math.max(0, Number(v.balance_due || 0)), 0)

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
      <div className="shrink-0 flex gap-1.5 px-4 pb-3 overflow-x-auto"
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

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-4 pb-20">
        {tab === 'summary'  && (
          <SummaryTab
            cashBalance={cashBalance}
            totalIncome={totalIncome}
            totalExpenses={totalExpenses}
            totalVendorDues={totalVendorDues}
            monthlySummary={monthlySummary}
          />
        )}
        {tab === 'cashbook' && (
          <CashBookTab
            cashBook={cashBook}
            onAdd={() => setShowAddCash(true)}
          />
        )}
        {tab === 'vendors'  && (
          <VendorTab
            vendors={vendors}
            vendorBalances={vendorBalances}
            selectedVendor={selectedVendor}
            setSelectedVendor={setSelectedVendor}
            onPay={() => setShowPayVendor(true)}
            onAddVendor={() => setShowAddVendor(true)}
          />
        )}
        {tab === 'expenses' && (
          <ExpensesTab expenseLedger={expenseLedger} />
        )}
        {tab === 'pnl'      && (
          <PnlTab
            totalIncome={totalIncome}
            totalExpenses={totalExpenses}
            livestockPnl={livestockPnl}
            cropPnl={cropPnl}
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

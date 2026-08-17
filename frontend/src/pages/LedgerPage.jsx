import React, { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAppStore } from '../store'
import { useTreeStore } from '../store/trees'
import { isManager, isAdmin, getActiveFarmRole } from '../store/auth'
import { isPet } from './livestock/ui'
import CashFlowTab from './ledger/CashFlowTab'
import { buildCashFlow } from '../lib/cashflow'
import {
  isMonth, fyLabel, periodRange, inPeriod, fyOptions, fyMonths,
  monthLabel, periodLabel, periodSlug,
} from '../lib/period'
import { summarizeCropPnl } from '../lib/farmOverview'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend,
} from 'recharts'
import {
  BookOpen, Plus, Wallet, AlertCircle, TrendingUp, TrendingDown,
  ChevronDown, X, CheckCircle, Download, Pencil,
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

// Period helpers live in lib/period.js. The `fy` value threaded through this
// page is a period string: 'all' (standing crops — whole cycles, no date cut),
// a start year like '2026' (that FY), or 'YYYY-MM' (that month).

const CATEGORY_LABELS = {
  feed:              'Feed & Fodder',
  veterinary:        'Veterinary',
  labour:            'Outside Labour (Daily)',
  salary:            'Staff & Regular Salary',
  inventory_purchase:'Inventory Purchase',
  capital_purchase:  'Small Tools & Equipment',
  small_equipment:   'Small Tools & Equipment',
  farm_expense:      'General Expenses',
  machinery:         'Machinery / Hired Equipment',
  maintenance:       'Maintenance',
  construction:      'Construction',
  fuel:              'Fuel',
  utilities:         'Utilities',
  administrative:    'Administrative',
  other:             'Other',
}

// Seven tabs collapsed to five. Income/Buyer Khata were the same money seen
// two ways (list vs by-party), as were Expenses/Party Ledger — presenting them
// as rival tabs is exactly what made "why is it in expense AND the khata?" a
// question. Each pair is now one tab with a view toggle.
const TABS = [
  { id: 'summary',  label: 'Summary'   },
  { id: 'cashbook', label: 'Cash Book' },
  { id: 'moneyin',  label: 'Money In'  },
  { id: 'moneyout', label: 'Money Out' },
  { id: 'pnl',      label: 'P & L'     },
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
function AddCashModal({ accounts = [], onClose, onSave }) {
  const today = new Date().toISOString().slice(0, 10)
  const [form, setForm] = useState({
    entry_date: today, amount: '', direction: 'in',
    entry_type: 'owner_capital', notes: '',
    account_id: accounts.find(a => a.is_default)?.id || accounts[0]?.id || '',
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
          <option value="in:owner_capital">Owner adds money (Capital Injection)</option>
          <option value="in:revenue_receipt">Revenue received</option>
          <option value="out:owner_drawing">Owner takes money out (Drawing)</option>
          <option value="out:other_payment">Other payment</option>
        </select>
      </Field>
      {accounts.length > 1 && (
        <Field label="Account">
          <select className={inputCls} style={inputStyle} value={form.account_id}
            onChange={e => setForm(f => ({ ...f, account_id: e.target.value }))}>
            {accounts.map(a => (
              <option key={a.id} value={a.id}>{a.type === 'bank' ? '🏦' : '💵'} {a.name}</option>
            ))}
          </select>
        </Field>
      )}
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

// ── Move Money — a transfer between the farm's own accounts ──────────────────
//
// Owner tops up the manager (Bank → Cash), or the cash box is banked. The same
// money changing pockets: two linked rows, nets to zero for the farm, never
// income and never expense. This is the entry the app previously could not
// record at all — the only door was owner_capital, which would have overstated
// both the farm's cash and the owner's stake.
function MoveMoneyModal({ accounts, onClose, onSave }) {
  const today = new Date().toISOString().slice(0, 10)
  const bank = accounts.find(a => a.type === 'bank')
  const cash = accounts.find(a => a.type === 'cash')
  const [form, setForm] = useState({
    // The common case on a farm: owner's bank feeds the manager's cash box.
    fromAccountId: bank?.id || accounts[0]?.id || '',
    toAccountId:   cash?.id || accounts[1]?.id || '',
    amount: '', date: today, notes: '',
  })
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')

  const valid = form.fromAccountId && form.toAccountId
    && form.fromAccountId !== form.toAccountId
    && parseFloat(form.amount) > 0

  const save = async () => {
    if (!valid) return
    setSaving(true); setErr('')
    try { await onSave(form); onClose() }
    catch (e) { setErr(e.message || 'Transfer failed') }
    finally { setSaving(false) }
  }

  const accountLabel = (a) => `${a.type === 'bank' ? '🏦' : '💵'} ${a.name}`

  return (
    <Modal title="Move Money" onClose={onClose}>
      <p className="text-[10px] mb-3 leading-snug" style={{ color: 'var(--c-faint)' }}>
        Moves money between your own accounts — e.g. sending cash to the farm from
        the bank. Not an income or an expense; the farm's total does not change.
      </p>
      <Field label="From">
        <select className={inputCls} style={inputStyle} value={form.fromAccountId}
          onChange={e => setForm(f => ({ ...f, fromAccountId: e.target.value }))}>
          {accounts.map(a => <option key={a.id} value={a.id}>{accountLabel(a)}</option>)}
        </select>
      </Field>
      <Field label="To">
        <select className={inputCls} style={inputStyle} value={form.toAccountId}
          onChange={e => setForm(f => ({ ...f, toAccountId: e.target.value }))}>
          {accounts.map(a => <option key={a.id} value={a.id}>{accountLabel(a)}</option>)}
        </select>
      </Field>
      {form.fromAccountId === form.toAccountId && (
        <p className="text-[10px] mb-2" style={{ color: '#E24B4A' }}>Pick two different accounts.</p>
      )}
      <Field label="Amount (₹)">
        <input type="number" placeholder="0" className={inputCls} style={inputStyle}
          value={form.amount} onChange={e => setForm(f => ({ ...f, amount: e.target.value }))} />
      </Field>
      <Field label="Date">
        <input type="date" className={inputCls} style={inputStyle} value={form.date}
          onChange={e => setForm(f => ({ ...f, date: e.target.value }))} />
      </Field>
      <Field label="Notes (optional)">
        <input type="text" placeholder="e.g. Monthly cash for farm expenses" className={inputCls} style={inputStyle}
          value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
      </Field>
      {err && (
        <div className="text-[10px] mb-2 px-2 py-1.5 rounded-lg"
          style={{ background: 'rgba(226,75,74,0.1)', color: '#E24B4A' }}>{err}</div>
      )}
      <button disabled={saving || !valid} onClick={save}
        className="w-full py-2.5 rounded-xl text-sm font-semibold text-white mt-1 disabled:opacity-50"
        style={{ background: '#1D9E75' }}>
        {saving ? 'Moving…' : 'Move Money'}
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
        {/* Two pockets, two options — the same toggle the sale forms use.
            UPI and cheque ARE the bank; the value stays 'bank_transfer'
            because vendor_payments' CHECK constraint predates the accounts
            work, and accountFor() routes it to the Bank account either way. */}
        <div className="flex gap-2">
          {[['cash', '💵 Cash'], ['bank_transfer', '🏦 Bank Transfer']].map(([m, label]) => (
            <button key={m} onClick={() => setForm(f => ({ ...f, payment_mode: m }))}
              className="flex-1 py-2 rounded-xl text-xs font-semibold"
              style={{
                background: form.payment_mode === m ? '#1D9E75' : 'var(--c-ghost)',
                color:      form.payment_mode === m ? '#fff'    : 'var(--c-muted)',
                border:     `1px solid ${form.payment_mode === m ? '#1D9E75' : 'var(--c-border)'}`,
              }}>{label}</button>
          ))}
        </div>
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

// ── Vendor Modal — add a party, or edit one (incl. its opening balance) ───────
//
// Opening balance is the amount already owed on the day the farm started using
// the app. Ankur's first five bills — ₹67,770 — are on the shop's khata and
// nowhere the app can reach, and re-entering them as purchases would re-add
// stock that was consumed months ago. So the money is carried in as one figure
// and the goods are not. It never touches the P&L: pre-app cost belongs to the
// crop's opening cost, and counting it here too would double the same spend.
function VendorModal({ vendor, onClose, onSave }) {
  const editing = !!vendor
  // Cosmetic only — the real rule is a trigger in 0026, because the anon key
  // ships in this bundle and anyone can call PostgREST directly. This just
  // stops a manager discovering the rule by way of an error message.
  const amAdmin = isAdmin(getActiveFarmRole())
  const [form, setForm] = useState({
    name:        vendor?.name        || '',
    category:    vendor?.category    || 'other',
    phone:       vendor?.phone       || '',
    credit_days: vendor?.credit_days || 0,
    opening_balance:      vendor?.opening_balance ? String(vendor.opening_balance) : '',
    opening_balance_date: vendor?.opening_balance_date || '',
  })
  const [saving, setSaving] = useState(false)
  const [err, setErr]       = useState('')
  const save = async () => {
    if (!form.name.trim()) return
    setSaving(true); setErr('')
    try { await onSave(form); onClose() }
    catch (e) { setErr(e.message || 'Save failed') }
    finally { setSaving(false) }
  }
  return (
    <Modal title={editing ? `Edit ${vendor.name}` : 'Add Vendor / Party'} onClose={onClose}>
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

      <div className="mt-1 mb-2 pt-3" style={{ borderTop: '0.5px solid var(--c-border)' }}>
        <div className="text-[11px] font-semibold mb-0.5" style={{ color: 'var(--c-text)' }}>
          Opening Balance
          {!amAdmin && (
            <span className="ml-1.5 font-normal text-[10px]" style={{ color: '#BA7517' }}>· owner only</span>
          )}
        </div>
        <div className="text-[10px] mb-2" style={{ color: 'var(--c-faint)' }}>
          {amAdmin
            ? 'Already owed to this party before you started using the app. Set it once — it states what was true then, so it should not change afterwards.'
            : 'What was already owed to this party before the app started. Only the farm owner can set or correct this figure.'}
        </div>
      </div>
      <Field label="Amount owed (₹)">
        <input type="number" inputMode="decimal" placeholder={amAdmin ? 'e.g. 55580' : '—'}
          className={inputCls} style={inputStyle} disabled={!amAdmin}
          value={form.opening_balance}
          onChange={e => setForm(f => ({ ...f, opening_balance: e.target.value }))} />
      </Field>
      <Field label="As on date">
        <input type="date" className={inputCls} style={inputStyle} disabled={!amAdmin}
          value={form.opening_balance_date}
          onChange={e => setForm(f => ({ ...f, opening_balance_date: e.target.value }))} />
      </Field>
      {amAdmin && editing && Number(vendor.opening_balance || 0) !== 0 && (
        <div className="text-[10px] mb-2 px-2 py-1.5 rounded-lg"
          style={{ background: 'rgba(186,117,23,0.1)', color: '#BA7517' }}>
          This party already has an opening balance. Change it only to correct a mistake — every change is
          recorded against your name.
        </div>
      )}

      {err && (
        <div className="text-[10px] mb-2 px-2 py-1.5 rounded-lg"
          style={{ background: 'rgba(226,75,74,0.1)', color: '#E24B4A' }}>{err}</div>
      )}
      <button disabled={saving || !form.name.trim()} onClick={save}
        className="w-full py-2.5 rounded-xl text-sm font-semibold text-white disabled:opacity-50"
        style={{ background: '#1D9E75' }}>
        {saving ? 'Saving…' : editing ? 'Save Changes' : 'Add Vendor'}
      </button>
    </Modal>
  )
}

// ── View toggle inside a paired tab ───────────────────────────────────────────
function ViewToggle({ value, onChange, options }) {
  return (
    <div className="flex gap-2 pt-3">
      {options.map(([v, label]) => (
        <button key={v} onClick={() => onChange(v)}
          className="flex-1 py-2 rounded-xl text-[11px] font-semibold"
          style={{
            background: value === v ? 'var(--c-ghost)' : 'transparent',
            color:      value === v ? 'var(--c-text)'  : 'var(--c-faint)',
            border:     `1px solid ${value === v ? 'var(--c-border-md)' : 'var(--c-border)'}`,
          }}>
          {label}
        </button>
      ))}
    </div>
  )
}

// ── Tab: Summary ──────────────────────────────────────────────────────────────
function SummaryTab({ cashBalance, accountBalances = [], totalIncome, totalExpenses, totalVendorDues, totalReceivables,
                      totalWageDues = 0, totalSalaryDues = 0, capitalSpendFY = 0, openingCost = 0,
                      expectedRevenue = 0, onGoSalary, monthlySummary }) {
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
          Across all accounts, after every payment recorded
        </div>
        {/* Which pocket holds it — cash with the manager, plus the MAIN bank
            account transactions route through. The partners' accounts appear
            ONLY in Admin → Partners (the owner, twice: no partner account
            details on this card, not even rolled up). Their balances are
            still inside the headline figure — that is what its "across all
            accounts" subtitle states. */}
        {accountBalances.length > 1 && (
          <div className="mt-2 pt-2 flex flex-col gap-1" style={{ borderTop: '0.5px solid var(--c-border)' }}>
            {accountBalances.filter(a => a.isMain || a.type === 'cash').map(a => (
              <div key={a.id} className="flex justify-between text-[11px]">
                <span style={{ color: 'var(--c-muted)' }}>
                  {a.type === 'bank' ? '🏦' : '💵'} {a.name}
                  {a.isMain && (
                    <span className="ml-1.5 text-[8px] font-bold px-1.5 py-0.5 rounded-full align-middle"
                      style={{ background: 'rgba(29,158,117,0.15)', color: '#1D9E75' }}>
                      MAIN
                    </span>
                  )}
                </span>
                <span className="font-semibold" style={{ color: a.balance >= 0 ? 'var(--c-text)' : '#E24B4A' }}>
                  {fmt(a.balance)}
                </span>
              </div>
            ))}
          </div>
        )}
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

      {/* Metric grid — dues and receivables live in the banners above, once
          each; repeating them as cards said the same three numbers twice on
          one screen. Capital gets a card because nothing else explains why
          cash can fall by lakhs while profit does not move: a capitalised
          purchase is real money out and deliberately absent from the P&L. */}
      <div className="grid grid-cols-2 gap-3">
        <MetricCard label="Total Income" value={fmt(totalIncome)} color="#1D9E75" />
        {/* The forward-looking number beside the actuals: what the period's
            cycles should bring at harvest, same rule as the Dashboard. */}
        <MetricCard label="Expected Revenue" value={fmt(expectedRevenue)} color="#1D9E75"
          sub={expectedRevenue > 0 ? 'At harvest, if crops sell as expected' : undefined} />
        <MetricCard label="Total Expenses" value={fmt(totalExpenses)} color="#E24B4A"
          sub={openingCost > 0 ? `incl. ${fmt(openingCost)} spent before the app` : undefined} />
        <MetricCard label="Net Profit / Loss" value={fmt(netProfit)}
          color={netProfit >= 0 ? '#1D9E75' : '#E24B4A'} />
        <MetricCard label="Capital Purchases" value={fmt(capitalSpendFY)} color="#7c3aed"
          sub={capitalSpendFY > 0 ? 'Machinery & assets — kept out of P&L' : undefined} />
        <MetricCard label="Unpaid Wages & Expenses" value={fmt(totalWageDues)} color="#BA7517"
          sub={totalWageDues > 0 ? 'Outside labour — Money Out tab' : undefined} />
      </div>

      {totalSalaryDues > 0 && (
        <button onClick={onGoSalary}
          className="flex items-start gap-2 rounded-xl px-3 py-2.5 text-left w-full"
          style={{ background: 'rgba(186,117,23,0.1)', border: '0.5px solid rgba(186,117,23,0.3)' }}>
          <AlertCircle size={14} color="#BA7517" className="mt-0.5 shrink-0" />
          <div>
            <div className="text-xs font-medium" style={{ color: '#BA7517' }}>
              Salary dues outstanding: {fmt(totalSalaryDues)}
            </div>
            <div className="text-[10px]" style={{ color: 'var(--c-faint)' }}>
              Wages earned but not yet paid — tap to settle in Labour → Salary
            </div>
          </div>
        </button>
      )}
      <div className="text-[10px] text-center" style={{ color: 'var(--c-faint)' }}>
        Income/Expenses reflect the period selected above. Cash Balance, dues, and Receivables are always as of today, regardless of period.
        {openingCost > 0 && ' Expenses include crop spend from before the app began — a stated opening figure, not money moving now, so it does not appear in the Cash Book or the monthly chart below.'}
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
function CashBookTab({ cashBook, accounts = [], openingBalance = 0, showOpening = false, onAdd, onMove }) {
  // null = whole farm; an account id = that pocket's own book. Transfers net
  // to zero at farm level and show as ordinary in/out per pocket.
  const [accountFilter, setAccountFilter] = useState(null)
  const filtered = accountFilter ? cashBook.filter(r => r.account_id === accountFilter) : cashBook
  const rows = [...filtered].reverse() // newest first for display

  // Each pocket's balance is its last row's account_running_balance — as of
  // today, never scoped to the period, same rule as every balance-sheet fact.
  const balanceOf = (accountId) => {
    for (let i = cashBook.length - 1; i >= 0; i--) {
      if (cashBook[i].account_id === accountId) return Number(cashBook[i].account_running_balance || 0)
    }
    return 0
  }

  return (
    <div className="flex flex-col gap-3 pt-3">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-xs font-semibold" style={{ color: 'var(--c-text)' }}>Cash Book</div>
          <div className="text-[10px]" style={{ color: 'var(--c-faint)' }}>
            Every receipt and payment, in the account it actually touched
          </div>
        </div>
        <div className="flex gap-1.5">
          {accounts.length > 1 && (
            <button onClick={onMove}
              className="flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-medium"
              style={{ background: 'var(--c-ghost)', color: '#1D9E75', border: '0.5px solid var(--c-border)' }}>
              ⇄ Move Money
            </button>
          )}
          <button onClick={onAdd}
            className="flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-medium text-white"
            style={{ background: '#1D9E75' }}>
            <Plus size={12} /> Add Entry
          </button>
        </div>
      </div>

      {/* One chip per pocket: its balance, and tap to see only its book */}
      {accounts.length > 0 && (
        <div className="flex gap-2 overflow-x-auto">
          <button onClick={() => setAccountFilter(null)}
            className="px-3 py-1.5 rounded-xl text-[11px] font-semibold shrink-0"
            style={{
              background: !accountFilter ? '#1D9E75' : 'var(--c-ghost)',
              color:      !accountFilter ? '#fff'    : 'var(--c-muted)',
              border:     `1px solid ${!accountFilter ? '#1D9E75' : 'var(--c-border)'}`,
            }}>
            All accounts
          </button>
          {accounts.map(a => (
            <button key={a.id} onClick={() => setAccountFilter(f => f === a.id ? null : a.id)}
              className="px-3 py-1.5 rounded-xl text-[11px] shrink-0 text-left"
              style={{
                background: accountFilter === a.id ? '#1D9E75' : 'var(--c-ghost)',
                color:      accountFilter === a.id ? '#fff'    : 'var(--c-text)',
                border:     `1px solid ${accountFilter === a.id ? '#1D9E75' : 'var(--c-border)'}`,
              }}>
              <span className="font-semibold">{a.type === 'bank' ? '🏦' : '💵'} {a.name}</span>
              <span className="ml-1.5 font-bold">{fmt(balanceOf(a.id))}</span>
            </button>
          ))}
        </div>
      )}

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
                    {row.account_name && accounts.length > 1 && (
                      <div className="text-[9px]" style={{ color: 'var(--c-faint)' }}>
                        {row.account_name}
                      </div>
                    )}
                  </td>
                  <td className="px-3 py-2 text-right font-medium" style={{ color: '#1D9E75' }}>
                    {Number(row.receipt_amount) > 0 ? fmt(row.receipt_amount) : '—'}
                  </td>
                  <td className="px-3 py-2 text-right font-medium" style={{ color: '#E24B4A' }}>
                    {Number(row.payment_amount) > 0 ? fmt(row.payment_amount) : '—'}
                  </td>
                  {/* Filtered to one pocket, the balance shown is that pocket's */}
                  <td className="px-3 py-2 text-right font-bold"
                    style={{ color: Number(accountFilter ? row.account_running_balance : row.running_balance) >= 0 ? '#1D9E75' : '#E24B4A' }}>
                    {fmt(accountFilter ? row.account_running_balance : row.running_balance)}
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
  // amount_received comes from the view: full amount when paid, the actual partial
  // figure otherwise. Judging by status alone counted a part-paid deal as ₹0.
  const collectedTotal = incomeLedger.reduce((s, r) => s + Number(r.amount_received || 0), 0)
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
                const badge   = sourceBadge(row.source_type)
                const paid    = (row.payment_status || 'paid') === 'paid'
                const partial = !paid && Number(row.amount_received || 0) > 0
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
                      <span className="px-2 py-0.5 rounded-full text-[9px] font-semibold whitespace-nowrap"
                        style={{
                          background: paid ? 'rgba(29,158,117,0.15)' : 'rgba(186,117,23,0.15)',
                          color:      paid ? '#1D9E75'               : '#BA7517',
                        }}>
                        {paid ? 'Collected' : partial ? `Part — ${fmt(row.amount_received)}` : 'Pending'}
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

// ── Purchase bills: one document, one ledger entry ────────────────────────────
// inventory_purchases stores a bill as one row per line item, so a five-item bill
// used to land in the ledger as five separate debits of the same date — nothing an
// owner could tie back to the invoice the vendor actually sent. Line items that
// share a bill collapse into one entry carrying the bill total; the items stay
// readable one tap below it.
//
// Older entries recorded before inventory_bills existed have no bill_id, so they
// fall back to vendor + date + invoice number, which is the same document by any
// practical reading. Rows with neither stay on their own — nothing to combine.
const billKeyOf = (p) => {
  if (p.billId)    return `bill:${p.billId}`
  if (p.invoiceNo) return `inv:${(p.vendor || '').trim().toLowerCase()}:${p.date}:${p.invoiceNo}`
  return null
}

const itemCount = (n) => `${n} item${n > 1 ? 's' : ''}`

// Purchase line items → khata rows, one per bill.
function purchasesAsBillRows(lines, vendorName) {
  const rows = []
  const byBill = new Map()
  for (const p of lines) {
    const key    = billKeyOf(p)
    const amount = Number(p.totalCost || 0)
    if (!key) {
      rows.push({
        key: `p:${p.id}`, date: p.date, type: 'purchase',
        // A capital line bought without a bill can at least name itself;
        // a stock line off a bill has only the vendor to go on.
        particulars: p.capitalKind ? `${p.capitalKind === 'machinery' ? 'Machinery' : 'Asset'} — ${p.name}`
                                   : `Purchase — ${p.vendor || vendorName}`,
        debit: amount, credit: 0, items: [p],
      })
      continue
    }
    let row = byBill.get(key)
    if (!row) {
      row = { key, date: p.date, type: 'purchase', invoiceNo: p.invoiceNo || '',
              particulars: '', debit: 0, credit: 0, items: [] }
      byBill.set(key, row)
      rows.push(row)
    }
    row.items.push(p)
    row.debit += amount
    // A capital line knows its invoice only through the bill, so whichever line
    // opened the row may be the one without it. Take it from any line that has.
    if (!row.invoiceNo && p.invoiceNo) row.invoiceNo = p.invoiceNo
    if (p.date && p.date < row.date) row.date = p.date
  }
  // Written last so the item count is final.
  for (const row of byBill.values()) {
    row.particulars = (row.invoiceNo ? `Bill #${row.invoiceNo}` : 'Purchase Bill')
      + ` — ${itemCount(row.items.length)}`
  }
  return rows
}

// The granular level: what the bill was actually made of.
function BillLines({ items, inventoryMaster, colSpan }) {
  return (
    <tr style={{ background: 'var(--c-ghost)' }}>
      <td colSpan={colSpan} className="px-3 py-1.5">
        {items.map(p => {
          const item = inventoryMaster.find(i => i.id === p.itemId)
          return (
            <div key={p.id} className="flex items-center gap-2 py-0.5">
              <span className="text-[10px] flex-1 min-w-0 truncate" style={{ color: 'var(--c-text)' }}>
                {/* A capital line is not in the item master — it names itself. */}
                {p.capitalKind ? `${p.capitalKind === 'machinery' ? '🔧' : '🛠'} ${p.name}` : (item?.name || 'Item')}
              </span>
              <span className="text-[10px] shrink-0" style={{ color: 'var(--c-faint)' }}>
                {p.qty} {p.capitalKind ? (p.qty > 1 ? 'nos' : 'no') : (item?.unit || '')} × ₹{p.unitPrice}
              </span>
              <span className="text-[10px] font-medium shrink-0 w-20 text-right" style={{ color: 'var(--c-text)' }}>
                {fmt(p.totalCost)}
              </span>
            </div>
          )
        })}
      </td>
    </tr>
  )
}

// A particulars cell that opens its bill's line items, when it has any.
function Particulars({ row, isOpen, onToggle }) {
  if (!row.items?.length) return <>{row.particulars || row.description}</>
  return (
    <button onClick={onToggle} className="flex items-center gap-1 text-left"
      style={{ color: 'inherit', background: 'none', border: 'none', padding: 0, cursor: 'pointer' }}>
      <span>{row.particulars || row.description}</span>
      <ChevronDown size={11} style={{
        color: 'var(--c-faint)', flexShrink: 0,
        transform: isOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s',
      }} />
    </button>
  )
}

// ── Tab: Party Ledger (Vendor Khatas) ─────────────────────────────────────────
function VendorTab({ vendors, selectedVendor, setSelectedVendor, onPay, onAddVendor, onEditVendor, canPay, fy }) {
  const [activeId, setActiveId] = useState(null) // null = overview list
  const [monthView, setMonthView] = useState(false)
  const [openRows, setOpenRows] = useState({})   // ledger row key → showing line items
  const { vendorPayments, purchases, inventoryMaster, capitalPurchases } = useAppStore()
  const toggleRow = (key) => setOpenRows(o => ({ ...o, [key]: !o[key] }))

  // A bill's machinery and asset lines are debits on the same document as its
  // stock lines — bill #4237 is ₹13,060 to the vendor, not the ₹8,060 that
  // happened to be fertiliser. Shaped like a purchase line so they group into
  // the same bill row and settle under the same payment.
  const capitalAsLines = (v) => capitalPurchases
    .filter(c => c.vendor_id === v.id)
    .map(c => ({
      id:          c.id,
      billId:      c.bill_id,
      invoiceNo:   c.bill_invoice_number || '',
      date:        c.purchase_date,
      vendor:      v.name,
      vendor_id:   c.vendor_id,
      qty:         Number(c.quantity || 1),
      unitPrice:   Number(c.unit_price || 0),
      totalCost:   Number(c.amount || 0),
      itemId:      null,
      name:        c.name,
      capitalKind: c.source,
      billFileUrl: c.bill_file_url || null,
    }))

  // Only vendor_id counts. Falling back to a name match gave two different
  // answers to "what do I owe" — this screen counted name matches, while
  // v_vendor_balances counted only real ids — and the comparison was
  // whitespace-sensitive, so one trailing space hid ₹4,140 of bill 3899 and the
  // whole of Dhaliwal's ₹42,306. Now that a party can state an opening balance,
  // a name match would also silently double it.
  const purchasesFor = (v) => [
    ...purchases.filter(p => p.vendor_id && p.vendor_id === v.id),
    ...capitalAsLines(v),
  ]
  const paymentsFor = (v) => vendorPayments.filter(p => p.vendor_id === v.id)

  // What was owed before the app existed. A debit like any other, but with no
  // document behind it — so it is read off the vendor, not off a purchase.
  // `|| 0` keeps this working against a database where 0025 has not landed.
  const openingOf     = (v) => Number(v?.opening_balance || 0)
  const openingDateOf = (v) => v?.opening_balance_date || null

  // Overview: every vendor, all-time Balance Due (a point-in-time fact) plus
  // Purchased/Paid scoped to the selected financial year (period activity).
  const overview = vendors.map(v => {
    const vPurchases = purchasesFor(v)
    const vPayments  = paymentsFor(v)
    const opening          = openingOf(v)
    const purchasedAllTime = vPurchases.reduce((s, p) => s + Number(p.totalCost || 0), 0)
    const paidAllTime      = vPayments.reduce((s, p) => s + Number(p.amount || 0), 0)
    // Purchased means purchases. The opening balance is a carried-in debt, not
    // activity in any period — it shows on the khata's opening line and in
    // Balance Due, and nowhere else, so both views agree on what it is.
    return {
      vendor: v,
      balanceDue:  opening + purchasedAllTime - paidAllTime,
      purchasedFY: vPurchases.filter(p => inPeriod(p.date, fy)).reduce((s, p) => s + Number(p.totalCost || 0), 0),
      paidFY:      vPayments.filter(p => inPeriod(p.payment_date, fy)).reduce((s, p) => s + Number(p.amount || 0), 0),
    }
  }).sort((a, b) => b.balanceDue - a.balanceDue)

  const activeVendor = vendors.find(v => v.id === activeId)

  const vendorOpening = openingOf(activeVendor)

  const ledgerRowsAll = activeVendor ? [
    ...purchasesAsBillRows(purchasesFor(activeVendor), activeVendor.name),
    ...paymentsFor(activeVendor).map(p => ({
      key: `pay:${p.id}`, date: p.payment_date, type: 'payment',
      particulars: p.notes || (!p.payment_mode || p.payment_mode === 'cash' ? 'Cash Payment' : 'Bank Payment'),
      debit: 0, credit: Number(p.amount || 0),
    })),
  ].sort((a, b) => new Date(a.date) - new Date(b.date)) : []

  const range = periodRange(fy)
  // A party's opening balance IS the khata's opening line — it precedes every
  // document by definition, whatever date it happens to be stamped with. Dating
  // it as an ordinary row sorted Ankur's ₹55,580 in among June's bills, below
  // the bill it was supposed to open above. So it is folded in here instead.
  const openingBal = vendorOpening + (range
    ? ledgerRowsAll.filter(r => r.date < range.start).reduce((s, r) => s + r.debit - r.credit, 0)
    : 0)
  const ledgerRowsFY = range ? ledgerRowsAll.filter(r => r.date >= range.start && r.date <= range.end) : ledgerRowsAll

  let running = openingBal
  const ledgerWithBal = ledgerRowsFY.map(r => {
    running += r.debit - r.credit
    return { ...r, balance: running }
  })

  const purchasedFY = ledgerWithBal.reduce((s, r) => s + r.debit, 0)
  const paidFY      = ledgerWithBal.reduce((s, r) => s + r.credit, 0)
  const balanceDueAllTime = vendorOpening + ledgerRowsAll.reduce((s, r) => s + r.debit - r.credit, 0)

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
                  {['Vendor','Purchased','Paid','Balance Due',''].map((h, i) => (
                    <th key={i} className="px-3 py-2 text-left font-medium" style={{ color: 'var(--c-faint)' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {overview.map(({ vendor, purchasedFY: pFY, paidFY: yFY, balanceDue }) => (
                  <tr key={vendor.id} onClick={() => setActiveId(vendor.id)}
                    className="cursor-pointer hover:bg-[var(--c-ghost)] transition-colors"
                    style={{ borderBottom: '0.5px solid var(--c-border)' }}>
                    <td className="px-3 py-2.5 font-medium" style={{ color: 'var(--c-text)' }}>
                      {vendor.name}
                      {openingOf(vendor) !== 0 && (
                        <div className="text-[9px]" style={{ color: 'var(--c-faint)' }}>
                          incl. opening {fmt(openingOf(vendor))}
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-2.5" style={{ color: 'var(--c-text)' }}>{fmt(pFY)}</td>
                    <td className="px-3 py-2.5" style={{ color: '#1D9E75' }}>{fmt(yFY)}</td>
                    <td className="px-3 py-2.5 font-bold" style={{ color: balanceDue > 0 ? '#E24B4A' : '#1D9E75' }}>{fmt(balanceDue)}</td>
                    <td className="px-2 py-2.5 text-right">
                      <button title="Edit party / set opening balance"
                        onClick={e => { e.stopPropagation(); onEditVendor(vendor) }}
                        className="p-1.5 rounded-lg" style={{ color: 'var(--c-faint)' }}>
                        <Pencil size={12} />
                      </button>
                    </td>
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
        <button onClick={() => onEditVendor(activeVendor)}
          className="flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-medium"
          style={{ background: 'var(--c-ghost)', color: 'var(--c-muted)' }}>
          <Pencil size={10} /> {openingOf(activeVendor) !== 0 ? 'Edit' : 'Opening balance'}
        </button>
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

      {/* An opening balance dated before the selected period folds into
          openingBal rather than becoming a row — without it in this test, a
          party carrying nothing but an opening balance would read as empty. */}
      {(ledgerWithBal.length > 0 || openingBal !== 0) ? (
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
                          <React.Fragment key={row.key || i}>
                            <tr style={{ borderBottom: '0.5px solid var(--c-border)' }}>
                              <td className="px-3 py-2 whitespace-nowrap w-[72px]" style={{ color: 'var(--c-faint)' }}>
                                {fmtDate(row.date)}
                              </td>
                              <td className="px-3 py-2" style={{ color: 'var(--c-text)' }}>
                                <Particulars row={row} isOpen={!!openRows[row.key]}
                                  onToggle={() => toggleRow(row.key)} />
                              </td>
                              <td className="px-3 py-2 text-right w-20 font-medium"
                                style={{ color: row.debit > 0 ? '#E24B4A' : 'var(--c-faint)' }}>
                                {row.debit > 0 ? fmt(row.debit) : '—'}
                              </td>
                              <td className="px-3 py-2 text-right w-20 font-medium"
                                style={{ color: row.credit > 0 ? '#1D9E75' : 'var(--c-faint)' }}>
                                {row.credit > 0 ? fmt(row.credit) : '—'}
                              </td>
                            </tr>
                            {openRows[row.key] && row.items?.length > 0 && (
                              <BillLines items={row.items} inventoryMaster={inventoryMaster} colSpan={4} />
                            )}
                          </React.Fragment>
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
                  {(range || openingBal !== 0) && (
                    <tr style={{ borderBottom: '0.5px solid var(--c-border)' }}>
                      <td colSpan={4} className="px-3 py-2 italic" style={{ color: 'var(--c-faint)' }}>
                        Opening Balance
                        {vendorOpening !== 0 && (
                          <span className="not-italic ml-1.5 text-[10px]" style={{ color: 'var(--c-faint)' }}>
                            · includes {fmt(vendorOpening)} owed before the app
                            {openingDateOf(activeVendor) ? ` (as on ${fmtDate(openingDateOf(activeVendor))})` : ''}
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-right font-bold" style={{ color: openingBal > 0 ? '#E24B4A' : '#1D9E75' }}>{fmt(openingBal)}</td>
                    </tr>
                  )}
                  {ledgerWithBal.map((row, i) => (
                    <React.Fragment key={row.key || i}>
                      <tr style={{ borderBottom: '0.5px solid var(--c-border)' }}>
                        <td className="px-3 py-2 whitespace-nowrap" style={{ color: 'var(--c-faint)' }}>{fmtDate(row.date)}</td>
                        <td className="px-3 py-2" style={{ color: 'var(--c-text)' }}>
                          <Particulars row={row} isOpen={!!openRows[row.key]}
                            onToggle={() => toggleRow(row.key)} />
                        </td>
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
                      {openRows[row.key] && row.items?.length > 0 && (
                        <BillLines items={row.items} inventoryMaster={inventoryMaster} colSpan={5} />
                      )}
                    </React.Fragment>
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
function BuyersTab({ sales, buyers, harvestSessions, cropCycles, cropMaster, treeSales = [], fy,
                     buyerReceipts = [], canRecordReceipt = false, onRecordReceipt }) {
  const navigate = useNavigate()
  const [activeKey, setActiveKey] = useState(null) // null = overview list
  const [receiptFor, setReceiptFor] = useState(null) // buyer group being settled
  const cropSales = sales.filter(s => s.buyerName)

  // How much of a row's money has actually landed. Status alone is not enough:
  // a part-paid deal has real cash against it that a paid/unpaid split loses.
  const receivedOf = (r) =>
    r.paymentStatus === 'paid' ? Number(r.netAmount || 0) : Number(r.amountReceived || 0)

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
  // opening = what they already owed at go-live, with no sale behind it. Carried
  // on the group so Balance Due here agrees with Receivables on the Summary.
  const groups = {}
  buyers.filter(b => b.isActive !== false).forEach(b => {
    groups[b.id] = {
      key: b.id, name: b.name, rows: [],
      opening:  Number(b.openingBalance || 0),
      // Cash received against the opening balance — the receivable no sale row
      // can explain and no sale row can settle. Only master buyers can carry
      // one, so name-keyed groups never have receipts.
      receipts: buyerReceipts.filter(e => e.reference_id === b.id),
    }
  })
  // Crop sales and tree deals sit in the same khata: a thekedar who leased the
  // mangoes owes money exactly the way a grain trader does.
  ;[...cropSales, ...treeSales.filter(s => s.buyerName)].forEach(s => {
    const key = s.buyerId || `name:${s.buyerName.trim().toLowerCase()}`
    if (!groups[key]) groups[key] = { key, name: s.buyerName, rows: [] }
    groups[key].rows.push(s)
  })
  const parties = Object.values(groups)

  // Overview: Balance Due is all-time (a point-in-time fact — what they owe
  // right now); Sold/Received are scoped to the selected financial year.
  const receiptsTotal = (p) => (p.receipts || []).reduce((s, e) => s + Number(e.amount || 0), 0)
  const overview = parties.map(p => {
    const soldAllTime     = p.rows.reduce((s, r) => s + Number(r.netAmount || 0), 0)
    const receivedAllTime = p.rows.reduce((s, r) => s + receivedOf(r), 0)
    return {
      party: p,
      balanceDue: Number(p.opening || 0) + soldAllTime - receivedAllTime - receiptsTotal(p),
      soldFY:     p.rows.filter(r => inPeriod(r.date, fy)).reduce((s, r) => s + Number(r.netAmount || 0), 0),
      receivedFY: p.rows.filter(r => inPeriod(r.paymentDate || r.date, fy)).reduce((s, r) => s + receivedOf(r), 0)
                + (p.receipts || []).filter(e => inPeriod(e.entry_date, fy)).reduce((s, e) => s + Number(e.amount || 0), 0),
    }
  }).sort((a, b) => b.balanceDue - a.balanceDue)

  const active = parties.find(p => p.key === activeKey)
  const rowsAll = active ? [...active.rows].sort((a, b) => new Date(b.date) - new Date(a.date)) : []
  const rows    = active ? rowsAll.filter(r => inPeriod(r.date, fy)) : []
  const soldFY      = rows.reduce((s, r) => s + Number(r.netAmount || 0), 0)
  const receivedFY  = rows.filter(r => inPeriod(r.paymentDate || r.date, fy)).reduce((s, r) => s + receivedOf(r), 0)
    + (active?.receipts || []).filter(e => inPeriod(e.entry_date, fy)).reduce((s, e) => s + Number(e.amount || 0), 0)
  const balanceDueAllTime = active
    ? Number(active.opening || 0)
      + rowsAll.reduce((s, r) => s + Number(r.netAmount || 0) - receivedOf(r), 0)
      - receiptsTotal(active)
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
                    <td className="px-3 py-2.5 font-medium" style={{ color: 'var(--c-text)' }}>
                      {party.name}
                      {Number(party.opening || 0) !== 0 && (
                        <div className="text-[9px]" style={{ color: 'var(--c-faint)' }}>
                          incl. opening {fmt(party.opening)}
                        </div>
                      )}
                    </td>
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
          Mark payment against the specific sale to clear this balance — Harvest page for crops, Trees → Sales for tree deals
        </p>
      )}

      {/* Owed before the app existed — real money the sale rows below cannot
          explain, so it is shown rather than silently folded into Balance Due.
          Its receipts sit right under it: the only way that figure goes down. */}
      {Number(active.opening || 0) !== 0 && (
        <div className="rounded-xl px-3 py-2" style={{ background: 'var(--c-ghost)' }}>
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-medium" style={{ color: 'var(--c-faint)' }}>
              Opening balance — owed from before the app
            </span>
            <span className="text-xs font-bold" style={{ color: '#BA7517' }}>{fmt(active.opening)}</span>
          </div>
          {(active.receipts || []).map(e => (
            <div key={e.id} className="flex items-center justify-between mt-1">
              <span className="text-[10px]" style={{ color: 'var(--c-faint)' }}>
                {fmtDate(e.entry_date)} — receipt
              </span>
              <span className="text-[10px] font-semibold" style={{ color: '#1D9E75' }}>− {fmt(e.amount)}</span>
            </div>
          ))}
          {canRecordReceipt && typeof active.key === 'string' && !active.key.startsWith('name:') && (
            <button onClick={() => setReceiptFor(active)}
              className="mt-1.5 w-full py-1.5 rounded-lg text-[10px] font-semibold"
              style={{ background: 'rgba(29,158,117,0.12)', color: '#1D9E75' }}>
              + Record receipt against this balance
            </button>
          )}
        </div>
      )}

      {receiptFor && (
        <BuyerReceiptModal
          buyer={receiptFor}
          onClose={() => setReceiptFor(null)}
          onSave={async (payload) => {
            await onRecordReceipt({ buyerId: receiptFor.key, buyerName: receiptFor.name, ...payload })
            setReceiptFor(null)
          }}
        />
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
              const paid    = r.paymentStatus === 'paid'
              const partial = !paid && Number(r.amountReceived || 0) > 0
              return (
                <tr key={r.id} style={{ borderBottom: '0.5px solid var(--c-border)' }}>
                  <td className="px-3 py-2 whitespace-nowrap" style={{ color: 'var(--c-faint)' }}>{fmtDate(r.date)}</td>
                  <td className="px-3 py-2" style={{ color: 'var(--c-text)' }}>{r.treeLabel || cropPlotLabel(r) || '—'}</td>
                  <td className="px-3 py-2" style={{ color: 'var(--c-text)' }}>{r.treeLabel ? '—' : Number(r.qtyQtl || 0).toFixed(2)}</td>
                  <td className="px-3 py-2" style={{ color: 'var(--c-text)' }}>{r.treeLabel ? '—' : `₹${r.ratePerQtl}`}</td>
                  <td className="px-3 py-2 font-bold" style={{ color: 'var(--c-text)' }}>{fmt(r.netAmount)}</td>
                  <td className="px-3 py-2">
                    <span className="px-2 py-0.5 rounded-full text-[9px] font-semibold whitespace-nowrap"
                      style={{
                        background: paid ? 'rgba(29,158,117,0.15)' : 'rgba(186,117,23,0.15)',
                        color:      paid ? '#1D9E75'               : '#BA7517',
                      }}>
                      {paid ? 'Received' : partial ? `Part — ${fmt(r.amountReceived)}` : 'Pending'}
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

// ── Buyer Receipt Modal ───────────────────────────────────────────────────────
// The mirror of Pay Vendor. A sale's money is marked on the sale row; the one
// receivable with no sale row behind it is the carried-in opening balance, and
// this is how it comes down: one cash entry, keyed to the buyer.
function BuyerReceiptModal({ buyer, onClose, onSave }) {
  const [form, setForm] = useState({
    date:   new Date().toISOString().slice(0, 10),
    amount: '',
    mode:   'cash',
    notes:  '',
  })
  const [saving, setSaving] = useState(false)
  const [err, setErr]       = useState('')
  const save = async () => {
    if (!form.amount || saving) return
    setSaving(true); setErr('')
    try { await onSave(form) }
    catch (e) { setErr(e.message || 'Save failed'); setSaving(false) }
  }
  return (
    <Modal title={`Receipt — ${buyer.name}`} onClose={onClose}>
      <p className="text-[10px] mb-2" style={{ color: 'var(--c-faint)' }}>
        Money received against the old (opening) balance. Receipts for a specific
        sale are marked on the sale itself — Harvest for crops, Trees for tree deals.
      </p>
      {err && <p className="text-[10px] mb-2" style={{ color: '#E24B4A' }}>{err}</p>}
      <Field label="Date">
        <input type="date" className={inputCls} style={inputStyle} value={form.date}
          onChange={e => setForm(f => ({ ...f, date: e.target.value }))} />
      </Field>
      <Field label="Amount received (₹)">
        <input type="number" inputMode="decimal" placeholder="0" className={inputCls} style={inputStyle}
          value={form.amount} onChange={e => setForm(f => ({ ...f, amount: e.target.value }))} />
      </Field>
      <Field label="Received into">
        <div className="flex gap-2">
          {[['cash', '💵 Cash'], ['bank', '🏦 Bank']].map(([m, label]) => (
            <button key={m} onClick={() => setForm(f => ({ ...f, mode: m }))}
              className="flex-1 py-2 rounded-xl text-xs font-semibold"
              style={{
                background: form.mode === m ? '#1D9E75' : 'var(--c-ghost)',
                color:      form.mode === m ? '#fff'    : 'var(--c-muted)',
                border:     `1px solid ${form.mode === m ? '#1D9E75' : 'var(--c-border)'}`,
              }}>{label}</button>
          ))}
        </div>
      </Field>
      <Field label="Notes (optional)">
        <input type="text" className={inputCls} style={inputStyle}
          value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
      </Field>
      <button disabled={saving || !form.amount} onClick={save}
        className="w-full py-2.5 rounded-xl text-sm font-semibold text-white mt-1 disabled:opacity-50"
        style={{ background: '#1D9E75' }}>
        {saving ? 'Saving…' : 'Record Receipt'}
      </button>
    </Modal>
  )
}

// ── Tab: Expense Accounts ─────────────────────────────────────────────────────
// One rule decides where anything is paid: whoever has a khata is settled in the
// khata (vendors → Party Ledger, staff/regular workers → Labour → Salary); only
// khata-less entries (outside labour, general expenses) are paid on the row here.
const GROUP_HINTS = {
  vendor_purchase: 'Settled against the vendor khata in Party Ledger',
  capital_purchase:'Machines and assets under the farm’s capital threshold — expensed in the month bought. Anything above it is capital and is not in this list.',
  salary:          'Wages earned by staff & regular workers — settled in Labour → Salary',
  labour:          'Outside workers with no khata — settle each entry here',
}

// v_expense_ledger reports inventory purchases one row per line item — the same
// bill, split. Collapse those back into one entry per bill so the amount shown is
// the bill total, with the line items expandable underneath.
function collapseBills(rows, purchaseById) {
  const out = []
  const byBill = new Map()
  for (const row of rows) {
    const p   = purchaseById[row.id]
    const key = p && billKeyOf(p)
    // No bill to combine with, but if it is a purchase at all its one line is
    // still worth showing — "Purchase from X" alone never said what was bought.
    if (!key) { out.push({ ...row, key: `r:${row.id}`, items: p ? [p] : undefined }); continue }
    let g = byBill.get(key)
    if (!g) {
      g = { ...row, key, amount: 0, items: [], invoiceNo: p.invoiceNo || '' }
      byBill.set(key, g)
      out.push(g)
    }
    g.amount += Number(row.amount || 0)
    g.items.push(p)
  }
  for (const g of byBill.values()) {
    g.description = g.description
      + (g.invoiceNo ? ` · Bill #${g.invoiceNo}` : '')
      + ` — ${itemCount(g.items.length)}`
  }
  return out
}

function ExpensesTab({ expenseLedger, vendorPayments = [], salaryPaidTotal = 0,
                       canPay = false, onPayRow, onGoVendors, onGoSalary,
                       purchases = [], inventoryMaster = [], openingCost = 0 }) {
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
  // Same shape as vendors: salary accrues per worker-month but is settled in lump
  // sums against the khata, so "Paid" is the real cash handed over, not a per-row
  // flag — which would otherwise read ₹0 forever.
  if (grouped.salary) {
    grouped.salary.paid = Math.min(grouped.salary.total, salaryPaidTotal)
  }

  const [expanded, setExpanded] = useState(null)
  const [openRows, setOpenRows] = useState({})   // bill key → showing line items
  const toggleRow = (key) => setOpenRows(o => ({ ...o, [key]: !o[key] }))
  const purchaseById = useMemo(
    () => Object.fromEntries(purchases.map(p => [p.id, p])), [purchases])

  return (
    <div className="flex flex-col gap-3 pt-3">
      <div>
        <div className="text-xs font-semibold" style={{ color: 'var(--c-text)' }}>Expense Accounts</div>
        <div className="text-[10px]" style={{ color: 'var(--c-faint)' }}>
          Total incurred vs paid, by category
        </div>
      </div>

      {/* Deliberately NOT a category card. A year with lakhs of real cost behind
          it should not read as near-empty here, but this money has no "paid"
          side to show: it was settled before the app existed, which is precisely
          why the opening cash balance is the figure it is. Rendering it as a
          normal group would put it in the Pending column and invent a payable. */}
      {openingCost > 0 && (
        <Card>
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-xs font-medium" style={{ color: 'var(--c-text)' }}>
                Spent before the app
              </div>
              <div className="text-[10px] mt-0.5" style={{ color: 'var(--c-faint)' }}>
                Crop cost carried in from your own records. Counted in the P&amp;L,
                but not payable and not in the Cash Book — it was already settled
                when the opening balances were set.
              </div>
            </div>
            <div className="text-xs font-bold shrink-0" style={{ color: '#E24B4A' }}>
              {fmt(openingCost)}
            </div>
          </div>
        </Card>
      )}

      {Object.entries(grouped).map(([key, data]) => {
        const pending = data.total - data.paid
        const isOpen = expanded === key
        const entries = collapseBills(data.rows, purchaseById)
        return (
          <Card key={key} className="p-0">
            <button className="w-full flex items-center justify-between px-4 py-3"
              onClick={() => setExpanded(isOpen ? null : key)}>
              <div className="flex flex-col items-start gap-0.5">
                <span className="text-xs font-medium" style={{ color: 'var(--c-text)' }}>
                  {CATEGORY_LABELS[key] || key}
                </span>
                <span className="text-[10px]" style={{ color: 'var(--c-faint)' }}>
                  {entries.length} entries · Pending: {fmt(pending)}
                </span>
                {GROUP_HINTS[key] && (
                  <span className="text-[9px] italic" style={{ color: 'var(--c-faint)' }}>
                    {GROUP_HINTS[key]}
                  </span>
                )}
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
                    {entries.slice(0, 20).map((row, i) => (
                      <React.Fragment key={row.key || i}>
                      <tr style={{ borderBottom: '0.5px solid var(--c-border)' }}>
                        <td className="px-3 py-2 whitespace-nowrap" style={{ color: 'var(--c-faint)' }}>{fmtDate(row.entry_date)}</td>
                        <td className="px-3 py-2" style={{ color: 'var(--c-text)' }}>
                          <Particulars row={row} isOpen={!!openRows[row.key]}
                            onToggle={() => toggleRow(row.key)} />
                        </td>
                        <td className="px-3 py-2 font-medium" style={{ color: 'var(--c-text)' }}>{fmt(row.amount)}</td>
                        <td className="px-3 py-2">
                          {key === 'vendor_purchase' ? (
                            <button onClick={onGoVendors}
                              className="text-[9px] font-semibold underline"
                              style={{ color: '#1D9E75', background: 'none', border: 'none', cursor: 'pointer' }}>
                              Pay in Party Ledger →
                            </button>
                          ) : key === 'salary' ? (
                            <button onClick={onGoSalary}
                              className="text-[9px] font-semibold underline"
                              style={{ color: '#1D9E75', background: 'none', border: 'none', cursor: 'pointer' }}>
                              Pay in Labour → Salary →
                            </button>
                          ) : row.is_paid ? (
                            <span className="px-2 py-0.5 rounded-full text-[9px] font-semibold"
                              style={{ background: 'rgba(29,158,117,0.15)', color: '#1D9E75' }}>
                              Paid{row.paid_date ? ` ${fmtDate(row.paid_date)}` : ''}
                            </span>
                          ) : canPay && (row.expense_type === 'labour' || row.expense_type === 'farm_expense') ? (
                            <button onClick={() => onPayRow?.(row)}
                              className="px-2.5 py-1 rounded-full text-[9px] font-semibold"
                              style={{ background: '#1D9E75', color: '#fff' }}>
                              Pay {fmt(row.amount)}
                            </button>
                          ) : (
                            <span className="px-2 py-0.5 rounded-full text-[9px] font-semibold"
                              style={{ background: 'rgba(186,117,23,0.15)', color: '#BA7517' }}>
                              Pending
                            </span>
                          )}
                        </td>
                      </tr>
                      {openRows[row.key] && row.items?.length > 0 && (
                        <BillLines items={row.items} inventoryMaster={inventoryMaster} colSpan={4} />
                      )}
                      </React.Fragment>
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

// One crop can stand in five plots; at crop level those cycles merge into a
// single line. Margin is actual once revenue exists, expected until then.
function mergeByCrop(cropPnl) {
  const byCrop = {}
  for (const row of cropPnl) {
    const key = row.crop_name || '—'
    const agg = byCrop[key] || { crop: key, cycles: 0, acres: 0, cost: 0, revenue: 0, expected: 0 }
    byCrop[key] = {
      ...agg,
      cycles:   agg.cycles + 1,
      acres:    agg.acres + Number(row.acres || 0),
      cost:     agg.cost + Number(row.total_cost || 0),
      revenue:  agg.revenue + Number(row.revenue || 0),
      expected: agg.expected + Number(row.expected_revenue || 0),
    }
  }
  return Object.values(byCrop).sort((a, b) => b.cost - a.cost)
}

function MarginPill({ actualPct, expectedPct, isActual }) {
  const pct = isActual ? Number(actualPct || 0) : Number(expectedPct || 0)
  return (
    <span className="px-2 py-0.5 rounded-full text-[9px] font-bold"
      style={{
        background: pct >= 0 ? '#1D9E75/15' : '#E24B4A/15',
        color:      pct >= 0 ? '#1D9E75'    : '#E24B4A',
      }}>
      {pct}%{isActual ? '' : ' est.'}
    </span>
  )
}

function PnlTab({ totalIncome, totalExpenses, openingCost = 0, livestockPnl, cropPnl, isMonthView = false }) {
  const net = totalIncome - totalExpenses
  const cropMerged = mergeByCrop(cropPnl)
  const animalPnl  = livestockPnl.filter(row => !isPet(row))
  return (
    <div className="flex flex-col gap-3 pt-3">
      {/* Under a month, the crop tables are absent on purpose — say why, or
          their disappearance reads as data loss. */}
      {isMonthView && (
        <div className="text-[10px] rounded-xl px-3 py-2"
          style={{ color: 'var(--c-faint)', background: 'var(--c-ghost)', border: '0.5px solid var(--c-border)' }}>
          A month shows only what was recorded in it. Whole-crop figures — opening
          cost, expected revenue, the crop tables — live in the Standing Crops and
          FY views.
        </div>
      )}
      {/* One line, not a card: the Summary already carries these three numbers.
          This tab's value is the breakdown — which crop, which animal. */}
      <div className="flex items-center justify-between px-1">
        <div className="flex flex-col gap-0.5">
          <span className="text-[11px]" style={{ color: 'var(--c-faint)' }}>
            {fmt(totalIncome)} in · {fmt(totalExpenses)} out
          </span>
          {/* Names the reconciliation outright. Without it the "out" figure and
              the crop cost below it look like two rival answers. */}
          {openingCost > 0 && (
            <span className="text-[9px]" style={{ color: 'var(--c-faint)' }}>
              of which {fmt(openingCost)} spent before the app — the opening cost carried in the crop rows below
            </span>
          )}
        </div>
        <span className="text-xs font-bold" style={{ color: net >= 0 ? '#1D9E75' : '#E24B4A' }}>
          Net {net >= 0 ? 'Profit' : 'Loss'} {fmt(Math.abs(net))}
        </span>
      </div>

      {/* Livestock P&L — pets dropped. v_livestock_pnl reports every animal, but a
          pet has no revenue side, so its row can only ever read as a loss the
          size of its upkeep. Its cost still counts in the totals above; the
          running figure lives on the pet's card under Livestock → Pets. */}
      {animalPnl.length > 0 && (
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
              {animalPnl.map((row, i) => (
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

      {/* Crop P&L — merged at crop level across plots */}
      {cropMerged.length > 0 && (
        <Card className="p-0">
          <div className="px-4 pt-3 pb-2 text-xs font-semibold" style={{ color: 'var(--c-text)' }}>
            Crops — P&L (all plots merged)
          </div>
          <table className="w-full text-xs">
            <thead>
              <tr style={{ borderBottom: '0.5px solid var(--c-border)' }}>
                {['Crop','Cost','Revenue','Margin'].map(h => (
                  <th key={h} className="px-3 py-2 text-left font-medium" style={{ color: 'var(--c-faint)' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {cropMerged.map((row) => {
                const isActual = row.revenue > 0
                const rev      = isActual ? row.revenue : row.expected
                const pct      = rev > 0 ? Math.round((rev - row.cost) / rev * 1000) / 10 : 0
                return (
                  <tr key={row.crop} style={{ borderBottom: '0.5px solid var(--c-border)' }}>
                    <td className="px-3 py-2">
                      <div className="font-medium" style={{ color: 'var(--c-text)' }}>{row.crop}</div>
                      <div className="text-[9px]" style={{ color: 'var(--c-faint)' }}>
                        {row.cycles} plot{row.cycles !== 1 ? 's' : ''} · {row.acres} ac
                      </div>
                    </td>
                    <td className="px-3 py-2" style={{ color: '#E24B4A' }}>{fmt(row.cost)}</td>
                    <td className="px-3 py-2" style={{ color: '#1D9E75' }}>
                      {fmt(rev)}
                      {!isActual && <span className="text-[9px]" style={{ color: 'var(--c-faint)' }}> est.</span>}
                    </td>
                    <td className="px-3 py-2">
                      <MarginPill actualPct={pct} expectedPct={pct} isActual={isActual} />
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </Card>
      )}

      {/* Crop P&L — per cycle (plot) */}
      {cropPnl.length > 0 && (
        <Card className="p-0">
          <div className="px-4 pt-3 pb-2 text-xs font-semibold" style={{ color: 'var(--c-text)' }}>
            Crop Cycles — P&L (per plot)
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
                    <MarginPill actualPct={row.margin_pct} expectedPct={row.expected_margin_pct}
                      isActual={Number(row.revenue) > 0} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      {animalPnl.length === 0 && cropPnl.length === 0 && (
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
    harvestSessions, cropCycles, cropMaster, purchases, inventoryMaster,
    incomeLedger, expenseLedger, monthlySummary: monthlySummaryAll, livestockPnl, cropPnl,
    cropResiduals, recordResidualSale,
    loadLedgerData, addOwnerCashEntry, addVendorPayment, addVendor, updateVendor,
    markLabourPaid, addExpensePayment, salaryDues, salaryPayments,
    accounts, recordTransfer, capitalPurchases,
    ownerCashEntries, addBuyerReceipt,
  } = useAppStore()

  const canManage = isManager(getActiveFarmRole())
  const navigate  = useNavigate()

  // Tree deals are receivables like any crop sale, but they live in the lazy
  // tree store — pulled in here so the khata and Receivables see them.
  const { revenue: treeRevenue, species: treeSpecies, plantings: treePlantings,
          load: loadTrees } = useTreeStore()

  const [tab, setTab] = useState('summary')
  // Which face of the paired tabs is showing: the flow (sales/expenses) or the
  // parties behind it (buyer khata / party khata).
  const [cashBookView, setCashBookView] = useState('entries')
  const [moneyInView,  setMoneyInView]  = useState('sales')
  const [moneyOutView, setMoneyOutView] = useState('expenses')
  // The period lens: two dropdowns, coarse then fine. The first holds
  // Standing Crops (whole cycles, no date cut — the DEFAULT, and the same
  // lens as the Dashboard, because a crop sown last October cannot be read
  // through a financial year) with the FY years beneath it. The second digs
  // into the chosen FY month by month; it empties when the year changes and
  // sits disabled under Standing Crops, where "which month?" has no answer.
  const [yearSel,  setYearSel]  = useState('all')  // 'all' | FY start year 'YYYY'
  const [monthSel, setMonthSel] = useState('')     // '' (whole year) | 'YYYY-MM'
  // `fy` keeps its name — it threads through every tab as the period value:
  // 'all' | 'YYYY' | 'YYYY-MM' (see lib/period.js). A chosen month wins.
  const fy = monthSel || yearSel
  const [loading, setLoading] = useState(true)
  const [selectedVendor, setSelectedVendor] = useState(null)
  const [showAddCash, setShowAddCash] = useState(false)
  const [showMoveMoney, setShowMoveMoney] = useState(false)
  const [showPayVendor, setShowPayVendor] = useState(false)
  const [showAddVendor, setShowAddVendor] = useState(false)
  const [editVendor,    setEditVendor]    = useState(null)

  useEffect(() => {
    loadLedgerData().finally(() => setLoading(false))
    loadTrees().catch(() => {}) // ledger still renders if trees fail to load
  }, [])

  // Tree revenue reshaped to the khata's row shape (netAmount, paymentStatus…)
  // so BuyersTab treats a thekedar and a grain trader identically.
  const treeKhataRows = treeRevenue.map(r => {
    const names = [...new Set(r.plantingIds.map(id => {
      const p  = treePlantings.find(x => x.id === id)
      const sp = p && treeSpecies.find(x => x.id === p.speciesId)
      return sp ? (sp.nameEn?.trim() || sp.nameLocal) : null
    }).filter(Boolean))]
    const kind = r.revenueType === 'timber_sale' ? '🪵 Timber sale' : '🍋 Fruit lease'
    return {
      id:             r.id,
      date:           r.agreementDate || r.startDate || null,
      buyerId:        r.buyerId,
      buyerName:      r.buyerName || '',
      netAmount:      r.amount,
      amountReceived: r.amountReceived,
      paymentStatus:  r.paymentStatus,
      paymentDate:    r.paymentDate,
      treeLabel:      names.length ? `${kind} — ${names.join(', ')}` : kind,
    }
  })

  // Receipts against a buyer's carried-in opening balance — the one receivable
  // with no sale row behind it. Keyed by buyer id on the cash entry.
  const buyerReceipts = (ownerCashEntries || []).filter(e => e.entry_type === 'buyer_receipt')
  const buyerReceiptsById = buyerReceipts.reduce((m, e) => {
    if (e.reference_id) m[e.reference_id] = (m[e.reference_id] || 0) + Number(e.amount || 0)
    return m
  }, {})

  // Balance-sheet facts (cash in hand, what's owed either way) are always
  // as-of-today — they must NOT be scoped to the selected financial year,
  // or "Current Cash Balance" / "Balance Due" would misstate reality.
  const cashBalance = cashBook.length > 0
    ? Number(cashBook[cashBook.length - 1].running_balance)
    : 0
  // Each account's balance is its last row's account_running_balance.
  // The MAIN account is the first bank account — the same pick accountFor()
  // routes bank-mode transactions through (Vipul's, per the owner). It leads
  // the breakdown, then cash in hand, then the partners' accounts.
  const mainBankId = accounts.find(a => a.type === 'bank')?.id || null
  const acctRank = (a) => (a.id === mainBankId ? 0 : a.type === 'cash' ? 1 : 2)
  const accountBalances = accounts.map(a => {
    let balance = 0
    for (let i = cashBook.length - 1; i >= 0; i--) {
      if (cashBook[i].account_id === a.id) { balance = Number(cashBook[i].account_running_balance || 0); break }
    }
    return { id: a.id, name: a.name, type: a.type, balance, isMain: a.id === mainBankId }
  }).sort((x, y) => acctRank(x) - acctRank(y))
  const totalVendorDues = vendorBalances.reduce((s, v) => s + Math.max(0, Number(v.balance_due || 0)), 0)
  // Outside labour + general expenses incurred but not yet handed over. Salary is
  // NOT here — rostered workers settle through their khata, counted below.
  const totalWageDues = expenseLedger
    .filter(r => !r.is_paid && (r.expense_type === 'labour' || r.expense_type === 'farm_expense'))
    .reduce((s, r) => s + Number(r.amount || 0), 0)

  // Salary khata: only workers the farm actually owes. A worker carrying a
  // negative balance (over-drawn on advances) owes the FARM — netting him against
  // the others would hide real wage debt, so only positive balances are summed.
  const totalSalaryDues = salaryDues
    .reduce((s, w) => s + Math.max(0, Number(w.balance_due || 0)), 0)
  const salaryPaidTotal = salaryPayments.reduce((s, p) => s + Number(p.amount || 0), 0)
  // Receivable = what remains after partial payments, across crop and tree deals.
  // Plus whatever buyers already owed at go-live — crop taken before the app,
  // with no sale record behind it. The mirror of a party's opening balance.
  const buyerOpeningTotal = (buyers || [])
    .reduce((s, b) => s + Math.max(0, Number(b.openingBalance || 0) - (buyerReceiptsById[b.id] || 0)), 0)
  const totalReceivables = buyerOpeningTotal + [...sales, ...treeKhataRows]
    .filter(s => s.paymentStatus !== 'paid')
    .reduce((s, r) => s + Math.max(0, Number(r.netAmount || 0) - Number(r.amountReceived || 0)), 0)

  // P&L facts (income, expenses, profit) are period-based — scoped to the
  // selected financial year.
  const incomeLedgerFY   = incomeLedger.filter(r => inPeriod(r.entry_date, fy))
  const expenseLedgerFY  = expenseLedger.filter(r => inPeriod(r.entry_date, fy))
  const vendorPaymentsFY = vendorPayments.filter(p => inPeriod(p.payment_date, fy))
  // A single month is a TRANSACTION lens: only what the app recorded that
  // month. Whole-cycle figures — opening cost, expected revenue, the crop
  // P&L tables — attach to no month, because the owner's sheet states period
  // totals ("EXP. 01.06.26 TO 31.07.26"), not month-by-month spend: anchoring
  // ₹71,371 to July because the cycle was SOWN 16 July claims a precision the
  // data does not have, and showed "expense" in months before the app began
  // (books open 1 Aug 2026; everything earlier is opening balance). At FY
  // level the settled sow_date rule still applies — cane in 2025-26, paddy
  // in 2026-27.
  const cropPnlFY        = isMonth(fy) ? [] : cropPnl.filter(r => inPeriod(r.sow_date, fy))
  const monthlySummary   = monthlySummaryAll.filter(m => inPeriod(m.month, fy))
  const totalIncome    = incomeLedgerFY.reduce((s, r) => s + Number(r.amount || 0), 0)
  const expenseTxnsFY  = expenseLedgerFY.reduce((s, r) => s + Number(r.amount || 0), 0)
  // Pre-app crop spend falling inside the period. It is a stated opening figure,
  // not a transaction, so v_expense_ledger has no row for it — but v_crop_pnl
  // does, and the crop tables on the P&L tab read exactly these rows. Counting
  // it here is what stops the headline disagreeing with its own breakdown: the
  // tab used to show ₹17,293 out above a crop table listing ₹4,72,834 of cost.
  //
  // `opening_cost`, never `total_cost` — a cycle's input and labour cost is
  // already in the expense ledger as the purchase that supplied it, so adding
  // the whole figure would double-count. Openings reach the ledger by no path.
  //
  // Attribution follows the crop cycle, via sow_date (see cropPnlFY above).
  // A cane cycle sown in October reports against the FY it was sown in, even
  // where the spend ran on into the next one. That is the rule the per-cycle
  // costing already implies, and it needs nothing from the owner to hold.
  const openingCostFY  = cropPnlFY.reduce((s, r) => s + Number(r.opening_cost || 0), 0)
  const totalExpenses  = expenseTxnsFY + openingCostFY
  // What the period's cycles should bring at harvest — same rule and same
  // rows as the Dashboard's Expected card (lib/farmOverview.js): an active
  // cycle keeps max(billed, estimate); a finished one collapses to actual.
  const expectedRevenueFY = summarizeCropPnl(cropPnlFY).expected

  // Cash Book: list only the period's transactions, but carry forward an
  // opening balance from everything before the period started so the
  // running balance shown is still correct, not reset to zero.
  const range = periodRange(fy)
  const cashBookOpening = range
    ? cashBook.filter(r => r.entry_date < range.start).reduce((s, r) => s + (r.direction === 'in' ? Number(r.amount) : -Number(r.amount)), 0)
    : 0
  const cashBookPeriodRows = range ? cashBook.filter(r => r.entry_date >= range.start && r.entry_date <= range.end) : cashBook
  let _cashRunning = cashBookOpening
  const cashBookFY = cashBookPeriodRows.map(r => {
    _cashRunning += r.direction === 'in' ? Number(r.amount) : -Number(r.amount)
    return { ...r, running_balance: _cashRunning }
  })

  // ── Excel statement ─────────────────────────────────────────────────────────
  // One workbook, six sheets: everything the owner (or his accountant) needs to
  // know where the farm stands, in the format they already trust. The xlsx
  // library loads on click only, so it costs nothing until someone exports.
  const downloadExcel = async () => {
    const XLSX = await import('xlsx')
    const wb = XLSX.utils.book_new()
    const num = (n) => Math.round(Number(n || 0))
    const fyName = periodLabel(fy)

    const sheet = (name, rows, widths) => {
      const ws = XLSX.utils.aoa_to_sheet(rows)
      if (widths) ws['!cols'] = widths.map(wch => ({ wch }))
      XLSX.utils.book_append_sheet(wb, ws, name)
    }

    sheet('Summary', [
      ['FARM ACCOUNTS STATEMENT'],
      ['Period', fyName],
      ['Generated on', new Date().toLocaleDateString('en-IN')],
      [],
      ['PROFIT & LOSS (period)'],
      ['Total Income',   num(totalIncome)],
      ['Total Expenses', num(totalExpenses)],
      // Split out so an accountant reading this can see at a glance which part
      // is app-recorded transactions and which is the owner's stated pre-app cost.
      ...(openingCostFY > 0 ? [
        ['  of which recorded in the app',  num(expenseTxnsFY)],
        ['  of which spent before the app', num(openingCostFY)],
      ] : []),
      ['Net Profit',     num(totalIncome - totalExpenses)],
      // Forward-looking, deliberately outside the P&L arithmetic above: what
      // the period's cycles should bring at harvest, at the crop-master rates.
      // Absent under a month view, where whole-cycle figures do not report.
      ...(expectedRevenueFY > 0 ? [
        ['Expected Revenue at harvest (not in P&L)', num(expectedRevenueFY)],
      ] : []),
      [],
      ['POSITION AS OF TODAY'],
      ['Cash Balance (all accounts)',     num(cashBalance)],
      ...accountBalances.map(a => [`  ${a.name}`, num(a.balance)]),
      ['Vendor Dues (farm owes)',         num(totalVendorDues)],
      ['Salary Dues (farm owes workers)', num(totalSalaryDues)],
      ['Unpaid Wages & Expenses',         num(totalWageDues)],
      ['Receivables (owed to farm)',      num(totalReceivables)],
      [],
      ['MONTH-WISE'],
      ['Month', 'Income', 'Expenses', 'Profit'],
      ...monthlySummary.map(m => [
        MonthLabel(m.month), num(m.total_income), num(m.total_expenses), num(m.net_profit),
      ]),
    ], [26, 14, 14, 14])

    sheet('Income', [
      ['Date', 'Source', 'Description', 'From / Crop', 'Buyer', 'Amount', 'Received', 'Status'],
      ...[...incomeLedgerFY]
        .sort((a, b) => new Date(a.entry_date) - new Date(b.entry_date))
        .map(r => [
          r.entry_date, r.source_type, r.description, r.entity_name || '',
          r.buyer_name || '', num(r.amount), num(r.amount_received), r.payment_status || 'paid',
        ]),
    ], [11, 12, 22, 24, 18, 12, 12, 10])

    sheet('Expenses', [
      ['Date', 'Category', 'Description', 'Amount', 'Paid'],
      ...[...expenseLedgerFY]
        .sort((a, b) => new Date(a.entry_date) - new Date(b.entry_date))
        .map(r => [
          r.entry_date, CATEGORY_LABELS[r.category] || r.category,
          r.description, num(r.amount), r.is_paid ? 'Yes' : 'No',
        ]),
    ], [11, 20, 34, 12, 8])

    sheet('Cash Book', [
      ['Date', 'Particulars', 'Account', 'Receipt', 'Payment', 'Balance'],
      ...(fy !== 'all' ? [['', 'Opening balance', '', '', '', num(cashBookOpening)]] : []),
      ...cashBookFY.map(r => [
        r.entry_date, r.particulars, r.account_name || '',
        r.direction === 'in'  ? num(r.amount) : '',
        r.direction === 'out' ? num(r.amount) : '',
        num(r.running_balance),
      ]),
    ], [11, 30, 14, 12, 12, 12])

    sheet('Vendor Khata', [
      ['Vendor', 'Category', 'Opening', 'Purchased', 'Paid', 'Balance Due'],
      ...vendorBalances.map(v => [
        v.vendor_name, v.category || '', num(v.opening_balance || 0),
        num(v.total_purchased), num(v.total_paid), num(v.balance_due),
      ]),
    ], [26, 16, 12, 12, 12, 12])

    // The receivables side — same standing as the vendor khata. Sold/Received
    // are all-time here (the statement's other khatas are positions too).
    {
      const buyerRows = {}
      buyers.filter(b => b.isActive !== false).forEach(b => {
        buyerRows[b.id] = { name: b.name, opening: Number(b.openingBalance || 0), sold: 0,
                            // Receipts against the opening balance count as received
                            // here too, or the sheet would disagree with the screen.
                            received: buyerReceiptsById[b.id] || 0 }
      })
      ;[...sales.filter(s => s.buyerName), ...treeKhataRows.filter(s => s.buyerName)].forEach(s => {
        const key = s.buyerId || `name:${s.buyerName.trim().toLowerCase()}`
        if (!buyerRows[key]) buyerRows[key] = { name: s.buyerName, opening: 0, sold: 0, received: 0 }
        buyerRows[key].sold     += Number(s.netAmount || 0)
        buyerRows[key].received += s.paymentStatus === 'paid' ? Number(s.netAmount || 0) : Number(s.amountReceived || 0)
      })
      sheet('Buyer Khata', [
        ['Buyer', 'Opening', 'Sold', 'Received', 'Balance Due'],
        ...Object.values(buyerRows)
          .map(b => ({ ...b, due: b.opening + b.sold - b.received }))
          .sort((a, b) => b.due - a.due)
          .map(b => [b.name, num(b.opening), num(b.sold), num(b.received), num(b.due)]),
      ], [26, 12, 12, 12, 12])
    }

    sheet('Salary Khata', [
      ['Worker', 'Type', 'Opening', 'Earned', 'Advances', 'Paid', 'Balance Due'],
      ...[...salaryDues]
        .sort((a, b) => Number(b.balance_due || 0) - Number(a.balance_due || 0))
        .map(w => [
          w.name, w.sub_type === 'permanent' ? 'Staff' : 'Regular',
          num(w.opening_balance), num(w.total_earned), num(w.total_advances),
          num(w.total_paid), num(w.balance_due),
        ]),
    ], [22, 10, 12, 12, 12, 12, 13])

    // Buyer khata: same grouping the Buyer Khata tab shows — crop and tree deals
    // together, partial payments counted.
    const byBuyer = {}
    ;[...sales.filter(s => s.buyerName), ...treeKhataRows.filter(s => s.buyerName)].forEach(s => {
      const key = s.buyerId || s.buyerName.trim().toLowerCase()
      if (!byBuyer[key]) byBuyer[key] = { name: s.buyerName, sold: 0, received: 0 }
      byBuyer[key].sold     += Number(s.netAmount || 0)
      byBuyer[key].received += s.paymentStatus === 'paid' ? Number(s.netAmount || 0) : Number(s.amountReceived || 0)
    })
    sheet('Buyer Khata', [
      ['Buyer', 'Sold', 'Received', 'Balance Due'],
      ...Object.values(byBuyer)
        .sort((a, b) => (b.sold - b.received) - (a.sold - a.received))
        .map(b => [b.name, num(b.sold), num(b.received), num(b.sold - b.received)]),
    ], [26, 14, 14, 14])

    // Cash Flow — built from the same function the screen renders, so the sheet
    // and the screen cannot disagree.
    const flow = buildCashFlow(cashBookFY, {
      openingCash: cashBookOpening,
      capitalPurchases: (capitalPurchases || []).filter(c => inPeriod(c.purchase_date, fy)),
    })
    const flowRows = [
      ['CASH FLOW STATEMENT', '', fyName],
      ['Direct method — actual cash received and paid, not what was billed.'],
      [],
      ['Opening cash (all pockets)', num(flow.openingCash)],
      [],
    ]
    flow.sections.forEach(s => {
      flowRows.push([s.heading.toUpperCase() + ' — ' + s.plain])
      s.lines.forEach(l => flowRows.push(['   ' + l.label, num(l.amount)]))
      flowRows.push([s.subtotalLabel, num(s.subtotal)])
      if (s.key === 'investing') {
        flowRows.push(['   No capital cash can be shown separately — a payment settles the vendor, not the individual bill.'])
        if (flow.memo.capitalBilled > 0) {
          flowRows.push(['   MEMO (not cash) — capital items billed', num(flow.memo.capitalBilled)])
          flow.memo.items.forEach(it => flowRows.push(['      ' + (it.name || 'Capital item'), num(it.amount)]))
          flowRows.push(['   That cash sits inside "Paid to vendors" above.'])
        }
      }
      flowRows.push([])
    })
    flowRows.push(['Closing cash (all pockets)', num(flow.closingCash)])
    flowRows.push([flow.reconciles
      ? 'Matches the Cash Book closing balance.'
      : `DOES NOT match the Cash Book — out by ${num(Math.abs(flow.discrepancy))}`])
    flowRows.push(['Money moved between the farm\'s own accounts is excluded — it changes no farm total.'])
    sheet('Cash Flow', flowRows, [52, 16])

    XLSX.writeFile(wb, `Farm-Accounts-${periodSlug(fy)}.xlsx`)
  }

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

      {/* Period selector — applies to every tab. Two filters, coarse then
          fine: Standing Crops sits above the FY years in the first; the
          second drills into the chosen year month by month. */}
      <div className="shrink-0 flex items-center gap-2 px-4 pb-3">
        <span className="text-[10px] shrink-0" style={{ color: 'var(--c-faint)' }}>View:</span>
        <select
          value={yearSel}
          onChange={e => { setYearSel(e.target.value); setMonthSel('') }}
          className="px-2.5 py-1.5 rounded-xl text-xs font-medium outline-none"
          style={{ background: 'var(--c-ghost)', color: 'var(--c-text)', border: '0.5px solid var(--c-border)' }}>
          <option value="all">Standing Crops · All</option>
          {fyOptions().map(opt => (
            <option key={opt} value={opt}>FY {fyLabel(opt)}</option>
          ))}
        </select>
        <select
          value={monthSel}
          onChange={e => setMonthSel(e.target.value)}
          disabled={yearSel === 'all'}
          title={yearSel === 'all' ? 'Pick a financial year first' : undefined}
          className="px-2.5 py-1.5 rounded-xl text-xs font-medium outline-none"
          style={{ background: 'var(--c-ghost)', border: '0.5px solid var(--c-border)',
                   color: yearSel === 'all' ? 'var(--c-faint)' : 'var(--c-text)',
                   opacity: yearSel === 'all' ? 0.55 : 1 }}>
          <option value="">{yearSel === 'all' ? 'Month —' : 'All months'}</option>
          {yearSel !== 'all' && fyMonths(yearSel).map(m => (
            <option key={m} value={m}>{monthLabel(m)}</option>
          ))}
        </select>
        <button onClick={downloadExcel}
          className="ml-auto flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-xs font-medium shrink-0"
          style={{ background: 'var(--c-ghost)', color: '#1D9E75', border: '0.5px solid var(--c-border)' }}>
          <Download size={12} /> Excel
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-4 pb-20">
        {tab === 'summary'  && (
          <SummaryTab
            cashBalance={cashBalance}
            accountBalances={accountBalances}
            totalIncome={totalIncome}
            totalExpenses={totalExpenses}
            totalVendorDues={totalVendorDues}
            totalReceivables={totalReceivables}
            totalWageDues={totalWageDues}
            totalSalaryDues={totalSalaryDues}
            capitalSpendFY={(capitalPurchases || [])
              .filter(c => c.is_capitalised && inPeriod(c.purchase_date, fy))
              .reduce((s, c) => s + Number(c.amount || 0), 0)}
            openingCost={openingCostFY}
            expectedRevenue={expectedRevenueFY}
            onGoSalary={() => navigate('/labour')}
            monthlySummary={monthlySummary}
          />
        )}
        {/* Cash Book — the entries, then the same rupees regrouped into where they
            came from and where they went. A toggle, not a sixth tab: a cash flow
            statement is a second reading of this exact list. */}
        {tab === 'cashbook' && (
          <>
            <ViewToggle value={cashBookView} onChange={setCashBookView}
              options={[['entries', 'Entries'], ['cashflow', 'Cash Flow']]} />
            {cashBookView === 'entries'
              ? <CashBookTab
                  cashBook={cashBookFY}
                  accounts={accounts}
                  openingBalance={cashBookOpening}
                  showOpening={fy !== 'all'}
                  onAdd={() => setShowAddCash(true)}
                  onMove={() => setShowMoveMoney(true)}
                />
              : <CashFlowTab
                  cashBook={cashBookFY}
                  openingBalance={cashBookOpening}
                  capitalPurchases={(capitalPurchases || []).filter(c => inPeriod(c.purchase_date, fy))}
                  periodLabel={periodLabel(fy)}
                />}
          </>
        )}
        {/* Money In — the same rupees two ways: what was sold, then who still
            owes for it. A toggle, not two tabs, so they read as one story. */}
        {tab === 'moneyin' && (
          <>
            <ViewToggle value={moneyInView} onChange={setMoneyInView}
              options={[['sales', 'Sales & Income'], ['buyers', 'Buyer Khata (who owes me)']]} />
            {moneyInView === 'sales'
              ? <IncomeTab incomeLedger={incomeLedgerFY} cropResiduals={cropResiduals} onRecordSale={recordResidualSale} />
              : <BuyersTab
                  sales={sales} buyers={buyers}
                  harvestSessions={harvestSessions} cropCycles={cropCycles} cropMaster={cropMaster}
                  treeSales={treeKhataRows}
                  fy={fy}
                  buyerReceipts={buyerReceipts}
                  canRecordReceipt={canManage}
                  onRecordReceipt={addBuyerReceipt}
                />}
          </>
        )}
        {tab === 'moneyout' && moneyOutView === 'parties' && (
          <>
            <ViewToggle value={moneyOutView} onChange={setMoneyOutView}
              options={[['expenses', 'Expenses'], ['parties', 'Party Khata (whom I owe)']]} />
            <VendorTab
              vendors={vendors}
              selectedVendor={selectedVendor}
              setSelectedVendor={setSelectedVendor}
              onPay={() => setShowPayVendor(true)}
              onAddVendor={() => setShowAddVendor(true)}
              onEditVendor={setEditVendor}
              canPay={canManage}
              fy={fy}
            />
          </>
        )}
        {tab === 'moneyout' && moneyOutView === 'expenses' && (
          <>
          <ViewToggle value={moneyOutView} onChange={setMoneyOutView}
            options={[['expenses', 'Expenses'], ['parties', 'Party Khata (whom I owe)']]} />
          <ExpensesTab
            expenseLedger={expenseLedgerFY} vendorPayments={vendorPaymentsFY}
            salaryPaidTotal={salaryPaidTotal}
            openingCost={openingCostFY}
            purchases={purchases} inventoryMaster={inventoryMaster}
            canPay={canManage}
            onGoVendors={() => setMoneyOutView('parties')}
            onGoSalary={() => navigate('/labour')}
            onPayRow={async (row) => {
              if (!confirm(`Pay ${row.description} — ₹${Math.round(row.amount).toLocaleString('en-IN')} in cash today?`)) return
              try {
                if (row.expense_type === 'labour') {
                  await markLabourPaid(row)
                } else {
                  await addExpensePayment({
                    payment_date: new Date().toISOString().slice(0, 10),
                    amount:       row.amount,
                    expense_type: 'farm_expense',
                    reference_id: row.id,
                    notes:        row.description,
                  })
                }
              } catch (e) { alert('Payment failed: ' + e.message) }
            }}
          />
          </>
        )}
        {tab === 'pnl'      && (
          <PnlTab
            totalIncome={totalIncome}
            totalExpenses={totalExpenses}
            openingCost={openingCostFY}
            livestockPnl={livestockPnl}
            cropPnl={cropPnlFY}
            isMonthView={isMonth(fy)}
          />
        )}
      </div>

      {/* Modals */}
      {showAddCash    && <AddCashModal   accounts={accounts} onClose={() => setShowAddCash(false)} onSave={addOwnerCashEntry} />}
      {showMoveMoney  && <MoveMoneyModal accounts={accounts} onClose={() => setShowMoveMoney(false)} onSave={recordTransfer} />}
      {showPayVendor  && <PayVendorModal vendors={vendors} selectedVendor={selectedVendor} onClose={() => setShowPayVendor(false)} onSave={addVendorPayment} />}
      {showAddVendor  && <VendorModal onClose={() => setShowAddVendor(false)} onSave={addVendor} />}
      {editVendor     && (
        <VendorModal vendor={editVendor} onClose={() => setEditVendor(null)}
          onSave={(form) => updateVendor(editVendor.id, form)} />
      )}
    </div>
  )
}

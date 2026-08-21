import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAppStore } from '../store'
import FilePicker from '../components/FilePicker'
import { uploadAttachment, BUCKETS } from '../lib/attachments'

// This file used to be a full page — the Expenses tab on Today, with a summary
// header, category filter chips and a delete-able list. The owner asked for the
// tab to go: logging an expense should be a button like Log Activity, not a
// screen. So only the form survives, as AddExpenseModal, opened from Today's
// day card (and deep-linked via /today?log=expense). Browsing lives where it
// already lived — the day cards show each day's spend, the Ledger's Expenses
// tab shows the full list and settles unpaid ones.

const DOCS  = BUCKETS.docs
const TODAY = new Date().toISOString().slice(0, 10)

// Must stay in sync with the farm_expenses_category_check constraint (migration
// 0019) — a category offered here but missing there fails the insert with 23514.
const EXPENSE_CATS = [
  ['feed',           '🌾', 'Feed'],
  ['veterinary',     '💉', 'Veterinary'],
  ['medicine',       '💊', 'Medicine'],
  ['accessories',    '🦴', 'Accessories'],
  ['livestock_care', '🪢', 'Livestock Care'],
  ['machinery',      '🚜', 'Machinery / Hired Equipment'],
  ['maintenance',    '🔧', 'Maintenance'],
  ['plants',         '🌱', 'Saplings / Plants'],
  ['infrastructure', '🏗',  'Infrastructure'],
  ['construction',   '🧱', 'Construction'],
  ['utilities',      '⚡', 'Utilities'],
  ['event',          '🎉', 'Event'],
  ['administrative', '📋', 'Administrative'],
  ['other',          '📦', 'Other'],
]

const EXPENSE_TYPES = [
  // Pets live on the Livestock screen too, and their spend is food, accessories,
  // vet and medicine — hence the last two.
  { key: 'livestock',      emoji: '🐄', label: 'Livestock',      attributedTo: 'livestock', cats: ['feed', 'veterinary', 'medicine', 'accessories', 'livestock_care'] },
  { key: 'crop_field',     emoji: '🌾', label: 'Crop / Field',   attributedTo: 'general',   cats: ['machinery', 'maintenance'] },
  // Saplings for new trees — the owner's ask, so tree spend stops hiding in
  // Other. Bought plants land here; the trees themselves live on the Trees
  // screen (count via tree_count_logs 'planted'), never in inventory.
  { key: 'trees',          emoji: '🌳', label: 'Trees',          attributedTo: 'general',   cats: ['plants', 'maintenance', 'other'] },
  { key: 'infrastructure', emoji: '🏗', label: 'Infrastructure', attributedTo: 'asset',     cats: ['infrastructure', 'construction', 'maintenance'] },
  { key: 'admin',          emoji: '📋', label: 'Administrative', attributedTo: 'general',   cats: ['administrative', 'utilities', 'event'] },
  { key: 'other',          emoji: '📦', label: 'Other',          attributedTo: 'general',   cats: ['other'] },
]

// Money that looks like an expense but has its own door. These render as the
// leading options under Crop / Field — the owner's call: whoever opens Log
// Expense meaning to book field spend gets sent to the right screen instead of
// double-booking it here. Wages must go through Log Work (plot-wise split,
// salary khata); input and machine purchases through a Resources bill (vendor
// khata, stock, and crop cost via issues).
const REDIRECTS = {
  crop_field: [
    { emoji: '👷', label: 'Log Work',   to: '/labour?go=log-work' },
    { emoji: '📦', label: 'Buy Inputs', to: '/resources' },
  ],
}

const PAY_MODES = ['cash', 'upi', 'bank', 'credit']

const inp = 'w-full px-3 py-2.5 rounded-xl text-sm border outline-none bg-[var(--c-ghost)] border-[var(--c-border)] text-[var(--c-text)]'

function Modal({ title, onClose, children }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center" style={{ background: 'rgba(0,0,0,0.5)' }}>
      <div className="w-full max-w-lg rounded-t-2xl p-5 pb-8 space-y-4"
        style={{ background: 'var(--c-nav)', maxHeight: '92vh', overflowY: 'auto' }}>
        <div className="flex items-center justify-between">
          <p className="font-semibold text-sm" style={{ color: 'var(--c-text)' }}>{title}</p>
          <button onClick={onClose} className="text-lg" style={{ color: 'var(--c-muted)' }}>✕</button>
        </div>
        {children}
      </div>
    </div>
  )
}

function FRow({ label, children }) {
  return (
    <div className="space-y-1">
      <p className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: 'var(--c-muted)' }}>{label}</p>
      {children}
    </div>
  )
}

// FilePicker handles crop-on-pick, tap-to-expand, change and remove. The upload still
// fires as soon as a file is chosen, so `value` stays a storage path as before.
function AttachmentRow({ value, onChange, uploading, onUpload }) {
  return (
    <FRow label={uploading ? 'Attachment — uploading…' : 'Attachment (receipt / proof)'}>
      <FilePicker
        accept="image/*,application/pdf"
        bucket={DOCS}
        preview={value}
        onFile={f => (f ? onUpload(f) : onChange(null))}
      />
    </FRow>
  )
}

export function AddExpenseModal({ animals, onClose }) {
  const addFarmExpense = useAppStore(s => s.addFarmExpense)
  const navigate = useNavigate()
  const [form, setForm] = useState({
    expenseDate: TODAY, expenseType: '', category: '', amount: '', description: '',
    attributedTo: 'general', livestockId: '', paymentMode: 'cash', paidTo: '', notes: '',
    // Most farm expenses are handed over at the counter, so paid is the default.
    paidNow: true,
  })
  const [attachPath, setAttachPath] = useState(null)
  const [uploading, setUploading] = useState(false)
  const [saving, setSaving] = useState(false)

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  function selectType(typeKey) {
    const t = EXPENSE_TYPES.find(t => t.key === typeKey)
    setForm(f => ({ ...f, expenseType: typeKey, attributedTo: t.attributedTo, category: '' }))
  }

  const activeType   = EXPENSE_TYPES.find(t => t.key === form.expenseType)
  const visibleCats  = activeType
    ? EXPENSE_CATS.filter(([v]) => activeType.cats.includes(v))
    : []

  async function handleUpload(file) {
    if (!file) return
    setUploading(true)
    try { setAttachPath(await uploadAttachment(file, { folder: 'expense-docs', bucket: DOCS })) }
    catch (e) { alert('Upload failed: ' + e.message) }
    finally { setUploading(false) }
  }

  async function save() {
    if (!form.expenseType)  return alert('Select an expense type')
    if (!form.category)     return alert('Select a category')
    if (!form.amount || !form.description) return alert('Fill amount and description')
    setSaving(true)
    try {
      await addFarmExpense({ ...form, amount: parseFloat(form.amount), attachmentPath: attachPath })
      onClose()
    } catch (e) { alert('Save failed: ' + e.message) }
    finally { setSaving(false) }
  }

  return (
    <Modal title="Add Expense" onClose={onClose}>
      <FRow label="Date">
        <input type="date" className={inp} value={form.expenseDate}
          onChange={e => set('expenseDate', e.target.value)} />
      </FRow>

      {/* Step 1: Expense Type */}
      <FRow label="Expense Type">
        <div className="grid grid-cols-3 gap-1.5">
          {EXPENSE_TYPES.map(({ key, emoji, label }) => (
            <button key={key} onClick={() => selectType(key)}
              className="py-2.5 rounded-xl text-xs font-semibold transition-colors flex flex-col items-center gap-0.5"
              style={{
                background: form.expenseType === key ? '#8A9A5B' : 'var(--c-ghost)',
                color:      form.expenseType === key ? '#fff'     : 'var(--c-muted)',
                border:     `1px solid ${form.expenseType === key ? '#8A9A5B' : 'var(--c-border)'}`,
              }}>
              <span className="text-base">{emoji}</span>
              <span>{label}</span>
            </button>
          ))}
        </div>
      </FRow>

      {/* Step 2: Category — filtered by type. Redirect chips lead: spends that
          have their own screen route there instead of double-booking here. */}
      {visibleCats.length > 0 && (
        <FRow label="Category">
          <div className="grid grid-cols-3 gap-1.5">
            {(REDIRECTS[form.expenseType] || []).map(({ emoji, label, to }) => (
              <button key={to} onClick={() => { onClose(); navigate(to) }}
                className="py-2 rounded-xl text-xs font-semibold transition-colors"
                style={{
                  background: 'var(--c-ghost)',
                  color:      '#8A9A5B',
                  border:     '1px dashed #8A9A5B',
                }}>
                {emoji} {label} →
              </button>
            ))}
            {visibleCats.map(([v, emoji, label]) => (
              <button key={v} onClick={() => set('category', v)}
                className="py-2 rounded-xl text-xs font-medium transition-colors"
                style={{
                  background: form.category === v ? '#8A9A5B' : 'var(--c-ghost)',
                  color:      form.category === v ? '#fff'     : 'var(--c-muted)',
                  border:     `1px solid ${form.category === v ? '#8A9A5B' : 'var(--c-border)'}`,
                }}>
                {emoji} {label}
              </button>
            ))}
          </div>
        </FRow>
      )}

      {/* Step 3: Animal selector — only for livestock type */}
      {form.expenseType === 'livestock' && animals.length > 0 && (
        <FRow label="Animal (optional)">
          <select className={inp} value={form.livestockId} onChange={e => set('livestockId', e.target.value)}>
            <option value="">— Any / Whole Herd —</option>
            {animals.filter(a => a.status === 'active').map(a => (
              <option key={a.id} value={a.id}>{a.name || a.tagId} ({a.species})</option>
            ))}
          </select>
        </FRow>
      )}

      <FRow label="Amount (₹)">
        <input type="number" className={inp} placeholder="0" value={form.amount}
          onChange={e => set('amount', e.target.value)} />
      </FRow>

      <FRow label="Description">
        <input type="text" className={inp} placeholder="What was this expense for?"
          value={form.description} onChange={e => set('description', e.target.value)} />
      </FRow>

      <FRow label="Paid To (optional)">
        <input type="text" className={inp} placeholder="Vendor / person name"
          value={form.paidTo} onChange={e => set('paidTo', e.target.value)} />
      </FRow>

      {/* The question that decides whether cash actually moves. Picking a
          payment mode used to imply this and never do it — the mode was a label
          nothing read, so an expense could say "cash" and "unpaid" at once. */}
      <FRow label="Has this been paid?">
        <div className="flex gap-2">
          {[{ v: true, label: 'Paid now' }, { v: false, label: 'Pay later' }].map(({ v, label }) => (
            <button key={label} onClick={() => set('paidNow', v)}
              className="flex-1 py-2 rounded-xl text-xs font-semibold transition-colors"
              style={{
                background: form.paidNow === v ? '#8A9A5B' : 'var(--c-ghost)',
                color:      form.paidNow === v ? '#fff'     : 'var(--c-muted)',
                border:     `1px solid ${form.paidNow === v ? '#8A9A5B' : 'var(--c-border)'}`,
              }}>
              {label}
            </button>
          ))}
        </div>
        <p className="text-[10px] mt-1.5 leading-snug" style={{ color: 'var(--c-faint)' }}>
          {form.paidNow
            ? 'Money leaves the Cash Book today.'
            : 'Recorded as a cost only — settle it later from Ledger → Expenses.'}
        </p>
      </FRow>

      {form.paidNow && (
        <FRow label="Paid By">
          <div className="flex gap-2">
            {PAY_MODES.map(m => (
              <button key={m} onClick={() => set('paymentMode', m)}
                className="flex-1 py-2 rounded-xl text-xs font-semibold capitalize transition-colors"
                style={{
                  background: form.paymentMode === m ? '#8A9A5B' : 'var(--c-ghost)',
                  color:      form.paymentMode === m ? '#fff'     : 'var(--c-muted)',
                  border:     `1px solid ${form.paymentMode === m ? '#8A9A5B' : 'var(--c-border)'}`,
                }}>
                {m}
              </button>
            ))}
          </div>
        </FRow>
      )}

      <AttachmentRow value={attachPath} onChange={setAttachPath} uploading={uploading} onUpload={handleUpload} />

      <FRow label="Notes (optional)">
        <textarea className={inp} rows={2} placeholder="Additional notes…"
          value={form.notes} onChange={e => set('notes', e.target.value)} />
      </FRow>

      <button onClick={save} disabled={saving}
        className="w-full py-3 rounded-xl font-semibold text-sm text-white transition-opacity"
        style={{ background: '#8A9A5B', opacity: saving ? 0.6 : 1 }}>
        {saving ? 'Saving…' : 'Save Expense'}
      </button>
    </Modal>
  )
}

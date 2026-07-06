import React, { useState, useRef } from 'react'
import { Plus, Trash2, Paperclip, X } from 'lucide-react'
import { useAppStore } from '../store'
import { supabase } from '../lib/supabase'

const TODAY = new Date().toISOString().slice(0, 10)

const EXPENSE_CATS = [
  ['feed',           '🌾', 'Feed'],
  ['veterinary',     '💉', 'Veterinary'],
  ['livestock_care', '🪢', 'Livestock Care'],
  ['machinery',      '🚜', 'Machinery / Hired Equipment'],
  ['maintenance',    '🔧', 'Maintenance'],
  ['infrastructure', '🏗',  'Infrastructure'],
  ['construction',   '🧱', 'Construction'],
  ['utilities',      '⚡', 'Utilities'],
  ['event',          '🎉', 'Event'],
  ['administrative', '📋', 'Administrative'],
  ['other',          '📦', 'Other'],
]

const EXPENSE_TYPES = [
  { key: 'livestock',      emoji: '🐄', label: 'Livestock',      attributedTo: 'livestock', cats: ['feed', 'veterinary', 'livestock_care'] },
  { key: 'crop_field',     emoji: '🌾', label: 'Crop / Field',   attributedTo: 'general',   cats: ['machinery', 'maintenance'] },
  { key: 'infrastructure', emoji: '🏗', label: 'Infrastructure', attributedTo: 'asset',     cats: ['infrastructure', 'construction', 'maintenance'] },
  { key: 'admin',          emoji: '📋', label: 'Administrative', attributedTo: 'general',   cats: ['administrative', 'utilities', 'event'] },
  { key: 'other',          emoji: '📦', label: 'Other',          attributedTo: 'general',   cats: ['other'] },
]

const PAY_MODES = ['cash', 'upi', 'bank', 'credit']

const fmt  = n => n != null ? `₹${Number(n).toLocaleString('en-IN')}` : '—'
const fmtK = n => n >= 1000 ? `₹${(n / 1000).toFixed(1)}K` : fmt(n)

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

function AttachmentRow({ value, onChange, uploading, onUpload }) {
  const fileRef = useRef()
  return (
    <FRow label="Attachment (receipt / proof)">
      {value ? (
        <div className="flex items-center gap-2 px-3 py-2 rounded-xl border border-[var(--c-border)] bg-[var(--c-ghost)]">
          <Paperclip size={14} style={{ color: 'var(--c-muted)' }} />
          <span className="flex-1 text-xs truncate" style={{ color: 'var(--c-text)' }}>
            {value.split('/').pop()}
          </span>
          <button onClick={() => onChange(null)} style={{ color: 'var(--c-muted)' }}><X size={14} /></button>
        </div>
      ) : (
        <button onClick={() => fileRef.current?.click()} disabled={uploading}
          className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl border border-dashed text-sm transition-colors"
          style={{ borderColor: 'var(--c-border)', color: 'var(--c-muted)' }}>
          <Paperclip size={14} />
          {uploading ? 'Uploading…' : 'Attach file'}
        </button>
      )}
      <input ref={fileRef} type="file" accept="image/*,application/pdf" className="hidden"
        onChange={e => onUpload(e.target.files[0])} />
    </FRow>
  )
}

async function uploadAttachment(file) {
  const ext  = file.name.split('.').pop()
  const path = `expense-docs/${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`
  const { error } = await supabase.storage.from('expense-docs').upload(path, file)
  if (error) throw error
  return path
}

function AddExpenseModal({ animals, onClose }) {
  const addFarmExpense = useAppStore(s => s.addFarmExpense)
  const [form, setForm] = useState({
    expenseDate: TODAY, expenseType: '', category: '', amount: '', description: '',
    attributedTo: 'general', livestockId: '', paymentMode: 'cash', paidTo: '', notes: '',
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
    try { setAttachPath(await uploadAttachment(file)) }
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
                background: form.expenseType === key ? '#1D9E75' : 'var(--c-ghost)',
                color:      form.expenseType === key ? '#fff'     : 'var(--c-muted)',
                border:     `1px solid ${form.expenseType === key ? '#1D9E75' : 'var(--c-border)'}`,
              }}>
              <span className="text-base">{emoji}</span>
              <span>{label}</span>
            </button>
          ))}
        </div>
      </FRow>

      {/* Step 2: Category — filtered by type */}
      {visibleCats.length > 0 && (
        <FRow label="Category">
          <div className="grid grid-cols-3 gap-1.5">
            {visibleCats.map(([v, emoji, label]) => (
              <button key={v} onClick={() => set('category', v)}
                className="py-2 rounded-xl text-xs font-medium transition-colors"
                style={{
                  background: form.category === v ? '#1D9E75' : 'var(--c-ghost)',
                  color:      form.category === v ? '#fff'     : 'var(--c-muted)',
                  border:     `1px solid ${form.category === v ? '#1D9E75' : 'var(--c-border)'}`,
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

      <FRow label="Payment Mode">
        <div className="flex gap-2">
          {PAY_MODES.map(m => (
            <button key={m} onClick={() => set('paymentMode', m)}
              className="flex-1 py-2 rounded-xl text-xs font-semibold capitalize transition-colors"
              style={{
                background: form.paymentMode === m ? '#1D9E75' : 'var(--c-ghost)',
                color:      form.paymentMode === m ? '#fff'     : 'var(--c-muted)',
                border:     `1px solid ${form.paymentMode === m ? '#1D9E75' : 'var(--c-border)'}`,
              }}>
              {m}
            </button>
          ))}
        </div>
      </FRow>

      <AttachmentRow value={attachPath} onChange={setAttachPath} uploading={uploading} onUpload={handleUpload} />

      <FRow label="Notes (optional)">
        <textarea className={inp} rows={2} placeholder="Additional notes…"
          value={form.notes} onChange={e => set('notes', e.target.value)} />
      </FRow>

      <button onClick={save} disabled={saving}
        className="w-full py-3 rounded-xl font-semibold text-sm text-white transition-opacity"
        style={{ background: '#1D9E75', opacity: saving ? 0.6 : 1 }}>
        {saving ? 'Saving…' : 'Save Expense'}
      </button>
    </Modal>
  )
}

export default function Expenses() {
  const { farmExpenses, livestockMaster, deleteFarmExpense } = useAppStore(s => ({
    farmExpenses:      s.farmExpenses,
    livestockMaster:   s.livestockMaster,
    deleteFarmExpense: s.deleteFarmExpense,
  }))
  const [filterCat, setFilterCat] = useState('all')
  const [showModal, setShowModal] = useState(false)

  const filtered = filterCat === 'all'
    ? farmExpenses
    : farmExpenses.filter(e => e.category === filterCat)

  const total = filtered.reduce((s, e) => s + e.amount, 0)

  const catInfo    = cat => EXPENSE_CATS.find(([v]) => v === cat) || ['other', '📦', cat]
  const animalName = id => {
    if (!id) return null
    const a = livestockMaster.find(a => a.id === id)
    return a ? (a.name || a.tagId) : null
  }

  async function confirmDelete(id) {
    if (!confirm('Delete this expense?')) return
    try { await deleteFarmExpense(id) } catch (e) { alert(e.message) }
  }

  return (
    <div className="flex flex-col h-full overflow-hidden" style={{ background: 'var(--c-bg)' }}>
      {/* Summary + add */}
      <div className="shrink-0 px-4 pt-3 pb-3 border-b space-y-3" style={{ borderColor: 'var(--c-border)' }}>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-[10px]" style={{ color: 'var(--c-muted)' }}>
              {filterCat === 'all' ? 'All Expenses' : catInfo(filterCat)[2]}
            </p>
            <p className="text-lg font-bold" style={{ color: '#E24B4A' }}>{fmtK(total)}</p>
          </div>
          <button onClick={() => setShowModal(true)}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-semibold text-white"
            style={{ background: '#1D9E75' }}>
            <Plus size={15} /> Add
          </button>
        </div>

        {/* Category filter chips */}
        <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-hide">
          <button onClick={() => setFilterCat('all')}
            className="shrink-0 px-3 py-1 rounded-full text-[11px] font-semibold"
            style={{ background: filterCat === 'all' ? '#1D9E75' : 'var(--c-ghost)', color: filterCat === 'all' ? '#fff' : 'var(--c-muted)' }}>
            All
          </button>
          {EXPENSE_CATS.map(([v, emoji, label]) => (
            <button key={v} onClick={() => setFilterCat(v)}
              className="shrink-0 px-3 py-1 rounded-full text-[11px] font-semibold"
              style={{ background: filterCat === v ? '#1D9E75' : 'var(--c-ghost)', color: filterCat === v ? '#fff' : 'var(--c-muted)' }}>
              {emoji} {label}
            </button>
          ))}
        </div>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto px-4 pt-3 pb-4 space-y-2">
        {filtered.length === 0 && (
          <p className="text-center text-sm py-10" style={{ color: 'var(--c-muted)' }}>No expenses recorded</p>
        )}
        {filtered.map(e => {
          const [, emoji, label] = catInfo(e.category)
          const animal = animalName(e.livestockId)
          return (
            <div key={e.id} className="p-4 rounded-2xl border"
              style={{ background: 'var(--c-nav)', borderColor: 'var(--c-border)' }}>
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-xl shrink-0">{emoji}</span>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold truncate" style={{ color: 'var(--c-text)' }}>
                      {e.description}
                    </p>
                    <p className="text-[10px]" style={{ color: 'var(--c-muted)' }}>
                      {label}
                      {e.attributedTo !== 'general' && ` · ${e.attributedTo}`}
                      {animal ? ` · ${animal}` : ''}
                      {e.paidTo ? ` · ${e.paidTo}` : ''}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <div className="text-right">
                    <p className="text-sm font-bold" style={{ color: '#E24B4A' }}>{fmt(e.amount)}</p>
                    <p className="text-[10px]" style={{ color: 'var(--c-muted)' }}>{e.expenseDate}</p>
                  </div>
                  <button onClick={() => confirmDelete(e.id)} className="p-1" style={{ color: 'var(--c-muted)' }}>
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>
              {(e.attachmentPath || e.paymentMode) && (
                <div className="mt-2 flex items-center gap-2 text-[10px]" style={{ color: 'var(--c-muted)' }}>
                  {e.paymentMode && (
                    <span className="capitalize px-1.5 py-0.5 rounded" style={{ background: 'var(--c-ghost)' }}>
                      {e.paymentMode}
                    </span>
                  )}
                  {e.attachmentPath && (
                    <span className="flex items-center gap-1"><Paperclip size={10} /> Receipt attached</span>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>

      {showModal && <AddExpenseModal animals={livestockMaster} onClose={() => setShowModal(false)} />}
    </div>
  )
}

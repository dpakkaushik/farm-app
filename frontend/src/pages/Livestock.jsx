import React, { useState, useRef } from 'react'
import { Bird, TrendingDown, TrendingUp, Plus, Trash2, Paperclip, X, ChevronDown, ChevronUp } from 'lucide-react'
import { useAppStore } from '../store'
import { supabase } from '../lib/supabase'

const TODAY = new Date().toISOString().slice(0, 10)

const EXPENSE_CATS = [
  ['feed',           '🌾', 'Feed'],
  ['veterinary',     '💉', 'Veterinary'],
  ['livestock_care', '🪢', 'Livestock Care'],
  ['maintenance',    '🔧', 'Maintenance'],
  ['infrastructure', '🏗',  'Infrastructure'],
  ['utilities',      '⚡', 'Utilities'],
  ['event',          '🎉', 'Event'],
  ['administrative', '📋', 'Administrative'],
  ['other',          '📦', 'Other'],
]

const REVENUE_TYPES = [
  ['milk',  '🥛', 'Milk'],
  ['egg',   '🥚', 'Eggs'],
  ['meat',  '🍖', 'Meat'],
  ['sale',  '💰', 'Sale (closes animal)'],
  ['dung',  '🌿', 'Dung / Manure'],
  ['wool',  '🧶', 'Wool'],
  ['other', '📦', 'Other'],
]

const PAY_MODES = ['cash', 'upi', 'bank', 'credit']

const STATUS_STYLE = {
  active:   { bg: '#1D9E7518', color: '#1D9E75', label: 'Active'   },
  sold:     { bg: '#88888820', color: '#888',    label: 'Sold'     },
  deceased: { bg: '#E24B4A18', color: '#E24B4A', label: 'Deceased' },
  culled:   { bg: '#88888820', color: '#888',    label: 'Culled'   },
}

const CATTLE_SPECIES  = ['buffalo','cow','bull','bullock','ox']
const POULTRY_SPECIES = ['hen','cock','chicken','poultry','bird','rooster']
const isCattle  = l => CATTLE_SPECIES.some(s => (l.species || '').toLowerCase().includes(s))
const isPoultry = l => l.trackingMode === 'count' || POULTRY_SPECIES.some(s => (l.species || '').toLowerCase().includes(s))

const fmt  = n => n != null ? `₹${Number(n).toLocaleString('en-IN')}` : '—'
const fmtK = n => n >= 1000 ? `₹${(n / 1000).toFixed(1)}K` : fmt(n)

// ── Shared UI ─────────────────────────────────────────────────────────────────
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

function Pill({ status }) {
  const s = STATUS_STYLE[status] || STATUS_STYLE.active
  return (
    <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full"
      style={{ background: s.bg, color: s.color }}>{s.label}</span>
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
          className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl border border-dashed text-sm"
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

// ── Revenue Modal ─────────────────────────────────────────────────────────────
function RevenueModal({ animals, onClose }) {
  const addLivestockRevenue = useAppStore(s => s.addLivestockRevenue)
  const [form, setForm] = useState({
    revenueDate: TODAY, revenueType: '', amount: '', quantity: '', unit: '',
    ratePerUnit: '', livestockId: '', buyerName: '', paymentMode: 'cash', notes: '',
  })
  const [attachPath, setAttachPath] = useState(null)
  const [uploading, setUploading] = useState(false)
  const [saving, setSaving]       = useState(false)

  const set    = (k, v) => setForm(f => ({ ...f, [k]: v }))
  const isSale = form.revenueType === 'sale'

  async function handleUpload(file) {
    if (!file) return
    setUploading(true)
    try { setAttachPath(await uploadAttachment(file)) }
    catch (e) { alert('Upload failed: ' + e.message) }
    finally { setUploading(false) }
  }

  async function save() {
    if (!form.revenueType || !form.amount) return alert('Fill revenue type and amount')
    if (isSale && !form.livestockId)       return alert('Select the animal being sold')
    setSaving(true)
    try {
      await addLivestockRevenue({
        ...form,
        amount:      parseFloat(form.amount),
        quantity:    form.quantity    ? parseFloat(form.quantity)    : null,
        ratePerUnit: form.ratePerUnit ? parseFloat(form.ratePerUnit) : null,
        isSale,
        attachmentPath: attachPath,
      })
      onClose()
    } catch (e) { alert('Save failed: ' + e.message) }
    finally { setSaving(false) }
  }

  return (
    <Modal title="Add Revenue" onClose={onClose}>
      <FRow label="Date">
        <input type="date" className={inp} value={form.revenueDate}
          onChange={e => set('revenueDate', e.target.value)} />
      </FRow>

      <FRow label="Revenue Type">
        <div className="grid grid-cols-3 gap-1.5">
          {REVENUE_TYPES.map(([v, emoji, label]) => (
            <button key={v} onClick={() => set('revenueType', v)}
              className="py-2 rounded-xl text-xs font-medium transition-colors"
              style={{
                background: form.revenueType === v ? '#1D9E75' : 'var(--c-ghost)',
                color:      form.revenueType === v ? '#fff'     : 'var(--c-muted)',
                border:    `1px solid ${form.revenueType === v ? '#1D9E75' : 'var(--c-border)'}`,
              }}>
              {emoji} {label}
            </button>
          ))}
        </div>
        {isSale && (
          <p className="text-[10px] mt-1" style={{ color: '#BA7517' }}>
            ⚠ Sale will mark the selected animal as Sold and close its account.
          </p>
        )}
      </FRow>

      <FRow label="Animal">
        <select className={inp} value={form.livestockId} onChange={e => set('livestockId', e.target.value)}>
          <option value="">— Herd / General —</option>
          {animals.filter(a => a.status === 'active').map(a => (
            <option key={a.id} value={a.id}>{a.name || a.tagId} ({a.species})</option>
          ))}
        </select>
      </FRow>

      <div className="grid grid-cols-2 gap-3">
        <FRow label="Quantity">
          <input type="number" className={inp} placeholder="e.g. 5" value={form.quantity}
            onChange={e => set('quantity', e.target.value)} />
        </FRow>
        <FRow label="Unit">
          <input type="text" className={inp} placeholder="kg / litres / nos"
            value={form.unit} onChange={e => set('unit', e.target.value)} />
        </FRow>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <FRow label="Rate per Unit (₹)">
          <input type="number" className={inp} placeholder="0" value={form.ratePerUnit}
            onChange={e => {
              const rate = e.target.value
              set('ratePerUnit', rate)
              if (rate && form.quantity)
                set('amount', (parseFloat(rate) * parseFloat(form.quantity)).toFixed(0))
            }} />
        </FRow>
        <FRow label="Total Amount (₹)">
          <input type="number" className={inp} placeholder="0" value={form.amount}
            onChange={e => set('amount', e.target.value)} />
        </FRow>
      </div>

      <FRow label="Buyer Name (optional)">
        <input type="text" className={inp} placeholder="Buyer / recipient"
          value={form.buyerName} onChange={e => set('buyerName', e.target.value)} />
      </FRow>

      <FRow label="Payment Mode">
        <div className="flex gap-2">
          {PAY_MODES.map(m => (
            <button key={m} onClick={() => set('paymentMode', m)}
              className="flex-1 py-2 rounded-xl text-xs font-semibold capitalize transition-colors"
              style={{
                background: form.paymentMode === m ? '#1D9E75' : 'var(--c-ghost)',
                color:      form.paymentMode === m ? '#fff'     : 'var(--c-muted)',
                border:    `1px solid ${form.paymentMode === m ? '#1D9E75' : 'var(--c-border)'}`,
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
        {saving ? 'Saving…' : isSale ? 'Record Sale & Close Account' : 'Save Revenue'}
      </button>
    </Modal>
  )
}

// ── Animals Tab ───────────────────────────────────────────────────────────────
function AnimalsTab({ animals }) {
  const [showInactive, setShowInactive] = useState(false)
  const active   = animals.filter(a => a.status === 'active')
  const inactive = animals.filter(a => a.status !== 'active')

  function AnimalCard({ a }) {
    const poultry = isPoultry(a)
    return (
      <div className="p-4 rounded-2xl border" style={{ background: 'var(--c-nav)', borderColor: 'var(--c-border)' }}>
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="text-xl">{poultry ? '🐔' : '🐄'}</span>
            <div>
              <p className="font-semibold text-sm" style={{ color: 'var(--c-text)' }}>
                {a.name || a.tagId}
              </p>
              <p className="text-[10px]" style={{ color: 'var(--c-muted)' }}>
                {a.species}{a.breed ? ` · ${a.breed}` : ''}{a.gender ? ` · ${a.gender}` : ''}
              </p>
            </div>
          </div>
          <Pill status={a.status} />
        </div>
        <div className="mt-2 flex gap-3 flex-wrap text-[10px]" style={{ color: 'var(--c-muted)' }}>
          {a.purchasePrice && <span>Bought {fmt(a.purchasePrice)}</span>}
          {a.purchaseDate  && <span>{a.purchaseDate}</span>}
          {a.soldDate      && <span>Sold {a.soldDate}</span>}
          {a.trackingMode === 'count' && a.currentCount != null && (
            <span>Count: {a.currentCount}</span>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-3 pb-4">
      {active.length === 0 && (
        <p className="text-center text-sm py-8" style={{ color: 'var(--c-muted)' }}>No active animals</p>
      )}
      {active.map(a => <AnimalCard key={a.id} a={a} />)}

      {inactive.length > 0 && (
        <>
          <button onClick={() => setShowInactive(v => !v)}
            className="w-full flex items-center justify-between px-4 py-2 rounded-xl text-xs font-semibold"
            style={{ background: 'var(--c-ghost)', color: 'var(--c-muted)' }}>
            <span>Sold / Inactive ({inactive.length})</span>
            {showInactive ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </button>
          {showInactive && inactive.map(a => <AnimalCard key={a.id} a={a} />)}
        </>
      )}
    </div>
  )
}

// ── Finance Tab ───────────────────────────────────────────────────────────────
function FinanceTab({ animals }) {
  const { farmExpenses, livestockRevenue, deleteLivestockRevenue } = useAppStore(s => ({
    farmExpenses:          s.farmExpenses,
    livestockRevenue:      s.livestockRevenue,
    deleteLivestockRevenue: s.deleteLivestockRevenue,
  }))
  const [sub, setSub]           = useState('revenue')
  const [showRevenue, setShowRevenue] = useState(false)

  // Only livestock-attributed expenses
  const livestockExpenses = farmExpenses.filter(e => e.attributedTo === 'livestock')
  const totalExpenses     = livestockExpenses.reduce((s, e) => s + e.amount, 0)
  const totalRevenue      = livestockRevenue.reduce((s, r) => s + r.amount, 0)
  const net               = totalRevenue - totalExpenses

  const catInfo    = cat => EXPENSE_CATS.find(([v]) => v === cat) || ['other', '📦', cat]
  const revInfo    = type => REVENUE_TYPES.find(([v]) => v === type) || ['other', '📦', type]
  const animalName = id => {
    if (!id) return null
    const a = animals.find(a => a.id === id)
    return a ? (a.name || a.tagId) : null
  }

  async function confirmDeleteRevenue(id) {
    if (!confirm('Delete this revenue entry?')) return
    try { await deleteLivestockRevenue(id) } catch (e) { alert(e.message) }
  }

  return (
    <div className="space-y-3 pb-4">
      {/* Summary */}
      <div className="grid grid-cols-3 gap-2">
        {[
          { label: 'Expenses', value: fmtK(totalExpenses), color: '#E24B4A' },
          { label: 'Revenue',  value: fmtK(totalRevenue),  color: '#1D9E75' },
          { label: 'Net',      value: fmtK(Math.abs(net)), color: net >= 0 ? '#1D9E75' : '#E24B4A' },
        ].map(({ label, value, color }) => (
          <div key={label} className="p-3 rounded-2xl border text-center"
            style={{ background: 'var(--c-nav)', borderColor: 'var(--c-border)' }}>
            <p className="text-[10px]" style={{ color: 'var(--c-muted)' }}>{label}</p>
            <p className="text-sm font-bold mt-0.5" style={{ color }}>{value}</p>
          </div>
        ))}
      </div>

      {/* Sub-tab toggle */}
      <div className="flex rounded-xl overflow-hidden border border-[var(--c-border)]">
        <button onClick={() => setSub('revenue')}
          className="flex-1 py-2 text-xs font-semibold flex items-center justify-center gap-1"
          style={{ background: sub === 'revenue' ? '#1D9E75' : 'var(--c-ghost)', color: sub === 'revenue' ? '#fff' : 'var(--c-muted)' }}>
          <TrendingUp size={13} /> Revenue
        </button>
        <button onClick={() => setSub('expenses')}
          className="flex-1 py-2 text-xs font-semibold flex items-center justify-center gap-1"
          style={{ background: sub === 'expenses' ? '#E24B4A' : 'var(--c-ghost)', color: sub === 'expenses' ? '#fff' : 'var(--c-muted)' }}>
          <TrendingDown size={13} /> Expenses
        </button>
      </div>

      {/* Expenses — read-only, add goes to Resources → Expenses */}
      {sub === 'expenses' && (
        <>
          <p className="text-[10px] text-center px-4" style={{ color: 'var(--c-muted)' }}>
            Showing livestock-attributed expenses · Add from Resources → Expenses
          </p>
          {livestockExpenses.length === 0 ? (
            <p className="text-center text-sm py-6" style={{ color: 'var(--c-muted)' }}>No livestock expenses yet</p>
          ) : (
            livestockExpenses.map(e => {
              const [, emoji, label] = catInfo(e.category)
              const animal = animalName(e.livestockId)
              return (
                <div key={e.id} className="p-4 rounded-2xl border"
                  style={{ background: 'var(--c-nav)', borderColor: 'var(--c-border)' }}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-xl shrink-0">{emoji}</span>
                      <div className="min-w-0">
                        <p className="text-sm font-semibold truncate" style={{ color: 'var(--c-text)' }}>{e.description}</p>
                        <p className="text-[10px]" style={{ color: 'var(--c-muted)' }}>
                          {label}{animal ? ` · ${animal}` : ''}
                        </p>
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-sm font-bold" style={{ color: '#E24B4A' }}>{fmt(e.amount)}</p>
                      <p className="text-[10px]" style={{ color: 'var(--c-muted)' }}>{e.expenseDate}</p>
                    </div>
                  </div>
                  {e.attachmentPath && (
                    <p className="mt-1.5 text-[10px] flex items-center gap-1" style={{ color: 'var(--c-muted)' }}>
                      <Paperclip size={10} /> Receipt attached
                    </p>
                  )}
                </div>
              )
            })
          )}
        </>
      )}

      {/* Revenue — add button here */}
      {sub === 'revenue' && (
        <>
          <button onClick={() => setShowRevenue(true)}
            className="w-full py-2.5 rounded-xl text-sm font-semibold flex items-center justify-center gap-2 border"
            style={{ borderColor: '#1D9E75', color: '#1D9E75', background: 'transparent' }}>
            <Plus size={15} /> Add Revenue
          </button>

          {livestockRevenue.length === 0 ? (
            <p className="text-center text-sm py-6" style={{ color: 'var(--c-muted)' }}>No revenue recorded</p>
          ) : (
            livestockRevenue.map(r => {
              const [, emoji, label] = revInfo(r.revenueType)
              const animal = animalName(r.livestockId)
              return (
                <div key={r.id} className="p-4 rounded-2xl border"
                  style={{ background: 'var(--c-nav)', borderColor: 'var(--c-border)' }}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-xl shrink-0">{emoji}</span>
                      <div className="min-w-0">
                        <p className="text-sm font-semibold" style={{ color: 'var(--c-text)' }}>
                          {label}
                          {r.isSale && (
                            <span className="ml-1 text-[9px] px-1.5 py-0.5 rounded-full font-bold"
                              style={{ background: '#88888820', color: '#888' }}>SALE</span>
                          )}
                        </p>
                        <p className="text-[10px]" style={{ color: 'var(--c-muted)' }}>
                          {animal || 'Herd'}
                          {r.buyerName ? ` → ${r.buyerName}` : ''}
                          {r.quantity && r.unit ? ` · ${r.quantity} ${r.unit}` : ''}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <div className="text-right">
                        <p className="text-sm font-bold" style={{ color: '#1D9E75' }}>{fmt(r.amount)}</p>
                        <p className="text-[10px]" style={{ color: 'var(--c-muted)' }}>{r.revenueDate}</p>
                      </div>
                      <button onClick={() => confirmDeleteRevenue(r.id)} className="p-1" style={{ color: 'var(--c-muted)' }}>
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </div>
                  {(r.attachmentPath || r.paymentMode) && (
                    <div className="mt-2 flex items-center gap-2 text-[10px]" style={{ color: 'var(--c-muted)' }}>
                      {r.paymentMode && (
                        <span className="capitalize px-1.5 py-0.5 rounded" style={{ background: 'var(--c-ghost)' }}>
                          {r.paymentMode}
                        </span>
                      )}
                      {r.attachmentPath && (
                        <span className="flex items-center gap-1"><Paperclip size={10} /> Receipt attached</span>
                      )}
                    </div>
                  )}
                </div>
              )
            })
          )}
        </>
      )}

      {showRevenue && <RevenueModal animals={animals} onClose={() => setShowRevenue(false)} />}
    </div>
  )
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function Livestock() {
  const animals = useAppStore(s => s.livestockMaster)
  const [tab, setTab] = useState('finance')

  const active  = animals.filter(a => a.status === 'active').length
  const cattle  = animals.filter(a => isCattle(a)  && a.status === 'active').length
  const poultry = animals.filter(a => isPoultry(a) && a.status === 'active').length

  return (
    <div className="flex flex-col h-full overflow-hidden" style={{ background: 'var(--c-bg)' }}>
      <div className="shrink-0 px-4 pt-4 pb-3 border-b" style={{ borderColor: 'var(--c-border)' }}>
        <div className="flex items-center gap-2 mb-3">
          <Bird size={20} style={{ color: '#1D9E75' }} />
          <p className="text-base font-bold" style={{ color: 'var(--c-text)' }}>Livestock</p>
          <div className="flex gap-1.5 ml-auto text-[10px]">
            {cattle  > 0 && <span className="px-2 py-0.5 rounded-full" style={{ background: 'var(--c-ghost)', color: 'var(--c-muted)' }}>🐄 {cattle}</span>}
            {poultry > 0 && <span className="px-2 py-0.5 rounded-full" style={{ background: 'var(--c-ghost)', color: 'var(--c-muted)' }}>🐔 {poultry}</span>}
            {active === 0 && <span style={{ color: 'var(--c-muted)' }}>No animals</span>}
          </div>
        </div>

        <div className="flex rounded-xl overflow-hidden border border-[var(--c-border)]">
          {[{ key: 'animals', label: '🐄 Animals' }, { key: 'finance', label: '💰 Finance' }].map(({ key, label }) => (
            <button key={key} onClick={() => setTab(key)}
              className="flex-1 py-2 text-xs font-semibold transition-colors"
              style={{ background: tab === key ? '#1D9E75' : 'var(--c-ghost)', color: tab === key ? '#fff' : 'var(--c-muted)' }}>
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 pt-4">
        {tab === 'animals' && <AnimalsTab animals={animals} />}
        {tab === 'finance' && <FinanceTab animals={animals} />}
      </div>
    </div>
  )
}

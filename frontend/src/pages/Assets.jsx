import React, { useState } from 'react'
import { Wrench, Boxes, Bird, ChevronDown, ChevronUp, Plus, Minus } from 'lucide-react'
import { useAppStore } from '../store'
import { supabase } from '../lib/supabase'

const TODAY = new Date().toISOString().slice(0, 10)

const TABS = [
  { key: 'machinery',  label: 'Machinery',    Icon: Wrench },
  { key: 'assets',     label: 'Farm Assets',  Icon: Boxes  },
  { key: 'livestock',  label: 'Livestock',    Icon: Bird   },
]

const STATUS_STYLE = {
  in_use:       { bg: '#1D9E7518', color: '#1D9E75', label: 'In Use' },
  spare:        { bg: '#4169E118', color: '#4169E1', label: 'Spare'  },
  under_repair: { bg: '#BA751718', color: '#BA7517', label: 'Repair' },
  disposed:     { bg: '#88888820', color: '#888',    label: 'Disposed' },
  sold:         { bg: '#88888820', color: '#888',    label: 'Sold'   },
}

const CAT_EMOJI = { equipment: '🛢', appliance: '🔌', furniture: '🪑', tractor: '🚜', implement: '🔩', generator: '⚡', engine: '⚙️', trailer: '🚛', sprayer: '💧', water_motor: '💧', grass_cutter: '🌿', wood_cutter: '🪚', vehicle: '🏍' }

function StatusPill({ status }) {
  const s = STATUS_STYLE[status] || STATUS_STYLE.in_use
  return (
    <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full"
      style={{ background: s.bg, color: s.color }}>{s.label}</span>
  )
}

function Modal({ title, onClose, children }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center" style={{ background: 'rgba(0,0,0,0.5)' }}>
      <div className="w-full max-w-lg rounded-t-2xl p-5 pb-8 space-y-4"
        style={{ background: 'var(--c-nav)', maxHeight: '90vh', overflowY: 'auto' }}>
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
      <p className="text-[10px] font-semibold" style={{ color: 'var(--c-muted)' }}>{label}</p>
      {children}
    </div>
  )
}

const inp = "w-full px-3 py-2.5 rounded-xl text-sm border outline-none bg-[var(--c-ghost)] border-[var(--c-border)] text-[var(--c-text)]"

// ── Disposal Modal ────────────────────────────────────────────────────────────
function DisposeModal({ item, itemLabel, onClose, onConfirm, saving }) {
  const [form, setForm] = useState({ type: 'scrapped', date: TODAY, amount: '', buyer: '', notes: '' })
  const f = (k, v) => setForm(p => ({ ...p, [k]: v }))
  return (
    <Modal title={`Dispose: ${item.name}`} onClose={onClose}>
      <FRow label="Disposal Type">
        <div className="flex rounded-xl overflow-hidden border border-[var(--c-border)]">
          {['scrapped', 'sold'].map(t => (
            <button key={t} onClick={() => f('type', t)}
              className="flex-1 py-2 text-xs font-semibold transition-colors"
              style={{ background: form.type === t ? '#E24B4A' : 'var(--c-ghost)', color: form.type === t ? '#fff' : 'var(--c-muted)' }}>
              {t === 'scrapped' ? '🗑 Scrapped' : '💰 Sold'}
            </button>
          ))}
        </div>
      </FRow>
      <FRow label="Date">
        <input type="date" className={inp} value={form.date} onChange={e => f('date', e.target.value)} />
      </FRow>
      <FRow label={form.type === 'sold' ? 'Sale Amount (₹)' : 'Scrap Value (₹) — optional'}>
        <input type="number" className={inp} placeholder="0" value={form.amount} onChange={e => f('amount', e.target.value)} />
      </FRow>
      {form.type === 'sold' && (
        <FRow label="Buyer Name">
          <input type="text" className={inp} placeholder="Buyer name" value={form.buyer} onChange={e => f('buyer', e.target.value)} />
        </FRow>
      )}
      <FRow label="Notes (optional)">
        <input type="text" className={inp} placeholder="Any remarks" value={form.notes} onChange={e => f('notes', e.target.value)} />
      </FRow>
      <button onClick={() => onConfirm(form)} disabled={saving}
        className="w-full py-3 rounded-xl text-sm font-semibold text-white disabled:opacity-50"
        style={{ background: '#E24B4A' }}>
        {saving ? 'Saving…' : `Confirm Disposal`}
      </button>
    </Modal>
  )
}

// ── Livestock Count Modal ─────────────────────────────────────────────────────
function CountModal({ animal, changeType, onClose, onConfirm, saving }) {
  const [form, setForm] = useState({ date: TODAY, reason: changeType === 'add' ? 'purchased' : 'consumed', quantity: '', notes: '' })
  const f = (k, v) => setForm(p => ({ ...p, [k]: v }))
  const addReasons    = ['purchased', 'born']
  const reduceReasons = ['consumed', 'dead', 'sold']
  const reasons = changeType === 'add' ? addReasons : reduceReasons
  const REASON_LABEL = { purchased: 'Purchased', born: 'Born', consumed: 'Consumed (meat)', dead: 'Dead', sold: 'Sold' }
  return (
    <Modal title={`${changeType === 'add' ? '+ Add' : '- Reduce'} Count: ${animal.name || animal.tagId}`} onClose={onClose}>
      <FRow label="Date">
        <input type="date" className={inp} value={form.date} onChange={e => f('date', e.target.value)} />
      </FRow>
      <FRow label="Reason">
        <div className="flex flex-wrap gap-2">
          {reasons.map(r => (
            <button key={r} onClick={() => f('reason', r)}
              className="px-3 py-1.5 rounded-xl text-xs font-semibold border transition-colors"
              style={{
                background: form.reason === r ? (changeType === 'add' ? '#1D9E7518' : '#E24B4A18') : 'var(--c-ghost)',
                borderColor: form.reason === r ? (changeType === 'add' ? '#1D9E75' : '#E24B4A') : 'var(--c-border)',
                color: form.reason === r ? (changeType === 'add' ? '#1D9E75' : '#E24B4A') : 'var(--c-muted)',
              }}>
              {REASON_LABEL[r]}
            </button>
          ))}
        </div>
      </FRow>
      <FRow label="Quantity">
        <input type="number" className={inp} placeholder="e.g. 3" min="1" value={form.quantity} onChange={e => f('quantity', e.target.value)} />
      </FRow>
      <FRow label="Notes (optional)">
        <input type="text" className={inp} placeholder="Any remarks" value={form.notes} onChange={e => f('notes', e.target.value)} />
      </FRow>
      <button onClick={() => onConfirm(form)} disabled={saving || !form.quantity}
        className="w-full py-3 rounded-xl text-sm font-semibold text-white disabled:opacity-50"
        style={{ background: changeType === 'add' ? '#1D9E75' : '#E24B4A' }}>
        {saving ? 'Saving…' : `Confirm`}
      </button>
    </Modal>
  )
}

// ── Machinery Tab ─────────────────────────────────────────────────────────────
function MachineryTab({ machinery, onDispose }) {
  const [filter, setFilter] = useState('all')
  const types = [...new Set(machinery.map(m => m.type))].sort()
  const list = filter === 'all' ? machinery : machinery.filter(m => m.type === filter)

  return (
    <div className="flex-1 flex flex-col min-h-0">
      <div className="flex gap-2 px-4 py-2 overflow-x-auto no-scrollbar shrink-0 bg-[var(--c-nav)] border-b border-[var(--c-border)]">
        {['all', ...types].map(t => (
          <button key={t} onClick={() => setFilter(t)}
            className={`shrink-0 px-3 py-1.5 rounded-full text-[10px] font-semibold border transition-colors ${filter === t ? 'text-white border-transparent' : 'border-[var(--c-border)] text-[var(--c-muted)]'}`}
            style={{ background: filter === t ? '#1D9E75' : 'var(--c-ghost)' }}>
            {t === 'all' ? 'All' : (CAT_EMOJI[t] || '🔧') + ' ' + t.replace('_', ' ')}
          </button>
        ))}
      </div>
      <div className="flex-1 overflow-y-auto p-4 space-y-2">
        {list.map(m => (
          <div key={m.id} className="bg-[var(--c-nav)] rounded-2xl border border-[var(--c-border)] overflow-hidden">
            <div className="p-4">
              <div className="flex items-start justify-between">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-[9px] font-bold px-1.5 py-0.5 rounded" style={{ background: 'var(--c-ghost)', color: 'var(--c-muted)' }}>{m.displayId}</span>
                    <p className="text-sm font-semibold" style={{ color: 'var(--c-text)' }}>{m.name}</p>
                    <StatusPill status={m.status} />
                    {m.requiresDiesel && <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full" style={{ background: '#BA751718', color: '#BA7517' }}>⛽ Diesel</span>}
                  </div>
                  <p className="text-[10px] mt-1" style={{ color: 'var(--c-muted)' }}>
                    {(CAT_EMOJI[m.type] || '🔧')} {m.type.replace('_', ' ')}
                    {m.make ? ` · ${m.make}` : ''}
                    {m.regNo ? ` · ${m.regNo}` : ''}
                    {' · Qty '}{m.quantity}
                  </p>
                  {m.notes && <p className="text-[10px] mt-0.5 italic" style={{ color: 'var(--c-faint)' }}>{m.notes}</p>}
                </div>
              </div>
            </div>
            <div className="flex border-t border-[var(--c-border)]">
              <button onClick={() => onDispose(m, 'machinery')}
                className="flex-1 py-2.5 text-[10px] font-semibold transition-colors"
                style={{ color: '#E24B4A' }}>
                🗑 Dispose
              </button>
            </div>
          </div>
        ))}
        {list.length === 0 && <p className="text-center py-12 text-sm" style={{ color: 'var(--c-faint)' }}>No machinery found</p>}
      </div>
    </div>
  )
}

// ── Farm Assets Tab ───────────────────────────────────────────────────────────
function FarmAssetsTab({ assets, onDispose }) {
  const [filter, setFilter] = useState('all')
  const cats = [...new Set(assets.map(a => a.category))].sort()
  const list = filter === 'all' ? assets : assets.filter(a => a.category === filter)

  return (
    <div className="flex-1 flex flex-col min-h-0">
      <div className="flex gap-2 px-4 py-2 overflow-x-auto no-scrollbar shrink-0 bg-[var(--c-nav)] border-b border-[var(--c-border)]">
        {['all', ...cats].map(c => (
          <button key={c} onClick={() => setFilter(c)}
            className={`shrink-0 px-3 py-1.5 rounded-full text-[10px] font-semibold border transition-colors ${filter === c ? 'text-white border-transparent' : 'border-[var(--c-border)] text-[var(--c-muted)]'}`}
            style={{ background: filter === c ? '#1D9E75' : 'var(--c-ghost)' }}>
            {c === 'all' ? 'All' : (CAT_EMOJI[c] || '📦') + ' ' + c.charAt(0).toUpperCase() + c.slice(1)}
          </button>
        ))}
      </div>
      <div className="flex-1 overflow-y-auto p-4 space-y-2">
        {list.map(a => (
          <div key={a.id} className="bg-[var(--c-nav)] rounded-2xl border border-[var(--c-border)] overflow-hidden">
            <div className="p-4">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-[9px] font-bold px-1.5 py-0.5 rounded" style={{ background: 'var(--c-ghost)', color: 'var(--c-muted)' }}>{a.displayId}</span>
                    <p className="text-sm font-semibold" style={{ color: 'var(--c-text)' }}>{a.name}</p>
                    <StatusPill status={a.status} />
                  </div>
                  <p className="text-[10px] mt-1" style={{ color: 'var(--c-muted)' }}>
                    {(CAT_EMOJI[a.category] || '📦')} {a.category} · Qty {a.quantity}
                  </p>
                  {a.notes && <p className="text-[10px] mt-0.5 italic" style={{ color: 'var(--c-faint)' }}>{a.notes}</p>}
                </div>
              </div>
            </div>
            <div className="flex border-t border-[var(--c-border)]">
              <button onClick={() => onDispose(a, 'asset')}
                className="flex-1 py-2.5 text-[10px] font-semibold transition-colors"
                style={{ color: '#E24B4A' }}>
                🗑 Dispose
              </button>
            </div>
          </div>
        ))}
        {list.length === 0 && <p className="text-center py-12 text-sm" style={{ color: 'var(--c-faint)' }}>No assets found</p>}
      </div>
    </div>
  )
}

// ── Livestock Tab ─────────────────────────────────────────────────────────────
function LivestockTab({ livestock, countLogs, onCount }) {
  const [expanded, setExpanded] = useState(null)
  const HEALTH = { healthy: { color: '#1D9E75', label: '✓ Healthy' }, sick: { color: '#E24B4A', label: '⚠ Sick' }, recovering: { color: '#BA7517', label: '~ Recovering' } }

  return (
    <div className="flex-1 overflow-y-auto p-4 space-y-2">
      {livestock.map(l => {
        const isCount = l.trackingMode === 'count'
        const isOpen  = expanded === l.id
        const logs    = countLogs.filter(c => c.livestockId === l.id)
        const h       = HEALTH[l.healthStatus] || HEALTH.healthy
        return (
          <div key={l.id} className="bg-[var(--c-nav)] rounded-2xl border border-[var(--c-border)] overflow-hidden">
            <div className="p-4">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-[9px] font-bold px-1.5 py-0.5 rounded" style={{ background: 'var(--c-ghost)', color: 'var(--c-muted)' }}>{l.tagId}</span>
                    <p className="text-sm font-semibold" style={{ color: 'var(--c-text)' }}>{l.name || l.tagId}</p>
                    {isCount ? (
                      <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full" style={{ background: '#4169E118', color: '#4169E1' }}>
                        Count: {l.currentCount ?? 0}
                      </span>
                    ) : (
                      <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full" style={{ background: h.color + '18', color: h.color }}>{h.label}</span>
                    )}
                  </div>
                  <p className="text-[10px] mt-1" style={{ color: 'var(--c-muted)' }}>
                    {l.species} · {isCount ? 'Flock/Count' : (l.gender || 'individual')}
                    {l.breed ? ` · ${l.breed}` : ''}
                    {l.dob ? ` · DOB ${l.dob}` : ''}
                  </p>
                </div>
              </div>
            </div>

            {isCount ? (
              <>
                <div className="flex border-t border-[var(--c-border)]">
                  <button onClick={() => onCount(l, 'add')}
                    className="flex-1 py-2.5 text-[10px] font-semibold flex items-center justify-center gap-1 transition-colors"
                    style={{ color: '#1D9E75' }}>
                    <Plus size={12} /> Add
                  </button>
                  <div className="w-px" style={{ background: 'var(--c-border)' }} />
                  <button onClick={() => onCount(l, 'reduce')}
                    className="flex-1 py-2.5 text-[10px] font-semibold flex items-center justify-center gap-1 transition-colors"
                    style={{ color: '#E24B4A' }}>
                    <Minus size={12} /> Reduce
                  </button>
                  <div className="w-px" style={{ background: 'var(--c-border)' }} />
                  <button onClick={() => setExpanded(isOpen ? null : l.id)}
                    className="flex-1 py-2.5 text-[10px] font-semibold flex items-center justify-center gap-1 transition-colors"
                    style={{ color: 'var(--c-muted)' }}>
                    {isOpen ? <ChevronUp size={12} /> : <ChevronDown size={12} />} Log
                  </button>
                </div>
                {isOpen && logs.length > 0 && (
                  <div className="border-t border-[var(--c-border)] divide-y divide-[var(--c-border)]">
                    {logs.slice(0, 10).map(log => (
                      <div key={log.id} className="flex items-center justify-between px-4 py-2">
                        <div>
                          <p className="text-[10px] font-medium" style={{ color: 'var(--c-text)' }}>
                            {log.changeType === 'add' ? '+' : '-'}{log.quantity} · {log.reason}
                          </p>
                          {log.notes && <p className="text-[9px]" style={{ color: 'var(--c-faint)' }}>{log.notes}</p>}
                        </div>
                        <p className="text-[9px]" style={{ color: 'var(--c-faint)' }}>{log.date}</p>
                      </div>
                    ))}
                  </div>
                )}
              </>
            ) : (
              <div className="flex border-t border-[var(--c-border)]">
                <span className="flex-1 py-2.5 text-center text-[10px]" style={{ color: 'var(--c-faint)' }}>
                  Individual tracking
                </span>
              </div>
            )}
          </div>
        )
      })}
      {livestock.length === 0 && <p className="text-center py-12 text-sm" style={{ color: 'var(--c-faint)' }}>No livestock records</p>}
    </div>
  )
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function Assets() {
  const { machineryMaster, farmAssets, livestockMaster, livestockCountLogs, disposeMachinery, disposeFarmAsset, addLivestockCountLog } = useAppStore()

  const [tab,      setTab]      = useState('machinery')
  const [dispose,  setDispose]  = useState(null)   // { item, kind: 'machinery'|'asset' }
  const [countModal, setCountModal] = useState(null) // { animal, changeType }
  const [saving,   setSaving]   = useState(false)
  const [toast,    setToast]    = useState(null)

  const showToast = (msg, type = 'success') => {
    setToast({ msg, type }); setTimeout(() => setToast(null), 3000)
  }

  const confirmDispose = async (form) => {
    if (!dispose) return
    setSaving(true)
    try {
      if (dispose.kind === 'machinery') {
        await disposeMachinery(dispose.item.id, { type: form.type, date: form.date, amount: form.amount, buyer: form.buyer, notes: form.notes })
      } else {
        await disposeFarmAsset(dispose.item.id, { type: form.type, date: form.date, amount: form.amount, buyer: form.buyer, notes: form.notes })
      }
      showToast(`${dispose.item.name} marked as ${form.type}`)
      setDispose(null)
    } catch (e) { showToast('Failed: ' + e.message, 'error') }
    setSaving(false)
  }

  const confirmCount = async (form) => {
    if (!countModal) return
    if (!form.quantity || Number(form.quantity) <= 0) return showToast('Enter a valid quantity', 'warn')
    setSaving(true)
    try {
      await addLivestockCountLog({
        livestockId: countModal.animal.id,
        date:        form.date,
        changeType:  countModal.changeType,
        reason:      form.reason,
        quantity:    parseInt(form.quantity),
        notes:       form.notes,
      })
      showToast(`Count updated for ${countModal.animal.name || countModal.animal.tagId}`)
      setCountModal(null)
    } catch (e) { showToast('Failed: ' + e.message, 'error') }
    setSaving(false)
  }

  // Summary counts for header
  const machinerySummary = { total: machineryMaster.length, diesel: machineryMaster.filter(m => m.requiresDiesel).length }
  const assetSummary     = { total: farmAssets.length }
  const livestockSummary = { individual: livestockMaster.filter(l => l.trackingMode === 'individual').length, flocks: livestockMaster.filter(l => l.trackingMode === 'count').length }

  return (
    <div className="h-full flex flex-col" style={{ background: 'var(--c-bg)' }}>

      {/* Tab bar */}
      <div className="flex border-b shrink-0" style={{ background: 'var(--c-nav)', borderColor: 'var(--c-border)' }}>
        {TABS.map(({ key, label, Icon }) => (
          <button key={key} onClick={() => setTab(key)}
            className={`flex-1 py-3 flex flex-col items-center gap-0.5 text-[10px] font-semibold transition-colors
              ${tab === key ? 'text-[#1D9E75] border-b-2 border-[#1D9E75]' : 'text-[var(--c-muted)]'}`}>
            <Icon size={16} />{label}
          </button>
        ))}
      </div>

      {/* Summary strip */}
      <div className="flex gap-0 shrink-0 border-b" style={{ borderColor: 'var(--c-border)', background: 'var(--c-nav)' }}>
        {tab === 'machinery' && (
          <>
            <div className="flex-1 py-2 text-center">
              <p className="text-base font-bold" style={{ color: 'var(--c-text)' }}>{machinerySummary.total}</p>
              <p className="text-[9px]" style={{ color: 'var(--c-faint)' }}>Active machines</p>
            </div>
            <div className="flex-1 py-2 text-center border-l" style={{ borderColor: 'var(--c-border)' }}>
              <p className="text-base font-bold" style={{ color: '#BA7517' }}>{machinerySummary.diesel}</p>
              <p className="text-[9px]" style={{ color: 'var(--c-faint)' }}>Need diesel</p>
            </div>
          </>
        )}
        {tab === 'assets' && (
          <div className="flex-1 py-2 text-center">
            <p className="text-base font-bold" style={{ color: 'var(--c-text)' }}>{assetSummary.total}</p>
            <p className="text-[9px]" style={{ color: 'var(--c-faint)' }}>Farm assets</p>
          </div>
        )}
        {tab === 'livestock' && (
          <>
            <div className="flex-1 py-2 text-center">
              <p className="text-base font-bold" style={{ color: 'var(--c-text)' }}>{livestockSummary.individual}</p>
              <p className="text-[9px]" style={{ color: 'var(--c-faint)' }}>Individual animals</p>
            </div>
            <div className="flex-1 py-2 text-center border-l" style={{ borderColor: 'var(--c-border)' }}>
              <p className="text-base font-bold" style={{ color: '#4169E1' }}>{livestockSummary.flocks}</p>
              <p className="text-[9px]" style={{ color: 'var(--c-faint)' }}>Count-tracked flocks</p>
            </div>
          </>
        )}
      </div>

      {/* Tab content */}
      {tab === 'machinery' && (
        <MachineryTab machinery={machineryMaster} onDispose={(item) => setDispose({ item, kind: 'machinery' })} />
      )}
      {tab === 'assets' && (
        <FarmAssetsTab assets={farmAssets} onDispose={(item) => setDispose({ item, kind: 'asset' })} />
      )}
      {tab === 'livestock' && (
        <LivestockTab livestock={livestockMaster} countLogs={livestockCountLogs} onCount={(animal, changeType) => setCountModal({ animal, changeType })} />
      )}

      {/* Disposal modal */}
      {dispose && (
        <DisposeModal item={dispose.item} onClose={() => setDispose(null)} onConfirm={confirmDispose} saving={saving} />
      )}

      {/* Count modal */}
      {countModal && (
        <CountModal animal={countModal.animal} changeType={countModal.changeType} onClose={() => setCountModal(null)} onConfirm={confirmCount} saving={saving} />
      )}

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-24 left-1/2 -translate-x-1/2 z-50 px-4 py-2.5 rounded-2xl text-xs font-semibold shadow-lg text-white"
          style={{ background: toast.type === 'error' ? '#E24B4A' : toast.type === 'warn' ? '#BA7517' : '#1D9E75' }}>
          {toast.msg}
        </div>
      )}
    </div>
  )
}

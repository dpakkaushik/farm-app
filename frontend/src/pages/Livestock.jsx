import React, { useState, useRef } from 'react'
import { Bird, TrendingDown, TrendingUp, Plus, Minus, Trash2, Camera, Pencil, ChevronDown, ChevronUp } from 'lucide-react'
import { useAppStore } from '../store'
import FilePicker from '../components/FilePicker'
import Attachment from '../components/Attachment'
import ImageViewer from '../components/ImageViewer'
import ImageCropper from '../components/ImageCropper'
import { uploadAttachment, deleteAttachment, resolveUrl } from '../lib/attachments'
import HealthTab, { CheckupBanner, pendingCheckups } from './livestock/health'
import {
  DOCS, TODAY, HEALTH_STYLE, EXPENSE_CATS, REVENUE_TYPES, PAY_MODES,
  isCattle, isPoultry, isActive,
  fmt, fmtK, inp, Modal, FRow, Pill, SegPicker, ActionBar,
} from './livestock/ui'

// FilePicker handles crop-on-pick, tap-to-expand, change and remove. Removal is only
// possible here, before the record is saved — a saved receipt is immutable.
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

// ── Add Livestock Modal ───────────────────────────────────────────────────────
function AddLivestockModal({ onClose, onConfirm, saving }) {
  const [f, setF] = useState({ name:'', species:'buffalo', gender:'female', breed:'', dob:'', trackingMode:'individual', currentCount:'1', acquisitionType:'purchased', purchaseDate:TODAY, purchasePrice:'', notes:'' })
  const u = (k, v) => setF(p => ({ ...p, [k]: v }))
  return (
    <Modal title="Add Animal / Flock" onClose={onClose}>
      <FRow label="Type">
        <div className="flex gap-2">
          {[['buffalo','🐃 Buffalo'],['cow','🐄 Cow'],['poultry','🐓 Poultry']].map(([s, l]) => (
            <button key={s} onClick={() => { u('species', s); u('trackingMode', s === 'poultry' ? 'count' : 'individual') }}
              className="flex-1 py-2 text-xs font-semibold rounded-xl border transition-colors"
              style={{ background: f.species===s ? '#1D9E7518' : 'var(--c-ghost)', borderColor: f.species===s ? '#1D9E75' : 'var(--c-border)', color: f.species===s ? '#1D9E75' : 'var(--c-muted)' }}>
              {l}
            </button>
          ))}
        </div>
      </FRow>
      <FRow label="Name *">
        <input className={inp} placeholder={f.trackingMode === 'count' ? 'e.g. Hen Flock' : 'e.g. Nimmi'} value={f.name} onChange={e => u('name', e.target.value)} />
      </FRow>
      {f.trackingMode === 'individual' ? (
        <>
          <div className="grid grid-cols-2 gap-3">
            <FRow label="Gender">
              <select className={inp} value={f.gender} onChange={e => u('gender', e.target.value)} style={{ background: 'var(--c-ghost)' }}>
                <option value="female">Female</option><option value="male">Male</option>
              </select>
            </FRow>
            <FRow label="Breed"><input className={inp} placeholder="e.g. Murrah" value={f.breed} onChange={e => u('breed', e.target.value)} /></FRow>
          </div>
          <FRow label="Date of Birth"><input type="date" className={inp} value={f.dob} onChange={e => u('dob', e.target.value)} /></FRow>
        </>
      ) : (
        <FRow label="Current Count"><input type="number" className={inp} min="0" value={f.currentCount} onChange={e => u('currentCount', e.target.value)} /></FRow>
      )}
      <FRow label="Acquisition">
        <SegPicker value={f.acquisitionType} options={[['purchased','💰 Purchased'],['born','🐣 Born / Hatched']]} onChange={v => u('acquisitionType', v)} />
      </FRow>
      {f.acquisitionType === 'purchased' && (
        <div className="grid grid-cols-2 gap-3">
          <FRow label="Purchase Date"><input type="date" className={inp} value={f.purchaseDate} onChange={e => u('purchaseDate', e.target.value)} /></FRow>
          <FRow label="Purchase Price (₹)"><input type="number" className={inp} placeholder="e.g. 45000" value={f.purchasePrice} onChange={e => u('purchasePrice', e.target.value)} /></FRow>
        </div>
      )}
      <FRow label="Notes"><input className={inp} placeholder="Optional" value={f.notes} onChange={e => u('notes', e.target.value)} /></FRow>
      <button onClick={() => f.name && onConfirm(f)} disabled={saving || !f.name}
        className="w-full py-3 rounded-xl text-sm font-semibold text-white disabled:opacity-50" style={{ background: '#1D9E75' }}>
        {saving ? 'Saving…' : 'Add Animal'}
      </button>
    </Modal>
  )
}

// ── Edit Livestock Modal ──────────────────────────────────────────────────────
function EditLivestockModal({ item, onClose, onSave, saving }) {
  const [f, setF] = useState({
    name: item.name || '', species: item.species || item.animal_type || 'buffalo',
    gender: item.gender || 'female', breed: item.breed || '', dob: item.dob || '',
    healthStatus: item.healthStatus || 'healthy', acquisitionType: item.acquisitionType || 'purchased',
    purchaseDate: item.purchaseDate || '', purchasePrice: item.purchasePrice || '', notes: item.notes || '',
  })
  const u = (k, v) => setF(p => ({ ...p, [k]: v }))
  return (
    <Modal title={`Edit — ${item.name || item.tagId}`} onClose={onClose}>
      <FRow label="Name"><input className={inp} value={f.name} onChange={e => u('name', e.target.value)} /></FRow>
      <div className="grid grid-cols-2 gap-3">
        <FRow label="Species"><input className={inp} placeholder="buffalo, cow, ox…" value={f.species} onChange={e => u('species', e.target.value)} /></FRow>
        <FRow label="Gender">
          <select className={inp} value={f.gender} onChange={e => u('gender', e.target.value)} style={{ background: 'var(--c-ghost)' }}>
            <option value="female">Female</option><option value="male">Male</option>
          </select>
        </FRow>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <FRow label="Breed"><input className={inp} placeholder="e.g. Murrah" value={f.breed} onChange={e => u('breed', e.target.value)} /></FRow>
        <FRow label="Date of Birth"><input type="date" className={inp} value={f.dob} onChange={e => u('dob', e.target.value)} /></FRow>
      </div>
      <FRow label="Health Status">
        <SegPicker value={f.healthStatus} options={[['healthy','✓ Healthy'],['recovering','~ Recovering'],['sick','⚠ Sick']]} onChange={v => u('healthStatus', v)} />
      </FRow>
      <FRow label="Acquisition">
        <SegPicker value={f.acquisitionType} options={[['purchased','💰 Purchased'],['born','🐣 Born on Farm']]} onChange={v => u('acquisitionType', v)} />
      </FRow>
      {f.acquisitionType === 'purchased' && (
        <div className="grid grid-cols-2 gap-3">
          <FRow label="Purchase Date"><input type="date" className={inp} value={f.purchaseDate} onChange={e => u('purchaseDate', e.target.value)} /></FRow>
          <FRow label="Purchase Price (₹)"><input type="number" className={inp} placeholder="e.g. 55000" value={f.purchasePrice} onChange={e => u('purchasePrice', e.target.value)} /></FRow>
        </div>
      )}
      <FRow label="Notes"><input className={inp} placeholder="Optional" value={f.notes} onChange={e => u('notes', e.target.value)} /></FRow>
      <button onClick={() => onSave(f)} disabled={saving || !f.name}
        className="w-full py-3 rounded-xl text-sm font-semibold text-white disabled:opacity-50" style={{ background: '#1D9E75' }}>
        {saving ? 'Saving…' : 'Save Changes'}
      </button>
    </Modal>
  )
}

// ── Count Modal ───────────────────────────────────────────────────────────────
function CountModal({ animal, changeType, onClose, onConfirm, saving }) {
  const [form, setForm] = useState({ date: TODAY, reason: changeType === 'add' ? 'purchased' : 'consumed', quantity: '', notes: '' })
  const f = (k, v) => setForm(p => ({ ...p, [k]: v }))
  const reasons = changeType === 'add' ? ['purchased','born'] : ['consumed','dead','sold']
  const REASON_LABEL = { purchased:'Purchased', born:'Born', consumed:'Consumed (meat)', dead:'Dead', sold:'Sold' }
  return (
    <Modal title={`${changeType === 'add' ? '+ Add' : '- Reduce'}: ${animal.name || animal.tagId}`} onClose={onClose}>
      <FRow label="Date"><input type="date" className={inp} value={form.date} onChange={e => f('date', e.target.value)} /></FRow>
      <FRow label="Reason">
        <div className="flex flex-wrap gap-2">
          {reasons.map(r => (
            <button key={r} onClick={() => f('reason', r)}
              className="px-3 py-1.5 rounded-xl text-xs font-semibold border transition-colors"
              style={{ background: form.reason === r ? (changeType==='add' ? '#1D9E7518' : '#E24B4A18') : 'var(--c-ghost)', borderColor: form.reason === r ? (changeType==='add' ? '#1D9E75' : '#E24B4A') : 'var(--c-border)', color: form.reason === r ? (changeType==='add' ? '#1D9E75' : '#E24B4A') : 'var(--c-muted)' }}>
              {REASON_LABEL[r]}
            </button>
          ))}
        </div>
      </FRow>
      <FRow label="Quantity"><input type="number" className={inp} placeholder="e.g. 3" min="1" value={form.quantity} onChange={e => f('quantity', e.target.value)} /></FRow>
      <FRow label="Notes"><input type="text" className={inp} placeholder="Remarks" value={form.notes} onChange={e => f('notes', e.target.value)} /></FRow>
      <button onClick={() => onConfirm(form)} disabled={saving || !form.quantity}
        className="w-full py-3 rounded-xl text-sm font-semibold text-white disabled:opacity-50"
        style={{ background: changeType === 'add' ? '#1D9E75' : '#E24B4A' }}>
        {saving ? 'Saving…' : 'Confirm'}
      </button>
    </Modal>
  )
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
    try { setAttachPath(await uploadAttachment(file, { folder: 'expense-docs', bucket: DOCS })) }
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
// The livestock master, moved here from Resources → Assets so animals live in one
// place. Sold and deceased animals drop out of the herd sections into a collapsed
// group: the Finance tab one tab over can close an animal's account with a sale,
// and a closed animal must not keep reading as part of the working herd.
function AnimalsTab({ livestock, countLogs, onEdit, onCount, onPhoto, onAdd }) {
  const [expanded,     setExpanded]     = useState(null)
  const [showInactive, setShowInactive] = useState(false)

  const active      = livestock.filter(isActive)
  const inactive    = livestock.filter(l => !isActive(l))
  const cattleList  = active.filter(isCattle)
  const poultryList = active.filter(isPoultry)

  const sectionHeader = (emoji, title, count) => (
    <div className="flex items-center gap-2 mt-3 mb-2">
      <p className="text-[10px] font-bold uppercase tracking-widest" style={{ color: 'var(--c-muted)' }}>{emoji} {title}</p>
      <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full" style={{ background: 'var(--c-ghost)', color: 'var(--c-faint)' }}>{count}</span>
      <div className="flex-1 h-px" style={{ background: 'var(--c-border)' }} />
    </div>
  )

  const cattleCard = l => {
    const h = HEALTH_STYLE[l.healthStatus] || HEALTH_STYLE.healthy
    return (
      <div key={l.id} className="bg-[var(--c-nav)] rounded-2xl border border-[var(--c-border)] overflow-hidden mb-3">
        <div className="p-4 flex gap-4">
          <button onClick={() => onPhoto('livestock_master', l)} className="shrink-0 flex flex-col items-center">
            {l.photoUrl
              ? <img src={l.photoUrl} alt={l.name} className="w-16 h-16 rounded-2xl object-cover border-2" style={{ borderColor: h.color+'50' }} />
              : <div className="w-16 h-16 rounded-2xl flex items-center justify-center text-3xl border-2 border-dashed" style={{ background: 'var(--c-ghost)', borderColor: 'var(--c-border)' }}>
                  {(l.species||'').includes('cow') ? '🐄' : '🐃'}
                </div>
            }
            <p className="text-[8px] mt-1" style={{ color: 'var(--c-faint)' }}>📷 Photo</p>
          </button>
          <div className="flex-1">
            <div className="flex items-center gap-2 flex-wrap mb-1">
              <p className="text-base font-bold" style={{ color: 'var(--c-text)' }}>{l.name || l.tagId}</p>
              <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full" style={{ background: h.color+'18', color: h.color }}>{h.label}</span>
            </div>
            <p className="text-[11px]" style={{ color: 'var(--c-muted)' }}>
              {(l.species||'Buffalo').charAt(0).toUpperCase()+(l.species||'Buffalo').slice(1)}
              {l.breed  ? ` · ${l.breed}`  : ''}
              {l.gender ? ` · ${l.gender.charAt(0).toUpperCase()+l.gender.slice(1)}` : ''}
            </p>
            {l.dob && <p className="text-[10px] mt-0.5" style={{ color: 'var(--c-faint)' }}>Born: {l.dob}</p>}
            <p className="text-[11px] mt-1 font-bold" style={{ color: l.purchasePrice ? '#1D9E75' : 'var(--c-faint)' }}>
              {l.purchasePrice ? fmt(l.purchasePrice) : l.acquisitionType === 'born' ? '🐣 Born on farm' : 'Tap ✏ Edit to set price'}
            </p>
          </div>
        </div>
        <ActionBar actions={[
          { label: 'Edit',  icon: <Pencil size={11} />, color: '#4169E1', onClick: () => onEdit(l) },
          { label: 'Photo', icon: <Camera size={11} />,                   onClick: () => onPhoto('livestock_master', l) },
        ]} />
      </div>
    )
  }

  const poultryCard = l => {
    const logs   = countLogs.filter(c => c.livestockId === l.id)
    const isOpen = expanded === l.id
    return (
      <div key={l.id} className="bg-[var(--c-nav)] rounded-2xl border border-[var(--c-border)] overflow-hidden mb-3">
        <div className="p-4 flex items-center gap-3">
          <button onClick={() => onPhoto('livestock_master', l)} className="shrink-0">
            {l.photoUrl
              ? <img src={l.photoUrl} alt={l.name} className="w-14 h-14 rounded-xl object-cover" />
              : <div className="w-14 h-14 rounded-xl flex items-center justify-center text-2xl" style={{ background: 'var(--c-ghost)' }}>🐓</div>
            }
          </button>
          <div className="flex-1">
            <p className="text-sm font-bold" style={{ color: 'var(--c-text)' }}>{l.name || 'Flock'}</p>
            <p className="text-[10px]" style={{ color: 'var(--c-muted)' }}>{(l.species||'Poultry').charAt(0).toUpperCase()+(l.species||'Poultry').slice(1)}</p>
          </div>
          <div className="text-right">
            <p className="text-2xl font-bold" style={{ color: '#4169E1' }}>{l.currentCount ?? 0}</p>
            <p className="text-[9px]" style={{ color: 'var(--c-faint)' }}>birds</p>
          </div>
        </div>
        <ActionBar actions={[
          { label: 'Edit',   icon: <Pencil size={11} />, color: '#4169E1',  onClick: () => onEdit(l) },
          { label: '+ Add',  icon: <Plus   size={11} />, color: '#1D9E75',  onClick: () => onCount(l, 'add')    },
          { label: '- Remove', icon: <Minus size={11} />, color: '#E24B4A', onClick: () => onCount(l, 'reduce') },
          { label: isOpen ? 'Hide' : 'Log', icon: isOpen ? <ChevronUp size={11} /> : <ChevronDown size={11} />, onClick: () => setExpanded(isOpen ? null : l.id) },
        ]} />
        {isOpen && logs.length > 0 && (
          <div className="border-t border-[var(--c-border)] divide-y divide-[var(--c-border)]">
            {logs.slice(0, 10).map(log => (
              <div key={log.id} className="flex items-center justify-between px-4 py-2">
                <p className="text-[10px]" style={{ color: 'var(--c-text)' }}>{log.changeType==='add' ? '+' : '-'}{log.quantity} · {log.reason}</p>
                <p className="text-[9px]" style={{ color: 'var(--c-faint)' }}>{log.date}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    )
  }

  // A closed account is a record, not a working animal — no photo or count actions.
  const closedCard = a => (
    <div key={a.id} className="p-4 rounded-2xl border mb-2" style={{ background: 'var(--c-nav)', borderColor: 'var(--c-border)' }}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="text-xl">{isPoultry(a) ? '🐔' : '🐄'}</span>
          <div>
            <p className="font-semibold text-sm" style={{ color: 'var(--c-text)' }}>{a.name || a.tagId}</p>
            <p className="text-[10px]" style={{ color: 'var(--c-muted)' }}>
              {a.species}{a.breed ? ` · ${a.breed}` : ''}{a.gender ? ` · ${a.gender}` : ''}
            </p>
          </div>
        </div>
        <Pill status={a.status} />
      </div>
      <div className="mt-2 flex gap-3 flex-wrap text-[10px]" style={{ color: 'var(--c-muted)' }}>
        {a.purchasePrice ? <span>Bought {fmt(a.purchasePrice)}</span> : null}
        {a.soldDate      ? <span>Sold {a.soldDate}</span>             : null}
      </div>
    </div>
  )

  return (
    <div className="pb-4">
      <button onClick={onAdd} className="w-full mb-2 py-2.5 rounded-xl text-xs font-semibold border-2 border-dashed flex items-center justify-center gap-2"
        style={{ borderColor: '#1D9E7540', color: '#1D9E75', background: '#1D9E7508' }}>
        <Plus size={14} /> Add Animal / Flock
      </button>

      {cattleList.length > 0 && (
        <>
          {sectionHeader('🐃', 'Cattle', cattleList.length)}
          {cattleList.map(cattleCard)}
        </>
      )}

      {poultryList.length > 0 && (
        <>
          {sectionHeader('🐓', 'Poultry', poultryList.length)}
          {poultryList.map(poultryCard)}
        </>
      )}

      {active.length === 0 && (
        <p className="text-center py-12 text-sm" style={{ color: 'var(--c-faint)' }}>
          {inactive.length > 0 ? 'No animals in the herd right now' : 'No livestock records'}
        </p>
      )}

      {inactive.length > 0 && (
        <>
          <button onClick={() => setShowInactive(v => !v)}
            className="w-full mt-3 mb-2 flex items-center justify-between px-4 py-2 rounded-xl text-xs font-semibold"
            style={{ background: 'var(--c-ghost)', color: 'var(--c-muted)' }}>
            <span>Sold / Closed ({inactive.length})</span>
            {showInactive ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </button>
          {showInactive && inactive.map(closedCard)}
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
                  {/* Saved receipt — expand only, never editable */}
                  {e.attachmentPath && (
                    <div className="mt-1.5">
                      <Attachment variant="chip" value={e.attachmentPath} bucket={DOCS} name="View receipt" />
                    </div>
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
                        <Attachment variant="chip" value={r.attachmentPath} bucket={DOCS} name="View receipt" />
                      )}
                    </div>
                  )}
                </div>
              )
            })
          )}
        </>
      )}

      {/* Per animal — the same arithmetic as the v_livestock_pnl view, computed
          from data already in the store: what an animal cost against what it
          earned. Answers the question the totals above cannot — which animal
          is actually paying for itself. */}
      {animals.length > 0 && (
        <div className="rounded-2xl border overflow-hidden" style={{ background: 'var(--c-nav)', borderColor: 'var(--c-border)' }}>
          <p className="px-4 py-2 text-[10px] font-bold uppercase tracking-widest"
            style={{ color: 'var(--c-muted)', background: 'var(--c-ghost)' }}>Per animal</p>
          <div className="divide-y divide-[var(--c-border)]">
            {animals.map(a => {
              const cost = (a.purchasePrice || 0)
                + livestockExpenses.filter(e => e.livestockId === a.id).reduce((s, e) => s + e.amount, 0)
              const rev = livestockRevenue.filter(r => r.livestockId === a.id).reduce((s, r) => s + r.amount, 0)
              const net = rev - cost
              return (
                <div key={a.id} className="flex items-center justify-between px-4 py-2.5 gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold truncate" style={{ color: 'var(--c-text)' }}>{a.name || a.tagId}</p>
                    <p className="text-[10px]" style={{ color: 'var(--c-muted)' }}>
                      Cost {fmtK(cost)} · Earned {fmtK(rev)}
                    </p>
                  </div>
                  <p className="text-sm font-bold shrink-0" style={{ color: net >= 0 ? '#1D9E75' : '#E24B4A' }}>
                    {net >= 0 ? '+' : '−'}{fmtK(Math.abs(net))}
                  </p>
                </div>
              )
            })}
          </div>
          <p className="px-4 py-2 text-[9px] leading-relaxed" style={{ color: 'var(--c-faint)' }}>
            Only expenses tagged to one animal count here. Feed bought for the whole
            herd sits in the totals above, not against any single animal.
          </p>
        </div>
      )}

      {showRevenue && <RevenueModal animals={animals} onClose={() => setShowRevenue(false)} />}
    </div>
  )
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function Livestock() {
  const {
    livestockMaster, livestockCountLogs, livestockHealthLogs,
    addLivestock, updateLivestock, addLivestockCountLog, updateAssetPhoto,
  } = useAppStore()

  const [tab,        setTab]        = useState('animals')
  const [editModal,  setEditModal]  = useState(null)
  const [countModal, setCountModal] = useState(null)
  const [addModal,   setAddModal]   = useState(false)
  const [saving,     setSaving]     = useState(false)
  const [toast,      setToast]      = useState(null)
  const photoInputRef  = useRef()
  const [pendingPhoto, setPendingPhoto] = useState(null)
  const [cropFile,     setCropFile]     = useState(null)
  const [photoView,    setPhotoView]    = useState(null)

  const showToast = (msg, type = 'success') => { setToast({ msg, type }); setTimeout(() => setToast(null), 3000) }

  // A photo that exists opens in the viewer (which carries Change and Remove).
  // Only an empty slot jumps straight to the picker.
  const handlePhotoClick = (table, item) => {
    if (item.photoUrl) return setPhotoView({ table, item })
    setPendingPhoto({ table, id: item.id })
    photoInputRef.current?.click()
  }

  // Picked from an empty slot → crop before it ever reaches Storage.
  const handlePhotoChange = (e) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (file && pendingPhoto) setCropFile(file)
  }

  const savePhoto = async (table, id, file, oldUrl) => {
    setSaving(true)
    try {
      const path = await uploadAttachment(file, { folder: `asset_photos/${table}`, entityId: id })
      await updateAssetPhoto(table, id, resolveUrl(path))
      if (oldUrl) await deleteAttachment(oldUrl)   // don't orphan the file we just replaced
      showToast('Photo updated')
    } catch (err) { showToast('Upload failed: ' + err.message, 'error'); throw err }
    finally { setSaving(false); setPendingPhoto(null); setCropFile(null) }
  }

  const removePhoto = async (table, id, oldUrl) => {
    setSaving(true)
    try {
      await updateAssetPhoto(table, id, null)
      if (oldUrl) await deleteAttachment(oldUrl)
      showToast('Photo removed')
    } catch (err) { showToast('Failed: ' + err.message, 'error'); throw err }
    finally { setSaving(false) }
  }

  const confirmEdit = async (data) => {
    if (!editModal) return
    setSaving(true)
    try {
      await updateLivestock(editModal.id, data)
      showToast('Saved'); setEditModal(null)
    } catch (e) { showToast('Failed: ' + e.message, 'error') }
    setSaving(false)
  }

  const confirmCount = async (form) => {
    if (!countModal || !form.quantity || Number(form.quantity) <= 0) return showToast('Enter valid quantity', 'warn')
    setSaving(true)
    try {
      await addLivestockCountLog({ livestockId: countModal.animal.id, date: form.date, changeType: countModal.changeType, reason: form.reason, quantity: parseInt(form.quantity), notes: form.notes })
      showToast('Count updated'); setCountModal(null)
    } catch (e) { showToast('Failed: ' + e.message, 'error') }
    setSaving(false)
  }

  const confirmAdd = async (form) => {
    setSaving(true)
    try {
      await addLivestock(form)
      showToast(`${form.name} added`); setAddModal(false)
    } catch (e) { showToast('Failed: ' + e.message, 'error') }
    setSaving(false)
  }

  const herd      = livestockMaster.filter(isActive)
  const cattle    = herd.filter(isCattle).length
  const poultry   = herd.filter(isPoultry).length
  const herdValue = herd.reduce((s, l) => s + (l.purchasePrice || 0), 0)
  const checkups  = pendingCheckups(livestockMaster, livestockHealthLogs)

  return (
    <div className="flex flex-col h-full overflow-hidden" style={{ background: 'var(--c-bg)' }}>
      <input ref={photoInputRef} type="file" accept="image/*" className="hidden" onChange={handlePhotoChange} />

      {/* Crop on the way in, for a photo picked into an empty slot */}
      {cropFile && pendingPhoto && (
        <ImageCropper file={cropFile}
          onDone={f => savePhoto(pendingPhoto.table, pendingPhoto.id, f, null)}
          onCancel={() => { setCropFile(null); setPendingPhoto(null) }} />
      )}

      {/* Tapping an existing photo expands it; Change and Remove live in the viewer */}
      {photoView && (
        <ImageViewer
          value={photoView.item.photoUrl}
          name={photoView.item.name}
          onClose={() => setPhotoView(null)}
          onReplace={f => savePhoto(photoView.table, photoView.item.id, f, photoView.item.photoUrl)}
          onRemove={() => removePhoto(photoView.table, photoView.item.id, photoView.item.photoUrl)} />
      )}

      <div className="shrink-0 px-4 pt-4 pb-3 border-b" style={{ borderColor: 'var(--c-border)' }}>
        <div className="flex items-center gap-2 mb-3">
          <Bird size={20} style={{ color: '#1D9E75' }} />
          <p className="text-base font-bold" style={{ color: 'var(--c-text)' }}>Livestock</p>
          <div className="flex gap-1.5 ml-auto text-[10px] items-center">
            {cattle  > 0 && <span className="px-2 py-0.5 rounded-full" style={{ background: 'var(--c-ghost)', color: 'var(--c-muted)' }}>🐄 {cattle}</span>}
            {poultry > 0 && <span className="px-2 py-0.5 rounded-full" style={{ background: 'var(--c-ghost)', color: 'var(--c-muted)' }}>🐔 {poultry}</span>}
            {herdValue > 0 && <span className="font-bold" style={{ color: '#1D9E75' }}>{fmtK(herdValue)}</span>}
            {herd.length === 0 && <span style={{ color: 'var(--c-muted)' }}>No animals</span>}
          </div>
        </div>

        <div className="flex rounded-xl overflow-hidden border border-[var(--c-border)]">
          {[
            { key: 'animals', label: '🐄 Animals' },
            { key: 'health',  label: '🩺 Health'  },
            { key: 'finance', label: '💰 Finance' },
          ].map(({ key, label }) => (
            <button key={key} onClick={() => setTab(key)}
              className="flex-1 py-2 text-xs font-semibold transition-colors"
              style={{ background: tab === key ? '#1D9E75' : 'var(--c-ghost)', color: tab === key ? '#fff' : 'var(--c-muted)' }}>
              {label}
            </button>
          ))}
        </div>

        {/* A checkup that has fallen due is the one thing on this screen worth
            interrupting for, so it sits above the tabs' content wherever you are. */}
        {tab !== 'health' && <CheckupBanner checkups={checkups} onOpen={() => setTab('health')} />}
      </div>

      <div className="flex-1 overflow-y-auto px-4 pt-4">
        {tab === 'animals' && (
          <AnimalsTab
            livestock={livestockMaster}
            countLogs={livestockCountLogs}
            onEdit={setEditModal}
            onCount={(animal, changeType) => setCountModal({ animal, changeType })}
            onPhoto={handlePhotoClick}
            onAdd={() => setAddModal(true)} />
        )}
        {tab === 'health'  && <HealthTab animals={livestockMaster} />}
        {tab === 'finance' && <FinanceTab animals={livestockMaster} />}
      </div>

      {editModal  && <EditLivestockModal item={editModal} onClose={() => setEditModal(null)} onSave={confirmEdit} saving={saving} />}
      {countModal && <CountModal animal={countModal.animal} changeType={countModal.changeType} onClose={() => setCountModal(null)} onConfirm={confirmCount} saving={saving} />}
      {addModal   && <AddLivestockModal onClose={() => setAddModal(false)} onConfirm={confirmAdd} saving={saving} />}

      {toast && (
        <div className="fixed bottom-24 left-1/2 -translate-x-1/2 z-50 px-4 py-2.5 rounded-2xl text-xs font-semibold shadow-lg text-white"
          style={{ background: toast.type === 'error' ? '#E24B4A' : toast.type === 'warn' ? '#BA7517' : '#1D9E75' }}>
          {toast.msg}
        </div>
      )}
    </div>
  )
}

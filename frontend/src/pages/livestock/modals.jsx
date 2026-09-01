// Every form the Livestock screen puts over the page. Extracted from
// Livestock.jsx so the shell stays a shell — the page was 916 lines, past the
// 800 ceiling, and the modals were half of it.
import React, { useState } from 'react'
import { useAppStore } from '../../store'
import { uploadAttachment } from '../../lib/attachments'
import FilePicker from '../../components/FilePicker'
import {
  DOCS, TODAY, PAY_MODES, revenueTypesFor,
  animalLabel, isActive, groupOf, fmt, inp, Modal, FRow, SegPicker,
} from './ui'

// ── Where an animal is kept ───────────────────────────────────────────────────
// The plot an animal stands on, so the Field map can answer "what is on this
// land" with the herd as well as the crop. Offered for birds and animals only:
// a pet roams the whole farm and pinning a dog to Plot C would be fiction.
//
// Always optional. Stock that hasn't been placed yet is a normal state, not a
// gap to nag about, and "Not on a plot" has to stay reachable so an animal can
// be moved back off the land it was assigned to.
function PlotRow({ value, onChange, group }) {
  const plots = useAppStore(s => s.plots)
  if (group === 'pets') return null
  return (
    <FRow label="Kept on plot">
      <select className={inp} value={value || ''} onChange={e => onChange(e.target.value || null)}
        style={{ background: 'var(--c-ghost)' }}>
        <option value="">— Not on a plot —</option>
        {plots.map(p => (
          <option key={p.id} value={p.id}>{p.name} · {Number(p.area_acres) || 0} ac</option>
        ))}
      </select>
    </FRow>
  )
}

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
// Scoped to the group you're adding into: a bird is counted, never named; a pet is
// a dog or a cat. Tracking mode follows the group, not the species pick, so a
// duck can't accidentally become an individually-named animal. Anything not
// listed here can still be typed into the Edit modal's free-text species field.
const GROUP_FORM = {
  animals: { title: 'Add Animal', trackingMode: 'individual', bornLabel: '🐣 Born on Farm',  namePlaceholder: 'e.g. Nimmi',
             types: [['buffalo','🐃 Buffalo'], ['cow','🐄 Cow'], ['goat','🐐 Goat']] },
  birds:   { title: 'Add Flock',  trackingMode: 'count',      bornLabel: '🐣 Hatched',        namePlaceholder: 'e.g. Hen Flock',
             types: [['poultry','🐓 Poultry'], ['hen','🐔 Hen'], ['duck','🦆 Duck']] },
  pets:    { title: 'Add Pet',    trackingMode: 'individual', bornLabel: '🐾 Born / Adopted', namePlaceholder: 'e.g. Sheru',
             types: [['dog','🐕 Dog'], ['cat','🐈 Cat']] },
}

export function AddLivestockModal({ group, onClose, onConfirm, saving }) {
  const g = GROUP_FORM[group] || GROUP_FORM.animals
  const [f, setF] = useState({ name:'', species:g.types[0][0], gender:'female', breed:'', dob:'', trackingMode:g.trackingMode, currentCount:'1', acquisitionType:'purchased', purchaseDate:TODAY, purchasePrice:'', plotId:'', notes:'' })
  const u = (k, v) => setF(p => ({ ...p, [k]: v }))
  return (
    <Modal title={g.title} onClose={onClose}>
      <FRow label="Type">
        <div className="flex gap-2">
          {g.types.map(([s, l]) => (
            <button key={s} onClick={() => u('species', s)}
              className="flex-1 py-2 text-xs font-semibold rounded-xl border transition-colors"
              style={{ background: f.species===s ? '#8A9A5B18' : 'var(--c-ghost)', borderColor: f.species===s ? '#8A9A5B' : 'var(--c-border)', color: f.species===s ? '#8A9A5B' : 'var(--c-muted)' }}>
              {l}
            </button>
          ))}
        </div>
      </FRow>
      <FRow label="Name *">
        <input className={inp} placeholder={g.namePlaceholder} value={f.name} onChange={e => u('name', e.target.value)} />
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
        <SegPicker value={f.acquisitionType} options={[['purchased','💰 Purchased'],['born', g.bornLabel]]} onChange={v => u('acquisitionType', v)} />
      </FRow>
      {f.acquisitionType === 'purchased' && (
        <div className="grid grid-cols-2 gap-3">
          <FRow label="Purchase Date"><input type="date" className={inp} value={f.purchaseDate} onChange={e => u('purchaseDate', e.target.value)} /></FRow>
          <FRow label="Purchase Price (₹)"><input type="number" className={inp} placeholder="e.g. 45000" value={f.purchasePrice} onChange={e => u('purchasePrice', e.target.value)} /></FRow>
        </div>
      )}
      <PlotRow value={f.plotId} onChange={v => u('plotId', v)} group={group} />
      <FRow label="Notes"><input className={inp} placeholder="Optional" value={f.notes} onChange={e => u('notes', e.target.value)} /></FRow>
      <button onClick={() => f.name && onConfirm(f)} disabled={saving || !f.name}
        className="w-full py-3 rounded-xl text-sm font-semibold text-white disabled:opacity-50" style={{ background: '#8A9A5B' }}>
        {saving ? 'Saving…' : g.title}
      </button>
    </Modal>
  )
}

// ── Edit Livestock Modal ──────────────────────────────────────────────────────
export function EditLivestockModal({ item, onClose, onSave, saving }) {
  const [f, setF] = useState({
    name: item.name || '', species: item.species || item.animal_type || 'buffalo',
    gender: item.gender || 'female', breed: item.breed || '', dob: item.dob || '',
    acquisitionType: item.acquisitionType || 'purchased',
    purchaseDate: item.purchaseDate || '', purchasePrice: item.purchasePrice || '',
    plotId: item.plotId || '', notes: item.notes || '',
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
      {/* No health picker. A vet visit sets the status now, and this form offered a
          second way to set it that did not even include under_treatment — so an
          edit made to fix a price could quietly mark a treated animal healthy. */}
      <FRow label="Acquisition">
        <SegPicker value={f.acquisitionType} options={[['purchased','💰 Purchased'],['born','🐣 Born on Farm']]} onChange={v => u('acquisitionType', v)} />
      </FRow>
      {f.acquisitionType === 'purchased' && (
        <div className="grid grid-cols-2 gap-3">
          <FRow label="Purchase Date"><input type="date" className={inp} value={f.purchaseDate} onChange={e => u('purchaseDate', e.target.value)} /></FRow>
          <FRow label="Purchase Price (₹)"><input type="number" className={inp} placeholder="e.g. 55000" value={f.purchasePrice} onChange={e => u('purchasePrice', e.target.value)} /></FRow>
        </div>
      )}
      <PlotRow value={f.plotId} onChange={v => u('plotId', v)} group={groupOf(item)} />
      <FRow label="Notes"><input className={inp} placeholder="Optional" value={f.notes} onChange={e => u('notes', e.target.value)} /></FRow>
      <button onClick={() => onSave(f)} disabled={saving || !f.name}
        className="w-full py-3 rounded-xl text-sm font-semibold text-white disabled:opacity-50" style={{ background: '#8A9A5B' }}>
        {saving ? 'Saving…' : 'Save Changes'}
      </button>
    </Modal>
  )
}

// ── Count Modal ───────────────────────────────────────────────────────────────
export function CountModal({ animal, changeType, onClose, onConfirm, saving }) {
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
              style={{ background: form.reason === r ? (changeType==='add' ? '#8A9A5B18' : '#E24B4A18') : 'var(--c-ghost)', borderColor: form.reason === r ? (changeType==='add' ? '#8A9A5B' : '#E24B4A') : 'var(--c-border)', color: form.reason === r ? (changeType==='add' ? '#8A9A5B' : '#E24B4A') : 'var(--c-muted)' }}>
              {REASON_LABEL[r]}
            </button>
          ))}
        </div>
      </FRow>
      <FRow label="Quantity"><input type="number" className={inp} placeholder="e.g. 3" min="1" value={form.quantity} onChange={e => f('quantity', e.target.value)} /></FRow>
      <FRow label="Notes"><input type="text" className={inp} placeholder="Remarks" value={form.notes} onChange={e => f('notes', e.target.value)} /></FRow>
      <button onClick={() => onConfirm(form)} disabled={saving || !form.quantity}
        className="w-full py-3 rounded-xl text-sm font-semibold text-white disabled:opacity-50"
        style={{ background: changeType === 'add' ? '#8A9A5B' : '#E24B4A' }}>
        {saving ? 'Saving…' : 'Confirm'}
      </button>
    </Modal>
  )
}

// ── Close Modal ───────────────────────────────────────────────────────────────
// An animal leaves the farm in four ways and only one of them is a sale. Until
// now recording a sale was the only way to close any animal at all, so a dog that
// died and a flock that was given away had nowhere to go but stay on the list as
// working stock.
//
// livestock_master has three columns for this — status, sold_date, notes — and no
// reason or amount column (farm_assets has disposal_*; this table does not). So
// the reason is a status plus a line appended to notes, and the amount is only
// offered for a sale, where the existing revenue path already has somewhere real
// to put it. Recording a free rehoming as a sale would be false data, which is
// what the 'rehomed' status added in migration 0020 is for.
const CLOSE_REASONS = [
  { key: 'deceased', label: '🕯 Died',       status: 'deceased', word: 'died'       },
  { key: 'rehomed',  label: '🏠 Rehomed',    status: 'rehomed',  word: 'rehomed'    },
  { key: 'given',    label: '🎁 Given away', status: 'rehomed',  word: 'given away' },
  { key: 'sold',     label: '💰 Sold',       status: 'sold',     word: 'sold'       },
]

export function CloseModal({ animal, onClose, onConfirm, saving }) {
  const [f, setF] = useState({ reason: 'deceased', date: TODAY, amount: '', notes: '' })
  const u = (k, v) => setF(p => ({ ...p, [k]: v }))
  const reason = CLOSE_REASONS.find(r => r.key === f.reason)
  const isSale = f.reason === 'sold'

  return (
    <Modal title={`${animalLabel(animal)} — off the farm`} onClose={onClose}>
      <FRow label="What happened *">
        <div className="grid grid-cols-2 gap-2">
          {CLOSE_REASONS.map(r => (
            <button key={r.key} onClick={() => u('reason', r.key)}
              className="py-2 rounded-xl text-xs font-semibold border transition-colors"
              style={{
                background:  f.reason === r.key ? '#E24B4A14' : 'var(--c-ghost)',
                borderColor: f.reason === r.key ? '#E24B4A'   : 'var(--c-border)',
                color:       f.reason === r.key ? '#E24B4A'   : 'var(--c-muted)',
              }}>
              {r.label}
            </button>
          ))}
        </div>
      </FRow>

      <FRow label="Date">
        <input type="date" className={inp} value={f.date} onChange={e => u('date', e.target.value)} />
      </FRow>

      {isSale && (
        <FRow label="Sale amount (₹) — optional">
          <input type="number" className={inp} placeholder="e.g. 60000"
            value={f.amount} onChange={e => u('amount', e.target.value)} />
          <p className="text-[12px] mt-1" style={{ color: 'var(--c-muted)' }}>
            {f.amount
              ? `${fmt(f.amount)} is recorded as livestock income and enters the cash book.`
              : 'Leave empty to close the account without recording any money.'}
          </p>
        </FRow>
      )}

      <FRow label="Note">
        <input className={inp} placeholder="Optional — e.g. given to Ramesh's family"
          value={f.notes} onChange={e => u('notes', e.target.value)} />
      </FRow>

      <p className="text-[12px] leading-relaxed" style={{ color: '#BA7517' }}>
        ⚠ {animalLabel(animal)} drops out of the list into "No longer on the farm"
        and stops counting as working stock. Nothing is deleted — the record, and
        every cost and sale against it, is kept.
      </p>

      <button onClick={() => onConfirm({ ...reason, date: f.date, amount: f.amount, notes: f.notes })}
        disabled={saving}
        className="w-full py-3 rounded-xl text-sm font-semibold text-white disabled:opacity-50"
        style={{ background: '#E24B4A' }}>
        {saving ? 'Saving…' : isSale && f.amount ? 'Record Sale & Mark Off Farm' : 'Mark Off Farm'}
      </button>
    </Modal>
  )
}

// ── Revenue Modal ─────────────────────────────────────────────────────────────
export function RevenueModal({ animals, group, onClose }) {
  // Only the types this face can actually produce. A flock has no milk.
  const types = revenueTypesFor(group)
  const unit  = group === 'birds' ? 'flock' : 'animal'
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
          {types.map(([v, emoji, label]) => (
            <button key={v} onClick={() => set('revenueType', v)}
              className="py-2 rounded-xl text-xs font-medium transition-colors"
              style={{
                background: form.revenueType === v ? '#8A9A5B' : 'var(--c-ghost)',
                color:      form.revenueType === v ? '#fff'     : 'var(--c-muted)',
                border:    `1px solid ${form.revenueType === v ? '#8A9A5B' : 'var(--c-border)'}`,
              }}>
              {emoji} {label}
            </button>
          ))}
        </div>
        {isSale && (
          <p className="text-[12px] mt-1" style={{ color: '#BA7517' }}>
            ⚠ Sale will mark the selected {unit} as Sold and close its account.
          </p>
        )}
      </FRow>

      <FRow label={group === 'birds' ? 'Flock' : 'Animal'}>
        <select className={inp} value={form.livestockId} onChange={e => set('livestockId', e.target.value)}>
          <option value="">{group === 'birds' ? '— Flock / General —' : '— Herd / General —'}</option>
          {animals.filter(isActive).map(a => (
            <option key={a.id} value={a.id}>{animalLabel(a)} ({a.species})</option>
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
                background: form.paymentMode === m ? '#8A9A5B' : 'var(--c-ghost)',
                color:      form.paymentMode === m ? '#fff'     : 'var(--c-muted)',
                border:    `1px solid ${form.paymentMode === m ? '#8A9A5B' : 'var(--c-border)'}`,
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
        style={{ background: '#8A9A5B', opacity: saving ? 0.6 : 1 }}>
        {saving ? 'Saving…' : isSale ? 'Record Sale & Close Account' : 'Save Revenue'}
      </button>
    </Modal>
  )
}

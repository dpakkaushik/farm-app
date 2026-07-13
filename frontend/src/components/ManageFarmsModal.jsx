import { useState } from 'react'
import { X, Pencil, Trash2, Plus, AlertTriangle, ChevronLeft } from 'lucide-react'
import { useAuthStore, isAdmin } from '../store/auth'
import CreateFarmModal from './CreateFarmModal'

// Manage Farms — list every farm the user belongs to, with edit + delete for the
// ones they admin, and an Add entry. Deletion is deliberately heavy: it spells
// out that all data is erased and makes the user retype the farm name, the way
// GitHub gates repo deletion.
export default function ManageFarmsModal({ onClose }) {
  const { farms, updateFarm, deleteFarm } = useAuthStore()
  const [view, setView]   = useState({ mode: 'list' })   // list | edit | delete
  const [adding, setAdding] = useState(false)

  const active = view.farm

  return (
    <div style={overlay}>
      <div style={sheet}>
        {/* Header */}
        <div className="flex items-center gap-2 px-5 py-4 border-b" style={{ borderColor: 'var(--c-border-md)' }}>
          {view.mode !== 'list' && (
            <button onClick={() => setView({ mode: 'list' })} style={iconBtn} aria-label="Back">
              <ChevronLeft size={18} />
            </button>
          )}
          <h2 className="flex-1 text-base font-bold" style={{ color: 'var(--c-text)' }}>
            {view.mode === 'list'   && 'Manage Farms'}
            {view.mode === 'edit'   && 'Edit Farm'}
            {view.mode === 'delete' && 'Delete Farm'}
          </h2>
          <button onClick={onClose} style={iconBtn} aria-label="Close"><X size={18} /></button>
        </div>

        <div className="overflow-y-auto" style={{ maxHeight: '70vh' }}>
          {view.mode === 'list'   && (
            <FarmList farms={farms}
              onEdit={f => setView({ mode: 'edit', farm: f })}
              onDelete={f => setView({ mode: 'delete', farm: f })}
              onAdd={() => setAdding(true)} />
          )}
          {view.mode === 'edit'   && (
            <EditFarm farm={active} updateFarm={updateFarm} onDone={() => setView({ mode: 'list' })} />
          )}
          {view.mode === 'delete' && (
            <DeleteFarm farm={active} deleteFarm={deleteFarm}
              onCancel={() => setView({ mode: 'list' })} onDeleted={onClose} />
          )}
        </div>
      </div>

      {adding && <CreateFarmModal onClose={() => setAdding(false)} />}
    </div>
  )
}

// ── List ─────────────────────────────────────────────────────────────────────
function FarmList({ farms, onEdit, onDelete, onAdd }) {
  return (
    <div className="py-2">
      {farms.map(f => {
        const admin = isAdmin(f.role)
        return (
          <div key={f.farm_id} className="flex items-center gap-3 px-5 py-3">
            <div className="w-9 h-9 rounded-lg flex items-center justify-center text-base shrink-0" style={{ background: '#1D9E7520' }}>🌾</div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold truncate" style={{ color: 'var(--c-text)' }}>{f.farm_name}</p>
              <p className="text-[11px]" style={{ color: 'var(--c-faint)' }}>
                {f.total_acres ? `${f.total_acres} acres · ` : ''}{f.role}
              </p>
            </div>
            {admin ? (
              <>
                <button onClick={() => onEdit(f)} style={iconBtn} aria-label="Edit farm"><Pencil size={16} /></button>
                <button onClick={() => onDelete(f)} style={{ ...iconBtn, color: '#E24B4A' }} aria-label="Delete farm"><Trash2 size={16} /></button>
              </>
            ) : (
              <span className="text-[10px] px-2 py-1 rounded" style={{ background: 'var(--c-ghost)', color: 'var(--c-faint)' }}>view only</span>
            )}
          </div>
        )
      })}

      <button onClick={onAdd}
        className="w-full flex items-center gap-3 px-5 py-3 mt-1 text-left"
        style={{ color: '#1D9E75' }}>
        <Plus size={18} />
        <span className="text-sm font-semibold">Add New Farm</span>
      </button>
    </div>
  )
}

// ── Edit ─────────────────────────────────────────────────────────────────────
function EditFarm({ farm, updateFarm, onDone }) {
  const [form, setForm]       = useState({ name: farm.farm_name || '', location: farm.location || '', total_acres: farm.total_acres ?? '' })
  const [saving, setSaving]   = useState(false)
  const [error, setError]     = useState('')

  const submit = async (e) => {
    e.preventDefault()
    if (!form.name.trim()) { setError('Farm name is required'); return }
    setSaving(true); setError('')
    try {
      await updateFarm(farm.farm_id, form)
      onDone()
    } catch (err) {
      setError(err.message || 'Could not save changes')
    } finally { setSaving(false) }
  }

  return (
    <form onSubmit={submit} className="px-5 py-4 flex flex-col gap-4">
      {error && <div style={errBox}>{error}</div>}
      <Field label="Farm Name *" value={form.name} onChange={v => setForm(f => ({ ...f, name: v }))} autoFocus />
      <Field label="Location" value={form.location} onChange={v => setForm(f => ({ ...f, location: v }))} placeholder="e.g. Pilibhit, Uttar Pradesh" />
      <Field label="Total Acres" type="number" value={form.total_acres} onChange={v => setForm(f => ({ ...f, total_acres: v }))} placeholder="e.g. 75" />
      <div className="flex gap-3 mt-1">
        <button type="button" onClick={onDone} style={btnGhost}>Cancel</button>
        <button type="submit" disabled={saving} style={{ ...btnPrimary, opacity: saving ? 0.6 : 1 }}>
          {saving ? 'Saving…' : 'Save Changes'}
        </button>
      </div>
    </form>
  )
}

// ── Delete (typed-name confirmation) ─────────────────────────────────────────
function DeleteFarm({ farm, deleteFarm, onCancel, onDeleted }) {
  const [typed, setTyped]   = useState('')
  const [busy, setBusy]     = useState(false)
  const [error, setError]   = useState('')

  // The confirmation phrase is "delete <farm name>" — the word forces the user to
  // spell out the action, not just echo a name. Whitespace is collapsed and case
  // ignored on both sides so a stray trailing space in the stored name (or mobile
  // auto-capitalisation) can't leave the button permanently disabled.
  const norm    = (s) => (s || '').replace(/\s+/g, ' ').trim().toLowerCase()
  const farmName = (farm.farm_name || '').replace(/\s+/g, ' ').trim()
  const phrase   = `delete ${farmName}`
  const confirmed = norm(typed) === norm(phrase)

  const run = async () => {
    if (!confirmed) return
    setBusy(true); setError('')
    try {
      await deleteFarm(farm.farm_id)
      onDeleted()
    } catch (err) {
      setError(err.message || 'Could not delete farm')
      setBusy(false)
    }
  }

  return (
    <div className="px-5 py-4 flex flex-col gap-4">
      <div className="flex gap-3 p-3 rounded-lg" style={{ background: 'rgba(226,75,74,0.1)', border: '1px solid rgba(226,75,74,0.3)' }}>
        <AlertTriangle size={20} style={{ color: '#E24B4A', flexShrink: 0, marginTop: 1 }} />
        <div className="text-[13px] leading-relaxed" style={{ color: 'var(--c-text)' }}>
          This permanently deletes <strong>{farmName}</strong> and <strong>everything in it</strong> —
          plots, crops, activity logs, inventory, labour records, livestock, the full financial ledger,
          diaries and photos. This <strong>cannot be undone</strong> and the data cannot be recovered.
        </div>
      </div>

      {error && <div style={errBox}>{error}</div>}

      <div>
        <label className="text-[13px] font-semibold block mb-1.5" style={{ color: 'var(--c-text)' }}>
          Type <span style={{ color: '#E24B4A', fontWeight: 700 }}>{phrase}</span> to confirm
        </label>
        <input
          value={typed}
          onChange={e => setTyped(e.target.value)}
          placeholder={phrase}
          autoFocus
          autoCapitalize="off" autoCorrect="off" spellCheck={false}
          style={input}
        />
      </div>

      <div className="flex gap-3">
        <button onClick={onCancel} style={btnGhost}>Cancel</button>
        <button onClick={run} disabled={!confirmed || busy}
          style={{ ...btnDanger, opacity: (!confirmed || busy) ? 0.5 : 1, cursor: (!confirmed || busy) ? 'not-allowed' : 'pointer' }}>
          {busy ? 'Deleting…' : 'Delete this farm'}
        </button>
      </div>
    </div>
  )
}

// ── Small shared field ───────────────────────────────────────────────────────
function Field({ label, value, onChange, type = 'text', placeholder, autoFocus }) {
  return (
    <div>
      <label className="text-[13px] font-semibold block mb-1" style={{ color: 'var(--c-text)' }}>{label}</label>
      <input type={type} value={value} placeholder={placeholder} autoFocus={autoFocus}
        onChange={e => onChange(e.target.value)} style={input} />
    </div>
  )
}

// ── Styles ───────────────────────────────────────────────────────────────────
const overlay = { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2000, padding: '16px' }
const sheet   = { background: 'var(--c-nav)', borderRadius: '16px', width: '100%', maxWidth: '420px', boxShadow: '0 20px 60px rgba(0,0,0,0.4)', overflow: 'hidden' }
const iconBtn = { width: '30px', height: '30px', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '8px', background: 'transparent', border: 'none', color: 'var(--c-muted)', cursor: 'pointer' }
const input   = { width: '100%', padding: '10px 12px', border: '1px solid var(--c-border-md)', borderRadius: '8px', fontSize: '14px', boxSizing: 'border-box', background: 'var(--c-bg)', color: 'var(--c-text)' }
const errBox  = { background: 'rgba(226,75,74,0.1)', border: '1px solid rgba(226,75,74,0.3)', borderRadius: '8px', padding: '10px 14px', color: '#E24B4A', fontSize: '13px' }
const btnBase = { flex: 1, padding: '11px', borderRadius: '8px', fontSize: '14px', fontWeight: 600, cursor: 'pointer' }
const btnGhost   = { ...btnBase, border: '1px solid var(--c-border-md)', background: 'transparent', color: 'var(--c-text)' }
const btnPrimary = { ...btnBase, border: 'none', background: '#1D9E75', color: '#fff' }
const btnDanger  = { ...btnBase, border: 'none', background: '#E24B4A', color: '#fff' }

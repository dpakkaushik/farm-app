import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAppStore } from '../store'
import { useAuthStore, isAdmin } from '../store/auth'
import { ArrowLeft, AlertTriangle, CheckCircle2 } from 'lucide-react'

// Go-live conversion — a farm with backfilled history re-baselines as a fresh
// mid-year signup. Everything before the cutover folds into opening balances;
// actual entries run from the cutover. The arithmetic and the safety live in
// the database (migration 0030): archived before deleted, verified balance-by-
// balance, rolled back whole on any mismatch, one shot per farm.
//
// This page only does what a page should: show the owner exactly what will
// happen, in rupees, and refuse to run until they have read it and typed the
// confirmation phrase.

const CONFIRM_PHRASE = 'START FRESH'

const fmt = (n) => `₹${Number(n || 0).toLocaleString('en-IN')}`

export default function GoLive() {
  const navigate = useNavigate()
  const { farms, activeFarmId } = useAuthStore()
  const role  = farms.find(f => f.farm_id === activeFarmId)?.role || null
  const admin = isAdmin(role)
  const { farmOpening, loadFarmOpening, goLivePreview, goLiveConvert } = useAppStore()

  // The "already live" gate needs the real go_live_date, not whatever a
  // previous page happened to leave in the store. The server refuses a second
  // run regardless — this is about showing the right screen, not safety.
  useEffect(() => { loadFarmOpening?.() }, [])

  const defaultMonth = new Date().toISOString().slice(0, 7)
  const [month, setMonth]     = useState(defaultMonth)
  const [preview, setPreview] = useState(null)
  const [confirm, setConfirm] = useState('')
  const [busy, setBusy]       = useState(false)
  const [error, setError]     = useState('')
  const [result, setResult]   = useState(null)

  const cutover = `${month}-01`

  const loadPreview = async () => {
    setBusy(true); setError(''); setPreview(null); setConfirm('')
    try {
      setPreview(await goLivePreview(cutover))
    } catch (e) {
      setError(e.message || 'Could not build the preview.')
    }
    setBusy(false)
  }

  const runConvert = async () => {
    if (confirm.trim() !== CONFIRM_PHRASE || busy) return
    setBusy(true); setError('')
    try {
      setResult(await goLiveConvert(cutover))
    } catch (e) {
      setError(e.message || 'Conversion failed — nothing was changed.')
    }
    setBusy(false)
  }

  if (!admin) {
    return (
      <Shell onBack={() => navigate(-1)}>
        <p className="text-xs" style={{ color: 'var(--c-faint)' }}>
          Only the farm owner can run a go-live conversion.
        </p>
      </Shell>
    )
  }

  // Already live — either from a past conversion or from onboarding. There is
  // nothing to run twice; say when the books started and stop.
  if (farmOpening?.goLiveDate && !result) {
    return (
      <Shell onBack={() => navigate(-1)}>
        <div className="flex items-start gap-2.5 p-3.5 rounded-xl"
          style={{ background: 'rgba(29,158,117,0.1)' }}>
          <CheckCircle2 size={18} style={{ color: '#1D9E75', flexShrink: 0 }} />
          <div>
            <p className="text-[13px] font-bold" style={{ color: 'var(--c-text)' }}>
              These books are live
            </p>
            <p className="text-[11px] mt-1 leading-relaxed" style={{ color: 'var(--c-muted)' }}>
              Transactions have been recorded as they happen since{' '}
              <b>{farmOpening.goLiveDate}</b>. Positions from before that date are
              stated as opening balances. A go-live conversion runs once — there is
              nothing more to convert.
            </p>
          </div>
        </div>
      </Shell>
    )
  }

  if (result) {
    return (
      <Shell onBack={() => navigate('/ledger')}>
        <div className="flex items-start gap-2.5 p-3.5 rounded-xl mb-3"
          style={{ background: 'rgba(29,158,117,0.1)' }}>
          <CheckCircle2 size={18} style={{ color: '#1D9E75', flexShrink: 0 }} />
          <div>
            <p className="text-[13px] font-bold" style={{ color: 'var(--c-text)' }}>
              Books start fresh from {result.cutover}
            </p>
            <p className="text-[11px] mt-1 leading-relaxed" style={{ color: 'var(--c-muted)' }}>
              Every balance was verified unchanged before the conversion was allowed to
              finish. Deleted rows are archived (batch {String(result.batch_id).slice(0, 8)}…),
              and every opening figure is logged with who set it and when.
            </p>
          </div>
        </div>
        <SectionTitle>Rows folded into opening balances</SectionTitle>
        <div className="rounded-xl border p-3 text-[11px]"
          style={{ borderColor: 'var(--c-border)', color: 'var(--c-muted)' }}>
          {Object.entries(result.deleted || {}).filter(([, n]) => n > 0).map(([t, n]) => (
            <div key={t} className="flex justify-between py-0.5">
              <span>{t.replaceAll('_', ' ')}</span><b style={{ color: 'var(--c-text)' }}>{n}</b>
            </div>
          ))}
        </div>
        <button onClick={() => navigate('/ledger')} className="mt-4 w-full py-3 rounded-xl text-sm font-bold text-white"
          style={{ background: '#1D9E75' }}>
          Open the Ledger →
        </button>
      </Shell>
    )
  }

  return (
    <Shell onBack={() => navigate(-1)}>
      <p className="text-[12px] leading-relaxed mb-4" style={{ color: 'var(--c-muted)' }}>
        Start the books fresh from a date. Everything before it becomes opening
        balances — cash in each account, what each party owes or is owed, stock on
        the shelf, what each standing crop has already cost. Settled old records are
        archived and removed; unpaid items stay until they are settled. Actual
        entries run from the date you pick.
      </p>

      <SectionTitle>Books start from</SectionTitle>
      <div className="flex gap-2 mb-4">
        <input type="month" value={month} onChange={e => { setMonth(e.target.value); setPreview(null) }}
          className="flex-1 px-3 py-2.5 rounded-xl border text-sm"
          style={{ background: 'var(--c-surface)', borderColor: 'var(--c-border)', color: 'var(--c-text)' }} />
        <button onClick={loadPreview} disabled={busy || !month}
          className="px-4 py-2.5 rounded-xl text-sm font-bold text-white"
          style={{ background: busy ? 'var(--c-faint)' : '#1D9E75' }}>
          {busy && !preview ? 'Working…' : 'Preview'}
        </button>
      </div>
      <p className="text-[10px] -mt-3 mb-4" style={{ color: 'var(--c-faint)' }}>
        Books always cut at the 1st of a month — the conversion runs from {cutover}.
      </p>

      {error && (
        <div className="p-3 rounded-xl text-[11px] mb-4"
          style={{ background: 'rgba(226,75,74,0.1)', color: '#E24B4A' }}>{error}</div>
      )}

      {preview && (
        <>
          <PreviewTable title="Cash & bank — opening balance per account"
            rows={(preview.accounts || []).map(a => ({ label: a.name, value: fmt(a.new_opening) }))} />
          <PreviewTable title="Owed to vendors (folded into party opening balance)"
            rows={(preview.vendors || []).map(v => ({ label: v.name, value: fmt(v.new_opening) }))}
            empty="No vendor balances to carry in." />
          <PreviewTable title="Worker khata openings (earned − advances − paid)"
            rows={(preview.labour || []).map(w => ({
              label: w.name,
              value: fmt(w.new_opening),
              sub: w.new_opening < 0 ? 'owes the farm (advances)' : 'farm owes',
            }))}
            empty="No worker balances to carry in." />
          <PreviewTable title="Stock on hand (becomes OPENING-STOCK)"
            rows={(preview.stock || []).map(s => ({
              label: `${s.name} — ${Number(s.qty).toLocaleString('en-IN')} ${s.unit || ''}`,
              value: fmt(s.value),
            }))}
            empty="No stock to carry in." />
          <PreviewTable title="Standing crops — spend so far becomes opening cost"
            rows={(preview.cycles || []).filter(c => c.fold !== 0).map(c => ({
              label: `${c.plot} — ${c.crop}`, value: fmt(c.new_opening_cost),
            }))}
            empty="No standing-crop costs to carry in." />

          {(preview.cycles || []).some(c => c.revenue_erased > 0) && (
            <Warn>
              Revenue from settled old sales is part of pre-go-live history and will not
              appear in any report afterwards:{' '}
              {(preview.cycles || []).filter(c => c.revenue_erased > 0)
                .map(c => `${c.plot} ${fmt(c.revenue_erased)}`).join(', ')}.
            </Warn>
          )}

          {(preview.kept_open_items?.unpaid_labour_logs?.length > 0
            || preview.kept_open_items?.unpaid_expenses?.length > 0
            || preview.kept_open_items?.unpaid_sales?.length > 0) && (
            <Warn tone="info">
              Unpaid items survive with their original dates, because the row itself is
              the record of the due:{' '}
              {[
                ...(preview.kept_open_items.unpaid_labour_logs || []).map(l => `${l.name} ${fmt(l.amount)} (labour, ${l.date})`),
                ...(preview.kept_open_items.unpaid_expenses || []).map(x => `${x.paid_to || x.category} ${fmt(x.amount)} (expense, ${x.date})`),
                ...(preview.kept_open_items.unpaid_sales || []).map(s => `${s.buyer} ${fmt(s.outstanding)} (sale, ${s.date})`),
              ].join(' · ')}
            </Warn>
          )}

          <SectionTitle>Old records removed (archived first)</SectionTitle>
          <div className="rounded-xl border p-3 text-[11px] mb-4"
            style={{ borderColor: 'var(--c-border)', color: 'var(--c-muted)' }}>
            {Object.entries(preview.deletes || {}).filter(([, n]) => n > 0).map(([t, n]) => (
              <div key={t} className="flex justify-between py-0.5">
                <span>{t.replaceAll('_', ' ')}</span><b style={{ color: 'var(--c-text)' }}>{n}</b>
              </div>
            ))}
          </div>

          <div className="p-3.5 rounded-xl border mb-3"
            style={{ borderColor: 'rgba(226,75,74,0.4)', background: 'rgba(226,75,74,0.05)' }}>
            <div className="flex items-start gap-2 mb-2.5">
              <AlertTriangle size={15} style={{ color: '#E24B4A', flexShrink: 0, marginTop: 1 }} />
              <p className="text-[11px] leading-relaxed" style={{ color: 'var(--c-muted)' }}>
                This runs once and cannot be re-run. Removed rows are archived, and the
                conversion aborts itself if any balance would change — but the detailed
                history above will no longer be visible anywhere in the app. Type{' '}
                <b style={{ color: '#E24B4A' }}>{CONFIRM_PHRASE}</b> to continue.
              </p>
            </div>
            <input value={confirm} onChange={e => setConfirm(e.target.value)}
              placeholder={CONFIRM_PHRASE}
              className="w-full px-3 py-2.5 rounded-xl border text-sm mb-2.5"
              style={{ background: 'var(--c-surface)', borderColor: 'var(--c-border)', color: 'var(--c-text)' }} />
            <button onClick={runConvert} disabled={busy || confirm.trim() !== CONFIRM_PHRASE}
              className="w-full py-3 rounded-xl text-sm font-bold text-white"
              style={{ background: confirm.trim() === CONFIRM_PHRASE && !busy ? '#E24B4A' : 'var(--c-faint)' }}>
              {busy ? 'Converting…' : `Start fresh from ${cutover}`}
            </button>
          </div>
        </>
      )}
    </Shell>
  )
}

function Shell({ onBack, children }) {
  return (
    <div className="h-full overflow-y-auto" style={{ background: 'var(--c-bg)' }}>
      <div className="max-w-lg mx-auto px-4 py-4 pb-10">
        <div className="flex items-center gap-2 mb-4">
          <button onClick={onBack} className="p-1.5 rounded-lg" style={{ background: 'var(--c-ghost)' }}>
            <ArrowLeft size={16} style={{ color: 'var(--c-muted)' }} />
          </button>
          <div>
            <h1 className="text-sm font-bold" style={{ color: 'var(--c-text)' }}>Start fresh — go live</h1>
            <p className="text-[10px]" style={{ color: 'var(--c-faint)' }}>
              Opening balances in, old records out
            </p>
          </div>
        </div>
        {children}
      </div>
    </div>
  )
}

function SectionTitle({ children }) {
  return (
    <div className="text-[10px] font-bold uppercase tracking-wider mb-1.5"
      style={{ color: 'var(--c-faint)' }}>{children}</div>
  )
}

function PreviewTable({ title, rows, empty }) {
  return (
    <div className="mb-4">
      <SectionTitle>{title}</SectionTitle>
      <div className="rounded-xl border p-3" style={{ borderColor: 'var(--c-border)' }}>
        {rows.length === 0 ? (
          <p className="text-[11px]" style={{ color: 'var(--c-faint)' }}>{empty || 'Nothing here.'}</p>
        ) : rows.map((r, i) => (
          <div key={i} className="flex justify-between items-baseline py-1 gap-3">
            <div className="min-w-0">
              <span className="text-[11px]" style={{ color: 'var(--c-muted)' }}>{r.label}</span>
              {r.sub && <span className="text-[9px] ml-1.5" style={{ color: 'var(--c-faint)' }}>{r.sub}</span>}
            </div>
            <b className="text-[11px] whitespace-nowrap" style={{ color: 'var(--c-text)' }}>{r.value}</b>
          </div>
        ))}
      </div>
    </div>
  )
}

function Warn({ children, tone = 'warn' }) {
  const color = tone === 'warn' ? '#BA7517' : 'var(--c-muted)'
  const bg    = tone === 'warn' ? 'rgba(186,117,23,0.1)' : 'var(--c-ghost)'
  return (
    <div className="p-3 rounded-xl text-[11px] leading-relaxed mb-4" style={{ background: bg, color }}>
      {children}
    </div>
  )
}

import React, { useState, useEffect } from 'react'
import { format } from 'date-fns'
import { Plus, X, CheckCircle2, AlertTriangle } from 'lucide-react'
import { useAppStore } from '../store'
import { supabase } from '../lib/supabase'

const TODAY_STR   = new Date().toISOString().slice(0, 10)
const TODAY_LABEL = format(new Date(), 'EEEE, d MMMM yyyy')

// Contractual work types — hardcoded, NOT stored in labour_master
const CONTRACTUAL_TYPES = [
  { name: 'General Field Labour',    rate: 400 },
  { name: 'Harvesting Labour',       rate: 500 },
  { name: 'Spray / Chemical Labour', rate: 400 },
  { name: 'Ploughing Labour',        rate: 450 },
  { name: 'Irrigation Labour',       rate: 350 },
  { name: 'Weeding Labour',          rate: 400 },
  { name: 'Other',                   rate: 400 },
]

export default function Labour() {
  const [subTab, setSubTab] = useState('attendance')
  const { permanentStaff, regularLabourers, labourLogs, cropCycles, cropMaster, logLabour } = useAppStore()
  const [toast, setToast] = useState(null)
  const [toastType, setToastType] = useState('success')

  const showToast = (msg, type = 'success') => {
    setToast(msg); setToastType(type); setTimeout(() => setToast(null), 3000)
  }

  return (
    <div className="h-full flex flex-col bg-[#0f1117]">
      {/* Header */}
      <div className="shrink-0 px-4 pt-4 pb-0 bg-[#0f1117]">
        <h2 className="text-lg font-bold text-white">Manpower</h2>
        <p className="text-xs text-white/40 mb-3">Attendance · Work logs · Payments</p>
        <div className="flex gap-1 border-b border-white/8">
          {[['attendance','📋 Attendance'], ['logs','🗒 Logs'], ['summary','📊 Summary']].map(([k, lbl]) => (
            <button key={k} onClick={() => setSubTab(k)}
              className={`flex-1 py-2.5 text-xs font-semibold border-b-2 transition-colors
                ${subTab === k ? 'border-[#1D9E75] text-[#1D9E75]' : 'border-transparent text-white/40'}`}>
              {lbl}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {subTab === 'attendance' && <LabourToday   permanentStaff={permanentStaff} regularLabourers={regularLabourers} labourLogs={labourLogs} cropCycles={cropCycles} cropMaster={cropMaster} logLabour={logLabour} showToast={showToast} />}
        {subTab === 'logs'    && <LabourLogs    labourLogs={labourLogs} />}
        {subTab === 'summary' && <LabourSummary permanentStaff={permanentStaff} regularLabourers={regularLabourers} labourLogs={labourLogs} />}
      </div>

      {toast && (
        <div className={`fixed bottom-24 left-4 right-4 px-4 py-3 rounded-2xl text-sm font-medium text-white shadow-xl z-50 flex items-center gap-2 ${toastType === 'warn' ? 'bg-[#BA7517]' : 'bg-[#1D9E75]'}`}>
          {toastType === 'warn' ? <AlertTriangle size={16}/> : <CheckCircle2 size={16}/>} {toast}
        </div>
      )}
    </div>
  )
}

// ── Today: attendance + task log ──────────────────────────────────────────────
function LabourToday({ permanentStaff, regularLabourers, labourLogs, cropCycles, cropMaster, logLabour, showToast }) {
  const [attTab,        setAttTab]       = useState(() => permanentStaff.length > 0 ? 'staff' : 'labour')
  const [attendance,    setAttendance]   = useState({})
  const [loadingAtt,    setLoadingAtt]   = useState(true)
  const [savingAtt,     setSavingAtt]    = useState({})
  const [showLogModal,  setShowLogModal] = useState(null)
  const [ctForm,        setCtForm]       = useState({ category: '', workers: '', rate: '', cycleId: '', purpose: '', date: TODAY_STR })
  const [saving,        setSaving]       = useState(false)

  // Auto-switch if selected tab becomes empty after load
  useEffect(() => {
    if (attTab === 'staff' && permanentStaff.length === 0 && regularLabourers.length > 0) setAttTab('labour')
    if (attTab === 'labour' && regularLabourers.length === 0 && permanentStaff.length > 0) setAttTab('staff')
  }, [permanentStaff.length, regularLabourers.length])

  useEffect(() => {
    supabase.from('attendance').select('*').eq('attendance_date', TODAY_STR)
      .then(({ data }) => {
        const map = {}
        ;(data || []).forEach(r => { map[r.labour_master_id] = { status: r.status, id: r.id } })
        setAttendance(map)
        setLoadingAtt(false)
      })
  }, [])

  const markAttendance = async (labourId, status) => {
    if (attendance[labourId]?.status === status) return
    setSavingAtt(s => ({ ...s, [labourId]: true }))
    const { data, error } = await supabase.from('attendance').upsert(
      { labour_master_id: labourId, attendance_date: TODAY_STR, status },
      { onConflict: 'labour_master_id,attendance_date' }
    ).select().single()
    if (!error) setAttendance(prev => ({ ...prev, [labourId]: { status, id: data?.id } }))
    setSavingAtt(s => ({ ...s, [labourId]: false }))
  }

  const addContractual = async () => {
    const workers = parseFloat(ctForm.workers), rate = parseFloat(ctForm.rate)
    if (!ctForm.category || !workers || !rate) return showToast('Select category, workers and rate', 'warn')
    const cycle = cropCycles.find(c => c.id === ctForm.cycleId)
    setSaving(true)
    try {
      await logLabour({
        labourType:  'contractual',
        labourName:  ctForm.category || 'Contractual Labour',
        plotId:      cycle?.plotId || null,
        cropCycleId: ctForm.cycleId || null,
        date:        ctForm.date,
        workers,
        ratePerDay:  rate,
        totalCost:   workers * rate,
        purpose:     ctForm.purpose || cat?.name || 'Contractual work',
      })
      showToast('Labour logged')
      setCtForm({ categoryId: '', workers: '', rate: '', cycleId: '', purpose: '', date: TODAY_STR })
    } catch (e) { showToast('Failed: ' + e.message, 'warn') }
    setSaving(false)
  }

  const todayLogs     = labourLogs.filter(l => l.date === TODAY_STR)
  const presentCount  = Object.values(attendance).filter(a => a.status === 'present').length
  const halfCount     = Object.values(attendance).filter(a => a.status === 'half_day').length
  const absentCount   = Object.values(attendance).filter(a => a.status === 'absent').length
  const todayWages    = regularLabourers.reduce((sum, l) => {
    const att = attendance[l.id]
    if (att?.status === 'present')  return sum + l.ratePerDay
    if (att?.status === 'half_day') return sum + l.ratePerDay / 2
    return sum
  }, 0)
  const todayContractual = todayLogs.reduce((s, l) => s + (l.totalCost || 0), 0)

  return (
    <div className="p-4 space-y-4 pb-24">
      <p className="text-xs text-white/40">{TODAY_LABEL}</p>

      {/* Summary */}
      <div className="grid grid-cols-2 gap-2">
        <div className="bg-[#1D9E75]/10 border border-[#1D9E75]/20 rounded-xl px-3 py-2.5">
          <p className="text-[10px] text-white/40">Regular wages today</p>
          <p className="text-xl font-bold text-[#1D9E75]">₹{todayWages.toLocaleString()}</p>
          <p className="text-[10px] text-white/35">{presentCount} present · {halfCount} half · {absentCount} absent</p>
        </div>
        <div className="bg-[#BA7517]/10 border border-[#BA7517]/20 rounded-xl px-3 py-2.5">
          <p className="text-[10px] text-white/40">Contractual today</p>
          <p className="text-xl font-bold text-[#BA7517]">₹{todayContractual.toLocaleString()}</p>
          <p className="text-[10px] text-white/35">{todayLogs.length} log{todayLogs.length !== 1 ? 's' : ''}</p>
        </div>
      </div>

      {/* Staff / Labour toggle + attendance */}
      <div>
        {/* Toggle buttons */}
        <div className="flex gap-2 mb-3">
          <button onClick={() => setAttTab('staff')}
            className="flex-1 py-2.5 rounded-xl text-xs font-bold border transition-all"
            style={{
              background:  attTab === 'staff' ? '#4169E122' : 'rgba(255,255,255,0.04)',
              borderColor: attTab === 'staff' ? '#4169E1'   : 'rgba(255,255,255,0.10)',
              color:       attTab === 'staff' ? '#4169E1'   : 'rgba(255,255,255,0.35)',
            }}>
            🏢 Staff {permanentStaff.length > 0 ? `(${permanentStaff.length})` : ''}
          </button>
          <button onClick={() => setAttTab('labour')}
            className="flex-1 py-2.5 rounded-xl text-xs font-bold border transition-all"
            style={{
              background:  attTab === 'labour' ? '#1D9E7522' : 'rgba(255,255,255,0.04)',
              borderColor: attTab === 'labour' ? '#1D9E75'   : 'rgba(255,255,255,0.10)',
              color:       attTab === 'labour' ? '#1D9E75'   : 'rgba(255,255,255,0.35)',
            }}>
            👷 Labour {regularLabourers.length > 0 ? `(${regularLabourers.length})` : ''}
          </button>
        </div>

        <p className="text-[10px] font-bold text-white/40 uppercase tracking-wide mb-2">
          {attTab === 'staff' ? 'Permanent Staff' : 'Regular Labourers'} — Mark Attendance
          {loadingAtt && <span className="ml-2 text-white/20">loading…</span>}
        </p>

        {/* People list */}
        {(() => {
          const people = attTab === 'staff' ? permanentStaff : regularLabourers
          const accentColor = attTab === 'staff' ? '#4169E1' : '#1D9E75'

          if (people.length === 0) return (
            <div className="bg-[#161a23] rounded-xl border border-white/8 px-4 py-6 text-center">
              <p className="text-sm text-white/30">
                No {attTab === 'staff' ? 'permanent staff' : 'regular labourers'} added yet.
              </p>
              <p className="text-xs text-white/20 mt-1">Go to Admin → Labour to add them.</p>
            </div>
          )

          return people.map(l => {
            const att    = attendance[l.id]
            const status = att?.status
            const busy   = !!savingAtt[l.id]
            const subLabel = attTab === 'staff'
              ? `${l.designation || 'Staff'} · ₹${l.monthlySalary || 0}/mo${l.phone ? ` · ${l.phone}` : ''}`
              : `${l.workType} · ₹${l.ratePerDay}/day${l.phone ? ` · ${l.phone}` : ''}`

            return (
              <div key={l.id} className="bg-[#161a23] rounded-2xl border border-white/8 p-3 mb-2">
                <div className="flex items-center gap-3 mb-2.5">
                  {l.photoUrl
                    ? <img src={l.photoUrl} alt={l.name} className="w-10 h-10 rounded-full object-cover shrink-0 border border-white/10" />
                    : <div className="w-10 h-10 rounded-full flex items-center justify-center shrink-0 border border-white/10"
                        style={{ background: accentColor + '15' }}>
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={accentColor} strokeWidth="1.5" strokeLinecap="round" opacity="0.6">
                          <circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/>
                        </svg>
                      </div>
                  }
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-white">{l.name}</p>
                    <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                      <p className="text-[10px] text-white/40">{attTab === 'staff' ? `${l.designation || 'Staff'} · ₹${l.monthlySalary || 0}/mo` : `${l.workType} · ₹${l.ratePerDay}/day`}</p>
                      {l.phone && (
                        <a href={`tel:${l.phone}`} onClick={e => e.stopPropagation()}
                          className="inline-flex items-center gap-0.5 text-[10px] font-semibold px-1.5 py-0.5 rounded-lg border transition-colors hover:bg-white/8"
                          style={{ color: accentColor, borderColor: accentColor + '40' }}>
                          📞 {l.phone}
                        </a>
                      )}
                    </div>
                  </div>
                  {status && (
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0
                      ${status === 'present'  ? 'bg-[#1D9E75]/20 text-[#1D9E75]'
                      : status === 'half_day' ? 'bg-[#BA7517]/20 text-[#BA7517]'
                      :                         'bg-[#E24B4A]/20 text-[#E24B4A]'}`}>
                      {status === 'present' ? '✓ Present' : status === 'half_day' ? '½ Half' : '✗ Absent'}
                    </span>
                  )}
                </div>

                <div className="flex gap-1.5">
                  {[
                    ['present',  '✓ Present',  '#1D9E75'],
                    ['half_day', '½ Half Day', '#BA7517'],
                    ['absent',   '✗ Absent',   '#E24B4A'],
                  ].map(([s, label, color]) => (
                    <button key={s}
                      onClick={() => markAttendance(l.id, s)}
                      disabled={busy}
                      className="flex-1 py-1.5 text-[10px] font-semibold rounded-xl border transition-all"
                      style={{
                        background:  status === s ? color + '22' : 'rgba(255,255,255,0.05)',
                        borderColor: status === s ? color + '55' : 'rgba(255,255,255,0.1)',
                        color:       status === s ? color        : 'rgba(255,255,255,0.4)',
                      }}>
                      {busy ? '…' : label}
                    </button>
                  ))}
                </div>

                {attTab === 'labour' && (status === 'present' || status === 'half_day') && (
                  <button onClick={() => setShowLogModal(l.id)}
                    className="mt-2 w-full py-1.5 text-[10px] font-semibold rounded-xl border border-white/10 text-white/40 hover:border-[#1D9E75]/40 hover:text-[#1D9E75] transition-colors">
                    📋 Assign / Log Task
                  </button>
                )}
              </div>
            )
          })
        })()}
      </div>

      {/* Contractual */}
      <div>
        <p className="text-[10px] font-bold text-white/40 uppercase tracking-wide mb-2">Log Contractual Workers</p>
        <div className="bg-[#161a23] rounded-2xl border border-white/8 p-3 space-y-2.5">
          <div className="grid grid-cols-2 gap-2">
            <FRow label="Work Type">
              <select className="finput" value={ctForm.category} onChange={e => {
                const ct = CONTRACTUAL_TYPES.find(c => c.name === e.target.value)
                setCtForm(p => ({ ...p, category: e.target.value, rate: ct?.rate || '' }))
              }} style={{ background: '#1a2030' }}>
                <option value="" style={{ background: '#1a2030' }}>Select…</option>
                {CONTRACTUAL_TYPES.map(c => (
                  <option key={c.name} value={c.name} style={{ background: '#1a2030' }}>{c.name} (₹{c.rate}/day)</option>
                ))}
              </select>
            </FRow>
            <FRow label="Plot / Cycle">
              <select className="finput" value={ctForm.cycleId} onChange={e => setCtForm(p => ({ ...p, cycleId: e.target.value }))} style={{ background: '#1a2030' }}>
                <option value="" style={{ background: '#1a2030' }}>Farm-wide</option>
                {cropCycles.filter(c => c.status === 'active').map(c => {
                  const crop = cropMaster.find(cr => cr.id === c.cropId)
                  return <option key={c.id} value={c.id} style={{ background: '#1a2030' }}>{c.plotLabel} — {crop?.name || ''}</option>
                })}
              </select>
            </FRow>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <FRow label="# Workers"><input type="number" className="finput" placeholder="0" value={ctForm.workers} onChange={e => setCtForm(p => ({ ...p, workers: e.target.value }))} /></FRow>
            <FRow label="Rate/day (₹)"><input type="number" className="finput" value={ctForm.rate} onChange={e => setCtForm(p => ({ ...p, rate: e.target.value }))} /></FRow>
          </div>
          <FRow label="Purpose (optional)">
            <input className="finput" placeholder="e.g. Harvesting, weeding" value={ctForm.purpose} onChange={e => setCtForm(p => ({ ...p, purpose: e.target.value }))} />
          </FRow>
          <FRow label="Date">
            <input type="date" className="finput" value={ctForm.date} onChange={e => setCtForm(p => ({ ...p, date: e.target.value }))} style={{ colorScheme: 'dark' }} />
          </FRow>
          {ctForm.workers && ctForm.rate && (
            <div className="bg-[#BA7517]/10 border border-[#BA7517]/20 rounded-xl px-3 py-2">
              <p className="text-xs font-bold text-[#BA7517]">Total: ₹{(parseFloat(ctForm.workers) * parseFloat(ctForm.rate)).toLocaleString()}</p>
            </div>
          )}
          <button onClick={addContractual} disabled={saving}
            className="w-full py-2.5 bg-[#1D9E75] text-white text-xs font-bold rounded-xl disabled:opacity-40">
            {saving ? 'Logging…' : '+ Log Contractual Work'}
          </button>
        </div>
      </div>

      {/* Today's logs */}
      {todayLogs.length > 0 && (
        <div>
          <p className="text-[10px] font-bold text-white/40 uppercase tracking-wide mb-2">Today's Work Logged</p>
          {todayLogs.map(l => (
            <div key={l.id} className="bg-[#161a23] rounded-xl border border-white/8 p-3 mb-1.5 flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold text-white">{l.labourName}</p>
                <p className="text-[10px] text-white/40">{l.plotLabel || 'Farm-wide'}{l.workers > 1 ? ` · ${l.workers} workers` : ''}</p>
                {l.purpose && <p className="text-[10px] text-white/30 italic">{l.purpose}</p>}
              </div>
              <p className="text-sm font-bold text-[#BA7517]">₹{(l.totalCost || 0).toLocaleString()}</p>
            </div>
          ))}
        </div>
      )}

      {showLogModal && (
        <LogTaskModal
          labourer={regularLabourers.find(l => l.id === showLogModal)}
          cropCycles={cropCycles}
          cropMaster={cropMaster}
          logLabour={logLabour}
          showToast={showToast}
          onClose={() => setShowLogModal(null)}
        />
      )}
    </div>
  )
}

// ── Assign / Log Task for a regular labourer ──────────────────────────────────
function LogTaskModal({ labourer, cropCycles, cropMaster, logLabour, showToast, onClose }) {
  const [form, setForm] = useState({ cycleId: '', purpose: '', date: TODAY_STR })
  const [saving, setSaving] = useState(false)

  const submit = async () => {
    if (!labourer) return
    const cycle = cropCycles.find(c => c.id === form.cycleId)
    setSaving(true)
    try {
      await logLabour({
        labourType:     'regular',
        labourMasterId: labourer.id,
        labourName:     labourer.name,
        plotId:         cycle?.plotId || null,
        cropCycleId:    form.cycleId || null,
        date:           form.date,
        workers:        1,
        ratePerDay:     labourer.ratePerDay,
        totalCost:      labourer.ratePerDay,
        purpose:        form.purpose || 'Daily work',
      })
      showToast(`Task logged for ${labourer.name}`)
      onClose()
    } catch (e) { showToast('Failed: ' + e.message, 'warn') }
    setSaving(false)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end" style={{ background: 'rgba(0,0,0,0.75)' }} onClick={onClose}>
      <div className="w-full bg-[#161a23] rounded-t-3xl p-5 border-t border-white/10 space-y-3" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-bold text-white">Log Task</h3>
            <p className="text-xs text-white/40">{labourer?.name} · ₹{labourer?.ratePerDay}/day</p>
          </div>
          <button onClick={onClose} className="text-white/40 hover:text-white"><X size={18}/></button>
        </div>
        <FRow label="Plot / Cycle">
          <select className="finput" value={form.cycleId} onChange={e => setForm(p => ({ ...p, cycleId: e.target.value }))} style={{ background: '#1a2030' }}>
            <option value="" style={{ background: '#1a2030' }}>Farm-wide / General</option>
            {cropCycles.filter(c => c.status === 'active').map(c => {
              const crop = cropMaster.find(cr => cr.id === c.cropId)
              return <option key={c.id} value={c.id} style={{ background: '#1a2030' }}>{c.plotLabel} — {crop?.name || ''}</option>
            })}
          </select>
        </FRow>
        <FRow label="Task / Purpose">
          <input className="finput" placeholder="e.g. Irrigation, weeding, spraying" value={form.purpose} onChange={e => setForm(p => ({ ...p, purpose: e.target.value }))} />
        </FRow>
        <FRow label="Date">
          <input type="date" className="finput" value={form.date} onChange={e => setForm(p => ({ ...p, date: e.target.value }))} style={{ colorScheme: 'dark' }} />
        </FRow>
        <button onClick={submit} disabled={saving}
          className="w-full py-3 bg-[#1D9E75] text-white text-sm font-bold rounded-xl disabled:opacity-40">
          {saving ? 'Saving…' : 'Log Task'}
        </button>
        <style>{`.finput{width:100%;background:rgba(255,255,255,0.08);border:1px solid rgba(255,255,255,0.12);border-radius:12px;padding:10px 14px;color:white;font-size:14px;outline:none;}.finput:focus{border-color:#1D9E75;}`}</style>
      </div>
    </div>
  )
}

// ── Labour Logs ───────────────────────────────────────────────────────────────
function LabourLogs({ labourLogs }) {
  const total = labourLogs.reduce((s, l) => s + (l.totalCost || 0), 0)
  return (
    <div className="p-4 space-y-3 pb-4">
      <div className="bg-[#BA7517]/10 border border-[#BA7517]/20 rounded-2xl px-4 py-3">
        <p className="text-xs text-white/50">Total Labour Cost (all time)</p>
        <p className="text-2xl font-bold text-[#BA7517]">₹{total.toLocaleString()}</p>
      </div>
      {labourLogs.map(l => (
        <div key={l.id} className="bg-[#161a23] rounded-2xl border border-white/8 p-4">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-sm font-semibold text-white">{l.labourName}</p>
              <p className="text-xs text-white/40 mt-0.5">{l.plotLabel || 'Farm-wide'}</p>
              <p className="text-[10px] text-white/30 mt-0.5">{l.date}</p>
              {l.purpose && <p className="text-xs text-white/50 mt-1 italic">{l.purpose}</p>}
            </div>
            <div className="text-right">
              <p className="text-base font-bold text-white">₹{(l.totalCost || 0).toLocaleString()}</p>
              {l.workers > 1 && <p className="text-[10px] text-white/40">{l.workers} workers</p>}
              {l.ratePerDay > 0 && <p className="text-[10px] text-white/30">₹{l.ratePerDay}/day</p>}
            </div>
          </div>
        </div>
      ))}
      {labourLogs.length === 0 && <p className="text-center text-white/30 text-sm py-8">No labour logs yet.</p>}
    </div>
  )
}

// ── Labour Summary ────────────────────────────────────────────────────────────
function LabourSummary({ regularLabourers, labourLogs }) {
  const [month,      setMonth]     = useState(new Date().toISOString().slice(0, 7))
  const [attendance, setAttendance] = useState({})

  useEffect(() => {
    supabase.from('attendance')
      .select('labour_master_id, status')
      .gte('attendance_date', month + '-01')
      .lte('attendance_date', month + '-31')
      .in('status', ['present', 'half_day'])
      .then(({ data }) => {
        const counts = {}
        ;(data || []).forEach(r => {
          counts[r.labour_master_id] = (counts[r.labour_master_id] || 0) + (r.status === 'present' ? 1 : 0.5)
        })
        setAttendance(counts)
      })
  }, [month])

  const monthLogs       = labourLogs.filter(l => l.date?.startsWith(month))
  const contractualLogs = monthLogs.filter(l => !regularLabourers.some(r => r.name === l.labourName))
  const regularEarned   = regularLabourers.reduce((s, l) => s + (attendance[l.id] || 0) * l.ratePerDay, 0)
  const contractualCost = contractualLogs.reduce((s, l) => s + (l.totalCost || 0), 0)
  const grandTotal      = regularEarned + contractualCost

  return (
    <div className="p-4 space-y-4 pb-6">
      <div className="flex items-center gap-3">
        <p className="text-sm font-bold text-white flex-1">Monthly Summary</p>
        <input type="month" value={month} onChange={e => setMonth(e.target.value)}
          className="bg-white/8 border border-white/12 rounded-xl px-3 py-2 text-sm text-white outline-none"
          style={{ colorScheme: 'dark' }} />
      </div>

      <div className="grid grid-cols-3 gap-2">
        <div className="bg-[#1D9E75]/10 border border-[#1D9E75]/20 rounded-xl p-3 text-center">
          <p className="text-[10px] text-white/40 mb-1">Regular</p>
          <p className="text-base font-bold text-[#1D9E75]">₹{regularEarned.toLocaleString()}</p>
        </div>
        <div className="bg-[#BA7517]/10 border border-[#BA7517]/20 rounded-xl p-3 text-center">
          <p className="text-[10px] text-white/40 mb-1">Contractual</p>
          <p className="text-base font-bold text-[#BA7517]">₹{contractualCost.toLocaleString()}</p>
        </div>
        <div className="bg-white/5 border border-white/10 rounded-xl p-3 text-center">
          <p className="text-[10px] text-white/40 mb-1">Total</p>
          <p className="text-base font-bold text-white">₹{grandTotal.toLocaleString()}</p>
        </div>
      </div>

      {regularLabourers.length > 0 && (
        <div>
          <p className="text-[10px] font-bold text-white/40 uppercase tracking-wide mb-2">Labourer Breakdown</p>
          {regularLabourers.map(l => {
            const days    = attendance[l.id] || 0
            const earned  = days * l.ratePerDay
            const paid    = monthLogs.filter(log => log.labourName === l.name).reduce((s, log) => s + (log.totalCost || 0), 0)
            const balance = earned - paid
            return (
              <div key={l.id} className="bg-[#161a23] rounded-2xl border border-white/8 p-4 mb-2">
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-8 h-8 rounded-full bg-[#1D9E75]/15 flex items-center justify-center text-sm font-bold text-[#1D9E75]">
                    {l.name.charAt(0)}
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-white">{l.name}</p>
                    <p className="text-[10px] text-white/40">{l.workType} · ₹{l.ratePerDay}/day</p>
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div className="bg-white/5 rounded-xl py-2">
                    <p className="text-[10px] text-white/40">Days</p>
                    <p className="text-sm font-bold text-white">{days}</p>
                  </div>
                  <div className="bg-[#1D9E75]/10 rounded-xl py-2">
                    <p className="text-[10px] text-white/40">Earned</p>
                    <p className="text-sm font-bold text-[#1D9E75]">₹{earned.toLocaleString()}</p>
                  </div>
                  <div className={`rounded-xl py-2 ${balance > 0 ? 'bg-[#E24B4A]/10' : 'bg-white/5'}`}>
                    <p className="text-[10px] text-white/40">Balance</p>
                    <p className={`text-sm font-bold ${balance > 0 ? 'text-[#E24B4A]' : 'text-white/40'}`}>
                      ₹{balance.toLocaleString()}
                    </p>
                  </div>
                </div>
                {days === 0 && <p className="text-[10px] text-white/25 text-center mt-2 italic">No attendance this month</p>}
              </div>
            )
          })}
        </div>
      )}

      {contractualLogs.length > 0 && (
        <div>
          <p className="text-[10px] font-bold text-white/40 uppercase tracking-wide mb-2">Contractual Logs ({contractualLogs.length})</p>
          {contractualLogs.map(l => (
            <div key={l.id} className="bg-[#161a23] rounded-xl border border-white/8 p-3 mb-1.5 flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold text-white">{l.labourName}</p>
                <p className="text-[10px] text-white/40">{l.plotLabel || 'Farm-wide'} · {l.date}</p>
                {l.purpose && <p className="text-[10px] text-white/30 italic">{l.purpose}</p>}
              </div>
              <p className="text-sm font-bold text-[#BA7517]">₹{(l.totalCost || 0).toLocaleString()}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function FRow({ label, children }) {
  return <div><label className="text-xs font-medium text-white/50 block mb-1.5">{label}</label>{children}</div>
}

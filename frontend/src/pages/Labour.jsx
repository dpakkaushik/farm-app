import React, { useState, useEffect, useMemo } from 'react'
import { format } from 'date-fns'
import { Plus, X, CheckCircle2, AlertTriangle } from 'lucide-react'
import { useAppStore } from '../store'
import { supabase } from '../lib/supabase'

const TODAY_STR   = new Date().toISOString().slice(0, 10)
const TODAY_LABEL = format(new Date(), 'EEEE, d MMMM yyyy')

const CONTRACT_TYPES = [
  { value: 'area_wise', label: 'Area Wise',  unit: 'Acres',  emoji: '🌾' },
  { value: 'bag_wise',  label: 'Bag Wise',   unit: 'Bags',   emoji: '🧺' },
  { value: 'tank_wise', label: 'Tank Wise',  unit: 'Tanks',  emoji: '🪣' },
  { value: 'per_day',   label: 'Per Day',    unit: 'Days',   emoji: '📅' },
  { value: 'kg_wise',   label: 'KG Wise',    unit: 'KG',     emoji: '⚖️' },
  { value: 'rate_wise', label: 'Rate Wise',  unit: 'Units',  emoji: '💰' },
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
    <div className="h-full flex flex-col bg-[var(--c-bg)]">
      {/* Header */}
      <div className="shrink-0 px-4 pt-4 pb-0 bg-[var(--c-bg)]">
        <h2 className="text-lg font-bold text-[var(--c-text)]">Manpower</h2>
        <p className="text-xs text-[var(--c-muted)] mb-3">Attendance · Work logs · Payments</p>
        <div className="flex gap-1 border-b border-[var(--c-border)]">
          {[['attendance','📋 Attendance'], ['logs','🗒 Logs'], ['summary','📊 Summary']].map(([k, lbl]) => (
            <button key={k} onClick={() => setSubTab(k)}
              className={`flex-1 py-2.5 text-xs font-semibold border-b-2 transition-colors
                ${subTab === k ? 'border-[#1D9E75] text-[#1D9E75]' : 'border-transparent text-[var(--c-muted)]'}`}>
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
        <div className={`fixed bottom-24 left-4 right-4 px-4 py-3 rounded-2xl text-sm font-medium text-[var(--c-text)] shadow-xl z-50 flex items-center gap-2 ${toastType === 'warn' ? 'bg-[#BA7517]' : 'bg-[#1D9E75]'}`}>
          {toastType === 'warn' ? <AlertTriangle size={16}/> : <CheckCircle2 size={16}/>} {toast}
        </div>
      )}
    </div>
  )
}

// ── Worker attendance calendar ────────────────────────────────────────────────
const ATT_STYLE = {
  present:  { bg: '#1D9E7520', border: '#1D9E75', color: '#1D9E75' },
  half_day: { bg: '#BA751720', border: '#BA7517', color: '#BA7517' },
  absent:   { bg: '#E24B4A20', border: '#E24B4A', color: '#E24B4A' },
}

function WorkerCalendar({ salary = {}, selMonth, setSelMonth }) {
  const { attByDate = {}, attPay = 0, contractPay = 0, total = 0 } = salary
  const y = selMonth.getFullYear()
  const m = selMonth.getMonth()
  const daysInMonth = new Date(y, m + 1, 0).getDate()
  const firstOffset = (new Date(y, m, 1).getDay() + 6) % 7
  const monthLabel  = selMonth.toLocaleString('default', { month: 'long', year: 'numeric' })
  const cells = [
    ...Array(firstOffset).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => {
      const d   = i + 1
      const key = `${y}-${String(m+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`
      return { d, status: attByDate[key] }
    }),
  ]
  return (
    <div className="mt-2 border-t border-[var(--c-border)] pt-2.5 space-y-2">
      {/* Month nav */}
      <div className="flex items-center justify-between">
        <button onClick={() => setSelMonth(d => new Date(d.getFullYear(), d.getMonth()-1, 1))}
          className="w-7 h-7 rounded-lg flex items-center justify-center text-[var(--c-muted)] hover:bg-[var(--c-ghost)] text-xs">◀</button>
        <p className="text-[11px] font-bold text-[var(--c-text)]">{monthLabel}</p>
        <button onClick={() => setSelMonth(d => new Date(d.getFullYear(), d.getMonth()+1, 1))}
          className="w-7 h-7 rounded-lg flex items-center justify-center text-[var(--c-muted)] hover:bg-[var(--c-ghost)] text-xs">▶</button>
      </div>
      {/* Day-of-week headers */}
      <div className="grid grid-cols-7">
        {['M','T','W','T','F','S','S'].map((d,i) => (
          <p key={i} className="text-center text-[9px] font-bold text-[var(--c-faint)]">{d}</p>
        ))}
      </div>
      {/* Day grid */}
      <div className="grid grid-cols-7 gap-y-1">
        {cells.map((cell, i) => {
          if (!cell) return <div key={i} />
          const s = ATT_STYLE[cell.status]
          return (
            <div key={i} className="flex justify-center">
              <div className="w-7 h-7 rounded-full flex items-center justify-center text-[9px] font-bold border"
                style={s
                  ? { background: s.bg, borderColor: s.border, color: s.color }
                  : { background: 'transparent', borderColor: 'transparent', color: 'var(--c-faint)' }}>
                {cell.d}
              </div>
            </div>
          )
        })}
      </div>
      {/* Legend */}
      <div className="flex gap-3 justify-center">
        {[['#1D9E75','Present'],['#BA7517','Half Day'],['#E24B4A','Absent']].map(([c,l]) => (
          <div key={l} className="flex items-center gap-1">
            <div className="w-2 h-2 rounded-full" style={{ background: c }}/>
            <p className="text-[8px] text-[var(--c-faint)]">{l}</p>
          </div>
        ))}
      </div>
      {/* Salary breakdown */}
      <div className="flex items-center justify-between bg-[var(--c-card)] rounded-xl px-3 py-2.5">
        <div className="text-center">
          <p className="text-[9px] text-[var(--c-muted)] mb-0.5">Attendance</p>
          <p className="text-xs font-bold text-[var(--c-text)]">₹{attPay.toLocaleString('en-IN')}</p>
        </div>
        <div className="text-center">
          <p className="text-[9px] text-[var(--c-muted)] mb-0.5">Contractual</p>
          <p className="text-xs font-bold text-[var(--c-text)]">₹{contractPay.toLocaleString('en-IN')}</p>
        </div>
        <div className="text-center">
          <p className="text-[9px] text-[var(--c-muted)] mb-0.5">Total</p>
          <p className="text-sm font-bold text-[#1D9E75]">₹{total.toLocaleString('en-IN')}</p>
        </div>
      </div>
    </div>
  )
}

// ── Today: attendance + task log ──────────────────────────────────────────────
const EMPTY_WFORM = { workTypeId: '', workerType: 'contractual', selectedWorkers: new Set(), workerCount: '', contractType: '', contractQty: '', rate: '', cycleId: '', date: TODAY_STR }

function LabourToday({ permanentStaff, regularLabourers, labourLogs, cropCycles, cropMaster, logLabour, showToast }) {
  const { activityTypes } = useAppStore()
  const [attTab,        setAttTab]       = useState(() => permanentStaff.length > 0 ? 'staff' : 'labour')
  const [attendance,    setAttendance]   = useState({})
  const [loadingAtt,    setLoadingAtt]   = useState(true)
  const [savingAtt,     setSavingAtt]    = useState({})
  const [showLogModal,  setShowLogModal] = useState(null)
  const [wForm,         setWForm]        = useState(EMPTY_WFORM)
  const [saving,        setSaving]       = useState(false)
  const [selMonth,      setSelMonth]     = useState(() => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1) })
  const [monthAtt,      setMonthAtt]     = useState([])
  const [monthLogs,     setMonthLogs]    = useState([])
  const [expandedWorker,setExpandedWorker] = useState(null)

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

  useEffect(() => {
    const y = selMonth.getFullYear(), m = selMonth.getMonth()
    const start = `${y}-${String(m+1).padStart(2,'0')}-01`
    const end   = `${y}-${String(m+1).padStart(2,'0')}-${String(new Date(y,m+1,0).getDate()).padStart(2,'0')}`
    Promise.all([
      supabase.from('attendance').select('*').gte('attendance_date', start).lte('attendance_date', end),
      supabase.from('labour_logs').select('*').gte('activity_date', start).lte('activity_date', end),
    ]).then(([{ data: a }, { data: l }]) => {
      setMonthAtt(a || [])
      setMonthLogs(l || [])
    })
  }, [selMonth])

  const workerSalary = useMemo(() => {
    const all = [...permanentStaff, ...regularLabourers]
    return Object.fromEntries(all.map(w => {
      const attRecs     = monthAtt.filter(a => a.labour_master_id === w.id)
      const attPay      = w.ratePerDay
        ? attRecs.reduce((s, a) => s + (a.status === 'present' ? w.ratePerDay : a.status === 'half_day' ? w.ratePerDay / 2 : 0), 0)
        : (w.monthlySalary || 0)
      const contractPay = monthLogs.filter(l => l.labour_master_id === w.id)
        .reduce((s, l) => s + (Number(l.total_payment) || 0), 0)
      const attByDate   = Object.fromEntries(attRecs.map(a => [a.attendance_date, a.status]))
      return [w.id, { attPay, contractPay, total: attPay + contractPay, attByDate }]
    }))
  }, [monthAtt, monthLogs, permanentStaff, regularLabourers])

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

  const submitWork = async () => {
    if (!wForm.workTypeId)   return showToast('Select a work type', 'warn')
    if (!wForm.contractType) return showToast('Select contract type', 'warn')
    const cycle    = cropCycles.find(c => c.id === wForm.cycleId)
    const workType = activityTypes.find(a => a.id === wForm.workTypeId)
    setSaving(true)
    try {
      if (wForm.workerType === 'regular') {
        if (!wForm.selectedWorkers.size) return showToast('Select a worker', 'warn')
        const qty    = parseFloat(wForm.contractQty)
        const rate   = parseFloat(wForm.rate)
        if (!qty || !rate) return showToast('Fill quantity and rate', 'warn')
        const [wid]  = wForm.selectedWorkers
        const person = [...permanentStaff, ...regularLabourers].find(p => p.id === wid)
        if (!person) return showToast('Select a worker', 'warn')
        await logLabour({
          labourType:     'regular',
          labourMasterId: person.id,
          labourName:     person.name,
          plotId:         cycle?.plotId || null,
          cropCycleId:    wForm.cycleId || null,
          date:           wForm.date,
          workers:        1,
          ratePerDay:     rate,
          totalCost:      qty * rate,
          purpose:        workType?.label || 'Work',
          workTypeId:     wForm.workTypeId,
          contractType:   wForm.contractType,
          contractQty:    qty,
        })
        showToast('Work logged ✓')
      } else {
        const workers = parseFloat(wForm.workerCount) || 0
        const qty     = parseFloat(wForm.contractQty)
        const rate    = parseFloat(wForm.rate)
        if (!qty || !rate) return showToast('Fill quantity and rate', 'warn')
        await logLabour({
          labourType:   'contractual',
          labourName:   workType?.label || 'Contractual',
          plotId:       cycle?.plotId || null,
          cropCycleId:  wForm.cycleId || null,
          date:         wForm.date,
          workers,
          ratePerDay:   rate,
          totalCost:    qty * rate,
          purpose:      workType?.label || 'Contractual work',
          workTypeId:   wForm.workTypeId,
          contractType: wForm.contractType,
          contractQty:  qty,
        })
        showToast('Work logged ✓')
      }
      setWForm(EMPTY_WFORM)
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
      <p className="text-xs text-[var(--c-muted)]">{TODAY_LABEL}</p>

      {/* Summary */}
      <div className="grid grid-cols-2 gap-2">
        <div className="bg-[#1D9E75]/10 border border-[#1D9E75]/20 rounded-xl px-3 py-2.5">
          <p className="text-[10px] text-[var(--c-muted)]">Regular wages today</p>
          <p className="text-xl font-bold text-[#1D9E75]">₹{todayWages.toLocaleString()}</p>
          <p className="text-[10px] text-[var(--c-muted)]">{presentCount} present · {halfCount} half · {absentCount} absent</p>
        </div>
        <div className="bg-[#BA7517]/10 border border-[#BA7517]/20 rounded-xl px-3 py-2.5">
          <p className="text-[10px] text-[var(--c-muted)]">Contractual today</p>
          <p className="text-xl font-bold text-[#BA7517]">₹{todayContractual.toLocaleString()}</p>
          <p className="text-[10px] text-[var(--c-muted)]">{todayLogs.length} log{todayLogs.length !== 1 ? 's' : ''}</p>
        </div>
      </div>

      {/* Staff / Labour toggle + attendance */}
      <div>
        {/* Toggle buttons */}
        <div className="flex gap-2 mb-3">
          <button onClick={() => setAttTab('staff')}
            className="flex-1 py-2.5 rounded-xl text-xs font-bold border transition-all"
            style={{
              background:  attTab === 'staff' ? '#4169E122' : 'var(--c-card)',
              borderColor: attTab === 'staff' ? '#4169E1'   : 'var(--c-border-md)',
              color:       attTab === 'staff' ? '#4169E1'   : 'var(--c-muted)',
            }}>
            🏢 Staff {permanentStaff.length > 0 ? `(${permanentStaff.length})` : ''}
          </button>
          <button onClick={() => setAttTab('labour')}
            className="flex-1 py-2.5 rounded-xl text-xs font-bold border transition-all"
            style={{
              background:  attTab === 'labour' ? '#1D9E7522' : 'var(--c-card)',
              borderColor: attTab === 'labour' ? '#1D9E75'   : 'var(--c-border-md)',
              color:       attTab === 'labour' ? '#1D9E75'   : 'var(--c-muted)',
            }}>
            👷 Labour {regularLabourers.length > 0 ? `(${regularLabourers.length})` : ''}
          </button>
        </div>

        <p className="text-[10px] font-bold text-[var(--c-muted)] uppercase tracking-wide mb-2">
          {attTab === 'staff' ? 'Permanent Staff' : 'Regular Labourers'} — Mark Attendance
          {loadingAtt && <span className="ml-2 text-[var(--c-faint)]">loading…</span>}
        </p>

        {/* People list */}
        {(() => {
          const people = attTab === 'staff' ? permanentStaff : regularLabourers
          const accentColor = attTab === 'staff' ? '#4169E1' : '#1D9E75'

          if (people.length === 0) return (
            <div className="bg-[var(--c-nav)] rounded-xl border border-[var(--c-border)] px-4 py-6 text-center">
              <p className="text-sm text-[var(--c-faint)]">
                No {attTab === 'staff' ? 'permanent staff' : 'regular labourers'} added yet.
              </p>
              <p className="text-xs text-[var(--c-faint)] mt-1">Go to Admin → Labour to add them.</p>
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
              <div key={l.id} className="bg-[var(--c-nav)] rounded-2xl border border-[var(--c-border)] p-3 mb-2">
                <div className="flex items-center gap-3 mb-2.5">
                  {l.photoUrl
                    ? <img src={l.photoUrl} alt={l.name} className="w-10 h-10 rounded-full object-cover shrink-0 border border-[var(--c-border-md)]" />
                    : <div className="w-10 h-10 rounded-full flex items-center justify-center shrink-0 border border-[var(--c-border-md)]"
                        style={{ background: accentColor + '15' }}>
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={accentColor} strokeWidth="1.5" strokeLinecap="round" opacity="0.6">
                          <circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/>
                        </svg>
                      </div>
                  }
                  <div className="flex-1 min-w-0">
                    <div className="flex items-baseline gap-2">
                      <p className="text-sm font-semibold text-[var(--c-text)]">{l.name}</p>
                      <p className="text-sm font-bold text-[#1D9E75]">₹{(workerSalary[l.id]?.total || 0).toLocaleString('en-IN')}</p>
                    </div>
                    <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                      <p className="text-[10px] text-[var(--c-muted)]">{attTab === 'staff' ? `${l.designation || 'Staff'} · ₹${l.monthlySalary || 0}/mo` : `${l.workType} · ₹${l.ratePerDay}/day`}</p>
                      {l.phone && (
                        <a href={`tel:${l.phone}`} onClick={e => e.stopPropagation()}
                          className="inline-flex items-center gap-0.5 text-[10px] font-semibold px-1.5 py-0.5 rounded-lg border transition-colors hover:bg-[var(--c-ghost)]"
                          style={{ color: accentColor, borderColor: accentColor + '40' }}>
                          📞 {l.phone}
                        </a>
                      )}
                    </div>
                  </div>
                  <button onClick={() => setExpandedWorker(expandedWorker === l.id ? null : l.id)}
                    className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0 border transition-all hover:bg-[var(--c-ghost)]"
                    style={{ borderColor: 'var(--c-border-md)', color: 'var(--c-muted)' }}>
                    <span style={{ display: 'inline-block', transition: 'transform 0.2s', transform: expandedWorker === l.id ? 'rotate(180deg)' : 'rotate(0deg)', fontSize: 10 }}>▼</span>
                  </button>
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
                        background:  status === s ? color + '22' : 'var(--c-card)',
                        borderColor: status === s ? color + '55' : 'var(--c-border-md)',
                        color:       status === s ? color        : 'var(--c-muted)',
                      }}>
                      {busy ? '…' : label}
                    </button>
                  ))}
                </div>

                {attTab === 'labour' && (status === 'present' || status === 'half_day') && (
                  <button onClick={() => setShowLogModal(l.id)}
                    className="mt-2 w-full py-1.5 text-[10px] font-semibold rounded-xl border border-[var(--c-border-md)] text-[var(--c-muted)] hover:border-[#1D9E75]/40 hover:text-[#1D9E75] transition-colors">
                    📋 Assign / Log Task
                  </button>
                )}
                {expandedWorker === l.id && (
                  <WorkerCalendar salary={workerSalary[l.id]} selMonth={selMonth} setSelMonth={setSelMonth} />
                )}
              </div>
            )
          })
        })()}
      </div>

      {/* Log Work */}
      <div>
        <p className="text-[10px] font-bold text-[var(--c-muted)] uppercase tracking-wide mb-2">Log Work</p>
        <div className="bg-[var(--c-nav)] rounded-2xl border border-[var(--c-border)] p-3 space-y-3">

          {/* Work type */}
          <FRow label="Work Type">
            <select className="finput" value={wForm.workTypeId} onChange={e => setWForm(p => ({ ...p, workTypeId: e.target.value }))} style={{ background: 'var(--c-surface)' }}>
              <option value="" style={{ background: 'var(--c-surface)' }}>Select work type…</option>
              {activityTypes.map(a => <option key={a.id} value={a.id} style={{ background: 'var(--c-surface)' }}>{a.emoji} {a.label}</option>)}
            </select>
          </FRow>

          {/* Worker Type toggle */}
          <div>
            <p className="text-[10px] text-[var(--c-muted)] mb-1.5">Worker Type</p>
            <div className="flex gap-2">
              {[['contractual','🏗️ Contractual'],['regular','👤 Regular']].map(([v,lbl]) => (
                <button key={v} onClick={() => setWForm(p => ({ ...p, workerType: v, selectedWorkers: new Set(), contractType: '', contractQty: '', rate: '' }))}
                  className="flex-1 py-2 text-xs font-bold rounded-xl border transition-all"
                  style={{
                    background:  wForm.workerType === v ? '#1D9E7522' : 'var(--c-card)',
                    borderColor: wForm.workerType === v ? '#1D9E75'   : 'var(--c-border-md)',
                    color:       wForm.workerType === v ? '#1D9E75'   : 'var(--c-muted)',
                  }}>
                  {lbl}
                </button>
              ))}
            </div>
          </div>

          {/* Contract Type — always second, for both worker types */}
          <FRow label="Contract Type">
            <div className="grid grid-cols-3 gap-1.5">
              {(wForm.workerType === 'regular' ? CONTRACT_TYPES.filter(ct => ct.value !== 'per_day') : CONTRACT_TYPES).map(ct => (
                <button key={ct.value} onClick={() => setWForm(p => ({ ...p, contractType: ct.value, selectedWorkers: new Set(), contractQty: '', rate: '' }))}
                  className="py-2 text-[10px] font-bold rounded-xl border text-center transition-all"
                  style={{
                    background:  wForm.contractType === ct.value ? '#1D9E7520' : 'var(--c-card)',
                    borderColor: wForm.contractType === ct.value ? '#1D9E75'   : 'var(--c-border-md)',
                    color:       wForm.contractType === ct.value ? '#1D9E75'   : 'var(--c-sub)',
                  }}>
                  {ct.emoji}<br/>{ct.label}
                </button>
              ))}
            </div>
          </FRow>

          {/* Contractual: worker count (after contract type) */}
          {wForm.workerType === 'contractual' && wForm.contractType && (
            <FRow label="No. of Workers">
              <input type="number" className="finput" placeholder="0" min="1"
                value={wForm.workerCount} onChange={e => setWForm(p => ({ ...p, workerCount: e.target.value }))} />
            </FRow>
          )}

          {/* Regular: worker chips — only shown after contract type is picked */}
          {wForm.workerType === 'regular' && !wForm.contractType && (
            <p className="text-xs text-[var(--c-faint)] text-center py-1">Select a contract type above to pick workers.</p>
          )}
          {wForm.workerType === 'regular' && wForm.contractType && (() => {
            const presentWorkers = [
              ...permanentStaff.map(s  => ({ ...s, tag: '🏢', rate: s.ratePerDay || 0 })),
              ...regularLabourers.map(l => ({ ...l, tag: '👷', rate: l.ratePerDay || 0 })),
            ].filter(w => {
              const att = attendance[w.id]
              return att?.status === 'present' || att?.status === 'half_day'
            })
            if (presentWorkers.length === 0) return (
              <p key="none" className="text-xs text-[var(--c-faint)] text-center py-2">No workers marked present today. Mark attendance above first.</p>
            )
            const singleSelect = wForm.contractType !== 'per_day'
            return (
              <div key="chips">
                <p className="text-[10px] text-[var(--c-muted)] mb-1.5">
                  {singleSelect ? 'Select Worker (one at a time)' : 'Select Workers (present today · multi-select)'}
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {presentWorkers.map(w => {
                    const sel = wForm.selectedWorkers.has(w.id)
                    return (
                      <button key={w.id}
                        onClick={() => setWForm(p => {
                          if (singleSelect) {
                            return { ...p, selectedWorkers: new Set([w.id]), contractQty: '', rate: '' }
                          }
                          const s = new Set(p.selectedWorkers)
                          sel ? s.delete(w.id) : s.add(w.id)
                          return { ...p, selectedWorkers: s }
                        })}
                        className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-xs font-semibold border transition-all"
                        style={{
                          background:  sel ? '#1D9E7520' : 'var(--c-card)',
                          borderColor: sel ? '#1D9E75'   : 'var(--c-border-md)',
                          color:       sel ? '#1D9E75'   : 'var(--c-sub)',
                        }}>
                        {w.tag} {w.name}
                        <span className="text-[9px] opacity-60 ml-0.5">₹{w.rate}/day</span>
                      </button>
                    )
                  })}
                </div>
              </div>
            )
          })()}


          {/* Qty + Rate — for contractual (all types) or regular (non-per_day) */}
          {wForm.contractType && (wForm.workerType === 'contractual' || wForm.contractType !== 'per_day') && (() => {
            const ct = CONTRACT_TYPES.find(c => c.value === wForm.contractType)
            return (
              <>
                <div className="grid grid-cols-2 gap-2">
                  <FRow label={`Qty (${ct.unit})`}>
                    <input type="number" className="finput" placeholder="e.g. 4" min="0"
                      value={wForm.contractQty} onChange={e => setWForm(p => ({ ...p, contractQty: e.target.value }))} />
                  </FRow>
                  <FRow label={`Rate / ${ct.unit} (₹)`}>
                    <input type="number" className="finput" placeholder="e.g. 500" min="0"
                      value={wForm.rate} onChange={e => setWForm(p => ({ ...p, rate: e.target.value }))} />
                  </FRow>
                </div>
                {wForm.contractQty && wForm.rate && (
                  <div className="bg-[#1D9E75]/10 border border-[#1D9E75]/25 rounded-xl px-3 py-2 flex items-center justify-between">
                    <p className="text-[10px] text-[var(--c-muted)]">{wForm.contractQty} × ₹{wForm.rate}</p>
                    <p className="text-sm font-bold text-[#1D9E75]">₹{(parseFloat(wForm.contractQty) * parseFloat(wForm.rate)).toLocaleString('en-IN')}</p>
                  </div>
                )}
              </>
            )
          })()}

          {/* Common: plot + date */}
          <div className="grid grid-cols-2 gap-2">
            <FRow label="Plot / Cycle">
              <select className="finput" value={wForm.cycleId} onChange={e => setWForm(p => ({ ...p, cycleId: e.target.value }))} style={{ background: 'var(--c-surface)' }}>
                <option value="" style={{ background: 'var(--c-surface)' }}>Farm-wide</option>
                {cropCycles.filter(c => c.status === 'active').map(c => {
                  const crop = cropMaster.find(cr => cr.id === c.cropId)
                  return <option key={c.id} value={c.id} style={{ background: 'var(--c-surface)' }}>{c.plotLabel} — {crop?.name || ''}</option>
                })}
              </select>
            </FRow>
            <FRow label="Date">
              <input type="date" className="finput" value={wForm.date} onChange={e => setWForm(p => ({ ...p, date: e.target.value }))} style={{ colorScheme: 'dark' }} />
            </FRow>
          </div>

          <button onClick={submitWork} disabled={saving}
            className="w-full py-2.5 bg-[#1D9E75] text-white text-xs font-bold rounded-xl disabled:opacity-40">
            {saving ? 'Logging…' : '+ Log Work'}
          </button>
        </div>
      </div>

      {/* Today's logs */}
      {todayLogs.length > 0 && (
        <div>
          <p className="text-[10px] font-bold text-[var(--c-muted)] uppercase tracking-wide mb-2">Today's Work Logged</p>
          {todayLogs.map(l => {
            const ct = l.contractType ? CONTRACT_TYPES.find(c => c.value === l.contractType) : null
            const sub = [
              l.plotLabel !== '—' ? l.plotLabel : 'Farm-wide',
              l.workers > 1 ? `${l.workers} workers` : null,
              ct && l.contractQty ? `${l.contractQty} ${ct.unit} @ ₹${l.ratePerDay}/${ct.unit}` : null,
            ].filter(Boolean).join(' · ')
            return (
              <div key={l.id} className="bg-[var(--c-nav)] rounded-xl border border-[var(--c-border)] p-3 mb-1.5 flex items-center justify-between">
                <div className="flex-1 min-w-0 pr-3">
                  <p className="text-xs font-semibold text-[var(--c-text)]">{l.labourName}</p>
                  <p className="text-[10px] text-[var(--c-muted)]">{sub}</p>
                </div>
                <p className="text-sm font-bold text-[#1D9E75] shrink-0">₹{(l.totalCost || 0).toLocaleString('en-IN')}</p>
              </div>
            )
          })}
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
      <div className="w-full bg-[var(--c-nav)] rounded-t-3xl p-5 border-t border-[var(--c-border-md)] space-y-3" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-bold text-[var(--c-text)]">Log Task</h3>
            <p className="text-xs text-[var(--c-muted)]">{labourer?.name} · ₹{labourer?.ratePerDay}/day</p>
          </div>
          <button onClick={onClose} className="text-[var(--c-muted)] hover:text-[var(--c-text)]"><X size={18}/></button>
        </div>
        <FRow label="Plot / Cycle">
          <select className="finput" value={form.cycleId} onChange={e => setForm(p => ({ ...p, cycleId: e.target.value }))} style={{ background: 'var(--c-surface)' }}>
            <option value="" style={{ background: 'var(--c-surface)' }}>Farm-wide / General</option>
            {cropCycles.filter(c => c.status === 'active').map(c => {
              const crop = cropMaster.find(cr => cr.id === c.cropId)
              return <option key={c.id} value={c.id} style={{ background: 'var(--c-surface)' }}>{c.plotLabel} — {crop?.name || ''}</option>
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
          className="w-full py-3 bg-[#1D9E75] text-[var(--c-text)] text-sm font-bold rounded-xl disabled:opacity-40">
          {saving ? 'Saving…' : 'Log Task'}
        </button>
        <style>{`.finput{width:100%;background:var(--c-input);border:1px solid var(--c-border-md);border-radius:12px;padding:10px 14px;color:var(--c-text);font-size:14px;outline:none;}.finput:focus{border-color:#1D9E75;}`}</style>
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
        <p className="text-xs text-[var(--c-sub)]">Total Labour Cost (all time)</p>
        <p className="text-2xl font-bold text-[#BA7517]">₹{total.toLocaleString()}</p>
      </div>
      {labourLogs.map(l => (
        <div key={l.id} className="bg-[var(--c-nav)] rounded-2xl border border-[var(--c-border)] p-4">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-sm font-semibold text-[var(--c-text)]">{l.labourName}</p>
              <p className="text-xs text-[var(--c-muted)] mt-0.5">{l.plotLabel || 'Farm-wide'}</p>
              <p className="text-[10px] text-[var(--c-faint)] mt-0.5">{l.date}</p>
              {l.purpose && <p className="text-xs text-[var(--c-sub)] mt-1 italic">{l.purpose}</p>}
            </div>
            <div className="text-right">
              <p className="text-base font-bold text-[var(--c-text)]">₹{(l.totalCost || 0).toLocaleString()}</p>
              {l.workers > 1 && <p className="text-[10px] text-[var(--c-muted)]">{l.workers} workers</p>}
              {l.ratePerDay > 0 && <p className="text-[10px] text-[var(--c-faint)]">₹{l.ratePerDay}/day</p>}
            </div>
          </div>
        </div>
      ))}
      {labourLogs.length === 0 && <p className="text-center text-[var(--c-faint)] text-sm py-8">No labour logs yet.</p>}
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
        <p className="text-sm font-bold text-[var(--c-text)] flex-1">Monthly Summary</p>
        <input type="month" value={month} onChange={e => setMonth(e.target.value)}
          className="bg-[var(--c-ghost)] border border-[var(--c-border-md)] rounded-xl px-3 py-2 text-sm text-[var(--c-text)] outline-none"
          style={{ colorScheme: 'dark' }} />
      </div>

      <div className="grid grid-cols-3 gap-2">
        <div className="bg-[#1D9E75]/10 border border-[#1D9E75]/20 rounded-xl p-3 text-center">
          <p className="text-[10px] text-[var(--c-muted)] mb-1">Regular</p>
          <p className="text-base font-bold text-[#1D9E75]">₹{regularEarned.toLocaleString()}</p>
        </div>
        <div className="bg-[#BA7517]/10 border border-[#BA7517]/20 rounded-xl p-3 text-center">
          <p className="text-[10px] text-[var(--c-muted)] mb-1">Contractual</p>
          <p className="text-base font-bold text-[#BA7517]">₹{contractualCost.toLocaleString()}</p>
        </div>
        <div className="bg-[var(--c-card)] border border-[var(--c-border-md)] rounded-xl p-3 text-center">
          <p className="text-[10px] text-[var(--c-muted)] mb-1">Total</p>
          <p className="text-base font-bold text-[var(--c-text)]">₹{grandTotal.toLocaleString()}</p>
        </div>
      </div>

      {regularLabourers.length > 0 && (
        <div>
          <p className="text-[10px] font-bold text-[var(--c-muted)] uppercase tracking-wide mb-2">Labourer Breakdown</p>
          {regularLabourers.map(l => {
            const days    = attendance[l.id] || 0
            const earned  = days * l.ratePerDay
            const paid    = monthLogs.filter(log => log.labourName === l.name).reduce((s, log) => s + (log.totalCost || 0), 0)
            const balance = earned - paid
            return (
              <div key={l.id} className="bg-[var(--c-nav)] rounded-2xl border border-[var(--c-border)] p-4 mb-2">
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-8 h-8 rounded-full bg-[#1D9E75]/15 flex items-center justify-center text-sm font-bold text-[#1D9E75]">
                    {l.name.charAt(0)}
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-[var(--c-text)]">{l.name}</p>
                    <p className="text-[10px] text-[var(--c-muted)]">{l.workType} · ₹{l.ratePerDay}/day</p>
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div className="bg-[var(--c-card)] rounded-xl py-2">
                    <p className="text-[10px] text-[var(--c-muted)]">Days</p>
                    <p className="text-sm font-bold text-[var(--c-text)]">{days}</p>
                  </div>
                  <div className="bg-[#1D9E75]/10 rounded-xl py-2">
                    <p className="text-[10px] text-[var(--c-muted)]">Earned</p>
                    <p className="text-sm font-bold text-[#1D9E75]">₹{earned.toLocaleString()}</p>
                  </div>
                  <div className={`rounded-xl py-2 ${balance > 0 ? 'bg-[#E24B4A]/10' : 'bg-[var(--c-card)]'}`}>
                    <p className="text-[10px] text-[var(--c-muted)]">Balance</p>
                    <p className={`text-sm font-bold ${balance > 0 ? 'text-[#E24B4A]' : 'text-[var(--c-muted)]'}`}>
                      ₹{balance.toLocaleString()}
                    </p>
                  </div>
                </div>
                {days === 0 && <p className="text-[10px] text-[var(--c-faint)] text-center mt-2 italic">No attendance this month</p>}
              </div>
            )
          })}
        </div>
      )}

      {contractualLogs.length > 0 && (
        <div>
          <p className="text-[10px] font-bold text-[var(--c-muted)] uppercase tracking-wide mb-2">Contractual Logs ({contractualLogs.length})</p>
          {contractualLogs.map(l => (
            <div key={l.id} className="bg-[var(--c-nav)] rounded-xl border border-[var(--c-border)] p-3 mb-1.5 flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold text-[var(--c-text)]">{l.labourName}</p>
                <p className="text-[10px] text-[var(--c-muted)]">{l.plotLabel || 'Farm-wide'} · {l.date}</p>
                {l.purpose && <p className="text-[10px] text-[var(--c-faint)] italic">{l.purpose}</p>}
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
  return <div><label className="text-xs font-medium text-[var(--c-sub)] block mb-1.5">{label}</label>{children}</div>
}

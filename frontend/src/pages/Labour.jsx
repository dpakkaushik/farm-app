import React, { useState, useEffect, useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import { format } from 'date-fns'
import { Plus, X, CheckCircle2, AlertTriangle } from 'lucide-react'
import { useAppStore } from '../store'
import { useAuthStore } from '../store/auth'
import { supabase } from '../lib/supabase'
import FilePicker from '../components/FilePicker'
import Attachment from '../components/Attachment'
import { calcStaffEarned, daysInMonth, monthLabel, logsInMonth, monthlyLabourSummary } from '../lib/labourMonth'
import { contractUnit } from '../lib/labourGroups'
import useBackClose from '../hooks/useBackClose'
import {
  owedToFarm, owedToWorker, splitAdvances, hiddenWithBalance, totalOwedToFarm,
  khataEvents, buildWorkerKhata, recoveryOutcome,
} from '../lib/workerRecovery'

const TODAY_STR   = new Date().toISOString().slice(0, 10)
const TODAY_LABEL = format(new Date(), 'EEEE, d MMMM yyyy')

// Units come from the lib so this screen and the Ledger's grouped labour line
// can never name the same contract differently.
const CONTRACT_TYPES = [
  { value: 'area_wise', label: 'Area Wise',  emoji: '🌾' },
  { value: 'bag_wise',  label: 'Bag Wise',   emoji: '🧺' },
  { value: 'tank_wise', label: 'Tank Wise',  emoji: '🪣' },
  { value: 'per_day',   label: 'Per Day',    emoji: '📅' },
  { value: 'kg_wise',   label: 'KG Wise',    emoji: '⚖️' },
  { value: 'rate_wise', label: 'Rate Wise',  emoji: '💰' },
].map(c => ({ ...c, unit: contractUnit(c.value) }))

// The three things the salary modal can record. Recovery is the odd one out —
// the only one where cash comes IN — so it gets its own accent and its own words
// rather than borrowing the advance's amber.
const MODAL_KIND = {
  salary:   { accent: '#8A9A5B', cta: 'Record Payment',  notes: 'Payment notes',        who: 'Given By',    whoHint: 'Name of person giving payment' },
  advance:  { accent: '#BA7517', cta: 'Record Advance',  notes: 'Reason for advance',   who: 'Given By',    whoHint: 'Name of person giving payment' },
  recovery: { accent: '#6366f1', cta: 'Record Recovery', notes: 'Why he is paying back', who: 'Received By', whoHint: 'Who collected the money' },
}

export default function Labour() {
  const [subTab, setSubTab] = useState('attendance')
  const { permanentStaff: allStaff, regularLabourers: allLabourers, labourLogs, cropCycles, cropMaster, advances, salaryPayments, addSalaryPayment, deleteSalaryPayment, addAdvance, recordWorkerRecovery, plots, logLabourBatch } = useAppStore()
  const permanentStaff    = allStaff.filter(s => s.isActive !== false)
  const regularLabourers  = allLabourers.filter(l => l.isActive !== false)
  const [toast, setToast] = useState(null)
  const [toastType, setToastType] = useState('success')

  // Shared month attendance — loaded here so it survives tab switches
  const [logMonth,    setLogMonth]    = useState(new Date().toISOString().slice(0, 7))
  const [logMonthAtt, setLogMonthAtt] = useState({})
  // Bumped when a day is marked. The summary strip now shares a screen with the
  // attendance buttons, so a stale count is visible the moment it goes stale.
  const [attVersion,  setAttVersion]  = useState(0)

  useEffect(() => {
    const from = logMonth + '-01'
    const to   = `${logMonth}-${String(daysInMonth(logMonth)).padStart(2, '0')}`
    supabase.from('attendance').select('*')
      .gte('attendance_date', from)
      .lte('attendance_date', to)
      .then(({ data }) => {
        const counts = {}
        ;(data || []).forEach(r => {
          const add = r.status === 'present' ? 1 : r.status === 'half_day' ? 0.5 : 0
          if (add) counts[r.labour_master_id] = (counts[r.labour_master_id] || 0) + add
        })
        setLogMonthAtt(counts)
      })
  }, [logMonth, attVersion])

  // Marking only ever touches today, so a month not containing today cannot have
  // changed — don't spend a query re-reading it.
  const onAttendanceMarked = () => {
    if (TODAY_STR.startsWith(logMonth)) setAttVersion(v => v + 1)
  }

  const showToast = (msg, type = 'success') => {
    setToast(msg); setToastType(type); setTimeout(() => setToast(null), 3000)
  }

  // Deep link: /labour?go=log-work lands on the Attendance tab with the Log
  // Work form scrolled into view — the door the Fields plot panel's Log Work
  // button walks through. The param is cleared so Back and refresh don't
  // re-scroll. The short delay lets the tab's content render first.
  const [params, setParams] = useSearchParams()
  useEffect(() => {
    if (params.get('go') === 'log-work') {
      setSubTab('attendance')
      setParams({}, { replace: true })
      setTimeout(() => {
        document.getElementById('log-work-form')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      }, 300)
    }
  }, [params, setParams])

  return (
    <div className="h-full flex flex-col bg-[var(--c-bg)]">
      {/* Header */}
      <div className="shrink-0 px-4 pt-4 pb-0 bg-[var(--c-bg)]">
        <h2 className="text-lg font-bold text-[var(--c-text)]">Manpower</h2>
        <p className="text-xs text-[var(--c-muted)] mb-3">Attendance · Work logs · Payments</p>
        <div className="flex gap-1 border-b border-[var(--c-border)]">
          {[['attendance','📋 Attendance'], ['salary','💰 Salary']].map(([k, lbl]) => (
            <button key={k} onClick={() => setSubTab(k)}
              className={`flex-1 py-2.5 text-xs font-semibold border-b-2 transition-colors
                ${subTab === k ? 'border-[#8A9A5B] text-[#8A9A5B]' : 'border-transparent text-[var(--c-muted)]'}`}>
              {lbl}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {subTab === 'attendance' && <LabourToday permanentStaff={permanentStaff} regularLabourers={regularLabourers} labourLogs={labourLogs} cropCycles={cropCycles} cropMaster={cropMaster} showToast={showToast} plots={plots} logLabourBatch={logLabourBatch} summaryMonth={logMonth} setSummaryMonth={setLogMonth} summaryAtt={logMonthAtt} onAttendanceMarked={onAttendanceMarked} />}
        {subTab === 'salary'  && <LabourSalary permanentStaff={permanentStaff} regularLabourers={regularLabourers} labourLogs={labourLogs} advances={advances} salaryPayments={salaryPayments} addSalaryPayment={addSalaryPayment} deleteSalaryPayment={deleteSalaryPayment} addAdvance={addAdvance} recordWorkerRecovery={recordWorkerRecovery} showToast={showToast} month={logMonth} setMonth={setLogMonth} att={logMonthAtt} />}
      </div>

      {toast && (
        <div className={`fixed bottom-24 left-4 right-4 px-4 py-3 rounded-2xl text-sm font-medium text-[var(--c-text)] shadow-xl z-50 flex items-center gap-2 ${toastType === 'warn' ? 'bg-[#BA7517]' : 'bg-[#8A9A5B]'}`}>
          {toastType === 'warn' ? <AlertTriangle size={16}/> : <CheckCircle2 size={16}/>} {toast}
        </div>
      )}
    </div>
  )
}

// ── Worker attendance calendar ────────────────────────────────────────────────
const ATT_STYLE = {
  present:  { bg: '#8A9A5B20', border: '#8A9A5B', color: '#8A9A5B' },
  half_day: { bg: '#BA751720', border: '#BA7517', color: '#BA7517' },
  absent:   { bg: '#E24B4A20', border: '#E24B4A', color: '#E24B4A' },
}

function WorkerCalendar({ workerId, ratePerDay, monthlySalary, monthlyHoliday, monthAtt, monthLogs, selMonth, setSelMonth }) {
  const y = selMonth.getFullYear()
  const m = selMonth.getMonth()
  // `selMonth` is a Date, not a 'YYYY-MM' string, so these are counted here rather
  // than through the labourMonth helpers — named apart from them on purpose.
  const dayCount     = new Date(y, m + 1, 0).getDate()
  const firstOffset  = (new Date(y, m, 1).getDay() + 6) % 7
  const monthTitle   = selMonth.toLocaleString('default', { month: 'long', year: 'numeric' })
  const attRecs      = monthAtt.filter(a => a.labour_master_id === workerId)
  const daysPresent  = attRecs.filter(a => a.status === 'present').length
  const daysHalf     = attRecs.filter(a => a.status === 'half_day').length
  const attPay       = monthlySalary
    ? calcStaffEarned(daysPresent + daysHalf / 2, dayCount, monthlySalary, monthlyHoliday)
    : Math.round((daysPresent + daysHalf / 2) * (ratePerDay || 0))
  const contractPay  = Math.round(monthLogs.filter(l => l.labour_master_id === workerId).reduce((s, l) => s + (Number(l.total_payment) || 0), 0))
  const attByDate    = Object.fromEntries(attRecs.map(a => [a.attendance_date, a.status]))
  const cells = [
    ...Array(firstOffset).fill(null),
    ...Array.from({ length: dayCount }, (_, i) => {
      const d   = i + 1
      const key = `${y}-${String(m+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`
      return { d, status: attByDate[key] }
    }),
  ]
  return (
    <div className="mt-2 border-t border-[var(--c-border)] pt-2.5 space-y-2" onClick={e => e.stopPropagation()}>
      {/* Days present summary */}
      <div className="flex gap-3 justify-center">
        <div className="flex items-center gap-1.5 bg-[#8A9A5B]/10 rounded-lg px-2.5 py-1">
          <div className="w-2 h-2 rounded-full bg-[#8A9A5B]"/>
          <p className="text-[10px] font-bold text-[#8A9A5B]">{daysPresent} Present</p>
        </div>
        {daysHalf > 0 && (
          <div className="flex items-center gap-1.5 bg-[#BA7517]/10 rounded-lg px-2.5 py-1">
            <div className="w-2 h-2 rounded-full bg-[#BA7517]"/>
            <p className="text-[10px] font-bold text-[#BA7517]">{daysHalf} Half Day</p>
          </div>
        )}
      </div>
      {/* Month nav */}
      <div className="flex items-center justify-between">
        <button onClick={e => { e.stopPropagation(); setSelMonth(d => new Date(d.getFullYear(), d.getMonth()-1, 1)) }}
          className="w-7 h-7 rounded-lg flex items-center justify-center text-[var(--c-muted)] hover:bg-[var(--c-ghost)] text-xs">◀</button>
        <p className="text-[11px] font-bold text-[var(--c-text)]">{monthTitle}</p>
        <button onClick={e => { e.stopPropagation(); setSelMonth(d => new Date(d.getFullYear(), d.getMonth()+1, 1)) }}
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
                style={s ? { background: s.bg, borderColor: s.border, color: s.color }
                         : { background: 'transparent', borderColor: 'transparent', color: 'var(--c-faint)' }}>
                {cell.d}
              </div>
            </div>
          )
        })}
      </div>
      {/* Legend */}
      <div className="flex gap-3 justify-center">
        {[['#8A9A5B','Present'],['#BA7517','Half Day'],['#E24B4A','Absent']].map(([c,l]) => (
          <div key={l} className="flex items-center gap-1">
            <div className="w-2 h-2 rounded-full" style={{ background: c }}/>
            <p className="text-[8px] text-[var(--c-faint)]">{l}</p>
          </div>
        ))}
      </div>
      {/* Salary breakdown for this month */}
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
          <p className="text-sm font-bold text-[#8A9A5B]">₹{(attPay + contractPay).toLocaleString('en-IN')}</p>
        </div>
      </div>
    </div>
  )
}

// ── Today: attendance + task log ──────────────────────────────────────────────
// `summaryMonth` is the month the folded-in Logs strip reports on, shared with the
// Salary tab. Deliberately distinct from this screen's own `selMonth`, which only
// drives a worker's expanded attendance calendar.
function LabourToday({ permanentStaff, regularLabourers, labourLogs, cropCycles, cropMaster, showToast, plots, logLabourBatch, summaryMonth, setSummaryMonth, summaryAtt, onAttendanceMarked }) {
  const { activityTypes } = useAppStore()
  const { activeFarmId } = useAuthStore()
  const [attTab,        setAttTab]       = useState(() => permanentStaff.length > 0 ? 'staff' : 'labour')
  const [attendance,    setAttendance]   = useState({})
  const [loadingAtt,    setLoadingAtt]   = useState(true)
  const [savingAtt,     setSavingAtt]    = useState({})
  const [selMonth,      setSelMonth]     = useState(() => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1) })
  const [monthAtt,      setMonthAtt]     = useState([])
  const [monthLogs,     setMonthLogs]    = useState([])
  const [curMonthAtt,   setCurMonthAtt]  = useState([])
  const [curMonthLogs,  setCurMonthLogs] = useState([])
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

  // Load calendar-month data when user navigates the calendar
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

  // Load CURRENT month once — used for salary header (never changes with calendar nav)
  useEffect(() => {
    const now = new Date()
    const y = now.getFullYear(), m = now.getMonth()
    const start = `${y}-${String(m+1).padStart(2,'0')}-01`
    const end   = `${y}-${String(m+1).padStart(2,'0')}-${String(new Date(y,m+1,0).getDate()).padStart(2,'0')}`
    Promise.all([
      supabase.from('attendance').select('*').gte('attendance_date', start).lte('attendance_date', end),
      supabase.from('labour_logs').select('*').gte('activity_date', start).lte('activity_date', end),
    ]).then(([{ data: a }, { data: l }]) => {
      setCurMonthAtt(a || [])
      setCurMonthLogs(l || [])
    })
  }, [])

  // Close calendar on outside click
  useEffect(() => {
    if (!expandedWorker) return
    const close = () => setExpandedWorker(null)
    document.addEventListener('click', close)
    return () => document.removeEventListener('click', close)
  }, [expandedWorker])

  const workerSalary = useMemo(() => {
    const now = new Date()
    const dayCount = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate()
    const all = [...permanentStaff, ...regularLabourers]
    return Object.fromEntries(all.map(w => {
      const attRecs = curMonthAtt.filter(a => a.labour_master_id === w.id)
      const daysPresent = attRecs.filter(a => a.status === 'present').length
      const daysHalf    = attRecs.filter(a => a.status === 'half_day').length
      const attPay  = w.monthlySalary
        ? calcStaffEarned(daysPresent + daysHalf / 2, dayCount, w.monthlySalary, w.monthlyHoliday)
        : Math.round((daysPresent + daysHalf / 2) * (w.ratePerDay || 0))
      const contractPay = curMonthLogs.filter(l => l.labour_master_id === w.id)
        .reduce((s, l) => s + (Number(l.total_payment) || 0), 0)
      return [w.id, { attPay: Math.round(attPay), contractPay: Math.round(contractPay), total: Math.round(attPay + contractPay) }]
    }))
  }, [curMonthAtt, curMonthLogs, permanentStaff, regularLabourers])

  const markAttendance = async (labourId, status) => {
    if (attendance[labourId]?.status === status) return
    setSavingAtt(s => ({ ...s, [labourId]: true }))
    const { data, error } = await supabase.from('attendance').upsert(
      { farm_id: activeFarmId, labour_master_id: labourId, attendance_date: TODAY_STR, status },
      { onConflict: 'labour_master_id,attendance_date' }
    ).select().single()
    if (error) showToast('Could not save attendance: ' + error.message, 'warn')
    if (!error) {
      const rec = { id: data?.id, labour_master_id: labourId, attendance_date: TODAY_STR, status }
      setAttendance(prev => ({ ...prev, [labourId]: { status, id: data?.id } }))
      setMonthAtt(prev => {
        const other = prev.filter(a => !(a.labour_master_id === labourId && a.attendance_date === TODAY_STR))
        return [...other, rec]
      })
      setCurMonthAtt(prev => {
        const other = prev.filter(a => !(a.labour_master_id === labourId && a.attendance_date === TODAY_STR))
        return [...other, rec]
      })
      onAttendanceMarked?.()
    }
    setSavingAtt(s => ({ ...s, [labourId]: false }))
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

  const monthSummary = useMemo(() => monthlyLabourSummary({
    permanentStaff, regularLabourers, labourLogs, month: summaryMonth, attDays: summaryAtt,
  }), [permanentStaff, regularLabourers, labourLogs, summaryMonth, summaryAtt])

  const summaryLogs = useMemo(
    () => logsInMonth(labourLogs, summaryMonth), [labourLogs, summaryMonth])

  return (
    <div className="p-4 space-y-4 pb-24">
      <p className="text-xs text-[var(--c-muted)]">{TODAY_LABEL}</p>

      {/* Summary */}
      <div className="grid grid-cols-2 gap-2">
        <div className="bg-[#8A9A5B]/10 border border-[#8A9A5B]/20 rounded-xl px-3 py-2.5">
          <p className="text-[10px] text-[var(--c-muted)]">Regular wages today</p>
          <p className="text-xl font-bold text-[#8A9A5B]">₹{todayWages.toLocaleString()}</p>
          <p className="text-[10px] text-[var(--c-muted)]">{presentCount} present · {halfCount} half · {absentCount} absent</p>
        </div>
        <div className="bg-[#BA7517]/10 border border-[#BA7517]/20 rounded-xl px-3 py-2.5">
          <p className="text-[10px] text-[var(--c-muted)]">Contractual today</p>
          <p className="text-xl font-bold text-[#BA7517]">₹{todayContractual.toLocaleString()}</p>
          <p className="text-[10px] text-[var(--c-muted)]">{todayLogs.length} log{todayLogs.length !== 1 ? 's' : ''}</p>
        </div>
      </div>

      <MonthSummaryStrip month={summaryMonth} setMonth={setSummaryMonth} summary={monthSummary} />

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
              background:  attTab === 'labour' ? '#8A9A5B22' : 'var(--c-card)',
              borderColor: attTab === 'labour' ? '#8A9A5B'   : 'var(--c-border-md)',
              color:       attTab === 'labour' ? '#8A9A5B'   : 'var(--c-muted)',
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
          const accentColor = attTab === 'staff' ? '#4169E1' : '#8A9A5B'

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
                      <p className="text-sm font-bold text-[#8A9A5B]">₹{(workerSalary[l.id]?.total || 0).toLocaleString('en-IN')}</p>
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
                  <button onClick={e => { e.stopPropagation(); setExpandedWorker(expandedWorker === l.id ? null : l.id) }}
                    className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0 border transition-all hover:bg-[var(--c-ghost)]"
                    style={{ borderColor: 'var(--c-border-md)', color: 'var(--c-muted)' }}>
                    <span style={{ display: 'inline-block', transition: 'transform 0.2s', transform: expandedWorker === l.id ? 'rotate(180deg)' : 'rotate(0deg)', fontSize: 10 }}>▼</span>
                  </button>
                  {status && (
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0
                      ${status === 'present'  ? 'bg-[#8A9A5B]/20 text-[#8A9A5B]'
                      : status === 'half_day' ? 'bg-[#BA7517]/20 text-[#BA7517]'
                      :                         'bg-[#E24B4A]/20 text-[#E24B4A]'}`}>
                      {status === 'present' ? '✓ Present' : status === 'half_day' ? '½ Half' : '✗ Absent'}
                    </span>
                  )}
                </div>

                <div className="flex gap-1.5">
                  {[
                    ['present',  '✓ Present',  '#8A9A5B'],
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

                {expandedWorker === l.id && (
                  <WorkerCalendar
                    workerId={l.id}
                    ratePerDay={l.ratePerDay}
                    monthlySalary={l.monthlySalary}
                    monthlyHoliday={l.monthlyHoliday}
                    monthAtt={monthAtt}
                    monthLogs={monthLogs}
                    selMonth={selMonth}
                    setSelMonth={setSelMonth}
                  />
                )}
              </div>
            )
          })
        })()}
      </div>

      <LogWorkForm
        plots={plots}
        cropCycles={cropCycles}
        cropMaster={cropMaster}
        regularLabourers={regularLabourers}
        logLabourBatch={logLabourBatch}
        showToast={showToast}
      />

      {/* The month's work logs. Replaces the old "Today's Work Logged" strip that
          stood here: today falls inside the month, so keeping both printed the
          same rows twice on one screen. Today's entries head the list instead,
          pilled, so logging still confirms itself on the spot. */}
      <MonthWorkLogs logs={summaryLogs} month={summaryMonth} />

    </div>
  )
}

// ── Monthly summary — what used to be the whole Logs tab ─────────────────────
// Three figures and a month picker did not earn a tab of their own, so the strip
// now sits on Attendance, directly above the Staff/Labour toggle: the month's
// running cost reads first, then the day gets marked. The month it reports on is
// shared with the Salary tab — changing it here changes it there.
function MonthSummaryStrip({ month, setMonth, summary }) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-[10px] font-bold text-[var(--c-muted)] uppercase tracking-wide">Monthly Summary</p>
        <input type="month" value={month} onChange={e => setMonth(e.target.value)}
          className="bg-[var(--c-ghost)] border border-[var(--c-border-md)] rounded-xl px-3 py-1.5 text-xs text-[var(--c-text)] outline-none"
          style={{ colorScheme: 'dark' }} />
      </div>
      <div className="grid grid-cols-3 gap-2">
        <div className="bg-[#8A9A5B]/10 border border-[#8A9A5B]/20 rounded-xl p-3 text-center">
          <p className="text-[9px] text-[var(--c-muted)] mb-1">Staff Salary</p>
          <p className="text-sm font-bold text-[#8A9A5B]">₹{summary.staffSalary.toLocaleString('en-IN')}</p>
        </div>
        <div className="bg-[#8A9A5B]/6 border border-[#8A9A5B]/15 rounded-xl p-3 text-center">
          <p className="text-[9px] text-[var(--c-muted)] mb-1">Regular Labour</p>
          <p className="text-sm font-bold text-[#8A9A5B]">₹{summary.regularTotal.toLocaleString('en-IN')}</p>
        </div>
        <div className="bg-[#BA7517]/10 border border-[#BA7517]/20 rounded-xl p-3 text-center">
          <p className="text-[9px] text-[var(--c-muted)] mb-1">Contractual</p>
          <p className="text-sm font-bold text-[#BA7517]">₹{summary.contractualTotal.toLocaleString('en-IN')}</p>
        </div>
      </div>
    </div>
  )
}

// ── The month's work logs ────────────────────────────────────────────────────
// Newest first, so a log entered today lands at the top — where the today-only
// strip this replaced used to print it.
function MonthWorkLogs({ logs, month }) {
  const ordered = [...logs].sort((a, b) => (b.date || '').localeCompare(a.date || ''))
  return (
    <div>
      <p className="text-[10px] font-bold text-[var(--c-muted)] uppercase tracking-wide mb-2">
        Work Logged · {monthLabel(month)}
      </p>
      {ordered.length === 0 && (
        <p className="text-center text-[var(--c-faint)] text-sm py-4">No logs for this month.</p>
      )}
      {ordered.map(l => {
        // Logs written by the old Assign/Log Task modal (removed 21 Aug — Log Work
        // below attendance does its job) carry no contract type, so they fall
        // back to the plain day rate — otherwise those rows would show no rate at all.
        const ct   = l.contractType ? CONTRACT_TYPES.find(c => c.value === l.contractType) : null
        // A job spanning plots is one log per plot, but `contract_qty` is not
        // split — every row stores the job's whole 163 tanks. Printed unqualified
        // beside this row's ₹1,157 share it reads as a contradiction, so a row
        // that is only a share says so.
        const isShare = ct && l.contractQty
          && Math.abs(l.contractQty * l.ratePerDay - (l.totalCost || 0)) > 1
        const rate = ct && l.contractQty
          ? `${isShare ? 'share of ' : ''}${l.contractQty} ${ct.unit} @ ₹${l.ratePerDay}/${ct.unit}`
          : l.ratePerDay > 0 ? `₹${l.ratePerDay}/day` : null
        const sub  = [
          l.plotLabel && l.plotLabel !== '—' ? l.plotLabel : 'Farm-wide',
          l.workers > 1 ? `${l.workers} workers` : null,
          rate,
        ].filter(Boolean).join(' · ')
        return (
          <div key={l.id} className="bg-[var(--c-nav)] rounded-xl border border-[var(--c-border)] p-3 mb-1.5 flex items-start justify-between">
            <div className="flex-1 min-w-0 pr-3">
              <div className="flex items-center gap-1.5">
                <p className="text-xs font-semibold text-[var(--c-text)]">{l.labourName}</p>
                {l.date === TODAY_STR && (
                  <span className="text-[8px] font-bold px-1.5 py-0.5 rounded-full bg-[#8A9A5B]/15 text-[#8A9A5B]">TODAY</span>
                )}
              </div>
              <p className="text-[10px] text-[var(--c-muted)]">{sub}</p>
              <p className="text-[10px] text-[var(--c-faint)] mt-0.5">{l.date}</p>
              {l.purpose && <p className="text-[10px] text-[var(--c-sub)] mt-0.5 italic">{l.purpose}</p>}
            </div>
            <p className="text-sm font-bold text-[#8A9A5B] shrink-0">₹{(l.totalCost || 0).toLocaleString('en-IN')}</p>
          </div>
        )
      })}
    </div>
  )
}

// ── Labour Salary tab ─────────────────────────────────────────────────────────
function LabourSalary({ permanentStaff, regularLabourers, labourLogs, advances, salaryPayments, addSalaryPayment, deleteSalaryPayment, addAdvance, recordWorkerRecovery, showToast, month, setMonth, att }) {
  const [modal,   setModal]   = useState(null)
  const [form,    setForm]    = useState({ amount: '', date: new Date().toISOString().slice(0,10), notes: '', givenBy: '', paymentMode: 'cash', attachment: null })
  const [saving,  setSaving]  = useState(false)
  const [ledger,  setLedger]  = useState(null)   // { worker, entries, loading }

  // The phone's back gesture dismisses whichever of these is open, rather than
  // walking off the screen with a half-filled payment form.
  useBackClose(() => setLedger(null), !!ledger)
  useBackClose(() => { if (!saving) setModal(null) }, !!modal)

  // v_salary_dues is the authoritative khata balance, and — unlike this screen's
  // worker lists — it has no status filter, so it is the only place a worker who
  // has left the farm still shows up with what he owes. Loaded here rather than
  // read from the store because the store fills salaryDues on the Ledger page,
  // which the owner may never have opened.
  const [dues,        setDues]        = useState([])
  const [duesVersion, setDuesVersion] = useState(0)
  useEffect(() => {
    supabase.from('v_salary_dues').select('*').then(({ data }) => setDues(data || []))
  }, [duesVersion])

  const balanceOf = (id) => Number(dues.find(d => d.labourer_id === id)?.balance_due ?? NaN)

  // Wages earned belong in the khata too. Without them the statement folded only
  // cash movements and could never close on the same figure as the Ledger; it
  // also folded payments the wrong way, so paying a man made the farm appear to
  // owe him more. Both are fixed in lib/workerRecovery.js, where they are tested.
  const openLedger = async (worker) => {
    setLedger({ worker, entries: [], loading: true })
    const [{ data: allPayments }, { data: allAdvances }, { data: accruals }] = await Promise.all([
      supabase.from('salary_payments').select('*').eq('labourer_id', worker.id).order('payment_date', { ascending: true }),
      supabase.from('salary_advances').select('*').eq('labourer_id', worker.id).order('advance_date', { ascending: true }),
      supabase.from('v_salary_accrual').select('*').eq('labourer_id', worker.id).order('month', { ascending: true }),
    ])
    const events = khataEvents({
      accruals: accruals || [], advances: allAdvances || [], payments: allPayments || [],
      today: TODAY_STR,
    })
    const khata = buildWorkerKhata({ openingBalance: worker.openingBalance || 0, events })
    setLedger({ worker, entries: khata.rows, khata, loading: false })
  }

  const dayCount    = daysInMonth(month)
  const monthPayments = salaryPayments.filter(p => p.month === month)
  const monthAdvances = advances.filter(a => a.date?.startsWith(month))
  const allWorkers  = [
    ...permanentStaff.map(s => ({ ...s, workerType: 'staff' })),
    ...regularLabourers.map(l => ({ ...l, workerType: 'regular' })),
  ]

  // Workers no card on this screen shows — paused ones are filtered out upstream,
  // removed ones are never loaded — whose balance the books still count. Rebuilt
  // from the dues row alone, so they need nothing from the store.
  const formerOwing = hiddenWithBalance(dues).map(d => ({
    id: d.labourer_id,
    name: (d.name || '').trim(),
    openingBalance: Number(d.opening_balance || 0),
    workerType: d.sub_type === 'permanent' ? 'staff' : 'regular',
    status: d.status,
    balance: Number(d.balance_due || 0),
  }))
  const stillToCollect = totalOwedToFarm(dues)

  // outstanding is kept on the modal so the recovery line can say what is left
  // after a part payment. The prefill is a convenience for the common case of
  // settling in full — it is not a cap, and the amount stays editable.
  const openPayModal = (worker, type, prefill = 0) => {
    setModal({ worker, type, outstanding: prefill })
    setForm({
      amount: prefill > 0 ? String(Math.round(prefill)) : '',
      date: new Date().toISOString().slice(0,10),
      notes: '', givenBy: '', paymentMode: 'cash', attachment: null,
    })
  }

  const uploadAttachment = async (file) => {
    const path = `salary-payments/${Date.now()}_${file.name}`
    const { error } = await supabase.storage.from('farm-photos').upload(path, file)
    if (error) throw error
    const { data } = supabase.storage.from('farm-photos').getPublicUrl(path)
    return data.publicUrl
  }

  const submitPayment = async () => {
    if (!form.amount || isNaN(form.amount)) return
    setSaving(true)
    try {
      let attachmentUrl = null
      if (form.attachment) attachmentUrl = await uploadAttachment(form.attachment)
      const common = { labourerId: modal.worker.id, date: form.date, amount: form.amount, notes: form.notes, givenBy: form.givenBy, paymentMode: form.paymentMode, attachmentUrl }
      if (modal.type === 'recovery') {
        await recordWorkerRecovery({ ...common, name: modal.worker.name })
        setDuesVersion(v => v + 1)
        // Confirm the remainder too, so a part recovery never reads as a full one.
        const left = recoveryOutcome(modal.outstanding, form.amount)
        showToast(
          `₹${Number(form.amount).toLocaleString('en-IN')} recovered from ${modal.worker.name}`
          + (left.kind === 'part' ? ` · ₹${Math.round(left.amount).toLocaleString('en-IN')} still owed` : '')
        )
      } else if (modal.type === 'advance') {
        await addAdvance({ ...common, reason: form.notes })
        setDuesVersion(v => v + 1)
        showToast(`Advance recorded for ${modal.worker.name}`)
      } else {
        await addSalaryPayment({ ...common, type: 'salary', month })
        showToast(`Salary payment recorded for ${modal.worker.name}`)
      }
      setModal(null)
    } catch (e) { showToast('Failed: ' + e.message, 'warn') }
    setSaving(false)
  }

  return (
    <div className="p-4 space-y-3 pb-6">
      {/* Month filter */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs font-bold text-[var(--c-muted)] uppercase tracking-wide">Salary &amp; Advances</p>
          {stillToCollect > 0 && (
            <p className="text-[10px] text-[#BA7517] mt-0.5">
              ₹{Math.round(stillToCollect).toLocaleString('en-IN')} to recover from workers
            </p>
          )}
        </div>
        <input type="month" value={month} onChange={e => setMonth(e.target.value)}
          className="bg-[var(--c-ghost)] border border-[var(--c-border-md)] rounded-xl px-3 py-1.5 text-xs text-[var(--c-text)] outline-none"
          style={{ colorScheme: 'dark' }} />
      </div>

      {allWorkers.length === 0 && (
        <p className="text-center text-[var(--c-faint)] text-sm py-8">No staff or labourers added yet.</p>
      )}

      {allWorkers.map(w => {
        const days         = att[w.id] || 0
        const earned       = w.workerType === 'staff' && w.monthlySalary
          ? calcStaffEarned(days, dayCount, w.monthlySalary, w.monthlyHoliday)
          : Math.round(days * (w.ratePerDay || 0))
        const contractPay  = labourLogs.filter(l => l.labourMasterId === w.id && l.date?.startsWith(month)).reduce((s, l) => s + (l.totalCost || 0), 0)
        const advRows      = [...monthAdvances.filter(a => a.labourerId === w.id), ...advances.filter(a => a.labourerId === w.id && !a.date?.startsWith(month) && !a.isRecovered)]
        // given and recovered are shown separately; only the net is arithmetic —
        // it is what v_salary_dues subtracts.
        const { given: advGiven, recovered: advBack, net: advTotal } = splitAdvances(advRows)
        const paidThisMonth= monthPayments.filter(p => p.labourerId === w.id && p.type === 'salary').reduce((s, p) => s + p.amount, 0)
        const opening      = w.openingBalance || 0
        const balance      = opening + earned + contractPay - advTotal - paidThisMonth
        // The Recover button offers what the books say is outstanding, not this
        // card's month-scoped figure. Falls back to the card while dues load.
        const owes         = owedToFarm(Number.isNaN(balanceOf(w.id)) ? balance : balanceOf(w.id))

        return (
          <div key={w.id} className="bg-[var(--c-nav)] rounded-2xl border border-[var(--c-border)] overflow-hidden">
            {/* Header */}
            <div className="px-4 pt-3 pb-2 flex items-center justify-between">
              <div>
                <p className="text-sm font-bold text-[var(--c-text)]">{w.name}</p>
                <p className="text-[10px] text-[var(--c-muted)]">
                  {w.workerType === 'staff' ? `Staff · ₹${w.monthlySalary?.toLocaleString('en-IN')}/mo` : `Regular · ₹${w.ratePerDay}/day`}
                  {days > 0 && ` · ${days} days`}
                </p>
              </div>
              <div className="text-right">
                {/* An amber minus sign is ambiguous — say which way the money runs. */}
                <p className="text-[9px] text-[var(--c-muted)]">
                  {balance > 0 ? 'Farm owes' : balance < 0 ? 'Worker owes' : 'Balance'}
                </p>
                <p className={`text-base font-bold ${balance > 0 ? 'text-[#E24B4A]' : balance < 0 ? 'text-[#BA7517]' : 'text-[var(--c-muted)]'}`}>
                  ₹{Math.abs(balance).toLocaleString('en-IN')}
                </p>
              </div>
            </div>

            {/* Salary breakdown grid */}
            <div className={`grid ${advBack > 0 ? 'grid-cols-5' : 'grid-cols-4'} gap-px bg-[var(--c-border)] border-t border-[var(--c-border)]`}>
              {[
                ['Opening', opening, opening > 0 ? '#E24B4A' : 'var(--c-muted)'],
                ['Earned',  earned + contractPay, '#8A9A5B'],
                ['Advance', advGiven, advGiven > 0 ? '#BA7517' : 'var(--c-muted)'],
                ...(advBack > 0 ? [['Recovered', advBack, '#6366f1']] : []),
                ['Paid',    paidThisMonth, paidThisMonth > 0 ? '#8A9A5B' : 'var(--c-muted)'],
              ].map(([label, val, color]) => (
                <div key={label} className="bg-[var(--c-nav)] py-2.5 text-center">
                  <p className="text-[9px] text-[var(--c-faint)] mb-0.5">{label}</p>
                  <p className="text-xs font-bold" style={{ color }}>₹{val.toLocaleString('en-IN')}</p>
                </div>
              ))}
            </div>

            {/* Payment history for this month */}
            {monthPayments.filter(p => p.labourerId === w.id).length > 0 && (
              <div className="px-3 py-2 border-t border-[var(--c-border)] space-y-1.5">
                {monthPayments.filter(p => p.labourerId === w.id).map(p => (
                  <div key={p.id} className="flex items-start justify-between gap-2">
                    <div className="flex items-start gap-2 min-w-0">
                      <span className="text-[10px] mt-0.5">{p.type === 'salary' ? '💵' : '⬆️'}</span>
                      <div className="min-w-0">
                        <p className="text-[10px] text-[var(--c-muted)]">
                          {p.type === 'salary' ? 'Salary paid' : 'Advance'} · {p.date}
                          {p.paymentMode && p.paymentMode !== 'cash' && (
                            <span className="ml-1 text-[9px] text-[var(--c-faint)]">
                              · {p.paymentMode === 'upi' ? '📱 UPI' : '🏦 Bank'}
                            </span>
                          )}
                        </p>
                        {(p.givenBy || p.notes) && (
                          <p className="text-[9px] text-[var(--c-faint)] italic truncate">
                            {p.givenBy ? `By ${p.givenBy}` : ''}{p.givenBy && p.notes ? ' · ' : ''}{p.notes || ''}
                          </p>
                        )}
                        {p.attachmentUrl && (
                          <Attachment variant="chip" value={p.attachmentUrl} name="View proof" />
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <p className="text-[11px] font-bold text-[#8A9A5B]">₹{p.amount.toLocaleString('en-IN')}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Advance history for this month */}
            {monthAdvances.filter(a => a.labourerId === w.id).length > 0 && (
              <div className="px-3 py-2 border-t border-[var(--c-border)] space-y-1.5">
                {monthAdvances.filter(a => a.labourerId === w.id).map(a => (
                  <div key={a.id} className="flex items-start justify-between gap-2">
                    <div className="flex items-start gap-2 min-w-0">
                      <span className="text-[10px] mt-0.5">{a.amount < 0 ? '⬇️' : '⬆️'}</span>
                      <div className="min-w-0">
                        <p className="text-[10px] text-[var(--c-muted)]">
                          {a.amount < 0 ? 'Recovered' : 'Advance'} · {a.date}
                          {a.paymentMode && a.paymentMode !== 'cash' && (
                            <span className="ml-1 text-[9px] text-[var(--c-faint)]">
                              · {a.paymentMode === 'upi' ? '📱 UPI' : '🏦 Bank'}
                            </span>
                          )}
                        </p>
                        {(a.givenBy || a.reason) && (
                          <p className="text-[9px] text-[var(--c-faint)] italic truncate">
                            {a.givenBy ? `By ${a.givenBy}` : ''}{a.givenBy && a.reason ? ' · ' : ''}{a.reason || ''}
                          </p>
                        )}
                        {a.attachmentUrl && (
                          <Attachment variant="chip" value={a.attachmentUrl} name="View proof" />
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <p className="text-[11px] font-bold" style={{ color: a.amount < 0 ? '#6366f1' : '#BA7517' }}>
                        ₹{Math.abs(a.amount).toLocaleString('en-IN')}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Action buttons */}
            <div className="flex border-t border-[var(--c-border)] divide-x divide-[var(--c-border)]">
              <button onClick={() => openLedger(w)}
                className="flex-1 py-2.5 text-[10px] font-semibold text-[var(--c-muted)] hover:text-[#6366f1] transition-colors">
                📒 History
              </button>
              <button onClick={() => openPayModal(w, 'salary')}
                className="flex-1 py-2.5 text-[10px] font-semibold text-[var(--c-muted)] hover:text-[#8A9A5B] transition-colors">
                💵 Pay Salary
              </button>
              <button onClick={() => openPayModal(w, 'advance')}
                className="flex-1 py-2.5 text-[10px] font-semibold text-[var(--c-muted)] hover:text-[#BA7517] transition-colors">
                ⬆️ Advance
              </button>
              {/* Only where there is something to recover, so the button explains
                  itself instead of needing a label. */}
              {owes > 0 && (
                <button onClick={() => openPayModal(w, 'recovery', owes)}
                  className="flex-1 py-2.5 text-[10px] font-semibold text-[#6366f1] transition-colors">
                  ⬇️ Recover
                </button>
              )}
            </div>
          </div>
        )
      })}

      {/* Workers who have left the farm but still owe it money.
          Removing a worker only sets status='inactive' and paused workers are
          filtered out upstream, so neither appears on any card above — while
          v_salary_dues, which has no status filter, still holds their balance
          and the Ledger's Excel export still lists it. The Ledger's on-screen
          dues strip clamps negatives away, so the debt does not inflate it — it
          simply becomes invisible, which is worse. Two paused men hold ₹15,620.
          This is the only screen that can see them, and the only door to the
          money. */}
      {formerOwing.length > 0 && (
        <div className="pt-3 space-y-2">
          <div>
            <p className="text-xs font-bold text-[var(--c-muted)] uppercase tracking-wide">No longer working</p>
            <p className="text-[10px] text-[var(--c-faint)] mt-0.5">
              Paused or removed, so they have no card above — but the books still count what they owe.
            </p>
          </div>
          {formerOwing.map(w => {
            const owes = owedToFarm(w.balance)
            return (
              <div key={w.id} className="bg-[var(--c-nav)] rounded-2xl border border-[var(--c-border)] overflow-hidden opacity-90">
                <div className="px-4 pt-3 pb-2 flex items-center justify-between">
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-[var(--c-text)] truncate">{w.name}</p>
                    <p className="text-[10px] text-[var(--c-muted)]">
                      {w.workerType === 'staff' ? 'Staff' : 'Regular'} ·{' '}
                      {w.status === 'paused' ? 'Paused' : 'Removed'}
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-[9px] text-[var(--c-muted)]">{owes > 0 ? 'Worker owes' : 'Farm owes'}</p>
                    <p className="text-base font-bold" style={{ color: owes > 0 ? '#BA7517' : '#E24B4A' }}>
                      ₹{Math.abs(w.balance).toLocaleString('en-IN')}
                    </p>
                  </div>
                </div>
                <div className="flex border-t border-[var(--c-border)] divide-x divide-[var(--c-border)]">
                  <button onClick={() => openLedger(w)}
                    className="flex-1 py-2.5 text-[10px] font-semibold text-[var(--c-muted)] hover:text-[#6366f1] transition-colors">
                    📒 History
                  </button>
                  {owes > 0 ? (
                    <button onClick={() => openPayModal(w, 'recovery', owes)}
                      className="flex-1 py-2.5 text-[10px] font-semibold text-[#6366f1] transition-colors">
                      ⬇️ Recover ₹{Math.round(owes).toLocaleString('en-IN')}
                    </button>
                  ) : (
                    <button onClick={() => openPayModal(w, 'salary', owedToWorker(w.balance))}
                      className="flex-1 py-2.5 text-[10px] font-semibold text-[#8A9A5B] transition-colors">
                      💵 Settle ₹{Math.round(owedToWorker(w.balance)).toLocaleString('en-IN')}
                    </button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Ledger overlay */}
      {ledger && (
        <div className="fixed inset-0 z-50 flex flex-col bg-[var(--c-bg)]">
          {/* Header — padded past the phone's status bar (full-screen overlay) */}
          <div className="px-4 py-3 border-b border-[var(--c-border)] bg-[var(--c-nav)]"
            style={{ paddingTop: 'calc(0.75rem + env(safe-area-inset-top, 0px))' }}>
            <div className="flex items-center justify-between mb-2">
              <div>
                <h2 className="text-sm font-bold text-[var(--c-text)]">📒 {ledger.worker.name}</h2>
                {/* A worker who has left carries no rate — the dues row that
                    found him has only a name and a balance. Say what is known. */}
                <p className="text-[10px] text-[var(--c-muted)]">
                  {ledger.worker.workerType === 'staff' && ledger.worker.monthlySalary
                    ? `Staff · ₹${ledger.worker.monthlySalary.toLocaleString('en-IN')}/mo`
                    : ledger.worker.ratePerDay
                      ? `Regular · ₹${ledger.worker.ratePerDay}/day`
                      : `${ledger.worker.workerType === 'staff' ? 'Staff' : 'Regular'} · ${ledger.worker.status === 'paused' ? 'paused' : 'no longer working'}`}
                </p>
              </div>
              <button onClick={() => setLedger(null)} className="text-[var(--c-muted)] hover:text-[var(--c-text)]"><X size={20}/></button>
            </div>
            {!ledger.loading && (
              <div className="grid grid-cols-3 gap-2">
                {[
                  ['Earned + recovered', ledger.khata.totalCredit, '#8A9A5B'],
                  ['Paid + advances',     ledger.khata.totalDebit,  '#BA7517'],
                  [ledger.khata.closing > 0 ? 'Farm owes' : ledger.khata.closing < 0 ? 'Worker owes' : 'Settled',
                   ledger.khata.closing, null],
                ].map(([label, val, color]) => (
                  <div key={label} className="bg-[var(--c-input)] rounded-xl py-2 text-center">
                    <p className="text-[9px] text-[var(--c-faint)] mb-0.5">{label}</p>
                    {/* The label already says which way the money runs, so a
                        minus sign here would only muddle it. */}
                    <p className="text-xs font-bold" style={{ color: color || (val > 0 ? '#E24B4A' : val < 0 ? '#BA7517' : 'var(--c-muted)') }}>
                      ₹{Math.abs(val).toLocaleString('en-IN')}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>

          {ledger.loading ? (
            <div className="flex-1 flex items-center justify-center text-[var(--c-muted)] text-sm">Loading…</div>
          ) : (
            <div className="flex-1 overflow-y-auto">
              {/* Table header */}
              <div className="grid grid-cols-[1fr_2fr_auto_auto_auto] gap-x-3 px-4 py-2 border-b border-[var(--c-border)] sticky top-0 bg-[var(--c-nav)]">
                {['Date', 'Description', 'Debit', 'Credit', 'Balance'].map(h => (
                  <p key={h} className="text-[9px] font-bold text-[var(--c-faint)] uppercase tracking-wide text-right first:text-left">{h}</p>
                ))}
              </div>
              {/* Rows */}
              {ledger.entries.map((e, i) => (
                <div key={i} className={`grid grid-cols-[1fr_2fr_auto_auto_auto] gap-x-3 px-4 py-2.5 border-b border-[var(--c-border)] ${e.type === 'opening' ? 'bg-[var(--c-nav)]' : ''}`}>
                  <p className="text-[10px] text-[var(--c-muted)]">{e.date}</p>
                  <div>
                    <p className="text-[10px] text-[var(--c-text)]">{e.label}</p>
                    {e.givenBy && <p className="text-[9px] text-[var(--c-faint)]">By {e.givenBy}{e.mode && e.mode !== 'cash' ? ` · ${e.mode === 'upi' ? 'UPI' : 'Bank'}` : ''}</p>}
                    {e.recovered === true && <p className="text-[9px] text-[#8A9A5B]">✓ Recovered</p>}
                  </div>
                  <p className="text-[10px] font-semibold text-[#E24B4A] text-right">{e.debit ? `₹${e.debit.toLocaleString('en-IN')}` : '—'}</p>
                  <p className="text-[10px] font-semibold text-[#8A9A5B] text-right">{e.credit ? `₹${e.credit.toLocaleString('en-IN')}` : '—'}</p>
                  <p className={`text-[10px] font-bold text-right ${e.balance > 0 ? 'text-[#E24B4A]' : e.balance < 0 ? 'text-[#BA7517]' : 'text-[var(--c-muted)]'}`}>
                    {e.balance >= 0 ? '₹' : '-₹'}{Math.abs(e.balance).toLocaleString('en-IN')}
                  </p>
                </div>
              ))}
              {ledger.entries.length <= 1 && (
                <p className="text-center text-[var(--c-muted)] text-xs py-10">No transactions yet</p>
              )}
            </div>
          )}
        </div>
      )}

      {/* Payment modal */}
      {modal && (
        <div className="fixed inset-0 z-50 flex items-end" style={{ background: 'rgba(0,0,0,0.75)' }} onClick={() => setModal(null)}>
          <div className="w-full bg-[var(--c-nav)] rounded-t-3xl p-5 border-t border-[var(--c-border-md)] space-y-3" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-[var(--c-text)]">
                  {modal.type === 'salary' ? '💵 Pay Salary' : modal.type === 'recovery' ? '⬇️ Recover Money' : '⬆️ Give Advance'}
                </h3>
                <p className="text-xs text-[var(--c-muted)]">
                  {modal.worker.name}
                  {modal.type === 'recovery' && ' · money coming back INTO the farm'}
                </p>
              </div>
              <button onClick={() => setModal(null)} className="text-[var(--c-muted)] hover:text-[var(--c-text)]"><X size={18}/></button>
            </div>
            <FRow label="Amount (₹)">
              <input type="number" className="finput" placeholder="Enter amount" value={form.amount}
                onChange={e => setForm(p => ({ ...p, amount: e.target.value }))} />
              {modal.type === 'recovery' && (() => {
                // Recovering part of it is the normal case, so say what will
                // still be owed rather than making the owner do the subtraction.
                const left = recoveryOutcome(modal.outstanding, form.amount)
                return (
                  <>
                    <p className="text-[10px] text-[var(--c-faint)] mt-1">
                      He owes ₹{Math.round(modal.outstanding || 0).toLocaleString('en-IN')}.
                      Enter less to recover part of it.
                    </p>
                    <p className="text-[10px] mt-0.5 font-semibold"
                      style={{ color: left.kind === 'settles' ? '#8A9A5B' : left.kind === 'over' ? '#E24B4A' : '#BA7517' }}>
                      {left.kind === 'settles'
                        ? '✓ This clears his khata'
                        : left.kind === 'part'
                          ? `₹${Math.round(left.amount).toLocaleString('en-IN')} stays on his khata`
                          : `More than he owes — the farm will owe him ₹${Math.round(left.amount).toLocaleString('en-IN')}`}
                    </p>
                  </>
                )
              })()}
            </FRow>
            <FRow label="Date">
              <input type="date" className="finput" value={form.date}
                onChange={e => setForm(p => ({ ...p, date: e.target.value }))} style={{ colorScheme: 'dark' }} />
            </FRow>
            <FRow label="Notes (optional)">
              <input className="finput" placeholder={MODAL_KIND[modal.type].notes} value={form.notes}
                onChange={e => setForm(p => ({ ...p, notes: e.target.value }))} />
            </FRow>
            <FRow label={MODAL_KIND[modal.type].who}>
              <input className="finput" placeholder={MODAL_KIND[modal.type].whoHint} value={form.givenBy}
                onChange={e => setForm(p => ({ ...p, givenBy: e.target.value }))} />
            </FRow>
            <FRow label={modal.type === 'recovery' ? 'Came in as' : 'Payment Mode'}>
              <div className="flex gap-2">
                {['cash', 'upi', 'bank_transfer'].map(mode => (
                  <button key={mode} onClick={() => setForm(p => ({ ...p, paymentMode: mode }))}
                    className="flex-1 py-2 rounded-xl text-xs font-semibold border transition-colors"
                    style={{ background: form.paymentMode === mode ? MODAL_KIND[modal.type].accent : 'var(--c-input)', borderColor: form.paymentMode === mode ? 'transparent' : 'var(--c-border-md)', color: form.paymentMode === mode ? '#fff' : 'var(--c-muted)' }}>
                    {mode === 'cash' ? '💵 Cash' : mode === 'upi' ? '📱 UPI' : '🏦 Bank'}
                  </button>
                ))}
              </div>
            </FRow>
            <FRow label="Attachment (optional)">
              <FilePicker accept="image/*,application/pdf" file={form.attachment}
                onFile={f => setForm(p => ({ ...p, attachment: f }))} />
            </FRow>
            <button onClick={submitPayment} disabled={saving || !form.amount}
              className="w-full py-3 text-[var(--c-text)] text-sm font-bold rounded-xl disabled:opacity-40"
              style={{ background: MODAL_KIND[modal.type].accent }}>
              {saving ? 'Saving…' : MODAL_KIND[modal.type].cta}
            </button>
            <style>{`.finput{width:100%;background:var(--c-input);border:1px solid var(--c-border-md);border-radius:12px;padding:10px 14px;color:var(--c-text);font-size:14px;outline:none;}.finput:focus{border-color:#8A9A5B;}`}</style>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Log Work — multi-field × multi-worker bill-style form ─────────────────────
const EMPTY_WORKER = () => ({ id: String(Date.now() + Math.random()), workerId: '', workerCount: '1', qty: '', rate: '' })

function LogWorkForm({ plots, cropCycles, cropMaster, regularLabourers, logLabourBatch, showToast }) {
  const { activityTypes } = useAppStore()
  const [selPlots,     setSelPlots]     = useState(new Set())
  const [workTypeId,   setWorkTypeId]   = useState('')
  const [workerType,   setWorkerType]   = useState('regular')
  const [contractType, setContractType] = useState('')
  const [date,         setDate]         = useState(TODAY_STR)
  const [workers,      setWorkers]      = useState([EMPTY_WORKER()])
  const [saving,       setSaving]       = useState(false)

  const ct             = CONTRACT_TYPES.find(c => c.value === contractType)
  const selectedPlots  = plots.filter(p => selPlots.has(p.id))
  const totalAcres     = selectedPlots.reduce((s, p) => s + (Number(p.area_acres) || 0), 0)
  const totalCost      = workers.reduce((s, w) => s + (parseFloat(w.qty) || 0) * (parseFloat(w.rate) || 0), 0)

  const plotSplit = selectedPlots.map(p => {
    const share = totalAcres > 0
      ? Number(p.area_acres) / totalAcres
      : 1 / Math.max(selectedPlots.length, 1)
    return { ...p, share, amount: totalCost * share }
  })

  const togglePlot    = (id) => setSelPlots(prev => { const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s })
  const addWorker     = () => setWorkers(prev => [...prev, EMPTY_WORKER()])
  const removeWorker  = (id) => setWorkers(prev => prev.filter(w => w.id !== id))
  const updateWorker  = (id, field, val) => setWorkers(prev => prev.map(w => w.id === id ? { ...w, [field]: val } : w))

  const reset = () => {
    setSelPlots(new Set()); setWorkTypeId(''); setWorkerType('regular')
    setContractType(''); setDate(TODAY_STR); setWorkers([EMPTY_WORKER()])
  }

  const submit = async () => {
    if (!workTypeId)   return showToast('Select a work type', 'warn')
    if (!contractType) return showToast('Select contract type', 'warn')
    const validW = workers.filter(w => parseFloat(w.qty) > 0 && parseFloat(w.rate) > 0)
    if (validW.length === 0) return showToast('Add qty and rate for at least one worker', 'warn')
    if (workerType === 'regular' && validW.some(w => !w.workerId)) return showToast('Select a worker for each row', 'warn')

    const workType = activityTypes.find(a => a.id === workTypeId)
    const targets  = selectedPlots.length > 0 ? selectedPlots : [null]
    const logs     = []

    for (const plot of targets) {
      const share = plot
        ? (totalAcres > 0 ? Number(plot.area_acres) / totalAcres : 1 / selectedPlots.length)
        : 1
      const cycle = plot ? cropCycles.find(c => c.plotId === plot.id && c.status === 'active') : null

      for (const w of validW) {
        const qty    = parseFloat(w.qty)
        const rate   = parseFloat(w.rate)
        const cost   = Math.round(qty * rate * share * 100) / 100
        const person = workerType === 'regular' ? regularLabourers.find(l => l.id === w.workerId) : null
        logs.push({
          labourType:     workerType,
          labourMasterId: person?.id || null,
          labourName:     person?.name || 'Contractual',
          plotId:         plot?.id || null,
          cropCycleId:    cycle?.id || null,
          date,
          workers:        workerType === 'contractual' ? (parseFloat(w.workerCount) || 1) : 1,
          rate,
          totalCost:      cost,
          purpose:        workType?.label || 'Work',
          workTypeId,
          contractType,
          contractQty:    qty,
        })
      }
    }

    setSaving(true)
    try {
      await logLabourBatch(logs)
      showToast(`Work logged ✓ (${logs.length} entr${logs.length === 1 ? 'y' : 'ies'})`)
      reset()
    } catch (e) { showToast('Failed: ' + e.message, 'warn') }
    setSaving(false)
  }

  return (
    <div id="log-work-form">
      <p className="text-[10px] font-bold text-[var(--c-muted)] uppercase tracking-wide mb-2">Log Work</p>
      <div className="bg-[var(--c-nav)] rounded-2xl border border-[var(--c-border)] p-3 space-y-3">

        {/* Step 1 — Fields */}
        <div>
          <p className="text-xs font-medium text-[var(--c-sub)] mb-1.5">
            Fields <span className="font-normal text-[var(--c-faint)]">(select one or more · leave blank for farm-wide)</span>
          </p>
          {plots.length === 0
            ? <p className="text-xs text-[var(--c-faint)]">No plots added yet.</p>
            : <div className="flex flex-wrap gap-1.5">
                {plots.map(p => {
                  const sel  = selPlots.has(p.id)
                  const cycle = cropCycles.find(c => c.plotId === p.id && c.status === 'active')
                  const crop  = cycle ? cropMaster.find(cr => cr.id === cycle.cropId) : null
                  return (
                    <button key={p.id} onClick={() => togglePlot(p.id)}
                      className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-xs font-semibold border transition-all"
                      style={{
                        background:  sel ? '#8A9A5B20' : 'var(--c-card)',
                        borderColor: sel ? '#8A9A5B'   : 'var(--c-border-md)',
                        color:       sel ? '#8A9A5B'   : 'var(--c-sub)',
                      }}>
                      {p.name}
                      <span className="text-[9px] opacity-60">{Number(p.area_acres).toFixed(1)}ac</span>
                      {crop && (
                        <span className="text-[8px] px-1 py-0.5 rounded" style={{ background: '#8A9A5B20', color: '#8A9A5B' }}>
                          {crop.name}
                        </span>
                      )}
                    </button>
                  )
                })}
              </div>
          }
        </div>

        {/* Step 2 — Work Type */}
        <FRow label="Work Type">
          <select className="finput" value={workTypeId} onChange={e => setWorkTypeId(e.target.value)} style={{ background: 'var(--c-surface)' }}>
            <option value="" style={{ background: 'var(--c-surface)' }}>Select work type…</option>
            {activityTypes.map(a => <option key={a.id} value={a.id} style={{ background: 'var(--c-surface)' }}>{a.emoji} {a.label}</option>)}
          </select>
        </FRow>

        {/* Step 3 — Worker Type */}
        <div>
          <p className="text-[10px] text-[var(--c-muted)] mb-1.5">Worker Type</p>
          <div className="flex gap-2">
            {[['regular','👤 Regular'],['contractual','🏗️ Contractual']].map(([v,lbl]) => (
              <button key={v}
                onClick={() => { setWorkerType(v); setContractType(''); setWorkers([EMPTY_WORKER()]) }}
                className="flex-1 py-2 text-xs font-bold rounded-xl border transition-all"
                style={{
                  background:  workerType === v ? '#8A9A5B22' : 'var(--c-card)',
                  borderColor: workerType === v ? '#8A9A5B'   : 'var(--c-border-md)',
                  color:       workerType === v ? '#8A9A5B'   : 'var(--c-muted)',
                }}>
                {lbl}
              </button>
            ))}
          </div>
        </div>

        {/* Step 4 — Contract Type */}
        <FRow label="Contract Type">
          <div className="grid grid-cols-3 gap-1.5">
            {CONTRACT_TYPES.map(c => (
              <button key={c.value}
                onClick={() => { setContractType(c.value); setWorkers([EMPTY_WORKER()]) }}
                className="py-2 text-[10px] font-bold rounded-xl border text-center transition-all"
                style={{
                  background:  contractType === c.value ? '#8A9A5B20' : 'var(--c-card)',
                  borderColor: contractType === c.value ? '#8A9A5B'   : 'var(--c-border-md)',
                  color:       contractType === c.value ? '#8A9A5B'   : 'var(--c-sub)',
                }}>
                {c.emoji}<br/>{c.label}
              </button>
            ))}
          </div>
        </FRow>

        {/* Step 5 — Workers list */}
        {contractType && (
          <div className="space-y-2">
            <p className="text-[10px] text-[var(--c-muted)]">
              {workerType === 'regular' ? 'Workers' : 'Contractor Groups'} — {ct?.emoji} {ct?.label} @ ₹/{ct?.unit}
            </p>

            {workers.map((w, idx) => (
              <div key={w.id} className="bg-[var(--c-card)] rounded-xl p-2.5 space-y-2 border border-[var(--c-border)]">
                <div className="flex items-center justify-between">
                  <p className="text-[10px] font-bold text-[var(--c-sub)]">
                    {workerType === 'regular' ? `Worker ${idx + 1}` : `Group ${idx + 1}`}
                  </p>
                  {workers.length > 1 && (
                    <button onClick={() => removeWorker(w.id)} className="text-[#E24B4A] p-0.5">
                      <X size={13}/>
                    </button>
                  )}
                </div>

                {workerType === 'regular' ? (
                  <select className="finput" value={w.workerId}
                    onChange={e => updateWorker(w.id, 'workerId', e.target.value)}
                    style={{ background: 'var(--c-surface)', fontSize: 12, padding: '8px 12px' }}>
                    <option value="" style={{ background: 'var(--c-surface)' }}>Select worker…</option>
                    {regularLabourers.map(l => (
                      <option key={l.id} value={l.id} style={{ background: 'var(--c-surface)' }}>
                        {l.name} · ₹{l.ratePerDay}/day
                      </option>
                    ))}
                  </select>
                ) : (
                  <div>
                    <p className="text-[9px] text-[var(--c-faint)] mb-0.5">No. of Workers</p>
                    <input type="number" className="finput" placeholder="1" min="1"
                      value={w.workerCount} onChange={e => updateWorker(w.id, 'workerCount', e.target.value)}
                      style={{ fontSize: 12, padding: '8px 12px' }} />
                  </div>
                )}

                <div className="grid grid-cols-3 gap-1.5">
                  <div>
                    <p className="text-[9px] text-[var(--c-faint)] mb-0.5">Qty ({ct?.unit})</p>
                    <input type="number" className="finput" placeholder="0" min="0"
                      value={w.qty} onChange={e => updateWorker(w.id, 'qty', e.target.value)}
                      style={{ fontSize: 12, padding: '8px 10px' }} />
                  </div>
                  <div>
                    <p className="text-[9px] text-[var(--c-faint)] mb-0.5">Rate/₹{ct?.unit}</p>
                    <input type="number" className="finput" placeholder="0" min="0"
                      value={w.rate} onChange={e => updateWorker(w.id, 'rate', e.target.value)}
                      style={{ fontSize: 12, padding: '8px 10px' }} />
                  </div>
                  <div>
                    <p className="text-[9px] text-[var(--c-faint)] mb-0.5">Amount</p>
                    <div className="finput flex items-center font-bold"
                      style={{ fontSize: 12, padding: '8px 10px', color: '#8A9A5B' }}>
                      ₹{((parseFloat(w.qty)||0)*(parseFloat(w.rate)||0)).toLocaleString('en-IN')}
                    </div>
                  </div>
                </div>
              </div>
            ))}

            <button onClick={addWorker}
              className="w-full py-2 rounded-xl text-xs font-semibold border border-dashed text-[var(--c-muted)] hover:border-[#8A9A5B]/50 hover:text-[#8A9A5B] transition-colors"
              style={{ borderColor: 'var(--c-border-md)' }}>
              + Add Another Worker
            </button>
          </div>
        )}

        {/* Total + area-split preview */}
        {totalCost > 0 && (
          <div className="bg-[#8A9A5B]/10 border border-[#8A9A5B]/25 rounded-xl p-3 space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-xs font-bold text-[var(--c-text)]">Total Work Cost</p>
              <p className="text-base font-bold text-[#8A9A5B]">₹{Math.round(totalCost).toLocaleString('en-IN')}</p>
            </div>
            {selectedPlots.length > 1 && (
              <div className="border-t border-[#8A9A5B]/20 pt-2 space-y-1.5">
                <p className="text-[9px] font-bold text-[var(--c-muted)] uppercase tracking-wide">Split by area</p>
                {plotSplit.map(p => (
                  <div key={p.id} className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="w-1.5 h-1.5 rounded-full bg-[#8A9A5B]"/>
                      <p className="text-[10px] text-[var(--c-text)]">{p.name}</p>
                      <p className="text-[9px] text-[var(--c-faint)]">{Number(p.area_acres).toFixed(1)}ac · {Math.round(p.share*100)}%</p>
                    </div>
                    <p className="text-[10px] font-bold text-[#8A9A5B]">₹{Math.round(p.amount).toLocaleString('en-IN')}</p>
                  </div>
                ))}
              </div>
            )}
            {selectedPlots.length === 1 && (
              <p className="text-[9px] text-[var(--c-faint)]">Full amount → {selectedPlots[0].name}</p>
            )}
            {selectedPlots.length === 0 && (
              <p className="text-[9px] text-[var(--c-faint)]">No fields selected — logs as farm-wide</p>
            )}
          </div>
        )}

        {/* Date */}
        <FRow label="Date">
          <input type="date" className="finput" value={date} onChange={e => setDate(e.target.value)} style={{ colorScheme: 'dark' }} />
        </FRow>

        <button onClick={submit} disabled={saving}
          className="w-full py-2.5 bg-[#8A9A5B] text-white text-xs font-bold rounded-xl disabled:opacity-40">
          {saving ? 'Logging…' : '+ Submit Work Log'}
        </button>
        <style>{`.finput{width:100%;background:var(--c-input);border:1px solid var(--c-border-md);border-radius:12px;padding:10px 14px;color:var(--c-text);font-size:14px;outline:none;}.finput:focus{border-color:#8A9A5B;}`}</style>
      </div>
    </div>
  )
}

function FRow({ label, children }) {
  return <div><label className="text-xs font-medium text-[var(--c-sub)] block mb-1.5">{label}</label>{children}</div>
}

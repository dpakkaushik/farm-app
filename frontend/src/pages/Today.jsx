import React, { useState, useMemo } from 'react'
import { format } from 'date-fns'
import { Plus, X, ChevronUp, ChevronDown, ChevronRight, ClipboardList, Users, HardHat, Tractor } from 'lucide-react'
import { useAppStore, selectFieldWorkers, selectDrivers, selectTractors } from '../store'
import { useAuthStore, isManager } from '../store/auth'
import { supabase } from '../lib/supabase'
import { buildDayBundle, datesInRange } from './today/dayBundle'
import DayCard from './today/DayCard'
import UpcomingBlock from './today/UpcomingBlock'

const getTodayStr  = () => new Date().toISOString().slice(0, 10)
const getTodayDate = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d }
const TODAY_DATE   = getTodayDate()
const TODAY_STR    = getTodayStr()

const HISTORY_WARN_DAYS = 90

export default function Today() {
  const {
    cropCycles, cropMaster, activities, plots,
    permanentStaff, regularLabourers, machineryMaster,
    activityTypes,
    purchases, issues, harvestSessions, sales, cropResiduals,
    labourLogs, advances, salaryPayments,
    livestockCountLogs, livestockMaster, farmExpenses, livestockRevenue,
    mediaItems, inventoryMaster,
    logActivity, logActivities,
  } = useAppStore()
  const { profile, farms, activeFarmId } = useAuthStore()
  // Compute role directly — Zustand getters don't survive set() shallow-merge
  const activeFarmRole = farms.find(f => f.farm_id === activeFarmId)?.role || null

  const hour     = new Date().getHours()
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening'

  const [showModal,     setShowModal]     = useState(false)
  const [selPlots,      setSelPlots]      = useState(new Set())
  const [actType,       setActType]       = useState('irrigation')
  const [selWorkers,    setSelWorkers]    = useState(new Set())  // labour_master IDs
  const [outsideLabour, setOutsideLabour] = useState(0)          // headcount
  const [selDriver,     setSelDriver]     = useState('')         // ploughing only
  const [selMachinery,  setSelMachinery]  = useState('')         // ploughing only
  const [actNotes,      setActNotes]      = useState('')
  const [doneTasks,     setDoneTasks]     = useState(new Set())
  const [saving,        setSaving]        = useState(false)

  // ── History (collapsed, gated behind an explicit date-range + Fetch) ───────
  const [showHistory,       setShowHistory]       = useState(false)
  const [historyStart,      setHistoryStart]      = useState('')
  const [historyEnd,        setHistoryEnd]        = useState('')
  const [historyLoading,    setHistoryLoading]    = useState(false)
  const [historyResults,    setHistoryResults]    = useState(null)  // [{date, bundle}] | null
  const [historyError,      setHistoryError]      = useState('')
  const [confirmLargeRange, setConfirmLargeRange] = useState(false)

  // Every active regular labourer, whether or not attendance was punched. On a
  // contract day it deliberately isn't — the manager only learns in the evening
  // how much ground was covered. Gating on attendance hid exactly the people who
  // did the work. Permanent staff are out entirely: the cook and the peon have
  // attendance, but no business in a field-activity picker.
  const allNamedWorkers = useMemo(() => selectFieldWorkers({ regularLabourers }), [regularLabourers])

  // Ploughing only.
  const isPloughing = actType === 'ploughing'
  const drivers  = useMemo(() => selectDrivers({ permanentStaff, regularLabourers }), [permanentStaff, regularLabourers])
  const tractors = useMemo(() => selectTractors({ machineryMaster }), [machineryMaster])

  // Active plots (one per plot with an active cycle)
  const activePlots = useMemo(() => {
    const seen = new Set()
    return cropCycles
      .filter(c => c.status === 'active')
      .filter(c => { if (seen.has(c.plotId)) return false; seen.add(c.plotId); return true })
      .map(c => ({
        plotId: c.plotId,
        label:  c.plotLabel,
        crop:   cropMaster.find(m => m.id === c.cropId)?.name || '',
      }))
      .sort((a, b) => a.label.localeCompare(b.label))
  }, [cropCycles, cropMaster])

  // Scheduled tasks derived from crop templates
  const { overdue, todayTasks, tomorrow, upcoming } = useMemo(() => {
    const overdue = [], todayTasks = [], tomorrow = [], upcoming = []
    const doneKeys = new Set(activities.map(a => `${a.plotId}|${a.type}|${a.date}`))

    const isAlreadyLogged = (plotId, type, scheduledDateStr) => {
      for (let offset = -7; offset <= 7; offset++) {
        const d = new Date(scheduledDateStr)
        d.setDate(d.getDate() + offset)
        const key = `${plotId}|${type}|${d.toISOString().slice(0, 10)}`
        if (doneKeys.has(key)) return true
        const alt = type === 'spray' ? 'pesticide' : type === 'pesticide' ? 'spray' : null
        if (alt && doneKeys.has(`${plotId}|${alt}|${d.toISOString().slice(0, 10)}`)) return true
      }
      return false
    }

    cropCycles.filter(c => c.status === 'active').forEach(cycle => {
      const template = cropMaster.find(t => t.id === cycle.cropId)
      if (!template?.activities?.length) return
      const sowDate    = new Date(cycle.sowDate); sowDate.setHours(0, 0, 0, 0)
      const dayInCycle = Math.floor((TODAY_DATE - sowDate) / 86400000)

      template.activities.forEach(act => {
        const daysUntil      = act.day - dayInCycle
        const scheduledDate  = new Date(sowDate.getTime() + act.day * 86400000)
        const scheduledDateStr = scheduledDate.toISOString().slice(0, 10)

        if (isAlreadyLogged(cycle.plotId, act.type, scheduledDateStr)) return
        if (doneTasks.has(`${cycle.id}-d${act.day}`)) return

        const task = {
          id: `${cycle.id}-d${act.day}`, plotId: cycle.plotId, plotLabel: cycle.plotLabel,
          cropName: template.name, label: act.label, type: act.type,
          day: act.day, daysUntil, cycleId: cycle.id,
        }
        if      (daysUntil === 0)                   todayTasks.push(task)
        else if (daysUntil === 1)                   tomorrow.push(task)
        else if (daysUntil < 0 && daysUntil >= -3) overdue.push({ ...task, daysOverdue: -daysUntil })
        else if (daysUntil > 1 && daysUntil <= 7)  upcoming.push(task)
      })
    })
    return { overdue, todayTasks, tomorrow, upcoming: upcoming.sort((a, b) => a.daysUntil - b.daysUntil) }
  }, [cropCycles, cropMaster, activities, doneTasks])

  const loggedToday    = useMemo(() => activities.filter(a => a.date === TODAY_STR), [activities])
  const pendingToday   = todayTasks.filter(t => !doneTasks.has(t.id))
  const completedToday = todayTasks.filter(t =>  doneTasks.has(t.id))
  const pendingOverdue = overdue.filter(t => !doneTasks.has(t.id))

  // Today's labour summary across all logged activities
  const todayRegularCount = useMemo(() => {
    const ids = new Set()
    loggedToday.forEach(a => (a.regularWorkerIds || []).forEach(id => ids.add(id)))
    return ids.size
  }, [loggedToday])

  const todayOutsideTotal = useMemo(() =>
    loggedToday.reduce((sum, a) => sum + (a.outsideLabourCount || 0), 0)
  , [loggedToday])

  // ── Day-bundle data: same shape/logic powers both today's card and History ──
  const workerMap = useMemo(() => {
    const m = {}
    ;[...permanentStaff, ...regularLabourers].forEach(w => { m[w.id] = w.name })
    return m
  }, [permanentStaff, regularLabourers])

  const resolvers = useMemo(() => ({
    cropCycles, cropMaster, livestockMaster, inventoryMaster, workerMap, activityTypes,
  }), [cropCycles, cropMaster, livestockMaster, inventoryMaster, workerMap, activityTypes])

  const todaySlices = useMemo(() => ({
    activities, purchases, issues, harvestSessions, sales, cropResiduals,
    labourLogs, advances, salaryPayments, livestockCountLogs, farmExpenses,
    livestockRevenue, mediaItems,
  }), [activities, purchases, issues, harvestSessions, sales, cropResiduals,
       labourLogs, advances, salaryPayments, livestockCountLogs, farmExpenses,
       livestockRevenue, mediaItems])

  const todayBundle = useMemo(() => buildDayBundle(TODAY_STR, todaySlices, resolvers), [todaySlices, resolvers])

  const rangeDays = (historyStart && historyEnd && historyStart <= historyEnd)
    ? Math.round((new Date(historyEnd) - new Date(historyStart)) / 86400000) + 1
    : 0

  const fetchHistory = async () => {
    setHistoryError('')
    if (!historyStart || !historyEnd || historyStart > historyEnd) {
      setHistoryError('Pick a valid start and end date')
      return
    }
    if (rangeDays > HISTORY_WARN_DAYS && !confirmLargeRange) {
      setConfirmLargeRange(true)
      return
    }
    setHistoryLoading(true)
    setConfirmLargeRange(false)
    // Recovered advances aren't loaded into the live store (it only tracks
    // outstanding ones) — fetch the full range directly so past days aren't
    // missing advances that have since been marked recovered.
    const { data } = await supabase.from('salary_advances').select('*')
      .eq('farm_id', activeFarmId)
      .gte('advance_date', historyStart)
      .lte('advance_date', historyEnd)
    const historyAdvances = (data || []).map(a => ({
      id: a.id, labourerId: a.labourer_id, date: a.advance_date,
      amount: Number(a.amount), reason: a.reason || '',
    }))
    const slices = { ...todaySlices, advances: historyAdvances }
    const dates = datesInRange(slices, historyStart, historyEnd)
    const results = dates
      .map(d => ({ date: d, bundle: buildDayBundle(d, slices, resolvers) }))
      .filter(r => !r.bundle.isEmpty)
    setHistoryResults(results)
    setHistoryLoading(false)
  }

  const markDone = async (task) => {
    setDoneTasks(prev => new Set([...prev, task.id]))
    await logActivity({
      plotId: task.plotId, cropCycleId: task.cycleId,
      type: task.type, date: TODAY_STR, notes: task.label,
      workers: 0, regularWorkerIds: [], outsideLabourCount: 0,
    })
  }

  const handleSubmit = async () => {
    const plotIds = selPlots.size > 0 ? [...selPlots] : (actType === 'events' ? ['__all__'] : [])
    if (plotIds.length === 0) return
    setSaving(true)
    await logActivities(plotIds, {
      type:               actType,
      // The driver is NOT counted here — he is salaried staff, not a daily-wage
      // worker. A ploughing with one driver and no labourers is zero workers.
      workers:            selWorkers.size + outsideLabour,
      regularWorkerIds:   [...selWorkers],
      outsideLabourCount: outsideLabour,
      driverId:           isPloughing ? (selDriver    || null) : null,
      machineryId:        isPloughing ? (selMachinery || null) : null,
      date:               getTodayStr(),
      notes:              actNotes.trim(),
    })
    setSaving(false)
    setShowModal(false)
    setSelPlots(new Set())
    setSelWorkers(new Set())
    setOutsideLabour(0)
    setActType('irrigation')
    setSelDriver('')
    setSelMachinery('')
    setActNotes('')
  }

  // Switching away from ploughing drops the driver and tractor — they mean nothing
  // on an irrigation. logActivities nulls them regardless; this keeps the two in step.
  const changeActType = (next) => {
    setActType(next)
    if (next !== 'ploughing') { setSelDriver(''); setSelMachinery('') }
  }

  const togglePlot   = id => setSelPlots(prev   => { const n = new Set(prev);   n.has(id) ? n.delete(id) : n.add(id); return n })
  const toggleWorker = id => setSelWorkers(prev  => { const n = new Set(prev);   n.has(id) ? n.delete(id) : n.add(id); return n })
  const totalWorkers   = selWorkers.size + outsideLabour

  return (
    <div className="h-full overflow-y-auto bg-[var(--c-bg)] pb-6">

      {/* Header */}
      <div className="px-4 pt-4 pb-2 flex items-start justify-between">
        <div>
          <h1 className="text-xl font-bold text-[var(--c-text)]">
            {greeting}, {profile?.full_name?.split(' ')[0] || 'there'} 👋
          </h1>
          <p className="text-sm text-[var(--c-muted)]">{format(new Date(), 'EEEE, d MMMM yyyy')}</p>
        </div>
        {isManager(activeFarmRole) && (
          <button
            onClick={() => setShowModal(true)}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold"
            style={{ background: '#1D9E75', color: '#fff' }}>
            <Plus size={14} strokeWidth={2.5} /> Log Activity
          </button>
        )}
      </div>

      {/* Summary rows — Farm Activity + Manpower */}
      {(pendingOverdue.length > 0 || pendingToday.length > 0 || loggedToday.length > 0
        || todayRegularCount > 0 || todayOutsideTotal > 0) && (
        <div className="px-4 pb-3 space-y-2">

          {/* Row 1 — Farm Activity */}
          {(pendingOverdue.length > 0 || pendingToday.length > 0 || loggedToday.length > 0 || completedToday.length > 0) && (
            <div>
              <p className="text-[10px] font-bold text-[var(--c-faint)] uppercase tracking-widest mb-1.5">
                Farm Activity
              </p>
              <div className="flex gap-2 overflow-x-auto no-scrollbar">
                {pendingOverdue.length > 0 && <Pill count={pendingOverdue.length} label="Overdue"   color="#E24B4A" />}
                {pendingToday.length > 0   && <Pill count={pendingToday.length}   label="Scheduled" color="#1D9E75" />}
                {loggedToday.length > 0    && <Pill count={loggedToday.length}    label="Logged"    color="#3b82f6" />}
                {completedToday.length > 0 && <Pill count={completedToday.length} label="Done"      color="#6b7280" dim />}
              </div>
            </div>
          )}

          {/* Row 2 — Manpower (only when workers are recorded) */}
          {(todayRegularCount > 0 || todayOutsideTotal > 0) && (
            <div>
              <p className="text-[10px] font-bold text-[var(--c-faint)] uppercase tracking-widest mb-1.5">
                Manpower
              </p>
              <div className="flex gap-2 overflow-x-auto no-scrollbar">
                {todayRegularCount > 0 && (
                  <Pill count={todayRegularCount} label="Named Workers" color="#6366f1"
                    icon={<Users size={11} />} />
                )}
                {todayOutsideTotal > 0 && (
                  <Pill count={todayOutsideTotal} label="Outside Labour" color="#f59e0b"
                    icon={<HardHat size={11} />} />
                )}
              </div>
            </div>
          )}

        </div>
      )}

      <div className="px-4 space-y-4">

        <DayCard date={TODAY_STR} isToday bundle={todayBundle}
          tasksDue={{ overdue: pendingOverdue, today: pendingToday, done: completedToday }}
          onMarkDone={markDone} />

        <UpcomingBlock tomorrow={tomorrow} upcoming={upcoming} />

        {/* History — gated behind an explicit date range + Fetch */}
        <div className="rounded-2xl border overflow-hidden" style={{ borderColor: 'var(--c-border)' }}>
          <button
            onClick={() => setShowHistory(h => !h)}
            className="w-full flex items-center justify-between px-4 py-3.5"
            style={{ background: 'var(--c-card)' }}>
            <div className="flex items-center gap-2">
              <ClipboardList size={15} className="text-[var(--c-muted)]" />
              <span className="text-xs font-bold text-[var(--c-sub)] uppercase tracking-wide">History</span>
            </div>
            <ChevronRight size={14} className="text-[var(--c-faint)] transition-transform"
              style={{ transform: showHistory ? 'rotate(90deg)' : 'rotate(0deg)' }} />
          </button>

          {showHistory && (
            <div className="px-4 py-4 space-y-3" style={{ background: 'var(--c-card)' }}>
              <div className="flex items-center gap-2">
                <input type="date" value={historyStart}
                  onChange={e => { setHistoryStart(e.target.value); setConfirmLargeRange(false); setHistoryResults(null) }}
                  className="flex-1 rounded-xl px-3 py-2 text-xs border outline-none"
                  style={{ background: 'var(--c-bg)', color: 'var(--c-text)', borderColor: 'var(--c-border-md)', colorScheme: 'dark' }} />
                <span className="text-xs text-[var(--c-faint)]">to</span>
                <input type="date" value={historyEnd}
                  onChange={e => { setHistoryEnd(e.target.value); setConfirmLargeRange(false); setHistoryResults(null) }}
                  className="flex-1 rounded-xl px-3 py-2 text-xs border outline-none"
                  style={{ background: 'var(--c-bg)', color: 'var(--c-text)', borderColor: 'var(--c-border-md)', colorScheme: 'dark' }} />
              </div>

              {historyError && <p className="text-xs text-[#E24B4A]">{historyError}</p>}
              {confirmLargeRange && (
                <p className="text-xs text-[#BA7517]">
                  That's a {rangeDays}-day range — it may take a moment to render. Tap Fetch again to continue.
                </p>
              )}

              <button onClick={fetchHistory} disabled={historyLoading}
                className="w-full py-2.5 rounded-xl text-xs font-bold disabled:opacity-50"
                style={{ background: '#1D9E75', color: '#fff' }}>
                {historyLoading ? 'Fetching…' : confirmLargeRange ? 'Fetch Anyway' : 'Fetch'}
              </button>

              {historyResults && (
                <div className="space-y-3 pt-1">
                  {historyResults.length === 0 ? (
                    <p className="text-xs text-[var(--c-faint)] text-center py-4 italic">No activity in this range</p>
                  ) : (
                    historyResults.map(r => <DayCard key={r.date} date={r.date} bundle={r.bundle} />)
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {cropCycles.filter(c => c.status === 'active').length === 0 && (
          <div className="text-center py-16 text-[var(--c-faint)]">
            <p className="text-5xl mb-3">🌱</p>
            <p className="text-sm font-medium">No active crop cycles</p>
            <p className="text-xs mt-1 text-[var(--c-faint)]">Start a crop cycle to see scheduled tasks here</p>
          </div>
        )}
      </div>

      {/* ── Log Activity Modal ── */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-end justify-center"
          style={{ background: 'rgba(0,0,0,0.7)' }}
          onClick={e => e.target === e.currentTarget && setShowModal(false)}>
          <div className="w-full max-w-lg rounded-t-2xl overflow-hidden"
            style={{ background: 'var(--c-nav)', maxHeight: '90vh', overflowY: 'auto' }}>

            <div className="flex items-center justify-between px-5 pt-5 pb-4 border-b border-[var(--c-border-md)]">
              <h2 className="text-base font-bold text-[var(--c-text)]">Log Activity</h2>
              <button onClick={() => setShowModal(false)}
                className="w-7 h-7 flex items-center justify-center rounded-full text-[var(--c-muted)] hover:text-[var(--c-text)] hover:bg-[var(--c-ghost)]">
                <X size={16} />
              </button>
            </div>

            <div className="px-5 py-4 space-y-5">

              {/* Plot selection */}
              <div>
                <label className="text-xs font-semibold text-[var(--c-sub)] uppercase tracking-wide block mb-2">
                  {actType === 'events' ? 'Tag (optional)' : 'Select Plots'}
                  {actType !== 'events' && (
                    <span className="text-[#1D9E75] ml-1">({selPlots.size} selected)</span>
                  )}
                </label>

                {actType === 'events' ? (
                  <div className="flex flex-wrap gap-2">
                    {[
                      { plotId: '__all__', label: 'All Farm', crop: '' },
                      ...plots.map(p => ({ plotId: p.id, label: p.name, crop: '' })),
                    ].map(p => {
                      const sel = selPlots.has(p.plotId)
                      return (
                        <button key={p.plotId} onClick={() => {
                          if (p.plotId === '__all__') {
                            setSelPlots(sel ? new Set() : new Set(['__all__']))
                          } else {
                            setSelPlots(prev => {
                              const next = new Set([...prev].filter(x => x !== '__all__'))
                              sel ? next.delete(p.plotId) : next.add(p.plotId)
                              return next
                            })
                          }
                        }}
                          className="px-3 py-2 rounded-xl border text-xs font-semibold transition-all"
                          style={{
                            background:  sel ? '#ec489920' : 'var(--c-card)',
                            borderColor: sel ? '#ec4899'   : 'var(--c-border-md)',
                            color:       sel ? '#ec4899'   : 'var(--c-sub)',
                          }}>
                          {p.label}
                        </button>
                      )
                    })}
                  </div>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {activePlots.map(p => {
                      const sel = selPlots.has(p.plotId)
                      return (
                        <button key={p.plotId} onClick={() => togglePlot(p.plotId)}
                          className="flex flex-col items-center px-3 py-2 rounded-xl border text-xs font-semibold transition-all"
                          style={{
                            background:  sel ? '#1D9E7520' : 'var(--c-card)',
                            borderColor: sel ? '#1D9E75'   : 'var(--c-border-md)',
                            color:       sel ? '#1D9E75'   : 'var(--c-sub)',
                          }}>
                          <span className="text-sm font-bold">{p.label}</span>
                          <span className="text-[9px] font-normal mt-0.5 opacity-70">{p.crop}</span>
                        </button>
                      )
                    })}
                    {activePlots.length === 0 && (
                      <p className="text-xs text-[var(--c-faint)] italic">No active crop cycles found</p>
                    )}
                  </div>
                )}
              </div>

              {/* Activity type */}
              <div>
                <label className="text-xs font-semibold text-[var(--c-sub)] uppercase tracking-wide block mb-2">
                  Activity Type
                </label>
                <div className="relative">
                  <select value={actType} onChange={e => changeActType(e.target.value)}
                    className="w-full rounded-xl px-4 py-3 text-sm font-medium appearance-none outline-none border"
                    style={{ background: 'var(--c-bg)', color: 'var(--c-text)', borderColor: 'var(--c-border-md)' }}>
                    {activityTypes.map(t => (
                      <option key={t.name} value={t.name} style={{ background: 'var(--c-surface)' }}>
                        {t.emoji}  {t.label}
                      </option>
                    ))}
                  </select>
                  <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-[var(--c-muted)]">▾</div>
                </div>
              </div>

              {/* Driver + Tractor — ploughing only */}
              {isPloughing && (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-semibold text-[var(--c-sub)] uppercase tracking-wide block mb-2">
                      <span className="flex items-center gap-1.5">
                        <Users size={12} style={{ color: '#f59e0b' }} />
                        Driver
                      </span>
                    </label>
                    <div className="relative">
                      <select value={selDriver} onChange={e => setSelDriver(e.target.value)}
                        className="w-full rounded-xl px-4 py-3 text-sm font-medium appearance-none outline-none border"
                        style={{ background: 'var(--c-bg)', color: 'var(--c-text)', borderColor: 'var(--c-border-md)' }}>
                        <option value="" style={{ background: 'var(--c-surface)' }}>— None —</option>
                        {drivers.map(d => (
                          <option key={d.id} value={d.id} style={{ background: 'var(--c-surface)' }}>{d.name}</option>
                        ))}
                      </select>
                      <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-[var(--c-muted)]">▾</div>
                    </div>
                  </div>

                  <div>
                    <label className="text-xs font-semibold text-[var(--c-sub)] uppercase tracking-wide block mb-2">
                      <span className="flex items-center gap-1.5">
                        <Tractor size={12} style={{ color: '#f59e0b' }} />
                        Tractor
                      </span>
                    </label>
                    <div className="relative">
                      <select value={selMachinery} onChange={e => setSelMachinery(e.target.value)}
                        className="w-full rounded-xl px-4 py-3 text-sm font-medium appearance-none outline-none border"
                        style={{ background: 'var(--c-bg)', color: 'var(--c-text)', borderColor: 'var(--c-border-md)' }}>
                        <option value="" style={{ background: 'var(--c-surface)' }}>— None —</option>
                        {tractors.map(t => (
                          <option key={t.id} value={t.id} style={{ background: 'var(--c-surface)' }}>{t.label}</option>
                        ))}
                      </select>
                      <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-[var(--c-muted)]">▾</div>
                    </div>
                  </div>
                </div>
              )}

              {/* Named Workers — multiselect */}
              <div>
                <label className="text-xs font-semibold text-[var(--c-sub)] uppercase tracking-wide block mb-1.5">
                  <span className="flex items-center gap-1.5">
                    <Users size={12} style={{ color: '#6366f1' }} />
                    Named Workers
                    {selWorkers.size > 0 && (
                      <span style={{ color: '#6366f1' }} className="ml-1">
                        ({selWorkers.size} selected)
                      </span>
                    )}
                  </span>
                </label>
                {allNamedWorkers.length === 0 ? (
                  <p className="text-xs text-[var(--c-faint)] italic py-1">
                    No active labourers — go to Manpower → Master
                  </p>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {allNamedWorkers.map(w => {
                      const sel = selWorkers.has(w.id)
                      return (
                        <button key={w.id} onClick={() => toggleWorker(w.id)}
                          className="flex items-center gap-1.5 px-2.5 py-2 rounded-xl border text-xs font-semibold transition-all"
                          style={{
                            background:  sel ? '#6366f120' : 'var(--c-card)',
                            borderColor: sel ? '#6366f1'   : 'var(--c-border-md)',
                            color:       sel ? '#6366f1'   : 'var(--c-sub)',
                          }}>
                          <span className="w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0"
                            style={{
                              background: sel ? '#6366f140' : 'var(--c-ghost)',
                              color: sel ? '#6366f1' : 'var(--c-muted)',
                            }}>
                            {w.name.charAt(0).toUpperCase()}
                          </span>
                          {w.name.split(' ')[0]}
                        </button>
                      )
                    })}
                  </div>
                )}
              </div>

              {/* Outside Labour — headcount stepper */}
              <div>
                <label className="text-xs font-semibold text-[var(--c-sub)] uppercase tracking-wide block mb-1.5">
                  <span className="flex items-center gap-1.5">
                    <HardHat size={12} style={{ color: '#f59e0b' }} />
                    Outside Labour
                    <span className="font-normal normal-case text-[var(--c-faint)]">(headcount)</span>
                  </span>
                </label>
                <div className="flex items-center gap-0 rounded-xl border overflow-hidden w-40"
                  style={{ borderColor: 'var(--c-border-md)' }}>
                  <button onClick={() => setOutsideLabour(n => Math.max(0, n - 1))}
                    className="w-10 h-[46px] flex items-center justify-center text-[var(--c-sub)] hover:text-[var(--c-text)] hover:bg-[var(--c-ghost)] transition-colors">
                    <ChevronDown size={16} />
                  </button>
                  <span className="flex-1 text-center text-sm font-bold text-[var(--c-text)]">{outsideLabour}</span>
                  <button onClick={() => setOutsideLabour(n => n + 1)}
                    className="w-10 h-[46px] flex items-center justify-center text-[var(--c-sub)] hover:text-[var(--c-text)] hover:bg-[var(--c-ghost)] transition-colors">
                    <ChevronUp size={16} />
                  </button>
                </div>
                {totalWorkers > 0 && (
                  <p className="text-[11px] text-[var(--c-muted)] mt-1.5">
                    Total: {selWorkers.size} named + {outsideLabour} outside
                    {' '}= <span className="text-[var(--c-sub)] font-semibold">{totalWorkers} workers</span>
                  </p>
                )}
              </div>

              {/* Notes */}
              <div>
                <label className="text-xs font-semibold text-[var(--c-sub)] uppercase tracking-wide block mb-2">
                  Notes <span className="font-normal normal-case">(optional)</span>
                </label>
                <textarea value={actNotes} onChange={e => setActNotes(e.target.value)}
                  placeholder="What was done, any observations…"
                  rows={2}
                  className="w-full rounded-xl px-4 py-3 text-sm outline-none border resize-none"
                  style={{ background: 'var(--c-bg)', color: '#fff', borderColor: 'var(--c-border-md)' }} />
              </div>

              {/* Buttons */}
              <div className="flex gap-3 pt-1 pb-2">
                <button onClick={() => setShowModal(false)}
                  className="flex-1 py-3 rounded-xl text-sm font-semibold border text-[var(--c-sub)] hover:text-[var(--c-text)] hover:border-white/30 transition-colors"
                  style={{ borderColor: 'var(--c-border-md)' }}>
                  Cancel
                </button>
                <button
                  onClick={handleSubmit}
                  disabled={(actType !== 'events' && selPlots.size === 0) || saving}
                  className="flex-1 py-3 rounded-xl text-sm font-bold transition-opacity disabled:opacity-40"
                  style={{ background: '#1D9E75', color: '#fff' }}>
                  {saving ? 'Saving…' : `Save${selPlots.size > 1 ? ` (${selPlots.size} plots)` : ''}`}
                </button>
              </div>

            </div>
          </div>
        </div>
      )}

      <style>{`.no-scrollbar::-webkit-scrollbar{display:none}.no-scrollbar{-ms-overflow-style:none;scrollbar-width:none}`}</style>
    </div>
  )
}

// ── Sub-components ────────────────────────────────────────────────────────────

function Pill({ count, label, color, dim, icon }) {
  return (
    <div className={`shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-full border ${dim ? 'opacity-40' : ''}`}
      style={{ background: color + '18', borderColor: color + '40' }}>
      {icon && <span style={{ color }}>{icon}</span>}
      <span className="text-sm font-bold" style={{ color }}>{count}</span>
      <span className="text-xs font-medium" style={{ color }}>{label}</span>
    </div>
  )
}

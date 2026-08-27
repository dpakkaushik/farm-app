import React, { useState, useMemo, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import { format, parseISO } from 'date-fns'
import { Plus, X, ChevronUp, ChevronDown, Filter, Users, HardHat, Tractor, CalendarDays, Receipt } from 'lucide-react'
import { AddExpenseModal } from './Expenses'
import { useAppStore, selectFieldWorkers, selectDrivers, selectTractors } from '../store'
import { useAuthStore, isManager } from '../store/auth'
import { supabase } from '../lib/supabase'
import useWeather from '../hooks/useWeather'
import useBackClose from '../hooks/useBackClose'
import { weatherLine } from '../lib/weather'
import { buildDayBundle, datesInRange } from './today/dayBundle'
import DayCard from './today/DayCard'
import TaskCalendar from './today/TaskCalendar'
import HistorySheet from './today/HistorySheet'

// Local date parts, never toISOString() — in IST that shift lands on yesterday
// for the first five and a half hours of every day (see lib/period.js, which
// learned this the hard way).
const dStr = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const getTodayStr  = () => dStr(new Date())
const getTodayDate = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d }
const TODAY_DATE   = getTodayDate()
const TODAY_STR    = getTodayStr()

// The week behind today, shown by default under the day card — yesterday back
// to seven days ago. Anything older is one History pick away.
const dateStrDaysAgo = (n) => { const d = new Date(); d.setDate(d.getDate() - n); return dStr(d) }
const LAST7_START = dateStrDaysAgo(7)
const LAST7_END   = dateStrDaysAgo(1)

const HISTORY_WARN_DAYS = 90

// How a picked range reads on the chip: one day is just that day.
const rangeLabel = (start, end) => start === end
  ? format(parseISO(start), 'd MMM yyyy')
  : `${format(parseISO(start), 'd MMM')} – ${format(parseISO(end), 'd MMM yyyy')}`

// The quick picks every app's date filter offers, so the common case is one tap
// and the two date fields are for the uncommon one.
const historyPresets = () => {
  const now = new Date()
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
  const lastStart  = new Date(now.getFullYear(), now.getMonth() - 1, 1)
  const lastEnd    = new Date(now.getFullYear(), now.getMonth(), 0)
  return [
    { label: 'Last 30 days', start: dateStrDaysAgo(29), end: TODAY_STR },
    { label: 'This month',   start: dStr(monthStart),   end: TODAY_STR },
    { label: 'Last month',   start: dStr(lastStart),    end: dStr(lastEnd) },
  ]
}

// How long a missed task keeps nagging. It used to be 3 days, which meant a task
// ignored for four days vanished from the app entirely — no card, no count,
// nowhere. Thirty days is long enough that nothing real slips through, and short
// enough that tasks from finished seasons (the farm has 31 of them, the oldest
// 272 days) stay out of the notification count instead of drowning it.
const OVERDUE_WINDOW_DAYS = 30

function TodayBoard() {
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
  // Same fetch the Field map's pill uses — the owner asked for the weather up
  // here beside his name, where the repeated date line used to be.
  const { current: weather } = useWeather()

  const [showModal,        setShowModal]        = useState(false)
  const [showExpenseModal, setShowExpenseModal] = useState(false)
  const [showNotif,        setShowNotif]        = useState(false)
  const [selPlots,      setSelPlots]      = useState(new Set())
  const [actType,       setActType]       = useState('irrigation')
  const [selWorkers,    setSelWorkers]    = useState(new Set())  // labour_master IDs
  const [outsideLabour, setOutsideLabour] = useState(0)          // headcount
  const [selDriver,     setSelDriver]     = useState('')         // ploughing only
  const [selMachinery,  setSelMachinery]  = useState('')         // ploughing only
  const [actNotes,      setActNotes]      = useState('')
  const [doneTasks,     setDoneTasks]     = useState(new Set())
  const [saving,        setSaving]        = useState(false)

  // The back gesture dismisses whatever is open over the board — a half-filled
  // Log Activity form is exactly what it must not walk off with. (The expense
  // form and the History sheet bring their own from their shells.)
  useBackClose(() => { if (!saving) setShowModal(false) }, showModal)
  useBackClose(() => setShowNotif(false), showNotif)

  // Deep link: /today?log=expense opens the expense form straight away — the
  // door Livestock's Add Expense and the /expenses route walk through. The old
  // ?tab=expenses (from when Expenses was a tab here) lands in the same place,
  // so any stale link still works. The param is cleared so Back and refresh
  // don't reopen the form.
  const [params, setParams] = useSearchParams()
  useEffect(() => {
    if (params.get('log') === 'expense' || params.get('tab') === 'expenses') {
      setShowExpenseModal(true)
      setParams({}, { replace: true })
    }
  }, [params, setParams])

  // ── History — a filter on the day feed, opened from the header ─────────────
  // It used to be a collapsed panel at the very bottom of the page, below every
  // day card, which is the last place anyone looks for "show me last month".
  // Now it is a control beside the bell: pick a range, the feed becomes that
  // range, and a chip under the header says what is applied (owner, 26 Aug).
  const [showHistory,       setShowHistory]       = useState(false)
  const [historyStart,      setHistoryStart]      = useState('')
  const [historyEnd,        setHistoryEnd]        = useState('')
  const [historyLoading,    setHistoryLoading]    = useState(false)
  const [historyResults,    setHistoryResults]    = useState(null)  // [{date, bundle}] | null
  const [appliedRange,      setAppliedRange]      = useState(null)  // { start, end } | null
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

  // Every plot, not just the ones carrying a crop. Work happens on empty land —
  // ploughing above all, which by definition follows a harvest and precedes a
  // sowing. Listing only plots with an active cycle hid exactly the plots that
  // could be ploughed. A plot with no active cycle logs against no cycle.
  const selectablePlots = useMemo(() => {
    return plots
      .map(p => {
        const cycle = cropCycles.find(c => c.plotId === p.id && c.status === 'active')
        return {
          plotId: p.id,
          label:  p.name,
          crop:   cycle ? (cropMaster.find(m => m.id === cycle.cropId)?.name || '') : 'Fallow',
        }
      })
      .sort((a, b) => a.label.localeCompare(b.label))
  }, [plots, cropCycles, cropMaster])

  // Scheduled tasks derived from crop templates. The buckets feed the badge and
  // the day card; allPending — every pending task inside the nag window or any
  // distance into the future, each carrying its dateStr — feeds the calendar.
  const { overdue, todayTasks, tomorrow, upcoming, allPending } = useMemo(() => {
    const overdue = [], todayTasks = [], tomorrow = [], upcoming = [], allPending = []
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

        if (daysUntil < -OVERDUE_WINDOW_DAYS) return

        const task = {
          id: `${cycle.id}-d${act.day}`, plotId: cycle.plotId, plotLabel: cycle.plotLabel,
          cropName: template.name, label: act.label, type: act.type,
          day: act.day, daysUntil, cycleId: cycle.id, dateStr: scheduledDateStr,
        }
        allPending.push(daysUntil < 0 ? { ...task, daysOverdue: -daysUntil } : task)
        if      (daysUntil === 0)                  todayTasks.push(task)
        else if (daysUntil === 1)                  tomorrow.push(task)
        else if (daysUntil < 0)                    overdue.push({ ...task, daysOverdue: -daysUntil })
        else if (daysUntil > 1 && daysUntil <= 7)  upcoming.push(task)
      })
    })
    return { overdue, todayTasks, tomorrow, upcoming: upcoming.sort((a, b) => a.daysUntil - b.daysUntil), allPending }
  }, [cropCycles, cropMaster, activities, doneTasks])

  const loggedToday    = useMemo(() => activities.filter(a => a.date === TODAY_STR), [activities])
  const pendingToday   = todayTasks.filter(t => !doneTasks.has(t.id))
  const completedToday = todayTasks.filter(t =>  doneTasks.has(t.id))
  const pendingOverdue = overdue.filter(t => !doneTasks.has(t.id))

  // The bell counts what was missed and what is coming. Today's own scheduled
  // tasks are not counted — they are already on the day card, in front of you.
  const notifCount = pendingOverdue.length + tomorrow.length + upcoming.length

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

  // ── Last 7 days — shown by default, no Fetch needed ─────────────────────────
  // Same slices and day-bundle logic as History. The store already holds every
  // slice in full except advances (it only keeps outstanding ones), so recovered
  // advances for the window are fetched once here — the same gap fetchHistory
  // plugs for its range. Until (or if ever) that lands, the store's own advances
  // stand in.
  const [recentAdvances, setRecentAdvances] = useState(null)
  useEffect(() => {
    let cancelled = false
    supabase.from('salary_advances').select('*')
      .eq('farm_id', activeFarmId)
      .gte('advance_date', LAST7_START)
      .lte('advance_date', LAST7_END)
      .then(({ data }) => {
        if (cancelled || !data) return
        setRecentAdvances(data.map(a => ({
          id: a.id, labourerId: a.labourer_id, date: a.advance_date,
          amount: Number(a.amount), reason: a.reason || '',
        })))
      })
    return () => { cancelled = true }
  }, [activeFarmId])

  const last7Days = useMemo(() => {
    const slices = recentAdvances ? { ...todaySlices, advances: recentAdvances } : todaySlices
    return datesInRange(slices, LAST7_START, LAST7_END)
      .map(d => ({ date: d, bundle: buildDayBundle(d, slices, resolvers) }))
      .filter(r => !r.bundle.isEmpty)
  }, [todaySlices, resolvers, recentAdvances])

  // Which past dates have anything recorded at all — the calendar marks these,
  // so the bell shows what HAPPENED as well as what is scheduled (owner's ask).
  // Read straight off the store's slices: no fetch, and it covers every domain
  // datesInRange knows about.
  const historyDates = useMemo(
    () => new Set(datesInRange(todaySlices, '2000-01-01', TODAY_STR)),
    [todaySlices])

  const rangeDays = (historyStart && historyEnd && historyStart <= historyEnd)
    ? Math.round((new Date(historyEnd) - new Date(historyStart)) / 86400000) + 1
    : 0

  // One path for every way a range gets picked: the sheet's Show days button,
  // its quick picks, and a tap on a calendar date that has records.
  const loadRange = async (start, end, { force = false } = {}) => {
    setHistoryError('')
    if (!start || !end || start > end) {
      setHistoryError('Pick a valid start and end date')
      return
    }
    const days = Math.round((new Date(end) - new Date(start)) / 86400000) + 1
    if (days > HISTORY_WARN_DAYS && !force) {
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
      .gte('advance_date', start)
      .lte('advance_date', end)
    const historyAdvances = (data || []).map(a => ({
      id: a.id, labourerId: a.labourer_id, date: a.advance_date,
      amount: Number(a.amount), reason: a.reason || '',
    }))
    const slices = { ...todaySlices, advances: historyAdvances }
    const results = datesInRange(slices, start, end)
      .map(d => ({ date: d, bundle: buildDayBundle(d, slices, resolvers) }))
      .filter(r => !r.bundle.isEmpty)
    setHistoryResults(results)
    setAppliedRange({ start, end })
    setHistoryLoading(false)
    setShowHistory(false)
  }

  const clearRange = () => {
    setAppliedRange(null); setHistoryResults(null)
    setHistoryStart(''); setHistoryEnd(''); setHistoryError(''); setConfirmLargeRange(false)
  }

  // A calendar date that has records opens as a one-day range in the feed.
  const openDay = (dateStr) => { setShowNotif(false); loadRange(dateStr, dateStr) }

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

      {/* Header — name, then the weather. The waving hand is gone and so is the
          full date line: every day card below prints its own date, so the
          header was saying "Wednesday, 26 August" twice (owner, 26 Aug). */}
      <div className="px-4 pt-4 pb-2 flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h1 className="text-xl font-bold text-[var(--c-text)] truncate">
            {greeting}, {profile?.full_name?.split(' ')[0] || 'there'}
          </h1>
          <p className="text-sm text-[var(--c-muted)] min-h-[20px] truncate">{weatherLine(weather) || ''}</p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {/* History, as a filter on the day feed */}
          <button onClick={() => setShowHistory(true)} aria-label="Filter the feed by date"
            className="flex items-center gap-1.5 h-10 px-3 rounded-xl border text-xs font-semibold"
            style={{
              background:  appliedRange ? '#8A9A5B12' : 'var(--c-card)',
              borderColor: appliedRange ? '#8A9A5B80' : 'var(--c-border-md)',
              color:       appliedRange ? '#8A9A5B'   : 'var(--c-sub)',
            }}>
            <Filter size={13} style={{ color: appliedRange ? '#8A9A5B' : 'var(--c-muted)' }} />
            History
          </button>

        {/* The bell — a month calendar of scheduled tasks, dotted in crop
            colours, red where a date was missed, and now marked on every date
            that has something recorded. The badge still counts what was missed
            and what is coming. It replaced a flat list that only repeated the
            day card's Tasks Due; the card keeps that block for overdue + today
            because the calendar cannot nag and Done must stay one tap. */}
        <div className="relative">
          <button
            onClick={() => setShowNotif(o => !o)}
            aria-label={`${notifCount} task${notifCount === 1 ? '' : 's'} overdue or upcoming`}
            className="relative w-10 h-10 flex items-center justify-center rounded-xl border transition-colors hover:border-white/30"
            style={{ background: 'var(--c-card)', borderColor: 'var(--c-border-md)' }}>
            {/* A calendar, not a bell (owner, 27 Aug) — the panel behind it is a
                calendar, and the bell promised notifications it never sent. */}
            <CalendarDays size={17} className="text-[var(--c-sub)]" />
            {notifCount > 0 && (
              <span
                className="absolute -top-1.5 -right-1.5 min-w-[18px] h-[18px] px-1 flex items-center justify-center rounded-full text-[10px] font-bold"
                style={{ background: pendingOverdue.length > 0 ? '#E24B4A' : '#8A9A5B', color: '#fff' }}>
                {notifCount}
              </span>
            )}
          </button>

          {showNotif && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setShowNotif(false)} />
              <div
                className="absolute right-0 mt-2 z-50 w-[min(92vw,22rem)] rounded-2xl border p-3.5 shadow-2xl"
                style={{ background: 'var(--c-nav)', borderColor: 'var(--c-border-md)', maxHeight: '70vh', overflowY: 'auto' }}>
                <div className="flex items-center justify-between mb-3">
                  {/* Not "Task Calendar" any more — it marks recorded days too */}
                  <p className="text-[10px] font-bold uppercase tracking-wide text-[var(--c-faint)]">
                    Farm Calendar
                  </p>
                  <button onClick={() => setShowNotif(false)}
                    className="w-6 h-6 flex items-center justify-center rounded-full text-[var(--c-muted)] hover:text-[var(--c-text)] hover:bg-[var(--c-ghost)]">
                    <X size={13} />
                  </button>
                </div>
                <TaskCalendar tasks={allPending} todayStr={TODAY_STR}
                  historyDates={historyDates} onOpenDay={openDay}
                  onMarkDone={isManager(activeFarmRole) ? markDone : undefined} />
              </div>
            </>
          )}
        </div>
        </div>
      </div>

      {/* What the feed is showing, when it is not the default week */}
      {appliedRange && (
        <div className="px-4 pb-2 flex items-center gap-2 overflow-x-auto no-scrollbar">
          <button onClick={clearRange}
            aria-label="Clear the date filter"
            className="shrink-0 flex items-center gap-1 h-7 pl-2.5 pr-1.5 rounded-full border text-[11px] font-semibold"
            style={{ background: '#8A9A5B12', borderColor: '#8A9A5B55', color: '#8A9A5B' }}>
            {rangeLabel(appliedRange.start, appliedRange.end)}<X size={11} />
          </button>
          <span className="shrink-0 text-[11px] text-[var(--c-faint)]">
            {historyResults ? `${historyResults.length} day${historyResults.length === 1 ? '' : 's'} with records` : ''}
          </span>
        </div>
      )}

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
                {pendingToday.length > 0   && <Pill count={pendingToday.length}   label="Scheduled" color="#8A9A5B" />}
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
          onMarkDone={markDone}
          action={isManager(activeFarmRole) ? (
            /* Twins, on the owner's word — identical weight, Log Activity
               first (the first cut styled Log Expense as a red outline and he
               read it as the odd one out). Both now wear the same button the
               register cards use, on their own full-width row. */
            <div className="flex gap-2">
              <button onClick={() => setShowModal(true)}
                className="flex-1 py-2 rounded-xl border text-xs font-semibold flex items-center justify-center gap-1.5"
                style={{ background: '#8A9A5B18', borderColor: '#8A9A5B40', color: '#8A9A5B' }}>
                <Plus size={13} strokeWidth={2.5} /> Log Activity
              </button>
              <button onClick={() => setShowExpenseModal(true)}
                className="flex-1 py-2 rounded-xl border text-xs font-semibold flex items-center justify-center gap-1.5"
                style={{ background: '#8A9A5B18', borderColor: '#8A9A5B40', color: '#8A9A5B' }}>
                <Receipt size={13} strokeWidth={2.5} /> Log Expense
              </button>
            </div>
          ) : null} />

        {/* The feed: the last week by default, the picked range when there is
            one. Never both — the same day card twice reads as a bug. */}
        {appliedRange ? (
          <div className="space-y-3">
            <p className="text-[10px] font-bold text-[var(--c-faint)] uppercase tracking-widest pt-1">
              {rangeLabel(appliedRange.start, appliedRange.end)}
            </p>
            {historyLoading && <p className="text-xs text-[var(--c-faint)] text-center py-4">Loading…</p>}
            {!historyLoading && historyResults?.length === 0 && (
              <p className="text-xs text-[var(--c-faint)] text-center py-4 italic">Nothing was recorded in this range</p>
            )}
            {!historyLoading && (historyResults || []).map(r => <DayCard key={r.date} date={r.date} bundle={r.bundle} />)}
          </div>
        ) : last7Days.length > 0 && (
          <div className="space-y-3">
            <p className="text-[10px] font-bold text-[var(--c-faint)] uppercase tracking-widest pt-1">
              Last 7 Days
            </p>
            {last7Days.map(r => <DayCard key={r.date} date={r.date} bundle={r.bundle} />)}
          </div>
        )}

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
                    <span className="text-[#8A9A5B] ml-1">({selPlots.size} selected)</span>
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
                    {selectablePlots.map(p => {
                      const sel = selPlots.has(p.plotId)
                      return (
                        <button key={p.plotId} onClick={() => togglePlot(p.plotId)}
                          className="flex flex-col items-center px-3 py-2 rounded-xl border text-xs font-semibold transition-all"
                          style={{
                            background:  sel ? '#8A9A5B20' : 'var(--c-card)',
                            borderColor: sel ? '#8A9A5B'   : 'var(--c-border-md)',
                            color:       sel ? '#8A9A5B'   : 'var(--c-sub)',
                          }}>
                          <span className="text-sm font-bold">{p.label}</span>
                          <span className="text-[9px] font-normal mt-0.5 opacity-70">{p.crop}</span>
                        </button>
                      )
                    })}
                    {selectablePlots.length === 0 && (
                      <p className="text-xs text-[var(--c-faint)] italic">No plots found</p>
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
                  style={{ background: '#8A9A5B', color: '#fff' }}>
                  {saving ? 'Saving…' : `Save${selPlots.size > 1 ? ` (${selPlots.size} plots)` : ''}`}
                </button>
              </div>

            </div>
          </div>
        </div>
      )}

      {/* ── History — the date filter on the feed ── */}
      {showHistory && (
        <HistorySheet
          start={historyStart} end={historyEnd}
          setStart={v => { setHistoryStart(v); setConfirmLargeRange(false) }}
          setEnd={v => { setHistoryEnd(v); setConfirmLargeRange(false) }}
          presets={historyPresets()} today={TODAY_STR}
          onPreset={p => { setHistoryStart(p.start); setHistoryEnd(p.end); loadRange(p.start, p.end) }}
          onApply={() => loadRange(historyStart, historyEnd, { force: confirmLargeRange })}
          onClear={() => { clearRange(); setShowHistory(false) }}
          onClose={() => setShowHistory(false)}
          loading={historyLoading} error={historyError}
          warnDays={confirmLargeRange ? rangeDays : 0}
          applied={!!appliedRange} />
      )}

      {/* ── Log Expense Modal — the whole former Expenses tab, as a form ── */}
      {showExpenseModal && (
        <AddExpenseModal animals={livestockMaster} onClose={() => setShowExpenseModal(false)} />
      )}

      <style>{`.no-scrollbar::-webkit-scrollbar{display:none}.no-scrollbar{-ms-overflow-style:none;scrollbar-width:none}`}</style>
    </div>
  )
}

// ── Sub-components ────────────────────────────────────────────────────────────

// The same chip the filters wear elsewhere in the app (see FilterSheet's applied
// chips) — h-7, tinted, 11px. It used to be a taller pill with a 14px figure,
// which shouted louder than the day card it was summarising.
function Pill({ count, label, color, dim, icon }) {
  return (
    <div className={`shrink-0 flex items-center gap-1.5 h-7 px-2.5 rounded-full border ${dim ? 'opacity-40' : ''}`}
      style={{ background: color + '12', borderColor: color + '55' }}>
      {icon && <span style={{ color }}>{icon}</span>}
      <span className="text-[11px] font-bold tabular-nums" style={{ color }}>{count}</span>
      <span className="text-[11px] font-semibold" style={{ color }}>{label}</span>
    </div>
  )
}

// Expenses was the second tab here (and before that, a tab inside Resources).
// The owner asked for the tab to go — "i rather want expense to be log expense
// like log activity" — so Today is a single board again, and the expense form
// opens from the Log Expense button on the day card. Deep links land in the
// same place: /today?log=expense (and the old ?tab=expenses) open the form.
export default TodayBoard

import React, { useState, useMemo } from 'react'
import { format } from 'date-fns'
import { Plus, X, ChevronUp, ChevronDown, ChevronRight, ClipboardList } from 'lucide-react'
import { useAppStore } from '../store'
import { useAuthStore, isManager } from '../store/auth'

const getTodayStr = () => new Date().toISOString().slice(0, 10)
const getTodayDate = () => { const d = new Date(); d.setHours(0,0,0,0); return d }
const TODAY_DATE = getTodayDate()
const TODAY_STR  = getTodayStr()

const ACTIVITY_TYPES = [
  { value: 'irrigation',    label: 'Irrigation',          emoji: '💧' },
  { value: 'weeding',       label: 'Weeding',             emoji: '🌿' },
  { value: 'fertilizer',    label: 'Fertilizer',          emoji: '🧪' },
  { value: 'spray',         label: 'Spray / Pesticide',   emoji: '🧴' },
  { value: 'ploughing',     label: 'Ploughing',           emoji: '🚜' },
  { value: 'sowing',        label: 'Sowing',              emoji: '🌱' },
  { value: 'harvesting',    label: 'Harvesting',          emoji: '🌾' },
  { value: 'intercultural', label: 'Intercultural Ops',   emoji: '🔧' },
  { value: 'events',        label: 'Events',              emoji: '📅' },
  { value: 'other',         label: 'Other',               emoji: '📋' },
]

const ACT_EMOJI = {
  irrigation: '💧', weeding: '🌿', fertilizer: '🧪', spray: '🧴',
  pesticide: '🧴', ploughing: '🚜', sowing: '🌱', harvesting: '🌾',
  harvest: '🌾', intercultural: '🔧', events: '📅', other: '📋',
}
const ACT_COLOR = {
  irrigation: '#3b82f6', weeding: '#f97316', fertilizer: '#a855f7',
  spray: '#ef4444', pesticide: '#ef4444', ploughing: '#f59e0b',
  sowing: '#34d399', harvesting: '#1D9E75', harvest: '#1D9E75',
  intercultural: '#64748b', events: '#ec4899', other: '#6b7280',
}

export default function Today() {
  const { cropCycles, cropMaster, activities, plots, logActivity, logActivities } = useAppStore()

  const { profile } = useAuthStore()
  const hour = new Date().getHours()
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening'

  const [showModal, setShowModal]   = useState(false)
  const [selPlots,  setSelPlots]    = useState(new Set())
  const [actType,   setActType]     = useState('irrigation')
  const [actWorkers,setActWorkers]  = useState(0)
  const [actNotes,  setActNotes]    = useState('')
  const [doneTasks, setDoneTasks]   = useState(new Set())
  const [showHistory, setShowHistory] = useState(false)
  const [saving,    setSaving]      = useState(false)

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

    const doneKeys = new Set(
      activities.map(a => `${a.plotId}|${a.type}|${a.date}`)
    )
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
      const sowDate = new Date(cycle.sowDate); sowDate.setHours(0, 0, 0, 0)
      const dayInCycle = Math.floor((TODAY_DATE - sowDate) / 86400000)

      template.activities.forEach(act => {
        const daysUntil = act.day - dayInCycle
        const scheduledDate = new Date(sowDate.getTime() + act.day * 86400000)
        const scheduledDateStr = scheduledDate.toISOString().slice(0, 10)

        if (isAlreadyLogged(cycle.plotId, act.type, scheduledDateStr)) return
        if (doneTasks.has(`${cycle.id}-d${act.day}`)) return

        const task = {
          id:        `${cycle.id}-d${act.day}`,
          plotId:    cycle.plotId,
          plotLabel: cycle.plotLabel,
          cropName:  template.name,
          label:     act.label,
          type:      act.type,
          day:       act.day,
          daysUntil,
          cycleId:   cycle.id,
        }
        if      (daysUntil === 0)                   todayTasks.push(task)
        else if (daysUntil === 1)                   tomorrow.push(task)
        else if (daysUntil < 0 && daysUntil >= -3) overdue.push({ ...task, daysOverdue: -daysUntil })
        else if (daysUntil > 1 && daysUntil <= 7)  upcoming.push(task)
      })
    })
    return { overdue, todayTasks, tomorrow, upcoming: upcoming.sort((a, b) => a.daysUntil - b.daysUntil) }
  }, [cropCycles, cropMaster, activities, doneTasks])

  const loggedToday   = useMemo(() => activities.filter(a => a.date === TODAY_STR), [activities])
  const pendingToday  = todayTasks.filter(t => !doneTasks.has(t.id))
  const completedToday = todayTasks.filter(t => doneTasks.has(t.id))
  const pendingOverdue = overdue.filter(t => !doneTasks.has(t.id))

  const markDone = async (task) => {
    setDoneTasks(prev => new Set([...prev, task.id]))
    await logActivity({
      plotId:      task.plotId,
      cropCycleId: task.cycleId,
      type:        task.type,
      date:        TODAY_STR,
      notes:       task.label,
      workers:     0,
    })
  }

  const handleSubmit = async () => {
    const plotIds = selPlots.size > 0 ? [...selPlots] : (actType === 'events' ? ['__all__'] : [])
    if (plotIds.length === 0) return
    setSaving(true)
    await logActivities(plotIds, {
      type:    actType,
      workers: actWorkers,
      date:    getTodayStr(),
      notes:   actNotes.trim(),
    })
    setSaving(false)
    setShowModal(false)
    setSelPlots(new Set())
    setActType('irrigation')
    setActWorkers(0)
    setActNotes('')
  }

  const togglePlot = (plotId) =>
    setSelPlots(prev => {
      const next = new Set(prev)
      next.has(plotId) ? next.delete(plotId) : next.add(plotId)
      return next
    })

  const totalScheduled = pendingOverdue.length + pendingToday.length + completedToday.length

  return (
    <div className="h-full overflow-y-auto bg-[#0f1117] pb-6">

      {/* Header */}
      <div className="px-4 pt-4 pb-2 flex items-start justify-between">
        <div>
          <h1 className="text-xl font-bold text-white">{greeting}, {profile?.full_name?.split(' ')[0] || 'there'} 👋</h1>
          <p className="text-sm text-white/40">{format(new Date(), 'EEEE, d MMMM yyyy')}</p>
        </div>
        {isManager(profile) && (
          <button
            onClick={() => setShowModal(true)}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold"
            style={{ background: '#1D9E75', color: '#fff' }}>
            <Plus size={14} strokeWidth={2.5} /> Log Activity
          </button>
        )}
      </div>

      {/* Summary pills */}
      {(pendingOverdue.length > 0 || pendingToday.length > 0 || loggedToday.length > 0) && (
        <div className="flex gap-2 px-4 pb-3 overflow-x-auto no-scrollbar">
          {pendingOverdue.length > 0 && <Pill count={pendingOverdue.length} label="Overdue"   color="#E24B4A" />}
          {pendingToday.length > 0   && <Pill count={pendingToday.length}   label="Scheduled" color="#1D9E75" />}
          {loggedToday.length > 0    && <Pill count={loggedToday.length}    label="Logged"    color="#3b82f6" />}
          {completedToday.length > 0 && <Pill count={completedToday.length} label="Done"      color="#6b7280" dim />}
        </div>
      )}

      <div className="px-4 space-y-5">

        {pendingOverdue.length > 0 && (
          <Section title="⚠ Overdue" color="#E24B4A">
            {pendingOverdue.map(t => (
              <ScheduledCard key={t.id} task={t} status="overdue" onDone={() => markDone(t)} />
            ))}
          </Section>
        )}

        {totalScheduled > 0 && (
          <Section title="Scheduled Today" color="#1D9E75"
            badge={pendingToday.length === 0 && todayTasks.length > 0 ? '✓ All done' : null}>
            {pendingToday.map(t => (
              <ScheduledCard key={t.id} task={t} status="today" onDone={() => markDone(t)} />
            ))}
            {completedToday.map(t => (
              <ScheduledCard key={t.id} task={t} status="done" />
            ))}
          </Section>
        )}

        {loggedToday.length > 0 && (
          <Section title="Logged Today" color="#3b82f6">
            {loggedToday.map(a => <LoggedCard key={a.id} activity={a} />)}
          </Section>
        )}

        {tomorrow.length > 0 && (
          <Section title="Tomorrow" color="#BA7517">
            {tomorrow.map(t => <ScheduledCard key={t.id} task={t} status="upcoming" />)}
          </Section>
        )}

        {upcoming.length > 0 && (
          <Section title="Next 7 days" color="#6b7280">
            {upcoming.map(t => <ScheduledCard key={t.id} task={t} status="future" />)}
          </Section>
        )}

        {/* Activity History */}
        <div className="rounded-2xl border overflow-hidden" style={{ borderColor: 'rgba(255,255,255,0.08)' }}>
          <button
            onClick={() => setShowHistory(h => !h)}
            className="w-full flex items-center justify-between px-4 py-3.5"
            style={{ background: 'rgba(255,255,255,0.03)' }}>
            <div className="flex items-center gap-2">
              <ClipboardList size={15} className="text-white/40" />
              <span className="text-xs font-bold text-white/60 uppercase tracking-wide">Activity History</span>
              <span className="text-[10px] px-1.5 py-0.5 rounded-full font-bold"
                style={{ background: '#1D9E7520', color: '#1D9E75' }}>
                {activities.length} records
              </span>
            </div>
            <ChevronRight size={14} className="text-white/30 transition-transform"
              style={{ transform: showHistory ? 'rotate(90deg)' : 'rotate(0deg)' }} />
          </button>

          {showHistory && (
            <div className="divide-y" style={{ divideColor: 'rgba(255,255,255,0.05)' }}>
              {activities.length === 0 ? (
                <p className="text-xs text-white/30 text-center py-6 italic">No activities logged yet</p>
              ) : (
                [...activities]
                  .sort((a, b) => (b.date || '').localeCompare(a.date || ''))
                  .map(a => {
                    const color = ACT_COLOR[a.type] || '#6b7280'
                    const typeInfo = ACTIVITY_TYPES.find(t => t.value === a.type)
                    return (
                      <div key={a.id} className="flex items-center gap-3 px-4 py-3"
                        style={{ background: 'rgba(255,255,255,0.015)' }}>
                        <div className="w-7 h-7 rounded-lg flex items-center justify-center text-sm shrink-0"
                          style={{ background: color + '20' }}>
                          {ACT_EMOJI[a.type] || '📋'}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-xs font-bold text-white/80">{a.plotLabel || '—'}</span>
                            <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded"
                              style={{ background: color + '20', color }}>
                              {typeInfo?.label || a.type}
                            </span>
                            {a.workers > 0 && <span className="text-[9px] text-white/35">👷 {a.workers}</span>}
                          </div>
                          {a.notes ? <p className="text-[11px] text-white/40 mt-0.5 truncate">{a.notes}</p> : null}
                        </div>
                        <span className="text-[10px] text-white/25 shrink-0">{a.date}</span>
                      </div>
                    )
                  })
              )}
            </div>
          )}
        </div>

        {cropCycles.filter(c => c.status === 'active').length === 0 && (
          <div className="text-center py-16 text-white/20">
            <p className="text-5xl mb-3">🌱</p>
            <p className="text-sm font-medium">No active crop cycles</p>
            <p className="text-xs mt-1 text-white/15">Start a crop cycle to see scheduled tasks here</p>
          </div>
        )}
      </div>

      {/* Log Activity Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-end justify-center"
          style={{ background: 'rgba(0,0,0,0.7)' }}
          onClick={e => e.target === e.currentTarget && setShowModal(false)}>
          <div className="w-full max-w-lg rounded-t-2xl overflow-hidden"
            style={{ background: '#161a23', maxHeight: '90vh', overflowY: 'auto' }}>

            <div className="flex items-center justify-between px-5 pt-5 pb-4 border-b border-white/10">
              <h2 className="text-base font-bold text-white">Log Activity</h2>
              <button onClick={() => setShowModal(false)}
                className="w-7 h-7 flex items-center justify-center rounded-full text-white/40 hover:text-white hover:bg-white/10">
                <X size={16} />
              </button>
            </div>

            <div className="px-5 py-4 space-y-5">

              {/* Plot selection */}
              <div>
                <label className="text-xs font-semibold text-white/50 uppercase tracking-wide block mb-2">
                  {actType === 'events' ? 'Tag (optional)' : 'Select Plots'}
                  {actType !== 'events' && <span className="text-[#1D9E75] ml-1">({selPlots.size} selected)</span>}
                </label>

                {actType === 'events' ? (
                  /* Events: All Farm + individual plots, no cycle needed */
                  <div className="flex flex-wrap gap-2">
                    {[{ plotId: '__all__', label: 'All Farm', crop: '' }, ...plots.map(p => ({ plotId: p.id, label: p.name, crop: '' }))].map(p => {
                      const sel = selPlots.has(p.plotId)
                      return (
                        <button key={p.plotId} onClick={() => {
                          // "All Farm" is exclusive — selecting it clears others, selecting a plot clears All
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
                            background:  sel ? '#ec489920' : 'rgba(255,255,255,0.04)',
                            borderColor: sel ? '#ec4899'   : 'rgba(255,255,255,0.1)',
                            color:       sel ? '#ec4899'   : 'rgba(255,255,255,0.5)',
                          }}>
                          {p.label}
                        </button>
                      )
                    })}
                  </div>
                ) : (
                  /* Other activities: only active-cycle plots */
                  <div className="flex flex-wrap gap-2">
                    {activePlots.map(p => {
                      const sel = selPlots.has(p.plotId)
                      return (
                        <button key={p.plotId} onClick={() => togglePlot(p.plotId)}
                          className="flex flex-col items-center px-3 py-2 rounded-xl border text-xs font-semibold transition-all"
                          style={{
                            background:  sel ? '#1D9E7520' : 'rgba(255,255,255,0.04)',
                            borderColor: sel ? '#1D9E75'   : 'rgba(255,255,255,0.1)',
                            color:       sel ? '#1D9E75'   : 'rgba(255,255,255,0.5)',
                          }}>
                          <span className="text-sm font-bold">{p.label}</span>
                          <span className="text-[9px] font-normal mt-0.5 opacity-70">{p.crop}</span>
                        </button>
                      )
                    })}
                    {activePlots.length === 0 && (
                      <p className="text-xs text-white/30 italic">No active crop cycles found</p>
                    )}
                  </div>
                )}
              </div>

              {/* Activity type */}
              <div>
                <label className="text-xs font-semibold text-white/50 uppercase tracking-wide block mb-2">Activity Type</label>
                <div className="relative">
                  <select value={actType} onChange={e => setActType(e.target.value)}
                    className="w-full rounded-xl px-4 py-3 text-sm font-medium appearance-none outline-none border"
                    style={{ background: '#0f1117', color: '#fff', borderColor: 'rgba(255,255,255,0.12)' }}>
                    {ACTIVITY_TYPES.map(t => (
                      <option key={t.value} value={t.value}>{t.emoji}  {t.label}</option>
                    ))}
                  </select>
                  <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-white/40">▾</div>
                </div>
              </div>

              {/* Workers */}
              <div>
                <label className="text-xs font-semibold text-white/50 uppercase tracking-wide block mb-2">Workers</label>
                <div className="flex items-center gap-0 rounded-xl border overflow-hidden w-40"
                  style={{ borderColor: 'rgba(255,255,255,0.12)' }}>
                  <button onClick={() => setActWorkers(w => Math.max(0, w - 1))}
                    className="w-10 h-[46px] flex items-center justify-center text-white/50 hover:text-white hover:bg-white/10 transition-colors">
                    <ChevronDown size={16} />
                  </button>
                  <span className="flex-1 text-center text-sm font-bold text-white">{actWorkers}</span>
                  <button onClick={() => setActWorkers(w => w + 1)}
                    className="w-10 h-[46px] flex items-center justify-center text-white/50 hover:text-white hover:bg-white/10 transition-colors">
                    <ChevronUp size={16} />
                  </button>
                </div>
              </div>

              {/* Notes */}
              <div>
                <label className="text-xs font-semibold text-white/50 uppercase tracking-wide block mb-2">
                  Notes <span className="font-normal normal-case">(optional)</span>
                </label>
                <textarea value={actNotes} onChange={e => setActNotes(e.target.value)}
                  placeholder="What was done, any observations…"
                  rows={2}
                  className="w-full rounded-xl px-4 py-3 text-sm outline-none border resize-none"
                  style={{ background: '#0f1117', color: '#fff', borderColor: 'rgba(255,255,255,0.12)' }} />
              </div>

              {/* Buttons */}
              <div className="flex gap-3 pt-1 pb-2">
                <button onClick={() => setShowModal(false)}
                  className="flex-1 py-3 rounded-xl text-sm font-semibold border text-white/50 hover:text-white hover:border-white/30 transition-colors"
                  style={{ borderColor: 'rgba(255,255,255,0.12)' }}>
                  Cancel
                </button>
                <button onClick={handleSubmit} disabled={(actType !== 'events' && selPlots.size === 0) || saving}
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

function Pill({ count, label, color, dim }) {
  return (
    <div className={`shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-full border ${dim ? 'opacity-40' : ''}`}
      style={{ background: color + '18', borderColor: color + '40' }}>
      <span className="text-sm font-bold" style={{ color }}>{count}</span>
      <span className="text-xs font-medium" style={{ color }}>{label}</span>
    </div>
  )
}

function Section({ title, color, badge, children }) {
  return (
    <div>
      <div className="flex items-center gap-2 mb-2.5">
        <div className="w-1.5 h-4 rounded-full" style={{ background: color }} />
        <p className="text-xs font-bold text-white uppercase tracking-wide">{title}</p>
        {badge && <span className="text-[10px] text-white/30 ml-1">{badge}</span>}
      </div>
      <div className="space-y-2">{children}</div>
    </div>
  )
}

function ScheduledCard({ task, status, onDone }) {
  const isDone    = status === 'done'
  const isOverdue = status === 'overdue'
  const isToday   = status === 'today'
  const color     = ACT_COLOR[task.type] || '#6b7280'
  return (
    <div className={`rounded-2xl border p-3.5 transition-opacity ${isDone ? 'opacity-35' : ''}`}
      style={{
        background:  isDone ? 'transparent' : isOverdue ? '#3b0f0f' : isToday ? '#0f1f1a' : 'rgba(255,255,255,0.03)',
        borderColor: isDone ? 'rgba(255,255,255,0.05)' : isOverdue ? '#7f1d1d60' : isToday ? '#1D9E7530' : 'rgba(255,255,255,0.07)',
      }}>
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0 text-base"
          style={{ background: isDone ? 'rgba(255,255,255,0.05)' : color + '22' }}>
          {isDone ? '✓' : ACT_EMOJI[task.type] || '📋'}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-bold text-white/80">{task.plotLabel}</span>
            <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded-md"
              style={{ background: color + '22', color }}>
              {ACTIVITY_TYPES.find(t => t.value === task.type)?.label || task.type}
            </span>
            {isOverdue && <span className="text-[9px] text-[#E24B4A] font-semibold">{task.daysOverdue}d overdue</span>}
            {status === 'future' && <span className="text-[9px] text-white/30">in {task.daysUntil}d</span>}
          </div>
          <p className={`text-sm leading-snug mt-0.5 ${isDone ? 'text-white/30 line-through' : 'text-white/75'}`}>
            {task.label}
          </p>
          <p className="text-[10px] text-white/30 mt-0.5">{task.cropName} · Day {task.day}</p>
        </div>
        {(isToday || isOverdue) && onDone && (
          <button onClick={onDone}
            className="shrink-0 px-3 py-1.5 text-xs font-bold rounded-xl border transition-colors hover:bg-[#1D9E75] hover:text-white hover:border-[#1D9E75]"
            style={{ color: '#1D9E75', borderColor: '#1D9E7540', background: '#1D9E7510' }}>
            Done
          </button>
        )}
      </div>
    </div>
  )
}

function LoggedCard({ activity }) {
  const color    = ACT_COLOR[activity.type] || '#6b7280'
  const typeInfo = ACTIVITY_TYPES.find(t => t.value === activity.type)
  return (
    <div className="rounded-2xl border p-3.5"
      style={{ background: '#0d1825', borderColor: '#3b82f630' }}>
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0 text-base"
          style={{ background: color + '22' }}>
          {ACT_EMOJI[activity.type] || '📋'}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-bold text-white/80">{activity.plotLabel || '—'}</span>
            <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded-md"
              style={{ background: color + '22', color }}>
              {typeInfo?.label || activity.type}
            </span>
            {activity.workers > 0 && <span className="text-[9px] text-white/35">👷 {activity.workers} workers</span>}
          </div>
          {activity.notes ? <p className="text-sm text-white/60 mt-0.5 leading-snug">{activity.notes}</p> : null}
        </div>
      </div>
    </div>
  )
}

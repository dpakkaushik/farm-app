import React, { useState, useMemo } from 'react'
import { format } from 'date-fns'
import { CheckCircle2, AlertTriangle, Clock, Droplets, Sprout, Wheat, Package } from 'lucide-react'
import { useAppStore } from '../store'

// ── Pin today's date (demo: June 2 2026) ────────────────────────────────────
const TODAY = new Date('2026-06-02')
TODAY.setHours(0, 0, 0, 0)

const ACTIVITY_EMOJI = {
  irrigation: '💧', weeding:    '🌿', fertilizer: '🧪',
  pesticide:  '🧴', harvesting: '🌾', harvest:    '🌾',
  ploughing:  '🚜', sowing:     '🌱', other:      '📋',
}
const ACTIVITY_COLOR = {
  irrigation: '#3b82f6', weeding:    '#f97316', fertilizer: '#a855f7',
  pesticide:  '#ef4444', harvesting: '#10b981', harvest:    '#1D9E75',
  ploughing:  '#f59e0b', sowing:     '#34d399', other:      '#6b7280',
}

export default function Today() {
  const { cropCycles, cropMaster, inventoryMaster, logActivity } = useAppStore()
  const [doneTasks, setDoneTasks] = useState(new Set())

  const hour = new Date().getHours()
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening'

  // ── Derive all tasks from active crop cycles + templates ──────────────────
  const { overdue, today, tomorrow, upcoming } = useMemo(() => {
    const overdue = [], today = [], tomorrow = [], upcoming = []

    cropCycles
      .filter(c => c.status === 'active')
      .forEach(cycle => {
        const template = cropMaster.find(t => t.id === cycle.cropId)
        if (!template || !template.activities?.length) return

        const sowDate = new Date(cycle.sowDate)
        sowDate.setHours(0, 0, 0, 0)
        const dayInCycle = Math.floor((TODAY - sowDate) / 86400000)

        template.activities.forEach(act => {
          const daysUntil = act.day - dayInCycle
          const task = {
            id:        `${cycle.id}-d${act.day}`,
            plotId:    cycle.plotId,
            plotLabel: cycle.plotLabel,
            cropName:  template.name,
            label:     act.label,
            type:      act.type,
            inputs:    act.inputs || [],
            day:       act.day,
            daysUntil,
            acres:     cycle.acres,
          }

          if      (daysUntil === 0)               today.push(task)
          else if (daysUntil === 1)               tomorrow.push(task)
          else if (daysUntil < 0 && daysUntil >= -5) overdue.push({ ...task, daysOverdue: -daysUntil })
          else if (daysUntil > 1 && daysUntil <= 7)  upcoming.push(task)
        })
      })

    return {
      overdue,
      today,
      tomorrow,
      upcoming: upcoming.sort((a, b) => a.daysUntil - b.daysUntil),
    }
  }, [cropCycles])

  const markDone = (task) => {
    setDoneTasks(prev => new Set([...prev, task.id]))
    logActivity({
      plotId:     task.plotId,
      plotLabel:  task.plotLabel,
      type:       task.type,
      date:       new Date().toISOString().slice(0, 10),
      notes:      task.label,
      workers:    0,
    })
  }

  const pendingToday    = today.filter(t => !doneTasks.has(t.id))
  const completedToday  = today.filter(t =>  doneTasks.has(t.id))
  const pendingOverdue  = overdue.filter(t => !doneTasks.has(t.id))

  return (
    <div className="h-full overflow-y-auto bg-[#0f1117] pb-6">
      {/* ── Header ── */}
      <div className="px-4 pt-4 pb-3">
        <h1 className="text-xl font-bold text-white">{greeting} 👋</h1>
        <p className="text-sm text-white/40">{format(new Date(), 'EEEE, d MMMM yyyy')}</p>
      </div>

      {/* ── Summary pills ── */}
      {(pendingOverdue.length > 0 || pendingToday.length > 0 || tomorrow.length > 0) && (
        <div className="flex gap-2 px-4 pb-3 overflow-x-auto no-scrollbar">
          {pendingOverdue.length > 0 && (
            <SummaryPill count={pendingOverdue.length} label="Overdue" color="#E24B4A"/>
          )}
          {pendingToday.length > 0 && (
            <SummaryPill count={pendingToday.length} label="Due Today" color="#1D9E75"/>
          )}
          {completedToday.length > 0 && (
            <SummaryPill count={completedToday.length} label="Done Today" color="#6b7280" dim/>
          )}
          {tomorrow.length > 0 && (
            <SummaryPill count={tomorrow.length} label="Tomorrow" color="#BA7517"/>
          )}
        </div>
      )}

      <div className="px-4 space-y-5">

        {/* ── Overdue ── */}
        {pendingOverdue.length > 0 && (
          <Section title="⚠ Overdue" color="#E24B4A">
            {pendingOverdue.map(task => (
              <TaskCard key={task.id} task={task} status="overdue" onDone={() => markDone(task)} inventoryMaster={inventoryMaster}/>
            ))}
          </Section>
        )}

        {/* ── Today ── */}
        <Section title="Today" color="#1D9E75"
          badge={pendingToday.length === 0 && today.length > 0 ? '✓ All done' : null}>
          {today.length === 0 ? (
            <div className="py-4 text-center">
              <p className="text-2xl mb-1">🌾</p>
              <p className="text-sm text-white/30">No activities scheduled for today</p>
            </div>
          ) : (<>
            {pendingToday.map(task => (
              <TaskCard key={task.id} task={task} status="today" onDone={() => markDone(task)} inventoryMaster={inventoryMaster}/>
            ))}
            {completedToday.map(task => (
              <TaskCard key={task.id} task={task} status="done" inventoryMaster={inventoryMaster}/>
            ))}
          </>)}
        </Section>

        {/* ── Tomorrow ── */}
        {tomorrow.length > 0 && (
          <Section title="Tomorrow" color="#BA7517">
            {tomorrow.map(task => (
              <TaskCard key={task.id} task={task} status="upcoming" inventoryMaster={inventoryMaster}/>
            ))}
          </Section>
        )}

        {/* ── Next 7 days ── */}
        {upcoming.length > 0 && (
          <Section title="Next 7 days" color="#6b7280">
            {upcoming.map(task => (
              <TaskCard key={task.id} task={task} status="future" inventoryMaster={inventoryMaster}/>
            ))}
          </Section>
        )}

        {/* ── Empty state ── */}
        {cropCycles.filter(c => c.status === 'active').length === 0 && (
          <div className="text-center py-16 text-white/20">
            <p className="text-5xl mb-3">🌱</p>
            <p className="text-sm font-medium">No active crop cycles</p>
            <p className="text-xs mt-1 text-white/15">Start a crop cycle in the Harvest tab to see tasks here</p>
          </div>
        )}
      </div>

      <style>{`.no-scrollbar::-webkit-scrollbar{display:none;}.no-scrollbar{-ms-overflow-style:none;scrollbar-width:none;}`}</style>
    </div>
  )
}

// ── Components ────────────────────────────────────────────────────────────────

function SummaryPill({ count, label, color, dim }) {
  return (
    <div className={`shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-full border ${dim ? 'opacity-50' : ''}`}
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
        <div className="w-1.5 h-4 rounded-full" style={{ background: color }}/>
        <p className="text-xs font-bold text-white uppercase tracking-wide">{title}</p>
        {badge && <span className="text-[10px] text-white/30 ml-1">{badge}</span>}
      </div>
      <div className="space-y-2">{children}</div>
    </div>
  )
}

function TaskCard({ task, status, onDone, inventoryMaster = [] }) {
  const isDone    = status === 'done'
  const isOverdue = status === 'overdue'
  const isToday   = status === 'today'
  const color     = ACTIVITY_COLOR[task.type] || '#6b7280'

  const resolveInput = (id) => inventoryMaster.find(i => i.id === id)?.name || id

  return (
    <div className={`rounded-2xl border p-4 transition-opacity ${isDone ? 'opacity-40' : ''}`}
      style={{
        background: isDone ? 'transparent' : isOverdue ? '#3b0f0f' : isToday ? '#0f1f1a' : 'rgba(255,255,255,0.03)',
        borderColor: isDone ? 'rgba(255,255,255,0.05)' : isOverdue ? '#7f1d1d60' : isToday ? '#1D9E7530' : 'rgba(255,255,255,0.07)',
      }}>
      <div className="flex items-start gap-3">

        {/* Icon */}
        <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 text-lg"
          style={{ background: isDone ? 'rgba(255,255,255,0.05)' : color + '22' }}>
          {isDone ? '✓' : ACTIVITY_EMOJI[task.type] || '📋'}
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-0.5">
            <span className="text-xs font-bold text-white/80">{task.plotLabel}</span>
            <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded-md"
              style={{ background: color + '22', color }}>
              {task.type}
            </span>
            {isOverdue && (
              <span className="text-[9px] text-[#E24B4A] font-semibold">
                {task.daysOverdue}d overdue
              </span>
            )}
            {status === 'future' && (
              <span className="text-[9px] text-white/30">in {task.daysUntil}d</span>
            )}
          </div>
          <p className={`text-sm leading-snug ${isDone ? 'text-white/30 line-through' : 'text-white/80'}`}>
            {task.label}
          </p>
          <p className="text-[10px] text-white/30 mt-1">
            {task.cropName} · {task.acres} acres · Day {task.day}
          </p>
          {task.inputs.length > 0 && !isDone && (
            <div className="flex gap-1 mt-1.5 flex-wrap">
              {task.inputs.map(id => (
                <span key={id} className="text-[9px] px-1.5 py-0.5 bg-white/5 rounded-md text-white/40 border border-white/8">
                  📦 {resolveInput(id)}
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Done button */}
        {(isToday || isOverdue) && onDone && (
          <button onClick={onDone}
            className="shrink-0 px-3 py-2 text-xs font-bold rounded-xl border transition-colors hover:bg-[#1D9E75] hover:text-white hover:border-[#1D9E75]"
            style={{ color:'#1D9E75', borderColor:'#1D9E7540', background:'#1D9E7510' }}>
            Done
          </button>
        )}
      </div>
    </div>
  )
}

import React from 'react'
import { format, parseISO } from 'date-fns'
import { ScheduledCard } from './DayCard'

// Contents of the notification bell's panel: what was missed (overdue) and what
// is coming (tomorrow, then the next seven days). These are crop-template tasks,
// computed from the sow date — they are not stored anywhere, and they clear when
// a matching activity is actually logged.
//
// The panel supplies its own chrome, so this renders bare groups.
export default function UpcomingBlock({ overdue = [], tomorrow = [], upcoming = [], onMarkDone }) {
  if (overdue.length === 0 && tomorrow.length === 0 && upcoming.length === 0) {
    return (
      <p className="text-xs text-[var(--c-faint)] italic text-center py-6">
        Nothing due — all caught up
      </p>
    )
  }

  const upcomingByDate = new Map()
  upcoming.forEach(t => {
    const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() + t.daysUntil)
    const key = d.toISOString().slice(0, 10)
    if (!upcomingByDate.has(key)) upcomingByDate.set(key, [])
    upcomingByDate.get(key).push(t)
  })

  return (
    <div className="space-y-3">
      {overdue.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-[10px] font-semibold" style={{ color: '#E24B4A' }}>Overdue</p>
          <div className="space-y-2">
            {overdue.map(t => (
              <ScheduledCard key={t.id} task={t} status="overdue"
                onDone={onMarkDone ? () => onMarkDone(t) : undefined} />
            ))}
          </div>
        </div>
      )}

      {tomorrow.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-[10px] font-semibold text-[var(--c-muted)]">Tomorrow</p>
          <div className="space-y-2">
            {tomorrow.map(t => <ScheduledCard key={t.id} task={t} status="upcoming" />)}
          </div>
        </div>
      )}

      {[...upcomingByDate.entries()].map(([date, tasks]) => (
        <div key={date} className="space-y-1.5">
          <p className="text-[10px] font-semibold text-[var(--c-muted)]">{format(parseISO(date), 'EEE, d MMM')}</p>
          <div className="space-y-2">
            {tasks.map(t => <ScheduledCard key={t.id} task={t} status="future" />)}
          </div>
        </div>
      ))}
    </div>
  )
}

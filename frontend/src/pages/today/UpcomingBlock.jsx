import React from 'react'
import { format, parseISO } from 'date-fns'
import { ScheduledCard } from './DayCard'

// Restyled Tomorrow / Next-7-days preview — same card visual language as DayCard
// (rounded corners, colored accent, grouped-by-date) so it reads as part of the
// same flow rather than a bolted-on second UI. Purely a forward-looking preview
// of crop-template tasks; no category breakdown needed (single data source).
export default function UpcomingBlock({ tomorrow, upcoming }) {
  if (tomorrow.length === 0 && upcoming.length === 0) return null

  const upcomingByDate = new Map()
  upcoming.forEach(t => {
    const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() + t.daysUntil)
    const key = d.toISOString().slice(0, 10)
    if (!upcomingByDate.has(key)) upcomingByDate.set(key, [])
    upcomingByDate.get(key).push(t)
  })

  return (
    <div className="rounded-2xl border p-3.5 space-y-3" style={{ background: 'var(--c-card)', borderColor: 'var(--c-border)' }}>
      <div className="flex items-center gap-2">
        <div className="w-1 h-3.5 rounded-full" style={{ background: '#6b7280' }} />
        <p className="text-[10px] font-bold uppercase tracking-wide text-[var(--c-faint)]">Upcoming</p>
      </div>

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

import React, { useState, useMemo } from 'react'
import { format, parseISO } from 'date-fns'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { ScheduledCard } from './DayCard'
import {
  buildMonthGrid, monthOf, monthLabel, prevMonth, nextMonth,
  cropColorMap, groupTasksByDate, dateDots, OVERDUE_RED,
} from '../../lib/taskCalendar'

// The bell's panel: a month of scheduled crop-template tasks as coloured dots —
// one colour per crop, red for a missed date — with the tapped date's tasks
// listed underneath as the same cards the day card uses, Done button included.
// This replaced a flat Overdue/Tomorrow/Upcoming list at the owner's ask; the
// day card's Tasks Due block deliberately survives as the nag for overdue and
// today, because a calendar looks forward and one-tap Done must stay one tap.
export default function TaskCalendar({ tasks, todayStr, onMarkDone }) {
  const [ym, setYm]             = useState(monthOf(todayStr))
  const [selected, setSelected] = useState(todayStr)

  const colorMap = useMemo(() => cropColorMap(tasks.map(t => t.cropName)), [tasks])
  const byDate   = useMemo(() => groupTasksByDate(tasks), [tasks])
  const grid     = useMemo(() => buildMonthGrid(ym), [ym])

  const hasOverdue    = tasks.some(t => t.dateStr < todayStr)
  const cropsInMonth  = useMemo(() => {
    const names = new Set()
    grid.flat().forEach(c => (byDate[c.dateStr] || []).forEach(t => names.add(t.cropName)))
    return [...names].sort()
  }, [grid, byDate])

  const selectedTasks = byDate[selected] || []
  const statusFor = dateStr =>
    dateStr < todayStr ? 'overdue' : dateStr === todayStr ? 'today' : 'future'

  return (
    <div className="space-y-3">

      {/* Month header */}
      <div className="flex items-center justify-between">
        <button onClick={() => setYm(prevMonth(ym))} aria-label="Previous month"
          className="w-7 h-7 flex items-center justify-center rounded-lg text-[var(--c-muted)] hover:text-[var(--c-text)] hover:bg-[var(--c-ghost)] transition-colors">
          <ChevronLeft size={15} />
        </button>
        <p className="text-xs font-bold text-[var(--c-text)]">{monthLabel(ym)}</p>
        <button onClick={() => setYm(nextMonth(ym))} aria-label="Next month"
          className="w-7 h-7 flex items-center justify-center rounded-lg text-[var(--c-muted)] hover:text-[var(--c-text)] hover:bg-[var(--c-ghost)] transition-colors">
          <ChevronRight size={15} />
        </button>
      </div>

      {/* Weekday letters */}
      <div className="grid grid-cols-7 gap-1">
        {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d, i) => (
          <p key={i} className="text-center text-[9px] font-bold text-[var(--c-faint)]">{d}</p>
        ))}
      </div>

      {/* The grid */}
      <div className="space-y-1">
        {grid.map((week, wi) => (
          <div key={wi} className="grid grid-cols-7 gap-1">
            {week.map(cell => {
              const dots       = dateDots(byDate[cell.dateStr], cell.dateStr, todayStr, colorMap)
              // Task dates read as boxes, the way today does — the owner's ask
              // (dots alone were too quiet on a phone). The box takes the
              // date's lead colour: red for a missed date, the first crop's
              // colour otherwise. Selecting deepens the fill instead of adding
              // a second competing outline.
              const boxColor   = dots[0] || null
              const isToday    = cell.dateStr === todayStr
              const isSelected = cell.dateStr === selected
              return (
                <button key={cell.dateStr} onClick={() => setSelected(cell.dateStr)}
                  className="h-10 rounded-xl flex flex-col items-center justify-center gap-0.5 border transition-colors"
                  style={{
                    background:  boxColor ? boxColor + (isSelected ? '30' : '14')
                               : isSelected ? 'var(--c-ghost)' : 'transparent',
                    borderColor: isToday ? '#1D9E75'
                               : boxColor ? boxColor + (isSelected ? 'ff' : '55')
                               : isSelected ? 'var(--c-border-md)' : 'transparent',
                    opacity:     cell.inMonth ? 1 : 0.3,
                  }}>
                  <span className="text-[11px] font-bold leading-none"
                    style={{ color: isToday ? '#1D9E75' : boxColor || 'var(--c-sub)' }}>
                    {Number(cell.dateStr.slice(8))}
                  </span>
                  <span className="flex gap-0.5 h-1">
                    {dots.map((color, i) => (
                      <span key={i} className="w-1 h-1 rounded-full" style={{ background: color }} />
                    ))}
                  </span>
                </button>
              )
            })}
          </div>
        ))}
      </div>

      {/* Legend — only what this month actually shows */}
      {(cropsInMonth.length > 0 || hasOverdue) && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-0.5">
          {cropsInMonth.map(name => (
            <span key={name} className="flex items-center gap-1.5 text-[9px] font-semibold text-[var(--c-muted)]">
              <span className="w-1.5 h-1.5 rounded-full" style={{ background: colorMap[name] }} />
              {name}
            </span>
          ))}
          {hasOverdue && (
            <span className="flex items-center gap-1.5 text-[9px] font-semibold" style={{ color: OVERDUE_RED }}>
              <span className="w-1.5 h-1.5 rounded-full" style={{ background: OVERDUE_RED }} />
              Overdue
            </span>
          )}
        </div>
      )}

      {/* The tapped date's tasks */}
      <div className="pt-2 space-y-2" style={{ borderTop: '0.5px solid var(--c-border)' }}>
        <p className="text-[10px] font-bold uppercase tracking-wide text-[var(--c-faint)]">
          {format(parseISO(selected), 'EEEE, d MMMM')}
        </p>
        {selectedTasks.length === 0 ? (
          <p className="text-xs text-[var(--c-faint)] italic text-center py-3">Nothing scheduled</p>
        ) : (
          selectedTasks.map(t => (
            <ScheduledCard key={t.id} task={t} status={statusFor(t.dateStr)}
              onDone={onMarkDone ? () => onMarkDone(t) : undefined} />
          ))
        )}
      </div>
    </div>
  )
}

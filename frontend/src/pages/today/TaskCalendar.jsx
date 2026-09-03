import React, { useState, useMemo } from 'react'
import { format, parseISO } from 'date-fns'
import { ChevronLeft, ChevronRight, ClipboardList } from 'lucide-react'
import FilterSelect from '../../components/FilterSelect'
import { ScheduledCard, BundleSections } from './DayCard'
import {
  buildMonthGrid, monthOf, monthLabel, prevMonth, nextMonth,
  cropColorMap, groupTasksByDate, dateDots, filterByCrop, partitionTasks,
  OVERDUE_RED,
} from '../../lib/taskCalendar'

// The blue the Today board already uses for "Logged" — history, not schedule.
const RECORD_BLUE = '#3b82f6'

// The calendar behind the header's calendar button. Restructured to the owner's
// 27-Aug spec: a CROP FILTER on top of the grid, and beneath it four TABS —
//   Overdue   (default) — the nag list: everything missed plus due today, with
//               one-tap Done. This replaced the day card's Tasks Due block, so
//               losing Done here would lose it everywhere (design rule #5).
//   Recorded  — what actually happened on the tapped date, rendered from the
//               same day bundle the feed uses, with a link to open the full day.
//   Scheduled — what the crop templates put on the tapped date.
//   Upcoming  — tomorrow through one month out.
// Tapping a date selects it and jumps to Scheduled — his words: "clicking on a
// date if past date the Scheduled on that date … should open in that tab".
//
//   historyDates: Set of 'YYYY-MM-DD' that have records
//   bundleFor:    (dateStr) => day bundle, for the Recorded tab. Reads the live
//                 store slices, so recovered advances on old dates may be
//                 missing — the "Open in feed" link does the full fetch.
//   onOpenDay:    (dateStr) => void — the History filter with a one-day range
export default function TaskCalendar({ tasks, todayStr, onMarkDone, historyDates, bundleFor, onOpenDay }) {
  const [ym, setYm]             = useState(monthOf(todayStr))
  const [selected, setSelected] = useState(todayStr)
  const [crop, setCrop]         = useState('all')
  const [tab, setTab]           = useState('due')

  // Colours come from ALL tasks so a crop keeps its colour while filtered out.
  const colorMap = useMemo(() => cropColorMap(tasks.map(t => t.cropName)), [tasks])
  const cropNames = useMemo(() => [...new Set(tasks.map(t => t.cropName))].sort(), [tasks])

  const shown  = useMemo(() => filterByCrop(tasks, crop), [tasks, crop])
  const byDate = useMemo(() => groupTasksByDate(shown), [shown])
  const grid   = useMemo(() => buildMonthGrid(ym), [ym])
  const parts  = useMemo(() => partitionTasks(shown, todayStr, selected), [shown, todayStr, selected])

  const monthHasRecords = useMemo(
    () => grid.flat().some(c => c.inMonth && historyDates?.has(c.dateStr)),
    [grid, historyDates])
  const hasOverdue = shown.some(t => t.dateStr < todayStr)

  const selectedHasRecord = !!historyDates?.has(selected)
  const selectedBundle    = useMemo(
    () => (tab === 'recorded' && bundleFor ? bundleFor(selected) : null),
    [tab, bundleFor, selected])

  const statusFor = dateStr =>
    dateStr < todayStr ? 'overdue' : dateStr === todayStr ? 'today' : 'future'

  const pickDate = (dateStr) => {
    setSelected(dateStr)
    setTab('scheduled')
  }

  const TABS = [
    ['due',       `Overdue${parts.due.length ? ` (${parts.due.length})` : ''}`],
    ['recorded',  'Recorded'],
    ['scheduled', 'Scheduled'],
    ['upcoming',  'Upcoming'],
  ]
  // Recorded and Scheduled describe the tapped date; the other two ignore it.
  const dateLine = format(parseISO(selected), 'EEEE, d MMMM')

  return (
    <div className="space-y-3">

      {/* Crop filter — on top of the grid, not a legend row at the bottom */}
      {cropNames.length > 1 && (
        <FilterSelect value={crop} onChange={setCrop} title="Crop"
          options={[['all', 'All crops'], ...cropNames.map(n => [n, n])]} />
      )}

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
          <p key={i} className="text-center text-[11px] font-bold text-[var(--c-faint)]">{d}</p>
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
              const hasRecord  = !!historyDates?.has(cell.dateStr)
              return (
                <button key={cell.dateStr} onClick={() => pickDate(cell.dateStr)}
                  className="relative h-10 rounded-xl flex flex-col items-center justify-center gap-0.5 border transition-colors"
                  style={{
                    background:  boxColor ? boxColor + (isSelected ? '30' : '14')
                               : isSelected ? 'var(--c-ghost)' : 'transparent',
                    borderColor: isToday ? '#8A9A5B'
                               : boxColor ? boxColor + (isSelected ? 'ff' : '55')
                               : isSelected ? 'var(--c-border-md)' : 'transparent',
                    opacity:     cell.inMonth ? 1 : 0.3,
                  }}>
                  {/* A day with something recorded gets a corner dot in the
                      Logged blue. It sits in the corner, not under the number:
                      most past dates carry BOTH a task and a record, and an
                      underline landed on top of the task dot. */}
                  {hasRecord && (
                    <span className="absolute top-1 right-1 w-1.5 h-1.5 rounded-full"
                      style={{ background: RECORD_BLUE }} />
                  )}
                  <span className="text-[13px] font-bold leading-none"
                    style={{ color: isToday ? '#8A9A5B' : boxColor || 'var(--c-sub)' }}>
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

      {/* Legend — what the dot colours MEAN. The crop filter above is the
          control; this only explains the grid, and only for what it shows. */}
      {(monthHasRecords || hasOverdue) && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-0.5">
          {monthHasRecords && (
            <span className="flex items-center gap-1.5 text-[11px] font-semibold" style={{ color: RECORD_BLUE }}>
              <span className="w-1.5 h-1.5 rounded-full" style={{ background: RECORD_BLUE }} />
              Recorded
            </span>
          )}
          {cropNames.map(name => (crop === 'all' || crop === name) && (
            <span key={name} className="flex items-center gap-1.5 text-[11px] font-semibold text-[var(--c-muted)]">
              <span className="w-1.5 h-1.5 rounded-full" style={{ background: colorMap[name] }} />
              {name}
            </span>
          ))}
          {hasOverdue && (
            <span className="flex items-center gap-1.5 text-[11px] font-semibold" style={{ color: OVERDUE_RED }}>
              <span className="w-1.5 h-1.5 rounded-full" style={{ background: OVERDUE_RED }} />
              Overdue
            </span>
          )}
        </div>
      )}

      {/* The four tabs */}
      <div className="flex gap-1 pt-2" style={{ borderTop: '0.5px solid var(--c-border)' }}>
        {TABS.map(([key, label]) => (
          <button key={key} onClick={() => setTab(key)}
            className="flex-1 py-1.5 rounded-lg text-[12px] font-bold transition-colors"
            style={tab === key
              ? { background: '#8A9A5B', color: '#fff' }
              : { background: 'var(--c-ghost)', color: 'var(--c-muted)' }}>
            {label}
          </button>
        ))}
      </div>

      <div className="space-y-2">
        {(tab === 'recorded' || tab === 'scheduled') && (
          <p className="text-[12px] font-bold uppercase tracking-wide text-[var(--c-faint)]">{dateLine}</p>
        )}

        {tab === 'due' && (
          parts.due.length === 0
            ? <p className="text-xs text-[var(--c-faint)] italic text-center py-3">Nothing overdue — all caught up</p>
            : parts.due.map(t => (
                <ScheduledCard key={t.id} task={t} status={statusFor(t.dateStr)}
                  onDone={onMarkDone ? () => onMarkDone(t) : undefined} />
              ))
        )}

        {tab === 'recorded' && (
          selectedHasRecord && selectedBundle && !selectedBundle.isEmpty ? (
            <>
              <BundleSections bundle={selectedBundle} />
              {onOpenDay && (
                <button onClick={() => onOpenDay(selected)}
                  className="w-full py-2 rounded-xl border text-xs font-semibold flex items-center justify-center gap-1.5"
                  style={{ background: `${RECORD_BLUE}14`, borderColor: `${RECORD_BLUE}55`, color: RECORD_BLUE }}>
                  <ClipboardList size={13} /> Open this day in the feed <span aria-hidden>→</span>
                </button>
              )}
            </>
          ) : (
            <p className="text-xs text-[var(--c-faint)] italic text-center py-3">Nothing recorded on this date</p>
          )
        )}

        {tab === 'scheduled' && (
          parts.scheduled.length === 0
            ? <p className="text-xs text-[var(--c-faint)] italic text-center py-3">Nothing scheduled on this date</p>
            : parts.scheduled.map(t => (
                <ScheduledCard key={t.id} task={t} status={statusFor(t.dateStr)}
                  onDone={onMarkDone ? () => onMarkDone(t) : undefined} />
              ))
        )}

        {tab === 'upcoming' && (
          parts.upcoming.length === 0
            ? <p className="text-xs text-[var(--c-faint)] italic text-center py-3">Nothing scheduled in the next month</p>
            : parts.upcoming.map(t => (
                <ScheduledCard key={t.id} task={t} status="future" />
              ))
        )}
      </div>
    </div>
  )
}

import React, { useState } from 'react'
import { format, parseISO } from 'date-fns'
import { ACT_EMOJI, ACT_COLOR } from './dayBundle'

const ROW_CAP = 5

// ── Scheduled crop-template task card (moved here unchanged — only DayCard's
//    "Tasks Due" category and UpcomingBlock use it now) ────────────────────────
export function ScheduledCard({ task, status, onDone }) {
  const isDone    = status === 'done'
  const isOverdue = status === 'overdue'
  const isToday   = status === 'today'
  const color     = ACT_COLOR[task.type] || '#6b7280'
  return (
    <div className={`rounded-2xl border p-3.5 transition-opacity ${isDone ? 'opacity-35' : ''}`}
      style={{
        background:  isDone ? 'transparent' : isOverdue ? 'var(--c-card-danger)' : isToday ? 'var(--c-card-success)' : 'var(--c-card)',
        borderColor: isDone ? 'var(--c-card)' : isOverdue ? '#7f1d1d60' : isToday ? '#1D9E7530' : 'var(--c-border)',
      }}>
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0 text-base"
          style={{ background: isDone ? 'var(--c-card)' : color + '22' }}>
          {isDone ? '✓' : ACT_EMOJI[task.type] || '📋'}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-bold text-[var(--c-text-80)]">{task.plotLabel}</span>
            <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded-md"
              style={{ background: color + '22', color }}>
              {task.label || task.type}
            </span>
            {isOverdue && (
              <span className="text-[9px] text-[#E24B4A] font-semibold">{task.daysOverdue}d overdue</span>
            )}
            {status === 'future' && (
              <span className="text-[9px] text-[var(--c-faint)]">in {task.daysUntil}d</span>
            )}
          </div>
          <p className={`text-sm leading-snug mt-0.5 ${isDone ? 'text-[var(--c-faint)] line-through' : 'text-[var(--c-text-80)]'}`}>
            {task.label}
          </p>
          <p className="text-[10px] text-[var(--c-faint)] mt-0.5">{task.cropName} · Day {task.day}</p>
        </div>
        {(isToday || isOverdue) && onDone && (
          <button onClick={onDone}
            className="shrink-0 px-3 py-1.5 text-xs font-bold rounded-xl border transition-colors hover:bg-[#1D9E75] hover:text-[var(--c-text)] hover:border-[#1D9E75]"
            style={{ color: '#1D9E75', borderColor: '#1D9E7540', background: '#1D9E7510' }}>
            Done
          </button>
        )}
      </div>
    </div>
  )
}

// ── Generic category block: colored accent + label, rows capped with "+N more" ─
function CategoryBlock({ label, color, children, count }) {
  return (
    <div>
      <div className="flex items-center gap-2 mb-1.5">
        <div className="w-1 h-3.5 rounded-full" style={{ background: color }} />
        <p className="text-[10px] font-bold uppercase tracking-wide" style={{ color }}>{label}</p>
        {count > 0 && <span className="text-[9px] text-[var(--c-faint)]">({count})</span>}
      </div>
      <div className="space-y-1.5">{children}</div>
    </div>
  )
}

function Row({ icon, iconBg, title, detail, right, rightColor }) {
  return (
    <div className="flex items-center gap-2.5 py-1">
      <div className="w-6 h-6 rounded-lg flex items-center justify-center text-xs shrink-0" style={{ background: iconBg }}>
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-[12px] font-semibold text-[var(--c-text-80)] truncate">{title}</p>
        {detail && <p className="text-[10px] text-[var(--c-muted)] truncate">{detail}</p>}
      </div>
      {right != null && (
        <span className="text-[12px] font-bold shrink-0" style={{ color: rightColor || 'var(--c-text-80)' }}>{right}</span>
      )}
    </div>
  )
}

// Caps a list at ROW_CAP with a "+N more" expand-in-place toggle
function useCappedList(items) {
  const [expanded, setExpanded] = useState(false)
  const visible = expanded ? items : items.slice(0, ROW_CAP)
  const hidden  = items.length - visible.length
  return { visible, hidden, expanded, toggle: () => setExpanded(e => !e) }
}

function MoreToggle({ hidden, expanded, onToggle }) {
  if (hidden <= 0 && !expanded) return null
  return (
    <button onClick={onToggle} className="text-[10px] font-semibold text-[var(--c-muted)] hover:text-[var(--c-text)] pt-0.5">
      {expanded ? 'Show less' : `+${hidden} more`}
    </button>
  )
}

function FarmActivitySection({ rows }) {
  const { visible, hidden, expanded, toggle } = useCappedList(rows)
  if (rows.length === 0) return null
  return (
    <CategoryBlock label="Farm Activity" color="#1D9E75" count={rows.length}>
      {visible.map(r => (
        <Row key={r.type}
          icon={r.emoji} iconBg={r.color + '22'}
          title={`${r.label} — Plots ${r.plotLabels.join(', ')}`}
          detail={r.notes.length > 0 ? r.notes.join('; ') : null}
          right={(r.namedWorkerCount || r.outsideWorkerCount)
            ? `👥${r.namedWorkerCount} 👷${r.outsideWorkerCount}` : null}
        />
      ))}
      <MoreToggle hidden={hidden} expanded={expanded} onToggle={toggle} />
    </CategoryBlock>
  )
}

function InventorySection({ inventory }) {
  const all = [
    ...inventory.purchases.map(p => ({ ...p, kind: 'purchase' })),
    ...inventory.issues.map(i => ({ ...i, kind: 'issue' })),
  ]
  const { visible, hidden, expanded, toggle } = useCappedList(all)
  if (all.length === 0) return null
  return (
    <CategoryBlock label="Inventory" color="#3b82f6" count={all.length}>
      {visible.map((r, idx) => r.kind === 'purchase' ? (
        <Row key={`p-${idx}`} icon="🛒" iconBg="#3b82f622"
          title={`Purchased ${r.qty} ${r.itemName}`} detail={r.vendor}
          right={`₹${r.totalCost.toLocaleString('en-IN')}`} />
      ) : (
        <Row key={`i-${idx}`} icon="📤" iconBg="#3b82f622"
          title={`Issued ${r.qty} ${r.itemName} → ${r.plotLabel}`} detail={r.purpose}
          right={`₹${r.totalCost.toLocaleString('en-IN')}`} />
      ))}
      <MoreToggle hidden={hidden} expanded={expanded} onToggle={toggle} />
    </CategoryBlock>
  )
}

function HarvestSalesSection({ rows }) {
  const { visible, hidden, expanded, toggle } = useCappedList(rows)
  if (rows.length === 0) return null
  return (
    <CategoryBlock label="Harvest & Sales" color="#eab308" count={rows.length}>
      {visible.map((r, idx) => {
        if (r.kind === 'harvest') return (
          <Row key={idx} icon="🌾" iconBg="#eab30822"
            title={`Harvested ${r.qtyQtl} Qtl — ${r.plotLabel}`} detail={r.cropName} />
        )
        if (r.kind === 'sale') return (
          <Row key={idx} icon="💰" iconBg="#eab30822"
            title={`Sold — ${r.plotLabel}${r.cropName ? ` (${r.cropName})` : ''}`} detail={r.buyerName}
            right={`₹${r.amount.toLocaleString('en-IN')}`} rightColor="#1D9E75" />
        )
        return (
          <Row key={idx} icon="♻️" iconBg="#eab30822"
            title={`${r.productName || 'By-product'} sold — ${r.plotLabel}`} detail={r.buyerName}
            right={r.amount ? `₹${r.amount.toLocaleString('en-IN')}` : null} rightColor="#1D9E75" />
        )
      })}
      <MoreToggle hidden={hidden} expanded={expanded} onToggle={toggle} />
    </CategoryBlock>
  )
}

function LivestockSection({ rows }) {
  const { visible, hidden, expanded, toggle } = useCappedList(rows)
  if (rows.length === 0) return null
  return (
    <CategoryBlock label="Livestock" color="#a855f7" count={rows.length}>
      {visible.map((r, idx) => r.kind === 'count' ? (
        <Row key={idx} icon="🐄" iconBg="#a855f722"
          title={`${r.animalName} — ${r.changeType} ${r.quantity}`} detail={r.reason} />
      ) : (
        <Row key={idx} icon={r.isSale ? '💰' : '🥛'} iconBg="#a855f722"
          title={`${r.revenueType}${r.animalName ? ` — ${r.animalName}` : ''}`} detail={r.buyerName}
          right={`₹${r.amount.toLocaleString('en-IN')}`} rightColor="#1D9E75" />
      ))}
      <MoreToggle hidden={hidden} expanded={expanded} onToggle={toggle} />
    </CategoryBlock>
  )
}

function ExpensePayrollSection({ rows }) {
  const { visible, hidden, expanded, toggle } = useCappedList(rows)
  if (rows.length === 0) return null
  const ICONS = { expense: '💸', salary: '💵', advance: '🏦', labour: '👷' }
  return (
    <CategoryBlock label="Expenses & Payroll" color="#f59e0b" count={rows.length}>
      {visible.map((r, idx) => {
        const title =
          r.kind === 'expense' ? (r.description || r.category) :
          r.kind === 'salary'  ? `Salary paid — ${r.workerName}` :
          r.kind === 'advance' ? `Advance — ${r.workerName}` :
          `Contractual labour — ${r.workerName}`
        const detail =
          r.kind === 'expense' ? r.category :
          r.kind === 'labour'  ? [r.plotLabel, r.purpose].filter(Boolean).join(' · ') :
          r.reason || null
        return (
          <Row key={idx} icon={ICONS[r.kind]} iconBg="#f59e0b22"
            title={title} detail={detail}
            right={r.amount ? `₹${r.amount.toLocaleString('en-IN')}` : null} />
        )
      })}
      <MoreToggle hidden={hidden} expanded={expanded} onToggle={toggle} />
    </CategoryBlock>
  )
}

function MediaSection({ media }) {
  if (media.count === 0) return null
  const parts = []
  if (media.photoCount > 0) parts.push(`${media.photoCount} photo${media.photoCount > 1 ? 's' : ''}`)
  if (media.videoCount > 0) parts.push(`${media.videoCount} video${media.videoCount > 1 ? 's' : ''}`)
  return (
    <CategoryBlock label="Media" color="#6b7280">
      <Row icon="📷" iconBg="#6b728022" title={parts.join(', ')}
        detail={media.plotLabels.length > 0 ? media.plotLabels.join(', ') : null} />
    </CategoryBlock>
  )
}

function TasksDueSection({ tasksDue, onMarkDone }) {
  if (!tasksDue) return null
  const { overdue = [], today = [], done = [] } = tasksDue
  if (overdue.length === 0 && today.length === 0 && done.length === 0) return null
  return (
    <CategoryBlock label="Tasks Due" color="#BA7517" count={overdue.length + today.length}>
      {overdue.map(t => <ScheduledCard key={t.id} task={t} status="overdue" onDone={() => onMarkDone(t)} />)}
      {today.map(t   => <ScheduledCard key={t.id} task={t} status="today"   onDone={() => onMarkDone(t)} />)}
      {done.map(t    => <ScheduledCard key={t.id} task={t} status="done" />)}
    </CategoryBlock>
  )
}

// ── The shared day card — renders identically for "today" and every History day ─
export default function DayCard({ date, isToday, bundle, tasksDue, onMarkDone }) {
  const tasksDueCount = tasksDue ? (tasksDue.overdue?.length || 0) + (tasksDue.today?.length || 0) + (tasksDue.done?.length || 0) : 0
  return (
    <div className="rounded-2xl border p-3.5 space-y-3.5" style={{ background: 'var(--c-card)', borderColor: 'var(--c-border)' }}>
      <div className="flex items-center gap-2">
        <p className="text-sm font-bold text-[var(--c-text)]">{format(parseISO(date), 'EEEE, d MMMM')}</p>
        {isToday && (
          <span className="text-[9px] font-bold px-2 py-0.5 rounded-full" style={{ background: '#1D9E7520', color: '#1D9E75' }}>
            Today
          </span>
        )}
      </div>

      <TasksDueSection tasksDue={tasksDue} onMarkDone={onMarkDone} />
      <FarmActivitySection rows={bundle.farmActivity} />
      <HarvestSalesSection rows={bundle.harvestSales} />
      <InventorySection inventory={bundle.inventory} />
      <LivestockSection rows={bundle.livestock} />
      <ExpensePayrollSection rows={bundle.expensesPayroll} />
      <MediaSection media={bundle.media} />

      {bundle.isEmpty && tasksDueCount === 0 && (
        <p className="text-xs text-[var(--c-faint)] italic text-center py-2">No activity recorded</p>
      )}
    </div>
  )
}

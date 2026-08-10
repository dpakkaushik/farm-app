import React, { useMemo, useState } from 'react'
import { ChevronRight, ChevronDown } from 'lucide-react'
import { buildCashFlow } from '../../lib/cashflow'

// Cash Flow — the Cash Book's rupees regrouped into where they came from and
// where they went. Presentation only: every number here comes from
// buildCashFlow, so the screen and the Excel sheet cannot disagree.
//
// Design: docs/superpowers/specs/2026-08-10-cash-flow-statement-design.md

const fmt = (n) =>
  '₹' + Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })

const fmtDate = (d) => {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: '2-digit' })
}

const amountColour = (n) =>
  n > 0 ? '#1D9E75' : n < 0 ? '#E24B4A' : 'var(--c-faint)'

// A signed amount, with the minus sign inside the rupee formatting rather than
// bolted on front of it.
const Amount = ({ value, bold = false }) => (
  <span
    className={bold ? 'text-xs font-bold tabular-nums' : 'text-xs tabular-nums'}
    style={{ color: amountColour(value) }}>
    {value < 0 ? `−${fmt(Math.abs(value))}` : fmt(value)}
  </span>
)

// ── One line, and the entries behind it ───────────────────────────────────────
function Line({ line }) {
  const [open, setOpen] = useState(false)
  const hasEntries = line.entries.length > 0

  return (
    <div style={{ borderBottom: '0.5px solid var(--c-border)' }}>
      <button
        onClick={() => hasEntries && setOpen(o => !o)}
        disabled={!hasEntries}
        className="w-full flex items-center justify-between gap-2 py-2 text-left">
        <span className="flex items-center gap-1 min-w-0">
          <span className="text-xs truncate" style={{ color: 'var(--c-text)' }}>{line.label}</span>
          {hasEntries && (
            <span className="text-[9px] shrink-0" style={{ color: 'var(--c-faint)' }}>
              ({line.entries.length})
            </span>
          )}
        </span>
        <span className="flex items-center gap-1 shrink-0">
          <Amount value={line.amount} />
          {hasEntries
            ? (open ? <ChevronDown size={12} color="var(--c-faint)" /> : <ChevronRight size={12} color="var(--c-faint)" />)
            : <span style={{ width: 12 }} />}
        </span>
      </button>

      {open && (
        <div className="pb-2 pl-2 flex flex-col gap-1">
          {line.entries.map(e => (
            <div key={e.id} className="flex items-start justify-between gap-2 py-1 px-2 rounded-lg"
              style={{ background: 'var(--c-ghost)' }}>
              <span className="min-w-0">
                <span className="block text-[10px] truncate" style={{ color: 'var(--c-text)' }}>
                  {e.particulars || e.notes || e.entry_type}
                </span>
                <span className="block text-[9px]" style={{ color: 'var(--c-faint)' }}>
                  {fmtDate(e.entry_date)}{e.account_name ? ` · ${e.account_name}` : ''}
                </span>
              </span>
              <span className="text-[10px] tabular-nums shrink-0"
                style={{ color: e.direction === 'in' ? '#1D9E75' : '#E24B4A' }}>
                {e.direction === 'in' ? fmt(e.amount) : `−${fmt(e.amount)}`}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── The capital-cash explanation ──────────────────────────────────────────────
// A payment settles the vendor, not the individual bill, so capital cash cannot
// be separated from operating cash. Rather than show a blank Investing section
// or invent a split, the screen explains itself and shows the bills figure as a
// memo — labelled as memo, excluded from every total.
function CapitalMemo({ memo }) {
  return (
    <div className="mt-2 flex flex-col gap-2">
      <p className="text-[10px] leading-relaxed" style={{ color: 'var(--c-faint)' }}>
        No capital cash can be shown separately — a payment settles the vendor, not the
        individual bill.
      </p>

      {memo.capitalBilled > 0 && (
        <div className="rounded-xl p-2.5"
          style={{ background: 'var(--c-ghost)', border: '0.5px dashed var(--c-border-md)' }}>
          <div className="text-[9px] uppercase tracking-wider mb-1.5" style={{ color: 'var(--c-faint)' }}>
            memo — not cash
          </div>
          <div className="flex items-center justify-between">
            <span className="text-[11px]" style={{ color: 'var(--c-text)' }}>Capital items billed</span>
            <span className="text-[11px] font-semibold tabular-nums" style={{ color: 'var(--c-text)' }}>
              {fmt(memo.capitalBilled)}
            </span>
          </div>
          {memo.items.slice(0, 6).map((it, i) => (
            <div key={i} className="flex items-center justify-between pt-1">
              <span className="text-[9px] truncate" style={{ color: 'var(--c-faint)' }}>
                {it.name || 'Capital item'}
              </span>
              <span className="text-[9px] tabular-nums" style={{ color: 'var(--c-faint)' }}>
                {fmt(it.amount)}
              </span>
            </div>
          ))}
          <p className="text-[9px] leading-relaxed pt-1.5" style={{ color: 'var(--c-faint)' }}>
            That cash sits inside “Paid to vendors” above.
          </p>
        </div>
      )}
    </div>
  )
}

// ── A section ─────────────────────────────────────────────────────────────────
function Section({ section, children }) {
  return (
    <div className="rounded-2xl p-3.5"
      style={{ background: 'var(--c-card)', border: '0.5px solid var(--c-border)' }}>
      <div className="flex items-baseline justify-between mb-1.5">
        <span className="text-[11px] font-bold uppercase tracking-wider" style={{ color: 'var(--c-text)' }}>
          {section.heading}
        </span>
        <span className="text-[9px]" style={{ color: 'var(--c-faint)' }}>{section.plain}</span>
      </div>

      {section.lines.map(l => <Line key={l.key} line={l} />)}

      {children}

      <div className="flex items-center justify-between pt-2.5">
        <span className="text-[11px] font-semibold" style={{ color: 'var(--c-muted)' }}>
          {section.subtotalLabel}
        </span>
        <Amount value={section.subtotal} bold />
      </div>
    </div>
  )
}

// ── Opening / closing band ────────────────────────────────────────────────────
function Band({ label, value, sub, children }) {
  return (
    <div className="rounded-2xl px-3.5 py-3"
      style={{ background: 'var(--c-ghost)', border: '0.5px solid var(--c-border)' }}>
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-semibold" style={{ color: 'var(--c-text)' }}>{label}</span>
        <span className="text-sm font-bold tabular-nums" style={{ color: 'var(--c-text)' }}>{fmt(value)}</span>
      </div>
      {sub && <p className="text-[9px] leading-relaxed pt-1" style={{ color: 'var(--c-faint)' }}>{sub}</p>}
      {children}
    </div>
  )
}

export default function CashFlowTab({
  cashBook = [],
  openingBalance = 0,
  capitalPurchases = [],
  periodLabel = '',
}) {
  const flow = useMemo(
    () => buildCashFlow(cashBook, { openingCash: openingBalance, capitalPurchases }),
    [cashBook, openingBalance, capitalPurchases],
  )

  const noOpening = flow.openingCash === 0

  return (
    <div className="flex flex-col gap-3 pt-3">
      <div>
        <div className="text-xs font-semibold" style={{ color: 'var(--c-text)' }}>
          Cash Flow{periodLabel ? ` — ${periodLabel}` : ''}
        </div>
        <div className="text-[10px]" style={{ color: 'var(--c-faint)' }}>
          Where the farm's cash came from, and where it went
        </div>
      </div>

      <Band
        label="Opening cash (all pockets)"
        value={flow.openingCash}
        sub={noOpening
          ? 'No opening balance set — the accounts open at zero, pending the go-live pass.'
          : null}
      />

      {flow.sections.map(s => (
        <Section key={s.key} section={s}>
          {s.key === 'investing' && <CapitalMemo memo={flow.memo} />}
          {s.key === 'unclassified' && (
            <p className="text-[10px] leading-relaxed pt-2" style={{ color: '#BA7517' }}>
              These entry types aren't in the classification table yet, so they are shown
              on their own rather than folded into a total that would then be wrong.
            </p>
          )}
        </Section>
      ))}

      <Band label="Closing cash (all pockets)" value={flow.closingCash}>
        <div className="flex items-center gap-1 pt-1.5">
          {flow.reconciles ? (
            <span className="text-[9px] font-semibold" style={{ color: '#1D9E75' }}>
              ✓ matches Cash Book
            </span>
          ) : (
            <span className="text-[9px] font-semibold" style={{ color: '#E24B4A' }}>
              ✕ does not match Cash Book — out by {fmt(Math.abs(flow.discrepancy))}
            </span>
          )}
        </div>
      </Band>

      <p className="text-[9px] leading-relaxed px-1 pb-2" style={{ color: 'var(--c-faint)' }}>
        Money moved between your own accounts is left out — it changes no farm total.
        Amounts are cash actually received or paid, not what has been billed.
      </p>
    </div>
  )
}

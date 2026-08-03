// Livestock money, scoped to the group on screen.
//
// Revenue and Expenses are two tabs of their own now, not one Finance tab with a
// toggle inside it, so this renders one side at a time — `mode` says which. What
// it deliberately does not split is the summary strip: Expenses / Revenue / Net
// stays on both sides. Net is the number that answers "is this flock paying for
// itself", and pulling the two lists apart would otherwise have been the thing
// that hid it.
//
// Two treatments, because two questions. A herd and a flock earn: milk, eggs,
// meat, the animal itself — so they get expenses against revenue and a per-animal
// verdict on which one is paying for itself. A pet only ever costs, so it gets a
// spend list and a total, no revenue button and no profit column that could only
// ever read as a loss.
//
// Shared spend — a feed bill or a vet call with no single animal against it — is
// shown in BOTH earning faces rather than hidden in one, because a poultry-only
// farm would otherwise never see its own feed bills. It is labelled Shared
// wherever it appears, with a footnote, so the two faces are never added together.
import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus, Trash2 } from 'lucide-react'
import { useAppStore } from '../../store'
import Attachment from '../../components/Attachment'
import { RevenueModal } from './modals'
import {
  DOCS, EXPENSE_CATS, REVENUE_TYPES, animalLabel, costToDate, isPet, fmt, fmtK,
} from './ui'

const catInfo = cat  => EXPENSE_CATS.find(([v]) => v === cat)   || ['other', '📦', cat]
const revInfo = type => REVENUE_TYPES.find(([v]) => v === type) || ['other', '📦', type]

function SharedChip() {
  return (
    <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full"
      style={{ background: '#BA751718', color: '#BA7517' }}>SHARED</span>
  )
}

function Row({ emoji, title, sub, amount, color, date, chip, attachment, onDelete }) {
  return (
    <div className="p-4 rounded-2xl border" style={{ background: 'var(--c-nav)', borderColor: 'var(--c-border)' }}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-xl shrink-0">{emoji}</span>
          <div className="min-w-0">
            <p className="text-sm font-semibold truncate" style={{ color: 'var(--c-text)' }}>
              {title}{chip ? <span className="ml-1">{chip}</span> : null}
            </p>
            <p className="text-[10px]" style={{ color: 'var(--c-muted)' }}>{sub}</p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <div className="text-right">
            <p className="text-sm font-bold" style={{ color }}>{fmt(amount)}</p>
            <p className="text-[10px]" style={{ color: 'var(--c-muted)' }}>{date}</p>
          </div>
          {onDelete && (
            <button onClick={onDelete} className="p-1" style={{ color: 'var(--c-muted)' }}>
              <Trash2 size={13} />
            </button>
          )}
        </div>
      </div>
      {attachment && (
        <div className="mt-1.5">
          <Attachment variant="chip" value={attachment} bucket={DOCS} name="View receipt" />
        </div>
      )}
    </div>
  )
}

export default function FinanceTab({ animals, face, mode }) {
  const { farmExpenses, livestockRevenue, deleteLivestockRevenue } = useAppStore(s => ({
    farmExpenses:           s.farmExpenses,
    livestockRevenue:       s.livestockRevenue,
    deleteLivestockRevenue: s.deleteLivestockRevenue,
  }))
  const navigate                      = useNavigate()
  const [showRevenue, setShowRevenue] = useState(false)

  const ids       = new Set(animals.map(a => a.id))
  const mine      = r => ids.has(r.livestockId)
  const shared    = r => !r.livestockId
  const spendOnly = face.money === 'costs'

  // A pet's costs are exactly what was tagged to that pet. Shared farm spend is
  // not attributed to pets, so it stays out of this face entirely.
  const livestockExpenses = farmExpenses
    .filter(e => e.attributedTo === 'livestock')
    .filter(e => spendOnly ? mine(e) : (mine(e) || shared(e)))
  const revenue = spendOnly ? [] : livestockRevenue.filter(r => mine(r) || shared(r))

  const totalExpenses = livestockExpenses.reduce((s, e) => s + e.amount, 0)
  const totalRevenue  = revenue.reduce((s, r) => s + r.amount, 0)
  const net           = totalRevenue - totalExpenses

  // Pets never appear here even inside their own group — they have no revenue
  // side. Their spend is the list below instead.
  const earners = spendOnly ? [] : animals.filter(a => !isPet(a))
  const name    = id => animalLabel(animals.find(a => a.id === id))

  async function confirmDeleteRevenue(id) {
    if (!confirm('Delete this revenue entry?')) return
    try { await deleteLivestockRevenue(id) } catch (e) { alert(e.message) }
  }

  const expenseRows = livestockExpenses.length === 0
    ? <p className="text-center text-sm py-6" style={{ color: 'var(--c-muted)' }}>No {spendOnly ? 'pet' : 'livestock'} spend recorded</p>
    : livestockExpenses.map(e => {
        const [, emoji, label] = catInfo(e.category)
        const animal = name(e.livestockId)
        return (
          <Row key={e.id} emoji={emoji} title={e.description}
            sub={`${label}${animal ? ` · ${animal}` : ''}`}
            chip={!e.livestockId && !spendOnly ? <SharedChip /> : null}
            amount={e.amount} color="#E24B4A" date={e.expenseDate}
            attachment={e.attachmentPath} />
        )
      })

  return (
    <div className="space-y-3 pb-4">
      {/* Summary — one number for a pet, three for anything that earns */}
      {spendOnly ? (
        <div className="p-4 rounded-2xl border text-center" style={{ background: 'var(--c-nav)', borderColor: 'var(--c-border)' }}>
          <p className="text-[10px] uppercase tracking-widest font-bold" style={{ color: 'var(--c-muted)' }}>Total pet spend</p>
          <p className="text-2xl font-bold mt-1" style={{ color: '#E24B4A' }}>{fmt(totalExpenses)}</p>
          <p className="text-[10px] mt-1" style={{ color: 'var(--c-faint)' }}>
            Food, vet, medicine and accessories tagged to a pet
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-2">
          {[
            { label: 'Expenses', value: fmtK(totalExpenses), color: '#E24B4A' },
            { label: 'Revenue',  value: fmtK(totalRevenue),  color: '#1D9E75' },
            { label: 'Net',      value: fmtK(Math.abs(net)), color: net >= 0 ? '#1D9E75' : '#E24B4A' },
          ].map(({ label, value, color }) => (
            <div key={label} className="p-3 rounded-2xl border text-center"
              style={{ background: 'var(--c-nav)', borderColor: 'var(--c-border)' }}>
              <p className="text-[10px]" style={{ color: 'var(--c-muted)' }}>{label}</p>
              <p className="text-sm font-bold mt-0.5" style={{ color }}>{value}</p>
            </div>
          ))}
        </div>
      )}

      {/* Per pet — the whole point of the Costs face: what each one is costing */}
      {spendOnly && animals.length > 0 && (
        <div className="rounded-2xl border overflow-hidden" style={{ background: 'var(--c-nav)', borderColor: 'var(--c-border)' }}>
          <p className="px-4 py-2 text-[10px] font-bold uppercase tracking-widest"
            style={{ color: 'var(--c-muted)', background: 'var(--c-ghost)' }}>{face.perTitle}</p>
          <div className="divide-y divide-[var(--c-border)]">
            {animals.map(a => (
              <div key={a.id} className="flex items-center justify-between px-4 py-2.5 gap-2">
                <div className="min-w-0">
                  <p className="text-sm font-semibold truncate" style={{ color: 'var(--c-text)' }}>{animalLabel(a)}</p>
                  <p className="text-[10px]" style={{ color: 'var(--c-muted)' }}>
                    {a.purchasePrice ? `Bought ${fmtK(a.purchasePrice)} · ` : ''}since joining the farm
                  </p>
                </div>
                <p className="text-sm font-bold shrink-0" style={{ color: '#E24B4A' }}>
                  {fmtK(costToDate(a, farmExpenses))}
                </p>
              </div>
            ))}
          </div>
          <p className="px-4 py-2 text-[9px] leading-relaxed" style={{ color: 'var(--c-faint)' }}>
            Spend only — a pet earns nothing, so there is no profit line to draw.
            Shared farm spend is not charged to a pet. If a pet was ever sold, that
            money is in the ledger under livestock income, not here.
          </p>
        </div>
      )}

      {/* Expenses — read-only, add goes to Today → Expenses */}
      {mode === 'expenses' && (
        <>
          {/* This was a line of text naming where to go — "Resources →
              Expenses" — and not a link, because that tab lived in local state
              and had no route. Expenses is on Today now, with its tab in the
              URL, so this can finally be the way there instead of directions. */}
          <button onClick={() => navigate('/today?tab=expenses')}
            className="w-full py-2.5 rounded-xl text-sm font-semibold flex items-center justify-center gap-2 border"
            style={{ borderColor: '#E24B4A', color: '#E24B4A', background: 'transparent' }}>
            <Plus size={15} /> Add Expense
          </button>
          <p className="text-[10px] text-center px-4" style={{ color: 'var(--c-muted)' }}>
            {spendOnly
              ? 'Opens Today → Expenses. Tag the spend to the pet and it lands here.'
              : `Showing ${face.title.toLowerCase()} spend and shared livestock spend`}
          </p>
          {expenseRows}
        </>
      )}

      {/* Revenue — add button here */}
      {mode === 'revenue' && !spendOnly && (
        <>
          <button onClick={() => setShowRevenue(true)}
            className="w-full py-2.5 rounded-xl text-sm font-semibold flex items-center justify-center gap-2 border"
            style={{ borderColor: '#1D9E75', color: '#1D9E75', background: 'transparent' }}>
            <Plus size={15} /> Add Revenue
          </button>

          {revenue.length === 0 ? (
            <p className="text-center text-sm py-6" style={{ color: 'var(--c-muted)' }}>No revenue recorded</p>
          ) : (
            revenue.map(r => {
              const [, emoji, label] = revInfo(r.revenueType)
              const animal = name(r.livestockId)
              return (
                <Row key={r.id} emoji={emoji}
                  title={<>{label}{r.isSale && (
                    <span className="ml-1 text-[9px] px-1.5 py-0.5 rounded-full font-bold"
                      style={{ background: '#88888820', color: '#888' }}>SALE</span>
                  )}</>}
                  sub={`${animal || 'Shared / general'}${r.buyerName ? ` → ${r.buyerName}` : ''}${r.quantity && r.unit ? ` · ${r.quantity} ${r.unit}` : ''}${r.paymentMode ? ` · ${r.paymentMode}` : ''}`}
                  chip={!r.livestockId ? <SharedChip /> : null}
                  amount={r.amount} color="#1D9E75" date={r.revenueDate}
                  attachment={r.attachmentPath}
                  onDelete={() => confirmDeleteRevenue(r.id)} />
              )
            })
          )}
        </>
      )}

      {/* Per animal — the same arithmetic as the v_livestock_pnl view, computed
          from data already in the store: what an animal cost against what it
          earned. Answers the question the totals above cannot — which animal is
          actually paying for itself. Lives on Revenue because that is the side
          with the earnings in it; the Expenses tab is a spend register. */}
      {mode === 'revenue' && earners.length > 0 && (
        <div className="rounded-2xl border overflow-hidden" style={{ background: 'var(--c-nav)', borderColor: 'var(--c-border)' }}>
          <p className="px-4 py-2 text-[10px] font-bold uppercase tracking-widest"
            style={{ color: 'var(--c-muted)', background: 'var(--c-ghost)' }}>{face.perTitle}</p>
          <div className="divide-y divide-[var(--c-border)]">
            {earners.map(a => {
              const cost = (a.purchasePrice || 0)
                + livestockExpenses.filter(e => e.livestockId === a.id).reduce((s, e) => s + e.amount, 0)
              const rev  = revenue.filter(r => r.livestockId === a.id).reduce((s, r) => s + r.amount, 0)
              const gain = rev - cost
              return (
                <div key={a.id} className="flex items-center justify-between px-4 py-2.5 gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold truncate" style={{ color: 'var(--c-text)' }}>{animalLabel(a)}</p>
                    <p className="text-[10px]" style={{ color: 'var(--c-muted)' }}>
                      Cost {fmtK(cost)} · Earned {fmtK(rev)}
                    </p>
                  </div>
                  <p className="text-sm font-bold shrink-0" style={{ color: gain >= 0 ? '#1D9E75' : '#E24B4A' }}>
                    {gain >= 0 ? '+' : '−'}{fmtK(Math.abs(gain))}
                  </p>
                </div>
              )
            })}
          </div>
          <p className="px-4 py-2 text-[9px] leading-relaxed" style={{ color: 'var(--c-faint)' }}>
            Only money tagged to one {face.key === 'birds' ? 'flock' : 'animal'} counts here.
            Anything marked SHARED — feed for the whole shed, a vet call covering
            several — sits in the totals above and shows under both Herd and Birds,
            so don't add the two faces together.
          </p>
        </div>
      )}

      {showRevenue && <RevenueModal animals={animals} group={face.key} onClose={() => setShowRevenue(false)} />}
    </div>
  )
}

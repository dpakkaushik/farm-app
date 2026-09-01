import React from 'react'

// What a crop cost before the farm joined the app, by category.
//
// The categories are not invented here — they are the ones live tracking already
// produces (inventory_items.category for issues, plus labour from labour_logs),
// so a crop report can put pre-app and post-app spend in the same rows. Without
// that the two never line up and a cost-by-category report is guesswork for
// every cycle sown before signup.
//
// machinery and other have no live per-cycle equivalent yet — nothing tracks
// hired equipment or land rent against a cycle — but they are real prior costs,
// and naming them beats letting them disappear into a lump.
export const OPENING_COST_CATEGORIES = [
  { key: 'seed',       label: 'Seed',            emoji: '🌾', hint: 'Seed / planting material' },
  { key: 'fertilizer', label: 'Fertilizer',      emoji: '🧪', hint: 'Urea, DAP, potash…' },
  { key: 'chemical',   label: 'Chemical',        emoji: '🧴', hint: 'Pesticide, herbicide' },
  { key: 'fuel',       label: 'Fuel / Diesel',   emoji: '⛽', hint: 'Irrigation, tractor runs' },
  { key: 'labour',     label: 'Labour',          emoji: '👷', hint: 'Wages paid on this crop' },
  { key: 'machinery',  label: 'Machinery',       emoji: '🚜', hint: 'Hired tractor, harvester' },
  { key: 'other',      label: 'Other',           emoji: '📦', hint: 'Land rent, anything else' },
]

const fmt = n => `₹${Number(n || 0).toLocaleString('en-IN')}`

export default function OpeningCostBreakup({ value = [], onChange, disabled }) {
  const byCat = Object.fromEntries(value.map(l => [l.category, l]))
  const total = value.reduce((s, l) => s + (parseFloat(l.amount) || 0), 0)

  const setAmount = (key, amount) => {
    const rest = value.filter(l => l.category !== key)
    if (amount === '' || parseFloat(amount) === 0) return onChange(rest)
    onChange([...rest, { category: key, amount, notes: byCat[key]?.notes || '' }])
  }

  return (
    <div className="space-y-1.5">
      {OPENING_COST_CATEGORIES.map(c => {
        const amt = byCat[c.key]?.amount ?? ''
        return (
          <div key={c.key} className="grid grid-cols-[1fr_104px] gap-2 items-center">
            <div className="min-w-0">
              <p className="text-xs" style={{ color: 'var(--c-text)' }}>{c.emoji} {c.label}</p>
              <p className="text-[11px] truncate" style={{ color: 'var(--c-faint)' }}>{c.hint}</p>
            </div>
            <input type="number" min="0" inputMode="decimal" placeholder="₹0" disabled={disabled}
              className="finput text-xs py-2 px-2 text-right"
              value={amt} onChange={e => setAmount(c.key, e.target.value)} />
          </div>
        )
      })}

      <div className="flex items-center justify-between pt-2 mt-1"
        style={{ borderTop: '1px solid var(--c-border)' }}>
        <p className="text-[13px]" style={{ color: 'var(--c-sub)' }}>Total spent before the app</p>
        <p className="text-sm font-bold" style={{ color: total > 0 ? '#8A9A5B' : 'var(--c-faint)' }}>{fmt(total)}</p>
      </div>

      <p className="text-[12px] leading-relaxed" style={{ color: 'var(--c-faint)' }}>
        Leave a row blank if it does not apply. This is counted into the crop's cost
        so the margin stays honest, and split this way so crop reports can compare it
        against what the app has tracked since.
      </p>
    </div>
  )
}

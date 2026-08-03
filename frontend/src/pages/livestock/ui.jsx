// Shared primitives for the Livestock screen. Extracted so the health tab could
// have its own file without either half growing past the 800-line ceiling.
import React from 'react'
import { BUCKETS } from '../../lib/attachments'

export const DOCS  = BUCKETS.docs
export const TODAY = new Date().toISOString().slice(0, 10)

export const EXPENSE_CATS = [
  ['feed',           '🌾', 'Feed'],
  ['veterinary',     '💉', 'Veterinary'],
  ['livestock_care', '🪢', 'Livestock Care'],
  ['maintenance',    '🔧', 'Maintenance'],
  ['infrastructure', '🏗',  'Infrastructure'],
  ['utilities',      '⚡', 'Utilities'],
  ['event',          '🎉', 'Event'],
  ['administrative', '📋', 'Administrative'],
  ['other',          '📦', 'Other'],
]

export const REVENUE_TYPES = [
  ['milk',  '🥛', 'Milk'],
  ['egg',   '🥚', 'Eggs'],
  ['meat',  '🍖', 'Meat'],
  ['sale',  '💰', 'Sale (closes animal)'],
  ['dung',  '🌿', 'Dung / Manure'],
  ['wool',  '🧶', 'Wool'],
  ['other', '📦', 'Other'],
]

export const PAY_MODES = ['cash', 'upi', 'bank', 'credit']

export const STATUS_STYLE = {
  active:   { bg: '#1D9E7518', color: '#1D9E75', label: 'Active'   },
  sold:     { bg: '#88888820', color: '#888',    label: 'Sold'     },
  deceased: { bg: '#E24B4A18', color: '#E24B4A', label: 'Deceased' },
  culled:   { bg: '#88888820', color: '#888',    label: 'Culled'   },
}

// under_treatment is what the vet records already in the database use, so it has
// to be a first-class value here and not fall through to the Healthy default.
export const HEALTH_STYLE = {
  healthy:         { color: '#1D9E75', label: '✓ Healthy'      },
  under_treatment: { color: '#E24B4A', label: '💊 On treatment' },
  sick:            { color: '#E24B4A', label: '⚠ Sick'         },
  recovering:      { color: '#BA7517', label: '~ Recovering'   },
}

export const HEALTH_OPTIONS = [
  ['healthy',         '✓ Healthy'],
  ['under_treatment', '💊 Treating'],
  ['recovering',      '~ Recovering'],
  ['sick',            '⚠ Sick'],
]

const CATTLE_SPECIES  = ['buffalo','cow','bull','bullock','ox']
const POULTRY_SPECIES = ['hen','cock','chicken','poultry','bird','rooster']

export const isPoultry = l => l.trackingMode === 'count'
  || POULTRY_SPECIES.some(s => (l.species || l.animal_type || '').toLowerCase().includes(s))

// Anything individually tracked that isn't poultry counts as cattle, so a goat or
// a sheep still lands in a section instead of vanishing between the two.
export const isCattle = l => CATTLE_SPECIES.some(s => (l.species || l.animal_type || '').toLowerCase().includes(s))
  || (!POULTRY_SPECIES.some(s => (l.species || l.animal_type || '').toLowerCase().includes(s)) && l.trackingMode === 'individual')

export const isActive = l => (l.status || 'active') === 'active'

export const animalLabel = a => a ? (a.name || a.tagId) : null

export const fmt  = n => n != null ? `₹${Number(n).toLocaleString('en-IN')}` : '—'
export const fmtK = n => n >= 1000 ? `₹${(n / 1000).toFixed(1)}K` : fmt(n)

// Whole days from today. Negative means the date is already past.
export const daysFromToday = iso => {
  if (!iso) return null
  const ms = new Date(iso + 'T00:00:00') - new Date(TODAY + 'T00:00:00')
  return Math.round(ms / 86400000)
}

export const inp = 'w-full px-3 py-2.5 rounded-xl text-sm border outline-none bg-[var(--c-ghost)] border-[var(--c-border)] text-[var(--c-text)]'

export function Modal({ title, onClose, children }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center" style={{ background: 'rgba(0,0,0,0.5)' }}>
      <div className="w-full max-w-lg rounded-t-2xl p-5 pb-8 space-y-4"
        style={{ background: 'var(--c-nav)', maxHeight: '92vh', overflowY: 'auto' }}>
        <div className="flex items-center justify-between">
          <p className="font-semibold text-sm" style={{ color: 'var(--c-text)' }}>{title}</p>
          <button onClick={onClose} className="text-lg" style={{ color: 'var(--c-muted)' }}>✕</button>
        </div>
        {children}
      </div>
    </div>
  )
}

export function FRow({ label, children }) {
  return (
    <div className="space-y-1">
      <p className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: 'var(--c-muted)' }}>{label}</p>
      {children}
    </div>
  )
}

export function Pill({ status }) {
  const s = STATUS_STYLE[status] || STATUS_STYLE.active
  return (
    <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full"
      style={{ background: s.bg, color: s.color }}>{s.label}</span>
  )
}

export function HealthPill({ status }) {
  const h = HEALTH_STYLE[status] || HEALTH_STYLE.healthy
  return (
    <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full"
      style={{ background: h.color + '18', color: h.color }}>{h.label}</span>
  )
}

export function SegPicker({ value, options, onChange, danger }) {
  return (
    <div className="flex rounded-xl overflow-hidden border border-[var(--c-border)]">
      {options.map(([v, l]) => (
        <button key={v} onClick={() => onChange(v)}
          className="flex-1 py-2 text-xs font-semibold transition-colors"
          style={{ background: value === v ? (danger ? '#E24B4A' : '#1D9E75') : 'var(--c-ghost)', color: value === v ? '#fff' : 'var(--c-muted)' }}>
          {l}
        </button>
      ))}
    </div>
  )
}

export function ActionBar({ actions }) {
  return (
    <div className="flex border-t border-[var(--c-border)] divide-x divide-[var(--c-border)]">
      {actions.map(({ label, icon, color, onClick }) => (
        <button key={label} onClick={onClick}
          className="flex-1 py-2.5 text-[10px] font-semibold flex items-center justify-center gap-1"
          style={{ color: color || 'var(--c-muted)' }}>
          {icon}{label}
        </button>
      ))}
    </div>
  )
}

// Shared primitives for the Livestock screen. Extracted so the health tab could
// have its own file without either half growing past the 800-line ceiling.
import React from 'react'
import { Beef, Bird, Dog } from 'lucide-react'
import { BUCKETS } from '../../lib/attachments'

export const DOCS  = BUCKETS.docs
export const TODAY = new Date().toISOString().slice(0, 10)

export const EXPENSE_CATS = [
  ['feed',           '🌾', 'Feed'],
  ['veterinary',     '💉', 'Veterinary'],
  ['medicine',       '💊', 'Medicine'],
  ['accessories',    '🦴', 'Accessories'],
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

// `dateLabel` is how sold_date reads once the account is closed. The column is
// named for a sale because that used to be the only way to close an animal; it
// now holds the date of whatever ended the record, so a deceased buffalo must
// not display "Sold 2026-07-04".
export const STATUS_STYLE = {
  active:   { bg: '#1D9E7518', color: '#1D9E75', label: 'Active',   dateLabel: null     },
  sold:     { bg: '#88888820', color: '#888',    label: 'Sold',     dateLabel: 'Sold'   },
  rehomed:  { bg: '#4169E118', color: '#4169E1', label: 'Rehomed',  dateLabel: 'Left'   },
  deceased: { bg: '#E24B4A18', color: '#E24B4A', label: 'Deceased', dateLabel: 'Died'   },
  culled:   { bg: '#88888820', color: '#888',    label: 'Culled',   dateLabel: 'Culled' },
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

const speciesOf   = l => (l.species || l.animal_type || '').toLowerCase()
const anySpecies  = (l, list) => list.some(s => speciesOf(l).includes(s))
// Whole words only, so the free-text species field on the Edit modal can hold
// "cattle" without the 'cat' inside it turning a buffalo into a pet.
const PET_SPECIES = /\b(dog|cat|puppy|kitten|pup)\b/

// A pet is individually tracked like cattle but earns nothing, so it is its own
// group: excluded from the per-animal profit list, costed on its own card.
export const isPet = l => PET_SPECIES.test(speciesOf(l))

export const isPoultry = l => !isPet(l)
  && (l.trackingMode === 'count' || anySpecies(l, POULTRY_SPECIES))

// Anything individually tracked that is neither poultry nor a pet counts as
// cattle, so a goat or a sheep still lands in a section instead of vanishing
// between them.
export const isCattle = l => anySpecies(l, CATTLE_SPECIES)
  || (!isPet(l) && !anySpecies(l, POULTRY_SPECIES) && l.trackingMode === 'individual')

export const isActive = l => (l.status || 'active') === 'active'

// The three faces of the Livestock screen, and the one function that decides
// which an animal belongs to. Written as an if-else chain rather than three
// independent filters so the groups are exhaustive by construction — nothing can
// fall between them and disappear from the screen.
//
// One route, three faces. Everything a face changes is declared here: what the
// page is called, what its three tabs are named, and whether money is a
// two-sided account or a spend list. A flock is a number, an animal is a name
// that earns, a pet is a name that only costs — the same tab bar over all three
// is what the owner rejected.
export const GROUPS = [
  { key: 'pets',    label: 'Pets',    Icon: Dog,  title: 'Pets',
    listTab: '🐕 Pets',   moneyTab: '💰 Costs',   money: 'costs',
    add: 'Add Pet',    empty: 'No pets recorded',                 unit: 'pets',   perTitle: 'Per pet'    },
  { key: 'birds',   label: 'Birds',   Icon: Bird, title: 'Birds',
    listTab: '🐓 Flocks', moneyTab: '💰 Finance', money: 'finance',
    add: 'Add Flock',  empty: 'No flocks recorded',               unit: 'flocks', perTitle: 'Per flock'  },
  { key: 'animals', label: 'Animals', Icon: Beef, title: 'Herd',
    listTab: '🐄 Herd',   moneyTab: '💰 Finance', money: 'finance',
    add: 'Add Animal', empty: 'No animals in the herd right now', unit: 'head',   perTitle: 'Per animal' },
]
export const GROUP_KEYS = GROUPS.map(g => g.key)
export const groupOf = l => isPet(l) ? 'pets' : isPoultry(l) ? 'birds' : 'animals'
export const faceOf  = key => GROUPS.find(g => g.key === key) || GROUPS[GROUPS.length - 1]

export const animalLabel = a => a ? (a.name || a.tagId) : null

export const speciesEmoji = l => isPet(l)     ? (speciesOf(l).includes('cat') ? '🐈' : '🐕')
                               : isPoultry(l) ? '🐓'
                               : speciesOf(l).includes('cow') ? '🐄' : '🐃'

// What one animal has cost so far: what it was bought for plus every livestock
// expense tagged to it. For a pet this is the whole story — it earns nothing,
// which is why pets are left out of the per-animal profit lists.
export const costToDate = (l, expenses) => (l.purchasePrice || 0) + expenses
  .filter(e => e.attributedTo === 'livestock' && e.livestockId === l.id)
  .reduce((s, e) => s + e.amount, 0)

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

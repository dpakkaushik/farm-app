import { describe, it, expect } from 'vitest'
import React from 'react'
import { optionsFromChildren, labelFor } from '../selectOptions'

// The children a call site already writes, built the way JSX builds them.
const option = (value, label) => React.createElement('option', { value }, label)
const group = (label, ...kids) => React.createElement('optgroup', { label }, ...kids)

describe('optionsFromChildren', () => {
  it('reads a flat list of options', () => {
    expect(optionsFromChildren([option('a', 'Alpha'), option('b', 'Beta')]))
      .toEqual([{ value: 'a', label: 'Alpha', group: null, disabled: false },
                { value: 'b', label: 'Beta',  group: null, disabled: false }])
  })

  it('keeps the heading an optgroup puts over its rows', () => {
    const opts = optionsFromChildren([
      option('', 'Select…'),
      group('Permanent Staff', option('s1', 'Harinder')),
      group('Regular Labour',  option('l1', 'Deena'), option('l2', 'Vikram')),
    ])
    expect(opts.map(o => [o.group, o.value])).toEqual([
      [null, ''], ['Permanent Staff', 's1'], ['Regular Labour', 'l1'], ['Regular Labour', 'l2'],
    ])
  })

  it('flattens .map() arrays and skips what a condition rendered away', () => {
    // `{cond && items.map(...)}` yields false or an array — both reach us.
    const opts = optionsFromChildren([option('', 'All'), false, null, undefined,
      [option('x', 'X'), option('y', 'Y')]])
    expect(opts.map(o => o.value)).toEqual(['', 'x', 'y'])
  })

  it('joins a label split across expressions, as an emoji row is written', () => {
    // <option>{a.emoji} {a.label}</option> arrives as ['🌾', ' ', 'Sowing']
    const el = React.createElement('option', { value: 'w1' }, '🌾', ' ', 'Sowing')
    expect(optionsFromChildren([el])[0].label).toBe('🌾 Sowing')
  })

  it('carries a number value through as the string a select would give back', () => {
    expect(optionsFromChildren([option(3, 'Three')])[0].value).toBe('3')
  })

  it('marks a disabled option so the sheet can refuse it', () => {
    const el = React.createElement('option', { value: 'x', disabled: true }, 'Nope')
    expect(optionsFromChildren([el])[0].disabled).toBe(true)
  })
})

describe('labelFor', () => {
  const opts = optionsFromChildren([option('', 'Select worker…'), option('a', 'Alpha')])

  it('names the chosen row', () => {
    expect(labelFor(opts, 'a')).toBe('Alpha')
  })

  it('falls back to the empty row, which is how a form says "nothing picked"', () => {
    expect(labelFor(opts, '')).toBe('Select worker…')
  })

  it('compares like a select does, so a number matches its option', () => {
    expect(labelFor(optionsFromChildren([option(3, 'Three')]), 3)).toBe('Three')
  })

  it('says nothing rather than guessing when the value is not in the list', () => {
    expect(labelFor(opts, 'gone')).toBe('')
  })
})

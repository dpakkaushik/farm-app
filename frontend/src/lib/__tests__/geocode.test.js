import { describe, it, expect } from 'vitest'
import { formatPlace, toSuggestion, suggestionsFrom, MIN_QUERY } from '../geocode'

// Shapes below are trimmed from real Photon answers to "gurga" and "pilibhit".
const feature = (properties, coordinates = [77.0299, 28.4646]) =>
  ({ type: 'Feature', geometry: { type: 'Point', coordinates }, properties })

describe('formatPlace', () => {
  it('joins the parts that are there', () => {
    expect(formatPlace({ name: 'Gurgaon', state: 'Haryana', country: 'India' }))
      .toBe('Gurgaon, Haryana, India')
  })

  it('skips blanks and whitespace-only parts', () => {
    expect(formatPlace({ name: 'Pilibhit', city: '', county: '   ', state: 'Uttar Pradesh' }))
      .toBe('Pilibhit, Uttar Pradesh')
  })

  // Real result: a city whose name equals its county printed "Gurgaon, Gurgaon".
  it('never repeats a part, whatever its case', () => {
    expect(formatPlace({ name: 'Gurgaon', county: 'gurgaon', state: 'Haryana' }))
      .toBe('Gurgaon, Haryana')
  })

  it('stops at four parts so the row still fits a phone', () => {
    expect(formatPlace({
      name: 'Kheri', city: 'Lakhimpur', county: 'Kheri District',
      state: 'Uttar Pradesh', country: 'India',
    }).split(', ')).toHaveLength(4)
  })

  it('returns an empty string for nothing usable', () => {
    expect(formatPlace({})).toBe('')
    expect(formatPlace()).toBe('')
    expect(formatPlace({ name: 42 })).toBe('')
  })
})

describe('toSuggestion', () => {
  it('reads Photon coordinates as [lng, lat], not the other way round', () => {
    const s = toSuggestion(feature({ name: 'Gurgaon', state: 'Haryana', country: 'India' }))
    expect(s.lng).toBe(77.0299)
    expect(s.lat).toBe(28.4646)
    expect(s.label).toBe('Gurgaon, Haryana, India')
  })

  it('drops a feature with no usable coordinate', () => {
    expect(toSuggestion(feature({ name: 'X' }, []))).toBeNull()
    expect(toSuggestion(feature({ name: 'X' }, ['a', 'b']))).toBeNull()
    expect(toSuggestion({ properties: { name: 'X' } })).toBeNull()
    expect(toSuggestion(null)).toBeNull()
  })

  it('drops a coordinate outside the world', () => {
    expect(toSuggestion(feature({ name: 'X' }, [77, 91]))).toBeNull()
    expect(toSuggestion(feature({ name: 'X' }, [181, 28]))).toBeNull()
  })

  it('drops a feature with no name at all', () => {
    expect(toSuggestion(feature({}))).toBeNull()
  })
})

describe('suggestionsFrom', () => {
  // Photon genuinely returns this: "gurga" gave two identical Gurgaon rows.
  it('collapses the same place returned twice', () => {
    const dupe = feature({ name: 'Gurgaon', state: 'Haryana', country: 'India' }, [77.0112, 28.4891])
    const list = suggestionsFrom({ features: [dupe, dupe] })
    expect(list).toHaveLength(1)
  })

  it('keeps two places that share a name but sit apart', () => {
    const list = suggestionsFrom({ features: [
      feature({ name: 'Gurgaon', state: 'Haryana', country: 'India' }, [77.0299, 28.4646]),
      feature({ name: 'Gurgaon', state: 'Haryana', country: 'India' }, [77.0112, 28.4891]),
    ] })
    expect(list).toHaveLength(2)
  })

  it('keeps the order Photon ranked them in', () => {
    const list = suggestionsFrom({ features: [
      feature({ name: 'Gurgaon', state: 'Haryana', country: 'India' }, [77.03, 28.46]),
      feature({ name: 'Gurgan', state: 'Kirkuk', country: 'Iraq' }, [44.55, 35.66]),
    ] })
    expect(list.map(s => s.label)).toEqual(['Gurgaon, Haryana, India', 'Gurgan, Kirkuk, Iraq'])
  })

  it('skips unusable features without losing the good ones', () => {
    const list = suggestionsFrom({ features: [
      feature({ name: 'Good', country: 'India' }),
      feature({}, []),
      null,
    ] })
    expect(list.map(s => s.label)).toEqual(['Good, India'])
  })

  it('survives an empty or malformed answer', () => {
    expect(suggestionsFrom({ features: [] })).toEqual([])
    expect(suggestionsFrom({})).toEqual([])
    expect(suggestionsFrom(null)).toEqual([])
  })
})

describe('MIN_QUERY', () => {
  it('is short enough for a small town, long enough to not spam', () => {
    expect(MIN_QUERY).toBe(3)
  })
})

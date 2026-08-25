import { describe, it, expect } from 'vitest'
import {
  fmtINR, humanise, qtyLabel, cardSubline, isRetired,
  assetFacts, disposalFacts, registerSummary,
} from '../assetFacts'

const tractor = {
  name: 'Tractor 6422', type: 'tractor', make: 'John Deere', quantity: 1,
  status: 'in_use', purchasePrice: 900000, purchaseDate: '2024-03-15',
  model: '6422', regNo: 'UP 32 AB 1234', usefulLife: 10,
}

describe('fmtINR', () => {
  it('prints Indian grouping', () => expect(fmtINR(2611000)).toBe('₹26,11,000'))
  it('returns null for nothing', () => {
    expect(fmtINR(null)).toBeNull()
    expect(fmtINR(undefined)).toBeNull()
    expect(fmtINR('')).toBeNull()
  })
})

describe('humanise / qtyLabel', () => {
  it('turns snake_case into a sentence word', () => expect(humanise('water_motor')).toBe('Water motor'))
  it('hides a quantity of one', () => expect(qtyLabel(1)).toBe(''))
  it('shows a real quantity as a multiplier', () => expect(qtyLabel(3)).toBe('×3'))
  it('treats a missing quantity as one', () => expect(qtyLabel(undefined)).toBe(''))
})

describe('cardSubline', () => {
  it('reads kind · make for a single machine', () => {
    expect(cardSubline(tractor, 'machinery')).toBe('Tractor · John Deere')
  })
  it('adds the multiplier and drops an empty make', () => {
    expect(cardSubline({ type: 'implement', make: '', quantity: 2 }, 'machinery')).toBe('Implement · ×2')
  })
  it('uses category and location for a farm asset', () => {
    expect(cardSubline({ category: 'appliance', location: 'Store room', quantity: 1 }, 'asset'))
      .toBe('Appliance · Store room')
  })
})

describe('isRetired', () => {
  it('is true for disposed and sold only', () => {
    expect(isRetired({ status: 'disposed' })).toBe(true)
    expect(isRetired({ status: 'sold' })).toBe(true)
    expect(isRetired({ status: 'under_repair' })).toBe(false)
    expect(isRetired(null)).toBe(false)
  })
})

describe('assetFacts', () => {
  it('lists price, date, model, registration and life for a full machine record', () => {
    const labels = assetFacts(tractor, 'machinery').map(r => r.label)
    expect(labels).toEqual(['Purchase price', 'Bought on', 'Model', 'Registration', 'Useful life'])
    expect(assetFacts(tractor, 'machinery')[0].value).toBe('₹9,00,000')
  })
  it('marks an unset price and date as missing rather than dropping them', () => {
    const rows = assetFacts({ type: 'implement' }, 'machinery')
    expect(rows).toEqual([
      { label: 'Purchase price', value: 'Not set', missing: true },
      { label: 'Bought on',      value: 'Not set', missing: true },
    ])
  })
  it('names the vendor when one is known', () => {
    const rows = assetFacts(tractor, 'machinery', 'Ankur Traders')
    expect(rows.find(r => r.label === 'Bought from').value).toBe('Ankur Traders')
  })
  it('shows where a farm asset is kept, not a registration', () => {
    const rows = assetFacts({ category: 'appliance', location: 'Kitchen', purchasePrice: 5000 }, 'asset')
    expect(rows.map(r => r.label)).toEqual(['Purchase price', 'Bought on', 'Kept at'])
  })
})

describe('disposalFacts', () => {
  it('is null while the item is in service', () => expect(disposalFacts(tractor)).toBeNull())
  it('describes a sale with buyer and amount', () => {
    const rows = disposalFacts({ disposalType: 'sold', disposalDate: '2026-08-01', disposalAmount: 15000, disposalBuyer: 'Ram' })
    expect(rows.map(r => r.label)).toEqual(['Sold on', 'Sold for', 'Buyer'])
    expect(rows[1].value).toBe('₹15,000')
  })
  it('describes a scrap without inventing a buyer', () => {
    const rows = disposalFacts({ disposalType: 'scrapped', disposalDate: '2026-08-01' })
    expect(rows).toEqual([{ label: 'Scrapped on', value: '01 Aug 26' }])
  })
})

describe('registerSummary', () => {
  it('joins the count and the value', () => {
    expect(registerSummary(25, 2300000)).toBe('25 items · Book value ₹23,00,000')
  })
  it('leaves the value out when nothing is priced', () => {
    expect(registerSummary(3, 0)).toBe('3 items')
  })
  it('uses the singular for one', () => expect(registerSummary(1, 0)).toBe('1 item'))
})

import { describe, it, expect } from 'vitest'
import {
  isRecovery, splitAdvances, owedToFarm, owedToWorker, isSettled, canHideWorker,
  hiddenWithBalance, totalOwedToFarm, khataEvents, buildWorkerKhata,
} from '../workerRecovery'

// The six workers who actually owe the farm on 20 Aug 2026, from v_salary_dues.
// Two of them — Gambhira and Jhingur — are paused, so no screen shows them while
// their ₹15,620 keeps counting in the Ledger's dues total. That is the bug these
// figures exist to pin down.
const DUES = [
  { name: 'Deena',      status: 'active', balance_due: -25425 },
  { name: 'DEEPAK',     status: 'active', balance_due: -13933 },
  { name: 'Gambhira',   status: 'paused', balance_due: -13495 },
  { name: 'Chote Lal',  status: 'active', balance_due: -5303  },
  { name: 'Jhingur',    status: 'paused', balance_due: -2125  },
  { name: 'Harinder',   status: 'active', balance_due: -1139  },
  { name: 'Ram Naresh', status: 'inactive', balance_due: 0    },
  { name: 'Phool Chand', status: 'active', balance_due: 6552  },
]

const adv = (amount, over = {}) => ({ amount, advance_date: '2026-08-10', ...over })

describe('isRecovery', () => {
  it('is the sign, and nothing else — a negative advance is money coming back', () => {
    expect(isRecovery(adv(-5000))).toBe(true)
    expect(isRecovery(adv(5000))).toBe(false)
  })
  it('treats a zero or missing amount as not a recovery', () => {
    expect(isRecovery(adv(0))).toBe(false)
    expect(isRecovery({})).toBe(false)
    expect(isRecovery(null)).toBe(false)
  })
  it('reads string amounts, which is what Supabase returns for numeric', () => {
    expect(isRecovery(adv('-5000'))).toBe(true)
    expect(isRecovery(adv('5000'))).toBe(false)
  })
})

describe('splitAdvances', () => {
  it('shows both directions as positive numbers and nets them for the view', () => {
    const { given, recovered, net } = splitAdvances([adv(7000), adv(-5000), adv(2000)])
    expect(given).toBe(9000)
    expect(recovered).toBe(5000)
    expect(net).toBe(4000)     // exactly what v_salary_dues subtracts
  })
  it('is zero all round for no rows', () => {
    expect(splitAdvances()).toEqual({ given: 0, recovered: 0, net: 0 })
  })
  it('can net below zero — recovering more than was ever advanced is legal', () => {
    // Deepak's ₹13,933 is an OPENING balance; there is no advance row to net
    // against, so a full recovery leaves the net negative. It must not clamp.
    expect(splitAdvances([adv(-13933)]).net).toBe(-13933)
  })
})

describe('owedToFarm / owedToWorker', () => {
  it('splits one signed balance into the two questions a farmer asks', () => {
    expect(owedToFarm(-13933)).toBe(13933)
    expect(owedToWorker(-13933)).toBe(0)
    expect(owedToFarm(6552)).toBe(0)
    expect(owedToWorker(6552)).toBe(6552)
  })
  it('is zero on both sides at zero, and survives null', () => {
    expect(owedToFarm(0)).toBe(0)
    expect(owedToWorker(0)).toBe(0)
    expect(owedToFarm(null)).toBe(0)
    expect(owedToWorker(undefined)).toBe(0)
  })
})

describe('isSettled', () => {
  it('is under a rupee, not exactly zero — balances carry paise', () => {
    expect(isSettled(0)).toBe(true)
    expect(isSettled(-0.02)).toBe(true)
    expect(isSettled(0.99)).toBe(true)
    expect(isSettled(-1)).toBe(false)
    expect(isSettled(-13933)).toBe(false)
  })
})

describe('canHideWorker', () => {
  it('refuses while money is owed in either direction', () => {
    expect(canHideWorker(-13933)).toBe(false)   // he owes the farm
    expect(canHideWorker(6552)).toBe(false)     // the farm owes him
  })
  it('allows it once settled — that is the whole gate', () => {
    expect(canHideWorker(0)).toBe(true)
    expect(canHideWorker(-0.4)).toBe(true)
  })
})

describe('hiddenWithBalance', () => {
  it('finds the workers no screen shows but the books still count', () => {
    const rows = hiddenWithBalance(DUES)
    expect(rows.map(r => r.name)).toEqual(['Gambhira', 'Jhingur'])
  })
  it('catches paused and inactive alike — one rule, because both are hidden', () => {
    const rows = hiddenWithBalance([
      { name: 'A', status: 'paused',   balance_due: -100 },
      { name: 'B', status: 'inactive', balance_due: -200 },
    ])
    expect(rows.map(r => r.name)).toEqual(['B', 'A'])   // biggest debt first
  })
  it('leaves out a settled ex-worker — nothing left to chase', () => {
    expect(hiddenWithBalance([{ name: 'Ram Naresh', status: 'inactive', balance_due: 0 }])).toEqual([])
  })
  it('leaves out active workers, who have their own card on the screen', () => {
    expect(hiddenWithBalance(DUES).some(r => r.name === 'Deena')).toBe(false)
  })
  it('includes an ex-worker the FARM owes — his wages must not vanish either', () => {
    const rows = hiddenWithBalance([{ name: 'C', status: 'paused', balance_due: 4000 }])
    expect(rows).toHaveLength(1)
  })
  it('is empty for no rows', () => {
    expect(hiddenWithBalance()).toEqual([])
  })
})

describe('totalOwedToFarm', () => {
  it('adds up only what workers owe, never netting off wages due to others', () => {
    // Netting Phool Chand's ₹6,552 of unpaid wages against the debts would
    // understate what there is to collect. These are two different pockets.
    expect(totalOwedToFarm(DUES)).toBe(61420)
  })
})

// ── The khata ────────────────────────────────────────────────────────────────

describe('khataEvents', () => {
  it('puts wages earned on the credit side and cash paid out on the debit side', () => {
    const events = khataEvents({
      accruals: [{ month: '2026-08-01', earned: 6207 }],
      payments: [{ payment_date: '2026-08-25', amount_paid: 5000 }],
      advances: [adv(2000, { advance_date: '2026-08-05' })],
    })
    // Ordered by date, so August's wages (month end, the 31st) land after the
    // payment on the 25th.
    expect(events.map(e => [e.type, e.credit, e.debit])).toEqual([
      ['advance', null, 2000],
      ['payment', null, 5000],
      ['earned', 6207, null],
    ])
  })

  it('puts a recovery on the credit side as a POSITIVE — the sign flip lives here', () => {
    const [e] = khataEvents({ advances: [adv(-5000, { reason: 'Left the farm' })] })
    expect(e.type).toBe('recovery')
    expect(e.credit).toBe(5000)
    expect(e.debit).toBeNull()
    expect(e.label).toBe('Recovered from worker · Left the farm')
  })

  it('dates a month of wages to month end, or to today if the month is still running', () => {
    const [aug] = khataEvents({ accruals: [{ month: '2026-08-01', earned: 100 }] })
    expect(aug.date).toBe('2026-08-31')
    const [part] = khataEvents({ accruals: [{ month: '2026-08-01', earned: 100 }], today: '2026-08-20' })
    expect(part.date).toBe('2026-08-20')
    const [jul] = khataEvents({ accruals: [{ month: '2026-07-01', earned: 100 }], today: '2026-08-20' })
    expect(jul.date).toBe('2026-07-31')   // a closed month is not clamped
  })

  it('labels the month in the farmer\'s words and handles February', () => {
    const [feb] = khataEvents({ accruals: [{ month: '2027-02-01', earned: 100 }] })
    expect(feb.label).toBe('Wages earned · Feb 2027')
    expect(feb.date).toBe('2027-02-28')
  })

  it('drops a month with nothing earned instead of printing a ₹0 line', () => {
    expect(khataEvents({ accruals: [{ month: '2026-08-01', earned: 0 }] })).toEqual([])
  })

  it('sorts by date so the running balance reads down the page', () => {
    const events = khataEvents({
      advances: [adv(2000, { advance_date: '2026-08-18' }), adv(-500, { advance_date: '2026-08-02' })],
      payments: [{ payment_date: '2026-08-10', amount_paid: 100 }],
    })
    expect(events.map(e => e.date)).toEqual(['2026-08-02', '2026-08-10', '2026-08-18'])
  })

  it('carries who gave the money and how, for the proof line', () => {
    const [e] = khataEvents({ advances: [adv(2000, { given_by: 'Manager', payment_mode: 'upi' })] })
    expect(e.givenBy).toBe('Manager')
    expect(e.mode).toBe('upi')
  })

  it('is empty for a worker with no history at all', () => {
    expect(khataEvents()).toEqual([])
  })
})

describe('buildWorkerKhata', () => {
  it('opens with the opening balance, even when there is nothing else', () => {
    const { rows, closing } = buildWorkerKhata({ openingBalance: -13933 })
    expect(rows).toHaveLength(1)
    expect(rows[0].type).toBe('opening')
    expect(closing).toBe(-13933)
  })

  it('closes on exactly what v_salary_dues computes — the two cannot disagree', () => {
    // Harinder, live: opening −7,346, earned 6,207, nothing paid, nothing advanced.
    // v_salary_dues.balance_due = −1,139.
    const events = khataEvents({ accruals: [{ month: '2026-08-01', earned: 6207 }] })
    expect(buildWorkerKhata({ openingBalance: -7346, events }).closing).toBe(-1139)
  })

  it('makes paying a man his wages REDUCE what the farm owes him', () => {
    // The old overlay added payments to the balance, so paying ₹5,000 made the
    // farm appear to owe MORE. This is the regression that fix must never undo.
    const events = khataEvents({ payments: [{ payment_date: '2026-08-25', amount_paid: 5000 }] })
    expect(buildWorkerKhata({ openingBalance: 6552, events }).closing).toBe(1552)
  })

  it('walks a real recovery down to zero', () => {
    // Deepak owes ₹13,933 and pays it back in two goes.
    const events = khataEvents({
      advances: [
        adv(-10000, { advance_date: '2026-08-21' }),
        adv(-3933,  { advance_date: '2026-09-02' }),
      ],
    })
    const { rows, closing } = buildWorkerKhata({ openingBalance: -13933, events })
    expect(rows.map(r => r.balance)).toEqual([-13933, -3933, 0])
    expect(closing).toBe(0)
    expect(isSettled(closing)).toBe(true)   // and now he can be removed
  })

  it('totals each column for the summary strip', () => {
    const events = khataEvents({
      accruals: [{ month: '2026-08-01', earned: 6207 }],
      advances: [adv(2000)],
      payments: [{ payment_date: '2026-08-28', amount_paid: 1000 }],
    })
    const { totalCredit, totalDebit } = buildWorkerKhata({ openingBalance: 0, events })
    expect(totalCredit).toBe(6207)
    expect(totalDebit).toBe(3000)
  })

  it('does not mutate the events handed in', () => {
    const events = khataEvents({ advances: [adv(2000)] })
    const before = JSON.stringify(events)
    buildWorkerKhata({ openingBalance: 0, events })
    expect(JSON.stringify(events)).toBe(before)
  })
})

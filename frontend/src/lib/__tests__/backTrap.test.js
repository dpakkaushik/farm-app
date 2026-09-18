import { describe, it, expect } from 'vitest'
import { createBackTrapper, MARKER } from '../backTrap'

// A stand-in for window.history: a stack of entry states plus the popstate
// listeners. `deferBack` holds a programmatic back() in the queue until the test
// calls settle() — real browsers process one asynchronously, which is what makes
// a remount mid-gesture (dev fast-refresh) worth pinning down.
//
// `schedule` is injected too, because a UI close no longer spends its entry
// inline — it waits a tick so an overlay opening in the same React commit can
// inherit it. runTimers() is that tick.
function fakeBrowser({ state = {}, deferBack = false } = {}) {
  const entries = [state]
  const listeners = new Set()
  const timers = []
  let pending = 0
  let exited = false
  let backs = 0

  const settle = () => {
    while (pending > 0) {
      pending -= 1
      if (entries.length > 1) entries.pop()
      else exited = true          // nothing left to pop: the app closes
      ;[...listeners].forEach(fn => fn())
    }
  }

  const queue = () => { pending += 1 }

  return {
    env: {
      pushState: (s) => { entries.push(s) },
      getState:  () => entries[entries.length - 1],
      back:      () => { backs += 1; queue(); if (!deferBack) settle() },
      onPop:     (fn) => { listeners.add(fn); return () => listeners.delete(fn) },
      schedule:  (fn) => { timers.push(fn) },
    },
    press: () => { queue(); settle() },   // the user's gesture
    runTimers: () => { timers.splice(0).forEach(fn => fn()) },
    settle,
    depth:  () => entries.length,
    state:  () => entries[entries.length - 1],
    exited: () => exited,
    backs:  () => backs,
  }
}

describe('createBackTrapper', () => {
  it('parks one entry and keeps the router state already there', () => {
    const b = fakeBrowser({ state: { idx: 3, key: 'abc' } })
    createBackTrapper(b.env)(() => {})

    expect(b.depth()).toBe(2)
    expect(b.state()).toEqual({ idx: 3, key: 'abc', [MARKER]: 1 })
  })

  it('closes the overlay on a back press instead of leaving the screen', () => {
    const b = fakeBrowser()
    let closed = 0
    createBackTrapper(b.env)(() => { closed += 1 })

    b.press()

    expect(closed).toBe(1)
    expect(b.exited()).toBe(false)
    expect(b.depth()).toBe(1)
  })

  it('spends the parked entry when the overlay is closed from the UI', () => {
    const b = fakeBrowser()
    const dispose = createBackTrapper(b.env)(() => {})

    dispose()
    b.runTimers()

    expect(b.depth()).toBe(1)
  })

  it('leaves the screen on the back press AFTER a UI close — no dead press', () => {
    const b = fakeBrowser()
    let closed = 0
    const dispose = createBackTrapper(b.env)(() => { closed += 1 })

    dispose()
    b.runTimers()
    b.press()

    expect(closed).toBe(0)
    expect(b.exited()).toBe(true)
  })

  it('closes only the top overlay, one press at a time', () => {
    const b = fakeBrowser()
    const trap = createBackTrapper(b.env)
    const closed = []
    const disposeSheet  = trap(() => closed.push('sheet'))
    const disposeViewer = trap(() => closed.push('viewer'))

    b.press()
    expect(closed).toEqual(['viewer'])
    disposeViewer()                     // React unmounts what just closed
    b.runTimers()
    expect(b.exited()).toBe(false)

    b.press()
    expect(closed).toEqual(['viewer', 'sheet'])
    disposeSheet()
    b.runTimers()
    expect(b.exited()).toBe(false)
  })

  it('does not undo a navigation made while the overlay was open', () => {
    const b = fakeBrowser()
    const dispose = createBackTrapper(b.env)(() => {})

    // The overlay routed somewhere: react-router pushes its own entry, which
    // carries none of our marker.
    b.env.pushState({ idx: 9 })
    dispose()
    b.runTimers()

    expect(b.depth()).toBe(3)
    expect(b.state()).toEqual({ idx: 9 })
  })

  it('ignores a back still in flight from the previous mount', () => {
    const b = fakeBrowser({ deferBack: true })
    const trap = createBackTrapper(b.env)
    let closed = 0

    const dispose = trap(() => {})
    dispose()                           // parks a back…
    trap(() => { closed += 1 })         // …and the overlay remounts first
    b.runTimers()
    b.settle()

    expect(closed).toBe(0)
  })

  // ── The drawer → modal handoff ────────────────────────────────────────────
  // A profile-drawer row that opens a modal closes the drawer and mounts the
  // modal in ONE React commit: dispose() then trapBack(), no tick between them.
  // Firing the drawer's back() inline let the browser destroy the modal's entry
  // and hand the modal a popstate it read as the user pressing back — so Manage
  // Farms and About did nothing at all when tapped.
  it('hands the parked entry to an overlay opening in the same tick', () => {
    const b = fakeBrowser()
    const trap = createBackTrapper(b.env)
    let modalClosed = 0

    const disposeDrawer = trap(() => {})
    expect(b.depth()).toBe(2)

    disposeDrawer()                       // one commit: drawer out…
    trap(() => { modalClosed += 1 })      // …modal in
    b.runTimers()

    expect(modalClosed).toBe(0)           // the modal survives being opened
    expect(b.backs()).toBe(0)             // the drawer's back() was dropped
    expect(b.depth()).toBe(2)             // still exactly one parked entry
    expect(b.state()[MARKER]).toBe(1)
  })

  it('still closes the inherited overlay on a real back press', () => {
    const b = fakeBrowser()
    const trap = createBackTrapper(b.env)
    let modalClosed = 0

    const disposeDrawer = trap(() => {})
    disposeDrawer()
    trap(() => { modalClosed += 1 })
    b.runTimers()

    b.press()

    expect(modalClosed).toBe(1)
    expect(b.exited()).toBe(false)        // the gesture closed the modal, not the app
    expect(b.depth()).toBe(1)
  })
})

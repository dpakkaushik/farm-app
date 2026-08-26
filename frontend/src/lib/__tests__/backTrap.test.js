import { describe, it, expect } from 'vitest'
import { createBackTrapper, MARKER } from '../backTrap'

// A stand-in for window.history: a stack of entry states plus the popstate
// listeners. `deferBack` holds a programmatic back() in the queue until the test
// calls settle() — real browsers process one asynchronously, which is what makes
// a remount mid-gesture (dev fast-refresh) worth pinning down.
function fakeBrowser({ state = {}, deferBack = false } = {}) {
  const entries = [state]
  const listeners = new Set()
  let pending = 0
  let exited = false

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
      back:      () => { queue(); if (!deferBack) settle() },
      onPop:     (fn) => { listeners.add(fn); return () => listeners.delete(fn) },
    },
    press: () => { queue(); settle() },   // the user's gesture
    settle,
    depth:  () => entries.length,
    state:  () => entries[entries.length - 1],
    exited: () => exited,
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

    expect(b.depth()).toBe(1)
  })

  it('leaves the screen on the back press AFTER a UI close — no dead press', () => {
    const b = fakeBrowser()
    let closed = 0
    const dispose = createBackTrapper(b.env)(() => { closed += 1 })

    dispose()
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
    expect(b.exited()).toBe(false)

    b.press()
    expect(closed).toEqual(['viewer', 'sheet'])
    disposeSheet()
    expect(b.exited()).toBe(false)
  })

  it('does not undo a navigation made while the overlay was open', () => {
    const b = fakeBrowser()
    const dispose = createBackTrapper(b.env)(() => {})

    // The overlay routed somewhere: react-router pushes its own entry, which
    // carries none of our marker.
    b.env.pushState({ idx: 9 })
    dispose()

    expect(b.depth()).toBe(3)
    expect(b.state()).toEqual({ idx: 9 })
  })

  it('ignores a back still in flight from the previous mount', () => {
    const b = fakeBrowser({ deferBack: true })
    const trap = createBackTrapper(b.env)
    let closed = 0

    const dispose = trap(() => {})
    dispose()                           // queues a back…
    trap(() => { closed += 1 })         // …and the overlay remounts first
    b.settle()

    expect(closed).toBe(0)
  })
})

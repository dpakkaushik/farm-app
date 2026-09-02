import { describe, it, expect } from 'vitest'
import { onNativeBack, registerNativeBack } from '../nativeBack'

// A stand-in for the Capacitor App plugin plus the bits of the platform we
// touch. `fire(canGoBack)` is the phone's back gesture arriving over the
// bridge.
function fakePhone({ native = true } = {}) {
  const calls = { back: 0, minimize: 0 }
  const listeners = []
  return {
    env: {
      isNative:    () => native,
      addListener: (event, fn) => { listeners.push({ event, fn }) },
      back:        () => { calls.back += 1 },
      minimize:    () => { calls.minimize += 1 },
    },
    fire: (canGoBack) => listeners.forEach(l => l.fn({ canGoBack })),
    listeners,
    calls,
  }
}

describe('onNativeBack', () => {
  it('turns the gesture into a history back while there is history to pop', () => {
    const p = fakePhone()
    onNativeBack({ canGoBack: true }, p.env)
    expect(p.calls).toEqual({ back: 1, minimize: 0 })
  })

  it('minimises at the root instead of leaving a dead gesture', () => {
    // The plugin's own no-listener default does NOTHING when history is empty —
    // the swipe is swallowed. Normal Android behaviour is to background the app.
    const p = fakePhone()
    onNativeBack({ canGoBack: false }, p.env)
    expect(p.calls).toEqual({ back: 0, minimize: 1 })
  })
})

describe('registerNativeBack', () => {
  it('listens for backButton on the phone and routes the event', () => {
    const p = fakePhone()
    registerNativeBack(p.env)

    expect(p.listeners.map(l => l.event)).toEqual(['backButton'])
    p.fire(true)
    p.fire(false)
    expect(p.calls).toEqual({ back: 1, minimize: 1 })
  })

  it('registers nothing in a plain browser — the browser already owns back', () => {
    const p = fakePhone({ native: false })
    registerNativeBack(p.env)
    expect(p.listeners).toEqual([])
  })
})

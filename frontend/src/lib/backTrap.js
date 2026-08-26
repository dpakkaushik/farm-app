// Android's back gesture — the edge swipe every phone user makes reflexively —
// reaches a web app as a plain history "back". With no help it leaves the
// screen entirely: the sheet or form on top vanishes along with whatever was
// half-filled into it. This parks one extra history entry while an overlay is
// open, so the gesture spends that entry and closes the overlay instead.
//
// The browser plumbing is injected rather than reached for directly, so the
// whole thing is testable in a plain node environment. `hooks/useBackClose.js`
// wires in the real window.history.
//
// The entry's state COPIES whatever state is already there and adds one field.
// react-router keeps its own bookkeeping (`idx`, `key`) in history state and
// reads it back on popstate — clobbering that would confuse the router about
// where it is.

export const MARKER = 'overlayDepth'

const drop = (stack, token) => {
  const i = stack.indexOf(token)
  if (i !== -1) stack.splice(i, 1)
}

const depthOf = (state) => state?.[MARKER] || 0

/**
 * @param {{ pushState: (state:object)=>void, getState: ()=>object|null,
 *           back: ()=>void, onPop: (fn:()=>void)=>()=>void }} env
 * @returns {(onClose:()=>void) => () => void} trapBack(onClose) → dispose
 */
export function createBackTrapper(env) {
  const stack = []   // overlays currently open, most recent last

  return function trapBack(onClose) {
    const token = { onClose, popped: false }
    stack.push(token)
    const depth = stack.length
    env.pushState({ ...env.getState(), [MARKER]: depth })

    const off = env.onPop(() => {
      // One back press fires popstate on EVERY listener, so only the overlay on
      // top may act — otherwise a photo viewer opened over a sheet would close
      // both at once.
      if (stack[stack.length - 1] !== token) return
      // And only when the history actually moved above our own entry. A back
      // that is still in flight from a previous mount (dev fast-refresh) lands
      // on an entry at our depth, and must not close a freshly opened overlay.
      if (depthOf(env.getState()) >= depth) return
      token.popped = true
      drop(stack, token)
      off()
      token.onClose()
    })

    return function dispose() {
      off()
      drop(stack, token)
      // Closed from the UI instead — ✕, backdrop, Apply, Save. Our parked entry
      // is still the current one, so spend it; leaving it behind would make the
      // user's next back press look dead. Two cases deliberately skip this: the
      // gesture already spent it, and something navigated while we were open
      // (the marker is gone, and going back would undo that navigation).
      if (!token.popped && depthOf(env.getState()) === depth) env.back()
    }
  }
}

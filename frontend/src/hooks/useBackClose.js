import { useEffect, useRef } from 'react'
import { createBackTrapper } from '../lib/backTrap'

// One trapper for the whole app: it keeps the stack of open overlays, so a back
// press only ever closes the topmost one. See lib/backTrap.js for the mechanics.
const trapBack = createBackTrapper({
  pushState: (state) => window.history.pushState(state, ''),
  getState:  () => window.history.state,
  back:      () => window.history.back(),
  onPop:     (fn) => {
    window.addEventListener('popstate', fn)
    return () => window.removeEventListener('popstate', fn)
  },
})

/**
 * Make Android's back gesture close this overlay instead of leaving the screen.
 *
 * Most overlays here exist only while open, so mounting IS opening and the
 * default `active` is right. Pass the flag when a component stays mounted and
 * toggles (the profile drawer).
 *
 * @param {() => void} onClose  what the ✕ does
 * @param {boolean} active
 */
export default function useBackClose(onClose, active = true) {
  const latest = useRef(onClose)
  latest.current = onClose

  useEffect(() => {
    if (!active) return
    return trapBack(() => latest.current())
  }, [active])
}

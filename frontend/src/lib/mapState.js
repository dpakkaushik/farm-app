// The Field map remembers where you left it, per farm (farms.map_state). Saving
// that is debounced a second after you stop moving, and the debounce is where it
// went wrong: the save read the active farm id when the TIMER FIRED, not when
// the position was captured. Move the map on one farm, switch or delete inside
// that second, and the first farm's coordinates were written onto the second
// farm's row.
//
// That is not hypothetical — it happened to the live database on 21 Sep, and
// left Pallia Farm pointing at a Delhi centre 350km from its own plots. The map
// then flew exactly where it had been told to, which reads as "stuck".
//
// So a position belongs to the farm it was captured on, and to no other.

/**
 * May this captured map position be written to the farm that is active now?
 *
 * Fails safe on a missing id: not remembering where the map was is a trivial
 * loss, writing it to the wrong farm is data corruption.
 *
 * @param {{capturedFarmId?: string, activeFarmId?: string}} ids
 * @returns {boolean}
 */
export function canSaveMapState({ capturedFarmId, activeFarmId } = {}) {
  if (!capturedFarmId || !activeFarmId) return false
  return capturedFarmId === activeFarmId
}

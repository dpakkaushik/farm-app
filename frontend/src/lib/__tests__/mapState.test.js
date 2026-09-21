import { describe, it, expect } from 'vitest'
import { canSaveMapState } from '../mapState'

// The bug this pins, in the owner's words: "i deleted my newly created farm …
// my field screen is still stuck at newly added farm screen … even when i am
// clicking over pallia farm i cant move to the farm on map."
//
// It was not stuck. The Field map saves its position one second after you stop
// moving it, and that save read the active farm id AT THE MOMENT IT FIRED. Move
// the map on farm B, switch or delete within that second, and B's coordinates
// were written onto farm A's row. Pallia Farm's centre really had been replaced
// with a Delhi one, 350km from its plots, so the map was flying exactly where it
// had been told to.
describe('canSaveMapState', () => {
  it('saves when the farm that was on screen is still the active one', () => {
    expect(canSaveMapState({ capturedFarmId: 'farm-a', activeFarmId: 'farm-a' })).toBe(true)
  })

  // The regression. Without this the save lands on whichever farm won the race.
  it('refuses when the active farm changed while the save was pending', () => {
    expect(canSaveMapState({ capturedFarmId: 'farm-b', activeFarmId: 'farm-a' })).toBe(false)
  })

  // Deleting the active farm is the same race with a different trigger — it was
  // how the live data actually got corrupted.
  it('refuses after the captured farm has been deleted', () => {
    expect(canSaveMapState({ capturedFarmId: 'deleted-farm', activeFarmId: 'pallia' })).toBe(false)
  })

  // Fails safe: a caller that forgot to capture cannot write anywhere. Losing a
  // remembered map position is trivial; writing it to the wrong farm is not.
  it('refuses when either id is missing', () => {
    expect(canSaveMapState({ capturedFarmId: 'farm-a', activeFarmId: null })).toBe(false)
    expect(canSaveMapState({ capturedFarmId: undefined, activeFarmId: 'farm-a' })).toBe(false)
    expect(canSaveMapState({})).toBe(false)
    expect(canSaveMapState()).toBe(false)
  })
})

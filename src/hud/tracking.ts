// Shared mutable HUD tracking registry (same pattern as machine/orientation).
// MachineObject publishes up to MAX_TRACKED (src/control/params) copy-0 meshes
// after each structural regenerate; HudLayer projects their world positions per
// frame. Not React state on purpose — this crosses the R3F/DOM boundary every
// frame.
import type * as THREE from 'three'

export interface TrackedPart {
  mesh: THREE.Mesh
  partId: number
  band: number
}

export const hudTracking = {
  parts: [] as TrackedPart[],
  /** Bumped on every regenerate so the HUD re-acquires all targets. */
  generation: 0,
}

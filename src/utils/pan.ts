import type { Point } from './layout'
import { toScreen } from './viewport'
import type { View } from './viewport'

/** A pan offset in screen pixels, applied on top of the auto-fitted view. */
export interface Pan {
  dx: number
  dy: number
}

export const NO_PAN: Pan = { dx: 0, dy: 0 }

/** How far inside the stage edge the last visible node is kept. */
export const PAN_MARGIN_PX = 48

export const isPanned = (pan: Pan): boolean => pan.dx !== 0 || pan.dy !== 0

/** The view shifted by the pan; the scale is untouched. */
export const applyPan = (view: View, pan: Pan): View => ({ scale: view.scale, tx: view.tx + pan.dx, ty: view.ty + pan.dy })

// The pan range that keeps a point at `at` inside [margin, extent - margin].
function clampAxis(d: number, at: number, extent: number, margin: number): number {
  const min = margin - at
  const max = extent - margin - at
  return min > max ? (min + max) / 2 : Math.min(max, Math.max(min, d))
}

/**
 * Limits a pan so at least one node (under the fitted view) stays `margin` px inside the stage: the pan is moved to the
 * nearest offset that brings some node inside, so the graph can be dragged part way off but never lost.
 */
export function clampPan(pan: Pan, positions: Record<string, Point>, fitted: View, size: { width: number; height: number }, margin = PAN_MARGIN_PX): Pan {
  let best: Pan | undefined
  let bestDist = Infinity
  for (const p of Object.values(positions)) {
    const at = toScreen(fitted, p)
    const candidate = { dx: clampAxis(pan.dx, at.x, size.width, margin), dy: clampAxis(pan.dy, at.y, size.height, margin) }
    const dist = Math.hypot(candidate.dx - pan.dx, candidate.dy - pan.dy)
    if (dist === 0) return pan
    if (dist < bestDist) [best, bestDist] = [candidate, dist]
  }
  return best ?? NO_PAN
}

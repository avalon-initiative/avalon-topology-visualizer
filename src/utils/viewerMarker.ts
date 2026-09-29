import type { Point } from './layout'

export const VIEWER_MARKER_LABEL = 'This browser'

export interface MarkerOptions {
  /** World distance from the entry node. */
  distance: number
  /** World distance no other node may be closer than. */
  clearance: number
  /** Spots that fail this (say, off the visible map) are skipped while any other spot exists. */
  accept?: (p: Point) => boolean
}

const STEP = Math.PI / 6

/**
 * A spot for a temporary viewer marker beside the entry node: pushed away from the centre of the graph so it sits
 * outside the cluster, then turned in 30 degree steps until nothing else is within the clearance and it is on screen. Deterministic.
 */
export function placeViewerMarker(entry: Point, nodes: readonly Point[], opts: MarkerOptions): Point {
  const cx = nodes.length ? nodes.reduce((s, p) => s + p.x, 0) / nodes.length : entry.x
  const cy = nodes.length ? nodes.reduce((s, p) => s + p.y, 0) / nodes.length : entry.y
  const away = Math.hypot(entry.x - cx, entry.y - cy) < 1e-6 ? -Math.PI / 2 : Math.atan2(entry.y - cy, entry.x - cx)
  const gap = (p: Point) => nodes.reduce((m, n) => Math.min(m, Math.hypot(n.x - p.x, n.y - p.y)), Infinity)
  const fits = (p: Point) => opts.accept?.(p) ?? true
  let best: Point | undefined
  let bestScore = -Infinity
  for (let k = 0; k < 12; k++) {
    const turn = Math.ceil(k / 2) * STEP * (k % 2 === 1 ? 1 : -1)
    const a = away + turn
    const p = { x: entry.x + Math.cos(a) * opts.distance, y: entry.y + Math.sin(a) * opts.distance }
    const g = gap(p)
    if (g >= opts.clearance && fits(p)) return p
    // Otherwise prefer a spot that is on screen, then the roomiest one.
    const score = (fits(p) ? 1e9 : 0) + Math.min(g, opts.clearance)
    if (score > bestScore) [best, bestScore] = [p, score]
  }
  return best as Point
}

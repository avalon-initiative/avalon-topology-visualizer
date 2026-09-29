import type { Point } from './layout'

export const easeInOut = (t: number): number => (t <= 0 ? 0 : t >= 1 ? 1 : t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2)

/** Positions part-way from `from` to `to`. Nodes only in `to` sit at their final place; nodes only in `from` are gone. */
export function interpolatePositions(from: Record<string, Point>, to: Record<string, Point>, t: number): Record<string, Point> {
  const k = easeInOut(t)
  const out: Record<string, Point> = {}
  for (const [id, end] of Object.entries(to)) {
    const start = from[id]
    out[id] = start ? { x: start.x + (end.x - start.x) * k, y: start.y + (end.y - start.y) * k } : end
  }
  return out
}

import type { Point } from './layout'

export interface View {
  scale: number
  tx: number
  ty: number
}

/** The most a small graph is zoomed in, so a tight cluster stays readable without a lone node blowing up. */
export const MAX_FIT_SCALE = 3

/** Scales and centres the layout to fit a canvas, zooming in no further than MAX_FIT_SCALE. */
export function fitView(positions: Record<string, Point>, width: number, height: number, padding = 70): View {
  const points = Object.values(positions)
  if (points.length === 0) return { scale: 1, tx: width / 2, ty: height / 2 }
  const xs = points.map((p) => p.x)
  const ys = points.map((p) => p.y)
  const spanX = Math.max(...xs) - Math.min(...xs)
  const spanY = Math.max(...ys) - Math.min(...ys)
  const scale = Math.min(MAX_FIT_SCALE, (width - 2 * padding) / Math.max(spanX, 1), (height - 2 * padding) / Math.max(spanY, 1))
  const cx = (Math.max(...xs) + Math.min(...xs)) / 2
  const cy = (Math.max(...ys) + Math.min(...ys)) / 2
  return { scale, tx: width / 2 - cx * scale, ty: height / 2 - cy * scale }
}

export const toScreen = (view: View, p: Point): Point => ({ x: p.x * view.scale + view.tx, y: p.y * view.scale + view.ty })
export const toWorld = (view: View, p: Point): Point => ({ x: (p.x - view.tx) / view.scale, y: (p.y - view.ty) / view.scale })

/** The node under a screen point, nearest first, or undefined. */
export function nodeAt(positions: Record<string, Point>, view: View, point: Point, radiusPx = 12): string | undefined {
  let best: string | undefined
  let bestDist = radiusPx
  for (const [id, p] of Object.entries(positions)) {
    const s = toScreen(view, p)
    const d = Math.hypot(s.x - point.x, s.y - point.y)
    if (d <= bestDist) {
      best = id
      bestDist = d
    }
  }
  return best
}

export interface ScaleBar {
  /** Bar length in screen pixels. */
  px: number
  ms: number
}

/** A round-number millisecond bar no longer than `maxPx`: 1, 2, 5, 10, 20, 50 ... */
export function scaleBar(pxPerMs: number, view: View, maxPx = 120): ScaleBar {
  const pxPerMsOnScreen = pxPerMs * view.scale
  const maxMs = maxPx / pxPerMsOnScreen
  if (!Number.isFinite(maxMs) || maxMs <= 0) return { px: 0, ms: 0 }
  const magnitude = 10 ** Math.floor(Math.log10(maxMs))
  const ms = [5, 2, 1].map((m) => m * magnitude).find((v) => v <= maxMs) ?? magnitude
  return { px: ms * pxPerMsOnScreen, ms }
}

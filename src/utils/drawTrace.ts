import type { Point } from './layout'
import type { DrawTheme } from './drawGraph'
import type { Frame } from './traceAnimation'
import { toScreen } from './viewport'
import type { View } from './viewport'

export interface TraceDrawing {
  /** Viewer first, then the returned hops in order. */
  path: string[]
  frame: Frame | null
  /** The last hop of a trace that ended before its target, once the animation has finished. */
  stoppedAt?: string
}

const PACKET_RADIUS = 5
const REACHED_RING = 11

/** Where the packet is on screen; null when neither end of its segment has a position. */
export function packetPoint(frame: Frame, positions: Record<string, Point>): Point | null {
  const a = positions[frame.from]
  const b = positions[frame.to]
  if (a && b) return { x: a.x + (b.x - a.x) * frame.fraction, y: a.y + (b.y - a.y) * frame.fraction }
  return a ?? b ?? null
}

/** The trace path, the nodes reached so far, the packet and, for a stopped trace, its stopping point. */
export function drawTrace(ctx: CanvasRenderingContext2D, trace: TraceDrawing, positions: Record<string, Point>, view: View, theme: DrawTheme) {
  ctx.save()
  ctx.strokeStyle = theme.success
  ctx.lineWidth = 2.5
  ctx.setLineDash([6, 4])
  ctx.beginPath()
  let pen = false
  for (const id of trace.path) {
    const p = positions[id]
    if (!p) continue
    const s = toScreen(view, p)
    if (pen) ctx.lineTo(s.x, s.y)
    else ctx.moveTo(s.x, s.y)
    pen = true
  }
  ctx.stroke()
  ctx.setLineDash([])

  for (const id of trace.frame?.reachedOut ?? []) {
    const p = positions[id]
    if (!p) continue
    const s = toScreen(view, p)
    ctx.beginPath()
    ctx.arc(s.x, s.y, REACHED_RING, 0, Math.PI * 2)
    ctx.strokeStyle = theme.success
    ctx.lineWidth = 2
    ctx.stroke()
  }

  const stop = trace.stoppedAt ? positions[trace.stoppedAt] : undefined
  if (stop) {
    const s = toScreen(view, stop)
    ctx.beginPath()
    ctx.arc(s.x, s.y, REACHED_RING + 4, 0, Math.PI * 2)
    ctx.strokeStyle = theme.danger
    ctx.lineWidth = 3
    ctx.stroke()
  }

  const at = trace.frame ? packetPoint(trace.frame, positions) : null
  if (at) {
    const s = toScreen(view, at)
    ctx.beginPath()
    ctx.arc(s.x, s.y, PACKET_RADIUS, 0, Math.PI * 2)
    ctx.fillStyle = theme.warning
    ctx.fill()
    ctx.strokeStyle = theme.label
    ctx.lineWidth = 1.5
    ctx.stroke()
  }
  ctx.restore()
}

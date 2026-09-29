import type { Point } from './layout'
import type { DrawTheme } from './drawGraph'
import type { Frame } from './traceAnimation'
import { hopLabel } from './traceSummary'
import type { HopRow } from './traceSummary'
import { toScreen } from './viewport'
import type { View } from './viewport'

export interface TraceDrawing {
  /** Viewer first, then the returned hops in order. */
  path: string[]
  frame: Frame | null
  /** The last hop of a trace that ended before its target, once the animation has finished. */
  stoppedAt?: string
  /** Short words for the end marker of a stopped trace, such as "No route". */
  stoppedLabel?: string
  /** A temporary marker for this browser, drawn when the map has no viewer node of its own. */
  viewer?: { id: string; at: Point; label: string }
  /** The returned hops, numbered on the map as the packet reaches them. */
  hops?: HopRow[]
  /** Index of the hop the packet is at or has just left. */
  activeHop?: number | null
  /** Frames just behind the packet, newest first; drawn as a fading tail. */
  trail?: Frame[]
}

const PACKET_RADIUS = 7
const REACHED_RING = 11
const HOP_BADGE_RADIUS = 9
const TRAIL_WIDTH = 6
const VIEWER_SIZE = 9
const STOP_ABOVE = REACHED_RING + 26
const STOP_BELOW = 76
const PILL_ALPHA = 0.88
const PILL_CHAR_PX = 6.2

function pill(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, fill: string, ink: string) {
  ctx.save()
  ctx.font = '11px sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  const w = text.length * PILL_CHAR_PX + 10
  ctx.globalAlpha = PILL_ALPHA
  ctx.fillStyle = fill
  ctx.fillRect(x - w / 2, y - 8, w, 16)
  ctx.globalAlpha = 1
  ctx.fillStyle = ink
  ctx.fillText(text, x, y)
  ctx.restore()
}

function drawViewer(ctx: CanvasRenderingContext2D, viewer: NonNullable<TraceDrawing['viewer']>, view: View, theme: DrawTheme) {
  const s = toScreen(view, viewer.at)
  ctx.save()
  ctx.beginPath()
  ctx.moveTo(s.x, s.y - VIEWER_SIZE)
  ctx.lineTo(s.x + VIEWER_SIZE, s.y)
  ctx.lineTo(s.x, s.y + VIEWER_SIZE)
  ctx.lineTo(s.x - VIEWER_SIZE, s.y)
  ctx.closePath()
  ctx.fillStyle = theme.mirror
  ctx.fill()
  ctx.strokeStyle = theme.label
  ctx.lineWidth = 1.5
  ctx.stroke()
  pill(ctx, viewer.label, s.x, s.y + VIEWER_SIZE + 12, theme.badgeText, theme.label)
  ctx.restore()
}

function drawTrail(ctx: CanvasRenderingContext2D, frame: Frame, trail: Frame[], positions: Record<string, Point>, view: View, theme: DrawTheme) {
  let prev = packetPoint(frame, positions)
  ctx.save()
  ctx.strokeStyle = theme.warning
  ctx.lineWidth = TRAIL_WIDTH
  ctx.lineCap = 'round'
  trail.forEach((f, i) => {
    const next = packetPoint(f, positions)
    if (prev && next && (prev.x !== next.x || prev.y !== next.y)) {
      const a = toScreen(view, prev)
      const b = toScreen(view, next)
      ctx.globalAlpha = 0.7 * (1 - i / trail.length)
      ctx.beginPath()
      ctx.moveTo(a.x, a.y)
      ctx.lineTo(b.x, b.y)
      ctx.stroke()
    }
    prev = next
  })
  ctx.restore()
}

function drawHops(ctx: CanvasRenderingContext2D, trace: TraceDrawing, positions: Record<string, Point>, view: View, theme: DrawTheme) {
  const reached = new Set(trace.frame?.reachedOut ?? [])
  const seen: Record<string, number> = {}
  for (const row of trace.hops ?? []) {
    const p = positions[row.url]
    const nth = seen[row.url] ?? 0
    seen[row.url] = nth + 1
    if (!p || !reached.has(row.url)) continue
    const s = toScreen(view, p)
    const x = s.x + REACHED_RING + 2 + nth * (HOP_BADGE_RADIUS * 2 + 2)
    const y = s.y - REACHED_RING - 2
    const active = trace.activeHop === row.index
    ctx.save()
    ctx.beginPath()
    ctx.arc(x, y, HOP_BADGE_RADIUS, 0, Math.PI * 2)
    ctx.fillStyle = active ? theme.warning : theme.success
    ctx.fill()
    ctx.strokeStyle = theme.label
    ctx.lineWidth = active ? 2 : 1
    ctx.stroke()
    ctx.fillStyle = theme.badgeText
    ctx.font = 'bold 11px sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(String(row.index + 1), x, y + 0.5)
    ctx.restore()
    pill(ctx, hopLabel(row), s.x, s.y + 40 + nth * 18, theme.badgeText, theme.label)
  }
}

/** Where the packet is on screen; null when neither end of its segment has a position. */
export function packetPoint(frame: Frame, positions: Record<string, Point>): Point | null {
  const a = positions[frame.from]
  const b = positions[frame.to]
  if (a && b) return { x: a.x + (b.x - a.x) * frame.fraction, y: a.y + (b.y - a.y) * frame.fraction }
  return a ?? b ?? null
}

/** The trace path, the nodes reached so far, the packet and, for a stopped trace, its stopping point. */
export function drawTrace(ctx: CanvasRenderingContext2D, trace: TraceDrawing, allPositions: Record<string, Point>, view: View, theme: DrawTheme) {
  const positions = trace.viewer ? { ...allPositions, [trace.viewer.id]: trace.viewer.at } : allPositions
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
    // The tag goes on the side away from the viewer marker so the two never share space.
    const viewerAbove = trace.viewer ? toScreen(view, trace.viewer.at).y < s.y : false
    ctx.beginPath()
    ctx.arc(s.x, s.y, REACHED_RING + 4, 0, Math.PI * 2)
    ctx.strokeStyle = theme.danger
    ctx.lineWidth = 3
    ctx.stroke()
    if (trace.stoppedLabel) pill(ctx, `Stopped: ${trace.stoppedLabel}`, s.x, s.y + (viewerAbove ? STOP_BELOW : -STOP_ABOVE), theme.danger, theme.badgeText)
  }

  if (trace.frame && trace.trail?.length) drawTrail(ctx, trace.frame, trace.trail, positions, view, theme)
  if (trace.viewer) drawViewer(ctx, trace.viewer, view, theme)
  drawHops(ctx, trace, positions, view, theme)

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

import type { Point } from './layout'
import { shapePoints } from './shapes'
import { VIEWER_ID, VIEWER_LABEL } from './rttStats'
import { drawTrace } from './drawTrace'
import type { TraceDrawing } from './drawTrace'
import { linkKey } from './pulses'
import type { PulseDrawing } from './pulses'
import { toScreen } from './viewport'
import type { View } from './viewport'
import type { LinkStyle, NodeStyle } from './styleGraph'
import type { AlertKind } from './alerts'

export interface DrawTheme {
  link: string
  node: string
  pinned: string
  label: string
  background: string
  mirror: string
  warning: string
  danger: string
  success: string
  muted: string
  /** Letter colour on alert badges. */
  badgeText: string
}

export const DEFAULT_THEME: DrawTheme = {
  link: '#34407a',
  node: '#4f88ff',
  pinned: '#f5a623',
  label: '#e8ebf7',
  background: 'transparent',
  mirror: '#885cf6',
  warning: '#f5a623',
  danger: '#f26d78',
  success: '#2ecc71',
  muted: '#94a3b8',
  badgeText: '#0b1220',
}

export interface DrawInput {
  positions: Record<string, Point>
  /** Plain links, drawn as active lines. Ignored when `linkStyles` is given. */
  links: { a: string; b: string }[]
  linkStyles?: LinkStyle[]
  nodeStyles?: Record<string, NodeStyle>
  pinned: ReadonlySet<string>
  selected?: string
  view: View
  width: number
  height: number
  theme?: DrawTheme
  trace?: TraceDrawing
  pulse?: PulseDrawing
}

export const NODE_DRAW_RADIUS = 7
export const PIN_RING_OFFSET = 10
export const SELECT_RING_OFFSET = 7
const VERSION_RING_OFFSET = 3
const LAG_ARC_OFFSET = 6
const MIRROR_OFFSET_PX = 3
const ARROW_LENGTH_PX = 9
const DIMMED_ALPHA = 0.4
const LINK_LABEL_OFFSET_PX = 4
const FADED_ALPHA = 0.15
const BADGE_RADIUS = 6
const BADGE_TEXT: Record<AlertKind, string> = { equivocation: '!', stale: 'S' }

export function nodeLabel(id: string): string {
  if (id === VIEWER_ID) return VIEWER_LABEL
  try {
    return new URL(id).host
  } catch {
    return id
  }
}

function drawLink(ctx: CanvasRenderingContext2D, style: LinkStyle, a: Point, b: Point, theme: DrawTheme) {
  ctx.save()
  ctx.globalAlpha = style.faded ? Math.min(style.alpha, FADED_ALPHA) : style.alpha
  ctx.lineWidth = style.width
  ctx.strokeStyle = style.kind === 'mirror' ? theme.mirror : theme.link
  ctx.setLineDash(style.kind === 'known' ? [4, 4] : [])
  let [x1, y1, x2, y2] = [a.x, a.y, b.x, b.y]
  if (style.kind === 'mirror') {
    // Offset sideways so an active line between the same two nodes stays visible.
    const len = Math.hypot(x2 - x1, y2 - y1) || 1
    const [ox, oy] = [(-(y2 - y1) / len) * MIRROR_OFFSET_PX, ((x2 - x1) / len) * MIRROR_OFFSET_PX]
    ;[x1, y1, x2, y2] = [x1 + ox, y1 + oy, x2 + ox, y2 + oy]
  }
  ctx.beginPath()
  ctx.moveTo(x1, y1)
  ctx.lineTo(x2, y2)
  ctx.stroke()
  if (style.kind === 'mirror' && style.direction) {
    const forward = style.direction.from === style.a
    const [sx, sy, tx, ty] = forward ? [x1, y1, x2, y2] : [x2, y2, x1, y1]
    const [mx, my] = [sx + (tx - sx) * 0.6, sy + (ty - sy) * 0.6]
    const angle = Math.atan2(ty - sy, tx - sx)
    ctx.fillStyle = theme.mirror
    ctx.beginPath()
    ctx.moveTo(mx + Math.cos(angle) * ARROW_LENGTH_PX * 0.6, my + Math.sin(angle) * ARROW_LENGTH_PX * 0.6)
    ctx.lineTo(mx + Math.cos(angle + 2.5) * ARROW_LENGTH_PX, my + Math.sin(angle + 2.5) * ARROW_LENGTH_PX)
    ctx.lineTo(mx + Math.cos(angle - 2.5) * ARROW_LENGTH_PX, my + Math.sin(angle - 2.5) * ARROW_LENGTH_PX)
    ctx.closePath()
    ctx.fill()
  }
  ctx.restore()
}

function tracePath(ctx: CanvasRenderingContext2D, at: Point, style: NodeStyle | undefined) {
  const points = style ? shapePoints(style.shape, NODE_DRAW_RADIUS) : []
  ctx.beginPath()
  if (points.length === 0) {
    ctx.arc(at.x, at.y, NODE_DRAW_RADIUS, 0, Math.PI * 2)
    return
  }
  points.forEach((p, i) => (i === 0 ? ctx.moveTo(at.x + p.x, at.y + p.y) : ctx.lineTo(at.x + p.x, at.y + p.y)))
  ctx.closePath()
}

function ring(ctx: CanvasRenderingContext2D, at: Point, radius: number, color: string, width: number, dash: number[]) {
  ctx.beginPath()
  ctx.arc(at.x, at.y, radius, 0, Math.PI * 2)
  ctx.strokeStyle = color
  ctx.lineWidth = width
  ctx.setLineDash(dash)
  ctx.stroke()
  ctx.setLineDash([])
}

function drawNode(ctx: CanvasRenderingContext2D, id: string, at: Point, style: NodeStyle | undefined, theme: DrawTheme) {
  ctx.save()
  ctx.globalAlpha = style?.faded ? FADED_ALPHA : style?.dimmed ? DIMMED_ALPHA : 1
  tracePath(ctx, at, style)
  ctx.fillStyle = theme.node
  ctx.strokeStyle = theme.node
  ctx.lineWidth = 2
  if (style?.hollow) ctx.stroke()
  else ctx.fill()
  if (style?.version === 'newest') ring(ctx, at, NODE_DRAW_RADIUS + VERSION_RING_OFFSET, theme.success, 1, [])
  else if (style?.version === 'behind') ring(ctx, at, NODE_DRAW_RADIUS + VERSION_RING_OFFSET, theme.warning, 2, [3, 3])
  else if (style?.version === 'unknown') ring(ctx, at, NODE_DRAW_RADIUS + VERSION_RING_OFFSET, theme.muted, 1.5, [1, 3])
  if (style && style.lag > 0) {
    ctx.beginPath()
    ctx.arc(at.x, at.y, NODE_DRAW_RADIUS + LAG_ARC_OFFSET, -Math.PI / 2, -Math.PI / 2 + style.lag * Math.PI * 2)
    ctx.strokeStyle = theme.danger
    ctx.lineWidth = 3
    ctx.stroke()
  }
  ctx.fillStyle = theme.label
  ctx.fillText(nodeLabel(id), at.x, at.y + NODE_DRAW_RADIUS + 16)
  ctx.restore()
}

/** A lettered badge per open alert at the node's upper right; the letter, not only the colour, says which. */
function drawAlertBadges(ctx: CanvasRenderingContext2D, at: Point, alerts: AlertKind[], theme: DrawTheme) {
  ctx.save()
  alerts.forEach((kind, i) => {
    const [x, y] = [at.x + NODE_DRAW_RADIUS + 4 + i * (BADGE_RADIUS * 2 + 2), at.y - NODE_DRAW_RADIUS - 4]
    ctx.beginPath()
    ctx.arc(x, y, BADGE_RADIUS, 0, Math.PI * 2)
    ctx.fillStyle = kind === 'equivocation' ? theme.danger : theme.warning
    ctx.fill()
    ctx.fillStyle = theme.badgeText
    ctx.textBaseline = 'middle'
    ctx.fillText(BADGE_TEXT[kind], x, y + 0.5)
  })
  ctx.restore()
}

/** A pulse on a link: a dot travelling along it and fading, or, with no progress, a static heavier line. */
function drawPulse(ctx: CanvasRenderingContext2D, a: Point, b: Point, progress: number | null, theme: DrawTheme) {
  ctx.save()
  ctx.strokeStyle = theme.success
  ctx.fillStyle = theme.success
  if (progress === null) {
    ctx.globalAlpha = 0.7
    ctx.lineWidth = 3
    ctx.setLineDash([6, 3])
    ctx.beginPath()
    ctx.moveTo(a.x, a.y)
    ctx.lineTo(b.x, b.y)
    ctx.stroke()
  } else {
    ctx.globalAlpha = 1 - progress
    ctx.beginPath()
    ctx.arc(a.x + (b.x - a.x) * progress, a.y + (b.y - a.y) * progress, 3.5, 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.restore()
}

export function drawGraph(ctx: CanvasRenderingContext2D, input: DrawInput): void {
  const { positions, pinned, view, width, height, selected } = input
  const theme = input.theme ?? DEFAULT_THEME
  const links: LinkStyle[] = input.linkStyles ?? input.links.map((l) => ({ kind: 'active', a: l.a, b: l.b, width: 1.5, alpha: 1 }))
  ctx.clearRect(0, 0, width, height)

  for (const link of links) {
    const a = positions[link.a]
    const b = positions[link.b]
    if (a && b) drawLink(ctx, link, toScreen(view, a), toScreen(view, b), theme)
  }
  if (input.pulse) {
    const done = new Set<string>()
    for (const link of links) {
      const key = linkKey(link.a, link.b)
      const [a, b] = [positions[link.a], positions[link.b]]
      if (!a || !b || link.faded || done.has(key) || !input.pulse.keys.has(key)) continue
      done.add(key)
      drawPulse(ctx, toScreen(view, a), toScreen(view, b), input.pulse.progress, theme)
    }
  }

  ctx.font = '11px sans-serif'
  ctx.textAlign = 'center'
  for (const [id, p] of Object.entries(positions)) {
    const at = toScreen(view, p)
    drawNode(ctx, id, at, input.nodeStyles?.[id], theme)
    if (input.nodeStyles?.[id]?.alerts?.length) drawAlertBadges(ctx, at, input.nodeStyles[id].alerts ?? [], theme)
    if (pinned.has(id)) ring(ctx, at, NODE_DRAW_RADIUS + PIN_RING_OFFSET, theme.pinned, 2.5, [])
    if (id === selected) ring(ctx, at, NODE_DRAW_RADIUS + SELECT_RING_OFFSET, theme.label, 1.5, [])
  }

  ctx.fillStyle = theme.label
  for (const link of links) {
    const a = positions[link.a]
    const b = positions[link.b]
    if (!link.label || !a || !b) continue
    const [sa, sb] = [toScreen(view, a), toScreen(view, b)]
    ctx.fillText(link.label, (sa.x + sb.x) / 2, (sa.y + sb.y) / 2 - LINK_LABEL_OFFSET_PX)
  }
  if (input.trace) drawTrace(ctx, input.trace, positions, view, theme)
}

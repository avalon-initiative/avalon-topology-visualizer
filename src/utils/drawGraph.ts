import type { Point } from './layout'
import { toScreen } from './viewport'
import type { View } from './viewport'

export interface DrawTheme {
  link: string
  node: string
  pinned: string
  label: string
  background: string
}

export const DEFAULT_THEME: DrawTheme = {
  link: '#34407a',
  node: '#4f88ff',
  pinned: '#f5a623',
  label: '#e8ebf7',
  background: 'transparent',
}

export interface DrawInput {
  positions: Record<string, Point>
  links: { a: string; b: string }[]
  pinned: ReadonlySet<string>
  view: View
  width: number
  height: number
  theme?: DrawTheme
}

export const NODE_DRAW_RADIUS = 7

export function nodeLabel(id: string): string {
  try {
    return new URL(id).host
  } catch {
    return id
  }
}

export function drawGraph(ctx: CanvasRenderingContext2D, input: DrawInput): void {
  const { positions, links, pinned, view, width, height } = input
  const theme = input.theme ?? DEFAULT_THEME
  ctx.clearRect(0, 0, width, height)

  ctx.strokeStyle = theme.link
  ctx.lineWidth = 1.5
  for (const link of links) {
    const a = positions[link.a]
    const b = positions[link.b]
    if (!a || !b) continue
    const sa = toScreen(view, a)
    const sb = toScreen(view, b)
    ctx.beginPath()
    ctx.moveTo(sa.x, sa.y)
    ctx.lineTo(sb.x, sb.y)
    ctx.stroke()
  }

  ctx.font = '11px sans-serif'
  ctx.textAlign = 'center'
  for (const [id, p] of Object.entries(positions)) {
    const s = toScreen(view, p)
    ctx.beginPath()
    ctx.arc(s.x, s.y, NODE_DRAW_RADIUS, 0, Math.PI * 2)
    ctx.fillStyle = theme.node
    ctx.fill()
    if (pinned.has(id)) {
      ctx.beginPath()
      ctx.arc(s.x, s.y, NODE_DRAW_RADIUS + 3, 0, Math.PI * 2)
      ctx.strokeStyle = theme.pinned
      ctx.lineWidth = 2
      ctx.stroke()
    }
    ctx.fillStyle = theme.label
    ctx.fillText(nodeLabel(id), s.x, s.y + NODE_DRAW_RADIUS + 13)
  }
}

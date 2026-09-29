import type { Point } from './layout'

export interface LabelItem {
  id: string
  /** Node centre in screen pixels. */
  at: Point
  /** Clearance the label keeps from the node centre. */
  radius: number
  text: string
  short: string
  /** Higher places first; `MUST_RANK` and above always get a full label. */
  rank: number
}

export interface LabelOptions {
  width: number
  height: number
  /** Text width in pixels; keeps this module free of the DOM. */
  measure?: (text: string) => number
  /** Slot each id used last frame, tried first so labels do not jump when nothing moved. */
  previous?: ReadonlyMap<string, string>
}

export interface Rect {
  x: number
  y: number
  w: number
  h: number
}

export type LabelMode = 'full' | 'short' | 'hidden'

export interface LabelPlacement {
  id: string
  mode: LabelMode
  text: string
  /** Text box in screen pixels; a zero-size box at the node when hidden. */
  box: Rect
  slot: string
  /** Line from the node edge to the box, only for a label moved away from its node. */
  leader?: { from: Point; to: Point }
}

export const MUST_RANK = 1
export const LABEL_HEIGHT = 14
export const LABEL_PAD_X = 3
const EDGE_MARGIN = 2
const LABEL_GAP = 1
const RING_GAPS = [3, 20, 42]
const CHAR_WIDTH_PX = 6.2
const DIAGONAL = Math.SQRT1_2
type Direction = 'below' | 'above' | 'right' | 'left' | 'below-right' | 'below-left' | 'above-right' | 'above-left'
const DIRECTIONS: Direction[] = ['below', 'above', 'right', 'left', 'below-right', 'below-left', 'above-right', 'above-left']
// Readable first: a full label beside its node, then a short one, and only then a full one on a leader line.
const STAGES: { short: boolean; ring: number }[] = [
  { short: false, ring: 0 },
  { short: false, ring: 1 },
  { short: true, ring: 0 },
  { short: true, ring: 1 },
  { short: false, ring: 2 },
  { short: true, ring: 2 },
]

/** A rough width when no measuring function is given. */
export const estimateWidth = (text: string): number => text.length * CHAR_WIDTH_PX

/** '192.168.7.194:8080' -> '.194', 'node-a.example.com:8080' -> 'node-a', anything else is trimmed. */
export function shortLabel(label: string): string {
  const host = label.replace(/:\d+$/, '')
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host)) return `.${host.split('.')[3]}`
  const first = host.split('.')[0]
  if (first && first !== host && !/^\d+$/.test(first)) return first
  return host.length > 8 ? `${host.slice(0, 7)}…` : host
}

function boxAt(item: LabelItem, direction: Direction, ring: number, w: number): Rect {
  const h = LABEL_HEIGHT
  const d = item.radius + RING_GAPS[ring]
  const c = d * DIAGONAL
  const { x, y } = item.at
  switch (direction) {
    case 'below':
      return { x: x - w / 2, y: y + d, w, h }
    case 'above':
      return { x: x - w / 2, y: y - d - h, w, h }
    case 'right':
      return { x: x + d, y: y - h / 2, w, h }
    case 'left':
      return { x: x - d - w, y: y - h / 2, w, h }
    case 'below-right':
      return { x: x + c, y: y + c, w, h }
    case 'below-left':
      return { x: x - c - w, y: y + c, w, h }
    case 'above-right':
      return { x: x + c, y: y - c - h, w, h }
    default:
      return { x: x - c - w, y: y - c - h, w, h }
  }
}

function overlaps(a: Rect, b: Rect, pad: number): boolean {
  return a.x < b.x + b.w + pad && b.x < a.x + a.w + pad && a.y < b.y + b.h + pad && b.y < a.y + a.h + pad
}

function overlapArea(a: Rect, b: Rect): number {
  const w = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)
  const h = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y)
  return w > 0 && h > 0 ? w * h : 0
}

/** True when the box comes within `radius` of the point. */
function touchesCircle(box: Rect, at: Point, radius: number): boolean {
  const nx = Math.max(box.x, Math.min(at.x, box.x + box.w))
  const ny = Math.max(box.y, Math.min(at.y, box.y + box.h))
  return Math.hypot(nx - at.x, ny - at.y) < radius
}

function inside(box: Rect, width: number, height: number): boolean {
  return box.x >= EDGE_MARGIN && box.y >= EDGE_MARGIN && box.x + box.w <= width - EDGE_MARGIN && box.y + box.h <= height - EDGE_MARGIN
}

function clampInto(box: Rect, width: number, height: number): Rect {
  const x = Math.max(EDGE_MARGIN, Math.min(box.x, width - EDGE_MARGIN - box.w))
  const y = Math.max(EDGE_MARGIN, Math.min(box.y, height - EDGE_MARGIN - box.h))
  return { ...box, x, y }
}

function leaderFor(item: LabelItem, box: Rect): { from: Point; to: Point } {
  const to = { x: Math.max(box.x, Math.min(item.at.x, box.x + box.w)), y: Math.max(box.y, Math.min(item.at.y, box.y + box.h)) }
  const len = Math.hypot(to.x - item.at.x, to.y - item.at.y) || 1
  const edge = Math.min(item.radius, len)
  return { from: { x: item.at.x + ((to.x - item.at.x) / len) * edge, y: item.at.y + ((to.y - item.at.y) / len) * edge }, to }
}

/**
 * Greedy label placement. Items go in rank order (ties by id); each takes the first slot that stays on the
 * canvas and clear of placed labels and of every node. A label with no free slot falls back to its short form,
 * then hides; a must-have label instead takes the least bad slot so it is never dropped.
 */
export function placeLabels(items: LabelItem[], options: LabelOptions): Map<string, LabelPlacement> {
  const measure = options.measure ?? estimateWidth
  const ordered = [...items].sort((a, b) => b.rank - a.rank || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
  const placed: LabelPlacement[] = []
  const result = new Map<string, LabelPlacement>()

  const free = (box: Rect, self: LabelItem) =>
    inside(box, options.width, options.height) &&
    placed.every((p) => p.mode === 'hidden' || !overlaps(box, p.box, LABEL_GAP)) &&
    items.every((n) => !touchesCircle(box, n.at, n.id === self.id ? n.radius : n.radius * 0.6))

  const commit = (item: LabelItem, mode: LabelMode, text: string, box: Rect, slot: string) => {
    const ring = slot.split(':')[1]
    const p: LabelPlacement = { id: item.id, mode, text, box, slot }
    if (mode !== 'hidden' && Number(ring) > 0) p.leader = leaderFor(item, box)
    placed.push(p)
    result.set(item.id, p)
  }

  for (const item of ordered) {
    const full = { text: item.text, w: measure(item.text) + LABEL_PAD_X * 2 }
    const short = { text: item.short, w: measure(item.short) + LABEL_PAD_X * 2 }
    const prev = options.previous?.get(item.id)
    let done = false
    for (const stage of STAGES) {
      if (stage.short && (item.rank >= MUST_RANK || item.short === item.text)) continue
      const form = stage.short ? short : full
      const slots = DIRECTIONS.map((d) => `${d}:${stage.ring}`)
      if (prev && slots.includes(prev)) slots.unshift(...slots.splice(slots.indexOf(prev), 1))
      for (const slot of slots) {
        const [d, ring] = slot.split(':')
        const box = boxAt(item, d as Direction, Number(ring), form.w)
        if (!free(box, item)) continue
        commit(item, stage.short ? 'short' : 'full', form.text, box, slot)
        done = true
        break
      }
      if (done) break
    }
    if (done) continue
    if (item.rank < MUST_RANK) {
      commit(item, 'hidden', '', { x: item.at.x, y: item.at.y, w: 0, h: 0 }, 'hidden:0')
      continue
    }
    let best: { box: Rect; slot: string; cost: number } | undefined
    for (let ring = 0; ring < RING_GAPS.length; ring++) {
      for (const d of DIRECTIONS) {
        const box = clampInto(boxAt(item, d, ring, full.w), options.width, options.height)
        const cost =
          placed.reduce((s, p) => s + (p.mode === 'hidden' ? 0 : overlapArea(box, p.box)), 0) +
          items.reduce((s, n) => s + (touchesCircle(box, n.at, n.radius * 0.6) ? 1000 : 0), 0) +
          ring
        if (!best || cost < best.cost) best = { box, slot: `${d}:${ring}`, cost }
      }
    }
    if (best) commit(item, 'full', full.text, best.box, best.slot)
  }
  return result
}

import { forceCollide, forceLink, forceManyBody, forceSimulation, forceX, forceY } from 'd3-force'
import type { SimulationLinkDatum, SimulationNodeDatum } from 'd3-force'

export interface Point {
  x: number
  y: number
}

/** One relationship to lay out. Lengths are milliseconds; the layout turns them into pixels. */
export interface LayoutLink {
  a: string
  b: string
  /** Measured round trip (mean of the observers). Preferred. */
  rttMs?: number
  /** Distance estimated from published network coordinates. Used when nothing was measured. */
  coordinateMs?: number
}

export interface LayoutOptions {
  /** Pixels per millisecond. Defaults to the previous layout's scale, else fitted to the data. */
  pxPerMs?: number
  seed?: number
}

export interface Layout {
  positions: Record<string, Point>
  pxPerMs: number
}

// Spring strength by how much we trust the length: measured, estimated, or unknown.
const STRENGTH = { measured: 0.9, estimated: 0.3, unknown: 0.02 }
const FIT_LONGEST_LINK_PX = 360
const NODE_RADIUS_PX = 10
const COLD_TICKS = 300
const WARM_TICKS = 80
const WARM_ALPHA = 0.25
// Just enough pull toward the origin that unlinked groups do not drift apart; the viewer re-centres the picture,
// so a stronger pull would only make nodes shift when the group's centre moves.
const GRAVITY = 0.002

interface SimNode extends SimulationNodeDatum {
  id: string
}
interface SimLink extends SimulationLinkDatum<SimNode> {
  px: number
  strength: number
}

/** Small deterministic PRNG so the same data always gives the same picture. */
function mulberry32(seed: number): () => number {
  let s = seed >>> 0
  return () => {
    s = (s + 0x6d2b79f5) >>> 0
    let t = s
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export function linkLengthMs(link: LayoutLink): { ms: number; trust: keyof typeof STRENGTH } {
  if (link.rttMs !== undefined && link.rttMs > 0) return { ms: link.rttMs, trust: 'measured' }
  if (link.coordinateMs !== undefined && link.coordinateMs > 0) return { ms: link.coordinateMs, trust: 'estimated' }
  return { ms: 0, trust: 'unknown' }
}

function fitScale(links: LayoutLink[]): number {
  const longest = Math.max(1, ...links.map((l) => linkLengthMs(l).ms))
  return FIT_LONGEST_LINK_PX / longest
}

/** Keeps the previous scale unless the data has outgrown it, so refreshes do not rescale the picture. */
function chooseScale(links: LayoutLink[], previous: Layout | undefined, requested: number | undefined): number {
  if (requested !== undefined) return requested
  if (!previous) return fitScale(links)
  const longestPx = Math.max(0, ...links.map((l) => linkLengthMs(l).ms)) * previous.pxPerMs
  return longestPx > FIT_LONGEST_LINK_PX * 2 || longestPx < FIT_LONGEST_LINK_PX / 4 ? fitScale(links) : previous.pxPerMs
}

/**
 * Force layout where each link's target length is its round trip. Pure and deterministic. With a
 * previous layout it warm-starts from those positions, so small data changes move nodes a little.
 * Pinned nodes stay exactly where they are pinned.
 */
export function computeLayout(
  nodeIds: string[],
  links: LayoutLink[],
  pins: Record<string, Point> = {},
  previous?: Layout,
  options: LayoutOptions = {},
): Layout {
  const pxPerMs = chooseScale(links, previous, options.pxPerMs)
  const ids = new Set(nodeIds)
  const usable = links.filter((l) => l.a !== l.b && ids.has(l.a) && ids.has(l.b))

  const nodes: SimNode[] = nodeIds.map((id) => ({ id }))
  const byId = new Map(nodes.map((n) => [n.id, n]))
  const neighbors = new Map<string, string[]>()
  for (const l of usable) {
    neighbors.set(l.a, [...(neighbors.get(l.a) ?? []), l.b])
    neighbors.set(l.b, [...(neighbors.get(l.b) ?? []), l.a])
  }

  const rand = mulberry32(options.seed ?? 1)
  for (const node of nodes) {
    const known = previous?.positions[node.id]
    if (known) {
      node.x = known.x
      node.y = known.y
      continue
    }
    // A new node starts where its links already want it, so it does not fly in and shove the others:
    // between its placed neighbours, or one link-length out from a single one.
    const anchors = (neighbors.get(node.id) ?? []).flatMap((id) => (previous?.positions[id] ? [{ id, at: previous.positions[id] }] : []))
    if (anchors.length === 1) {
      const link = usable.find((l) => (l.a === node.id && l.b === anchors[0].id) || (l.b === node.id && l.a === anchors[0].id))
      const ms = link ? linkLengthMs(link).ms : 0
      const px = ms > 0 ? ms * pxPerMs : FIT_LONGEST_LINK_PX / 2
      const angle = rand() * Math.PI * 2
      node.x = anchors[0].at.x + Math.cos(angle) * px
      node.y = anchors[0].at.y + Math.sin(angle) * px
    } else if (anchors.length > 1) {
      node.x = anchors.reduce((sum, a) => sum + a.at.x, 0) / anchors.length + (rand() - 0.5) * 20
      node.y = anchors.reduce((sum, a) => sum + a.at.y, 0) / anchors.length + (rand() - 0.5) * 20
    }
  }
  for (const [id, p] of Object.entries(pins)) {
    const node = byId.get(id)
    if (node) {
      node.x = node.fx = p.x
      node.y = node.fy = p.y
    }
  }

  const simLinks: SimLink[] = usable.map((l) => {
    const { ms, trust } = linkLengthMs(l)
    // With no usable length, a short weak spring keeps the pair loosely together without pulling on the rest.
    return { source: l.a, target: l.b, px: ms > 0 ? ms * pxPerMs : FIT_LONGEST_LINK_PX / 2, strength: STRENGTH[trust] }
  })

  const simulation = forceSimulation<SimNode>(nodes)
    .randomSource(rand)
    .force('link', forceLink<SimNode, SimLink>(simLinks).id((n) => n.id).distance((l) => l.px).strength((l) => l.strength).iterations(3))
    .force('charge', forceManyBody<SimNode>().strength(-20).distanceMax(FIT_LONGEST_LINK_PX * 2))
    .force('collide', forceCollide<SimNode>(NODE_RADIUS_PX))
    .force('x', forceX<SimNode>(0).strength(GRAVITY))
    .force('y', forceY<SimNode>(0).strength(GRAVITY))
    .stop()
  if (previous) simulation.alpha(WARM_ALPHA)
  simulation.tick(previous ? WARM_TICKS : COLD_TICKS)

  const positions: Record<string, Point> = {}
  for (const n of nodes) positions[n.id] = { x: n.x ?? 0, y: n.y ?? 0 }
  return { positions, pxPerMs }
}

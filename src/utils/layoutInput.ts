import type { NetworkCoordinate } from '@avalon-initiative/protocol-sdk'
import type { MergedGraph } from './mergeGraph'
import type { LayoutLink } from './layout'

/** Vivaldi distance in milliseconds: vector distance plus both heights. */
export function coordinateDistanceMs(a: NetworkCoordinate, b: NetworkCoordinate): number {
  const n = Math.min(a.vector.length, b.vector.length)
  let sum = 0
  for (let i = 0; i < n; i++) sum += (a.vector[i] - b.vector[i]) ** 2
  return Math.sqrt(sum) + a.height + b.height
}

/** `extraLinks` join the graph's own; an endpoint the graph does not know becomes a node, and a link touching none of them is dropped. */
export function toLayoutInput(merged: MergedGraph, extraLinks: readonly LayoutLink[] = []): { nodeIds: string[]; links: LayoutLink[] } {
  const coordinates = new Map<string, NetworkCoordinate>()
  for (const node of merged.nodes) if (node.self?.coordinate) coordinates.set(node.url, node.self.coordinate)
  for (const link of merged.links) {
    for (const o of link.observations) if (o.coordinate && !coordinates.has(o.to)) coordinates.set(o.to, o.coordinate)
  }

  const links = merged.links.map((link): LayoutLink => {
    const measured = Object.values(link.rttBy)
    const ca = coordinates.get(link.a)
    const cb = coordinates.get(link.b)
    return {
      a: link.a,
      b: link.b,
      ...(measured.length > 0 ? { rttMs: measured.reduce((s, v) => s + v, 0) / measured.length } : {}),
      ...(ca && cb ? { coordinateMs: coordinateDistanceMs(ca, cb) } : {}),
    }
  })
  const nodeIds = merged.nodes.map((n) => n.url)
  const known = new Set(nodeIds)
  for (const link of extraLinks) {
    if (!known.has(link.a) && !known.has(link.b)) continue
    for (const id of [link.a, link.b]) if (!nodeIds.includes(id)) nodeIds.push(id)
    links.push(link)
  }
  return { nodeIds, links }
}

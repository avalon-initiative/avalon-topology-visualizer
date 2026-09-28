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

export function toLayoutInput(merged: MergedGraph): { nodeIds: string[]; links: LayoutLink[] } {
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
  return { nodeIds: merged.nodes.map((n) => n.url), links }
}

import type { Point } from './layout'
import type { NodeFacts } from './nodeFacts'

/** How many distinct shard colours there are; more shards than this reuse them, and the label still tells them apart. */
export const SHARD_PALETTE_SIZE = 6

/** The shards a node is in: the ones it authors plus the ones it mirrors. */
export function memberShards(f: NodeFacts): string[] {
  return [...new Set([...f.shards.map((s) => s.id), ...f.mirrors.map((m) => m.shard_id)])].sort()
}

export interface ShardKeyItem {
  id: string
  /** Index into the theme's shard palette. */
  color: number
}

/** Every shard seen on any node, in id order so a shard keeps its colour from one refresh to the next. */
export function shardKey(facts: Record<string, NodeFacts>): ShardKeyItem[] {
  const ids = [...new Set(Object.values(facts).flatMap(memberShards))].sort()
  return ids.map((id, i) => ({ id, color: i % SHARD_PALETTE_SIZE }))
}

export interface ShardRegion {
  id: string
  color: number
  /** Screen-space convex hull of the member nodes: one point, two, or three or more in order. */
  hull: Point[]
}

function cross(o: Point, a: Point, b: Point): number {
  return (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x)
}

/** Andrew's monotone chain; duplicate points collapse, so a lone node or a pair comes back as 1 or 2 points. */
export function convexHull(points: Point[]): Point[] {
  const sorted = [...points].sort((p, q) => p.x - q.x || p.y - q.y).filter((p, i, a) => i === 0 || p.x !== a[i - 1].x || p.y !== a[i - 1].y)
  if (sorted.length < 3) return sorted
  const half = (pts: Point[]) => {
    const out: Point[] = []
    for (const p of pts) {
      while (out.length >= 2 && cross(out[out.length - 2], out[out.length - 1], p) <= 0) out.pop()
      out.push(p)
    }
    out.pop()
    return out
  }
  return [...half(sorted), ...half([...sorted].reverse())]
}

/** One region per shard that has a drawn member. `members` maps node id to its shard ids; `at` gives a node's screen position. */
export function shardRegions(key: ShardKeyItem[], members: Record<string, string[]>, at: (id: string) => Point | undefined): ShardRegion[] {
  return key.flatMap((k) => {
    const points = Object.entries(members).flatMap(([id, shards]) => {
      const p = shards.includes(k.id) ? at(id) : undefined
      return p ? [p] : []
    })
    return points.length > 0 ? [{ id: k.id, color: k.color, hull: convexHull(points) }] : []
  })
}

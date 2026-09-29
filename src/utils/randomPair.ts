import type { MergedGraph } from './mergeGraph'

export interface NodePair {
  from: string
  to: string
}

/** Every (observer, neighbor) pair a probe can succeed on: the observer was read and lists the neighbor as active or known. */
export function probeCandidates(merged: MergedGraph, skip: ReadonlySet<string> = new Set()): NodePair[] {
  const visited = new Set(merged.nodes.filter((n) => n.status === 'visited').map((n) => n.url))
  const seen = new Set<string>()
  const out: NodePair[] = []
  for (const link of merged.links) {
    for (const o of link.observations) {
      const key = `${o.from}\n${o.to}`
      if (o.kind === 'mirror' || o.from === o.to || !visited.has(o.from) || skip.has(o.from) || seen.has(key)) continue
      seen.add(key)
      out.push({ from: o.from, to: o.to })
    }
  }
  return out
}

/** A random neighbor pair, or undefined when nothing can be probed. `rng` returns [0, 1). */
export function pickRandomPair(merged: MergedGraph, rng: () => number = Math.random, skip: ReadonlySet<string> = new Set()): NodePair | undefined {
  const candidates = probeCandidates(merged, skip)
  return candidates[Math.min(candidates.length - 1, Math.floor(rng() * candidates.length))]
}

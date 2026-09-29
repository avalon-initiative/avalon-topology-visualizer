import type { MergedGraph } from './mergeGraph'

export type PulseKind = 'announce' | 'tree-head'

export interface Pulse {
  kind: PulseKind
  /** The node whose change caused the pulse. */
  url: string
  /** Merged links (a and b as in `MergedLink`) the pulse runs along. */
  links: { a: string; b: string }[]
}

const linksOf = (merged: MergedGraph, url: string) => merged.links.filter((l) => l.a === url || l.b === url).map((l) => ({ a: l.a, b: l.b }))

const heads = (n: MergedGraph['nodes'][number]) => new Map((n.self?.shards ?? []).map((s) => [s.shard_id, s]))

/**
 * What really changed between two consecutive merged graphs. A node newly read (first seen, or visited after
 * not being visited) announces; a node whose shard tree head grew or was re-signed sends a tree-head pulse, and
 * so does a mirror whose observed tree size grew, along the mirror link only. The first graph has no
 * predecessor, so it pulses nothing.
 */
export function diffGraphs(prev: MergedGraph | null, next: MergedGraph | null): Pulse[] {
  if (!prev || !next) return []
  const before = new Map(prev.nodes.map((n) => [n.url, n]))
  const pulses: Pulse[] = []

  for (const n of next.nodes) {
    const old = before.get(n.url)
    if (n.status === 'visited' && old?.status !== 'visited') {
      pulses.push({ kind: 'announce', url: n.url, links: linksOf(next, n.url) })
      continue
    }
    if (!old || n.status !== 'visited') continue
    const oldHeads = heads(old)
    const moved = (n.self?.shards ?? []).some((s) => {
      const o = oldHeads.get(s.shard_id)
      return !o || s.tree_size > o.tree_size || (s.tree_size === o.tree_size && s.sth_created_at !== o.sth_created_at)
    })
    if (moved) pulses.push({ kind: 'tree-head', url: n.url, links: linksOf(next, n.url) })
  }

  const observed = (g: MergedGraph) => {
    const m = new Map<string, number>()
    for (const l of g.links) {
      for (const o of l.observations) {
        if (o.kind !== 'mirror' || !o.mirror || o.mirror.observed_tree_size == null) continue
        const key = `${o.from}|${o.to}|${o.mirror.shard_id}`
        m.set(key, Math.max(m.get(key) ?? 0, o.mirror.observed_tree_size))
      }
    }
    return m
  }
  const oldObserved = observed(prev)
  const mirrorPulsed = new Set<string>()
  for (const l of next.links) {
    for (const o of l.observations) {
      if (o.kind !== 'mirror' || !o.mirror || o.mirror.observed_tree_size == null) continue
      const key = `${o.from}|${o.to}|${o.mirror.shard_id}`
      const was = oldObserved.get(key)
      if (was === undefined || o.mirror.observed_tree_size <= was || mirrorPulsed.has(key)) continue
      mirrorPulsed.add(key)
      pulses.push({ kind: 'tree-head', url: o.from, links: [{ a: l.a, b: l.b }] })
    }
  }
  return pulses
}

/** Sorted-pair keys of every link any pulse runs along. */
export function pulsedLinkKeys(pulses: readonly Pulse[]): Set<string> {
  return new Set(pulses.flatMap((p) => p.links.map((l) => linkKey(l.a, l.b))))
}

export const linkKey = (a: string, b: string) => (a < b ? `${a}\n${b}` : `${b}\n${a}`)

export const PULSE_DURATION_MS = 1800

/** How far along a pulse is, 0 to 1, or null once it has finished. */
export function pulseProgress(elapsedMs: number, durationMs = PULSE_DURATION_MS): number | null {
  if (!Number.isFinite(elapsedMs) || elapsedMs < 0) return 0
  return elapsedMs >= durationMs ? null : elapsedMs / durationMs
}

/** What the canvas draws for the live pulses: `progress` null means a static indicator, with no motion. */
export interface PulseDrawing {
  keys: ReadonlySet<string>
  progress: number | null
}

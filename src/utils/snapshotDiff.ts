import type { TopologyGraph } from '@avalon-initiative/protocol-sdk'

export interface VersionChange {
  url: string
  from: string
  to: string
}

export interface SnapshotDiff {
  /** Nodes that answered in this snapshot but did not in the previous one (new, or back from unreachable). */
  joined: string[]
  /** Nodes that answered in the previous snapshot but not in this one (gone, or now unreachable). */
  departed: string[]
  /** Nodes that answered in both and report a different protocol version. */
  versionChanges: VersionChange[]
}

export const EMPTY_DIFF: SnapshotDiff = { joined: [], departed: [], versionChanges: [] }

/** Visited nodes and the protocol version each one reported about itself, if any. */
function answering(graph: TopologyGraph): Map<string, string | undefined> {
  const out = new Map<string, string | undefined>()
  for (const n of graph.nodes) if (n.status === 'visited') out.set(n.url, n.self?.protocol_version || undefined)
  return out
}

/** What changed from `previous` to `next`. With no previous snapshot there is nothing to compare, so nothing changed. */
export function diffSnapshots(previous: TopologyGraph | null, next: TopologyGraph): SnapshotDiff {
  if (!previous) return EMPTY_DIFF
  const before = answering(previous)
  const after = answering(next)
  const joined = [...after.keys()].filter((url) => !before.has(url)).sort()
  const departed = [...before.keys()].filter((url) => !after.has(url)).sort()
  const versionChanges: VersionChange[] = []
  for (const [url, to] of after) {
    const from = before.get(url)
    if (from !== undefined && to !== undefined && from !== to) versionChanges.push({ url, from, to })
  }
  versionChanges.sort((a, b) => a.url.localeCompare(b.url))
  return { joined, departed, versionChanges }
}

export function hasChanges(diff: SnapshotDiff): boolean {
  return diff.joined.length + diff.departed.length + diff.versionChanges.length > 0
}

/** Short text for a timeline marker, e.g. "+2 -1 ~1"; empty when nothing changed. Never colour alone. */
export function diffLabel(diff: SnapshotDiff): string {
  const parts: string[] = []
  if (diff.joined.length) parts.push(`+${diff.joined.length}`)
  if (diff.departed.length) parts.push(`-${diff.departed.length}`)
  if (diff.versionChanges.length) parts.push(`~${diff.versionChanges.length}`)
  return parts.join(' ')
}

/** Diff of every snapshot against the one before it; the first has nothing to compare with. */
export function diffSeries(graphs: TopologyGraph[]): SnapshotDiff[] {
  return graphs.map((g, i) => diffSnapshots(i > 0 ? graphs[i - 1] : null, g))
}

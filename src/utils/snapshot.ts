import type { TopologyGraph } from '@avalon-initiative/protocol-sdk'

export const SNAPSHOT_FORMAT = 'avalon-topology-snapshot'
export const SNAPSHOT_VERSION = 1

export interface Snapshot {
  format: typeof SNAPSHOT_FORMAT
  version: typeof SNAPSHOT_VERSION
  takenAt: string
  /** Exactly what the walk produced; loading a snapshot yields the same shape as a live walk. */
  graph: TopologyGraph
}

export class SnapshotError extends Error {}

const NODE_STATUSES = ['visited', 'unreachable', 'unvisited']
const EDGE_KINDS = ['active', 'mirror', 'known']

export function createSnapshot(graph: TopologyGraph, takenAt = new Date()): Snapshot {
  return { format: SNAPSHOT_FORMAT, version: SNAPSHOT_VERSION, takenAt: takenAt.toISOString(), graph }
}

export function serializeSnapshot(snapshot: Snapshot): string {
  return JSON.stringify(snapshot, null, 2)
}

function fail(message: string): never {
  throw new SnapshotError(`Not a topology snapshot: ${message}`)
}

export function parseSnapshot(text: string): Snapshot {
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch {
    return fail('the file is not valid JSON')
  }
  const s = raw as Partial<Snapshot> | null
  if (s === null || typeof s !== 'object') return fail('expected a JSON object')
  if (s.format !== SNAPSHOT_FORMAT) return fail('unrecognized format')
  if (s.version !== SNAPSHOT_VERSION) return fail(`unsupported version ${String(s.version)}`)
  if (typeof s.takenAt !== 'string' || Number.isNaN(Date.parse(s.takenAt))) return fail('missing or invalid takenAt')
  const g = s.graph as Partial<TopologyGraph> | undefined
  if (!g || !Array.isArray(g.seeds) || !Array.isArray(g.nodes) || !Array.isArray(g.edges)) return fail('graph is incomplete')
  if (!g.truncated || typeof g.truncated.maxNodes !== 'boolean' || typeof g.truncated.maxDepth !== 'boolean') {
    return fail('graph.truncated is missing')
  }
  for (const n of g.nodes) {
    if (typeof n?.url !== 'string' || !NODE_STATUSES.includes(n.status) || !Array.isArray(n.reportedBy)) {
      return fail('a node is malformed')
    }
  }
  const known = new Set(g.nodes.map((n) => n.url))
  for (const e of g.edges) {
    if (!EDGE_KINDS.includes(e?.kind) || !known.has(e.from) || !known.has(e.to)) return fail('an edge is malformed')
  }
  return { format: SNAPSHOT_FORMAT, version: SNAPSHOT_VERSION, takenAt: s.takenAt, graph: g as TopologyGraph }
}

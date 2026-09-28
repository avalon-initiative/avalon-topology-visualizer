import type { MirrorSource, NetworkCoordinate, WalkFailure, WalkNodeStatus } from '@avalon-initiative/protocol-sdk'
import { compareVersions, newestVersion } from './version'
import type { MergedGraph } from './mergeGraph'

export type VersionState = 'newest' | 'behind' | 'unknown'

export interface NodeFacts {
  url: string
  status: WalkNodeStatus
  failure?: WalkFailure
  depth: number
  reportedBy: string[]
  roles: string[]
  version?: string
  versionState: VersionState
  newestVersion?: string
  stale: boolean
  networkId?: string
  libp2pPeerId?: string
  coordinate?: NetworkCoordinate
  shards: { id: string; treeSize: number }[]
  /** Worst mirror lag as a fraction of the source's tree size, 0 when caught up, undefined when unknown. */
  lagRatio?: number
  lagEntries?: number
  mirrors: MirrorSource[]
}

export function lagOf(m: MirrorSource): { entries: number; ratio: number } | undefined {
  if (m.lag_entries === null || m.lag_entries === undefined) return undefined
  const size = m.observed_tree_size ?? 0
  return { entries: m.lag_entries, ratio: size > 0 ? Math.min(1, m.lag_entries / size) : m.lag_entries > 0 ? 1 : 0 }
}

/** What each node reported about itself, plus what the rest of the graph says about its version and sync lag. */
export function describeNodes(merged: MergedGraph): Record<string, NodeFacts> {
  const newest = newestVersion(merged.nodes.flatMap((n) => (n.self?.protocol_version ? [n.self.protocol_version] : [])))
  const mirrorsBy = new Map<string, MirrorSource[]>()
  for (const link of merged.links) {
    for (const o of link.observations) {
      if (o.kind === 'mirror' && o.mirror) mirrorsBy.set(o.from, [...(mirrorsBy.get(o.from) ?? []), o.mirror])
    }
  }

  const facts: Record<string, NodeFacts> = {}
  for (const node of merged.nodes) {
    const self = node.self
    const version = self?.protocol_version
    const mirrors = mirrorsBy.get(node.url) ?? []
    const lags = mirrors.flatMap((m) => lagOf(m) ?? [])
    facts[node.url] = {
      url: node.url,
      status: node.status,
      ...(node.failure ? { failure: node.failure } : {}),
      depth: node.depth,
      reportedBy: node.reportedBy,
      roles: (self?.roles ?? []).map((r) => r.toLowerCase()),
      ...(version ? { version } : {}),
      versionState: !version || !newest ? 'unknown' : compareVersions(version, newest) < 0 ? 'behind' : 'newest',
      ...(newest ? { newestVersion: newest } : {}),
      stale: self?.stale === true,
      ...(self?.network_id ? { networkId: self.network_id } : {}),
      ...(self?.libp2p_peer_id ? { libp2pPeerId: self.libp2p_peer_id } : {}),
      ...(self?.coordinate ? { coordinate: self.coordinate } : {}),
      shards: (self?.shards ?? []).map((s) => ({ id: s.shard_id, treeSize: s.tree_size })),
      ...(lags.length > 0 ? { lagRatio: Math.max(...lags.map((l) => l.ratio)), lagEntries: Math.max(...lags.map((l) => l.entries)) } : {}),
      mirrors,
    }
  }
  return facts
}

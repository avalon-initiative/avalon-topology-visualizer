import type { TopologyGraph, WalkEdge, WalkEdgeKind, WalkNode, WalkNodeStatus } from '@avalon-initiative/protocol-sdk'

export const node = (url: string, status: WalkNodeStatus = 'visited', extra: Partial<WalkNode> = {}): WalkNode => ({
  url,
  depth: 0,
  status,
  reportedBy: [],
  ...extra,
})

export const edge = (from: string, to: string, kind: WalkEdgeKind = 'active', ewma?: number): WalkEdge =>
  ({ from, to, kind, ...(ewma === undefined ? {} : { latency: { ewma_ms: ewma } }) }) as WalkEdge

export const graph = (nodes: WalkNode[], edges: WalkEdge[], extra: Partial<TopologyGraph> = {}): TopologyGraph => ({
  seeds: [nodes[0]?.url ?? ''],
  nodes,
  edges,
  truncated: { maxNodes: false, maxDepth: false },
  cancelled: false,
  ...extra,
})

/** A visited node with the parts of its self-report that styling reads. */
export const visited = (
  url: string,
  self: { roles?: string[]; version?: string; stale?: boolean; shards?: { shard_id: string; tree_size: number }[]; network_id?: string } = {},
  extra: Partial<WalkNode> = {},
): WalkNode =>
  node(url, 'visited', {
    self: {
      roles: self.roles ?? ['combined'],
      protocol_version: self.version ?? '0.1.0',
      stale: self.stale ?? false,
      network_id: self.network_id ?? 'test-net',
      shards: self.shards ?? [],
    } as never,
    ...extra,
  })

/** A mirror observation: `from` copies shard data from `to`. */
export const mirror = (from: string, to: string, lag: number | null, observed: number | null = 100, mirrored = 90): WalkEdge =>
  ({
    from,
    to,
    kind: 'mirror',
    mirror: { shard_id: 's1', source_url: to, lag_entries: lag, observed_tree_size: observed, mirrored_entries: mirrored, last_mirrored_at: null, last_observed_at: null, open_equivocations: [] },
  }) as WalkEdge

export const withStats = (e: WalkEdge, samples: number, loss: number): WalkEdge =>
  ({ ...e, latency: { ...(e.latency ?? {}), samples, loss_ratio: loss } }) as WalkEdge

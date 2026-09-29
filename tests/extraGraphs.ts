import type { WalkEdge, WalkNode } from '@avalon-initiative/protocol-sdk'
import { edge, graph, node, visited } from './graphs'
import { mergeGraph } from '../src/utils/mergeGraph'
import type { MergedGraph } from '../src/utils/mergeGraph'
import { describeNodes } from '../src/utils/nodeFacts'

export const shard = (id: string, size: number, at = '2026-01-01T00:00:00Z') => ({ shard_id: id, tree_size: size, sth_created_at: at })

/** A visited node whose self-report has full shard heads. */
export const reporting = (
  url: string,
  o: { roles?: string[]; version?: string; stale?: boolean; network?: string; shards?: ReturnType<typeof shard>[] } = {},
): WalkNode =>
  visited(url, { roles: o.roles, version: o.version, stale: o.stale, network_id: o.network }, {
    self: {
      roles: o.roles ?? ['combined'],
      protocol_version: o.version ?? '0.1.0',
      stale: o.stale ?? false,
      network_id: o.network ?? 'test-net',
      shards: o.shards ?? [],
    } as never,
  })

export const finding = (a: string, b: string, size: number) => ({ source_a: a, source_b: b, tree_size: size })

/** `from` mirrors `to`, with the given open findings and observed tree size. */
export const mirrorWith = (from: string, to: string, findings: ReturnType<typeof finding>[] = [], observed = 100): WalkEdge =>
  ({
    from,
    to,
    kind: 'mirror',
    mirror: { shard_id: 's1', source_url: to, lag_entries: 0, observed_tree_size: observed, mirrored_entries: observed, last_mirrored_at: null, last_observed_at: null, open_equivocations: findings },
  }) as WalkEdge

export const merged = (nodes: WalkNode[], edges: WalkEdge[] = []): MergedGraph => mergeGraph(graph(nodes, edges))
export const factsOf = (nodes: WalkNode[], edges: WalkEdge[] = []) => describeNodes(merged(nodes, edges))
export { edge, node }

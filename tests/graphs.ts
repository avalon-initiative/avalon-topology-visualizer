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

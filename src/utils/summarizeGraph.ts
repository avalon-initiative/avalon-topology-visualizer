import type { TopologyGraph } from '@avalon-initiative/protocol-sdk'

export interface GraphSummary {
  visited: number
  unreachable: number
  unvisited: number
  active: number
  mirror: number
  known: number
  truncated: boolean
}

export function summarizeGraph(graph: TopologyGraph): GraphSummary {
  const count = (status: string) => graph.nodes.filter((n) => n.status === status).length
  const edges = (kind: string) => graph.edges.filter((e) => e.kind === kind).length
  return {
    visited: count('visited'),
    unreachable: count('unreachable'),
    unvisited: count('unvisited'),
    active: edges('active'),
    mirror: edges('mirror'),
    known: edges('known'),
    truncated: graph.truncated.maxNodes || graph.truncated.maxDepth,
  }
}

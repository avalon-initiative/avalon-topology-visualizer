import type { TopologyGraph, WalkEdge, WalkEdgeKind, WalkFailure, WalkNode } from '@avalon-initiative/protocol-sdk'

export interface MergedLink {
  /** The two node URLs, in sorted order. */
  a: string
  b: string
  /** Strongest kind any observer reported: active, else mirror, else known. */
  kind: WalkEdgeKind
  /** Every observation from either end, untouched. */
  observations: WalkEdge[]
  /** Best round-trip estimate per observer, in milliseconds. */
  rttBy: Record<string, number>
  /** Both ends were visited and only one of them lists the link as active. */
  disagreement: boolean
}

export interface UnreachableNode {
  url: string
  failure: WalkFailure
}

export interface MergedGraph {
  nodes: WalkNode[]
  links: MergedLink[]
  /** Connected groups of node URLs, largest first. More than one means a partition or a partial walk. */
  components: string[][]
  unreachable: UnreachableNode[]
  rateLimited: UnreachableNode[]
  visited: number
  unvisited: number
  /** Links where the two visited ends disagree about whether the link is active. */
  disagreements: number
  stoppedAtLimit: { maxNodes: boolean; maxDepth: boolean } | null
  cancelled: boolean
}

const KIND_RANK: Record<WalkEdgeKind, number> = { known: 0, mirror: 1, active: 2 }

export function roundTripMs(edge: WalkEdge): number | undefined {
  const l = edge.latency
  return l?.ewma_ms ?? l?.last_ms ?? l?.min_ms ?? undefined
}

export function mergeGraph(graph: TopologyGraph): MergedGraph {
  const status = new Map(graph.nodes.map((n) => [n.url, n.status]))
  const byPair = new Map<string, MergedLink>()

  for (const edge of graph.edges) {
    const [a, b] = edge.from < edge.to ? [edge.from, edge.to] : [edge.to, edge.from]
    const key = `${a}\n${b}`
    let link = byPair.get(key)
    if (!link) {
      link = { a, b, kind: edge.kind, observations: [], rttBy: {}, disagreement: false }
      byPair.set(key, link)
    }
    link.observations.push(edge)
    if (KIND_RANK[edge.kind] > KIND_RANK[link.kind]) link.kind = edge.kind
    const rtt = roundTripMs(edge)
    if (rtt !== undefined) link.rttBy[edge.from] = rtt
  }

  const links = [...byPair.values()]
  for (const link of links) {
    const bothVisited = status.get(link.a) === 'visited' && status.get(link.b) === 'visited'
    const activeFrom = new Set(link.observations.filter((o) => o.kind === 'active').map((o) => o.from))
    link.disagreement = bothVisited && activeFrom.size === 1
  }

  const unreachable: UnreachableNode[] = []
  const rateLimited: UnreachableNode[] = []
  for (const node of graph.nodes) {
    if (node.status !== 'unreachable' || !node.failure) continue
    ;(node.failure.reason === 'rate_limited' ? rateLimited : unreachable).push({ url: node.url, failure: node.failure })
  }

  const stopped = graph.truncated.maxNodes || graph.truncated.maxDepth
  return {
    nodes: graph.nodes,
    links,
    components: components(graph.nodes, links),
    unreachable,
    rateLimited,
    visited: graph.nodes.filter((n) => n.status === 'visited').length,
    unvisited: graph.nodes.filter((n) => n.status === 'unvisited').length,
    disagreements: links.filter((l) => l.disagreement).length,
    stoppedAtLimit: stopped ? { ...graph.truncated } : null,
    cancelled: graph.cancelled,
  }
}

function components(nodes: WalkNode[], links: MergedLink[]): string[][] {
  const parent = new Map(nodes.map((n) => [n.url, n.url]))
  const find = (x: string): string => {
    let root = x
    while (parent.get(root) !== root) root = parent.get(root) as string
    parent.set(x, root)
    return root
  }
  for (const l of links) {
    if (parent.has(l.a) && parent.has(l.b)) parent.set(find(l.a), find(l.b))
  }
  const groups = new Map<string, string[]>()
  for (const n of nodes) {
    const root = find(n.url)
    groups.set(root, [...(groups.get(root) ?? []), n.url])
  }
  return [...groups.values()].sort((x, y) => y.length - x.length || x[0].localeCompare(y[0]))
}

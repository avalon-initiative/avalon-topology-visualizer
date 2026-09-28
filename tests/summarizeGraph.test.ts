import { describe, expect, it } from 'vitest'
import type { TopologyGraph } from '@avalon-initiative/protocol-sdk'
import { summarizeGraph } from '../src/utils/summarizeGraph'

const node = (url: string, status: 'visited' | 'unreachable' | 'unvisited') => ({
  url,
  depth: 0,
  status,
  reportedBy: [],
})

describe('summarizeGraph', () => {
  it('counts nodes by status and edges by kind', () => {
    const graph: TopologyGraph = {
      seeds: ['http://a'],
      nodes: [node('http://a', 'visited'), node('http://b', 'unreachable'), node('http://c', 'unvisited')],
      edges: [
        { from: 'http://a', to: 'http://b', kind: 'active' },
        { from: 'http://a', to: 'http://c', kind: 'known' },
        { from: 'http://a', to: 'http://c', kind: 'mirror' },
      ],
      truncated: { maxNodes: false, maxDepth: true },
      cancelled: false,
    }
    expect(summarizeGraph(graph)).toEqual({
      visited: 1,
      unreachable: 1,
      unvisited: 1,
      active: 1,
      mirror: 1,
      known: 1,
      truncated: true,
    })
  })
})

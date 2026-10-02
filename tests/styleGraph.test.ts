import { describe, expect, it } from 'vitest'
import { mergeGraph } from '../src/utils/mergeGraph'
import { describeNodes } from '../src/utils/nodeFacts'
import { linkQuality, linkStyles, nodeStyle } from '../src/utils/styleGraph'
import { edge, graph, mirror, node, visited, withStats } from './graphs'

const style = (n: ReturnType<typeof visited>, others: ReturnType<typeof visited>[] = [], edges: ReturnType<typeof edge>[] = []) =>
  nodeStyle(describeNodes(mergeGraph(graph([n, ...others], edges)))[n.url])

const linksOf = (edges: ReturnType<typeof edge>[]) => {
  const merged = mergeGraph(graph([visited('http://a'), visited('http://b')], edges))
  return merged.links.flatMap(linkStyles)
}

describe('nodeStyle', () => {
  it('draws a role as a shape, and a read node solid', () => {
    const s = style(visited('http://a', { roles: ['indexer'] }))
    expect(s.shape).toBe('diamond')
    expect(s.hollow).toBe(false)
    expect(s.dimmed).toBe(false)
  })

  it('draws nodes that were not read as outlines', () => {
    const merged = mergeGraph(graph([visited('http://a'), node('http://dead', 'unreachable'), node('http://x', 'unvisited')], []))
    const facts = describeNodes(merged)
    expect(nodeStyle(facts['http://dead']).hollow).toBe(true)
    expect(nodeStyle(facts['http://x']).hollow).toBe(true)
  })

  it('names the shards a node serves, and has none for a node with no shards', () => {
    expect(style(visited('http://a', { shards: [{ shard_id: 's1', tree_size: 1 }, { shard_id: 's2', tree_size: 1 }] })).shards).toEqual(['s1', 's2'])
    expect(style(visited('http://a')).shards).toBeUndefined()
  })

  it('includes shards the node mirrors', () => {
    expect(style(visited('http://a', { shards: [{ shard_id: 'own', tree_size: 1 }] }), [visited('http://s')], [mirror('http://a', 'http://s', 0)]).shards).toEqual(['own', 's1'])
  })

  it('fades a node that reports itself stale', () => {
    expect(style(visited('http://a', { stale: true })).dimmed).toBe(true)
  })

  it('carries the version state for the ring', () => {
    const merged = mergeGraph(graph([visited('http://a', { version: '1.0.0' }), visited('http://b', { version: '2.0.0' })], []))
    const facts = describeNodes(merged)
    expect(nodeStyle(facts['http://a']).version).toBe('behind')
    expect(nodeStyle(facts['http://b']).version).toBe('newest')
  })

  it('shows no lag arc when caught up or unknown, a proportional arc when behind, and never an invisible one', () => {
    const nodes = [visited('http://a'), visited('http://s')]
    const arc = (lag: number | null, observed: number | null, mirrored = 0) => style(nodes[0], [nodes[1]], [mirror('http://a', 'http://s', lag, observed, mirrored)]).lag
    expect(arc(0, 100, 100)).toBe(0)
    expect(arc(null, null)).toBe(0)
    expect(arc(50, 100)).toBe(0.5)
    expect(arc(1, 1000)).toBeGreaterThanOrEqual(0.08)
  })
})

describe('linkStyles', () => {
  it('draws an active link as one solid line', () => {
    const out = linksOf([edge('http://a', 'http://b', 'active')])
    expect(out.map((l) => l.kind)).toEqual(['active'])
  })

  it('draws a known-only link faint', () => {
    const out = linksOf([edge('http://a', 'http://b', 'known')])
    expect(out).toHaveLength(1)
    expect(out[0].kind).toBe('known')
    expect(out[0].alpha).toBeLessThan(1)
  })

  it('draws a mirror link as an arrow from the source to the node that copies it', () => {
    const out = linksOf([mirror('http://a', 'http://b', 5)])
    expect(out).toHaveLength(1)
    expect(out[0].kind).toBe('mirror')
    expect(out[0].direction).toEqual({ from: 'http://b', to: 'http://a' })
  })

  it('keeps direction when the same pair is also an active link', () => {
    const out = linksOf([edge('http://a', 'http://b', 'active'), mirror('http://a', 'http://b', 5)])
    expect(out.map((l) => l.kind).sort()).toEqual(['active', 'mirror'])
  })

  it('draws one arrow per direction when both ends mirror each other', () => {
    const out = linksOf([mirror('http://a', 'http://b', 1), mirror('http://b', 'http://a', 1)])
    expect(out.filter((l) => l.kind === 'mirror').map((l) => l.direction)).toEqual([
      { from: 'http://b', to: 'http://a' },
      { from: 'http://a', to: 'http://b' },
    ])
  })

  it('does not repeat an arrow for repeated observations from the same end', () => {
    const out = linksOf([mirror('http://a', 'http://b', 1), mirror('http://a', 'http://b', 2)])
    expect(out).toHaveLength(1)
  })

  it('drops a known line when a stronger relationship exists', () => {
    expect(linksOf([edge('http://a', 'http://b', 'known'), edge('http://b', 'http://a', 'active')]).map((l) => l.kind)).toEqual(['active'])
  })
})

describe('linkQuality', () => {
  const quality = (samples: number, loss: number) => {
    const merged = mergeGraph(graph([visited('http://a'), visited('http://b')], [withStats(edge('http://a', 'http://b', 'active', 10), samples, loss)]))
    return linkQuality(merged.links[0])
  }

  it('leaves an unmeasured link at the base look', () => {
    const merged = mergeGraph(graph([visited('http://a'), visited('http://b')], [edge('http://a', 'http://b', 'active')]))
    expect(linkQuality(merged.links[0])).toEqual({ width: 1.5, alpha: 1 })
  })

  it('draws more samples thicker, capped', () => {
    expect(quality(50, 0).width).toBeGreaterThan(quality(5, 0).width)
    expect(quality(5000, 0).width).toBe(quality(50, 0).width)
  })

  it('draws more loss fainter, never invisible', () => {
    expect(quality(20, 0.5).alpha).toBeLessThan(quality(20, 0).alpha)
    expect(quality(20, 1).alpha).toBeGreaterThan(0)
  })
})

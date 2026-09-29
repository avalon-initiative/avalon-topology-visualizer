import { describe, expect, it } from 'vitest'
import { diffGraphs, linkKey, pulsedLinkKeys, pulseProgress, PULSE_DURATION_MS } from '../src/utils/pulses'
import { edge, merged, mirrorWith, node, reporting, shard } from './extraGraphs'

const A = 'http://a'
const B = 'http://b'
const C = 'http://c'

describe('diffGraphs', () => {
  it('pulses nothing without a previous graph, or without a next one', () => {
    const g = merged([reporting(A)])
    expect(diffGraphs(null, g)).toEqual([])
    expect(diffGraphs(g, null)).toEqual([])
  })

  it('pulses nothing when nothing changed', () => {
    const make = () => merged([reporting(A, { shards: [shard('s', 5)] }), reporting(B)], [edge(A, B, 'active', 5)])
    expect(diffGraphs(make(), make())).toEqual([])
  })

  it('announces a node that first appears, along its links', () => {
    const before = merged([reporting(A)])
    const after = merged([reporting(A), reporting(B)], [edge(A, B)])
    expect(diffGraphs(before, after)).toEqual([{ kind: 'announce', url: B, links: [{ a: A, b: B }] }])
  })

  it('announces a node that was seen but is now read', () => {
    const before = merged([reporting(A), node(B, 'unvisited')], [edge(A, B)])
    const after = merged([reporting(A), reporting(B)], [edge(A, B)])
    expect(diffGraphs(before, after).map((p) => [p.kind, p.url])).toEqual([['announce', B]])
  })

  it('does not announce a node that became unreachable or stays unread', () => {
    const before = merged([reporting(A), node(B, 'unvisited')], [edge(A, B)])
    expect(diffGraphs(before, merged([reporting(A), node(B, 'unreachable')], [edge(A, B)]))).toEqual([])
  })

  it('sends a tree-head pulse when a shard grows or is re-signed', () => {
    const before = merged([reporting(A, { shards: [shard('s', 5)] }), reporting(B)], [edge(A, B)])
    const grown = merged([reporting(A, { shards: [shard('s', 6)] }), reporting(B)], [edge(A, B)])
    expect(diffGraphs(before, grown)).toEqual([{ kind: 'tree-head', url: A, links: [{ a: A, b: B }] }])
    const resigned = merged([reporting(A, { shards: [shard('s', 5, '2026-02-02T00:00:00Z')] }), reporting(B)], [edge(A, B)])
    expect(diffGraphs(before, resigned).map((p) => p.kind)).toEqual(['tree-head'])
  })

  it('treats a shard that appeared as a new head, and ignores one that shrank', () => {
    const before = merged([reporting(A, { shards: [shard('s', 5)] })])
    expect(diffGraphs(before, merged([reporting(A, { shards: [shard('s', 5), shard('t', 1)] })])).map((p) => p.kind)).toEqual(['tree-head'])
    expect(diffGraphs(before, merged([reporting(A, { shards: [shard('s', 4)] })]))).toEqual([])
  })

  it('sends a tree-head pulse along a mirror link whose observed head advanced', () => {
    const before = merged([reporting(A), reporting(B)], [mirrorWith(A, B, [], 100)])
    const after = merged([reporting(A), reporting(B)], [mirrorWith(A, B, [], 120)])
    expect(diffGraphs(before, after)).toEqual([{ kind: 'tree-head', url: A, links: [{ a: A, b: B }] }])
    expect(diffGraphs(after, before)).toEqual([])
  })

  it('does not pulse a mirror link that is new to the graph or whose observed size is unknown', () => {
    const before = merged([reporting(A), reporting(B)])
    expect(diffGraphs(before, merged([reporting(A), reporting(B)], [mirrorWith(A, B, [], 120)]))).toEqual([])
  })

  it('reports each change once when several fire together', () => {
    const before = merged([reporting(A, { shards: [shard('s', 1)] }), reporting(B)], [edge(A, B), mirrorWith(A, B, [], 1)])
    const after = merged([reporting(A, { shards: [shard('s', 2)] }), reporting(B), reporting(C)], [edge(A, B), mirrorWith(A, B, [], 2), edge(B, C)])
    const kinds = diffGraphs(before, after).map((p) => `${p.kind}:${p.url}`)
    expect(kinds.filter((k) => k === 'announce:http://c')).toHaveLength(1)
    expect(kinds).toContain('tree-head:http://a')
  })
})

describe('pulse helpers', () => {
  it('keys links by sorted pair', () => {
    expect(linkKey(B, A)).toBe(linkKey(A, B))
    expect(pulsedLinkKeys([{ kind: 'announce', url: A, links: [{ a: B, b: A }] }]).has(linkKey(A, B))).toBe(true)
  })

  it('progresses from 0 to 1 and then ends', () => {
    expect(pulseProgress(0)).toBe(0)
    expect(pulseProgress(PULSE_DURATION_MS / 2)).toBeCloseTo(0.5)
    expect(pulseProgress(PULSE_DURATION_MS)).toBeNull()
    expect(pulseProgress(-5)).toBe(0)
    expect(pulseProgress(Number.NaN)).toBe(0)
  })
})

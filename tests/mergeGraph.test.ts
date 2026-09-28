import { describe, expect, it } from 'vitest'
import { mergeGraph } from '../src/utils/mergeGraph'
import { edge, graph, node } from './graphs'

describe('mergeGraph', () => {
  it('joins both directions of a link and keeps every observation', () => {
    const merged = mergeGraph(
      graph(
        [node('http://a'), node('http://b')],
        [edge('http://a', 'http://b', 'active', 10), edge('http://b', 'http://a', 'active', 14)],
      ),
    )
    expect(merged.links).toHaveLength(1)
    expect(merged.links[0].observations).toHaveLength(2)
    expect(merged.links[0].rttBy).toEqual({ 'http://a': 10, 'http://b': 14 })
    expect(merged.links[0].disagreement).toBe(false)
    expect(merged.components).toEqual([['http://a', 'http://b']])
  })

  it('reports the strongest kind any observer saw', () => {
    const merged = mergeGraph(
      graph(
        [node('http://a'), node('http://b')],
        [edge('http://a', 'http://b', 'known'), edge('http://b', 'http://a', 'mirror')],
      ),
    )
    expect(merged.links[0].kind).toBe('mirror')
  })

  it('flags a link that only one visited end lists as active', () => {
    const merged = mergeGraph(
      graph(
        [node('http://a'), node('http://b')],
        [edge('http://a', 'http://b', 'active'), edge('http://b', 'http://a', 'known')],
      ),
    )
    expect(merged.links[0].disagreement).toBe(true)
    expect(merged.disagreements).toBe(1)
  })

  it('does not call it a disagreement when the other end was never visited', () => {
    const merged = mergeGraph(graph([node('http://a'), node('http://b', 'unreachable')], [edge('http://a', 'http://b')]))
    expect(merged.links[0].disagreement).toBe(false)
  })

  it('keeps one-sided reports as links from a single observer', () => {
    const merged = mergeGraph(graph([node('http://a'), node('http://b', 'unvisited')], [edge('http://a', 'http://b')]))
    expect(merged.links).toHaveLength(1)
    expect(merged.unvisited).toBe(1)
    expect(merged.visited).toBe(1)
  })

  it('splits disconnected nodes into groups, largest first', () => {
    const nodes = ['http://a', 'http://b', 'http://c', 'http://d', 'http://e'].map((u) => node(u))
    const merged = mergeGraph(
      graph(nodes, [edge('http://c', 'http://d'), edge('http://d', 'http://e'), edge('http://a', 'http://b')]),
    )
    expect(merged.components.map((c) => c.length)).toEqual([3, 2])
  })

  it('lists unreachable and rate-limited nodes apart, each with its reason', () => {
    const merged = mergeGraph(
      graph(
        [
          node('http://a'),
          node('http://slow', 'unreachable', { failure: { reason: 'timeout', message: 't' } }),
          node('http://busy', 'unreachable', { failure: { reason: 'rate_limited', status: 429, retryAfterSeconds: 30, message: 'r' } }),
        ],
        [],
      ),
    )
    expect(merged.unreachable.map((n) => [n.url, n.failure.reason])).toEqual([['http://slow', 'timeout']])
    expect(merged.rateLimited.map((n) => n.url)).toEqual(['http://busy'])
  })

  it('reports which limit stopped the walk, and none when it finished', () => {
    const nodes = [node('http://a')]
    expect(mergeGraph(graph(nodes, [])).stoppedAtLimit).toBeNull()
    expect(mergeGraph(graph(nodes, [], { truncated: { maxNodes: true, maxDepth: false } })).stoppedAtLimit).toEqual({
      maxNodes: true,
      maxDepth: false,
    })
  })

  it('passes a cancelled walk through and copes with an empty graph', () => {
    const merged = mergeGraph(graph([], [], { cancelled: true }))
    expect(merged.cancelled).toBe(true)
    expect(merged.links).toEqual([])
    expect(merged.components).toEqual([])
  })
})

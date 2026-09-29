import { describe, expect, it } from 'vitest'
import { mergeGraph } from '../src/utils/mergeGraph'
import { pickRandomPair, probeCandidates } from '../src/utils/randomPair'
import { edge, graph, mirror, node, visited } from './graphs'

const g = (nodes = [visited('http://a'), visited('http://b'), node('http://c', 'unreachable')], edges = [edge('http://a', 'http://b'), edge('http://b', 'http://a'), edge('http://a', 'http://c', 'known')]) =>
  mergeGraph(graph(nodes, edges))

describe('probeCandidates', () => {
  it('lists each observer and the neighbor it reported, once per direction', () => {
    expect(probeCandidates(g())).toEqual([
      { from: 'http://a', to: 'http://b' },
      { from: 'http://b', to: 'http://a' },
      { from: 'http://a', to: 'http://c' },
    ])
  })

  it('never uses an observer that was not read, or a mirror-only relation', () => {
    const m = mergeGraph(graph([visited('http://a'), node('http://b', 'unreachable')], [edge('http://b', 'http://a'), mirror('http://a', 'http://b', 1)]))
    expect(probeCandidates(m)).toEqual([])
  })

  it('skips observers that are cooling down', () => {
    expect(probeCandidates(g(), new Set(['http://a'])).map((p) => p.from)).toEqual(['http://b'])
  })

  it('is empty for a graph without links', () => {
    expect(probeCandidates(mergeGraph(graph([visited('http://a')], [])))).toEqual([])
  })
})

describe('pickRandomPair', () => {
  it('follows the random source across the candidates', () => {
    expect(pickRandomPair(g(), () => 0)).toEqual({ from: 'http://a', to: 'http://b' })
    expect(pickRandomPair(g(), () => 0.5)).toEqual({ from: 'http://b', to: 'http://a' })
    expect(pickRandomPair(g(), () => 0.99)).toEqual({ from: 'http://a', to: 'http://c' })
  })

  it('stays in range at the top of the random interval', () => {
    expect(pickRandomPair(g(), () => 1)).toEqual({ from: 'http://a', to: 'http://c' })
  })

  it('returns nothing when no pair can be probed', () => {
    expect(pickRandomPair(mergeGraph(graph([visited('http://a')], [])))).toBeUndefined()
  })
})

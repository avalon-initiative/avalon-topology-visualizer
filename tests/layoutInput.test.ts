import { describe, expect, it } from 'vitest'
import type { NetworkCoordinate } from '@avalon-initiative/protocol-sdk'
import { mergeGraph } from '../src/utils/mergeGraph'
import { coordinateDistanceMs, toLayoutInput } from '../src/utils/layoutInput'
import { VIEWER_ID } from '../src/utils/rttStats'
import { edge, graph, node } from './graphs'

const coord = (x: number, y: number, height = 0): NetworkCoordinate => ({ vector: [x, y], height, error: 0.1 })

describe('coordinateDistanceMs', () => {
  it('is the vector distance plus both heights', () => {
    expect(coordinateDistanceMs(coord(0, 0, 1), coord(3, 4, 2))).toBe(8)
  })

  it('compares only the shared dimensions', () => {
    expect(coordinateDistanceMs({ vector: [0, 0, 9], height: 0, error: 0 }, { vector: [3, 4], height: 0, error: 0 })).toBe(5)
  })
})

describe('toLayoutInput', () => {
  it('averages the round trips both ends measured', () => {
    const merged = mergeGraph(
      graph([node('http://a'), node('http://b')], [edge('http://a', 'http://b', 'active', 10), edge('http://b', 'http://a', 'active', 20)]),
    )
    expect(toLayoutInput(merged).links[0].rttMs).toBe(15)
  })

  it('lists every node, including unreachable ones, so they still get a place', () => {
    const merged = mergeGraph(graph([node('http://a'), node('http://dead', 'unreachable')], [edge('http://a', 'http://dead', 'known')]))
    expect(toLayoutInput(merged).nodeIds).toEqual(['http://a', 'http://dead'])
  })

  it('leaves rttMs off a link nobody measured', () => {
    const merged = mergeGraph(graph([node('http://a'), node('http://b')], [edge('http://a', 'http://b', 'known')]))
    expect(toLayoutInput(merged).links[0]).not.toHaveProperty('rttMs')
  })

  it('estimates from coordinates: a visited node\'s own, and one a neighbour reported', () => {
    const a = node('http://a', 'visited', { self: { coordinate: coord(0, 0) } as never })
    const merged = mergeGraph(
      graph([a, node('http://b', 'unvisited')], [{ ...edge('http://a', 'http://b', 'known'), coordinate: coord(30, 40) }]),
    )
    expect(toLayoutInput(merged).links[0].coordinateMs).toBe(50)
  })

  it('has no estimate when either end has no coordinate', () => {
    const merged = mergeGraph(graph([node('http://a'), node('http://b')], [edge('http://a', 'http://b', 'known')]))
    expect(toLayoutInput(merged).links[0]).not.toHaveProperty('coordinateMs')
  })
})

describe('toLayoutInput with extra links', () => {
  const merged = () => mergeGraph(graph([node('http://a'), node('http://b'), node('http://dead', 'unreachable')], [edge('http://a', 'http://b', 'active', 10)]))

  it('adds the viewer as a node with its measured links', () => {
    const input = toLayoutInput(merged(), [
      { a: VIEWER_ID, b: 'http://a', rttMs: 12 },
      { a: VIEWER_ID, b: 'http://b', rttMs: 30 },
    ])
    expect(input.nodeIds).toEqual(['http://a', 'http://b', 'http://dead', VIEWER_ID])
    expect(input.links.filter((l) => l.a === VIEWER_ID).map((l) => [l.b, l.rttMs])).toEqual([['http://a', 12], ['http://b', 30]])
    expect(input.links[0]).toMatchObject({ a: 'http://a', b: 'http://b', rttMs: 10 })
  })

  it('leaves the result unchanged without extra links', () => {
    expect(toLayoutInput(merged(), [])).toEqual(toLayoutInput(merged()))
    expect(toLayoutInput(merged()).nodeIds).not.toContain(VIEWER_ID)
  })

  it('has no viewer node when no link reaches a known node', () => {
    expect(toLayoutInput(merged(), [{ a: VIEWER_ID, b: 'http://gone', rttMs: 5 }]).nodeIds).not.toContain(VIEWER_ID)
    expect(toLayoutInput(merged(), [{ a: VIEWER_ID, b: 'http://gone', rttMs: 5 }]).links).toHaveLength(1)
  })

  it('does not duplicate an endpoint that is already a node', () => {
    const ids = toLayoutInput(merged(), [{ a: 'http://a', b: 'http://b', rttMs: 1 }]).nodeIds
    expect(ids).toEqual(['http://a', 'http://b', 'http://dead'])
  })
})

describe('toLayoutInput with a probe link', () => {
  it('adds a measured link between two known nodes without replacing the crawled one', () => {
    const merged = mergeGraph(graph([node('http://a'), node('http://b')], [edge('http://a', 'http://b', 'active', 10)]))
    const { links, nodeIds } = toLayoutInput(merged, [{ a: 'http://a', b: 'http://b', rttMs: 50 }])
    expect(nodeIds).toEqual(['http://a', 'http://b'])
    expect(links.map((l) => l.rttMs)).toEqual([10, 50])
  })
})

import { describe, expect, it } from 'vitest'
import type { NetworkCoordinate } from '@avalon-initiative/protocol-sdk'
import { mergeGraph } from '../src/utils/mergeGraph'
import { coordinateDistanceMs, toLayoutInput } from '../src/utils/layoutInput'
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
